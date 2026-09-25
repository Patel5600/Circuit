import React, { useId, useMemo } from "react";
import { MarketSnapshot } from "../../lib/market-data/types";
import { Card, Icon, Pill } from "../ui";
import { formatMoney, formatPercent, formatAge } from "../../lib/format";
import { AssetLogo } from "../brand/AssetLogo";
import { RealtimeFinancialChart } from "../charts/RealtimeFinancialChart";

interface MarketHeroPanelProps {
  snapshot: MarketSnapshot;
  onOpenDetail: () => void;
  onBorrow: () => void;
  onDeposit: () => void;
}

// ── Smooth Catmull-Rom spline ──────────────────────────────────────────────
function buildSpline(coords: { x: number; y: number }[]): string {
  if (coords.length === 0) return "";
  if (coords.length === 1) return `M ${coords[0].x} ${coords[0].y}`;
  if (coords.length === 2) {
    const mx = (coords[0].x + coords[1].x) / 2;
    return `M ${coords[0].x} ${coords[0].y} C ${mx} ${coords[0].y},${mx} ${coords[1].y},${coords[1].x} ${coords[1].y}`;
  }
  let d = `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = i > 0 ? coords[i - 1] : coords[i];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = i < coords.length - 2 ? coords[i + 2] : p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)},${cp2x.toFixed(1)} ${cp2y.toFixed(1)},${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

// ── Main area chart: Bitcoin-style smooth line + gradient fill ──────────────
interface PriceChartProps {
  points: number[];
  isPositive: boolean;
  width?: number;
  height?: number;
  dayLow?: number | null;
  dayHigh?: number | null;
  changeStatus?: string;
}

function PriceAreaChart({
  points,
  isPositive,
  width = 560,
  height = 160,
  dayLow,
  dayHigh,
  changeStatus,
}: PriceChartProps) {
  const gradId = useId();
  const dotId = useId();

  const coords = useMemo(() => {
    if (!points || points.length < 2) return [];
    const padY = height * 0.1;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;
    return points.map((p, idx) => ({
      x: (idx / (points.length - 1)) * width,
      y: height - ((p - min) / range) * (height - 2 * padY) - padY,
    }));
  }, [points, width, height]);

  const strokeColor = isPositive ? "#7fc39a" : "#cf8b8b";
  const strokeColorVar = isPositive ? "var(--mint, #7fc39a)" : "var(--danger, #cf8b8b)";

  if (coords.length < 2) {
    return (
      <div
        style={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-3)",
          fontSize: 11,
          fontFamily: "var(--mono)",
          letterSpacing: "0.04em",
        }}
      >
        {changeStatus === "UNAVAILABLE" ? "AWAITING REAL PRICE HISTORY" : "FETCHING DATA"}
      </div>
    );
  }

  const linePath = buildSpline(coords);
  const first = coords[0];
  const last = coords[coords.length - 1];
  const areaPath = `${linePath} L ${width} ${height} L ${first.x} ${height} Z`;

  // Y-axis price labels (3 levels)
  const minP = Math.min(...points);
  const maxP = Math.max(...points);
  const midP = (minP + maxP) / 2;

  return (
    <div style={{ position: "relative", width: "100%" }}>
      {/* Y-axis price ticks */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          height,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          pointerEvents: "none",
          paddingTop: 4,
          paddingBottom: 4,
        }}
      >
        {[maxP, midP, minP].map((p) => (
          <span
            key={p}
            style={{
              fontSize: 9.5,
              fontFamily: "var(--mono)",
              color: "var(--text-3)",
              lineHeight: 1,
            }}
          >
            ${formatMoney(p)}
          </span>
        ))}
      </div>

      {/* SVG chart */}
      <div style={{ paddingLeft: 56 }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          height={height}
          style={{ overflow: "visible", display: "block" }}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity={0.28} />
              <stop offset="55%" stopColor={strokeColor} stopOpacity={0.08} />
              <stop offset="100%" stopColor={strokeColor} stopOpacity={0.0} />
            </linearGradient>
            <filter id={dotId}>
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Horizontal gridlines */}
          {[0.1, 0.5, 0.9].map((frac) => (
            <line
              key={frac}
              x1={0}
              y1={height * frac}
              x2={width}
              y2={height * frac}
              stroke="rgba(255,255,255,0.04)"
              strokeWidth={1}
            />
          ))}

          {/* Filled area under curve */}
          <path d={areaPath} fill={`url(#${gradId})`} />

          {/* Price line */}
          <path
            d={linePath}
            fill="none"
            stroke={strokeColorVar}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transition: "stroke 0.4s ease" }}
          />

          {/* Latest price dot with glow */}
          <circle
            cx={last.x}
            cy={last.y}
            r={4.5}
            fill={strokeColorVar}
            filter={`url(#${dotId})`}
            style={{ transition: "cy 0.4s ease" }}
          />
          <circle
            cx={last.x}
            cy={last.y}
            r={2.5}
            fill="white"
            opacity={0.9}
            style={{ transition: "cy 0.4s ease" }}
          />
        </svg>
      </div>

      {/* Day range bar below chart */}
      {(dayLow != null || dayHigh != null) && (
        <div
          className="row between"
          style={{
            paddingLeft: 56,
            marginTop: 6,
            fontSize: 10,
            fontFamily: "var(--mono)",
            color: "var(--text-3)",
          }}
        >
          <span>
            DAY LOW{" "}
            <span style={{ color: "var(--text-2)" }}>${formatMoney(dayLow ?? minP)}</span>
          </span>
          <span>
            DAY HIGH{" "}
            <span style={{ color: "var(--text-2)" }}>${formatMoney(dayHigh ?? maxP)}</span>
          </span>
        </div>
      )}
    </div>
  );
}

// ── Main hero panel ─────────────────────────────────────────────────────────
export function MarketHeroPanel({
  snapshot,
  onOpenDetail,
  onBorrow,
  onDeposit,
}: MarketHeroPanelProps) {
  const isPos = (snapshot.change24hPercent ?? 0) >= 0;
  const isSol = snapshot.quoteSymbol === "WSOL";
  const has24h = snapshot.changeStatus === "AVAILABLE" && snapshot.change24hPercent != null;
  const oracleAge = Math.max(0, Math.floor(Date.now() / 1000) - snapshot.oracleTimestamp);

  return (
    <Card
      title={
        <div className="row g-10" style={{ alignItems: "center", justifyContent: "space-between", width: "100%" }}>
          <div className="row g-10" style={{ alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-3)" }}>
              FEATURED MARKET TERMINAL
            </span>
            <Pill tone="neutral" withDot>
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
      <div className="featured-terminal-grid">
        {/* ── LEFT: Identity + Price ──────────────────────────────────── */}
        <div className="stack g-14">
          {/* Logo + Name */}
          <div className="row g-12" style={{ alignItems: "center" }}>
            <span
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: isSol ? "#9945FF18" : "var(--surface-2, #181b24)",
                border: `1px solid ${isSol ? "#9945FF44" : "var(--border)"}`,
                flexShrink: 0,
              }}
            >
              <AssetLogo symbol={snapshot.symbol} size={30} />
            </span>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text)", lineHeight: 1.2 }}>
                {snapshot.name}
              </div>
              <div style={{ fontSize: 12, fontFamily: "var(--mono)", color: "var(--text-3)", marginTop: 2 }}>
                ({snapshot.symbol}) · {snapshot.quoteSymbol}
              </div>
            </div>
          </div>

          {/* Big real-time price */}
          <div>
            <div
              style={{
                fontSize: 38,
                fontWeight: 900,
                fontFamily: "var(--mono)",
                letterSpacing: "-0.03em",
                color:
                  snapshot.priceDirection === "UP"
                    ? "var(--mint, #7fc39a)"
                    : snapshot.priceDirection === "DOWN"
                    ? "var(--danger, #cf8b8b)"
                    : "var(--text)",
                transition: "color 0.35s ease",
                lineHeight: 1,
              }}
            >
              ${formatMoney(snapshot.priceUsd ?? 0)}
            </div>

            {/* 24h badge or UNAVAILABLE */}
            <div className="row g-8" style={{ marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
              {has24h ? (
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    fontFamily: "var(--mono)",
                    padding: "3px 10px",
                    borderRadius: "var(--r-sm)",
                    background: isPos ? "rgba(127,195,154,0.14)" : "rgba(207,139,139,0.14)",
                    color: isPos ? "var(--mint,#7fc39a)" : "var(--danger,#cf8b8b)",
                  }}
                >
                  {isPos ? "+" : ""}
                  {snapshot.change24hPercent!.toFixed(2)}% (24h)
                </span>
              ) : (
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: "var(--mono)",
                    color: "var(--text-3)",
                    padding: "3px 8px",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--r-sm)",
                  }}
                >
                  24H — INSUFFICIENT HISTORY
                </span>
              )}

              {/* Pyth oracle freshness inline */}
              <span
                style={{
                  fontSize: 10.5,
                  fontFamily: "var(--mono)",
                  color: snapshot.oracleStatus === "LIVE"
                    ? "var(--mint,#7fc39a)"
                    : "var(--text-2)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: "currentColor",
                    display: "inline-block",
                  }}
                />
                PYTH {snapshot.oracleStatus} · {formatAge(oracleAge)}
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="row g-10" style={{ marginTop: 2 }}>
            <button type="button" className="btn btn--primary" onClick={onBorrow} style={{ minWidth: 130 }}>
              Borrow {isSol ? "SOL" : snapshot.quoteSymbol}
            </button>
            <button type="button" className="btn btn--secondary" onClick={onDeposit} style={{ minWidth: 110 }}>
              Deposit {snapshot.displaySymbol}
            </button>
          </div>
        </div>

        {/* ── CENTER: Institutional Real-time Financial Chart ───────────────── */}
        <div className="stack g-8" style={{ minWidth: 280, flex: "1 1 480px" }}>
          <RealtimeFinancialChart
            symbol={snapshot.displaySymbol || snapshot.symbol}
            mint={snapshot.mint}
            height={185}
            chartType="candlestick"
            showVolume={true}
          />
        </div>

        {/* ── RIGHT: 4-Dimension Status Grid ──────────────────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
            background: "var(--surface-2,#13161f)",
            padding: "14px 12px",
            borderRadius: "var(--r)",
            border: "1px solid var(--border)",
            alignSelf: "start",
          }}
        >
          {/* Oracle Freshness */}
          <div className="stack g-4">
            <span className="t-meta" style={{ fontSize: 10, textTransform: "uppercase" }}>
              Oracle Freshness
            </span>
            <div className="row g-6" style={{ alignItems: "center" }}>
              <Pill
                tone={
                  snapshot.oracleStatus === "LIVE"
                    ? "success"
                    : snapshot.oracleStatus === "RECENT"
                    ? "warning"
                    : "danger"
                }
                withDot
              >
                {snapshot.oracleStatus}
              </Pill>
              <span style={{ fontSize: 10.5, color: "var(--text-3)", fontFamily: "var(--mono)" }}>
                {formatAge(oracleAge)}
              </span>
            </div>
          </div>

          {/* Underlying Session */}
          <div className="stack g-4">
            <span className="t-meta" style={{ fontSize: 10, textTransform: "uppercase" }}>
              Underlying Equity
            </span>
            <Pill tone="neutral" withDot>
              {snapshot.underlyingSession}
            </Pill>
          </div>

          {/* On-chain availability */}
          <div className="stack g-4">
            <span className="t-meta" style={{ fontSize: 10, textTransform: "uppercase" }}>
              On-Chain Market
            </span>
            <Pill
              tone="neutral"
              withDot
            >
              24/7 TRADEABLE
            </Pill>
          </div>

          {/* Collateral / LTV */}
          <div className="stack g-4">
            <span className="t-meta" style={{ fontSize: 10, textTransform: "uppercase" }}>
              Collateral Status
            </span>
            <Pill
              tone="neutral"
              withDot
            >
              {snapshot.collateralStatus === "AVAILABLE"
                ? `${formatPercent(snapshot.baseLtvBps)} LTV`
                : "COMING SOON"}
            </Pill>
          </div>

          {/* Confidence spread */}
          <div className="stack g-4" style={{ gridColumn: "span 2" }}>
            <span className="t-meta" style={{ fontSize: 10, textTransform: "uppercase" }}>
              Pyth Confidence
            </span>
            <div className="row g-6" style={{ alignItems: "center" }}>
              <span
                style={{
                  fontSize: 12,
                  fontFamily: "var(--mono)",
                  fontWeight: 600,
                  color: "var(--text)",
                }}
              >
                ±{snapshot.oracleConfBps} BPS
              </span>
              <span style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "var(--mono)" }}>
                (${formatMoney(snapshot.oracleConfidenceUsd)})
              </span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
