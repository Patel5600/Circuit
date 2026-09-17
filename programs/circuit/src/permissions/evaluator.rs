use anchor_lang::prelude::*;
use crate::state::enums::{MarketState, PermissionDenialReason};
use crate::state::capital_policy::CapitalPolicy;
use crate::state::agent_authority::AgentAuthority;
use crate::permissions::actions::CircuitAction;
use crate::permissions::denial::PermissionResult;
use crate::risk::policy::CANONICAL_POLICY_VERSION;

/// The ONE canonical Permission Engine.
///
/// Authoritative rule:
/// EffectiveAuthority = OwnerAuthority ∩ AgentAuthority ∩ RiskAuthority ∩ PositionConstraints ∩ ActionConstraints
///
/// Humans and Autonomous Agents are different authorities, NOT different risk systems.
/// Both paths pass through this exact function.
pub fn evaluate_permission(
    actor: &Pubkey,
    action: CircuitAction,
    asset_mint: &Pubkey,
    amount: u64,
    position_owner: &Pubkey,
    position_has_debt: bool,
    collateral_value: u128,
    current_debt: u64,
    policy: &CapitalPolicy,
    authority: Option<&AgentAuthority>,
    current_timestamp: i64,
) -> Result<PermissionResult> {
    let policy_version = CANONICAL_POLICY_VERSION;

    // ── 1. GLOBAL PROTOCOL RISK GATES (Applies equally to Human and Agent) ──
    match action {
        CircuitAction::Borrow => {
            if !policy.borrow_allowed {
                let reason = match policy.risk_state {
                    MarketState::Emergency => PermissionDenialReason::RiskEmergency,
                    MarketState::Defensive => PermissionDenialReason::RiskDefensive,
                    MarketState::Restricted => PermissionDenialReason::RiskRestricted,
                    _ => PermissionDenialReason::BorrowNotPermitted,
                };
                return Ok(PermissionResult::deny(reason, policy_version));
            }
        },
        CircuitAction::Withdraw => {
            // Withdrawal with debt is strictly blocked in degraded risk states
            if position_has_debt && !policy.withdraw_allowed {
                let reason = match policy.risk_state {
                    MarketState::Emergency => PermissionDenialReason::RiskEmergency,
                    MarketState::Defensive => PermissionDenialReason::RiskDefensive,
                    _ => PermissionDenialReason::WithdrawNotPermitted,
                };
                return Ok(PermissionResult::deny(reason, policy_version));
            }
        },
        // ── Meteora DBC / Liquidity Execution Surface (Section 15 Risk Matrix) ──
        CircuitAction::EnterLiquidity | CircuitAction::Swap | CircuitAction::Rebalance => {
            if policy.risk_state == MarketState::Emergency {
                return Ok(PermissionResult::deny(PermissionDenialReason::RiskEmergency, policy_version));
            }
            if policy.risk_state == MarketState::Defensive {
                return Ok(PermissionResult::deny(PermissionDenialReason::RiskDefensive, policy_version));
            }
        },
        CircuitAction::Deposit | CircuitAction::Repay | CircuitAction::Liquidate | CircuitAction::ExitLiquidity => {
            // Risk-reducing capital & recovery actions are ALWAYS permitted by protocol risk policy
        },
    }

    // ── 2. POSITION CONSTRAINTS (Capacity & LTV) ──
    if action == CircuitAction::Borrow {
        let max_borrow = CapitalPolicy::calculate_borrow_capacity(collateral_value as u64, policy.effective_ltv_bps) as u128;
        let new_debt = (current_debt as u128).saturating_add(amount as u128);
        if new_debt > max_borrow {
            return Ok(PermissionResult::deny(PermissionDenialReason::EffectiveLtvExceeded, policy_version));
        }
    }

    // ── 3. AUTHORITY CONSTRAINTS (Human vs Delegated Agent) ──
    let is_owner = actor == position_owner;

    if is_owner {
        // Human Sovereign path: bounded by global protocol policy and capacity
        let limit = match action {
            CircuitAction::Borrow => {
                let max_borrow = CapitalPolicy::calculate_borrow_capacity(collateral_value as u64, policy.effective_ltv_bps);
                max_borrow.saturating_sub(current_debt)
            },
            CircuitAction::Withdraw => {
                let req_collateral = if current_debt > 0 && policy.effective_ltv_bps > 0 {
                    CapitalPolicy::calculate_required_collateral(current_debt, policy.effective_ltv_bps)?
                } else {
                    0
                };
                (collateral_value as u64).saturating_sub(req_collateral)
            },
            CircuitAction::Swap | CircuitAction::EnterLiquidity | CircuitAction::Rebalance => {
                // In Restricted state, liquidity/swap volume is capped to 50%
                let base_cap = collateral_value as u64;
                if policy.risk_state == MarketState::Restricted {
                    base_cap / 2
                } else {
                    base_cap
                }
            },
            _ => u64::MAX,
        };

        if amount > limit {
            let reason = match action {
                CircuitAction::Borrow => PermissionDenialReason::EffectiveLtvExceeded,
                CircuitAction::Withdraw => PermissionDenialReason::WithdrawNotPermitted,
                CircuitAction::Swap | CircuitAction::EnterLiquidity | CircuitAction::Rebalance => {
                    if policy.risk_state == MarketState::Restricted {
                        PermissionDenialReason::RiskRestricted
                    } else {
                        PermissionDenialReason::EffectiveLtvExceeded
                    }
                },
                _ => PermissionDenialReason::BorrowNotPermitted,
            };
            return Ok(PermissionResult::deny(reason, policy_version));
        }

        Ok(PermissionResult::allow(policy_version, limit))
    } else {
        // Agent Delegated path: must intersect with AgentAuthority PDA
        let auth = match authority {
            Some(a) => a,
            None => return Ok(PermissionResult::deny(PermissionDenialReason::AgentActionNotPermitted, policy_version)),
        };

        // Validate agent identity
        if &auth.agent != actor || &auth.owner != position_owner {
            return Ok(PermissionResult::deny(PermissionDenialReason::AgentActionNotPermitted, policy_version));
        }

        // Validate multi-asset isolation: authority must match target asset
        if &auth.asset_mint != asset_mint {
            return Ok(PermissionResult::deny(PermissionDenialReason::AssetDisabled, policy_version));
        }

        // Validate active status & expiry
        if !auth.is_active(current_timestamp) {
            return Ok(PermissionResult::deny(PermissionDenialReason::AgentAuthorityExpired, policy_version));
        }

        // Validate action bitmask permission
        let action_bitmask = match action {
            CircuitAction::Deposit => crate::state::agent_authority::ACTION_DEPOSIT,
            CircuitAction::Borrow => crate::state::agent_authority::ACTION_BORROW,
            CircuitAction::Repay => crate::state::agent_authority::ACTION_REPAY,
            CircuitAction::Withdraw => crate::state::agent_authority::ACTION_WITHDRAW,
            CircuitAction::Swap => crate::state::agent_authority::ACTION_SWAP,
            CircuitAction::EnterLiquidity => crate::state::agent_authority::ACTION_ENTER_LIQUIDITY,
            CircuitAction::ExitLiquidity => crate::state::agent_authority::ACTION_EXIT_LIQUIDITY,
            CircuitAction::Rebalance => crate::state::agent_authority::ACTION_REBALANCE,
            CircuitAction::Liquidate => return Ok(PermissionResult::deny(PermissionDenialReason::AgentActionNotPermitted, policy_version)),
        };

        if !auth.is_action_allowed(action_bitmask) {
            return Ok(PermissionResult::deny(PermissionDenialReason::AgentActionNotPermitted, policy_version));
        }

        // Validate agent per-action limits & Section 15 capping
        let effective_limit = match action {
            CircuitAction::Borrow => {
                let remaining_agent_borrow = auth.max_borrow_limit.saturating_sub(auth.current_borrowed);
                let protocol_capacity = CapitalPolicy::calculate_available_borrow(
                    collateral_value as u64,
                    policy.effective_ltv_bps,
                    current_debt,
                );
                remaining_agent_borrow.min(protocol_capacity)
            },
            CircuitAction::Withdraw => {
                let req_collateral = if current_debt > 0 && policy.effective_ltv_bps > 0 {
                    CapitalPolicy::calculate_required_collateral(current_debt, policy.effective_ltv_bps)?
                } else {
                    0
                };
                let protocol_withdraw = (collateral_value as u64).saturating_sub(req_collateral);
                auth.max_withdraw_limit.min(protocol_withdraw)
            },
            CircuitAction::Swap | CircuitAction::EnterLiquidity | CircuitAction::Rebalance => {
                let base_limit = auth.max_borrow_limit; // Uses authorized transaction volume cap
                if policy.risk_state == MarketState::Restricted {
                    base_limit / 2 // Section 15: Capped in Restricted state
                } else {
                    base_limit
                }
            },
            _ => u64::MAX,
        };

        if amount > effective_limit {
            let reason = match action {
                CircuitAction::Borrow => PermissionDenialReason::AgentBorrowLimitExceeded,
                CircuitAction::Withdraw => PermissionDenialReason::AgentWithdrawLimitExceeded,
                CircuitAction::Swap | CircuitAction::EnterLiquidity | CircuitAction::Rebalance => {
                    if policy.risk_state == MarketState::Restricted {
                        PermissionDenialReason::RiskRestricted
                    } else {
                        PermissionDenialReason::AgentBorrowLimitExceeded
                    }
                },
                _ => PermissionDenialReason::AgentActionNotPermitted,
            };
            return Ok(PermissionResult::deny(reason, policy_version));
        }

        // Validate remaining risk budget for risk-increasing operations
        if auth.risk_budget == 0 && action.is_risk_increasing() {
            return Ok(PermissionResult::deny(PermissionDenialReason::InsufficientRiskBudget, policy_version));
        }

        Ok(PermissionResult::allow(policy_version, effective_limit))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::risk::policy::CapitalPolicyEngine;

    fn test_pubkey(n: u8) -> Pubkey {
        Pubkey::new_from_array([n; 32])
    }

    fn test_policy(risk_state: MarketState, has_debt: bool) -> CapitalPolicy {
        CapitalPolicyEngine::derive_policy(risk_state, 7_000, has_debt, 1, 1000)
    }

    fn test_authority(owner: Pubkey, agent: Pubkey, asset_mint: Pubkey) -> AgentAuthority {
        AgentAuthority {
            owner,
            agent,
            asset_mint,
            allowed_actions: 0x0F, // Deposit, Borrow, Repay, Withdraw
            max_borrow_limit: 1_000,
            max_withdraw_limit: 500,
            current_borrowed: 200,
            risk_budget: 5_000,
            initial_risk_budget: 5_000,
            expiry_ts: 999_999_999,
            nonce: 0,
            bump: 255,
        }
    }

    #[test]
    fn test_defensive_state_rejects_both_human_and_agent_borrow() {
        let owner = test_pubkey(1);
        let agent = test_pubkey(2);
        let mint = test_pubkey(3);
        let policy = test_policy(MarketState::Defensive, false);
        let auth = test_authority(owner, agent, mint);

        // Human borrow in Defensive -> REJECT
        let human_res = evaluate_permission(
            &owner,
            CircuitAction::Borrow,
            &mint,
            100,
            &owner,
            false,
            10_000,
            0,
            &policy,
            None,
            0,
        ).unwrap();
        assert!(!human_res.allowed);
        assert_eq!(human_res.denial_reason, PermissionDenialReason::RiskDefensive);

        // Agent borrow in Defensive -> REJECT with SAME reason code!
        let agent_res = evaluate_permission(
            &agent,
            CircuitAction::Borrow,
            &mint,
            100,
            &owner,
            false,
            10_000,
            0,
            &policy,
            Some(&auth),
            0,
        ).unwrap();
        assert!(!agent_res.allowed);
        assert_eq!(agent_res.denial_reason, PermissionDenialReason::RiskDefensive);
    }

    #[test]
    fn test_repay_is_always_allowed_in_emergency_for_both_human_and_agent() {
        let owner = test_pubkey(1);
        let agent = test_pubkey(2);
        let mint = test_pubkey(3);
        let policy = test_policy(MarketState::Emergency, true);
        let auth = test_authority(owner, agent, mint);

        let human_res = evaluate_permission(
            &owner,
            CircuitAction::Repay,
            &mint,
            500,
            &owner,
            true,
            5_000,
            1_000,
            &policy,
            None,
            0,
        ).unwrap();
        assert!(human_res.allowed);

        let agent_res = evaluate_permission(
            &agent,
            CircuitAction::Repay,
            &mint,
            500,
            &owner,
            true,
            5_000,
            1_000,
            &policy,
            Some(&auth),
            0,
        ).unwrap();
        assert!(agent_res.allowed);
    }

    #[test]
    fn test_agent_cannot_exceed_agent_borrow_limit() {
        let owner = test_pubkey(1);
        let agent = test_pubkey(2);
        let mint = test_pubkey(3);
        let policy = test_policy(MarketState::Safe, false);
        let auth = test_authority(owner, agent, mint); // max = 1000, current = 200, remaining = 800

        // Agent attempts to borrow 900 > 800 remaining
        let res = evaluate_permission(
            &agent,
            CircuitAction::Borrow,
            &mint,
            900,
            &owner,
            false,
            100_000, // plenty of collateral
            0,
            &policy,
            Some(&auth),
            0,
        ).unwrap();
        assert!(!res.allowed);
        assert_eq!(res.denial_reason, PermissionDenialReason::AgentBorrowLimitExceeded);
    }

    #[test]
    fn test_multi_asset_isolation_rejects_wrong_asset_mint() {
        let owner = test_pubkey(1);
        let agent = test_pubkey(2);
        let nvda_mint = test_pubkey(3);
        let aapl_mint = test_pubkey(4);
        let policy = test_policy(MarketState::Safe, false);
        let auth = test_authority(owner, agent, nvda_mint); // Scoped to NVDA

        // Agent attempts to borrow on AAPL
        let res = evaluate_permission(
            &agent,
            CircuitAction::Borrow,
            &aapl_mint,
            100,
            &owner,
            false,
            10_000,
            0,
            &policy,
            Some(&auth),
            0,
        ).unwrap();
        assert!(!res.allowed);
        assert_eq!(res.denial_reason, PermissionDenialReason::AssetDisabled);
    }

    #[test]
    fn test_dbc_swap_matrix_safe_restricted_defensive_emergency() {
        let owner = test_pubkey(1);
        let agent = test_pubkey(2);
        let mint = test_pubkey(3);
        let mut auth = test_authority(owner, agent, mint);
        auth.allowed_actions = 0xFF; // All actions including SWAP (1 << 4)
        auth.max_borrow_limit = 1_000;

        // 1. Safe State: Swap allowed up to full limit (1,000)
        let safe_policy = test_policy(MarketState::Safe, false);
        let res_safe = evaluate_permission(
            &agent,
            CircuitAction::Swap,
            &mint,
            800,
            &owner,
            false,
            10_000,
            0,
            &safe_policy,
            Some(&auth),
            0,
        ).unwrap();
        assert!(res_safe.allowed, "Swap must be allowed in Safe state");

        // 2. Restricted State: Capped to 500 (50% of 1,000). 400 is allowed, 600 is capped!
        let restricted_policy = test_policy(MarketState::Restricted, false);
        let res_restr_ok = evaluate_permission(
            &agent,
            CircuitAction::Swap,
            &mint,
            400,
            &owner,
            false,
            10_000,
            0,
            &restricted_policy,
            Some(&auth),
            0,
        ).unwrap();
        assert!(res_restr_ok.allowed, "Swap within 50% cap must be allowed in Restricted state");

        let res_restr_blocked = evaluate_permission(
            &agent,
            CircuitAction::Swap,
            &mint,
            600,
            &owner,
            false,
            10_000,
            0,
            &restricted_policy,
            Some(&auth),
            0,
        ).unwrap();
        assert!(!res_restr_blocked.allowed, "Swap exceeding 50% cap must be blocked in Restricted state");
        assert_eq!(res_restr_blocked.denial_reason, PermissionDenialReason::RiskRestricted);

        // 3. Defensive State: Strictly blocked
        let defensive_policy = test_policy(MarketState::Defensive, false);
        let res_def = evaluate_permission(
            &agent,
            CircuitAction::Swap,
            &mint,
            100,
            &owner,
            false,
            10_000,
            0,
            &defensive_policy,
            Some(&auth),
            0,
        ).unwrap();
        assert!(!res_def.allowed, "Swap must be blocked in Defensive state");
        assert_eq!(res_def.denial_reason, PermissionDenialReason::RiskDefensive);

        // 4. Emergency State: Strictly blocked
        let emergency_policy = test_policy(MarketState::Emergency, false);
        let res_emg = evaluate_permission(
            &agent,
            CircuitAction::Swap,
            &mint,
            100,
            &owner,
            false,
            10_000,
            0,
            &emergency_policy,
            Some(&auth),
            0,
        ).unwrap();
        assert!(!res_emg.allowed, "Swap must be blocked in Emergency state");
        assert_eq!(res_emg.denial_reason, PermissionDenialReason::RiskEmergency);
    }

    #[test]
    fn test_dbc_exit_liquidity_allowed_in_emergency() {
        let owner = test_pubkey(1);
        let agent = test_pubkey(2);
        let mint = test_pubkey(3);
        let mut auth = test_authority(owner, agent, mint);
        auth.allowed_actions = 0xFF; // All actions including EXIT_LIQUIDITY

        let emergency_policy = test_policy(MarketState::Emergency, false);
        let res = evaluate_permission(
            &agent,
            CircuitAction::ExitLiquidity,
            &mint,
            500,
            &owner,
            false,
            10_000,
            0,
            &emergency_policy,
            Some(&auth),
            0,
        ).unwrap();
        assert!(res.allowed, "ExitLiquidity must be allowed in Emergency state as recovery-safe action");
    }

    #[test]
    fn test_dbc_agent_requires_swap_bitmask() {
        let owner = test_pubkey(1);
        let agent = test_pubkey(2);
        let mint = test_pubkey(3);
        let mut auth = test_authority(owner, agent, mint);
        // Allowed actions ONLY has Deposit & Repay (0x05), NO Swap (0x10)
        auth.allowed_actions = crate::state::agent_authority::ACTION_DEPOSIT | crate::state::agent_authority::ACTION_REPAY;

        let safe_policy = test_policy(MarketState::Safe, false);
        let res = evaluate_permission(
            &agent,
            CircuitAction::Swap,
            &mint,
            100,
            &owner,
            false,
            10_000,
            0,
            &safe_policy,
            Some(&auth),
            0,
        ).unwrap();
        assert!(!res.allowed, "Swap must be rejected if agent lacks ACTION_SWAP bitmask");
        assert_eq!(res.denial_reason, PermissionDenialReason::AgentActionNotPermitted);
    }

    #[test]
    fn test_dbc_agent_revocation_and_expiry() {
        let owner = test_pubkey(1);
        let agent = test_pubkey(2);
        let mint = test_pubkey(3);
        let mut auth = test_authority(owner, agent, mint);
        auth.allowed_actions = 0xFF;
        auth.expiry_ts = 1000;

        let safe_policy = test_policy(MarketState::Safe, false);

        // Attempt at timestamp 1001 > 1000 -> Expired!
        let res_expired = evaluate_permission(
            &agent,
            CircuitAction::Swap,
            &mint,
            100,
            &owner,
            false,
            10_000,
            0,
            &safe_policy,
            Some(&auth),
            1001,
        ).unwrap();
        assert!(!res_expired.allowed);
        assert_eq!(res_expired.denial_reason, PermissionDenialReason::AgentAuthorityExpired);

        // Revoke authority (allowed_actions = 0)
        auth.allowed_actions = 0;
        let res_revoked = evaluate_permission(
            &agent,
            CircuitAction::Swap,
            &mint,
            100,
            &owner,
            false,
            10_000,
            0,
            &safe_policy,
            Some(&auth),
            500,
        ).unwrap();
        assert!(!res_revoked.allowed);
        assert_eq!(res_revoked.denial_reason, PermissionDenialReason::AgentAuthorityExpired);
    }
}
