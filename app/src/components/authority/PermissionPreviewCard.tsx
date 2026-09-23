/**
 * Circuit Protocol - Permission Preview Card
 *
 * Exposes a concise, protocol-authoritative permission preview before submission.
 * Satisfies Section 38 of Circuit specification:
 * Shows ACTION, ASSET, AMOUNT, ACTOR, AUTHORITY, RISK STATE, RESULT, and REASON.
 */

import React from "react";
import { Card, Pill, Icon } from "../ui";
import { ProtocolAction, ActorType, RiskRatchetState, PermissionResult } from "../../lib/permission-engine";
import { formatMoney, humanizeReasonCode } from "../../lib/format";

export function PermissionPreviewCard({
  action,
  assetSymbol,
  amountUsd,
  actor,
  authorityStatus,
  riskState,
  policy,
  limit,
  result,
}: {
  action: ProtocolAction;
  assetSymbol: string;
  amountUsd?: number;
  actor?: ActorType;
  authorityStatus: string;
  riskState: RiskRatchetState;
  policy?: string;
  limit?: string;
  result: PermissionResult;
}) {
  const isAllowed = result.allowed;
  const resultTone = isAllowed ? "success" : "danger";
  const riskTone =
    riskState === "SAFE"
      ? "success"
      : riskState === "RESTRICTED"
      ? "warning"
      : "danger";

  // Canonical policy label fallback
  const displayPolicy =
    policy ||
    (riskState === "SAFE"
      ? "Standard Capital Policy (Max LTV 65%)"
      : riskState === "RESTRICTED"
      ? "Restricted Volatility Policy (Max LTV 40%)"
      : "Defensive Preservation Policy (0% New Debt)");

  // Canonical limit label fallback
  const displayLimit =
    limit ||
    (amountUsd && amountUsd > 0
      ? `$${formatMoney(amountUsd)}`
      : riskState === "DEFENSIVE" || riskState === "EMERGENCY"
      ? "$0.00 (Risk Blocked)"
      : "Ratchet Constrained");

  return (
    <div
      style={{
        padding: 14,
        background: "var(--surface-2)",
        border: `1px solid ${isAllowed ? "var(--border)" : "rgba(207, 139, 139, 0.4)"}`,
        borderRadius: "var(--r-sm, 6px)",
      }}
      className="stack g-10"
    >
      <div className="row between g-8" style={{ alignItems: "center" }}>
        <span
          style={{
            fontSize: 11,
            fontFamily: "var(--mono)",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--text-3)",
          }}
        >
          CIRCUIT PROTOCOL PERMISSION EVALUATOR (7-ATTRIBUTE PROOF)
        </span>
        <Pill tone={resultTone} withDot>
          {isAllowed ? "ALLOWED" : "BLOCKED"}
        </Pill>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
          gap: "8px 12px",
          fontSize: 12,
        }}
      >
        {/* 1. ACTION */}
        <div>
          <div style={{ color: "var(--text-3)", fontSize: 10, fontFamily: "var(--mono)" }}>1. ACTION</div>
          <div style={{ fontWeight: 700, textTransform: "uppercase" }}>{action}</div>
        </div>

        {/* 2. ASSET */}
        <div>
          <div style={{ color: "var(--text-3)", fontSize: 10, fontFamily: "var(--mono)" }}>2. ASSET</div>
          <div style={{ fontWeight: 700 }}>{assetSymbol}</div>
        </div>

        {/* 3. RISK */}
        <div>
          <div style={{ color: "var(--text-3)", fontSize: 10, fontFamily: "var(--mono)" }}>3. RISK</div>
          <div>
            <Pill tone={riskTone}>{riskState}</Pill>
          </div>
        </div>

        {/* 4. POLICY */}
        <div>
          <div style={{ color: "var(--text-3)", fontSize: 10, fontFamily: "var(--mono)" }}>4. POLICY</div>
          <div style={{ fontWeight: 600, fontSize: 11, color: "var(--text-2)" }} title={displayPolicy}>
            {displayPolicy}
          </div>
        </div>

        {/* 5. AUTHORITY */}
        <div>
          <div style={{ color: "var(--text-3)", fontSize: 10, fontFamily: "var(--mono)" }}>5. AUTHORITY</div>
          <div style={{ fontWeight: 650, color: actor === "AGENT" ? "var(--accent)" : "var(--text-1)" }}>
            {authorityStatus}
          </div>
        </div>

        {/* 6. LIMIT */}
        <div>
          <div style={{ color: "var(--text-3)", fontSize: 10, fontFamily: "var(--mono)" }}>6. LIMIT</div>
          <div style={{ fontWeight: 700, fontFamily: "var(--mono)", fontSize: 11.5 }}>
            {displayLimit}
          </div>
        </div>

        {/* 7. RESULT */}
        <div>
          <div style={{ color: "var(--text-3)", fontSize: 10, fontFamily: "var(--mono)" }}>7. RESULT</div>
          <div style={{ fontWeight: 700, color: isAllowed ? "var(--success)" : "var(--danger)" }}>
            {isAllowed ? "PERMITTED" : "REJECTED"}
          </div>
        </div>
      </div>

      {!isAllowed && (
        <div
          style={{
            marginTop: 4,
            padding: "8px 10px",
            background: "rgba(207, 139, 139, 0.1)",
            border: "1px solid rgba(207, 139, 139, 0.25)",
            borderRadius: "var(--r-sm, 4px)",
            fontSize: 11.5,
            color: "var(--danger)",
            lineHeight: 1.4,
          }}
        >
          <strong>Policy:</strong> <span style={{ color: "var(--danger)", fontWeight: 600 }}>{humanizeReasonCode(result.reasonCode)}</span>
          {result.message && <div style={{ marginTop: 2, color: "var(--text-2)" }}>{result.message.replace(/_/g, " ")}</div>}
        </div>
      )}
    </div>
  );
}
