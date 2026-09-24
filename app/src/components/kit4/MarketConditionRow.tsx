import React, { useMemo } from "react";
import { MarketRow } from "../market/MarketParts";

export interface MarketConditionRowProps {
  row: MarketRow;
  onSelect?: (row: MarketRow) => void;
  onActionClick?: (action: "deposit" | "borrow", row: MarketRow) => void;
}

export function MarketConditionRow({
  row,
  onSelect,
  onActionClick,
}: MarketConditionRowProps) {
  // Current Eastern Time progress (0 to 1) for the 24h day marker
  const dayProgressPct = useMemo(() => {
    try {
      const f = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      });
      const parts = Object.fromEntries(
        f.formatToParts(new Date()).map((x) => [x.type, x.value])
      );
      const min = Number(parts.hour) * 60 + Number(parts.minute);
      return Math.min(100, Math.max(0, (min / 1440) * 100));
    } catch {
      return 50;
    }
  }, []);

  const isRefOpen = row.referenceMarketState === "OPEN";
  const isOnchainOpen = row.onchainMarketState === "OPEN" || row.live;
  const isOracleFresh = row.freshness === "LIVE" || row.freshness === "RECENT";
  const isConfidenceTight = (row.confBps || 0) <= 25; // <= 0.25%

  const borrowStatus = useMemo(() => {
    if (!isOnchainOpen) return { tag: "BLOCKED", tone: "bad" };
    if (!isOracleFresh) return { tag: "STALE", tone: "bad" };
    if (!isRefOpen) return { tag: "RESTRICTED", tone: "warn" };
    return { tag: "ALLOWED", tone: "ok" };
  }, [isOnchainOpen, isOracleFresh, isRefOpen]);

  const priceFormatted = useMemo(() => {
    if (row.priceUsd === null || row.priceUsd === undefined) return "—";
    return `$${row.priceUsd.toFixed(2)}`;
  }, [row.priceUsd]);

  const confPercentFormatted = useMemo(() => {
    if (!row.confBps) return "±0.08%";
    return `±${(row.confBps / 100).toFixed(2)}%`;
  }, [row.confBps]);

  const changeFormatted = useMemo(() => {
    if (row.change24hPercent === null || row.change24hPercent === undefined) return null;
    const sign = row.change24hPercent >= 0 ? "+" : "−";
    return `${sign}${Math.abs(row.change24hPercent).toFixed(2)}%`;
  }, [row.change24hPercent]);

  return (
    <div
      className="mc-row"
      onClick={() => onSelect && onSelect(row)}
      style={{ cursor: onSelect ? "pointer" : "default" }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && onSelect) {
          e.preventDefault();
          onSelect(row);
        }
      }}
    >
      {/* 1. Asset Name & Session */}
      <div className="name">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {row.logo}
          <span>{row.symbol}</span>
        </div>
        <small>{row.name} · Reference: {row.referenceMarketState}</small>
      </div>

      {/* 2. Technical Condition Telemetry */}
      <div className="det">
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
          <b>
            {priceFormatted} <span style={{ fontSize: 11, color: "var(--mute)" }}>{confPercentFormatted}</span>
          </b>
          {changeFormatted && (
            <span
              className={`delta ${row.change24hPercent && row.change24hPercent < 0 ? "dn" : "up"}`}
              style={{ fontSize: 11.5 }}
            >
              {changeFormatted}
            </span>
          )}
        </div>

        {/* 24-Hour NYSE Market Session Meter */}
        <div className="day24" title="NYSE Session: 09:30 - 16:00 ET">
          <i className="ses" />
          <i className="now" style={{ left: `${dayProgressPct}%` }} />
        </div>
      </div>

      {/* 3. Status Tags */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <span className={`tag ${isRefOpen ? "ok" : "warn"}`} title="Reference NYSE market session">
          REF: {row.referenceMarketState}
        </span>
        <span className={`tag ${isOracleFresh ? "ok" : "bad"}`} title="Pyth oracle price feed">
          ORACLE: {row.freshness}
        </span>
        <span className={`tag ${borrowStatus.tone}`} title="Circuit borrowing policy">
          BORROW: {borrowStatus.tag}
        </span>
      </div>
    </div>
  );
}
