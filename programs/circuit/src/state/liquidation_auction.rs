use anchor_lang::prelude::*;

/// Liquidation Auction PDA - one per active auction for a position.
///
/// Seeds: ["auction", position.key().as_ref()]
///
/// Tracks the opening of a continuous Dutch auction when a position becomes
/// unhealthy (HF < minimum). The auction enables continuous price discovery,
/// ramping the liquidation bonus linearly from min_bonus_bps to max_bonus_bps
/// over AUCTION_DURATION_SLOTS, eliminating the latency MEV race.
#[account]
#[derive(InitSpace)]
pub struct LiquidationAuction {
    /// The position PDA being liquidated
    pub position: Pubkey,

    /// The slot at which the liquidation auction was initiated
    pub start_slot: u64,

    /// Oracle price at auction start
    pub start_price: i64,

    /// Exponent for start_price
    pub start_expo: i32,

    /// Debt amount at auction start (in quote token units)
    pub initial_debt: u64,

    /// Caller/crank that initialized the auction (receives rent refund upon resolution)
    pub initiator: Pubkey,

    /// PDA bump seed
    pub bump: u8,
}

impl LiquidationAuction {
    pub const SEEDS_PREFIX: &'static [u8] = b"auction";
}
