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

    // 1. Reference market session evaluation
    let session_expected_open = market::is_market_open(clock.unix_timestamp).unwrap_or(false);

    // 2. Validate current oracle feed
    let oracle_result = oracle::try_validate_pyth_price(
        &ctx.accounts.price_update,
        &asset.pyth_feed_id,
        asset.max_oracle_age,
        asset.max_conf_bps,
        &clock,
    );

    // Extract exact publish time & staleness from PriceUpdateV2
    let msg = &ctx.accounts.price_update.price_message;
    let feed_staleness_seconds = clock.unix_timestamp.saturating_sub(msg.publish_time) as u64;

    let (conf_ratio_bps, oracle_age) = if let Some(ref val) = oracle_result {
        let ratio = math::calculate_confidence_ratio_bps(val.price, val.conf).unwrap_or(10_000);
        let age = clock.unix_timestamp.saturating_sub(val.publish_time) as u64;
        (ratio, age)
    } else {
        let ratio = math::calculate_confidence_ratio_bps(msg.price, msg.conf).unwrap_or(10_000);
        (ratio, feed_staleness_seconds)
    };

    // 3. Multi-feed global oracle health assessment (distinguishes halt from broader oracle outage)
    let mut global_oracle_healthy = true;
    if !ctx.remaining_accounts.is_empty() {
        let mut total_extra_feeds = 0usize;
        let mut stale_extra_feeds = 0usize;

        for acc in ctx.remaining_accounts.iter() {
            if acc.data_len() >= 133 {
                if let Ok(extra_update) = Account::<PriceUpdateV2>::try_from(acc) {
                    total_extra_feeds += 1;
                    let extra_age = clock.unix_timestamp.saturating_sub(extra_update.price_message.publish_time) as u64;
                    if extra_age > asset.max_oracle_age {
                        stale_extra_feeds += 1;
                    }
                }
            }
        }

        // If multiple feeds were provided and ALL extra feeds are stale along with this feed, global oracle is degraded
        if total_extra_feeds > 0 && stale_extra_feeds == total_extra_feeds && oracle_result.is_none() {
            global_oracle_healthy = false;
        }
    }

    // 4. Derive per-security halt state
    let halt_state = if !session_expected_open {
        HaltState::Closed
    } else if oracle_result.is_some() {
        HaltState::OpenNormal
    } else if global_oracle_healthy {
        HaltState::HaltedInferred
    } else {
        HaltState::OracleUnavailable
    };

    if ratchet.feed_id == [0u8; 32] && ratchet.last_updated_slot == 0 {
        ratchet.feed_id = asset.pyth_feed_id;
        ratchet.bump = ctx.bumps.risk_ratchet;
        ratchet.cooldown_seconds = 60;
        ratchet.policy_version = crate::risk::CANONICAL_POLICY_VERSION;
    }

    let mut engine_res = crate::risk::DynamicRiskEngine::evaluate_and_update(
        ratchet,
        session_expected_open,
        conf_ratio_bps,
        oracle_age,
        asset.max_oracle_age,
        asset.custody_state,
        asset.liquidity_state,
        clock.slot,
        clock.unix_timestamp,
    )?;

    // 5. Integrate HALTED_INFERRED and ORACLE_UNAVAILABLE into RiskRatchet
    if halt_state == HaltState::HaltedInferred || halt_state == HaltState::OracleUnavailable {
        // Enforce fast tightening to at least Defensive
        let previous_state = ratchet.state;
        let target_state = match ratchet.state {
            MarketState::Emergency => MarketState::Emergency,
            _ => MarketState::Defensive,
        };

        if target_state != ratchet.state {
            ratchet.state = target_state;
            ratchet.risk_epoch = ratchet.risk_epoch.saturating_add(1);
            ratchet.transition_nonce = ratchet.transition_nonce.saturating_add(1);
            ratchet.last_stress_slot = clock.slot;
            ratchet.last_transition_ts = clock.unix_timestamp;
            ratchet.consecutive_healthy_observations = 0;
            engine_res.state_changed = true;
            engine_res.previous_state = previous_state;
            engine_res.new_state = target_state;
        }
        let reason = if halt_state == HaltState::OracleUnavailable {
            GuardReason::OracleUnavailable
        } else {
            GuardReason::SecurityHaltInferred
        };
        ratchet.reason = reason;
        engine_res.reason = reason;
    }

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

    // Update cached guard state
    guard.market_state = engine_res.new_state;
    guard.reason = engine_res.reason;
    guard.last_checked_slot = clock.slot;
    guard.halt_state = halt_state;
    guard.feed_staleness_seconds = feed_staleness_seconds;
    guard.session_expected_open = session_expected_open;
    guard.global_oracle_healthy = global_oracle_healthy;

    // Update last_valid_price ONLY when oracle validation succeeds
    // INVARIANT: invalid oracle data never overwrites the last known good price
    if let Some(ref validated) = oracle_result {
        guard.last_valid_price = validated.price;
        guard.last_valid_expo = validated.expo;
        guard.last_publish_time = validated.publish_time;
    }

    msg!(
        "Guard refreshed: {:?} halt={:?} reason={:?} epoch={}",
        ratchet.state,
        guard.halt_state,
        guard.reason,
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

    /// MarketGuard PDA to update.
    /// Uses realloc to safely expand account space for existing Devnet PDAs.
    #[account(
        mut,
        realloc = 8 + MarketGuard::INIT_SPACE,
        realloc::payer = caller,
        realloc::zero = false,
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
