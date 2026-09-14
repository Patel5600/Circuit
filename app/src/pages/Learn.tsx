import React, { useState } from "react";
import { Link } from "react-router-dom";

import { PageContainer } from "../components/layout/AppShell";
import { Card, Icon, Pill } from "../components/ui";
import {
  PortfolioRiskGraph,
  AssetNode,
  getAssetMark,
} from "../components/profile/PortfolioRiskGraph";

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "What does circuit actually do?",
    a: (
      <>
        It lets you borrow against tokenized stock you already hold. Before it
        allows any action that increases your risk, it verifies that the price it
        is using is recent, that the market agrees on that price closely enough,
        and that the underlying stock market is open.
      </>
    ),
  },
  {
    q: "Why is borrowing sometimes unavailable?",
    a: (
      <>
        Because one of those checks did not pass. Borrowing is the moment new
        risk is created, so it is the moment the strictest conditions apply. Your
        existing position keeps working, and repaying is always available.
      </>
    ),
  },
  {
    q: "What is a health factor?",
    a: (
      <>
        It is how much cushion your position has. Above 1.00 you are safe. At or
        below 1.00 your collateral can be sold to repay what you owe. Depositing
        more collateral or repaying raises it; borrowing more or withdrawing
        lowers it.
      </>
    ),
  },
  {
    q: "What happens if my health factor falls to 1.00?",
    a: (
      <>
        Your position becomes eligible for liquidation: anyone can repay your
        debt in exchange for your collateral plus a small bonus. This is
        automatic and rule-based, not a decision anyone makes about you.
      </>
    ),
  },
  {
    q: "Why does the stock market being closed matter?",
    a: (
      <>
        Tokenized stock trades continuously, but the stock it represents does
        not. When the reference market is closed, prices are far less reliable,
        so circuit does not create new credit against them.
      </>
    ),
  },
  {
    q: "Who controls my collateral?",
    a: (
      <>
        It is held by an account the program itself owns, not by an operator or
        company wallet. Funds move only through the program's own rules. You can
        confirm this yourself on the{" "}
        <Link to="/app/verify" style={{ color: "var(--accent)" }}>
          verification page
        </Link>
        .
      </>
    ),
  },
];

const GATES: { title: string; plain: string; blocked: string }[] = [
  {
    title: "Price freshness",
    plain: "The price must have been published recently.",
    blocked: "If it is too old, borrowing is blocked until a newer one arrives.",
  },
  {
    title: "Price certainty",
    plain: "Sources must agree on the price within a set tolerance.",
    blocked: "If they disagree too much, borrowing is blocked.",
  },
  {
    title: "Market session",
    plain: "The reference stock market must be open.",
    blocked: "Outside regular hours, new borrowing is paused.",
  },
  {
    title: "Position safety",
    plain: "Your health factor must stay above the minimum.",
    blocked: "Any action that would breach it is refused up front.",
  },
];

const SIMULATED_ASSETS: AssetNode[] = [
  {
    symbol: "NVDA",
    name: "NVIDIA",
    weightPct: 58,
    oracleHealthy: true,
    confBps: 18,
    maxConfBps: 150,
    marketOpen: true,
    mark: getAssetMark("NVDA"),
  },
  {
    symbol: "AAPL",
    name: "Apple",
    weightPct: 22,
    oracleHealthy: true,
    confBps: 18,
    maxConfBps: 150,
    marketOpen: true,
    mark: getAssetMark("AAPL"),
  },
  {
    symbol: "MSFT",
    name: "Microsoft",
    weightPct: 15,
    oracleHealthy: true,
    confBps: 12,
    maxConfBps: 150,
    marketOpen: true,
    mark: getAssetMark("MSFT"),
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    weightPct: 5,
    oracleHealthy: true,
    confBps: 0,
    maxConfBps: 150,
    marketOpen: true,
    mark: getAssetMark("USDC"),
  },
];

export default function Learn() {
  const [simMode, setSimMode] = useState<"LIVE" | "HEALTHY" | "STRESS" | "EMERGENCY">("HEALTHY");

  return (
    <PageContainer
      title="How Circuit Works"
      subtitle="A complete architectural and interactive guide to programmable collateral."
    >
      <div className="stack g-20" style={{ maxWidth: 1040, margin: "0 auto", paddingBottom: 60 }}>
        {/* Concept Card */}
        <Card>
          <h2 className="t-title" style={{ marginBottom: 12 }}>
            The Idea in One Line
          </h2>
          <p className="t-body muted">
            Deposit tokenized stock, see how much you can safely borrow against
            it, borrow, and let circuit watch the risk for you.
          </p>

          <div className="stack g-8" style={{ marginTop: 18 }}>
            {[
              "Deposit tokenized equity (NVDA, AAPL, MSFT, etc.)",
              "Circuit verifies market session, Pyth oracle freshness, and confidence spread",
              "Borrow quote currency within a dynamic, risk-adjusted limit",
              "Repay or withdraw at any time; repay is unconditionally available",
            ].map((step, i) => (
              <div key={step} className="row g-10">
                <span
                  aria-hidden="true"
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flex: "none",
                    fontSize: 11,
                    fontWeight: 700,
                    background: "var(--surface-3)",
                    color: "var(--text-2)",
                  }}
                >
                  {i + 1}
                </span>
                <span className="t-sm">{step}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* ── Interactive Risk Ratchet & Portfolio Simulator Section ── */}
        <div className="stack g-8">
          <div style={{ padding: "0 4px" }}>
            <div className="row between wrap g-8" style={{ alignItems: "center" }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
                  Interactive Risk Ratchet & Portfolio Simulator
                </h2>
                <p style={{ fontSize: 12.5, color: "var(--text-3)", margin: "4px 0 0 0" }}>
                  Experiment with hypothetical market shocks: adjust asset concentration, widen Pyth confidence spreads, or simulate upstream custody halts to watch Circuit's 4-layer risk DAG respond.
                </p>
              </div>
              <Pill tone="accent">INTERACTIVE PLAYGROUND</Pill>
            </div>
          </div>

          <PortfolioRiskGraph
            assets={SIMULATED_ASSETS}
            riskState={simMode === "EMERGENCY" ? "EMERGENCY" : simMode === "STRESS" ? "RESTRICTED" : "SAFE"}
            baseLtvBps={7000}
            effectiveLtvBps={simMode === "EMERGENCY" ? 3000 : simMode === "STRESS" ? 5200 : 6400}
            borrowPowerUsd={simMode === "EMERGENCY" ? 0 : simMode === "STRESS" ? 2700 : 3900}
            totalCollateralUsd={10000}
            borrowAllowed={simMode !== "EMERGENCY"}
            hardOverride={simMode === "EMERGENCY"}
            hardOverrideReason={simMode === "EMERGENCY" ? "Upstream custody settlement link impaired" : undefined}
            uneditable={false}
            simMode={simMode}
            onSimModeChange={(m) => setSimMode(m)}
          />
        </div>

        {/* The Four Safety Checks */}
        <Card title="The Four Safety Checks">
          <p className="t-sm muted" style={{ marginBottom: 16 }}>
            These run inside the program, in the same transaction as your borrow.
            They cannot be skipped by this or any other interface.
          </p>
          <div className="stack g-14">
            {GATES.map((g) => (
              <div
                key={g.title}
                style={{
                  padding: 14,
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r)",
                  background: "var(--bg-elevated)",
                }}
              >
                <div className="row between g-10" style={{ marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{g.title}</span>
                  <Pill tone="warning">BLOCKS BORROWING</Pill>
                </div>
                <p className="t-sm muted">{g.plain}</p>
                <p className="t-meta" style={{ marginTop: 4 }}>
                  {g.blocked}
                </p>
              </div>
            ))}
          </div>
        </Card>

        {/* Common Questions */}
        <Card title="Common Questions">
          <div className="stack g-4">
            {FAQ.map((f) => (
              <details
                key={f.q}
                style={{
                  borderBottom: "1px solid var(--border)",
                  paddingBottom: 10,
                }}
              >
                <summary
                  style={{
                    cursor: "pointer",
                    padding: "11px 0",
                    fontWeight: 600,
                    fontSize: 14,
                    listStyle: "none",
                  }}
                >
                  <span className="row g-8">
                    <span style={{ color: "var(--text-3)" }}>
                      <Icon name="chevron" size={14} />
                    </span>
                    {f.q}
                  </span>
                </summary>
                <p className="t-sm muted" style={{ paddingLeft: 22, paddingBottom: 6 }}>
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </Card>

        {/* Verification Link */}
        <Card quiet>
          <div className="row between g-12 wrap">
            <p className="t-sm muted" style={{ maxWidth: "44ch" }}>
              Want the technical detail instead? Every account, PDA, and Pyth price feed the
              protocol uses is verifiable on Solana Devnet.
            </p>
            <Link to="/app/verify" className="btn btn--secondary btn--sm">
              On-Chain Verification
              <Icon name="arrowRight" size={15} />
            </Link>
          </div>
        </Card>
      </div>
    </PageContainer>
  );
}
