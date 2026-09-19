/**
 * Circuit Protocol — DBC Execution Trace Model
 *
 * Defines the step-by-step execution trace for all Meteora DBC actions.
 * Enforces that SIGN → SUCCESS is never skipped; each step corresponds
 * to real application or on-chain state.
 *
 * CRITICAL INVARIANT: preview/quote state is NEVER authorization.
 * A quote shown to the user is NOT a commitment to execute at that price.
 * Actual received amount MUST be read from on-chain post-CPI, not the quote.
 */

import { DbcActionType, DbcSwapQuote } from "./dbc";
import { PermissionResult } from "../permission-engine";

export type DbcTraceStep =
  | "INTENT"       // User or agent declared intent
  | "POLICY"       // Strategy policy evaluated
  | "PERMISSION"   // Circuit permission engine evaluated
  | "QUOTE"        // Swap quote computed
  | "SIGN"         // User signing wallet prompt displayed
  | "SUBMIT"       // Transaction broadcast to Solana RPC
  | "CPI"          // Cross-program invocation to Meteora DBC
  | "VERIFY"       // Post-CPI confirmation: actual >= minAmountOut checked
  | "CONFIRM"      // Transaction finalized on-chain
  | "FAILED";      // Terminal failure state

/** Monotonic step ordering — used to validate no steps are skipped. */
export const DBC_TRACE_STEP_ORDER: DbcTraceStep[] = [
  "INTENT",
  "POLICY",
  "PERMISSION",
  "QUOTE",
  "SIGN",
  "SUBMIT",
  "CPI",
  "VERIFY",
  "CONFIRM",
];

export interface DbcExecutionTrace {
  /** Unique trace ID (random — prevents enumeration) */
  id: string;
  /** Current execution step */
  step: DbcTraceStep;
  /** DBC action being executed */
  action: DbcActionType;
  /** Market symbol (e.g. "NVDA") */
  symbol: string;
  /** Amount being sent into the action (in token native units) */
  amountIn: bigint;
  /** Quote computed during QUOTE step */
  quote: DbcSwapQuote | null;
  /** Minimum output enforced in instruction (from quote.minAmountOut) */
  minAmountOut: bigint | null;
  /** On-chain transaction signature (set at SUBMIT or later) */
  signature: string | null;
  /**
   * Actual amount received from on-chain state after CPI.
   * Read from confirmed account state, NOT from the quote.
   * null until VERIFY step or later.
   */
  confirmedAmountOut: bigint | null;
  /** Human-readable failure reason if step === "FAILED" */
  failureReason: string | null;
  /** Permission engine result from PERMISSION step */
  permissionResult: PermissionResult | null;
  /** Unix timestamp (ms) when trace was started */
  startedAt: number;
  /** Unix timestamp (ms) when trace reached terminal state (CONFIRM or FAILED) */
  completedAt: number | null;
}

/** Creates a fresh execution trace at the INTENT step. */
export function createDbcTrace(params: {
  action: DbcActionType;
  symbol: string;
  amountIn: bigint;
}): DbcExecutionTrace {
  return {
    id: generateTraceId(),
    step: "INTENT",
    action: params.action,
    symbol: params.symbol,
    amountIn: params.amountIn,
    quote: null,
    minAmountOut: null,
    signature: null,
    confirmedAmountOut: null,
    failureReason: null,
    permissionResult: null,
    startedAt: Date.now(),
    completedAt: null,
  };
}

/**
 * Advances the trace to the next step.
 * Throws if the requested step is not the logical next step (prevents skipping).
 */
export function advanceTrace(
  trace: DbcExecutionTrace,
  nextStep: DbcTraceStep,
  updates?: Partial<DbcExecutionTrace>
): DbcExecutionTrace {
  if (nextStep === "FAILED") {
    return { ...trace, ...updates, step: "FAILED", completedAt: Date.now() };
  }

  const currentIdx = DBC_TRACE_STEP_ORDER.indexOf(trace.step);
  const nextIdx = DBC_TRACE_STEP_ORDER.indexOf(nextStep);

  if (nextIdx !== currentIdx + 1) {
    throw new Error(
      `[DbcTrace] Illegal step advancement: cannot advance from ${trace.step} to ${
        nextStep
      } (expected ${DBC_TRACE_STEP_ORDER[currentIdx + 1]})`
    );
  }

  const isTerminal = nextStep === "CONFIRM";
  return { ...trace, ...updates, step: nextStep, completedAt: isTerminal ? Date.now() : null };
}

/** Marks the trace as failed with a reason. */
export function failTrace(trace: DbcExecutionTrace, reason: string): DbcExecutionTrace {
  return { ...trace, step: "FAILED", failureReason: reason, completedAt: Date.now() };
}

/** Returns true if the trace is in a terminal state (CONFIRM or FAILED). */
export function isTraceTerminal(trace: DbcExecutionTrace): boolean {
  return trace.step === "CONFIRM" || trace.step === "FAILED";
}

/**
 * Verifies that actual received amount meets the minimum output requirement.
 * MUST be called at the VERIFY step before advancing to CONFIRM.
 */
export function verifyActualOutput(
  trace: DbcExecutionTrace,
  actualAmountOut: bigint
): { valid: boolean; reason?: string } {
  if (trace.minAmountOut === null) {
    return { valid: false, reason: "minAmountOut was never set — cannot verify output" };
  }
  if (actualAmountOut < trace.minAmountOut) {
    return {
      valid: false,
      reason: `Received ${actualAmountOut.toString()} tokens, which is less than minimum required ${trace.minAmountOut.toString()}.`,
    };
  }
  return { valid: true };
}

/** Human-readable label for each trace step */
export const DBC_TRACE_STEP_LABELS: Record<DbcTraceStep, string> = {
  INTENT: "Intent",
  POLICY: "Policy",
  PERMISSION: "Permission",
  QUOTE: "Quote",
  SIGN: "Signing",
  SUBMIT: "Broadcasting",
  CPI: "On-chain",
  VERIFY: "Verifying",
  CONFIRM: "Confirmed",
  FAILED: "Failed",
};

function generateTraceId(): string {
  return "trace_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
