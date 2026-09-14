import React from "react";
import { Card, Pill, Icon } from "../ui";
import { formatMoney } from "../../lib/format";

export interface WhyBorrowPowerChangedProps {
  borrowPowerDiffUsd: number;
  causalExplanations: {
    title: string;
    description: string;
    impactBps: number;
    impactUsd: number;
    targetNode: "ASSETS" | "RISK_FACTORS" | "PORTFOLIO" | "CREDIT" | "PERMISSIONS";
  }[];
  onSelectDriver?: (targetNode: string) => void;
}

export function WhyBorrowPowerChanged({
  borrowPowerDiffUsd,
  causalExplanations,
  onSelectDriver,
}: WhyBorrowPowerChangedProps) {
  if (causalExplanations.length === 0) {
    return (
      <Card title="Why Your Borrow Power Changed">
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "rgba(127, 195, 154, 0.1)",
              border: "1px solid rgba(127, 195, 154, 0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--success, #7fc39a)",
            }}
          >
            <Icon name="check" size={14} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
              Optimal Portfolio Configuration
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 2 }}>
              No risk haircuts active. Full collateral borrowing power is unlocked under Risk Ratchet.
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card
      title="Why Your Borrow Power Changed"
      action={
        <Pill tone="warning">
          Haircut: -${formatMoney(Math.abs(borrowPowerDiffUsd))}
        </Pill>
      }
    >
      <p style={{ fontSize: 12.5, color: "var(--text-3)", margin: "0 0 14px 0", lineHeight: 1.5 }}>
        Circuit continuously turns portfolio risk into exact borrowing capacity. Click any risk condition below to trace its causal path in the Portfolio Risk Graph:
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {causalExplanations.map((exp, idx) => (
          <div
            key={idx}
            onClick={() => onSelectDriver?.(exp.targetNode)}
            style={{
              padding: "10px 14px",
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              transition: "all 150ms ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--accent, #eceae6)";
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.02)";
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div style={{ marginTop: 2, color: "var(--warning, #cfad74)" }}>
                <Icon name="shield" size={15} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 650, color: "var(--text)" }}>
                  {exp.title}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 2 }}>
                  {exp.description}
                </div>
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color: "var(--danger, #cf8b8b)" }}>
                -${formatMoney(Math.abs(exp.impactUsd))}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2 }}>
                {exp.impactBps} bps LTV
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
