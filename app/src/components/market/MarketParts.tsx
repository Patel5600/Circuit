import React from "react";
import { Card, DataRow, Icon, Pill, Skeleton, Tone } from "../ui";
import { LOGOS } from "../../data/logos";
import { AssetLogo } from "../brand/AssetLogo";
import { formatMoney, formatPercent, formatAge } from "../../lib/format";
import { MarketCandlestick } from "./MarketCandlestick";
import { AssetConfigView } from "../../lib/protocol";
import { OracleSnapshot } from "../../lib/pyth";
import { SessionHint } from "../../hooks/useProtocolState";
import { MarketSnapshot, UnderlyingSession, OracleStatus as OracleStatusType, Candle } from "../../lib/market-data/types";
import { useAction } from "../../context/ActionContext";
import { getDeployedMarket } from "../../data/markets";

/** Oracle freshness / certainty summary, reusable across pages. */
export function OracleStatus({
  oracle,
  asset,
  loading = false,
  compact = false,
}: {
  oracle: OracleSnapshot | null;
  asset: AssetConfigView | null;
  loading?: boolean;
  compact?: boolean;
}) {
  if (loading) return <Skeleton height={compact ? 18 : 24} width="55%" />;

  if (!oracle) {
    return (
      <Pill tone="warning" withDot>
        NO PRICE
      </Pill>
    );
  }

  const stale = asset ? oracle.ageSeconds > asset.maxOracleAge : false;
  const wide = asset ? oracle.confBps > asset.maxConfBps : false;
  const tone: Tone = stale || wide ? "warning" : "success";
  const label = stale ? "STALE" : wide ? "UNCERTAIN" : "FRESH";

  if (compact) {
    return (
      <Pill tone={tone} withDot>
        {label}
      </Pill>
    );
  }

  return (
    <span className="row g-10 wrap">
      <Pill tone={tone} withDot>
        {label}
      </Pill>
      <span className="t-meta">{formatAge(oracle.ageSeconds)}</span>
    </span>
  );
}

/** Reference stock-market session state. */
export function MarketStatus({
  session,
  loading = false,
}: {
  session: SessionHint | null;
  loading?: boolean;
}) {
  if (loading) return <Skeleton height={22} width={90} radius={999} />;
  return (
    <Pill tone={session?.open ? "success" : "neutral"} withDot>
      {session?.open ? "REGULAR (OPEN)" : "NYSE CLOSED"}
    </Pill>
  );
}

export interface MarketRow {
  symbol: string;
  name: string;
  logo?: React.ReactNode;
  live: boolean;
  priceUsd: number | null;
  previousPriceUsd?: number | null;
  priceDirection?: "UP" | "DOWN" | "FLAT";
  change24hPercent?: number | null;
  changeStatus?: "available" | "unavailable" | "AVAILABLE" | "UNAVAILABLE";
  confBps?: number;
  freshness?: "LIVE" | "RECENT" | "STALE" | "UNAVAILABLE";
  underlyingSession?: UnderlyingSession;
  onchainAvailability?: string;
  collateralStatus?: string;
  sparkline?: number[];
  candles?: Candle[];
  referencePrice24h?: number | null;
  ltvBps: number | null;
  quoteSymbol?: string;
  marketSymbol?: string;
  mint?: string;
  pythFeedId?: string;
}

/**
 * Institutional Market Card.
 * Separates Underlying Equity Session, On-Chain Token Market, Oracle Freshness, and Collateral Status.
 * No fake prices. Data-driven transitions.
 */
export function MarketCard({
  row,
  oracle,
  asset,
  session,
  loading,
  onSelect,
  onOpenDetail,
}: {
  row: MarketRow;
  oracle: OracleSnapshot | null;
  asset: AssetConfigView | null;
  session: SessionHint | null;
  loading: boolean;
  onSelect?: () => void;
  onOpenDetail?: () => void;
}) {
  const { openAction } = useAction();
  const isSol = row.quoteSymbol === "WSOL";
  const change = row.change24hPercent ?? 0;
  const isPos = change >= 0;

  // Real mini sparkline
  const points = row.sparkline ?? [];
  const min = points.length > 0 ? Math.min(...points) : 0;
  const max = points.length > 0 ? Math.max(...points) : 1;
  const range = max - min || 1;
  const width = 120;
  const height = 28;

  const sparklinePath = points.length > 1
    ? points.map((p, idx) => {
        const x = (idx / (points.length - 1)) * width;
        const y = height - ((p - min) / range) * (height - 6) - 3;
        return `${idx === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      }).join(" ")
    : "";

  return (
    <Card>
      {/* 1. Header: Logo, Ticker, Name, Collateral Badge */}
      <div
        className="row g-12"
        style={{ marginBottom: 12, cursor: onOpenDetail ? "pointer" : "default" }}
        onClick={onOpenDetail}
      >
        <span
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: isSol ? "#9945FF18" : "var(--surface-2, #181b24)",
            border: `1px solid ${isSol ? "#9945FF44" : "var(--border)"}`,
            flex: "none",
          }}
        >
          {row.logo ?? <AssetLogo symbol={row.marketSymbol || row.symbol} size={22} />}
        </span>

        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row g-6" style={{ alignItems: "center" }}>
            <span className="t-title truncate" style={{ fontSize: 15, fontWeight: 700 }}>
              {row.symbol}
            </span>
            {row.quoteSymbol && (
              <span className="t-meta" style={{ fontSize: 11, fontFamily: "var(--mono)" }}>
                / {row.quoteSymbol}
              </span>
            )}
          </div>
          <div className="t-meta truncate" style={{ fontSize: 12 }}>
            {row.name}
          </div>
        </div>

        {row.live ? (
          <Pill tone="neutral" withDot>
            {isSol ? "BORROW SOL" : "COLLATERAL"}
          </Pill>
        ) : (
          <Pill tone="neutral">DISCOVERY</Pill>
        )}
      </div>

      {/* 2. Main Price & 24h Movement with Institutional Candlesticks */}
      <div style={{ marginBottom: 14 }}>
        {loading ? (
          <Skeleton height={32} width="60%" />
        ) : (
          <div className="row between wrap g-8" style={{ alignItems: "center" }}>
            <div>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 800,
                  fontFamily: "var(--mono)",
                  letterSpacing: "-0.02em",
                  color: row.priceDirection === "UP"
                    ? "var(--mint, #7fc39a)"
                    : row.priceDirection === "DOWN"
                    ? "var(--danger, #cf8b8b)"
                    : "var(--text)",
                  transition: "color 0.4s ease",
                }}
              >
                {row.priceUsd !== null ? `$${formatMoney(row.priceUsd)}` : "--"}
              </div>

              <div style={{ marginTop: 2 }}>
                {row.change24hPercent !== null && row.change24hPercent !== undefined ? (
                  <span
                    style={{
                      fontSize: 12,
                      fontFamily: "var(--mono)",
                      fontWeight: 700,
                      color: isPos ? "var(--mint, #7fc39a)" : "var(--danger, #cf8b8b)",
                    }}
                  >
                    {isPos ? "+" : ""}{change.toFixed(2)}% (24h)
                  </span>
                ) : (
                  <span style={{ fontSize: 11, color: "var(--text-3)", fontStyle: "italic" }}>
                    Insufficient history
                  </span>
                )}
              </div>
            </div>

            {/* Financial OHLC Micro-Candlestick Chart */}
            <div style={{ width: 124, height: 32, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
              <MarketCandlestick
                candles={row.candles}
                width={120}
                height={30}
                compact={true}
                isPositive={isPos}
                referencePrice={row.referencePrice24h}
              />
            </div>
          </div>
        )}
      </div>

      {/* 3. 4 Independent Semantic Dimensions */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "8px 12px",
          background: "var(--surface-2, #12151d)",
          padding: "10px 12px",
          borderRadius: "var(--r-sm)",
          border: "1px solid var(--border)",
          fontSize: 11,
          marginBottom: 14,
        }}
      >
        {/* Oracle */}
        <div>
          <div style={{ color: "var(--text-3)", fontSize: 10, fontFamily: "var(--mono)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Oracle</div>
          <div style={{ fontWeight: 600, color: "var(--text)", fontFamily: "var(--mono)", fontSize: 11.5, marginTop: 2 }}>
            {row.freshness ?? "LIVE"}
          </div>
        </div>

        {/* Underlying Session */}
        <div>
          <div style={{ color: "var(--text-3)", fontSize: 10, fontFamily: "var(--mono)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Underlying</div>
          <div style={{ fontWeight: 600, color: row.underlyingSession === "REGULAR" ? "var(--text)" : "var(--text-2)", fontFamily: "var(--mono)", fontSize: 11.5, marginTop: 2 }}>
            {row.underlyingSession ?? "CLOSED"}
          </div>
        </div>

        {/* On-chain Market */}
        <div>
          <div style={{ color: "var(--text-3)", fontSize: 10, fontFamily: "var(--mono)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Onchain</div>
          <div style={{ fontWeight: 600, color: "var(--text)", fontFamily: "var(--mono)", fontSize: 11.5, marginTop: 2 }}>
            24/7 TRADEABLE
          </div>
        </div>

        {/* Collateral Limit */}
        <div>
          <div style={{ color: "var(--text-3)", fontSize: 10, fontFamily: "var(--mono)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Borrow Limit</div>
          <div style={{ fontWeight: 600, color: "var(--text)", fontFamily: "var(--mono)", fontSize: 11.5, marginTop: 2 }}>
            {row.ltvBps !== null ? formatPercent(row.ltvBps) : "60%"} LTV
          </div>
        </div>
      </div>

      {/* 4. Action Buttons */}
      <div className="row g-8">
        <button
          type="button"
          className="btn btn--primary btn--sm grow"
          onClick={onSelect}
          disabled={!row.live}
          style={{ fontWeight: 600, fontSize: 12.5 }}
        >
          Borrow {isSol ? "SOL" : (row.quoteSymbol || "USDC")}
        </button>
        <button
          type="button"
          onClick={() => {
            const sym = row.marketSymbol || row.symbol;
            const target = getDeployedMarket(sym, row.quoteSymbol);
            if (target) {
              openAction({ type: "deposit", market: target });
            }
          }}
          className="btn btn--secondary btn--sm"
          style={{ fontWeight: 600, fontSize: 12.5, minWidth: 74 }}
        >
          Deposit
        </button>
      </div>
    </Card>
  );
}
