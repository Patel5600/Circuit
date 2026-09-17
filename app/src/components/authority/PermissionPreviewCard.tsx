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
import { formatMoney } from "../../lib/format";

export function PermissionPreviewCard({
  action,
  assetSymbol,
  amountUsd,
  actor,
  authorityStatus,
  riskState,
  result,
}: {
  action: ProtocolAction;
  assetSymbol: string;
  amountUsd: number;
  actor: ActorType;
  authorityStatus: string;
  riskState: RiskRatchetState;
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
          CIRCUIT PROTOCOL PERMISSION PREVIEW
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
        <div>
          <div style={{ color: "var(--text-3)", fontSize: 10, fontFamily: "var(--mono)" }}>ACTION</div>
          <div style={{ fontWeight: 700, textTransform: "uppercase" }}>{action}</div>
        </div>
        <div>
          <div style={{ color: "var(--text-3)", fontSize: 10, fontFamily: "var(--mono)" }}>ASSET</div>
          <div style={{ fontWeight: 700 }}>{assetSymbol}x</div>
        </div>
        <div>
          <div style={{ color: "var(--text-3)", fontSize: 10, fontFamily: "var(--mono)" }}>AMOUNT</div>
          <div style={{ fontWeight: 700, fontFamily: "var(--mono)" }}>
            {amountUsd > 0 ? `$${formatMoney(amountUsd)}` : "—"}
          </div>
        </div>
        <div>
          <div style={{ color: "var(--text-3)", fontSize: 10, fontFamily: "var(--mono)" }}>ACTOR</div>
          <div style={{ fontWeight: 650, color: actor === "AGENT" ? "var(--accent)" : "var(--text-1)" }}>
            {actor === "AGENT" ? "AGENT" : "HUMAN (OWNER)"}
          </div>
        </div>
        <div>
          <div style={{ color: "var(--text-3)", fontSize: 10, fontFamily: "var(--mono)" }}>AUTHORITY</div>
          <div style={{ fontWeight: 650 }}>{authorityStatus}</div>
        </div>
        <div>
          <div style={{ color: "var(--text-3)", fontSize: 10, fontFamily: "var(--mono)" }}>RISK STATE</div>
          <div>
            <Pill tone={riskTone}>{riskState}</Pill>
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
          <strong>Reason:</strong> <code style={{ color: "var(--danger)", fontWeight: 700 }}>{result.reasonCode}</code>
          {result.message && <div style={{ marginTop: 2, color: "var(--text-2)" }}>{result.message}</div>}
        </div>
      )}
    </div>
  );
}
