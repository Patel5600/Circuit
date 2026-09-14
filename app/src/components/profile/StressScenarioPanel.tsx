import React from "react";
import { Card, Pill } from "../ui";
import { formatMoney } from "../../lib/format";
import { calculateStressScenarios } from "../../lib/risk/portfolio";

export interface StressScenarioPanelProps {
  totalCollateralUsd: number;
  totalDebtUsd: number;
  baseLtvBps: number;
  liqThresholdBps: number;
}

export function StressScenarioPanel({
  totalCollateralUsd,
  totalDebtUsd,
  baseLtvBps,
  liqThresholdBps,
}: StressScenarioPanelProps) {
  const scenarios = calculateStressScenarios(
    totalCollateralUsd,
    totalDebtUsd,
    baseLtvBps,
    liqThresholdBps
  );

  return (
    <Card
      title="Portfolio Stress Simulation"
      action={
        <Pill tone="neutral">
          SIMULATION / PREVIEW
        </Pill>
      }
    >
      <p style={{ fontSize: 12.5, color: "var(--text-3)", margin: "0 0 14px 0", lineHeight: 1.5 }}>
        Deterministic preview of portfolio metrics under sudden equity gap-downs. Evaluates how collateral degradation modulates Health Factor and Risk Ratchet states.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 12,
        }}
      >
        {scenarios.map((sc) => (
          <div
            key={sc.dropLabel}
            style={{
              padding: "14px 16px",
              background: "rgba(255, 255, 255, 0.02)",
              border: `1px solid ${
                sc.isLiquidatable
                  ? "rgba(207, 139, 139, 0.4)"
                  : "var(--border)"
              }`,
              borderRadius: 8,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div className="row between" style={{ alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "var(--mono)", color: "var(--text)" }}>
                Market Gap: {sc.dropLabel}
              </span>
              <Pill
                tone={
                  sc.projectedState === "SAFE"
                    ? "success"
                    : sc.projectedState === "EMERGENCY"
                    ? "danger"
                    : "warning"
                }
                withDot
              >
                {sc.projectedState}
              </Pill>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "var(--text-3)" }}>Stressed Collateral</span>
              <span style={{ fontFamily: "var(--mono)", fontWeight: 600 }}>
                ${formatMoney(sc.stressedCollateral)}
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "var(--text-3)" }}>Projected Capacity</span>
              <span style={{ fontFamily: "var(--mono)", fontWeight: 600 }}>
                ${formatMoney(sc.stressedCapacity)}
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "var(--text-3)" }}>Projected Health Factor</span>
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontWeight: 700,
                  color:
                    sc.stressedHf === null
                      ? "var(--text-2)"
                      : sc.stressedHf < 1.0
                      ? "var(--danger, #cf8b8b)"
                      : sc.stressedHf < 1.5
                      ? "var(--warning, #cfad74)"
                      : "var(--success, #7fc39a)",
                }}
              >
                {sc.stressedHf !== null ? sc.stressedHf.toFixed(2) : "No debt"}
              </span>
            </div>

            {sc.isLiquidatable && (
              <div
                style={{
                  fontSize: 11,
                  color: "var(--danger, #cf8b8b)",
                  marginTop: 4,
                  fontWeight: 600,
                }}
              >
                ⚠️ Collateral breach: Position liquidatable under gap down.
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
