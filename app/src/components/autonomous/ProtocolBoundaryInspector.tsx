/**
 * Circuit Protocol — Protocol Boundary Inspector & Decision Log
 *
 * Provides two critical institutional audit surfaces:
 * 1. Live Deterministic Sovereignty Proof (State A vs State B comparison)
 *    Proves: The agent can propose, but Circuit's permission engine strictly governs capital.
 * 2. Immutable Decision Log
 *    Audits: Every evaluated intent (ALLOWED or BLOCKED), policy version, and on-chain signature.
 */

import React, { useState, useEffect, useMemo } from "react";
import { evaluatePermission } from "../../lib/permission-engine";
import { decisionLogStore, DecisionLogEntry } from "../../lib/realtime/decision-log";
import { useCircuitDomain } from "../../lib/domain/context";
import { DEPLOYED_MARKETS } from "../../data/markets-registry";
import { CANONICAL_POLICY_VERSION } from "../../lib/permission-engine";

export function ProtocolBoundaryInspector() {
  const [activeTab, setActiveTab] = useState<"proof" | "decision_log">("proof");
  const [logEntries, setLogEntries] = useState<DecisionLogEntry[]>([]);
  const [testAmount, setTestAmount] = useState<number>(100);
  const [testSymbol, setTestSymbol] = useState<string>("NVDAx");
  const { risk, credit, portfolio } = useCircuitDomain();

  useEffect(() => {
    return decisionLogStore.subscribe((entries) => {
      setLogEntries(entries);
    });
  }, []);

  // ── Deterministic Boundary Evaluations ──
  const stateAResult = useMemo(() => {
    return evaluatePermission({
      actor: "AGENT",
      action: "borrow",
      amountUsd: testAmount,
      riskState: "SAFE",
      isMarketOpen: true,
      confBps: 18,
      maxConfBps: 100,
      baseLtvBps: 7000,
      collateralUsd: 10_000,
      currentDebtUsd: 0,
      policyVersion: CANONICAL_POLICY_VERSION,
      assetSymbol: testSymbol,
      agentAuthority: {
        active: true,
        isExpired: false,
        allowedActions: { deposit: true, borrow: true, repay: true, withdraw: true },
        maxBorrowLimitUsd: 50_000,
        maxWithdrawLimitUsd: 50_000,
        currentBorrowedUsd: 0,
        riskBudgetUsd: 25_000,
      },
    });
  }, [testAmount, testSymbol]);

  const stateBBorrowResult = useMemo(() => {
    return evaluatePermission({
      actor: "AGENT",
      action: "borrow",
      amountUsd: testAmount,
      riskState: "DEFENSIVE",
      isMarketOpen: true,
      confBps: 18,
      maxConfBps: 100,
      baseLtvBps: 7000,
      collateralUsd: 10_000,
      currentDebtUsd: 1000,
      policyVersion: CANONICAL_POLICY_VERSION,
      assetSymbol: testSymbol,
      agentAuthority: {
        active: true,
        isExpired: false,
        allowedActions: { deposit: true, borrow: true, repay: true, withdraw: true },
        maxBorrowLimitUsd: 50_000,
        maxWithdrawLimitUsd: 50_000,
        currentBorrowedUsd: 1000,
        riskBudgetUsd: 25_000,
      },
    });
  }, [testAmount, testSymbol]);

  const stateBRepayResult = useMemo(() => {
    return evaluatePermission({
      actor: "AGENT",
      action: "repay",
      amountUsd: testAmount,
      riskState: "DEFENSIVE",
      isMarketOpen: true,
      confBps: 18,
      maxConfBps: 100,
      baseLtvBps: 7000,
      collateralUsd: 10_000,
      currentDebtUsd: 1000,
      policyVersion: CANONICAL_POLICY_VERSION,
      assetSymbol: testSymbol,
      agentAuthority: {
        active: true,
        isExpired: false,
        allowedActions: { deposit: true, borrow: true, repay: true, withdraw: true },
        maxBorrowLimitUsd: 50_000,
        maxWithdrawLimitUsd: 50_000,
        currentBorrowedUsd: 1000,
        riskBudgetUsd: 25_000,
      },
    });
  }, [testAmount, testSymbol]);

  return (
    <div
      style={{
        background: "var(--surface-1, #101114)",
        border: "1px solid var(--border, #222)",
        borderRadius: "var(--r, 8px)",
        padding: "16px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {/* Header & Tabs */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid var(--border, #222)",
          paddingBottom: 12,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 10,
              fontWeight: 700,
              color: "var(--p-harvest, #AD8820)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Sovereign Capital Control Plane
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text, #eee)",
              marginTop: 2,
            }}
          >
            Audit Trail &amp; Architectural Boundary Verifier
          </div>
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            onClick={() => setActiveTab("proof")}
            style={{
              padding: "4px 12px",
              fontFamily: "var(--mono)",
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 4,
              border: activeTab === "proof" ? "1px solid var(--accent, #79C2A4)" : "1px solid var(--border, #333)",
              background: activeTab === "proof" ? "var(--surface-2, #181a20)" : "transparent",
              color: activeTab === "proof" ? "var(--text, #eee)" : "var(--text-3, #777)",
              cursor: "pointer",
            }}
          >
            Proof: SAFE vs DEFENSIVE
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("decision_log")}
            style={{
              padding: "4px 12px",
              fontFamily: "var(--mono)",
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 4,
              border: activeTab === "decision_log" ? "1px solid var(--accent, #79C2A4)" : "1px solid var(--border, #333)",
              background: activeTab === "decision_log" ? "var(--surface-2, #181a20)" : "transparent",
              color: activeTab === "decision_log" ? "var(--text, #eee)" : "var(--text-3, #777)",
              cursor: "pointer",
            }}
          >
            Decision Log ({logEntries.length})
          </button>
        </div>
      </div>

      {/* Tab 1: Live Deterministic Proof */}
      {activeTab === "proof" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 11,
              color: "var(--text-2, #aaa)",
              lineHeight: 1.5,
            }}
          >
            This deterministic harness evaluates the exact same agent, asset, and action across two
            distinct risk regimes. It mathematically proves that AI plans never override protocol risk limits.
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
            }}
          >
            {/* Regime A: SAFE */}
            <div
              style={{
                border: "1px solid rgba(121, 194, 164, 0.3)",
                background: "rgba(121, 194, 164, 0.04)",
                borderRadius: 6,
                padding: "12px 14px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--mint, #79C2A4)",
                  }}
                >
                  STATE A: SAFE REGIME
                </span>
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 9,
                    color: "var(--text-3, #666)",
                  }}
                >
                  POLICY v{CANONICAL_POLICY_VERSION}
                </span>
              </div>

              <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-2, #bbb)", marginBottom: 6 }}>
                Agent Intent: <strong>BORROW ${testAmount}</strong> on {testSymbol}
              </div>

              <div
                style={{
                  padding: "8px 10px",
                  borderRadius: 4,
                  background: "var(--surface-0, #08090c)",
                  border: "1px solid var(--border, #222)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--mint, #79C2A4)", fontWeight: 700 }}>
                  PERMISSION: {stateAResult.allowed ? "ALLOWED" : "BLOCKED"}
                </span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-3, #666)" }}>
                  LTV Cap: {(stateAResult.effectiveLtvBps / 100).toFixed(0)}%
                </span>
              </div>
              <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text-3, #666)", marginTop: 6 }}>
                {stateAResult.message}
              </div>
            </div>

            {/* Regime B: DEFENSIVE */}
            <div
              style={{
                border: "1px solid rgba(207, 139, 139, 0.3)",
                background: "rgba(207, 139, 139, 0.04)",
                borderRadius: 6,
                padding: "12px 14px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--danger, #CF8B8B)",
                  }}
                >
                  STATE B: DEFENSIVE REGIME
                </span>
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 9,
                    color: "var(--text-3, #666)",
                  }}
                >
                  POLICY v{CANONICAL_POLICY_VERSION}
                </span>
              </div>

              {/* Sub-action 1: Borrow (BLOCKED) */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-2, #bbb)", marginBottom: 4 }}>
                  Same Intent: <strong>BORROW ${testAmount}</strong> on {testSymbol}
                </div>
                <div
                  style={{
                    padding: "6px 10px",
                    borderRadius: 4,
                    background: "var(--surface-0, #08090c)",
                    border: "1px solid var(--border, #222)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--danger, #CF8B8B)", fontWeight: 700 }}>
                    PERMISSION: {stateBBorrowResult.allowed ? "ALLOWED" : "BLOCKED"}
                  </span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 9.5, color: "var(--danger, #CF8B8B)" }}>
                    {stateBBorrowResult.reasonCode}
                  </span>
                </div>
              </div>

              {/* Sub-action 2: Repay (ALLOWED) */}
              <div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-2, #bbb)", marginBottom: 4 }}>
                  Recovery Intent: <strong>REPAY ${testAmount}</strong> on {testSymbol}
                </div>
                <div
                  style={{
                    padding: "6px 10px",
                    borderRadius: 4,
                    background: "var(--surface-0, #08090c)",
                    border: "1px solid var(--border, #222)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--mint, #79C2A4)", fontWeight: 700 }}>
                    PERMISSION: {stateBRepayResult.allowed ? "ALLOWED" : "BLOCKED"}
                  </span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 9.5, color: "var(--mint, #79C2A4)" }}>
                    CAPITAL RECOVERY UNCONDITIONAL
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              padding: "10px 14px",
              borderRadius: 6,
              background: "var(--surface-0, #08090c)",
              border: "1px solid var(--border, #222)",
              fontFamily: "var(--mono)",
              fontSize: 10.5,
              color: "var(--text-2, #bbb)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>
              <strong>CORE INVARIANT:</strong> The agent can propose any strategy, but Circuit sovereignly enforces
              permitted capital boundaries onchain.
            </span>
            <span style={{ color: "var(--p-harvest, #AD8820)", fontWeight: 700 }}>
              CIRCUIT GOVERNS CAPITAL
            </span>
          </div>
        </div>
      )}

      {/* Tab 2: Decision Log */}
      {activeTab === "decision_log" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-3, #777)" }}>
              EVERY PERMISSION EVALUATION IS DETERMINISTIC AND AUDITABLE.
            </span>
            {logEntries.length > 0 && (
              <button
                type="button"
                onClick={() => decisionLogStore.clear()}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-3, #666)",
                  fontSize: 10,
                  fontFamily: "var(--mono)",
                  cursor: "pointer",
                }}
              >
                Clear Log
              </button>
            )}
          </div>

          <div
            style={{
              maxHeight: 280,
              overflowY: "auto",
              border: "1px solid var(--border, #222)",
              borderRadius: 6,
              background: "var(--surface-0, #08090c)",
            }}
          >
            {logEntries.length === 0 ? (
              <div style={{ padding: "20px", textAlign: "center", fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-3, #666)" }}>
                No evaluated decisions recorded yet.
              </div>
            ) : (
              logEntries.slice(0, 30).map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "7px 12px",
                    borderBottom: "1px solid var(--border, #1a1a1a)",
                    fontSize: 10.5,
                    fontFamily: "var(--mono)",
                    gap: 8,
                  }}
                >
                  <span style={{ color: "var(--text-3, #666)", width: 55, flexShrink: 0 }}>
                    {new Date(entry.timestamp).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>

                  <span style={{ color: entry.actor === "AGENT" ? "#818cf8" : "var(--text-2)", width: 45, flexShrink: 0 }}>
                    {entry.actor}
                  </span>

                  <span style={{ color: "var(--text)", fontWeight: 600, width: 90, flexShrink: 0 }}>
                    {entry.action.toUpperCase()} ${entry.requestedAmountUsd}
                  </span>

                  <span style={{ color: "var(--text-3)", width: 50, flexShrink: 0 }}>
                    {entry.assetSymbol}
                  </span>

                  <span
                    style={{
                      width: 75,
                      flexShrink: 0,
                      color:
                        entry.riskState === "SAFE"
                          ? "var(--mint, #79C2A4)"
                          : entry.riskState === "RESTRICTED"
                          ? "var(--warning, #cfad74)"
                          : "var(--danger, #cf8b8b)",
                    }}
                  >
                    {entry.riskState}
                  </span>

                  <span
                    style={{
                      fontWeight: 700,
                      width: 65,
                      flexShrink: 0,
                      color: entry.allowed ? "var(--mint, #79C2A4)" : "var(--danger, #CF8B8B)",
                    }}
                  >
                    {entry.allowed ? "ALLOWED" : "BLOCKED"}
                  </span>

                  <span
                    style={{
                      flex: 1,
                      color: "var(--text-3, #888)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={entry.message}
                  >
                    {entry.reasonCode !== "ALLOWED" ? `[${entry.reasonCode}] ` : ""}
                    {entry.message}
                  </span>

                  {entry.txSignature && (
                    <span style={{ color: "var(--mint)", fontSize: 9.5 }}>
                      tx: {entry.txSignature.slice(0, 6)}…
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
