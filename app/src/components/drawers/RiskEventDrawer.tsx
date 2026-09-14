/**
 * Circuit Protocol - Risk Event Drawer
 *
 * Explains on-chain Risk Ratchet states, asymmetric tightening, and monotonic recovery.
 */

import React from "react";
import { Drawer } from "../ui/Drawer";
import { RiskRatchetState } from "../../lib/domain/types";
import { Pill, Button } from "../ui";

export function RiskEventDrawer({
  ratchetState,
  open,
  onClose,
}: {
  ratchetState: RiskRatchetState;
  open: boolean;
  onClose: () => void;
}) {
  const tone =
    ratchetState === "SAFE"
      ? "success"
      : ratchetState === "RESTRICTED"
      ? "warning"
      : "danger";

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Protocol Risk Ratchet"
      subtitle="On-Chain Credit Permission State Machine"
      badge={<Pill tone={tone} withDot>{ratchetState}</Pill>}
    >
      <div className="stack g-16">
        {/* Active State Banner */}
        <div
          style={{
            padding: 16,
            background: "var(--surface-2, #0d0f15)",
            borderRadius: "var(--r, 10px)",
            border: "1px solid var(--border, #1a1d26)",
          }}
        >
          <div className="row between g-8" style={{ alignItems: "center" }}>
            <span className="t-label">Current State</span>
            <Pill tone={tone}>{ratchetState}</Pill>
          </div>

          <div style={{ marginTop: 10, fontSize: 13, color: "var(--text)", lineHeight: 1.45 }}>
            {ratchetState === "SAFE" &&
              "Market feeds are fresh and narrow (confidence spread < 50 bps). Full credit capacity and standard withdrawal permissions active."}
            {ratchetState === "RESTRICTED" &&
              "Moderate oracle uncertainty detected. Borrow capacity dynamically constrained by conservative valuation haircuts."}
            {ratchetState === "DEFENSIVE" &&
              "High market volatility or off-hours session. New debt creation is locked to prevent underwater liquidations."}
            {ratchetState === "EMERGENCY" &&
              "Extreme oracle spread or upstream circuit breaker breach. Full protocol credit containment enforced."}
          </div>
        </div>

        {/* The 4 Ratchet States */}
        <div
          className="stack g-10"
          style={{
            padding: 16,
            background: "var(--surface-2, #0d0f15)",
            borderRadius: "var(--r, 10px)",
            border: "1px solid var(--border, #1a1d26)",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-3)" }}>
            RATCHET STATE MATRIX
          </div>

          <div className="stack g-8" style={{ fontSize: 12.5, lineHeight: 1.4 }}>
            <div style={{ padding: "8px 10px", borderRadius: 6, background: "rgba(127, 195, 154, 0.08)", border: "1px solid rgba(127, 195, 154, 0.2)" }}>
              <strong style={{ color: "var(--success)" }}>1. SAFE:</strong> Spread &le; 50 bps. 100% borrowing permitted.
            </div>

            <div style={{ padding: "8px 10px", borderRadius: 6, background: "rgba(229, 169, 59, 0.08)", border: "1px solid rgba(229, 169, 59, 0.2)" }}>
              <strong style={{ color: "var(--warning)" }}>2. RESTRICTED:</strong> Spread 50–150 bps. Haircuts applied to borrow capacity.
            </div>

            <div style={{ padding: "8px 10px", borderRadius: 6, background: "rgba(240, 110, 40, 0.08)", border: "1px solid rgba(240, 110, 40, 0.2)" }}>
              <strong style={{ color: "#f06e28" }}>3. DEFENSIVE:</strong> Spread 150–300 bps. Borrowing locked; withdrawals restricted.
            </div>

            <div style={{ padding: "8px 10px", borderRadius: 6, background: "rgba(224, 82, 82, 0.08)", border: "1px solid rgba(224, 82, 82, 0.2)" }}>
              <strong style={{ color: "var(--danger)" }}>4. EMERGENCY:</strong> Spread &gt; 300 bps or stale feed. Complete containment.
            </div>
          </div>
        </div>

        {/* Asymmetric Invariant Note */}
        <div
          className="stack g-6"
          style={{
            padding: 14,
            background: "#08090d",
            borderRadius: "var(--r, 10px)",
            border: "1px solid var(--border, #1a1d26)",
            fontSize: 12,
            color: "var(--text-2)",
            lineHeight: 1.45,
          }}
        >
          <strong style={{ color: "var(--text)" }}>Asymmetric Hysteresis Recovery:</strong>
          <span>
            Tightening happens instantly upon any breach. Recovery requires multiple consecutive healthy observations and must step through each state monotonically (e.g. EMERGENCY &rarr; DEFENSIVE &rarr; RESTRICTED &rarr; SAFE). Direct jumps to SAFE are strictly prohibited on-chain.
          </span>
        </div>

        <Button variant="secondary" onClick={onClose} style={{ marginTop: 8 }}>
          Close
        </Button>
      </div>
    </Drawer>
  );
}
