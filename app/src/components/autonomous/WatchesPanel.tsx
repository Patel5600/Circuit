/**
 * Circuit Protocol — Watches Panel
 * Shows all watch-type tasks with their conditions and last trigger state.
 */
import React, { useState, useEffect, useCallback } from "react";
import { loadTasks, triggerNow, subscribeTasks } from "../../lib/automation/store";
import type { AutomationTask } from "../../lib/automation/types";
import { humanizeReasonCode } from "../../lib/format";

const WATCH_TYPES = ["WATCH", "OBSERVE", "ANALYZE", "REPORT"] as const;

function ConditionChip({ cond }: { cond: AutomationTask["condition"] }) {
  if (!cond) return <span style={{ color: "var(--text-3)", fontSize: 11 }}>Observe only</span>;
  return (
    <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--accent)" }}>
      {cond.field} {cond.operator} {String(cond.threshold)}
    </span>
  );
}

function ActionTypeBadge({ type }: { type: string }) {
  const isAction = !["WATCH", "OBSERVE", "ANALYZE", "REPORT"].includes(type);
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, fontFamily: "var(--mono)", padding: "2px 6px", borderRadius: 3,
      background: isAction ? "rgba(207,173,116,0.15)" : "rgba(255,255,255,0.05)",
      color: isAction ? "var(--warning,#cfad74)" : "var(--text-3)",
      border: `1px solid ${isAction ? "rgba(207,173,116,0.25)" : "var(--border)"}`,
    }}>
      {type}
    </span>
  );
}

export function WatchesPanel({ owner, onAddWatch }: { owner: string; onAddWatch: () => void }) {
  const [watches, setWatches] = useState<AutomationTask[]>([]);
  const [running, setRunning] = useState<Record<string, boolean>>({});

  const refresh = useCallback(() => {
    const all = loadTasks().filter(t => t.owner === owner || !owner);
    setWatches(all.filter(t => (WATCH_TYPES as readonly string[]).includes(t.type)));
  }, [owner]);

  useEffect(() => {
    refresh();
    const unsub = subscribeTasks(refresh);
    const id = setInterval(refresh, 10_000);
    return () => { unsub(); clearInterval(id); };
  }, [refresh]);

  const handleCheck = useCallback(async (task: AutomationTask) => {
    setRunning(prev => ({ ...prev, [task.id]: true }));
    await triggerNow(task.id, owner);
    setRunning(prev => ({ ...prev, [task.id]: false }));
    refresh();
  }, [owner, refresh]);

  if (watches.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 14, lineHeight: 1.6 }}>
          No active watches.<br />
          Ask the agent: <span style={{ fontFamily: "var(--mono)", color: "var(--accent)" }}>"Watch my health factor"</span>
        </div>
        <button type="button" onClick={onAddWatch} style={{ padding: "8px 18px", fontSize: 11, fontWeight: 700, fontFamily: "var(--mono)", background: "rgba(236,234,230,0.08)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", cursor: "pointer" }}>
          + WATCH
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", fontFamily: "var(--mono)", color: "var(--text-3)" }}>
          {watches.length} WATCH{watches.length !== 1 ? "ES" : ""}
        </div>
        <button type="button" onClick={onAddWatch} style={{ padding: "3px 10px", fontSize: 10, fontWeight: 700, fontFamily: "var(--mono)", background: "rgba(236,234,230,0.08)", border: "1px solid var(--border)", borderRadius: 5, color: "var(--text-2)", cursor: "pointer" }}>+ WATCH</button>
      </div>

      {watches.map(w => {
        const result = w.lastResult;
        const conditionTriggered = !!result?.conditionMet;
        return (
          <div key={w.id} style={{
            borderBottom: "1px solid var(--border)",
            padding: "12px 16px",
            background: conditionTriggered ? "rgba(207,173,116,0.05)" : "transparent",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{w.name}</span>
                  <ActionTypeBadge type={w.type} />
                  <span style={{ fontSize: 9, fontFamily: "var(--mono)", padding: "1px 5px", borderRadius: 3, background: w.status === "ACTIVE" ? "rgba(121,194,164,0.12)" : "rgba(255,255,255,0.05)", color: w.status === "ACTIVE" ? "var(--mint,#79c2a4)" : "var(--text-3)" }}>
                    {w.status}
                  </span>
                  {conditionTriggered && (
                    <span style={{ fontSize: 9, fontFamily: "var(--mono)", fontWeight: 700, padding: "1px 6px", borderRadius: 3, background: "rgba(207,173,116,0.2)", color: "var(--warning,#cfad74)", border: "1px solid rgba(207,173,116,0.4)" }}>
                      TRIGGERED
                    </span>
                  )}
                </div>

                <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 4 }}>
                  Condition: <ConditionChip cond={w.condition} />
                </div>

                <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--mono)" }}>
                  Checks every {w.frequencyMinutes}m
                  {result && <> · Last: {result.outcome} {result.conditionMet ? "✓ TRIGGERED" : "— OK"}</>}
                  {result?.conditionValue !== undefined && <> · Observed: {String(result.conditionValue)}</>}
                </div>

                {result?.outcome === "PERMISSION_DENIED" && result.reasonCode && (
                  <div style={{ marginTop: 5, fontSize: 11, color: "var(--danger,#cf8b8b)" }}>
                    Blocked: {humanizeReasonCode(result.reasonCode)}
                  </div>
                )}
              </div>
              <button type="button" onClick={() => handleCheck(w)} disabled={running[w.id]} style={{ padding: "4px 10px", fontSize: 10, fontFamily: "var(--mono)", background: "transparent", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-3)", cursor: running[w.id] ? "not-allowed" : "pointer", flexShrink: 0 }}>
                {running[w.id] ? "..." : "CHECK"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
