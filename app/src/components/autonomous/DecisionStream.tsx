/**
 * Circuit Protocol — Auditable Decision Stream
 *
 * Renders the real-time stream of machine-readable evaluation records.
 * Provides transparent, institutional proof of what the agent observed,
 * which conditions passed/failed, and why an action was executed or blocked.
 */

import React, { useState, useEffect } from "react";
import type { MachineReadableDecision } from "../../lib/agent/intent/types";

interface DecisionStreamProps {
  decisions?: MachineReadableDecision[];
  intentId?: string;
  onRefresh?: () => void;
}

export function DecisionStream({ decisions: initialDecisions, intentId, onRefresh }: DecisionStreamProps) {
  const [decisions, setDecisions] = useState<MachineReadableDecision[]>(initialDecisions ?? []);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (initialDecisions) {
      setDecisions(initialDecisions);
      return;
    }

    const fetchLogs = async () => {
      try {
        const url = intentId ? `/api/automation/intents?intentId=${intentId}` : "/api/automation/intents";
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.decisions)) {
            setDecisions(data.decisions);
          }
        }
      } catch {
        /* fetch fallback */
      }
    };

    fetchLogs();
    const timer = setInterval(fetchLogs, 5000);
    return () => clearInterval(timer);
  }, [initialDecisions, intentId]);

  if (decisions.length === 0) {
    return (
      <div
        style={{
          padding: "20px",
          background: "var(--surface-2, rgba(255,255,255,0.02))",
          borderRadius: "var(--r, 8px)",
          border: "1px solid var(--border, rgba(255,255,255,0.08))",
          textAlign: "center",
          color: "var(--text-muted, #888)",
          fontSize: 13,
        }}
      >
        No autonomous decisions recorded yet. Arm an intent to begin observation.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted, #888)", textTransform: "uppercase" }}>
          Decision Stream ({decisions.length})
        </span>
        {onRefresh && (
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={onRefresh}
            style={{ fontSize: 11, padding: "2px 8px", height: 24 }}
          >
            Refresh
          </button>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "380px", overflowY: "auto" }}>
        {decisions.map((d, idx) => {
          const key = `${d.intentId}_${d.timestamp}_${idx}`;
          const isExpanded = expandedId === key;
          const isExecute = d.decision === "EXECUTE";
          const isWait = d.decision === "WAIT";
          const isBlock = d.decision === "BLOCK";

          const badgeColor = isExecute
            ? "var(--success, #79c2a4)"
            : isWait
            ? "var(--accent, #64748b)"
            : "var(--danger, #f87171)";

          const timeStr = new Date(d.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

          return (
            <div
              key={key}
              style={{
                background: "var(--surface-2, rgba(255,255,255,0.03))",
                border: "1px solid var(--border, rgba(255,255,255,0.08))",
                borderLeft: `3px solid ${badgeColor}`,
                borderRadius: "var(--r-sm, 6px)",
                padding: "10px 12px",
                fontSize: 12,
                cursor: "pointer",
                transition: "background 0.15s ease",
              }}
              onClick={() => setExpandedId(isExpanded ? null : key)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span
                    style={{
                      background: badgeColor,
                      color: "#000",
                      fontSize: 10,
                      fontWeight: 800,
                      padding: "1px 6px",
                      borderRadius: "3px",
                      textTransform: "uppercase",
                    }}
                  >
                    {d.decision}
                  </span>
                  <span style={{ fontWeight: 600, color: "var(--text, #fff)" }}>
                    {d.actionProposed || d.permission.reasonCode.replace(/_/g, " ")}
                  </span>
                </div>
                <span style={{ fontSize: 11, color: "var(--text-muted, #777)", fontFamily: "monospace" }}>
                  {timeStr}
                </span>
              </div>

              <div style={{ color: "var(--text-secondary, #aaa)", fontSize: 11, lineHeight: 1.4 }}>
                {d.resultSummary}
              </div>

              {isExpanded && (
                <div
                  style={{
                    marginTop: "10px",
                    paddingTop: "10px",
                    borderTop: "1px solid var(--border, rgba(255,255,255,0.06))",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                    fontFamily: "monospace",
                    fontSize: 11,
                  }}
                >
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                    <div>LTV: {(d.observation.ltvBps / 100).toFixed(1)}%</div>
                    <div>Risk State: {d.riskState}</div>
                    <div>Collateral: ${d.observation.collateralUsd.toFixed(2)}</div>
                    <div>Debt: ${d.observation.debtUsd.toFixed(2)}</div>
                    <div>Oracle Price: ${d.observation.oraclePrice.toFixed(2)}</div>
                    <div>Vault Liquidity: ${d.observation.vaultLiquidityUsd.toLocaleString()}</div>
                  </div>

                  {d.conditionsChecked.length > 0 && (
                    <div style={{ marginTop: "6px" }}>
                      <div style={{ color: "var(--text-muted, #888)", fontWeight: 700, marginBottom: "2px" }}>
                        Conditions Evaluated:
                      </div>
                      {d.conditionsChecked.map((c, i) => (
                        <div key={i} style={{ color: c.passed ? "var(--success, #79c2a4)" : "var(--danger, #f87171)" }}>
                          {c.passed ? "✓" : "✗"} {c.condition.replace(/_/g, " ")}: {c.actual} (expected {c.expected})
                        </div>
                      ))}
                    </div>
                  )}

                  {d.transaction?.signature && (
                    <div style={{ marginTop: "6px", color: "var(--success, #79c2a4)" }}>
                      Solana Tx: {d.transaction.signature.slice(0, 16)}... (Confirmed)
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
