/**
 * Circuit Protocol — Durable Intent & Decision Types
 *
 * Defines the core models for the persistent, condition-aware Autonomous Capital Agent.
 */

import type { ProtocolAction, RiskRatchetState } from "../../permission-engine";

export type IntentStatus =
  | "DRAFT"
  | "ARMED"
  | "WATCHING"
  | "TRIGGERED"
  | "PERMISSION_CHECK"
  | "AWAITING_APPROVAL"
  | "BUILDING"
  | "SIMULATING"
  | "SIGNING"
  | "SUBMITTING"
  | "CONFIRMING"
  | "COMPLETED"
  | "BLOCKED"
  | "WAITING"
  | "FAILED"
  | "PAUSED"
  | "EXPIRED"
  | "CANCELLED";

export type ConditionOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "and"
  | "or"
  | "not";

export type ConditionField =
  | "MARKET_OPEN"
  | "MARKET_CLOSED"
  | "ONCHAIN_MARKET_OPEN"
  | "ORACLE_FRESH"
  | "ORACLE_STALE"
  | "ORACLE_UNAVAILABLE"
  | "PRICE_ABOVE"
  | "PRICE_BELOW"
  | "PRICE_CHANGE_ABOVE"
  | "PRICE_CHANGE_BELOW"
  | "LTV_ABOVE"
  | "LTV_BELOW"
  | "HEALTH_ABOVE"
  | "HEALTH_BELOW"
  | "BORROW_CAPACITY_ABOVE"
  | "BORROW_CAPACITY_BELOW"
  | "RISK_STATE_EQUALS"
  | "RISK_STATE_CHANGES"
  | "PERMISSION_EQUALS"
  | "LIQUIDITY_ABOVE"
  | "LIQUIDITY_BELOW"
  | "BALANCE_ABOVE"
  | "BALANCE_BELOW"
  | "DEBT_ABOVE"
  | "DEBT_BELOW"
  | "COLLATERAL_ABOVE"
  | "COLLATERAL_BELOW"
  | "TIME_AT"
  | "TIME_AFTER"
  | "TIME_BEFORE"
  | "TRANSACTION_CONFIRMED"
  | "TRANSACTION_FAILED";

export interface IntentCondition {
  id: string;
  field: ConditionField;
  operator?: ConditionOperator;
  threshold?: number | string | boolean;
  assetSymbol?: string;
  targetAction?: ProtocolAction;
  description?: string;
  children?: IntentCondition[]; // For compound boolean AND/OR/NOT trees
}

export interface AmountLimits {
  maxAmountUsd: number;
  targetAmountUsd: number;
  minAmountUsd?: number;
}

export interface RiskLimits {
  maxLtvBps: number; // e.g. 3500 = 35%
  targetLtvBps?: number;
  minHealthFactor?: number;
  maxSlippageBps?: number;
}

export interface DelegatedAuthoritySnapshot {
  pda: string;
  agentWallet: string;
  ownerWallet: string;
  assetMint: string;
  maxBorrowLimit: number;
  maxWithdrawLimit: number;
  currentBorrowed: number;
  remainingBudgetUsd: number;
  expiryTs: number;
  nonce: number;
  valid: boolean;
}

export interface MachineReadableDecision {
  intentId: string;
  timestamp: number;
  observation: {
    collateralUsd: number;
    debtUsd: number;
    ltvBps: number;
    riskState: string;
    oraclePrice: number;
    oracleFreshnessSec: number;
    vaultLiquidityUsd: number;
  };
  conditionsChecked: {
    condition: string;
    expected: string;
    actual: string;
    passed: boolean;
  }[];
  riskState: string;
  authority: {
    pda: string;
    valid: boolean;
    remainingBudgetUsd: number;
    expiryTs: number;
  };
  permission: {
    allowed: boolean;
    reasonCode: string;
    maxAllowedAmountUsd: number;
  };
  decision: "WAIT" | "EXECUTE" | "BLOCK" | "RECOVER" | "COMPLETE";
  actionProposed?: string;
  transaction?: {
    signature?: string;
    status?: "CONFIRMED" | "FAILED";
    simulationUnits?: number;
  };
  resultSummary: string;
}

export interface DurableIntent {
  id: string;
  owner: string;
  agentId: string;
  strategyId?: string;
  objective: string;
  triggerDescription: string;
  conditions: IntentCondition[];
  action: ProtocolAction;
  assetScope: string[];
  amountLimits: AmountLimits;
  riskLimits: RiskLimits;
  authoritySnapshot: DelegatedAuthoritySnapshot;
  policyVersion: number;
  status: IntentStatus;
  createdAt: number;
  expiresAt: number;
  executionCount: number;
  maxExecutions: number;
  lastEvaluation?: {
    timestamp: number;
    outcome: string;
    reason: string;
    liveLtvBps: number;
    liveRiskState: string;
  };
  lastDecision?: MachineReadableDecision;
  lastTransaction?: {
    signature: string;
    status: "CONFIRMED" | "FAILED";
    slot?: number;
    timestamp: number;
  };
  retryPolicy: {
    maxRetries: number;
    backoffMs: number;
  };
  failureCount: number;
  nonce: number;
  isContinuous: boolean;
}
