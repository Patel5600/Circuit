/**
 * Circuit Protocol - Permission Explanation Drawer
 *
 * Explains causal on-chain invariants for allowed, restricted, or blocked protocol actions.
 */

import React from "react";
import { Drawer } from "../ui/Drawer";
import { PermissionDetail, OperationPermission } from "../../lib/domain/types";
import { Pill, Button } from "../ui";

export function PermissionDrawer({
  actionName,
  permission,
  open,
  onClose,
}: {
  actionName: string;
  permission: PermissionDetail | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!permission) return null;

  const tone =
    permission.status === "ALLOWED"
      ? "success"
      : permission.status === "RESTRICTED"
      ? "warning"
      : permission.status === "BLOCKED"
      ? "danger"
      : "neutral";

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`${actionName} Permission`}
      subtitle="On-Chain Access Control & Invariants"
      badge={<Pill tone={tone} withDot>{permission.status}</Pill>}
    >
      <div className="stack g-16">
        {/* Status Card */}
        <div
          style={{
            padding: 16,
            background: "var(--surface-2, #0d0f15)",
            borderRadius: "var(--r, 10px)",
            border: "1px solid var(--border, #1a1d26)",
          }}
        >
          <div className="row between g-8" style={{ alignItems: "center" }}>
            <span className="t-label">Active State</span>
            <Pill tone={tone}>{permission.status}</Pill>
          </div>

          <div style={{ marginTop: 12, fontSize: 13.5, color: "var(--text)", lineHeight: 1.5 }}>
            {permission.reason ??
              `The ${actionName} operation is currently ${permission.status.toLowerCase()} by on-chain consensus.`}
          </div>
        </div>

        {/* Architectural Explanation */}
        <div
          className="stack g-10"
          style={{
            padding: 16,
            background: "var(--surface-2, #0d0f15)",
            borderRadius: "var(--r, 10px)",
            border: "1px solid var(--border, #1a1d26)",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-3)" }}>
            CIRCUIT ON-CHAIN PERMISSION RULES
          </div>

          <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.5 }}>
            {actionName.toLowerCase() === "borrow" && (
              <>
                Borrow permissions are continuously modulated by the <strong>Risk Ratchet</strong>:
                <ul style={{ margin: "8px 0 0 16px", padding: 0 }}>
                  <li><strong>SAFE:</strong> 100% credit capacity available.</li>
                  <li><strong>RESTRICTED:</strong> Borrow limit constrained by confidence haircuts.</li>
                  <li><strong>DEFENSIVE / EMERGENCY:</strong> All new debt creation is strictly blocked on-chain.</li>
                </ul>
              </>
            )}

            {actionName.toLowerCase() === "withdraw" && (
              <>
                Collateral withdrawals are governed by <strong>Solvency Invariants</strong>:
                <ul style={{ margin: "8px 0 0 16px", padding: 0 }}>
                  <li>Withdrawals are permitted only if post-action Health Factor remains &ge; 1.00.</li>
                  <li>During <strong>DEFENSIVE</strong> or <strong>EMERGENCY</strong> states, withdrawals are restricted to protect quote liquidity pools.</li>
                </ul>
              </>
            )}

            {actionName.toLowerCase() === "repay" && (
              <>
                Repayment is <strong>unconditionally permissionless</strong>. Users can always reduce debt and improve their position Health Factor even if the market is halted or in emergency state.
              </>
            )}

            {actionName.toLowerCase() === "deposit" && (
              <>
                Collateral deposits are <strong>always permitted</strong>. Adding equity increases pool solvency and immediately lowers overall account leverage.
              </>
            )}
          </div>
        </div>

        <Button variant="secondary" onClick={onClose} style={{ marginTop: 8 }}>
          Dismiss
        </Button>
      </div>
    </Drawer>
  );
}
