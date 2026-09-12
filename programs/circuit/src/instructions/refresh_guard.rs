use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;
use crate::state::*;
use crate::oracle;
use crate::market;

/// Refreshes the cached MarketGuard state.
///
/// PERMISSIONLESS - anyone can call this to update observability state.
///
/// CRITICAL SECURITY RULE:
/// This cached state MUST NOT be the sole authorization mechanism for
/// borrow/withdraw. Those instructions independently re-validate all
/// critical oracle/security conditions.
///
/// refresh_guard:
/// - reads PriceUpdateV2
/// - derives current guard state from oracle + session + custody + liquidity
/// - writes cached state to MarketGuard PDA
/// - records last_valid_price ONLY when oracle validation succeeds
///
/// No unauthorized user can arbitrarily set MarketState::Safe.
pub fn handler(ctx: Context<RefreshGuard>) -> Result<()> {
    let asset = &ctx.accounts.asset_config;
    let guard = &mut ctx.accounts.market_guard;
    let clock = Clock::get()?;

    // Try to validate oracle
    let oracle_result = oracle::try_validate_pyth_price(
        &ctx.accounts.price_update,
        &asset.pyth_feed_id,
        asset.max_oracle_age,
        asset.max_conf_bps,
        &clock,
    );

    // Derive market state
    let (state, reason) = derive_guard_state(
        &oracle_result,
        clock.unix_timestamp,
        asset.custody_state,
        asset.liquidity_state,
    )?;

    // Update cached guard state
    guard.market_state = state;
    guard.reason = reason;
    guard.last_checked_slot = clock.slot;

    // Update last_valid_price ONLY when oracle validation succeeds
    // INVARIANT: invalid oracle data never overwrites the last known good price
    if let Some(ref validated) = oracle_result {
        guard.last_valid_price = validated.price;
        guard.last_valid_expo = validated.expo;
        guard.last_publish_time = validated.publish_time;
    }

    msg!("Guard refreshed: {:?} reason={:?} slot={}", state, reason, clock.slot);
    Ok(())
}

/// Derives the MarketGuard state from current conditions.
///
/// Priority order (highest to lowest):
/// 1. Oracle invalid -> Emergency
/// 2. Custody Impaired -> Emergency
/// 3. Liquidity Critical -> Emergency
/// 4. Market closed -> Restricted
/// 5. Liquidity Thin -> Restricted
/// 6. Custody Delayed -> Restricted
/// 7. All OK -> Safe
fn derive_guard_state(
    oracle_result: &Option<oracle::ValidatedPrice>,
    unix_timestamp: i64,
    custody_state: CustodyState,
    liquidity_state: LiquidityState,
) -> Result<(MarketState, GuardReason)> {
    // Check oracle validity
    if oracle_result.is_none() {
        return Ok((MarketState::Emergency, GuardReason::StaleOracle));
    }

    // Check custody
    if custody_state == CustodyState::Impaired {
        return Ok((MarketState::Emergency, GuardReason::CustodyImpaired));
    }

    // Check liquidity
    if liquidity_state == LiquidityState::Critical {
        return Ok((MarketState::Emergency, GuardReason::LiquidityCritical));
    }

    // Check market session
    let market_open = market::is_market_open(unix_timestamp).unwrap_or(false);
    if !market_open {
        return Ok((MarketState::Restricted, GuardReason::MarketClosed));
    }

    // Check degraded conditions
    if liquidity_state == LiquidityState::Thin {
        return Ok((MarketState::Restricted, GuardReason::LiquidityThin));
    }

    if custody_state == CustodyState::Delayed {
        return Ok((MarketState::Restricted, GuardReason::CustodyImpaired));
    }

    // All conditions nominal
    Ok((MarketState::Safe, GuardReason::Ok))
}

#[derive(Accounts)]
pub struct RefreshGuard<'info> {
    /// Anyone can call refresh_guard - permissionless
    pub caller: Signer<'info>,

    /// AssetConfig PDA - source of oracle config and custody/liquidity state
    #[account(
        seeds = [AssetConfig::SEEDS_PREFIX, asset_config.mint.as_ref()],
        bump = asset_config.bump,
    )]
    pub asset_config: Account<'info, AssetConfig>,

    /// MarketGuard PDA to update
    #[account(
        mut,
        seeds = [MarketGuard::SEEDS_PREFIX, &asset_config.pyth_feed_id],
        bump = market_guard.bump,
    )]
    pub market_guard: Account<'info, MarketGuard>,

    /// Pyth PriceUpdateV2 account
    pub price_update: Account<'info, PriceUpdateV2>,
}
