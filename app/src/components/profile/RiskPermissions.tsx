import React from "react";
import { Card, Icon, Pill, Tone } from "../ui";

interface PermissionRow {
  action: string;
  allowed: boolean;
  statusText?: string;
  tone?: Tone;
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
  riskState?: "SAFE" | "RESTRICTED" | "DEFENSIVE" | "EMERGENCY";
}

export function RiskPermissions({
  borrowAllowed,
  borrowBlockers,
  withdrawAllowed,
  withdrawReason,
  liquidationActive,
  healthFactorBps,
  riskState = "SAFE",
}: RiskPermissionsProps) {
  const isEmergency = riskState === "EMERGENCY";
  const isRestricted = riskState === "RESTRICTED" || riskState === "DEFENSIVE";

  const isNoCollateral = borrowBlockers.some((b) => b.toLowerCase().includes("no collateral"));

  const borrowStatus = borrowAllowed
    ? "ALLOWED"
    : isRestricted
    ? "RESTRICTED"
    : "BLOCKED";

  const borrowTone: Tone = borrowAllowed
    ? "success"
    : isRestricted
    ? "warning"
    : "danger";

  const withdrawStatus = withdrawAllowed
    ? "ALLOWED"
    : isEmergency
    ? "BLOCKED"
    : "RESTRICTED";

  const dbcAllowed = riskState === "SAFE";
  const dbcStatus = riskState === "SAFE" ? "ALLOWED" : riskState === "RESTRICTED" ? "CAPPED" : "BLOCKED";
  const dbcTone: Tone = riskState === "SAFE" ? "success" : riskState === "RESTRICTED" ? "warning" : "danger";
  const dbcReason =
    riskState === "SAFE"
      ? "Meteora DBC virtual pool swaps and entries permitted at 100% capacity"
      : riskState === "RESTRICTED"
      ? "Meteora DBC volume capped to 50% capacity with 100 bps max slippage"
      : "Trading venue entries and swaps suspended to defend protocol liquidity";

  const agentActive = riskState === "SAFE" || riskState === "RESTRICTED";
  const agentStatus = riskState === "SAFE" ? "ACTIVE" : riskState === "RESTRICTED" ? "ADAPTIVE" : "PAUSED BY POLICY";
  const agentTone: Tone = riskState === "SAFE" ? "success" : riskState === "RESTRICTED" ? "warning" : "danger";
  const agentReason =
    riskState === "SAFE"
      ? "Autonomous agent may execute bounded actions within delegated authority limits"
      : riskState === "RESTRICTED"
      ? "Agent execution active with adaptive risk caps (50% borrow and DBC limits)"
      : `Risk-increasing agent execution paused by ${riskState} Capital Policy`;

  const rows: PermissionRow[] = [
    {
      action: "Borrow",
      allowed: borrowAllowed,
      statusText: borrowStatus,
      tone: borrowTone,
      reason:
        borrowBlockers.length > 0
          ? borrowBlockers[0]
          : !borrowAllowed
          ? isEmergency
            ? "Blocked by Hard Risk: Stale oracle or custody settlement halt"
            : "Capacity restricted by Risk Ratchet (Concentration penalty active)"
          : "Full capacity unlocked under active risk posture",
    },
    {
      action: "New DBC Exposure",
      allowed: dbcAllowed,
      statusText: dbcStatus,
      tone: dbcTone,
      reason: dbcReason,
    },
    {
      action: "Repay",
      allowed: true,
      alwaysAllowed: true,
      statusText: "ALLOWED",
      tone: "success",
      reason: "Deleveraging paths remain unconditionally open under all protocol states",
    },
    {
      action: "Recovery / Exit Liquidity",
      allowed: true,
      alwaysAllowed: true,
      statusText: "ALLOWED",
      tone: "success",
      reason: "Capital exit and emergency deleveraging remain available across all risk states",
    },
    {
      action: "Withdraw",
      allowed: withdrawAllowed,
      statusText: withdrawStatus,
      tone: withdrawAllowed ? "success" : "danger",
      reason: withdrawReason || (withdrawAllowed ? "Withdrawals permitted while position remains solvent" : isEmergency ? "Risk-increasing withdrawals halted in Emergency state" : "No deposited collateral to withdraw"),
    },
    {
      action: "Agent Execution",
      allowed: agentActive,
      statusText: agentStatus,
      tone: agentTone,
      reason: agentReason,
    },
    {
      action: "Deposit",
      allowed: true,
      alwaysAllowed: true,
      statusText: "ALLOWED",
      tone: "success",
      reason: "Equity collateral deposits always permitted to improve account solvency",
    },
  ];

  return (
    <Card
      title="Current Permissions"
      action={
        <span
          style={{
            fontSize: 11,
            fontFamily: "var(--mono)",
            color: "var(--text-3)",
          }}
        >
          Direct on-chain protocol state enforcement
        </span>
      }
    >
      <div style={{ display: "grid", gap: 6 }}>
        {rows.map((row) => {
          const tone = row.tone || "neutral";

          return (
            <div
              key={row.action}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "11px 14px",
                borderRadius: 8,
                background:
                  !row.allowed && !row.alwaysAllowed
                    ? tone === "danger"
                      ? "rgba(224, 108, 108, 0.06)"
                      : "rgba(207, 173, 116, 0.06)"
                    : "rgba(255, 255, 255, 0.02)",
                border: "1px solid var(--border)",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background:
                      tone === "success"
                        ? "rgba(127, 195, 154, 0.12)"
                        : tone === "warning"
                        ? "rgba(207, 173, 116, 0.12)"
                        : tone === "danger"
                        ? "rgba(224, 108, 108, 0.12)"
                        : "var(--surface-3)",
                    color:
                      tone === "success"
                        ? "var(--success)"
                        : tone === "warning"
                        ? "var(--warning)"
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
                  <div style={{ fontWeight: 650, fontSize: 14 }}>
                    {row.action}
                  </div>
                  {row.reason && (
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-3)",
                        marginTop: 2,
                        maxWidth: 420,
                      }}
                    >
                      {row.reason}
                    </div>
                  )}
                </div>
              </div>

              <Pill tone={tone}>
                {row.statusText || (row.allowed ? "✓ Allowed" : "✗ Blocked")}
              </Pill>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
