import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import { PageContainer } from "../components/layout/AppShell";
import { ConnectPrompt } from "../components/layout/Guards";
import { Card, Pill, Icon, Skeleton } from "../components/ui";
import { RiskPosture } from "../components/profile/RiskPosture";
import { RiskPermissions } from "../components/profile/RiskPermissions";
import { RiskHistory } from "../components/profile/RiskHistory";
import { WhyBorrowPowerChanged } from "../components/profile/WhyBorrowPowerChanged";
import { AutonomousAuthorityCard } from "../components/profile/AutonomousAuthorityCard";
import { StressScenarioPanel } from "../components/profile/StressScenarioPanel";
import {
  PortfolioRiskGraph,
  AssetNode,
  getAssetMark,
} from "../components/profile/PortfolioRiskGraph";
import { useLiveDevnetPortfolio } from "../lib/portfolio/live-provider";
import { useAction } from "../context/ActionContext";
import { getDeployedMarket, getDeployedMarketByMint } from "../data/markets";
import { shortenAddress, formatMoney, formatPercent } from "../lib/format";
import { BPS } from "../lib/protocol";
import { analyzePortfolioRisk } from "../lib/risk/portfolio";
import { useTheme } from "../context/ThemeContext";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function riskProfile(leverageRatio: number, hasDebt: boolean = true): string {
  if (!hasDebt || leverageRatio === 0) return "Unleveraged";
  if (leverageRatio <= 0.25) return "Conservative";
  if (leverageRatio <= 0.55) return "Moderate";
  return "Aggressive";
}

function riskProfileTone(label: string): "neutral" | "success" | "warning" | "danger" {
  if (label === "Unleveraged") return "neutral";
  if (label === "Conservative") return "success";
  if (label === "Moderate") return "warning";
  return "danger";
}

function StatBlock({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <div style={{ flex: 1, minWidth: 140 }}>
      <div
        style={{
          fontSize: 11,
          fontFamily: "var(--mono)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--text-3)",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Profile Page - High Power Live Devnet Financial Cockpit                   */
/* -------------------------------------------------------------------------- */

export default function Profile() {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const { openAction } = useAction();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const { snapshot, loading, error, refresh } = useLiveDevnetPortfolio(connection, publicKey);

  const hasLiveCollateral = Boolean(snapshot && snapshot.totalCollateralUsd > 0);
  const leverageRatio =
    snapshot && snapshot.totalCollateralUsd > 0
      ? snapshot.totalDebtUsd / snapshot.totalCollateralUsd
      : 0;
  const effectiveLtvPct = snapshot ? snapshot.effectiveLtvBps / 100 : 0;
  const profileLabel = riskProfile(leverageRatio, Boolean(snapshot && snapshot.totalDebtUsd > 0));

  const hfDisplay =
    snapshot?.healthFactorBps !== null && snapshot?.healthFactorBps !== undefined
      ? (snapshot.healthFactorBps / BPS).toFixed(2)
      : "No debt";

  const liquidationActive = Boolean(
    snapshot?.healthFactorBps !== null &&
      snapshot?.healthFactorBps !== undefined &&
      snapshot.healthFactorBps < BPS
  );
  const withdrawAllowed = Boolean(hasLiveCollateral && snapshot?.riskState !== "EMERGENCY");

  // Exact Liquidation Buffer Calculation
  const weightedLiqThresholdBps =
    snapshot && snapshot.positions.length > 0 && snapshot.totalCollateralUsd > 0
      ? Math.round(
          snapshot.positions.reduce((sum, p) => sum + p.collateralValueUsd * p.liqThresholdBps, 0) /
            snapshot.totalCollateralUsd
        )
      : 8000;
  const liquidationThresholdUsd =
    (snapshot?.totalCollateralUsd ?? 0) * (weightedLiqThresholdBps / BPS);
  const liquidationBufferPct =
    snapshot && snapshot.totalDebtUsd > 0 && liquidationThresholdUsd > 0
      ? Math.max(0, ((liquidationThresholdUsd - snapshot.totalDebtUsd) / liquidationThresholdUsd) * 100)
      : null;

  const [copied, setCopied] = useState(false);
  const copyAddress = () => {
    if (publicKey) {
      navigator.clipboard.writeText(publicKey.toBase58());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const [selectedDriverNode, setSelectedDriverNode] = useState<string | null>(null);

  // Multi-asset risk analysis for causal explainability
  const riskAnalysis = useMemo(() => {
    if (!snapshot || snapshot.positions.length === 0) {
      return analyzePortfolioRisk([], 0);
    }
    return analyzePortfolioRisk(
      snapshot.positions.map((p) => ({
        symbol: p.symbol,
        name: p.name,
        collateralUi: p.collateralUi,
        priceUsd: p.priceUsd,
        confidenceUsd: p.confidenceUsd,
        confBps: p.confBps,
        baseLtvBps: p.baseLtvBps,
        liqThresholdBps: p.liqThresholdBps,
        oracleHealthy: p.oracleHealthy,
        marketOpen: p.marketOpen,
      })),
      snapshot.totalDebtUsd
    );
  }, [snapshot]);

  // Build N asset nodes for the full-size uneditable canvas from real on-chain positions
  const graphAssets: AssetNode[] = useMemo(() => {
    if (!snapshot || snapshot.positions.length === 0) {
      return [];
    }

    return snapshot.positions.map((p) => {
      const detail = riskAnalysis.assetDetails.find((d) => d.symbol === p.symbol);
      return {
        symbol: p.symbol,
        name: p.name,
        mint: p.mint,
        weightPct: Math.round(p.weightPct),
        oracleHealthy: p.oracleHealthy,
        confBps: p.confBps,
        maxConfBps: p.maxConfBps,
        marketOpen: p.marketOpen,
        mark: p.mark || getAssetMark(p.symbol),
        priceUsd: p.priceUsd,
        change24hPercent: p.change24hPercent,
        collateralValueUsd: p.collateralValueUsd,
        impactBorrowPowerUsd: detail?.riskContributionUsd,
        explanation: detail?.explanation || p.explanation,
      };
    });
  }, [snapshot, riskAnalysis]);

  if (!connected) {
    return (
      <PageContainer>
        <ConnectPrompt />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div
        className="stack g-20"
        style={{ maxWidth: 1140, margin: "0 auto", paddingBottom: 60 }}
      >
        {/* ── Top Live Status Bar ── */}
        <div
          style={{
            padding: "14px 20px",
            background: "var(--surface-1)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            boxShadow: isDark ? "0 4px 20px rgba(0, 0, 0, 0.3)" : "0 2px 8px rgba(0, 0, 0, 0.04)",
          }}
        >
          {/* Left: Network, Wallet Address, Copy button */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: "50%",
                background: "var(--success, #7fc39a)",
                boxShadow: "0 0 10px rgba(127, 195, 154, 0.8)",
                display: "inline-block",
              }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  fontSize: 10.5,
                  fontFamily: "var(--mono)",
                  fontWeight: 750,
                  padding: "3px 8px",
                  borderRadius: 5,
                  background: "rgba(127, 195, 154, 0.15)",
                  border: "1px solid rgba(127, 195, 154, 0.35)",
                  color: "var(--success, #7fc39a)",
                  letterSpacing: "0.06em",
                }}
              >
                LIVE DEVNET
              </span>
              <span style={{ fontSize: 12.5, fontFamily: "var(--mono)", color: "var(--text)" }}>
                {shortenAddress(publicKey?.toBase58() ?? "", 4, 4)}
              </span>
              {publicKey && (
                <button
                  type="button"
                  onClick={copyAddress}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: copied ? "var(--success)" : "var(--text-3)",
                    cursor: "pointer",
                    fontSize: 11,
                    fontFamily: "var(--mono)",
                    padding: "0 4px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 3,
                  }}
                  title="Copy wallet address"
                >
                  <Icon name={copied ? "check" : "copy"} size={11} />
                  <span>{copied ? "Copied" : "Copy"}</span>
                </button>
              )}
            </div>
          </div>

          {/* Right: Subsystem Live Telemetry Indicators */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--text-3)" }}>
              SUBSYSTEMS:
            </span>
            <Pill tone="success">Market: LIVE</Pill>
            <Pill tone="success">Portfolio: LIVE</Pill>
            <Pill tone="success">Risk: LIVE</Pill>
            <Pill tone="success">Credit: LIVE</Pill>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              style={{ fontSize: 11, height: 26, padding: "0 10px" }}
              onClick={refresh}
              disabled={loading}
            >
              <Icon name="clock" size={12} />
              <span>{loading ? "Querying..." : "Refresh"}</span>
            </button>
          </div>
        </div>

        {/* ── Section 1: Circuit Profile Overview & Instant Action Terminal ── */}
        <Card>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Header: Title, Network, Wallet, Risk State */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 16,
                alignItems: "center",
                justifyContent: "space-between",
                paddingBottom: 16,
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 12,
                    background: `linear-gradient(135deg, ${
                      snapshot?.riskState === "SAFE" ? "rgba(127, 195, 154, 0.15)" : "rgba(224, 108, 108, 0.15)"
                    }, var(--surface-2))`,
                    border: `1.5px solid ${
                      snapshot?.riskState === "SAFE" ? "rgba(127, 195, 154, 0.4)" : "rgba(224, 108, 108, 0.4)"
                    }`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    color: snapshot?.riskState === "SAFE" ? "var(--success)" : "var(--danger)",
                  }}
                >
                  <Icon name="user" size={22} />
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <h2
                      style={{
                        margin: 0,
                        fontSize: 16.5,
                        fontWeight: 800,
                        letterSpacing: "0.06em",
                        fontFamily: "var(--mono)",
                        textTransform: "uppercase",
                      }}
                    >
                      CIRCUIT RISK PROFILE
                    </h2>
                    <span
                      style={{
                        fontSize: 10.5,
                        fontFamily: "var(--mono)",
                        fontWeight: 750,
                        padding: "2px 7px",
                        borderRadius: 4,
                        background: "rgba(153, 69, 255, 0.15)",
                        border: "1px solid rgba(153, 69, 255, 0.35)",
                        color: "#c4a0ff",
                        letterSpacing: "0.05em",
                      }}
                    >
                      DEVNET
                    </span>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 4 }}>
                    {loading
                      ? "Querying on-chain position accounts on Devnet..."
                      : hasLiveCollateral
                      ? `${snapshot?.positions.length} active tokenized equity position${
                          snapshot?.positions.length !== 1 ? "s" : ""
                        } evaluated under on-chain Risk Ratchet.`
                      : "Fresh wallet detected with $0.00 collateral. Borrow capacity is strictly $0.00."}
                  </div>
                </div>
              </div>

              {/* Right: Risk State Badge & Risk Profile */}
              <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text-3)", marginBottom: 2 }}>
                    PROTOCOL RISK STATE
                  </div>
                  <Pill
                    tone={
                      snapshot?.riskState === "SAFE"
                        ? "success"
                        : snapshot?.riskState === "EMERGENCY"
                        ? "danger"
                        : "warning"
                    }
                    withDot
                  >
                    {snapshot?.riskState ?? "SAFE"}
                  </Pill>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text-3)", marginBottom: 2 }}>
                    RISK PROFILE
                  </div>
                  <Pill tone={riskProfileTone(profileLabel)}>{profileLabel}</Pill>
                </div>
              </div>
            </div>

            {/* Metrics Grid (Expanded 6 StatBlocks) */}
            {loading ? (
              <div className="row g-16">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} height={60} />
                ))}
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                  gap: 16,
                }}
              >
                <StatBlock
                  label="Portfolio Health"
                  value={
                    <span
                      style={{
                        color:
                          hfDisplay === "No debt"
                            ? "var(--text-2)"
                            : parseFloat(hfDisplay) < 1.0
                            ? "var(--danger)"
                            : parseFloat(hfDisplay) < 1.5
                            ? "var(--warning)"
                            : "var(--success)",
                      }}
                    >
                      {hfDisplay}
                    </span>
                  }
                  sub={
                    snapshot?.healthFactorBps !== null && snapshot?.healthFactorBps !== undefined
                      ? snapshot.healthFactorBps < BPS
                        ? "LIQUIDATABLE (< 1.00)"
                        : "Nominal Solvency"
                      : "Zero debt drawn"
                  }
                />
                <StatBlock
                  label="Current Debt"
                  value={`$${formatMoney(snapshot?.totalDebtUsd ?? 0)}`}
                  sub="Borrowed amount (USDC)"
                />
                <StatBlock
                  label="Available Credit"
                  value={`$${formatMoney(snapshot?.borrowCapacityUsd ?? 0)}`}
                  sub={
                    hasLiveCollateral
                      ? `Max: $${formatMoney(
                          (snapshot?.totalCollateralUsd ?? 0) *
                            ((snapshot?.effectiveLtvBps ?? 7000) / BPS)
                        )}`
                      : "Awaiting collateral deposit"
                  }
                />
                <StatBlock
                  label="Collateral Value"
                  value={`$${formatMoney(snapshot?.conservativeCollateralUsd ?? 0)}`}
                  sub={
                    hasLiveCollateral
                      ? `Nominal: $${formatMoney(snapshot?.totalCollateralUsd ?? 0)} (p - conf)`
                      : "0.0000 (No Collateral)"
                  }
                />
                <StatBlock
                  label="Effective LTV"
                  value={hasLiveCollateral ? `${effectiveLtvPct.toFixed(1)}%` : "0.0%"}
                  sub={
                    hasLiveCollateral
                      ? `Base: ${formatPercent(snapshot?.weightedBaseLtvBps ?? 7000)} | Haircut: -${
                          snapshot?.concentrationPenaltyBps ?? 0
                        } bps`
                      : "0.0% (Awaiting deposit)"
                  }
                />
                <StatBlock
                  label="Liquidation Cushion"
                  value={
                    liquidationBufferPct !== null ? (
                      <span
                        style={{
                          color:
                            liquidationBufferPct < 15
                              ? "var(--danger)"
                              : liquidationBufferPct < 30
                              ? "var(--warning)"
                              : "var(--success)",
                        }}
                      >
                        +{liquidationBufferPct.toFixed(1)}%
                      </span>
                    ) : (
                      "∞ Buffer"
                    )
                  }
                  sub={
                    liquidationBufferPct !== null
                      ? "Drop needed to trigger liquidation"
                      : "Zero debt drawn (Safe)"
                  }
                />
              </div>
            )}

            {/* ── Instant Action Dock ── */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 12,
                padding: "12px 18px",
                background: "var(--surface-2)",
                borderRadius: 9,
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "var(--accent)",
                  }}
                />
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 750,
                    fontFamily: "var(--mono)",
                    letterSpacing: "0.08em",
                    color: "var(--text)",
                    textTransform: "uppercase",
                  }}
                >
                  INSTANT ACTIONS
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn btn--accent btn--sm"
                  style={{ fontSize: 11.5, height: 28, padding: "0 12px" }}
                  onClick={() => {
                    const firstMarket = snapshot?.positions[0]?.mint
                      ? getDeployedMarketByMint(snapshot.positions[0].mint)
                      : getDeployedMarket("NVDA");
                    if (firstMarket) openAction({ type: "deposit", market: firstMarket });
                  }}
                >
                  + Deposit Collateral
                </button>
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  style={{ fontSize: 11.5, height: 28, padding: "0 12px" }}
                  disabled={!snapshot?.borrowAllowed || snapshot.borrowCapacityUsd <= 0}
                  onClick={() => {
                    const firstMarket = snapshot?.positions[0]?.mint
                      ? getDeployedMarketByMint(snapshot.positions[0].mint)
                      : getDeployedMarket("NVDA");
                    if (firstMarket) openAction({ type: "borrow", market: firstMarket });
                  }}
                >
                  $ Borrow USDC
                </button>
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  style={{ fontSize: 11.5, height: 28, padding: "0 12px" }}
                  disabled={!snapshot || snapshot.totalDebtUsd <= 0}
                  onClick={() => {
                    const firstMarket = snapshot?.positions[0]?.mint
                      ? getDeployedMarketByMint(snapshot.positions[0].mint)
                      : getDeployedMarket("NVDA");
                    if (firstMarket) openAction({ type: "repay", market: firstMarket });
                  }}
                >
                  ↩ Repay Debt
                </button>
                <Link
                  to="/app/faucet"
                  className="btn btn--secondary btn--sm"
                  style={{ fontSize: 11.5, height: 28, padding: "0 12px" }}
                >
                  ⚡ Faucet
                </Link>
              </div>
            </div>
          </div>
        </Card>

        {/* ── Section 2: Autonomous Strategy Authority Control Center ── */}
        <AutonomousAuthorityCard />

        {/* ── Section 3: On-Chain Deposited Holdings Breakdown Table ── */}
        {snapshot && snapshot.positions.length > 0 && (
          <Card title={`On-Chain Deposited Equities (${snapshot.positions.length})`}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead>
                  <tr
                    style={{
                      borderBottom: "1px solid var(--border)",
                      textAlign: "left",
                      color: "var(--text-3)",
                      fontSize: 11,
                      fontFamily: "var(--mono)",
                    }}
                  >
                    <th style={{ padding: "8px 12px" }}>ASSET</th>
                    <th style={{ padding: "8px 12px" }}>COLLATERAL</th>
                    <th style={{ padding: "8px 12px" }}>PYTH PRICE</th>
                    <th style={{ padding: "8px 12px" }}>USD VALUE</th>
                    <th style={{ padding: "8px 12px" }}>WEIGHT</th>
                    <th style={{ padding: "8px 12px" }}>ORACLE POSTURE</th>
                    <th style={{ padding: "8px 12px", textAlign: "right" }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.positions.map((p) => {
                    const mark = p.mark || getAssetMark(p.symbol);
                    return (
                      <tr key={p.mint} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: "50%",
                                background: "var(--surface-2)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                              }}
                            >
                              {mark ? (
                                <svg viewBox="0 0 24 24" width={18} height={18} style={{ margin: "auto" }}>
                                  {mark.parts ? (
                                    mark.parts.map((pt, idx) => (
                                      <path key={idx} d={pt.d} fill={pt.fill} />
                                    ))
                                  ) : (
                                    <path
                                      d={mark.d}
                                      fill={
                                        isDark
                                          ? mark.onDark || "#ffffff"
                                          : mark.hex === "#000000"
                                          ? "#0f172a"
                                          : mark.hex || "#0f172a"
                                      }
                                    />
                                  )}
                                </svg>
                              ) : (
                                <span style={{ fontSize: 10, fontWeight: 700 }}>{p.symbol.slice(0, 2)}</span>
                              )}
                            </div>
                            <div>
                              <div style={{ fontWeight: 650, color: "var(--text)" }}>{p.symbol}</div>
                              <div style={{ fontSize: 10, color: "var(--text-3)" }}>{p.name}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: "10px 12px", fontFamily: "var(--mono)", fontWeight: 600 }}>
                          {formatMoney(p.collateralUi, 4)} shares
                        </td>
                        <td style={{ padding: "10px 12px", fontFamily: "var(--mono)" }}>
                          ${formatMoney(p.priceUsd)}
                          {p.change24hPercent !== null && p.change24hPercent !== undefined && (
                            <span
                              style={{
                                fontSize: 10,
                                marginLeft: 6,
                                color: p.change24hPercent >= 0 ? "var(--success)" : "var(--danger)",
                              }}
                            >
                              {p.change24hPercent >= 0 ? "+" : ""}
                              {p.change24hPercent.toFixed(2)}%
                            </span>
                          )}
                        </td>
                        <td
                          style={{
                            padding: "10px 12px",
                            fontFamily: "var(--mono)",
                            fontWeight: 700,
                            color: "var(--text)",
                          }}
                        >
                          ${formatMoney(p.collateralValueUsd)}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div
                              style={{
                                width: 64,
                                height: 6,
                                borderRadius: 3,
                                background: "var(--surface-3)",
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  width: `${Math.min(100, Math.round(p.weightPct))}%`,
                                  height: "100%",
                                  background: p.weightPct > 40 ? "var(--warning)" : "var(--success)",
                                }}
                              />
                            </div>
                            <span style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 650 }}>
                              {Math.round(p.weightPct)}%
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <Pill tone={p.oracleHealthy ? "success" : "danger"}>
                            {p.oracleHealthy ? `±${p.confBps} bps` : "Breached"}
                          </Pill>
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: 6 }}>
                            <button
                              type="button"
                              onClick={() => {
                                const target =
                                  (p.mint ? getDeployedMarketByMint(p.mint) : null) ||
                                  getDeployedMarket(p.symbol);
                                if (target) {
                                  openAction({ type: "deposit", market: target, position: p });
                                }
                              }}
                              className="btn btn--secondary btn--sm"
                              style={{ fontSize: 11, height: 24, padding: "0 8px" }}
                            >
                              Deposit
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const target =
                                  (p.mint ? getDeployedMarketByMint(p.mint) : null) ||
                                  getDeployedMarket(p.symbol);
                                if (target) {
                                  openAction({ type: "withdraw", market: target, position: p });
                                }
                              }}
                              className="btn btn--ghost btn--sm"
                              style={{ fontSize: 11, height: 24, padding: "0 8px" }}
                            >
                              Withdraw
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* ── Section 4: Multi-Asset Risk Posture ── */}
        <RiskPosture
          concentrationPct={snapshot?.maxWeightPct ?? 0}
          oracleConfBps={
            snapshot && snapshot.positions.length > 0
              ? Math.max(...snapshot.positions.map((p) => p.confBps))
              : 18
          }
          maxConfBps={
            snapshot && snapshot.positions.length > 0
              ? Math.max(...snapshot.positions.map((p) => p.maxConfBps))
              : 150
          }
          oracleAgeSec={12}
          maxOracleAge={600}
          liquidityState={snapshot?.hardOverride ? "critical" : "normal"}
          leverageRatio={leverageRatio}
          riskState={snapshot?.riskState ?? "SAFE"}
        />

        {/* ── Section 5: Portfolio Stress Simulation Matrix ── */}
        <StressScenarioPanel
          totalCollateralUsd={snapshot?.totalCollateralUsd ?? 0}
          totalDebtUsd={snapshot?.totalDebtUsd ?? 0}
          baseLtvBps={snapshot?.weightedBaseLtvBps ?? 7000}
          liqThresholdBps={weightedLiqThresholdBps}
        />

        {/* ── Section 6: High-Definition Causal Risk Graph Canvas ── */}
        <PortfolioRiskGraph
          assets={graphAssets}
          riskState={snapshot?.riskState ?? "SAFE"}
          baseLtvBps={snapshot?.weightedBaseLtvBps ?? 7000}
          effectiveLtvBps={snapshot?.effectiveLtvBps ?? 0}
          borrowPowerUsd={snapshot?.borrowCapacityUsd ?? 0}
          totalCollateralUsd={snapshot?.totalCollateralUsd ?? 0}
          borrowAllowed={Boolean(snapshot?.borrowAllowed)}
          hardOverride={Boolean(snapshot?.hardOverride)}
          hardOverrideReason={snapshot?.hardOverrideReason}
          uneditable={true}
          loading={loading}
          onSelectNodeDriver={(nodeId) => setSelectedDriverNode(nodeId)}
        />

        {/* ── Section 7: Causal Explainability Engine ── */}
        <WhyBorrowPowerChanged
          borrowPowerDiffUsd={riskAnalysis.borrowPowerDiffUsd}
          causalExplanations={riskAnalysis.causalExplanations}
          onSelectDriver={(targetNode) => setSelectedDriverNode(targetNode)}
        />

        {/* ── Section 8: Protocol Permissions ── */}
        <RiskPermissions
          borrowAllowed={Boolean(snapshot?.borrowAllowed)}
          borrowBlockers={
            snapshot?.hardOverride
              ? [snapshot.hardOverrideReason || "Hard risk override active"]
              : !hasLiveCollateral
              ? ["No collateral deposited — deposit tokenized equity to unlock borrow line"]
              : !snapshot?.borrowAllowed
              ? ["Capacity restricted by Risk Ratchet (Concentration penalty active)"]
              : []
          }
          withdrawAllowed={withdrawAllowed}
          withdrawReason={
            !withdrawAllowed
              ? !hasLiveCollateral
                ? "No collateral deposited"
                : snapshot?.riskState === "EMERGENCY"
                ? "Risk-increasing withdrawals blocked in Emergency state"
                : "Protocol paused"
              : undefined
          }
          liquidationActive={liquidationActive}
          healthFactorBps={snapshot?.healthFactorBps ?? null}
          riskState={snapshot?.riskState ?? "SAFE"}
        />

        {/* ── Section 9: Live Devnet Risk History ── */}
        <RiskHistory activeState={snapshot?.riskState ?? "SAFE"} allowDemo={false} />

        {/* ── Footer ── */}
        <div
          style={{
            textAlign: "center",
            padding: "20px 0",
            borderTop: "1px solid var(--border)",
          }}
        >
          <p
            style={{
              fontSize: 12,
              color: "var(--text-3)",
              margin: "0 0 10px 0",
              fontStyle: "italic",
            }}
          >
            Assets → Pyth Oracles → Risk Ratchet → Credit Output → On-Chain Permissions
          </p>
          <div className="row g-12" style={{ justifyContent: "center" }}>
            <Link to="/app/learn" className="btn btn--secondary btn--sm">
              Interactive Simulation Suite in Learn →
            </Link>
            <Link to="/app/faucet" className="btn btn--secondary btn--sm">
              Devnet Asset Faucet
            </Link>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
