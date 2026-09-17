use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;
use crate::state::*;
use crate::oracle;
use crate::market;
use crate::math;

/// Refreshes the cached MarketGuard and RiskRatchet states.
///
/// PERMISSIONLESS - anyone can call this to update observability and ratchet state.
///
/// CRITICAL SECURITY RULE:
/// This cached state MUST NOT be the sole authorization mechanism for
/// borrow/withdraw. Those instructions independently re-validate all
/// critical oracle/security conditions.
///
/// refresh_guard:
/// - reads PriceUpdateV2
/// - evaluates market risk conditions against volatility bands
/// - updates the 4-state RiskRatchet state machine with asymmetric tightening
///   and monotonic hysteresis recovery (5 consecutive clean observations)
/// - synchronizes MarketGuard PDA for frontend/indexer observability
/// - records last_valid_price ONLY when oracle validation succeeds
pub fn handler(ctx: Context<RefreshGuard>) -> Result<()> {
    let asset = &ctx.accounts.asset_config;
    let guard = &mut ctx.accounts.market_guard;
    let ratchet = &mut ctx.accounts.risk_ratchet;
    let clock = Clock::get()?;

    // Try to validate oracle
    let oracle_result = oracle::try_validate_pyth_price(
        &ctx.accounts.price_update,
        &asset.pyth_feed_id,
        asset.max_oracle_age,
        asset.max_conf_bps,
        &clock,
    );

    let (conf_ratio_bps, oracle_age) = if let Some(ref val) = oracle_result {
        let ratio = math::calculate_confidence_ratio_bps(val.price, val.conf).unwrap_or(10_000);
        let age = clock.unix_timestamp.saturating_sub(val.publish_time) as u64;
        (ratio, age)
    } else {
        (10_000, asset.max_oracle_age + 1)
    };

    let market_open = market::is_market_open(clock.unix_timestamp).unwrap_or(false);

    if ratchet.feed_id == [0u8; 32] && ratchet.last_updated_slot == 0 {
        ratchet.feed_id = asset.pyth_feed_id;
        ratchet.bump = ctx.bumps.risk_ratchet;
        ratchet.cooldown_seconds = 60;
        ratchet.policy_version = crate::risk::CANONICAL_POLICY_VERSION;
    }

    let engine_res = crate::risk::DynamicRiskEngine::evaluate_and_update(
        ratchet,
        market_open,
        conf_ratio_bps,
        oracle_age,
        asset.max_oracle_age,
        asset.custody_state,
        asset.liquidity_state,
        clock.slot,
        clock.unix_timestamp,
    )?;

    if engine_res.state_changed {
        emit!(crate::events::RiskStateChanged {
            feed_id: ratchet.feed_id,
            risk_epoch: ratchet.risk_epoch,
            previous_state: engine_res.previous_state,
            new_state: engine_res.new_state,
            reason: engine_res.reason,
            timestamp: clock.unix_timestamp,
        });
    } else if engine_res.recovery_observation_counted {
        emit!(crate::events::RecoveryObserved {
            feed_id: ratchet.feed_id,
            risk_epoch: ratchet.risk_epoch,
            current_state: ratchet.state,
            consecutive_observations: ratchet.consecutive_healthy_observations,
            required_observations: crate::risk::RatchetHysteresisConfig::REQUIRED_RECOVERY_OBSERVATIONS,
            timestamp: clock.unix_timestamp,
        });
    }

    // Update cached guard state for backward-compatible frontend/indexer observability
    guard.market_state = engine_res.new_state;
    guard.reason = engine_res.reason;
    guard.last_checked_slot = clock.slot;

    // Update last_valid_price ONLY when oracle validation succeeds
    // INVARIANT: invalid oracle data never overwrites the last known good price
    if let Some(ref validated) = oracle_result {
        guard.last_valid_price = validated.price;
        guard.last_valid_expo = validated.expo;
        guard.last_publish_time = validated.publish_time;
    }

    msg!(
        "Guard refreshed: {:?} reason={:?} score={} velocity={} epoch={}",
        ratchet.state,
        ratchet.reason,
        ratchet.risk_score,
        ratchet.risk_velocity,
        ratchet.risk_epoch,
    );
    Ok(())
}

#[derive(Accounts)]
pub struct RefreshGuard<'info> {
    /// Anyone can call refresh_guard - permissionless
    #[account(mut)]
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

    /// Dedicated RiskRatchet PDA - one per Pyth feed.
    /// Uses init_if_needed for zero-friction lazy activation across all 12 devnet markets.
    #[account(
        init_if_needed,
        payer = caller,
        space = 8 + RiskRatchet::INIT_SPACE,
        seeds = [RiskRatchet::SEEDS_PREFIX, &asset_config.pyth_feed_id],
        bump,
    )]
    pub risk_ratchet: Account<'info, RiskRatchet>,

    /// Pyth PriceUpdateV2 account
    pub price_update: Account<'info, PriceUpdateV2>,

    pub system_program: Program<'info, System>,
}
