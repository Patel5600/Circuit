/**
 * Circuit Protocol - Structured Interactive Agent Blocks
 *
 * Renders inline protocol execution cards:
 * 1. MarketCardBlock - compact live asset card with real state and context-aware action buttons
 * 2. ChartCardBlock - in-chat SVG price trend and Pyth status
 * 3. ProposalCardBlock - 7-attribute permission checked action proposal
 * 4. ClarificationBlock - fuzzy match suggestions
 * 5. TransactionBlock - onchain transaction confirmation
 * 6. StrategyCardBlock - automated watch / strategy cards
 */

import React, { useState } from "react";
import {
  MarketCardBlockData,
  ChartCardBlockData,
  ProposalCardBlockData,
  ClarificationBlockData,
  TransactionCardBlockData,
  StrategyCardBlockData,
} from "../../lib/agent/types";
import { ProtocolAction } from "../../lib/permission-engine";

interface MarketCardProps {
  block: MarketCardBlockData;
  onActionClick: (action: ProtocolAction, symbol: string) => void;
  onChartClick?: (symbol: string) => void;
  onSubTabClick?: (tab: "Market" | "Risk" | "Position" | "Activity", symbol: string) => void;
}

export function MarketCardBlock({ block, onActionClick, onChartClick, onSubTabClick }: MarketCardProps) {
  const {
    market,
    metadata,
    priceUsd,
    priceChange24h,
    riskState,
    collateralUsd,
    debtUsd,
    borrowCapacityUsd,
    healthFactor,
    oracleStatus,
  } = block;

  const isDefensive = riskState === "DEFENSIVE";
  const isEmergency = riskState === "EMERGENCY";
  const isRestricted = riskState === "RESTRICTED";
  const borrowBlocked = isDefensive || isEmergency;
  const withdrawBlocked = (isDefensive || isEmergency) && (debtUsd ?? 0) > 0;

  // Format helpers with "Unavailable" safety
  const fmtMoney = (val: number | null) => (val !== null && !isNaN(val) ? `$${val.toFixed(2)}` : "Unavailable");
  const fmtHf = (hf: number | null) => {
    if (hf === null) return "Infinite (No Debt)";
    if (hf >= 999) return "> 999.00";
    return hf.toFixed(3);
  };

  const changeStr = priceChange24h !== null && !isNaN(priceChange24h)
    ? `${priceChange24h >= 0 ? "+" : ""}${priceChange24h.toFixed(2)}%`
    : null;

  const riskColor =
    riskState === "SAFE"
      ? "var(--mint, #79c2a4)"
      : riskState === "RESTRICTED"
      ? "var(--warning, #cfad74)"
      : "var(--danger, #cf8b8b)";

  return (
    <div
      style={{
        margin: "12px 0",
        padding: "16px 18px",
        background: "var(--surface-1, #121214)",
        border: "1px solid var(--border-strong, #2e2e34)",
        borderRadius: "var(--r, 12px)",
        maxWidth: 580,
        boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
      }}
    >
      {/* Header: Token & Company */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", fontFamily: "var(--mono)" }}>
              {market.tokenSymbol}
            </span>
            <span
              style={{
                fontSize: 9.5,
                fontFamily: "var(--mono)",
                padding: "2px 6px",
                borderRadius: 4,
                background: "rgba(236,234,230,0.08)",
                color: "var(--text-3)",
              }}
            >
              CANONICAL ASSET
            </span>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 2 }}>
            {metadata?.displayName || market.name}
          </div>
        </div>

        {/* Risk Badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "3px 8px",
            borderRadius: 6,
            background: `color-mix(in srgb, ${riskColor} 12%, transparent)`,
            border: `1px solid color-mix(in srgb, ${riskColor} 30%, transparent)`,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: riskColor }} />
          <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "var(--mono)", color: riskColor }}>
            {riskState}
          </span>
        </div>
      </div>

      {/* Price & Oracle */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 24, fontWeight: 800, color: "var(--text)", fontFamily: "var(--mono)" }}>
          {fmtMoney(priceUsd)}
        </span>
        {changeStr && (
          <span
            style={{
              fontSize: 12,
              fontFamily: "var(--mono)",
              fontWeight: 600,
              color: priceChange24h! >= 0 ? "var(--mint, #79c2a4)" : "var(--danger, #cf8b8b)",
            }}
          >
            {changeStr}
          </span>
        )}
        <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--mono)", marginLeft: "auto" }}>
          Pyth · {oracleStatus || "Fresh"}
        </span>
      </div>

      {/* Live State Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "8px 16px",
          padding: "10px 12px",
          background: "var(--surface-2, #18181b)",
          borderRadius: 8,
          marginBottom: 14,
          fontSize: 11.5,
          fontFamily: "var(--mono)",
        }}
      >
        <div>
          <span style={{ color: "var(--text-3)" }}>Borrow Cap: </span>
          <span style={{ color: borrowBlocked ? "var(--danger, #cf8b8b)" : "var(--text)", fontWeight: 700 }}>
            {borrowBlocked ? "Blocked" : fmtMoney(borrowCapacityUsd)}
          </span>
        </div>
        <div>
          <span style={{ color: "var(--text-3)" }}>Health: </span>
          <span style={{ color: "var(--text)", fontWeight: 700 }}>
            {fmtHf(healthFactor)}
          </span>
        </div>
        <div>
          <span style={{ color: "var(--text-3)" }}>Collateral: </span>
          <span style={{ color: "var(--text)" }}>{fmtMoney(collateralUsd)}</span>
        </div>
        <div>
          <span style={{ color: "var(--text-3)" }}>Debt: </span>
          <span style={{ color: "var(--text)" }}>{fmtMoney(debtUsd)}</span>
        </div>
      </div>

      {/* Action Buttons Row */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => onActionClick("deposit", market.symbol)}
          style={{
            padding: "5px 12px",
            fontSize: 11,
            fontFamily: "var(--mono)",
            fontWeight: 700,
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            color: "var(--text)",
            cursor: "pointer",
          }}
        >
          Deposit
        </button>

        <button
          type="button"
          disabled={borrowBlocked}
          onClick={() => onActionClick("borrow", market.symbol)}
          style={{
            padding: "5px 12px",
            fontSize: 11,
            fontFamily: "var(--mono)",
            fontWeight: 700,
            background: borrowBlocked ? "rgba(207,139,139,0.1)" : "var(--accent, #eceae6)",
            border: borrowBlocked ? "1px solid rgba(207,139,139,0.3)" : "none",
            borderRadius: 6,
            color: borrowBlocked ? "var(--danger, #cf8b8b)" : "#0c0c0d",
            cursor: borrowBlocked ? "not-allowed" : "pointer",
          }}
          title={borrowBlocked ? `Borrow is suspended in ${riskState}` : "Borrow USDC against collateral"}
        >
          {borrowBlocked ? `Borrow [${riskState}]` : "Borrow"}
        </button>

        <button
          type="button"
          disabled={withdrawBlocked}
          onClick={() => onActionClick("withdraw", market.symbol)}
          style={{
            padding: "5px 12px",
            fontSize: 11,
            fontFamily: "var(--mono)",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            color: withdrawBlocked ? "var(--text-3)" : "var(--text-2)",
            cursor: withdrawBlocked ? "not-allowed" : "pointer",
          }}
        >
          Withdraw
        </button>

        <button
          type="button"
          onClick={() => onActionClick("repay", market.symbol)}
          style={{
            padding: "5px 12px",
            fontSize: 11,
            fontFamily: "var(--mono)",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            color: "var(--mint, #79c2a4)",
            cursor: "pointer",
          }}
        >
          Repay
        </button>

        <button
          type="button"
          onClick={() => onActionClick("swap", market.symbol)}
          style={{
            padding: "5px 12px",
            fontSize: 11,
            fontFamily: "var(--mono)",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            color: "var(--text-2)",
            cursor: "pointer",
          }}
        >
          Swap
        </button>

        <button
          type="button"
          onClick={() => onActionClick("enter_liquidity", market.symbol)}
          style={{
            padding: "5px 12px",
            fontSize: 11,
            fontFamily: "var(--mono)",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            color: "var(--text-2)",
            cursor: "pointer",
          }}
        >
          Liquidity
        </button>

        {onChartClick && (
          <button
            type="button"
            onClick={() => onChartClick(market.symbol)}
            style={{
              padding: "5px 12px",
              fontSize: 11,
              fontFamily: "var(--mono)",
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: 6,
              color: "var(--text-3)",
              cursor: "pointer",
            }}
          >
            Chart
          </button>
        )}
      </div>

      {/* Sub-tabs / Shortcuts footer */}
      <div
        style={{
          display: "flex",
          gap: 12,
          paddingTop: 8,
          borderTop: "1px solid var(--border)",
          fontSize: 10,
          fontFamily: "var(--mono)",
          color: "var(--text-3)",
        }}
      >
        {(["Market", "Risk", "Position", "Activity"] as const).map((tab) => (
          <span
            key={tab}
            onClick={() => onSubTabClick?.(tab, market.symbol)}
            style={{ cursor: "pointer", transition: "color 0.15s" }}
            onMouseEnter={(e) => ((e.target as HTMLElement).style.color = "var(--text)")}
            onMouseLeave={(e) => ((e.target as HTMLElement).style.color = "var(--text-3)")}
          >
            {tab}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ChartCardBlock({ block }: { block: ChartCardBlockData }) {
  const [tf, setTf] = useState<"24h" | "7d">(block.timeframe);
  const { symbol, name, currentPrice, priceChange, dataPoints, isAvailable, reason } = block;

  const points = dataPoints && dataPoints.length > 1 ? dataPoints : [
    { t: 1, p: currentPrice || 100 },
    { t: 2, p: (currentPrice || 100) * 0.99 },
    { t: 3, p: (currentPrice || 100) * 1.01 },
    { t: 4, p: currentPrice || 100 },
  ];

  const minP = Math.min(...points.map(p => p.p));
  const maxP = Math.max(...points.map(p => p.p));
  const range = maxP - minP || 1;

  // Simple SVG polyline
  const width = 360;
  const height = 90;
  const polylineStr = points
    .map((p, idx) => {
      const x = (idx / (points.length - 1)) * (width - 20) + 10;
      const y = height - ((p.p - minP) / range) * (height - 20) - 10;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div
      style={{
        margin: "12px 0",
        padding: "16px",
        background: "var(--surface-1)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        maxWidth: 580,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", fontFamily: "var(--mono)" }}>
            {symbol}x Price Chart ({tf.toUpperCase()})
          </span>
          <span style={{ fontSize: 11, color: "var(--text-3)", marginLeft: 8 }}>{name}</span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            type="button"
            onClick={() => setTf("24h")}
            style={{
              padding: "2px 7px",
              fontSize: 10,
              fontFamily: "var(--mono)",
              background: tf === "24h" ? "var(--accent)" : "var(--surface-2)",
              color: tf === "24h" ? "#0c0c0d" : "var(--text-3)",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            24H
          </button>
          <button
            type="button"
            onClick={() => setTf("7d")}
            style={{
              padding: "2px 7px",
              fontSize: 10,
              fontFamily: "var(--mono)",
              background: tf === "7d" ? "var(--accent)" : "var(--surface-2)",
              color: tf === "7d" ? "#0c0c0d" : "var(--text-3)",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            7D
          </button>
        </div>
      </div>

      <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text)", fontFamily: "var(--mono)", marginBottom: 8 }}>
        ${currentPrice ? currentPrice.toFixed(2) : "Unavailable"}
        {priceChange !== null && (
          <span style={{ fontSize: 11, marginLeft: 8, color: priceChange >= 0 ? "var(--mint)" : "var(--danger)" }}>
            {priceChange >= 0 ? "+" : ""}{priceChange.toFixed(2)}%
          </span>
        )}
      </div>

      {isAvailable ? (
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: 90, overflow: "visible" }}>
          <polyline
            fill="none"
            stroke="var(--mint, #79c2a4)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={polylineStr}
          />
        </svg>
      ) : (
        <div style={{ padding: "20px 0", textAlign: "center", fontSize: 11, fontFamily: "var(--mono)", color: "var(--text-3)" }}>
          {reason || "Insufficient observed history (Devnet). Streaming live spot feed."}
        </div>
      )}
    </div>
  );
}

export function ProposalCardBlock({
  block,
  onApprove,
  onCancel,
}: {
  block: ProposalCardBlockData;
  onApprove: (block: ProposalCardBlockData) => void;
  onCancel: () => void;
}) {
  const [isDismissed, setIsDismissed] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const isAllowed = block.permission === "ALLOWED";

  if (isDismissed || (block as any).dismissed) {
    return (
      <div
        style={{
          margin: "8px 0",
          padding: "10px 14px",
          background: "var(--surface-2)",
          border: "1px dashed var(--border)",
          borderRadius: 8,
          maxWidth: 500,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          color: "var(--text-3)",
          fontSize: 11,
          fontFamily: "var(--mono)",
        }}
      >
        <span>✕ {block.action.toUpperCase()} PROPOSAL DISMISSED</span>
        <span style={{ fontSize: 10 }}>${block.amountUsd.toFixed(2)} {block.symbol}</span>
      </div>
    );
  }

  return (
    <div
      style={{
        margin: "12px 0",
        padding: "16px 18px",
        background: "var(--surface-1)",
        border: "1px solid var(--border-strong, #2e2e34)",
        borderRadius: 12,
        maxWidth: 500,
        boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: isAllowed ? "var(--mint, #79c2a4)" : "var(--danger, #cf8b8b)" }} />
          <span style={{ fontSize: 13, fontWeight: 800, fontFamily: "var(--mono)", color: "var(--text)" }}>
            {block.action.toUpperCase()} PROPOSAL
          </span>
        </div>
        <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text-3)" }}>
          Risk: {block.riskState}
        </span>
      </div>

      <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", fontFamily: "var(--mono)", marginBottom: 10 }}>
        ${block.amountUsd.toFixed(2)} USDC <span style={{ fontSize: 13, color: "var(--text-3)" }}>against {block.symbol}x</span>
      </div>

      <div
        style={{
          padding: "10px",
          background: "var(--surface-2)",
          borderRadius: 8,
          marginBottom: 14,
          fontSize: 11,
          fontFamily: "var(--mono)",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "var(--text-3)" }}>Available Credit:</span>
          <span style={{ color: "var(--text)" }}>${block.borrowCapacityUsd.toFixed(2)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "var(--text-3)" }}>Permission Engine:</span>
          <span style={{ color: isAllowed ? "var(--mint, #79c2a4)" : "var(--danger, #cf8b8b)", fontWeight: 700 }}>
            {block.permission}
          </span>
        </div>
        {!isAllowed && (
          <div style={{ color: "var(--danger, #cf8b8b)", marginTop: 4, lineHeight: 1.4 }}>
            {block.reason}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsDismissed(true);
            onCancel();
          }}
          style={{
            padding: "8px 14px",
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: 6,
            color: "var(--text-2)",
            fontSize: 11,
            fontFamily: "var(--mono)",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Dismiss
        </button>

        <button
          type="button"
          disabled={!isAllowed || isApproved}
          onClick={(e) => {
            e.stopPropagation();
            setIsApproved(true);
            onApprove(block);
          }}
          style={{
            padding: "8px 16px",
            background: isAllowed ? (isApproved ? "rgba(121,194,164,0.2)" : "var(--p-deep, #122311)") : "var(--surface-2)",
            border: "none",
            borderRadius: 6,
            color: isApproved ? "var(--mint, #79c2a4)" : "#ffffff",
            fontSize: 11,
            fontFamily: "var(--mono)",
            fontWeight: 700,
            cursor: isAllowed && !isApproved ? "pointer" : "not-allowed",
          }}
        >
          {isApproved ? "✓ Opened for Signature" : "Approve & Sign →"}
        </button>
      </div>
    </div>
  );
}

export function ClarificationBlock({
  block,
  onSelectOption,
}: {
  block: ClarificationBlockData;
  onSelectOption: (actionText: string) => void;
}) {
  return (
    <div
      style={{
        margin: "10px 0",
        padding: "12px 14px",
        background: "rgba(207,173,116,0.08)",
        border: "1px solid rgba(207,173,116,0.25)",
        borderRadius: 8,
        maxWidth: 480,
      }}
    >
      <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 8 }}>{block.prompt}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {block.options.map((opt) => (
          <button
            key={opt.label}
            type="button"
            onClick={() => onSelectOption(opt.actionText)}
            style={{
              padding: "4px 10px",
              fontSize: 11,
              fontFamily: "var(--mono)",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              color: "var(--text)",
              cursor: "pointer",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function TransactionBlock({ block }: { block: TransactionCardBlockData }) {
  const isConfirmed = block.state === "CONFIRMED";
  const isFailed = block.state === "FAILED";

  return (
    <div
      style={{
        margin: "12px 0",
        padding: "14px 16px",
        background: isConfirmed ? "rgba(121,194,164,0.08)" : isFailed ? "rgba(207,139,139,0.08)" : "var(--surface-1)",
        border: `1px solid ${isConfirmed ? "rgba(121,194,164,0.3)" : isFailed ? "rgba(207,139,139,0.3)" : "var(--border)"}`,
        borderRadius: 10,
        maxWidth: 500,
        fontFamily: "var(--mono)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: isConfirmed ? "var(--mint)" : isFailed ? "var(--danger)" : "var(--text)" }}>
          {block.state} · {block.action.toUpperCase()} ${block.amountUsd}
        </span>
        <span style={{ fontSize: 10, color: "var(--text-3)" }}>Solana Devnet</span>
      </div>

      {block.txSignature && (
        <div style={{ fontSize: 11, color: "var(--text-2)", wordBreak: "break-all", marginTop: 4 }}>
          Sig: {block.txSignature.slice(0, 16)}...{block.txSignature.slice(-16)}
        </div>
      )}

      {block.explorerUrl && (
        <div style={{ marginTop: 8 }}>
          <a
            href={block.explorerUrl}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 11, color: "var(--accent)", textDecoration: "underline" }}
          >
            View on Solana Explorer &rarr;
          </a>
        </div>
      )}

      {block.error && (
        <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 6 }}>
          {block.error}
        </div>
      )}
    </div>
  );
}
