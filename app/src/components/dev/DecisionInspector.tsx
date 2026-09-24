/**
 * Circuit Protocol - Development Decision Inspector
 *
 * Real-time forensic inspector displaying the authoritative DecisionSnapshot
 * inputs, state derivations, and verdict reasons without secondary calculations.
 */

import React, { useState } from "react";
import { useCircuitDomain } from "../../lib/domain/context";
import { formatMoney, humanizeReasonCode, stripUnderscores } from "../../lib/format";
import { AssetRegistry } from "../../lib/assets/registry";

export function DecisionInspector() {
  const [isOpen, setIsOpen] = useState(false);
  const domain = useCircuitDomain();
  const snap = domain.decision;
  const canonicalConfig = AssetRegistry.get(snap.assetSymbol);

  const walletAddr = domain.wallet.address
    ? `${domain.wallet.address.slice(0, 4)}...${domain.wallet.address.slice(-4)}`
    : "Disconnected";

  const oracleState = snap.oracle.oracleState ?? (snap.oracle.freshness === "LIVE" ? "FRESH" : snap.oracle.freshness === "STALE" ? "STALE" : snap.oracle.freshness === "UNAVAILABLE" ? "UNAVAILABLE" : "FRESH");

  let pillLabel = "DECISION KERNEL · LIVE";
  if (oracleState === "STALE") {
    pillLabel = "DECISION KERNEL · ORACLE STALE";
  } else if (oracleState === "UNAVAILABLE") {
    pillLabel = "DECISION KERNEL · ORACLE UNAVAILABLE";
  } else if (oracleState === "INVALID") {
    pillLabel = "DECISION KERNEL · ORACLE INVALID";
  } else if (snap.verdict.status === "BLOCK" && snap.market.referenceState === "CLOSED") {
    pillLabel = "DECISION KERNEL · SESSION RESTRICTED";
  } else if (snap.verdict.status === "ALLOW") {
    pillLabel = "DECISION KERNEL · LIVE";
  } else {
    pillLabel = `DECISION KERNEL · ${stripUnderscores(snap.verdict.code).toUpperCase()}`;
  }

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
        <span>{pillLabel}</span>
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        width: 400,
        maxHeight: "85vh",
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
            VERDICT: {snap.verdict.status} · {humanizeReasonCode(snap.verdict.code)}
          </div>
          <div style={{ color: "var(--text-2)", marginTop: 4, lineHeight: 1.4 }}>
            {snap.verdict.reason ? snap.verdict.reason.replace(/_/g, " ") : ""}
          </div>
        </div>

        {/* Section: Canonical Asset Telemetry (Requirement 14) */}
        <div>
          <div style={{ color: "var(--text-3)", fontWeight: 700, marginBottom: 4, textTransform: "uppercase" }}>
            Canonical Asset Telemetry
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
            <div>Asset ID: <strong style={{ color: "var(--accent)" }}>{canonicalConfig?.assetId ?? snap.assetSymbol}</strong></div>
            <div>Symbol: <strong>{canonicalConfig?.symbol ?? snap.assetSymbol}</strong></div>
            <div>Token Mint: <strong style={{ fontSize: 10 }}>{canonicalConfig?.tokenMint ? `${canonicalConfig.tokenMint.slice(0, 4)}...${canonicalConfig.tokenMint.slice(-4)}` : "—"}</strong></div>
            <div>Pyth Feed ID: <strong style={{ fontSize: 10 }}>{canonicalConfig?.pythFeedId ? `${canonicalConfig.pythFeedId.slice(0, 4)}...${canonicalConfig.pythFeedId.slice(-4)}` : "—"}</strong></div>
            <div>Feed Account: <strong style={{ fontSize: 10 }}>{canonicalConfig?.pythFeedAccount ? `${canonicalConfig.pythFeedAccount.slice(0, 4)}...${canonicalConfig.pythFeedAccount.slice(-4)}` : "—"}</strong></div>
            <div>Oracle Time: <strong>{snap.oracle.lastValidPublishTime ?? snap.freshness.market}</strong></div>
            <div>Oracle Age: <strong>{snap.oracle.ageSeconds}s</strong></div>
            <div>Oracle State: <strong style={{ color: oracleState === "FRESH" ? "var(--success)" : "var(--warning)" }}>{oracleState}</strong></div>
            <div>Risk State: <strong style={{ color: snap.risk.state === "SAFE" ? "var(--success)" : "var(--warning)" }}>{snap.risk.state}</strong></div>
            <div>Permission: <strong style={{ color: snap.permission.allowed ? "var(--success)" : "var(--danger)" }}>{snap.permission.allowed ? "ALLOWED" : "BLOCKED"}</strong></div>
          </div>
        </div>

        {/* Section: Wallet & Environment */}
        <div>
          <div style={{ color: "var(--text-3)", fontWeight: 700, marginBottom: 4, textTransform: "uppercase" }}>
            Wallet &amp; System Scope
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
            <div>Wallet: <strong>{walletAddr}</strong></div>
            <div>Asset: <strong style={{ color: "var(--text-1)" }}>{snap.assetSymbol}</strong></div>
            <div>Slot: <strong>{snap.slot ?? "Pending"}</strong></div>
            <div>Paused: <strong style={{ color: domain.protocol.isFrozen ? "var(--danger)" : "var(--success)" }}>{domain.protocol.isFrozen ? "YES" : "NO"}</strong></div>
            <div>Enabled: <strong>{domain.markets.markets[snap.assetSymbol] ? "YES" : "NO"}</strong></div>
            <div>Vault Liquidity: <strong>$1.20M USDC</strong></div>
          </div>
        </div>

        {/* Section: Oracle & Market State */}
        <div>
          <div style={{ color: "var(--text-3)", fontWeight: 700, marginBottom: 4, textTransform: "uppercase" }}>
            Four Independent Semantic Dimensions
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
            <div>Reference: <strong style={{ color: (snap.market.referenceState ?? (snap.market.sessionOpen ? "OPEN" : "CLOSED")) === "OPEN" ? "var(--success)" : "var(--text-2)" }}>{snap.market.referenceState ?? (snap.market.sessionOpen ? "OPEN" : "CLOSED")}</strong></div>
            <div>Onchain: <strong style={{ color: "var(--mint, #7fc39a)" }}>{snap.market.onchainState ? stripUnderscores(snap.market.onchainState) : "OPEN · 24/7"}</strong></div>
            <div>Oracle: <strong style={{ color: oracleState === "FRESH" ? "var(--success)" : "var(--warning)" }}>{oracleState} ({snap.oracle.ageSeconds}s)</strong></div>
            <div>MarketGuard: <strong style={{ color: (snap.market.marketGuardState ?? snap.risk.state) === "SAFE" ? "var(--success)" : "var(--warning)" }}>{stripUnderscores(snap.market.marketGuardState ?? snap.risk.state)}</strong></div>
            <div>Price: <strong>${formatMoney(snap.oracle.price)}</strong></div>
            <div>Confidence: <strong>{snap.oracle.confBps} bps</strong></div>
            <div>Session: <strong>{snap.market.sessionOpen ? "OPEN" : "CLOSED"}</strong></div>
            <div>Security State: <strong style={{ color: snap.market.securityState === "NORMAL" ? "var(--success)" : "var(--warning)" }}>{stripUnderscores(snap.market.securityState)}</strong></div>
          </div>
        </div>

        {/* Section: Risk & Ratchet */}
        <div>
          <div style={{ color: "var(--text-3)", fontWeight: 700, marginBottom: 4, textTransform: "uppercase" }}>
            Risk Ratchet &amp; Capital Policy
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
            <div>Risk State: <strong style={{ color: snap.risk.state === "SAFE" ? "var(--success)" : "var(--warning)" }}>{snap.risk.state}</strong></div>
            <div>Risk Score: <strong>{snap.risk.score}</strong></div>
            <div>Risk Epoch: <strong>{snap.risk.riskEpoch}</strong></div>
            <div>Effective LTV: <strong>{(snap.capitalPolicy.maxLtv * 100).toFixed(0)}%</strong></div>
            <div>Borrow Allowed: <strong>{snap.capitalPolicy.borrowAllowed ? "YES" : "NO"}</strong></div>
            <div>Envelope State: <strong style={{ color: "var(--accent)" }}>DYNAMIC (Devnet)</strong></div>
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
            <div>Borrow Capacity: <strong style={{ color: "var(--accent)" }}>${formatMoney(snap.position.availableCreditUsd)}</strong></div>
            <div>Health Factor: <strong>{snap.position.health !== null ? snap.position.health.toFixed(2) : "∞"}</strong></div>
          </div>
        </div>

        {/* Section: Execution Mode & Authority */}
        <div>
          <div style={{ color: "var(--text-3)", fontWeight: 700, marginBottom: 4, textTransform: "uppercase" }}>
            Execution Mode &amp; Authority
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
            <div>Authority Mode: <strong>{snap.authority.mode}</strong></div>
            <div>Agent Authority: <strong>{snap.authority.status}</strong></div>
            <div>Requested Amount: <strong>$0.00 (Probe)</strong></div>
            <div>Permission Action: <strong>{snap.permission.action.toUpperCase()}</strong></div>
            <div>Permission Status: <strong style={{ color: snap.permission.allowed ? "var(--success)" : "var(--warning)" }}>{snap.permission.allowed ? "ALLOWED" : "BLOCKED"}</strong></div>
            <div>Reason: <strong>{humanizeReasonCode(snap.permission.reasonCode)}</strong></div>
          </div>
        </div>
      </div>
    </div>
  );
}
