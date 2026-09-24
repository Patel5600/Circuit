import React, { useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";

import { PageContainer } from "../components/layout/AppShell";
import { ConfigNotice, ConnectPrompt } from "../components/layout/Guards";
import { Notice, LoadingRegion } from "../components/ui";
import { MarketSelector } from "../components/market/MarketSelector";
import { useProtocolState } from "../hooks/useProtocolState";
import { useCircuitDomain } from "../lib/domain/context";
import { useMarket } from "../context/MarketContext";
import { useAction } from "../context/ActionContext";
import { activeAssetDisplay } from "../lib/asset";
import { greeting, humanizeReasonCode } from "../lib/format";
import { toUi } from "../lib/protocol";
import { useActivity } from "../hooks/useActivity";
import { useMarketData } from "../context/MarketDataContext";

// Kit 4 Components
import { RiskGateDial } from "../components/kit4/RiskGateDial";
import { MetricCards } from "../components/kit4/MetricCards";
import { CollateralHoldingCard } from "../components/kit4/CollateralHoldingCard";
import { BorrowingPower } from "../components/kit4/BorrowingPower";
import { RiskTopologyGraph } from "../components/kit4/RiskTopologyGraph";
import { AgentCapitalControl } from "../components/kit4/AgentCapitalControl";
import { ActivityTimeline } from "../components/kit4/ActivityTimeline";

export default function Dashboard() {
  const { selectedMarket } = useMarket();
  const { openAction } = useAction();
  const s = useProtocolState();
  const domain = useCircuitDomain();
  const { connected } = useWallet();
  const navigate = useNavigate();
  const { items: activityItems } = useActivity();
  const { snapshots } = useMarketData();

  const topologyRef = useRef<HTMLDivElement>(null);

  const display = useMemo(() => activeAssetDisplay(selectedMarket), [selectedMarket]);
  const quoteSymbol = selectedMarket.quoteSymbol || "USDC";

  const minBps = s.protocol?.minHealthFactorBps ?? 10_000;
  const hasPosition =
    Boolean(s.position) &&
    ((s.position?.collateralAmount ?? 0n) > 0n ||
      (s.position?.debtAmount ?? 0n) > 0n);

  const activeAssetRisk = domain.getRiskForAsset ? domain.getRiskForAsset(selectedMarket.symbol) : domain.risk;
  const activeDecision = useMemo(
    () => domain.evaluateDecision("borrow", 0, selectedMarket.symbol),
    [domain, selectedMarket.symbol]
  );

  // Derive real numerical quantities with immediate fallback to domain.portfolio
  const spotPrice = useMemo(() => {
    if (s.oracle?.priceUsd && s.oracle.priceUsd > 0) return s.oracle.priceUsd;
    const snap = snapshots[selectedMarket.symbol];
    if (snap?.priceUsd && snap.priceUsd > 0) return snap.priceUsd;
    const pos = domain.portfolio.positions.find((p) => p.symbol === selectedMarket.symbol);
    if (pos && pos.collateralUi > 0 && pos.collateralValueUsd > 0) {
      return pos.collateralValueUsd / pos.collateralUi;
    }
    return 0;
  }, [s.oracle?.priceUsd, snapshots, selectedMarket.symbol, domain.portfolio.positions]);

  const collateralUnits = useMemo(() => {
    if (s.position?.collateralAmount) {
      return toUi(s.position.collateralAmount, 6);
    }
    const pos = domain.portfolio.positions.find((p) => p.symbol === selectedMarket.symbol);
    if (pos?.collateralUi) return pos.collateralUi;
    return 0;
  }, [s.position?.collateralAmount, domain.portfolio.positions, selectedMarket.symbol]);

  const collateralValueUsd = useMemo(() => {
    if (s.position?.collateralAmount && spotPrice > 0) {
      return toUi(s.position.collateralAmount, 6) * spotPrice;
    }
    const pos = domain.portfolio.positions.find((p) => p.symbol === selectedMarket.symbol);
    if (pos && pos.collateralValueUsd > 0) return pos.collateralValueUsd;
    if (collateralUnits > 0 && spotPrice > 0) return collateralUnits * spotPrice;
    return domain.portfolio.totalCollateralUsd || 0;
  }, [s.position?.collateralAmount, spotPrice, domain.portfolio.positions, domain.portfolio.totalCollateralUsd, collateralUnits, selectedMarket.symbol]);

  const debtUsd = useMemo(() => {
    if (s.position?.debtAmount) {
      return toUi(s.position.debtAmount, 6);
    }
    const pos = domain.portfolio.positions.find((p) => p.symbol === selectedMarket.symbol);
    if (pos && pos.debtUi !== undefined) return pos.debtUi;
    return domain.portfolio.totalDebtUsd || 0;
  }, [s.position?.debtAmount, domain.portfolio.positions, domain.portfolio.totalDebtUsd, selectedMarket.symbol]);

  const healthFactor = useMemo(() => {
    if (s.risk?.healthFactorBps) {
      return s.risk.healthFactorBps / 10000;
    }
    if (domain.portfolio.healthFactor !== null && domain.portfolio.healthFactor !== undefined) {
      return domain.portfolio.healthFactor;
    }
    if (collateralValueUsd > 0 && debtUsd === 0) return null; // No debt
    return null;
  }, [s.risk?.healthFactorBps, domain.portfolio.healthFactor, collateralValueUsd, debtUsd]);

  const borrowCapacityUsd = useMemo(() => {
    if (s.risk && s.risk.availableToBorrowNative > 0n) {
      return toUi(s.risk.availableToBorrowNative, 6);
    }
    if (domain.portfolio.borrowCapacityUsd > 0) {
      return domain.portfolio.borrowCapacityUsd;
    }
    return activeDecision.capitalPolicy?.maxBorrow ?? (collateralValueUsd * 0.5);
  }, [s.risk, domain.portfolio.borrowCapacityUsd, activeDecision.capitalPolicy?.maxBorrow, collateralValueUsd]);

  const totalCapacityUsd = useMemo(() => {
    if (s.risk && s.risk.capacityNative > 0n) {
      return toUi(s.risk.capacityNative, 6);
    }
    return collateralValueUsd * 0.5;
  }, [s.risk, collateralValueUsd]);

  const collateralDelta24h = snapshots[selectedMarket.symbol]?.change24hPercent ?? 0;

  // Immediate data hydration: no skeletons if portfolio or position data already exists
  const isMetricsLoading = s.loading && collateralValueUsd === 0 && !domain.portfolio.hasPositions;

  // Plain-language summary of the user's standing
  const headline = useMemo(() => {
    if (!connected) return "Connect a wallet to view your tokenized equity credit.";
    if (isMetricsLoading) return "Loading position telemetry...";
    if (!hasPosition && collateralValueUsd === 0) return `You do not have a ${display.symbol} position yet.`;
    const hf = healthFactor;
    if (hf === null) return `You have ${display.symbol} deposited and no debt.`;
    if (hf < 1.0) return "Your position is at risk of liquidation.";
    if (hf < 1.15) return "Your position is close to its safety limit.";
    return "Your position is healthy.";
  }, [connected, isMetricsLoading, hasPosition, collateralValueUsd, healthFactor, display.symbol]);

  // Derive risk gate reasons
  const riskReasons = useMemo(() => {
    const r: string[] = [];
    if (!activeDecision.market.sessionOpen) r.push("Reference market closed");
    if (activeDecision.oracle.freshness === "STALE" || activeDecision.oracle.freshness === "UNAVAILABLE") r.push("Oracle stale");
    if (!activeDecision.oracle.healthy) r.push("Oracle confidence wide");
    if (healthFactor !== null && healthFactor < 1.15) r.push("Low health factor");
    if (r.length === 0 && activeAssetRisk.riskState !== "SAFE") {
      r.push(`Risk state: ${activeAssetRisk.riskState}`);
    }
    return r;
  }, [activeDecision, healthFactor, activeAssetRisk.riskState]);

  const scrollToTopology = () => {
    topologyRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <PageContainer>
      <ConfigNotice />

      {/* 1. Header: Greeting & Market Selector */}
      <header style={{ marginBottom: 20 }}>
        <div className="row between g-12 wrap" style={{ alignItems: "center" }}>
          <div>
            <span className="meta">
              (Circuit)<b>{greeting()}</b>
            </span>
            <h1
              className="pagehead__title"
              style={{
                marginTop: 4,
                fontWeight: 400,
                fontSize: "clamp(22px, 3.2vw, 32px)",
                letterSpacing: "-0.035em",
              }}
              aria-live="polite"
            >
              {headline}
            </h1>
          </div>

          <div className="row g-8" style={{ alignItems: "center" }}>
            <MarketSelector compact />
            <Link to="/app/markets" className="btn secondary" style={{ height: 34, fontSize: 12 }}>
              All Markets
            </Link>
          </div>
        </div>
      </header>

      {s.error && (
        <div style={{ marginBottom: 18 }}>
          <Notice
            tone={s.error.includes("rate limit") ? "warning" : "danger"}
            title={s.error.includes("rate limit") ? "Solana Devnet RPC Rate-Limited" : "Could not reach the network"}
          >
            {s.error}
          </Notice>
        </div>
      )}

      {!connected ? (
        <ConnectPrompt />
      ) : (
        <div className="dashboard-grid">
          {/* Row 1: Primary Compact Risk Gate Dial */}
          <RiskGateDial
            riskState={activeAssetRisk.riskState || "SAFE"}
            reasons={riskReasons}
            oracleStatus={activeDecision.oracle.freshness}
            borrowVerdict={activeDecision.permission.allowed ? "ALLOWED" : "BLOCKED"}
            effectiveLtvPct={collateralValueUsd > 0 ? (debtUsd / collateralValueUsd) * 100 : 0}
            onViewTopology={scrollToTopology}
          />

          {/* Row 2: 3 Equal Metric Cards: Collateral, Debt, Health */}
          <MetricCards
            collateralValueUsd={collateralValueUsd}
            debtUsd={debtUsd}
            healthFactor={healthFactor}
            borrowCapacityUsd={borrowCapacityUsd}
            collateralDelta24h={collateralDelta24h}
            loading={isMetricsLoading}
          />

          {/* Row 3: Secondary Panels — Collateral Holding | Borrowing Power */}
          <div className="dashboard-row--split">
            <CollateralHoldingCard
              symbol={display.symbol}
              name={display.name}
              tokenAmount={collateralUnits}
              collateralUsd={collateralValueUsd}
              priceUsd={spotPrice}
              debtUsd={debtUsd}
              onDeposit={() => openAction({ type: "deposit", market: selectedMarket })}
              onWithdraw={() => openAction({ type: "withdraw", market: selectedMarket })}
              loading={isMetricsLoading}
            />

            <BorrowingPower
              availableCapacityUsd={borrowCapacityUsd}
              totalCapacityUsd={totalCapacityUsd}
              currentDebtUsd={debtUsd}
              collateralUsd={collateralValueUsd}
              borrowAllowed={activeDecision.permission.allowed}
              restrictionReason={
                activeDecision.permission.message ||
                humanizeReasonCode(activeDecision.permission.reasonCode)
              }
              onBorrow={(amount) => {
                openAction({ type: "borrow", market: selectedMarket });
              }}
              currencySymbol={quoteSymbol}
            />
          </div>

          {/* Row 4: Risk Topology Graph | Agent Capital Control */}
          <div className="dashboard-row--split">
            <div ref={topologyRef}>
              <RiskTopologyGraph
                isMarketOpen={Boolean(activeDecision.market.sessionOpen)}
                isOracleFresh={activeDecision.oracle.freshness === "LIVE" || activeDecision.oracle.freshness === "RECENT"}
                isConfidenceTight={Boolean(activeDecision.oracle.healthy)}
                healthFactor={healthFactor}
                borrowAllowed={Boolean(activeDecision.permission.allowed)}
                blockedReason={
                  activeDecision.permission.message ||
                  humanizeReasonCode(activeDecision.permission.reasonCode)
                }
              />
            </div>

            <div>
              <AgentCapitalControl
                strategyName={domain.controlMode === "MANUAL" ? null : (domain.agentAuthority.strategyName || "Circuit Sovereign Sentinel")}
                isArmed={domain.controlMode === "AUTONOMOUS" || domain.agentAuthority.hasAuthority}
                borrowAllowed={Boolean(activeDecision.permission.allowed)}
                availableCapacityUsd={borrowCapacityUsd}
                maxPerBorrow={domain.agentAuthority.maxBorrowLimit || 500}
                dailyCap={1500}
                ltvCeilingPct={activeDecision.capitalPolicy?.maxLtv ? activeDecision.capitalPolicy.maxLtv * 100 : 40}
                onArmAuthority={() => {
                  navigate("/app/autonomous");
                }}
                onRevokeAuthority={() => {
                  domain.revokeAgentAuthority(selectedMarket.symbol);
                }}
              />
            </div>
          </div>

          {/* Row 5: Recent Activity Timeline (Full width) */}
          <div>
            <ActivityTimeline
              items={(activityItems ?? []).slice(0, 8)}
              collateralSymbol={display.symbol}
              onItemClick={() => navigate("/app/activity")}
            />
          </div>
        </div>
      )}
    </PageContainer>
  );
}
