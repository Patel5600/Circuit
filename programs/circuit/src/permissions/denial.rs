use anchor_lang::prelude::*;
use crate::state::enums::PermissionDenialReason;

/// Structured permission evaluation result.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub struct PermissionResult {
    /// Whether the action is authorized
    pub allowed: bool,
    /// Machine-readable denial reason code
    pub denial_reason: PermissionDenialReason,
    /// Active policy version that evaluated this action
    pub policy_version: u16,
    /// Effective maximum allowable amount under intersected limits
    pub effective_amount_limit: u64,
}

impl PermissionResult {
    pub fn allow(policy_version: u16, effective_amount_limit: u64) -> Self {
        Self {
            allowed: true,
            denial_reason: PermissionDenialReason::Ok,
            policy_version,
            effective_amount_limit,
        }
    }

    pub fn deny(reason: PermissionDenialReason, policy_version: u16) -> Self {
        Self {
            allowed: false,
            denial_reason: reason,
            policy_version,
            effective_amount_limit: 0,
        }
    }
}
