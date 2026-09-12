use anchor_lang::prelude::*;
use super::enums::PositionState;

/// User collateral position - one PDA per (owner, asset) pair.
///
/// Seeds: ["position", owner.key(), asset_mint.key()]
///
/// Tracks deposited collateral, outstanding debt, and the last
/// validated oracle snapshot for emergency liquidation reference.
#[account]
#[derive(InitSpace)]
pub struct Position {
    /// The wallet that owns this position
    pub owner: Pubkey,

    /// The equity token mint this position is collateralized with
    pub asset: Pubkey,

    /// Amount of equity tokens deposited as collateral (in token native units)
    pub collateral_amount: u64,

    /// Amount of quote tokens borrowed (in quote token native units)
    pub debt_amount: u64,

    /// Last validated oracle price snapshot.
    /// Updated only after successful oracle validation during borrow/withdraw.
    /// Used as emergency liquidation reference when current oracle is invalid.
    pub last_valid_price: i64,

    /// Exponent for last_valid_price
    pub last_valid_expo: i32,

    /// Current position health state
    pub state: PositionState,

    /// PDA bump seed
    pub bump: u8,
}

impl Position {
    pub const SEEDS_PREFIX: &'static [u8] = b"position";

    /// Returns true if this position has outstanding debt
    pub fn has_debt(&self) -> bool {
        self.debt_amount > 0
    }

    /// Returns true if this position has any collateral deposited
    pub fn has_collateral(&self) -> bool {
        self.collateral_amount > 0
    }
}
