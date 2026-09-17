/**
 * Circuit Protocol — Execution Feed
 * Real-time log of all automation execution records from localStorage.
 */
import React, { useState, useEffect, useCallback } from "react";
import { loadExecutions } from "../../lib/automation/store";
import type { ExecutionRecord } from "../../lib/automation/types";

function outcomeColor(o: string): string {
  if (o === "CONFIRMED" || o === "OBSERVED") return "var(--mint,#79c2a4)";
  if (o === "CONDITION_NOT_MET") return "var(--text-3)";
  if (o === "PERMISSION_DENIED" || o.startsWith("BLOCKED")) return "var(--danger,#cf8b8b)";
  if (o === "FAILED") return "var(--danger,#cf8b8b)";
  return "var(--text-3)";
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function ExecutionFeed({ owner }: { owner: string }) {
  const [records, setRecords] = useState<ExecutionRecord[]>([]);

  const refresh = useCallback(() => {
    const all = loadExecutions();
    setRecords(owner ? all.filter(r => r.owner === owner) : all);
  }, [owner]);

  useEffect(() => { refresh(); const id = setInterval(refresh, 5_000); return () => clearInterval(id); }, [refresh]);

  if (records.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 8, color: "var(--text-3)" }}>
        <div style={{ fontSize: 11, fontFamily: "var(--mono)" }}>NO EXECUTIONS YET</div>
        <div style={{ fontSize: 11, color: "var(--text-3)", textAlign: "center", lineHeight: 1.5 }}>
          Create a task and click RUN to see real execution records here.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", fontSize: 10, fontWeight: 700, fontFamily: "var(--mono)", color: "var(--text-3)", letterSpacing: "0.06em" }}>
        {records.length} EXECUTION{records.length !== 1 ? "S" : ""}
      </div>
      {records.map(r => (
        <div key={r.executionId} style={{ borderBottom: "1px solid var(--border)", padding: "10px 16px", display: "flex", alignItems: "flex-start", gap: 10 }}>
          <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-3)", whiteSpace: "nowrap", marginTop: 1, minWidth: 65 }}>{fmtTime(r.timestamp)}</span>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: outcomeColor(r.outcome), flexShrink: 0, marginTop: 4 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
              <span style={{ fontWeight: 700, fontSize: 12, color: "var(--text)" }}>{r.taskName}</span>
              <span style={{ fontSize: 9, fontFamily: "var(--mono)", color: outcomeColor(r.outcome), fontWeight: 700 }}>{r.outcome}</span>
              <span style={{ fontSize: 9, fontFamily: "var(--mono)", color: "var(--text-3)" }}>{fmtDuration(r.durationMs)}</span>
            </div>

            {r.actionProposed && (
              <div style={{ fontSize: 11, color: "var(--text-2)" }}>
                Action: <span style={{ fontFamily: "var(--mono)" }}>{r.actionProposed}</span>
              </div>
            )}

            {r.reasonCode && r.reasonCode !== "ALLOWED" && r.reasonCode !== "CONDITION_NOT_MET" && (
              <div style={{ fontSize: 11, color: "var(--danger,#cf8b8b)", fontFamily: "var(--mono)" }}>
                [{r.reasonCode}]
              </div>
            )}

            {r.conditionValue !== undefined && (
              <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                Observed: <span style={{ fontFamily: "var(--mono)", color: "var(--text-2)" }}>{String(r.conditionValue)}</span>
              </div>
            )}

            {r.txSignature && (
              <a href={`https://explorer.solana.com/tx/${r.txSignature}?cluster=devnet`} target="_blank" rel="noopener noreferrer" style={{ display: "block", fontSize: 10, fontFamily: "var(--mono)", color: "var(--accent)", marginTop: 2, opacity: 0.8 }}>
                {r.txSignature.slice(0, 12)}...{r.txSignature.slice(-6)} ↗
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
