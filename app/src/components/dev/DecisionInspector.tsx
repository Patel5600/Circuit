/**
 * Circuit Protocol - Development Decision Inspector
 *
 * Real-time forensic inspector displaying the authoritative DecisionSnapshot
 * inputs, state derivations, and verdict reasons without secondary calculations.
 */

import React, { useState } from "react";
import { useCircuitDomain } from "../../lib/domain/context";
import { formatMoney } from "../../lib/format";

export function DecisionInspector() {
  const [isOpen, setIsOpen] = useState(false);
  const domain = useCircuitDomain();
  const snap = domain.decision;

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        style={{
          position: "fixed",
          bottom: 16,
          right: 16,
          zIndex: 9999,
          background: "var(--surface-3, #1c202d)",
          color: "var(--accent, #9945FF)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-sm, 6px)",
          padding: "6px 12px",
          fontFamily: "var(--mono)",
          fontSize: 11,
          fontWeight: 650,
          cursor: "pointer",
          boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: snap.verdict.status === "ALLOW" ? "var(--success, #22c55e)" : "var(--warning, #eab308)",
          }}
        />
        <span>DECISION KERNEL ({snap.verdict.code})</span>
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        width: 380,
        maxHeight: "80vh",
        background: "var(--surface-1, #0e111a)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r, 10px)",
        boxShadow: "0 12px 32px rgba(0,0,0,0.8)",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontFamily: "var(--mono)",
        fontSize: 11,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "10px 14px",
          background: "var(--surface-2, #141824)",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: snap.verdict.status === "ALLOW" ? "var(--success, #22c55e)" : "var(--warning, #eab308)",
            }}
          />
          <strong style={{ fontSize: 12, letterSpacing: "0.04em", color: "var(--text-1)" }}>
            DECISION INSPECTOR
          </strong>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-3)",
            cursor: "pointer",
            fontSize: 14,
            padding: 2,
          }}
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: 14, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Verdict Badge */}
        <div
          style={{
            padding: "8px 10px",
            borderRadius: 6,
            background: snap.verdict.status === "ALLOW" ? "rgba(34, 197, 94, 0.1)" : "rgba(234, 179, 8, 0.1)",
            border: `1px solid ${snap.verdict.status === "ALLOW" ? "rgba(34, 197, 94, 0.3)" : "rgba(234, 179, 8, 0.3)"}`,
          }}
        >
          <div style={{ fontWeight: 700, color: snap.verdict.status === "ALLOW" ? "var(--success)" : "var(--warning)" }}>
            VERDICT: {snap.verdict.status} · {snap.verdict.code}
          </div>
          <div style={{ color: "var(--text-2)", marginTop: 4, lineHeight: 1.4 }}>
            {snap.verdict.reason}
          </div>
        </div>

        {/* Section: Context & Asset */}
        <div>
          <div style={{ color: "var(--text-3)", fontWeight: 700, marginBottom: 4, textTransform: "uppercase" }}>
            Asset &amp; Runtime Scope
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
            <div>Asset: <strong style={{ color: "var(--text-1)" }}>{snap.assetSymbol}</strong></div>
            <div>Slot: <strong>{snap.slot ?? "Pending"}</strong></div>
            <div>Execution Mode: <strong>{snap.executionMode.mode}</strong></div>
            <div>Authority Status: <strong>{snap.authority.status}</strong></div>
          </div>
        </div>

        {/* Section: Oracle & Market */}
        <div>
          <div style={{ color: "var(--text-3)", fontWeight: 700, marginBottom: 4, textTransform: "uppercase" }}>
            Oracle &amp; Market State
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
            <div>Price: <strong>${formatMoney(snap.oracle.price)}</strong></div>
            <div>Freshness: <strong style={{ color: snap.oracle.freshness === "LIVE" ? "var(--success)" : "var(--warning)" }}>{snap.oracle.freshness}</strong></div>
            <div>Age: <strong>{snap.oracle.ageSeconds}s ({snap.oracle.ageSlots} slots)</strong></div>
            <div>Confidence: <strong>{snap.oracle.confBps} bps</strong></div>
            <div>Session: <strong>{snap.market.sessionOpen ? "OPEN" : "CLOSED"}</strong></div>
            <div>Halt Inference: <strong style={{ color: snap.market.haltInference === "OPEN_NORMAL" ? "var(--success)" : "var(--danger)" }}>{snap.market.haltInference}</strong></div>
          </div>
        </div>

        {/* Section: Risk & Ratchet */}
        <div>
          <div style={{ color: "var(--text-3)", fontWeight: 700, marginBottom: 4, textTransform: "uppercase" }}>
            Risk Ratchet &amp; Policy
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
            <div>Ratchet: <strong style={{ color: snap.risk.state === "SAFE" ? "var(--success)" : "var(--warning)" }}>{snap.risk.state}</strong></div>
            <div>Risk Epoch: <strong>{snap.risk.riskEpoch}</strong></div>
            <div>Effective LTV: <strong>{(snap.capitalPolicy.maxLtv * 100).toFixed(0)}%</strong></div>
            <div>Borrow Allowed: <strong>{snap.capitalPolicy.borrowAllowed ? "YES" : "NO"}</strong></div>
          </div>
        </div>

        {/* Section: Position & Available Credit */}
        <div>
          <div style={{ color: "var(--text-3)", fontWeight: 700, marginBottom: 4, textTransform: "uppercase" }}>
            Position &amp; Credit Power
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
            <div>Collateral: <strong>${formatMoney(snap.position.collateralUsd)}</strong></div>
            <div>Debt: <strong>${formatMoney(snap.position.debtUsd)}</strong></div>
            <div>Available Credit: <strong style={{ color: "var(--accent)" }}>${formatMoney(snap.position.availableCreditUsd)}</strong></div>
            <div>Health Factor: <strong>{snap.position.health !== null ? snap.position.health.toFixed(2) : "∞"}</strong></div>
          </div>
        </div>
      </div>
    </div>
  );
}
