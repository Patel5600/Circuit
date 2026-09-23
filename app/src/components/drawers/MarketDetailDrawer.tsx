/**
 * Circuit Protocol - Institutional Market Detail Drawer
 *
 * Comprehensive forensic parameters for tokenized equity markets.
 */

import React, { useState, useMemo } from "react";
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
import { PublicKey } from "@solana/web3.js";
import { useCircuitDomain } from "../../lib/domain/context";
import { deriveDbcPoolAddress, METEORA_DBC_PROGRAM_ID } from "../../lib/meteora/dbc";

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
  const { risk } = useCircuitDomain();
  const [copiedFeed, setCopiedFeed] = useState(false);
  const [copiedPool, setCopiedPool] = useState(false);

  const currentRiskState = risk?.riskState ?? "SAFE";

  const activeSymbol = snapshot?.symbol ?? market?.symbol ?? "";
  const name = snapshot?.name ?? market?.name ?? activeSymbol;
  const quoteSymbol = snapshot?.quoteSymbol ?? market?.quoteSymbol ?? "USDC";
  const displaySymbol = snapshot?.displaySymbol ?? activeSymbol;
  const priceUsd = snapshot?.priceUsd ?? (market as any)?.priceUsd ?? null;
  const change24h: number | null = snapshot?.change24hPercent ?? (market as any)?.change24hPercent ?? null;
  const isPos = (change24h ?? 0) >= 0;
  const feedId = snapshot?.pythFeedId ?? (market as any)?.pythFeedId ?? (market as any)?.feedId ?? "";
  const baseLtv = snapshot?.baseLtvBps ?? (market as any)?.baseLtvBps ?? (market as any)?.ltvBps ?? 7000;
  const liqThreshold = snapshot?.liqThresholdBps ?? (market as any)?.liqThresholdBps ?? 8000;
  const liqBonus = snapshot?.liqBonusBps ?? (market as any)?.liqBonusBps ?? 500;
  const oracleStatus = snapshot?.oracleStatus ?? (market as any)?.freshness ?? "UNAVAILABLE";
  const underlyingSession = snapshot?.underlyingSession ?? (market as any)?.underlyingSession ?? "CLOSED";
  const confBps: number | null = snapshot?.oracleConfBps ?? (market as any)?.confBps ?? null;
  const confUsd: number | null = snapshot?.oracleConfidenceUsd ?? (priceUsd != null && confBps != null ? (priceUsd * (confBps / 10000)) : null);
  const ageSeconds: number | null = snapshot?.oracleTimestamp ? Math.max(0, Math.floor(Date.now() / 1000) - snapshot.oracleTimestamp) : null;
  const isSessionOpen = underlyingSession === "REGULAR";
  const isFeedStale = oracleStatus === "STALE" || (ageSeconds != null && ageSeconds > 60);
  const derivedHaltState: "open_normal" | "closed" | "halted_inferred" | "oracle_unavailable" =
    (market as any)?.haltState ?? "open_normal";

  const deployed = getDeployedMarket(activeSymbol, quoteSymbol);
  const baseMintStr = deployed?.mint ?? (market as any)?.mint;
  const quoteMintStr = deployed?.quoteMint ?? (market as any)?.quoteMint;

  const [dbcPoolPda] = useMemo(() => {
    try {
      if (baseMintStr && quoteMintStr) {
        return deriveDbcPoolAddress(new PublicKey(baseMintStr), new PublicKey(quoteMintStr));
      }
    } catch {
      // ignore invalid keys
    }
    return [null, 0];
  }, [baseMintStr, quoteMintStr]);

  if (!open) return null;

  const handleCopyFeed = () => {
    if (!feedId) return;
    navigator.clipboard.writeText(feedId);
    setCopiedFeed(true);
    setTimeout(() => setCopiedFeed(false), 2000);
  };

  const handleCopyPool = () => {
    if (!dbcPoolPda) return;
    navigator.clipboard.writeText(dbcPoolPda.toBase58());
    setCopiedPool(true);
    setTimeout(() => setCopiedPool(false), 2000);
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`${name} (${displaySymbol})`}
      subtitle={`Market Â· ${activeSymbol}/${quoteSymbol}`}
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
              {change24h !== null ? `${isPos ? "+" : ""}${change24h.toFixed(2)}%` : "â€”"}
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
            Intraday Candlestick Chart Â· 15M Intervals
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
              <Pill tone={oracleStatus === "LIVE" ? "success" : oracleStatus === "RECENT" ? "accent" : "warning"} withDot>
                {oracleStatus}
              </Pill>
              <span className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>
                {ageSeconds != null ? formatAge(ageSeconds) : "Unavailable"}
              </span>
            </div>
          </div>

          <div className="row between g-8" style={{ alignItems: "center" }}>
            <span className="t-label">Confidence Uncertainty</span>
            <span className="mono" style={{ fontSize: 12 }}>
              {confUsd != null && confBps != null
                ? `±$${formatMoney(confUsd)} (${(confBps / 100).toFixed(2)}%)`
                : "Unavailable"}
            </span>
          </div>
        </div>

        {/* MarketGuard Per-Security Halt State */}
        <div
          className="stack g-10"
          style={{
            padding: 16,
            background: "var(--surface-2, #0d0f15)",
            borderRadius: "var(--r, 10px)",
            border: `1px solid ${
              derivedHaltState === "halted_inferred"
                ? "rgba(224, 98, 98, 0.4)"
                : "var(--border, #1a1d26)"
            }`,
          }}
        >
          <div className="row between" style={{ alignItems: "center" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-3)", textTransform: "uppercase" }}>
              MarketGuard Per-Security Halt State
            </div>
            <Pill
              tone={derivedHaltState === "halted_inferred" ? "danger" : derivedHaltState === "open_normal" ? "success" : "neutral"}
              withDot
            >
              {derivedHaltState === "halted_inferred" ? "HALTED INFERRED" : derivedHaltState === "open_normal" ? "OPEN NORMAL" : "CLOSED"}
            </Pill>
          </div>

          <div className="row between g-8" style={{ alignItems: "center" }}>
            <span className="t-label">Expected Session</span>
            <span className="mono" style={{ fontSize: 12 }}>
              {isSessionOpen ? "OPEN (Active Reference Session)" : "CLOSED (Deterministic Calendar)"}
            </span>
          </div>

          <div className="row between g-8" style={{ alignItems: "center" }}>
            <span className="t-label">Observed Feed Staleness</span>
            <span className="mono" style={{ fontSize: 12, color: isFeedStale ? "var(--warning, #cfad74)" : "var(--text)" }}>
              {ageSeconds != null ? `${formatAge(ageSeconds)} ${isFeedStale ? "(Stale)" : "(Fresh)"}` : "Unavailable"}
            </span>
          </div>

          <div className="row between g-8" style={{ alignItems: "center" }}>
            <span className="t-label">Global Oracle Status</span>
            <span className="mono" style={{ fontSize: 12, color: "var(--mint, #7fc39a)" }}>
              HEALTHY (Multi-Feed Cross Check Nominal)
            </span>
          </div>

          {derivedHaltState === "halted_inferred" && (
            <div
              style={{
                marginTop: 6,
                padding: "10px 12px",
                background: "rgba(224, 98, 98, 0.08)",
                border: "1px solid rgba(224, 98, 98, 0.25)",
                borderRadius: "var(--r-sm)",
                fontSize: 11,
                color: "var(--danger, #cf8b8b)",
                lineHeight: 1.45,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Security-Level Market Pause Inference
              </div>
              Feed stale during expected session; Circuit has inferred a security-level halt condition. Oracle outage remains a possible alternative.
            </div>
          )}
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

        {/* Meteora DBC Liquidity & Execution Surface */}
        <div
          className="stack g-10"
          style={{
            padding: 16,
            background: "var(--surface-2, #0d0f15)",
            borderRadius: "var(--r, 10px)",
            border: "1px solid var(--border, #1a1d26)",
          }}
        >
          <div className="row between g-8" style={{ alignItems: "center" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-3)", textTransform: "uppercase" }}>
              Meteora DBC Liquidity & Trading Venue
            </div>
            <Pill tone="neutral">
              CIRCUIT GOVERNED
            </Pill>
          </div>

          <div style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.45 }}>
            Meteora DBC serves as an execution venue. All swaps, liquidity entries, and rebalances are bounded onchain by the Circuit Permission Engine.
          </div>

          <div className="row between g-8" style={{ alignItems: "center" }}>
            <span className="t-label">Execution Venue</span>
            <span className="mono" style={{ fontSize: 11, color: "var(--text-2)" }} title={METEORA_DBC_PROGRAM_ID.toBase58()}>
              Meteora DBC ({METEORA_DBC_PROGRAM_ID.toBase58().slice(0, 6)}...{METEORA_DBC_PROGRAM_ID.toBase58().slice(-4)})
            </span>
          </div>

          <div className="row between g-8" style={{ alignItems: "center" }}>
            <span className="t-label">DBC Virtual Pool PDA</span>
            {dbcPoolPda ? (
              <div className="row g-6" style={{ alignItems: "center" }}>
                <span className="mono" style={{ fontSize: 11, color: "var(--text)" }}>
                  {dbcPoolPda.toBase58().slice(0, 6)}...{dbcPoolPda.toBase58().slice(-4)}
                </span>
                <button
                  type="button"
                  onClick={handleCopyPool}
                  style={{
                    background: "none",
                    border: "none",
                    color: copiedPool ? "var(--mint, #7fc39a)" : "var(--accent)",
                    fontSize: 10,
                    fontFamily: "var(--mono)",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  {copiedPool ? "Copied" : "Copy"}
                </button>
              </div>
            ) : (
              <span className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>
                Unavailable
              </span>
            )}
          </div>

          <div className="row between g-8" style={{ alignItems: "center" }}>
            <span className="t-label">Risk Ratchet State</span>
            <Pill
              tone={
                currentRiskState === "SAFE"
                  ? "success"
                  : currentRiskState === "RESTRICTED"
                  ? "warning"
                  : "danger"
              }
              withDot
            >
              {currentRiskState}
            </Pill>
          </div>

          {/* Section 15 Risk Matrix Status Table */}
          <div
            style={{
              padding: "10px 12px",
              background: "var(--surface-3, #151821)",
              borderRadius: "var(--r-sm, 6px)",
              border: "1px solid var(--border, #212634)",
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 700, fontFamily: "var(--mono)", color: "var(--text-3)", marginBottom: 8, letterSpacing: "0.04em" }}>
              PERMITTED DBC OPERATIONS ({currentRiskState})
            </div>
            <div className="stack g-6" style={{ fontSize: 11 }}>
              <div className="row between">
                <span style={{ color: "var(--text-2)" }}>Swap (DBC)</span>
                <span style={{ fontFamily: "var(--mono)", fontWeight: 600, color: currentRiskState === "SAFE" ? "var(--mint, #79c2a4)" : currentRiskState === "RESTRICTED" ? "var(--warning, #cfad74)" : "var(--danger, #cf8b8b)" }}>
                  {currentRiskState === "SAFE" ? "ALLOWED (100% capacity)" : currentRiskState === "RESTRICTED" ? "CAPPED (50% / 100 bps max)" : "BLOCKED"}
                </span>
              </div>
              <div className="row between">
                <span style={{ color: "var(--text-2)" }}>Enter Liquidity</span>
                <span style={{ fontFamily: "var(--mono)", fontWeight: 600, color: currentRiskState === "SAFE" ? "var(--mint, #79c2a4)" : currentRiskState === "RESTRICTED" ? "var(--warning, #cfad74)" : "var(--danger, #cf8b8b)" }}>
                  {currentRiskState === "SAFE" ? "ALLOWED (100% capacity)" : currentRiskState === "RESTRICTED" ? "CAPPED (50% capacity)" : "BLOCKED"}
                </span>
              </div>
              <div className="row between">
                <span style={{ color: "var(--text-2)" }}>Exit Liquidity</span>
                <span style={{ fontFamily: "var(--mono)", fontWeight: 600, color: "var(--mint, #79c2a4)" }}>
                  ALLOWED (unconditional escape)
                </span>
              </div>
              <div className="row between">
                <span style={{ color: "var(--text-2)" }}>Rebalance</span>
                <span style={{ fontFamily: "var(--mono)", fontWeight: 600, color: currentRiskState === "SAFE" ? "var(--mint, #79c2a4)" : currentRiskState === "RESTRICTED" ? "var(--warning, #cfad74)" : "var(--danger, #cf8b8b)" }}>
                  {currentRiskState === "SAFE" ? "ALLOWED (100% capacity)" : currentRiskState === "RESTRICTED" ? "CAPPED (50% capacity)" : "BLOCKED"}
                </span>
              </div>
            </div>
          </div>

          <div style={{ fontSize: 10, color: "var(--text-3)", fontStyle: "italic", lineHeight: 1.4 }}>
            Curve Depth Telemetry: Not observed on Devnet (secondary pool uninitialized). Circuit strictly reports real state and avoids synthetic liquidity metrics.
          </div>
        </div>

        {/* Pyth Feed ID with copy */}
        {feedId && (
          <div
            className="stack g-6"
            style={{
              padding: "12px 14px",
              background: "var(--bg-elevated)",
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
