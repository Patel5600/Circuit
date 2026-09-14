import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";

import { PageContainer } from "../components/layout/AppShell";
import { ConnectPrompt } from "../components/layout/Guards";
import { Card, Pill, Icon, Skeleton } from "../components/ui";
import { RiskPosture } from "../components/profile/RiskPosture";
import { RiskPermissions } from "../components/profile/RiskPermissions";
import { RiskHistory } from "../components/profile/RiskHistory";
import { WhyBorrowPowerChanged } from "../components/profile/WhyBorrowPowerChanged";
import { StressScenarioPanel } from "../components/profile/StressScenarioPanel";
import {
  PortfolioRiskGraph,
  AssetNode,
  getAssetMark,
} from "../components/profile/PortfolioRiskGraph";
import { useAllUserPositions } from "../hooks/useAllUserPositions";
import { shortenAddress, formatMoney, formatPercent } from "../lib/format";
import { BPS } from "../lib/protocol";
import { analyzePortfolioRisk } from "../lib/risk/portfolio";

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

/* -------------------------------------------------------------------------- */
/*  Stat block                                                                */
/* -------------------------------------------------------------------------- */

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
/*  Profile Page - 100% Pure Live Devnet (No Simulation)                      */
/* -------------------------------------------------------------------------- */

export default function Profile() {
  const { publicKey, connected } = useWallet();
  const port = useAllUserPositions();

  const hasLiveCollateral = port.totalCollateralUsd > 0;
  const leverageRatio = port.totalCollateralUsd > 0 ? port.totalDebtUsd / port.totalCollateralUsd : 0;
  const effectiveLtvPct = port.effectiveLtvBps / 100;
  const profileLabel = riskProfile(leverageRatio, port.totalDebtUsd > 0);

  const hfDisplay = port.healthFactorBps !== null
    ? (port.healthFactorBps / BPS).toFixed(2)
    : "No debt";

  const liquidationActive = port.healthFactorBps !== null && port.healthFactorBps < BPS;
  const withdrawAllowed = hasLiveCollateral && port.riskState !== "EMERGENCY";

  const [selectedDriverNode, setSelectedDriverNode] = useState<string | null>(null);

  const riskAnalysis = useMemo(() => {
    return analyzePortfolioRisk(
      port.positions.map((p) => ({
        symbol: p.market.symbol,
        name: p.market.name,
        collateralUi: p.collateralUi,
        priceUsd: p.priceUsd,
        confidenceUsd: (p.priceUsd * p.confBps) / 10000,
        confBps: p.confBps,
        baseLtvBps: p.baseLtvBps,
        liqThresholdBps: p.liqThresholdBps,
        oracleHealthy: p.oracleHealthy,
        marketOpen: p.marketOpen,
      })),
      port.totalDebtUsd
    );
  }, [port.positions, port.totalDebtUsd]);

  // Build N asset nodes for the uneditable canvas from real on-chain positions
  const graphAssets: AssetNode[] = useMemo(() => {
    if (port.positions.length === 0) {
      return [
        {
          symbol: "NVDA",
          name: "NVIDIA",
          weightPct: 0,
          oracleHealthy: true,
          confBps: 18,
          maxConfBps: 150,
          marketOpen: true,
          mark: getAssetMark("NVDA"),
          priceUsd: 0,
          collateralValueUsd: 0,
          explanation: "Zero collateral deposited. Borrow capacity is strictly $0.00.",
        },
      ];
    }

    return port.positions.map((p) => {
      const detail = riskAnalysis.assetDetails.find((d) => d.symbol === p.market.symbol);
      return {
        symbol: p.market.symbol,
        name: p.market.name,
        weightPct: Math.round(p.weightPct),
        oracleHealthy: p.oracleHealthy,
        confBps: p.confBps,
        maxConfBps: p.maxConfBps,
        marketOpen: p.marketOpen,
        mark: getAssetMark(p.market.symbol),
        priceUsd: p.priceUsd,
        collateralValueUsd: p.collateralValueUsd,
        impactBorrowPowerUsd: detail?.riskContributionUsd,
        explanation: detail?.explanation,
      };
    });
  }, [port.positions, riskAnalysis]);

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
        style={{ maxWidth: 1080, margin: "0 auto", paddingBottom: 60 }}
      >
        {/* ── Real On-Chain Telemetry Header Banner ── */}
        <div
          style={{
            padding: "12px 18px",
            background: hasLiveCollateral
              ? "rgba(127, 195, 154, 0.07)"
              : "rgba(207, 173, 116, 0.07)",
            border: `1px solid ${
              hasLiveCollateral
                ? "rgba(127, 195, 154, 0.25)"
                : "rgba(207, 173, 116, 0.25)"
            }`,
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: hasLiveCollateral ? "var(--success, #7fc39a)" : "#cfad74",
                boxShadow: hasLiveCollateral
                  ? "0 0 10px rgba(127, 195, 154, 0.7)"
                  : "0 0 8px rgba(207, 173, 116, 0.5)",
                display: "inline-block",
              }}
            />
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 650, color: "var(--text)" }}>
                Solana Devnet Live Truth:{" "}
                <span style={{ fontFamily: "var(--mono)" }}>
                  {shortenAddress(publicKey?.toBase58() ?? "", 4, 4)}
                </span>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 2 }}>
                {port.loading
                  ? "Scanning on-chain position PDAs..."
                  : hasLiveCollateral
                  ? `${port.positions.length} active on-chain collateral holding${
                      port.positions.length !== 1 ? "s" : ""
                    } evaluated under Risk Ratchet.`
                  : "Fresh wallet detected with $0.00 collateral. Borrow capacity is strictly $0.00."}
              </div>
            </div>
          </div>
          <div className="row g-8">
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              style={{ fontSize: 11, height: 28, padding: "0 10px" }}
              onClick={port.refresh}
              disabled={port.loading}
            >
              <Icon name="clock" size={13} />
              <span>{port.loading ? "Querying..." : "Refresh Chain"}</span>
            </button>
            <Link
              to="/app/position"
              className="btn btn--accent btn--sm"
              style={{ fontSize: 11, height: 28, padding: "0 12px" }}
            >
              Deposit Collateral →
            </Link>
          </div>
        </div>

        {/* ── Section 1: Risk Identity Card ──────────────────────────── */}
        <Card>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 24,
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            {/* Left: wallet + identity */}
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {/* Wallet avatar */}
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: `linear-gradient(135deg, ${
                    port.riskState === "SAFE" ? "#7fc39a22" : "#e06c6c22"
                  }, var(--surface-3))`,
                  border: `2px solid ${
                    port.riskState === "SAFE" ? "#7fc39a44" : "#e06c6c44"
                  }`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon name="wallet" size={22} />
              </div>
              <div>
                <div
                  style={{
                    fontSize: 11,
                    fontFamily: "var(--mono)",
                    color: "var(--text-3)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: 2,
                  }}
                >
                  Wallet Identity
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--mono)" }}>
                  {publicKey ? shortenAddress(publicKey.toBase58(), 4, 4) : "—"}
                </div>
              </div>
            </div>

            {/* Right: quick stats */}
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 2 }}>
                  Risk Profile
                </div>
                <Pill tone={riskProfileTone(profileLabel)}>{profileLabel}</Pill>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 2 }}>
                  Health Factor
                </div>
                <span
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    fontFamily: "var(--mono)",
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
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 2 }}>
                  Risk State
                </div>
                <Pill
                  tone={
                    port.riskState === "SAFE"
                      ? "success"
                      : port.riskState === "EMERGENCY"
                      ? "danger"
                      : "warning"
                  }
                  withDot
                >
                  {port.riskState}
                </Pill>
              </div>
            </div>
          </div>
        </Card>

        {/* ── Section 2: Financial Position ──────────────────────────── */}
        <Card title="Financial Position">
          {port.loading ? (
            <div className="row g-16">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} height={50} />
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              <StatBlock
                label="Total Collateral"
                value={`$${formatMoney(port.totalCollateralUsd)}`}
                sub={
                  hasLiveCollateral
                    ? port.positions.length === 1
                      ? `${formatMoney(port.positions[0].collateralUi, 4)} ${port.positions[0].market.tokenSymbol}`
                      : `${port.positions.length} Active Positions (${port.positions.map((p) => p.market.symbol).join(", ")})`
                    : "0.0000 (No Collateral)"
                }
              />
              <StatBlock
                label="Current Debt"
                value={`$${formatMoney(port.totalDebtUsd)}`}
                sub="USDC"
              />
              <StatBlock
                label="Borrow Capacity"
                value={`$${formatMoney(port.borrowCapacityUsd)}`}
                sub={
                  hasLiveCollateral
                    ? `Effective LTV: ${formatPercent(port.effectiveLtvBps)}`
                    : "No collateral deposited"
                }
              />
              <StatBlock
                label="Effective LTV"
                value={hasLiveCollateral ? `${effectiveLtvPct.toFixed(1)}%` : "0.0%"}
                sub={
                  hasLiveCollateral
                    ? `Base: ${formatPercent(port.weightedBaseLtvBps)} | Penalty: -${port.concentrationPenaltyBps} bps`
                    : "0.0% (Awaiting deposit)"
                }
              />
            </div>
          )}
        </Card>

        {/* ── Section 3: On-Chain Deposited Holdings Breakdown (When N >= 1) ── */}
        {port.positions.length > 0 && (
          <Card title={`On-Chain Deposited Equities (${port.positions.length})`}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--text-3)", fontSize: 11, fontFamily: "var(--mono)" }}>
                    <th style={{ padding: "8px 12px" }}>ASSET</th>
                    <th style={{ padding: "8px 12px" }}>COLLATERAL</th>
                    <th style={{ padding: "8px 12px" }}>PYTH PRICE</th>
                    <th style={{ padding: "8px 12px" }}>USD VALUE</th>
                    <th style={{ padding: "8px 12px" }}>PORTFOLIO WEIGHT</th>
                    <th style={{ padding: "8px 12px" }}>ORACLE POSTURE</th>
                    <th style={{ padding: "8px 12px", textAlign: "right" }}>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {port.positions.map((p) => {
                    const mark = getAssetMark(p.market.symbol);
                    return (
                      <tr key={p.market.mint} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.04)" }}>
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div
                              style={{
                                width: 24,
                                height: 24,
                                borderRadius: "50%",
                                background: "rgba(255, 255, 255, 0.05)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                              }}
                            >
                              {mark ? (
                                <svg viewBox="0 0 24 24" width={16} height={16}>
                                  {mark.parts ? (
                                    mark.parts.map((pt, idx) => (
                                      <path key={idx} d={pt.d} fill={pt.fill} />
                                    ))
                                  ) : (
                                    <path d={mark.d} fill={mark.onDark || "#ffffff"} />
                                  )}
                                </svg>
                              ) : (
                                <span style={{ fontSize: 10, fontWeight: 700 }}>{p.market.symbol.slice(0, 2)}</span>
                              )}
                            </div>
                            <div>
                              <div style={{ fontWeight: 650, color: "var(--text)" }}>{p.market.symbol}</div>
                              <div style={{ fontSize: 10, color: "var(--text-3)" }}>{p.market.name}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: "10px 12px", fontFamily: "var(--mono)", fontWeight: 600 }}>
                          {formatMoney(p.collateralUi, 4)} {p.market.tokenSymbol}
                        </td>
                        <td style={{ padding: "10px 12px", fontFamily: "var(--mono)" }}>
                          ${formatMoney(p.priceUsd)}
                        </td>
                        <td style={{ padding: "10px 12px", fontFamily: "var(--mono)", fontWeight: 700, color: "var(--text)" }}>
                          ${formatMoney(p.collateralValueUsd)}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div
                              style={{
                                width: 60,
                                height: 6,
                                borderRadius: 3,
                                background: "rgba(255, 255, 255, 0.08)",
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  width: `${Math.min(100, Math.round(p.weightPct))}%`,
                                  height: "100%",
                                  background: p.weightPct > 60 ? "#cfad74" : "#7fc39a",
                                }}
                              />
                            </div>
                            <span style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600 }}>
                              {Math.round(p.weightPct)}%
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <Pill tone={p.oracleHealthy ? "success" : "danger"}>
                            {p.oracleHealthy ? `${p.confBps} bps` : "Breached"}
                          </Pill>
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right" }}>
                          <Link
                            to={`/app/position?market=${p.market.symbol}`}
                            className="btn btn--secondary btn--sm"
                            style={{ fontSize: 11, height: 24, padding: "0 8px" }}
                          >
                            Manage →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* ── Section 4: Risk Posture ────────────────────────────────── */}
        <RiskPosture
          concentrationPct={port.maxWeightPct}
          oracleConfBps={port.positions[0]?.confBps ?? 18}
          maxConfBps={port.positions[0]?.maxConfBps ?? 150}
          oracleAgeSec={12}
          maxOracleAge={600}
          liquidityState={port.hardOverride ? "critical" : "normal"}
          leverageRatio={leverageRatio}
        />

        {/* ── Section 5: Uneditable Full Strict Speed Portfolio Risk Graph ──── */}
        <PortfolioRiskGraph
          assets={graphAssets}
          riskState={port.riskState}
          baseLtvBps={port.weightedBaseLtvBps}
          effectiveLtvBps={port.effectiveLtvBps}
          borrowPowerUsd={port.borrowCapacityUsd}
          totalCollateralUsd={port.totalCollateralUsd}
          borrowAllowed={port.borrowAllowed}
          hardOverride={port.hardOverride}
          hardOverrideReason={port.hardOverrideReason}
          uneditable={true}
          onSelectNodeDriver={(nodeId) => setSelectedDriverNode(nodeId)}
        />

        {/* ── Section 6: Causal Explainability Engine ────────────────── */}
        <WhyBorrowPowerChanged
          borrowPowerDiffUsd={riskAnalysis.borrowPowerDiffUsd}
          causalExplanations={riskAnalysis.causalExplanations}
          onSelectDriver={(targetNode) => setSelectedDriverNode(targetNode)}
        />

        {/* ── Section 7: Deterministic Stress Scenario Preview ──────── */}
        <StressScenarioPanel
          totalCollateralUsd={port.totalCollateralUsd}
          totalDebtUsd={port.totalDebtUsd}
          baseLtvBps={port.weightedBaseLtvBps}
          liqThresholdBps={port.positions[0]?.liqThresholdBps ?? 8000}
        />

        {/* ── Section 8: Risk Permissions ────────────────────────────── */}
        <RiskPermissions
          borrowAllowed={port.borrowAllowed}
          borrowBlockers={
            port.hardOverride
              ? [port.hardOverrideReason || "Hard risk override active"]
              : !hasLiveCollateral
              ? ["No collateral deposited — deposit equity tokens to unlock credit line"]
              : !port.borrowAllowed
              ? ["Capacity restricted by Risk Ratchet (Concentration penalty active)"]
              : []
          }
          withdrawAllowed={withdrawAllowed}
          withdrawReason={
            !withdrawAllowed
              ? !hasLiveCollateral
                ? "No collateral deposited"
                : port.riskState === "EMERGENCY"
                ? "Risk-increasing withdrawals blocked in Emergency state"
                : "Protocol paused"
              : undefined
          }
          liquidationActive={liquidationActive}
          healthFactorBps={port.healthFactorBps}
          riskState={port.riskState}
        />

        {/* ── Section 7: Risk History ────────────────────────────────── */}
        <RiskHistory activeState={port.riskState} />

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <div
          style={{
            textAlign: "center",
            padding: "12px 0",
            borderTop: "1px solid var(--border)",
          }}
        >
          <p
            style={{
              fontSize: 12,
              color: "var(--text-3)",
              margin: "0 0 8px 0",
              fontStyle: "italic",
            }}
          >
            Identity → Risk → Permission: Your credit is a consequence of
            portfolio risk, not a fixed number.
          </p>
          <div className="row g-12" style={{ justifyContent: "center" }}>
            <Link to="/app/learn" className="btn btn--secondary btn--sm">
              Interactive Risk Simulator in Learn →
            </Link>
            <Link to="/app/faucet" className="btn btn--secondary btn--sm">
              Devnet Faucet
            </Link>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
