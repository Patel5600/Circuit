use anchor_lang::prelude::*;
use crate::state::enums::MarketState;
use crate::state::capital_policy::CapitalPolicy;

pub const CANONICAL_POLICY_VERSION: u16 = 1;

/// Capital Policy Engine:
/// Maps the canonical on-chain Risk State and Risk Score into authoritative capital permissions.
pub struct CapitalPolicyEngine;

impl CapitalPolicyEngine {
    pub const CONCENTRATION_THRESHOLD_BPS: u64 = CapitalPolicy::CONCENTRATION_THRESHOLD_BPS; // 40%
    pub const CONCENTRATION_SLOPE_BPS: u64 = CapitalPolicy::CONCENTRATION_SLOPE_BPS;         // 36 bps per 100 bps excess
    pub const MIN_LTV_FLOOR_BPS: u64 = CapitalPolicy::MIN_LTV_FLOOR_BPS;                     // 30% floor

    /// Derive the authoritative CapitalPolicy from the on-chain risk state and base parameters.
    pub fn derive_policy(
        risk_state: MarketState,
        base_ltv_bps: u64,
        has_debt: bool,
        risk_epoch: u64,
        unix_timestamp: i64,
    ) -> CapitalPolicy {
        CapitalPolicy::from_risk_state(
            risk_state,
            base_ltv_bps,
            has_debt,
            risk_epoch,
            unix_timestamp,
        )
    }

    /// Derive the authoritative CapitalPolicy including dynamic concentration penalty when C_max > 40%.
    pub fn derive_policy_with_concentration(
        risk_state: MarketState,
        base_ltv_bps: u64,
        concentration_bps: u64,
        has_debt: bool,
        risk_epoch: u64,
        unix_timestamp: i64,
    ) -> Result<CapitalPolicy> {
        let mut policy = CapitalPolicy::from_risk_state(
            risk_state,
            base_ltv_bps,
            has_debt,
            risk_epoch,
            unix_timestamp,
        );
        if concentration_bps > Self::CONCENTRATION_THRESHOLD_BPS && policy.effective_ltv_bps > 0 {
            policy.apply_concentration_penalty(concentration_bps)?;
        }
        Ok(policy)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_concentration_penalty_under_or_at_40_pct_applies_zero_haircut() {
        // C_max = 30% (3,000 BPS) <= 40% (4,000 BPS)
        let policy_30 = CapitalPolicyEngine::derive_policy_with_concentration(
            MarketState::Safe,
            7_000,
            3_000,
            false,
            1,
            1000,
        ).unwrap();
        assert_eq!(policy_30.effective_ltv_bps, 7_000, "Effective LTV must remain base 70% when C_max <= 40%");

        // C_max = 40% (4,000 BPS) exactly
        let policy_40 = CapitalPolicyEngine::derive_policy_with_concentration(
            MarketState::Safe,
            7_000,
            4_000,
            false,
            1,
            1000,
        ).unwrap();
        assert_eq!(policy_40.effective_ltv_bps, 7_000, "Effective LTV must remain base 70% at 40% boundary");
    }

    #[test]
    fn test_concentration_penalty_50_50_portfolio() {
        // 50/50 dual collateral portfolio: C_max = 50% (5,000 BPS)
        // excess = 1,000 BPS. penalty = 1,000 * 3,600 / 10,000 = 360 BPS.
        // Effective LTV = 7,000 - 360 = 6,640 BPS (66.4%)
        let policy = CapitalPolicyEngine::derive_policy_with_concentration(
            MarketState::Safe,
            7_000,
            5_000,
            false,
            1,
            1000,
        ).unwrap();
        assert_eq!(policy.effective_ltv_bps, 6_640);
    }

    #[test]
    fn test_concentration_penalty_90_10_concentrated_portfolio() {
        // 90/10 concentrated portfolio: C_max = 90% (9,000 BPS)
        // excess = 5,000 BPS. penalty = 5,000 * 3,600 / 10,000 = 1,800 BPS.
        // Effective LTV = 7,000 - 1,800 = 5,200 BPS (52.0%)
        let policy = CapitalPolicyEngine::derive_policy_with_concentration(
            MarketState::Safe,
            7_000,
            9_000,
            false,
            1,
            1000,
        ).unwrap();
        assert_eq!(policy.effective_ltv_bps, 5_200);
    }

    #[test]
    fn test_concentration_penalty_respects_30_pct_safety_floor() {
        // 100% concentrated portfolio (10,000 BPS) with high penalty on a lower base LTV (e.g. 5,000 BPS)
        // excess = 6,000 BPS. penalty = 6,000 * 3,600 / 10,000 = 2,160 BPS.
        // 5,000 - 2,160 = 2,840 BPS < MIN_LTV_FLOOR_BPS (3,000 BPS).
        // Must be clamped to 3,000 BPS!
        let policy = CapitalPolicyEngine::derive_policy_with_concentration(
            MarketState::Safe,
            5_000,
            10_000,
            false,
            1,
            1000,
        ).unwrap();
        assert_eq!(policy.effective_ltv_bps, 3_000, "Must be clamped to 30% safety floor");
    }

    #[test]
    fn test_concentration_in_emergency_remains_zero_effective_ltv() {
        let policy = CapitalPolicyEngine::derive_policy_with_concentration(
            MarketState::Emergency,
            7_000,
            8_000,
            false,
            1,
            1000,
        ).unwrap();
        assert_eq!(policy.effective_ltv_bps, 0, "Emergency state must maintain 0 effective LTV regardless of concentration");
    }
}
