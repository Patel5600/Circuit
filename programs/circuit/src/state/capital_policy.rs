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

    /// Maximum LTV cap in BPS (e.g. 7000 = 70%)
    pub ltv_max_bps: u64,

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
    pub const BPS_SCALE: u64 = 10_000;

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
                ltv_max_bps: base_ltv_bps,
                effective_ltv_bps: base_ltv_bps,
                borrow_allowed: true,
                withdraw_allowed: true,
                repay_allowed: true,
                deposit_allowed: true,
                liquidation_allowed: false,
                risk_epoch,
                updated_at: unix_timestamp,
            },
            MarketState::Restricted => {
                let eff = base_ltv_bps.saturating_sub(1_000);
                Self {
                    risk_state,
                    ltv_max_bps: eff,
                    effective_ltv_bps: eff,
                    borrow_allowed: false, // New borrow blocked to prevent gap risk
                    withdraw_allowed: !has_debt, // Withdraw allowed only if zero debt is outstanding
                    repay_allowed: true,
                    deposit_allowed: true,
                    liquidation_allowed: false,
                    risk_epoch,
                    updated_at: unix_timestamp,
                }
            },
            MarketState::Defensive => {
                let eff = base_ltv_bps.saturating_sub(2_000);
                Self {
                    risk_state,
                    ltv_max_bps: eff,
                    effective_ltv_bps: eff,
                    borrow_allowed: false,
                    withdraw_allowed: !has_debt, // Strict block if any debt exists
                    repay_allowed: true,
                    deposit_allowed: true,
                    liquidation_allowed: false,
                    risk_epoch,
                    updated_at: unix_timestamp,
                }
            },
            MarketState::Emergency => Self {
                risk_state,
                ltv_max_bps: 0,
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

    /// Calculate the maximum borrowing capacity for a given collateral value:
    /// BorrowCapacity = floor(C * LTV_effective / 10,000)
    pub fn calculate_borrow_capacity(collateral_value: u64, effective_ltv_bps: u64) -> u64 {
        ((collateral_value as u128) * (effective_ltv_bps as u128) / (Self::BPS_SCALE as u128)) as u64
    }

    /// Calculate available borrow capacity after accounting for existing debt:
    /// AvailableBorrow = max(0, BorrowCapacity - D)
    pub fn calculate_available_borrow(collateral_value: u64, effective_ltv_bps: u64, current_debt: u64) -> u64 {
        let capacity = Self::calculate_borrow_capacity(collateral_value, effective_ltv_bps);
        capacity.saturating_sub(current_debt)
    }

    /// Calculate the minimum required collateral to support outstanding debt:
    /// C_required = ceil(D * BPS_SCALE / LTV_effective)
    /// Rounding toward safety is mandatory: never round down required collateral.
    pub fn calculate_required_collateral(debt: u64, effective_ltv_bps: u64) -> Result<u64> {
        if debt == 0 {
            return Ok(0);
        }
        require!(effective_ltv_bps > 0, crate::errors::CircuitError::MathOverflow);
        let num = (debt as u128)
            .checked_mul(Self::BPS_SCALE as u128)
            .ok_or(crate::errors::CircuitError::MathOverflow)?;
        let den = effective_ltv_bps as u128;
        // Ceiling division: (num + den - 1) / den
        let req = num
            .checked_add(den - 1)
            .ok_or(crate::errors::CircuitError::MathOverflow)? / den;
        require!(req <= u64::MAX as u128, crate::errors::CircuitError::MathOverflow);
        Ok(req as u64)
    }

    /// Calculate maximum withdrawable collateral:
    /// WithdrawCapacity = max(0, C - C_required)
    pub fn calculate_withdraw_capacity(collateral_value: u64, required_collateral_value: u64) -> u64 {
        collateral_value.saturating_sub(required_collateral_value)
    }
}
