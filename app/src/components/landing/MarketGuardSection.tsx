import React, { useState } from "react";
import { Reveal } from "../ui/Reveal";
import { isNyseMarketOpen } from "../../lib/session";

/**
 * Section 04 - The Guard: MarketGuard Session
 * 
 * Explains that market-session state matters independently from price.
 * Decouples UNDERLYING SESSION from ONCHAIN MARKET.
 * Proves that UNDERLYING CLOSED does NOT mean TOKEN UNAVAILABLE.
 */
export function MarketGuardSection() {
  const currentSession = isNyseMarketOpen();
  const [selectedUnderlying, setSelectedUnderlying] = useState<
    "REGULAR" | "PRE-MARKET" | "POST-MARKET" | "OVERNIGHT" | "CLOSED"
  >(currentSession.isOpen ? "REGULAR" : "CLOSED");

  // Derive MarketGuard policy state
  const isRegular = selectedUnderlying === "REGULAR";
  const guardStatus = isRegular ? "PERMITTED" : "RESTRICTED";
  const guardReason = isRegular ? "None" : "GuardReason::MarketClosed";
  const borrowEffect = isRegular ? "ALLOW_BORROW" : "RESTRICT_BORROW";

  return (
    <section className="sec" id="guard" style={{ position: "relative" }}>
      <div className="sec__inner">
        <Reveal>
          <p className="sec__index">
            <span className="sec__index__n">04</span>
            <span className="sec__index__t">The Guard · MarketGuard Session</span>
          </p>
          <h2 className="sec__title">
            Underlying venue closed does not mean
            <br />
            <em>token unavailable.</em>
          </h2>
          <p className="sec__lede">
            DeFi protocols either ignore equity market sessions entirely or shut down all operations
            when NYSE closes. Circuit’s <code className="mono">MarketGuard</code> decouples the underlying
            equity session from on-chain tradeability: tokenized stocks remain 100% tradeable and
            liquid 24/7, while credit creation is guarded against overnight gap-risk.
          </p>
        </Reveal>

        {/* 2-Column Architecture Comparison: Underlying Session vs Onchain Market */}
        <Reveal delay={100}>
          <div
            style={{
              margin: "36px 0",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: "24px",
            }}
          >
            {/* Column 1: Underlying Session (NYSE Reference) */}
            <div
              style={{
                padding: "28px",
                background: "rgba(16, 18, 24, 0.8)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-xl)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                <span style={{ fontSize: "11px", fontFamily: "var(--mono)", color: "var(--text-3)", letterSpacing: "0.08em" }}>
                  DIMENSION 1: UNDERLYING SESSION
                </span>
                <span style={{ fontSize: "11px", fontFamily: "var(--mono)", color: "var(--accent)" }}>
                  NYSE Reference
                </span>
              </div>

              <p style={{ fontSize: "13px", color: "var(--text-2)", marginBottom: "20px" }}>
                Select reference session to observe deterministic on-chain guard reaction:
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {(["REGULAR", "PRE-MARKET", "POST-MARKET", "OVERNIGHT", "CLOSED"] as const).map((s) => {
                  const active = selectedUnderlying === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSelectedUnderlying(s)}
                      style={{
                        padding: "10px 14px",
                        borderRadius: "var(--r-sm)",
                        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                        background: active ? "rgba(255, 255, 255, 0.07)" : "rgba(10, 11, 15, 0.6)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <span style={{ fontSize: "12.5px", fontFamily: "var(--mono)", fontWeight: active ? 700 : 500, color: active ? "var(--text)" : "var(--text-2)" }}>
                        {s}
                      </span>
                      <span style={{ fontSize: "11px", color: "var(--text-3)", fontFamily: "var(--mono)" }}>
                        {s === "REGULAR" ? "9:30–16:00 ET" : s === "CLOSED" ? "Weekend/Holiday" : "Extended"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Column 2: Onchain Market (Solana SPL) */}
            <div
              style={{
                padding: "28px",
                background: "rgba(16, 18, 24, 0.8)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-xl)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                  <span style={{ fontSize: "11px", fontFamily: "var(--mono)", color: "var(--text-3)", letterSpacing: "0.08em" }}>
                    DIMENSION 2: ONCHAIN PROTOCOL
                  </span>
                  <span style={{ fontSize: "11px", fontFamily: "var(--mono)", color: "#7fc39a" }}>
                    Solana 24/7
                  </span>
                </div>

                <div
                  style={{
                    padding: "16px",
                    background: "rgba(10, 11, 15, 0.85)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--r-lg)",
                    marginBottom: "20px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                    <span style={{ fontSize: "12px", color: "var(--text-2)" }}>Token Status:</span>
                    <span style={{ fontSize: "12px", fontFamily: "var(--mono)", color: "#7fc39a", fontWeight: 700 }}>
                      TRADEABLE & TRANSFERABLE
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                    <span style={{ fontSize: "12px", color: "var(--text-2)" }}>MarketGuard PDA:</span>
                    <span style={{ fontSize: "12px", fontFamily: "var(--mono)", color: isRegular ? "#7fc39a" : "#cfad74", fontWeight: 700 }}>
                      {guardStatus} ({guardReason})
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "12px", color: "var(--text-2)" }}>Credit Permission:</span>
                    <span style={{ fontSize: "12px", fontFamily: "var(--mono)", color: isRegular ? "#7fc39a" : "#cfad74", fontWeight: 700 }}>
                      {borrowEffect === "ALLOW_BORROW" ? "FULL BORROW" : "RESTRICTED (NO NEW DEBT)"}
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    padding: "14px",
                    borderRadius: "var(--r)",
                    background: isRegular ? "rgba(127, 195, 154, 0.08)" : "rgba(207, 173, 116, 0.08)",
                    border: `1px solid ${isRegular ? "rgba(127, 195, 154, 0.25)" : "rgba(207, 173, 116, 0.25)"}`,
                  }}
                >
                  <p style={{ margin: 0, fontSize: "12px", lineHeight: 1.5, color: isRegular ? "#7fc39a" : "#cfad74" }}>
                    {isRegular
                      ? "✓ Regular session: Full borrowing and liquidation permissions active."
                      : "⚠ Market closed: Token transfers and deposits remain active, but new borrows are restricted to protect against gap-open volatility."}
                  </p>
                </div>
              </div>

              <div style={{ marginTop: "24px", paddingTop: "16px", borderTop: "1px solid var(--border)" }}>
                <a href="#ratchet" className="btn btn--secondary btn--sm" style={{ width: "100%", textAlign: "center" }}>
                  Flow to Risk Ratchet ↓
                </a>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default MarketGuardSection;
