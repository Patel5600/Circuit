use crate::state::enums::MarketState;

/// Canonical Risk Ratchet Threshold Configuration.
/// All scores are in basis points [0, 10_000].
/// Strictly enforces T_recovery < T_tighten to eliminate oscillation / flapping.
pub struct RatchetHysteresisConfig;

impl RatchetHysteresisConfig {
    // ── Tightening Thresholds (Downgrade to higher severity) ──
    /// Score threshold to enter Restricted from Safe
    pub const DOWNGRADE_SCORE_SAFE_RESTRICTED: u32 = 3_500;
    /// Score threshold to enter Defensive from Restricted
    pub const DOWNGRADE_SCORE_RESTRICTED_DEFENSIVE: u32 = 6_000;
    /// Score threshold to enter Emergency from Defensive
    pub const DOWNGRADE_SCORE_DEFENSIVE_EMERGENCY: u32 = 8_500;

    // ── Recovery Deadband Thresholds (Must fall strictly below) ──
    /// Score deadband to recover from Restricted to Safe (1,000 BPS buffer below 3,500)
    pub const RECOVERY_SCORE_RESTRICTED_SAFE: u32 = 2_500;
    /// Score deadband to recover from Defensive to Restricted (1,500 BPS buffer below 6,000)
    pub const RECOVERY_SCORE_DEFENSIVE_RESTRICTED: u32 = 4_500;
    /// Score deadband to recover from Emergency to Defensive (2,000 BPS buffer below 8,500)
    pub const RECOVERY_SCORE_EMERGENCY_DEFENSIVE: u32 = 6_500;

    // ── Consecutive Observation Requirements ──
    /// Number of consecutive healthy crank observations required to step up one recovery tier
    pub const REQUIRED_RECOVERY_OBSERVATIONS: u32 = 5;

    // ── Transition Cooldown (Seconds) ──
    /// Minimum time that must elapse after a transition before allowing another non-emergency transition
    pub const RECOVERY_COOLDOWN_SECONDS: i64 = 60;

    /// Evaluates which target state is indicated by a raw score without hysteresis.
    pub fn candidate_state_from_score(score: u32) -> MarketState {
        if score >= Self::DOWNGRADE_SCORE_DEFENSIVE_EMERGENCY {
            MarketState::Emergency
        } else if score >= Self::DOWNGRADE_SCORE_RESTRICTED_DEFENSIVE {
            MarketState::Defensive
        } else if score >= Self::DOWNGRADE_SCORE_SAFE_RESTRICTED {
            MarketState::Restricted
        } else {
            MarketState::Safe
        }
    }

    /// Evaluates if the current score qualifies for a staged recovery step up from current_state.
    pub fn qualifies_for_recovery_step(current_state: MarketState, score: u32) -> bool {
        match current_state {
            MarketState::Emergency => score <= Self::RECOVERY_SCORE_EMERGENCY_DEFENSIVE,
            MarketState::Defensive => score <= Self::RECOVERY_SCORE_DEFENSIVE_RESTRICTED,
            MarketState::Restricted => score <= Self::RECOVERY_SCORE_RESTRICTED_SAFE,
            MarketState::Safe => true,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hysteresis_deadbands_strictly_less_than_entry_thresholds() {
        assert!(RatchetHysteresisConfig::RECOVERY_SCORE_RESTRICTED_SAFE < RatchetHysteresisConfig::DOWNGRADE_SCORE_SAFE_RESTRICTED);
        assert!(RatchetHysteresisConfig::RECOVERY_SCORE_DEFENSIVE_RESTRICTED < RatchetHysteresisConfig::DOWNGRADE_SCORE_RESTRICTED_DEFENSIVE);
        assert!(RatchetHysteresisConfig::RECOVERY_SCORE_EMERGENCY_DEFENSIVE < RatchetHysteresisConfig::DOWNGRADE_SCORE_DEFENSIVE_EMERGENCY);
    }

    #[test]
    fn test_deadband_gap_prevents_immediate_recovery() {
        // A score of 3,200 is below the 3,500 entry threshold, but ABOVE the 2,500 recovery threshold.
        // It must NOT qualify for recovery from Restricted to Safe!
        assert!(!RatchetHysteresisConfig::qualifies_for_recovery_step(MarketState::Restricted, 3_200));
        // Only once score falls to <= 2,500 does it qualify
        assert!(RatchetHysteresisConfig::qualifies_for_recovery_step(MarketState::Restricted, 2_500));
    }
}
