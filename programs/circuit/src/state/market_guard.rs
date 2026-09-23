use anchor_lang::prelude::*;
use super::enums::{MarketState, GuardReason, HaltState};

/// Cached market guard state - one PDA per Pyth feed.
///
/// Seeds: ["guard", pyth_feed_id]
///
/// Updated by the permissionless `refresh_guard` instruction.
/// Stores observability state, per-security halt inference, and the last-valid oracle snapshot.
///
/// SECURITY: This cached state provides live observability, UI control plane metrics,
/// and per-security halt status for downstream protocol integration.
#[account]
#[derive(InitSpace)]
pub struct MarketGuard {
    /// The Pyth feed ID this guard monitors
    pub feed_id: [u8; 32],

    /// Last validated oracle price (stored only after successful validation).
    /// Used as emergency liquidation reference when current oracle is invalid.
    /// INVARIANT: Only updated when oracle validation fully succeeds.
    pub last_valid_price: i64,

    /// Exponent for last_valid_price (e.g., -8 means price * 10^-8)
    pub last_valid_expo: i32,

    /// Unix timestamp of the last valid oracle publish time
    pub last_publish_time: i64,

    /// Current derived market state
    pub market_state: MarketState,

    /// Reason for the current market state
    pub reason: GuardReason,

    /// Solana slot at which guard was last checked/updated
    pub last_checked_slot: u64,

    /// Per-security halt state: OpenNormal, Closed, or HaltedInferred
    pub halt_state: HaltState,

    /// Observed feed staleness in seconds relative to current on-chain clock
    pub feed_staleness_seconds: u64,

    /// Whether the reference market session is expected to be active
    pub session_expected_open: bool,

    /// Whether broader oracle feeds are healthy (distinguishes halt from oracle outage)
    pub global_oracle_healthy: bool,

    /// PDA bump seed
    pub bump: u8,
}

impl MarketGuard {
    pub const SEEDS_PREFIX: &'static [u8] = b"guard";
}
