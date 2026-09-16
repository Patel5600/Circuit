use anchor_lang::prelude::*;
use super::enums::{MarketState, GuardReason};

/// Dedicated Risk Ratchet state PDA - one per Pyth feed.
///
/// Seeds: [ratchet, pyth_feed_id]
///
/// Implements the 4-state risk machine (Safe, Restricted, Defensive, Emergency).
/// Enforces asymmetric fast tightening and monotonic staged recovery with hysteresis.
#[account]
#[derive(InitSpace)]
pub struct RiskRatchet {
    /// The Pyth feed ID this ratchet governs
    pub feed_id: [u8; 32],

    /// Current risk ratchet state
    pub state: MarketState,

    /// Reason for current risk state
    pub reason: GuardReason,

    /// Cumulative counter of adverse condition breaches / stress events
    pub risk_epoch: u64,

    /// Monotonically increasing state-transition nonce (increments on every state change)
    pub transition_nonce: u64,

    /// Consecutive healthy crank observations at the current recovery tier
    pub consecutive_healthy_observations: u32,

    /// Solana slot at which the most recent risk breach occurred
    pub last_stress_slot: u64,

    /// Solana slot at which ratchet was last updated
    pub last_updated_slot: u64,

    /// Unix timestamp at which the most recent state transition occurred
    pub last_transition_ts: i64,

    /// PDA bump seed
    pub bump: u8,
}

impl RiskRatchet {
    pub const SEEDS_PREFIX: &'static [u8] = b"ratchet";

    /// Number of consecutive healthy crank observations required to step up one state
    pub const REQUIRED_RECOVERY_OBSERVATIONS: u32 = 5;

    // Downgrade confidence-ratio thresholds in basis points
    pub const DOWNGRADE_CONF_RATIO_SAFE_RESTRICTED: u64 = 50;
    pub const DOWNGRADE_CONF_RATIO_RESTRICTED_DEFENSIVE: u64 = 150;
    pub const DOWNGRADE_CONF_RATIO_DEFENSIVE_EMERGENCY: u64 = 300;

    // Staged recovery deadband thresholds in basis points (strict hysteresis T_up < T_down)
    pub const RECOVERY_DEADBAND_EMERGENCY_DEFENSIVE: u64 = 250;
    pub const RECOVERY_DEADBAND_DEFENSIVE_RESTRICTED: u64 = 100;
    pub const RECOVERY_DEADBAND_RESTRICTED_SAFE: u64 = 30;

    /// Severity level of market state (0 = Safe, 1 = Restricted, 2 = Defensive, 3 = Emergency)
    pub fn severity(state: MarketState) -> u8 {
        match state {
            MarketState::Safe => 0,
            MarketState::Restricted => 1,
            MarketState::Defensive => 2,
            MarketState::Emergency => 3,
        }
    }

    /// Verifies if a proposed transition is legal.
    /// Fast tightening may jump to higher severity.
    /// Recovery must strictly step one level at a time.
    /// EMERGENCY -> SAFE is strictly prohibited.
    pub fn is_legal_transition(from: MarketState, to: MarketState) -> bool {
        let from_sev = Self::severity(from);
        let to_sev = Self::severity(to);

        if to_sev > from_sev {
            // Deterioration can move to any higher severity
            true
        } else if to_sev == from_sev {
            // No-op transition is legal
            true
        } else {
            // Recovery: can only step up exactly 1 severity tier (e.g. 3 -> 2, 2 -> 1, 1 -> 0)
            from_sev.saturating_sub(to_sev) == 1
        }
    }
}
