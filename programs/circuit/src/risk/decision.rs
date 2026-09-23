use anchor_lang::prelude::*;
use crate::state::enums::{MarketState, PermissionDenialReason, HaltState, CustodyState, LiquidityState};
use crate::state::capital_policy::CapitalPolicy;
use crate::state::agent_authority::AgentAuthority;
use crate::state::risk_ratchet::RiskRatchet;
use crate::permissions::actions::CircuitAction;
use crate::permissions::evaluator::evaluate_permission;
use crate::risk::policy::{CapitalPolicyEngine, CANONICAL_POLICY_VERSION};
use crate::risk::scoring::RiskScoreBreakdown;
use crate::risk::hysteresis::RatchetHysteresisConfig;
use crate::math;

/// The ONE canonical on-chain Decision Context.
/// Holds normalized real-time state required to evaluate permissions, capital policy, and available credit.
pub struct DecisionContext<'a> {
    pub actor: &'a Pubkey,
    pub owner: &'a Pubkey,
    pub asset_mint: &'a Pubkey,

    pub action: CircuitAction,
    pub requested_amount: u64,

    pub protocol_paused: bool,
    pub asset_enabled: bool,
    pub base_ltv_bps: u64,

    pub market_open: bool,
    pub halt_state: HaltState,

    pub oracle_price: i64,
    pub oracle_expo: i32,
    pub oracle_conf: u64,
    pub oracle_age: u64,
    pub max_oracle_age: u64,
    pub oracle_healthy: bool,

    pub custody_state: CustodyState,
    pub liquidity_state: LiquidityState,

    pub ratchet_state: MarketState,
    pub risk_epoch: u64,

    pub position_has_debt: bool,
    pub collateral_value: u128,
    pub current_debt: u64,

    pub agent_authority: Option<&'a AgentAuthority>,
    pub current_timestamp: i64,
}

/// The ONE canonical on-chain Decision Result.
/// Returned by the canonical decision kernel.
#[derive(Debug, Clone)]
pub struct DecisionResult {
    pub allowed: bool,
    pub denial_reason: PermissionDenialReason,

    pub risk_state: MarketState,
    pub risk_epoch: u64,

    pub capital_policy: CapitalPolicy,

    pub collateral_value: u128,
    pub available_credit: u64,

    pub effective_ltv_bps: u64,

    pub oracle_age: u64,
    pub confidence_bps: u64,

    pub policy_version: u16,
}

/// Evaluates a financial decision using the canonical risk, policy, and permission rules.
///
/// Invariant: ONE evaluation model across ALL protocol instructions and manual/agent paths.
pub fn evaluate_decision(ctx: &DecisionContext) -> Result<DecisionResult> {
    let policy_version = CANONICAL_POLICY_VERSION;
    let canonical_epoch = ctx.risk_epoch.max(1);

    // 1. Protocol Paused Gate
    let is_risk_reducing = matches!(
        ctx.action,
        CircuitAction::Deposit | CircuitAction::Repay | CircuitAction::Liquidate | CircuitAction::ExitLiquidity
    );

    if ctx.protocol_paused && !is_risk_reducing {
        return Ok(DecisionResult {
            allowed: false,
            denial_reason: PermissionDenialReason::ProtocolPaused,
            risk_state: ctx.ratchet_state,
            risk_epoch: canonical_epoch,
            capital_policy: CapitalPolicyEngine::derive_policy(
                ctx.ratchet_state,
                ctx.base_ltv_bps,
                ctx.position_has_debt,
                canonical_epoch,
                ctx.current_timestamp,
            ),
            collateral_value: ctx.collateral_value,
            available_credit: 0,
            effective_ltv_bps: 0,
            oracle_age: ctx.oracle_age,
            confidence_bps: 0,
            policy_version,
        });
    }

    // 2. Asset Enabled Gate
    if !ctx.asset_enabled {
        return Ok(DecisionResult {
            allowed: false,
            denial_reason: PermissionDenialReason::AssetDisabled,
            risk_state: ctx.ratchet_state,
            risk_epoch: canonical_epoch,
            capital_policy: CapitalPolicyEngine::derive_policy(
                ctx.ratchet_state,
                ctx.base_ltv_bps,
                ctx.position_has_debt,
                canonical_epoch,
                ctx.current_timestamp,
            ),
            collateral_value: ctx.collateral_value,
            available_credit: 0,
            effective_ltv_bps: 0,
            oracle_age: ctx.oracle_age,
            confidence_bps: 0,
            policy_version,
        });
    }

    // 3. Oracle & Market Session Gate (for risk-increasing operations)
    if !is_risk_reducing {
        if ctx.halt_state == HaltState::OracleUnavailable || !ctx.oracle_healthy {
            return Ok(DecisionResult {
                allowed: false,
                denial_reason: PermissionDenialReason::OracleUnavailable,
                risk_state: MarketState::Emergency,
                risk_epoch: canonical_epoch,
                capital_policy: CapitalPolicyEngine::derive_policy(
                    MarketState::Emergency,
                    ctx.base_ltv_bps,
                    ctx.position_has_debt,
                    canonical_epoch,
                    ctx.current_timestamp,
                ),
                collateral_value: ctx.collateral_value,
                available_credit: 0,
                effective_ltv_bps: 0,
                oracle_age: ctx.oracle_age,
                confidence_bps: 0,
                policy_version,
            });
        }

        if ctx.halt_state == HaltState::HaltedInferred {
            return Ok(DecisionResult {
                allowed: false,
                denial_reason: PermissionDenialReason::SecurityHaltInferred,
                risk_state: MarketState::Defensive,
                risk_epoch: canonical_epoch,
                capital_policy: CapitalPolicyEngine::derive_policy(
                    MarketState::Defensive,
                    ctx.base_ltv_bps,
                    ctx.position_has_debt,
                    canonical_epoch,
                    ctx.current_timestamp,
                ),
                collateral_value: ctx.collateral_value,
                available_credit: 0,
                effective_ltv_bps: 0,
                oracle_age: ctx.oracle_age,
                confidence_bps: 0,
                policy_version,
            });
        }

        if !ctx.market_open || ctx.halt_state == HaltState::Closed {
            return Ok(DecisionResult {
                allowed: false,
                denial_reason: PermissionDenialReason::MarketClosed,
                risk_state: ctx.ratchet_state,
                risk_epoch: canonical_epoch,
                capital_policy: CapitalPolicyEngine::derive_policy(
                    ctx.ratchet_state,
                    ctx.base_ltv_bps,
                    ctx.position_has_debt,
                    canonical_epoch,
                    ctx.current_timestamp,
                ),
                collateral_value: ctx.collateral_value,
                available_credit: 0,
                effective_ltv_bps: 0,
                oracle_age: ctx.oracle_age,
                confidence_bps: 0,
                policy_version,
            });
        }
    }

    // 4. Dynamic Risk Score & Instant Risk State Calculation
    let conf_ratio_bps = math::calculate_confidence_ratio_bps(ctx.oracle_price, ctx.oracle_conf).unwrap_or(10_000);
    let breakdown = RiskScoreBreakdown::compute(
        ctx.market_open,
        conf_ratio_bps,
        ctx.oracle_age,
        ctx.max_oracle_age,
        ctx.custody_state,
        ctx.liquidity_state,
    );
    let instant_risk_state = RatchetHysteresisConfig::candidate_state_from_score(breakdown.composite_score);

    // Take the maximum severity between instant evaluation and stored ratchet state
    let mut effective_risk_state = if RiskRatchet::severity(instant_risk_state) > RiskRatchet::severity(ctx.ratchet_state) {
        instant_risk_state
    } else {
        ctx.ratchet_state
    };

    if ctx.halt_state == HaltState::HaltedInferred || ctx.halt_state == HaltState::OracleUnavailable {
        if effective_risk_state == MarketState::Safe {
            effective_risk_state = MarketState::Defensive;
        }
    }

    // 5. Authoritative Capital Policy Derivation
    let policy = CapitalPolicyEngine::derive_policy(
        effective_risk_state,
        ctx.base_ltv_bps,
        ctx.position_has_debt,
        canonical_epoch,
        ctx.current_timestamp,
    );

    // 6. Borrow Capacity & Available Credit
    let max_borrow = CapitalPolicy::calculate_borrow_capacity(ctx.collateral_value as u64, policy.effective_ltv_bps);
    let available_credit = (max_borrow as u64).saturating_sub(ctx.current_debt);

    // 7. Canonical Permission Evaluation
    let perm = evaluate_permission(
        ctx.actor,
        ctx.action,
        ctx.asset_mint,
        ctx.requested_amount,
        ctx.owner,
        ctx.position_has_debt,
        ctx.collateral_value,
        ctx.current_debt,
        &policy,
        ctx.agent_authority,
        ctx.current_timestamp,
    )?;

    Ok(DecisionResult {
        allowed: perm.allowed,
        denial_reason: perm.denial_reason,
        risk_state: effective_risk_state,
        risk_epoch: canonical_epoch,
        capital_policy: policy,
        collateral_value: ctx.collateral_value,
        available_credit,
        effective_ltv_bps: policy.effective_ltv_bps,
        oracle_age: ctx.oracle_age,
        confidence_bps: conf_ratio_bps,
        policy_version,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dummy_pubkey(byte: u8) -> Pubkey {
        Pubkey::new_from_array([byte; 32])
    }

    fn nominal_ctx<'a>(
        actor: &'a Pubkey,
        owner: &'a Pubkey,
        asset_mint: &'a Pubkey,
        action: CircuitAction,
        requested_amount: u64,
        collateral_value: u128,
        current_debt: u64,
    ) -> DecisionContext<'a> {
        DecisionContext {
            actor,
            owner,
            asset_mint,
            action,
            requested_amount,
            protocol_paused: false,
            asset_enabled: true,
            base_ltv_bps: 7_000,
            market_open: true,
            halt_state: HaltState::OpenNormal,
            oracle_price: 150_00000000,
            oracle_expo: -8,
            oracle_conf: 150000,
            oracle_age: 10,
            max_oracle_age: 60,
            oracle_healthy: true,
            custody_state: CustodyState::Healthy,
            liquidity_state: LiquidityState::Deep,
            ratchet_state: MarketState::Safe,
            risk_epoch: 5,
            position_has_debt: current_debt > 0,
            collateral_value,
            current_debt,
            agent_authority: None,
            current_timestamp: 1000,
        }
    }

    #[test]
    fn test_safe_state_allows_borrow_under_capacity() {
        let owner = dummy_pubkey(1);
        let mint = dummy_pubkey(2);
        // Collateral $1,000 -> Max borrow @ 70% LTV = $700. Requesting $200.
        let ctx = nominal_ctx(&owner, &owner, &mint, CircuitAction::Borrow, 200, 1000, 0);
        let res = evaluate_decision(&ctx).unwrap();
        assert!(res.allowed, "Borrow within capacity must be allowed in Safe state");
        assert_eq!(res.denial_reason, PermissionDenialReason::Ok);
        assert_eq!(res.risk_epoch, 5);
        assert_eq!(res.available_credit, 700);
    }

    #[test]
    fn test_protocol_paused_blocks_borrow_but_allows_deposit_and_repay() {
        let owner = dummy_pubkey(1);
        let mint = dummy_pubkey(2);

        let mut borrow_ctx = nominal_ctx(&owner, &owner, &mint, CircuitAction::Borrow, 100, 1000, 0);
        borrow_ctx.protocol_paused = true;
        let borrow_res = evaluate_decision(&borrow_ctx).unwrap();
        assert!(!borrow_res.allowed, "Borrow must be blocked when protocol is paused");
        assert_eq!(borrow_res.denial_reason, PermissionDenialReason::ProtocolPaused);

        let mut deposit_ctx = nominal_ctx(&owner, &owner, &mint, CircuitAction::Deposit, 100, 1000, 0);
        deposit_ctx.protocol_paused = true;
        let deposit_res = evaluate_decision(&deposit_ctx).unwrap();
        assert!(deposit_res.allowed, "Risk-reducing Deposit must remain allowed during pause");

        let mut repay_ctx = nominal_ctx(&owner, &owner, &mint, CircuitAction::Repay, 100, 1000, 100);
        repay_ctx.protocol_paused = true;
        let repay_res = evaluate_decision(&repay_ctx).unwrap();
        assert!(repay_res.allowed, "Risk-reducing Repay must remain allowed during pause");
    }

    #[test]
    fn test_inferred_security_halt_blocks_borrow_with_correct_reason() {
        let owner = dummy_pubkey(1);
        let mint = dummy_pubkey(2);
        let mut ctx = nominal_ctx(&owner, &owner, &mint, CircuitAction::Borrow, 100, 1000, 0);
        ctx.halt_state = HaltState::HaltedInferred;

        let res = evaluate_decision(&ctx).unwrap();
        assert!(!res.allowed, "Borrow must be blocked during inferred security halt");
        assert_eq!(res.denial_reason, PermissionDenialReason::SecurityHaltInferred);
        assert_eq!(res.risk_state, MarketState::Defensive);
    }

    #[test]
    fn test_oracle_outage_blocks_borrow_with_oracle_unavailable() {
        let owner = dummy_pubkey(1);
        let mint = dummy_pubkey(2);
        let mut ctx = nominal_ctx(&owner, &owner, &mint, CircuitAction::Borrow, 100, 1000, 0);
        ctx.halt_state = HaltState::OracleUnavailable;
        ctx.oracle_healthy = false;

        let res = evaluate_decision(&ctx).unwrap();
        assert!(!res.allowed, "Borrow must be blocked during oracle outage");
        assert_eq!(res.denial_reason, PermissionDenialReason::OracleUnavailable);
        assert_eq!(res.risk_state, MarketState::Emergency);
    }

    #[test]
    fn test_market_closed_blocks_borrow() {
        let owner = dummy_pubkey(1);
        let mint = dummy_pubkey(2);
        let mut ctx = nominal_ctx(&owner, &owner, &mint, CircuitAction::Borrow, 100, 1000, 0);
        ctx.market_open = false;
        ctx.halt_state = HaltState::Closed;

        let res = evaluate_decision(&ctx).unwrap();
        assert!(!res.allowed, "Borrow must be blocked when reference market is closed");
        assert_eq!(res.denial_reason, PermissionDenialReason::MarketClosed);
    }

    #[test]
    fn test_manual_mode_sovereignty_no_agent_authority_needed() {
        let owner = dummy_pubkey(1);
        let mint = dummy_pubkey(2);
        // Manual mode: actor == owner, agent_authority == None
        let ctx = nominal_ctx(&owner, &owner, &mint, CircuitAction::Borrow, 100, 1000, 0);
        assert!(ctx.agent_authority.is_none());
        let res = evaluate_decision(&ctx).unwrap();
        assert!(res.allowed, "Human owner should NEVER be blocked by missing agent authority");
    }

    #[test]
    fn test_risk_epoch_consistency_never_zero() {
        let owner = dummy_pubkey(1);
        let mint = dummy_pubkey(2);
        let mut ctx = nominal_ctx(&owner, &owner, &mint, CircuitAction::Borrow, 100, 1000, 0);
        ctx.risk_epoch = 0; // Legacy bad input

        let res = evaluate_decision(&ctx).unwrap();
        assert_eq!(res.risk_epoch, 1, "Decision kernel must clamp zero risk epoch to minimum 1");
        assert_eq!(res.capital_policy.risk_epoch, 1, "Capital policy must carry non-zero risk epoch");
    }
}
