/**
 * Circuit Protocol — Strategies Panel (AUTO MANAGE)
 * Shows active strategies and policy preview before activation.
 */
import React, { useState, useEffect, useCallback } from "react";
import { loadTasks, pauseTask, resumeTask, deleteTask } from "../../lib/automation/store";
import type { AutomationTask } from "../../lib/automation/types";

const STRATEGY_TYPES = ["REPAY", "BORROW", "DEPOSIT", "WITHDRAW", "RECOVER"] as const;

function PolicyCard({ task }: { task: AutomationTask }) {
  const p = task.policy;
  if (!p) return null;
  return (
    <div style={{ padding: "10px 12px", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 7, fontSize: 11, marginTop: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px" }}>
        {[
          { label: "Objective", value: p.objective },
          { label: "Action", value: p.allowedActions.join(", ") },
          { label: "Max/Action", value: `$${p.maxAmountPerActionUsd.toFixed(2)}` },
          { label: "Max Total", value: `$${p.maxTotalUsd.toFixed(2)}` },
          { label: "Assets", value: p.assetScope.length > 0 ? p.assetScope.join(", ") : "Portfolio" },
          { label: "Risk Adaptive", value: p.riskAdaptive ? "Yes" : "No" },
          { label: "Expires", value: `${p.expireDays}d` },
          { label: "Version", value: `v${p.version}` },
        ].map(row => (
          <div key={row.label}>
            <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 1 }}>{row.label}</div>
            <div style={{ fontWeight: 600, color: "var(--text)", fontFamily: row.label === "Objective" ? undefined : "var(--mono)" }}>{row.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StrategiesPanel({ owner, onAddStrategy }: { owner: string; onAddStrategy: () => void }) {
  const [strategies, setStrategies] = useState<AutomationTask[]>([]);

  const refresh = useCallback(() => {
    const all = loadTasks().filter(t => t.owner === owner || !owner);
    setStrategies(all.filter(t => (STRATEGY_TYPES as readonly string[]).includes(t.type)));
  }, [owner]);

  useEffect(() => { refresh(); const id = setInterval(refresh, 10_000); return () => clearInterval(id); }, [refresh]);

  const handlePause = useCallback((id: string) => { pauseTask(id); refresh(); }, [refresh]);
  const handleResume = useCallback((id: string) => { resumeTask(id); refresh(); }, [refresh]);
  const handleDelete = useCallback((id: string) => { deleteTask(id); refresh(); }, [refresh]);

  if (strategies.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 14, lineHeight: 1.6 }}>
          No active strategies.<br />
          Ask the agent what you want to protect:
        </div>
        <div style={{ fontSize: 11, color: "var(--text-2)", fontFamily: "var(--mono)", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 6, padding: "10px 16px", marginBottom: 16, textAlign: "left" }}>
          "Keep my health factor above 1.8"<br />
          "Auto-repay if HF drops below 1.7"<br />
          "Never borrow when Circuit is DEFENSIVE"
        </div>
        <button type="button" onClick={onAddStrategy} style={{ padding: "8px 18px", fontSize: 11, fontWeight: 700, fontFamily: "var(--mono)", background: "rgba(236,234,230,0.08)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", cursor: "pointer" }}>
          AUTO MANAGE
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", fontFamily: "var(--mono)", color: "var(--text-3)" }}>
          ACTIVE STRATEGIES ({strategies.length})
        </div>
        <button type="button" onClick={onAddStrategy} style={{ padding: "3px 10px", fontSize: 10, fontWeight: 700, fontFamily: "var(--mono)", background: "rgba(236,234,230,0.08)", border: "1px solid var(--border)", borderRadius: 5, color: "var(--text-2)", cursor: "pointer" }}>+ AUTO MANAGE</button>
      </div>

      {strategies.map(s => {
        const result = s.lastResult;
        return (
          <div key={s.id} style={{ borderBottom: "1px solid var(--border)", padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{s.name}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, fontFamily: "var(--mono)", padding: "1px 5px", borderRadius: 3, background: s.status === "ACTIVE" ? "rgba(121,194,164,0.12)" : "rgba(207,173,116,0.12)", color: s.status === "ACTIVE" ? "var(--mint,#79c2a4)" : "var(--warning,#cfad74)" }}>
                    {s.status}
                  </span>
                </div>

                {s.condition && (
                  <div style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 4 }}>
                    Trigger: <span style={{ fontFamily: "var(--mono)", color: "var(--accent)" }}>{s.condition.description}</span>
                  </div>
                )}

                <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--mono)" }}>
                  Checks every {s.frequencyMinutes}m · Executions today: {s.executionsToday} · Failures: {s.consecutiveFailures}
                </div>

                {result && (
                  <div style={{ marginTop: 6, fontSize: 11, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: "var(--mono)", color: result.outcome === "CONFIRMED" ? "var(--mint,#79c2a4)" : result.outcome === "PERMISSION_DENIED" || result.outcome === "BLOCKED_NO_SIGNER" ? "var(--danger,#cf8b8b)" : "var(--text-3)" }}>
                      {result.outcome}
                    </span>
                    {result.reasonCode && result.reasonCode !== "ALLOWED" && (
                      <span style={{ color: "var(--text-3)", fontSize: 10 }}>[{result.reasonCode}]</span>
                    )}
                  </div>
                )}

                <PolicyCard task={s} />
              </div>

              <div style={{ display: "flex", gap: 5, flexShrink: 0, marginLeft: 8 }}>
                {s.status === "ACTIVE"
                  ? <button type="button" onClick={() => handlePause(s.id)} style={{ padding: "3px 8px", fontSize: 10, fontFamily: "var(--mono)", background: "transparent", border: "1px solid var(--border)", borderRadius: 4, color: "var(--warning,#cfad74)", cursor: "pointer" }}>PAUSE</button>
                  : <button type="button" onClick={() => handleResume(s.id)} style={{ padding: "3px 8px", fontSize: 10, fontFamily: "var(--mono)", background: "transparent", border: "1px solid var(--border)", borderRadius: 4, color: "var(--mint,#79c2a4)", cursor: "pointer" }}>RESUME</button>
                }
                <button type="button" onClick={() => handleDelete(s.id)} style={{ padding: "3px 8px", fontSize: 10, fontFamily: "var(--mono)", background: "transparent", border: "1px solid var(--border)", borderRadius: 4, color: "var(--danger,#cf8b8b)", cursor: "pointer" }}>DEL</button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
