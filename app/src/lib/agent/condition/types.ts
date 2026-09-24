/**
 * Circuit Protocol — Condition Engine Types
 */

import type { IntentCondition, ConditionOperator, ConditionField } from "../intent/types";

export interface ProtocolStateObservation {
  isMarketOpen: boolean;
  onchainMarketOpen: boolean;
  oracleFresh: boolean;
  oracleAgeSec: number;
  oracleAvailable: boolean;
  oraclePrice: number;
  priceChange24h: number;
  ltvBps: number;
  healthFactor: number | null;
  borrowCapacityUsd: number;
  riskState: string;
  vaultLiquidityUsd: number;
  walletBalanceUsd: number;
  debtUsd: number;
  collateralUsd: number;
  currentTimeSec: number;
  lastTxConfirmed?: boolean;
  permissionByAction: Record<string, { allowed: boolean; code: string }>;
}

export interface ConditionEvaluationResult {
  conditionId: string;
  field: ConditionField;
  met: boolean;
  expected: string;
  actual: string;
  reason: string;
  subResults?: ConditionEvaluationResult[];
}
