import React from "react";
import { Card, Icon, Pill, Tone } from "../ui";

interface PermissionRow {
  action: string;
  allowed: boolean;
  reason?: string;
  alwaysAllowed?: boolean;
}

export interface RiskPermissionsProps {
  borrowAllowed: boolean;
  borrowBlockers: string[];
  withdrawAllowed: boolean;
  withdrawReason?: string;
  liquidationActive: boolean;
  healthFactorBps: number | null;
}

export function RiskPermissions({
  borrowAllowed,
  borrowBlockers,
  withdrawAllowed,
  withdrawReason,
  liquidationActive,
  healthFactorBps,
}: RiskPermissionsProps) {
  const rows: PermissionRow[] = [
    {
      action: "Borrow",
      allowed: borrowAllowed,
      reason: borrowBlockers.length > 0 ? borrowBlockers[0] : undefined,
    },
    {
      action: "Withdraw",
      allowed: withdrawAllowed,
      reason: withdrawReason,
    },
    {
      action: "Repay",
      allowed: true,
      alwaysAllowed: true,
    },
    {
      action: "Liquidation",
      allowed: !liquidationActive,
      reason: liquidationActive
        ? `Health factor below safety threshold${
            healthFactorBps !== null
              ? ` (${(healthFactorBps / 10_000).toFixed(2)})`
              : ""
          }`
        : undefined,
    },
  ];

  return (
    <Card
      title="Risk Permissions"
      action={
        <span
          style={{
            fontSize: 11,
            fontFamily: "var(--mono)",
            color: "var(--text-3)",
          }}
        >
          What actions is this wallet trusted to perform?
        </span>
      }
    >
      <div style={{ display: "grid", gap: 2 }}>
        {rows.map((row) => {
          const tone: Tone = row.alwaysAllowed
            ? "success"
            : row.allowed
            ? "success"
            : row.action === "Liquidation"
            ? row.allowed
              ? "neutral"
              : "danger"
            : "danger";

          return (
            <div
              key={row.action}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                borderRadius: 8,
                background:
                  !row.allowed && !row.alwaysAllowed
                    ? "rgba(224, 108, 108, 0.04)"
                    : "transparent",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 7,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background:
                      tone === "success"
                        ? "rgba(127, 195, 154, 0.1)"
                        : tone === "danger"
                        ? "rgba(224, 108, 108, 0.1)"
                        : "var(--surface-3)",
                    color:
                      tone === "success"
                        ? "var(--success)"
                        : tone === "danger"
                        ? "var(--danger)"
                        : "var(--text-3)",
                    flexShrink: 0,
                  }}
                >
                  <Icon
                    name={
                      row.action === "Borrow"
                        ? "borrow"
                        : row.action === "Withdraw"
                        ? "withdraw"
                        : row.action === "Repay"
                        ? "repay"
                        : "alert"
                    }
                    size={15}
                  />
                </span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {row.action}
                  </div>
                  {row.reason && (
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-3)",
                        marginTop: 1,
                        maxWidth: 340,
                      }}
                    >
                      {row.reason}
                    </div>
                  )}
                </div>
              </div>

              <Pill tone={tone}>
                {row.alwaysAllowed
                  ? "Always Allowed"
                  : row.action === "Liquidation"
                  ? row.allowed
                    ? "Not Active"
                    : "⚠ Active"
                  : row.allowed
                  ? "✓ Allowed"
                  : "✗ Blocked"}
              </Pill>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
