use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer};
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;
use crate::state::*;
use crate::errors::CircuitError;
use crate::oracle;
use crate::math;

/// Full liquidation of an unhealthy position.
///
/// MVP: FULL LIQUIDATION ONLY - no partial liquidation.
///
/// Emergency Price Policy:
/// - If current oracle is valid -> use current validated price
/// - If current oracle is invalid/stale -> use position.last_valid_price
///   (the frozen reference price from the most recent valid oracle observation)
///
/// Permissionless - any account can liquidate an eligible position.
/// Allowed when protocol is paused (protocol solvency protection).
///
/// Economic consequence of frozen reference price:
/// The frozen price is deterministic and conservative but may delay or change
/// liquidation economics during prolonged oracle disruption. The liquidator
/// accepts the price at which they execute.
pub fn handler(ctx: Context<Liquidate>) -> Result<()> {
    let protocol = &ctx.accounts.protocol_config;
    let asset = &ctx.accounts.asset_config;
    let position = &mut ctx.accounts.position;
    let clock = Clock::get()?;

    // Position must have debt to be liquidated
    require!(position.has_debt(), CircuitError::NotLiquidatable);

    // -- Determine liquidation reference price --
    // Try current oracle first; fall back to last_valid_price
    let (ref_price, ref_expo) = match oracle::try_validate_pyth_price(
        &ctx.accounts.price_update,
        &asset.pyth_feed_id,
        asset.max_oracle_age,
        asset.max_conf_bps,
        &clock,
    ) {
        Some(validated) => {
            // Current oracle is valid - use it and update last_valid
            (validated.price, validated.expo)
        },
        None => {
            // Current oracle is invalid - use emergency frozen price
            // INVARIANT: last_valid_price was set during a previous valid observation
            require!(position.last_valid_price > 0, CircuitError::InvalidPrice);
            msg!("EMERGENCY: Using frozen last-valid price for liquidation");
            (position.last_valid_price, position.last_valid_expo)
        },
    };

    // -- Calculate collateral value at reference price --
    let collateral_value = math::calculate_collateral_value(
        position.collateral_amount,
        ref_price,
        ref_expo,
        ctx.accounts.collateral_mint.decimals,
        ctx.accounts.quote_mint.decimals,
    )?;

    // -- Calculate health factor --
    let hf = math::calculate_health_factor(
        collateral_value,
        asset.liquidation_threshold_bps,
        position.debt_amount,
    )?;

    // Position must be unhealthy (HF < minimum)
    require!(hf < protocol.min_health_factor_bps, CircuitError::NotLiquidatable);

    // -- Full liquidation: repay entire debt --
    let debt_to_repay = position.debt_amount;

    // Calculate collateral to seize with dynamic severity-scaled bonus.
    // Floor is asset.effective_liquidation_bonus (e.g. 500 BPS = 5%).
    // As shortfall (min_health_factor - hf) grows, bonus scales up to 1500 BPS (15%).
    const MAX_LIQUIDATION_BONUS_BPS: u64 = 1_500;
    const LIQUIDATION_SLOPE_BPS: u64 = 1_000;

    let min_bonus_bps = asset.effective_liquidation_bonus(protocol);
    let bonus_bps = math::calculate_dynamic_liquidation_bonus(
        hf,
        protocol.min_health_factor_bps,
        min_bonus_bps,
        MAX_LIQUIDATION_BONUS_BPS,
        LIQUIDATION_SLOPE_BPS,
    )?;

    let collateral_to_seize = math::calculate_liquidation_collateral(
        debt_to_repay,
        ref_price,
        ref_expo,
        bonus_bps,
        ctx.accounts.collateral_mint.decimals,
        ctx.accounts.quote_mint.decimals,
    )?;

    // Cap seizure at available collateral
    let actual_seizure = collateral_to_seize.min(position.collateral_amount);

    // -- Transfer 1: Liquidator pays debt (quote tokens -> liquidity vault) --
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.liquidator_quote_ata.to_account_info(),
                to: ctx.accounts.liquidity_vault.to_account_info(),
                authority: ctx.accounts.liquidator.to_account_info(),
            },
        ),
        debt_to_repay,
    )?;

    // -- Transfer 2: Protocol sends collateral to liquidator --
    let seeds = &[ProtocolConfig::SEEDS, &[protocol.bump]];
    let signer_seeds = &[&seeds[..]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.collateral_vault.to_account_info(),
                to: ctx.accounts.liquidator_collateral_ata.to_account_info(),
                authority: ctx.accounts.protocol_config.to_account_info(),
            },
            signer_seeds,
        ),
        actual_seizure,
    )?;

    // -- Update position state --
    // Debt is fully cleared by a full liquidation, so the position is Healthy
    // regardless of whether any residual collateral remains.
    position.debt_amount = 0;
    position.collateral_amount = position.collateral_amount
        .checked_sub(actual_seizure)
        .ok_or(CircuitError::MathOverflow)?;
    position.state = PositionState::Healthy;

    let clock = Clock::get()?;
    emit!(crate::events::LiquidateEvent {
        liquidator: ctx.accounts.liquidator.key(),
        owner: position.owner,
        asset: ctx.accounts.asset_config.mint,
        debt_repaid: debt_to_repay,
        collateral_seized: actual_seizure,
        bonus_bps: dynamic_bonus_bps,
        timestamp: clock.unix_timestamp,
    });

    msg!(
        "LIQUIDATED. Debt repaid: {}. Collateral seized: {}. Remaining collateral: {}. Ref price: {} (expo: {})",
        debt_to_repay, actual_seizure, position.collateral_amount, ref_price, ref_expo
    );
    Ok(())
}

/// NOTE ON `Box`: this context carries ten deserialized accounts. Keeping them
/// inline overflows the 4KB SBF stack frame in the generated `try_accounts`.
/// Boxing moves the deserialized payloads to the heap. This is purely a layout
/// concern - it does not change the instruction's wire format or IDL.
#[derive(Accounts)]
pub struct Liquidate<'info> {
    /// Liquidator - any account can liquidate
    #[account(mut)]
    pub liquidator: Signer<'info>,

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

    /// The position being liquidated - NOT owned by the liquidator
    #[account(
        mut,
        seeds = [Position::SEEDS_PREFIX, position.owner.as_ref(), asset_config.mint.as_ref()],
        bump = position.bump,
    )]
    pub position: Box<Account<'info, Position>>,

    /// Pyth PriceUpdateV2 - used if valid, otherwise falls back to last_valid_price
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

    /// Liquidator's quote token account (pays debt)
    #[account(
        mut,
        token::mint = quote_mint,
        token::authority = liquidator,
    )]
    pub liquidator_quote_ata: Box<Account<'info, TokenAccount>>,

    /// Liquidator's collateral token account (receives seized collateral)
    #[account(
        mut,
        token::mint = collateral_mint,
        token::authority = liquidator,
    )]
    pub liquidator_collateral_ata: Box<Account<'info, TokenAccount>>,

    /// Protocol collateral vault
    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = protocol_config,
    )]
    pub collateral_vault: Box<Account<'info, TokenAccount>>,

    /// Protocol liquidity vault
    #[account(
        mut,
        associated_token::mint = quote_mint,
        associated_token::authority = protocol_config,
    )]
    pub liquidity_vault: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}
