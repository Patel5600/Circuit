import React from "react";
import { Reveal } from "../ui/Reveal";

interface ComparisonRow {
  dimension: string;
  traditional: string;
  circuit: string;
}

const COMPARISONS: ComparisonRow[] = [
  {
    dimension: "Valuation Philosophy",
    traditional: "Raw spot price; ignores oracle publisher disagreement and latency.",
    circuit: "Conservative valuation: p - conf. Uncertainty immediately reduces credit limit.",
  },
  {
    dimension: "Market Sessions",
    traditional: "Completely blind to equity market closes, allowing overnight gap liquidations.",
    circuit: "Deterministic MarketGuard session account decouples 24/7 trading from borrowing risk.",
  },
  {
    dimension: "Risk Engine",
    traditional: "Static scalar number on a dashboard; zero direct programmatic enforcement.",
    circuit: "Programmable 4-State Risk Ratchet with asymmetric tightening and strict permission gates.",
  },
  {
    dimension: "Recovery Invariant",
    traditional: "Snaps back immediately to normal on a single optimistic price tick.",
    circuit: "Monotonic 5-observation staged recovery with hysteresis deadbands. Direct EMERGENCY -> SAFE forbidden.",
  },
  {
    dimension: "Liquidation Policy",
    traditional: "Fixed-percentage liquidation race using potentially unverified or stale prices.",
    circuit: "Dynamic severity-scaled bonus clamped to invariant floor, anchored to last_valid_price snapshot.",
  },
  {
    dimension: "Product Paradigm",
    traditional: "Deposit → Borrow (Credit is the only story).",
    circuit: "Asset → Evidence → Safety → Risk → Permission → Credit (Credit is downstream).",
  },
];

/**
 * Section 08 - Why Circuit
 * 
 * "Risk is not a number on a dashboard. Risk determines what capital is allowed to do."
 * Direct architectural contrast between traditional lending and Circuit's programmable risk layer.
 */
export function WhyCircuitSection() {
  return (
    <section className="sec" id="why" style={{ position: "relative" }}>
      <div className="sec__inner">
        <Reveal>
          <p className="sec__index">
            <span className="sec__index__n">08</span>
            <span className="sec__index__t">Why Circuit · The Paradigm Shift</span>
          </p>
          <h2 className="sec__title">
            Risk is not a number on a dashboard.
            <br />
            <em>Risk determines what capital is allowed to do.</em>
          </h2>
          <p className="sec__lede">
            Tokenized equities are real-world financial assets backed by regulated custody. They cannot
            be treated like volatile crypto tokens in a static lending pool. Circuit turns risk into
            verifiable on-chain permissions.
          </p>
        </Reveal>

        {/* Comparison Table */}
        <Reveal delay={100}>
          <div
            style={{
              margin: "36px 0",
              overflowX: "auto",
              background: "rgba(14, 16, 22, 0.9)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-xl)",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", background: "rgba(255,255,255,0.02)" }}>
                  <th style={{ padding: "16px 20px", color: "var(--text-3)", width: "22%" }}>Architectural Dimension</th>
                  <th style={{ padding: "16px 20px", color: "var(--text-3)", width: "38%" }}>Traditional DeFi Lending</th>
                  <th style={{ padding: "16px 20px", color: "#7fc39a", width: "40%" }}>Circuit Protocol</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISONS.map((row) => (
                  <tr key={row.dimension} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "16px 20px", fontWeight: 700, color: "var(--text)" }}>{row.dimension}</td>
                    <td style={{ padding: "16px 20px", color: "var(--text-3)", lineHeight: 1.5 }}>{row.traditional}</td>
                    <td style={{ padding: "16px 20px", color: "var(--text-1)", lineHeight: 1.5, fontWeight: 500 }}>
                      <span style={{ color: "#7fc39a", marginRight: "6px" }}>✓</span>
                      {row.circuit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default WhyCircuitSection;
