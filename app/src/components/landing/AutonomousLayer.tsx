import React, { useState } from "react";

import { Reveal } from "../ui/Reveal";

/**
 * Section 05 - The Autonomous Execution Layer.
 *
 * Designed in full alignment with Circuit's typography-first aesthetic.
 * Explains how humans grant bounded execution authority to autonomous agents
 * operating strictly within on-chain risk boundaries.
 */

interface Pillar {
  id: string;
  badge: string;
  title: string;
  formula: string;
  description: string;
  items: string[];
}

const PILLARS: Pillar[] = [
  {
    id: "delegation",
    badge: "NON-CUSTODIAL PDA",
    title: "Deterministic Authority Delegation",
    formula: 'seeds = [b"authority", owner, agent, asset_mint]',
    description:
      "Users delegate execution capability without ever surrendering asset custody. Authority is strictly scoped to specific asset mints, max borrow caps, and expiration timestamps.",
    items: [
      "Zero custodial risk — tokens never leave program vault PDA",
      "Per-action borrow limits enforced mathematically on Solana",
      "Instant on-chain revocation at any time by owner wallet",
    ],
  },
  {
    id: "sentinels",
    badge: "24/7 AUTONOMOUS PROTECTION",
    title: "9 Continuous Background Sentinels",
    formula: "Trigger: Oracle Tick | NYSE Session Halt | HF < 1.15",
    description:
      "Nine specialized event-driven sentinels monitor collateral health around the clock, taking defensive capital actions before liquidation cascades can occur.",
    items: [
      "Off-Market Gap Sentinel pauses leverage during NYSE market closes",
      "Oracle Confidence Sentinel rejects wide uncertainty intervals",
      "Auto-Rebalance Sentinel adjusts collateral before margin call thresholds",
    ],
  },
  {
    id: "router",
    badge: "RESOURCE GOVERNED",
    title: "Two-Tier Model Router & Credit Ledger",
    formula: "Circuit Lite (1 cr) ⇄ Circuit Pro (4 cr)",
    description:
      "Multi-model routing dispatches queries intelligently. Lightweight telemetry and health checks route to Circuit Lite; multi-step rebalancing routes to Circuit Pro.",
    items: [
      "Cryptographic append-only credit ledger with 100 free starter credits",
      "Two-phase atomic reservations protect user credit balances",
      "Transparent cost preview on every proposed agent transaction",
    ],
  },
  {
    id: "sovereignty",
    badge: "UNBREAKABLE INVARIANT",
    title: "Protocol Sovereignty & Zero Drainage",
    formula: "Untrusted AI Output ∩ On-Chain Risk Ratchet = Valid Execution",
    description:
      "AI models provide untrusted reasoning, never direct authorization. Even if an AI hallucinates or compute credits reach zero, manual user recovery remains 100% open.",
    items: [
      "Adversarial prompt injection cannot bypass Rust program constraints",
      "Loop circuit breaker halts repeated execution failures automatically",
      "Capital recovery (REPAY) remains unconditionally accessible in all risk states",
    ],
  },
];

const TERMINAL_LOGS = [
  { time: "14:32:01", tag: "SENTINEL_01", msg: "Collateral Health Factor = 1.42 (HEALTHY)", tone: "mint" },
  { time: "14:32:04", tag: "MARKET_GUARD", msg: "NYSE Regular Trading Session active · Pyth conf ±0.03%", tone: "info" },
  { time: "14:32:09", tag: "MODEL_ROUTER", msg: "User query 'Borrow 150 USDC against NVDAx' → Routed to Circuit Lite (1 cr)", tone: "neutral" },
  { time: "14:32:10", tag: "AUTHORITY_PDA", msg: "Evaluating seeds [b'authority', Owner, Agent, NVDAx] → BOUNDS SATISFIED", tone: "mint" },
  { time: "14:32:10", tag: "RISK_RATCHET", msg: "Protocol State: NORMAL · Loan-to-Value 68.2% < 70.0% Max · APPROVED", tone: "mint" },
  { time: "14:32:12", tag: "SOLANA_EXEC", msg: "Atomic CPI Borrow Drawdown Confirmed · Tx 5Kz9...4dF2", tone: "accent" },
];

export function AutonomousLayer() {
  const [activeTab, setActiveTab] = useState(0);
  const activePillar = PILLARS[activeTab];

  return (
    <section className="sec" id="autonomous" style={{ position: "relative", zIndex: 1 }}>
      <div className="sec__inner">
        <Reveal>
          <p className="sec__index">
            <span className="sec__index__n">05</span>
            <span className="sec__index__t">Autonomous Execution</span>
          </p>
          <h2 className="sec__title">
            Humans define authority.
            <br />
            <em>Autonomous agents execute 24/7.</em>
          </h2>
          <p className="sec__lede" style={{ maxWidth: 740, marginTop: "14px" }}>
            AI models provide unconstrained reasoning, but never raw authorization. Circuit bounds
            autonomous agents to on-chain non-custodial PDA accounts with hard borrow caps, asset
            whitelists, and deterministic risk ratchets.
          </p>

          {/* Mathematical Invariant Formula Pill */}
          <div
            style={{
              marginTop: "24px",
              display: "inline-flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "8px",
              padding: "10px 16px",
              borderRadius: "6px",
              background: "var(--surface-2)",
              border: "1px solid var(--border-strong, var(--border))",
              fontFamily: "var(--mono)",
              fontSize: "12px",
              color: "var(--text-2)",
            }}
          >
            <span style={{ color: "var(--accent)", fontWeight: 700 }}>INVARIANT:</span>
            <span>EffectiveAuthority</span>
            <span style={{ color: "var(--accent)" }}>=</span>
            <span>OwnerPolicy</span>
            <span style={{ color: "var(--accent)" }}>∩</span>
            <span>AgentAuthority</span>
            <span style={{ color: "var(--accent)" }}>∩</span>
            <span>RiskRatchet</span>
            <span style={{ color: "var(--accent)" }}>∩</span>
            <span>SolanaConstraints</span>
          </div>
        </Reveal>

        {/* 4 Architectural Pillars — Interactive Tabs */}
        <div style={{ marginTop: "44px" }}>
          {/* Tab Buttons */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "8px",
              marginBottom: "20px",
            }}
          >
            {PILLARS.map((p, idx) => {
              const selected = idx === activeTab;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setActiveTab(idx)}
                  style={{
                    padding: "12px 14px",
                    textAlign: "left",
                    background: selected ? "var(--surface-3)" : "var(--surface-2)",
                    border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                    borderRadius: "6px",
                    cursor: "pointer",
                    transition: "all var(--t-fast, 150ms)",
                    outline: "none",
                  }}
                >
                  <div
                    style={{
                      fontSize: "9.5px",
                      fontFamily: "var(--mono)",
                      letterSpacing: "0.08em",
                      color: selected ? "var(--accent)" : "var(--text-3)",
                      fontWeight: 700,
                      marginBottom: "4px",
                    }}
                  >
                    0{idx + 1} · {p.badge}
                  </div>
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: selected ? 600 : 500,
                      color: selected ? "var(--text)" : "var(--text-2)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {p.title.split(" ")[0]} {p.title.split(" ")[1]}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active Pillar Card */}
          <Reveal key={activePillar.id} delay={40}>
            <div
              style={{
                padding: "28px",
                borderRadius: "8px",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", marginBottom: "16px" }}>
                <div>
                  <span
                    style={{
                      display: "inline-block",
                      fontSize: "10px",
                      fontFamily: "var(--mono)",
                      letterSpacing: "0.08em",
                      padding: "2px 8px",
                      borderRadius: "4px",
                      background: "rgba(207, 173, 116, 0.14)",
                      color: "var(--accent)",
                      fontWeight: 700,
                      marginBottom: "8px",
                    }}
                  >
                    {activePillar.badge}
                  </span>
                  <h3 style={{ fontSize: "20px", fontWeight: 600, color: "var(--text)", margin: 0 }}>
                    {activePillar.title}
                  </h3>
                </div>
                <div
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: "11px",
                    padding: "6px 12px",
                    background: "var(--surface-1)",
                    border: "1px solid var(--border)",
                    borderRadius: "4px",
                    color: "var(--accent)",
                  }}
                >
                  {activePillar.formula}
                </div>
              </div>

              <p style={{ fontSize: "14px", lineHeight: "1.6", color: "var(--text-2)", margin: "0 0 20px" }}>
                {activePillar.description}
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "12px" }}>
                {activePillar.items.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "10px",
                      fontSize: "12.5px",
                      color: "var(--text-2)",
                      lineHeight: "1.4",
                    }}
                  >
                    <span style={{ color: "var(--mint, #79c2a4)", fontSize: "14px", marginTop: "-1px" }}>✓</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>

        {/* Live Sentinel & Agent Terminal Preview */}
        <Reveal delay={80}>
          <div
            style={{
              marginTop: "32px",
              padding: "20px",
              borderRadius: "8px",
              background: "#08090a",
              border: "1px solid var(--border)",
              boxShadow: "0 12px 36px rgba(0, 0, 0, 0.45)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                paddingBottom: "12px",
                marginBottom: "14px",
                borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                fontSize: "11px",
                fontFamily: "var(--mono)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--mint, #79c2a4)", display: "inline-block" }} />
                <span style={{ color: "#e6e8eb", fontWeight: 700, letterSpacing: "0.06em" }}>
                  CIRCUIT AGENT RUNTIME · SOLANA DEVNET
                </span>
              </div>
              <div style={{ display: "flex", gap: "12px", color: "var(--text-3)" }}>
                <span>ROUTER: AUTO</span>
                <span style={{ color: "var(--accent)" }}>CREDITS: 87 AVAILABLE</span>
                <span style={{ color: "var(--mint, #79c2a4)" }}>● 9 SENTINELS ACTIVE</span>
              </div>
            </div>

            <div style={{ fontFamily: "var(--mono)", fontSize: "11.5px", lineHeight: "1.7", color: "#8a9099" }}>
              {TERMINAL_LOGS.map((log, i) => (
                <div key={i} style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  <span style={{ color: "rgba(255, 255, 255, 0.3)" }}>{log.time}</span>
                  <span
                    style={{
                      color:
                        log.tone === "mint"
                          ? "var(--mint, #79c2a4)"
                          : log.tone === "accent"
                          ? "var(--accent)"
                          : log.tone === "info"
                          ? "#7ba7e0"
                          : "#8a9099",
                      fontWeight: 600,
                    }}
                  >
                    [{log.tag}]
                  </span>
                  <span style={{ color: log.tone === "accent" ? "#ffffff" : "#c5c9d1" }}>{log.msg}</span>
                </div>
              ))}
            </div>

            <div
              style={{
                marginTop: "16px",
                paddingTop: "14px",
                borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                fontSize: "11.5px",
                color: "var(--text-3)",
                fontFamily: "var(--mono)",
              }}
            >
              Execution boundary enforced directly on Solana. Untrusted AI reasoning cannot exceed authorized PDA limits.
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default AutonomousLayer;
