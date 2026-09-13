import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";

import { PageContainer } from "../components/layout/AppShell";
import { ConnectPrompt } from "../components/layout/Guards";
import { Card, Pill, Icon, Skeleton } from "../components/ui";
import { RiskPosture } from "../components/profile/RiskPosture";
import { RiskPermissions } from "../components/profile/RiskPermissions";
import { RiskHistory } from "../components/profile/RiskHistory";
import { PortfolioRiskGraph, AssetNode } from "../components/profile/PortfolioRiskGraph";
import { useProtocolState } from "../hooks/useProtocolState";
import { useMarket } from "../context/MarketContext";
import { shortenAddress, formatMoney, formatPercent } from "../lib/format";
import { toUi, BPS } from "../lib/protocol";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function riskProfile(leverageRatio: number): string {
  if (leverageRatio <= 0.25) return "Conservative";
  if (leverageRatio <= 0.55) return "Moderate";
  return "Aggressive";
}

function riskProfileTone(label: string): "success" | "warning" | "danger" {
  if (label === "Conservative") return "success";
  if (label === "Moderate") return "warning";
  return "danger";
}

function riskStateFromGuard(
  guardReason: string | undefined,
  borrowAllowed: boolean
): "SAFE" | "RESTRICTED" | "DEFENSIVE" | "EMERGENCY" {
  if (!guardReason) return borrowAllowed ? "SAFE" : "RESTRICTED";
  const r = guardReason.toLowerCase();
  if (r.includes("emergency") || r.includes("impaired")) return "EMERGENCY";
  if (r.includes("defensive")) return "DEFENSIVE";
  if (r.includes("restricted") || r.includes("closed") || r.includes("thin"))
    return "RESTRICTED";
  return "SAFE";
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
/*  Profile Page                                                              */
/* -------------------------------------------------------------------------- */

export default function Profile() {
  const { publicKey, connected } = useWallet();
  const { selectedMarket } = useMarket();
  const s = useProtocolState();

  const collateralUi = toUi(s.position?.collateralAmount ?? 0n);
  const debtUi = toUi(s.position?.debtAmount ?? 0n);
  const priceUsd = s.oracle?.priceUsd ?? 0;
  const collateralValueUsd = collateralUi * priceUsd;
  const leverageRatio = collateralValueUsd > 0 ? debtUi / collateralValueUsd : 0;
  const profile = riskProfile(leverageRatio);

  const hfBps = s.risk?.healthFactorBps ?? null;
  const hfDisplay = hfBps !== null ? (hfBps / BPS).toFixed(2) : "No debt";

  const baseLtvBps = s.asset?.baseLtvBps ?? 7000;
  const capacityUsd = collateralValueUsd * (baseLtvBps / BPS);
  const borrowPowerUsd = Math.max(0, capacityUsd - debtUi);
  const effectiveLtvPct = collateralValueUsd > 0 ? (debtUi / collateralValueUsd) * 100 : 0;

  const riskState = riskStateFromGuard(s.guard?.reason, s.risk?.borrowAllowed ?? false);

  const borrowAllowed = s.risk?.borrowAllowed ?? false;
  const borrowBlockers = s.risk?.blockers ?? [];

  // Is position liquidatable?
  const liquidationActive = hfBps !== null && hfBps < BPS;

  // Withdraw allowed if no debt or position stays healthy
  const withdrawAllowed = !s.protocol?.paused && riskState !== "EMERGENCY";

  // Oracle posture
  const confBps = s.oracle?.confBps ?? 0;
  const maxConfBps = s.asset?.maxConfBps ?? 150;
  const oracleAge = s.oracle?.ageSeconds ?? 0;
  const maxOracleAge = s.asset?.maxOracleAge ?? 60;

  // Hard risk override
  const hardOverride = riskState === "EMERGENCY" || (s.asset?.custodyState === "impaired");

  // Simulated multi-asset portfolio for graph
  const graphAssets: AssetNode[] = useMemo(() => {
    const primaryWeight = 58;
    const primary: AssetNode = {
      symbol: selectedMarket?.symbol ?? "NVDA",
      weightPct: primaryWeight,
      oracleHealthy: confBps <= maxConfBps && oracleAge <= maxOracleAge,
      confBps,
      maxConfBps,
      marketOpen: s.session?.open ?? true,
    };
    // Simulated secondary assets for visual richness
    return [
      primary,
      { symbol: "AAPL", weightPct: 22, oracleHealthy: true, confBps: 18, maxConfBps: 150, marketOpen: true },
      { symbol: "MSFT", weightPct: 15, oracleHealthy: true, confBps: 12, maxConfBps: 150, marketOpen: true },
      { symbol: "USDC", weightPct: 5, oracleHealthy: true, confBps: 0, maxConfBps: 150, marketOpen: true },
    ];
  }, [selectedMarket, confBps, maxConfBps, oracleAge, maxOracleAge, s.session]);

  // Concentration penalty math (matching on-chain)
  const maxWeight = Math.max(...graphAssets.map((a) => a.weightPct));
  const concentrationPenaltyBps = maxWeight > 40 ? Math.round((maxWeight - 40) * 100 * 0.36) : 0;
  const effectiveLtvBps = Math.max(3000, baseLtvBps - concentrationPenaltyBps);
  const adjustedBorrowPower = collateralValueUsd * (effectiveLtvBps / BPS) - debtUi;

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
                    riskState === "SAFE" ? "#7fc39a22" : "#e06c6c22"
                  }, var(--surface-3))`,
                  border: `2px solid ${
                    riskState === "SAFE" ? "#7fc39a44" : "#e06c6c44"
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
                  Wallet
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--mono)" }}>
                  {publicKey ? shortenAddress(publicKey.toBase58(), 4, 4) : "—"}
                </div>
              </div>
            </div>

            {/* Right: quick stats */}
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 2 }}>
                  Risk Profile
                </div>
                <Pill tone={riskProfileTone(profile)}>{profile}</Pill>
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
                      hfBps === null
                        ? "var(--text-2)"
                        : hfBps < BPS
                        ? "var(--danger)"
                        : hfBps < BPS * 1.25
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
                    riskState === "SAFE"
                      ? "success"
                      : riskState === "EMERGENCY"
                      ? "danger"
                      : "warning"
                  }
                  withDot
                >
                  {riskState}
                </Pill>
              </div>
            </div>
          </div>
        </Card>

        {/* ── Section 2: Financial Position ──────────────────────────── */}
        <Card title="Financial Position">
          {s.loading ? (
            <div className="row g-16">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} height={50} />
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              <StatBlock
                label="Collateral"
                value={`$${formatMoney(collateralValueUsd)}`}
                sub={`${formatMoney(collateralUi, 4)} ${selectedMarket?.tokenSymbol ?? "tokens"}`}
              />
              <StatBlock
                label="Current Debt"
                value={`$${formatMoney(debtUi)}`}
                sub={selectedMarket?.quoteSymbol ?? "USDC"}
              />
              <StatBlock
                label="Borrow Capacity"
                value={`$${formatMoney(Math.max(0, adjustedBorrowPower))}`}
                sub={`Effective LTV: ${formatPercent(effectiveLtvBps)}`}
              />
              <StatBlock
                label="Effective LTV"
                value={`${effectiveLtvPct.toFixed(1)}%`}
                sub={`Base: ${formatPercent(baseLtvBps)} | Penalty: -${concentrationPenaltyBps} bps`}
              />
            </div>
          )}
        </Card>

        {/* ── Section 3: Risk Posture ────────────────────────────────── */}
        <RiskPosture
          concentrationPct={maxWeight}
          oracleConfBps={confBps}
          maxConfBps={maxConfBps}
          oracleAgeSec={oracleAge}
          maxOracleAge={maxOracleAge}
          liquidityState={s.asset?.liquidityState ?? "normal"}
          leverageRatio={leverageRatio}
        />

        {/* ── Section 4: Portfolio Risk Graph ────────────────────────── */}
        <PortfolioRiskGraph
          assets={graphAssets}
          riskState={riskState}
          baseLtvBps={baseLtvBps}
          effectiveLtvBps={effectiveLtvBps}
          borrowPowerUsd={Math.max(0, adjustedBorrowPower)}
          totalCollateralUsd={collateralValueUsd}
          borrowAllowed={borrowAllowed}
          hardOverride={hardOverride}
          hardOverrideReason={
            hardOverride
              ? s.asset?.custodyState === "impaired"
                ? "Custody settlement link impaired"
                : "Oracle invalid or stale"
              : undefined
          }
        />

        {/* ── Section 5: Risk Permissions ────────────────────────────── */}
        <RiskPermissions
          borrowAllowed={borrowAllowed}
          borrowBlockers={borrowBlockers}
          withdrawAllowed={withdrawAllowed}
          withdrawReason={
            !withdrawAllowed
              ? riskState === "EMERGENCY"
                ? "Risk-increasing withdrawals blocked in Emergency state"
                : "Protocol paused"
              : undefined
          }
          liquidationActive={liquidationActive}
          healthFactorBps={hfBps}
        />

        {/* ── Section 6: Risk History ────────────────────────────────── */}
        <RiskHistory />

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
          <div className="row g-8" style={{ justifyContent: "center" }}>
            <Link to="/app/demo" className="btn btn--secondary btn--sm">
              <Icon name="gauge" size={14} />
              Interactive Risk Demo
            </Link>
            <Link to="/app/verify" className="btn btn--ghost btn--sm">
              <Icon name="verify" size={14} />
              Verify On-Chain
            </Link>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
