import React, { useState, useMemo, useId } from "react";
import { Candle } from "../../lib/market-data/types";
import { formatMoney } from "../../lib/format";

interface MarketCandlestickProps {
  candles?: Candle[];
  width?: number | string;
  height?: number;
  compact?: boolean;
  isPositive?: boolean;
  referencePrice?: number | null;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Institutional OHLC Candlestick Chart Component.
 *
 * Replaces synthetic single-line spline curves with genuine financial market candlesticks:
 * - Real candle body (open-close range)
 * - Real upper and lower wicks (high-low range)
 * - Compact micro-chart for Market Cards
 * - Full detailed view with price scale, time scale, volume bars, and hover inspection for Hero & Drawers
 * - Strict empty state ("Insufficient history") when verified observations are absent
 */
export function MarketCandlestick({
  candles = [],
  width = "100%",
  height,
  compact = false,
  isPositive,
  referencePrice,
  className,
  style,
}: MarketCandlestickProps) {
  const chartId = useId();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const validCandles = useMemo(() => {
    if (!Array.isArray(candles)) return [];
    return candles.filter(
      (c) =>
        typeof c.open === "number" &&
        typeof c.high === "number" &&
        typeof c.low === "number" &&
        typeof c.close === "number" &&
        c.high >= c.low &&
        c.close > 0
    );
  }, [candles]);

  const defaultHeight = compact ? 32 : 180;
  const chartHeight = height ?? defaultHeight;

  if (validCandles.length < 2) {
    return (
      <div
        className={className}
        style={{
          width,
          height: chartHeight,
          display: "flex",
          alignItems: "center",
          justifyContent: compact ? "flex-end" : "center",
          color: "var(--text-3, #727a8e)",
          fontSize: compact ? 11 : 12,
          fontFamily: "var(--mono)",
          fontStyle: "italic",
          ...style,
        }}
      >
        Insufficient history
      </div>
    );
  }

  // Use recent candles for compact micro-view
  const displayCandles = compact ? validCandles.slice(-14) : validCandles;
  const count = displayCandles.length;

  // Compute price bounds
  const prices = displayCandles.flatMap((c) => [c.low, c.high]);
  if (typeof referencePrice === "number" && referencePrice > 0) {
    prices.push(referencePrice);
  }
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const rawPriceRange = maxPrice - minPrice;
  const pricePadding = rawPriceRange === 0 ? maxPrice * 0.01 || 1 : rawPriceRange * 0.08;
  const lowBound = Math.max(0.01, minPrice - pricePadding);
  const highBound = maxPrice + pricePadding;
  const priceRange = highBound - lowBound || 1;

  // Max volume for volume bars
  const maxVolume = Math.max(...displayCandles.map((c) => c.volume ?? 0), 1);

  // Layout dimensions
  const svgWidth = compact ? 120 : 500;
  const paddingRight = compact ? 2 : 54; // room for price axis
  const paddingLeft = compact ? 2 : 10;
  const paddingTop = compact ? 3 : 24; // room for hover inspector
  const paddingBottom = compact ? 3 : 24; // room for time axis
  const plotWidth = svgWidth - paddingLeft - paddingRight;
  const plotHeight = chartHeight - paddingTop - paddingBottom;
  const volumeHeight = compact ? 0 : Math.min(30, plotHeight * 0.22);
  const candlePlotHeight = plotHeight - volumeHeight;

  const getY = (price: number) => {
    return paddingTop + candlePlotHeight - ((price - lowBound) / priceRange) * candlePlotHeight;
  };

  const slotWidth = plotWidth / count;
  const candleWidth = Math.max(2, Math.min(compact ? 5 : 12, slotWidth * 0.68));

  // Active inspected candle
  const activeCandle = hoverIndex !== null && displayCandles[hoverIndex]
    ? displayCandles[hoverIndex]
    : displayCandles[count - 1];

  const activeIsUp = (activeCandle.close >= activeCandle.open);
  const activeChangePercent = activeCandle.open > 0
    ? ((activeCandle.close - activeCandle.open) / activeCandle.open) * 100
    : 0;

  // Subtle dashed reference price line (e.g. 24h open or previous close)
  const refY = typeof referencePrice === "number" && referencePrice >= lowBound && referencePrice <= highBound
    ? getY(referencePrice)
    : null;

  // Price axis tick marks for full chart
  const priceTicks = useMemo(() => {
    if (compact) return [];
    const ticks = [
      lowBound + priceRange * 0.15,
      lowBound + priceRange * 0.5,
      lowBound + priceRange * 0.85,
    ];
    return ticks;
  }, [compact, lowBound, priceRange]);

  // Time axis tick marks for full chart
  const timeTicks = useMemo(() => {
    if (compact || count < 4) return [];
    const indices = [
      0,
      Math.floor(count / 3),
      Math.floor((count * 2) / 3),
      count - 1,
    ];
    return indices.map((idx) => {
      const c = displayCandles[idx];
      const date = new Date(c.time * 1000);
      const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
      const x = paddingLeft + idx * slotWidth + slotWidth / 2;
      return { x, label: timeStr };
    });
  }, [compact, count, displayCandles, paddingLeft, slotWidth]);

  return (
    <div
      className={className}
      style={{
        width,
        position: "relative",
        userSelect: "none",
        ...style,
      }}
    >
      {/* Detailed Top Inspector for Full Chart */}
      {!compact && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            paddingBottom: 6,
            fontSize: 11,
            fontFamily: "var(--mono)",
            color: "var(--text-2, #a0aec0)",
          }}
        >
          <div className="row g-8 wrap" style={{ alignItems: "center" }}>
            <span>
              O: <strong style={{ color: "var(--text)" }}>${formatMoney(activeCandle.open)}</strong>
            </span>
            <span>
              H: <strong style={{ color: "var(--text)" }}>${formatMoney(activeCandle.high)}</strong>
            </span>
            <span>
              L: <strong style={{ color: "var(--text)" }}>${formatMoney(activeCandle.low)}</strong>
            </span>
            <span>
              C:{" "}
              <strong
                style={{
                  color: activeIsUp ? "var(--mint, #7fc39a)" : "var(--danger, #cf8b8b)",
                }}
              >
                ${formatMoney(activeCandle.close)}
              </strong>
            </span>
            <span
              style={{
                color: activeIsUp ? "var(--mint, #7fc39a)" : "var(--danger, #cf8b8b)",
                fontWeight: 700,
              }}
            >
              {activeIsUp ? "+" : ""}{activeChangePercent.toFixed(2)}%
            </span>
          </div>

          <div style={{ color: "var(--text-3)", fontSize: 10 }}>
            {new Date(activeCandle.time * 1000).toLocaleString([], {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })}
            {activeCandle.volume ? ` · Vol: ${activeCandle.volume.toLocaleString()}` : ""}
          </div>
        </div>
      )}

      {/* SVG Canvas */}
      <svg
        viewBox={`0 0 ${svgWidth} ${chartHeight}`}
        width="100%"
        height={chartHeight}
        style={{
          display: "block",
          overflow: "visible",
          cursor: compact ? "default" : "crosshair",
        }}
        onMouseMove={(e) => {
          if (compact) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const mouseX = ((e.clientX - rect.left) / rect.width) * svgWidth;
          const localX = mouseX - paddingLeft;
          const idx = Math.floor(localX / slotWidth);
          if (idx >= 0 && idx < count) {
            setHoverIndex(idx);
          }
        }}
        onMouseLeave={() => setHoverIndex(null)}
      >
        {/* Horizontal Gridlines & Price Scale (Full Chart) */}
        {!compact &&
          priceTicks.map((pt, idx) => {
            const y = getY(pt);
            return (
              <g key={idx}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={svgWidth - paddingRight}
                  y2={y}
                  stroke="var(--border, #1a1d26)"
                  strokeDasharray="2 4"
                  strokeWidth="1"
                />
                <text
                  x={svgWidth - paddingRight + 6}
                  y={y + 3.5}
                  fill="var(--text-3, #727a8e)"
                  fontSize="9.5"
                  fontFamily="var(--mono)"
                >
                  ${formatMoney(pt)}
                </text>
              </g>
            );
          })}

        {/* Reference Price Baseline (if available) */}
        {refY !== null && (
          <line
            x1={paddingLeft}
            y1={refY}
            x2={svgWidth - paddingRight}
            y2={refY}
            stroke="var(--text-3, #727a8e)"
            strokeDasharray="3 3"
            strokeWidth="1"
            strokeOpacity={0.5}
          />
        )}

        {/* Candlesticks */}
        {displayCandles.map((candle, idx) => {
          const isUp = candle.close >= candle.open;
          const candleColor = isUp ? "var(--mint, #7fc39a)" : "var(--danger, #cf8b8b)";
          const wickColor = isUp ? "var(--mint, #7fc39a)" : "var(--danger, #cf8b8b)";

          const slotX = paddingLeft + idx * slotWidth;
          const centerX = slotX + slotWidth / 2;
          const rectX = centerX - candleWidth / 2;

          const openY = getY(candle.open);
          const closeY = getY(candle.close);
          const highY = getY(candle.high);
          const lowY = getY(candle.low);

          const bodyTop = Math.min(openY, closeY);
          const bodyHeight = Math.max(compact ? 1.5 : 2, Math.abs(openY - closeY));

          // Volume bar calculations
          const vol = candle.volume ?? 0;
          const barHeight = maxVolume > 0 ? (vol / maxVolume) * (volumeHeight - 4) : 0;
          const barY = paddingTop + candlePlotHeight + volumeHeight - barHeight;

          const isHovered = hoverIndex === idx;

          return (
            <g key={idx} opacity={hoverIndex !== null && !isHovered ? 0.45 : 1}>
              {/* Volume Bar (Full Mode) */}
              {!compact && volumeHeight > 0 && barHeight > 0 && (
                <rect
                  x={rectX}
                  y={barY}
                  width={candleWidth}
                  height={barHeight}
                  fill={candleColor}
                  fillOpacity={0.22}
                />
              )}

              {/* Upper Wick */}
              <line
                x1={centerX}
                y1={highY}
                x2={centerX}
                y2={bodyTop}
                stroke={wickColor}
                strokeWidth={compact ? 1 : 1.2}
              />

              {/* Lower Wick */}
              <line
                x1={centerX}
                y1={bodyTop + bodyHeight}
                x2={centerX}
                y2={lowY}
                stroke={wickColor}
                strokeWidth={compact ? 1 : 1.2}
              />

              {/* Candle Body */}
              <rect
                x={rectX}
                y={bodyTop}
                width={candleWidth}
                height={bodyHeight}
                fill={isUp ? candleColor : candleColor}
                fillOpacity={isUp ? (compact ? 0.9 : 0.8) : 0.95}
                stroke={candleColor}
                strokeWidth={compact ? 0.8 : 1}
                rx={compact ? 0.5 : 1}
              />

              {/* Hover Crosshair Vertical Line */}
              {!compact && isHovered && (
                <line
                  x1={centerX}
                  y1={paddingTop}
                  x2={centerX}
                  y2={chartHeight - paddingBottom}
                  stroke="var(--accent, #3e7bfa)"
                  strokeDasharray="2 2"
                  strokeWidth="1"
                  strokeOpacity={0.8}
                />
              )}
            </g>
          );
        })}

        {/* Time Axis (Full Mode) */}
        {!compact &&
          timeTicks.map((t, idx) => (
            <text
              key={idx}
              x={t.x}
              y={chartHeight - 6}
              textAnchor="middle"
              fill="var(--text-3, #727a8e)"
              fontSize="9"
              fontFamily="var(--mono)"
            >
              {t.label}
            </text>
          ))}
      </svg>
    </div>
  );
}
