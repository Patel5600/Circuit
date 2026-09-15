use anchor_lang::prelude::*;
use super::enums::MarketState;

/// Authoritative On-Chain Capital Policy representation.
///
/// Derives granular, protocol-enforced capital permissions directly from
/// the current risk state (Safe, Restricted, Defensive, Emergency).
///
/// CRITICAL INVARIANT:
/// "The Rust program is authoritative. The frontend cannot supply or override
/// risk state, effective LTV, or permissions."
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub struct CapitalPolicy {
    /// Current risk ratchet state
    pub risk_state: MarketState,

    /// Effective loan-to-value cap in BPS (e.g., 7000 = 70%)
    pub effective_ltv_bps: u64,

    /// Whether new credit creation (borrowing) is permitted
    pub borrow_allowed: bool,

    /// Whether collateral withdrawal is permitted
    pub withdraw_allowed: bool,

    /// Whether outstanding debt repayment is permitted (always true to prevent fund hostage)
    pub repay_allowed: bool,

    /// Whether additional collateral deposit is permitted (always true: risk-reducing)
    pub deposit_allowed: bool,

    /// Whether liquidation / recovery execution is active for unhealthy positions
    pub liquidation_allowed: bool,

    /// Monotonically increasing epoch tracking risk breaches / parameter adjustments
    pub risk_epoch: u64,

    /// Unix timestamp of policy derivation
    pub updated_at: i64,
}

impl CapitalPolicy {
    /// Derive the authoritative CapitalPolicy from the on-chain risk state and base parameters.
    pub fn from_risk_state(
        risk_state: MarketState,
        base_ltv_bps: u64,
        has_debt: bool,
        risk_epoch: u64,
        unix_timestamp: i64,
    ) -> Self {
        match risk_state {
            MarketState::Safe => Self {
                risk_state,
                effective_ltv_bps: base_ltv_bps,
                borrow_allowed: true,
                withdraw_allowed: true,
                repay_allowed: true,
                deposit_allowed: true,
                liquidation_allowed: false,
                risk_epoch,
                updated_at: unix_timestamp,
            },
            MarketState::Restricted => Self {
                risk_state,
                // In Restricted state, effective LTV is constrained (haircut of 1000 BPS / 10%)
                effective_ltv_bps: base_ltv_bps.saturating_sub(1_000),
                borrow_allowed: false, // New borrow blocked to prevent gap risk
                withdraw_allowed: !has_debt, // Withdraw allowed only if zero debt is outstanding
                repay_allowed: true,
                deposit_allowed: true,
                liquidation_allowed: false,
                risk_epoch,
                updated_at: unix_timestamp,
            },
            MarketState::Defensive => Self {
                risk_state,
                // In Defensive state, effective LTV is further haircut (2000 BPS / 20%)
                effective_ltv_bps: base_ltv_bps.saturating_sub(2_000),
                borrow_allowed: false,
                withdraw_allowed: !has_debt, // Strict block if any debt exists
                repay_allowed: true,
                deposit_allowed: true,
                liquidation_allowed: false,
                risk_epoch,
                updated_at: unix_timestamp,
            },
            MarketState::Emergency => Self {
                risk_state,
                effective_ltv_bps: 0, // Zero borrowing capacity in emergency
                borrow_allowed: false,
                withdraw_allowed: !has_debt, // Strict block if debt exists
                repay_allowed: true,
                deposit_allowed: true,
                liquidation_allowed: true, // Liquidation recovery active
                risk_epoch,
                updated_at: unix_timestamp,
            },
        }
    }
}
