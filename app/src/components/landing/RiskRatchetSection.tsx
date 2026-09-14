import React, { useState } from "react";
import { Reveal } from "../ui/Reveal";

export type RatchetState = "SAFE" | "RESTRICTED" | "DEFENSIVE" | "EMERGENCY";

interface PermissionRow {
  action: string;
  safe: "ALLOWED" | "BLOCKED" | "CONSTRAINED";
  restricted: "ALLOWED" | "BLOCKED" | "CONSTRAINED";
  defensive: "ALLOWED" | "BLOCKED" | "CONSTRAINED";
  emergency: "ALLOWED" | "BLOCKED" | "CONSTRAINED";
  note: string;
}

const PERMISSIONS: PermissionRow[] = [
  {
    action: "Borrow",
    safe: "ALLOWED",
    restricted: "CONSTRAINED",
    defensive: "BLOCKED",
    emergency: "BLOCKED",
    note: "Safe: full LTV; Restricted: policy capped; Defensive/Emergency: zero new debt",
  },
  {
    action: "Withdraw",
    safe: "ALLOWED",
    restricted: "CONSTRAINED",
    defensive: "BLOCKED",
    emergency: "BLOCKED",
    note: "Blocked if position holds outstanding debt to prevent collateral flight",
  },
  {
    action: "Repay",
    safe: "ALLOWED",
    restricted: "ALLOWED",
    defensive: "ALLOWED",
    emergency: "ALLOWED",
    note: "Always allowed in all 4 states so borrowers can de-risk their position",
  },
  {
    action: "Deposit",
    safe: "ALLOWED",
    restricted: "ALLOWED",
    defensive: "ALLOWED",
    emergency: "ALLOWED",
    note: "Always allowed to bolster collateral backing",
  },
  {
    action: "Liquidate",
    safe: "ALLOWED",
    restricted: "ALLOWED",
    defensive: "ALLOWED",
    emergency: "ALLOWED",
    note: "Emergency state uses last_valid_price snapshot, never degraded oracle",
  },
];

const STATE_COLORS: Record<RatchetState, string> = {
  SAFE: "#7fc39a",
  RESTRICTED: "#cfad74",
  DEFENSIVE: "#e08c4e",
  EMERGENCY: "#cf8b8b",
};

/**
 * Section 05 - The Ratchet: 4-State Risk Ratchet
 * 
 * FLAGSHIP PRIMITIVE.
 * Visualizes the 4-state mechanical permission machine:
 * SAFE -> RESTRICTED -> DEFENSIVE -> EMERGENCY.
 * Asymmetric fast tightening vs monotonic 5-step recovery.
 * Direct EMERGENCY -> SAFE is strictly prohibited.
 * Visualizes hysteresis entry vs recovery deadbands.
 */
export function RiskRatchetSection() {
  const [activeState, setActiveState] = useState<RatchetState>("SAFE");
  const [healthyCranks, setHealthyCranks] = useState<number>(0);
  const [illegalAttempt, setIllegalAttempt] = useState<string | null>(null);

  // Recovery handler: requires 5 consecutive healthy observations
  const handleCrankHealthy = () => {
    setIllegalAttempt(null);
    if (activeState === "SAFE") return;

    if (healthyCranks + 1 >= 5) {
      // Step up one state monotonically
      if (activeState === "EMERGENCY") setActiveState("DEFENSIVE");
      else if (activeState === "DEFENSIVE") setActiveState("RESTRICTED");
      else if (activeState === "RESTRICTED") setActiveState("SAFE");
      setHealthyCranks(0);
    } else {
      setHealthyCranks((prev) => prev + 1);
    }
  };

  // Tighten instantly to any deteriorated state
  const handleTighten = (target: RatchetState) => {
    setIllegalAttempt(null);
    setHealthyCranks(0);
    setActiveState(target);
  };

  // Attempt illegal jump
  const handleAttemptIllegalJump = () => {
    setIllegalAttempt(
      "Program Error: InvalidRatchetRecovery. Direct jump from EMERGENCY to SAFE is strictly forbidden on-chain. Recovery must be monotonic through DEFENSIVE and RESTRICTED with 5 healthy observations each."
    );
  };

  return (
    <section className="sec" id="ratchet" style={{ position: "relative" }}>
      <div className="sec__inner">
        <Reveal>
          <p className="sec__index">
            <span className="sec__index__n">05</span>
            <span className="sec__index__t">The Ratchet · 4-State Risk Machine</span>
          </p>
          <h2 className="sec__title">
            Asymmetric fast tightening.
            <br />
            <em>Strict monotonic recovery.</em>
          </h2>
          <p className="sec__lede">
            DeFi liquidations fail because lending protocols treat risk as a static scalar. Circuit
            introduces the <strong>Risk Ratchet</strong>: risk states tighten instantaneously upon any
            confidence breach, custody impairment, or market close, while recovery requires 5 consecutive
            clean observations and strictly progresses through explicit intermediate stages.
          </p>
        </Reveal>

        {/* Interactive Ratchet Control & Epoch */}
        <Reveal delay={100}>
          <div
            style={{
              margin: "36px 0 24px",
              padding: "24px 28px",
              background: "rgba(16, 18, 24, 0.85)",
              border: `1px solid ${STATE_COLORS[activeState]}`,
              borderRadius: "var(--r-xl)",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "20px",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                <span
                  style={{
                    fontSize: "11px",
                    fontFamily: "var(--mono)",
                    color: "var(--text-3)",
                    letterSpacing: "0.08em",
                  }}
                >
                  PROTOCOL RISK EPOCH #42
                </span>
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: "4px",
                    fontSize: "11px",
                    fontFamily: "var(--mono)",
                    fontWeight: 700,
                    background: `${STATE_COLORS[activeState]}18`,
                    color: STATE_COLORS[activeState],
                    border: `1px solid ${STATE_COLORS[activeState]}55`,
                  }}
                >
                  ACTIVE: {activeState}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: "13px", color: "var(--text-2)" }}>
                {activeState === "SAFE"
                  ? "All market gates clear. Full borrowing and withdrawal permissions granted."
                  : activeState === "RESTRICTED"
                  ? "NYSE session closed or confidence elevated. Borrowing constrained to protect solvency."
                  : activeState === "DEFENSIVE"
                  ? "Elevated uncertainty. New debt blocked. Position de-risking active."
                  : "Critical breach or stale oracle. All new debt halted. Liquidation at last valid price."}
              </p>
            </div>

            {/* Interactive State Controls */}
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px" }}>
              <button
                type="button"
                onClick={() => handleTighten("RESTRICTED")}
                className="btn btn--secondary btn--sm"
              >
                Tighten → RESTRICTED
              </button>
              <button
                type="button"
                onClick={() => handleTighten("EMERGENCY")}
                className="btn btn--danger btn--sm"
              >
                Fast Breach → EMERGENCY
              </button>

              {activeState !== "SAFE" && (
                <button
                  type="button"
                  onClick={handleCrankHealthy}
                  className="btn btn--accent btn--sm"
                >
                  Observe Clean ({healthyCranks}/5)
                </button>
              )}

              {activeState === "EMERGENCY" && (
                <button
                  type="button"
                  onClick={handleAttemptIllegalJump}
                  className="btn btn--ghost btn--sm"
                  style={{ color: "#cf8b8b" }}
                >
                  Attempt Jump to SAFE ✗
                </button>
              )}
            </div>
          </div>
        </Reveal>

        {/* Illegal Jump Error Rejection Banner */}
        {illegalAttempt && (
          <Reveal>
            <div
              style={{
                marginBottom: "24px",
                padding: "14px 18px",
                background: "rgba(207, 139, 139, 0.12)",
                border: "1px solid #cf8b8b",
                borderRadius: "var(--r)",
                fontSize: "12.5px",
                fontFamily: "var(--mono)",
                color: "#cf8b8b",
                lineHeight: 1.5,
              }}
            >
              {illegalAttempt}
            </div>
          </Reveal>
        )}

        {/* Mechanical Permission Matrix Table */}
        <Reveal delay={150}>
          <div
            style={{
              overflowX: "auto",
              background: "rgba(12, 14, 18, 0.9)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-xl)",
              marginBottom: "32px",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", background: "rgba(255,255,255,0.02)" }}>
                  <th style={{ padding: "16px 20px", color: "var(--text-3)", fontWeight: 600 }}>Capital Action</th>
                  <th style={{ padding: "16px 20px", color: STATE_COLORS.SAFE, fontWeight: 700 }}>SAFE</th>
                  <th style={{ padding: "16px 20px", color: STATE_COLORS.RESTRICTED, fontWeight: 700 }}>RESTRICTED</th>
                  <th style={{ padding: "16px 20px", color: STATE_COLORS.DEFENSIVE, fontWeight: 700 }}>DEFENSIVE</th>
                  <th style={{ padding: "16px 20px", color: STATE_COLORS.EMERGENCY, fontWeight: 700 }}>EMERGENCY</th>
                  <th style={{ padding: "16px 20px", color: "var(--text-3)", fontWeight: 500 }}>Protocol Invariant</th>
                </tr>
              </thead>
              <tbody>
                {PERMISSIONS.map((row) => (
                  <tr key={row.action} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "14px 20px", fontWeight: 700, color: "var(--text)" }}>{row.action}</td>
                    <td style={{ padding: "14px 20px", fontFamily: "var(--mono)", color: STATE_COLORS.SAFE }}>
                      {row.safe}
                    </td>
                    <td
                      style={{
                        padding: "14px 20px",
                        fontFamily: "var(--mono)",
                        color: row.restricted === "CONSTRAINED" ? STATE_COLORS.RESTRICTED : STATE_COLORS.SAFE,
                      }}
                    >
                      {row.restricted}
                    </td>
                    <td
                      style={{
                        padding: "14px 20px",
                        fontFamily: "var(--mono)",
                        color: row.defensive === "BLOCKED" ? STATE_COLORS.DEFENSIVE : STATE_COLORS.SAFE,
                        fontWeight: row.defensive === "BLOCKED" ? 700 : 400,
                      }}
                    >
                      {row.defensive}
                    </td>
                    <td
                      style={{
                        padding: "14px 20px",
                        fontFamily: "var(--mono)",
                        color: row.emergency === "BLOCKED" ? STATE_COLORS.EMERGENCY : STATE_COLORS.SAFE,
                        fontWeight: row.emergency === "BLOCKED" ? 700 : 400,
                      }}
                    >
                      {row.emergency}
                    </td>
                    <td style={{ padding: "14px 20px", fontSize: "12px", color: "var(--text-3)" }}>{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>

        {/* Hysteresis Gap Visualization */}
        <Reveal delay={200}>
          <div
            style={{
              padding: "24px 28px",
              background: "rgba(16, 18, 24, 0.8)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-lg)",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "24px",
            }}
          >
            <div>
              <span style={{ fontSize: "11px", fontFamily: "var(--mono)", color: "var(--text-3)", letterSpacing: "0.08em" }}>
                HYSTERESIS DEADBAND (Y &lt; X)
              </span>
              <h4 style={{ margin: "4px 0 6px", fontSize: "16px", color: "var(--text)" }}>
                Recovery Requires Stronger Evidence Than Entry
              </h4>
              <p style={{ margin: 0, fontSize: "13px", color: "var(--text-2)", maxWidth: "650px" }}>
                To enter <span style={{ color: STATE_COLORS.RESTRICTED }}>RESTRICTED</span>, confidence ratio only
                needs to cross <strong>50 bps (0.50%)</strong>. To recover to{" "}
                <span style={{ color: STATE_COLORS.SAFE }}>SAFE</span>, confidence must tighten below{" "}
                <strong>30 bps (0.30%)</strong>. The 20 bps deadband prevents flapping around state boundaries.
              </p>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <div style={{ textAlign: "center" }}>
                <span style={{ fontSize: "10.5px", color: "var(--text-3)", display: "block" }}>ENTRY THRESHOLD</span>
                <span style={{ fontSize: "18px", fontFamily: "var(--mono)", fontWeight: 700, color: STATE_COLORS.RESTRICTED }}>
                  &gt; 50 bps
                </span>
              </div>
              <span style={{ fontSize: "20px", color: "var(--text-3)" }}>→</span>
              <div style={{ textAlign: "center" }}>
                <span style={{ fontSize: "10.5px", color: "var(--text-3)", display: "block" }}>RECOVERY THRESHOLD</span>
                <span style={{ fontSize: "18px", fontFamily: "var(--mono)", fontWeight: 700, color: STATE_COLORS.SAFE }}>
                  &lt; 30 bps
                </span>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default RiskRatchetSection;
