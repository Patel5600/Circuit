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

    // Evaluate candidate state based on current instant conditions
    let (candidate_state, candidate_reason, conf_ratio_bps) = evaluate_observation(
        &oracle_result,
        clock.unix_timestamp,
        asset.custody_state,
        asset.liquidity_state,
    );

    let candidate_severity = state_severity(candidate_state);

    if ratchet.last_updated_slot == 0 {
        // First-time initialization
        ratchet.feed_id = asset.pyth_feed_id;
        ratchet.bump = ctx.bumps.risk_ratchet;
        ratchet.state = candidate_state;
        ratchet.reason = candidate_reason;
        ratchet.risk_epoch = 0;
        ratchet.consecutive_healthy_observations = 0;
        ratchet.last_stress_slot = if candidate_severity > 0 { clock.slot } else { 0 };
    } else {
        let current_severity = state_severity(ratchet.state);

        if candidate_severity > current_severity {
            // Asymmetric fast tightening: immediately degrade to candidate state
            let prev_state = ratchet.state;
            ratchet.state = candidate_state;
            ratchet.reason = candidate_reason;
            ratchet.risk_epoch = ratchet.risk_epoch.saturating_add(1);
            ratchet.consecutive_healthy_observations = 0;
            ratchet.last_stress_slot = clock.slot;

            emit!(crate::events::RiskStateChanged {
                feed_id: ratchet.feed_id,
                risk_epoch: ratchet.risk_epoch,
                previous_state: prev_state,
                new_state: candidate_state,
                reason: candidate_reason,
                timestamp: clock.unix_timestamp,
            });
        } else if candidate_severity == current_severity {
            // Still at current severity level
            if ratchet.state == MarketState::Safe {
                ratchet.reason = GuardReason::Ok;
            } else {
                // Conditions match current degraded state - reset recovery counter
                ratchet.consecutive_healthy_observations = 0;
                ratchet.reason = candidate_reason;
            }
        } else {
            // Conditions are cleaner than current state -> check recovery hysteresis deadband
            let qualifies_for_recovery_step = match ratchet.state {
                MarketState::Emergency => {
                    // To step up to Defensive: conf <= 250 BPS (50 BPS deadband below 300)
                    // and oracle valid, custody not impaired, liquidity not critical
                    oracle_result.is_some()
                        && asset.custody_state != CustodyState::Impaired
                        && asset.liquidity_state != LiquidityState::Critical
                        && conf_ratio_bps <= 250
                }
                MarketState::Defensive => {
                    // To step up to Restricted: conf <= 100 BPS (50 BPS deadband below 150)
                    oracle_result.is_some()
                        && asset.custody_state != CustodyState::Impaired
                        && asset.liquidity_state != LiquidityState::Critical
                        && conf_ratio_bps <= 100
                }
                MarketState::Restricted => {
                    // To step up to Safe: conf <= 30 BPS (20 BPS deadband below 50)
                    // NYSE open, custody healthy, liquidity deep
                    candidate_state == MarketState::Safe && conf_ratio_bps <= 30
                }
                MarketState::Safe => true,
            };

            if qualifies_for_recovery_step {
                ratchet.consecutive_healthy_observations = ratchet
                    .consecutive_healthy_observations
                    .saturating_add(1);

                if ratchet.consecutive_healthy_observations >= RiskRatchet::REQUIRED_RECOVERY_OBSERVATIONS {
                    // Step up exactly ONE level
                    let prev_state = ratchet.state;
                    let next_state = match ratchet.state {
                        MarketState::Emergency => MarketState::Defensive,
                        MarketState::Defensive => MarketState::Restricted,
                        MarketState::Restricted => MarketState::Safe,
                        MarketState::Safe => MarketState::Safe,
                    };
                    ratchet.state = next_state;
                    ratchet.consecutive_healthy_observations = 0;
                    ratchet.reason = if next_state == MarketState::Safe {
                        GuardReason::Ok
                    } else {
                        candidate_reason
                    };

                    emit!(crate::events::RiskStateChanged {
                        feed_id: ratchet.feed_id,
                        risk_epoch: ratchet.risk_epoch,
                        previous_state: prev_state,
                        new_state: next_state,
                        reason: ratchet.reason,
                        timestamp: clock.unix_timestamp,
                    });

                    msg!("Ratchet stepped up to {:?} after 5 clean observations", next_state);
                } else {
                    ratchet.reason = GuardReason::RatchetRecoveryPending;
                    emit!(crate::events::RecoveryObserved {
                        feed_id: ratchet.feed_id,
                        risk_epoch: ratchet.risk_epoch,
                        current_state: ratchet.state,
                        consecutive_observations: ratchet.consecutive_healthy_observations,
                        required_observations: RiskRatchet::REQUIRED_RECOVERY_OBSERVATIONS,
                        timestamp: clock.unix_timestamp,
                    });
                }
            } else {
                // Did not meet strict hysteresis recovery criteria
                ratchet.consecutive_healthy_observations = 0;
            }
        }
    }

    ratchet.last_updated_slot = clock.slot;

    // Update cached guard state for backward-compatible frontend/indexer observability
    guard.market_state = candidate_state;
    guard.reason = candidate_reason;
    guard.last_checked_slot = clock.slot;

    // Update last_valid_price ONLY when oracle validation succeeds
    // INVARIANT: invalid oracle data never overwrites the last known good price
    if let Some(ref validated) = oracle_result {
        guard.last_valid_price = validated.price;
        guard.last_valid_expo = validated.expo;
        guard.last_publish_time = validated.publish_time;
    }

    msg!(
        "Guard refreshed: {:?} reason={:?} epoch={} healthy_obs={} slot={}",
        ratchet.state,
        ratchet.reason,
        ratchet.risk_epoch,
        ratchet.consecutive_healthy_observations,
        clock.slot
    );
    Ok(())
}

fn state_severity(state: MarketState) -> u8 {
    match state {
        MarketState::Emergency => 3,
        MarketState::Defensive => 2,
        MarketState::Restricted => 1,
        MarketState::Safe => 0,
    }
}

/// Evaluates current tick conditions into candidate market state and reason.
fn evaluate_observation(
    oracle_result: &Option<oracle::ValidatedPrice>,
    unix_timestamp: i64,
    custody_state: CustodyState,
    liquidity_state: LiquidityState,
) -> (MarketState, GuardReason, u64) {
    let validated = match oracle_result {
        Some(v) => v,
        None => return (MarketState::Emergency, GuardReason::StaleOracle, 0),
    };

    if custody_state == CustodyState::Impaired {
        return (MarketState::Emergency, GuardReason::CustodyImpaired, 0);
    }
    if liquidity_state == LiquidityState::Critical {
        return (MarketState::Emergency, GuardReason::LiquidityCritical, 0);
    }

    let conf_ratio_bps = match math::calculate_confidence_ratio_bps(validated.price, validated.conf) {
        Ok(r) => r,
        Err(_) => return (MarketState::Emergency, GuardReason::InvalidPrice, 0),
    };

    // Extreme confidence widening (> 300 BPS = 3.0%) -> Emergency
    if conf_ratio_bps > 300 {
        return (MarketState::Emergency, GuardReason::ConfidenceTooWide, conf_ratio_bps);
    }

    // Severe confidence widening (> 150 BPS = 1.5%) -> Defensive
    if conf_ratio_bps > 150 {
        return (MarketState::Defensive, GuardReason::RatchetDefensive, conf_ratio_bps);
    }

    // Reference market (NYSE) closed -> Restricted
    let market_open = market::is_market_open(unix_timestamp).unwrap_or(false);
    if !market_open {
        return (MarketState::Restricted, GuardReason::MarketClosed, conf_ratio_bps);
    }

    // Degraded liquidity or custody -> Restricted
    if liquidity_state == LiquidityState::Thin {
        return (MarketState::Restricted, GuardReason::LiquidityThin, conf_ratio_bps);
    }
    if custody_state == CustodyState::Delayed {
        return (MarketState::Restricted, GuardReason::CustodyImpaired, conf_ratio_bps);
    }

    // Mild confidence widening (> 50 BPS = 0.50%) -> Restricted
    if conf_ratio_bps > 50 {
        return (MarketState::Restricted, GuardReason::ConfidenceTooWide, conf_ratio_bps);
    }

    // All conditions nominal
    (MarketState::Safe, GuardReason::Ok, conf_ratio_bps)
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
