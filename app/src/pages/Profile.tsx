import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";

import { PageContainer } from "../components/layout/AppShell";
import { ConnectPrompt } from "../components/layout/Guards";
import { Card, Pill, Icon, Skeleton } from "../components/ui";
import { RiskPosture } from "../components/profile/RiskPosture";
import { RiskPermissions } from "../components/profile/RiskPermissions";
import { RiskHistory } from "../components/profile/RiskHistory";
import {
  PortfolioRiskGraph,
  AssetNode,
  DynamicStatePayload,
  getAssetMark,
  getAssetName,
} from "../components/profile/PortfolioRiskGraph";
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

  // Mode and dynamic simulation synchronization
  const [simMode, setSimMode] = useState<"LIVE" | "HEALTHY" | "STRESS" | "EMERGENCY">("LIVE");
  const [dynamicPayload, setDynamicPayload] = useState<DynamicStatePayload | null>(null);
  const [useDemoProof, setUseDemoProof] = useState<boolean>(false);

  const rawCollateralUi = toUi(s.position?.collateralAmount ?? 0n);
  const rawDebtUi = toUi(s.position?.debtAmount ?? 0n);
  const priceUsd = s.oracle?.priceUsd ?? 138.25;

  const hasLiveCollateral = rawCollateralUi > 0;
  const isProofActive = useDemoProof || (!hasLiveCollateral && simMode !== "LIVE");

  const collateralUi = isProofActive ? 72.33 : rawCollateralUi;
  const debtUi = isProofActive ? 2500 : rawDebtUi;
  const collateralValueUsd = collateralUi * priceUsd;
  const leverageRatio = collateralValueUsd > 0 ? debtUi / collateralValueUsd : 0;

  const rawHfBps = s.risk?.healthFactorBps ?? null;
  const baseLtvBps = s.asset?.baseLtvBps ?? 7000;
  const capacityUsd = collateralValueUsd * (baseLtvBps / BPS);
  const borrowPowerUsd = Math.max(0, capacityUsd - debtUi);

  const liveRiskState = riskStateFromGuard(s.guard?.reason, s.risk?.borrowAllowed ?? false);
  const liveBorrowAllowed = s.risk?.borrowAllowed ?? false;

  // Oracle posture
  const confBps = s.oracle?.confBps ?? 18;
  const maxConfBps = s.asset?.maxConfBps ?? 150;
  const oracleAge = s.oracle?.ageSeconds ?? 12;
  const maxOracleAge = s.asset?.maxOracleAge ?? 60;
  const liveHardOverride = liveRiskState === "EMERGENCY" || (s.asset?.custodyState === "impaired");

  // Primary symbol & clean deduplicated secondary symbols
  const primarySymbol = selectedMarket?.symbol ?? "NVDA";
  const secondaryPool = useMemo(() => {
    return ["AAPL", "MSFT", "NVDA", "AMZN", "USDC"].filter((sym) => sym !== primarySymbol);
  }, [primarySymbol]);

  // Clean deduplicated 4-asset portfolio for graph
  const graphAssets: AssetNode[] = useMemo(() => {
    const primary: AssetNode = {
      symbol: primarySymbol,
      name: getAssetName(primarySymbol),
      weightPct: 58,
      oracleHealthy: confBps <= maxConfBps && oracleAge <= maxOracleAge,
      confBps,
      maxConfBps,
      marketOpen: s.session?.open ?? true,
      mark: getAssetMark(primarySymbol),
    };

    const sec1 = secondaryPool[0] || "AAPL";
    const sec2 = secondaryPool[1] || "MSFT";

    return [
      primary,
      {
        symbol: sec1,
        name: getAssetName(sec1),
        weightPct: 22,
        oracleHealthy: true,
        confBps: 18,
        maxConfBps: 150,
        marketOpen: true,
        mark: getAssetMark(sec1),
      },
      {
        symbol: sec2,
        name: getAssetName(sec2),
        weightPct: 15,
        oracleHealthy: true,
        confBps: 12,
        maxConfBps: 150,
        marketOpen: true,
        mark: getAssetMark(sec2),
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
  }, [primarySymbol, secondaryPool, confBps, maxConfBps, oracleAge, maxOracleAge, s.session]);

  // Concentration penalty math
  const maxWeight = Math.max(...graphAssets.map((a) => a.weightPct));
  const concentrationPenaltyBps = maxWeight > 40 ? Math.round((maxWeight - 40) * 100 * 0.36) : 0;
  const effectiveLtvBps = Math.max(3000, baseLtvBps - concentrationPenaltyBps);
  const adjustedBorrowPower = collateralValueUsd * (effectiveLtvBps / BPS) - debtUi;

  // Active synchronized values across the page
  const activeRiskState = dynamicPayload?.riskState ?? liveRiskState;
  const activeBorrowAllowed = dynamicPayload?.borrowAllowed ?? (liveBorrowAllowed || (isProofActive && activeRiskState !== "EMERGENCY"));
  const activeEffectiveLtvBps = dynamicPayload?.effectiveLtvBps ?? effectiveLtvBps;
  const activeBorrowPower = dynamicPayload?.borrowPowerUsd ?? Math.max(0, adjustedBorrowPower);
  const activeConcentrationPct = dynamicPayload?.concentrationPct ?? maxWeight;
  const activeConfBps = dynamicPayload?.confBps ?? confBps;
  const activeHardOverride = dynamicPayload?.hardOverride ?? liveHardOverride;
  const activeHardReason = dynamicPayload?.hardOverrideReason ?? (activeHardOverride ? "Upstream custody settlement link impaired" : undefined);

  const activeEffectiveLtvPct = activeEffectiveLtvBps / 100;
  const activeProfile = riskProfile(leverageRatio);

  const hfDisplay =
    activeRiskState === "EMERGENCY"
      ? "0.92"
      : activeRiskState === "RESTRICTED"
      ? "1.38"
      : isProofActive
      ? "2.80"
      : rawHfBps !== null
      ? (rawHfBps / BPS).toFixed(2)
      : "No debt";

  const liquidationActive =
    activeRiskState === "EMERGENCY"
      ? false
      : rawHfBps !== null && rawHfBps < BPS;

  const withdrawAllowed = !s.protocol?.paused && activeRiskState !== "EMERGENCY";

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
        {/* ── Demo / Live State Indicator Banner for Empty Devnet Wallets ── */}
        {!hasLiveCollateral && (
          <div
            style={{
              padding: "10px 16px",
              background: "rgba(207, 173, 116, 0.08)",
              border: "1px solid rgba(207, 173, 116, 0.25)",
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Icon name="info" size={16} />
              <span style={{ fontSize: 12, color: "var(--text-2)" }}>
                {isProofActive
                  ? "Active Proof Simulation: $10,000 NVDA Collateral loaded for risk modeling."
                  : "Wallet has 0 on-chain collateral. Load reference collateral to model real borrowing power."}
              </span>
            </div>
            <button
              type="button"
              className={`btn ${isProofActive ? "btn--secondary" : "btn--accent"} btn--sm`}
              style={{ fontSize: 11, padding: "4px 10px", height: 26 }}
              onClick={() => setUseDemoProof(!isProofActive)}
            >
              {isProofActive ? "Use Live $0 Wallet" : "Load $10,000 NVDA Collateral"}
            </button>
          </div>
        )}

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
                    activeRiskState === "SAFE" ? "#7fc39a22" : "#e06c6c22"
                  }, var(--surface-3))`,
                  border: `2px solid ${
                    activeRiskState === "SAFE" ? "#7fc39a44" : "#e06c6c44"
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
                <Pill tone={riskProfileTone(activeProfile)}>{activeProfile}</Pill>
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
                    activeRiskState === "SAFE"
                      ? "success"
                      : activeRiskState === "EMERGENCY"
                      ? "danger"
                      : "warning"
                  }
                  withDot
                >
                  {activeRiskState}
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
                sub={`${formatMoney(collateralUi, 4)} ${selectedMarket?.tokenSymbol ?? "NVDAx"}`}
              />
              <StatBlock
                label="Current Debt"
                value={`$${formatMoney(debtUi)}`}
                sub={selectedMarket?.quoteSymbol ?? "USDC"}
              />
              <StatBlock
                label="Borrow Capacity"
                value={`$${formatMoney(Math.max(0, activeBorrowPower))}`}
                sub={`Effective LTV: ${formatPercent(activeEffectiveLtvBps)}`}
              />
              <StatBlock
                label="Effective LTV"
                value={`${activeEffectiveLtvPct.toFixed(1)}%`}
                sub={`Base: ${formatPercent(baseLtvBps)} | Penalty: -${Math.round(
                  (activeConcentrationPct > 40 ? (activeConcentrationPct - 40) * 36 : 0)
                )} bps`}
              />
            </div>
          )}
        </Card>

        {/* ── Section 3: Risk Posture ────────────────────────────────── */}
        <RiskPosture
          concentrationPct={activeConcentrationPct}
          oracleConfBps={activeConfBps}
          maxConfBps={maxConfBps}
          oracleAgeSec={activeRiskState === "EMERGENCY" ? 72 : oracleAge}
          maxOracleAge={maxOracleAge}
          liquidityState={activeHardOverride ? "critical" : s.asset?.liquidityState ?? "normal"}
          leverageRatio={leverageRatio}
        />

        {/* ── Section 4: Portfolio Risk Graph ────────────────────────── */}
        <PortfolioRiskGraph
          assets={graphAssets}
          riskState={activeRiskState}
          baseLtvBps={baseLtvBps}
          effectiveLtvBps={activeEffectiveLtvBps}
          borrowPowerUsd={Math.max(0, activeBorrowPower)}
          totalCollateralUsd={collateralValueUsd}
          borrowAllowed={activeBorrowAllowed}
          hardOverride={activeHardOverride}
          hardOverrideReason={activeHardReason}
          simMode={simMode}
          onSimModeChange={(m) => setSimMode(m)}
          onDynamicStateChange={(payload) => setDynamicPayload(payload)}
        />

        {/* ── Section 5: Risk Permissions ────────────────────────────── */}
        <RiskPermissions
          borrowAllowed={activeBorrowAllowed}
          borrowBlockers={
            activeHardOverride
              ? [activeHardReason || "Hard risk override active"]
              : !activeBorrowAllowed
              ? ["Capacity restricted by Risk Ratchet (Concentration penalty active)"]
              : []
          }
          withdrawAllowed={withdrawAllowed}
          withdrawReason={
            !withdrawAllowed
              ? activeRiskState === "EMERGENCY"
                ? "Risk-increasing withdrawals blocked in Emergency state"
                : "Protocol paused"
              : undefined
          }
          liquidationActive={liquidationActive}
          healthFactorBps={
            activeRiskState === "EMERGENCY"
              ? 9200
              : activeRiskState === "RESTRICTED"
              ? 13800
              : isProofActive
              ? 28000
              : rawHfBps
          }
          riskState={activeRiskState}
        />

        {/* ── Section 6: Risk History ────────────────────────────────── */}
        <RiskHistory activeState={activeRiskState} />

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
