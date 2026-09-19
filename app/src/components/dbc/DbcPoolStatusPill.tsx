/**
 * Circuit Protocol — DBC Pool Availability Pill
 * Compact availability indicator sourced from DbcContext (never fabricated).
 */
import React from "react";
import { useDbcContext, DbcAvailability } from "../../context/DbcContext";

const PILL_CONFIG: Record<
  DbcAvailability,
  { label: string; dot: string; bg: string; text: string }
> = {
  AVAILABLE: {
    label: "DBC LIVE",
    dot: "#22c55e",
    bg: "rgba(34,197,94,0.12)",
    text: "#22c55e",
  },
  DEGRADED: {
    label: "DBC DEGRADED",
    dot: "#eab308",
    bg: "rgba(234,179,8,0.12)",
    text: "#eab308",
  },
  UNAVAILABLE: {
    label: "DBC UNAVAILABLE",
    dot: "#ef4444",
    bg: "rgba(239,68,68,0.12)",
    text: "#ef4444",
  },
  STALE: {
    label: "DBC STALE",
    dot: "#f97316",
    bg: "rgba(249,115,22,0.12)",
    text: "#f97316",
  },
  NOT_CONFIGURED: {
    label: "DBC NOT CONFIGURED",
    dot: "#71717a",
    bg: "rgba(113,113,122,0.12)",
    text: "#71717a",
  },
};

export function DbcPoolStatusPill({ compact = false }: { compact?: boolean }) {
  const { availability } = useDbcContext();
  const cfg = PILL_CONFIG[availability];

  return (
    <span
      className="dbc-status-pill"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: compact ? "2px 7px" : "3px 10px",
        borderRadius: 20,
        background: cfg.bg,
        color: cfg.text,
        fontSize: compact ? 10 : 11,
        fontFamily: "var(--font-mono, monospace)",
        fontWeight: 600,
        letterSpacing: "0.06em",
        border: `1px solid ${cfg.dot}40`,
        whiteSpace: "nowrap",
      }}
      title={`Meteora DBC Status: ${availability}`}
    >
      <span
        style={{
          width: compact ? 6 : 7,
          height: compact ? 6 : 7,
          borderRadius: "50%",
          background: cfg.dot,
          flexShrink: 0,
          boxShadow: availability === "AVAILABLE" ? `0 0 6px ${cfg.dot}` : undefined,
        }}
      />
      {!compact && cfg.label}
    </span>
  );
}
