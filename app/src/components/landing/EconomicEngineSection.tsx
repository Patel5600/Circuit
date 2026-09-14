import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Reveal } from "../ui/Reveal";
import { Icon } from "../ui";
import { CIRCUIT_TREASURY_ADDRESS, DEFAULT_BORROW_FEE_BPS, MAX_BORROW_FEE_BPS } from "../../config";
import { explorerUrl } from "../../env";

export function EconomicEngineSection() {
  const [copied, setCopied] = useState(false);

  const copyTreasury = () => {
    navigator.clipboard.writeText(CIRCUIT_TREASURY_ADDRESS);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="sec" id="economics" style={{ position: "relative" }}>
      <div className="sec__inner">
        <Reveal>
          <p className="sec__index">
            <span className="sec__index__n">09</span>
            <span className="sec__index__t">The Economic Engine · Sustainable Protocol Revenue</span>
          </p>
          <h2 className="sec__title">
            Safe credit creates protocol revenue.
            <br />
            <em>Liquidation is risk control, not a business model.</em>
          </h2>
          <p className="sec__lede">
            Circuit fundamentally departs from lending protocols that profit from user liquidations and market distress.
            Protocol revenue is generated strictly when credit is executed safely within verified risk parameters.
            Unsafe, blocked, or halted market actions generate exactly $0.00.
          </p>
        </Reveal>

        {/* Incentive Alignment Comparison */}
        <Reveal delay={100}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: "20px",
              margin: "36px 0 24px",
            }}
          >
            {/* Traditional Lending Model */}
            <div
              style={{
                padding: "28px",
                background: "rgba(18, 14, 14, 0.6)",
                border: "1px solid rgba(239, 68, 68, 0.25)",
                borderRadius: "var(--r-lg)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                <span style={{ fontSize: "11px", fontFamily: "var(--mono)", color: "var(--danger)", letterSpacing: "0.08em" }}>
                  TRADITIONAL DEFI LENDING
                </span>
                <span style={{ fontSize: "12px", color: "var(--text-3)" }}>Distress Monetization</span>
              </div>
              <h3 style={{ margin: "0 0 12px", fontSize: "18px", color: "var(--text)" }}>
                Profits from Market Cascades
              </h3>
              <p style={{ margin: 0, fontSize: "13.5px", color: "var(--text-2)", lineHeight: 1.6 }}>
                Traditional protocols collect massive liquidation penalties (5-15%) and elevated spread fees during panic.
                Their revenue surges when borrowers fail and volatile collateral collapses.
              </p>
              <div
                style={{
                  marginTop: "20px",
                  padding: "12px 14px",
                  background: "rgba(0, 0, 0, 0.4)",
                  borderRadius: "var(--r)",
                  fontSize: "12px",
                  fontFamily: "var(--mono)",
                  color: "var(--danger)",
                }}
              >
                Incentive: Permit aggressive borrows → Collect liquidation cuts
              </div>
            </div>

            {/* Circuit Programmable Model */}
            <div
              style={{
                padding: "28px",
                background: "rgba(14, 20, 16, 0.6)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                borderRadius: "var(--r-lg)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                <span style={{ fontSize: "11px", fontFamily: "var(--mono)", color: "var(--success)", letterSpacing: "0.08em" }}>
                  CIRCUIT PROTOCOL
                </span>
                <span style={{ fontSize: "12px", color: "var(--text-3)" }}>Solvency Monetization</span>
              </div>
              <h3 style={{ margin: "0 0 12px", fontSize: "18px", color: "var(--text)" }}>
                Monetizes Safe Credit Execution
              </h3>
              <p style={{ margin: 0, fontSize: "13.5px", color: "var(--text-2)", lineHeight: 1.6 }}>
                Circuit collects a clean 25 BPS (0.25%) execution fee on safe borrows.
                When the Risk Ratchet detects stress or markets close, borrowing halts and Circuit earns $0.00.
                Protocol revenue requires borrower safety.
              </p>
              <div
                style={{
                  marginTop: "20px",
                  padding: "12px 14px",
                  background: "rgba(0, 0, 0, 0.4)",
                  borderRadius: "var(--r)",
                  fontSize: "12px",
                  fontFamily: "var(--mono)",
                  color: "var(--success)",
                }}
              >
                Incentive: Block bad credit → Earn only on surviving credit
              </div>
            </div>
          </div>
        </Reveal>

        {/* 3 Strategic Revenue Pillars */}
        <Reveal delay={150}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "20px",
              margin: "24px 0 36px",
            }}
          >
            {/* Pillar 1 */}
            <div
              style={{
                padding: "24px",
                background: "var(--surface-1)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-lg)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
                <span
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "6px",
                    background: "rgba(16, 185, 129, 0.15)",
                    color: "var(--success)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "12px",
                    fontWeight: 700,
                    fontFamily: "var(--mono)",
                  }}
                >
                  01
                </span>
                <h4 style={{ margin: 0, fontSize: "16px", color: "var(--text)" }}>
                  Credit Execution
                </h4>
              </div>
              <p style={{ margin: 0, fontSize: "13px", color: "var(--text-2)", lineHeight: 1.6 }}>
                <strong>25 BPS (0.25%)</strong> origination fee settled directly to the treasury on successful borrows.
                Calculated on-chain with deterministic floor math. Zero fees on blocked transactions or repayments.
              </p>
              <div style={{ marginTop: "16px", fontSize: "11.5px", fontFamily: "var(--mono)", color: "var(--text-3)" }}>
                Status: <span style={{ color: "var(--success)" }}>Live on Devnet</span>
              </div>
            </div>

            {/* Pillar 2 */}
            <div
              style={{
                padding: "24px",
                background: "var(--surface-1)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-lg)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
                <span
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "6px",
                    background: "rgba(99, 102, 241, 0.15)",
                    color: "#818cf8",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "12px",
                    fontWeight: 700,
                    fontFamily: "var(--mono)",
                  }}
                >
                  02
                </span>
                <h4 style={{ margin: 0, fontSize: "16px", color: "var(--text)" }}>
                  Risk Infrastructure
                </h4>
              </div>
              <p style={{ margin: 0, fontSize: "13px", color: "var(--text-2)", lineHeight: 1.6 }}>
                Real-time MarketGuard API licensing and programmatic risk gates for external protocols,
                market makers, and institutional credit vaults requiring equity session awareness.
              </p>
              <div style={{ marginTop: "16px", fontSize: "11.5px", fontFamily: "var(--mono)", color: "var(--text-3)" }}>
                Status: <span style={{ color: "var(--accent)" }}>Planned / Architecture Ready</span>
              </div>
            </div>

            {/* Pillar 3 */}
            <div
              style={{
                padding: "24px",
                background: "var(--surface-1)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-lg)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
                <span
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "6px",
                    background: "rgba(245, 158, 11, 0.15)",
                    color: "#fbbf24",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "12px",
                    fontWeight: 700,
                    fontFamily: "var(--mono)",
                  }}
                >
                  03
                </span>
                <h4 style={{ margin: 0, fontSize: "16px", color: "var(--text)" }}>
                  Circuit Network
                </h4>
              </div>
              <p style={{ margin: 0, fontSize: "13px", color: "var(--text-2)", lineHeight: 1.6 }}>
                Shared risk-clearing settlement network for all tokenized real-world assets on Solana.
                Protocol fees fund an insurance reserve and automated liquidity provision across paired markets.
              </p>
              <div style={{ marginTop: "16px", fontSize: "11.5px", fontFamily: "var(--mono)", color: "var(--text-3)" }}>
                Status: <span style={{ color: "var(--text-3)" }}>Long-term Vision</span>
              </div>
            </div>
          </div>
        </Reveal>

        {/* On-Chain Treasury Transparency Card */}
        <Reveal delay={200}>
          <div
            style={{
              padding: "24px 28px",
              background: "rgba(10, 12, 16, 0.9)",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--r-lg)",
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
              <div>
                <span style={{ fontSize: "11px", fontFamily: "var(--mono)", color: "var(--text-3)", letterSpacing: "0.08em" }}>
                  ON-CHAIN TREASURY TRANSPARENCY
                </span>
                <h4 style={{ margin: "4px 0 0", fontSize: "16px", color: "var(--text)" }}>
                  Direct Settlement to Circuit Treasury
                </h4>
                <p style={{ margin: "6px 0 0", fontSize: "13px", color: "var(--text-2)" }}>
                  Every borrow transaction transfers 25 BPS directly to the on-chain treasury account validated by Anchor constraints.
                </p>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <div
                  style={{
                    padding: "8px 14px",
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--r)",
                    fontFamily: "var(--mono)",
                    fontSize: "12.5px",
                    color: "var(--text)",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <span>{CIRCUIT_TREASURY_ADDRESS.slice(0, 8)}...{CIRCUIT_TREASURY_ADDRESS.slice(-8)}</span>
                  <button
                    type="button"
                    onClick={copyTreasury}
                    style={{
                      background: "none",
                      border: "none",
                      color: copied ? "var(--success)" : "var(--text-3)",
                      cursor: "pointer",
                      padding: 0,
                    }}
                    title="Copy treasury address"
                  >
                    <Icon name={copied ? "check" : "copy"} size={13} />
                  </button>
                </div>

                <a
                  href={explorerUrl("address", CIRCUIT_TREASURY_ADDRESS)}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn--secondary btn--sm"
                >
                  <Icon name="external" size={13} />
                  Explorer
                </a>

                <Link to="/app/economics" className="btn btn--primary btn--sm">
                  View Economics
                  <Icon name="arrowRight" size={13} />
                </Link>
              </div>
            </div>

            <div
              style={{
                marginTop: "16px",
                paddingTop: "16px",
                borderTop: "1px solid var(--border)",
                display: "flex",
                flexWrap: "wrap",
                gap: "24px",
                fontSize: "12px",
                color: "var(--text-3)",
                fontFamily: "var(--mono)",
              }}
            >
              <div>
                Base Borrow Fee: <span style={{ color: "var(--text)" }}>{DEFAULT_BORROW_FEE_BPS} BPS (0.25%)</span>
              </div>
              <div>
                Hard Safety Cap: <span style={{ color: "var(--text)" }}>{MAX_BORROW_FEE_BPS} BPS (10.00%)</span>
              </div>
              <div>
                On-Chain Constraint: <span style={{ color: "var(--success)" }}>treasury_quote_ata.owner == fee_recipient</span>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
