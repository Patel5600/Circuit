use anchor_lang::prelude::*;
use super::enums::{MarketState, GuardReason};

/// Cached market guard state - one PDA per Pyth feed.
///
/// Seeds: ["guard", pyth_feed_id]
///
/// Updated by the permissionless `refresh_guard` instruction.
/// Stores observability state and the last-valid oracle snapshot.
///
/// SECURITY: This cached state is for observability/UI only.
/// borrow/withdraw instructions MUST independently re-validate
/// oracle and market conditions. Do not trust this as sole authorization.
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

    /// PDA bump seed
    pub bump: u8,
}

impl MarketGuard {
    pub const SEEDS_PREFIX: &'static [u8] = b"guard";
}
