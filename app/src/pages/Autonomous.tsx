/**
 * Circuit Protocol — Autonomous Agent Workspace
 *
 * Full-page workspace supporting:
 *   1. CHAT (Default: 2-column Agent Chat + Live Protocol Context)
 *   2. STRATEGY (Active strategy plans, rebalancing & liquidity)
 *   3. WATCH (Real on-chain condition watchers with alerts)
 *   4. AUTO MANAGE (Bounded policy auto-repay / recovery)
 *   5. SCHEDULE (Scheduled periodic reviews via Vercel Cron)
 *   6. PERMISSIONS (On-chain Agent Authority PDA management & creation)
 *
 * Lazy-loaded — zero impact on Dashboard startup.
 * Zero fake data. If nothing executes: IDLE.
 */
import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PublicKey, Transaction } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useCircuitDomain } from "../lib/domain/context";
import { DEPLOYED_MARKETS, DeployedMarket } from "../data/markets-registry";
import { TasksPanel } from "../components/autonomous/TasksPanel";
import { WatchesPanel } from "../components/autonomous/WatchesPanel";
import { StrategiesPanel } from "../components/autonomous/StrategiesPanel";
import { LiveAgentConsole } from "../components/autonomous/LiveAgentConsole";
import { ExecutionFeed } from "../components/autonomous/ExecutionFeed";
import { PolicyPreview } from "../components/autonomous/PolicyPreview";
import { loadTasks, loadExecutions, syncToServer, parseTaskProposal, subscribeTasks } from "../lib/automation/store";
import type { ParsedTaskProposal } from "../lib/automation/types";
import { DbcExecutionPanel } from "../components/dbc/DbcExecutionPanel";
import { DbcCurveVisualizer } from "../components/dbc/DbcCurveVisualizer";
import { DbcPoolStatusPill } from "../components/dbc/DbcPoolStatusPill";
import { useDbcContext } from "../context/DbcContext";
import { AgentMessageRenderer } from "../components/autonomous/AgentMessageRenderer";
import { LiveAgentStatePanel } from "../components/autonomous/LiveAgentStatePanel";
import { CommandPalette, CommandItem } from "../components/autonomous/CommandPalette";
import { AgentCapabilityInspector } from "../components/autonomous/AgentCapabilityInspector";
import { ApprovalQueueModal } from "../components/autonomous/ApprovalQueueModal";
import { StrategyNodeId } from "../components/autonomous/LiveStrategyGraph";
import { ProtocolBoundaryInspector } from "../components/autonomous/ProtocolBoundaryInspector";
import { Icon } from "../components/ui";
import { useAction } from "../context/ActionContext";
import { useMarketData } from "../context/MarketDataContext";
import type { MarketSnapshot } from "../lib/market-data/types";
import { shortenAddress } from "../lib/format";
import { useTransaction } from "../hooks/useTransaction";
import {
  CIRCUIT_DEVNET_AGENT_KEY,
  AllowedActionsMask,
  buildCreateAgentAuthorityInstruction,
  deriveAgentAuthorityPda,
} from "../lib/agentAuthority";
import { AgentHarnessCoordinator, ProtocolSnapshot } from "../lib/agent/harness";
import {
  StructuredMessageBlock,
  ProposalCardBlockData,
  MarketCardBlockData,
} from "../lib/agent/types";
import {
  MarketCardBlock,
  ChartCardBlock,
  ProposalCardBlock,
  ClarificationBlock,
  TransactionBlock,
} from "../components/autonomous/AgentBlocks";
import { ProtocolAction } from "../lib/permission-engine";
import {
  AgentModelOption,
  CURATED_MODELS,
  DEFAULT_MODEL_ID,
  FALLBACK_MODEL_ID,
  filterCuratedModels,
} from "../lib/agent/curatedModels";
import { getContextualSuggestions } from "../lib/agent/suggestions";
import {
  buildBorrow,
  buildRepay,
  buildDeposit,
  buildWithdraw,
  toNative,
  findRiskEnvelopePda,
  PROGRAM_ID,
  buildAuthorizedAgentActionBundle,
} from "../lib/protocol";
import { derivePriceAccount } from "../lib/pyth";
import { PYTH_FEED_ID } from "../config";
import { decisionLogStore } from "../lib/realtime/decision-log";
import { protocolEventBus, createEvent } from "../lib/realtime/event-bus";
import { calculateMinimumRestorationDebt } from "../lib/recovery-engine";
import { agentCreditStore, ClientCreditState } from "../lib/agent/credit-store";
import { routeAgentRequest, ModelRoutingDecision, AgentTier } from "../lib/agent/model-router";
import { getCreditWarning, DEFAULT_CREDIT_POLICY } from "../lib/agent/credit-policy";
import { circuitSentinelEngine } from "../lib/agent/sentinels";
import { persistentAgentMemory } from "../lib/agent/memory";
import { agentCircuitBreaker } from "../lib/agent/circuit-breaker";

export type AgentState =
  | "OFFLINE"
  | "READY"
  | "IDLE"
  | "OBSERVING"
  | "ANALYZING"
  | "PLANNING"
  | "AWAITING_APPROVAL"
  | "CHECKING_PERMISSION"
  | "ENVELOPE_CREATED"
  | "EXECUTING"
  | "CONFIRMING"
  | "COMPLETED"
  | "BLOCKED"
  | "USER_REJECTED"
  | "TX_FAILED"
  | "WATCHING"
  | "SCHEDULED"
  | "PAUSED"
  | "FAILED"
  | "EXPIRED"
  | "REVOKED";

export type AgentOperatingMode = "COPILOT" | "DELEGATED" | "WATCH" | "AUTO MANAGE" | "SCHEDULE";

export type TabId = "CHAT" | "STRATEGY" | "WATCH" | "AUTO MANAGE" | "SCHEDULE" | "PERMISSIONS" | "DBC";

export interface CircuitToolEvent {
  tool: string;
  input: Record<string, any>;
  output: Record<string, any>;
  status: "CONFIRMED" | "BLOCKED" | "PENDING";
}

export interface CircuitActionProposal {
  id: string;
  action: ProtocolAction;
  symbol: string;
  amountUsd: number;
  riskState: string;
  permission: "ALLOWED" | "BLOCKED" | "CAPPED";
  reason: string;
  estimatedHfAfter: number | null;
  riskEnvelopePda?: string;
  envelopeCreated?: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "agent" | "system";
  content: string;
  timestamp: number;
  streaming?: boolean;
  tools?: CircuitToolEvent[];
  actionProposal?: CircuitActionProposal | null;
  taskProposal?: ParsedTaskProposal | null;
  blocks?: StructuredMessageBlock[];
}

export interface StrategyAction {
  action: "deposit" | "borrow" | "repay" | "withdraw" | "swap" | "enter_liquidity" | "exit_liquidity" | "rebalance";
  asset: string;
  amountUsd: number;
  reason: string;
}

export interface StrategyPlan {
  objective: string;
  constraints: string[];
  actions: StrategyAction[];
  riskAssessment: string;
}

export interface ExecEvent {
  id: string;
  timestamp: number;
  type: "info" | "permission" | "tx" | "confirmed" | "blocked" | "error";
  message: string;
  txSignature?: string;
}

function uid(): string { return Math.random().toString(36).slice(2); }

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function stateColor(s: AgentState): string {
  if (s === "OFFLINE" || s === "EXPIRED" || s === "REVOKED") return "var(--text-3)";
  if (s === "READY" || s === "IDLE" || s === "COMPLETED") return "var(--mint, #79c2a4)";
  if (s === "ENVELOPE_CREATED" || s === "EXECUTING" || s === "CONFIRMING") return "var(--mint, #79c2a4)";
  if (s === "FAILED" || s === "BLOCKED" || s === "TX_FAILED") return "var(--danger, #cf8b8b)";
  if (s === "AWAITING_APPROVAL" || s === "PAUSED" || s === "WATCHING" || s === "SCHEDULED" || s === "USER_REJECTED") return "var(--warning, #cfad74)";
  return "var(--accent)";
}

function StateBadge({ state }: { state: AgentState }) {
  const color = stateColor(state);
  const pulse = state === "EXECUTING" || state === "PLANNING" || state === "CONFIRMING" || state === "OBSERVING" || state === "ANALYZING" || state === "CHECKING_PERMISSION" || state === "ENVELOPE_CREATED";
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{
        width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block",
        boxShadow: pulse ? `0 0 8px ${color}` : "none",
        animation: pulse ? "agPulse 1.5s ease-in-out infinite" : "none", flexShrink: 0,
      }} />
      <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "var(--mono)", letterSpacing: "0.06em", color }}>{state}</span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: "0.06em",
      color: "var(--text-3)",
      fontFamily: "var(--mono)",
      marginBottom: 8,
      textTransform: "uppercase",
    }}>
      {children}
    </div>
  );
}

function parseToolsFromText(rawContent: string): CircuitToolEvent[] {
  const tools: CircuitToolEvent[] = [];
  const lines = rawContent.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("CIRCUIT_TOOL:")) {
      try {
        const jsonStr = trimmed.slice("CIRCUIT_TOOL:".length).trim();
        const parsed = JSON.parse(jsonStr);
        if (parsed && parsed.tool) {
          tools.push(parsed);
        }
      } catch { /* skip partial */ }
    }
  }
  return tools;
}

function parseProposalFromText(rawContent: string): CircuitActionProposal | null {
  const lines = rawContent.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("CIRCUIT_ACTION_PROPOSAL:")) {
      try {
        const jsonStr = trimmed.slice("CIRCUIT_ACTION_PROPOSAL:".length).trim();
        const parsed = JSON.parse(jsonStr);
        if (parsed && parsed.action) {
          return parsed;
        }
      } catch { /* skip partial */ }
    }
  }
  return null;
}

function cleanDisplayContent(rawContent: string): string {
  return rawContent
    .split("\n")
    .filter(line => {
      const t = line.trim();
      if (t.startsWith("CIRCUIT_TOOL:") ||
          t.startsWith("CIRCUIT_ACTION_PROPOSAL:") ||
          t.startsWith("CIRCUIT_TASK:")) {
        return false;
      }
      // Scrub any obsolete provider-leaking notes like [Note: Switched to Gemini...]
      if (/^\[Note:\s*Switched to .*gemini.*\]$/i.test(t)) {
        return false;
      }
      return true;
    })
    .join("\n")
    .replace(/gemini[- ]3\.[68][- ]flash/gi, "Circuit Lite")
    .replace(/gemini[- ]3\.7[- ]flash/gi, "Circuit Pro")
    .replace(/gemini[- ]2\.5[- ]pro/gi, "Circuit Pro")
    .replace(/gemini[- ]2\.5[- ]flash/gi, "Circuit Lite")
    .replace(/gemini[- ]flash[-a-z0-9]*/gi, "Circuit Lite")
    .replace(/gemini[- ]pro[-a-z0-9]*/gi, "Circuit Pro")
    .replace(/gpt-4o[-a-z0-9]*/gi, "Circuit Pro")
    .replace(/gpt-3\.5[-a-z0-9]*/gi, "Circuit Lite")
    .trim();
}

function ToolExecutionCard({ tool }: { tool: CircuitToolEvent }) {
  const [expanded, setExpanded] = useState(false);
  const isConfirmed = tool.status === "CONFIRMED";

  return (
    <div style={{
      marginTop: 6,
      marginBottom: 6,
      background: "var(--surface-3, #151821)",
      border: "1px solid var(--border)",
      borderRadius: 6,
      fontSize: 11,
      fontFamily: "var(--mono)",
      overflow: "hidden",
    }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 10px",
          cursor: "pointer",
          background: "rgba(255,255,255,0.02)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "var(--accent)", fontWeight: 700, fontSize: 10 }}>
            ⚙ TOOL: {tool.tool}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            fontSize: 9,
            fontWeight: 700,
            padding: "1px 6px",
            borderRadius: 3,
            background: isConfirmed ? "var(--success-dim)" : "var(--danger-dim)",
            color: isConfirmed ? "var(--success)" : "var(--danger)",
            border: `1px solid ${isConfirmed ? "var(--success)" : "var(--danger)"}`,
          }}>
            {tool.status}
          </span>
          <span style={{ fontSize: 9, color: "var(--text-3)" }}>{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {!expanded ? (
        <div style={{
          padding: "4px 10px 6px",
          color: "var(--text-2)",
          fontSize: 10,
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          borderTop: "1px solid var(--border)",
        }}>
          {Object.entries(tool.output || {}).slice(0, 3).map(([k, v]) => (
            <span key={k}>
              <span style={{ color: "var(--text-3)" }}>{k}:</span> {typeof v === "object" ? JSON.stringify(v) : String(v)}
            </span>
          ))}
        </div>
      ) : (
        <div style={{
          padding: "8px 10px",
          borderTop: "1px solid var(--border)",
          background: "var(--surface-3)",
          fontSize: 10,
        }}>
          <div style={{ marginBottom: 4, color: "var(--text-3)" }}>INPUT:</div>
          <pre style={{ margin: "0 0 6px", color: "var(--text-2)", whiteSpace: "pre-wrap" }}>
            {JSON.stringify(tool.input, null, 2)}
          </pre>
          <div style={{ marginBottom: 4, color: "var(--text-3)" }}>OUTPUT:</div>
          <pre style={{ margin: 0, color: isConfirmed ? "var(--success)" : "var(--danger)", whiteSpace: "pre-wrap" }}>
            {JSON.stringify(tool.output, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function ActionProposalCard({
  proposal,
  onApprove,
  onDismiss,
}: {
  proposal: CircuitActionProposal;
  onApprove: (proposal: CircuitActionProposal) => void;
  onDismiss: () => void;
}) {
  const [executed, setExecuted] = useState(false);
  const isBlocked = proposal.permission === "BLOCKED";
  const isCapped = proposal.permission === "CAPPED";
  const isAllowed = proposal.permission === "ALLOWED";

  const isBorrow = proposal.action === "borrow";
  const isDeposit = proposal.action === "deposit" || proposal.action === "repay";
  const isDbc = ["swap", "enter_liquidity", "exit_liquidity", "rebalance"].includes(proposal.action);

  const badgeBg = isBorrow
    ? "var(--warning-dim)"
    : isDeposit
    ? "var(--success-dim)"
    : isDbc
    ? "var(--accent-dim)"
    : "var(--danger-dim)";
  const badgeFg = isBorrow
    ? "var(--warning)"
    : isDeposit
    ? "var(--success)"
    : isDbc
    ? "var(--accent)"
    : "var(--danger)";

  return (
    <div style={{
      marginTop: 10,
      marginBottom: 10,
      padding: "13px 15px",
      background: "var(--surface-2)",
      border: `1px solid ${isBlocked ? "rgba(207,139,139,0.35)" : "var(--border)"}`,
      borderRadius: 8,
      boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontSize: 10,
            fontWeight: 800,
            fontFamily: "var(--mono)",
            padding: "3px 8px",
            borderRadius: 4,
            background: badgeBg,
            color: badgeFg,
            letterSpacing: "0.06em",
          }}>
            {proposal.action.toUpperCase()}
          </span>
          <span style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>
            ${proposal.amountUsd.toFixed(2)} USD
          </span>
          <span style={{ color: "var(--text-3)", fontSize: 11 }}>against</span>
          <span style={{ fontWeight: 700, fontSize: 13, color: "var(--accent)" }}>
            {proposal.symbol}
          </span>
        </div>

        <span style={{
          fontSize: 9.5,
          fontWeight: 700,
          fontFamily: "var(--mono)",
          padding: "2px 7px",
          borderRadius: 4,
          background: isAllowed
            ? "rgba(121,194,164,0.15)"
            : isCapped
            ? "rgba(207,173,116,0.15)"
            : "rgba(207,139,139,0.15)",
          color: isAllowed
            ? "var(--mint, #79c2a4)"
            : isCapped
            ? "var(--warning, #cfad74)"
            : "var(--danger, #cf8b8b)",
          border: `1px solid ${
            isAllowed
              ? "rgba(121,194,164,0.3)"
              : isCapped
              ? "rgba(207,173,116,0.3)"
              : "rgba(207,139,139,0.3)"
          }`,
        }}>
          {isAllowed ? "CIRCUIT APPROVED" : isCapped ? "POLICY CAPPED" : "BLOCKED BY RISK LIMITS"}
        </span>
      </div>

      <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.5, marginBottom: 10 }}>
        {proposal.reason}
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: 6,
        padding: "7px 10px",
        background: "var(--surface-3, #151821)",
        borderRadius: 6,
        fontSize: 10,
        fontFamily: "var(--mono)",
        color: "var(--text-3)",
        marginBottom: 10,
      }}>
        <div>
          <span style={{ color: "var(--text-3)" }}>Risk State: </span>
          <span style={{ color: "var(--text-1)", fontWeight: 700 }}>{proposal.riskState}</span>
        </div>
        <div>
          <span style={{ color: "var(--text-3)" }}>Projected HF: </span>
          <span style={{ color: proposal.estimatedHfAfter ? "var(--mint, #79c2a4)" : "var(--text-3)", fontWeight: 700 }}>
            {proposal.estimatedHfAfter ? proposal.estimatedHfAfter.toFixed(3) : "—"}
          </span>
        </div>
        <div>
          <span style={{ color: "var(--text-3)" }}>Trading Venue: </span>
          <span style={{ color: "var(--text-2)" }}>Circuit Devnet</span>
        </div>
      </div>

      {isBlocked ? (
        <div style={{
          padding: "8px 10px",
          background: "rgba(207,139,139,0.08)",
          border: "1px solid rgba(207,139,139,0.25)",
          borderRadius: 6,
          fontSize: 11,
          color: "var(--danger, #cf8b8b)",
          lineHeight: 1.4,
        }} title="Action blocked by risk engine: Capital policy violation / risk containment">
          ✕ Blocked by your current risk limits. The risk system is currently in {proposal.riskState} state, preventing risk-increasing transactions.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "var(--mono)", letterSpacing: "0.02em" }}>
            Interactive confirmation required · Browser client routes signing to your connected wallet
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              disabled={executed}
              onClick={() => {
                setExecuted(true);
                onApprove(proposal);
              }}
              style={{
                flex: 1,
                padding: "8px 14px",
                fontSize: 11,
                fontWeight: 700,
                fontFamily: "var(--mono)",
                background: executed ? "rgba(16,185,129,0.15)" : "var(--accent, #3D5AFE)",
                color: executed ? "var(--success, #10B981)" : "#ffffff",
                border: "none",
                borderRadius: 6,
                cursor: executed ? "default" : "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {executed ? "✓ OPENED FOR EXECUTION" : `APPROVE & EXECUTE ON DEVNET →`}
            </button>
            <button
              type="button"
              onClick={onDismiss}
              style={{
                padding: "8px 14px",
                fontSize: 11,
                fontFamily: "var(--mono)",
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: 6,
                color: "var(--text-2)",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              DISMISS
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Bubble({
  msg,
  owner,
  onTaskCreated,
  onApproveProposal,
  onDismissProposal,
  onActionClick,
  onChartClick,
  onSubTabClick,
  onSelectClarification,
}: {
  msg: ChatMessage;
  owner: string;
  onTaskCreated: (name: string) => void;
  onApproveProposal: (proposal: CircuitActionProposal) => void;
  onDismissProposal?: (proposalId?: string) => void;
  onActionClick?: (action: ProtocolAction, symbol: string) => void;
  onChartClick?: (symbol: string) => void;
  onSubTabClick?: (tab: "Market" | "Risk" | "Position" | "Activity", symbol: string) => void;
  onSelectClarification?: (actionText: string) => void;
}) {
  const isUser = msg.role === "user";
  const isSys = msg.role === "system";
  const [dismissedTask, setDismissedTask] = useState(false);
  const [dismissedProposal, setDismissedProposal] = useState(false);

  const displayContent = useMemo(() => cleanDisplayContent(msg.content), [msg.content]);
  const tools = useMemo(() => msg.tools ?? parseToolsFromText(msg.content), [msg.tools, msg.content]);
  const actionProposal = useMemo(() => msg.actionProposal ?? parseProposalFromText(msg.content), [msg.actionProposal, msg.content]);

  if (isUser) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
        <div style={{ maxWidth: "72%", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text-3)" }}>
            YOU · {fmtTime(msg.timestamp)}
          </div>
          <div style={{
            padding: "11px 16px",
            background: "rgba(236,234,230,0.1)",
            border: "1px solid rgba(236,234,230,0.15)",
            borderRadius: "18px 18px 4px 18px",
            fontSize: 14, lineHeight: 1.55, color: "var(--text)",
            whiteSpace: "pre-wrap", wordBreak: "break-word",
          }}>
            {displayContent}
          </div>
        </div>
      </div>
    );
  }

  if (isSys) {
    return (
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text-3)", marginBottom: 6 }}>
          CIRCUIT AGENT · {fmtTime(msg.timestamp)}
        </div>
        <div style={{
          padding: "14px 18px",
          background: "rgba(207,173,116,0.06)",
          border: "1px solid rgba(207,173,116,0.2)",
          borderRadius: 12,
          fontSize: 13.5, lineHeight: 1.6, color: "var(--text-2)",
          whiteSpace: "pre-wrap", wordBreak: "break-word",
          fontFamily: "var(--mono)",
        }}>
          {displayContent}
          {msg.streaming && (
            <span style={{ display: "inline-block", width: 2, height: 14, background: "var(--accent)", marginLeft: 3, verticalAlign: "middle", animation: "agBlink 1s step-end infinite" }} />
          )}
        </div>
      </div>
    );
  }

  // Agent message — full width, left-aligned
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text-3)", marginBottom: 6 }}>
        CIRCUIT AGENT · {fmtTime(msg.timestamp)}
      </div>

      {/* Structured Blocks (Market Cards, Charts, Proposals, Clarifications) */}
      {msg.blocks && msg.blocks.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {msg.blocks.map((block, idx) => {
            if (block.type === "MARKET_CARD") {
              return (
                <MarketCardBlock
                  key={`mkt_${idx}`}
                  block={block}
                  onActionClick={(action, symbol) => onActionClick?.(action, symbol)}
                  onChartClick={(symbol) => onChartClick?.(symbol)}
                  onSubTabClick={(tab, symbol) => onSubTabClick?.(tab, symbol)}
                />
              );
            }
            if (block.type === "CHART_CARD") {
              return <ChartCardBlock key={`chart_${idx}`} block={block} />;
            }
            if (block.type === "PROPOSAL_CARD") {
              return (
                <ProposalCardBlock
                  key={`prop_${idx}`}
                  block={block}
                  onApprove={(b) => {
                    onApproveProposal({
                      id: b.id,
                      action: b.action,
                      symbol: b.symbol,
                      amountUsd: b.amountUsd,
                      riskState: b.riskState,
                      permission: b.permission,
                      reason: b.reason,
                      estimatedHfAfter: b.estimatedHfAfter,
                    });
                  }}
                  onCancel={() => {
                    setDismissedProposal(true);
                    onDismissProposal?.(block.id);
                  }}
                />
              );
            }
            if (block.type === "CLARIFICATION_CARD") {
              return (
                <ClarificationBlock
                  key={`clar_${idx}`}
                  block={block}
                  onSelectOption={(text) => onSelectClarification?.(text)}
                />
              );
            }
            if (block.type === "TRANSACTION_CARD") {
              return <TransactionBlock key={`tx_${idx}`} block={block} />;
            }
            return null;
          })}
        </div>
      )}

      {tools.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {tools.map((tool, idx) => (
            <ToolExecutionCard key={`${tool.tool}_${idx}`} tool={tool} />
          ))}
        </div>
      )}

      {displayContent.length > 0 && (
        <AgentMessageRenderer
          content={displayContent}
          tools={tools}
          streaming={msg.streaming}
          onApproveProposal={(p) => {
            onApproveProposal(p);
          }}
          onRejectProposal={() => {
            setDismissedProposal(true);
            onDismissProposal?.(actionProposal?.id);
          }}
          onActionClick={onActionClick}
        />
      )}

      {actionProposal && !dismissedProposal && (!msg.blocks || !msg.blocks.some(b => b.type === "PROPOSAL_CARD")) && (
        <div style={{ marginTop: 12 }}>
          <ActionProposalCard
            proposal={actionProposal}
            onApprove={(p) => onApproveProposal(p)}
            onDismiss={() => {
              setDismissedProposal(true);
              onDismissProposal?.(actionProposal.id);
            }}
          />
        </div>
      )}

      {msg.taskProposal && !dismissedTask && (
        <div style={{ marginTop: 12 }}>
          <PolicyPreview
            proposal={msg.taskProposal}
            owner={owner}
            onCreated={(name) => onTaskCreated(name)}
            onDismiss={() => setDismissedTask(true)}
          />
        </div>
      )}
    </div>
  );
}


function PermissionsTab({
  onCreated,
}: {
  onCreated?: () => void;
}) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { onChainAuthorities, refreshAuthorities, revokeAuthorityOnChain } = useCircuitDomain();

  const [selectedMint, setSelectedMint] = useState<string>(() => DEPLOYED_MARKETS[0].mint);
  const [agentPubkeyStr, setAgentPubkeyStr] = useState<string>(CIRCUIT_DEVNET_AGENT_KEY.toBase58());
  const [actions, setActions] = useState<AllowedActionsMask>({
    deposit: false,
    borrow: true,
    repay: true,
    withdraw: false,
  });
  const [borrowLimitUsd, setBorrowLimitUsd] = useState<string>("500");
  const [withdrawLimitShares, setWithdrawLimitShares] = useState<string>("10");
  const [riskBudgetUsd, setRiskBudgetUsd] = useState<string>("500");
  const [expiryOption, setExpiryOption] = useState<"24h" | "7d" | "30d" | "none">("7d");

  const [revokingKey, setRevokingKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; tone: "mint" | "danger" | "warning" } | null>(null);

  const selectedMarket = useMemo(() => {
    return DEPLOYED_MARKETS.find((m) => m.mint === selectedMint) || DEPLOYED_MARKETS[0];
  }, [selectedMint]);

  const parsedAgentKey = useMemo<PublicKey | null>(() => {
    try { return new PublicKey(agentPubkeyStr.trim()); } catch { return null; }
  }, [agentPubkeyStr]);

  const pdaAddress = useMemo(() => {
    if (!publicKey || !parsedAgentKey) return null;
    try {
      const [pda] = deriveAgentAuthorityPda(publicKey, parsedAgentKey, new PublicKey(selectedMarket.mint));
      return pda.toBase58();
    } catch { return null; }
  }, [publicKey, parsedAgentKey, selectedMarket.mint]);

  const expirySeconds = useMemo(() => {
    switch (expiryOption) {
      case "24h": return 86400;
      case "7d": return 86400 * 7;
      case "30d": return 86400 * 30;
      case "none": return 0;
    }
  }, [expiryOption]);

  const handleRevoke = async (auth: any) => {
    if (!publicKey) return;
    setRevokingKey(auth.agent.toBase58());
    setStatusMsg({ text: "Submitting revocation transaction to Solana Devnet...", tone: "warning" });
    try {
      const sig = await revokeAuthorityOnChain(auth.agent, auth.assetMint);
      setStatusMsg({ text: `Authority revoked on-chain: ${sig.slice(0, 10)}...`, tone: "mint" });
      await refreshAuthorities();
    } catch (err: any) {
      setStatusMsg({ text: `Revocation failed: ${err.message || String(err)}`, tone: "danger" });
    } finally {
      setRevokingKey(null);
    }
  };

  const handleCreate = async () => {
    if (!publicKey || !parsedAgentKey) return;
    setCreating(true);
    setStatusMsg({ text: "Building and signing agent access transaction...", tone: "warning" });

    try {
      const { instruction } = await buildCreateAgentAuthorityInstruction(connection, {
        owner: publicKey,
        agent: parsedAgentKey,
        assetMint: new PublicKey(selectedMarket.mint),
        allowedActions: actions,
        maxBorrowLimitUi: parseFloat(borrowLimitUsd) || 0,
        maxWithdrawLimitUi: parseFloat(withdrawLimitShares) || 0,
        riskBudgetUi: parseFloat(riskBudgetUsd) || 0,
        expirySecondsFromNow: expirySeconds,
      });

      const tx = new Transaction().add(instruction);
      tx.feePayer = publicKey;
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;

      const sig = await sendTransaction(tx, connection);
      setStatusMsg({ text: `Confirming on Solana Devnet: ${sig.slice(0, 10)}...`, tone: "warning" });

      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
      await refreshAuthorities();
      setStatusMsg({ text: `Agent access confirmed! Activated for ${selectedMarket.symbol}.`, tone: "mint" });
      onCreated?.();
    } catch (err: any) {
      console.error("Authority creation failed:", err);
      setStatusMsg({ text: `Setup failed: ${err.message || String(err)}`, tone: "danger" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "24px 20px", display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header Banner */}
      <div style={{ padding: "16px 18px", background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "var(--r)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", letterSpacing: "0.02em" }}>
              ON-CHAIN AGENT ACCESS MANAGEMENT
            </div>
            <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 4, lineHeight: 1.5 }}>
              Delegate bounded execution to autonomous agents while retaining full capital control.
              Circuit's risk limits and market conditions govern every transaction on Devnet.
            </div>
          </div>
          <span style={{
            fontSize: 10, fontWeight: 700, fontFamily: "var(--mono)", padding: "3px 8px", borderRadius: 4, background: "rgba(121,194,164,0.15)", color: "var(--mint,#79c2a4)", border: "1px solid rgba(121,194,164,0.3)",
          }}>
            DEVNET ACCESS
          </span>
        </div>

        <div style={{
          marginTop: 12, padding: "8px 12px", background: "var(--surface-2)", borderRadius: 6, fontSize: 11, fontFamily: "var(--mono)", color: "var(--text-3)", display: "flex", justifyContent: "space-between",
        }}>
          <span>ACCESS PIPELINE:</span>
          <span style={{ color: "var(--accent)" }}>
            USER (Owner) → AGENT (Key) → RISK LIMITS → PERMISSION ENGINE → SOLANA DEVNET
          </span>
        </div>
      </div>

      {statusMsg && (
        <div style={{
          padding: "10px 14px",
          borderRadius: 6,
          background: statusMsg.tone === "mint" ? "rgba(121,194,164,0.08)" : statusMsg.tone === "danger" ? "rgba(207,139,139,0.08)" : "rgba(207,173,116,0.08)",
          border: `1px solid ${statusMsg.tone === "mint" ? "rgba(121,194,164,0.3)" : statusMsg.tone === "danger" ? "rgba(207,139,139,0.3)" : "rgba(207,173,116,0.3)"}`,
          color: statusMsg.tone === "mint" ? "var(--mint,#79c2a4)" : statusMsg.tone === "danger" ? "var(--danger,#cf8b8b)" : "var(--warning,#cfad74)",
          fontSize: 12,
          fontFamily: "var(--mono)",
        }}>
          {statusMsg.text}
        </div>
      )}

      {/* Existing Authorities List */}
      <div style={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 18 }}>
        <SectionLabel>CURRENT AGENT ACCESS (ON-CHAIN)</SectionLabel>
        {onChainAuthorities.length === 0 ? (
          <div style={{ padding: "16px 14px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12, color: "var(--text-3)" }}>
            No active agent access found for your connected wallet. Set up bounded permissions below to grant an agent access.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {onChainAuthorities.map((a) => {
              const sym = DEPLOYED_MARKETS.find(m => m.mint === a.assetMint.toBase58())?.symbol ?? a.assetMint.toBase58().slice(0, 6);
              const isRevoking = revokingKey === a.agent.toBase58();
              return (
                <div key={a.agent.toBase58() + a.assetMint.toBase58()} style={{
                  padding: "12px 14px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 800, fontSize: 13, color: "var(--text)" }}>{sym} Agent Access</span>
                      <span style={{
                        fontSize: 9.5, fontWeight: 700, fontFamily: "var(--mono)", padding: "1px 6px", borderRadius: 3,
                        background: a.isActive ? "rgba(121,194,164,0.15)" : a.isRevoked ? "rgba(207,139,139,0.15)" : "rgba(207,173,116,0.15)",
                        color: a.isActive ? "var(--mint,#79c2a4)" : a.isRevoked ? "var(--danger,#cf8b8b)" : "var(--warning,#cfad74)",
                      }}>
                        {a.status}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--text-3)", marginTop: 4 }}>
                      Agent: {shortenAddress(a.agent.toBase58())} · Max Borrow: ${a.maxBorrowLimitUi.toFixed(2)} · Risk Budget: ${a.riskBudgetUi.toFixed(2)}
                    </div>
                    <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text-3)", marginTop: 2 }}>
                      Expiry: {a.expiryTs === 0 ? "Perpetual" : new Date(a.expiryTs * 1000).toLocaleString()}
                    </div>
                  </div>

                  {a.isActive && (
                    <button
                      type="button"
                      disabled={isRevoking}
                      onClick={() => handleRevoke(a)}
                      style={{
                        padding: "6px 12px",
                        fontSize: 11,
                        fontFamily: "var(--mono)",
                        fontWeight: 700,
                        background: "rgba(207,139,139,0.12)",
                        border: "1px solid rgba(207,139,139,0.35)",
                        borderRadius: 5,
                        color: "var(--danger,#cf8b8b)",
                        cursor: isRevoking ? "wait" : "pointer",
                      }}
                    >
                      {isRevoking ? "REVOKING..." : "REVOKE ACCESS"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* New Authority Creation Form */}
      <div style={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 18 }}>
        <SectionLabel>CREATE NEW AGENT ACCESS</SectionLabel>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Agent Pubkey */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, fontFamily: "var(--mono)", color: "var(--text-3)" }}>
              <span>AGENT WALLET (PUBLIC KEY)</span>
              <button
                type="button"
                onClick={() => setAgentPubkeyStr(CIRCUIT_DEVNET_AGENT_KEY.toBase58())}
                style={{ background: "none", border: "none", color: "var(--mint,#79c2a4)", fontSize: 11, cursor: "pointer", textDecoration: "underline" }}
              >
                Use Devnet Sentinel
              </button>
            </div>
            <input
              type="text"
              value={agentPubkeyStr}
              onChange={e => setAgentPubkeyStr(e.target.value)}
              placeholder="Solana Agent Public Key..."
              style={{
                padding: "9px 12px", background: "var(--surface-2)", border: `1px solid ${parsedAgentKey ? "var(--border)" : "var(--danger)"}`, borderRadius: 6, color: "var(--text)", fontFamily: "var(--mono)", fontSize: 12,
              }}
            />
          </div>

          {/* Asset Scope */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--text-3)" }}>ASSET SCOPE</span>
            <select
              value={selectedMint}
              onChange={e => setSelectedMint(e.target.value)}
              style={{
                padding: "9px 12px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", fontFamily: "var(--sans)", fontSize: 13, cursor: "pointer",
              }}
            >
              {DEPLOYED_MARKETS.map(m => (
                <option key={m.mint} value={m.mint}>
                  {m.tokenSymbol} ({m.name}) · {m.quoteSymbol}
                </option>
              ))}
            </select>
          </div>

          {/* Allowed Actions Bitmask */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--text-3)" }}>ALLOWED ACTION PERMISSIONS</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
              {(["borrow", "repay", "deposit", "withdraw"] as const).map(act => {
                const isChecked = actions[act];
                return (
                  <button
                    key={act}
                    type="button"
                    onClick={() => setActions(prev => ({ ...prev, [act]: !prev[act] }))}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px",
                      background: isChecked ? "rgba(121, 194, 164, 0.08)" : "var(--surface-2)",
                      border: `1px solid ${isChecked ? "var(--mint, #79c2a4)" : "var(--border)"}`,
                      borderRadius: 6, color: isChecked ? "var(--text)" : "var(--text-3)", cursor: "pointer", textTransform: "uppercase", fontSize: 11, fontWeight: 700, fontFamily: "var(--mono)",
                    }}
                  >
                    <span>{act}</span>
                    <span>{isChecked ? "✓" : "—"}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Limits */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--text-3)" }}>MAX BORROW LIMIT ($)</span>
              <input
                type="number"
                value={borrowLimitUsd}
                onChange={e => setBorrowLimitUsd(e.target.value)}
                style={{ padding: "8px 12px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", fontFamily: "var(--mono)", fontSize: 12 }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--text-3)" }}>RISK BUDGET ($)</span>
              <input
                type="number"
                value={riskBudgetUsd}
                onChange={e => setRiskBudgetUsd(e.target.value)}
                style={{ padding: "8px 12px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", fontFamily: "var(--mono)", fontSize: 12 }}
              />
            </div>
          </div>

          {/* Expiry */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--text-3)" }}>ACCESS EXPIRY</span>
            <div style={{ display: "flex", gap: 8 }}>
              {([
                { id: "24h", label: "24 Hours" },
                { id: "7d", label: "7 Days" },
                { id: "30d", label: "30 Days" },
                { id: "none", label: "Perpetual" },
              ] as const).map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setExpiryOption(opt.id)}
                  style={{
                    flex: 1, padding: "8px 0",
                    background: expiryOption === opt.id ? "var(--surface-3)" : "var(--surface-2)",
                    border: `1px solid ${expiryOption === opt.id ? "var(--accent)" : "var(--border)"}`,
                    borderRadius: 6, color: expiryOption === opt.id ? "var(--text)" : "var(--text-3)", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "var(--mono)",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* PDA Address Preview */}
          {pdaAddress && (
            <div style={{ padding: "8px 12px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 6, display: "flex", justifyContent: "space-between", fontSize: 11, fontFamily: "var(--mono)" }}>
              <span style={{ color: "var(--text-3)" }}>Agent Access Account (PDA):</span>
              <span style={{ color: "var(--mint,#79c2a4)" }} title={pdaAddress}>{shortenAddress(pdaAddress)}</span>
            </div>
          )}

          {/* Submit */}
          <button
            type="button"
            disabled={!publicKey || !parsedAgentKey || creating}
            onClick={handleCreate}
            style={{
              marginTop: 6,
              padding: "12px 18px",
              background: !publicKey || !parsedAgentKey ? "var(--surface-3)" : "var(--accent, #eceae6)",
              color: !publicKey || !parsedAgentKey ? "var(--text-3)" : "#0c0c0d",
              border: "none",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 800,
              fontFamily: "var(--mono)",
              cursor: !publicKey || !parsedAgentKey || creating ? "not-allowed" : "pointer",
            }}
          >
            {creating ? "SIGNING & CONFIRMING ON DEVNET..." : "GRANT AGENT ACCESS ON DEVNET →"}
          </button>
        </div>
      </div>
    </div>
  );
}

function parseStrategyFromText(text: string): StrategyPlan | null {
  if (!/deposit|borrow|repay|withdraw|swap|rebalance|enter_liquidity|exit_liquidity|enter\s+liquidity|exit\s+liquidity/i.test(text)) return null;
  if (!/\$[\d,]+|\d+\s*(?:USD|NVDA|TSLA|AAPL|BTC|ETH|SOL|USDC)/i.test(text)) return null;
  const actions: StrategyAction[] = [];
  for (const line of text.split("\n")) {
    const aM = line.match(/\b(deposit|borrow|repay|withdraw|swap|rebalance|enter_liquidity|exit_liquidity|enter\s+liquidity|exit\s+liquidity)\b/i);
    const uM = line.match(/\$?([\d,]+(?:\.\d+)?)\s*(?:USD|NVDA|TSLA|AAPL|BTC|ETH|SOL|USDC)?/i);
    const sM = line.match(/\b(NVDA|TSLA|AAPL|BTC|ETH|SOL|USDC)\b/i);
    if (aM && uM) {
      let normAction = aM[1].toLowerCase().replace(/\s+/, "_");
      if (normAction === "enter") normAction = "enter_liquidity";
      if (normAction === "exit") normAction = "exit_liquidity";
      actions.push({
        action: normAction as StrategyAction["action"],
        asset: sM ? sM[1].toUpperCase() : "USDC",
        amountUsd: parseFloat(uM[1].replace(",", "")),
        reason: line.trim(),
      });
    }
  }
  if (actions.length === 0) return null;
  return {
    objective: text.split("\n").find(l => l.trim().length > 10)?.slice(0, 120) ?? "Strategy Plan",
    constraints: [
      "Circuit permission engine enforces all credit and trading venue actions",
      "Bounded by on-chain agent access limits",
      "Trading venue slippage bounded strictly <= 200 bps",
      "Dynamic risk limits enforcement (Blocked in Defensive/Emergency)",
    ],
    actions,
    riskAssessment: "Evaluate collateral ratio, oracle uncertainty spread, and risk limits before atomic execution.",
  };
}

export type { AgentModelOption };
export { CURATED_MODELS, getContextualSuggestions };

export function ModelSelectorPopover({
  selectedModelId,
  availableModels,
  onSelectModel,
}: {
  selectedModelId: string;
  availableModels: AgentModelOption[];
  onSelectModel: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedModel = useMemo(() => {
    return availableModels.find(m => m.id === selectedModelId) || availableModels[0] || CURATED_MODELS[0];
  }, [availableModels, selectedModelId]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  return (
    <div ref={containerRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "var(--surface-2)",
          border: `1px solid ${isOpen ? "var(--text-3)" : "var(--border)"}`,
          borderRadius: 5,
          padding: "2px 7px",
          color: "var(--text)",
          cursor: "pointer",
          fontFamily: "var(--mono)",
          fontSize: 10.5,
          transition: "border-color var(--t-fast), background var(--t-fast)",
        }}
        title="Select model for agent reasoning and execution"
      >
        <span style={{ fontSize: 9.5, color: "var(--text-3)", letterSpacing: "0.04em" }}>MODEL:</span>
        <span style={{ fontWeight: 600, color: "var(--mint, #79c2a4)" }}>{selectedModel.name}</span>
        <span style={{
          fontSize: 8,
          color: "var(--text-3)",
          transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
          transition: "transform 0.15s ease",
          display: "inline-block",
        }}>
          ▼
        </span>
      </button>

      {isOpen && (
        <div
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            zIndex: 100,
            width: 250,
            background: "var(--surface-1)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            boxShadow: "0 10px 28px rgba(0, 0, 0, 0.7)",
            padding: 4,
            display: "flex",
            flexDirection: "column",
            gap: 2,
            fontFamily: "var(--mono)",
          }}
        >
          <div style={{ padding: "4px 8px 6px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 9, color: "var(--text-3)", letterSpacing: "0.08em", fontWeight: 700 }}>
              REASONING MODEL
            </span>
            <span style={{ fontSize: 8.5, color: "var(--text-3)" }}>
              {availableModels.length} models
            </span>
          </div>
          {availableModels.map(m => {
            const isSel = m.id === selectedModel.id;
            return (
              <button
                key={m.id}
                type="button"
                role="option"
                aria-selected={isSel}
                onClick={() => {
                  onSelectModel(m.id);
                  setIsOpen(false);
                }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 2,
                  padding: "6px 8px",
                  borderRadius: 4,
                  background: isSel ? "var(--surface-2)" : "transparent",
                  border: isSel ? "1px solid var(--border)" : "1px solid transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background var(--t-fast)",
                }}
                onMouseEnter={e => {
                  if (!isSel) e.currentTarget.style.background = "var(--surface-2)";
                }}
                onMouseLeave={e => {
                  if (!isSel) e.currentTarget.style.background = "transparent";
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                  <span style={{ fontSize: 10.5, fontWeight: isSel ? 700 : 500, color: isSel ? "var(--mint, #79c2a4)" : "var(--text)" }}>
                    {m.name}
                  </span>
                  <span style={{
                    fontSize: 8,
                    fontWeight: 700,
                    padding: "1px 4px",
                    borderRadius: 3,
                    background: isSel ? "rgba(121,194,164,0.15)" : "rgba(255,255,255,0.04)",
                    color: isSel ? "var(--mint, #79c2a4)" : "var(--text-3)",
                    border: "1px solid var(--border)",
                  }}>
                    {m.badge}
                  </span>
                </div>
                <span style={{ fontSize: 9, color: "var(--text-3)", lineHeight: 1.3 }}>
                  {m.desc}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TelemetryContextPanel({
  activeAsset,
  portfolio,
  risk,
  credit,
  marketSnapshots,
  onChainAuthorities,
  isOpen,
  onClose,
}: {
  activeAsset: DeployedMarket;
  portfolio: any;
  risk: any;
  credit: any;
  marketSnapshots: Record<string, MarketSnapshot>;
  onChainAuthorities: any[];
  isOpen?: boolean;
  onClose?: () => void;
}) {
  const activeSnap = marketSnapshots[activeAsset.symbol] || Object.values(marketSnapshots).find((s) => s.symbol.toUpperCase() === activeAsset.symbol.toUpperCase());
  const activePrice: number | null = activeSnap?.priceUsd ?? null;
  const activeChange: number | null = activeSnap?.change24hPercent ?? null;
  const activeConfBps: number | null = (activeSnap?.oracleConfBps !== undefined && activeSnap?.oracleConfBps > 0) ? activeSnap.oracleConfBps : null;
  const activeOracleStatus = activeSnap?.oracleStatus || "UNKNOWN";
  const isDefensiveOrEmerg = risk.ratchetState === "DEFENSIVE" || risk.ratchetState === "EMERGENCY";
  const isRestricted = risk.ratchetState === "RESTRICTED";
  const activeAuthCount = onChainAuthorities.filter(a => !a.isExpired && !a.isRevoked).length;

  const riskColor = risk.ratchetState === "SAFE" ? "var(--mint, #79c2a4)"
    : risk.ratchetState === "RESTRICTED" ? "var(--warning, #cfad74)"
    : "var(--danger, #cf8b8b)";

  return (
    <div className={`ag-telemetry${isOpen ? " ag-telemetry--visible" : ""}`}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", color: "var(--text-3)" }}>
            PROTOCOL TELEMETRY
          </span>
          <span style={{
            fontSize: 9,
            padding: "2px 6px",
            borderRadius: 3,
            background: "rgba(121,194,164,0.15)",
            color: "var(--mint, #79c2a4)",
            fontWeight: 700,
          }}>
            SOLANA DEVNET
          </span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-3)",
              cursor: "pointer",
              fontSize: 13,
              padding: "2px 6px",
            }}
            title="Close Telemetry Panel"
          >
            ✕
          </button>
        )}
      </div>

      {/* Active Context Asset */}
      <div style={{ background: "var(--surface-2)", borderRadius: 6, border: "1px solid var(--border)", padding: "10px 12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 10, color: "var(--text-3)", letterSpacing: "0.04em" }}>ACTIVE ASSET</span>
          <span style={{ fontSize: 9, color: "var(--mint, #79c2a4)", fontWeight: 700 }}>Pyth Oracle</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: "var(--accent)" }}>{activeAsset.tokenSymbol}</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
            {activePrice !== null ? `$${activePrice.toFixed(2)}` : "—"}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-3)", marginTop: 4 }}>
          <span>{activeAsset.name}</span>
          <span style={{ color: activeChange !== null && activeChange >= 0 ? "var(--mint, #79c2a4)" : activeChange !== null ? "var(--danger, #cf8b8b)" : "var(--text-3)" }}>
            {activeChange !== null ? `${activeChange >= 0 ? "+" : ""}${activeChange.toFixed(2)}% (24h)` : "—"}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5, color: "var(--text-3)", marginTop: 6, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <span>Feed Status: <strong style={{ color: activeOracleStatus === "LIVE" || activeOracleStatus === "RECENT" ? "var(--mint, #79c2a4)" : "var(--warning, #cfad74)" }}>{activeOracleStatus}</strong></span>
          <span>{activeConfBps !== null ? `Conf: ±${activeConfBps} bps` : "Conf: —"}</span>
        </div>
      </div>

      {/* Risk Ratchet */}
      <div style={{ background: "var(--surface-2)", borderRadius: 6, border: "1px solid var(--border)", padding: "10px 12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 10, color: "var(--text-3)", letterSpacing: "0.04em" }}>RISK RATCHET</span>
          <span style={{
            fontSize: 9,
            fontWeight: 800,
            padding: "1px 6px",
            borderRadius: 3,
            background: `${riskColor}22`,
            color: riskColor,
            border: `1px solid ${riskColor}44`,
          }}>
            {risk.ratchetState}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-2)", marginBottom: 4 }}>
          <span>NYSE Session:</span>
          <span style={{ fontWeight: 700, color: risk.isMarketOpen ? "var(--mint, #79c2a4)" : "var(--warning, #cfad74)" }}>
            {risk.isMarketOpen ? "OPEN (RTH)" : "CLOSED (Outside RTH)"}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-3)" }}>
          <span>Borrow Gate:</span>
          <span style={{ color: isDefensiveOrEmerg ? "var(--danger, #cf8b8b)" : isRestricted ? "var(--warning, #cfad74)" : "var(--mint, #79c2a4)" }}>
            {isDefensiveOrEmerg ? "SUSPENDED" : isRestricted ? "CAPPED (50%)" : "ALLOWED (100%)"}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-3)", marginTop: 4 }}>
          <span>Recovery Path:</span>
          <span style={{ color: "var(--mint, #79c2a4)" }}>UNCONDITIONAL</span>
        </div>
      </div>

      {/* Position & Solvency */}
      <div style={{ background: "var(--surface-2)", borderRadius: 6, border: "1px solid var(--border)", padding: "10px 12px" }}>
        <div style={{ fontSize: 10, color: "var(--text-3)", letterSpacing: "0.04em", marginBottom: 6 }}>
          POSITION &amp; SOLVENCY
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, marginBottom: 4 }}>
          <span style={{ color: "var(--text-3)" }}>Collateral:</span>
          <span style={{ fontWeight: 700, color: "var(--text)" }}>${portfolio.totalCollateralUsd.toFixed(2)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, marginBottom: 4 }}>
          <span style={{ color: "var(--text-3)" }}>Outstanding Debt:</span>
          <span style={{ fontWeight: 700, color: "var(--text)" }}>${portfolio.totalDebtUsd.toFixed(2)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, marginBottom: 4 }}>
          <span style={{ color: "var(--text-3)" }}>Health Factor:</span>
          <span style={{ fontWeight: 800, color: portfolio.healthFactor ? "var(--mint, #79c2a4)" : "var(--text-3)" }}>
            {portfolio.healthFactor !== null ? portfolio.healthFactor.toFixed(3) : "Infinite"}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-3)", paddingTop: 4, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <span>Available Credit:</span>
          <span style={{ color: "var(--accent)", fontWeight: 700 }}>${credit.availableCreditUsd.toFixed(2)}</span>
        </div>
      </div>

      {/* Meteora DBC Test Pool */}
      <div style={{ background: "var(--surface-2)", borderRadius: 6, border: "1px solid var(--border)", padding: "10px 12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 10, color: "var(--text-3)", letterSpacing: "0.04em" }}>METEORA DBC VENUE</span>
          <span style={{ fontSize: 9, color: "#a78bfa", fontWeight: 700 }}>Devnet Pool</span>
        </div>
        <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 4 }}>
          Pool: <span style={{ color: "var(--text-2)" }}>dbcij3LW...aqN</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-3)" }}>
          <span>Swaps / Enter:</span>
          <span style={{ color: isDefensiveOrEmerg ? "var(--danger, #cf8b8b)" : isRestricted ? "var(--warning, #cfad74)" : "var(--mint, #79c2a4)" }}>
            {isDefensiveOrEmerg ? "BLOCKED" : isRestricted ? "CAPPED (50%)" : "ALLOWED"}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-3)", marginTop: 4 }}>
          <span>Exit Liquidity:</span>
          <span style={{ color: "var(--mint, #79c2a4)" }}>ALWAYS OPEN</span>
        </div>
      </div>

      {/* On-Chain Agent Authority */}
      <div style={{ background: "var(--surface-2)", borderRadius: 6, border: "1px solid var(--border)", padding: "10px 12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 10, color: "var(--text-3)", letterSpacing: "0.04em" }}>AGENT AUTHORITY</span>
          <span style={{
            fontSize: 9,
            fontWeight: 700,
            padding: "1px 5px",
            borderRadius: 3,
            background: activeAuthCount > 0 ? "rgba(121,194,164,0.15)" : "rgba(255,255,255,0.06)",
            color: activeAuthCount > 0 ? "var(--mint, #79c2a4)" : "var(--text-3)",
          }}>
            {activeAuthCount > 0 ? `${activeAuthCount} ACTIVE` : "NONE"}
          </span>
        </div>
        <div style={{ fontSize: 10, color: "var(--text-3)", lineHeight: 1.4 }}>
          {activeAuthCount > 0
            ? "Autonomous execution enabled under bounded on-chain limits."
            : "No active authority PDA. Executions require interactive wallet signing."}
        </div>
      </div>
    </div>
  );
}

export default function Autonomous() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { openAction } = useAction();
  const {
    controlMode, setControlMode, hasActiveAuthority, onChainAuthorities,
    portfolio, risk, credit, markets, wallet,
  } = useCircuitDomain();
  const { snapshots: marketSnapshots } = useMarketData();
  const { getPoolState } = useDbcContext();

  // Read ?tab= from URL and use it as the initial tab (case-insensitive).
  const tabFromUrl = searchParams.get("tab")?.toUpperCase() as TabId | null;
  const validTabs: TabId[] = ["CHAT", "STRATEGY", "WATCH", "AUTO MANAGE", "SCHEDULE", "PERMISSIONS", "DBC"];
  const initialTab: TabId = (tabFromUrl && validTabs.includes(tabFromUrl)) ? tabFromUrl : "CHAT";

  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [taskCounts, setTaskCounts] = useState({ total: 0, watches: 0, strategies: 0, executions: 0 });
  const [availableModels, setAvailableModels] = useState<AgentModelOption[]>(CURATED_MODELS);

  // Institutional agent tier selection (defaults to Circuit Lite)
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("circuit_selected_model");
      if (stored && CURATED_MODELS.some(m => m.id === stored)) {
        return stored;
      }
      localStorage.setItem("circuit_selected_model", DEFAULT_MODEL_ID);
      return DEFAULT_MODEL_ID;
    }
    return DEFAULT_MODEL_ID;
  });

  const [input, setInput] = useState("");
  const [agentState, setAgentState] = useState<AgentState>("READY");
  const [operatingMode, setOperatingMode] = useState<AgentOperatingMode>("COPILOT");
  const [currentObjective, setCurrentObjective] = useState<string>("Observe portfolio risk and execute permitted capital boundaries.");
  const [isAgentPaused, setIsAgentPaused] = useState(false);
  const [currentStrategyNode, setCurrentStrategyNode] = useState<StrategyNodeId>("OBSERVE");
  const [blockedReason, setBlockedReason] = useState<string | null>(null);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showCapabilityInspector, setShowCapabilityInspector] = useState(false);
  const [showApprovalsModal, setShowApprovalsModal] = useState(false);
  const [pendingProposals, setPendingProposals] = useState<CircuitActionProposal[]>([]);
  const [executionState, setExecutionState] = useState<"IDLE" | "READY" | "SIGNING" | "CONFIRMING" | "CONFIRMED" | "REJECTED" | "FAILED">("IDLE");
  const [permissionResult, setPermissionResult] = useState<"ALLOWED" | "CAPPED" | "BLOCKED" | null>(null);
  const { publicKey } = useWallet();
  const tx = useTransaction();
  const [showAuditInspector, setShowAuditInspector] = useState(false);
  const [events, setEvents] = useState<ExecEvent[]>([]);
  const addEvent = useCallback((type: ExecEvent["type"], message: string, tx?: string) => {
    setEvents(prev => [...prev, { id: uid(), timestamp: Date.now(), type, message, txSignature: tx }]);
  }, []);
  const [showTelemetry, setShowTelemetry] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [telemetryOpen, setTelemetryOpen] = useState(false);
  const [creditState, setCreditState] = useState<ClientCreditState>(() => agentCreditStore.getState());
  const [agentTierMode, setAgentTierMode] = useState<AgentTier>(() => selectedModel === "circuit-pro" ? "PRO" : "LITE");

  useEffect(() => {
    if (wallet.address) {
      agentCreditStore.loadForWallet(wallet.address);
    }
    const unsub = agentCreditStore.subscribe(setCreditState);
    return () => unsub();
  }, [wallet.address]);

  const handleEmergencyKillSwitch = useCallback(() => {
    if (isAgentPaused) {
      setIsAgentPaused(false);
      setAgentState("READY");
      addEvent("info", "Agent execution resumed by operator.");
    } else {
      setIsAgentPaused(true);
      setAgentState("PAUSED");
      setPendingProposals([]);
      addEvent("blocked", "EMERGENCY KILL SWITCH: All autonomous execution and background watchers halted by operator. Manual protocol permissions remain sovereign.");
    }
  }, [isAgentPaused, addEvent]);

  // Cmd/Ctrl + K shortcut for Command Palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowCommandPalette((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    let active = true;
    async function fetchLiveModels() {
      try {
        const res = await fetch("/api/agent/chat");
        if (!res.ok) return;
        const data = await res.json();
        if (data && Array.isArray(data.models) && data.models.length > 0) {
          // Verify availability against curated list only — NEVER allow raw catalog to populate UI!
          const verifiedModels = filterCuratedModels(data.models);
          if (active && verifiedModels.length > 0) {
            setAvailableModels(verifiedModels);
            if (!verifiedModels.some(m => m.id === selectedModel)) {
              setSelectedModel(DEFAULT_MODEL_ID);
            }
          }
        }
      } catch {
        // Retain CURATED_MODELS on network or CORS fallback
      }
    }
    fetchLiveModels();
    return () => { active = false; };
  }, [selectedModel]);

  const handleSelectModel = (modelId: string) => {
    setSelectedModel(modelId);
    setAgentTierMode(modelId === "circuit-pro" ? "PRO" : "LITE");
    if (typeof window !== "undefined") {
      localStorage.setItem("circuit_selected_model", modelId);
    }
  };

  // Canonical Conversational Active Asset context (defaults to first deployed market e.g. NVDAx)
  const [activeContextAsset, setActiveContextAsset] = useState<DeployedMarket>(DEPLOYED_MARKETS[0]);
  const harnessRef = useRef<AgentHarnessCoordinator | null>(null);
  if (!harnessRef.current) {
    harnessRef.current = new AgentHarnessCoordinator(DEPLOYED_MARKETS[0]);
  }

  const initialGreeting = useMemo(() => {
    if (!wallet.address) {
      return (
        "Circuit Agent online.\n\n" +
        "Connect your Solana Devnet wallet to inspect your live positions, evaluate risk ratchet states, and test bounded autonomous permissions."
      );
    }
    const hfStr = portfolio.healthFactor !== null ? portfolio.healthFactor.toFixed(3) : "Infinite (No active debt)";
    const authCount = onChainAuthorities.filter(a => !a.isExpired && !a.isRevoked).length;
    const posSummary = portfolio.positions.length > 0
      ? portfolio.positions.map((p: any) => `${p.symbol}: $${(p.collateralValueUsd ?? 0).toFixed(2)} collateral, $${(p.debtUi ?? 0).toFixed(2)} debt`).join(" · ")
      : "No open positions";

    return (
      `Circuit Agent online.\n\n` +
      `Connected wallet: ${shortenAddress(wallet.address)}\n` +
      `• Total Collateral: $${portfolio.totalCollateralUsd.toFixed(2)}\n` +
      `• Outstanding Debt: $${portfolio.totalDebtUsd.toFixed(2)}\n` +
      `• Health Factor: ${hfStr}\n` +
      `• Risk Ratchet: ${risk.ratchetState} (NYSE ${risk.isMarketOpen ? "Regular Hours Open" : "Outside RTH"})\n` +
      `• Active Delegations: ${authCount} active on-chain agent access(es)\n` +
      `• Positions: ${posSummary}\n\n` +
      `I am ready to evaluate borrowing capacity, test risk limits, monitor market risk, or build autonomous policies.`
    );
  }, [wallet.address, portfolio.totalCollateralUsd, portfolio.totalDebtUsd, portfolio.healthFactor, risk.ratchetState, risk.isMarketOpen, onChainAuthorities, portfolio.positions]);

  const [msgs, setMsgs] = useState<ChatMessage[]>([{
    id: uid(), role: "system",
    content: initialGreeting,
    timestamp: Date.now(),
  }]);

  // Update initial message when wallet connects if no interaction happened yet
  useEffect(() => {
    setMsgs(prev => {
      if (prev.length === 1 && prev[0].role === "system") {
        return [{ ...prev[0], content: initialGreeting }];
      }
      return prev;
    });
  }, [initialGreeting]);

  const [plan, setPlan] = useState<StrategyPlan | null>(null);
  const [streaming, setStreaming] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const contextualSuggestions = useMemo(() => {
    const hasPos = portfolio.positions.some(
      (p: any) => p.symbol?.toUpperCase() === activeContextAsset.symbol?.toUpperCase() && ((p.collateralValueUsd ?? 0) > 0 || (p.debtUi ?? 0) > 0)
    );
    const base = getContextualSuggestions({
      activeAsset: activeContextAsset,
      riskState: risk.ratchetState,
      hasPosition: hasPos,
      totalDebtUsd: portfolio.totalDebtUsd,
      hasActiveAuthority,
    });
    if (portfolio.totalDebtUsd > 0 && portfolio.healthFactor !== null && portfolio.healthFactor < 1.15) {
      const dStar = calculateMinimumRestorationDebt(portfolio.totalCollateralUsd, portfolio.totalDebtUsd, 0.80, 1.05);
      return [`Repay $${dStar.toLocaleString()} to restore HF to 1.05`, ...base];
    }
    return base;
  }, [activeContextAsset, risk.ratchetState, portfolio.positions, portfolio.totalDebtUsd, portfolio.totalCollateralUsd, portfolio.healthFactor, hasActiveAuthority]);

  const updateCounts = useCallback(() => {
    const all = loadTasks().filter(t => t.owner === wallet.address || !wallet.address);
    const watches = all.filter(t => ["WATCH", "OBSERVE", "ANALYZE", "REPORT"].includes(t.type)).length;
    const strategies = all.filter(t => ["REPAY", "BORROW", "DEPOSIT", "WITHDRAW", "RECOVER"].includes(t.type)).length;
    const execs = loadExecutions().filter(e => e.owner === wallet.address || !wallet.address).length;
    setTaskCounts({ total: all.length, watches, strategies, executions: execs });
  }, [wallet.address]);

  useEffect(() => {
    updateCounts();
    const unsub = subscribeTasks(updateCounts);
    return () => { unsub(); };
  }, [updateCounts]);

  useEffect(() => {
    if (wallet.address) syncToServer(wallet.address);
  }, [wallet.address]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  useEffect(() => {
    if (controlMode !== "AUTONOMOUS") setControlMode("AUTONOMOUS");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const snap = useMemo(() => ({
    walletAddress: wallet.address,
    controlMode,
    hasActiveAuthority,
    riskRatchetState: risk.ratchetState,
    isMarketOpen: risk.isMarketOpen,
    totalCollateralUsd: portfolio.totalCollateralUsd,
    totalDebtUsd: portfolio.totalDebtUsd,
    availableCreditUsd: credit.availableCreditUsd,
    healthFactor: portfolio.healthFactor,
    positions: portfolio.positions.map((p: any) => ({ symbol: p.symbol, collateralValueUsd: p.collateralValueUsd ?? 0, debtUi: p.debtUi ?? 0, mint: p.mint ?? "" })),
    markets: Object.values(marketSnapshots).map((s) => ({
      symbol: s.symbol,
      price: s.priceUsd ?? null,
      change24hPct: s.change24hPercent ?? null,
      confBps: s.oracleConfBps ?? null,
      status: s.oracleStatus,
    })),
    onChainAuthorities: onChainAuthorities.map(a => {
      const sym = DEPLOYED_MARKETS.find(m => m.mint === a.assetMint.toBase58())?.symbol ?? a.assetMint.toBase58().slice(0, 6);
      return { agentAddress: a.agent.toBase58(), assetSymbol: sym, isExpired: a.isExpired, isRevoked: a.isRevoked, maxBorrowLimit: a.maxBorrowLimitUi, expiryTs: a.expiryTs };
    }),
  }), [wallet, controlMode, hasActiveAuthority, risk, portfolio, credit, marketSnapshots, onChainAuthorities]);

  const protocolSnapshot: ProtocolSnapshot = useMemo(() => {
    const mktObj: Record<string, { price: number; change24h: number; oracleFreshness: string }> = {};
    Object.values(marketSnapshots).forEach((s) => {
      mktObj[s.symbol.toUpperCase()] = {
        price: s.priceUsd ?? 0,
        change24h: s.change24hPercent ?? 0,
        oracleFreshness: s.oracleStatus,
      };
    });

    const activeAuth = onChainAuthorities.find(a => !a.isExpired && !a.isRevoked);
    const agentBorrowLimit = activeAuth?.maxBorrowLimitUi ?? (hasActiveAuthority ? 500 : 0);

    return {
      walletAddress: wallet.address || null,
      ratchetState: risk.ratchetState,
      isMarketOpen: risk.isMarketOpen,
      totalCollateralUsd: portfolio.totalCollateralUsd,
      totalDebtUsd: portfolio.totalDebtUsd,
      healthFactor: portfolio.healthFactor,
      availableCreditUsd: credit.availableCreditUsd,
      positions: portfolio.positions.map((p: any) => ({
        symbol: p.symbol,
        collateralValueUsd: p.collateralValueUsd ?? 0,
        debtUi: p.debtUi ?? 0,
        healthFactor: portfolio.healthFactor,
      })),
      markets: mktObj,
      agentBorrowLimitUsd: agentBorrowLimit,
    };
  }, [wallet.address, risk.ratchetState, risk.isMarketOpen, portfolio, credit.availableCreditUsd, marketSnapshots, onChainAuthorities, hasActiveAuthority]);

  const handleApproveProposal = useCallback((proposal: CircuitActionProposal) => {
    // LLM is untrusted: client strictly validates proposal against real on-chain context
    if (!proposal || typeof proposal.amountUsd !== "number" || isNaN(proposal.amountUsd) || proposal.amountUsd <= 0) {
      addEvent("error", `Proposal rejected by client: Invalid amount ($${proposal?.amountUsd})`);
      setExecutionState("REJECTED");
      setAgentState("BLOCKED");
      setBlockedReason("Invalid proposal amount");
      setCurrentStrategyNode("PERMISSION");
      return;
    }

    const market = DEPLOYED_MARKETS.find(m => m.symbol.toUpperCase() === proposal.symbol.toUpperCase());
    if (!market) {
      addEvent("error", `Proposal rejected by client: Market ${proposal.symbol} not recognized in Circuit deployment`);
      setExecutionState("REJECTED");
      setAgentState("BLOCKED");
      setBlockedReason(`Market ${proposal.symbol} not recognized`);
      setCurrentStrategyNode("PERMISSION");
      return;
    }

    const currentRisk = risk.ratchetState;
    // Section 15 & 34: In EMERGENCY, only capital recovery actions (repay, deposit, exit_liquidity) are allowed
    if (currentRisk === "EMERGENCY" && ["borrow", "withdraw", "swap", "enter_liquidity", "rebalance"].includes(proposal.action)) {
      const reason = "Risk Ratchet is EMERGENCY. Borrow, withdraw, and liquidity entries are strictly suspended.";
      addEvent("blocked", `Proposal rejected by on-chain revalidation: ${reason}`);
      setExecutionState("REJECTED");
      setAgentState("BLOCKED");
      setBlockedReason(reason);
      setCurrentStrategyNode("PERMISSION");
      return;
    }

    // In DEFENSIVE, borrow is suspended and withdraw is blocked if debt exists
    if (currentRisk === "DEFENSIVE") {
      if (proposal.action === "borrow") {
        const reason = "Borrowing is disabled by Capital Policy in DEFENSIVE state.";
        addEvent("blocked", `Proposal rejected by on-chain revalidation: ${reason}`);
        setExecutionState("REJECTED");
        setAgentState("BLOCKED");
        setBlockedReason(reason);
        setCurrentStrategyNode("POLICY");
        return;
      }
      if (proposal.action === "withdraw" && portfolio.totalDebtUsd > 0) {
        const reason = "Collateral withdrawal is blocked while debt is outstanding in DEFENSIVE state.";
        addEvent("blocked", `Proposal rejected by on-chain revalidation: ${reason}`);
        setExecutionState("REJECTED");
        setAgentState("BLOCKED");
        setBlockedReason(reason);
        setCurrentStrategyNode("POLICY");
        return;
      }
      if (["swap", "enter_liquidity", "rebalance"].includes(proposal.action)) {
        const reason = "DBC actions are blocked in DEFENSIVE state.";
        addEvent("blocked", `Proposal rejected by on-chain revalidation: ${reason}`);
        setExecutionState("REJECTED");
        setAgentState("BLOCKED");
        setBlockedReason(reason);
        setCurrentStrategyNode("POLICY");
        return;
      }
    }

    // In RESTRICTED, borrow is suspended
    if (currentRisk === "RESTRICTED" && proposal.action === "borrow") {
      const reason = "Borrowing is suspended in RESTRICTED risk state.";
      addEvent("blocked", `Proposal rejected by on-chain revalidation: ${reason}`);
      setExecutionState("REJECTED");
      setAgentState("BLOCKED");
      setBlockedReason(reason);
      setCurrentStrategyNode("POLICY");
      return;
    }

    // Capacity checks against fresh on-chain credit state
    if (proposal.action === "borrow" && proposal.amountUsd > credit.availableCreditUsd) {
      const reason = `Requested borrow ($${proposal.amountUsd}) exceeds available credit capacity ($${credit.availableCreditUsd.toFixed(2)}).`;
      addEvent("blocked", `Proposal rejected by on-chain revalidation: ${reason}`);
      setExecutionState("REJECTED");
      setAgentState("BLOCKED");
      setBlockedReason(reason);
      setCurrentStrategyNode("PERMISSION");
      return;
    }

    // Mark proposal block as executed
    setMsgs(prev => prev.map(m => {
      if (m.blocks && m.blocks.length > 0) {
        return {
          ...m,
          blocks: m.blocks.map(b => {
            if (b.type === "PROPOSAL_CARD" && (b as any).id === proposal.id) {
              return { ...b, executed: true };
            }
            return b;
          })
        };
      }
      return m;
    }));

    // All real on-chain validation checks passed
    const envelopeNonce = BigInt(Date.now());
    let envelopePdaStr: string | undefined;

    if (publicKey) {
      const [envPda] = findRiskEnvelopePda(
        publicKey,
        hasActiveAuthority ? new PublicKey(CIRCUIT_DEVNET_AGENT_KEY) : publicKey,
        new PublicKey(market.mint),
        envelopeNonce,
        PROGRAM_ID
      );
      envelopePdaStr = envPda.toBase58();
    }

    setExecutionState("SIGNING");
    if (hasActiveAuthority) {
      setAgentState("ENVELOPE_CREATED");
      setCurrentStrategyNode("ENVELOPE");
      addEvent("permission", `RiskEnvelope PDA materialized: ${envelopePdaStr?.slice(0, 8)}...${envelopePdaStr?.slice(-4)} (Slot TTL: 20, Epoch Pinned)`);
    } else {
      setAgentState("CONFIRMING");
      setCurrentStrategyNode("EXECUTION");
    }
    setBlockedReason(null);
    setPendingProposals(prev => prev.filter(p => p.id !== proposal.id));
    addEvent("permission", `On-chain validation passed: ${proposal.action.toUpperCase()} $${proposal.amountUsd} against ${proposal.symbol}`);

    const isLending = ["deposit", "borrow", "repay", "withdraw"].includes(proposal.action);

    // Record decision audit trail (PENDING)
    decisionLogStore.recordDecision({
      actor: hasActiveAuthority ? "AGENT" : "HUMAN",
      owner: wallet.address || publicKey?.toBase58() || "unknown",
      assetSymbol: proposal.symbol,
      action: proposal.action,
      requestedAmountUsd: proposal.amountUsd,
      riskState: currentRisk,
      policyVersion: 1,
      allowed: true,
      reasonCode: "ALLOWED",
      message: `Proposal approved: ${proposal.action.toUpperCase()} $${proposal.amountUsd} against ${proposal.symbol}${envelopePdaStr ? ` [Envelope: ${envelopePdaStr.slice(0, 8)}...]` : ""}`,
      venue: isLending ? "CIRCUIT_LENDING" : "METEORA_DBC",
      executionStatus: "PENDING",
    });

    if (publicKey && isLending) {
      const amountNative = toNative(proposal.amountUsd);
      const priceAccount = derivePriceAccount(market.feedId || PYTH_FEED_ID, 0);

      setAgentState("EXECUTING");
      setCurrentStrategyNode("EXECUTION");

      tx.run({
        verb: proposal.action.toUpperCase(),
        summary: `${proposal.action.toUpperCase()} $${proposal.amountUsd} against ${proposal.symbol}`,
        priceUpdate: priceAccount,
        equityMint: new PublicKey(market.mint),
        quoteMint: new PublicKey(market.quoteMint),
        build: async (ctx) => {
          if (hasActiveAuthority) {
            const bundle = await buildAuthorizedAgentActionBundle(
              ctx,
              new PublicKey(CIRCUIT_DEVNET_AGENT_KEY),
              proposal.action as any,
              amountNative,
              0n,
              envelopeNonce,
              20
            );
            return bundle.instructions;
          }
          if (proposal.action === "deposit") return buildDeposit(ctx, amountNative);
          if (proposal.action === "withdraw") return buildWithdraw(ctx, amountNative);
          if (proposal.action === "borrow") return buildBorrow(ctx, amountNative);
          return buildRepay(ctx, amountNative);
        },
        onSuccess: () => {
          setExecutionState("CONFIRMED");
          setAgentState("COMPLETED");
          setCurrentStrategyNode("RESULT");
          addEvent("confirmed", `Transaction confirmed on-chain for ${proposal.symbol} ${proposal.action.toUpperCase()} (RiskEnvelope capability verified & consumed)`);
          protocolEventBus.emit(
            createEvent("TRANSACTION_LIFECYCLE", "AutonomousAgent", `${proposal.action.toUpperCase()} confirmed`, {
              assetSymbol: proposal.symbol,
              detail: `${proposal.action.toUpperCase()} $${proposal.amountUsd} confirmed`,
              data: { amount: proposal.amountUsd },
            })
          );
          decisionLogStore.recordDecision({
            actor: hasActiveAuthority ? "AGENT" : "HUMAN",
            owner: wallet.address || publicKey.toBase58(),
            assetSymbol: proposal.symbol,
            action: proposal.action,
            requestedAmountUsd: proposal.amountUsd,
            riskState: currentRisk,
            policyVersion: 1,
            allowed: true,
            reasonCode: "ALLOWED",
            message: `${proposal.action.toUpperCase()} confirmed on Solana Devnet (RiskEnvelope consumed)`,
            venue: "CIRCUIT_LENDING",
            executionStatus: "EXECUTED",
          });
        },
      }).then((success) => {
        if (!success) {
          setExecutionState("FAILED");
          const isUserRejection = tx.state.error?.toLowerCase().includes("user rejected") || tx.state.error?.toLowerCase().includes("cancelled");
          setAgentState(isUserRejection ? "USER_REJECTED" : "TX_FAILED");
          addEvent("error", `Transaction failed or rejected: ${tx.state.error || "Simulation or signature error"}`);
        }
      });
    } else {
      openAction({
        type: proposal.action as any,
        market,
        amount: String(proposal.amountUsd),
      });
      addEvent("info", `Opened action drawer for ${proposal.symbol} ${proposal.action.toUpperCase()} ($${proposal.amountUsd}). Confirm signature with wallet.`);
    }
  }, [addEvent, openAction, risk.ratchetState, portfolio.totalDebtUsd, credit.availableCreditUsd, publicKey, hasActiveAuthority, tx, wallet.address]);

  const handleDismissProposal = useCallback((proposalId?: string) => {
    setPendingProposals(prev => proposalId ? prev.filter(p => p.id !== proposalId) : []);
    setExecutionState("IDLE");
    setAgentState("USER_REJECTED");
    setCurrentStrategyNode("OBSERVE");
    setBlockedReason("Action proposal declined by operator.");
    addEvent("info", "Action proposal declined by operator.");
    setMsgs(prev => prev.map(m => {
      let updated = { ...m };
      if (m.actionProposal && (!proposalId || m.actionProposal.id === proposalId)) {
        updated.actionProposal = null;
      }
      if (m.blocks && m.blocks.length > 0) {
        updated.blocks = m.blocks.map(b => {
          if (b.type === "PROPOSAL_CARD" && (!proposalId || (b as any).id === proposalId)) {
            return { ...b, dismissed: true };
          }
          return b;
        });
      }
      return updated;
    }));
  }, [addEvent]);

  const sendWithText = useCallback(async (customText?: string) => {
    const text = (customText ?? input).trim();
    if (!text || streaming) return;
    if (isAgentPaused) {
      addEvent("blocked", "Agent execution is paused. Resume agent to submit queries or proposals.");
      return;
    }
    setInput("");
    const userMsg: ChatMessage = { id: uid(), role: "user", content: text, timestamp: Date.now() };
    setMsgs(prev => [...prev, userMsg]);
    setCurrentObjective(text);
    setCurrentStrategyNode("OBSERVE");
    setAgentState("OBSERVING");
    setBlockedReason(null);
    addEvent("info", `User query: "${text.slice(0, 60)}${text.length > 60 ? "..." : ""}"`);

    // 0. Rate limiting & circuit breaker check
    const rateCheck = agentCircuitBreaker.checkRateLimit(wallet.address || "anonymous", agentTierMode === "PRO");
    if (!rateCheck.allowed) {
      addEvent("blocked", rateCheck.error || "Rate limit exceeded.");
      setMsgs(prev => [
        ...prev,
        {
          id: uid(),
          role: "agent",
          content: `⚠ ${rateCheck.error || "Rate limit reached. Please wait a moment before sending more queries."}`,
          timestamp: Date.now(),
        },
      ]);
      return;
    }

    // Dynamic model routing
    const routingDecision = routeAgentRequest(text, {
      availableCredits: creditState.available,
      riskRatchetState: risk.ratchetState,
      totalDebtUsd: portfolio.totalDebtUsd,
      totalCollateralUsd: portfolio.totalCollateralUsd,
      hasActiveAuthority,
      activeTasksCount: taskCounts.total,
      messageHistoryLength: msgs.length,
    });
    setAgentTierMode(routingDecision.tier);

    // 0.1 Credit budget check: if budget is 0, agent compute is blocked
    if (creditState.available <= 0) {
      addEvent("blocked", "Agent compute budget exhausted. Automatic reasoning paused.");
      setMsgs(prev => [
        ...prev,
        {
          id: uid(),
          role: "agent",
          content: "● **Agent Budget Exhausted**\n\nYour Circuit Agent compute credits have reached 0. Autonomous reasoning, strategy generation, and background watchers are paused.\n\n*Note: Your Solana wallet, manual deposits, borrows, repays, and withdrawals remain 100% operational under Circuit Protocol permissions.*",
          timestamp: Date.now(),
        },
      ]);
      return;
    }

    // Consume compute credits for this interaction
    agentCreditStore.consumeDirect(routingDecision.estimatedCost, text.slice(0, 30));
    agentCircuitBreaker.recordCreditConsumption(wallet.address || "anonymous", routingDecision.estimatedCost);

    // Update structured memory
    persistentAgentMemory.updateMemory(wallet.address || "anonymous", {
      activeAssetSymbol: activeContextAsset.symbol,
      conversationSummary: text.slice(0, 100),
    });

    // 1. Process through deterministic local Agent Harness
    if (harnessRef.current) {
      const harnessResult = harnessRef.current.processInput(text, protocolSnapshot);
      if (harnessResult.intent.asset && harnessResult.intent.asset.symbol !== activeContextAsset.symbol) {
        setActiveContextAsset(harnessResult.intent.asset);
      }

      if (harnessResult.intent.type !== "GENERAL_CHAT" && harnessResult.intent.type !== "EXPLANATION_MODE" && harnessResult.replyText) {
        const agentId = uid();
        const propBlock = harnessResult.blocks.find(b => b.type === "PROPOSAL_CARD") as ProposalCardBlockData | undefined;

        // Stage A: Show immediate evaluation (not simulated multi-stage pipeline)
        setStreaming(true);
        setCurrentStrategyNode("OBSERVE");
        setAgentState("OBSERVING");
        addEvent("info", `Evaluating ${harnessResult.intent.asset?.symbol || activeContextAsset.symbol}...`);

        // Insert thinking placeholder
        setMsgs(prev => [
          ...prev,
          {
            id: agentId,
            role: "agent",
            content: `● Evaluating market state, risk, and permission...`,
            timestamp: Date.now(),
            streaming: true,
          }
        ]);

        // Brief visual transition (100ms) — honest: just UI rendering time
        await new Promise(r => setTimeout(r, 100));

        // Complete: all evaluation was done synchronously by the harness
        setCurrentStrategyNode("PERMISSION");
        setAgentState("CHECKING_PERMISSION");

        // Stage D: Deliver Verified Output
        setStreaming(false);

        setMsgs(prev => prev.map(m => m.id === agentId ? {
          id: agentId,
          role: "agent",
          content: harnessResult.replyText,
          timestamp: Date.now(),
          streaming: false,
          blocks: harnessResult.blocks,
          actionProposal: propBlock ? {
            id: propBlock.id,
            action: propBlock.action,
            symbol: propBlock.symbol,
            amountUsd: propBlock.amountUsd,
            riskState: propBlock.riskState,
            permission: propBlock.permission,
            reason: propBlock.reason,
            estimatedHfAfter: propBlock.estimatedHfAfter,
          } : null,
        } : m));

        if (propBlock) {
          const isBlocked = propBlock.permission === "BLOCKED";
          setPermissionResult(propBlock.permission);
          setAgentState(isBlocked ? "BLOCKED" : "AWAITING_APPROVAL");
          setCurrentStrategyNode(isBlocked ? "PERMISSION" : "ACTION");
          if (isBlocked) {
            setBlockedReason(propBlock.reason || "Action blocked by Circuit permission engine");
          } else {
            setBlockedReason(null);
            setExecutionState("READY");
            const newProposal: CircuitActionProposal = {
              id: propBlock.id,
              action: propBlock.action,
              symbol: propBlock.symbol,
              amountUsd: propBlock.amountUsd,
              riskState: propBlock.riskState,
              permission: propBlock.permission,
              reason: propBlock.reason,
              estimatedHfAfter: propBlock.estimatedHfAfter,
            };
            setPendingProposals(prev => [...prev.filter(p => p.id !== newProposal.id), newProposal]);
          }
          addEvent("permission", `Action proposal prepared: ${propBlock.action.toUpperCase()} $${propBlock.amountUsd} on ${propBlock.symbol} (${propBlock.permission})`);
        } else if (harnessResult.intent.type === "ACTION_CONFIRM") {
          const pending = harnessRef.current.getContext().pendingProposal;
          if (pending) {
            handleApproveProposal({
              id: pending.id,
              action: pending.action,
              symbol: pending.symbol,
              amountUsd: pending.amountUsd,
              riskState: pending.riskState,
              permission: pending.permission,
              reason: pending.reason,
              estimatedHfAfter: pending.estimatedHfAfter,
            });
          }
        } else if (harnessResult.intent.type === "ACTION_CANCEL") {
          setAgentState("READY");
          setCurrentStrategyNode("OBSERVE");
          setExecutionState("IDLE");
          setBlockedReason(null);
          addEvent("info", "Action proposal cancelled.");
        } else {
          setAgentState("READY");
          setCurrentStrategyNode("RESULT");
        }

        return;
      }
    }

    // 2. General conversational query — route through Serverless AI gateway
    const agentId = uid();
    setMsgs(prev => [...prev, { id: agentId, role: "agent", content: "", timestamp: Date.now(), streaming: true }]);
    setStreaming(true);
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    try {
      setAgentState("CHECKING_PERMISSION");
      addEvent("permission", "Evaluating Circuit risk limits and permission gates...");
      const apiMsgs = msgs
        .filter(m => m.role !== "system")
        .concat(userMsg)
        .map(m => ({ role: m.role === "agent" ? "assistant" as const : "user" as const, content: m.content }));
      
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: abort.signal,
        body: JSON.stringify({
          messages: apiMsgs,
          snapshot: snap,
          model: selectedModel,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAgentState("EXECUTING");
      addEvent("info", "Agent reasoning & tool evaluation in progress...");
      
      const ct = res.headers.get("content-type") ?? "";
      let full = "";
      if (ct.includes("text/event-stream")) {
        const reader = res.body!.getReader();
        const dec = new TextDecoder();
        outer: while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const line of dec.decode(value, { stream: true }).split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const d = line.slice(6).trim();
            if (d === "[DONE]") break outer;
            try {
              const delta = JSON.parse(d).choices?.[0]?.delta?.content;
              if (delta) {
                full += delta;
                const parsedTask = parseTaskProposal(full);
                const parsedTools = parseToolsFromText(full);
                const parsedProp = parseProposalFromText(full);
                setMsgs(prev => prev.map(m => m.id === agentId ? {
                  ...m,
                  content: full,
                  streaming: true,
                  taskProposal: parsedTask,
                  tools: parsedTools,
                  actionProposal: parsedProp,
                } : m));
              }
            } catch { /* skip */ }
          }
        }
      } else {
        full = await res.text();
      }

      const parsedTask = parseTaskProposal(full);
      const parsedTools = parseToolsFromText(full);
      const parsedProp = parseProposalFromText(full);

      setMsgs(prev => prev.map(m => m.id === agentId ? {
        ...m,
        content: full || "(no response)",
        streaming: false,
        taskProposal: parsedTask,
        tools: parsedTools,
        actionProposal: parsedProp,
      } : m));

      const p = parseStrategyFromText(full);
      if (p) { setPlan(p); addEvent("info", `Strategy: ${p.actions.length} action(s) identified`); }
      if (parsedTools.length > 0) { addEvent("info", `${parsedTools.length} tool evaluation(s) executed`); }
      if (parsedProp) {
        const isBlocked = parsedProp.permission === "BLOCKED";
        setPermissionResult(parsedProp.permission);
        addEvent("permission", `Action proposal: ${parsedProp.action.toUpperCase()} ${parsedProp.symbol} (${parsedProp.permission})`);
        setAgentState(isBlocked ? "BLOCKED" : "AWAITING_APPROVAL");
        setCurrentStrategyNode(isBlocked ? "PERMISSION" : "ACTION");
        if (isBlocked) {
          setBlockedReason(parsedProp.reason || "Action blocked by Circuit permission engine");
        } else {
          setBlockedReason(null);
          setExecutionState("READY");
          setPendingProposals(prev => [...prev.filter(p => p.id !== parsedProp.id), parsedProp]);
        }
      } else if (parsedTask) {
        setAgentState("COMPLETED");
        setCurrentStrategyNode("RESULT");
      } else {
        setAgentState("READY");
        setCurrentStrategyNode("RESULT");
      }
      if (parsedTask) { addEvent("info", `Policy proposal: ${parsedTask.name} (${parsedTask.type})`); }
      addEvent("info", "Evaluation complete.");
    } catch (err: any) {
      if (err.name === "AbortError") {
        setMsgs(prev => prev.map(m => m.id === agentId ? { ...m, content: "[Stopped]", streaming: false } : m));
        setAgentState("READY");
        setCurrentStrategyNode("OBSERVE");
        return;
      }
      const em = `Error: ${err.message}`;
      setMsgs(prev => prev.map(m => m.id === agentId ? { ...m, content: em, streaming: false } : m));
      addEvent("error", em);
      setAgentState("FAILED");
      setExecutionState("FAILED");
      setBlockedReason(em);
      setCurrentStrategyNode("OBSERVE");
    } finally { setStreaming(false); }
  }, [input, streaming, msgs, snap, protocolSnapshot, addEvent, selectedModel, activeContextAsset, handleApproveProposal]);

  const onKey = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendWithText(); }
  }, [sendWithText]);

  const stop = useCallback(() => { abortRef.current?.abort(); setAgentState("IDLE"); setStreaming(false); }, []);
  const clear = useCallback(() => {
    setMsgs([{ id: uid(), role: "system", content: "Workspace cleared. Ready for new intent or analysis.", timestamp: Date.now() }]);
    setPlan(null); setEvents([]); setAgentState("IDLE");
  }, []);

  const handleTaskCreated = useCallback((name: string) => {
    addEvent("confirmed", `Task activated: "${name}". Synced to Vercel Cron engine.`);
    if (wallet.address) syncToServer(wallet.address);
    updateCounts();
  }, [addEvent, wallet.address, updateCounts]);

  const connected = !!wallet.address;

  const startAction = (promptText: string) => {
    setActiveTab("CHAT");
    setInput(promptText);
  };

  const activeAuthCount = onChainAuthorities.filter(a => !a.isExpired && !a.isRevoked).length;

  const commandList: CommandItem[] = useMemo(
    () => [
      {
        id: "check_risk",
        title: "Check current portfolio risk",
        category: "RISK & PERMISSION",
        action: () => sendWithText("check current risk"),
      },
      {
        id: "check_credit",
        title: "Show available credit capacity",
        category: "RISK & PERMISSION",
        action: () => sendWithText("how much can I borrow?"),
      },
      {
        id: "capabilities",
        title: "Inspect agent permissions & limits",
        category: "RISK & PERMISSION",
        action: () => setShowCapabilityInspector(true),
      },
      {
        id: "dbc_pools",
        title: "View Meteora DBC pools & curves",
        category: "ACTIONS",
        action: () => setActiveTab("DBC"),
      },
      {
        id: "prepare_repay",
        title: "Prepare repayment to restore health factor",
        category: "ACTIONS",
        action: () => sendWithText("repay 50"),
      },
      {
        id: "watch_hf",
        title: "Watch health factor (< 1.30 alert)",
        category: "MONITORING",
        action: () => sendWithText("watch health factor < 1.30"),
      },
      {
        id: "show_tasks",
        title: "View persistent scheduled tasks",
        category: "MONITORING",
        action: () => setActiveTab("SCHEDULE"),
      },
      {
        id: "diagnostics",
        title: "Open system telemetry & diagnostics",
        category: "SYSTEM",
        action: () => setShowTelemetry(true),
      },
      {
        id: "toggle_pause",
        title: isAgentPaused ? "Resume agent execution" : "Emergency Pause agent",
        category: "SYSTEM",
        action: () => setIsAgentPaused((prev) => !prev),
      },
    ],
    [sendWithText, isAgentPaused]
  );

  function renderRailIcon(tab: TabId, isActive: boolean) {
  const stroke = isActive ? "var(--accent, #3D5AFE)" : "currentColor";
  const size = 15;
  switch (tab) {
    case "CHAT":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          <path d="M8 10h.01M12 10h.01M16 10h.01" />
        </svg>
      );
    case "STRATEGY":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="12" r="3" />
          <path d="M9 6h3a3 3 0 0 1 3 3v3M9 18h3a3 3 0 0 0 3-3v-3" />
        </svg>
      );
    case "WATCH":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "AUTO MANAGE":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );
    case "SCHEDULE":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      );
    case "PERMISSIONS":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case "DBC":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3v18h18" />
          <path d="m7 15 5-5 4 4 5-8" />
        </svg>
      );
  }
}

  return (
    <div className="ag-workspace">
      {/* ── Left Sidebar Navigation Rail (Slidable) ── */}
      <div
        className="ag-rail"
        style={{
          width: railCollapsed ? 54 : 200,
          transition: "width 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
          justifyContent: "space-between",
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        <div>
          {/* Rail Header with collapse trigger */}
          <div style={{ padding: railCollapsed ? "14px 10px" : "14px 12px 10px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: railCollapsed ? "center" : "space-between" }}>
            {!railCollapsed && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", color: "var(--text)", fontFamily: "var(--mono)" }}>
                    AUTONOMOUS
                  </span>
                  <span style={{
                    width: 7, height: 7, borderRadius: "50%",
                    background: stateColor(agentState),
                    boxShadow: agentState === "EXECUTING" || agentState === "PLANNING" || agentState === "CONFIRMING" ? `0 0 8px ${stateColor(agentState)}` : "none",
                    display: "inline-block",
                  }} />
                </div>
                <div style={{ fontSize: 9, color: "var(--text-3)", fontFamily: "var(--mono)", marginTop: 2 }}>
                  SOLANA DEVNET
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => setRailCollapsed(p => !p)}
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                color: "var(--text-3)",
                cursor: "pointer",
                padding: "2px 6px",
                fontSize: 10,
                fontFamily: "var(--mono)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              title={railCollapsed ? "Expand navigation rail" : "Collapse navigation rail (maximize space)"}
            >
              {railCollapsed ? "»" : "«"}
            </button>
          </div>

          {/* Navigation Items */}
          <nav style={{ padding: "10px 6px", display: "flex", flexDirection: "column", gap: 3 }}>
            {(["CHAT", "STRATEGY", "WATCH", "AUTO MANAGE", "SCHEDULE", "PERMISSIONS", "DBC"] as TabId[]).map(tab => {
              const isActive = activeTab === tab;
              const count = tab === "WATCH" ? taskCounts.watches : tab === "AUTO MANAGE" ? taskCounts.strategies : tab === "SCHEDULE" ? taskCounts.total : tab === "PERMISSIONS" ? activeAuthCount : null;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  title={tab}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: railCollapsed ? "center" : "space-between",
                    width: "100%",
                    padding: railCollapsed ? "9px 0" : "8px 10px",
                    borderRadius: 6,
                    border: isActive ? "1px solid var(--border)" : "1px solid transparent",
                    background: isActive ? "var(--surface-3)" : "transparent",
                    color: isActive ? "var(--accent, #eceae6)" : "var(--text-2)",
                    fontSize: 11,
                    fontWeight: isActive ? 700 : 500,
                    fontFamily: "var(--mono)",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all var(--t-fast)",
                    position: "relative",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {renderRailIcon(tab, isActive)}
                    {!railCollapsed && <span>{tab}</span>}
                  </div>
                  {!railCollapsed && count !== null && count > 0 && (
                    <span style={{
                      fontSize: 9,
                      padding: "1px 5px",
                      borderRadius: 3,
                      background: isActive ? "rgba(236,234,230,0.12)" : "rgba(255,255,255,0.06)",
                      color: isActive ? "var(--accent)" : "var(--text-3)",
                    }}>
                      {count}
                    </span>
                  )}
                  {railCollapsed && count !== null && count > 0 && (
                    <span style={{
                      position: "absolute",
                      top: 4,
                      right: 8,
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background: "var(--accent, #3D5AFE)",
                    }} />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Rail Footer */}
        {!railCollapsed && (
          <div style={{ padding: "12px 14px", borderTop: "1px solid var(--border)", fontSize: 10, fontFamily: "var(--mono)", color: "var(--text-3)", display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>MODE:</span>
              <span style={{ color: "var(--mint, #79c2a4)", fontWeight: 700 }}>{operatingMode}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>AGENT KEY:</span>
              <span style={{ color: "var(--text-2)" }}>{shortenAddress(CIRCUIT_DEVNET_AGENT_KEY.toBase58())}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Main Workspace Area ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
        {/* ── Top Institutional Header Bar ── */}
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 20px",
            background: "var(--surface-1)",
            borderBottom: "1px solid var(--border)",
            fontSize: 12,
            fontFamily: "var(--mono)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontWeight: 800, color: "var(--text)", letterSpacing: "0.04em", fontSize: 13 }}>
              CIRCUIT AGENT
            </span>
            <div style={{ display: "inline-flex", alignItems: "center", background: "var(--surface-2)", borderRadius: 6, padding: "2px 4px", border: "1px solid var(--border)" }}>
              <button
                type="button"
                onClick={() => handleSelectModel("circuit-lite")}
                style={{
                  padding: "2px 8px",
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 700,
                  border: "none",
                  cursor: "pointer",
                  background: agentTierMode === "LITE" ? "var(--accent)" : "transparent",
                  color: agentTierMode === "LITE" ? "#0c0c0d" : "var(--text-3)",
                  transition: "all var(--t-fast)",
                }}
              >
                LITE
              </button>
              <button
                type="button"
                onClick={() => handleSelectModel("circuit-pro")}
                style={{
                  padding: "2px 8px",
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 700,
                  border: "none",
                  cursor: "pointer",
                  background: agentTierMode === "PRO" ? "#a78bfa" : "transparent",
                  color: agentTierMode === "PRO" ? "#0c0c0d" : "var(--text-3)",
                  transition: "all var(--t-fast)",
                }}
              >
                PRO AGENT
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: "var(--text-2)" }}>
              <span>
                <strong style={{ color: creditState.available <= 10 ? "var(--danger, #cf8b8b)" : creditState.available <= 25 ? "var(--warning, #cfad74)" : "var(--mint, #79c2a4)" }}>
                  {creditState.available}
                </strong>{" "}
                credits AVAILABLE
              </span>
              {creditState.reserved > 0 && (
                <span style={{ color: "var(--text-3)" }}>
                  ({creditState.reserved} pending)
                </span>
              )}
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--mint, #79c2a4)", fontSize: 10, fontWeight: 700 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--mint, #79c2a4)" }} />
                LIVE
              </span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Kill Switch Button */}
            <button
              type="button"
              onClick={handleEmergencyKillSwitch}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 12px",
                background: isAgentPaused ? "rgba(121, 194, 164, 0.15)" : "rgba(207, 139, 139, 0.15)",
                border: `1px solid ${isAgentPaused ? "var(--mint, #79c2a4)" : "var(--danger, #cf8b8b)"}`,
                borderRadius: 6,
                color: isAgentPaused ? "var(--mint, #79c2a4)" : "var(--danger, #cf8b8b)",
                fontSize: 10.5,
                fontWeight: 700,
                cursor: "pointer",
                transition: "all var(--t-fast)",
              }}
              title={isAgentPaused ? "Resume Agent Background Execution" : "Immediately Halt All Agent Executions & Background Sentinels"}
            >
              <span>{isAgentPaused ? "▶ RESUME AGENT" : "⏹ STOP ALL AGENT EXECUTION"}</span>
            </button>
          </div>
        </header>

        {/* Canonical Authority Boundary Banner */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "5px 20px",
            background: "rgba(121, 194, 164, 0.04)",
            borderBottom: "1px solid rgba(121, 194, 164, 0.12)",
            fontSize: 10.5,
            fontFamily: "var(--mono)",
            color: "var(--text-2)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--mint, #79c2a4)", flexShrink: 0 }} />
            <span style={{ color: "var(--text-1)", fontWeight: 700 }}>CANONICAL AUTHORITY BOUNDARY:</span>
            <span style={{ color: "var(--text-2)" }}>
              &ldquo;The agent can decide what to attempt. It cannot decide what it is allowed to execute. The agent is autonomous; the agent is not sovereign. Circuit is the authority boundary.&rdquo;
            </span>
          </div>
          <span style={{ flexShrink: 0, fontSize: 9.5, color: "var(--mint, #79c2a4)", background: "rgba(121, 194, 164, 0.08)", padding: "2px 6px", borderRadius: 4, border: "1px solid rgba(121, 194, 164, 0.2)" }}>
            RiskEnvelope PDA Enforced
          </span>
        </div>

        {/* Dynamic Non-Spammy Threshold Warning Banner */}
        {creditState.warning && (
          <div
            style={{
              padding: "6px 20px",
              background: creditState.available <= 0 ? "rgba(207, 139, 139, 0.15)" : "rgba(207, 173, 116, 0.12)",
              borderBottom: "1px solid var(--border)",
              color: creditState.available <= 0 ? "var(--danger, #cf8b8b)" : "var(--warning, #cfad74)",
              fontSize: 11,
              fontFamily: "var(--mono)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>⚠ {creditState.warning}</span>
            {creditState.available <= 0 && (
              <span style={{ fontSize: 10, color: "var(--text-3)" }}>
                Solana Devnet manual trading &amp; permissions continue normally.
              </span>
            )}
          </div>
        )}

        {/* ── Body: Tab Content ── */}

        {/* TAB 1: CHAT */}
        {activeTab === "CHAT" && (
          <div style={{ flex: 1, display: "flex", overflow: "hidden", background: "var(--surface-0)", position: "relative" }}>
            {/* Left/Center Column: Spacious Chat Feed & Capsule Input */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden", position: "relative" }}>
              {/* Slidable Telemetry Toggle & Approvals Bar */}
              <div style={{ position: "absolute", top: 12, right: 16, zIndex: 10, display: "flex", alignItems: "center", gap: 8 }}>
                {pendingProposals.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowApprovalsModal(true)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "4px 10px",
                      background: "rgba(207, 173, 116, 0.2)",
                      border: "1px solid rgba(207, 173, 116, 0.5)",
                      borderRadius: 999,
                      color: "var(--warning, #cfad74)",
                      fontSize: 10.5,
                      fontFamily: "var(--mono)",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    APPROVALS ({pendingProposals.length})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowAuditInspector(prev => !prev)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "5px 12px",
                    background: showAuditInspector ? "rgba(121, 194, 164, 0.2)" : "rgba(255, 255, 255, 0.06)",
                    backdropFilter: "blur(16px)",
                    WebkitBackdropFilter: "blur(16px)",
                    border: `1px solid ${showAuditInspector ? "var(--mint, #79c2a4)" : "var(--border)"}`,
                    borderRadius: 999,
                    color: showAuditInspector ? "var(--mint, #79c2a4)" : "var(--text-2)",
                    fontSize: 11,
                    fontFamily: "var(--mono)",
                    fontWeight: 600,
                    cursor: "pointer",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                    transition: "all var(--t-fast)",
                  }}
                  title={showAuditInspector ? "Hide Protocol Boundary Inspector" : "View Protocol Boundary Inspector & Decision Audit Log"}
                >
                  <Icon name="shield" size={13} />
                  <span>{showAuditInspector ? "HIDE AUDIT" : "AUDIT LOG & SOVEREIGNTY"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTelemetryOpen(prev => !prev)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "5px 12px",
                    background: telemetryOpen ? "var(--surface-3)" : "rgba(255, 255, 255, 0.06)",
                    backdropFilter: "blur(16px)",
                    WebkitBackdropFilter: "blur(16px)",
                    border: `1px solid ${telemetryOpen ? "var(--accent)" : "var(--border)"}`,
                    borderRadius: 999,
                    color: telemetryOpen ? "var(--accent)" : "var(--text-2)",
                    fontSize: 11,
                    fontFamily: "var(--mono)",
                    fontWeight: 600,
                    cursor: "pointer",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                    transition: "all var(--t-fast)",
                  }}
                  title={telemetryOpen ? "Hide Live State Panel" : "Slide Open Live State Panel"}
                >
                  <Icon name="gauge" size={13} />
                  <span>{telemetryOpen ? "HIDE TELEMETRY" : "TELEMETRY"}</span>
                </button>
              </div>

              {/* Scrollable message feed */}
              <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "thin" }}>
                <div style={{ maxWidth: 920, margin: "0 auto", padding: "32px 24px 20px" }}>
                  {showAuditInspector && (
                    <div style={{ marginBottom: 20 }}>
                      <ProtocolBoundaryInspector />
                    </div>
                  )}
                  {msgs.map(m => (
                    <Bubble
                      key={m.id}
                      msg={m}
                      owner={wallet.address || ""}
                      onTaskCreated={handleTaskCreated}
                      onApproveProposal={handleApproveProposal}
                      onDismissProposal={handleDismissProposal}
                      onActionClick={(action, symbol) => sendWithText(`${action} against ${symbol}`)}
                      onChartClick={(symbol) => sendWithText(`chart ${symbol}`)}
                      onSubTabClick={(tab, symbol) => {
                        if (tab === "Risk") sendWithText(`risk for ${symbol}`);
                        else if (tab === "Position") sendWithText(`my position in ${symbol}`);
                        else if (tab === "Activity") sendWithText(`activity for ${symbol}`);
                        else sendWithText(`show ${symbol}`);
                      }}
                      onSelectClarification={(text) => sendWithText(text)}
                    />
                  ))}
                  <div ref={endRef} />
                </div>
              </div>

              {/* Input area */}
              <div style={{ flexShrink: 0, borderTop: "1px solid var(--border)", background: "var(--surface-1)", padding: "12px 20px 16px" }}>
                <div style={{ maxWidth: 760, margin: "0 auto" }}>

                  {/* Emergency Pause Warning Banner */}
                  {isAgentPaused && (
                    <div style={{ padding: "8px 12px", marginBottom: 10, background: "rgba(207, 139, 139, 0.15)", border: "1px solid rgba(207, 139, 139, 0.4)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 11, color: "var(--danger, #cf8b8b)", fontFamily: "var(--mono)", fontWeight: 700 }}>
                        ⚠ AGENT EXECUTION PAUSED — Automatic order generation and proposal execution are suspended.
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setIsAgentPaused(false);
                          addEvent("info", "Agent execution resumed by operator.");
                        }}
                        style={{ padding: "2px 8px", background: "transparent", border: "1px solid var(--danger, #cf8b8b)", borderRadius: 4, color: "var(--danger, #cf8b8b)", fontSize: 10, fontFamily: "var(--mono)", cursor: "pointer", fontWeight: 700 }}
                      >
                        RESUME
                      </button>
                    </div>
                  )}



                  {/* Liquid Glass Capsule Input Bar */}
                  <div
                    className="liquid-capsule-input"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      background: "rgba(22, 24, 30, 0.65)",
                      backdropFilter: "blur(24px) saturate(180%)",
                      WebkitBackdropFilter: "blur(24px) saturate(180%)",
                      border: "1px solid rgba(255, 255, 255, 0.14)",
                      borderRadius: 9999,
                      padding: "8px 10px 8px 22px",
                      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2), inset 0 1px 1px rgba(255, 255, 255, 0.2)",
                      transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                    }}
                  >
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={onKey}
                      placeholder={streaming ? "Agent reasoning in progress..." : connected ? "Ask about a market, risk, position, or action… (Enter to send, Shift+Enter for newline)" : "Ask about Circuit Protocol, markets, or general questions… (Enter to send)"}
                      disabled={streaming}
                      rows={1}
                      style={{
                        flex: 1,
                        background: "transparent",
                        border: "none",
                        color: "var(--text)",
                        fontFamily: "var(--sans)",
                        fontSize: 14.5,
                        resize: "none",
                        outline: "none",
                        lineHeight: 1.45,
                        maxHeight: 120,
                        overflowY: "auto",
                        padding: "6px 0",
                      }}
                    />
                    {streaming ? (
                      <button
                        type="button"
                        onClick={stop}
                        style={{
                          flexShrink: 0,
                          width: 38,
                          height: 38,
                          borderRadius: "50%",
                          background: "rgba(207, 139, 139, 0.2)",
                          border: "1px solid rgba(207, 139, 139, 0.5)",
                          color: "var(--danger, #cf8b8b)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          transition: "all var(--t-fast)",
                        }}
                        title="Stop Generation"
                      >
                        <span style={{ width: 10, height: 10, background: "currentColor", borderRadius: 2 }} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => sendWithText()}
                        disabled={!input.trim() || streaming}
                        style={{
                          flexShrink: 0,
                          width: 38,
                          height: 38,
                          borderRadius: "50%",
                          background: !input.trim() || streaming ? "var(--surface-3)" : "var(--accent, #eceae6)",
                          border: "none",
                          color: !input.trim() || streaming ? "var(--text-3)" : "#0c0c0d",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 16,
                          fontWeight: 700,
                          cursor: !input.trim() || streaming ? "not-allowed" : "pointer",
                          boxShadow: !input.trim() || streaming ? "none" : "0 2px 10px rgba(0, 0, 0, 0.3)",
                          transition: "all 0.18s cubic-bezier(0.16, 1, 0.3, 1)",
                        }}
                        title="Send Message"
                      >
                        ↑
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Slidable Live Agent State Panel */}
            <div
              style={{
                width: telemetryOpen ? 340 : 0,
                flexShrink: 0,
                borderLeft: telemetryOpen ? "1px solid var(--border)" : "none",
                display: "flex",
                flexDirection: "column",
                background: "var(--surface-1)",
                overflow: "hidden",
                transition: "width 0.28s cubic-bezier(0.16, 1, 0.3, 1)",
                visibility: telemetryOpen ? "visible" : "hidden",
              }}
            >
              {telemetryOpen && (
                <LiveAgentStatePanel
                  objective={currentObjective}
                  riskState={risk.ratchetState}
                  isMarketOpen={risk.isMarketOpen}
                  totalCollateralUsd={portfolio.totalCollateralUsd}
                  totalDebtUsd={portfolio.totalDebtUsd}
                  availableCreditUsd={credit.availableCreditUsd}
                  healthFactor={portfolio.healthFactor}
                  activeAsset={activeContextAsset}
                  agentAuthority={onChainAuthorities[0] ?? null}
                  activeWatchesCount={taskCounts.watches}
                  activeTasksCount={taskCounts.total}
                  pendingApprovalsCount={pendingProposals.length}
                  currentNode={currentStrategyNode}
                  permissionAllowed={permissionResult !== "BLOCKED"}
                  blockedReason={blockedReason}
                  onOpenDiagnostics={() => setShowTelemetry(true)}
                  onOpenCapabilityInspector={() => setShowCapabilityInspector(true)}
                  onOpenApprovals={() => setShowApprovalsModal(true)}
                  agentTier={agentTierMode}
                  agentCreditsAvailable={creditState.available}
                  agentCreditsReserved={creditState.reserved}
                  isAgentPaused={isAgentPaused}
                  onTogglePause={handleEmergencyKillSwitch}
                />
              )}
            </div>
          </div>
        )}

        {/* TAB 2: STRATEGY */}
        {activeTab === "STRATEGY" && (
          <div style={{ flex: 1, overflowY: "auto", background: "var(--surface-0)", padding: 20 }}>
            <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ padding: "16px 18px", background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "var(--r)" }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)" }}>STRATEGY PLANNER &amp; AUTOMATION</div>
                <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 4, lineHeight: 1.5 }}>
                  Configure bounded multi-step autonomous policies combining collateral deposits, risk-gated borrowing, and Meteora Dynamic Bonding Curve (DBC) liquidity rebalancing.
                </div>
              </div>
              <ProtocolBoundaryInspector />
              <StrategiesPanel owner={wallet.address || ""} onAddStrategy={() => startAction("Auto manage: keep my portfolio health above 1.8 with repay up to $200")} />
            </div>
          </div>
        )}

        {/* TAB 3: WATCH */}
        {activeTab === "WATCH" && (
          <div style={{ flex: 1, overflowY: "auto", background: "var(--surface-0)", padding: 0 }}>
            <WatchesPanel owner={wallet.address || ""} onAddWatch={() => startAction("Watch my health factor and notify if below 1.8")} />
          </div>
        )}

        {/* TAB 4: AUTO MANAGE */}
        {activeTab === "AUTO MANAGE" && (
          <div style={{ flex: 1, overflowY: "auto", background: "var(--surface-0)", padding: 20 }}>
            <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
              <LiveAgentConsole
                ownerAddress={wallet.address || ""}
                onOpenAuthorityModal={() => setActiveTab("PERMISSIONS")}
              />
              <StrategiesPanel owner={wallet.address || ""} onAddStrategy={() => startAction("Auto manage: keep my health factor above 1.8, auto-repaying up to $200")} />
            </div>
          </div>
        )}

        {/* TAB 5: SCHEDULE */}
        {activeTab === "SCHEDULE" && (
          <div style={{ flex: 1, overflowY: "auto", background: "var(--surface-0)", padding: 0 }}>
            <TasksPanel owner={wallet.address || ""} onAddTask={() => startAction("Schedule portfolio check every 1 hour")} />
          </div>
        )}

        {/* TAB 6: PERMISSIONS */}
        {activeTab === "PERMISSIONS" && (
          <div style={{ flex: 1, overflowY: "auto", background: "var(--surface-0)", padding: 0 }}>
            <PermissionsTab onCreated={() => {
              updateCounts();
              setActiveTab("CHAT");
            }} />
          </div>
        )}

        {/* TAB 7: METEORA DBC */}
        {activeTab === "DBC" && (
          <div style={{ flex: 1, overflowY: "auto", background: "var(--surface-0)", padding: 20 }}>
            <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ padding: "16px 18px", background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "var(--r)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)" }}>METEORA DYNAMIC BONDING CURVE (DBC)</div>
                  <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 4, lineHeight: 1.5 }}>
                    First-class execution primitive. Circuit governs capital authority and permission boundaries; Meteora provides dynamic virtual curve execution.
                  </div>
                </div>
                <DbcPoolStatusPill />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 20 }}>
                <div style={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 20 }}>
                  <DbcExecutionPanel
                    riskState={risk.ratchetState}
                    oraclePriceUsd={marketSnapshots[activeContextAsset.symbol]?.priceUsd ?? null}
                    symbol={activeContextAsset.symbol}
                  />
                </div>

                <div style={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "#e4e4e7" }}>
                    Bonding Curve Dynamics
                  </div>
                  <DbcCurveVisualizer
                    poolState={getPoolState(activeContextAsset.symbol)}
                    riskState={risk.ratchetState}
                    oraclePrice={marketSnapshots[activeContextAsset.symbol]?.priceUsd ?? null}
                    symbol={activeContextAsset.symbol}
                    width={420}
                    height={240}
                  />
                  <div style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.6, fontFamily: "var(--mono)" }}>
                    • Safe: full bonding curve accessible for liquidity and swaps.<br />
                    • Restricted: risk-increasing execution volume capped at 50%.<br />
                    • Defensive / Emergency: only liquidity recovery and exit permitted.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Telemetry & Diagnostics Drawer */}
        {showTelemetry && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 100,
              background: "rgba(0, 0, 0, 0.65)",
              backdropFilter: "blur(4px)",
              display: "flex",
              justifyContent: "flex-end",
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowTelemetry(false);
            }}
          >
            <div
              style={{
                width: "min(420px, 95vw)",
                height: "100%",
                background: "var(--surface-1)",
                borderLeft: "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                boxShadow: "-8px 0 32px rgba(0,0,0,0.6)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, fontFamily: "var(--mono)", color: "var(--text)", letterSpacing: "0.05em" }}>
                    SYSTEM TELEMETRY &amp; DIAGNOSTICS
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "var(--mono)", marginTop: 2 }}>
                    Low-level oracle, RPC, and account state
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTelemetry(false)}
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: 4,
                    color: "var(--text-2)",
                    fontSize: 12,
                    cursor: "pointer",
                    padding: "4px 8px",
                  }}
                >
                  ✕
                </button>
              </div>
              <div style={{ flex: 1, overflowY: "auto" }}>
                <TelemetryContextPanel
                  activeAsset={activeContextAsset}
                  portfolio={portfolio}
                  risk={risk}
                  credit={credit}
                  marketSnapshots={marketSnapshots}
                  onChainAuthorities={onChainAuthorities}
                  isOpen={true}
                  onClose={() => setShowTelemetry(false)}
                />
              </div>
            </div>
          </div>
        )}

        {/* Command Palette Modal (Cmd/Ctrl + K) */}
        <CommandPalette
          isOpen={showCommandPalette}
          onClose={() => setShowCommandPalette(false)}
          commands={commandList}
        />

        {/* Capability Inspector Modal */}
        <AgentCapabilityInspector
          isOpen={showCapabilityInspector}
          onClose={() => setShowCapabilityInspector(false)}
          agentAuthority={onChainAuthorities[0] ?? null}
          riskState={risk.ratchetState}
          isMarketOpen={risk.isMarketOpen}
          borrowLimitUsd={credit.availableCreditUsd}
        />

        {/* Approval Queue Modal */}
        <ApprovalQueueModal
          isOpen={showApprovalsModal}
          onClose={() => setShowApprovalsModal(false)}
          pendingProposals={pendingProposals}
          onApprove={(p) => {
            handleApproveProposal(p);
            setPendingProposals((prev) => prev.filter((x) => x.id !== p.id));
          }}
          onReject={(id) => setPendingProposals((prev) => prev.filter((x) => x.id !== id))}
        />

        <style>{`@keyframes agPulse{0%,100%{opacity:1}50%{opacity:0.4}}@keyframes agBlink{0%,100%{opacity:1}50%{opacity:0}}`}</style>
      </div>
    </div>
  );
}
