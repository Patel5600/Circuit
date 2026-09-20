/**
 * Circuit Protocol — Specialized Background Sentinels
 *
 * 9 specialized observers evaluating real protocol, market, and on-chain telemetry.
 * Operates event-driven filtering: minor ticks pass silently; regime shifts trigger evaluation.
 */

import { calculateMinimumRestorationDebt } from "../recovery-engine";
import { protocolEventBus, createEvent } from "../realtime/event-bus";

export type SentinelId =
  | "MARKET_SENTINEL"
  | "ORACLE_SENTINEL"
  | "RISK_SENTINEL"
  | "POSITION_SENTINEL"
  | "CREDIT_SENTINEL"
  | "PERMISSION_SENTINEL"
  | "DBC_SENTINEL"
  | "RECOVERY_SENTINEL"
  | "TRANSACTION_SENTINEL";

export const ALL_SENTINELS: SentinelId[] = [
  "MARKET_SENTINEL",
  "ORACLE_SENTINEL",
  "RISK_SENTINEL",
  "POSITION_SENTINEL",
  "CREDIT_SENTINEL",
  "PERMISSION_SENTINEL",
  "DBC_SENTINEL",
  "RECOVERY_SENTINEL",
  "TRANSACTION_SENTINEL",
];

export interface SentinelFinding {
  sentinel: SentinelId;
  triggered: boolean;
  severity: "INFO" | "WARNING" | "CRITICAL";
  headline: string;
  detail: string;
  metricValue?: number | string;
  threshold?: number | string;
  suggestedAction?: string;
  timestamp: number;
}

export interface SentinelEvaluationParams {
  markets: Record<string, { price: number; change24h: number; oracleFreshness: string; confBps?: number }>;
  riskState: string;
  totalCollateralUsd: number;
  totalDebtUsd: number;
  availableCreditUsd: number;
  healthFactor: number | null;
  agentCreditsAvailable: number;
  dbcQuoteReserveUsd?: number;
  dbcThresholdUsd?: number;
  dbcLifecycle?: string;
  lastKnownRiskState?: string;
}

export class CircuitSentinelEngine {
  private lastEvaluatedRiskState: string | null = null;
  private lastReportedHf: number | null = null;

  /**
   * Run full sentinel evaluation against real protocol state.
   */
  public evaluate(params: SentinelEvaluationParams): SentinelFinding[] {
    const findings: SentinelFinding[] = [];
    const now = Date.now();

    // 1. RISK_SENTINEL: Monotonic Ratchet transition detector
    if (
      (this.lastEvaluatedRiskState && this.lastEvaluatedRiskState !== params.riskState) ||
      params.riskState === "DEFENSIVE" ||
      params.riskState === "EMERGENCY"
    ) {
      const isEscalation = ["DEFENSIVE", "EMERGENCY"].includes(params.riskState);
      findings.push({
        sentinel: "RISK_SENTINEL",
        triggered: true,
        severity: isEscalation ? "CRITICAL" : "WARNING",
        headline: `Risk Ratchet in ${params.riskState} regime`,
        detail: `Capital Policy adjusted automatically. Borrowing is ${params.riskState === "DEFENSIVE" || params.riskState === "EMERGENCY" ? "suspended" : params.riskState === "RESTRICTED" ? "capped at 50%" : "fully available"}.`,
        metricValue: params.riskState,
        threshold: this.lastEvaluatedRiskState || "SAFE",
        suggestedAction: isEscalation ? "Review Capital Policy and prepare recovery" : undefined,
        timestamp: now,
      });
    }
    this.lastEvaluatedRiskState = params.riskState;

    // 2. ORACLE_SENTINEL: Pyth feed latency and confidence interval check
    for (const [sym, data] of Object.entries(params.markets)) {
      if (data.oracleFreshness !== "VALID" && data.oracleFreshness !== "LIVE" && data.oracleFreshness !== "RECENT") {
        findings.push({
          sentinel: "ORACLE_SENTINEL",
          triggered: true,
          severity: "CRITICAL",
          headline: `Pyth Oracle staleness detected on ${sym}`,
          detail: `Oracle status is ${data.oracleFreshness}. Risk-increasing actions on ${sym} are blocked by MarketGuard.`,
          metricValue: data.oracleFreshness,
          timestamp: now,
        });
      }
      if (data.confBps && data.confBps > 150) {
        findings.push({
          sentinel: "ORACLE_SENTINEL",
          triggered: true,
          severity: "WARNING",
          headline: `Wide Pyth confidence interval on ${sym} (±${data.confBps} bps)`,
          detail: `Confidence interval exceeds nominal 150 bps threshold. Risk budget adjusted.`,
          metricValue: data.confBps,
          threshold: 150,
          timestamp: now,
        });
      }
    }

    // 3. RECOVERY_SENTINEL: Mathematical debt restoration advisor
    if (params.totalDebtUsd > 0 && params.healthFactor !== null && params.healthFactor < 1.05) {
      const dStar = calculateMinimumRestorationDebt(params.totalCollateralUsd, params.totalDebtUsd, 0.80, 1.05);
      findings.push({
        sentinel: "RECOVERY_SENTINEL",
        triggered: true,
        severity: "CRITICAL",
        headline: `Portfolio in Liquidation Danger: HF ${params.healthFactor.toFixed(3)} < 1.05`,
        detail: `Mathematical recovery requires $${dStar.toLocaleString()} debt repayment to restore HF to 1.05 boundary.`,
        metricValue: params.healthFactor,
        threshold: 1.05,
        suggestedAction: `Repay $${dStar.toLocaleString()} USDC`,
        timestamp: now,
      });
    }

    // 4. POSITION_SENTINEL: LTV proximity tracking
    if (params.totalCollateralUsd > 0 && params.totalDebtUsd > 0) {
      const currentLtvPct = (params.totalDebtUsd / params.totalCollateralUsd) * 100;
      if (currentLtvPct >= 65) {
        findings.push({
          sentinel: "POSITION_SENTINEL",
          triggered: true,
          severity: "WARNING",
          headline: `Loan-to-Value elevated: ${currentLtvPct.toFixed(1)}%`,
          detail: `LTV exceeds 65% monitoring limit. Further borrows should be constrained.`,
          metricValue: currentLtvPct,
          threshold: 65,
          timestamp: now,
        });
      }
    }

    // 5. CREDIT_SENTINEL: Agent Compute budget depletion check
    if (params.agentCreditsAvailable <= 10) {
      findings.push({
        sentinel: "CREDIT_SENTINEL",
        triggered: true,
        severity: params.agentCreditsAvailable <= 0 ? "CRITICAL" : "WARNING",
        headline: params.agentCreditsAvailable <= 0 ? "Agent compute budget exhausted" : `Low agent budget: ${params.agentCreditsAvailable} credits remaining`,
        detail: params.agentCreditsAvailable <= 0
          ? "Autonomous reasoning paused. Manual protocol deposits, borrows, repays, and withdrawals remain 100% operational."
          : "Circuit Lite preferred. Review remaining budget.",
        metricValue: params.agentCreditsAvailable,
        threshold: 10,
        timestamp: now,
      });
    }

    // 6. DBC_SENTINEL: Meteora Dynamic Bonding Curve progress
    if (params.dbcQuoteReserveUsd && params.dbcThresholdUsd) {
      const pct = (params.dbcQuoteReserveUsd / params.dbcThresholdUsd) * 100;
      if (pct >= 90 && params.dbcLifecycle !== "DAMM_V2") {
        findings.push({
          sentinel: "DBC_SENTINEL",
          triggered: true,
          severity: "INFO",
          headline: `Meteora DBC pool at ${pct.toFixed(1)}% of migration threshold`,
          detail: `$${params.dbcQuoteReserveUsd.toLocaleString()} / $${params.dbcThresholdUsd.toLocaleString()} USDC accumulated toward DAMM v2 graduation.`,
          metricValue: pct,
          threshold: 100,
          timestamp: now,
        });
      }
    }

    // Emit triggered events to protocol event bus
    for (const f of findings) {
      if (f.triggered && f.severity === "CRITICAL") {
        protocolEventBus.emit(
          createEvent("RISK_TRANSITION", f.sentinel, f.headline, {
            detail: f.detail,
          })
        );
      }
    }

    return findings;
  }
}

export const circuitSentinelEngine = new CircuitSentinelEngine();
