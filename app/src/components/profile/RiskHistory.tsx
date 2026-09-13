import React from "react";
import { Card, Pill, Tone } from "../ui";

export interface RiskEvent {
  state: string;
  reason: string;
  timestamp: string; // human-readable
  slot?: number;
}

const STATE_TONE: Record<string, Tone> = {
  SAFE: "success",
  RESTRICTED: "warning",
  DEFENSIVE: "warning",
  EMERGENCY: "danger",
};

const STATE_COLOR: Record<string, string> = {
  SAFE: "#7fc39a",
  RESTRICTED: "#cfad74",
  DEFENSIVE: "#e08c4e",
  EMERGENCY: "#e06c6c",
};

/** Simulated risk history for MVP demo. */
export const DEMO_RISK_HISTORY: RiskEvent[] = [
  {
    state: "SAFE",
    reason: "Protocol initialized — all safety checks nominal",
    timestamp: "09:31:04 ET",
    slot: 328490100,
  },
  {
    state: "RESTRICTED",
    reason: "Pyth confidence widened to 285 bps (> 150 bps threshold)",
    timestamp: "10:14:22 ET",
    slot: 328491024,
  },
  {
    state: "RESTRICTED",
    reason: "Recovery crank: 1/5 healthy observations",
    timestamp: "10:15:02 ET",
    slot: 328491030,
  },
  {
    state: "RESTRICTED",
    reason: "Recovery crank: 3/5 healthy observations",
    timestamp: "10:16:44 ET",
    slot: 328491042,
  },
  {
    state: "SAFE",
    reason: "5/5 consecutive healthy observations — full capacity restored",
    timestamp: "10:18:12 ET",
    slot: 328491058,
  },
  {
    state: "EMERGENCY",
    reason: "Upstream custody settlement link impaired",
    timestamp: "11:02:38 ET",
    slot: 328491088,
  },
  {
    state: "DEFENSIVE",
    reason: "Custody restored — ratchet stepped to Defensive after 5 clean ticks",
    timestamp: "11:08:14 ET",
    slot: 328491120,
  },
  {
    state: "RESTRICTED",
    reason: "Ratchet stepped to Restricted after 5 clean ticks",
    timestamp: "11:14:06 ET",
    slot: 328491152,
  },
  {
    state: "SAFE",
    reason: "Full monotonic recovery complete — borrow capacity restored",
    timestamp: "11:20:22 ET",
    slot: 328491184,
  },
];

export function RiskHistory({
  events = DEMO_RISK_HISTORY,
}: {
  events?: RiskEvent[];
}) {
  return (
    <Card
      title="Risk State History"
      action={
        <Pill tone="neutral">
          {events.length} transitions
        </Pill>
      }
    >
      <div
        style={{
          position: "relative",
          paddingLeft: 28,
        }}
      >
        {/* Vertical line */}
        <div
          style={{
            position: "absolute",
            left: 9,
            top: 6,
            bottom: 6,
            width: 2,
            background: "var(--border)",
            borderRadius: 1,
          }}
        />

        {events.map((event, idx) => {
          const color = STATE_COLOR[event.state] ?? "var(--text-3)";
          const isLast = idx === events.length - 1;

          return (
            <div
              key={idx}
              style={{
                position: "relative",
                paddingBottom: isLast ? 0 : 16,
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
              }}
            >
              {/* Dot on the timeline */}
              <div
                style={{
                  position: "absolute",
                  left: -22,
                  top: 4,
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: color,
                  border: "2px solid var(--bg)",
                  boxShadow: `0 0 0 2px ${color}33`,
                  flexShrink: 0,
                  zIndex: 1,
                }}
              />

              <div style={{ flex: 1 }}>
                <div
                  className="row g-8"
                  style={{ alignItems: "center", marginBottom: 2 }}
                >
                  <Pill tone={STATE_TONE[event.state] ?? "neutral"}>
                    {event.state}
                  </Pill>
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: "var(--mono)",
                      color: "var(--text-3)",
                    }}
                  >
                    {event.timestamp}
                    {event.slot && (
                      <span style={{ marginLeft: 6, opacity: 0.6 }}>
                        slot {event.slot.toLocaleString()}
                      </span>
                    )}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--text-2)",
                    lineHeight: 1.4,
                  }}
                >
                  {event.reason}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
