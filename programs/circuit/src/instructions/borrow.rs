use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer};
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;
use crate::state::*;
use crate::errors::CircuitError;
use crate::oracle;
use crate::market;
use crate::math;

/// Borrows quote tokens against deposited collateral.
///
/// This is the most heavily validated instruction in the protocol.
/// It independently validates ALL security conditions - it does NOT
/// rely on cached MarketGuard state as sole authorization.
///
/// BLOCKED when: protocol paused, asset disabled, market not Safe.
pub fn handler(ctx: Context<Borrow>, amount: u64) -> Result<()> {
    require!(amount > 0, CircuitError::BorrowExceedsCapacity);

    let protocol = &ctx.accounts.protocol_config;
    let asset = &ctx.accounts.asset_config;
    let position = &mut ctx.accounts.position;
    let clock = Clock::get()?;

    // -- Step 1-2: Validate protocol state --
    require!(!protocol.paused, CircuitError::ProtocolPaused);
    require!(asset.enabled, CircuitError::AssetDisabled);

    // -- Step 3-4: Validate position ownership --
    require!(position.owner == ctx.accounts.owner.key(), CircuitError::InvalidPositionOwner);
    require!(position.asset == asset.mint, CircuitError::InvalidAsset);

    // -- Step 5-8: Oracle validation (centralized) --
    let validated_price = oracle::validate_pyth_price(
        &ctx.accounts.price_update,
        &asset.pyth_feed_id,
        asset.max_oracle_age,
        asset.max_conf_bps,
        &clock,
    )?;

    // -- Step 9: Validate reference market session --
    let market_open = market::is_market_open(clock.unix_timestamp)?;
    require!(market_open, CircuitError::MarketClosed);

    // -- Step 10: Derive dynamic market state and authoritative Capital Policy --
    let conf_ratio_bps = math::calculate_confidence_ratio_bps(validated_price.price, validated_price.conf)?;
    let oracle_age = clock.unix_timestamp.saturating_sub(validated_price.publish_time) as u64;

    let breakdown = crate::risk::RiskScoreBreakdown::compute(
        market_open,
        conf_ratio_bps,
        oracle_age,
        asset.max_oracle_age,
        asset.custody_state,
        asset.liquidity_state,
    );
    let derived_risk_state = crate::risk::RatchetHysteresisConfig::candidate_state_from_score(breakdown.composite_score);

    let policy = crate::risk::CapitalPolicyEngine::derive_policy(
        derived_risk_state,
        asset.base_ltv_bps,
        position.has_debt(),
        0,
        clock.unix_timestamp,
    );

    // -- Step 11: Calculate collateral value (Conservative Pyth Valuation: p_conservative = max(0, p - conf)) --
    let conservative_price = math::calculate_conservative_pyth_price(
        validated_price.price,
        validated_price.conf,
    )?;

    let collateral_value = math::calculate_collateral_value(
        position.collateral_amount,
        conservative_price,
        validated_price.expo,
        ctx.accounts.collateral_mint.decimals,
        ctx.accounts.quote_mint.decimals,
    )?;

    // -- Step 12: Evaluate Canonical Permission Engine (Human Owner Path) --
    let perm = crate::permissions::evaluate_permission(
        &ctx.accounts.owner.key(),
        crate::permissions::CircuitAction::Borrow,
        &asset.mint,
        amount,
        &position.owner,
        position.has_debt(),
        collateral_value,
        position.debt_amount,
        &policy,
        None,
        clock.unix_timestamp,
    )?;

    if !perm.allowed {
        emit!(crate::events::BorrowBlocked {
            position: position.key(),
            requested_amount: amount,
            current_ltv: ((position.debt_amount as u128) * 10_000 / collateral_value.max(1)) as u64,
            effective_ltv: policy.effective_ltv_bps,
            risk_state: derived_risk_state,
            reason: format!("Permission denied: {:?}", perm.denial_reason),
        });

        match perm.denial_reason {
            crate::state::enums::PermissionDenialReason::RiskEmergency => return err!(CircuitError::RiskEmergency),
            crate::state::enums::PermissionDenialReason::RiskDefensive => return err!(CircuitError::RiskDefensive),
            crate::state::enums::PermissionDenialReason::RiskRestricted => return err!(CircuitError::RiskRestricted),
            crate::state::enums::PermissionDenialReason::EffectiveLtvExceeded => return err!(CircuitError::BorrowExceedsCapacity),
            _ => {
                if asset.custody_state == CustodyState::Delayed || asset.custody_state == CustodyState::Impaired {
                    return err!(CircuitError::InvalidCustodyState);
                }
                if asset.liquidity_state == LiquidityState::Thin || asset.liquidity_state == LiquidityState::Critical {
                    return err!(CircuitError::InvalidLiquidityState);
                }
                return err!(CircuitError::BorrowDisabledByRiskPolicy);
            }
        }
    }

    let new_debt = (position.debt_amount as u128)
        .checked_add(amount as u128)
        .ok_or(CircuitError::MathOverflow)?;

    // -- Step 14: Calculate and check health factor --
    let hf = math::calculate_health_factor(
        collateral_value,
        asset.liquidation_threshold_bps,
        new_debt as u64,
    )?;
    require!(hf >= protocol.min_health_factor_bps, CircuitError::HealthFactorTooLow);

    emit!(crate::events::BorrowAllowed {
        position: position.key(),
        amount,
        resulting_ltv: (new_debt * 10_000 / collateral_value.max(1)) as u64,
        risk_state: derived_risk_state,
    });

    // -- Step 15: Check vault has sufficient liquidity --
    require!(
        ctx.accounts.liquidity_vault.amount >= amount,
        CircuitError::InsufficientLiquidity
    );

    // -- Step 16: Calculate protocol fee on-chain & net borrow amount --
    let (fee_amount, net_disbursed) = math::calculate_protocol_fee(
        amount,
        protocol.borrow_fee_bps,
        protocol.fee_enabled,
    )?;

    let seeds = &[ProtocolConfig::SEEDS, &[protocol.bump]];
    let signer_seeds = &[&seeds[..]];

    // Settle protocol fee directly to Circuit Treasury if fee > 0
    if fee_amount > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.liquidity_vault.to_account_info(),
                    to: ctx.accounts.treasury_quote_ata.to_account_info(),
                    authority: ctx.accounts.protocol_config.to_account_info(),
                },
                signer_seeds,
            ),
            fee_amount,
        )?;

        emit!(crate::events::ProtocolFeeCollected {
            payer: ctx.accounts.owner.key(),
            fee_amount,
            fee_asset: ctx.accounts.quote_mint.key(),
            treasury: protocol.fee_recipient,
            source_action: "BORROW_ORIGINATION".to_string(),
            position: position.key(),
            timestamp: clock.unix_timestamp,
            protocol_version: protocol.version,
        });
    }

    // Transfer net quote tokens from vault to borrower
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.liquidity_vault.to_account_info(),
                to: ctx.accounts.user_quote_ata.to_account_info(),
                authority: ctx.accounts.protocol_config.to_account_info(),
            },
            signer_seeds,
        ),
        net_disbursed,
    )?;

    // -- Step 17: Update position --
    position.debt_amount = new_debt as u64;
    position.last_valid_price = conservative_price;
    position.last_valid_expo = validated_price.expo;

    let resulting_ltv_bps = new_debt
        .checked_mul(10_000)
        .and_then(|v| v.checked_div(collateral_value))
        .unwrap_or(0)
        .min(10_000) as u64;

    emit!(crate::events::BorrowExecuted {
        user: ctx.accounts.owner.key(),
        asset: ctx.accounts.asset_config.mint,
        quote_mint: ctx.accounts.quote_mint.key(),
        collateral_value: collateral_value as u64,
        borrow_amount: amount,
        fee_amount,
        resulting_ltv_bps,
        resulting_health_factor_bps: hf,
        risk_state: crate::state::MarketState::Safe,
        timestamp: clock.unix_timestamp,
    });

    emit!(crate::events::BorrowEvent {
        owner: ctx.accounts.owner.key(),
        asset: ctx.accounts.asset_config.mint,
        quote_mint: ctx.accounts.quote_mint.key(),
        amount,
        new_debt: position.debt_amount,
        health_factor_bps: hf,
        timestamp: clock.unix_timestamp,
    });

    msg!(
        "Borrowed {} quote tokens (fee: {}, net: {}). Total debt: {}. HF: {} BPS",
        amount, fee_amount, net_disbursed, position.debt_amount, hf
    );
    Ok(())
}

/// Accounts are boxed to keep the generated `try_accounts` within the 4KB SBF
/// stack frame. See the note in `liquidate.rs` - layout only, no wire change.
#[derive(Accounts)]
pub struct Borrow<'info> {
    /// Borrower - must be the position owner
    #[account(mut)]
    pub owner: Signer<'info>,

    /// ProtocolConfig PDA
    #[account(
        seeds = [ProtocolConfig::SEEDS],
        bump = protocol_config.bump,
    )]
    pub protocol_config: Box<Account<'info, ProtocolConfig>>,

    /// AssetConfig PDA - validates mint, feed ID, and risk parameters
    #[account(
        seeds = [AssetConfig::SEEDS_PREFIX, asset_config.mint.as_ref()],
        bump = asset_config.bump,
    )]
    pub asset_config: Box<Account<'info, AssetConfig>>,

    /// Position PDA - must already exist (created during deposit)
    #[account(
        mut,
        seeds = [Position::SEEDS_PREFIX, owner.key().as_ref(), asset_config.mint.as_ref()],
        bump = position.bump,
    )]
    pub position: Box<Account<'info, Position>>,

    /// Pyth PriceUpdateV2 account - validated by oracle module
    pub price_update: Box<Account<'info, PriceUpdateV2>>,

    /// Collateral token mint
    #[account(
        constraint = collateral_mint.key() == asset_config.mint @ CircuitError::InvalidMint,
    )]
    pub collateral_mint: Box<Account<'info, Mint>>,

    /// Quote token mint
    #[account(
        constraint = quote_mint.key() == asset_config.quote_mint @ CircuitError::InvalidMint,
    )]
    pub quote_mint: Box<Account<'info, Mint>>,

    /// User's quote token account (receives borrowed tokens)
    #[account(
        mut,
        token::mint = quote_mint,
        token::authority = owner,
    )]
    pub user_quote_ata: Box<Account<'info, TokenAccount>>,

    /// Circuit Treasury's quote token account (receives protocol fee)
    #[account(
        mut,
        token::mint = quote_mint,
        constraint = treasury_quote_ata.owner == protocol_config.fee_recipient @ CircuitError::InvalidFeeRecipient,
    )]
    pub treasury_quote_ata: Box<Account<'info, TokenAccount>>,

    /// Protocol liquidity vault (source of borrowed tokens)
    #[account(
        mut,
        associated_token::mint = quote_mint,
        associated_token::authority = protocol_config,
    )]
    pub liquidity_vault: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}
