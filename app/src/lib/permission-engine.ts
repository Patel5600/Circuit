/**
 * Circuit Protocol - Canonical Permission Engine
 *
 * Single, protocol-sovereign permission evaluation pipeline for both HUMAN and AGENT execution.
 *
 * Core Principle:
 * "Agents decide what to do. Circuit decides what capital they are allowed to risk."
 *
 * Both HUMAN and AGENT enter the same protocol authorization path:
 *
 *   HUMAN or AGENT
 *          ↓
 *        ACTION
 *          ↓
 *   CIRCUIT PERMISSION ENGINE
 *          ↓
 *      MARKETGUARD
 *          ↓
 *      RISK RATCHET
 *          ↓
 *    CAPITAL POLICY
 *          ↓
 *     CREDIT ENGINE
 *          ↓
 *      EXECUTION
 *
 * Effective Authority is derived as:
 *   A_effective(t) = A_owner ∩ A_agent ∩ A_risk(t) ∩ A_position(t)
 */

export type ProtocolAction = "deposit" | "borrow" | "repay" | "withdraw" | "liquidate";

export type ActorType = "HUMAN" | "AGENT";

export type RiskRatchetState = "SAFE" | "RESTRICTED" | "DEFENSIVE" | "EMERGENCY";

export type PermissionReasonCode =
  | "ALLOWED"
  | "STALE_ORACLE"
  | "CONFIDENCE_TOO_WIDE"
  | "MARKET_CLOSED"
  | "RISK_STATE_RESTRICTED"
  | "BORROW_DISABLED"
  | "WITHDRAW_DISABLED"
  | "AGENT_UNAUTHORIZED"
  | "AGENT_EXPIRED"
  | "BORROW_LIMIT_EXCEEDED"
  | "LTV_EXCEEDED"
  | "INSUFFICIENT_COLLATERAL"
  | "HEALTH_FACTOR_TOO_LOW"
  | "RISK_BUDGET_EXCEEDED"
  | "POSITION_NOT_FOUND"
  | "INVALID_ASSET"
  | "INVALID_AUTHORITY"
  | "PROTOCOL_PAUSED"
  | "ASSET_DISABLED";

export interface PermissionResult {
  /** Whether the requested operation is legally permitted onchain */
  allowed: boolean;
  /** Machine-readable deterministic reason code */
  reasonCode: PermissionReasonCode;
  /** Human-readable explanation */
  message: string;
  /** Authoritative effective loan-to-value cap in basis points (e.g. 7000 = 70%) */
  effectiveLtvBps: number;
  /** Maximum borrow capacity in USD native decimal terms */
  borrowCapacityUsd: number;
  /** Projected health factor in basis points (10_000 = 1.0) */
  healthFactorBps: number | null;
  /** Current Risk Ratchet state */
  riskState: RiskRatchetState;
  /** Action risk cost consumed from dynamic budget B_t */
  actionCostUsd: number;
  /** Remaining dynamic risk budget B_t in USD */
  remainingRiskBudgetUsd: number;
}

export interface PermissionEvaluationParams {
  actor: ActorType;
  action: ProtocolAction;
  amountUsd?: number;
  protocolPaused?: boolean;
  assetEnabled?: boolean;
  isMarketOpen?: boolean;
  oracleStale?: boolean;
  confBps?: number;
  maxConfBps?: number;
  riskState?: RiskRatchetState;
  baseLtvBps?: number;
  collateralUsd?: number;
  currentDebtUsd?: number;
  minHealthFactorBps?: number;
  liquidationThresholdBps?: number;

  // Agent-specific parameters (ignored for HUMAN)
  agentAuthority?: {
    active: boolean;
    isExpired: boolean;
    allowedActions: {
      deposit: boolean;
      borrow: boolean;
      repay: boolean;
      withdraw: boolean;
    };
    maxBorrowLimitUsd: number;
    maxWithdrawLimitUsd: number;
    currentBorrowedUsd: number;
    riskBudgetUsd: number;
  } | null;
}

/**
 * Evaluates execution permission against all protocol, market, risk, authority,
 * and financial constraints.
 *
 * Deterministic and actor-agnostic: both humans and agents use this exact logic.
 */
export function evaluatePermission(params: PermissionEvaluationParams): PermissionResult {
  const {
    actor,
    action,
    amountUsd = 0,
    protocolPaused = false,
    assetEnabled = true,
    isMarketOpen = true,
    oracleStale = false,
    confBps = 20,
    maxConfBps = 100,
    riskState = "SAFE",
    baseLtvBps = 7000,
    collateralUsd = 0,
    currentDebtUsd = 0,
    minHealthFactorBps = 10_000,
    liquidationThresholdBps = 8000,
    agentAuthority = null,
  } = params;

  // --------------------------------------------------------------------------
  // 1. PROTOCOL STATUS CHECK
  // --------------------------------------------------------------------------
  if (protocolPaused && (action === "borrow" || action === "withdraw")) {
    return makeResult(false, "PROTOCOL_PAUSED", "Protocol is globally paused by administrator.", riskState, 0, 0, null, 0, 0);
  }

  if (!assetEnabled) {
    return makeResult(false, "ASSET_DISABLED", "Asset has been disabled by risk governance.", riskState, 0, 0, null, 0, 0);
  }

  // --------------------------------------------------------------------------
  // 2. UNCONDITIONAL ACTIONS: REPAY & DEPOSIT
  // Invariant: Non-custodial integrity ensures capital recovery is always available.
  // --------------------------------------------------------------------------
  if (action === "repay") {
    // If agent, check delegation
    if (actor === "AGENT") {
      if (!agentAuthority || !agentAuthority.active) {
        return makeResult(false, "AGENT_UNAUTHORIZED", "Agent authority is inactive or revoked.", riskState, 0, 0, null, 0, 0);
      }
      if (agentAuthority.isExpired) {
        return makeResult(false, "AGENT_EXPIRED", "Agent authority window has expired.", riskState, 0, 0, null, 0, 0);
      }
      if (!agentAuthority.allowedActions.repay) {
        return makeResult(false, "AGENT_UNAUTHORIZED", "Agent is not authorized to execute repay.", riskState, 0, 0, null, 0, 0);
      }
    }
    return makeResult(
      true,
      "ALLOWED",
      "Debt repayment unconditionally permitted across all market states.",
      riskState,
      baseLtvBps,
      0,
      null,
      0,
      agentAuthority?.riskBudgetUsd ?? 0
    );
  }

  if (action === "deposit") {
    if (actor === "AGENT") {
      if (!agentAuthority || !agentAuthority.active) {
        return makeResult(false, "AGENT_UNAUTHORIZED", "Agent authority is inactive or revoked.", riskState, 0, 0, null, 0, 0);
      }
      if (agentAuthority.isExpired) {
        return makeResult(false, "AGENT_EXPIRED", "Agent authority window has expired.", riskState, 0, 0, null, 0, 0);
      }
      if (!agentAuthority.allowedActions.deposit) {
        return makeResult(false, "AGENT_UNAUTHORIZED", "Agent is not authorized to execute deposit.", riskState, 0, 0, null, 0, 0);
      }
    }
    return makeResult(
      true,
      "ALLOWED",
      "Collateral deposit unconditionally permitted across all market states.",
      riskState,
      baseLtvBps,
      0,
      null,
      0,
      agentAuthority?.riskBudgetUsd ?? 0
    );
  }

  // --------------------------------------------------------------------------
  // 3. MARKETGUARD ORACLE VALIDATION
  // --------------------------------------------------------------------------
  if (oracleStale) {
    return makeResult(false, "STALE_ORACLE", "Pyth oracle price is stale (> max_oracle_age). Risky actions blocked.", riskState, 0, 0, null, 0, 0);
  }

  if (confBps > maxConfBps) {
    return makeResult(false, "CONFIDENCE_TOO_WIDE", `Oracle uncertainty interval (${confBps} bps) exceeds asset bound (${maxConfBps} bps).`, riskState, 0, 0, null, 0, 0);
  }

  if (!isMarketOpen && (action === "borrow" || (action === "withdraw" && currentDebtUsd > 0))) {
    return makeResult(false, "MARKET_CLOSED", "Reference equity market (NYSE) is closed. Credit creation locked.", riskState, 0, 0, null, 0, 0);
  }

  // --------------------------------------------------------------------------
  // 4. RISK RATCHET & CAPITAL POLICY
  // --------------------------------------------------------------------------
  // Derive effective LTV: Safe = 70%, Restricted = 60%, Defensive = 50%, Emergency = 0%
  let effectiveLtvBps = baseLtvBps;
  if (riskState === "RESTRICTED") {
    effectiveLtvBps = Math.max(0, baseLtvBps - 1000);
  } else if (riskState === "DEFENSIVE") {
    effectiveLtvBps = Math.max(0, baseLtvBps - 2000);
  } else if (riskState === "EMERGENCY") {
    effectiveLtvBps = 0;
  }

  if (action === "borrow") {
    if (riskState === "EMERGENCY") {
      return makeResult(false, "BORROW_DISABLED", "Protocol containment: Borrowing blocked in EMERGENCY state.", riskState, effectiveLtvBps, 0, null, 0, 0);
    }
    if (riskState === "DEFENSIVE") {
      return makeResult(false, "BORROW_DISABLED", "Protocol containment: Borrowing blocked in DEFENSIVE state.", riskState, effectiveLtvBps, 0, null, 0, 0);
    }
    if (riskState === "RESTRICTED" && currentDebtUsd > 0) {
      return makeResult(false, "RISK_STATE_RESTRICTED", "Risk Ratchet RESTRICTED: Additional borrowing throttled while holding debt.", riskState, effectiveLtvBps, 0, null, 0, 0);
    }
  }

  if (action === "withdraw" && currentDebtUsd > 0) {
    if (riskState === "DEFENSIVE" || riskState === "EMERGENCY") {
      return makeResult(false, "WITHDRAW_DISABLED", `Collateral withdrawal blocked during ${riskState} state while outstanding debt exists.`, riskState, effectiveLtvBps, 0, null, 0, 0);
    }
  }

  // --------------------------------------------------------------------------
  // 5. AGENT AUTHORITY BOUNDS (Only applied if actor === "AGENT")
  // --------------------------------------------------------------------------
  let agentRiskBudget = 0;
  let actionCost = 0;

  if (actor === "AGENT") {
    if (!agentAuthority || !agentAuthority.active) {
      return makeResult(false, "AGENT_UNAUTHORIZED", "Autonomous strategy delegation is inactive or revoked.", riskState, effectiveLtvBps, 0, null, 0, 0);
    }
    if (agentAuthority.isExpired) {
      return makeResult(false, "AGENT_EXPIRED", "Autonomous strategy delegation has expired.", riskState, effectiveLtvBps, 0, null, 0, 0);
    }

    if (action === "borrow") {
      if (!agentAuthority.allowedActions.borrow) {
        return makeResult(false, "AGENT_UNAUTHORIZED", "Strategy policy does not permit borrowing.", riskState, effectiveLtvBps, 0, null, 0, 0);
      }
      if (agentAuthority.currentBorrowedUsd + amountUsd > agentAuthority.maxBorrowLimitUsd) {
        return makeResult(false, "BORROW_LIMIT_EXCEEDED", `Requested amount exceeds strategy delegated borrow limit ($${agentAuthority.maxBorrowLimitUsd}).`, riskState, effectiveLtvBps, 0, null, 0, 0);
      }

      // Action risk cost: C(a) = Amount * (1 + conf_ratio_bps / 10_000) * RiskMultiplier
      const riskMultiplier = riskState === "RESTRICTED" ? 1.5 : 1.0;
      actionCost = amountUsd * (1 + confBps / 10_000) * riskMultiplier;

      if (actionCost > agentAuthority.riskBudgetUsd) {
        return makeResult(false, "RISK_BUDGET_EXCEEDED", `Action risk cost ($${actionCost.toFixed(2)}) exceeds dynamic risk budget ($${agentAuthority.riskBudgetUsd.toFixed(2)}).`, riskState, effectiveLtvBps, 0, null, actionCost, agentAuthority.riskBudgetUsd);
      }
    }

    if (action === "withdraw") {
      if (!agentAuthority.allowedActions.withdraw) {
        return makeResult(false, "AGENT_UNAUTHORIZED", "Strategy policy does not permit collateral withdrawal.", riskState, effectiveLtvBps, 0, null, 0, 0);
      }
      if (amountUsd > agentAuthority.maxWithdrawLimitUsd) {
        return makeResult(false, "AGENT_UNAUTHORIZED", `Withdrawal exceeds strategy limit ($${agentAuthority.maxWithdrawLimitUsd}).`, riskState, effectiveLtvBps, 0, null, 0, 0);
      }
    }

    agentRiskBudget = agentAuthority.riskBudgetUsd - actionCost;
  }

  // --------------------------------------------------------------------------
  // 6. CREDIT ENGINE & FINANCIAL INVARIANTS
  // --------------------------------------------------------------------------
  const maxBorrowCapacity = Math.max(0, (collateralUsd * effectiveLtvBps) / 10_000 - currentDebtUsd);

  if (action === "borrow") {
    if (collateralUsd <= 0) {
      return makeResult(false, "INSUFFICIENT_COLLATERAL", "No collateral deposited. Deposit tokenized equity to borrow.", riskState, effectiveLtvBps, 0, null, 0, 0);
    }

    const projectedDebt = currentDebtUsd + amountUsd;
    const maxPermittedDebt = (collateralUsd * effectiveLtvBps) / 10_000;

    if (projectedDebt > maxPermittedDebt) {
      return makeResult(false, "LTV_EXCEEDED", `Borrow would exceed effective LTV capacity (${(effectiveLtvBps / 100).toFixed(1)}%).`, riskState, effectiveLtvBps, maxBorrowCapacity, null, 0, agentRiskBudget);
    }

    // Health factor check
    const projectedHfBps =
      projectedDebt > 0
        ? Math.floor((collateralUsd * liquidationThresholdBps * 10_000) / (projectedDebt * 10_000))
        : 999_999;

    if (projectedHfBps < minHealthFactorBps) {
      return makeResult(false, "HEALTH_FACTOR_TOO_LOW", `Resulting Health Factor (${(projectedHfBps / 10_000).toFixed(2)}) would be below protocol minimum (1.0).`, riskState, effectiveLtvBps, maxBorrowCapacity, projectedHfBps, 0, agentRiskBudget);
    }

    // Constrain by agent limits if applicable
    let availableBorrow = maxBorrowCapacity;
    if (actor === "AGENT" && agentAuthority) {
      const remainingAgentCap = Math.max(0, agentAuthority.maxBorrowLimitUsd - agentAuthority.currentBorrowedUsd);
      availableBorrow = Math.min(maxBorrowCapacity, remainingAgentCap, agentAuthority.riskBudgetUsd);
    }

    return makeResult(
      true,
      "ALLOWED",
      "Borrow permitted by protocol permission engine.",
      riskState,
      effectiveLtvBps,
      availableBorrow,
      projectedHfBps,
      actionCost,
      agentRiskBudget
    );
  }

  if (action === "withdraw") {
    if (amountUsd > collateralUsd) {
      return makeResult(false, "INSUFFICIENT_COLLATERAL", "Requested withdrawal exceeds deposited collateral.", riskState, effectiveLtvBps, maxBorrowCapacity, null, 0, 0);
    }

    const remainingCollateral = collateralUsd - amountUsd;
    if (currentDebtUsd > 0) {
      const maxDebtAllowed = (remainingCollateral * effectiveLtvBps) / 10_000;
      if (currentDebtUsd > maxDebtAllowed) {
        return makeResult(false, "LTV_EXCEEDED", "Withdrawal would cause position to exceed effective LTV limit.", riskState, effectiveLtvBps, 0, null, 0, 0);
      }

      const projectedHfBps = Math.floor((remainingCollateral * liquidationThresholdBps * 10_000) / (currentDebtUsd * 10_000));
      if (projectedHfBps < minHealthFactorBps) {
        return makeResult(false, "HEALTH_FACTOR_TOO_LOW", "Withdrawal would reduce Health Factor below protocol minimum.", riskState, effectiveLtvBps, 0, projectedHfBps, 0, 0);
      }
    }

    return makeResult(true, "ALLOWED", "Collateral withdrawal permitted.", riskState, effectiveLtvBps, maxBorrowCapacity, null, 0, agentRiskBudget);
  }

  // Default allowed
  return makeResult(true, "ALLOWED", "Operation authorized.", riskState, effectiveLtvBps, maxBorrowCapacity, null, 0, agentRiskBudget);
}

function makeResult(
  allowed: boolean,
  reasonCode: PermissionReasonCode,
  message: string,
  riskState: RiskRatchetState,
  effectiveLtvBps: number,
  borrowCapacityUsd: number,
  healthFactorBps: number | null,
  actionCostUsd: number,
  remainingRiskBudgetUsd: number
): PermissionResult {
  return {
    allowed,
    reasonCode,
    message,
    riskState,
    effectiveLtvBps,
    borrowCapacityUsd,
    healthFactorBps,
    actionCostUsd,
    remainingRiskBudgetUsd,
  };
}
