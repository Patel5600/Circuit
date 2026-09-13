use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;
use crate::state::*;
use crate::errors::CircuitError;
use crate::oracle;
use crate::math;

/// Cancels an active liquidation auction if the position is no longer unhealthy.
/// This occurs when:
/// 1. The borrower repaid enough debt to restore HF >= 1.0 (or cleared debt entirely).
/// 2. Collateral price appreciated, bringing HF back above protocol threshold.
///
/// Closes the `LiquidationAuction` PDA and returns rent lamports to the original initiator.
pub fn handler(ctx: Context<CancelLiquidationAuction>) -> Result<()> {
    let protocol = &ctx.accounts.protocol_config;
    let asset = &ctx.accounts.asset_config;
    let position = &mut ctx.accounts.position;
    let clock = Clock::get()?;

    if position.has_debt() {
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
                (position.last_valid_price, position.last_valid_expo)
            },
        };

        let collateral_value = math::calculate_collateral_value(
            position.collateral_amount,
            ref_price,
            ref_expo,
            ctx.accounts.collateral_mint.decimals,
            ctx.accounts.quote_mint.decimals,
        )?;

        let hf = math::calculate_health_factor(
            collateral_value,
            asset.liquidation_threshold_bps,
            position.debt_amount,
        )?;

        // If still unhealthy, auction cannot be cancelled
        require!(hf >= protocol.min_health_factor_bps, CircuitError::AuctionStillActive);
    }

    // Reset position state to Healthy
    position.state = PositionState::Healthy;

    msg!(
        "AUCTION CANCELLED. Position: {} is healthy. Rent refunded to: {}",
        position.key(), ctx.accounts.auction_initiator.key()
    );

    Ok(())
}

#[derive(Accounts)]
pub struct CancelLiquidationAuction<'info> {
    /// Any caller can cancel a healed auction
    pub caller: Signer<'info>,

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

    /// LiquidationAuction PDA to close
    #[account(
        mut,
        seeds = [LiquidationAuction::SEEDS_PREFIX, position.key().as_ref()],
        bump = auction.bump,
        close = auction_initiator,
    )]
    pub auction: Box<Account<'info, LiquidationAuction>>,

    /// Original initiator of the auction receiving rent refund
    #[account(
        mut,
        constraint = auction_initiator.key() == auction.initiator @ CircuitError::Unauthorized,
    )]
    pub auction_initiator: SystemAccount<'info>,
}
