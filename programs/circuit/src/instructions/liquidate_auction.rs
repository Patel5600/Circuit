use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer};
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;
use crate::state::*;
use crate::errors::CircuitError;
use crate::oracle;
use crate::math;

/// Tier 2 Time-Ramped Dutch Auction Liquidation with Partial Close Factor.
///
/// Eliminates the latency arms race by deriving the liquidation discount dynamically
/// from elapsed slots since auction start:
///   elapsed_slots = clock.slot - auction.start_slot
///   discount = D_min + elapsed * (D_max - D_min) / DURATION
///
/// Implements Partial Liquidation:
///   Liquidator repays up to 50% of the debt (or 100% if debt <= dust threshold $100),
///   restoring position health while preserving borrower equity.
///
/// If position is restored to Healthy (HF >= 1.0 or debt == 0), the auction is closed
/// and rent lamports are refunded to `auction_initiator`.
pub fn handler(ctx: Context<LiquidateAuction>, requested_repay: u64) -> Result<()> {
    let protocol = &ctx.accounts.protocol_config;
    let asset = &ctx.accounts.asset_config;
    let position = &mut ctx.accounts.position;
    let auction = &mut ctx.accounts.auction;
    let clock = Clock::get()?;

    // Position must have debt
    require!(position.has_debt(), CircuitError::NotLiquidatable);

    // Ensure auction matches this position and is active
    require!(auction.position == position.key(), CircuitError::AuctionNotActive);
    require!(auction.status == AuctionStatus::Active, CircuitError::AuctionNotActive);

    // Determine liquidation reference price
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
            msg!("EMERGENCY: Using frozen last-valid price for auction liquidation");
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

    // Calculate current health factor
    let hf = math::calculate_health_factor(
        collateral_value,
        asset.liquidation_threshold_bps,
        position.debt_amount,
    )?;

    // Position must be unhealthy
    require!(hf < protocol.min_health_factor_bps, CircuitError::NotLiquidatable);

    // Calculate elapsed slots since auction start
    let elapsed_slots = clock.slot.saturating_sub(auction.start_slot);

    // Calculate time-ramped Dutch auction bonus
    let bonus_bps = math::calculate_dutch_auction_bonus(
        elapsed_slots,
        math::DEFAULT_AUCTION_DURATION_SLOTS,
        math::DUTCH_AUCTION_MIN_BONUS_BPS,
        math::DUTCH_AUCTION_MAX_BONUS_BPS,
    )?;

    // Calculate exact minimum debt repayment required to restore position to target HF (protocol minimum)
    let min_restoration_debt = math::calculate_minimum_restoration_debt(
        position.debt_amount,
        collateral_value,
        asset.liquidation_threshold_bps,
        protocol.min_health_factor_bps,
        bonus_bps,
        math::DUST_DEBT_THRESHOLD,
    )?;

    // Reject under-restoring liquidations: liquidator must repay at least the minimum required debt
    if requested_repay > 0 && requested_repay < min_restoration_debt {
        return err!(CircuitError::InsufficientLiquidationAmount);
    }

    // Calculate debt to repay with partial close factor
    let debt_to_repay = math::calculate_close_factor_debt(
        position.debt_amount,
        requested_repay,
        math::DEFAULT_CLOSE_FACTOR_BPS,
        math::DUST_DEBT_THRESHOLD,
    )?;

    // Calculate collateral to seize
    let collateral_to_seize = math::calculate_liquidation_collateral(
        debt_to_repay,
        ref_price,
        ref_expo,
        bonus_bps,
        ctx.accounts.collateral_mint.decimals,
        ctx.accounts.quote_mint.decimals,
    )?;

    let actual_seizure = collateral_to_seize.min(position.collateral_amount);

    // Transfer 1: Liquidator pays debt (quote tokens -> liquidity vault)
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

    // Transfer 2: Protocol sends seized collateral to liquidator
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

    // Update position state
    position.debt_amount = position.debt_amount
        .checked_sub(debt_to_repay)
        .ok_or(CircuitError::MathOverflow)?;
    position.collateral_amount = position.collateral_amount
        .checked_sub(actual_seizure)
        .ok_or(CircuitError::MathOverflow)?;

    // Check post-liquidation health
    let mut auction_resolved = false;
    if position.debt_amount == 0 {
        position.state = PositionState::Healthy;
        auction_resolved = true;
    } else {
        let remaining_val = math::calculate_collateral_value(
            position.collateral_amount,
            ref_price,
            ref_expo,
            ctx.accounts.collateral_mint.decimals,
            ctx.accounts.quote_mint.decimals,
        )?;
        let post_hf = math::calculate_health_factor(
            remaining_val,
            asset.liquidation_threshold_bps,
            position.debt_amount,
        )?;
        if post_hf >= protocol.min_health_factor_bps {
            position.state = PositionState::Healthy;
            auction_resolved = true;
        } else {
            position.state = PositionState::Liquidatable;
        }

    }

    // Update auction state
    auction.settled_amount = auction.settled_amount.saturating_add(actual_seizure);
    auction.debt_repaid = auction.debt_repaid.saturating_add(debt_to_repay);

    let settlement_price = if auction.start_price > 0 && auction.floor_price > 0 {
        math::calculate_dutch_auction_price(
            auction.start_price,
            auction.floor_price,
            elapsed_slots,
            math::DEFAULT_AUCTION_DURATION_SLOTS,
        ).unwrap_or(ref_price)
    } else {
        ref_price
    };

    emit!(crate::events::AuctionSettled {
        auction: auction.key(),
        buyer: ctx.accounts.liquidator.key(),
        collateral_amount: actual_seizure,
        settlement_price,
        debt_repaid: debt_to_repay,
        fee: 0,
        timestamp: clock.unix_timestamp,
    });

    msg!(
        "DUTCH AUCTION LIQUIDATION. Repaid: {}. Seized: {}. Bonus: {} bps (elapsed: {} slots). Resolved: {}",
        debt_to_repay, actual_seizure, bonus_bps, elapsed_slots, auction_resolved
    );

    // If auction resolved, close auction and refund rent
    if auction_resolved {
        auction.status = AuctionStatus::Settled;
        ctx.accounts.auction.close(ctx.accounts.auction_initiator.to_account_info())?;
    }

    Ok(())
}

#[derive(Accounts)]
pub struct LiquidateAuction<'info> {
    /// Liquidator paying debt and receiving discounted collateral
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

    /// Position PDA being liquidated
    #[account(
        mut,
        seeds = [Position::SEEDS_PREFIX, position.owner.as_ref(), asset_config.mint.as_ref()],
        bump = position.bump,
    )]
    pub position: Box<Account<'info, Position>>,

    /// LiquidationAuction PDA
    #[account(
        mut,
        seeds = [LiquidationAuction::SEEDS_PREFIX, position.key().as_ref()],
        bump = auction.bump,
    )]
    pub auction: Box<Account<'info, LiquidationAuction>>,

    /// Original initiator of the auction receiving rent refund if auction completes
    #[account(
        mut,
        constraint = auction_initiator.key() == auction.initiator @ CircuitError::Unauthorized,
    )]
    pub auction_initiator: SystemAccount<'info>,

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
