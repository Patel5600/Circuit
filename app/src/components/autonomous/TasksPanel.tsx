/**
 * Circuit Protocol — Tasks Panel
 * Shows all automation tasks with status, last result, next run.
 */
import React, { useState, useEffect, useCallback } from "react";
import { loadTasks, pauseTask, resumeTask, deleteTask, triggerNow } from "../../lib/automation/store";
import type { AutomationTask, ExecutionRecord } from "../../lib/automation/types";

function statusColor(s: string): string {
  if (s === "ACTIVE") return "var(--mint, #79c2a4)";
  if (s === "PAUSED") return "var(--warning, #cfad74)";
  if (s === "FAILED" || s === "EXPIRED" || s === "REVOKED") return "var(--danger, #cf8b8b)";
  if (s === "RUNNING") return "var(--accent)";
  return "var(--text-3)";
}

function outcomeColor(o: string): string {
  if (o === "CONFIRMED" || o === "OBSERVED" || o === "CONDITION_NOT_MET") return "var(--mint, #79c2a4)";
  if (o === "PERMISSION_DENIED" || o === "BLOCKED_NO_SIGNER" || o === "BLOCKED_EMERGENCY") return "var(--danger, #cf8b8b)";
  if (o === "FAILED") return "var(--danger, #cf8b8b)";
  return "var(--text-3)";
}

function fmtAgo(ts: number | null): string {
  if (!ts) return "never";
  const diff = Date.now() - ts;
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  return `${Math.round(diff / 3_600_000)}h ago`;
}

function fmtNext(ts: number | null): string {
  if (!ts) return "—";
  const diff = ts - Date.now();
  if (diff <= 0) return "due now";
  if (diff < 60_000) return `in ${Math.round(diff / 1000)}s`;
  if (diff < 3_600_000) return `in ${Math.round(diff / 60_000)}m`;
  return `in ${Math.round(diff / 3_600_000)}h`;
}

export function TasksPanel({ owner, onAddTask }: { owner: string; onAddTask: () => void }) {
  const [tasks, setTasks] = useState<AutomationTask[]>([]);
  const [running, setRunning] = useState<Record<string, boolean>>({});
  const [lastResults, setLastResults] = useState<Record<string, ExecutionRecord>>({});

  const refresh = useCallback(() => setTasks(loadTasks().filter(t => t.owner === owner || !owner)), [owner]);
  useEffect(() => { refresh(); const id = setInterval(refresh, 10_000); return () => clearInterval(id); }, [refresh]);

  const handlePause = useCallback((id: string) => { pauseTask(id); refresh(); }, [refresh]);
  const handleResume = useCallback((id: string) => { resumeTask(id); refresh(); }, [refresh]);
  const handleDelete = useCallback((id: string) => { deleteTask(id); refresh(); }, [refresh]);

  const handleRunNow = useCallback(async (task: AutomationTask) => {
    setRunning(prev => ({ ...prev, [task.id]: true }));
    const result = await triggerNow(task.id, owner);
    if (result) setLastResults(prev => ({ ...prev, [task.id]: result }));
    setRunning(prev => ({ ...prev, [task.id]: false }));
    refresh();
  }, [owner, refresh]);

  const label = (style: React.CSSProperties, txt: string) => (
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", fontFamily: "var(--mono)", color: "var(--text-3)", ...style }}>{txt}</div>
  );

  if (tasks.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 14, lineHeight: 1.6 }}>
          No automation tasks yet.<br />Use the chat to create one, or click below.
        </div>
        <button type="button" onClick={onAddTask} style={{ padding: "8px 18px", fontSize: 11, fontWeight: 700, fontFamily: "var(--mono)", background: "rgba(236,234,230,0.08)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", cursor: "pointer" }}>
          + NEW TASK
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
        {label({}, `${tasks.length} TASK${tasks.length !== 1 ? "S" : ""}`)}
        <button type="button" onClick={onAddTask} style={{ padding: "3px 10px", fontSize: 10, fontWeight: 700, fontFamily: "var(--mono)", background: "rgba(236,234,230,0.08)", border: "1px solid var(--border)", borderRadius: 5, color: "var(--text-2)", cursor: "pointer" }}>+ NEW</button>
      </div>

      {tasks.map(task => {
        const result = lastResults[task.id] || task.lastResult;
        const isRunning = running[task.id];
        return (
          <div key={task.id} style={{ borderBottom: "1px solid var(--border)", padding: "12px 16px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>{task.name}</span>
                  <span style={{ fontSize: 9, fontFamily: "var(--mono)", fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: `${statusColor(task.status)}20`, color: statusColor(task.status) }}>{task.status}</span>
                  <span style={{ fontSize: 9, fontFamily: "var(--mono)", padding: "1px 5px", borderRadius: 3, background: "var(--surface-3)", color: "var(--text-3)", border: "1px solid var(--border)" }}>{task.type}</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--mono)" }}>
                  Every {task.frequencyMinutes}m · Last: {fmtAgo(task.lastCheckedAt)} · Next: {fmtNext(task.nextRunAt)}
                </div>
                {task.condition && (
                  <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 4 }}>
                    When: <span style={{ fontFamily: "var(--mono)", color: "var(--accent)" }}>{task.condition.description}</span>
                  </div>
                )}
                {result && (
                  <div style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: outcomeColor(result.outcome) }}>{result.outcome}</span>
                    {result.reasonCode && result.reasonCode !== "ALLOWED" && result.reasonCode !== "CONDITION_NOT_MET" && (
                      <span style={{ fontSize: 10, color: "var(--text-3)" }}>[{result.reasonCode}]</span>
                    )}
                    {result.txSignature && (
                      <a href={`https://explorer.solana.com/tx/${result.txSignature}?cluster=devnet`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--accent)", opacity: 0.8 }}>
                        {result.txSignature.slice(0, 8)}... ↗
                      </a>
                    )}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                <button type="button" onClick={() => handleRunNow(task)} disabled={isRunning || task.status === "PAUSED"} title="Run now" style={{ padding: "3px 8px", fontSize: 10, fontFamily: "var(--mono)", background: "transparent", border: "1px solid var(--border)", borderRadius: 4, color: isRunning ? "var(--accent)" : "var(--text-3)", cursor: isRunning || task.status === "PAUSED" ? "not-allowed" : "pointer" }}>
                  {isRunning ? "..." : "RUN"}
                </button>
                {task.status === "ACTIVE"
                  ? <button type="button" onClick={() => handlePause(task.id)} style={{ padding: "3px 8px", fontSize: 10, fontFamily: "var(--mono)", background: "transparent", border: "1px solid var(--border)", borderRadius: 4, color: "var(--warning,#cfad74)", cursor: "pointer" }}>PAUSE</button>
                  : <button type="button" onClick={() => handleResume(task.id)} style={{ padding: "3px 8px", fontSize: 10, fontFamily: "var(--mono)", background: "transparent", border: "1px solid var(--border)", borderRadius: 4, color: "var(--mint,#79c2a4)", cursor: "pointer" }}>RESUME</button>
                }
                <button type="button" onClick={() => handleDelete(task.id)} title="Delete task" style={{ padding: "3px 8px", fontSize: 10, fontFamily: "var(--mono)", background: "transparent", border: "1px solid var(--border)", borderRadius: 4, color: "var(--danger,#cf8b8b)", cursor: "pointer" }}>DEL</button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
