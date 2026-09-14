import React from "react";
import { Link } from "react-router-dom";
import { Reveal } from "../ui/Reveal";

/**
 * Section 06 - The Consequence: Programmable Credit
 * 
 * Credit is the FINAL downstream consequence, never the lead.
 * Visualizes Credit Permission (BORROW ALLOWED / BLOCKED), Effective LTV,
 * Borrow Capacity, and Health Factor.
 * Audited: Maps each claim directly to on-chain implementation.
 */
export function ProgrammableCreditSection() {
  return (
    <section className="sec" id="credit" style={{ position: "relative" }}>
      <div className="sec__inner">
        <Reveal>
          <p className="sec__index">
            <span className="sec__index__n">06</span>
            <span className="sec__index__t">The Consequence · Programmable Credit</span>
          </p>
          <h2 className="sec__title">
            Credit is downstream of risk.
            <br />
            <em>Never the first step.</em>
          </h2>
          <p className="sec__lede">
            In Circuit, you do not simply click borrow and receive a loan. Credit is the mathematical
            consequence of verified assets, conservative oracle bounds, market session validation,
            and the 4-state Risk Ratchet.
          </p>
        </Reveal>

        {/* Downstream Credit Output Panel */}
        <Reveal delay={100}>
          <div
            style={{
              margin: "36px 0",
              padding: "32px",
              background: "rgba(14, 16, 22, 0.9)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-xl)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
              <div>
                <span style={{ fontSize: "11px", fontFamily: "var(--mono)", color: "var(--text-3)", letterSpacing: "0.08em" }}>
                  STAGE 05: OUTPUT ARTIFACT
                </span>
                <h3 style={{ margin: "4px 0 0", fontSize: "20px", fontWeight: 700, color: "var(--text)" }}>
                  Verified Credit Facility
                </h3>
              </div>

              <span
                style={{
                  padding: "4px 12px",
                  borderRadius: "var(--r-sm)",
                  fontSize: "12px",
                  fontFamily: "var(--mono)",
                  fontWeight: 700,
                  background: "rgba(127, 195, 154, 0.15)",
                  color: "#7fc39a",
                  border: "1px solid rgba(127, 195, 154, 0.35)",
                }}
              >
                BORROW ALLOWED
              </span>
            </div>

            {/* Metrics Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "16px",
                marginBottom: "28px",
              }}
            >
              <div style={{ padding: "18px 20px", background: "rgba(10, 11, 14, 0.8)", border: "1px solid var(--border)", borderRadius: "var(--r)" }}>
                <span style={{ fontSize: "11px", color: "var(--text-3)", textTransform: "uppercase" }}>Credit Permission</span>
                <p style={{ margin: "4px 0 0", fontSize: "18px", fontWeight: 700, fontFamily: "var(--mono)", color: "#7fc39a" }}>
                  UNRESTRICTED
                </p>
                <span style={{ fontSize: "10.5px", color: "var(--text-3)" }}>All 4 gates passed</span>
              </div>

              <div style={{ padding: "18px 20px", background: "rgba(10, 11, 14, 0.8)", border: "1px solid var(--border)", borderRadius: "var(--r)" }}>
                <span style={{ fontSize: "11px", color: "var(--text-3)", textTransform: "uppercase" }}>Effective LTV</span>
                <p style={{ margin: "4px 0 0", fontSize: "18px", fontWeight: 700, fontFamily: "var(--mono)", color: "var(--text)" }}>
                  64.2% <span style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 400 }}>(Base: 70%)</span>
                </p>
                <span style={{ fontSize: "10.5px", color: "#cfad74" }}>-5.8% Concentration haircut</span>
              </div>

              <div style={{ padding: "18px 20px", background: "rgba(10, 11, 14, 0.8)", border: "1px solid var(--border)", borderRadius: "var(--r)" }}>
                <span style={{ fontSize: "11px", color: "var(--text-3)", textTransform: "uppercase" }}>Borrow Capacity</span>
                <p style={{ margin: "4px 0 0", fontSize: "18px", fontWeight: 700, fontFamily: "var(--mono)", color: "var(--text)" }}>
                  $8,870 USDC
                </p>
                <span style={{ fontSize: "10.5px", color: "var(--text-3)" }}>Against $13,820 collateral</span>
              </div>

              <div style={{ padding: "18px 20px", background: "rgba(10, 11, 14, 0.8)", border: "1px solid var(--border)", borderRadius: "var(--r)" }}>
                <span style={{ fontSize: "11px", color: "var(--text-3)", textTransform: "uppercase" }}>Health Factor</span>
                <p style={{ margin: "4px 0 0", fontSize: "18px", fontWeight: 700, fontFamily: "var(--mono)", color: "#7fc39a" }}>
                  1.56
                </p>
                <span style={{ fontSize: "10.5px", color: "var(--text-3)" }}>Liq. Threshold: 1.00</span>
              </div>
            </div>

            {/* Implementation Claims Audit Mapping */}
            <div style={{ paddingTop: "20px", borderTop: "1px solid var(--border)" }}>
              <span style={{ fontSize: "11px", fontFamily: "var(--mono)", color: "var(--text-3)", letterSpacing: "0.08em", display: "block", marginBottom: "12px" }}>
                ON-CHAIN PROTOCOL PROOF MAPPING
              </span>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                    <span style={{ fontSize: "9px", padding: "1px 5px", borderRadius: "2px", background: "rgba(127, 195, 154, 0.15)", color: "#7fc39a", fontFamily: "var(--mono)" }}>LIVE</span>
                    <strong style={{ fontSize: "12.5px", color: "var(--text)" }}>On-Chain Permissions</strong>
                  </div>
                  <p style={{ margin: 0, fontSize: "11.5px", color: "var(--text-2)", lineHeight: 1.45 }}>
                    In <code className="mono">borrow.rs</code>: Program strictly rejects instructions when Ratchet is DEFENSIVE or EMERGENCY with explicit error codes.
                  </p>
                </div>

                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                    <span style={{ fontSize: "9px", padding: "1px 5px", borderRadius: "2px", background: "rgba(127, 195, 154, 0.15)", color: "#7fc39a", fontFamily: "var(--mono)" }}>LIVE</span>
                    <strong style={{ fontSize: "12.5px", color: "var(--text)" }}>Dynamic LTV</strong>
                  </div>
                  <p style={{ margin: 0, fontSize: "11.5px", color: "var(--text-2)", lineHeight: 1.45 }}>
                    In <code className="mono">fixed_point.rs</code>: When dominant asset weight exceeds 40%, effective LTV is reduced by <code className="mono">(C_max - 40) * 36 bps</code>.
                  </p>
                </div>

                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                    <span style={{ fontSize: "9px", padding: "1px 5px", borderRadius: "2px", background: "rgba(127, 195, 154, 0.15)", color: "#7fc39a", fontFamily: "var(--mono)" }}>LIVE</span>
                    <strong style={{ fontSize: "12.5px", color: "var(--text)" }}>Scaled Liquidations</strong>
                  </div>
                  <p style={{ margin: 0, fontSize: "11.5px", color: "var(--text-2)", lineHeight: 1.45 }}>
                    In <code className="mono">liquidate.rs</code>: Scaled bonus scales with health factor shortfall, referencing <code className="mono">last_valid_price</code> under degraded oracles.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default ProgrammableCreditSection;
