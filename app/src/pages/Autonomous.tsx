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
import { DEPLOYED_MARKETS } from "../data/markets-registry";
import { TasksPanel } from "../components/autonomous/TasksPanel";
import { WatchesPanel } from "../components/autonomous/WatchesPanel";
import { StrategiesPanel } from "../components/autonomous/StrategiesPanel";
import { ExecutionFeed } from "../components/autonomous/ExecutionFeed";
import { PolicyPreview } from "../components/autonomous/PolicyPreview";
import { loadTasks, loadExecutions, syncToServer, parseTaskProposal, subscribeTasks } from "../lib/automation/store";
import type { ParsedTaskProposal } from "../lib/automation/types";
import { useAction } from "../context/ActionContext";
import { shortenAddress } from "../lib/format";
import {
  CIRCUIT_DEVNET_AGENT_KEY,
  AllowedActionsMask,
  buildCreateAgentAuthorityInstruction,
  deriveAgentAuthorityPda,
} from "../lib/agentAuthority";

export type AgentState =
  | "IDLE" | "PLANNING" | "AWAITING_APPROVAL" | "CHECKING_PERMISSION"
  | "EXECUTING" | "CONFIRMING" | "COMPLETED" | "BLOCKED" | "FAILED" | "PAUSED" | "EXPIRED";

export type TabId = "CHAT" | "STRATEGY" | "WATCH" | "AUTO MANAGE" | "SCHEDULE" | "PERMISSIONS";

export interface CircuitToolEvent {
  tool: string;
  input: Record<string, any>;
  output: Record<string, any>;
  status: "CONFIRMED" | "BLOCKED" | "PENDING";
}

export interface CircuitActionProposal {
  id: string;
  action: "borrow" | "repay" | "deposit" | "withdraw" | "swap" | "enter_liquidity" | "exit_liquidity" | "rebalance";
  symbol: string;
  amountUsd: number;
  riskState: string;
  permission: "ALLOWED" | "BLOCKED" | "CAPPED";
  reason: string;
  estimatedHfAfter: number | null;
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
  if (s === "IDLE" || s === "EXPIRED") return "var(--text-3)";
  if (s === "EXECUTING" || s === "CONFIRMING" || s === "COMPLETED") return "var(--mint, #79c2a4)";
  if (s === "BLOCKED" || s === "FAILED") return "var(--danger, #cf8b8b)";
  if (s === "AWAITING_APPROVAL" || s === "PAUSED") return "var(--warning, #cfad74)";
  return "var(--accent)";
}

function StateBadge({ state }: { state: AgentState }) {
  const color = stateColor(state);
  const pulse = state === "EXECUTING" || state === "PLANNING" || state === "CONFIRMING";
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
      return !t.startsWith("CIRCUIT_TOOL:") &&
             !t.startsWith("CIRCUIT_ACTION_PROPOSAL:") &&
             !t.startsWith("CIRCUIT_TASK:");
    })
    .join("\n")
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
            background: isConfirmed ? "rgba(121,194,164,0.15)" : "rgba(207,139,139,0.15)",
            color: isConfirmed ? "var(--mint, #79c2a4)" : "var(--danger, #cf8b8b)",
            border: `1px solid ${isConfirmed ? "rgba(121,194,164,0.3)" : "rgba(207,139,139,0.3)"}`,
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
          borderTop: "1px solid rgba(255,255,255,0.04)",
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
          background: "rgba(0,0,0,0.2)",
          fontSize: 10,
        }}>
          <div style={{ marginBottom: 4, color: "var(--text-3)" }}>INPUT:</div>
          <pre style={{ margin: "0 0 6px", color: "var(--text-2)", whiteSpace: "pre-wrap" }}>
            {JSON.stringify(tool.input, null, 2)}
          </pre>
          <div style={{ marginBottom: 4, color: "var(--text-3)" }}>OUTPUT:</div>
          <pre style={{ margin: 0, color: isConfirmed ? "var(--mint, #79c2a4)" : "var(--danger, #cf8b8b)", whiteSpace: "pre-wrap" }}>
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
    ? "rgba(207,173,116,0.15)"
    : isDeposit
    ? "rgba(121,194,164,0.15)"
    : isDbc
    ? "rgba(167,139,250,0.15)"
    : "rgba(207,139,139,0.15)";
  const badgeFg = isBorrow
    ? "var(--warning,#cfad74)"
    : isDeposit
    ? "var(--mint,#79c2a4)"
    : isDbc
    ? "#a78bfa"
    : "var(--danger,#cf8b8b)";

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
          {isAllowed ? "CIRCUIT APPROVED" : isCapped ? "POLICY CAPPED" : "CIRCUIT BLOCKED"}
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
          <span style={{ color: "var(--text-3)" }}>Venue: </span>
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
        }}>
          ✕ Execution rejected by Circuit Permission Engine. Risk Ratchet in {proposal.riskState} blocks risk-increasing transactions.
        </div>
      ) : (
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
              background: executed ? "rgba(121,194,164,0.15)" : "var(--accent, #eceae6)",
              color: executed ? "var(--mint, #79c2a4)" : "#0c0c0d",
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
              padding: "8px 12px",
              fontSize: 11,
              fontFamily: "var(--mono)",
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: 6,
              color: "var(--text-3)",
              cursor: "pointer",
            }}
          >
            DECLINE
          </button>
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
}: {
  msg: ChatMessage;
  owner: string;
  onTaskCreated: (name: string) => void;
  onApproveProposal: (proposal: CircuitActionProposal) => void;
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

      {tools.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {tools.map((tool, idx) => (
            <ToolExecutionCard key={`${tool.tool}_${idx}`} tool={tool} />
          ))}
        </div>
      )}

      {displayContent.length > 0 && (
        <div style={{
          fontSize: 14, lineHeight: 1.65, color: "var(--text)",
          whiteSpace: "pre-wrap", wordBreak: "break-word",
        }}>
          {displayContent}
          {msg.streaming && (
            <span style={{ display: "inline-block", width: 2, height: 14, background: "var(--accent)", marginLeft: 3, verticalAlign: "middle", animation: "agBlink 1s step-end infinite" }} />
          )}
        </div>
      )}

      {actionProposal && !dismissedProposal && (
        <div style={{ marginTop: 12 }}>
          <ActionProposalCard
            proposal={actionProposal}
            onApprove={(p) => onApproveProposal(p)}
            onDismiss={() => setDismissedProposal(true)}
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

function PlanCard({ plan }: { plan: StrategyPlan }) {
  return (
    <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 14, fontSize: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-3)", marginBottom: 8, fontFamily: "var(--mono)" }}>
        STRATEGY PLAN
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 2 }}>OBJECTIVE</div>
        <div style={{ fontWeight: 600 }}>{plan.objective}</div>
      </div>
      {plan.actions.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6 }}>ACTIONS</div>
          {plan.actions.map((a, i) => {
            const isBorrow = a.action === "borrow";
            const isDeposit = a.action === "deposit" || a.action === "repay";
            const isDbc = ["swap", "enter_liquidity", "exit_liquidity", "rebalance"].includes(a.action);
            const bg = isBorrow
              ? "rgba(207,173,116,0.15)"
              : isDeposit
              ? "rgba(121,194,164,0.15)"
              : isDbc
              ? "rgba(167,139,250,0.15)"
              : "rgba(207,139,139,0.15)";
            const fg = isBorrow
              ? "var(--warning,#cfad74)"
              : isDeposit
              ? "var(--mint,#79c2a4)"
              : isDbc
              ? "#a78bfa"
              : "var(--danger,#cf8b8b)";
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", background: "var(--surface-3)", borderRadius: 6, border: "1px solid var(--border)", marginBottom: 4 }}>
                <span style={{ fontSize: 9, fontWeight: 700, fontFamily: "var(--mono)", padding: "2px 5px", borderRadius: 3, background: bg, color: fg }}>{a.action.toUpperCase()}</span>
                <span style={{ fontWeight: 600 }}>{a.asset}</span>
                <span style={{ color: "var(--text-2)" }}>${a.amountUsd.toFixed(2)}</span>
                <span style={{ color: "var(--text-3)", fontSize: 11, flex: 1 }}>{a.reason}</span>
              </div>
            );
          })}
        </div>
      )}
      {plan.constraints.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 3 }}>CONSTRAINTS</div>
          <ul style={{ margin: 0, padding: "0 0 0 14px", color: "var(--text-2)" }}>
            {plan.constraints.map((c, i) => <li key={i} style={{ marginBottom: 2 }}>{c}</li>)}
          </ul>
        </div>
      )}
      {plan.riskAssessment && (
        <div style={{ padding: "7px 10px", background: "rgba(207,173,116,0.07)", border: "1px solid rgba(207,173,116,0.2)", borderRadius: 6, fontSize: 11, color: "var(--warning,#cfad74)" }}>
          ⚡ {plan.riskAssessment}
        </div>
      )}
    </div>
  );
}

function Timeline({ events }: { events: ExecEvent[] }) {
  if (events.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-3)", fontSize: 11, fontFamily: "var(--mono)" }}>
        IDLE — No active execution events recorded
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {events.map(evt => {
        const color = evt.type === "confirmed" ? "var(--mint,#79c2a4)" : evt.type === "blocked" || evt.type === "error" ? "var(--danger,#cf8b8b)" : evt.type === "permission" ? "var(--warning,#cfad74)" : "var(--text-3)";
        return (
          <div key={evt.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 11 }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-3)", whiteSpace: "nowrap", marginTop: 1, minWidth: 65 }}>{fmtTime(evt.timestamp)}</span>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0, marginTop: 3 }} />
            <div style={{ flex: 1, color: "var(--text-2)", lineHeight: 1.4 }}>
              {evt.message}
              {evt.txSignature && (
                <a href={`https://explorer.solana.com/tx/${evt.txSignature}?cluster=devnet`} target="_blank" rel="noopener noreferrer" style={{ display: "block", fontSize: 10, fontFamily: "var(--mono)", color: "var(--accent)", marginTop: 2, opacity: 0.8 }}>
                  {evt.txSignature.slice(0, 12)}...{evt.txSignature.slice(-6)} ↗
                </a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AuthPanel({
  auths,
  agentState = "IDLE",
  onOpenPermissionsTab,
}: {
  auths: Array<{
    agentAddress: string;
    assetSymbol: string;
    isExpired: boolean;
    isRevoked: boolean;
    maxBorrowLimit: number;
    expiryTs: number;
  }>;
  agentState?: AgentState;
  onOpenPermissionsTab?: () => void;
}) {
  const active = auths.filter(a => !a.isExpired && !a.isRevoked);
  const inactive = auths.filter(a => a.isExpired || a.isRevoked);

  const operatingStatus: "AUTHORIZED" | "EXPIRED" | "REVOKED" | "IDLE" | "EXECUTING" =
    agentState === "EXECUTING" || agentState === "CONFIRMING"
      ? "EXECUTING"
      : active.length > 0
      ? "AUTHORIZED"
      : inactive.some(a => a.isRevoked)
      ? "REVOKED"
      : inactive.some(a => a.isExpired)
      ? "EXPIRED"
      : "IDLE";

  const statusTone =
    operatingStatus === "EXECUTING" || operatingStatus === "AUTHORIZED"
      ? "var(--mint, #79c2a4)"
      : operatingStatus === "REVOKED"
      ? "var(--danger, #cf8b8b)"
      : operatingStatus === "EXPIRED"
      ? "var(--warning, #cfad74)"
      : "var(--text-3)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{
        padding: "8px 10px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 10, fontFamily: "var(--mono)", color: "var(--text-3)",
      }}>
        <div style={{ color: "var(--text-2)", fontWeight: 700, marginBottom: 3, letterSpacing: "0.04em" }}>
          AUTHORITY PIPELINE
        </div>
        <div style={{ color: "var(--accent)", letterSpacing: "0.02em" }}>
          USER → AGENT → RISK RATCHET → PERMISSION ENGINE → SOLANA
        </div>
      </div>

      <div style={{
        padding: "7px 10px", background: "var(--surface-3, #151821)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 9.5, lineHeight: 1.45, color: "var(--text-2)", fontFamily: "var(--mono)",
      }}>
        <span style={{ color: "var(--text-3)" }}>Effective Authority: </span>
        <span style={{ color: "var(--mint, #79c2a4)" }}>
          Owner Auth ∩ Agent Auth ∩ Risk Policy ∩ Pos Constraints
        </span>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: "var(--surface-2)", borderRadius: 6, border: "1px solid var(--border)" }}>
        <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text-3)" }}>
          OPERATING STATUS
        </span>
        <span style={{
          fontSize: 9.5, fontWeight: 700, fontFamily: "var(--mono)", padding: "2px 7px", borderRadius: 4, background: "rgba(255,255,255,0.05)", border: `1px solid ${statusTone}`, color: statusTone, letterSpacing: "0.04em",
        }}>
          {operatingStatus}
        </span>
      </div>

      {auths.length === 0 ? (
        <div style={{ padding: "10px 12px", background: "rgba(207,139,139,0.06)", border: "1px solid rgba(207,139,139,0.2)", borderRadius: 6, fontSize: 11, color: "var(--text-2)" }}>
          <div style={{ fontWeight: 700, color: "var(--danger,#cf8b8b)", marginBottom: 3 }}>No Active Agent Authority PDA</div>
          <div style={{ lineHeight: 1.45, fontSize: 10.5, color: "var(--text-3)" }}>
            Create bounded on-chain delegation in the Permissions tab to authorize automated actions.
          </div>
          {onOpenPermissionsTab && (
            <button
              type="button"
              onClick={onOpenPermissionsTab}
              style={{
                marginTop: 8, width: "100%", padding: "5px 8px", background: "rgba(207,173,116,0.12)", border: "1px solid rgba(207,173,116,0.35)", borderRadius: 4, color: "var(--warning,#cfad74)", fontSize: 10, fontWeight: 700, fontFamily: "var(--mono)", cursor: "pointer",
              }}
            >
              CONFIGURE IN PERMISSIONS TAB →
            </button>
          )}
        </div>
      ) : (
        <>
          {active.map(a => (
            <div key={a.agentAddress} style={{ padding: "8px 10px", background: "rgba(121,194,164,0.06)", border: "1px solid rgba(121,194,164,0.25)", borderRadius: 6, fontSize: 11 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 700, color: "var(--mint,#79c2a4)" }}>{a.assetSymbol} Authority</span>
                <span style={{ fontSize: 9, fontFamily: "var(--mono)", background: "rgba(121,194,164,0.15)", color: "var(--mint,#79c2a4)", padding: "1px 5px", borderRadius: 3, fontWeight: 700 }}>AUTHORIZED</span>
              </div>
              <div style={{ color: "var(--text-3)", marginTop: 3, fontFamily: "var(--mono)", fontSize: 9.5 }}>
                Max Borrow: ${a.maxBorrowLimit.toFixed(2)} · Exp: {new Date(a.expiryTs * 1000).toLocaleDateString()}
              </div>
            </div>
          ))}
          {inactive.map(a => (
            <div key={a.agentAddress} style={{ padding: "6px 9px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 5, fontSize: 10, color: "var(--text-3)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 600 }}>{a.assetSymbol}</span>
                <span style={{ fontSize: 9, fontFamily: "var(--mono)", color: a.isRevoked ? "var(--danger,#cf8b8b)" : "var(--warning,#cfad74)" }}>
                  {a.isRevoked ? "REVOKED" : "EXPIRED"}
                </span>
              </div>
            </div>
          ))}
        </>
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
    setStatusMsg({ text: "Building and signing Agent Authority PDA transaction...", tone: "warning" });

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
      setStatusMsg({ text: `Agent Authority PDA confirmed! Activated for ${selectedMarket.symbol}.`, tone: "mint" });
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
              ON-CHAIN AGENT AUTHORITY MANAGEMENT
            </div>
            <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 4, lineHeight: 1.5 }}>
              Delegate bounded execution to autonomous agents while retaining sovereign capital authority.
              Circuit's Risk Ratchet, MarketGuard, and Permission Engine govern every transaction on Devnet.
            </div>
          </div>
          <span style={{
            fontSize: 10, fontWeight: 700, fontFamily: "var(--mono)", padding: "3px 8px", borderRadius: 4, background: "rgba(121,194,164,0.15)", color: "var(--mint,#79c2a4)", border: "1px solid rgba(121,194,164,0.3)",
          }}>
            DEVNET PDA
          </span>
        </div>

        <div style={{
          marginTop: 12, padding: "8px 12px", background: "var(--surface-2)", borderRadius: 6, fontSize: 11, fontFamily: "var(--mono)", color: "var(--text-3)", display: "flex", justifyContent: "space-between",
        }}>
          <span>AUTHORITY PIPELINE:</span>
          <span style={{ color: "var(--accent)" }}>
            USER (Owner) → AGENT (Key) → RISK RATCHET → PERMISSION ENGINE → SOLANA DEVNET
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
        <SectionLabel>CURRENT AGENT DELEGATIONS (ON-CHAIN)</SectionLabel>
        {onChainAuthorities.length === 0 ? (
          <div style={{ padding: "16px 14px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12, color: "var(--text-3)" }}>
            No Agent Authority PDAs found for connected wallet. Configure a bounded delegation below to grant an agent execution authority.
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
                      <span style={{ fontWeight: 800, fontSize: 13, color: "var(--text)" }}>{sym} Authority</span>
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
                      {isRevoking ? "REVOKING..." : "REVOKE ON DEVNET"}
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
        <SectionLabel>CREATE NEW AGENT AUTHORITY PDA</SectionLabel>

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
            <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--text-3)" }}>AUTHORITY EXPIRY</span>
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
              <span style={{ color: "var(--text-3)" }}>Derived Authority PDA:</span>
              <span style={{ color: "var(--mint,#79c2a4)" }}>{shortenAddress(pdaAddress)}</span>
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
            {creating ? "SIGNING & CONFIRMING ON DEVNET..." : "SIGN & AUTHORIZE ON DEVNET →"}
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
      "Circuit permission engine governs all credit and DBC liquidity actions",
      "Bounded by on-chain Agent Authority PDA limits",
      "DBC slippage bounded strictly <= 200 bps",
      "Dynamic Risk Ratchet enforcement (Blocked in Defensive/Emergency)",
    ],
    actions,
    riskAssessment: "Evaluate collateral ratio, oracle confidence spread, and Section 15 DBC Risk Matrix before atomic execution.",
  };
}

export default function Autonomous() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { openAction } = useAction();
  const {
    controlMode, setControlMode, hasActiveAuthority, onChainAuthorities,
    portfolio, risk, credit, markets, wallet,
  } = useCircuitDomain();

  // Read ?tab= from URL and use it as the initial tab (case-insensitive).
  const tabFromUrl = searchParams.get("tab")?.toUpperCase() as TabId | null;
  const validTabs: TabId[] = ["CHAT", "STRATEGY", "WATCH", "AUTO MANAGE", "SCHEDULE", "PERMISSIONS"];
  const initialTab: TabId = (tabFromUrl && validTabs.includes(tabFromUrl)) ? tabFromUrl : "CHAT";

  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [taskCounts, setTaskCounts] = useState({ total: 0, watches: 0, strategies: 0, executions: 0 });

  const initialGreeting = useMemo(() => {
    if (!wallet.address) {
      return (
        "Circuit Autonomous Agent online.\n\n" +
        "Connect your Solana Devnet wallet to inspect your live positions, evaluate risk ratchet states, and test bounded autonomous permissions."
      );
    }
    const hfStr = portfolio.healthFactor !== null ? portfolio.healthFactor.toFixed(3) : "Infinite (No active debt)";
    const authCount = onChainAuthorities.filter(a => !a.isExpired && !a.isRevoked).length;
    const posSummary = portfolio.positions.length > 0
      ? portfolio.positions.map((p: any) => `${p.symbol}: $${(p.collateralValueUsd ?? 0).toFixed(2)} collateral, $${(p.debtUi ?? 0).toFixed(2)} debt`).join(" · ")
      : "No open positions";

    return (
      `Circuit Autonomous Agent online.\n\n` +
      `Connected wallet: ${shortenAddress(wallet.address)}\n` +
      `• Total Collateral: $${portfolio.totalCollateralUsd.toFixed(2)}\n` +
      `• Outstanding Debt: $${portfolio.totalDebtUsd.toFixed(2)}\n` +
      `• Health Factor: ${hfStr}\n` +
      `• Risk Ratchet: ${risk.ratchetState} (NYSE ${risk.isMarketOpen ? "Regular Hours Open" : "Outside RTH"})\n` +
      `• Active Delegations: ${authCount} on-chain Authority PDA(s)\n` +
      `• Positions: ${posSummary}\n\n` +
      `I am ready to evaluate borrowing capacity, test on-chain permission gates, monitor market risk, or build autonomous policies.`
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

  const [input, setInput] = useState("");
  const [agentState, setAgentState] = useState<AgentState>("IDLE");
  const [events, setEvents] = useState<ExecEvent[]>([]);
  const [plan, setPlan] = useState<StrategyPlan | null>(null);
  const [streaming, setStreaming] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

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
    const id = setInterval(updateCounts, 5_000);
    return () => { unsub(); clearInterval(id); };
  }, [updateCounts]);

  useEffect(() => {
    if (wallet.address) syncToServer(wallet.address);
  }, [wallet.address]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  useEffect(() => {
    if (controlMode !== "AUTONOMOUS" && hasActiveAuthority) setControlMode("AUTONOMOUS");
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
    markets: Object.values(markets.markets).map((m: any) => ({ symbol: m.symbol, price: m.priceData?.price ?? 0, change24hPct: m.priceData?.change24hPct ?? null })),
    onChainAuthorities: onChainAuthorities.map(a => {
      const sym = DEPLOYED_MARKETS.find(m => m.mint === a.assetMint.toBase58())?.symbol ?? a.assetMint.toBase58().slice(0, 6);
      return { agentAddress: a.agent.toBase58(), assetSymbol: sym, isExpired: a.isExpired, isRevoked: a.isRevoked, maxBorrowLimit: a.maxBorrowLimitUi, expiryTs: a.expiryTs };
    }),
  }), [wallet, controlMode, hasActiveAuthority, risk, portfolio, credit, markets, onChainAuthorities]);

  const addEvent = useCallback((type: ExecEvent["type"], message: string, tx?: string) => {
    setEvents(prev => [...prev, { id: uid(), timestamp: Date.now(), type, message, txSignature: tx }]);
  }, []);

  const handleApproveProposal = useCallback((proposal: CircuitActionProposal) => {
    addEvent("permission", `Proposal approved: ${proposal.action.toUpperCase()} $${proposal.amountUsd} against ${proposal.symbol}`);
    const market = DEPLOYED_MARKETS.find(m => m.symbol.toUpperCase() === proposal.symbol.toUpperCase()) || DEPLOYED_MARKETS[0];
    openAction({
      type: proposal.action as any,
      market,
      amount: String(proposal.amountUsd),
    });
    addEvent("info", `Opened action drawer for ${proposal.symbol} ${proposal.action.toUpperCase()} ($${proposal.amountUsd}). Confirm signature with wallet.`);
  }, [addEvent, openAction]);

  const sendWithText = useCallback(async (customText?: string) => {
    const text = (customText ?? input).trim();
    if (!text || streaming) return;
    setInput("");
    const userMsg: ChatMessage = { id: uid(), role: "user", content: text, timestamp: Date.now() };
    setMsgs(prev => [...prev, userMsg]);
    setAgentState("PLANNING");
    addEvent("info", `User query: "${text.slice(0, 60)}${text.length > 60 ? "..." : ""}"`);
    const agentId = uid();
    setMsgs(prev => [...prev, { id: agentId, role: "agent", content: "", timestamp: Date.now(), streaming: true }]);
    setStreaming(true);
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    try {
      setAgentState("CHECKING_PERMISSION");
      addEvent("permission", "Evaluating Circuit permission gates...");
      const apiMsgs = msgs
        .filter(m => m.role !== "system")
        .concat(userMsg)
        .map(m => ({ role: m.role === "agent" ? "assistant" as const : "user" as const, content: m.content }));
      
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abort.signal,
        body: JSON.stringify({ messages: apiMsgs, snapshot: snap }),
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
      if (parsedProp) { addEvent("permission", `Action proposal: ${parsedProp.action.toUpperCase()} ${parsedProp.symbol} (${parsedProp.permission})`); }
      if (parsedTask) { addEvent("info", `Policy proposal: ${parsedTask.name} (${parsedTask.type})`); }
      setAgentState("IDLE");
      addEvent("info", "Evaluation complete.");
    } catch (err: any) {
      if (err.name === "AbortError") {
        setMsgs(prev => prev.map(m => m.id === agentId ? { ...m, content: "[Stopped]", streaming: false } : m));
        setAgentState("IDLE");
        return;
      }
      const em = `Error: ${err.message}`;
      setMsgs(prev => prev.map(m => m.id === agentId ? { ...m, content: em, streaming: false } : m));
      addEvent("error", em);
      setAgentState("FAILED");
    } finally { setStreaming(false); }
  }, [input, streaming, msgs, snap, addEvent]);

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

  const permissionRows = useMemo(() => {
    const rState = risk.ratchetState;
    const isSafe = rState === "SAFE";
    const isRestricted = rState === "RESTRICTED";

    return [
      { action: "Deposit Collateral", status: "ALLOWED (100%)", tone: "mint" },
      { action: "Repay Debt", status: "ALLOWED (100%)", tone: "mint" },
      {
        action: "Borrow Capital",
        status: isSafe ? "ALLOWED (100%)" : isRestricted ? "CAPPED (50%)" : "BLOCKED (Solvency Defense)",
        tone: isSafe ? "mint" : isRestricted ? "warning" : "danger",
      },
      {
        action: "Withdraw Collateral",
        status: isSafe ? "ALLOWED" : isRestricted ? "CAPPED (HF > 1.8)" : "BLOCKED",
        tone: isSafe ? "mint" : isRestricted ? "warning" : "danger",
      },
      {
        action: "Meteora DBC Swap",
        status: isSafe ? "ALLOWED (100 bps)" : isRestricted ? "CAPPED (50% cap)" : "BLOCKED",
        tone: isSafe ? "mint" : isRestricted ? "warning" : "danger",
      },
      { action: "DBC Exit Liquidity", status: "ALLOWED (Unconditional)", tone: "mint" },
    ];
  }, [risk.ratchetState]);

  const activeAuthCount = onChainAuthorities.filter(a => !a.isExpired && !a.isRevoked).length;

  return (
    <div style={{ height: "calc(100vh - 57px)", display: "flex", flexDirection: "column", background: "var(--surface-0, #0c0c0d)", overflow: "hidden" }}>
      {/* ── Top Workspace Header ── */}
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 18px", borderBottom: "1px solid var(--border)", background: "var(--surface-1)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", color: "var(--text)", fontFamily: "var(--mono)" }}>
            AUTONOMOUS
          </span>
          <span style={{ width: 1, height: 14, background: "var(--border)", display: "inline-block" }} />
          <StateBadge state={agentState} />

          {/* ── Tab Switcher: CHAT, STRATEGY, WATCH, AUTO MANAGE, SCHEDULE, PERMISSIONS ── */}
          <div style={{ display: "inline-flex", background: "var(--surface-2)", borderRadius: "var(--r-sm, 6px)", padding: 2, border: "1px solid var(--border)", marginLeft: 6 }}>
            {(["CHAT", "STRATEGY", "WATCH", "AUTO MANAGE", "SCHEDULE", "PERMISSIONS"] as TabId[]).map(tab => {
              const isActive = activeTab === tab;
              const count = tab === "WATCH" ? taskCounts.watches : tab === "AUTO MANAGE" ? taskCounts.strategies : tab === "SCHEDULE" ? taskCounts.total : tab === "PERMISSIONS" ? activeAuthCount : null;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: "4px 10px",
                    fontSize: 10,
                    fontWeight: isActive ? 700 : 500,
                    fontFamily: "var(--mono)",
                    color: isActive ? "var(--text-1)" : "var(--text-3)",
                    background: isActive ? "var(--surface-3)" : "transparent",
                    border: isActive ? "1px solid var(--border)" : "1px solid transparent",
                    borderRadius: "var(--r-sm, 4px)",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    transition: "all var(--t-fast)",
                  }}
                >
                  <span>{tab}</span>
                  {count !== null && count > 0 && (
                    <span style={{
                      fontSize: 9,
                      padding: "1px 4px",
                      borderRadius: 3,
                      background: isActive ? "rgba(236,234,230,0.12)" : "rgba(255,255,255,0.06)",
                      color: isActive ? "var(--accent)" : "var(--text-3)",
                    }}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Header Controls ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={() => setActiveTab("PERMISSIONS")}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 7px", borderRadius: 4, background: "transparent", border: "none", cursor: "pointer" }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: hasActiveAuthority ? "var(--mint,#79c2a4)" : "var(--text-3)", display: "inline-block" }} />
            <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: hasActiveAuthority ? "var(--mint,#79c2a4)" : "var(--text-3)" }}>
              {hasActiveAuthority ? "AUTHORITY ACTIVE" : "NO AUTHORITY"}
            </span>
          </button>
          <button type="button" onClick={clear} style={{ padding: "4px 9px", fontSize: 10, fontFamily: "var(--mono)", background: "transparent", border: "1px solid var(--border)", borderRadius: 5, color: "var(--text-3)", cursor: "pointer" }}>CLEAR</button>
          <button type="button" onClick={() => navigate("/app")} style={{ padding: "4px 9px", fontSize: 10, fontFamily: "var(--mono)", background: "transparent", border: "1px solid var(--border)", borderRadius: 5, color: "var(--text-3)", cursor: "pointer" }}>← MANUAL</button>
        </div>
      </div>

      {/* ── Body: Tab Content ── */}

      {/* TAB 1: CHAT — Full-screen centered, ChatGPT/Claude style */}
      {activeTab === "CHAT" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--surface-0)" }}>

          {/* ── Scrollable message feed — full width, centered content ── */}
          <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "thin" }}>
            <div style={{ maxWidth: 760, margin: "0 auto", padding: "28px 20px 16px" }}>
              {msgs.map(m => (
                <Bubble
                  key={m.id}
                  msg={m}
                  owner={wallet.address || ""}
                  onTaskCreated={handleTaskCreated}
                  onApproveProposal={handleApproveProposal}
                />
              ))}
              <div ref={endRef} />
            </div>
          </div>

          {/* ── Input area — pinned to bottom, centered ── */}
          <div style={{ flexShrink: 0, borderTop: "1px solid var(--border)", background: "var(--surface-1)", padding: "12px 20px 16px" }}>
            <div style={{ maxWidth: 760, margin: "0 auto" }}>

              {/* Suggested prompts */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {[
                  "Can I borrow $300 against NVDA?",
                  "Show me what my current risk looks like",
                  "Check Meteora DBC liquidity & yields",
                  "Watch health factor < 1.8",
                  "Schedule portfolio check every 1h",
                  "Keep HF > 1.8 with auto repay",
                ].map(prompt => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setInput(prompt)}
                    style={{
                      padding: "4px 10px",
                      fontSize: 11,
                      fontFamily: "var(--mono)",
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      borderRadius: 20,
                      color: "var(--text-3)",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      transition: "all var(--t-fast)",
                    }}
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              {/* Input row */}
              <div style={{ display: "flex", gap: 10, alignItems: "flex-end", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: "10px 14px" }}>
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={onKey}
                  placeholder={!connected ? "Connect your Solana Devnet wallet to start..." : "Ask about your risk, borrow capacity, Meteora liquidity, or set up a watch rule… (Enter to send, Shift+Enter for newline)"}
                  disabled={!connected || streaming}
                  rows={1}
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    color: "var(--text)",
                    fontFamily: "var(--sans)",
                    fontSize: 14,
                    resize: "none",
                    outline: "none",
                    lineHeight: 1.55,
                    maxHeight: 140,
                    overflowY: "auto",
                  }}
                />
                {streaming ? (
                  <button
                    type="button"
                    onClick={stop}
                    style={{
                      flexShrink: 0, padding: "7px 14px", background: "rgba(207,139,139,0.15)",
                      border: "1px solid rgba(207,139,139,0.4)", borderRadius: 8,
                      color: "var(--danger,#cf8b8b)", fontSize: 11, fontWeight: 700,
                      cursor: "pointer", fontFamily: "var(--mono)", whiteSpace: "nowrap",
                    }}
                  >
                    ■ STOP
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => sendWithText()}
                    disabled={!input.trim() || !connected}
                    style={{
                      flexShrink: 0, padding: "7px 14px",
                      background: !input.trim() || !connected ? "transparent" : "var(--accent, #eceae6)",
                      border: !input.trim() || !connected ? "1px solid var(--border)" : "none",
                      borderRadius: 8,
                      color: !input.trim() || !connected ? "var(--text-3)" : "#0c0c0d",
                      fontSize: 13, fontWeight: 700,
                      cursor: !input.trim() || !connected ? "not-allowed" : "pointer",
                      fontFamily: "var(--mono)", whiteSpace: "nowrap", transition: "all var(--t-fast)",
                    }}
                  >
                    ↑
                  </button>
                )}
              </div>

              {/* Footer note */}
              <div style={{ marginTop: 6, fontSize: 10, color: "var(--text-3)", fontFamily: "var(--mono)", textAlign: "center" }}>
                Circuit Agent · Risk Ratchet enforced on-chain · Solana Devnet · {risk.ratchetState} {risk.isMarketOpen ? "· NYSE OPEN" : "· MARKET CLOSED"}
              </div>
            </div>
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
        <div style={{ flex: 1, overflowY: "auto", background: "var(--surface-0)", padding: 0 }}>
          <StrategiesPanel owner={wallet.address || ""} onAddStrategy={() => startAction("Auto manage: keep my health factor above 1.8, auto-repaying up to $200")} />
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

      <style>{`@keyframes agPulse{0%,100%{opacity:1}50%{opacity:0.4}}@keyframes agBlink{0%,100%{opacity:1}50%{opacity:0}}`}</style>
    </div>
  );
}
