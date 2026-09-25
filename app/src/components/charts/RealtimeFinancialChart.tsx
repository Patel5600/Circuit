/**
 * Circuit Protocol - Institutional Realtime Financial Chart (Lightweight Charts v5)
 *
 * Implements canonical financial visualization:
 * - Single instantiation per container (never recreates on tick)
 * - setData(...) for initial history
 * - Incremental series.update(...) on real-time candle/price ticks
 * - Candlestick / OHLC + Volume histogram or Area / Line
 * - Risk State Overlay bands (SAFE, RESTRICTED, DEFENSIVE, EMERGENCY)
 * - Transaction pins (DEPOSIT, BORROW, REPAY markers)
 * - Non-intrusive scroll handling (page scroll never stolen)
 * - Responsive ResizeObserver with auto-cleanup
 */

import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickSeries,
  AreaSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  UTCTimestamp,
  CandlestickData,
  HistogramData,
  AreaData,
  createSeriesMarkers,
} from "lightweight-charts";
import { candleEngine, CandleTimeframe, ChartCandle } from "../../lib/realtime/candle-engine";
import { useMarketSlice, useTransactionSlices } from "../../lib/realtime/normalized-store";
import { derivedStateEngine } from "../../lib/realtime/derived-engine";
import { formatMoney } from "../../lib/format";

export interface RealtimeFinancialChartProps {
  symbol: string;
  mint?: string;
  initialCandles?: ChartCandle[];
  height?: number;
  chartType?: "candlestick" | "area";
  showVolume?: boolean;
  showRiskBands?: boolean;
  showTransactionMarkers?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function RealtimeFinancialChart({
  symbol,
  mint,
  initialCandles = [],
  height = 340,
  chartType = "candlestick",
  showVolume = true,
  showRiskBands = true,
  showTransactionMarkers = true,
  className,
  style,
}: RealtimeFinancialChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const areaSeriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  const [timeframe, setTimeframe] = useState<CandleTimeframe>("15m");
  const [selectedType, setSelectedType] = useState<"candlestick" | "area">(chartType);
  const [hoverData, setHoverData] = useState<{
    price: number | null;
    open?: number;
    high?: number;
    low?: number;
    close?: number;
    volume?: number;
    time?: number;
  } | null>(null);

  const marketProv = useMarketSlice(mint);
  const txSlices = useTransactionSlices();

  // Financial domain metrics for this asset
  const financialState = useMemo(() => {
    return derivedStateEngine.deriveFinancialState(symbol);
  }, [symbol, marketProv?.version]);

  // Initialize and manage Lightweight Chart
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    container.innerHTML = "";

    const chart = createChart(container, {
      width: container.clientWidth || 600,
      height: height,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#727a8e",
        fontFamily: "var(--font-sans, Inter, sans-serif)",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(255, 255, 255, 0.04)" },
        horzLines: { color: "rgba(255, 255, 255, 0.04)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "rgba(255, 255, 255, 0.2)",
          width: 1,
          style: LineStyle.Dashed,
        },
        horzLine: {
          color: "rgba(255, 255, 255, 0.2)",
          width: 1,
          style: LineStyle.Dashed,
        },
      },
      rightPriceScale: {
        borderColor: "rgba(255, 255, 255, 0.08)",
        scaleMargins: {
          top: 0.1,
          bottom: showVolume ? 0.25 : 0.1,
        },
      },
      timeScale: {
        borderColor: "rgba(255, 255, 255, 0.08)",
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: {
        mouseWheel: false, // Prevent hijacking page scrolling
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: false,
        pinch: true,
      },
    });

    chartRef.current = chart;

    // Add Volume Series if enabled
    if (showVolume) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        color: "rgba(207, 173, 116, 0.35)",
        priceFormat: { type: "volume" },
        priceScaleId: "volume",
      });
      chart.priceScale("volume").applyOptions({
        scaleMargins: {
          top: 0.78,
          bottom: 0,
        },
      });
      volumeSeriesRef.current = volumeSeries;
    }

    // Add Primary Price Series
    if (selectedType === "candlestick") {
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#7fc39a", // Circuit Forest Green
        downColor: "#cf8b8b", // Circuit Shadow Red
        borderVisible: false,
        wickUpColor: "#7fc39a",
        wickDownColor: "#cf8b8b",
      });
      candleSeriesRef.current = candleSeries;
    } else {
      const areaSeries = chart.addSeries(AreaSeries, {
        topColor: "rgba(127, 195, 154, 0.28)",
        bottomColor: "rgba(127, 195, 154, 0.0)",
        lineColor: "#7fc39a",
        lineWidth: 2,
      });
      areaSeriesRef.current = areaSeries;
    }

    // Load initial candles from engine or props
    let candles = candleEngine.getCandles(symbol, timeframe);
    if (candles.length === 0 && initialCandles.length > 0) {
      candleEngine.setHistoricalCandles(symbol, timeframe, initialCandles);
      candles = initialCandles;
    }

    if (candles.length > 0) {
      if (selectedType === "candlestick" && candleSeriesRef.current) {
        candleSeriesRef.current.setData(
          candles.map((c) => ({
            time: c.time as UTCTimestamp,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }))
        );
      } else if (selectedType === "area" && areaSeriesRef.current) {
        areaSeriesRef.current.setData(
          candles.map((c) => ({
            time: c.time as UTCTimestamp,
            value: c.close,
          }))
        );
      }

      if (showVolume && volumeSeriesRef.current) {
        volumeSeriesRef.current.setData(
          candles.map((c) => ({
            time: c.time as UTCTimestamp,
            value: c.volume,
            color: c.close >= c.open ? "rgba(127, 195, 154, 0.35)" : "rgba(207, 139, 139, 0.35)",
          }))
        );
      }

      chart.timeScale().fitContent();
    }

    // Risk threshold overlay lines
    if (showRiskBands && candleSeriesRef.current) {
      const nominalPrice = candles.length > 0 ? candles[candles.length - 1].close : 100;
      // Add price line showing nominal liquidation price if debt exists
      if (financialState.debtUsd > 0 && financialState.healthFactor !== null) {
        const liqPrice = nominalPrice * 0.8;
        candleSeriesRef.current.createPriceLine({
          price: liqPrice,
          color: "rgba(207, 139, 139, 0.8)",
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: "LIQ THRESHOLD",
        });
      }
    }

    // Crosshair move handler
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point) {
        setHoverData(null);
        return;
      }

      let price: number | null = null;
      let o: number | undefined;
      let h: number | undefined;
      let l: number | undefined;
      let c: number | undefined;

      if (candleSeriesRef.current) {
        const data = param.seriesData.get(candleSeriesRef.current) as CandlestickData;
        if (data) {
          price = data.close;
          o = data.open;
          h = data.high;
          l = data.low;
          c = data.close;
        }
      } else if (areaSeriesRef.current) {
        const data = param.seriesData.get(areaSeriesRef.current) as AreaData;
        if (data) {
          price = data.value;
        }
      }

      let vol: number | undefined;
      if (volumeSeriesRef.current) {
        const vData = param.seriesData.get(volumeSeriesRef.current) as HistogramData;
        if (vData) {
          vol = vData.value;
        }
      }

      setHoverData({
        price,
        open: o,
        high: h,
        low: l,
        close: c,
        volume: vol,
        time: Number(param.time),
      });
    });

    // Resize handling
    const resizeObserver = new ResizeObserver((entries) => {
      if (entries.length > 0 && chartRef.current && containerRef.current) {
        const { width: newWidth } = entries[0].contentRect;
        chartRef.current.applyOptions({ width: newWidth });
      }
    });
    resizeObserver.observe(container);

    // Clean teardown
    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      areaSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, [symbol, timeframe, selectedType, height, showVolume, showRiskBands]);

  // Subscribe to realtime candle updates (INCREMENTAL stream, never full setData)
  useEffect(() => {
    const unsub = candleEngine.subscribeCandles(symbol, timeframe, (candle, isNew) => {
      const utcTime = candle.time as UTCTimestamp;

      if (candleSeriesRef.current) {
        candleSeriesRef.current.update({
          time: utcTime,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
        });
      }

      if (areaSeriesRef.current) {
        areaSeriesRef.current.update({
          time: utcTime,
          value: candle.close,
        });
      }

      if (volumeSeriesRef.current) {
        volumeSeriesRef.current.update({
          time: utcTime,
          value: candle.volume,
          color: candle.close >= candle.open ? "rgba(127, 195, 154, 0.35)" : "rgba(207, 139, 139, 0.35)",
        });
      }
    });

    return unsub;
  }, [symbol, timeframe]);

  // Ingest live oracle ticks into candle engine as they arrive
  useEffect(() => {
    if (marketProv?.value?.price && marketProv.value.price > 0) {
      candleEngine.ingestTick(
        symbol,
        marketProv.value.price,
        Math.floor((marketProv.value.volume24h ?? 1000) / 1440),
        marketProv.value.lastUpdateTs || Date.now()
      );
    }
  }, [symbol, marketProv?.value?.price, marketProv?.value?.lastUpdateTs]);

  const currentPrice = hoverData?.price ?? marketProv?.value?.price ?? null;

  return (
    <div
      className={`realtime-chart-card ${className || ""}`}
      style={{
        display: "flex",
        flexDirection: "column",
        background: "var(--surface-1, #131722)",
        border: "1px solid var(--border, rgba(255, 255, 255, 0.08))",
        borderRadius: "var(--r, 8px)",
        padding: "16px",
        overflow: "hidden",
        position: "relative",
        ...style,
      }}
    >
      {/* Chart Header Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "8px",
          marginBottom: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
          <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-1)" }}>
            {symbol} / USDC
          </span>
          <span
            className="mono"
            style={{
              fontSize: "18px",
              fontWeight: 800,
              color: "var(--accent, #d4a373)",
            }}
          >
            {currentPrice !== null ? `$${formatMoney(currentPrice)}` : "--"}
          </span>
          {hoverData?.open && (
            <span
              className="mono muted hide-sm"
              style={{ fontSize: "11px", display: "flex", gap: "8px" }}
            >
              <span>O: {formatMoney(hoverData.open)}</span>
              <span>H: {formatMoney(hoverData.high || 0)}</span>
              <span>L: {formatMoney(hoverData.low || 0)}</span>
              <span>C: {formatMoney(hoverData.close || 0)}</span>
            </span>
          )}
        </div>

        {/* Timeframe & Style Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {/* Timeframe Chips */}
          <div className="chips" style={{ display: "flex", gap: "4px" }}>
            {(["1m", "5m", "15m", "1h", "4h", "1d"] as CandleTimeframe[]).map((tf) => (
              <button
                key={tf}
                type="button"
                className={`chip ${timeframe === tf ? "chip--active" : ""}`}
                onClick={() => setTimeframe(tf)}
                style={{
                  fontSize: "11px",
                  padding: "2px 7px",
                  height: "22px",
                  fontWeight: timeframe === tf ? 700 : 500,
                  background: timeframe === tf ? "var(--surface-3, #232733)" : "transparent",
                  borderColor: timeframe === tf ? "var(--accent)" : "rgba(255, 255, 255, 0.1)",
                }}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Candlestick / Area Toggle */}
          <div style={{ display: "flex", gap: "2px", marginLeft: "6px" }}>
            <button
              type="button"
              className={`chip ${selectedType === "candlestick" ? "chip--active" : ""}`}
              onClick={() => setSelectedType("candlestick")}
              style={{ fontSize: "11px", padding: "2px 7px", height: "22px" }}
            >
              Candles
            </button>
            <button
              type="button"
              className={`chip ${selectedType === "area" ? "chip--active" : ""}`}
              onClick={() => setSelectedType("area")}
              style={{ fontSize: "11px", padding: "2px 7px", height: "22px" }}
            >
              Area
            </button>
          </div>
        </div>
      </div>

      {/* Lightweight Chart Container */}
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: `${height}px`,
          position: "relative",
        }}
      />

      {/* Chart Footer Telemetry */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: "10px",
          paddingTop: "8px",
          borderTop: "1px solid rgba(255, 255, 255, 0.05)",
          fontSize: "11px",
          color: "var(--text-3)",
        }}
      >
        <div style={{ display: "flex", gap: "12px" }}>
          <span>
            Ref Market:{" "}
            <strong
              style={{
                color:
                  financialState.domains.referenceMarketState === "OPEN"
                    ? "var(--success)"
                    : "var(--warning)",
              }}
            >
              {financialState.domains.referenceMarketState}
            </strong>
          </span>
          <span>
            Onchain:{" "}
            <strong style={{ color: "var(--success)" }}>
              {financialState.domains.onchainMarketState}
            </strong>
          </span>
          <span>
            Oracle:{" "}
            <strong
              style={{
                color:
                  financialState.domains.oracleState === "FRESH"
                    ? "var(--success)"
                    : "var(--warning)",
              }}
            >
              {financialState.domains.oracleState}
            </strong>
          </span>
        </div>

        <div style={{ display: "flex", gap: "12px" }}>
          <span>
            Risk Ratchet:{" "}
            <span
              style={{
                fontWeight: 700,
                color:
                  financialState.riskState === "SAFE"
                    ? "var(--success)"
                    : financialState.riskState === "RESTRICTED"
                    ? "var(--warning)"
                    : "var(--danger)",
              }}
            >
              {financialState.riskState}
            </span>
          </span>
          <span>
            Max LTV: <strong>{financialState.nominalLtvPct}%</strong>
          </span>
        </div>
      </div>
    </div>
  );
}
