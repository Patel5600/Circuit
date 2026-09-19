/**
 * Circuit Protocol — DBC Pool Lifecycle Badge
 * Shows real pool lifecycle state. Never fabricates graduation status.
 */
import React from "react";
import { DbcPoolLifecycle } from "../../lib/meteora/registry";

const LIFECYCLE_CONFIG: Record<
  DbcPoolLifecycle,
  { label: string; color: string; bg: string; description: string }
> = {
  VIRTUAL_POOL: {
    label: "VIRTUAL POOL",
    color: "#818cf8",
    bg: "rgba(129,140,248,0.12)",
    description: "Price discovery phase. Pool is initialized but not yet active.",
  },
  ACTIVE_TRADING: {
    label: "ACTIVE",
    color: "#22c55e",
    bg: "rgba(34,197,94,0.12)",
    description: "Pool is live with active liquidity and trading.",
  },
  THRESHOLD_REACHED: {
    label: "THRESHOLD REACHED",
    color: "#f97316",
    bg: "rgba(249,115,22,0.12)",
    description: "Graduation threshold met. Migration to DAMM v2 is pending.",
  },
  GRADUATION: {
    label: "GRADUATING",
    color: "#eab308",
    bg: "rgba(234,179,8,0.12)",
    description: "Pool is migrating to DAMM v2. New entries paused during transition.",
  },
  DAMM_V2: {
    label: "DAMM v2",
    color: "#a78bfa",
    bg: "rgba(167,139,250,0.12)",
    description: "Pool has graduated to full Dynamic AMM v2.",
  },
  UNKNOWN: {
    label: "UNKNOWN",
    color: "#71717a",
    bg: "rgba(113,113,122,0.12)",
    description: "Pool lifecycle state cannot be determined from available data.",
  },
};

const LIFECYCLE_STEPS: DbcPoolLifecycle[] = [
  "VIRTUAL_POOL",
  "ACTIVE_TRADING",
  "THRESHOLD_REACHED",
  "GRADUATION",
  "DAMM_V2",
];

export function DbcLifecycleBadge({
  lifecycle,
  showTimeline = false,
}: {
  lifecycle: DbcPoolLifecycle;
  showTimeline?: boolean;
}) {
  const cfg = LIFECYCLE_CONFIG[lifecycle];
  const currentIdx = LIFECYCLE_STEPS.indexOf(lifecycle);

  return (
    <div className="dbc-lifecycle-badge" style={{ display: "inline-flex", flexDirection: "column", gap: 6 }}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "3px 10px",
          borderRadius: 20,
          background: cfg.bg,
          color: cfg.color,
          fontSize: 11,
          fontFamily: "var(--font-mono, monospace)",
          fontWeight: 600,
          letterSpacing: "0.06em",
          border: `1px solid ${cfg.color}40`,
        }}
        title={cfg.description}
      >
        {cfg.label}
      </span>

      {showTimeline && lifecycle !== "UNKNOWN" && (
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          {LIFECYCLE_STEPS.map((step, idx) => {
            const stepCfg = LIFECYCLE_CONFIG[step];
            const isCurrent = step === lifecycle;
            const isPast = currentIdx > idx;
            return (
              <React.Fragment key={step}>
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: isCurrent
                      ? stepCfg.color
                      : isPast
                      ? "#3f3f46"
                      : "#27272a",
                    border: isCurrent ? `2px solid ${stepCfg.color}` : "1px solid #3f3f46",
                    flexShrink: 0,
                  }}
                  title={LIFECYCLE_CONFIG[step].label}
                />
                {idx < LIFECYCLE_STEPS.length - 1 && (
                  <div
                    style={{
                      height: 1,
                      width: 12,
                      background: isPast ? "#3f3f46" : "#27272a",
                    }}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
