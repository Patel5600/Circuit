use anchor_lang::prelude::*;

// --------------------------------------------------------------
// HaltState - per-security market halt state detection
// --------------------------------------------------------------

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace, Default)]
pub enum HaltState {
    /// Reference market session is expected open and the asset's validated feed is fresh
    #[default]
    OpenNormal,
    /// Reference market session is closed according to deterministic calendar logic
    Closed,
    /// Reference market session is expected active, but this security's feed is stale while broader oracle is healthy
    HaltedInferred,
}

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
    /// Inferred security-level halt: feed is stale during expected active session while oracle is healthy
    SecurityHaltInferred,
    /// Global oracle failure or broader data-service degradation detected
    OracleUnavailable,
}

impl Default for GuardReason {
    fn default() -> Self {
        GuardReason::Ok
    }
}

// --------------------------------------------------------------
// AuctionStatus - tracks lifecycle of a liquidation Dutch auction
// --------------------------------------------------------------

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum AuctionStatus {
    /// Auction is active and accepting settlement bids
    Active,
    /// Auction has been settled
    Settled,
    /// Auction has expired (reached floor price without settlement)
    Expired,
    /// Position was healed and auction cancelled
    Cancelled,
}

impl Default for AuctionStatus {
    fn default() -> Self {
        AuctionStatus::Active
    }
}

// --------------------------------------------------------------
// AgentAction - canonical action types an autonomous strategy may propose
// --------------------------------------------------------------

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum AgentAction {
    Deposit,
    Borrow,
    Repay,
    Withdraw,
}

impl Default for AgentAction {
    fn default() -> Self {
        AgentAction::Deposit
    }
}

// --------------------------------------------------------------
// PermissionDenialReason - machine-readable reasons for action authorization or denial
// --------------------------------------------------------------

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum PermissionDenialReason {
    /// Action is authorized
    Ok,
    /// Protocol is globally paused
    ProtocolPaused,
    /// Asset collateral is disabled
    AssetDisabled,
    /// Risk Ratchet is in Restricted state
    RiskRestricted,
    /// Risk Ratchet is in Defensive state
    RiskDefensive,
    /// Risk Ratchet is in Emergency state
    RiskEmergency,
    /// Capital Policy prohibits borrowing in this risk state
    BorrowNotPermitted,
    /// Capital Policy prohibits collateral withdrawal with outstanding debt
    WithdrawNotPermitted,
    /// Agent delegation authority has expired
    AgentAuthorityExpired,
    /// Action flag is not granted in the agent's delegation bitmask
    AgentActionNotPermitted,
    /// Borrow exceeds agent authority limit
    AgentBorrowLimitExceeded,
    /// Withdrawal exceeds agent authority limit
    AgentWithdrawLimitExceeded,
    /// Action risk cost C(a) exceeds agent's remaining risk budget B_t
    InsufficientRiskBudget,
    /// Resulting health factor would fall below protocol threshold
    HealthFactorTooLow,
    /// Proposed borrow exceeds effective LTV capacity
    EffectiveLtvExceeded,
    /// Reference market (NYSE) is currently closed
    MarketClosed,
    /// Pyth oracle confidence interval is too wide
    ConfidenceTooWide,
    /// Pyth oracle price is stale or unverified
    OracleUnsafe,
    /// Security is in an inferred halt state (stale feed during expected active trading session)
    SecurityHaltInferred,
    /// Oracle is unavailable or broader oracle failure detected
    OracleUnavailable,
}

impl Default for PermissionDenialReason {
    fn default() -> Self {
        PermissionDenialReason::Ok
    }
}

