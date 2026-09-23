/**
 * Circuit Protocol - Canonical Decision Model
 *
 * Defines the single, unified DecisionSnapshot consumed by:
 * - Manual UI surfaces
 * - Autonomous Agent execution pipeline
 * - Safety status & risk banners
 * - Pre-flight transaction checks
 */

import { ProtocolAction, PermissionReasonCode, RiskRatchetState } from "../permission-engine";

export type ExecutionMode =
  | { mode: "MANUAL" }
  | { mode: "AGENT"; agentPubkey: string };

export type StateCategory =
  | "ALLOW"
  | "BLOCK"
  | "STALE"
  | "UNAVAILABLE"
  | "NOT_APPLICABLE"
  | "LOADING"
  | "UNKNOWN";

export type OracleFreshness = "LIVE" | "RECENT" | "STALE" | "UNAVAILABLE";

export type HaltInferenceState =
  | "OPEN_NORMAL"
  | "CLOSED"
  | "HALTED_INFERRED"
  | "ORACLE_UNAVAILABLE";

export interface DecisionSnapshot {
  assetMint: string;
  assetSymbol: string;

  slot: number | null;
  blockTime: number | null;

  executionMode: ExecutionMode;

  oracle: {
    price: number;
    expo: number;
    confidence: number;
    confBps: number;
    publishTime: number;
    ageSeconds: number;
    ageSlots: number;
    freshness: OracleFreshness;
    healthy: boolean;
  };

  market: {
    expectedSessionState: string;
    securityState: "NORMAL" | "HALTED_INFERRED" | "CLOSED" | "ORACLE_UNAVAILABLE";
    sessionOpen: boolean;
    haltInference: HaltInferenceState;
    dataState: StateCategory;
  };

  risk: {
    state: RiskRatchetState;
    score: number;
    previousScore: number;
    velocity: number;
    riskEpoch: number;
    reason: string;
  };

  capitalPolicy: {
    borrowAllowed: boolean;
    withdrawAllowed: boolean;
    depositAllowed: boolean;
    repayAllowed: boolean;
    maxBorrow: number;
    maxWithdraw: number;
    maxLtv: number;
    maxNotional: number;
  };

  position: {
    collateralUsd: number;
    debtUsd: number;
    health: number | null;
    availableCreditUsd: number;
  };

  authority: {
    mode: "MANUAL" | "AGENT";
    applicable: boolean;
    allowed: boolean;
    status: StateCategory;
    reason: string;
    limits: {
      maxBorrow: number;
      maxWithdraw: number;
      riskBudget: number;
      currentBorrowed: number;
    } | null;
  };

  permission: {
    action: ProtocolAction;
    allowed: boolean;
    status: StateCategory;
    reasonCode: PermissionReasonCode;
    message: string;
    source: "PROTOCOL" | "RATCHET" | "ORACLE" | "CAPITAL_POLICY" | "AUTHORITY" | "POSITION";
    expiresAtSlot?: number;
  };

  freshness: {
    chain: number;
    oracle: number;
    market: number;
    position: number;
    evaluatedAt: number;
  };

  verdict: {
    status: "ALLOW" | "BLOCK" | "UNAVAILABLE";
    reason: string;
    code: PermissionReasonCode;
    evaluatedAtSlot: number | null;
  };
}
