/**
 * Circuit Protocol - Institutional Market Detail Drawer
 *
 * Comprehensive forensic parameters for tokenized equity markets.
 */

import React, { useState } from "react";
import { Drawer } from "../ui/Drawer";
import { DeployedMarket, getDeployedMarket } from "../../data/markets";
import { useAction } from "../../context/ActionContext";
import { Pill, Icon } from "../ui";
import { formatMoney, formatPercent, formatAge } from "../../lib/format";
import { useNavigate } from "react-router-dom";
import { MarketSnapshot } from "../../lib/market-data/types";
import { MarketRow } from "../market/MarketParts";
import { AssetLogo } from "../brand/AssetLogo";
import { MarketCandlestick } from "../market/MarketCandlestick";

export function MarketDetailDrawer({
  market,
  snapshot,
  open,
  onClose,
}: {
  market?: DeployedMarket | MarketRow | null;
  snapshot?: MarketSnapshot | null;
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { openAction } = useAction();
  const [copiedFeed, setCopiedFeed] = useState(false);

  const activeSymbol = snapshot?.symbol ?? market?.symbol ?? "";
  const name = snapshot?.name ?? market?.name ?? activeSymbol;
  const quoteSymbol = snapshot?.quoteSymbol ?? market?.quoteSymbol ?? "USDC";
  const displaySymbol = snapshot?.displaySymbol ?? activeSymbol;
  const priceUsd = snapshot?.priceUsd ?? (market as any)?.priceUsd ?? null;
  const change24h = snapshot?.change24hPercent ?? (market as any)?.change24hPercent ?? 0;
  const isPos = change24h >= 0;
  const feedId = snapshot?.pythFeedId ?? (market as any)?.pythFeedId ?? (market as any)?.feedId ?? "";
  const baseLtv = snapshot?.baseLtvBps ?? (market as any)?.baseLtvBps ?? (market as any)?.ltvBps ?? 7000;
  const liqThreshold = snapshot?.liqThresholdBps ?? (market as any)?.liqThresholdBps ?? 8000;
  const liqBonus = snapshot?.liqBonusBps ?? (market as any)?.liqBonusBps ?? 500;
  const oracleStatus = snapshot?.oracleStatus ?? (market as any)?.freshness ?? "LIVE";
  const underlyingSession = snapshot?.underlyingSession ?? (market as any)?.underlyingSession ?? "CLOSED";
  const confBps = snapshot?.oracleConfBps ?? (market as any)?.confBps ?? 18;
  const confUsd = snapshot?.oracleConfidenceUsd ?? ((priceUsd ?? 100) * (confBps / 10000));
  const ageSeconds = snapshot ? Math.max(0, Math.floor(Date.now() / 1000) - snapshot.oracleTimestamp) : 12;

  if (!open) return null;

  const handleCopyFeed = () => {
    if (!feedId) return;
    navigator.clipboard.writeText(feedId);
    setCopiedFeed(true);
    setTimeout(() => setCopiedFeed(false), 2000);
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`${name} (${displaySymbol})`}
      subtitle={`Market · ${activeSymbol}/${quoteSymbol}`}
      badge={
        <Pill tone={underlyingSession === "REGULAR" ? "success" : "neutral"} withDot>
          {underlyingSession === "REGULAR" ? "NYSE Regular Open" : "NYSE Session Closed"}
        </Pill>
      }
    >
      <div className="stack g-16">
        {/* Price & 24h Performance Card */}
        <div
          style={{
            padding: "16px 18px",
            background: "var(--surface-2, #0d0f15)",
            borderRadius: "var(--r, 10px)",
            border: "1px solid var(--border, #1a1d26)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div className="row g-12" style={{ alignItems: "center" }}>
            <span
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--surface-3, #181b24)",
                border: "1px solid var(--border, #262b3a)",
                flexShrink: 0,
              }}
            >
              <AssetLogo symbol={activeSymbol} size={28} />
            </span>

            <div>
              <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Current Verified Price
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, fontFamily: "var(--mono)", color: "var(--text)", marginTop: 2 }}>
                {priceUsd !== null ? `$${formatMoney(priceUsd)}` : "--"}
              </div>
            </div>
          </div>

          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase" }}>
              24h Change
            </div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                fontFamily: "var(--mono)",
                color: isPos ? "var(--mint, #7fc39a)" : "var(--danger, #cf8b8b)",
                marginTop: 2,
              }}
            >
              {isPos ? "+" : ""}{change24h.toFixed(2)}%
            </div>
          </div>
        </div>

        {/* Real OHLC Candlestick Chart */}
        <div
          style={{
            padding: "16px 18px",
            background: "var(--surface-2, #0d0f15)",
            borderRadius: "var(--r, 10px)",
            border: "1px solid var(--border, #1a1d26)",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-3)", textTransform: "uppercase", marginBottom: 12 }}>
            Intraday Candlestick Chart · 15M Intervals
          </div>
          <MarketCandlestick
            candles={snapshot?.candles}
            width="100%"
            height={160}
            compact={false}
            isPositive={isPos}
            referencePrice={snapshot?.referencePrice24h}
          />
        </div>

        {/* 4 Semantic Dimensions Matrix */}
        <div
          className="stack g-10"
          style={{
            padding: 16,
            background: "var(--surface-2, #0d0f15)",
            borderRadius: "var(--r, 10px)",
            border: "1px solid var(--border, #1a1d26)",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-3)", textTransform: "uppercase" }}>
            Market State & Observability
          </div>

          <div className="row between g-8" style={{ alignItems: "center" }}>
            <span className="t-label">Underlying US Equity</span>
            <div className="row g-6" style={{ alignItems: "center" }}>
              <Pill tone={underlyingSession === "REGULAR" ? "success" : "neutral"} withDot>
                {underlyingSession}
              </Pill>
              <span style={{ fontSize: 11, color: "var(--text-3)" }}>
                {underlyingSession === "REGULAR" ? "9:30 AM - 4:00 PM ET" : "Outside Regular Hours"}
              </span>
            </div>
          </div>

          <div className="row between g-8" style={{ alignItems: "center" }}>
            <span className="t-label">On-Chain Secondary Market</span>
            <Pill tone="accent" withDot>
              24/7 TRADEABLE
            </Pill>
          </div>

          <div className="row between g-8" style={{ alignItems: "center" }}>
            <span className="t-label">Oracle Quality & Freshness</span>
            <div className="row g-6" style={{ alignItems: "center" }}>
              <Pill tone={oracleStatus === "LIVE" ? "success" : "warning"} withDot>
                {oracleStatus}
              </Pill>
              <span className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>
                {formatAge(ageSeconds)}
              </span>
            </div>
          </div>

          <div className="row between g-8" style={{ alignItems: "center" }}>
            <span className="t-label">Confidence Uncertainty</span>
            <span className="mono" style={{ fontSize: 12 }}>
              ±${formatMoney(confUsd)} ({(confBps / 100).toFixed(2)}%)
            </span>
          </div>
        </div>

        {/* On-Chain Risk & Credit Configuration */}
        <div
          className="stack g-10"
          style={{
            padding: 16,
            background: "var(--surface-2, #0d0f15)",
            borderRadius: "var(--r, 10px)",
            border: "1px solid var(--border, #1a1d26)",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-3)", textTransform: "uppercase" }}>
            Credit & Solvency Invariants
          </div>

          <div className="row between g-8" style={{ alignItems: "center" }}>
            <span className="t-label">Base LTV</span>
            <span className="mono" style={{ fontWeight: 650 }}>
              {formatPercent(baseLtv)}
            </span>
          </div>

          <div className="row between g-8" style={{ alignItems: "center" }}>
            <span className="t-label">Liquidation Threshold</span>
            <span className="mono" style={{ fontWeight: 650 }}>
              {formatPercent(liqThreshold)}
            </span>
          </div>

          <div className="row between g-8" style={{ alignItems: "center" }}>
            <span className="t-label">Dynamic Liq Bonus Floor</span>
            <span className="mono" style={{ fontWeight: 650 }}>
              {(liqBonus / 100).toFixed(2)}%
            </span>
          </div>
        </div>

        {/* Pyth Feed ID with copy */}
        {feedId && (
          <div
            className="stack g-6"
            style={{
              padding: "12px 14px",
              background: "#08090d",
              borderRadius: "var(--r, 10px)",
              border: "1px solid var(--border, #1a1d26)",
            }}
          >
            <div className="row between" style={{ alignItems: "center" }}>
              <span className="t-label" style={{ fontSize: 10 }}>Pyth Price Feed ID</span>
              <button
                type="button"
                onClick={handleCopyFeed}
                style={{
                  background: "none",
                  border: "none",
                  color: copiedFeed ? "var(--mint, #7fc39a)" : "var(--accent)",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                {copiedFeed ? "Copied!" : "Copy"}
              </button>
            </div>
            <div
              className="mono"
              style={{
                fontSize: 11,
                wordBreak: "break-all",
                color: "var(--text-2)",
              }}
            >
              {feedId}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="stack g-8" style={{ marginTop: 6 }}>
          <button
            type="button"
            className="btn btn--accent btn--block"
            onClick={() => {
              const target = getDeployedMarket(activeSymbol, quoteSymbol);
              onClose();
              if (target) {
                openAction({ type: "borrow", market: target });
              } else {
                navigate(`/app/borrow?market=${activeSymbol}&quote=${quoteSymbol}`);
              }
            }}
          >
            Borrow Against {displaySymbol}
          </button>

          <button
            type="button"
            className="btn btn--secondary btn--block"
            onClick={() => {
              const target = getDeployedMarket(activeSymbol, quoteSymbol);
              onClose();
              if (target) {
                openAction({ type: "deposit", market: target });
              } else {
                navigate(`/app/position?market=${activeSymbol}`);
              }
            }}
          >
            Deposit {displaySymbol} Collateral
          </button>

          <button
            type="button"
            className="btn btn--secondary btn--block"
            onClick={() => {
              onClose();
              navigate("/app/profile");
            }}
            style={{ fontSize: 12 }}
          >
            View in Portfolio Risk Graph
          </button>
        </div>
      </div>
    </Drawer>
  );
}
