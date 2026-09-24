import React, { useMemo } from "react";

export interface MetricCardsProps {
  collateralValueUsd: number;
  debtUsd: number;
  healthFactor: number | null;
  ltvBps?: number;
  borrowCapacityUsd?: number;
  collateralDelta24h?: number;
  loading?: boolean;
}

export function MetricCards({
  collateralValueUsd,
  debtUsd,
  healthFactor,
  ltvBps = 0,
  borrowCapacityUsd = 0,
  collateralDelta24h = 0,
  loading = false,
}: MetricCardsProps) {
  const hfStatus = useMemo(() => {
    if (healthFactor === null || healthFactor === undefined) return { label: "No Debt", color: "var(--ok)" };
    if (healthFactor < 1.0) return { label: "Liquidatable", color: "var(--bad)" };
    if (healthFactor < 1.15) return { label: "At Risk", color: "var(--bad)" };
    if (healthFactor < 1.5) return { label: "Watch", color: "var(--warn)" };
    return { label: "Healthy", color: "var(--ok)" };
  }, [healthFactor]);

  const ltvPercent = useMemo(() => {
    if (collateralValueUsd <= 0) return 0;
    return Math.min(100, Math.max(0, (debtUsd / collateralValueUsd) * 100));
  }, [debtUsd, collateralValueUsd]);

  // Health ring calculation (strokeDashoffset based on max ~2.5)
  const ringOffset = useMemo(() => {
    if (healthFactor === null || healthFactor === undefined) return 0;
    const clamped = Math.min(2.5, Math.max(0, healthFactor));
    return 144.5 * (1 - clamped / 2.5);
  }, [healthFactor]);

  // Per-card readiness checks — show real numbers immediately if data is present
  const isColLoading = loading && collateralValueUsd === 0;
  const isDebtLoading = loading && debtUsd === 0 && collateralValueUsd === 0;
  const isHfLoading = loading && healthFactor === undefined && collateralValueUsd === 0;

  return (
    <div className="stats">
      {/* 1. Collateral Value */}
      <div
        className={`card stat ${isColLoading ? "loading" : ""}`}
        style={{ height: 150, padding: "16px 20px", boxSizing: "border-box" }}
      >
        <span className="meta">
          (Circuit)<b>Collateral value</b>
        </span>

        <div className="skel">
          <div className="sk h1" />
          <div className="sk h2" />
        </div>

        <svg className="spark" viewBox="0 0 84 34" aria-hidden="true">
          <path d="M2 26 L12 23 L22 27 L33 17 L44 21 L55 12 L66 16 L82 5" />
        </svg>

        <div className="body">
          <div className="big">
            ${collateralValueUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="sub">
            <span className={`delta ${collateralDelta24h < 0 ? "dn" : "up"}`}>
              {collateralDelta24h >= 0 ? "+" : "−"}
              {Math.abs(collateralDelta24h).toFixed(1)}%
            </span>
            <span>24h change</span>
          </div>
        </div>
      </div>

      {/* 2. Borrowed / Debt */}
      <div
        className={`card stat ${isDebtLoading ? "loading" : ""}`}
        style={{ height: 150, padding: "16px 20px", boxSizing: "border-box" }}
      >
        <span className="meta">
          (Circuit)<b>Borrowed</b>
        </span>

        <div className="skel">
          <div className="sk h1" />
          <div className="sk h2" />
        </div>

        <div className="body">
          <div className="big">
            ${debtUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="sub">
            <span>{debtUsd === 0 ? "No active debt" : `${ltvPercent.toFixed(1)}% of collateral`}</span>
          </div>
          <div className="util">
            <i style={{ width: `${Math.min(100, ltvPercent)}%` }} />
          </div>
        </div>
      </div>

      {/* 3. Health Factor */}
      <div
        className={`card stat ${isHfLoading ? "loading" : ""}`}
        style={{ height: 150, padding: "16px 20px", boxSizing: "border-box" }}
      >
        <span className="meta">
          (Circuit)<b>Health</b>
        </span>

        <div className="skel">
          <div className="sk h1" />
          <div className="sk h2" />
        </div>

        <svg className="dial-mini" viewBox="0 0 58 58" aria-hidden="true">
          <circle className="bgc" cx="29" cy="29" r="23" />
          <circle
            className="fgc"
            cx="29"
            cy="29"
            r="23"
            strokeDasharray="144.5"
            strokeDashoffset={ringOffset}
            style={{ stroke: hfStatus.color }}
          />
        </svg>

        <div className="body">
          <div className="big">
            {healthFactor !== null && healthFactor !== undefined
              ? healthFactor.toFixed(2)
              : "∞"}
          </div>
          <div className="sub">
            <span style={{ color: hfStatus.color, fontWeight: 600 }}>
              {hfStatus.label}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
