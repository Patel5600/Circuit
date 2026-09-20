import React, { useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Pill, Tone, Icon } from "../ui";
import { LOGOS, type LogoMark } from "../../data/logos";
import { formatMoney } from "../../lib/format";
import { useAction } from "../../context/ActionContext";
import { getDeployedMarket, getDeployedMarketByMint } from "../../data/markets";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export interface AssetNode {
  symbol: string;
  name?: string;
  mint?: string;
  weightPct: number; // 0–100
  oracleHealthy: boolean;
  confBps: number;
  maxConfBps: number;
  marketOpen: boolean;
  mark?: LogoMark;
  
  // Real financial fields for detail panel
  priceUsd?: number;
  change24hPercent?: number | null;
  collateralValueUsd?: number;
  impactBorrowPowerUsd?: number;
  explanation?: string;
}

export interface DynamicStatePayload {
  riskState: "SAFE" | "RESTRICTED" | "DEFENSIVE" | "EMERGENCY";
  effectiveLtvBps: number;
  borrowPowerUsd: number;
  borrowAllowed: boolean;
  concentrationPct: number;
  confBps: number;
  hardOverride: boolean;
  hardOverrideReason?: string;
}

export interface PortfolioRiskGraphProps {
  assets: AssetNode[];
  riskState: "SAFE" | "RESTRICTED" | "DEFENSIVE" | "EMERGENCY";
  baseLtvBps: number;
  effectiveLtvBps: number;
  borrowPowerUsd: number;
  totalCollateralUsd: number;
  borrowAllowed: boolean;
  hardOverride: boolean;
  hardOverrideReason?: string;
  uneditable?: boolean;
  loading?: boolean;
  simMode?: "LIVE" | "HEALTHY" | "STRESS" | "EMERGENCY";
  onSimModeChange?: (mode: "LIVE" | "HEALTHY" | "STRESS" | "EMERGENCY") => void;
  onDynamicStateChange?: (payload: DynamicStatePayload) => void;
  onSelectNodeDriver?: (nodeId: string) => void;
}

/* -------------------------------------------------------------------------- */
/*  Brand Marks & Names                                                       */
/* -------------------------------------------------------------------------- */

import { USDC_LOGO, getAssetMark, getAssetName } from "../../data/logos";
export { USDC_LOGO, getAssetMark, getAssetName };

/* -------------------------------------------------------------------------- */
/*  Colors & constants                                                        */
/* -------------------------------------------------------------------------- */

const STATE_COLOR: Record<string, string> = {
  SAFE: "#7fc39a",
  RESTRICTED: "#cfad74",
  DEFENSIVE: "#e08c4e",
  EMERGENCY: "#cf8b8b",
};

const W = 1000;
const COL_ASSET = 95;
const COL_RISK = 295;
const COL_PORTFOLIO = 495;
const COL_CREDIT = 695;
const COL_PERM = 890;

/* -------------------------------------------------------------------------- */
/*  Causal Edge Component                                                     */
/* -------------------------------------------------------------------------- */

function CausalEdge({
  x1, y1, x2, y2,
  thickness = 1.5,
  color = "var(--border)",
  dashed = false,
  highlighted = false,
  dimmed = false,
}: {
  x1: number; y1: number; x2: number; y2: number;
  thickness?: number; color?: string; dashed?: boolean;
  highlighted?: boolean; dimmed?: boolean;
}) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  
  // When y1 and y2 are on the same plane, introduce organic elevation tension
  // to avoid artificial, rigid straight horizontal lines.
  const d = Math.abs(dy) < 2
    ? `M ${x1} ${y1} C ${x1 + dx * 0.35} ${y1 - 12}, ${x1 + dx * 0.65} ${y2 - 12}, ${x2} ${y2}`
    : `M ${x1} ${y1} C ${x1 + dx * 0.5} ${y1}, ${x1 + dx * 0.5} ${y2}, ${x2} ${y2}`;
  
  return (
    <path
      d={d}
      fill="none"
      stroke={highlighted ? "var(--accent, #eceae6)" : color}
      strokeWidth={highlighted ? thickness + 1.5 : thickness}
      strokeDasharray={dashed ? "6 4" : undefined}
      strokeLinecap="round"
      opacity={dimmed ? 0.15 : highlighted ? 1 : 0.65}
      style={{ transition: "stroke 0.25s ease, opacity 0.25s ease, stroke-width 0.25s ease" }}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  SVG Node Components                                                       */
/* -------------------------------------------------------------------------- */

function AssetCard({
  x,
  y,
  symbol,
  name,
  weightPct,
  priceUsd,
  mark,
  stressed,
  isHovered,
  isSelected,
  isDimmed,
  onMouseEnter,
  onMouseLeave,
  onClick,
}: {
  x: number;
  y: number;
  symbol: string;
  name: string;
  weightPct: number;
  priceUsd?: number;
  mark?: LogoMark;
  stressed: boolean;
  isHovered: boolean;
  isSelected: boolean;
  isDimmed: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick: () => void;
}) {
  const cardW = 142;
  const cardH = 50;
  const leftX = x - cardW / 2;
  const topY = y - cardH / 2;
  const isConcentrated = weightPct > 40;

  return (
    <g
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
      style={{
        cursor: "pointer",
        opacity: isDimmed ? 0.25 : 1,
        transition: "opacity 0.25s ease, transform 0.2s ease",
      }}
    >
      {/* Background card */}
      <rect
        x={leftX}
        y={topY}
        width={cardW}
        height={cardH}
        rx={8}
        fill="rgba(18, 18, 22, 0.85)"
        stroke={
          isSelected
            ? "var(--accent, #eceae6)"
            : isHovered
            ? "var(--text-2)"
            : stressed
            ? "#cf8b8b"
            : "var(--border)"
        }
        strokeWidth={isSelected ? 2 : isHovered ? 1.5 : 1}
      />

      {/* Brand logo */}
      <circle cx={leftX + 22} cy={topY + 25} r={14} fill="rgba(255, 255, 255, 0.04)" />
      {mark ? (
        <g transform={`translate(${leftX + 11}, ${topY + 14}) scale(0.92)`}>
          {mark.parts ? (
            mark.parts.map((p, idx) => <path key={idx} d={p.d} fill={p.fill} />)
          ) : (
            <path d={mark.d} fill={mark.onDark || "#ffffff"} />
          )}
        </g>
      ) : (
        <text
          x={leftX + 22}
          y={topY + 29}
          textAnchor="middle"
          fontSize={10}
          fontWeight={700}
          fill="var(--text)"
          fontFamily="var(--mono)"
        >
          {symbol.slice(0, 2)}
        </text>
      )}

      {/* Symbol & Name */}
      <text
        x={leftX + 42}
        y={topY + 21}
        fontSize={13}
        fontWeight={700}
        fill="var(--text)"
        fontFamily="var(--sans)"
      >
        {symbol}
      </text>
      <text
        x={leftX + 42}
        y={topY + 36}
        fontSize={9.5}
        fill="var(--text-3)"
        fontFamily="var(--sans)"
      >
        {priceUsd ? `$${formatMoney(priceUsd)}` : (name.length > 9 ? name.slice(0, 8) + "…" : name)}
      </text>

      {/* Weight Pill */}
      <rect
        x={leftX + cardW - 46}
        y={topY + 14}
        width={38}
        height={22}
        rx={4}
        fill={isConcentrated ? "rgba(207, 173, 116, 0.15)" : "rgba(255, 255, 255, 0.05)"}
        stroke={isConcentrated ? "rgba(207, 173, 116, 0.4)" : "rgba(255, 255, 255, 0.1)"}
        strokeWidth={1}
      />
      <text
        x={leftX + cardW - 27}
        y={topY + 29}
        textAnchor="middle"
        fontSize={10}
        fontFamily="var(--mono)"
        fontWeight={650}
        fill={isConcentrated ? "var(--warning)" : "var(--text)"}
      >
        {weightPct}%
      </text>
    </g>
  );
}

function RiskFactorNode({
  x,
  y,
  label,
  level,
  stressed,
  isHard,
  isHovered,
  isDimmed,
  onMouseEnter,
  onMouseLeave,
}: {
  x: number;
  y: number;
  label: string;
  level: "low" | "med" | "high";
  stressed: boolean;
  isHard?: boolean;
  isHovered: boolean;
  isDimmed: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const color = stressed ? "#cf8b8b" : level === "high" ? "#cfad74" : "var(--text-3)";
  const pillW = 96;
  const pillH = 20;

  return (
    <g
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ opacity: isDimmed ? 0.25 : 1, transition: "opacity 0.25s ease", cursor: "pointer" }}
    >
      <rect
        x={x - pillW / 2}
        y={y - pillH / 2}
        width={pillW}
        height={pillH}
        rx={4}
        fill={stressed ? "rgba(207, 139, 139, 0.12)" : "rgba(18, 20, 26, 0.75)"}
        stroke={isHovered ? "var(--accent)" : stressed ? "#cf8b8b" : "var(--border)"}
        strokeWidth={isHovered ? 1.5 : stressed ? 1.2 : 1}
      />
      <text
        x={x}
        y={y + 3.5}
        textAnchor="middle"
        fontSize={9}
        fontFamily="var(--mono)"
        fill={color}
        fontWeight={stressed ? 650 : 500}
      >
        {label} {isHard ? "•" : ""}
      </text>
    </g>
  );
}

function PortfolioNode({
  x,
  y,
  score,
  state,
  isHovered,
  isDimmed,
  onMouseEnter,
  onMouseLeave,
}: {
  x: number;
  y: number;
  score: number;
  state: string;
  isHovered: boolean;
  isDimmed: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const color = STATE_COLOR[state] ?? "var(--text-3)";
  return (
    <g
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ opacity: isDimmed ? 0.25 : 1, transition: "opacity 0.25s ease", cursor: "pointer" }}
    >
      <circle cx={x} cy={y} r={54} fill="none" stroke={color} strokeWidth={isHovered ? 3 : 2} opacity={0.25} />
      <circle
        cx={x}
        cy={y}
        r={54}
        fill="none"
        stroke={color}
        strokeWidth={isHovered ? 5 : 4}
        strokeDasharray={`${score * 3.39} ${339 - score * 3.39}`}
        strokeDashoffset={85}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.5s ease, stroke 0.3s ease" }}
      />
      <circle cx={x} cy={y} r={44} fill={`${color}12`} />
      <text
        x={x}
        y={y - 15}
        textAnchor="middle"
        fontSize={8.5}
        fontFamily="var(--mono)"
        fill="var(--text-3)"
        letterSpacing="0.1em"
      >
        PORTFOLIO RISK
      </text>
      <text x={x} y={y + 6} textAnchor="middle" fontSize={22} fontWeight={700} fill={color}>
        {score}
      </text>
      <text x={x} y={y + 19} textAnchor="middle" fontSize={9.5} fontFamily="var(--mono)" fill={color}>
        / 100
      </text>
      <text x={x} y={y + 36} textAnchor="middle" fontSize={10.5} fontWeight={650} fill={color}>
        {state}
      </text>
    </g>
  );
}

function CreditNode({
  x,
  y,
  effectiveLtv,
  borrowPower,
  allowed,
  hardOverride,
  isHovered,
  isDimmed,
  onMouseEnter,
  onMouseLeave,
}: {
  x: number;
  y: number;
  effectiveLtv: number;
  borrowPower: number;
  allowed: boolean;
  hardOverride: boolean;
  isHovered: boolean;
  isDimmed: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const color = hardOverride ? "#cf8b8b" : allowed ? "#7fc39a" : "#cfad74";
  const cardW = 138;
  const cardH = 124;

  return (
    <g
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ opacity: isDimmed ? 0.25 : 1, transition: "opacity 0.25s ease", cursor: "pointer" }}
    >
      <rect
        x={x - cardW / 2}
        y={y - cardH / 2}
        width={cardW}
        height={cardH}
        rx={10}
        fill={hardOverride ? "rgba(207, 139, 139, 0.08)" : "rgba(127, 195, 154, 0.04)"}
        stroke={isHovered ? "var(--accent)" : color}
        strokeWidth={isHovered ? 2 : 1.5}
      />
      <text
        x={x}
        y={y - 42}
        textAnchor="middle"
        fontSize={8.5}
        fontFamily="var(--mono)"
        fill="var(--text-3)"
        letterSpacing="0.1em"
      >
        CREDIT CAPACITY
      </text>
      <text x={x} y={y - 22} textAnchor="middle" fontSize={9.5} fill="var(--text-3)">
        Effective LTV
      </text>
      <text x={x} y={y - 6} textAnchor="middle" fontSize={18} fontWeight={700} fill={color}>
        {(effectiveLtv / 100).toFixed(0)}%
      </text>
      <text x={x} y={y + 13} textAnchor="middle" fontSize={9.5} fill="var(--text-3)">
        Available Credit
      </text>
      <text
        x={x}
        y={y + 28}
        textAnchor="middle"
        fontSize={14}
        fontWeight={650}
        fill={color}
        fontFamily="var(--mono)"
      >
        ${formatMoney(borrowPower)}
      </text>
      <rect x={x - 56} y={y + 38} width={112} height={18} rx={4} fill={`${color}18`} />
      <text
        x={x}
        y={y + 50}
        textAnchor="middle"
        fontSize={9}
        fontWeight={650}
        fontFamily="var(--mono)"
        fill={color}
      >
        {hardOverride ? "BORROW BLOCKED" : allowed ? "BORROW ALLOWED" : "BORROW RESTRICTED"}
      </text>
    </g>
  );
}

function PermissionNode({
  x,
  y,
  borrowAllowed,
  hardOverride,
  isDimmed,
  onMouseEnter,
  onMouseLeave,
}: {
  x: number;
  y: number;
  borrowAllowed: boolean;
  hardOverride: boolean;
  isDimmed: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const cardW = 130;
  const cardH = 124;

  return (
    <g
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ opacity: isDimmed ? 0.25 : 1, transition: "opacity 0.25s ease", cursor: "pointer" }}
    >
      <rect
        x={x - cardW / 2}
        y={y - cardH / 2}
        width={cardW}
        height={cardH}
        rx={10}
        fill="rgba(14, 14, 16, 0.9)"
        stroke="var(--border)"
        strokeWidth={1}
      />
      <text
        x={x}
        y={y - 42}
        textAnchor="middle"
        fontSize={8.5}
        fontFamily="var(--mono)"
        fill="var(--text-3)"
        letterSpacing="0.1em"
      >
        ON-CHAIN PERMISSIONS
      </text>

      {/* 4 Discrete permissions */}
      <g transform={`translate(${x - 52}, ${y - 25})`}>
        <text x={0} y={10} fontSize={10} fill="var(--text-2)">Borrow</text>
        <rect x={55} y={0} width={47} height={14} rx={3} fill={hardOverride ? "#cf8b8b22" : borrowAllowed ? "#7fc39a22" : "#cfad7422"} />
        <text x={78.5} y={10.5} textAnchor="middle" fontSize={8} fontFamily="var(--mono)" fill={hardOverride ? "#cf8b8b" : borrowAllowed ? "#7fc39a" : "#cfad74"}>
          {hardOverride ? "BLOCKED" : borrowAllowed ? "ALLOWED" : "RESTRICT"}
        </text>
      </g>

      <g transform={`translate(${x - 52}, ${y - 7})`}>
        <text x={0} y={10} fontSize={10} fill="var(--text-2)">Withdraw</text>
        <rect x={55} y={0} width={47} height={14} rx={3} fill={hardOverride ? "#cf8b8b22" : "#7fc39a22"} />
        <text x={78.5} y={10.5} textAnchor="middle" fontSize={8} fontFamily="var(--mono)" fill={hardOverride ? "#cf8b8b" : "#7fc39a"}>
          {hardOverride ? "BLOCKED" : "ALLOWED"}
        </text>
      </g>

      <g transform={`translate(${x - 52}, ${y + 11})`}>
        <text x={0} y={10} fontSize={10} fill="var(--text-2)">Repay</text>
        <rect x={55} y={0} width={47} height={14} rx={3} fill="#7fc39a22" />
        <text x={78.5} y={10.5} textAnchor="middle" fontSize={8} fontFamily="var(--mono)" fill="#7fc39a">
          ALLOWED
        </text>
      </g>

      <g transform={`translate(${x - 52}, ${y + 29})`}>
        <text x={0} y={10} fontSize={10} fill="var(--text-2)">Liquidate</text>
        <rect x={55} y={0} width={47} height={14} rx={3} fill={hardOverride ? "#cf8b8b22" : "rgba(255,255,255,0.05)"} />
        <text x={78.5} y={10.5} textAnchor="middle" fontSize={8} fontFamily="var(--mono)" fill={hardOverride ? "#cf8b8b" : "var(--text-3)"}>
          {hardOverride ? "ACTIVE" : "INACTIVE"}
        </text>
      </g>
    </g>
  );
}

function HardOverrideLine({ y, reason }: { y: number; reason?: string }) {
  return (
    <g>
      <line x1={30} y1={y} x2={W - 30} y2={y} stroke="#cf8b8b" strokeWidth={1.5} strokeDasharray="8 4">
        <animate attributeName="stroke-opacity" values="0.3;0.9;0.3" dur="1.5s" repeatCount="indefinite" />
      </line>
      <rect
        x={W / 2 - 140}
        y={y - 11}
        width={280}
        height={22}
        rx={4}
        fill="rgba(207,139,139,0.2)"
        stroke="#cf8b8b"
        strokeWidth={1}
      />
      <text
        x={W / 2}
        y={y + 4}
        textAnchor="middle"
        fontSize={9.5}
        fontWeight={700}
        fontFamily="var(--mono)"
        fill="#cf8b8b"
      >
        ⚠️ HARD RISK OVERRIDE ACTIVE: BORROW BLOCKED
      </text>
      {reason && (
        <text x={W / 2} y={y + 22} textAnchor="middle" fontSize={9} fill="#cf8b8b" opacity={0.9}>
          {reason}
        </text>
      )}
    </g>
  );
}

/* -------------------------------------------------------------------------- */
/*  Full-Size Non-Editable Portfolio Risk Graph Canvas                        */
/* -------------------------------------------------------------------------- */

export function PortfolioRiskGraph({
  assets: liveAssets,
  riskState: liveState,
  baseLtvBps,
  effectiveLtvBps: liveLtv,
  borrowPowerUsd: liveBorrowPower,
  totalCollateralUsd,
  borrowAllowed: liveAllowed,
  hardOverride: liveHardOverride,
  hardOverrideReason: liveHardReason,
  uneditable = true,
  loading = false,
  simMode: controlledSimMode,
  onSimModeChange,
  onDynamicStateChange,
  onSelectNodeDriver,
}: PortfolioRiskGraphProps) {
  const { openAction } = useAction();
  const [zoom, setZoom] = useState<number>(1.0);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<AssetNode | null>(null);

  // Score calculation
  const {
    score,
    whatChanged,
  } = useMemo(() => {
    const isLiveZero = totalCollateralUsd === 0;
    const maxWeight = liveAssets.length > 0 ? Math.max(...liveAssets.map((a) => a.weightPct)) : 0;
    let calculatedScore = 18;
    if (liveHardOverride || liveState === "EMERGENCY") {
      calculatedScore = 94;
    } else if (liveState === "DEFENSIVE") {
      calculatedScore = 65;
    } else if (liveState === "RESTRICTED") {
      calculatedScore = 32 + Math.round((maxWeight > 40 ? maxWeight - 40 : 0) * 0.4);
    }

    let changePayload = {
      deltaScore: "Nominal (Safe)",
      reason: "All oracle and market checks nominal across deposited collateral",
      impact: `Full borrow capacity available under Risk Ratchet ($${formatMoney(liveBorrowPower)})`,
      tone: "success" as Tone,
    };

    if (isLiveZero) {
      changePayload = {
        deltaScore: "Real-Time On-Chain Truth",
        reason: "Connected wallet has 0 collateral deposited",
        impact: "Borrow capacity is strictly $0.00 until equity collateral is deposited",
        tone: "neutral" as Tone,
      };
    } else if (liveHardOverride) {
      changePayload = {
        deltaScore: "CRITICAL FAILURE (Emergency)",
        reason: liveHardReason || "Hard Risk override active",
        impact: "HARD OVERRIDE: All new borrow instructions rejected on-chain",
        tone: "danger" as Tone,
      };
    } else if (liveState === "RESTRICTED") {
      changePayload = {
        deltaScore: `Restricted (+${calculatedScore - 18}% Risk)`,
        reason: maxWeight > 40
          ? `Single-asset concentration (${Math.round(maxWeight)}%) exceeds 40% threshold`
          : "Oracle confidence widened under Risk Ratchet",
        impact: `Soft Risk penalty adjusted Effective LTV to ${(liveLtv / 100).toFixed(1)}%`,
        tone: "warning" as Tone,
      };
    }

    return {
      score: calculatedScore,
      whatChanged: changePayload,
    };
  }, [
    liveAssets,
    liveState,
    liveLtv,
    liveBorrowPower,
    liveHardOverride,
    liveHardReason,
    totalCollateralUsd,
  ]);

  // Dynamic vertical spacing for N assets (ensuring zero overlap for N in [1..20])
  const N = liveAssets.length;
  const assetSpacing = N <= 1 ? 0 : Math.max(82, Math.min(110, Math.floor(520 / Math.max(2, N))));
  const totalSpread = (N - 1) * assetSpacing;
  const H = Math.max(460, totalSpread + 180);
  const centerY = Math.round(H / 2);
  const assetStartY = centerY - Math.round(totalSpread / 2);

  // Stable Node Positions with immutable IDs
  const assetPositions = useMemo(() => {
    return liveAssets.map((a, i) => {
      const stableId = `asset:${a.mint || a.symbol}`;
      return {
        ...a,
        id: stableId,
        x: COL_ASSET,
        y: N <= 1 ? centerY : assetStartY + i * assetSpacing,
        stressed: !a.oracleHealthy || a.confBps > a.maxConfBps || !a.marketOpen || a.weightPct > 60,
      };
    });
  }, [liveAssets, N, centerY, assetStartY, assetSpacing]);

  const FACTORS = [
    { name: "Oracle", isHard: true },
    { name: "Confidence", isHard: false },
    { name: "Market", isHard: true },
    { name: "Concentration", isHard: false },
  ] as const;

  const riskFactorPositions = useMemo(() => {
    const result: {
      id: string;
      parentId: string;
      x: number;
      y: number;
      label: string;
      level: "low" | "med" | "high";
      stressed: boolean;
      isHard: boolean;
      parentIdx: number;
    }[] = [];

    // Factor offsets avoiding collision between adjacent assets
    const factorOffsets = [-24, -8, 8, 24];

    assetPositions.forEach((asset, ai) => {
      FACTORS.forEach((f, fi) => {
        let level: "low" | "med" | "high" = "low";
        let stressed = false;
        if (f.name === "Oracle") {
          stressed = !asset.oracleHealthy;
          level = stressed ? "high" : "low";
        } else if (f.name === "Confidence") {
          const ratio = asset.maxConfBps > 0 ? asset.confBps / asset.maxConfBps : 0;
          level = ratio > 0.7 ? "high" : ratio > 0.4 ? "med" : "low";
          stressed = ratio > 0.7;
        } else if (f.name === "Market") {
          stressed = !asset.marketOpen;
          level = stressed ? "high" : "low";
        } else if (f.name === "Concentration") {
          level = asset.weightPct > 60 ? "high" : asset.weightPct > 40 ? "med" : "low";
          stressed = asset.weightPct > 60;
        }
        result.push({
          id: `risk:${asset.mint || asset.symbol}:${f.name}`,
          parentId: asset.id,
          x: COL_RISK,
          y: asset.y + factorOffsets[fi],
          label: f.name,
          level,
          stressed,
          isHard: f.isHard,
          parentIdx: ai,
        });
      });
    });
    return result;
  }, [assetPositions]);

  // Causal edge highlighting logic
  const isHighlighted = useCallback(
    (edgeSource: string, edgeTarget: string) => {
      if (!hoveredNodeId) return false;
      if (hoveredNodeId === edgeSource || hoveredNodeId === edgeTarget) return true;
      // Tracing downstream from asset
      if (hoveredNodeId.startsWith("asset:")) {
        if (edgeSource === hoveredNodeId) return true;
        if (edgeSource.startsWith(`risk:${hoveredNodeId.replace("asset:", "")}`) && (edgeTarget === "portfolio:risk" || edgeTarget === "credit")) return true;
      }
      return false;
    },
    [hoveredNodeId]
  );

  const isDimmed = useCallback(
    (nodeId: string) => {
      if (!hoveredNodeId) return false;
      if (hoveredNodeId === nodeId) return false;
      if (hoveredNodeId.startsWith("asset:")) {
        const symbolOrMint = hoveredNodeId.replace("asset:", "");
        if (nodeId.startsWith(`risk:${symbolOrMint}`)) return false;
        if (nodeId === "portfolio:risk" || nodeId === "credit" || nodeId === "permission:panel") return false;
        return true;
      }
      return false;
    },
    [hoveredNodeId]
  );

  return (
    <section className="risk-graph-shell" style={{ width: "100%", position: "relative" }}>
      {/* ── Graph Header & Canvas Controls ── */}
      <header
        className="risk-graph-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          padding: "16px 20px",
          background: "var(--surface-2, #0d0d11)",
          border: "1px solid var(--border)",
          borderTopLeftRadius: 12,
          borderTopRightRadius: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: liveAssets.length > 0 ? "var(--success, #7fc39a)" : "var(--text-3)",
              boxShadow: liveAssets.length > 0 ? "0 0 8px rgba(127, 195, 154, 0.6)" : "none",
            }}
          />
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: "0.06em",
                fontFamily: "var(--mono)",
                textTransform: "uppercase",
              }}
            >
              PORTFOLIO RISK GRAPH
            </h3>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
              {liveAssets.length} On-Chain Deposited Equit{liveAssets.length === 1 ? "y" : "ies"} → Causal Risk Engine → Financial Permissions
            </div>
          </div>
        </div>

        {/* Canvas inspection controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            style={{ fontSize: 11, height: 26, padding: "0 8px" }}
            onClick={() => setZoom((z) => Math.min(1.4, Number((z + 0.1).toFixed(2))))}
            title="Zoom In"
          >
            +
          </button>
          <span style={{ fontSize: 10.5, fontFamily: "var(--mono)", color: "var(--text-3)", minWidth: 40, textAlign: "center" }}>
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            style={{ fontSize: 11, height: 26, padding: "0 8px" }}
            onClick={() => setZoom((z) => Math.max(0.7, Number((z - 0.1).toFixed(2))))}
            title="Zoom Out"
          >
            -
          </button>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            style={{ fontSize: 11, height: 26, padding: "0 10px" }}
            onClick={() => setZoom(1.0)}
            title="Reset Zoom"
          >
            Reset
          </button>
          <Pill tone="neutral">UNEDITABLE CANVAS</Pill>
        </div>
      </header>

      {/* ── Subsystem Live Telemetry Ribbon ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          padding: "8px 20px",
          background: "rgba(0, 0, 0, 0.4)",
          borderLeft: "1px solid var(--border)",
          borderRight: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
          fontSize: 11,
          fontFamily: "var(--mono)",
        }}
      >
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <span>ASSETS: <strong style={{ color: "var(--text)" }}>{liveAssets.length}</strong></span>
          <span>WEIGHTED LTV: <strong style={{ color: "var(--text)" }}>{(liveLtv / 100).toFixed(1)}%</strong></span>
          <span>BORROW POWER: <strong style={{ color: "var(--text)" }}>${formatMoney(liveBorrowPower)}</strong></span>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ color: "var(--text-3)" }}>STATUS:</span>
          <Pill tone={whatChanged.tone} withDot>{whatChanged.deltaScore}</Pill>
        </div>
      </div>

      {/* ── Main Canvas Viewport ── */}
      <div
        className="risk-graph-canvas"
        style={{
          position: "relative",
          width: "100%",
          background: "#060608",
          borderLeft: "1px solid var(--border)",
          borderRight: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
          borderBottomLeftRadius: 12,
          borderBottomRightRadius: 12,
          overflow: "hidden",
          minHeight: 460,
        }}
      >
        {/* Loading overlay */}
        {loading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "var(--bg-elevated)",
              opacity: 0.9,
              backdropFilter: "blur(2px)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 20,
              gap: 12,
            }}
          >
            <div style={{ width: 32, height: 32, border: "2px solid #7fc39a", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <div style={{ fontSize: 12, fontFamily: "var(--mono)", color: "var(--text-2)", letterSpacing: "0.08em" }}>
              SYNCING ON-CHAIN PORTFOLIO...
            </div>
          </div>
        )}

        {/* Empty state when 0 positions deposited */}
        {!loading && liveAssets.length === 0 ? (
          <div
            style={{
              padding: "80px 24px",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
            }}
          >
            <div
              style={{
                width: 54,
                height: 54,
                borderRadius: "50%",
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-3)",
              }}
            >
              <Icon name="shield" size={24} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
                NO COLLATERAL POSITIONS DETECTED
              </div>
              <div style={{ fontSize: 12, color: "var(--text-3)", maxWidth: 440, margin: "6px auto 0", lineHeight: 1.5 }}>
                Connected wallet holds zero deposited tokenized equities. Collateral valuation and borrowing power are strictly $0.00.
              </div>
            </div>
            <Link to="/app/position" className="btn btn--accent btn--sm" style={{ marginTop: 8 }}>
              Deposit Collateral →
            </Link>
          </div>
        ) : (
          <div
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: "center top",
              transition: "transform 0.2s ease-out",
              width: "100%",
              height: "100%",
            }}
          >
            <svg
              viewBox={`0 0 ${W} ${H}`}
              style={{ width: "100%", height: "auto", display: "block" }}
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                <pattern id="graph-grid-pattern" width="24" height="24" patternUnits="userSpaceOnUse">
                  <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(255, 255, 255, 0.018)" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width={W} height={H} fill="url(#graph-grid-pattern)" />

              {/* Column header titles - Canonical 5-Stage Architecture */}
              <text x={COL_ASSET} y={26} textAnchor="middle" fontSize={10} fontFamily="var(--mono)" fill="var(--text-3)" letterSpacing="0.1em">
                01 ASSETS
              </text>
              <text x={COL_RISK} y={26} textAnchor="middle" fontSize={10} fontFamily="var(--mono)" fill="var(--text-3)" letterSpacing="0.1em">
                02 ORACLE &amp; GUARDS
              </text>
              <text x={COL_PORTFOLIO} y={26} textAnchor="middle" fontSize={10} fontFamily="var(--mono)" fill="var(--text-3)" letterSpacing="0.1em">
                03 RISK RATCHET
              </text>
              <text x={COL_CREDIT} y={26} textAnchor="middle" fontSize={10} fontFamily="var(--mono)" fill="var(--text-3)" letterSpacing="0.1em">
                04 CREDIT OUTPUT
              </text>
              <text x={COL_PERM} y={26} textAnchor="middle" fontSize={10} fontFamily="var(--mono)" fill="var(--text-3)" letterSpacing="0.1em">
                05 PERMISSIONS
              </text>

              {/* ── Causal Edges: Asset -> Risk Factors ── */}
              {riskFactorPositions.map((rf) => {
                const asset = assetPositions.find((a) => a.id === rf.parentId);
                if (!asset) return null;
                const hl = isHighlighted(asset.id, rf.id);
                return (
                  <CausalEdge
                    key={`e-${asset.id}-${rf.id}`}
                    x1={asset.x + 71}
                    y1={asset.y}
                    x2={rf.x - 48}
                    y2={rf.y}
                    color={rf.stressed ? "#cf8b8b" : "var(--border)"}
                    highlighted={hl}
                    dimmed={isDimmed(asset.id) && isDimmed(rf.id)}
                  />
                );
              })}

              {/* ── Causal Edges: Risk Factors -> Portfolio Risk ── */}
              {riskFactorPositions.map((rf) => {
                const hl = isHighlighted(rf.id, "portfolio:risk");
                return (
                  <CausalEdge
                    key={`e-${rf.id}-port`}
                    x1={rf.x + 48}
                    y1={rf.y}
                    x2={COL_PORTFOLIO - 54}
                    y2={centerY}
                    color={rf.stressed ? "#cf8b8b" : "var(--border)"}
                    highlighted={hl}
                    dimmed={isDimmed(rf.id)}
                  />
                );
              })}

              {/* ── Causal Edges: Portfolio Risk -> Credit ── */}
              <CausalEdge
                x1={COL_PORTFOLIO + 54}
                y1={centerY}
                x2={COL_CREDIT - 69}
                y2={centerY}
                color={STATE_COLOR[liveState] ?? "var(--border)"}
                thickness={2.2}
                highlighted={hoveredNodeId === "portfolio:risk" || hoveredNodeId === "credit"}
              />

              {/* ── Causal Edges: Credit -> Permissions ── */}
              <CausalEdge
                x1={COL_CREDIT + 69}
                y1={centerY}
                x2={COL_PERM - 65}
                y2={centerY}
                color={liveHardOverride ? "#cf8b8b" : liveAllowed ? "#7fc39a" : "#cfad74"}
                thickness={2.2}
                highlighted={hoveredNodeId === "credit" || hoveredNodeId === "permission:panel"}
              />

              {/* Hard override line across all stages if triggered */}
              {liveHardOverride && <HardOverrideLine y={H - 32} reason={liveHardReason} />}

              {/* ── Stage 1: Asset Nodes ── */}
              {assetPositions.map((a) => (
                <AssetCard
                  key={a.id}
                  x={a.x}
                  y={a.y}
                  symbol={a.symbol}
                  name={a.name || getAssetName(a.symbol)}
                  weightPct={Math.round(a.weightPct)}
                  priceUsd={a.priceUsd}
                  mark={a.mark}
                  stressed={a.stressed}
                  isHovered={hoveredNodeId === a.id}
                  isSelected={selectedAsset?.symbol === a.symbol}
                  isDimmed={isDimmed(a.id)}
                  onMouseEnter={() => {
                    setHoveredNodeId(a.id);
                    onSelectNodeDriver?.(a.id);
                  }}
                  onMouseLeave={() => setHoveredNodeId(null)}
                  onClick={() => setSelectedAsset(a)}
                />
              ))}

              {/* ── Stage 2: Risk Factor Nodes ── */}
              {riskFactorPositions.map((rf) => (
                <RiskFactorNode
                  key={rf.id}
                  x={rf.x}
                  y={rf.y}
                  label={rf.label}
                  level={rf.level}
                  stressed={rf.stressed}
                  isHard={rf.isHard}
                  isHovered={hoveredNodeId === rf.id}
                  isDimmed={isDimmed(rf.id)}
                  onMouseEnter={() => {
                    setHoveredNodeId(rf.id);
                    onSelectNodeDriver?.(rf.id);
                  }}
                  onMouseLeave={() => setHoveredNodeId(null)}
                />
              ))}

              {/* ── Stage 3: Portfolio Risk Gauge ── */}
              <PortfolioNode
                x={COL_PORTFOLIO}
                y={centerY}
                score={score}
                state={liveState}
                isHovered={hoveredNodeId === "portfolio:risk"}
                isDimmed={isDimmed("portfolio:risk")}
                onMouseEnter={() => {
                  setHoveredNodeId("portfolio:risk");
                  onSelectNodeDriver?.("portfolio:risk");
                }}
                onMouseLeave={() => setHoveredNodeId(null)}
              />

              {/* ── Stage 4: Credit Capacity Node ── */}
              <CreditNode
                x={COL_CREDIT}
                y={centerY}
                effectiveLtv={liveLtv}
                borrowPower={liveBorrowPower}
                allowed={liveAllowed}
                hardOverride={liveHardOverride}
                isHovered={hoveredNodeId === "credit"}
                isDimmed={isDimmed("credit")}
                onMouseEnter={() => {
                  setHoveredNodeId("credit");
                  onSelectNodeDriver?.("credit");
                }}
                onMouseLeave={() => setHoveredNodeId(null)}
              />

              {/* ── Stage 5: Permissions Node ── */}
              <PermissionNode
                x={COL_PERM}
                y={centerY}
                borrowAllowed={liveAllowed}
                hardOverride={liveHardOverride}
                isDimmed={isDimmed("permission:panel")}
                onMouseEnter={() => {
                  setHoveredNodeId("permission:panel");
                  onSelectNodeDriver?.("permission:panel");
                }}
                onMouseLeave={() => setHoveredNodeId(null)}
              />
            </svg>
          </div>
        )}
      </div>

      {/* ── Asset Node Detail Side/Bottom Drawer ── */}
      {selectedAsset && (
        <aside
          className="risk-graph-node-details"
          style={{
            marginTop: 16,
            padding: 20,
            background: "var(--surface-2, #0d0d11)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            boxShadow: "0 12px 36px rgba(0, 0, 0, 0.6)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  background: "rgba(255, 255, 255, 0.05)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {selectedAsset.mark ? (
                  <svg viewBox="0 0 24 24" width={20} height={20}>
                    {selectedAsset.mark.parts ? (
                      selectedAsset.mark.parts.map((p, idx) => (
                        <path key={idx} d={p.d} fill={p.fill} />
                      ))
                    ) : (
                      <path d={selectedAsset.mark.d} fill={selectedAsset.mark.onDark || "#ffffff"} />
                    )}
                  </svg>
                ) : (
                  <span style={{ fontWeight: 700 }}>{selectedAsset.symbol.slice(0, 2)}</span>
                )}
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
                  {selectedAsset.symbol} Node Inspection
                </div>
                <div style={{ fontSize: 11.5, color: "var(--text-3)", fontFamily: "var(--mono)" }}>
                  {selectedAsset.mint ? `Mint: ${selectedAsset.mint.slice(0, 8)}...${selectedAsset.mint.slice(-6)}` : selectedAsset.name}
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => setSelectedAsset(null)}
              style={{ padding: "4px 10px", fontSize: 12 }}
            >
              ✕ Close
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 12,
              marginBottom: 14,
            }}
          >
            <div style={{ padding: "10px 12px", background: "var(--surface)", borderRadius: 8, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 10.5, color: "var(--text-3)", fontFamily: "var(--mono)" }}>PORTFOLIO WEIGHT</div>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--mono)", color: selectedAsset.weightPct > 40 ? "var(--warning)" : "var(--text)" }}>
                {selectedAsset.weightPct}%
              </div>
              <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2 }}>
                {selectedAsset.weightPct > 40 ? "Triggers Concentration Haircut" : "Nominal Weight (<= 40%)"}
              </div>
            </div>

            <div style={{ padding: "10px 12px", background: "var(--surface)", borderRadius: 8, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 10.5, color: "var(--text-3)", fontFamily: "var(--mono)" }}>PYTH ORACLE CONFIDENCE</div>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--mono)", color: selectedAsset.confBps > 50 ? "var(--warning)" : "var(--success)" }}>
                ±{selectedAsset.confBps} bps
              </div>
              <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2 }}>
                Ceiling: {selectedAsset.maxConfBps} bps
              </div>
            </div>

            <div style={{ padding: "10px 12px", background: "var(--surface)", borderRadius: 8, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 10.5, color: "var(--text-3)", fontFamily: "var(--mono)" }}>POSITION VALUATION</div>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--mono)", color: "var(--text)" }}>
                ${formatMoney(selectedAsset.collateralValueUsd ?? 0)}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2 }}>
                Price: ${formatMoney(selectedAsset.priceUsd ?? 0)}
              </div>
            </div>

            <div style={{ padding: "10px 12px", background: "var(--surface)", borderRadius: 8, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 10.5, color: "var(--text-3)", fontFamily: "var(--mono)" }}>MARKET SESSION</div>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--mono)", color: selectedAsset.marketOpen ? "var(--success)" : "var(--danger)" }}>
                {selectedAsset.marketOpen ? "OPEN" : "CLOSED"}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2 }}>
                NYSE Deterministic Calendar
              </div>
            </div>
          </div>

          <div
            style={{
              padding: "12px 14px",
              background: "rgba(207, 173, 116, 0.05)",
              border: "1px solid rgba(207, 173, 116, 0.2)",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--text-2)",
              lineHeight: 1.5,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <div>
              <strong style={{ color: "var(--warning)" }}>Causal Impact: </strong>
              {selectedAsset.explanation || `Exposure is evaluated under on-chain Risk Ratchet with ${selectedAsset.weightPct}% weight.`}
            </div>
            <button
              type="button"
              onClick={() => {
                const target =
                  (selectedAsset.mint ? getDeployedMarketByMint(selectedAsset.mint) : null) ||
                  getDeployedMarket(selectedAsset.symbol);
                if (target) {
                  openAction({ type: "deposit", market: target });
                }
              }}
              className="btn btn--accent btn--sm"
              style={{ fontSize: 11, padding: "0 12px", height: 28 }}
            >
              Manage {selectedAsset.symbol} Collateral →
            </button>
          </div>
        </aside>
      )}
    </section>
  );
}
