use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer};
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;
use crate::state::*;
use crate::errors::CircuitError;
use crate::oracle;
use crate::market;
use crate::math;

/// Withdraws collateral from a position.
///
/// Risk-increasing operation - requires full oracle + market validation when debt > 0.
///
/// If debt == 0: allows withdrawal within collateral balance (no oracle needed).
/// If debt > 0: re-validates oracle, session, and health factor.
///
/// BLOCKED when protocol is paused.
pub fn handler(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    require!(amount > 0, CircuitError::InsufficientCollateral);

    let protocol = &ctx.accounts.protocol_config;
    let asset = &ctx.accounts.asset_config;
    let position = &mut ctx.accounts.position;

    // Protocol must not be paused (withdrawal is risk-increasing)
    require!(!protocol.paused, CircuitError::ProtocolPaused);

    // Validate ownership
    require!(position.owner == ctx.accounts.owner.key(), CircuitError::InvalidPositionOwner);
    require!(position.asset == asset.mint, CircuitError::InvalidAsset);

    // Validate sufficient collateral
    require!(amount <= position.collateral_amount, CircuitError::WithdrawExceedsCollateral);

    let remaining_collateral = position.collateral_amount
        .checked_sub(amount)
        .ok_or(CircuitError::MathOverflow)?;

    let clock = Clock::get()?;

    // If position has debt, we must validate oracle + market + health factor
    if position.has_debt() {
        // Re-validate oracle
        let validated_price = oracle::validate_pyth_price(
            &ctx.accounts.price_update,
            &asset.pyth_feed_id,
            asset.max_oracle_age,
            asset.max_conf_bps,
            &clock,
        )?;

        // Re-validate market session
        let market_open = market::is_market_open(clock.unix_timestamp)?;
        require!(market_open, CircuitError::MarketClosed);

        // Conservative Pyth Valuation (p_conservative = max(0, p - conf))
        let conservative_price = math::calculate_conservative_pyth_price(
            validated_price.price,
            validated_price.conf,
        )?;

        let current_collateral_value = math::calculate_collateral_value(
            position.collateral_amount,
            conservative_price,
            validated_price.expo,
            ctx.accounts.collateral_mint.decimals,
            ctx.accounts.quote_mint.decimals,
        )?;

        // Resolve live Risk Ratchet and risk epoch from remaining accounts if present
        let (expected_ratchet_pda, _) = Pubkey::find_program_address(
            &[RiskRatchet::SEEDS_PREFIX, asset.mint.as_ref()],
            &crate::ID,
        );
        let (ratchet_state, risk_epoch) = if let Some(ratchet_info) = ctx.remaining_accounts.iter().find(|a| a.key == &expected_ratchet_pda) {
            if let Ok(ratchet) = RiskRatchet::try_deserialize(&mut &ratchet_info.data.borrow()[..]) {
                (ratchet.state, ratchet.risk_epoch.max(1))
            } else {
                (MarketState::Safe, 1)
            }
        } else {
            (MarketState::Safe, 1)
        };

        let oracle_age = clock.unix_timestamp.saturating_sub(validated_price.publish_time) as u64;
        let decision_ctx = crate::risk::DecisionContext {
            actor: &ctx.accounts.owner.key(),
            owner: &position.owner,
            asset_mint: &asset.mint,
            action: crate::permissions::CircuitAction::Withdraw,
            requested_amount: amount,
            protocol_paused: protocol.paused,
            asset_enabled: asset.enabled,
            base_ltv_bps: asset.base_ltv_bps,
            market_open,
            halt_state: HaltState::OpenNormal,
            oracle_price: validated_price.price,
            oracle_expo: validated_price.expo,
            oracle_conf: validated_price.conf,
            oracle_age,
            max_oracle_age: asset.max_oracle_age,
            oracle_healthy: true,
            custody_state: asset.custody_state,
            liquidity_state: asset.liquidity_state,
            ratchet_state,
            risk_epoch,
            position_has_debt: true,
            collateral_value: current_collateral_value,
            current_debt: position.debt_amount,
            agent_authority: None,
            current_timestamp: clock.unix_timestamp,
        };

        let decision = crate::risk::evaluate_decision(&decision_ctx)?;

        if !decision.allowed {
            match decision.denial_reason {
                crate::state::enums::PermissionDenialReason::RiskEmergency => return err!(CircuitError::RiskEmergency),
                crate::state::enums::PermissionDenialReason::RiskDefensive => return err!(CircuitError::RiskDefensive),
                crate::state::enums::PermissionDenialReason::WithdrawNotPermitted => return err!(CircuitError::WithdrawRestrictedInStress),
                _ => return err!(CircuitError::CapitalPolicyBlocked),
            }
        }

        // Calculate remaining collateral value using conservative price
        let remaining_value = math::calculate_collateral_value(
            remaining_collateral,
            conservative_price,
            validated_price.expo,
            ctx.accounts.collateral_mint.decimals,
            ctx.accounts.quote_mint.decimals,
        )?;

        // Check health factor with remaining collateral
        let hf = math::calculate_health_factor(
            remaining_value,
            asset.liquidation_threshold_bps,
            position.debt_amount,
        )?;
        require!(hf >= protocol.min_health_factor_bps, CircuitError::HealthFactorTooLow);

        // Update last valid price to conservative price
        position.last_valid_price = conservative_price;
        position.last_valid_expo = validated_price.expo;
    } else {
        // Zero debt path: must still pass through ONE canonical Permission Engine with valid epoch
        let (expected_ratchet_pda, _) = Pubkey::find_program_address(
            &[RiskRatchet::SEEDS_PREFIX, asset.mint.as_ref()],
            &crate::ID,
        );
        let risk_epoch = if let Some(ratchet_info) = ctx.remaining_accounts.iter().find(|a| a.key == &expected_ratchet_pda) {
            if let Ok(ratchet) = RiskRatchet::try_deserialize(&mut &ratchet_info.data.borrow()[..]) {
                ratchet.risk_epoch.max(1)
            } else {
                1
            }
        } else {
            1
        };

        let policy = crate::risk::CapitalPolicyEngine::derive_policy(
            crate::state::MarketState::Safe,
            asset.base_ltv_bps,
            false,
            risk_epoch,
            clock.unix_timestamp,
        );

        let perm = crate::permissions::evaluate_permission(
            &ctx.accounts.owner.key(),
            crate::permissions::CircuitAction::Withdraw,
            &asset.mint,
            amount,
            &position.owner,
            false,
            position.collateral_amount as u128,
            0,
            &policy,
            None,
            clock.unix_timestamp,
        )?;

        if !perm.allowed {
            return err!(CircuitError::CapitalPolicyBlocked);
        }
    }

    // Transfer collateral from vault to user
    let seeds = &[ProtocolConfig::SEEDS, &[protocol.bump]];
    let signer_seeds = &[&seeds[..]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.collateral_vault.to_account_info(),
                to: ctx.accounts.user_collateral_ata.to_account_info(),
                authority: ctx.accounts.protocol_config.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    // Update position
    position.collateral_amount = remaining_collateral;

    let clock = Clock::get()?;
    emit!(crate::events::WithdrawEvent {
        owner: ctx.accounts.owner.key(),
        asset: ctx.accounts.asset_config.mint,
        amount,
        remaining_collateral,
        timestamp: clock.unix_timestamp,
    });

    msg!(
        "Withdrew {} collateral tokens. Remaining: {}",
        amount, position.collateral_amount
    );
    Ok(())
}

/// Accounts are boxed to keep the generated `try_accounts` within the 4KB SBF
/// stack frame. See the note in `liquidate.rs` - layout only, no wire change.
#[derive(Accounts)]
pub struct Withdraw<'info> {
    /// User withdrawing collateral
    #[account(mut)]
    pub owner: Signer<'info>,

    /// ProtocolConfig PDA
    #[account(
        seeds = [ProtocolConfig::SEEDS],
        bump = protocol_config.bump,
    )]
    pub protocol_config: Box<Account<'info, ProtocolConfig>>,

    /// AssetConfig PDA
    #[account(
        seeds = [AssetConfig::SEEDS_PREFIX, asset_config.mint.as_ref()],
        bump = asset_config.bump,
    )]
    pub asset_config: Box<Account<'info, AssetConfig>>,

    /// Position PDA
    #[account(
        mut,
        seeds = [Position::SEEDS_PREFIX, owner.key().as_ref(), asset_config.mint.as_ref()],
        bump = position.bump,
    )]
    pub position: Box<Account<'info, Position>>,

    /// Pyth PriceUpdateV2 - required when debt > 0
    /// When debt == 0, this account is still required to be provided
    /// but is not read (Anchor requires all accounts to be present).
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

    /// User's collateral token account (receives withdrawn tokens)
    #[account(
        mut,
        token::mint = collateral_mint,
        token::authority = owner,
    )]
    pub user_collateral_ata: Box<Account<'info, TokenAccount>>,

    /// Protocol collateral vault
    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = protocol_config,
    )]
    pub collateral_vault: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}
