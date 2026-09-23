use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use anchor_spl::associated_token::AssociatedToken;
use crate::state::*;
use crate::errors::CircuitError;

/// Registers a new asset (equity token) for use as collateral.
/// Creates AssetConfig PDA, MarketGuard PDA, and protocol vault ATAs.
///
/// Admin-only.
pub fn handler(
    ctx: Context<RegisterAsset>,
    pyth_feed_id: [u8; 32],
    base_ltv_bps: u64,
    liquidation_threshold_bps: u64,
    liquidation_bonus_bps: u64,
    max_oracle_age: u64,
    max_conf_bps: u64,
) -> Result<()> {
    // Validate parameters
    require!(base_ltv_bps > 0 && base_ltv_bps <= 10_000, CircuitError::MathOverflow);
    require!(liquidation_threshold_bps > base_ltv_bps, CircuitError::MathOverflow);
    require!(liquidation_threshold_bps <= 10_000, CircuitError::MathOverflow);
    require!(max_oracle_age > 0, CircuitError::InvalidTimestamp);
    require!(max_conf_bps > 0 && max_conf_bps <= 10_000, CircuitError::ConfidenceTooWide);

    // Initialize AssetConfig
    let asset_config = &mut ctx.accounts.asset_config;
    asset_config.authority = ctx.accounts.authority.key();
    asset_config.mint = ctx.accounts.mint.key();
    asset_config.pyth_feed_id = pyth_feed_id;
    asset_config.base_ltv_bps = base_ltv_bps;
    asset_config.liquidation_threshold_bps = liquidation_threshold_bps;
    asset_config.liquidation_bonus_bps = liquidation_bonus_bps;
    asset_config.max_oracle_age = max_oracle_age;
    asset_config.max_conf_bps = max_conf_bps;
    asset_config.custody_state = CustodyState::Healthy;
    asset_config.liquidity_state = LiquidityState::Deep;
    asset_config.enabled = true;
    asset_config.quote_mint = ctx.accounts.quote_mint.key();
    asset_config.bump = ctx.bumps.asset_config;

    // Initialize MarketGuard
    let guard = &mut ctx.accounts.market_guard;
    guard.feed_id = pyth_feed_id;
    guard.last_valid_price = 0;
    guard.last_valid_expo = 0;
    guard.last_publish_time = 0;
    guard.market_state = MarketState::Emergency; // Conservative default until first refresh
    guard.reason = GuardReason::InvalidPrice;
    guard.last_checked_slot = 0;
    guard.halt_state = HaltState::Closed;
    guard.feed_staleness_seconds = 0;
    guard.session_expected_open = false;
    guard.global_oracle_healthy = true;
    guard.bump = ctx.bumps.market_guard;

    msg!("Asset registered. Mint: {}, Feed: {:?}", asset_config.mint, &pyth_feed_id[..4]);
    Ok(())
}

#[derive(Accounts)]
#[instruction(pyth_feed_id: [u8; 32])]
pub struct RegisterAsset<'info> {
    /// Admin authority - must match ProtocolConfig.authority
    #[account(mut)]
    pub authority: Signer<'info>,

    /// ProtocolConfig - validates admin authority
    #[account(
        seeds = [ProtocolConfig::SEEDS],
        bump = protocol_config.bump,
        has_one = authority @ CircuitError::Unauthorized,
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,

    /// The equity token mint being registered as collateral
    pub mint: Account<'info, Mint>,

    /// The quote token mint (e.g., TEST-USDC) for borrowing
    pub quote_mint: Account<'info, Mint>,

    /// AssetConfig PDA - seeds: ["asset", mint]
    #[account(
        init,
        payer = authority,
        space = 8 + AssetConfig::INIT_SPACE,
        seeds = [AssetConfig::SEEDS_PREFIX, mint.key().as_ref()],
        bump,
    )]
    pub asset_config: Account<'info, AssetConfig>,

    /// MarketGuard PDA - seeds: ["guard", pyth_feed_id]
    #[account(
        init,
        payer = authority,
        space = 8 + MarketGuard::INIT_SPACE,
        seeds = [MarketGuard::SEEDS_PREFIX, &pyth_feed_id],
        bump,
    )]
    pub market_guard: Account<'info, MarketGuard>,

    /// Collateral vault - ATA of protocol PDA for equity mint
    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = mint,
        associated_token::authority = protocol_config,
    )]
    pub collateral_vault: Account<'info, TokenAccount>,

    /// Liquidity vault - ATA of protocol PDA for quote mint
    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = quote_mint,
        associated_token::authority = protocol_config,
    )]
    pub liquidity_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}
