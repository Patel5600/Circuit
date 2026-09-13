use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;
use crate::state::*;
use crate::errors::CircuitError;
use crate::oracle;
use crate::math;

/// Permissionless crank to initiate a time-ramped Dutch auction for an unhealthy position.
///
/// Validates:
/// 1. Position has outstanding debt
/// 2. Price is obtained from oracle or fallback last_valid_price
/// 3. Health factor is strictly below protocol minimum (HF < 1.0)
///
/// Opens the `LiquidationAuction` PDA with `start_slot = clock.slot` to start
/// continuous price discovery and eliminate MEV bot priority races.
pub fn handler(ctx: Context<StartLiquidationAuction>) -> Result<()> {
    let protocol = &ctx.accounts.protocol_config;
    let asset = &ctx.accounts.asset_config;
    let position = &mut ctx.accounts.position;
    let clock = Clock::get()?;

    // Position must have debt
    require!(position.has_debt(), CircuitError::NotLiquidatable);

    // Determine reference price
    let (ref_price, ref_expo) = match oracle::try_validate_pyth_price(
        &ctx.accounts.price_update,
        &asset.pyth_feed_id,
        asset.max_oracle_age,
        asset.max_conf_bps,
        &clock,
    ) {
        Some(validated) => (validated.price, validated.expo),
        None => {
            require!(position.last_valid_price > 0, CircuitError::InvalidPrice);
            msg!("EMERGENCY: Using frozen last-valid price for auction start");
            (position.last_valid_price, position.last_valid_expo)
        },
    };

    // Calculate collateral value
    let collateral_value = math::calculate_collateral_value(
        position.collateral_amount,
        ref_price,
        ref_expo,
        ctx.accounts.collateral_mint.decimals,
        ctx.accounts.quote_mint.decimals,
    )?;

    // Calculate health factor
    let hf = math::calculate_health_factor(
        collateral_value,
        asset.liquidation_threshold_bps,
        position.debt_amount,
    )?;

    // Must be unhealthy to start auction
    require!(hf < protocol.min_health_factor_bps, CircuitError::NotLiquidatable);

    // Initialize auction state
    let auction = &mut ctx.accounts.auction;
    auction.position = position.key();
    auction.start_slot = clock.slot;
    auction.start_price = ref_price;
    auction.start_expo = ref_expo;
    auction.initial_debt = position.debt_amount;
    auction.initiator = ctx.accounts.initiator.key();
    auction.bump = ctx.bumps.auction;

    // Transition position state to Liquidatable
    position.state = PositionState::Liquidatable;


    msg!(
        "AUCTION STARTED. Position: {}. Start slot: {}. HF: {}. Initial debt: {}",
        position.key(), auction.start_slot, hf, auction.initial_debt
    );

    Ok(())
}

#[derive(Accounts)]
pub struct StartLiquidationAuction<'info> {
    /// Initiator/crank paying rent for the LiquidationAuction account
    #[account(mut)]
    pub initiator: Signer<'info>,

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

    /// The unhealthy position entering auction
    #[account(
        mut,
        seeds = [Position::SEEDS_PREFIX, position.owner.as_ref(), asset_config.mint.as_ref()],
        bump = position.bump,
    )]
    pub position: Box<Account<'info, Position>>,

    /// Pyth PriceUpdateV2
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

    /// LiquidationAuction PDA being initialized
    #[account(
        init,
        payer = initiator,
        space = 8 + LiquidationAuction::INIT_SPACE,
        seeds = [LiquidationAuction::SEEDS_PREFIX, position.key().as_ref()],
        bump
    )]
    pub auction: Box<Account<'info, LiquidationAuction>>,

    pub system_program: Program<'info, System>,
}
