/**
 * Circuit Protocol — Live Strategy Execution Graph
 *
 * Visual node-flow displaying the agent's continuous execution loop:
 *   OBSERVE -> RISK -> POLICY -> PERMISSION -> ACTION -> EXECUTION -> RESULT -> OBSERVE
 *
 * Node States:
 *   - PASSED (✓)
 *   - ACTIVE / EVALUATING (●)
 *   - IDLE / WAITING (○)
 *   - BLOCKED (✕)
 */

import React from "react";

export type StrategyNodeId =
  | "OBSERVE"
  | "RISK"
  | "POLICY"
  | "PERMISSION"
  | "ACTION"
  | "EXECUTION"
  | "RESULT";

export type NodeStatus = "IDLE" | "ACTIVE" | "PASSED" | "BLOCKED";

interface LiveStrategyGraphProps {
  currentNode?: StrategyNodeId;
  riskState: "SAFE" | "RESTRICTED" | "DEFENSIVE" | "EMERGENCY";
  permissionAllowed?: boolean;
  blockedReason?: string | null;
  compact?: boolean;
}

const NODES: Array<{ id: StrategyNodeId; label: string; description: string }> = [
  { id: "OBSERVE", label: "OBSERVE", description: "Pyth oracle & market state" },
  { id: "RISK", label: "RISK", description: "Risk Ratchet & LTV evaluation" },
  { id: "POLICY", label: "POLICY", description: "Owner delegated constraints" },
  { id: "PERMISSION", label: "PERMISSION", description: "Circuit permission engine" },
  { id: "ACTION", label: "ACTION", description: "Intent translation & quote" },
  { id: "EXECUTION", label: "EXECUTION", description: "CPI & transaction settlement" },
  { id: "RESULT", label: "RESULT", description: "State reload & loop reset" },
];

export function LiveStrategyGraph({
  currentNode = "OBSERVE",
  riskState,
  permissionAllowed = true,
  blockedReason,
  compact = false,
}: LiveStrategyGraphProps) {
  const getNodeStatus = (id: StrategyNodeId): NodeStatus => {
    const nodeOrder: StrategyNodeId[] = ["OBSERVE", "RISK", "POLICY", "PERMISSION", "ACTION", "EXECUTION", "RESULT"];
    const currentIdx = nodeOrder.indexOf(currentNode);
    const thisIdx = nodeOrder.indexOf(id);

    if (id === "PERMISSION" && !permissionAllowed) {
      return "BLOCKED";
    }

    if (thisIdx < currentIdx) {
      return "PASSED";
    }
    if (thisIdx === currentIdx) {
      return "ACTIVE";
    }
    return "IDLE";
  };

  return (
    <div
      className="live-strategy-graph"
      style={{
        background: "var(--surface-1, #121214)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: compact ? "12px 14px" : "16px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            fontFamily: "var(--mono, monospace)",
            color: "var(--text-3, #71717a)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Strategy Execution Loop
        </span>
        <span
          style={{
            fontSize: 10,
            fontFamily: "var(--mono)",
            fontWeight: 700,
            padding: "2px 6px",
            borderRadius: 4,
            background: riskState === "SAFE" ? "rgba(121,194,164,0.12)" : "rgba(207,173,116,0.12)",
            color: riskState === "SAFE" ? "var(--mint, #79c2a4)" : "var(--warning, #cfad74)",
          }}
        >
          {riskState}
        </span>
      </div>

      {/* Nodes list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {NODES.map((n, idx) => {
          const status = getNodeStatus(n.id);
          const isBlocked = status === "BLOCKED";
          const isPassed = status === "PASSED";
          const isActive = status === "ACTIVE";

          return (
            <div key={n.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {/* Status symbol */}
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontFamily: "var(--mono)",
                  fontWeight: 700,
                  flexShrink: 0,
                  background: isBlocked
                    ? "rgba(207,139,139,0.15)"
                    : isPassed
                    ? "rgba(121,194,164,0.15)"
                    : isActive
                    ? "rgba(236,234,230,0.15)"
                    : "rgba(255,255,255,0.03)",
                  color: isBlocked
                    ? "var(--danger, #cf8b8b)"
                    : isPassed
                    ? "var(--mint, #79c2a4)"
                    : isActive
                    ? "var(--accent, #eceae6)"
                    : "var(--text-3, #52525b)",
                  border: isBlocked
                    ? "1px solid var(--danger)"
                    : isPassed
                    ? "1px solid var(--mint)"
                    : isActive
                    ? "1px solid var(--accent)"
                    : "1px solid #3f3f46",
                }}
              >
                {isBlocked ? "✕" : isPassed ? "✓" : isActive ? "●" : "○"}
              </div>

              {/* Node label */}
              <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: isActive || isPassed ? 700 : 500,
                      color: isBlocked
                        ? "var(--danger, #cf8b8b)"
                        : isPassed
                        ? "var(--text, #e4e4e7)"
                        : isActive
                        ? "var(--accent, #eceae6)"
                        : "var(--text-3, #71717a)",
                      fontFamily: "var(--mono, monospace)",
                    }}
                  >
                    {n.label}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "var(--mono)",
                      color: isBlocked ? "var(--danger)" : isPassed ? "var(--mint)" : "var(--text-3)",
                    }}
                  >
                    {status}
                  </span>
                </div>
                {!compact && (
                  <span style={{ fontSize: 10, color: "var(--text-3, #71717a)", marginTop: 1 }}>
                    {n.description}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {blockedReason && (
        <div
          style={{
            marginTop: 4,
            padding: "8px 10px",
            background: "rgba(207,139,139,0.08)",
            border: "1px solid rgba(207,139,139,0.25)",
            borderRadius: 6,
            fontSize: 11,
            color: "var(--danger, #cf8b8b)",
            fontFamily: "var(--mono)",
          }}
        >
          Blocked: {blockedReason}
        </div>
      )}
    </div>
  );
}
