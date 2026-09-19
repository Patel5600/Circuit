/**
 * Circuit Protocol — Realtime Action & Observation Stream
 *
 * Displays a strictly real chronological event stream of actual observations,
 * permission checks, state changes, and transaction settlements.
 *
 * ZERO FAKE ACTIVITY: Events are added only upon real hook/context triggers.
 */

import React from "react";

export interface StreamEvent {
  id: string;
  timestamp: number;
  category: "OBSERVE" | "RISK" | "PERMISSION" | "EXECUTE" | "CONFIRM";
  title: string;
  description?: string;
  tone?: "default" | "success" | "warning" | "danger" | "accent";
}

interface ActionStreamProps {
  events: StreamEvent[];
  compact?: boolean;
}

export function ActionStream({ events, compact = false }: ActionStreamProps) {
  const fmtTime = (ts: number) => {
    const d = new Date(ts);
    return d.toTimeString().split(" ")[0];
  };

  return (
    <div
      className="action-stream"
      style={{
        background: "var(--surface-1, #121214)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: compact ? "10px 14px" : "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            fontFamily: "var(--mono, monospace)",
            color: "var(--text-3, #71717a)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Action &amp; State Stream
        </span>
        <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text-3)" }}>
          {events.length} REAL EVENTS
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: compact ? 140 : 200, overflowY: "auto" }}>
        {events.length === 0 ? (
          <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--mono)", padding: "10px 0", textAlign: "center" }}>
            Awaiting first protocol observation or intent...
          </div>
        ) : (
          events.slice(0, 15).map((ev) => (
            <div
              key={ev.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                fontSize: 11,
                fontFamily: "var(--mono)",
              }}
            >
              <span style={{ color: "var(--text-3)", flexShrink: 0 }}>{fmtTime(ev.timestamp)}</span>
              <span
                style={{
                  padding: "1px 5px",
                  borderRadius: 3,
                  fontSize: 9.5,
                  fontWeight: 700,
                  flexShrink: 0,
                  background:
                    ev.category === "RISK"
                      ? "rgba(207,173,116,0.15)"
                      : ev.category === "PERMISSION"
                      ? "rgba(129,140,248,0.15)"
                      : ev.category === "CONFIRM"
                      ? "rgba(121,194,164,0.15)"
                      : "rgba(255,255,255,0.06)",
                  color:
                    ev.category === "RISK"
                      ? "var(--warning, #cfad74)"
                      : ev.category === "PERMISSION"
                      ? "#818cf8"
                      : ev.category === "CONFIRM"
                      ? "var(--mint, #79c2a4)"
                      : "var(--text-2, #a1a1aa)",
                }}
              >
                {ev.category}
              </span>
              <span style={{ color: "var(--text)", flex: 1, minWidth: 0, wordBreak: "break-word" }}>
                {ev.title}
                {ev.description && (
                  <span style={{ color: "var(--text-3)", marginLeft: 6 }}>{ev.description}</span>
                )}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
