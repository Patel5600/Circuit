import React from "react";
import { MarketSnapshot } from "../../lib/market-data/types";
import { Card, Icon, Pill } from "../ui";
import { formatMoney, formatPercent, formatAge } from "../../lib/format";

interface MarketHeroPanelProps {
  snapshot: MarketSnapshot;
  onOpenDetail: () => void;
  onBorrow: () => void;
  onDeposit: () => void;
}

export function MarketHeroPanel({
  snapshot,
  onOpenDetail,
  onBorrow,
  onDeposit,
}: MarketHeroPanelProps) {
  const isPos = (snapshot.change24hPercent ?? 0) >= 0;
  const isSol = snapshot.quoteSymbol === "WSOL";

  // Build SVG sparkline path from real historical points
  const points = snapshot.sparkline;
  const min = points.length > 0 ? Math.min(...points) : 0;
  const max = points.length > 0 ? Math.max(...points) : 1;
  const range = max - min || 1;
  const width = 280;
  const height = 64;

  const sparklinePath = points.length > 1
    ? points.map((p, idx) => {
        const x = (idx / (points.length - 1)) * width;
        const y = height - ((p - min) / range) * (height - 12) - 6;
        return `${idx === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      }).join(" ")
    : "";

  return (
    <Card
      title={
        <div className="row g-10" style={{ alignItems: "center", justifyContent: "space-between", width: "100%" }}>
          <div className="row g-10" style={{ alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-3)" }}>
              FEATURED MARKET TERMINAL
            </span>
            <Pill tone="accent" withDot>
              {snapshot.displaySymbol} / {snapshot.quoteSymbol}
            </Pill>
          </div>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={onOpenDetail}
            style={{ fontSize: 11, padding: "3px 8px" }}
          >
            <Icon name="external" size={12} />
            <span>Forensic Details</span>
          </button>
        </div>
      }
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 24,
          alignItems: "center",
          padding: "4px 0",
        }}
      >
        {/* Left: Big Price & Movement */}
        <div className="stack g-12">
          <div>
            <div className="row g-8" style={{ alignItems: "baseline" }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }}>
                {snapshot.name}
              </span>
              <span style={{ fontSize: 13, fontFamily: "var(--mono)", color: "var(--text-3)" }}>
                ({snapshot.symbol})
              </span>
            </div>

            <div className="row g-12" style={{ alignItems: "baseline", marginTop: 4 }}>
              <span
                style={{
                  fontSize: 36,
                  fontWeight: 900,
                  fontFamily: "var(--mono)",
                  letterSpacing: "-0.03em",
                  color: snapshot.priceDirection === "UP"
                    ? "var(--mint, #7fc39a)"
                    : snapshot.priceDirection === "DOWN"
                    ? "var(--danger, #cf8b8b)"
                    : "var(--text)",
                  transition: "color 0.4s ease",
                }}
              >
                ${formatMoney(snapshot.priceUsd ?? 0)}
              </span>

              <span
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  fontFamily: "var(--mono)",
                  padding: "2px 8px",
                  borderRadius: "var(--r-sm)",
                  background: isPos ? "rgba(127, 195, 154, 0.14)" : "rgba(207, 139, 139, 0.14)",
                  color: isPos ? "var(--mint, #7fc39a)" : "var(--danger, #cf8b8b)",
                }}
              >
                {isPos ? "+" : ""}{(snapshot.change24hPercent ?? 0).toFixed(2)}% (24h)
              </span>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="row g-10" style={{ marginTop: 4 }}>
            <button
              type="button"
              className="btn btn--accent"
              onClick={onBorrow}
              style={{ minWidth: 140 }}
            >
              Borrow {isSol ? "SOL" : snapshot.quoteSymbol}
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={onDeposit}
              style={{ minWidth: 110 }}
            >
              Deposit {snapshot.displaySymbol}
            </button>
          </div>
        </div>

        {/* Center: Real Sparkline Chart */}
        <div className="stack g-6" style={{ minWidth: 200, alignItems: "center" }}>
          <div className="row between" style={{ width: "100%", fontSize: 11, color: "var(--text-3)", fontFamily: "var(--mono)" }}>
            <span>24H Low: ${formatMoney(snapshot.dayLowUsd ?? min)}</span>
            <span>24H High: ${formatMoney(snapshot.dayHighUsd ?? max)}</span>
          </div>

          {points.length > 1 ? (
            <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} style={{ overflow: "visible" }}>
              <path
                d={sparklinePath}
                fill="none"
                stroke={isPos ? "var(--mint, #7fc39a)" : "var(--danger, #cf8b8b)"}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <div
              style={{
                height,
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px dashed var(--border)",
                borderRadius: "var(--r-sm)",
                color: "var(--text-3)",
                fontSize: 11,
                fontFamily: "var(--mono)",
              }}
            >
              INSUFFICIENT INTRADAY TICKS
            </div>
          )}
          <span style={{ fontSize: 10, color: "var(--text-3)", letterSpacing: "0.04em" }}>
            REAL INTRADAY BENCHMARK SERIES · 15M INTERVALS
          </span>
        </div>

        {/* Right: 4 Decoupled Dimension Status Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
            background: "var(--surface-2, #13161f)",
            padding: 12,
            borderRadius: "var(--r)",
            border: "1px solid var(--border)",
          }}
        >
          {/* 1. Oracle Status */}
          <div className="stack g-4">
            <span className="t-meta" style={{ fontSize: 10, textTransform: "uppercase" }}>
              Oracle Freshness
            </span>
            <div className="row g-6" style={{ alignItems: "center" }}>
              <Pill tone={snapshot.oracleStatus === "LIVE" ? "success" : snapshot.oracleStatus === "RECENT" ? "warning" : "danger"} withDot>
                {snapshot.oracleStatus}
              </Pill>
              <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--mono)" }}>
                {formatAge(Math.max(0, Math.floor(Date.now() / 1000) - snapshot.oracleTimestamp))}
              </span>
            </div>
          </div>

          {/* 2. Underlying NYSE Session */}
          <div className="stack g-4">
            <span className="t-meta" style={{ fontSize: 10, textTransform: "uppercase" }}>
              Underlying Equity
            </span>
            <div className="row g-6" style={{ alignItems: "center" }}>
              <Pill tone={snapshot.underlyingSession === "REGULAR" ? "success" : "neutral"} withDot>
                {snapshot.underlyingSession}
              </Pill>
            </div>
          </div>

          {/* 3. On-chain Secondary Token Market */}
          <div className="stack g-4">
            <span className="t-meta" style={{ fontSize: 10, textTransform: "uppercase" }}>
              On-Chain Token Market
            </span>
            <div className="row g-6" style={{ alignItems: "center" }}>
              <Pill tone={snapshot.onchainAvailability === "TRADEABLE" ? "accent" : "neutral"} withDot>
                24/7 TRADEABLE
              </Pill>
            </div>
          </div>

          {/* 4. Collateral Status */}
          <div className="stack g-4">
            <span className="t-meta" style={{ fontSize: 10, textTransform: "uppercase" }}>
              Collateral Status
            </span>
            <div className="row g-6" style={{ alignItems: "center" }}>
              <Pill tone={snapshot.collateralStatus === "AVAILABLE" ? "success" : "neutral"} withDot>
                {snapshot.collateralStatus === "AVAILABLE" ? `${formatPercent(snapshot.baseLtvBps)} LTV` : "COMING SOON"}
              </Pill>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
