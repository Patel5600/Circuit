use anchor_lang::prelude::*;
use crate::state::enums::MarketState;
use crate::state::capital_policy::CapitalPolicy;

pub const CANONICAL_POLICY_VERSION: u16 = 1;

/// Capital Policy Engine:
/// Maps the canonical on-chain Risk State and Risk Score into authoritative capital permissions.
pub struct CapitalPolicyEngine;

impl CapitalPolicyEngine {
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
}
