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

    /// Consecutive healthy crank observations at the current recovery tier
    pub consecutive_healthy_observations: u32,

    /// Solana slot at which the most recent risk breach occurred
    pub last_stress_slot: u64,

    /// Solana slot at which ratchet was last updated
    pub last_updated_slot: u64,

    /// PDA bump seed
    pub bump: u8,
}

impl RiskRatchet {
    pub const SEEDS_PREFIX: &'static [u8] = b"ratchet";

    /// Number of consecutive healthy crank observations required to step up one state
    pub const REQUIRED_RECOVERY_OBSERVATIONS: u32 = 5;
}
