/**
 * Circuit Protocol — Server-Side Execution Engine
 *
 * Deterministic condition evaluation + Circuit permission check + transaction.
 * Used by both /api/automation/tick (Cron) and /api/automation/execute (manual).
 *
 * Pipeline:
 *   OBSERVE → EVALUATE CONDITION → PERMISSION CHECK → EXECUTE → CONFIRM → RECORD
 */

import { Connection, PublicKey, Keypair, Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import type { AutomationTask, TaskResult, WatchCondition, ExecutionOutcome } from "../../app/src/lib/automation/types";

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const PYTH_NVDA_FEED = "0x64ee2bc923a105553a1a9e5256e54f86641215be11b7d59048a1c97a55c2f826";
const PYTH_API = "https://hermes.pyth.network/v2/updates/price/latest";

// ── Devnet State Reader ────────────────────────────────────────────────────

interface PortfolioState {
  healthFactor: number | null;
  collateralUsd: number;
  debtUsd: number;
  borrowCapacityUsd: number;
  riskState: string;
  oracleFreshnessMs: number;
  ltvBps: number;
}

async function fetchPortfolioState(ownerAddress: string): Promise<PortfolioState> {
  const conn = new Connection(RPC_URL, "confirmed");

  // Read SOL balance as proxy for collateral (real positions need program account reads)
  let solBalance = 0;
  try {
    const pk = new PublicKey(ownerAddress);
    const lamports = await conn.getBalance(pk, "confirmed");
    solBalance = lamports / 1e9;
  } catch { /* RPC timeout — continue with zeros */ }

  // Fetch Pyth price for NVDA
  let nvdaPrice = 0;
  let freshnessMs = 0;
  try {
    const resp = await fetch(`${PYTH_API}?ids[]=${PYTH_NVDA_FEED}`);
    if (resp.ok) {
      const data = await resp.json() as { parsed?: Array<{ price: { price: string; expo: number; publish_time: number } }> };
      const parsed = data.parsed?.[0];
      if (parsed) {
        nvdaPrice = parseFloat(parsed.price.price) * Math.pow(10, parsed.price.expo);
        freshnessMs = (Date.now() / 1000 - parsed.price.publish_time) * 1000;
      }
    }
  } catch { /* oracle read failed */ }

  // Simplified health factor: assume collateral = SOL * $200 (devnet proxy)
  const collateralUsd = solBalance * 200;
  const debtUsd = 0; // Would read from program accounts
  const healthFactor = debtUsd > 0 ? (collateralUsd * 0.8) / debtUsd : null;
  const ltvBps = collateralUsd > 0 ? Math.round((debtUsd / collateralUsd) * 10000) : 0;
  const borrowCapacityUsd = Math.max(0, collateralUsd * 0.7 - debtUsd);

  // Risk state from freshness (simplified — real reads from program state)
  let riskState = "SAFE";
  if (freshnessMs > 120_000) riskState = "DEFENSIVE";
  else if (freshnessMs > 60_000) riskState = "RESTRICTED";

  return { healthFactor, collateralUsd, debtUsd, borrowCapacityUsd, riskState, oracleFreshnessMs: freshnessMs, ltvBps };
}

// ── Condition Evaluator ────────────────────────────────────────────────────

function evaluateCondition(
  cond: WatchCondition,
  state: PortfolioState
): { met: boolean; actualValue: number | string } {
  let actual: number | string = 0;

  switch (cond.field) {
    case "health_factor": actual = state.healthFactor ?? 999; break;
    case "risk_state":    actual = state.riskState; break;
    case "borrow_capacity_usd": actual = state.borrowCapacityUsd; break;
    case "collateral_usd": actual = state.collateralUsd; break;
    case "debt_usd":      actual = state.debtUsd; break;
    case "oracle_staleness_ms": actual = state.oracleFreshnessMs; break;
    case "ltv_bps":       actual = state.ltvBps; break;
    case "authority_expiry_ts": actual = Date.now() / 1000; break;
    default: actual = 0;
  }

  const threshold = cond.threshold;
  let met = false;

  if (typeof actual === "string" || typeof threshold === "string") {
    switch (cond.operator) {
      case "eq":  met = String(actual) === String(threshold); break;
      case "neq": met = String(actual) !== String(threshold); break;
      default:    met = false;
    }
  } else {
    const a = actual as number;
    const b = threshold as number;
    switch (cond.operator) {
      case "lt":  met = a < b;  break;
      case "lte": met = a <= b; break;
      case "gt":  met = a > b;  break;
      case "gte": met = a >= b; break;
      case "eq":  met = a === b; break;
      case "neq": met = a !== b; break;
    }
  }

  return { met, actualValue: actual };
}

// ── Permission Check ───────────────────────────────────────────────────────

function checkAutomationPermission(
  task: AutomationTask,
  state: PortfolioState
): { allowed: boolean; reasonCode: string } {
  // OBSERVE/ANALYZE/REPORT never need authority
  if (["OBSERVE", "ANALYZE", "REPORT", "WATCH"].includes(task.type)) {
    return { allowed: true, reasonCode: "ALLOWED" };
  }

  // Risk state blocks
  if (state.riskState === "EMERGENCY") {
    if (["BORROW", "WITHDRAW"].includes(task.type)) {
      return { allowed: false, reasonCode: "RISK_STATE_RESTRICTED" };
    }
  }
  if (state.riskState === "DEFENSIVE") {
    if (task.type === "BORROW") {
      return { allowed: false, reasonCode: "BORROW_DISABLED_BY_RISK_STATE" };
    }
  }

  // Daily execution limit
  if (task.executionsToday >= task.maxExecutionsPerDay) {
    return { allowed: false, reasonCode: "DAILY_LIMIT_EXCEEDED" };
  }

  // Consecutive failures
  if (task.consecutiveFailures >= task.maxConsecutiveFailures) {
    return { allowed: false, reasonCode: "CONSECUTIVE_FAILURES_EXCEEDED" };
  }

  // Policy amount bounds
  if (task.policy) {
    if (task.policy.maxAmountPerActionUsd <= 0) {
      return { allowed: false, reasonCode: "POLICY_AMOUNT_ZERO" };
    }
  }

  return { allowed: true, reasonCode: "ALLOWED" };
}

// ── Transaction Executor ───────────────────────────────────────────────────

async function executeAgentTransaction(
  task: AutomationTask,
  state: PortfolioState,
  executionId: string
): Promise<{ txSignature: string | null; error: string | null }> {
  const signerSecret = process.env.AGENT_SIGNER_SECRET;
  if (!signerSecret) {
    return { txSignature: null, error: "AGENT_SIGNER_NOT_CONFIGURED" };
  }

  try {
    const signerKeypair = Keypair.fromSecretKey(bs58.decode(signerSecret));
    const conn = new Connection(RPC_URL, "confirmed");

    // For OBSERVE/ANALYZE tasks: no transaction needed
    if (["OBSERVE", "ANALYZE", "REPORT", "WATCH"].includes(task.type)) {
      return { txSignature: null, error: null };
    }

    // Real transaction would use the Circuit program here:
    // program.methods.borrow/repay/deposit/withdraw(...)
    // For now: build a minimal no-op tx to verify the signer works
    const tx = new Transaction();
    tx.feePayer = signerKeypair.publicKey;
    const { blockhash } = await conn.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    // tx.add(circuitInstruction) would go here
    // Without the program instruction, we confirm the signer is valid but don't submit
    return { txSignature: null, error: "PROGRAM_INSTRUCTION_REQUIRED" };
  } catch (err) {
    return { txSignature: null, error: String(err) };
  }
}

// ── Main Pipeline ──────────────────────────────────────────────────────────

export async function runTaskPipeline(task: AutomationTask): Promise<TaskResult> {
  const startMs = Date.now();
  const executionId = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;

  // Check expiry
  if (task.expiresAt && Date.now() > task.expiresAt) {
    return {
      taskId: task.id, executionId,
      outcome: "FAILED" as ExecutionOutcome,
      reasonCode: "TASK_EXPIRED",
      conditionMet: false,
      timestamp: Date.now(), durationMs: Date.now() - startMs,
    };
  }

  // 1. OBSERVE — read real Devnet state
  let state: PortfolioState;
  try {
    state = await fetchPortfolioState(task.owner);
  } catch {
    return {
      taskId: task.id, executionId,
      outcome: "FAILED" as ExecutionOutcome,
      reasonCode: "RPC_ERROR",
      conditionMet: false,
      timestamp: Date.now(), durationMs: Date.now() - startMs,
    };
  }

  // 2. OBSERVE-only tasks: record and return
  if (task.type === "OBSERVE" || task.type === "ANALYZE" || task.type === "REPORT") {
    return {
      taskId: task.id, executionId,
      outcome: "OBSERVED" as ExecutionOutcome,
      reasonCode: "ALLOWED",
      conditionMet: false,
      stateAfter: { healthFactor: state.healthFactor ?? "N/A", riskState: state.riskState, collateralUsd: state.collateralUsd },
      timestamp: Date.now(), durationMs: Date.now() - startMs,
    };
  }

  // 3. EVALUATE condition (if task has one)
  let conditionMet = true;
  let actualValue: number | string = 0;
  if (task.condition) {
    const evalResult = evaluateCondition(task.condition, state);
    conditionMet = evalResult.met;
    actualValue = evalResult.actualValue;
  }

  if (!conditionMet) {
    return {
      taskId: task.id, executionId,
      outcome: "CONDITION_NOT_MET" as ExecutionOutcome,
      reasonCode: "CONDITION_NOT_MET",
      conditionValue: actualValue,
      conditionMet: false,
      stateAfter: { riskState: state.riskState, healthFactor: state.healthFactor ?? "N/A" },
      timestamp: Date.now(), durationMs: Date.now() - startMs,
    };
  }

  // 4. CIRCUIT PERMISSION CHECK
  const { allowed, reasonCode } = checkAutomationPermission(task, state);
  if (!allowed) {
    return {
      taskId: task.id, executionId,
      outcome: "PERMISSION_DENIED" as ExecutionOutcome,
      reasonCode,
      conditionValue: actualValue,
      conditionMet: true,
      actionProposed: task.type,
      timestamp: Date.now(), durationMs: Date.now() - startMs,
    };
  }

  // 5. EXECUTE
  const amount = task.policy?.maxAmountPerActionUsd ?? 0;
  const { txSignature, error } = await executeAgentTransaction(task, state, executionId);

  if (error === "AGENT_SIGNER_NOT_CONFIGURED") {
    return {
      taskId: task.id, executionId,
      outcome: "BLOCKED_NO_SIGNER" as ExecutionOutcome,
      reasonCode: "AGENT_SIGNER_NOT_CONFIGURED",
      conditionValue: actualValue,
      conditionMet: true,
      actionProposed: `${task.type} $${amount.toFixed(2)}`,
      timestamp: Date.now(), durationMs: Date.now() - startMs,
    };
  }

  if (error) {
    return {
      taskId: task.id, executionId,
      outcome: "FAILED" as ExecutionOutcome,
      reasonCode: error,
      conditionValue: actualValue,
      conditionMet: true,
      actionProposed: `${task.type} $${amount.toFixed(2)}`,
      timestamp: Date.now(), durationMs: Date.now() - startMs,
    };
  }

  return {
    taskId: task.id, executionId,
    outcome: txSignature ? "CONFIRMED" : "SUBMITTED",
    reasonCode: "ALLOWED",
    conditionValue: actualValue,
    conditionMet: true,
    actionProposed: `${task.type} $${amount.toFixed(2)}`,
    txSignature: txSignature ?? undefined,
    txStatus: txSignature ? "CONFIRMED" : "SUBMITTED",
    stateAfter: { riskState: state.riskState, healthFactor: state.healthFactor ?? "N/A" },
    timestamp: Date.now(), durationMs: Date.now() - startMs,
  };
}
