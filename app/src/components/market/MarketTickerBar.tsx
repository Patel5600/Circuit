import React from "react";
import { MarketSnapshot } from "../../lib/market-data/types";
import { formatMoney } from "../../lib/format";
import { AssetLogo } from "../brand/AssetLogo";

interface MarketTickerBarProps {
  snapshots: Record<string, MarketSnapshot>;
  selectedSymbol?: string;
  onSelectSymbol: (symbol: string) => void;
}

export function MarketTickerBar({
  snapshots,
  selectedSymbol,
  onSelectSymbol,
}: MarketTickerBarProps) {
  const items = Object.values(snapshots).filter((s) => s.priceUsd !== null && s.priceUsd > 0);

  if (items.length === 0) return null;

  return (
    <div
      style={{
        background: "var(--surface-1, #0c0e14)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          overflowX: "auto",
          padding: "8px 14px",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontFamily: "var(--mono)",
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: "var(--text-3)",
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
            paddingRight: 12,
            borderRight: "1px solid var(--border)",
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--text-3)",
              display: "inline-block",
            }}
          />
          LIVE TICKER
        </div>

        {items.map((item) => {
          const isSelected = selectedSymbol === item.symbol;
          const change = item.change24hPercent;
          const hasChange = item.changeStatus === "AVAILABLE" && change != null;
          const isPos = (change ?? 0) >= 0;

          return (
            <button
              key={item.assetId}
              type="button"
              onClick={() => onSelectSymbol(item.symbol)}
              style={{
                background: isSelected ? "var(--surface-3, #1e222d)" : "transparent",
                border: isSelected ? "1px solid var(--text)" : "1px solid transparent",
                borderRadius: "var(--r-sm)",
                padding: "4px 8px",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
                flexShrink: 0,
                transition: "all var(--t-fast)",
              }}
            >
              <AssetLogo symbol={item.symbol} size={15} />

              <span
                style={{
                  fontSize: 12,
                  fontFamily: "var(--mono)",
                  fontWeight: 700,
                  color: "var(--text)",
                }}
              >
                {item.displaySymbol}
              </span>

              <span
                style={{
                  fontSize: 12,
                  fontFamily: "var(--mono)",
                  color: item.priceDirection === "UP"
                    ? "var(--mint, #7fc39a)"
                    : item.priceDirection === "DOWN"
                    ? "var(--danger, #cf8b8b)"
                    : "var(--text)",
                  transition: "color 0.3s ease",
                }}
              >
                ${formatMoney(item.priceUsd ?? 0)}
              </span>

              <span
                style={{
                  fontSize: 11,
                  fontFamily: "var(--mono)",
                  fontWeight: 600,
                  color: hasChange
                    ? isPos ? "var(--mint, #7fc39a)" : "var(--danger, #cf8b8b)"
                    : "var(--text-3)",
                }}
              >
                {hasChange
                  ? `${isPos ? "+" : ""}${change!.toFixed(2)}%`
                  : "—"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
