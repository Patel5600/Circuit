/**
 * Circuit Protocol — Deterministic Condition Evaluator
 *
 * Implements strict, zero-guesswork condition evaluation against live protocol state.
 */

import type { IntentCondition } from "../intent/types";
import type { ProtocolStateObservation, ConditionEvaluationResult } from "./types";

export function evaluateSingleCondition(
  cond: IntentCondition,
  state: ProtocolStateObservation
): ConditionEvaluationResult {
  // 1. Compound boolean operators (AND, OR, NOT)
  if (cond.operator === "and" && cond.children && cond.children.length > 0) {
    const subResults = cond.children.map(c => evaluateSingleCondition(c, state));
    const met = subResults.every(r => r.met);
    return {
      conditionId: cond.id,
      field: cond.field,
      met,
      expected: "All children met (AND)",
      actual: `${subResults.filter(r => r.met).length}/${subResults.length} met`,
      reason: met ? "All conjuncts satisfied" : "One or more conjuncts failed",
      subResults,
    };
  }

  if (cond.operator === "or" && cond.children && cond.children.length > 0) {
    const subResults = cond.children.map(c => evaluateSingleCondition(c, state));
    const met = subResults.some(r => r.met);
    return {
      conditionId: cond.id,
      field: cond.field,
      met,
      expected: "At least one child met (OR)",
      actual: `${subResults.filter(r => r.met).length}/${subResults.length} met`,
      reason: met ? "Disjunction satisfied" : "All disjuncts failed",
      subResults,
    };
  }

  if (cond.operator === "not" && cond.children && cond.children.length === 1) {
    const sub = evaluateSingleCondition(cond.children[0], state);
    const met = !sub.met;
    return {
      conditionId: cond.id,
      field: cond.field,
      met,
      expected: `NOT (${sub.expected})`,
      actual: `Subcondition met=${sub.met}`,
      reason: met ? "Negated condition satisfied" : "Negated condition was true",
      subResults: [sub],
    };
  }

  // 2. Leaf Predicate Evaluation
  let met = false;
  let expected = String(cond.threshold ?? true);
  let actual = "";

  switch (cond.field) {
    case "MARKET_OPEN":
      met = state.isMarketOpen;
      actual = String(state.isMarketOpen);
      break;

    case "MARKET_CLOSED":
      met = !state.isMarketOpen;
      actual = String(!state.isMarketOpen);
      break;

    case "ONCHAIN_MARKET_OPEN":
      met = state.onchainMarketOpen;
      actual = String(state.onchainMarketOpen);
      break;

    case "ORACLE_FRESH":
      met = state.oracleFresh;
      actual = `age=${state.oracleAgeSec}s`;
      break;

    case "ORACLE_STALE":
      met = !state.oracleFresh && state.oracleAvailable;
      actual = `age=${state.oracleAgeSec}s`;
      break;

    case "ORACLE_UNAVAILABLE":
      met = !state.oracleAvailable;
      actual = String(!state.oracleAvailable);
      break;

    case "PRICE_ABOVE": {
      const th = Number(cond.threshold ?? 0);
      met = state.oraclePrice > th;
      actual = `$${state.oraclePrice.toFixed(2)}`;
      expected = `> $${th.toFixed(2)}`;
      break;
    }

    case "PRICE_BELOW": {
      const th = Number(cond.threshold ?? 0);
      met = state.oraclePrice < th;
      actual = `$${state.oraclePrice.toFixed(2)}`;
      expected = `< $${th.toFixed(2)}`;
      break;
    }

    case "PRICE_CHANGE_ABOVE": {
      const th = Number(cond.threshold ?? 0);
      met = state.priceChange24h > th;
      actual = `${state.priceChange24h.toFixed(2)}%`;
      expected = `> ${th.toFixed(2)}%`;
      break;
    }

    case "PRICE_CHANGE_BELOW": {
      const th = Number(cond.threshold ?? 0);
      met = state.priceChange24h < th;
      actual = `${state.priceChange24h.toFixed(2)}%`;
      expected = `< ${th.toFixed(2)}%`;
      break;
    }

    case "LTV_ABOVE": {
      const thBps = Number(cond.threshold ?? 0);
      met = state.ltvBps > thBps;
      actual = `${(state.ltvBps / 100).toFixed(1)}%`;
      expected = `> ${(thBps / 100).toFixed(1)}%`;
      break;
    }

    case "LTV_BELOW": {
      const thBps = Number(cond.threshold ?? 0);
      met = state.ltvBps < thBps;
      actual = `${(state.ltvBps / 100).toFixed(1)}%`;
      expected = `< ${(thBps / 100).toFixed(1)}%`;
      break;
    }

    case "HEALTH_ABOVE": {
      const th = Number(cond.threshold ?? 0);
      met = (state.healthFactor ?? 999) > th;
      actual = state.healthFactor !== null ? state.healthFactor.toFixed(2) : "Infinite";
      expected = `> ${th.toFixed(2)}`;
      break;
    }

    case "HEALTH_BELOW": {
      const th = Number(cond.threshold ?? 0);
      met = (state.healthFactor ?? 999) < th;
      actual = state.healthFactor !== null ? state.healthFactor.toFixed(2) : "Infinite";
      expected = `< ${th.toFixed(2)}`;
      break;
    }

    case "BORROW_CAPACITY_ABOVE": {
      const th = Number(cond.threshold ?? 0);
      met = state.borrowCapacityUsd > th;
      actual = `$${state.borrowCapacityUsd.toFixed(2)}`;
      expected = `> $${th.toFixed(2)}`;
      break;
    }

    case "BORROW_CAPACITY_BELOW": {
      const th = Number(cond.threshold ?? 0);
      met = state.borrowCapacityUsd < th;
      actual = `$${state.borrowCapacityUsd.toFixed(2)}`;
      expected = `< $${th.toFixed(2)}`;
      break;
    }

    case "RISK_STATE_EQUALS": {
      const targetState = String(cond.threshold ?? "SAFE").toUpperCase();
      met = state.riskState.toUpperCase() === targetState;
      actual = state.riskState;
      expected = targetState;
      break;
    }

    case "RISK_STATE_CHANGES": {
      const targetState = String(cond.threshold ?? "").toUpperCase();
      met = targetState ? state.riskState.toUpperCase() !== targetState : true;
      actual = state.riskState;
      expected = `!= ${targetState}`;
      break;
    }

    case "PERMISSION_EQUALS": {
      const action = cond.targetAction || "borrow";
      const perm = state.permissionByAction[action] || { allowed: false, code: "UNKNOWN" };
      const expectedStatus = String(cond.threshold ?? "ALLOWED").toUpperCase();
      met = expectedStatus === "ALLOWED" ? perm.allowed : !perm.allowed;
      actual = perm.allowed ? "ALLOWED" : perm.code;
      expected = expectedStatus;
      break;
    }

    case "LIQUIDITY_ABOVE": {
      const th = Number(cond.threshold ?? 0);
      met = state.vaultLiquidityUsd >= th;
      actual = `$${state.vaultLiquidityUsd.toFixed(2)}`;
      expected = `>= $${th.toFixed(2)}`;
      break;
    }

    case "LIQUIDITY_BELOW": {
      const th = Number(cond.threshold ?? 0);
      met = state.vaultLiquidityUsd < th;
      actual = `$${state.vaultLiquidityUsd.toFixed(2)}`;
      expected = `< $${th.toFixed(2)}`;
      break;
    }

    case "DEBT_ABOVE": {
      const th = Number(cond.threshold ?? 0);
      met = state.debtUsd > th;
      actual = `$${state.debtUsd.toFixed(2)}`;
      expected = `> $${th.toFixed(2)}`;
      break;
    }

    case "DEBT_BELOW": {
      const th = Number(cond.threshold ?? 0);
      met = state.debtUsd < th;
      actual = `$${state.debtUsd.toFixed(2)}`;
      expected = `< $${th.toFixed(2)}`;
      break;
    }

    case "COLLATERAL_ABOVE": {
      const th = Number(cond.threshold ?? 0);
      met = state.collateralUsd > th;
      actual = `$${state.collateralUsd.toFixed(2)}`;
      expected = `> $${th.toFixed(2)}`;
      break;
    }

    case "COLLATERAL_BELOW": {
      const th = Number(cond.threshold ?? 0);
      met = state.collateralUsd < th;
      actual = `$${state.collateralUsd.toFixed(2)}`;
      expected = `< $${th.toFixed(2)}`;
      break;
    }

    case "TIME_AFTER": {
      const targetTs = Number(cond.threshold ?? 0);
      met = state.currentTimeSec >= targetTs;
      actual = `${state.currentTimeSec}`;
      expected = `>= ${targetTs}`;
      break;
    }

    case "TIME_BEFORE": {
      const targetTs = Number(cond.threshold ?? 0);
      met = state.currentTimeSec < targetTs;
      actual = `${state.currentTimeSec}`;
      expected = `< ${targetTs}`;
      break;
    }

    case "TRANSACTION_CONFIRMED":
      met = Boolean(state.lastTxConfirmed);
      actual = String(state.lastTxConfirmed);
      break;

    default:
      met = false;
      actual = "UNKNOWN_FIELD";
  }

  return {
    conditionId: cond.id,
    field: cond.field,
    met,
    expected,
    actual,
    reason: met ? "Condition passed" : `Expected ${expected}, but actual was ${actual}`,
  };
}

/**
 * Evaluates an array of conditions for an intent.
 * By default, multiple top-level conditions are conjuncts (ALL must be met).
 */
export function evaluateIntentConditions(
  conditions: IntentCondition[],
  state: ProtocolStateObservation
): { allMet: boolean; results: ConditionEvaluationResult[] } {
  if (conditions.length === 0) {
    return { allMet: true, results: [] };
  }
  const results = conditions.map(c => evaluateSingleCondition(c, state));
  const allMet = results.every(r => r.met);
  return { allMet, results };
}
