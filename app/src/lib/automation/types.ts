/**
 * Circuit Protocol — Automation Types
 * Shared between client and server-side automation handlers.
 */

export type TaskType =
  | "OBSERVE"
  | "ANALYZE"
  | "WATCH"
  | "REPAY"
  | "BORROW"
  | "DEPOSIT"
  | "WITHDRAW"
  | "RECOVER"
  | "REPORT"
  | "SWAP"
  | "ENTER_LIQUIDITY"
  | "EXIT_LIQUIDITY"
  | "REBALANCE";

export type TaskStatus =
  | "CREATED"
  | "QUEUED"
  | "RUNNING"
  | "WAITING"
  | "AWAITING_APPROVAL"
  | "EXECUTING"
  | "PAUSED"
  | "COMPLETED"
  | "BLOCKED"
  | "FAILED"
  | "EXPIRED"
  | "CANCELLED"
  | "ACTIVE"   // Backward compatibility alias for RUNNING
  | "REVOKED";  // Backward compatibility alias for CANCELLED

export type WatchField =
  | "health_factor"
  | "risk_state"
  | "borrow_capacity_usd"
  | "collateral_usd"
  | "debt_usd"
  | "oracle_staleness_ms"
  | "authority_expiry_ts"
  | "ltv_bps";

export type WatchOperator = "lt" | "gt" | "eq" | "lte" | "gte" | "neq";

/** Structured, deterministic trigger predicate — no ambiguous natural language */
export interface WatchCondition {
  field: WatchField;
  operator: WatchOperator;
  /** Numeric threshold or string for risk_state (e.g. "DEFENSIVE") */
  threshold: number | string;
  /** Human-readable description */
  description?: string;
}

export type FrequencyMinutes = 1 | 5 | 15 | 30 | 60 | 360 | 1440;

export interface StrategyPolicy {
  /** Semantic version — immutable after activation */
  version: number;
  objective: string;
  allowedActions: TaskType[];
  /** Asset symbols this policy scopes to (empty = portfolio-wide) */
  assetScope: string[];
  maxAmountPerActionUsd: number;
  maxTotalUsd: number;
  frequencyMinutes: FrequencyMinutes;
  /** Unix timestamp (seconds) when authority expires */
  expireDays: number;
  /** If true, stop borrowing when risk >= DEFENSIVE */
  riskAdaptive: boolean;
  targetLtvBps?: number;
  maxLtvBps?: number;
  minHealthFactor?: number;
  rebalanceDirection?: string;
}

export interface AutomationTask {
  id: string;
  /** Wallet address that owns this task */
  owner: string;
  name: string;
  type: TaskType;
  status: TaskStatus;
  condition: WatchCondition | null;
  policy: StrategyPolicy | null;
  frequencyMinutes: FrequencyMinutes;
  /** Unix ms */
  createdAt: number;
  activatedAt?: number | null;
  expiresAt: number | null;
  lastCheckedAt?: number | null;
  nextRunAt?: number | null;
  lastResult?: TaskResult | null;
  /** Execution hard limits */
  maxExecutionsPerDay: number;
  executionsToday: number;
  consecutiveFailures: number;
  maxConsecutiveFailures: number;
  /** Optional metadata and scheduling properties */
  mode?: "SCHEDULE" | "MANUAL" | "AUTONOMOUS";
  executionsCount?: number;
  lastRunTs?: number;
  schedule?: {
    frequency: string;
    hourUtc?: number;
    minuteUtc?: number;
  };
}

export type ExecutionOutcome =
  | "OBSERVED"
  | "CONDITION_NOT_MET"
  | "PERMISSION_DENIED"
  | "SUBMITTED"
  | "CONFIRMED"
  | "FAILED"
  | "BLOCKED_EMERGENCY"
  | "BLOCKED_NO_AUTHORITY"
  | "BLOCKED_NO_SIGNER"
  | "SKIPPED_LIMIT";

/** Real-time execution states */
export type AgentExecutionState =
  | "IDLE"
  | "PLANNING"
  | "AWAITING_APPROVAL"
  | "CHECKING_PERMISSION"
  | "EXECUTING"
  | "CONFIRMING"
  | "COMPLETED"
  | "BLOCKED"
  | "FAILED";

export interface TaskResult {
  taskId: string;
  executionId: string;
  outcome: ExecutionOutcome;
  /** Circuit permission reason code */
  reasonCode?: string;
  conditionValue?: number | string;
  conditionMet: boolean;
  actionProposed?: string;
  txSignature?: string;
  txStatus?: "SUBMITTED" | "CONFIRMING" | "CONFIRMED" | "FAILED";
  stateAfter?: Record<string, number | string>;
  timestamp: number;
  durationMs: number;
}

/** Full execution record stored in history */
export interface ExecutionRecord extends TaskResult {
  taskName: string;
  taskType: TaskType;
  owner: string;
}

/** Parsed from CIRCUIT_TASK: prefix in agent chat response */
export interface ParsedTaskProposal {
  name: string;
  type: TaskType;
  condition: WatchCondition | null;
  policy: StrategyPolicy | null;
  frequencyMinutes: FrequencyMinutes;
  expireDays: number;
}
