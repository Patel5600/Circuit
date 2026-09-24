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
import { BorrowingPower } from "../components/kit4/BorrowingPower";
import { RiskTopologyGraph } from "../components/kit4/RiskTopologyGraph";
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

  // Plain-language summary of the user's standing
  const headline = useMemo(() => {
    if (!connected) return "Connect a wallet to view your tokenized equity credit.";
    if (s.loading) return "Loading position telemetry...";
    if (!hasPosition) return `You do not have a ${display.symbol} position yet.`;
    const hf = s.risk?.healthFactorBps ?? null;
    if (hf === null) return `You have ${display.symbol} deposited and no debt.`;
    if (hf < minBps) return "Your position is at risk of liquidation.";
    if (hf < minBps * 1.25) return "Your position is close to its safety limit.";
    return "Your position is healthy.";
  }, [connected, s.loading, hasPosition, s.risk, minBps, display.symbol]);

  const activeAssetRisk = domain.getRiskForAsset ? domain.getRiskForAsset(selectedMarket.symbol) : domain.risk;
  const activeDecision = useMemo(
    () => domain.evaluateDecision("borrow", 0, selectedMarket.symbol),
    [domain, selectedMarket.symbol]
  );

  // Derive real numerical quantities
  const collateralValueUsd = useMemo(() => {
    if (!s.position?.collateralAmount || !s.oracle?.priceUsd) return 0;
    const units = toUi(s.position.collateralAmount, 6);
    return units * s.oracle.priceUsd;
  }, [s.position?.collateralAmount, s.oracle?.priceUsd]);

  const debtUsd = useMemo(() => {
    if (!s.position?.debtAmount) return 0;
    return toUi(s.position.debtAmount, 6);
  }, [s.position?.debtAmount]);

  const healthFactor = useMemo(() => {
    if (!s.risk?.healthFactorBps) return null;
    return s.risk.healthFactorBps / 10000;
  }, [s.risk?.healthFactorBps]);

  const borrowCapacityUsd = s.risk ? toUi(s.risk.availableToBorrowNative, 6) : 0;
  const totalCapacityUsd = s.risk ? toUi(s.risk.capacityNative, 6) : collateralValueUsd * 0.5;
  const collateralDelta24h = snapshots[selectedMarket.symbol]?.change24hPercent ?? 0;

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
      <header style={{ marginBottom: 24 }}>
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
                fontSize: "clamp(24px, 3.5vw, 36px)",
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
        <div className="stack g-20">
          {s.loading && <LoadingRegion label="Loading position data" />}

          {/* 2. Primary Risk Gate Dial */}
          <RiskGateDial
            riskState={activeAssetRisk.riskState || "SAFE"}
            reasons={riskReasons}
            onViewTopology={scrollToTopology}
          />

          {/* 3. Metric Cards: Collateral, Debt, Health */}
          <MetricCards
            collateralValueUsd={collateralValueUsd}
            debtUsd={debtUsd}
            healthFactor={healthFactor}
            borrowCapacityUsd={borrowCapacityUsd}
            collateralDelta24h={collateralDelta24h}
            loading={s.loading}
          />

          {/* 4. Borrowing Power Card & Preview Slider */}
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

          {/* 5. Execution Authority & Control Surface */}
          <div className="card" style={{ padding: "18px 22px" }}>
            <div className="row between g-12 wrap" style={{ alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
                <div>
                  <span className="meta">Control mode</span>
                  <b style={{ fontSize: 13.5 }}>
                    {domain.controlMode === "MANUAL" ? "Direct Wallet (Self-Sovereign)" : "Autonomous Strategy"}
                  </b>
                </div>

                <div>
                  <span className="meta">Agent authority</span>
                  <span className={`tag ${domain.controlMode === "MANUAL" ? "" : domain.agentAuthority.effectiveAuthority === "FULL" ? "ok" : "warn"}`}>
                    {domain.controlMode === "MANUAL" ? "UNRESTRICTED" : domain.agentAuthority.effectiveAuthority}
                  </span>
                </div>

                <div>
                  <span className="meta">Borrow permission</span>
                  <span className={`tag ${activeDecision.permission.allowed ? "ok" : "bad"}`}>
                    {activeDecision.permission.allowed ? "ALLOWED" : "BLOCKED"}
                  </span>
                </div>
              </div>

              <Link
                to="/app/autonomous"
                className="btn secondary"
                style={{ height: 32, fontSize: 12, padding: "0 14px" }}
              >
                {domain.controlMode === "MANUAL" ? "Configure Strategy" : "Manage Agent"}
              </Link>
            </div>
          </div>

          {/* 6. Risk Topology Graph */}
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

          {/* 7. Recent Activity Timeline */}
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
