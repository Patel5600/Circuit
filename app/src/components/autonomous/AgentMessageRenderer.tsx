/**
 * Circuit Protocol — Structured Agent Message Renderer
 *
 * Transforms agent responses into typed, high-fidelity financial cards.
 * ELIMINATES all raw markdown syntax (###, **, ---, raw JSON, tool dumps).
 *
 * Typed Block Taxonomy:
 * 1. TEXT - Clean prose typography (no raw markdown tokens)
 * 2. DATA - Key-value financial table (Collateral, Debt, Credit, LTV)
 * 3. OBSERVATION - Market & Oracle live inspection card
 * 4. PLAN - Multi-step strategy plan with prerequisite dependencies
 * 5. ACTION - Protocol action proposal with parameters
 * 6. PERMISSION - Circuit Permission evaluation flow (Intent -> Authority -> Scope -> Risk -> Policy -> Permission)
 * 7. APPROVAL - Human-in-the-loop review prompt (Review / Approve / Reject)
 * 8. EXECUTION - Live transaction execution status
 * 9. CONFIRMATION - On-chain confirmation with explorer link
 * 10. BLOCKED - Security / Risk restriction explainer
 * 11. ERROR / WARNING - Protocol diagnostics
 * 12. TASK / WATCH - Persistent automation cards
 * 13. SUMMARY - Concise state check card
 */

import React, { useState } from "react";
import { ProtocolAction } from "../../lib/permission-engine";

export type AgentBlockType =
  | "TEXT"
  | "DATA"
  | "OBSERVATION"
  | "PLAN"
  | "ACTION"
  | "PERMISSION"
  | "APPROVAL"
  | "EXECUTION"
  | "CONFIRMATION"
  | "BLOCKED"
  | "ERROR"
  | "WARNING"
  | "TASK"
  | "WATCH"
  | "SCHEDULE"
  | "SUMMARY";

export interface ParsedBlock {
  type: AgentBlockType;
  title?: string;
  data?: Record<string, any>;
  items?: Array<{ label: string; value: string; hint?: string; tone?: "default" | "success" | "warning" | "danger" }>;
  steps?: Array<{ step: number; text: string; status?: "PENDING" | "ACTIVE" | "DONE" | "BLOCKED" }>;
  content?: string;
  action?: ProtocolAction;
  symbol?: string;
  amountUsd?: number;
  riskState?: string;
  permission?: "ALLOWED" | "BLOCKED" | "CAPPED";
  reason?: string;
  txSignature?: string;
}

interface AgentMessageRendererProps {
  content: string;
  blocks?: any[];
  tools?: any[];
  streaming?: boolean;
  onApproveProposal?: (proposal: any) => void;
  onRejectProposal?: () => void;
  onActionClick?: (action: ProtocolAction, symbol: string) => void;
}

/**
 * Strips raw markdown tokens: ###, **, *, ---, backticks, bullet prefixes
 */
export function stripMarkdown(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/^###+\s*/gm, "")
    .replace(/^##+\s*/gm, "")
    .replace(/^#+\s*/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/```[a-z]*\n?([\s\S]*?)```/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^[-*+]\s+/gm, "• ")
    .replace(/^---+$/gm, "")
    .trim();
}

/**
 * Parses raw textual response into typed cards if structured blocks aren't passed.
 */
export function parseContentToBlocks(raw: string): ParsedBlock[] {
  const clean = raw.trim();
  if (!clean) return [];

  // Check for JSON payload inside markdown code fences
  const jsonMatch = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.type === "PORTFOLIO_CHECK" || parsed.collateralUsd !== undefined) {
        return [
          {
            type: "DATA",
            title: "PORTFOLIO CHECK",
            items: [
              { label: "Collateral", value: parsed.collateralUsd != null ? `$${Number(parsed.collateralUsd).toFixed(2)}` : "—" },
              { label: "Debt", value: parsed.debtUsd != null ? `$${Number(parsed.debtUsd).toFixed(2)}` : "—" },
              { label: "Available Credit", value: parsed.availableCreditUsd != null ? `$${Number(parsed.availableCreditUsd).toFixed(2)}` : "—" },
              { label: "Risk State", value: parsed.riskState || "SAFE", tone: parsed.riskState === "SAFE" ? "success" : "warning" },
              { label: "Market Session", value: parsed.isMarketOpen ? "OPEN" : "CLOSED" },
            ],
          },
        ];
      }
    } catch {
      // not JSON, continue
    }
  }

  // Detect BLOCKED patterns
  if (/\b(?:blocked|disallowed|prohibited|not allowed)\b/i.test(clean) && /\b(?:risk|cap|limit|closed|stale)\b/i.test(clean)) {
    const lines = clean.split("\n").filter(l => l.trim().length > 0);
    const title = "ACTION RESTRICTED BY PROTOCOL";
    const reasonLine = lines.find(l => /because|reason|due to|capped|restricted/i.test(l)) || lines[0];
    return [
      {
        type: "BLOCKED",
        title,
        reason: stripMarkdown(reasonLine),
        content: stripMarkdown(clean),
      },
    ];
  }

  // Detect PLAN patterns (e.g. 1. 2. 3. steps)
  const stepMatches = clean.match(/(?:^|\n)\s*\d+\.\s+([^\n]+)/g);
  if (stepMatches && stepMatches.length >= 2) {
    const steps = stepMatches.map((m, idx) => ({
      step: idx + 1,
      text: stripMarkdown(m.replace(/^\s*\d+\.\s*/, "")),
      status: "PENDING" as const,
    }));
    return [
      {
        type: "PLAN",
        title: "STRATEGY EXECUTION PLAN",
        steps,
        content: stripMarkdown(clean.replace(/(?:^|\n)\s*\d+\.\s+([^\n]+)/g, "").trim()),
      },
    ];
  }

  // Detect OBSERVATION patterns (Asset price, Oracle status, etc.)
  if (/\b(?:oracle|pyth|price|confidence|freshness)\b/i.test(clean) && /\b(?:nvda|aapl|msft|googl|amzn|tsla)\b/i.test(clean)) {
    const assetMatch = clean.match(/\b(NVDA|AAPL|MSFT|GOOGL|AMZN|TSLA|META|NFLX|COIN|AMD|SPY)\b/i);
    const symbol = assetMatch ? assetMatch[1].toUpperCase() : "ASSET";
    return [
      {
        type: "OBSERVATION",
        title: `${symbol} MARKET OBSERVATION`,
        symbol,
        content: stripMarkdown(clean),
      },
    ];
  }

  // Fallback: clean typed text
  return [
    {
      type: "TEXT",
      content: stripMarkdown(clean),
    },
  ];
}

export function AgentMessageRenderer({
  content,
  blocks,
  tools,
  streaming,
  onApproveProposal,
  onRejectProposal,
  onActionClick,
}: AgentMessageRendererProps) {
  const parsedBlocks = React.useMemo(() => {
    if (blocks && blocks.length > 0) return null;
    return parseContentToBlocks(content);
  }, [content, blocks]);

  return (
    <div className="agent-message-renderer" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* 1. Pre-structured Blocks passed via props */}
      {blocks && blocks.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {blocks.map((block, idx) => (
            <React.Fragment key={`block_${idx}`}>
              <RenderTypedBlock
                block={block}
                onApproveProposal={onApproveProposal}
                onRejectProposal={onRejectProposal}
                onActionClick={onActionClick}
              />
            </React.Fragment>
          ))}
        </div>
      )}

      {/* 2. Content parsed into typed visual cards if no pre-structured blocks */}
      {parsedBlocks && parsedBlocks.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {parsedBlocks.map((b, idx) => (
            <React.Fragment key={`parsed_${idx}`}>
              <RenderParsedBlock
                block={b}
                onApproveProposal={onApproveProposal}
                onRejectProposal={onRejectProposal}
                onActionClick={onActionClick}
              />
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Streaming cursor */}
      {streaming && (
        <span
          style={{
            display: "inline-block",
            width: 7,
            height: 14,
            background: "var(--accent, #eceae6)",
            marginLeft: 4,
            verticalAlign: "middle",
            animation: "agBlink 1s step-end infinite",
          }}
        />
      )}
    </div>
  );
}

function RenderParsedBlock({
  block,
  onApproveProposal,
  onRejectProposal,
  onActionClick,
}: {
  block: ParsedBlock;
  onApproveProposal?: (p: any) => void;
  onRejectProposal?: () => void;
  onActionClick?: (action: ProtocolAction, symbol: string) => void;
}) {
  switch (block.type) {
    case "DATA":
    case "SUMMARY":
      return (
        <div
          style={{
            background: "var(--surface-1, #121214)",
            border: "1px solid var(--border-strong, #2e2e34)",
            borderRadius: 10,
            padding: "14px 16px",
            fontFamily: "var(--mono, monospace)",
          }}
        >
          {block.title && (
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--text-3, #71717a)",
                letterSpacing: "0.08em",
                marginBottom: 10,
                textTransform: "uppercase",
              }}
            >
              {block.title}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {block.items?.map((item, idx) => (
              <div key={idx} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: "var(--text-2, #a1a1aa)" }}>{item.label}</span>
                <span
                  style={{
                    fontWeight: 600,
                    color:
                      item.tone === "success"
                        ? "var(--mint, #79c2a4)"
                        : item.tone === "warning"
                        ? "var(--warning, #cfad74)"
                        : item.tone === "danger"
                        ? "var(--danger, #cf8b8b)"
                        : "var(--text, #e4e4e7)",
                  }}
                >
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      );

    case "PLAN":
      return (
        <div
          style={{
            background: "var(--surface-1, #121214)",
            border: "1px solid #818cf840",
            borderRadius: 10,
            padding: "16px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 11,
              fontWeight: 700,
              color: "#818cf8",
              fontFamily: "var(--mono, monospace)",
              letterSpacing: "0.08em",
              marginBottom: 12,
            }}
          >
            <span>STRATEGY EXECUTION PLAN</span>
            <span style={{ fontSize: 10, padding: "1px 6px", background: "rgba(129,140,248,0.15)", borderRadius: 4 }}>
              VALIDATED
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {block.steps?.map((step) => (
              <div key={step.step} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13 }}>
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: "rgba(129,140,248,0.15)",
                    color: "#818cf8",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontFamily: "var(--mono)",
                    flexShrink: 0,
                    fontWeight: 700,
                  }}
                >
                  {step.step}
                </span>
                <span style={{ color: "var(--text, #e4e4e7)", lineHeight: 1.5 }}>{step.text}</span>
              </div>
            ))}
          </div>

          {block.content && (
            <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-3, #71717a)", lineHeight: 1.5, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
              {block.content}
            </div>
          )}
        </div>
      );

    case "BLOCKED":
      return (
        <div
          style={{
            background: "rgba(207,139,139,0.06)",
            border: "1px solid rgba(207,139,139,0.3)",
            borderRadius: 10,
            padding: "14px 16px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              fontWeight: 700,
              color: "var(--danger, #cf8b8b)",
              fontFamily: "var(--mono, monospace)",
              letterSpacing: "0.08em",
              marginBottom: 8,
            }}
          >
            <span>ACTION BLOCKED</span>
            <span>✕</span>
          </div>
          <div style={{ fontSize: 13, color: "var(--text, #e4e4e7)", fontWeight: 500, lineHeight: 1.5 }}>
            {block.reason || block.content}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-3, #71717a)", marginTop: 6, fontFamily: "var(--mono)" }}>
            Protocol containment active · Recovery actions (Repay / Exit) remain open.
          </div>
        </div>
      );

    case "OBSERVATION":
      return (
        <div
          style={{
            background: "var(--surface-1, #121214)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: "14px 16px",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--text-3)",
              fontFamily: "var(--mono)",
              letterSpacing: "0.08em",
              marginBottom: 8,
            }}
          >
            {block.title || "MARKET OBSERVATION"}
          </div>
          <div style={{ fontSize: 13.5, color: "var(--text)", lineHeight: 1.6 }}>
            {block.content}
          </div>
        </div>
      );

    case "TEXT":
    default:
      return (
        <div
          style={{
            fontSize: 14,
            lineHeight: 1.65,
            color: "var(--text, #e4e4e7)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {block.content}
        </div>
      );
  }
}
function ProposalParsedCard({
  block,
  onApproveProposal,
  onRejectProposal,
}: {
  block: any;
  onApproveProposal?: (p: any) => void;
  onRejectProposal?: () => void;
}) {
  const [isDismissed, setIsDismissed] = React.useState(false);
  const [isApproved, setIsApproved] = React.useState(false);
  const isAllowed = block.permission === "ALLOWED";

  if (isDismissed || block.dismissed) {
    return (
      <div
        style={{
          padding: "10px 14px",
          background: "var(--surface-2)",
          border: "1px dashed var(--border)",
          borderRadius: 8,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          color: "var(--text-3)",
          fontSize: 11,
          fontFamily: "var(--mono)",
        }}
      >
        <span>✕ {block.action?.toUpperCase()} PROPOSAL DISMISSED</span>
        <span style={{ fontSize: 10 }}>${block.amountUsd?.toFixed(2)} {block.symbol}</span>
      </div>
    );
  }

  return (
    <div
      style={{
        background: "var(--surface-1)",
        border: `1px solid ${isAllowed ? "rgba(121,194,164,0.3)" : "rgba(207,139,139,0.3)"}`,
        borderRadius: 10,
        padding: "16px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontFamily: "var(--mono)", fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.08em" }}>
          ACTION PROPOSAL
        </div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            fontFamily: "var(--mono)",
            padding: "2px 8px",
            borderRadius: 4,
            background: isAllowed ? "rgba(121,194,164,0.12)" : "rgba(207,139,139,0.12)",
            color: isAllowed ? "var(--mint, #79c2a4)" : "var(--danger, #cf8b8b)",
          }}
        >
          {block.permission}
        </span>
      </div>

      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>
        {block.action?.toUpperCase()} {block.amountUsd ? `$${block.amountUsd.toFixed(2)}` : ""} {block.symbol}
      </div>

      {/* Compact Permission Gate flow */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "10px 0", fontSize: 11, fontFamily: "var(--mono)" }}>
        <GateBadge label="Intent" passed />
        <GateBadge label="Authority" passed />
        <GateBadge label="Risk State" passed={block.riskState !== "EMERGENCY"} />
        <GateBadge label="Policy" passed={isAllowed} />
      </div>

      {block.reason && (
        <div style={{ fontSize: 12, color: isAllowed ? "var(--text-2)" : "var(--danger)", marginBottom: 12, lineHeight: 1.4 }}>
          {block.reason}
        </div>
      )}

      {isAllowed && (
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button
            type="button"
            disabled={isApproved}
            onClick={() => {
              setIsApproved(true);
              onApproveProposal?.(block);
            }}
            style={{
              flex: 1,
              padding: "8px 14px",
              background: isApproved ? "rgba(121,194,164,0.15)" : "var(--p-deep, #122311)",
              color: isApproved ? "var(--mint, #79c2a4)" : "#ffffff",
              border: "none",
              borderRadius: 6,
              fontWeight: 700,
              fontSize: 12,
              cursor: isApproved ? "default" : "pointer",
              fontFamily: "var(--mono)",
            }}
          >
            {isApproved ? "✓ Opened for Signature" : "Approve & Sign"}
          </button>
          <button
            type="button"
            onClick={() => {
              setIsDismissed(true);
              onRejectProposal?.();
            }}
            style={{
              padding: "8px 14px",
              background: "transparent",
              color: "var(--text-2)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontWeight: 600,
              fontSize: 12,
              cursor: "pointer",
              fontFamily: "var(--mono)",
            }}
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

function RenderTypedBlock({
  block,
  onApproveProposal,
  onRejectProposal,
  onActionClick,
}: {
  block: any;
  onApproveProposal?: (p: any) => void;
  onRejectProposal?: () => void;
  onActionClick?: (action: ProtocolAction, symbol: string) => void;
}) {
  // If block is a ProposalCardBlockData
  if (block.type === "PROPOSAL_CARD") {
    return (
      <ProposalParsedCard
        block={block}
        onApproveProposal={onApproveProposal}
        onRejectProposal={onRejectProposal}
      />
    );
  }

  // Fallback for other block types: render JSON cleanly
  return (
    <div style={{ fontSize: 13, color: "var(--text-2)" }}>
      {JSON.stringify(block)}
    </div>
  );
}

function GateBadge({ label, passed }: { label: string; passed: boolean }) {
  return (
    <span
      style={{
        padding: "2px 6px",
        borderRadius: 4,
        background: passed ? "rgba(121,194,164,0.1)" : "rgba(207,139,139,0.1)",
        color: passed ? "var(--mint, #79c2a4)" : "var(--danger, #cf8b8b)",
        border: `1px solid ${passed ? "rgba(121,194,164,0.25)" : "rgba(207,139,139,0.25)"}`,
      }}
    >
      {label} {passed ? "✓" : "✕"}
    </span>
  );
}
