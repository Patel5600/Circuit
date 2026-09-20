import React, { useMemo, useState } from "react";
import { formatMoney, formatPercent } from "../../lib/format";
import { Pill } from "../ui";

interface RiskSensitivityMatrixProps {
  collateralPriceUsd: number;
  collateralAmountUi: number;
  currentDebtUsd: number;
  liquidationThresholdBps: number;
  tokenSymbol: string;
  quoteSymbol?: string;
}

interface ShockTier {
  shockPct: number;
  shockedPrice: number;
  collateralVal: number;
  projectedLtv: number;
  projectedHf: number;
  ratchetState: "SAFE" | "RESTRICTED" | "DEFENSIVE" | "EMERGENCY";
  bufferUsd: number;
  actionPermitted: string;
}

const SHOCK_TIERS = [-0.05, -0.1, -0.15, -0.2, -0.3, -0.4, -0.5];

export function RiskSensitivityMatrix({
  collateralPriceUsd,
  collateralAmountUi,
  currentDebtUsd,
  liquidationThresholdBps,
  tokenSymbol,
  quoteSymbol = "USDC",
}: RiskSensitivityMatrixProps) {
  const [simulatedExtraBorrow, setSimulatedExtraBorrow] = useState(0);

  const effectiveDebt = currentDebtUsd + simulatedExtraBorrow;
  const ltvThresholdRatio = liquidationThresholdBps / 10000;
  const nominalCollateralVal = collateralPriceUsd * collateralAmountUi;

  const tiers = useMemo<ShockTier[]>(() => {
    return SHOCK_TIERS.map((shock) => {
      const shockedPrice = Math.max(0.01, collateralPriceUsd * (1 + shock));
      const collateralVal = shockedPrice * collateralAmountUi;
      const debt = Math.max(1, effectiveDebt);

      const projectedLtv = collateralVal > 0 ? (debt / collateralVal) * 100 : 999;
      const projectedHf = collateralVal > 0 ? (collateralVal * ltvThresholdRatio) / debt : 0;

      // Determine Circuit Ratchet State
      let ratchetState: "SAFE" | "RESTRICTED" | "DEFENSIVE" | "EMERGENCY" = "SAFE";
      let actionPermitted = "Full Execution (Borrow / Repay / Liquidate)";

      if (projectedHf < 1.0) {
        ratchetState = "EMERGENCY";
        actionPermitted = "Exit Liquidity / Emergency Recovery Only";
      } else if (projectedHf < 1.15) {
        ratchetState = "DEFENSIVE";
        actionPermitted = "Repayment Only (New Borrow Blocked)";
      } else if (projectedHf < 1.35) {
        ratchetState = "RESTRICTED";
        actionPermitted = "50% Throttled Borrow Cap";
      }

      // Buffer distance in USD until liquidation (HF = 1.0)
      const minCollateralForSolvency = debt / ltvThresholdRatio;
      const bufferUsd = Math.max(0, collateralVal - minCollateralForSolvency);

      return {
        shockPct: shock,
        shockedPrice,
        collateralVal,
        projectedLtv,
        projectedHf,
        ratchetState,
        bufferUsd,
        actionPermitted,
      };
    });
  }, [collateralPriceUsd, collateralAmountUi, effectiveDebt, ltvThresholdRatio]);

  if (nominalCollateralVal <= 0) {
    return (
      <div
        style={{
          padding: "16px 20px",
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r, 10px)",
          color: "var(--text-3)",
          fontSize: 12.5,
          fontFamily: "var(--mono)",
        }}
      >
        NO {tokenSymbol} COLLATERAL DEPOSITED — DEPOSIT TO GENERATE QUANTITATIVE SENSITIVITY MATRIX
      </div>
    );
  }

  return (
    <div
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r, 12px)",
        padding: "18px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {/* Header with Title and Interactive Simulator Slider */}
      <div className="row between g-14 wrap" style={{ alignItems: "center" }}>
        <div>
          <div className="row g-8" style={{ alignItems: "center" }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "var(--forest, #444F24)",
                display: "inline-block",
              }}
            />
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", color: "var(--text-1)" }}>
              PORTFOLIO SENSITIVITY STRESS MATRIX ({tokenSymbol})
            </span>
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 2 }}>
            Simulates systematic asset price drops against on-chain Circuit Ratchet policy triggers.
          </div>
        </div>

        {/* Extra Borrow Simulator Slider */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "var(--surface-3)",
            padding: "6px 12px",
            borderRadius: 8,
            border: "1px solid var(--border)",
          }}
        >
          <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--text-2)" }}>
            STRESS TEST EXTRA DEBT:
          </span>
          <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)" }}>
            +${simulatedExtraBorrow.toLocaleString()} {quoteSymbol}
          </span>
          <input
            type="range"
            min={0}
            max={Math.max(5000, Math.round(nominalCollateralVal * 0.4))}
            step={500}
            value={simulatedExtraBorrow}
            onChange={(e) => setSimulatedExtraBorrow(Number(e.target.value))}
            style={{ width: 90, accentColor: "var(--accent)", cursor: "pointer" }}
            aria-label="Simulate additional debt"
          />
        </div>
      </div>

      {/* Structured Technical Table */}
      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 12,
            fontFamily: "var(--mono)",
            textAlign: "left",
          }}
        >
          <thead>
            <tr
              style={{
                borderBottom: "1.5px solid var(--border-strong)",
                color: "var(--text-3)",
                fontSize: 10.5,
                letterSpacing: "0.04em",
              }}
            >
              <th style={{ padding: "8px 10px" }}>PRICE SHOCK</th>
              <th style={{ padding: "8px 10px" }}>ASSET PRICE</th>
              <th style={{ padding: "8px 10px" }}>COLLATERAL VAL</th>
              <th style={{ padding: "8px 10px" }}>PROJECTED LTV</th>
              <th style={{ padding: "8px 10px" }}>HEALTH FACTOR</th>
              <th style={{ padding: "8px 10px" }}>LIQ BUFFER</th>
              <th style={{ padding: "8px 10px" }}>RATCHET REGIME</th>
              <th style={{ padding: "8px 10px" }}>POLICY PERMISSION</th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((t) => {
              const isDanger = t.ratchetState === "EMERGENCY" || t.ratchetState === "DEFENSIVE";
              const isWarning = t.ratchetState === "RESTRICTED";

              return (
                <tr
                  key={t.shockPct}
                  style={{
                    borderBottom: "1px solid var(--border)",
                    transition: "background 0.1s ease",
                    background:
                      t.ratchetState === "EMERGENCY"
                        ? "rgba(122, 46, 30, 0.05)"
                        : t.ratchetState === "DEFENSIVE"
                        ? "rgba(138, 100, 0, 0.04)"
                        : "transparent",
                  }}
                >
                  <td style={{ padding: "9px 10px", fontWeight: 700, color: "var(--text-1)" }}>
                    {(t.shockPct * 100).toFixed(0)}%
                  </td>
                  <td style={{ padding: "9px 10px", color: "var(--text-2)" }}>
                    ${t.shockedPrice.toFixed(2)}
                  </td>
                  <td style={{ padding: "9px 10px", color: "var(--text-2)" }}>
                    ${formatMoney(t.collateralVal)}
                  </td>
                  <td
                    style={{
                      padding: "9px 10px",
                      fontWeight: 600,
                      color: isDanger ? "var(--danger)" : isWarning ? "var(--warning)" : "var(--text-1)",
                    }}
                  >
                    {t.projectedLtv.toFixed(1)}%
                  </td>
                  <td
                    style={{
                      padding: "9px 10px",
                      fontWeight: 750,
                      color:
                        t.projectedHf >= 1.35
                          ? "var(--success)"
                          : t.projectedHf >= 1.0
                          ? "var(--warning)"
                          : "var(--danger)",
                    }}
                  >
                    {t.projectedHf > 99 ? ">99.0" : t.projectedHf.toFixed(2)}
                  </td>
                  <td style={{ padding: "9px 10px", color: "var(--text-2)" }}>
                    ${formatMoney(t.bufferUsd)}
                  </td>
                  <td style={{ padding: "9px 10px" }}>
                    <Pill
                      tone={
                        t.ratchetState === "SAFE"
                          ? "success"
                          : t.ratchetState === "RESTRICTED"
                          ? "warning"
                          : "danger"
                      }
                      withDot
                    >
                      {t.ratchetState}
                    </Pill>
                  </td>
                  <td
                    style={{
                      padding: "9px 10px",
                      fontSize: 11,
                      color: isDanger ? "var(--danger)" : "var(--text-3)",
                    }}
                  >
                    {t.actionPermitted}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footnote on Invariant Proof */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 10.5,
          fontFamily: "var(--mono)",
          color: "var(--text-3)",
          borderTop: "1px solid var(--border)",
          paddingTop: 8,
        }}
      >
        <span>
          LIQUIDATION TRIGGER BOUNDARY: LTV &gt; {formatPercent(liquidationThresholdBps)} (HF &lt; 1.000)
        </span>
        <span>ENFORCED IMMUTABLY BY ON-CHAIN PERMISSION ENGINE</span>
      </div>
    </div>
  );
}
