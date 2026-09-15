use anchor_lang::prelude::*;
use super::enums::{MarketState, AuctionStatus};

/// Liquidation Auction PDA - one per active auction for a position.
///
/// Seeds: ["auction", position.key().as_ref()]
///
/// Bounded continuous Dutch auction recovery engine.
/// Ramps discount linearly from floor discount to max discount over duration.
#[account]
#[derive(InitSpace)]
pub struct LiquidationAuction {
    /// The position PDA being liquidated
    pub position: Pubkey,

    /// The slot at which the liquidation auction was initiated
    pub start_slot: u64,

    /// Starting price of the Dutch auction P_start = P_ref * (1 - D_start)
    pub start_price: i64,

    /// Exponent for start_price
    pub start_expo: i32,

    /// Debt amount at auction start (in quote token units)
    pub initial_debt: u64,

    /// Caller/crank that initialized the auction (receives rent refund upon resolution)
    pub initiator: Pubkey,

    /// PDA bump seed
    pub bump: u8,

    /// Monotonic auction sequence ID
    pub auction_id: u64,

    /// Collateral token mint being auctioned
    pub collateral_mint: Pubkey,

    /// Collateral amount in the auction
    pub collateral_amount: u64,

    /// Validated reference oracle price at auction start
    pub reference_price: i64,

    /// Reference price exponent (e.g., -8)
    pub reference_expo: i32,

    /// Floor price of the Dutch auction P_floor = P_ref * (1 - D_max)
    pub floor_price: i64,

    /// Solana slot at auction conclusion
    pub end_slot: u64,

    /// Start unix timestamp
    pub start_time: i64,

    /// End unix timestamp
    pub end_time: i64,

    /// Risk state at the moment auction opened
    pub risk_state_at_start: MarketState,

    /// Monotonic risk epoch at auction start
    pub risk_epoch: u64,

    /// Current lifecycle status (Active, Settled, Expired, Cancelled)
    pub status: AuctionStatus,

    /// Settled collateral amount so far
    pub settled_amount: u64,

    /// Total debt repaid so far
    pub debt_repaid: u64,
}

impl LiquidationAuction {
    pub const SEEDS_PREFIX: &'static [u8] = b"auction";
}
