use anchor_lang::prelude::*;
use crate::state::enums::{MarketState, GuardReason, CustodyState, LiquidityState};
use crate::state::risk_ratchet::RiskRatchet;
use crate::risk::scoring::RiskScoreBreakdown;
use crate::risk::velocity::calculate_risk_velocity;
use crate::risk::hysteresis::RatchetHysteresisConfig;

/// Unified result of executing the Dynamic Risk Engine on an observation tick.
#[derive(Debug)]
pub struct RiskEngineResult {
    pub previous_state: MarketState,
    pub new_state: MarketState,
    pub reason: GuardReason,
    pub score_breakdown: RiskScoreBreakdown,
    pub risk_velocity: i32,
    pub state_changed: bool,
    pub recovery_observation_counted: bool,
}

/// The ONE canonical Dynamic Risk Engine.
/// Operates on real on-chain state, computes deterministic multi-component score,
/// calculates risk velocity, enforces strict hysteresis, and executes staged recovery.
pub struct DynamicRiskEngine;

impl DynamicRiskEngine {
    #[allow(clippy::too_many_arguments)]
    pub fn evaluate_and_update(
        ratchet: &mut RiskRatchet,
        market_open: bool,
        conf_ratio_bps: u64,
        oracle_age: u64,
        max_oracle_age: u64,
        custody_state: CustodyState,
        liquidity_state: LiquidityState,
        current_slot: u64,
        unix_timestamp: i64,
    ) -> Result<RiskEngineResult> {
        // 1. Deterministic Multi-Component Risk Scoring
        let breakdown = RiskScoreBreakdown::compute(
            market_open,
            conf_ratio_bps,
            oracle_age,
            max_oracle_age,
            custody_state,
            liquidity_state,
        );

        // 2. Risk Velocity Calculation
        let elapsed_seconds = unix_timestamp.saturating_sub(ratchet.last_transition_ts).max(1);
        let (velocity, _trend) = calculate_risk_velocity(
            breakdown.composite_score,
            ratchet.previous_score,
            elapsed_seconds,
        );

        // Store scores into ratchet
        ratchet.previous_score = ratchet.risk_score;
        ratchet.risk_score = breakdown.composite_score;
        ratchet.risk_velocity = velocity;
        ratchet.market_score = breakdown.market_score;
        ratchet.capital_score = breakdown.capital_score;
        ratchet.oracle_score = breakdown.oracle_score;

        let candidate_state = RatchetHysteresisConfig::candidate_state_from_score(breakdown.composite_score);
        let candidate_reason = Self::derive_reason(
            candidate_state,
            custody_state,
            liquidity_state,
            market_open,
            conf_ratio_bps,
            oracle_age > max_oracle_age,
        );

        let candidate_severity = RiskRatchet::severity(candidate_state);
        let current_severity = RiskRatchet::severity(ratchet.state);

        let previous_state = ratchet.state;
        let mut state_changed = false;
        let mut recovery_observation_counted = false;

        if ratchet.last_updated_slot == 0 {
            // First-time initialization
            ratchet.state = candidate_state;
            ratchet.reason = candidate_reason;
            ratchet.risk_epoch = 0;
            ratchet.transition_nonce = 0;
            ratchet.consecutive_healthy_observations = 0;
            ratchet.last_stress_slot = if candidate_severity > 0 { current_slot } else { 0 };
            ratchet.last_transition_ts = unix_timestamp;
            state_changed = true;
        } else if candidate_severity > current_severity {
            // Asymmetric Fast Tightening: immediate degradation to protect capital
            ratchet.state = candidate_state;
            ratchet.reason = candidate_reason;
            ratchet.risk_epoch = ratchet.risk_epoch.saturating_add(1);
            ratchet.transition_nonce = ratchet.transition_nonce.saturating_add(1);
            ratchet.consecutive_healthy_observations = 0;
            ratchet.last_stress_slot = current_slot;
            ratchet.last_transition_ts = unix_timestamp;
            state_changed = true;
        } else if candidate_severity == current_severity {
            // Maintaining current severity level
            if ratchet.state == MarketState::Safe {
                ratchet.reason = GuardReason::Ok;
            } else {
                ratchet.consecutive_healthy_observations = 0;
                ratchet.reason = candidate_reason;
            }
        } else {
            // Condition is cleaner than current severity -> evaluate strict staged recovery
            let qualifies_deadband = RatchetHysteresisConfig::qualifies_for_recovery_step(
                ratchet.state,
                breakdown.composite_score,
            );

            let cooldown_passed = unix_timestamp.saturating_sub(ratchet.last_transition_ts)
                >= RatchetHysteresisConfig::RECOVERY_COOLDOWN_SECONDS;

            if qualifies_deadband && cooldown_passed {
                ratchet.consecutive_healthy_observations = ratchet
                    .consecutive_healthy_observations
                    .saturating_add(1);
                recovery_observation_counted = true;

                if ratchet.consecutive_healthy_observations >= RatchetHysteresisConfig::REQUIRED_RECOVERY_OBSERVATIONS {
                    // Staged Recovery: step up exactly ONE severity level
                    let next_state = match ratchet.state {
                        MarketState::Emergency => MarketState::Defensive,
                        MarketState::Defensive => MarketState::Restricted,
                        MarketState::Restricted => MarketState::Safe,
                        MarketState::Safe => MarketState::Safe,
                    };

                    require!(
                        RiskRatchet::is_legal_transition(previous_state, next_state),
                        crate::errors::CircuitError::IllegalStateTransition
                    );

                    ratchet.state = next_state;
                    ratchet.consecutive_healthy_observations = 0;
                    ratchet.transition_nonce = ratchet.transition_nonce.saturating_add(1);
                    ratchet.last_transition_ts = unix_timestamp;
                    ratchet.reason = if next_state == MarketState::Safe {
                        GuardReason::Ok
                    } else {
                        candidate_reason
                    };
                    state_changed = true;
                } else {
                    ratchet.reason = GuardReason::RatchetRecoveryPending;
                }
            } else {
                // Failed deadband or cooldown requirement
                ratchet.consecutive_healthy_observations = 0;
            }
        }

        ratchet.last_updated_slot = current_slot;

        Ok(RiskEngineResult {
            previous_state,
            new_state: ratchet.state,
            reason: ratchet.reason,
            score_breakdown: breakdown,
            risk_velocity: velocity,
            state_changed,
            recovery_observation_counted,
        })
    }

    fn derive_reason(
        state: MarketState,
        custody_state: CustodyState,
        liquidity_state: LiquidityState,
        market_open: bool,
        conf_ratio_bps: u64,
        is_stale: bool,
    ) -> GuardReason {
        if is_stale {
            GuardReason::StaleOracle
        } else if custody_state == CustodyState::Impaired {
            GuardReason::CustodyImpaired
        } else if liquidity_state == LiquidityState::Critical {
            GuardReason::LiquidityCritical
        } else if conf_ratio_bps > 300 {
            GuardReason::ConfidenceTooWide
        } else if conf_ratio_bps > 150 {
            GuardReason::RatchetDefensive
        } else if !market_open {
            GuardReason::MarketClosed
        } else if liquidity_state == LiquidityState::Thin {
            GuardReason::LiquidityThin
        } else if custody_state == CustodyState::Delayed {
            GuardReason::CustodyImpaired
        } else if conf_ratio_bps > 50 {
            GuardReason::ConfidenceTooWide
        } else if state == MarketState::Safe {
            GuardReason::Ok
        } else {
            GuardReason::RatchetRecoveryPending
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn init_test_ratchet() -> RiskRatchet {
        RiskRatchet {
            feed_id: [0u8; 32],
            state: MarketState::Safe,
            reason: GuardReason::Ok,
            risk_epoch: 0,
            transition_nonce: 0,
            consecutive_healthy_observations: 0,
            last_stress_slot: 0,
            last_updated_slot: 1,
            last_transition_ts: 1000,
            bump: 255,
            risk_score: 0,
            previous_score: 0,
            risk_velocity: 0,
            market_score: 0,
            capital_score: 0,
            oracle_score: 0,
            cooldown_seconds: 60,
            policy_version: 1,
        }
    }

    #[test]
    fn test_fast_tightening_immediate_degradation() {
        let mut r = init_test_ratchet();
        // Trigger emergency condition (conf > 300)
        let res = DynamicRiskEngine::evaluate_and_update(
            &mut r,
            true,
            350,
            5,
            60,
            CustodyState::Healthy,
            LiquidityState::Deep,
            100,
            1050,
        ).unwrap();

        assert_eq!(res.new_state, MarketState::Emergency);
        assert!(res.state_changed);
        assert_eq!(r.state, MarketState::Emergency);
        assert_eq!(r.risk_epoch, 1);
    }

    #[test]
    fn test_staged_recovery_requires_five_clean_observations() {
        let mut r = init_test_ratchet();
        r.state = MarketState::Restricted;
        r.last_transition_ts = 1000;

        // Feed 4 clean observations after cooldown (ts = 1100)
        for i in 1..=4 {
            let res = DynamicRiskEngine::evaluate_and_update(
                &mut r,
                true,
                10,
                5,
                60,
                CustodyState::Healthy,
                LiquidityState::Deep,
                100 + i,
                1100 + i as i64,
            ).unwrap();

            assert_eq!(res.new_state, MarketState::Restricted, "Must remain Restricted before 5th observation");
            assert!(!res.state_changed);
            assert_eq!(r.consecutive_healthy_observations, i as u32);
        }

        // 5th clean observation: must step up to Safe!
        let res5 = DynamicRiskEngine::evaluate_and_update(
            &mut r,
            true,
            10,
            5,
            60,
            CustodyState::Healthy,
            LiquidityState::Deep,
            105,
            1105,
        ).unwrap();

        assert_eq!(res5.new_state, MarketState::Safe);
        assert!(res5.state_changed);
        assert_eq!(r.state, MarketState::Safe);
        assert_eq!(r.consecutive_healthy_observations, 0);
    }

    #[test]
    fn test_cooldown_blocks_premature_recovery() {
        let mut r = init_test_ratchet();
        r.state = MarketState::Restricted;
        r.last_transition_ts = 1000;

        // Observation only 10s after transition (cooldown is 60s)
        let res = DynamicRiskEngine::evaluate_and_update(
            &mut r,
            true,
            10,
            5,
            60,
            CustodyState::Healthy,
            LiquidityState::Deep,
            101,
            1010, // only 10s passed
        ).unwrap();

        assert_eq!(res.new_state, MarketState::Restricted);
        assert_eq!(r.consecutive_healthy_observations, 0, "Observation must not count during cooldown");
    }

    #[test]
    fn test_recovery_never_skips_intermediate_tier() {
        let mut r = init_test_ratchet();
        r.state = MarketState::Emergency;
        r.last_transition_ts = 1000;

        // 5 clean observations on Emergency
        for i in 1..=5 {
            DynamicRiskEngine::evaluate_and_update(
                &mut r,
                true,
                10,
                5,
                60,
                CustodyState::Healthy,
                LiquidityState::Deep,
                100 + i,
                1100 + i as i64,
            ).unwrap();
        }

        // Must step to Defensive, NEVER directly to Safe!
        assert_eq!(r.state, MarketState::Defensive);
    }
}
