use anchor_lang::prelude::*;

// --------------------------------------------------------------
// MarketState - derived from oracle + session + custody + liquidity
// --------------------------------------------------------------

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum MarketState {
    /// All conditions nominal - borrowing enabled
    Safe,
    /// One or more conditions degraded - borrowing blocked
    Restricted,
    /// Elevated market stress - borrowing blocked, withdrawals restricted
    Defensive,
    /// Critical condition - borrowing blocked, emergency liquidation rules apply
    Emergency,
}

impl Default for MarketState {
    fn default() -> Self {
        MarketState::Emergency // conservative default
    }
}

// --------------------------------------------------------------
// CustodyState - admin-controlled simulation input for MVP
// --------------------------------------------------------------

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum CustodyState {
    /// Custody provider operating normally
    Healthy,
    /// Minor delays or degraded service
    Delayed,
    /// Significant custody issues - triggers Emergency
    Impaired,
}

impl Default for CustodyState {
    fn default() -> Self {
        CustodyState::Healthy
    }
}

// --------------------------------------------------------------
// LiquidityState - admin-controlled simulation input for MVP
// --------------------------------------------------------------

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum LiquidityState {
    /// Deep liquidity available
    Deep,
    /// Normal liquidity levels
    Normal,
    /// Thin liquidity - triggers Restricted
    Thin,
    /// Critical liquidity shortage - triggers Emergency
    Critical,
}

impl Default for LiquidityState {
    fn default() -> Self {
        LiquidityState::Deep
    }
}

// --------------------------------------------------------------
// PositionState - tracks individual position health
// --------------------------------------------------------------

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum PositionState {
    /// Position health factor is above minimum
    Healthy,
    /// Position health factor is below minimum - eligible for liquidation
    Liquidatable,
}

impl Default for PositionState {
    fn default() -> Self {
        PositionState::Healthy
    }
}

// --------------------------------------------------------------
// GuardReason - explains why the MarketGuard is in its current state
// --------------------------------------------------------------

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum GuardReason {
    /// All checks passed
    Ok,
    /// Oracle price is stale (exceeds max age)
    StaleOracle,
    /// Oracle confidence interval is too wide
    ConfidenceTooWide,
    /// Reference market (NYSE) is closed
    MarketClosed,
    /// Oracle price is zero, negative, or otherwise invalid
    InvalidPrice,
    /// Custody provider is impaired
    CustodyImpaired,
    /// Liquidity is critically low
    LiquidityCritical,
    /// Liquidity is thin
    LiquidityThin,
    /// Risk ratchet is in defensive mode due to elevated volatility
    RatchetDefensive,
    /// Risk ratchet requires consecutive healthy observations before recovery
    RatchetRecoveryPending,
}

impl Default for GuardReason {
    fn default() -> Self {
        GuardReason::Ok
    }
}
