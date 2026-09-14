/**
 * Circuit Protocol - Deterministic On-Chain Activity Pattern Engine
 *
 * Analyzes on-chain activity logs using explicit deterministic rules.
 * Generates neutral, evidence-based pattern intelligence without black-box inference.
 */

import { ActivityEvent, DetectedPattern } from "../domain/types";

export function detectActivityPatterns(events: ActivityEvent[]): DetectedPattern[] {
  if (!events || events.length === 0) return [];

  const patterns: DetectedPattern[] = [];
  const sorted = [...events].sort((a, b) => b.timestamp - a.timestamp); // newest first

  // 1. Rapid Collateral Changes: 3+ deposit or withdraw events within 5 minutes (300,000 ms)
  const collateralEvents = sorted.filter(
    (e) => e.type === "DEPOSIT" || e.type === "WITHDRAW"
  );
  for (let i = 0; i < collateralEvents.length; i++) {
    const windowStart = collateralEvents[i].timestamp;
    const inWindow = collateralEvents.filter(
      (e) => Math.abs(windowStart - e.timestamp) <= 300_000
    );
    if (inWindow.length >= 3) {
      const id = `rapid-collateral-${inWindow[0].id}`;
      if (!patterns.some((p) => p.id === id)) {
        patterns.push({
          id,
          name: "RAPID COLLATERAL CHANGES",
          severity: "warning",
          confidence: "HIGH",
          firstSeen: Math.min(...inWindow.map((e) => e.timestamp)),
          lastSeen: Math.max(...inWindow.map((e) => e.timestamp)),
          evidence: inWindow.map(
            (e) =>
              `${e.action} ${e.amountUi ?? ""} ${e.assetSymbol} (${new Date(
                e.timestamp
              ).toLocaleTimeString()})`
          ),
          timeWindow: `${Math.round(
            (Math.max(...inWindow.map((e) => e.timestamp)) -
              Math.min(...inWindow.map((e) => e.timestamp))) /
              1000
          )}s`,
          affectedAssets: Array.from(new Set(inWindow.map((e) => e.assetSymbol))),
          explanation:
            "3 or more collateral transactions were executed within 5 minutes. Portfolio composition and risk factors changed rapidly.",
        });
      }
      break;
    }
  }

  // 2. Frequent Borrow/Repay Cycles: at least 1 borrow and 1 repay within 10 minutes (600,000 ms)
  const creditEvents = sorted.filter((e) => e.type === "BORROW" || e.type === "REPAY");
  const borrows = creditEvents.filter((e) => e.type === "BORROW");
  const repays = creditEvents.filter((e) => e.type === "REPAY");

  if (borrows.length >= 1 && repays.length >= 1) {
    const latestBorrow = borrows[0];
    const latestRepay = repays[0];
    const diff = Math.abs(latestBorrow.timestamp - latestRepay.timestamp);
    if (diff <= 600_000) {
      patterns.push({
        id: `frequent-credit-${latestBorrow.id}`,
        name: "RAPID CREDIT CYCLE",
        severity: "info",
        confidence: "HIGH",
        firstSeen: Math.min(latestBorrow.timestamp, latestRepay.timestamp),
        lastSeen: Math.max(latestBorrow.timestamp, latestRepay.timestamp),
        evidence: [
          `Borrow: ${latestBorrow.amountUi ?? ""} ${latestBorrow.assetSymbol}`,
          `Repay: ${latestRepay.amountUi ?? ""} ${latestRepay.assetSymbol}`,
        ],
        timeWindow: `${Math.round(diff / 1000)}s`,
        affectedAssets: Array.from(
          new Set([latestBorrow.assetSymbol, latestRepay.assetSymbol])
        ),
        explanation:
          "Debt was drawn and subsequently repaid within 10 minutes. Active leverage and liquidity management observed.",
      });
    }
  }

  // 3. Repeated Failed Actions: 2+ failed transactions within 15 minutes
  const failedEvents = sorted.filter((e) => e.status === "FAILED");
  if (failedEvents.length >= 2) {
    const windowFails = failedEvents.filter(
      (e) => Math.abs(failedEvents[0].timestamp - e.timestamp) <= 900_000
    );
    if (windowFails.length >= 2) {
      patterns.push({
        id: `repeated-failures-${windowFails[0].id}`,
        name: "REPEATED TRANSACTION REJECTIONS",
        severity: "critical",
        confidence: "HIGH",
        firstSeen: Math.min(...windowFails.map((e) => e.timestamp)),
        lastSeen: Math.max(...windowFails.map((e) => e.timestamp)),
        evidence: windowFails.map(
          (e) =>
            `Failed ${e.action} on ${e.assetSymbol} (${new Date(
              e.timestamp
            ).toLocaleTimeString()})`
        ),
        timeWindow: `${Math.round(
          (Math.max(...windowFails.map((e) => e.timestamp)) -
            Math.min(...windowFails.map((e) => e.timestamp))) /
            1000
        )}s`,
        affectedAssets: Array.from(new Set(windowFails.map((e) => e.assetSymbol))),
        explanation:
          "Multiple consecutive transaction attempts were rejected or reverted on-chain. Verify gas funds, health factor threshold, or protocol risk limits.",
      });
    }
  }

  // 4. Faucet Rate Limit Burst: 3+ faucet claims within 10 minutes
  const faucetClaims = sorted.filter((e) => e.type === "FAUCET_CLAIM");
  if (faucetClaims.length >= 3) {
    const burst = faucetClaims.filter(
      (e) => Math.abs(faucetClaims[0].timestamp - e.timestamp) <= 600_000
    );
    if (burst.length >= 3) {
      patterns.push({
        id: `faucet-burst-${burst[0].id}`,
        name: "TESTNET FAUCET BURST",
        severity: "info",
        confidence: "HIGH",
        firstSeen: Math.min(...burst.map((e) => e.timestamp)),
        lastSeen: Math.max(...burst.map((e) => e.timestamp)),
        evidence: burst.map(
          (e) =>
            `Minted ${e.amountUi ?? ""} ${e.assetSymbol} (${new Date(
              e.timestamp
            ).toLocaleTimeString()})`
        ),
        timeWindow: `${Math.round(
          (Math.max(...burst.map((e) => e.timestamp)) -
            Math.min(...burst.map((e) => e.timestamp))) /
            1000
        )}s`,
        affectedAssets: Array.from(new Set(burst.map((e) => e.assetSymbol))),
        explanation:
          "Rapid sequence of Devnet test collateral claims. Assets will enter per-wallet rate limit cooldown.",
      });
    }
  }

  // 5. Emergency Interaction: Any action attempted during DEFENSIVE or EMERGENCY state
  const emergencyEvents = sorted.filter(
    (e) => e.riskStateAtAction === "DEFENSIVE" || e.riskStateAtAction === "EMERGENCY"
  );
  if (emergencyEvents.length > 0) {
    patterns.push({
      id: `emergency-risk-action-${emergencyEvents[0].id}`,
      name: "RESTRICTED-STATE INTERACTION",
      severity: "critical",
      confidence: "HIGH",
      firstSeen: Math.min(...emergencyEvents.map((e) => e.timestamp)),
      lastSeen: Math.max(...emergencyEvents.map((e) => e.timestamp)),
      evidence: emergencyEvents.map(
        (e) =>
          `Action: ${e.action} during ${e.riskStateAtAction} risk state (${e.status})`
      ),
      timeWindow: "Session",
      affectedAssets: Array.from(new Set(emergencyEvents.map((e) => e.assetSymbol))),
      explanation:
        "Transaction initiated while Risk Ratchet was in Defensive or Emergency state. Protocol safety invariants actively enforced on-chain.",
    });
  }

  return patterns;
}
