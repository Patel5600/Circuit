/**
 * Circuit Protocol — Live Agent State Panel
 *
 * Primary right-hand workspace column:
 * 1. Current Objective & Active Strategy
 * 2. Risk State & Ratchet Bounds
 * 3. Capital & Credit Allocation
 * 4. Active Watchers & Tasks
 * 5. Live Strategy Execution Graph
 * 6. Quick Trigger for Deep Telemetry / Diagnostics Drawer
 */

import React from "react";
import { LiveStrategyGraph, StrategyNodeId } from "./LiveStrategyGraph";
import { DeployedMarket } from "../../data/markets-registry";

interface LiveAgentStatePanelProps {
  objective: string;
  strategyName?: string;
  riskState: "SAFE" | "RESTRICTED" | "DEFENSIVE" | "EMERGENCY";
  isMarketOpen: boolean;
  totalCollateralUsd: number;
  totalDebtUsd: number;
  availableCreditUsd: number;
  healthFactor: number | null;
  activeAsset: DeployedMarket;
  agentAuthority: any;
  activeWatchesCount: number;
  activeTasksCount: number;
  pendingApprovalsCount: number;
  currentNode: StrategyNodeId;
  permissionAllowed: boolean;
  blockedReason?: string | null;
  onOpenDiagnostics: () => void;
  onOpenCapabilityInspector: () => void;
  onOpenApprovals?: () => void;
  agentTier?: "LITE" | "PRO";
  agentCreditsAvailable?: number;
  agentCreditsReserved?: number;
  isAgentPaused?: boolean;
  onTogglePause?: () => void;
}

export function LiveAgentStatePanel({
  objective,
  strategyName = "Autonomous Liquidity & Risk Guard",
  riskState,
  isMarketOpen,
  totalCollateralUsd,
  totalDebtUsd,
  availableCreditUsd,
  healthFactor,
  activeAsset,
  agentAuthority,
  activeWatchesCount,
  activeTasksCount,
  pendingApprovalsCount,
  currentNode,
  permissionAllowed,
  blockedReason,
  onOpenDiagnostics,
  onOpenCapabilityInspector,
  onOpenApprovals,
  agentTier = "LITE",
  agentCreditsAvailable = 100,
  agentCreditsReserved = 0,
  isAgentPaused = false,
  onTogglePause,
}: LiveAgentStatePanelProps) {
  const fmtMoney = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtHf = (hf: number | null) => {
    if (hf === null) return "— (No Debt)";
    if (hf >= 999) return "> 999.0";
    return hf.toFixed(2);
  };

  const riskColor =
    riskState === "SAFE"
      ? "var(--mint, #79c2a4)"
      : riskState === "RESTRICTED"
      ? "var(--warning, #cfad74)"
      : "var(--danger, #cf8b8b)";

  return (
    <div
      className="live-agent-state-panel"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        height: "100%",
        overflowY: "auto",
        padding: "16px",
        background: "var(--surface-0, #0c0c0d)",
        borderLeft: "1px solid var(--border)",
      }}
    >
      {/* 1. Header: Live State */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--mint, #79c2a4)", display: "inline-block" }} />
          <span style={{ fontSize: 11, fontFamily: "var(--mono)", fontWeight: 700, color: "var(--text)", letterSpacing: "0.08em" }}>
            LIVE AGENT STATE
          </span>
        </div>
        <button
          onClick={onOpenCapabilityInspector}
          title="Inspect Agent Capabilities"
          style={{
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: 4,
            padding: "2px 7px",
            fontSize: 10,
            fontFamily: "var(--mono)",
            color: "#818cf8",
            cursor: "pointer",
          }}
        >
          Capabilities ?
        </button>
      </div>

      {/* 2. Current Objective */}
      <div
        style={{
          background: "var(--surface-1, #121214)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "12px 14px",
        }}
      >
        <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text-3)", letterSpacing: "0.08em", marginBottom: 4 }}>
          CURRENT OBJECTIVE
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", lineHeight: 1.4 }}>
          {objective || "Observe portfolio risk and execute permitted capital boundaries."}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
          <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text-3)" }}>STRATEGY:</span>
          <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--text-2)", fontWeight: 600 }}>
            {strategyName}
          </span>
        </div>
      </div>

      {/* 2.5 Agent Compute Budget */}
      <div
        style={{
          background: "var(--surface-1, #121214)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "12px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          fontFamily: "var(--mono)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 10, color: "var(--text-3)", letterSpacing: "0.08em" }}>AGENT COMPUTE BUDGET</span>
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              padding: "1px 6px",
              borderRadius: 3,
              background: agentTier === "PRO" ? "rgba(167, 139, 250, 0.2)" : "rgba(236, 234, 230, 0.12)",
              color: agentTier === "PRO" ? "#a78bfa" : "var(--accent)",
            }}
          >
            CIRCUIT {agentTier === "PRO" ? "PRO AGENT" : "LITE"}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 2 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: agentCreditsAvailable <= 10 ? "var(--danger, #cf8b8b)" : "var(--mint, #79c2a4)" }}>
            {agentCreditsAvailable} <span style={{ fontSize: 10, fontWeight: 500, color: "var(--text-3)" }}>CREDITS</span>
          </span>
          {agentCreditsReserved > 0 && (
            <span style={{ fontSize: 10, color: "var(--text-3)" }}>
              {agentCreditsReserved} reserved
            </span>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-3)", marginTop: 4, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <span>SENTINELS: <strong style={{ color: "var(--text-2)" }}>9 ACTIVE</strong></span>
          <span>STATUS: <strong style={{ color: isAgentPaused ? "var(--danger, #cf8b8b)" : "var(--mint, #79c2a4)" }}>{isAgentPaused ? "PAUSED" : "ONLINE"}</strong></span>
        </div>
      </div>

      {/* 3. Capital & Credit Summary */}
      <div
        style={{
          background: "var(--surface-1, #121214)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "12px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          fontFamily: "var(--mono)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 10, color: "var(--text-3)", letterSpacing: "0.08em" }}>CAPITAL &amp; RISK</span>
          <span style={{ fontSize: 10, color: riskColor, fontWeight: 700 }}>
            {riskState} {isMarketOpen ? "· NYSE OPEN" : "· CLOSED"}
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div>
            <div style={{ fontSize: 10, color: "var(--text-3)" }}>COLLATERAL</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{fmtMoney(totalCollateralUsd)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "var(--text-3)" }}>DEBT</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{fmtMoney(totalDebtUsd)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "var(--text-3)" }}>AVAIL CREDIT</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--mint, #79c2a4)" }}>{fmtMoney(availableCreditUsd)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "var(--text-3)" }}>HEALTH FACTOR</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: healthFactor && healthFactor < 1.3 ? "var(--warning)" : "var(--text)" }}>
              {fmtHf(healthFactor)}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Strategy Execution Graph */}
      <LiveStrategyGraph
        currentNode={currentNode}
        riskState={riskState}
        permissionAllowed={permissionAllowed}
        blockedReason={blockedReason}
        compact
      />

      {/* 5. Active Automation Tasks / Watches */}
      <div
        style={{
          background: "var(--surface-1, #121214)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "12px 14px",
          fontFamily: "var(--mono)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-3)", marginBottom: 6 }}>
          <span>ACTIVE MONITORING</span>
          <span>{activeWatchesCount} WATCHES</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
          <span style={{ color: "var(--text-2)" }}>Active Asset Scope:</span>
          <span style={{ color: "var(--text)", fontWeight: 700 }}>{activeAsset.tokenSymbol}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, marginTop: 4 }}>
          <span style={{ color: "var(--text-2)" }}>Scheduled Tasks:</span>
          <span style={{ color: "var(--text)", fontWeight: 600 }}>{activeTasksCount} active</span>
        </div>

        {pendingApprovalsCount > 0 && (
          <div
            onClick={onOpenApprovals}
            style={{
              marginTop: 10,
              padding: "6px 10px",
              background: "rgba(207,173,116,0.12)",
              border: "1px solid rgba(207,173,116,0.3)",
              borderRadius: 6,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              cursor: "pointer",
            }}
          >
            <span style={{ fontSize: 11, color: "var(--warning, #cfad74)", fontWeight: 700 }}>
              {pendingApprovalsCount} Approval Required
            </span>
            <span style={{ fontSize: 10, color: "var(--text-3)" }}>Review →</span>
          </div>
        )}
      </div>

      {/* 6. Secondary Diagnostics Button */}
      <div style={{ marginTop: "auto", paddingTop: 8 }}>
        <button
          onClick={onOpenDiagnostics}
          style={{
            width: "100%",
            padding: "8px 12px",
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: 6,
            color: "var(--text-3)",
            fontSize: 11,
            fontFamily: "var(--mono)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-3)")}
        >
          <span>System Diagnostics &amp; Telemetry</span>
        </button>
      </div>
    </div>
  );
}
