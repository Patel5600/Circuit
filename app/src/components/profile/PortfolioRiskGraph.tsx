import React, { useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Pill, Tone, Icon } from "../ui";
import { LOGOS, type LogoMark } from "../../data/logos";
import { formatMoney } from "../../lib/format";
import { useAction } from "../../context/ActionContext";
import { getDeployedMarket, getDeployedMarketByMint } from "../../data/markets";
import { useTheme } from "../../context/ThemeContext";

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
  publishTime?: number;

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
  verdictStatus?: string;
  verdictReason?: string;
  uneditable?: boolean;
  loading?: boolean;
  simMode?: "LIVE" | "HEALTHY" | "STRESS" | "EMERGENCY";
  onSimModeChange?: (mode: "LIVE" | "HEALTHY" | "STRESS" | "EMERGENCY") => void;
  onDynamicStateChange?: (payload: DynamicStatePayload) => void;
  onSelectNodeDriver?: (nodeId: string) => void;
}

export type StressScenarioId =
  | "LIVE"
  | "MARKET_GAP"
  | "ORACLE_SPREAD"
  | "CONCENTRATION_SHOCK"
  | "EMERGENCY_BREAKER";

/* -------------------------------------------------------------------------- */
/*  Brand Marks & Names                                                       */
/* -------------------------------------------------------------------------- */

import { USDC_LOGO, getAssetMark, getAssetName } from "../../data/logos";
export { USDC_LOGO, getAssetMark, getAssetName };

/* -------------------------------------------------------------------------- */
/*  Layout Coordinates                                                        */
/* -------------------------------------------------------------------------- */

const W = 1040;
const COL_ASSET = 100;
const COL_RISK = 310;
const COL_PORTFOLIO = 525;
const COL_CREDIT = 735;
const COL_PERM = 930;

/* -------------------------------------------------------------------------- */
/*  Causal Edge Component with Animated Flow Pulses                           */
/* -------------------------------------------------------------------------- */

function CausalEdge({
  x1,
  y1,
  x2,
  y2,
  thickness = 1.5,
  color = "var(--border)",
  dashed = false,
  highlighted = false,
  dimmed = false,
  isFlowing = false,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness?: number;
  color?: string;
  dashed?: boolean;
  highlighted?: boolean;
  dimmed?: boolean;
  isFlowing?: boolean;
}) {
  const dx = x2 - x1;
  const dy = y2 - y1;

  // Natural organic tension curve
  const d =
    Math.abs(dy) < 2
      ? `M ${x1} ${y1} C ${x1 + dx * 0.35} ${y1 - 10}, ${x1 + dx * 0.65} ${y2 - 10}, ${x2} ${y2}`
      : `M ${x1} ${y1} C ${x1 + dx * 0.5} ${y1}, ${x1 + dx * 0.5} ${y2}, ${x2} ${y2}`;

  return (
    <g>
      {/* Underlying halo when highlighted */}
      {highlighted && (
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={thickness + 4}
          strokeLinecap="round"
          opacity={0.3}
        />
      )}
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={highlighted ? thickness + 1.2 : thickness}
        strokeDasharray={dashed ? "6 4" : isFlowing ? "8 6" : undefined}
        strokeLinecap="round"
        opacity={dimmed ? 0.15 : highlighted ? 1 : 0.75}
        className={isFlowing ? "causal-pulse-active" : undefined}
        style={{
          transition: "stroke 0.25s ease, opacity 0.25s ease, stroke-width 0.25s ease",
        }}
      />
    </g>
  );
}

/* -------------------------------------------------------------------------- */
/*  Asset Card (Stage 1)                                                      */
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
  isDark,
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
  isDark: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick: () => void;
}) {
  const cardW = 150;
  const cardH = 54;
  const leftX = x - cardW / 2;
  const topY = y - cardH / 2;
  const isConcentrated = weightPct > 40;

  const bg = isDark
    ? isSelected
      ? "rgba(30, 41, 59, 0.95)"
      : "rgba(15, 20, 32, 0.88)"
    : isSelected
    ? "#ffffff"
    : "#ffffff";

  const stroke = isSelected
    ? isDark
      ? "#38bdf8"
      : "#0284c7"
    : isHovered
    ? isDark
      ? "rgba(255, 255, 255, 0.5)"
      : "rgba(0, 0, 0, 0.4)"
    : stressed
    ? isDark
      ? "#f87171"
      : "#ef4444"
    : isDark
    ? "rgba(255, 255, 255, 0.12)"
    : "rgba(0, 0, 0, 0.12)";

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
      {/* Background card with high-definition border */}
      <rect
        x={leftX}
        y={topY}
        width={cardW}
        height={cardH}
        rx={9}
        fill={bg}
        stroke={stroke}
        strokeWidth={isSelected ? 2 : isHovered ? 1.5 : 1}
      />

      {/* Brand logo container */}
      <circle
        cx={leftX + 24}
        cy={topY + 27}
        r={15}
        fill={isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.05)"}
      />
      {mark ? (
        <g transform={`translate(${leftX + 13}, ${topY + 16}) scale(0.92)`}>
          {mark.parts ? (
            mark.parts.map((p, idx) => <path key={idx} d={p.d} fill={p.fill} />)
          ) : (
            <path
              d={mark.d}
              fill={isDark ? mark.onDark || "#ffffff" : mark.hex === "#000000" ? "#0f172a" : mark.hex || "#0f172a"}
            />
          )}
        </g>
      ) : (
        <text
          x={leftX + 24}
          y={topY + 31}
          textAnchor="middle"
          fontSize={11}
          fontWeight={700}
          fill={isDark ? "#f8fafc" : "#0f172a"}
          fontFamily="var(--mono)"
        >
          {symbol.slice(0, 2)}
        </text>
      )}

      {/* Symbol & Price */}
      <text
        x={leftX + 46}
        y={topY + 23}
        fontSize={13.5}
        fontWeight={750}
        fill={isDark ? "#f8fafc" : "#0f172a"}
        fontFamily="var(--sans)"
      >
        {symbol}
      </text>
      <text
        x={leftX + 46}
        y={topY + 39}
        fontSize={10}
        fontWeight={600}
        fill={isDark ? "#94a3b8" : "#475569"}
        fontFamily="var(--mono)"
      >
        {priceUsd ? `$${formatMoney(priceUsd)}` : name.slice(0, 9)}
      </text>

      {/* Weight Pill Badge */}
      <rect
        x={leftX + cardW - 48}
        y={topY + 16}
        width={40}
        height={22}
        rx={5}
        fill={
          isConcentrated
            ? isDark
              ? "rgba(251, 191, 36, 0.18)"
              : "rgba(217, 119, 6, 0.12)"
            : isDark
            ? "rgba(255, 255, 255, 0.08)"
            : "rgba(0, 0, 0, 0.06)"
        }
        stroke={
          isConcentrated
            ? isDark
              ? "#fbbf24"
              : "#d97706"
            : isDark
            ? "rgba(255, 255, 255, 0.14)"
            : "rgba(0, 0, 0, 0.12)"
        }
        strokeWidth={1}
      />
      <text
        x={leftX + cardW - 28}
        y={topY + 31}
        textAnchor="middle"
        fontSize={10.5}
        fontFamily="var(--mono)"
        fontWeight={700}
        fill={
          isConcentrated
            ? isDark
              ? "#fbbf24"
              : "#b45309"
            : isDark
            ? "#f8fafc"
            : "#0f172a"
        }
      >
        {weightPct}%
      </text>
    </g>
  );
}

/* -------------------------------------------------------------------------- */
/*  Risk Factor Node (Stage 2 - High Contrast & High Legibility)               */
/* -------------------------------------------------------------------------- */

function RiskFactorNode({
  x,
  y,
  label,
  valueText,
  level,
  stressed,
  isHovered,
  isDimmed,
  isDark,
  onMouseEnter,
  onMouseLeave,
}: {
  x: number;
  y: number;
  label: string;
  valueText: string;
  level: "low" | "med" | "high";
  stressed: boolean;
  isHovered: boolean;
  isDimmed: boolean;
  isDark: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const pillW = 126;
  const pillH = 24;
  const leftX = x - pillW / 2;
  const topY = y - pillH / 2;

  const dotColor = stressed
    ? isDark
      ? "#f87171"
      : "#dc2626"
    : level === "high"
    ? isDark
      ? "#fbbf24"
      : "#d97706"
    : isDark
    ? "#34d399"
    : "#059669";

  const bg = isDark
    ? stressed
      ? "rgba(239, 68, 68, 0.14)"
      : "rgba(19, 24, 38, 0.9)"
    : stressed
    ? "rgba(239, 68, 68, 0.08)"
    : "#ffffff";

  const stroke = isHovered
    ? isDark
      ? "#38bdf8"
      : "#0284c7"
    : stressed
    ? isDark
      ? "#f87171"
      : "#ef4444"
    : isDark
    ? "rgba(255, 255, 255, 0.12)"
    : "rgba(0, 0, 0, 0.12)";

  return (
    <g
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        opacity: isDimmed ? 0.25 : 1,
        transition: "opacity 0.25s ease",
        cursor: "pointer",
      }}
    >
      <rect
        x={leftX}
        y={topY}
        width={pillW}
        height={pillH}
        rx={6}
        fill={bg}
        stroke={stroke}
        strokeWidth={isHovered ? 1.5 : 1}
      />

      {/* Status Dot */}
      <circle cx={leftX + 10} cy={topY + 12} r={3.5} fill={dotColor} />
      {stressed && (
        <circle cx={leftX + 10} cy={topY + 12} r={6} fill="none" stroke={dotColor} strokeWidth={1} opacity={0.6} />
      )}

      {/* Label */}
      <text
        x={leftX + 19}
        y={topY + 15.5}
        fontSize={9.5}
        fontFamily="var(--sans)"
        fontWeight={650}
        fill={isDark ? "#e2e8f0" : "#1e293b"}
      >
        {label}
      </text>

      {/* Value Badge */}
      <text
        x={leftX + pillW - 7}
        y={topY + 15.5}
        textAnchor="end"
        fontSize={8.5}
        fontFamily="var(--mono)"
        fontWeight={700}
        fill={dotColor}
      >
        {valueText}
      </text>
    </g>
  );
}

/* -------------------------------------------------------------------------- */
/*  Portfolio Node (Stage 3 - Risk Ratchet Circular Gauge)                    */
/* -------------------------------------------------------------------------- */

function PortfolioNode({
  x,
  y,
  score,
  state,
  isHovered,
  isDimmed,
  isDark,
  onMouseEnter,
  onMouseLeave,
}: {
  x: number;
  y: number;
  score: number;
  state: string;
  isHovered: boolean;
  isDimmed: boolean;
  isDark: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const colorMap: Record<string, string> = {
    SAFE: isDark ? "#34d399" : "#059669",
    RESTRICTED: isDark ? "#fbbf24" : "#d97706",
    DEFENSIVE: isDark ? "#fb923c" : "#ea580c",
    EMERGENCY: isDark ? "#f87171" : "#dc2626",
  };
  const color = colorMap[state] ?? (isDark ? "#34d399" : "#059669");

  // SVG Gauge Calculations
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <g
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        opacity: isDimmed ? 0.25 : 1,
        transition: "opacity 0.25s ease",
        cursor: "pointer",
      }}
    >
      {/* Background Outer Ring Track */}
      <circle
        cx={x}
        cy={y}
        r={radius}
        fill={isDark ? "rgba(15, 20, 32, 0.9)" : "#ffffff"}
        stroke={isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)"}
        strokeWidth={isHovered ? 4 : 3}
      />

      {/* Dynamic Animated Value Arc */}
      <circle
        cx={x}
        cy={y}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={isHovered ? 6 : 5}
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
        transform={`rotate(-90 ${x} ${y})`}
        style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.3s ease" }}
      />

      {/* Inner Subtle Glow */}
      <circle cx={x} cy={y} r={radius - 12} fill={`${color}12`} />

      {/* Typography */}
      <text
        x={x}
        y={y - 18}
        textAnchor="middle"
        fontSize={8.5}
        fontFamily="var(--mono)"
        fontWeight={700}
        fill={isDark ? "#94a3b8" : "#64748b"}
        letterSpacing="0.1em"
      >
        PORTFOLIO RISK
      </text>
      <text
        x={x}
        y={y + 6}
        textAnchor="middle"
        fontSize={24}
        fontWeight={800}
        fontFamily="var(--sans)"
        fill={color}
      >
        {score}
      </text>
      <text
        x={x}
        y={y + 20}
        textAnchor="middle"
        fontSize={10}
        fontFamily="var(--mono)"
        fontWeight={600}
        fill={isDark ? "#94a3b8" : "#64748b"}
      >
        / 100
      </text>
      <text
        x={x}
        y={y + 38}
        textAnchor="middle"
        fontSize={11}
        fontWeight={750}
        fontFamily="var(--mono)"
        fill={color}
      >
        {state}
      </text>
    </g>
  );
}

/* -------------------------------------------------------------------------- */
/*  Credit Capacity Node (Stage 4)                                            */
/* -------------------------------------------------------------------------- */

function CreditNode({
  x,
  y,
  effectiveLtv,
  borrowPower,
  allowed,
  hardOverride,
  isHovered,
  isDimmed,
  isDark,
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
  isDark: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const color = hardOverride
    ? isDark
      ? "#f87171"
      : "#dc2626"
    : allowed
    ? isDark
      ? "#34d399"
      : "#059669"
    : isDark
    ? "#fbbf24"
    : "#d97706";

  const cardW = 146;
  const cardH = 130;
  const leftX = x - cardW / 2;
  const topY = y - cardH / 2;

  return (
    <g
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        opacity: isDimmed ? 0.25 : 1,
        transition: "opacity 0.25s ease",
        cursor: "pointer",
      }}
    >
      <rect
        x={leftX}
        y={topY}
        width={cardW}
        height={cardH}
        rx={11}
        fill={
          isDark
            ? hardOverride
              ? "rgba(239, 68, 68, 0.12)"
              : "rgba(15, 20, 32, 0.9)"
            : hardOverride
            ? "rgba(239, 68, 68, 0.08)"
            : "#ffffff"
        }
        stroke={isHovered ? (isDark ? "#38bdf8" : "#0284c7") : color}
        strokeWidth={isHovered ? 2 : 1.5}
      />

      <text
        x={x}
        y={topY + 20}
        textAnchor="middle"
        fontSize={8.5}
        fontFamily="var(--mono)"
        fontWeight={750}
        fill={isDark ? "#94a3b8" : "#64748b"}
        letterSpacing="0.1em"
      >
        CREDIT CAPACITY
      </text>

      <text
        x={x}
        y={topY + 39}
        textAnchor="middle"
        fontSize={10}
        fontWeight={600}
        fill={isDark ? "#94a3b8" : "#64748b"}
      >
        Effective LTV
      </text>
      <text
        x={x}
        y={topY + 58}
        textAnchor="middle"
        fontSize={20}
        fontWeight={800}
        fontFamily="var(--mono)"
        fill={color}
      >
        {(effectiveLtv / 100).toFixed(1)}%
      </text>

      <text
        x={x}
        y={topY + 76}
        textAnchor="middle"
        fontSize={10}
        fontWeight={600}
        fill={isDark ? "#94a3b8" : "#64748b"}
      >
        Available Credit Line
      </text>
      <text
        x={x}
        y={topY + 94}
        textAnchor="middle"
        fontSize={15}
        fontWeight={750}
        fontFamily="var(--mono)"
        fill={color}
      >
        ${formatMoney(borrowPower)}
      </text>

      <rect
        x={leftX + 14}
        y={topY + 103}
        width={cardW - 28}
        height={18}
        rx={5}
        fill={`${color}18`}
      />
      <text
        x={x}
        y={topY + 116}
        textAnchor="middle"
        fontSize={9}
        fontWeight={750}
        fontFamily="var(--mono)"
        fill={color}
      >
        {hardOverride ? "BORROW BLOCKED" : allowed ? "BORROW ALLOWED" : "BORROW RESTRICTED"}
      </text>
    </g>
  );
}

/* -------------------------------------------------------------------------- */
/*  Permissions Node (Stage 5 - 4 Discrete Financial Permissions)              */
/* -------------------------------------------------------------------------- */

function PermissionNode({
  x,
  y,
  borrowAllowed,
  hardOverride,
  verdictStatus,
  isDimmed,
  isDark,
  onMouseEnter,
  onMouseLeave,
}: {
  x: number;
  y: number;
  borrowAllowed: boolean;
  hardOverride: boolean;
  verdictStatus?: string;
  isDimmed: boolean;
  isDark: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const cardW = 140;
  const cardH = 130;
  const leftX = x - cardW / 2;
  const topY = y - cardH / 2;

  const green = isDark ? "#34d399" : "#059669";
  const yellow = isDark ? "#fbbf24" : "#d97706";
  const red = isDark ? "#f87171" : "#dc2626";

  return (
    <g
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        opacity: isDimmed ? 0.25 : 1,
        transition: "opacity 0.25s ease",
        cursor: "pointer",
      }}
    >
      <rect
        x={leftX}
        y={topY}
        width={cardW}
        height={cardH}
        rx={11}
        fill={isDark ? "rgba(15, 20, 32, 0.9)" : "#ffffff"}
        stroke={isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.12)"}
        strokeWidth={1}
      />
      <text
        x={x}
        y={topY + 20}
        textAnchor="middle"
        fontSize={8.5}
        fontFamily="var(--mono)"
        fontWeight={750}
        fill={isDark ? "#94a3b8" : "#64748b"}
        letterSpacing="0.1em"
      >
        ON-CHAIN PERMISSIONS
      </text>

      {/* Row 1: Borrow */}
      <g transform={`translate(${leftX + 16}, ${topY + 34})`}>
        <text x={0} y={11} fontSize={10.5} fontWeight={600} fill={isDark ? "#e2e8f0" : "#1e293b"}>
          Borrow
        </text>
        <rect
          x={56}
          y={0}
          width={52}
          height={16}
          rx={4}
          fill={
            verdictStatus
              ? verdictStatus === "ALLOW"
                ? `${green}20`
                : `${red}20`
              : hardOverride
              ? `${red}20`
              : borrowAllowed
              ? `${green}20`
              : `${yellow}20`
          }
        />
        <text
          x={82}
          y={11.5}
          textAnchor="middle"
          fontSize={8.5}
          fontFamily="var(--mono)"
          fontWeight={700}
          fill={
            verdictStatus
              ? verdictStatus === "ALLOW"
                ? green
                : red
              : hardOverride
              ? red
              : borrowAllowed
              ? green
              : yellow
          }
        >
          {verdictStatus ? (verdictStatus === "ALLOW" ? "ALLOWED" : "BLOCKED") : (hardOverride ? "BLOCKED" : borrowAllowed ? "ALLOWED" : "RESTRICT")}
        </text>
      </g>

      {/* Row 2: Withdraw */}
      <g transform={`translate(${leftX + 16}, ${topY + 56})`}>
        <text x={0} y={11} fontSize={10.5} fontWeight={600} fill={isDark ? "#e2e8f0" : "#1e293b"}>
          Withdraw
        </text>
        <rect
          x={56}
          y={0}
          width={52}
          height={16}
          rx={4}
          fill={hardOverride ? `${red}20` : `${green}20`}
        />
        <text
          x={82}
          y={11.5}
          textAnchor="middle"
          fontSize={8.5}
          fontFamily="var(--mono)"
          fontWeight={700}
          fill={hardOverride ? red : green}
        >
          {hardOverride ? "BLOCKED" : "ALLOWED"}
        </text>
      </g>

      {/* Row 3: Repay */}
      <g transform={`translate(${leftX + 16}, ${topY + 78})`}>
        <text x={0} y={11} fontSize={10.5} fontWeight={600} fill={isDark ? "#e2e8f0" : "#1e293b"}>
          Repay
        </text>
        <rect x={56} y={0} width={52} height={16} rx={4} fill={`${green}20`} />
        <text
          x={82}
          y={11.5}
          textAnchor="middle"
          fontSize={8.5}
          fontFamily="var(--mono)"
          fontWeight={700}
          fill={green}
        >
          ALLOWED
        </text>
      </g>

      {/* Row 4: Liquidate */}
      <g transform={`translate(${leftX + 16}, ${topY + 100})`}>
        <text x={0} y={11} fontSize={10.5} fontWeight={600} fill={isDark ? "#e2e8f0" : "#1e293b"}>
          Liquidate
        </text>
        <rect
          x={56}
          y={0}
          width={52}
          height={16}
          rx={4}
          fill={hardOverride ? `${red}20` : isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)"}
        />
        <text
          x={82}
          y={11.5}
          textAnchor="middle"
          fontSize={8.5}
          fontFamily="var(--mono)"
          fontWeight={700}
          fill={hardOverride ? red : isDark ? "#94a3b8" : "#64748b"}
        >
          {hardOverride ? "ACTIVE" : "INACTIVE"}
        </text>
      </g>
    </g>
  );
}

/* -------------------------------------------------------------------------- */
/*  Hard Override Line                                                        */
/* -------------------------------------------------------------------------- */

function HardOverrideLine({ y, reason, isDark }: { y: number; reason?: string; isDark: boolean }) {
  const red = isDark ? "#f87171" : "#dc2626";
  const bg = isDark ? "#1f1013" : "#fff1f2";
  const subText = isDark ? "#fca5a5" : "#991b1b";

  const title = "⚠️ HARD RISK OVERRIDE ACTIVE: ALL BORROWS BLOCKED";
  const hasReason = Boolean(reason && reason.trim().length > 0);
  const maxLen = Math.max(title.length, reason ? reason.length : 0);
  const boxW = Math.min(W - 80, Math.max(480, maxLen * 7.5 + 40));
  const boxH = hasReason ? 50 : 28;
  const boxX = (W - boxW) / 2;
  const boxY = y - boxH / 2;

  return (
    <g>
      {/* Left flanking dashed line */}
      <line
        x1={30}
        y1={y}
        x2={boxX - 10}
        y2={y}
        stroke={red}
        strokeWidth={1.8}
        strokeDasharray="8 4"
      >
        <animate attributeName="stroke-opacity" values="0.35;0.95;0.35" dur="1.5s" repeatCount="indefinite" />
      </line>

      {/* Right flanking dashed line */}
      <line
        x1={boxX + boxW + 10}
        y1={y}
        x2={W - 30}
        y2={y}
        stroke={red}
        strokeWidth={1.8}
        strokeDasharray="8 4"
      >
        <animate attributeName="stroke-opacity" values="0.35;0.95;0.35" dur="1.5s" repeatCount="indefinite" />
      </line>

      {/* Solid background container with border */}
      <rect
        x={boxX}
        y={boxY}
        width={boxW}
        height={boxH}
        rx={6}
        fill={bg}
        stroke={red}
        strokeWidth={1.5}
      />

      {/* Warning Title */}
      <text
        x={W / 2}
        y={hasReason ? boxY + 20 : boxY + 17.5}
        textAnchor="middle"
        fontSize={10.5}
        fontWeight={750}
        fontFamily="var(--mono)"
        fill={red}
        letterSpacing="0.02em"
      >
        {title}
      </text>

      {/* Reason safely enclosed inside container */}
      {hasReason && (
        <text
          x={W / 2}
          y={boxY + 38}
          textAnchor="middle"
          fontSize={9.5}
          fontWeight={600}
          fontFamily="var(--mono)"
          fill={subText}
        >
          {reason}
        </text>
      )}
    </g>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Component: PortfolioRiskGraph                                        */
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
  verdictStatus,
  verdictReason,
  uneditable = true,
  loading = false,
  simMode: controlledSimMode,
  onSimModeChange,
  onDynamicStateChange,
  onSelectNodeDriver,
}: PortfolioRiskGraphProps) {
  const { openAction } = useAction();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [zoom, setZoom] = useState<number>(1.0);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<AssetNode | null>(null);
  const [selectedInspectorNode, setSelectedInspectorNode] = useState<{
    type: "ASSET" | "GUARD" | "PORTFOLIO" | "CREDIT" | "PERMISSIONS";
    title: string;
    description: string;
    detail?: any;
  } | null>(null);

  // Interactive Scenario Stress Testing Engine
  const [activeScenario, setActiveScenario] = useState<StressScenarioId>("LIVE");

  // Simulated state computation when a stress scenario is selected
  const {
    activeAssets,
    activeRiskState,
    activeLtv,
    activeBorrowPower,
    activeAllowed,
    activeHardOverride,
    activeHardReason,
    score,
    whatChanged,
  } = useMemo(() => {
    let assets = [...liveAssets];
    let riskState = liveState;
    let ltv = liveLtv;
    let borrowPower = liveBorrowPower;
    let allowed = liveAllowed;
    let hardOverride = liveHardOverride;
    let hardReason = liveHardReason;

    // Apply deterministic stress transformations
    if (activeScenario === "MARKET_GAP") {
      // 25% gap-down on all collateral equities
      assets = assets.map((a) => ({
        ...a,
        priceUsd: a.priceUsd ? a.priceUsd * 0.75 : a.priceUsd,
        collateralValueUsd: a.collateralValueUsd ? a.collateralValueUsd * 0.75 : a.collateralValueUsd,
      }));
      riskState = "RESTRICTED";
      ltv = Math.max(3000, liveLtv - 1200);
      borrowPower = Math.max(0, liveBorrowPower * 0.55);
    } else if (activeScenario === "ORACLE_SPREAD") {
      // Pyth confidence spread widens to ±165 bps (violating 50 bps threshold)
      assets = assets.map((a) => ({
        ...a,
        confBps: 165,
        oracleHealthy: true,
      }));
      riskState = "RESTRICTED";
      ltv = Math.max(3000, liveLtv - 1600);
      borrowPower = Math.max(0, liveBorrowPower * 0.45);
    } else if (activeScenario === "CONCENTRATION_SHOCK") {
      // Single asset concentration reaches 85%
      if (assets.length > 0) {
        assets = assets.map((a, i) => ({
          ...a,
          weightPct: i === 0 ? 85 : Math.round(15 / Math.max(1, assets.length - 1)),
        }));
      }
      riskState = "DEFENSIVE";
      ltv = 3000;
      borrowPower = Math.max(0, liveBorrowPower * 0.25);
      allowed = false;
    } else if (activeScenario === "EMERGENCY_BREAKER") {
      // Emergency circuit breaker triggered
      riskState = "EMERGENCY";
      hardOverride = true;
      hardReason = "EMERGENCY: Oracle consensus timeout across 2+ feeds";
      allowed = false;
      borrowPower = 0;
      ltv = 0;
    }

    // Dynamic calculated score
    const isLiveZero = totalCollateralUsd === 0 && activeScenario === "LIVE";
    const maxWeight = assets.length > 0 ? Math.max(...assets.map((a) => a.weightPct)) : 0;
    let calculatedScore = 18;
    if (hardOverride || riskState === "EMERGENCY") {
      calculatedScore = 95;
    } else if (riskState === "DEFENSIVE") {
      calculatedScore = 72;
    } else if (riskState === "RESTRICTED") {
      calculatedScore = 38 + Math.round((maxWeight > 40 ? maxWeight - 40 : 0) * 0.45);
    }

    let changePayload = {
      deltaScore: "Nominal (Safe)",
      reason: "All oracle feeds and market sessions healthy; portfolio diversified.",
      impact: `Full borrow capacity available ($${formatMoney(borrowPower)})`,
      tone: "success" as Tone,
    };

    if (isLiveZero) {
      changePayload = {
        deltaScore: "Real-Time On-Chain Truth",
        reason: "Connected wallet has 0 collateral deposited on Devnet.",
        impact: "Borrow capacity is strictly $0.00 until collateral is deposited.",
        tone: "neutral" as Tone,
      };
    } else if (hardOverride) {
      changePayload = {
        deltaScore: "CRITICAL FAILURE (Emergency)",
        reason: hardReason || "Hard Risk override active.",
        impact: "HARD OVERRIDE: All new borrow instructions rejected on-chain.",
        tone: "danger" as Tone,
      };
    } else if (riskState === "DEFENSIVE") {
      changePayload = {
        deltaScore: `Defensive (+${calculatedScore - 18}% Risk)`,
        reason: "Extreme asset concentration or market session closure.",
        impact: "New borrowing paused to protect protocol solvency.",
        tone: "warning" as Tone,
      };
    } else if (riskState === "RESTRICTED") {
      changePayload = {
        deltaScore: `Restricted (+${calculatedScore - 18}% Risk)`,
        reason: maxWeight > 40
          ? `Single-asset concentration (${Math.round(maxWeight)}%) exceeds 40% cap.`
          : "Oracle confidence spread widened under Risk Ratchet.",
        impact: `Soft risk haircut adjusted Effective LTV to ${(ltv / 100).toFixed(1)}%`,
        tone: "warning" as Tone,
      };
    }

    return {
      activeAssets: assets,
      activeRiskState: riskState,
      activeLtv: ltv,
      activeBorrowPower: borrowPower,
      activeAllowed: allowed,
      activeHardOverride: hardOverride,
      activeHardReason: hardReason,
      score: calculatedScore,
      whatChanged: changePayload,
    };
  }, [
    liveAssets,
    liveState,
    liveLtv,
    liveBorrowPower,
    liveAllowed,
    liveHardOverride,
    liveHardReason,
    totalCollateralUsd,
    activeScenario,
  ]);

  // Dynamic vertical spacing for N assets
  const N = activeAssets.length;
  const assetSpacing = N <= 1 ? 0 : Math.max(84, Math.min(115, Math.floor(540 / Math.max(2, N))));
  const totalSpread = (N - 1) * assetSpacing;
  const H = Math.max(activeHardOverride ? 520 : 480, totalSpread + (activeHardOverride ? 240 : 200));
  const centerY = Math.round(H / 2);
  const assetStartY = centerY - Math.round(totalSpread / 2);

  // Stable Node Positions with immutable IDs
  const assetPositions = useMemo(() => {
    return activeAssets.map((a, i) => {
      const stableId = `asset:${a.mint || a.symbol}`;
      return {
        ...a,
        id: stableId,
        x: COL_ASSET,
        y: N <= 1 ? centerY : assetStartY + i * assetSpacing,
        stressed: !a.oracleHealthy || a.confBps > a.maxConfBps || !a.marketOpen || a.weightPct > 60,
      };
    });
  }, [activeAssets, N, centerY, assetStartY, assetSpacing]);

  // Stage 2: Risk Factor Positions (High Density & High Information)
  const riskFactorPositions = useMemo(() => {
    const result: {
      id: string;
      parentId: string;
      x: number;
      y: number;
      label: string;
      valueText: string;
      level: "low" | "med" | "high";
      stressed: boolean;
      parentIdx: number;
    }[] = [];

    const factorOffsets = [-27, -9, 9, 27];

    assetPositions.forEach((asset, ai) => {
      // 1. Pyth Oracle
      const oracleStressed = !asset.oracleHealthy;
      const oracleValueText = oracleStressed
        ? "ERR"
        : (asset.publishTime && asset.publishTime > 0)
        ? "LIVE"
        : "ON-CHAIN";
      result.push({
        id: `risk:${asset.mint || asset.symbol}:Oracle`,
        parentId: asset.id,
        x: COL_RISK,
        y: asset.y + factorOffsets[0],
        label: "Pyth EMA",
        valueText: oracleValueText,
        level: oracleStressed ? "high" : "low",
        stressed: oracleStressed,
        parentIdx: ai,
      });

      // 2. Confidence Band
      const confRatio = asset.maxConfBps > 0 ? asset.confBps / asset.maxConfBps : 0;
      const confStressed = asset.confBps > 50;
      result.push({
        id: `risk:${asset.mint || asset.symbol}:Confidence`,
        parentId: asset.id,
        x: COL_RISK,
        y: asset.y + factorOffsets[1],
        label: "Confidence",
        valueText: `±${asset.confBps} bps`,
        level: confRatio > 0.7 ? "high" : confRatio > 0.4 ? "med" : "low",
        stressed: confStressed,
        parentIdx: ai,
      });

      // 3. Market Session
      const marketStressed = !asset.marketOpen;
      result.push({
        id: `risk:${asset.mint || asset.symbol}:Market`,
        parentId: asset.id,
        x: COL_RISK,
        y: asset.y + factorOffsets[2],
        label: "NYSE Session",
        valueText: asset.marketOpen ? "OPEN" : "CLOSED",
        level: marketStressed ? "high" : "low",
        stressed: marketStressed,
        parentIdx: ai,
      });

      // 4. Concentration
      const concStressed = asset.weightPct > 40;
      result.push({
        id: `risk:${asset.mint || asset.symbol}:Concentration`,
        parentId: asset.id,
        x: COL_RISK,
        y: asset.y + factorOffsets[3],
        label: "Concentration",
        valueText: `${asset.weightPct}%`,
        level: asset.weightPct > 60 ? "high" : asset.weightPct > 40 ? "med" : "low",
        stressed: concStressed,
        parentIdx: ai,
      });
    });

    return result;
  }, [assetPositions]);

  // Causal edge highlighting logic
  const isHighlighted = useCallback(
    (edgeSource: string, edgeTarget: string) => {
      if (!hoveredNodeId) return false;
      if (hoveredNodeId === edgeSource || hoveredNodeId === edgeTarget) return true;
      if (hoveredNodeId.startsWith("asset:")) {
        if (edgeSource === hoveredNodeId) return true;
        const sym = hoveredNodeId.replace("asset:", "");
        if (edgeSource.startsWith(`risk:${sym}`) && (edgeTarget === "portfolio:risk" || edgeTarget === "credit")) {
          return true;
        }
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
        const sym = hoveredNodeId.replace("asset:", "");
        if (nodeId.startsWith(`risk:${sym}`)) return false;
        if (nodeId === "portfolio:risk" || nodeId === "credit" || nodeId === "permission:panel") return false;
        return true;
      }
      return false;
    },
    [hoveredNodeId]
  );

  return (
    <section
      className="risk-graph-shell"
      style={{
        width: "100%",
        position: "relative",
        scrollMarginTop: 90,
      }}
    >
      {/* ── Graph Header & Scenario Stress Testing Bar ── */}
      <header
        className="risk-graph-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 14,
          padding: "16px 22px",
          background: isDark ? "rgba(14, 18, 28, 0.95)" : "var(--surface-1, #ffffff)",
          border: isDark ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid var(--border)",
          borderTopLeftRadius: 12,
          borderTopRightRadius: 12,
          boxShadow: isDark ? "0 4px 20px rgba(0,0,0,0.35)" : "0 2px 8px rgba(0,0,0,0.04)",
        }}
      >
        {/* Left: Title & Subtitle */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: activeAssets.length > 0 ? "var(--success, #7fc39a)" : "var(--text-3)",
              boxShadow: activeAssets.length > 0 ? "0 0 10px rgba(127, 195, 154, 0.8)" : "none",
            }}
          />
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h3
                style={{
                  margin: 0,
                  fontSize: 14.5,
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                  fontFamily: "var(--mono)",
                  textTransform: "uppercase",
                  color: isDark ? "#f8fafc" : "#0f172a",
                }}
              >
                PORTFOLIO RISK GRAPH
              </h3>
              {activeScenario !== "LIVE" && (
                <span
                  style={{
                    fontSize: 9.5,
                    fontFamily: "var(--mono)",
                    fontWeight: 700,
                    padding: "1px 6px",
                    borderRadius: 4,
                    background: "rgba(251, 191, 36, 0.18)",
                    border: "1px solid rgba(251, 191, 36, 0.4)",
                    color: isDark ? "#fbbf24" : "#b45309",
                  }}
                >
                  SIMULATION ACTIVE
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: isDark ? "#94a3b8" : "#64748b", marginTop: 2 }}>
              {activeAssets.length} On-Chain Deposited Equit{activeAssets.length === 1 ? "y" : "ies"} → Causal Risk Engine → Financial Permissions
            </div>
          </div>
        </div>

        {/* Center: Interactive Stress Testing Scenario Switcher */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: isDark ? "#94a3b8" : "#64748b", marginRight: 4 }}>
            SCENARIO:
          </span>
          <button
            type="button"
            onClick={() => setActiveScenario("LIVE")}
            style={{
              padding: "3px 9px",
              borderRadius: 5,
              fontSize: 10.5,
              fontFamily: "var(--mono)",
              fontWeight: 700,
              cursor: "pointer",
              background: activeScenario === "LIVE" ? "rgba(127, 195, 154, 0.2)" : "transparent",
              border: `1px solid ${activeScenario === "LIVE" ? "#7fc39a" : isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
              color: activeScenario === "LIVE" ? "#7fc39a" : isDark ? "#cbd5e1" : "#475569",
            }}
          >
            Live Devnet
          </button>
          <button
            type="button"
            onClick={() => setActiveScenario("MARKET_GAP")}
            style={{
              padding: "3px 9px",
              borderRadius: 5,
              fontSize: 10.5,
              fontFamily: "var(--mono)",
              fontWeight: 700,
              cursor: "pointer",
              background: activeScenario === "MARKET_GAP" ? "rgba(251, 191, 36, 0.2)" : "transparent",
              border: `1px solid ${activeScenario === "MARKET_GAP" ? "#fbbf24" : isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
              color: activeScenario === "MARKET_GAP" ? (isDark ? "#fbbf24" : "#b45309") : isDark ? "#cbd5e1" : "#475569",
            }}
          >
            -25% Gap
          </button>
          <button
            type="button"
            onClick={() => setActiveScenario("ORACLE_SPREAD")}
            style={{
              padding: "3px 9px",
              borderRadius: 5,
              fontSize: 10.5,
              fontFamily: "var(--mono)",
              fontWeight: 700,
              cursor: "pointer",
              background: activeScenario === "ORACLE_SPREAD" ? "rgba(251, 191, 36, 0.2)" : "transparent",
              border: `1px solid ${activeScenario === "ORACLE_SPREAD" ? "#fbbf24" : isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
              color: activeScenario === "ORACLE_SPREAD" ? (isDark ? "#fbbf24" : "#b45309") : isDark ? "#cbd5e1" : "#475569",
            }}
          >
            ±165bps Conf
          </button>
          <button
            type="button"
            onClick={() => setActiveScenario("CONCENTRATION_SHOCK")}
            style={{
              padding: "3px 9px",
              borderRadius: 5,
              fontSize: 10.5,
              fontFamily: "var(--mono)",
              fontWeight: 700,
              cursor: "pointer",
              background: activeScenario === "CONCENTRATION_SHOCK" ? "rgba(249, 115, 22, 0.2)" : "transparent",
              border: `1px solid ${activeScenario === "CONCENTRATION_SHOCK" ? "#f97316" : isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
              color: activeScenario === "CONCENTRATION_SHOCK" ? "#f97316" : isDark ? "#cbd5e1" : "#475569",
            }}
          >
            85% Conc
          </button>
          <button
            type="button"
            onClick={() => setActiveScenario("EMERGENCY_BREAKER")}
            style={{
              padding: "3px 9px",
              borderRadius: 5,
              fontSize: 10.5,
              fontFamily: "var(--mono)",
              fontWeight: 700,
              cursor: "pointer",
              background: activeScenario === "EMERGENCY_BREAKER" ? "rgba(239, 68, 68, 0.2)" : "transparent",
              border: `1px solid ${activeScenario === "EMERGENCY_BREAKER" ? "#ef4444" : isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
              color: activeScenario === "EMERGENCY_BREAKER" ? "#ef4444" : isDark ? "#cbd5e1" : "#475569",
            }}
          >
            Breaker
          </button>
        </div>

        {/* Right: Zoom controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            style={{ fontSize: 11, height: 26, padding: "0 8px" }}
            onClick={() => setZoom((z) => Math.min(1.4, Number((z + 0.1).toFixed(2))))}
            title="Zoom In"
          >
            +
          </button>
          <span style={{ fontSize: 10.5, fontFamily: "var(--mono)", color: isDark ? "#cbd5e1" : "#475569", minWidth: 38, textAlign: "center" }}>
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
            style={{ fontSize: 11, height: 26, padding: "0 9px" }}
            onClick={() => setZoom(1.0)}
            title="Reset Zoom"
          >
            Reset
          </button>
        </div>
      </header>

      {/* ── Subsystem Live Telemetry Ribbon ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          padding: "9px 22px",
          background: isDark ? "rgba(10, 13, 20, 0.9)" : "var(--surface-0, #f2f4f8)",
          borderLeft: isDark ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid var(--border)",
          borderRight: isDark ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid var(--border)",
          borderBottom: isDark ? "1px solid rgba(255, 255, 255, 0.1)" : "1px solid var(--border)",
          fontSize: 11,
          fontFamily: "var(--mono)",
        }}
      >
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <span>
            ASSETS: <strong style={{ color: isDark ? "#f8fafc" : "#0f172a" }}>{activeAssets.length}</strong>
          </span>
          <span>
            WEIGHTED LTV: <strong style={{ color: isDark ? "#f8fafc" : "#0f172a" }}>{(activeLtv / 100).toFixed(1)}%</strong>
          </span>
          <span>
            BORROW POWER: <strong style={{ color: isDark ? "#f8fafc" : "#0f172a" }}>${formatMoney(activeBorrowPower)}</strong>
          </span>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {loading && (
            <span
              style={{
                fontSize: 10.5,
                fontFamily: "var(--mono)",
                color: "var(--warning, #e5a93c)",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "var(--warning, #e5a93c)",
                  animation: "pulse 1.2s infinite ease-in-out",
                }}
              />
              SYNCING ON-CHAIN TELEMETRY...
            </span>
          )}
          <span style={{ color: isDark ? "#94a3b8" : "#64748b" }}>STATUS:</span>
          <Pill tone={whatChanged.tone} withDot>
            {whatChanged.deltaScore}
          </Pill>
        </div>
      </div>

      {/* ── Main Canvas Viewport ── */}
      <div
        className="risk-graph-canvas"
        style={{
          position: "relative",
          width: "100%",
          background: isDark ? "#07090e" : "#f8fafc",
          borderLeft: isDark ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid var(--border)",
          borderRight: isDark ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid var(--border)",
          borderBottom: isDark ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid var(--border)",
          borderBottomLeftRadius: 12,
          borderBottomRightRadius: 12,
          overflowX: "auto",
          overflowY: "hidden",
          WebkitOverflowScrolling: "touch",
          minHeight: 480,
          boxShadow: isDark ? "0 12px 40px rgba(0, 0, 0, 0.5)" : "0 4px 16px rgba(0, 0, 0, 0.05)",
        }}
      >
        {/* Empty state when 0 positions deposited (renders immediately without blocking UI) */}
        {activeAssets.length === 0 ? (
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
                background: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)",
                border: isDark ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid rgba(0, 0, 0, 0.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: isDark ? "#94a3b8" : "#64748b",
              }}
            >
              <Icon name="shield" size={24} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: isDark ? "#f8fafc" : "#0f172a" }}>
                NO COLLATERAL POSITIONS DETECTED
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: isDark ? "#94a3b8" : "#64748b",
                  maxWidth: 440,
                  margin: "6px auto 0",
                  lineHeight: 1.5,
                }}
              >
                Connected wallet holds zero deposited tokenized equities. Collateral valuation and borrowing power are strictly $0.00.
              </div>
            </div>
            <Link to="/app/position" className="btn btn--accent btn--sm" style={{ marginTop: 8 }}>
              Deposit Collateral →
            </Link>
          </div>
        ) : (
          <div
            className="risk-graph-inner"
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
                  <path
                    d="M 24 0 L 0 0 0 24"
                    fill="none"
                    stroke={isDark ? "rgba(255, 255, 255, 0.035)" : "rgba(0, 0, 0, 0.04)"}
                    strokeWidth="1"
                  />
                </pattern>
                <style>{`
                  @keyframes causalPulse {
                    from { stroke-dashoffset: 24; }
                    to { stroke-dashoffset: 0; }
                  }
                  .causal-pulse-active {
                    animation: causalPulse 1.2s linear infinite;
                  }
                `}</style>
              </defs>
              <rect width={W} height={H} fill="url(#graph-grid-pattern)" />

              {/* Column header titles - 5-Stage Institutional Architecture */}
              <text
                x={COL_ASSET}
                y={28}
                textAnchor="middle"
                fontSize={10}
                fontFamily="var(--mono)"
                fontWeight={750}
                fill={isDark ? "#94a3b8" : "#64748b"}
                letterSpacing="0.1em"
              >
                01 ASSETS
              </text>
              <text
                x={COL_RISK}
                y={28}
                textAnchor="middle"
                fontSize={10}
                fontFamily="var(--mono)"
                fontWeight={750}
                fill={isDark ? "#94a3b8" : "#64748b"}
                letterSpacing="0.1em"
              >
                02 ORACLE &amp; GUARDS
              </text>
              <text
                x={COL_PORTFOLIO}
                y={28}
                textAnchor="middle"
                fontSize={10}
                fontFamily="var(--mono)"
                fontWeight={750}
                fill={isDark ? "#94a3b8" : "#64748b"}
                letterSpacing="0.1em"
              >
                03 RISK RATCHET
              </text>
              <text
                x={COL_CREDIT}
                y={28}
                textAnchor="middle"
                fontSize={10}
                fontFamily="var(--mono)"
                fontWeight={750}
                fill={isDark ? "#94a3b8" : "#64748b"}
                letterSpacing="0.1em"
              >
                04 CREDIT OUTPUT
              </text>
              <text
                x={COL_PERM}
                y={28}
                textAnchor="middle"
                fontSize={10}
                fontFamily="var(--mono)"
                fontWeight={750}
                fill={isDark ? "#94a3b8" : "#64748b"}
                letterSpacing="0.1em"
              >
                05 PERMISSIONS
              </text>

              {/* ── Causal Edges: Asset -> Risk Factors ── */}
              {riskFactorPositions.map((rf) => {
                const asset = assetPositions.find((a) => a.id === rf.parentId);
                if (!asset) return null;
                const hl = isHighlighted(asset.id, rf.id);
                const edgeColor = rf.stressed
                  ? isDark
                    ? "#f87171"
                    : "#ef4444"
                  : hl
                  ? isDark
                    ? "#38bdf8"
                    : "#0284c7"
                  : isDark
                  ? "rgba(255, 255, 255, 0.18)"
                  : "rgba(0, 0, 0, 0.16)";

                return (
                  <CausalEdge
                    key={`e-${asset.id}-${rf.id}`}
                    x1={asset.x + 75}
                    y1={asset.y}
                    x2={rf.x - 63}
                    y2={rf.y}
                    color={edgeColor}
                    highlighted={hl}
                    dimmed={isDimmed(asset.id) && isDimmed(rf.id)}
                    isFlowing={hl || rf.stressed}
                  />
                );
              })}

              {/* ── Causal Edges: Risk Factors -> Portfolio Risk ── */}
              {riskFactorPositions.map((rf) => {
                const hl = isHighlighted(rf.id, "portfolio:risk");
                const edgeColor = rf.stressed
                  ? isDark
                    ? "#f87171"
                    : "#ef4444"
                  : hl
                  ? isDark
                    ? "#38bdf8"
                    : "#0284c7"
                  : isDark
                  ? "rgba(255, 255, 255, 0.18)"
                  : "rgba(0, 0, 0, 0.16)";

                return (
                  <CausalEdge
                    key={`e-${rf.id}-port`}
                    x1={rf.x + 63}
                    y1={rf.y}
                    x2={COL_PORTFOLIO - 56}
                    y2={centerY}
                    color={edgeColor}
                    highlighted={hl}
                    dimmed={isDimmed(rf.id)}
                    isFlowing={hl || rf.stressed}
                  />
                );
              })}

              {/* ── Causal Edges: Portfolio Risk -> Credit ── */}
              {(() => {
                const portColor =
                  activeRiskState === "SAFE"
                    ? isDark
                      ? "#34d399"
                      : "#059669"
                    : activeRiskState === "RESTRICTED"
                    ? isDark
                      ? "#fbbf24"
                      : "#d97706"
                    : isDark
                    ? "#f87171"
                    : "#dc2626";

                return (
                  <CausalEdge
                    x1={COL_PORTFOLIO + 56}
                    y1={centerY}
                    x2={COL_CREDIT - 73}
                    y2={centerY}
                    color={portColor}
                    thickness={2.5}
                    highlighted={hoveredNodeId === "portfolio:risk" || hoveredNodeId === "credit"}
                    isFlowing={true}
                  />
                );
              })()}

              {/* ── Causal Edges: Credit -> Permissions ── */}
              {(() => {
                const credColor = activeHardOverride
                  ? isDark
                    ? "#f87171"
                    : "#dc2626"
                  : activeAllowed
                  ? isDark
                    ? "#34d399"
                    : "#059669"
                  : isDark
                  ? "#fbbf24"
                  : "#d97706";

                return (
                  <CausalEdge
                    x1={COL_CREDIT + 73}
                    y1={centerY}
                    x2={COL_PERM - 70}
                    y2={centerY}
                    color={credColor}
                    thickness={2.5}
                    highlighted={hoveredNodeId === "credit" || hoveredNodeId === "permission:panel"}
                    isFlowing={true}
                  />
                );
              })()}

              {/* Hard override line across all stages if triggered */}
              {activeHardOverride && (
                <HardOverrideLine y={H - (activeHardReason ? 42 : 30)} reason={activeHardReason} isDark={isDark} />
              )}

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
                  isDark={isDark}
                  onMouseEnter={() => {
                    setHoveredNodeId(a.id);
                    onSelectNodeDriver?.(a.id);
                  }}
                  onMouseLeave={() => setHoveredNodeId(null)}
                  onClick={() => {
                    setSelectedAsset(a);
                    setSelectedInspectorNode({
                      type: "ASSET",
                      title: `${a.symbol} Collateral Asset`,
                      description: `${a.name || getAssetName(a.symbol)} evaluated under on-chain Risk Ratchet. Weight: ${a.weightPct}%, Price: $${formatMoney(a.priceUsd ?? 0)}.`,
                      detail: a,
                    });
                  }}
                />
              ))}

              {/* ── Stage 2: Risk Factor Nodes ── */}
              {riskFactorPositions.map((rf) => (
                <RiskFactorNode
                  key={rf.id}
                  x={rf.x}
                  y={rf.y}
                  label={rf.label}
                  valueText={rf.valueText}
                  level={rf.level}
                  stressed={rf.stressed}
                  isHovered={hoveredNodeId === rf.id}
                  isDimmed={isDimmed(rf.id)}
                  isDark={isDark}
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
                state={activeRiskState}
                isHovered={hoveredNodeId === "portfolio:risk"}
                isDimmed={isDimmed("portfolio:risk")}
                isDark={isDark}
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
                effectiveLtv={activeLtv}
                borrowPower={activeBorrowPower}
                allowed={activeAllowed}
                hardOverride={activeHardOverride}
                isHovered={hoveredNodeId === "credit"}
                isDimmed={isDimmed("credit")}
                isDark={isDark}
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
                borrowAllowed={activeAllowed}
                hardOverride={activeHardOverride}
                verdictStatus={activeScenario === "LIVE" ? verdictStatus : undefined}
                isDimmed={isDimmed("permission:panel")}
                isDark={isDark}
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
            padding: 22,
            background: isDark ? "rgba(14, 18, 28, 0.95)" : "var(--surface-1, #ffffff)",
            border: isDark ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid var(--border)",
            borderRadius: 12,
            boxShadow: isDark ? "0 12px 36px rgba(0, 0, 0, 0.6)" : "0 4px 16px rgba(0, 0, 0, 0.08)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.05)",
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
                      <path
                        d={selectedAsset.mark.d}
                        fill={isDark ? selectedAsset.mark.onDark || "#ffffff" : selectedAsset.mark.hex === "#000000" ? "#0f172a" : selectedAsset.mark.hex || "#0f172a"}
                      />
                    )}
                  </svg>
                ) : (
                  <span style={{ fontWeight: 700, color: isDark ? "#f8fafc" : "#0f172a" }}>
                    {selectedAsset.symbol.slice(0, 2)}
                  </span>
                )}
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 750, color: isDark ? "#f8fafc" : "#0f172a" }}>
                  {selectedAsset.symbol} Node Telemetry &amp; Bounds
                </div>
                <div style={{ fontSize: 11.5, color: isDark ? "#94a3b8" : "#64748b", fontFamily: "var(--mono)" }}>
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
              gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
              gap: 12,
              marginBottom: 14,
            }}
          >
            <div
              style={{
                padding: "10px 14px",
                background: isDark ? "rgba(255, 255, 255, 0.03)" : "var(--surface-0, #f8fafc)",
                borderRadius: 8,
                border: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid var(--border)",
              }}
            >
              <div style={{ fontSize: 10, color: isDark ? "#94a3b8" : "#64748b", fontFamily: "var(--mono)" }}>PORTFOLIO WEIGHT</div>
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 750,
                  fontFamily: "var(--mono)",
                  color: selectedAsset.weightPct > 40 ? "var(--warning)" : isDark ? "#f8fafc" : "#0f172a",
                }}
              >
                {selectedAsset.weightPct}%
              </div>
              <div style={{ fontSize: 10, color: isDark ? "#94a3b8" : "#64748b", marginTop: 2 }}>
                {selectedAsset.weightPct > 40 ? "Concentration haircut active" : "Nominal weight (≤ 40%)"}
              </div>
            </div>

            <div
              style={{
                padding: "10px 14px",
                background: isDark ? "rgba(255, 255, 255, 0.03)" : "var(--surface-0, #f8fafc)",
                borderRadius: 8,
                border: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid var(--border)",
              }}
            >
              <div style={{ fontSize: 10, color: isDark ? "#94a3b8" : "#64748b", fontFamily: "var(--mono)" }}>PYTH CONFIDENCE</div>
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 750,
                  fontFamily: "var(--mono)",
                  color: selectedAsset.confBps > 50 ? "var(--warning)" : "var(--success)",
                }}
              >
                ±{selectedAsset.confBps} bps
              </div>
              <div style={{ fontSize: 10, color: isDark ? "#94a3b8" : "#64748b", marginTop: 2 }}>
                Ceiling: {selectedAsset.maxConfBps} bps
              </div>
            </div>

            <div
              style={{
                padding: "10px 14px",
                background: isDark ? "rgba(255, 255, 255, 0.03)" : "var(--surface-0, #f8fafc)",
                borderRadius: 8,
                border: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid var(--border)",
              }}
            >
              <div style={{ fontSize: 10, color: isDark ? "#94a3b8" : "#64748b", fontFamily: "var(--mono)" }}>POSITION VALUATION</div>
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 750,
                  fontFamily: "var(--mono)",
                  color: isDark ? "#f8fafc" : "#0f172a",
                }}
              >
                ${formatMoney(selectedAsset.collateralValueUsd ?? 0)}
              </div>
              <div style={{ fontSize: 10, color: isDark ? "#94a3b8" : "#64748b", marginTop: 2 }}>
                Price: ${formatMoney(selectedAsset.priceUsd ?? 0)}
              </div>
            </div>

            <div
              style={{
                padding: "10px 14px",
                background: isDark ? "rgba(255, 255, 255, 0.03)" : "var(--surface-0, #f8fafc)",
                borderRadius: 8,
                border: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid var(--border)",
              }}
            >
              <div style={{ fontSize: 10, color: isDark ? "#94a3b8" : "#64748b", fontFamily: "var(--mono)" }}>MARKET SESSION</div>
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 750,
                  fontFamily: "var(--mono)",
                  color: selectedAsset.marketOpen ? "var(--success)" : "var(--danger)",
                }}
              >
                {selectedAsset.marketOpen ? "OPEN" : "CLOSED"}
              </div>
              <div style={{ fontSize: 10, color: isDark ? "#94a3b8" : "#64748b", marginTop: 2 }}>
                NYSE Deterministic Calendar
              </div>
            </div>
          </div>

          <div
            style={{
              padding: "12px 16px",
              background: isDark ? "rgba(207, 173, 116, 0.08)" : "rgba(217, 119, 6, 0.06)",
              border: isDark ? "1px solid rgba(207, 173, 116, 0.25)" : "1px solid rgba(217, 119, 6, 0.2)",
              borderRadius: 8,
              fontSize: 12,
              color: isDark ? "#cbd5e1" : "#334155",
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
              {selectedAsset.explanation ||
                `Exposure is evaluated under on-chain Risk Ratchet with ${selectedAsset.weightPct}% weight.`}
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
