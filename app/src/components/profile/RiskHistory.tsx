import React, { useState } from "react";
import { Card, Pill, Tone } from "../ui";

export interface RiskTransitionEvent {
  timestamp: string;
  trigger: string;
  priorState: "SAFE" | "RESTRICTED" | "DEFENSIVE" | "EMERGENCY";
  newState: "SAFE" | "RESTRICTED" | "DEFENSIVE" | "EMERGENCY";
  affectedPermission: string;
  riskEpoch?: number;
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
  EMERGENCY: "#cf8b8b",
};

/** Verified 7-transition timeline: SAFE ↓ RESTRICTED ↓ DEFENSIVE ↓ EMERGENCY ↓ DEFENSIVE ↓ RESTRICTED ↓ SAFE */
export const DEMO_RISK_HISTORY: RiskTransitionEvent[] = [
  {
    timestamp: "09:30:00 ET",
    trigger: "Market open — initial nominal state across all Pyth feeds",
    priorState: "SAFE",
    newState: "SAFE",
    affectedPermission: "Borrow allowed up to 70% Base LTV",
    riskEpoch: 1,
    slot: 328490100,
  },
  {
    timestamp: "10:14:22 ET",
    trigger: "NVDA Pyth confidence spread widened to 285 bps (> 150 bps threshold)",
    priorState: "SAFE",
    newState: "RESTRICTED",
    affectedPermission: "New borrowing restricted; Effective LTV haircut applied",
    riskEpoch: 2,
    slot: 328491024,
  },
  {
    timestamp: "10:42:15 ET",
    trigger: "Dual-feed volatility spike; second equity feed uncertainty elevated",
    priorState: "RESTRICTED",
    newState: "DEFENSIVE",
    affectedPermission: "All new borrow instructions blocked on-chain; repayments open",
    riskEpoch: 3,
    slot: 328491055,
  },
  {
    timestamp: "11:02:38 ET",
    trigger: "Oracle stale > 10m / upstream custody settlement disruption",
    priorState: "DEFENSIVE",
    newState: "EMERGENCY",
    affectedPermission: "Protocol-wide borrow lockout; risk-increasing withdrawals halted",
    riskEpoch: 4,
    slot: 328491088,
  },
  {
    timestamp: "11:08:14 ET",
    trigger: "Oracle feed restored; 5 consecutive healthy observations accumulated",
    priorState: "EMERGENCY",
    newState: "DEFENSIVE",
    affectedPermission: "Liquidations return to nominal schedule; borrowing remains blocked",
    riskEpoch: 5,
    slot: 328491120,
  },
  {
    timestamp: "11:14:06 ET",
    trigger: "Confidence ratio < 1.0%; staged monotonic step to Restricted verified",
    priorState: "DEFENSIVE",
    newState: "RESTRICTED",
    affectedPermission: "Withdrawals unblocked; borrow limits capped with safety margin",
    riskEpoch: 6,
    slot: 328491152,
  },
  {
    timestamp: "11:20:22 ET",
    trigger: "Hysteresis threshold satisfied (< 0.3% spread); full recovery confirmed",
    priorState: "RESTRICTED",
    newState: "SAFE",
    affectedPermission: "Full borrow capacity restored under standard parameters",
    riskEpoch: 7,
    slot: 328491184,
  },
];

export function RiskHistory({
  events,
  activeState,
  isDemo = false,
  allowDemo = false,
}: {
  events?: RiskTransitionEvent[];
  activeState?: string;
  isDemo?: boolean;
  allowDemo?: boolean;
}) {
  const [showSimulated, setShowSimulated] = useState<boolean>(isDemo && allowDemo);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const displayEvents = events && events.length > 0 ? events : (showSimulated && allowDemo) ? DEMO_RISK_HISTORY : [];

  if (displayEvents.length === 0) {
    return (
      <Card
        title="Risk History"
        action={
          allowDemo ? (
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              style={{ fontSize: 11, height: 26, padding: "0 10px" }}
              onClick={() => setShowSimulated(true)}
            >
              Preview Demo Timeline (DEMO SIMULATION)
            </button>
          ) : (
            <Pill tone="success">ON-CHAIN</Pill>
          )
        }
      >
        <div style={{ padding: "20px 0", textAlign: "center" }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "rgba(255, 255, 255, 0.04)",
              border: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 12px auto",
              color: "var(--text-3)",
            }}
          >
            <span style={{ fontFamily: "var(--mono)", fontSize: 14 }}>—</span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
            No historical risk events recorded yet.
          </div>
          <p style={{ fontSize: 12.5, color: "var(--text-3)", margin: "4px auto 0 auto", maxWidth: "46ch" }}>
            Under nominal operating conditions, this account has not experienced Risk Ratchet state transitions.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card
      title="Risk History"
      action={
        <div className="row g-8" style={{ alignItems: "center" }}>
          <Pill tone={isDemo || showSimulated ? "warning" : "success"}>
            {isDemo || showSimulated ? "DEMO SIMULATION" : "ON-CHAIN"}
          </Pill>
          {showSimulated && !isDemo && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              style={{ fontSize: 11, height: 22, padding: "0 6px" }}
              onClick={() => setShowSimulated(false)}
            >
              Hide Demo
            </button>
          )}
        </div>
      }
    >
      <p style={{ fontSize: 12.5, color: "var(--text-3)", margin: "0 0 16px 0" }}>
        Sequential timeline showing asymmetric fast-tightening and staged monotonic recovery across risk epochs.
      </p>

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

        {displayEvents.map((event, idx) => {
          const color = STATE_COLOR[event.newState] ?? "var(--text-3)";
          const isLast = idx === displayEvents.length - 1;
          const isMatching = activeState && event.newState === activeState;
          const isSelected = selectedIdx === idx;

          return (
            <div
              key={idx}
              onClick={() => setSelectedIdx(isSelected ? null : idx)}
              style={{
                position: "relative",
                paddingBottom: isLast ? 0 : 20,
                display: "flex",
                flexDirection: "column",
                gap: 4,
                cursor: "pointer",
              }}
            >
              {/* Dot on the timeline */}
              <div
                style={{
                  position: "absolute",
                  left: -24,
                  top: 3,
                  width: isMatching ? 12 : 10,
                  height: isMatching ? 12 : 10,
                  borderRadius: "50%",
                  background: color,
                  border: "2px solid var(--bg)",
                  boxShadow: isMatching
                    ? `0 0 0 3px ${color}66, 0 0 10px ${color}`
                    : `0 0 0 2px ${color}33`,
                  flexShrink: 0,
                  zIndex: 1,
                  transition: "all 0.3s ease",
                }}
              />

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, fontFamily: "var(--mono)", color: "var(--text-3)" }}>
                    {event.timestamp}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700 }}>
                    <span style={{ color: STATE_COLOR[event.priorState] }}>{event.priorState}</span>
                    <span style={{ color: "var(--text-3)" }}>→</span>
                    <span style={{ color: STATE_COLOR[event.newState] }}>{event.newState}</span>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {event.riskEpoch && (
                    <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--text-3)" }}>
                      Epoch #{event.riskEpoch}
                    </span>
                  )}
                  {(isDemo || showSimulated) && (
                    <Pill tone="neutral">DEMO SIMULATION</Pill>
                  )}
                </div>
              </div>

              <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 2 }}>
                <strong>Trigger:</strong> {event.trigger}
              </div>

              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 1 }}>
                <strong>Impact:</strong> {event.affectedPermission}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
