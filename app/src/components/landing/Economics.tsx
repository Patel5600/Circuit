import React from "react";
import { CLUSTER_LABEL } from "../../env";
import { Reveal } from "../ui/Reveal";
import { CIRCUIT_TREASURY_STRING } from "../../data/landingContent";

/**
 * Section 08 - The Economic Engine
 *
 * Demonstrates the non-extractive revenue model of Circuit:
 * Safe credit creation generates protocol origination fees.
 * Unsafe or blocked actions generate zero fees.
 * Liquidations are recovery mechanisms, not protocol profit centers.
 *
 * Real Devnet Treasury: 7AALMsZ5MuioSW7BMwBCwTmy9Y1fMJ6MKXAELYyrtb4
 */

const REVENUE_STEPS = [
  { step: "01", name: "MARKET", desc: "Pyth oracle + NYSE session validation" },
  { step: "02", name: "RISK", desc: "4-State Risk Ratchet state derivation" },
  { step: "03", name: "PERMISSION", desc: "Capital policy derives on-chain capacity" },
  { step: "04", name: "CREDIT", desc: "Authorized safe borrow drawdown" },
  { step: "05", name: "FEE", desc: "Atomic settlement to Circuit Treasury" },
];

export function Economics() {
  return (
    <section className="sec economics" id="economics">
      <div className="sec__inner">
        <Reveal>
          <p className="sec__index">
            <span className="sec__index__n">08</span>
            <span className="sec__index__t">The Economic Engine</span>
          </p>
          <h2 className="sec__title">
            Safe credit creates
            <br />
            <em>protocol revenue.</em>
          </h2>
          <p className="sec__lede" style={{ maxWidth: 720, marginTop: "14px" }}>
            circuit monetizes the infrastructure between tokenized assets and programmable capital.
            The protocol monetizes safe execution, not user liquidations or user losses.
          </p>
        </Reveal>

        {/* 5-Step Pipeline Card */}
        <Reveal delay={80}>
          <div
            style={{
              marginTop: "40px",
              padding: "24px",
              borderRadius: "6px",
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid var(--border)",
            }}
          >
            <div
              style={{
                fontSize: "11px",
                fontFamily: "var(--mono)",
                letterSpacing: "0.12em",
                color: "var(--accent)",
                marginBottom: "18px",
                textTransform: "uppercase",
              }}
            >
              Revenue Flow Sequence
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                gap: "12px",
                alignItems: "stretch",
              }}
            >
              {REVENUE_STEPS.map((s, i) => (
                <div
                  key={s.name}
                  style={{
                    padding: "14px",
                    borderRadius: "4px",
                    background: "rgba(255, 255, 255, 0.015)",
                    border: "1px solid rgba(255, 255, 255, 0.06)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <span
                      style={{
                        fontSize: "10px",
                        fontFamily: "var(--mono)",
                        color: "var(--text-3)",
                      }}
                    >
                      {s.step}
                    </span>
                    <div
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: "13px",
                        fontWeight: 600,
                        color: i === 4 ? "var(--accent)" : "var(--text)",
                        marginTop: "4px",
                      }}
                    >
                      {s.name}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: "var(--text-2)",
                      marginTop: "10px",
                      lineHeight: 1.45,
                    }}
                  >
                    {s.desc}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        {/* Revenue Thesis & Treasury Specifications */}
        <Reveal delay={140}>
          <div
            style={{
              marginTop: "24px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: "20px",
            }}
          >
            <div
              style={{
                padding: "22px",
                borderRadius: "6px",
                background: "rgba(255, 255, 255, 0.02)",
                border: "1px solid var(--border)",
              }}
            >
              <h3 style={{ margin: "0 0 10px", fontSize: "16px", fontWeight: 600, color: "var(--text)" }}>
                Execution Monetization Principle
              </h3>
              <p style={{ margin: 0, fontSize: "13px", color: "var(--text-2)", lineHeight: 1.6 }}>
                Successful credit execution generates a configurable protocol fee settled directly to
                the Circuit Treasury. Blocked unsafe actions generate zero protocol fees. Liquidations
                restore position solvency via Dutch auction discounts without acting as the primary
                profit engine.
              </p>
            </div>

            <div
              style={{
                padding: "22px",
                borderRadius: "6px",
                background: "rgba(207, 173, 116, 0.03)",
                border: "1px solid rgba(207, 173, 116, 0.22)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "8px" }}>
                <span style={{ fontSize: "11px", fontFamily: "var(--mono)", color: "var(--accent)", letterSpacing: "0.08em" }}>
                  CIRCUIT TREASURY
                </span>
                <span style={{ fontSize: "10px", fontFamily: "var(--mono)", color: "var(--text-3)" }}>
                  Solana {CLUSTER_LABEL}
                </span>
              </div>
              <div
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: "11px",
                  color: "var(--text)",
                  wordBreak: "break-all",
                  padding: "8px 10px",
                  borderRadius: "4px",
                  background: "rgba(0, 0, 0, 0.4)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  marginBottom: "10px",
                }}
              >
                {CIRCUIT_TREASURY_STRING}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text-2)" }}>
                <span>Fee Configuration: Default 25 bps (0.25%)</span>
                <span style={{ color: "var(--accent)" }}>Verifiable On-Chain</span>
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal delay={180}>
          <p
            style={{
              marginTop: "24px",
              fontSize: "11px",
              fontFamily: "var(--mono)",
              color: "var(--text-3)",
              textAlign: "center",
              letterSpacing: "0.06em",
            }}
          >
            ✦ DEVNET STATUS · NO REAL ECONOMIC VALUE · PROTOCOL METRICS DERIVE AUTHORITATIVELY ON-CHAIN ✦
          </p>
        </Reveal>
      </div>
    </section>
  );
}

export default Economics;
