/**
 * Circuit Protocol - Position & Risk Topology Chart
 *
 * Realtime synchronized financial visualization for:
 * - Collateral Value ($) & Debt ($)
 * - Nominal LTV Limit vs Effective LTV Limit vs Liquidation Threshold
 * - Theoretical Borrow Capacity vs Executable Borrow Capacity
 * - Dynamic Health Factor trajectory
 */

import React, { useMemo } from "react";
import { formatMoney } from "../../lib/format";
import { derivedStateEngine } from "../../lib/realtime/derived-engine";
import { usePositionSlice, useMarketSlice, useProtocolSlice } from "../../lib/realtime/normalized-store";
import { Pill } from "../ui";

export interface PositionRiskChartProps {
  symbol: string;
  mint?: string;
  compact?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function PositionRiskChart({
  symbol,
  mint,
  compact = false,
  className,
  style,
}: PositionRiskChartProps) {
  const posSlice = usePositionSlice(mint);
  const mktSlice = useMarketSlice(mint);
  const protoSlice = useProtocolSlice();

  const financial = useMemo(() => {
    return derivedStateEngine.deriveFinancialState(symbol);
  }, [symbol, posSlice?.version, mktSlice?.version, protoSlice.version]);

  const {
    collateralValueUsd,
    debtUsd,
    currentLtvPct,
    nominalLtvPct,
    effectiveLtvPct,
    theoreticalBorrowCapacityUsd,
    executableBorrowCapacityUsd,
    remainingCapacityUsd,
    healthFactor,
    riskState,
    domains,
  } = financial;

  // LTV bar geometry
  const ltvWidthPct = Math.min(100, Math.max(0, currentLtvPct));
  const nominalPosPct = nominalLtvPct; // e.g. 70%
  const liqPosPct = 80; // 80%

  return (
    <div
      className={`position-risk-panel ${className || ""}`}
      style={{
        background: "var(--surface-1, #131722)",
        border: "1px solid var(--border, rgba(255, 255, 255, 0.08))",
        borderRadius: "var(--r, 8px)",
        padding: compact ? "12px 14px" : "18px 20px",
        ...style,
      }}
    >
      {/* Top Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "14px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-1)" }}>
            Position Solvency & Risk Ratchet
          </span>
          <span style={{ fontSize: "12px", color: "var(--text-3)" }}>({symbol})</span>
        </div>
        <Pill
          tone={
            riskState === "SAFE"
              ? "success"
              : riskState === "RESTRICTED"
              ? "warning"
              : "danger"
          }
          withDot
        >
          {riskState}
        </Pill>
      </div>

      {/* Primary 4-Metric Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: compact ? "repeat(2, 1fr)" : "repeat(4, 1fr)",
          gap: "12px",
          marginBottom: "16px",
        }}
      >
        <div style={{ padding: "10px", background: "var(--surface-2)", borderRadius: "var(--r-sm, 6px)" }}>
          <div style={{ fontSize: "11px", color: "var(--text-3)", textTransform: "uppercase" }}>
            Collateral Value
          </div>
          <div className="mono" style={{ fontSize: "16px", fontWeight: 750, color: "var(--text-1)", marginTop: "4px" }}>
            ${formatMoney(collateralValueUsd)}
          </div>
        </div>

        <div style={{ padding: "10px", background: "var(--surface-2)", borderRadius: "var(--r-sm, 6px)" }}>
          <div style={{ fontSize: "11px", color: "var(--text-3)", textTransform: "uppercase" }}>
            Outstanding Debt
          </div>
          <div className="mono" style={{ fontSize: "16px", fontWeight: 750, color: debtUsd > 0 ? "var(--warning)" : "var(--text-1)", marginTop: "4px" }}>
            ${formatMoney(debtUsd)}
          </div>
        </div>

        <div style={{ padding: "10px", background: "var(--surface-2)", borderRadius: "var(--r-sm, 6px)" }}>
          <div style={{ fontSize: "11px", color: "var(--text-3)", textTransform: "uppercase" }}>
            Theoretical Capacity
          </div>
          <div className="mono" style={{ fontSize: "16px", fontWeight: 750, color: "var(--text-2)", marginTop: "4px" }}>
            ${formatMoney(theoreticalBorrowCapacityUsd)}
          </div>
        </div>

        <div style={{ padding: "10px", background: "var(--surface-2)", borderRadius: "var(--r-sm, 6px)" }}>
          <div style={{ fontSize: "11px", color: "var(--text-3)", textTransform: "uppercase" }}>
            Executable Capacity
          </div>
          <div
            className="mono"
            style={{
              fontSize: "16px",
              fontWeight: 800,
              color: executableBorrowCapacityUsd > 0 ? "var(--accent)" : "var(--text-3)",
              marginTop: "4px",
            }}
          >
            ${formatMoney(executableBorrowCapacityUsd)}
          </div>
        </div>
      </div>

      {/* LTV & Health Visual Gauge */}
      <div style={{ marginBottom: "14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "6px" }}>
          <span>
            Current LTV: <strong className="mono">{currentLtvPct.toFixed(1)}%</strong>
          </span>
          <span>
            Health Factor:{" "}
            <strong
              className="mono"
              style={{
                color:
                  healthFactor === null || healthFactor >= 1.5
                    ? "var(--success)"
                    : healthFactor >= 1.1
                    ? "var(--warning)"
                    : "var(--danger)",
              }}
            >
              {healthFactor !== null ? healthFactor.toFixed(2) : "Infinite"}
            </strong>
          </span>
        </div>

        {/* LTV Track */}
        <div
          style={{
            position: "relative",
            height: "12px",
            background: "rgba(255, 255, 255, 0.06)",
            borderRadius: "6px",
            overflow: "hidden",
          }}
        >
          {/* Current Debt LTV Bar */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              height: "100%",
              width: `${ltvWidthPct}%`,
              background:
                currentLtvPct > nominalLtvPct
                  ? "var(--danger, #cf8b8b)"
                  : currentLtvPct > 50
                  ? "var(--warning, #cfad74)"
                  : "var(--success, #7fc39a)",
              transition: "width 0.3s ease",
            }}
          />

          {/* Nominal Limit Indicator Line */}
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${nominalPosPct}%`,
              width: "2px",
              background: "rgba(255, 255, 255, 0.4)",
              zIndex: 2,
            }}
            title={`Nominal LTV Limit: ${nominalPosPct}%`}
          />

          {/* Liquidation Threshold Line */}
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${liqPosPct}%`,
              width: "2px",
              background: "var(--danger, #cf8b8b)",
              zIndex: 2,
            }}
            title="Liquidation Threshold: 80%"
          />
        </div>

        {/* Labels under track */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "10.5px",
            color: "var(--text-3)",
            marginTop: "4px",
          }}
        >
          <span>0%</span>
          <span style={{ marginLeft: `${nominalPosPct - 15}%` }}>Limit: {nominalPosPct}%</span>
          <span>Liq: {liqPosPct}%</span>
          <span>100%</span>
        </div>
      </div>

      {/* Disentangled Capacity Explanation Banner */}
      <div
        style={{
          padding: "10px 12px",
          background: "var(--surface-2)",
          borderRadius: "var(--r-sm, 6px)",
          border: "1px solid var(--border)",
          fontSize: "12px",
          lineHeight: 1.5,
          color: "var(--text-2)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
          <strong style={{ color: "var(--text-1)", flex: "none" }}>STATUS:</strong>
          <span>
            {executableBorrowCapacityUsd > 0 ? (
              <>
                Permitted to borrow up to{" "}
                <strong style={{ color: "var(--accent)" }}>
                  ${formatMoney(executableBorrowCapacityUsd)} USDC
                </strong>{" "}
                at {effectiveLtvPct.toFixed(0)}% effective LTV ceiling.
              </>
            ) : domains.referenceMarketState === "CLOSED" ? (
              <>
                Theoretical capacity is ${formatMoney(theoreticalBorrowCapacityUsd)} USDC (70% nominal limit), but
                executable capacity is $0.00 while the NYSE reference market is closed.
              </>
            ) : (
              financial.permission.reason
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
