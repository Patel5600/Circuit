import React from "react";
import { Reveal } from "../ui/Reveal";
import { Pill } from "../ui";

interface MatrixRow {
  dimension: string;
  traditional: string;
  traditionalTone: "danger" | "neutral";
  circuit: string;
  circuitHighlight: string;
}

const ROWS: MatrixRow[] = [
  {
    dimension: "Collateral Domain",
    traditional: "Crypto-native tokens assuming 24/7 continuous liquidity pools.",
    traditionalTone: "neutral",
    circuit: "Tokenized real-world equities (NVDA, AAPL, MSFT, TSLA) backed by qualified custody.",
    circuitHighlight: "Real-World Equities",
  },
  {
    dimension: "Oracle Pricing",
    traditional: "Single point-estimate price p. Blind to publisher uncertainty or widening spreads.",
    traditionalTone: "danger",
    circuit: "Conservative valuation at lower bound: p_conservative = max(0, p - conf).",
    circuitHighlight: "Pyth Confidence Lower Bound",
  },
  {
    dimension: "Session Risk",
    traditional: "Operates 24/7 blindly across weekend gaps, earnings halts, and pre-market shocks.",
    traditionalTone: "danger",
    circuit: "Deterministic on-chain NYSE calendar via MarketGuard PDA gating borrowing off-hours.",
    circuitHighlight: "On-Chain MarketGuard",
  },
  {
    dimension: "Risk State Machine",
    traditional: "Binary state (solvent vs liquidatable). No gradual defensive posture.",
    traditionalTone: "danger",
    circuit: "4-State Risk Ratchet: Safe -> Restricted -> Defensive -> Emergency with fast tightening.",
    circuitHighlight: "Asymmetric Fast Tightening",
  },
  {
    dimension: "Recovery Protocol",
    traditional: "Instantly re-enables borrowing on a single favorable tick (flapping risk).",
    traditionalTone: "danger",
    circuit: "Monotonic 5-step hysteresis: requires consecutive healthy observations before state upgrades.",
    circuitHighlight: "Evidence-Based Hysteresis",
  },
  {
    dimension: "Concentration Penalty",
    traditional: "Flat static LTV regardless of single-stock concentration risk.",
    traditionalTone: "neutral",
    circuit: "Multi-asset concentration math: C_max > 40% dynamically lowers effective LTV from 70% to 52%.",
    circuitHighlight: "Dynamic Concentration Math",
  },
  {
    dimension: "Liquidation Game Theory",
    traditional: "Fixed flat bonus (e.g. 5%) creating a latency arms race among MEV bots.",
    traditionalTone: "danger",
    circuit: "Severity-scaled dynamic bonus: min(cap, base + shortfall * slope). Eliminates fixed-prize races.",
    circuitHighlight: "Severity-Scaled Bonus",
  },
];

export function FaultLineMatrix() {
  return (
    <section className="sec" id="comparison" style={{ position: "relative", zIndex: 1 }}>
      <div className="sec__inner">
        <Reveal>
          <p className="sec__index">
            <span className="sec__index__n">07</span>
            <span className="sec__index__t">Architectural Contrast</span>
          </p>
          <div className="row between g-16 wrap" style={{ alignItems: "flex-end", marginBottom: 32 }}>
            <div>
              <h2 className="sec__title">
                The Fault Lines of
                <br />
                <em>Equity Collateral.</em>
              </h2>
              <p className="t-base muted" style={{ maxWidth: 640, margin: "12px 0 0 0" }}>
                Tokenized stocks behave fundamentally differently than crypto tokens. Applying standard
                lending rules to real-world equities creates fatal insolvency vectors.
              </p>
            </div>
            <div className="row g-8">
              <Pill tone="neutral">Standard DeFi</Pill>
              <Pill tone="accent" withDot>Circuit Protocol</Pill>
            </div>
          </div>
        </Reveal>

        <div style={{ display: "grid", gap: 12, marginTop: 24 }}>
          {ROWS.map((row, idx) => (
            <Reveal key={row.dimension} delay={idx * 40}>
              <div
                style={{
                  background: "var(--card-bg, rgba(20, 24, 33, 0.6))",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "18px 22px",
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                  gap: 16,
                  alignItems: "center",
                }}
              >
                <div>
                  <span
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      color: "var(--text-3)",
                      display: "block",
                      marginBottom: 4,
                    }}
                  >
                    Dimension
                  </span>
                  <strong style={{ fontSize: 15, color: "var(--text)" }}>{row.dimension}</strong>
                </div>

                <div
                  style={{
                    padding: "10px 14px",
                    background: "rgba(255, 255, 255, 0.02)",
                    borderRadius: 8,
                    borderLeft: `3px solid ${
                      row.traditionalTone === "danger" ? "rgba(224, 108, 108, 0.6)" : "var(--border)"
                    }`,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 10,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: row.traditionalTone === "danger" ? "#e06c6c" : "var(--text-3)",
                      display: "block",
                      marginBottom: 4,
                    }}
                  >
                    Traditional Lending (Aave / Compound)
                  </span>
                  <span style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.4 }}>
                    {row.traditional}
                  </span>
                </div>

                <div
                  style={{
                    padding: "10px 14px",
                    background: "rgba(127, 195, 154, 0.04)",
                    borderRadius: 8,
                    borderLeft: "3px solid #7fc39a",
                  }}
                >
                  <div className="row between g-4" style={{ marginBottom: 4 }}>
                    <span
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        color: "#7fc39a",
                        fontWeight: 600,
                      }}
                    >
                      Circuit Protocol
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 10,
                        color: "var(--accent)",
                        padding: "1px 6px",
                        borderRadius: 4,
                        background: "rgba(207, 173, 116, 0.12)",
                      }}
                    >
                      {row.circuitHighlight}
                    </span>
                  </div>
                  <span style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.4, fontWeight: 450 }}>
                    {row.circuit}
                  </span>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
