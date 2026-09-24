/**
 * Circuit Protocol - Canonical Decision Evaluator
 *
 * Single deterministic evaluator for:
 * - Manual wallet execution
 * - Autonomous agent execution
 * - UI previews & objections
 * - Transaction pre-checks
 */

import {
  DecisionSnapshot,
  ExecutionMode,
  OracleFreshness,
  HaltInferenceState,
  StateCategory,
  ReferenceMarketState,
  OnchainMarketState,
  OracleState,
} from "./types";
import {
  ProtocolAction,
  PermissionReasonCode,
  RiskRatchetState,
} from "../permission-engine";
import { classifyOracleState } from "../market-data/stream";

export interface LiveStateInput {
  slot: number | null;
  blockTime: number | null;

  // Protocol state
  protocolPaused: boolean;
  assetEnabled: boolean;
  assetMint?: string;
  assetSymbol: string;
  debtAssetSymbol?: string;

  // Oracle state
  oraclePrice: number;
  oracleExpo?: number;
  oracleConf?: number;
  oracleConfBps: number;
  oraclePublishTime: number;
  globalOracleHealthy?: boolean;
  oracleState?: OracleState;
  lastValidPrice?: number | null;
  lastValidPublishTime?: number | null;

  // Market & Session state
  isMarketOpen: boolean;
  sessionLabel?: string;
  securityHaltState?: "normal" | "halted_inferred" | "closed" | "oracle_unavailable" | "restricted";
  referenceMarketState?: ReferenceMarketState;
  onchainMarketState?: OnchainMarketState;

  // Risk state
  ratchetState: RiskRatchetState;
  riskScore?: number;
  previousRiskScore?: number;
  riskVelocity?: number;
  riskEpoch?: number;

  // Capital policy / LTV
  baseLtvBps: number; // e.g. 7000 (70%)
  liquidationThresholdBps?: number; // e.g. 8000 (80%)
  minHealthFactorBps?: number; // e.g. 10000 (1.0)

  // Position & Vault state
  collateralUsd: number;
  debtUsd: number;
  vaultLiquidityUsd?: number;

  // Agent Authority (only evaluated when executionMode.mode === "AGENT")
  agentAuthority?: {
    active: boolean;
    isExpired: boolean;
    allowedActions: { deposit: boolean; borrow: boolean; repay: boolean; withdraw: boolean };
    maxBorrowLimitUsd: number;
    maxWithdrawLimitUsd: number;
    currentBorrowedUsd: number;
    riskBudgetUsd: number;
  } | null;
}

export function evaluateAction(
  executionMode: ExecutionMode,
  action: ProtocolAction,
  amountUsd: number,
  state: LiveStateInput
): DecisionSnapshot {
  const evaluatedAt = Date.now();
  const nowSec = state.blockTime ?? Math.floor(evaluatedAt / 1000);
  const ageSeconds = state.oraclePublishTime > 0
    ? Math.max(0, nowSec - state.oraclePublishTime)
    : 999999;
  const ageSlots = state.slot ? Math.max(0, Math.floor(ageSeconds / 0.4)) : 0;

  // 1. Measured Oracle Freshness
  let freshness: OracleFreshness = "UNAVAILABLE";
  if (state.oraclePrice <= 0) {
    freshness = "UNAVAILABLE";
  } else if (state.oraclePublishTime <= 0) {
    // Verified on-chain fallback price recorded in Position/Guard
    freshness = "RECENT";
  } else if (ageSeconds < 30) {
    freshness = "LIVE";
  } else if (ageSeconds <= 120) {
    freshness = "RECENT";
  } else {
    freshness = "STALE";
  }

  const globalOracleHealthy = state.globalOracleHealthy ?? true;
  const hasValidPrice = state.oraclePrice > 0 && (state.oraclePublishTime > 0 || (state.lastValidPrice ?? 0) > 0);
  const derivedOracleState: OracleState = state.oracleState ?? classifyOracleState(
    ageSeconds,
    hasValidPrice,
    state.oracleConfBps,
    globalOracleHealthy
  );

  const oracleHealthy =
    freshness !== "UNAVAILABLE" &&
    freshness !== "STALE" &&
    state.oracleConfBps <= 100 &&
    globalOracleHealthy;

  // 2. Canonical Independent Market States
  const refMarketState: ReferenceMarketState = state.referenceMarketState ?? (state.isMarketOpen ? "OPEN" : "CLOSED");
  const onchainMarketState: OnchainMarketState = state.onchainMarketState ?? "OPEN";

  // 3. Halt State & Session Inference
  let haltInference: HaltInferenceState = "OPEN_NORMAL";
  let expectedSessionState = state.sessionLabel ?? (refMarketState === "OPEN" ? "Regular Session" : "Closed");

  if (!globalOracleHealthy) {
    haltInference = "ORACLE_UNAVAILABLE";
  } else if (state.oraclePrice <= 0 || freshness === "UNAVAILABLE") {
    haltInference = "ORACLE_UNAVAILABLE";
  } else if (refMarketState === "OPEN" && ageSeconds > 60 && state.oraclePublishTime > 0) {
    haltInference = "HALTED_INFERRED";
  } else if (refMarketState === "CLOSED") {
    haltInference = "CLOSED";
  } else {
    haltInference = "OPEN_NORMAL";
  }

  // 3. Dynamic LTV & Capital Policy
  let effectiveLtvBps = state.baseLtvBps;
  if (state.ratchetState === "RESTRICTED") {
    effectiveLtvBps = Math.max(0, state.baseLtvBps - 1000);
  } else if (state.ratchetState === "DEFENSIVE") {
    effectiveLtvBps = Math.max(0, state.baseLtvBps - 2000);
  } else if (state.ratchetState === "EMERGENCY") {
    effectiveLtvBps = 0;
  }

  const maxLtv = effectiveLtvBps / 10_000;
  const borrowCapacityUsd = state.collateralUsd * maxLtv;
  const availableCreditUsd = Math.max(0, borrowCapacityUsd - state.debtUsd);
  const liqThresholdBps = state.liquidationThresholdBps ?? 8000;
  const health = state.debtUsd > 0
    ? (state.collateralUsd * (liqThresholdBps / 10_000)) / state.debtUsd
    : null;

  // General action permissions at policy level
  const borrowAllowedByPolicy =
    !state.protocolPaused &&
    state.assetEnabled &&
    state.ratchetState !== "DEFENSIVE" &&
    state.ratchetState !== "EMERGENCY" &&
    haltInference !== "HALTED_INFERRED" &&
    haltInference !== "ORACLE_UNAVAILABLE" &&
    refMarketState === "OPEN";

  const withdrawAllowedByPolicy =
    !state.protocolPaused &&
    state.assetEnabled &&
    (state.debtUsd === 0 || (state.ratchetState !== "DEFENSIVE" && state.ratchetState !== "EMERGENCY"));

  const depositAllowedByPolicy = true; // Always open for collateral top-up
  const repayAllowedByPolicy = true;   // Always open for debt retirement

  // 4. Authority Evaluation (Strict Manual vs Agent Separation)
  const isAgent = executionMode.mode === "AGENT";
  let authorityApplicable = isAgent;
  let authorityAllowed = true;
  let authorityStatus: StateCategory = isAgent ? "BLOCK" : "NOT_APPLICABLE";
  let authorityReason = isAgent
    ? "Autonomous strategy delegation required."
    : "Direct sovereign wallet execution. Agent authority not applicable.";
  let authorityLimits = null;

  if (isAgent) {
    const auth = state.agentAuthority;
    if (!auth || !auth.active) {
      authorityAllowed = false;
      authorityStatus = "BLOCK";
      authorityReason = "Autonomous strategy delegation is inactive or not configured.";
    } else if (auth.isExpired) {
      authorityAllowed = false;
      authorityStatus = "BLOCK";
      authorityReason = "Autonomous strategy delegation has expired.";
    } else {
      authorityAllowed = true;
      authorityStatus = "ALLOW";
      authorityReason = "Active delegated strategy authority verified.";
      authorityLimits = {
        maxBorrow: auth.maxBorrowLimitUsd,
        maxWithdraw: auth.maxWithdrawLimitUsd,
        riskBudget: auth.riskBudgetUsd,
        currentBorrowed: auth.currentBorrowedUsd,
      };
    }
  }

  // 5. Canonical Permission & Verdict Synthesis
  let verdictStatus: "ALLOW" | "BLOCK" | "UNAVAILABLE" = "ALLOW";
  let verdictReason = "All checks passed. Operation permitted.";
  let verdictCode: PermissionReasonCode = "ALLOWED";
  let source: "PROTOCOL" | "RATCHET" | "ORACLE" | "CAPITAL_POLICY" | "AUTHORITY" | "POSITION" = "PROTOCOL";

  // Repay & Recovery are universally allowed
  if (action === "repay") {
    if (state.debtUsd <= 0) {
      verdictStatus = "ALLOW";
      verdictCode = "ALLOWED";
      verdictReason = "Zero outstanding debt. Repayment is inactive.";
      source = "POSITION";
    } else {
      verdictStatus = "ALLOW";
      verdictCode = "ALLOWED";
      verdictReason = "Debt repayment is unconditionally permitted across all market states.";
      source = "CAPITAL_POLICY";
    }
  } else if (action === "deposit") {
    verdictStatus = "ALLOW";
    verdictCode = "ALLOWED";
    verdictReason = "Collateral deposit is unconditionally permitted across all market states.";
    source = "CAPITAL_POLICY";
  } else {
    // Risky / Capital-Increasing actions: Borrow, Withdraw, Swaps
    if (state.protocolPaused) {
      verdictStatus = "BLOCK";
      verdictCode = "PROTOCOL_PAUSED";
      verdictReason = "New borrowing and capital movements are paused by protocol administration.";
      source = "PROTOCOL";
    } else if (!state.assetEnabled) {
      verdictStatus = "BLOCK";
      verdictCode = "ASSET_DISABLED";
      verdictReason = `Market asset ${state.assetSymbol} is currently disabled.`;
      source = "PROTOCOL";
    } else if (action === "borrow" && state.collateralUsd <= 0) {
      verdictStatus = "BLOCK";
      verdictCode = "INSUFFICIENT_COLLATERAL";
      verdictReason = "Deposit collateral to activate borrowing power.";
      source = "POSITION";
    } else if (!globalOracleHealthy) {
      verdictStatus = "BLOCK";
      verdictCode = "ORACLE_UNAVAILABLE";
      verdictReason = "Global oracle failure or broader data-service degradation detected. Risky actions blocked.";
      source = "ORACLE";
    } else if (haltInference === "HALTED_INFERRED") {
      verdictStatus = "BLOCK";
      verdictCode = "SECURITY_HALT_INFERRED";
      verdictReason = "Security-level halt condition inferred from session expectations and feed freshness.";
      source = "ORACLE";
    } else if (freshness === "UNAVAILABLE") {
      verdictStatus = "UNAVAILABLE";
      verdictCode = "ORACLE_UNAVAILABLE";
      verdictReason = "Pyth oracle price is unavailable. Verification required.";
      source = "ORACLE";
    } else if (freshness === "STALE") {
      verdictStatus = "BLOCK";
      verdictCode = "STALE_ORACLE";
      verdictReason = `Pyth oracle price is stale (${ageSeconds}s old). Risky actions blocked until price update.`;
      source = "ORACLE";
    } else if (state.oracleConfBps > 100) {
      verdictStatus = "BLOCK";
      verdictCode = "CONFIDENCE_TOO_WIDE";
      verdictReason = `Oracle uncertainty interval (${state.oracleConfBps} bps) exceeds asset bound (100 bps).`;
      source = "ORACLE";
    } else if (refMarketState === "CLOSED") {
      verdictStatus = "BLOCK";
      verdictCode = "RISK_STATE_RESTRICTED";
      verdictReason = "Reference market is closed. Onchain trading remains available. Risk-increasing actions are restricted while oracle freshness is outside policy.";
      source = "CAPITAL_POLICY";
    } else if (action === "borrow" && (state.ratchetState === "DEFENSIVE" || state.ratchetState === "EMERGENCY")) {
      verdictStatus = "BLOCK";
      verdictCode = "BORROW_DISABLED";
      verdictReason = `Protocol containment: Borrowing blocked in ${state.ratchetState} state.`;
      source = "RATCHET";
    } else if (action === "borrow" && state.ratchetState === "RESTRICTED" && state.debtUsd > 0 && amountUsd > 0) {
      verdictStatus = "BLOCK";
      verdictCode = "RISK_STATE_RESTRICTED";
      verdictReason = "Risk Ratchet RESTRICTED: Additional borrowing throttled while holding debt.";
      source = "RATCHET";
    } else if (action === "withdraw" && state.debtUsd > 0 && (state.ratchetState === "DEFENSIVE" || state.ratchetState === "EMERGENCY")) {
      verdictStatus = "BLOCK";
      verdictCode = "WITHDRAW_DISABLED";
      verdictReason = `Collateral withdrawal blocked during ${state.ratchetState} state while holding debt.`;
      source = "RATCHET";
    } else if (action === "borrow" && availableCreditUsd <= 0) {
      verdictStatus = "BLOCK";
      verdictCode = "BORROW_LIMIT_EXCEEDED";
      verdictReason = "No remaining borrowing capacity.";
      source = "POSITION";
    } else if (action === "borrow" && amountUsd > availableCreditUsd) {
      verdictStatus = "BLOCK";
      verdictCode = "BORROW_LIMIT_EXCEEDED";
      verdictReason = `Requested amount exceeds available borrowing capacity ($${availableCreditUsd.toFixed(2)} USDC).`;
      source = "POSITION";
    } else if (action === "borrow" && state.vaultLiquidityUsd !== undefined && amountUsd > state.vaultLiquidityUsd) {
      verdictStatus = "BLOCK";
      verdictCode = "NO_PROTOCOL_LIQUIDITY";
      verdictReason = `Requested amount exceeds available protocol vault liquidity ($${state.vaultLiquidityUsd.toFixed(2)} USDC).`;
      source = "PROTOCOL";
    } else if (isAgent) {
      // Agent-specific authority constraints
      if (!authorityAllowed) {
        verdictStatus = "BLOCK";
        verdictCode = "AGENT_UNAUTHORIZED";
        verdictReason = authorityReason;
        source = "AUTHORITY";
      } else if (action === "borrow" && !state.agentAuthority?.allowedActions.borrow) {
        verdictStatus = "BLOCK";
        verdictCode = "AGENT_UNAUTHORIZED";
        verdictReason = "Strategy policy does not permit borrowing.";
        source = "AUTHORITY";
      } else if (
        action === "borrow" &&
        state.agentAuthority &&
        state.agentAuthority.currentBorrowedUsd + amountUsd > state.agentAuthority.maxBorrowLimitUsd
      ) {
        verdictStatus = "BLOCK";
        verdictCode = "BORROW_LIMIT_EXCEEDED";
        verdictReason = `Requested amount exceeds strategy delegated borrow limit ($${state.agentAuthority.maxBorrowLimitUsd}).`;
        source = "AUTHORITY";
      }
    }
  }

  return {
    assetMint: state.assetMint ?? "",
    assetSymbol: state.assetSymbol,
    slot: state.slot,
    blockTime: state.blockTime,
    executionMode,
    oracle: {
      price: state.oraclePrice,
      expo: state.oracleExpo ?? -8,
      confidence: state.oracleConf ?? 0,
      confBps: state.oracleConfBps,
      publishTime: state.oraclePublishTime,
      ageSeconds,
      ageSlots,
      freshness,
      oracleState: derivedOracleState,
      lastValidPrice: state.lastValidPrice ?? (state.oraclePrice > 0 ? state.oraclePrice : null),
      lastValidPublishTime: state.lastValidPublishTime ?? (state.oraclePublishTime > 0 ? state.oraclePublishTime : null),
      healthy: oracleHealthy,
    },
    market: {
      expectedSessionState,
      referenceState: refMarketState,
      onchainState: onchainMarketState,
      marketGuardState: state.ratchetState === "RESTRICTED" || refMarketState === "CLOSED" ? "RESTRICTED" : state.ratchetState,
      securityState: haltInference === "HALTED_INFERRED"
        ? "HALTED_INFERRED"
        : haltInference === "ORACLE_UNAVAILABLE"
        ? "ORACLE_UNAVAILABLE"
        : refMarketState === "CLOSED"
        ? "RESTRICTED"
        : "NORMAL",
      sessionOpen: refMarketState === "OPEN",
      haltInference,
      dataState: freshness === "UNAVAILABLE" ? "UNAVAILABLE" : freshness === "STALE" ? "STALE" : "ALLOW",
    },
    risk: {
      state: state.ratchetState,
      score: state.riskScore ?? 0,
      previousScore: state.previousRiskScore ?? 0,
      velocity: state.riskVelocity ?? 0,
      riskEpoch: state.riskEpoch ?? 0,
      reason: state.ratchetState === "SAFE" ? "Market metrics within nominal parameters." : `Ratchet adjusted to ${state.ratchetState}.`,
    },
    capitalPolicy: {
      borrowAllowed: borrowAllowedByPolicy,
      withdrawAllowed: withdrawAllowedByPolicy,
      depositAllowed: depositAllowedByPolicy,
      repayAllowed: repayAllowedByPolicy,
      maxBorrow: borrowCapacityUsd,
      maxWithdraw: Math.max(0, state.collateralUsd - (state.debtUsd > 0 ? state.debtUsd / maxLtv : 0)),
      maxLtv,
      maxNotional: borrowCapacityUsd,
    },
    position: {
      collateralUsd: state.collateralUsd,
      debtUsd: state.debtUsd,
      health,
      availableCreditUsd,
    },
    authority: {
      mode: isAgent ? "AGENT" : "MANUAL",
      applicable: authorityApplicable,
      allowed: authorityAllowed,
      status: authorityStatus,
      reason: authorityReason,
      limits: authorityLimits,
    },
    permission: {
      action,
      allowed: verdictStatus === "ALLOW",
      status: verdictStatus === "ALLOW" ? "ALLOW" : verdictStatus === "UNAVAILABLE" ? "UNAVAILABLE" : "BLOCK",
      reasonCode: verdictCode,
      message: verdictReason,
      source,
    },
    freshness: {
      chain: state.slot ?? 0,
      oracle: ageSeconds,
      market: nowSec,
      position: state.slot ?? 0,
      evaluatedAt,
    },
    verdict: {
      status: verdictStatus,
      reason: verdictReason,
      code: verdictCode,
      evaluatedAtSlot: state.slot,
    },
  };
}
