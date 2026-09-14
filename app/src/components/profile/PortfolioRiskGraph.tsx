import React, { useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Card, Pill, Tone, Icon } from "../ui";
import { LOGOS, type LogoMark } from "../../data/logos";
import { formatMoney } from "../../lib/format";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export interface AssetNode {
  symbol: string;
  name?: string;
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
  /** Hard-risk override active (stale oracle, custody impairment, etc.) */
  hardOverride: boolean;
  hardOverrideReason?: string;
  uneditable?: boolean;
  simMode?: "LIVE" | "HEALTHY" | "STRESS" | "EMERGENCY";
  onSimModeChange?: (mode: "LIVE" | "HEALTHY" | "STRESS" | "EMERGENCY") => void;
  onDynamicStateChange?: (payload: DynamicStatePayload) => void;
  onSelectNodeDriver?: (nodeId: string) => void;
}

/* -------------------------------------------------------------------------- */
/*  Brand Marks & Names                                                       */
/* -------------------------------------------------------------------------- */

const USDC_LOGO: LogoMark = {
  title: "USD Coin",
  optical: 1,
  hex: "#2775CA",
  onDark: "#2775CA",
  parts: [
    { d: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z", fill: "#2775CA" },
    { d: "M12.5 7h-1v1.07c-1.39.22-2.5 1.1-2.5 2.43 0 1.55 1.34 2.15 2.7 2.47 1.45.34 1.8.69 1.8 1.43 0 .73-.59 1.3-1.6 1.3-1.07 0-1.67-.47-1.85-1.28l-1.35.45c.3 1.18 1.25 1.95 2.3 2.16V17h1v-1.06c1.39-.23 2.5-1.12 2.5-2.44 0-1.74-1.52-2.28-2.85-2.58-1.26-.29-1.65-.63-1.65-1.32 0-.71.57-1.2 1.5-1.2 1.01 0 1.52.48 1.7 1.13l1.35-.49c-.27-1.05-1.15-1.78-2.15-2.02V7z", fill: "#FFFFFF" },
  ],
  d: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z",
};

export function getAssetMark(symbol: string): LogoMark | undefined {
  if (symbol === "USDC") return USDC_LOGO;
  return LOGOS[symbol];
}

export function getAssetName(symbol: string): string {
  switch (symbol) {
    case "NVDA": return "NVIDIA";
    case "AAPL": return "Apple";
    case "MSFT": return "Microsoft";
    case "AMZN": return "Amazon";
    case "TSLA": return "Tesla";
    case "GOOGL": return "Alphabet";
    case "COIN": return "Coinbase";
    case "AMD": return "AMD";
    case "NFLX": return "Netflix";
    case "SPY": return "S&P 500 ETF";
    case "USDC": return "USD Coin";
    default: return symbol;
  }
}

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
const COL_ASSET = 92;
const COL_RISK = 282;
const COL_PORTFOLIO = 480;
const COL_CREDIT = 678;
const COL_PERM = 878;

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
  const mx = (x1 + x2) / 2;
  const d = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
  
  return (
    <path
      d={d}
      fill="none"
      stroke={highlighted ? "var(--accent, #eceae6)" : color}
      strokeWidth={highlighted ? thickness + 1.5 : thickness}
      strokeDasharray={dashed ? "6 4" : undefined}
      opacity={dimmed ? 0.18 : highlighted ? 1 : 0.65}
      style={{
        transition: "stroke 0.25s ease, stroke-width 0.25s ease, opacity 0.25s ease",
      }}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  Node Components                                                           */
/* -------------------------------------------------------------------------- */

function AssetCardNode({
  x, y, symbol, name, weightPct, stressed, mark, isHovered, isDimmed, onClick, onMouseEnter, onMouseLeave,
}: {
  x: number; y: number; symbol: string; name: string; weightPct: number; stressed: boolean;
  mark?: LogoMark; isHovered: boolean; isDimmed: boolean;
  onClick: () => void; onMouseEnter: () => void; onMouseLeave: () => void;
}) {
  const cardW = 144;
  const cardH = 46;
  const rx = 8;
  const leftX = x - cardW / 2;
  const topY = y - cardH / 2;

  const isConcentrated = weightPct > 40;
  const borderColor = isHovered
    ? "var(--accent, #eceae6)"
    : stressed
    ? "#cf8b8b"
    : isConcentrated
    ? "#cfad74"
    : "var(--border)";

  const cx = leftX + 22;
  const cy = topY + 23;
  const scale = (20 / 24) * (mark?.optical || 1);

  return (
    <g
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ cursor: "pointer", opacity: isDimmed ? 0.25 : 1, transition: "opacity 0.25s ease" }}
    >
      <rect
        x={leftX}
        y={topY}
        width={cardW}
        height={cardH}
        rx={rx}
        fill={stressed ? "rgba(207, 139, 139, 0.08)" : "rgba(14, 14, 16, 0.9)"}
        stroke={borderColor}
        strokeWidth={isHovered ? 2 : stressed ? 1.5 : 1}
      />
      {/* Brand logo frame */}
      <circle cx={cx} cy={cy} r={13} fill="rgba(255, 255, 255, 0.04)" stroke="rgba(255, 255, 255, 0.1)" strokeWidth={0.8} />

      {mark ? (
        <g transform={`translate(${cx}, ${cy}) scale(${scale}) translate(-12, -12)`}>
          {mark.parts ? (
            mark.parts.map((p, idx) => <path key={idx} d={p.d} fill={p.fill} />)
          ) : (
            <path d={mark.d} fill={mark.onDark || "#ffffff"} />
          )}
        </g>
      ) : (
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize={10} fontWeight={700} fill="var(--text)" fontFamily="var(--mono)">
          {symbol.slice(0, 2)}
        </text>
      )}

      {/* Symbol & Name */}
      <text x={leftX + 42} y={topY + 20} fontSize={12.5} fontWeight={700} fill="var(--text)" fontFamily="var(--sans)">
        {symbol}
      </text>
      <text x={leftX + 42} y={topY + 34} fontSize={9} fill="var(--text-3)" fontFamily="var(--sans)">
        {name.length > 10 ? name.slice(0, 9) + "…" : name}
      </text>

      {/* Weight Pill */}
      <rect
        x={leftX + cardW - 44}
        y={topY + 12}
        width={36}
        height={22}
        rx={4}
        fill={isConcentrated ? "rgba(207, 173, 116, 0.15)" : "rgba(255, 255, 255, 0.05)"}
        stroke={isConcentrated ? "rgba(207, 173, 116, 0.4)" : "rgba(255, 255, 255, 0.1)"}
        strokeWidth={1}
      />
      <text
        x={leftX + cardW - 26}
        y={topY + 27}
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
  x, y, label, level, stressed, isHard, isHovered, isDimmed, onMouseEnter, onMouseLeave,
}: {
  x: number; y: number; label: string; level: "low" | "med" | "high"; stressed: boolean; isHard?: boolean;
  isHovered: boolean; isDimmed: boolean; onMouseEnter: () => void; onMouseLeave: () => void;
}) {
  const color = stressed ? "#cf8b8b" : level === "high" ? "#cfad74" : "var(--text-3)";
  const pillW = 92;
  const pillH = 19;

  return (
    <g
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ opacity: isDimmed ? 0.25 : 1, transition: "opacity 0.25s ease", cursor: "pointer" }}
    >
      <rect
        x={x - pillW / 2} y={y - pillH / 2}
        width={pillW} height={pillH}
        rx={4}
        fill={stressed ? "rgba(207, 139, 139, 0.12)" : "rgba(18, 20, 26, 0.7)"}
        stroke={isHovered ? "var(--accent)" : stressed ? "#cf8b8b" : "var(--border)"}
        strokeWidth={isHovered ? 1.5 : stressed ? 1.2 : 1}
      />
      <text x={x} y={y + 3.5} textAnchor="middle" fontSize={9} fontFamily="var(--mono)" fill={color} fontWeight={stressed ? 650 : 500}>
        {label} {isHard ? "•" : ""}
      </text>
    </g>
  );
}

function PortfolioNode({
  x, y, score, state, isHovered, isDimmed, onMouseEnter, onMouseLeave,
}: {
  x: number; y: number; score: number; state: string;
  isHovered: boolean; isDimmed: boolean; onMouseEnter: () => void; onMouseLeave: () => void;
}) {
  const color = STATE_COLOR[state] ?? "var(--text-3)";
  return (
    <g
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ opacity: isDimmed ? 0.25 : 1, transition: "opacity 0.25s ease", cursor: "pointer" }}
    >
      <circle cx={x} cy={y} r={52} fill="none" stroke={color} strokeWidth={isHovered ? 3 : 2} opacity={0.25} />
      <circle
        cx={x} cy={y} r={52}
        fill="none"
        stroke={color}
        strokeWidth={isHovered ? 5 : 4}
        strokeDasharray={`${score * 3.26} ${326 - score * 3.26}`}
        strokeDashoffset={81}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.5s ease, stroke 0.3s ease" }}
      />
      <circle cx={x} cy={y} r={42} fill={`${color}12`} />
      <text x={x} y={y - 14} textAnchor="middle" fontSize={8.5} fontFamily="var(--mono)" fill="var(--text-3)" letterSpacing="0.1em">
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
  x, y, effectiveLtv, borrowPower, allowed, hardOverride, isHovered, isDimmed, onMouseEnter, onMouseLeave,
}: {
  x: number; y: number; effectiveLtv: number; borrowPower: number;
  allowed: boolean; hardOverride: boolean;
  isHovered: boolean; isDimmed: boolean; onMouseEnter: () => void; onMouseLeave: () => void;
}) {
  const color = hardOverride ? "#cf8b8b" : allowed ? "#7fc39a" : "#cfad74";
  const cardW = 132;
  const cardH = 120;

  return (
    <g
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ opacity: isDimmed ? 0.25 : 1, transition: "opacity 0.25s ease", cursor: "pointer" }}
    >
      <rect
        x={x - cardW / 2} y={y - cardH / 2}
        width={cardW} height={cardH}
        rx={10}
        fill={hardOverride ? "rgba(207, 139, 139, 0.08)" : "rgba(127, 195, 154, 0.04)"}
        stroke={isHovered ? "var(--accent)" : color}
        strokeWidth={isHovered ? 2 : 1.5}
      />
      <text x={x} y={y - 40} textAnchor="middle" fontSize={8.5} fontFamily="var(--mono)" fill="var(--text-3)" letterSpacing="0.1em">
        CREDIT CAPACITY
      </text>
      <text x={x} y={y - 20} textAnchor="middle" fontSize={9.5} fill="var(--text-3)">
        Effective LTV
      </text>
      <text x={x} y={y - 4} textAnchor="middle" fontSize={18} fontWeight={700} fill={color}>
        {(effectiveLtv / 100).toFixed(0)}%
      </text>
      <text x={x} y={y + 14} textAnchor="middle" fontSize={9.5} fill="var(--text-3)">
        Available Credit
      </text>
      <text x={x} y={y + 29} textAnchor="middle" fontSize={14} fontWeight={650} fill={color} fontFamily="var(--mono)">
        ${formatMoney(borrowPower)}
      </text>
      <rect x={x - 52} y={y + 38} width={104} height={18} rx={4} fill={`${color}18`} />
      <text x={x} y={y + 50} textAnchor="middle" fontSize={9} fontWeight={650} fontFamily="var(--mono)" fill={color}>
        {hardOverride ? "BORROW BLOCKED" : allowed ? "BORROW ALLOWED" : "BORROW RESTRICTED"}
      </text>
    </g>
  );
}

function PermissionNode({
  x, y, borrowAllowed, hardOverride, isDimmed, onMouseEnter, onMouseLeave,
}: {
  x: number; y: number; borrowAllowed: boolean; hardOverride: boolean;
  isDimmed: boolean; onMouseEnter: () => void; onMouseLeave: () => void;
}) {
  const cardW = 126;
  const cardH = 120;

  return (
    <g
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ opacity: isDimmed ? 0.25 : 1, transition: "opacity 0.25s ease", cursor: "pointer" }}
    >
      <rect
        x={x - cardW / 2} y={y - cardH / 2}
        width={cardW} height={cardH}
        rx={10}
        fill="rgba(14, 14, 16, 0.9)"
        stroke="var(--border)"
        strokeWidth={1}
      />
      <text x={x} y={y - 40} textAnchor="middle" fontSize={8.5} fontFamily="var(--mono)" fill="var(--text-3)" letterSpacing="0.1em">
        ON-CHAIN PERMISSIONS
      </text>

      {/* 4 Discrete permissions */}
      <g transform={`translate(${x - 50}, ${y - 25})`}>
        <text x={0} y={10} fontSize={10} fill="var(--text-2)">Borrow</text>
        <rect x={55} y={0} width={45} height={14} rx={3} fill={hardOverride ? "#cf8b8b22" : borrowAllowed ? "#7fc39a22" : "#cfad7422"} />
        <text x={77.5} y={10.5} textAnchor="middle" fontSize={8} fontFamily="var(--mono)" fill={hardOverride ? "#cf8b8b" : borrowAllowed ? "#7fc39a" : "#cfad74"}>
          {hardOverride ? "BLOCKED" : borrowAllowed ? "ALLOWED" : "RESTRICT"}
        </text>
      </g>

      <g transform={`translate(${x - 50}, ${y - 7})`}>
        <text x={0} y={10} fontSize={10} fill="var(--text-2)">Withdraw</text>
        <rect x={55} y={0} width={45} height={14} rx={3} fill={hardOverride ? "#cf8b8b22" : "#7fc39a22"} />
        <text x={77.5} y={10.5} textAnchor="middle" fontSize={8} fontFamily="var(--mono)" fill={hardOverride ? "#cf8b8b" : "#7fc39a"}>
          {hardOverride ? "BLOCKED" : "ALLOWED"}
        </text>
      </g>

      <g transform={`translate(${x - 50}, ${y + 11})`}>
        <text x={0} y={10} fontSize={10} fill="var(--text-2)">Repay</text>
        <rect x={55} y={0} width={45} height={14} rx={3} fill="#7fc39a22" />
        <text x={77.5} y={10.5} textAnchor="middle" fontSize={8} fontFamily="var(--mono)" fill="#7fc39a">
          ALLOWED
        </text>
      </g>

      <g transform={`translate(${x - 50}, ${y + 29})`}>
        <text x={0} y={10} fontSize={10} fill="var(--text-2)">Liquidate</text>
        <rect x={55} y={0} width={45} height={14} rx={3} fill={hardOverride ? "#cf8b8b22" : "rgba(255,255,255,0.05)"} />
        <text x={77.5} y={10.5} textAnchor="middle" fontSize={8} fontFamily="var(--mono)" fill={hardOverride ? "#cf8b8b" : "var(--text-3)"}>
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
      <rect x={W / 2 - 130} y={y - 11} width={260} height={22} rx={4} fill="rgba(207,139,139,0.2)" stroke="#cf8b8b" strokeWidth={1} />
      <text x={W / 2} y={y + 4} textAnchor="middle" fontSize={9.5} fontWeight={700} fontFamily="var(--mono)" fill="#cf8b8b">
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
/*  Main Component                                                            */
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
  uneditable = false,
  simMode: controlledSimMode,
  onSimModeChange,
  onDynamicStateChange,
}: PortfolioRiskGraphProps) {
  const [internalMode, setInternalMode] = useState<"LIVE" | "HEALTHY" | "STRESS" | "EMERGENCY">("LIVE");
  const simMode = controlledSimMode ?? internalMode;

  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<AssetNode | null>(null);

  // Mode change handler for interactive / learn views
  const handleModeChange = (m: "LIVE" | "HEALTHY" | "STRESS" | "EMERGENCY") => {
    setInternalMode(m);
    onSimModeChange?.(m);
  };

  const primarySymbol = liveAssets[0]?.symbol ?? "NVDA";

  // Dynamic calculations
  const {
    assets,
    riskState,
    score,
    effectiveLtvBps,
    borrowPowerUsd,
    borrowAllowed,
    hardOverride,
    hardOverrideReason,
    whatChanged,
  } = useMemo(() => {
    if (uneditable) {
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
          reason: "Connected wallet has 0 collateral deposited on Devnet",
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
            ? `Single-asset concentration (${maxWeight}%) exceeds 40% threshold`
            : "Oracle confidence widened under Risk Ratchet",
          impact: `Soft Risk penalty adjusted Effective LTV to ${(liveLtv / 100).toFixed(1)}%`,
          tone: "warning" as Tone,
        };
      }

      return {
        assets: liveAssets,
        riskState: liveState,
        score: calculatedScore,
        effectiveLtvBps: liveLtv,
        borrowPowerUsd: liveBorrowPower,
        borrowAllowed: liveAllowed,
        hardOverride: liveHardOverride,
        hardOverrideReason: liveHardReason,
        whatChanged: changePayload,
      };
    }

    // Interactive / Learn mode simulation
    return {
      assets: liveAssets,
      riskState: liveState,
      score: liveState === "EMERGENCY" ? 94 : liveState === "RESTRICTED" ? 48 : 18,
      effectiveLtvBps: liveLtv,
      borrowPowerUsd: liveBorrowPower,
      borrowAllowed: liveAllowed,
      hardOverride: liveHardOverride,
      hardOverrideReason: liveHardReason,
      whatChanged: {
        deltaScore: liveState === "SAFE" ? "Nominal (Safe)" : "Risk Adjusted",
        reason: "Simulation mode active",
        impact: "Preview of dynamic risk adjustments",
        tone: (liveState === "SAFE" ? "success" : "warning") as Tone,
      },
    };
  }, [
    uneditable,
    liveAssets,
    liveState,
    liveLtv,
    liveBorrowPower,
    liveAllowed,
    liveHardOverride,
    liveHardReason,
    totalCollateralUsd,
  ]);

  // Dynamic vertical spacing for N assets
  const N = assets.length;
  const assetSpacing = N <= 1 ? 0 : Math.max(74, Math.min(106, Math.floor(400 / N)));
  const totalSpread = (N - 1) * assetSpacing;
  const H = Math.max(380, totalSpread + 160);
  const centerY = Math.round(H / 2);
  const assetStartY = centerY - Math.round(totalSpread / 2);

  const portfolioY = centerY;
  const creditY = centerY;
  const permY = centerY;

  const assetPositions = useMemo(() => {
    return assets.map((a, i) => ({
      ...a,
      id: `asset-${i}`,
      x: COL_ASSET,
      y: N <= 1 ? centerY : assetStartY + i * assetSpacing,
      stressed: !a.oracleHealthy || a.confBps > a.maxConfBps || !a.marketOpen || a.weightPct > 60,
    }));
  }, [assets, N, centerY, assetStartY, assetSpacing]);

  const FACTORS = [
    { name: "Oracle", isHard: true },
    { name: "Confidence", isHard: false },
    { name: "Market", isHard: true },
    { name: "Concentration", isHard: false },
  ] as const;

  const riskFactorPositions = useMemo(() => {
    const result: {
      id: string; parentId: string; x: number; y: number; label: string;
      level: "low" | "med" | "high"; stressed: boolean; isHard: boolean; parentIdx: number;
    }[] = [];
    const factorOffsets = assetSpacing > 85 || N <= 2 ? [-26, -8, 8, 26] : [-20, -6, 6, 20];

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
          id: `rf-${ai}-${fi}`,
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
  }, [assetPositions, assetSpacing, N]);

  // Hover causal path logic
  const isHighlighted = useCallback(
    (sourceId: string) => {
      if (!hoveredNodeId) return false;
      if (hoveredNodeId === sourceId) return true;
      if (hoveredNodeId.startsWith("asset-") && sourceId.includes(hoveredNodeId)) return true;
      if (sourceId.startsWith("rf-") && hoveredNodeId === sourceId) return true;
      return false;
    },
    [hoveredNodeId]
  );

  const isDimmed = useCallback(
    (sourceId: string) => {
      if (!hoveredNodeId) return false;
      return !isHighlighted(sourceId);
    },
    [hoveredNodeId, isHighlighted]
  );

  return (
    <Card
      title="Portfolio Risk Graph"
      action={
        uneditable ? (
          <div className="row g-6" style={{ alignItems: "center" }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "var(--success, #7fc39a)",
                boxShadow: "0 0 8px rgba(127, 195, 154, 0.6)",
                display: "inline-block",
              }}
            />
            <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--text-2)" }}>
              SOLANA DEVNET LIVE
            </span>
          </div>
        ) : (
          <div className="row g-6 wrap" style={{ alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "var(--text-3)", marginRight: 4 }}>Simulate:</span>
            {(["HEALTHY", "STRESS", "EMERGENCY"] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={`btn ${simMode === m ? "btn--accent" : "btn--ghost"} btn--sm`}
                style={{ padding: "2px 8px", fontSize: 11, height: 26 }}
                onClick={() => handleModeChange(m)}
              >
                {m}
              </button>
            ))}
          </div>
        )
      }
    >
      {/* ── Top Explanation Strip: What changed? + Hard vs Soft Risk Legend ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 12,
          marginBottom: 16,
          padding: "12px 16px",
          background: "rgba(10, 10, 12, 0.6)",
          borderRadius: 8,
          border: "1px solid var(--border)",
        }}
      >
        <div>
          <div className="row between g-6" style={{ marginBottom: 4 }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-3)" }}>
              What Changed?
            </span>
            <Pill tone={whatChanged.tone}>{whatChanged.deltaScore}</Pill>
          </div>
          <div style={{ fontSize: 12, color: "var(--text)", fontWeight: 550, marginBottom: 2 }}>
            {whatChanged.reason}
          </div>
          <div style={{ fontSize: 11.5, color: whatChanged.tone === "danger" ? "var(--danger)" : "var(--accent)" }}>
            Impact: {whatChanged.impact}
          </div>
        </div>

        <div style={{ borderLeft: "1px solid var(--border)", paddingLeft: 14 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-3)", marginBottom: 4 }}>
            Hard vs. Soft Risk
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-2)", lineHeight: 1.4 }}>
            <strong style={{ color: "var(--text)" }}>Soft Risk</strong> (concentration, leverage) scales Effective LTV smoothly.
            <br />
            <strong style={{ color: "var(--danger)" }}>Hard Risk (•)</strong> (stale oracle, custody halt) immediately overrides and <strong>BLOCKS</strong> borrow.
          </div>
        </div>
      </div>

      {/* ── 5-Stage Causal Flow SVG Graph OR On-Chain Zero Collateral State ── */}
      {uneditable && totalCollateralUsd === 0 ? (
        <div
          style={{
            padding: "36px 20px",
            background: "rgba(0, 0, 0, 0.3)",
            borderRadius: 12,
            border: "1px dashed var(--border)",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: "rgba(127, 195, 154, 0.08)",
              border: "1px solid rgba(127, 195, 154, 0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
              color: "var(--accent)",
            }}
          >
            <Icon name="shield" size={22} />
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
            No Active Collateral in Connected Wallet
          </h3>
          <p style={{ fontSize: 12.5, color: "var(--text-3)", maxWidth: 520, margin: "0 auto 20px", lineHeight: 1.5 }}>
            Your connected wallet has no deposited tokens on Solana Devnet. Circuit evaluates credit directly from verified on-chain positions—no fake balances or synthetic graphs are displayed in Live mode.
          </p>

          <div className="row g-12" style={{ justifyContent: "center", flexWrap: "wrap" }}>
            <Link to="/app/position" className="btn btn--accent btn--sm" style={{ height: 32, padding: "0 14px" }}>
              <Icon name="position" size={14} />
              Deposit Collateral
            </Link>
            <Link to="/app/faucet" className="btn btn--secondary btn--sm" style={{ height: 32, padding: "0 14px" }}>
              <Icon name="faucet" size={14} />
              Claim Test Tokens in Faucet
            </Link>
          </div>
        </div>
      ) : (
        <div style={{ position: "relative", overflowX: "auto" }}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            style={{ minWidth: 780, maxHeight: 520, display: "block" }}
            aria-label="5-Stage Causal Risk Flow Graph"
          >
            {/* Layer Column Headers */}
            <text x={COL_ASSET} y={24} textAnchor="middle" fontSize={9.5} fontFamily="var(--mono)" fill="var(--text-3)" letterSpacing="0.08em" opacity={0.65}>
              LAYER 1: ASSETS
            </text>
            <text x={COL_RISK} y={24} textAnchor="middle" fontSize={9.5} fontFamily="var(--mono)" fill="var(--text-3)" letterSpacing="0.08em" opacity={0.65}>
              LAYER 2: RISK FACTORS
            </text>
            <text x={COL_PORTFOLIO} y={24} textAnchor="middle" fontSize={9.5} fontFamily="var(--mono)" fill="var(--text-3)" letterSpacing="0.08em" opacity={0.65}>
              LAYER 3: PORTFOLIO RISK
            </text>
            <text x={COL_CREDIT} y={24} textAnchor="middle" fontSize={9.5} fontFamily="var(--mono)" fill="var(--text-3)" letterSpacing="0.08em" opacity={0.65}>
              LAYER 4: CREDIT
            </text>
            <text x={COL_PERM} y={24} textAnchor="middle" fontSize={9.5} fontFamily="var(--mono)" fill="var(--text-3)" letterSpacing="0.08em" opacity={0.65}>
              LAYER 5: PERMISSIONS
            </text>

            {/* Edges: Asset (x=164) → Risk Factor (x=236) */}
            {riskFactorPositions.map((rf, i) => {
              const parent = assetPositions[rf.parentIdx];
              if (!parent) return null;
              const highlighted = isHighlighted(parent.id) || isHighlighted(rf.id);
              const dimmed = Boolean(hoveredNodeId) && !highlighted;
              const thickness = rf.stressed ? 2.5 : 1.2;
              const color = rf.stressed ? "#cf8b8b" : "var(--border)";

              return (
                <CausalEdge
                  key={`e-ar-${i}`}
                  x1={164} y1={parent.y}
                  x2={236} y2={rf.y}
                  thickness={thickness}
                  color={color}
                  highlighted={highlighted}
                  dimmed={dimmed}
                />
              );
            })}

            {/* Edges: Risk Factor (x=328) → Portfolio Node (x=428) */}
            {riskFactorPositions.map((rf, i) => {
              const highlighted = isHighlighted(rf.parentId) || isHighlighted(rf.id);
              const dimmed = Boolean(hoveredNodeId) && !highlighted;
              const thickness = rf.stressed ? 2.5 : 1;
              const color = rf.stressed ? "#cf8b8b" : "var(--border)";

              return (
                <CausalEdge
                  key={`e-rp-${i}`}
                  x1={328} y1={rf.y}
                  x2={428} y2={portfolioY}
                  thickness={thickness}
                  color={color}
                  highlighted={highlighted}
                  dimmed={dimmed}
                />
              );
            })}

            {/* Edge: Portfolio (x=532) → Credit (x=612) */}
            <CausalEdge
              x1={532} y1={portfolioY}
              x2={612} y2={creditY}
              thickness={hardOverride ? 3 : 2}
              color={hardOverride ? "#cf8b8b" : STATE_COLOR[riskState]}
              highlighted={isHighlighted("portfolio") || isHighlighted("credit")}
            />

            {/* Edge: Credit (x=744) → Permissions (x=815) */}
            <CausalEdge
              x1={744} y1={creditY}
              x2={815} y2={permY}
              thickness={hardOverride ? 3 : 2}
              color={hardOverride ? "#cf8b8b" : borrowAllowed ? "#7fc39a" : "#cfad74"}
              highlighted={isHighlighted("credit") || isHighlighted("perm")}
            />

            {/* Hard-risk override banner line */}
            {hardOverride && <HardOverrideLine y={H - 36} reason={hardOverrideReason} />}

            {/* Layer 1: Asset nodes with brand logo, name, ticker, and weight pill */}
            {assetPositions.map((a) => (
              <AssetCardNode
                key={a.id}
                x={a.x} y={a.y}
                symbol={a.symbol}
                name={a.name || a.symbol}
                weightPct={a.weightPct}
                stressed={a.stressed}
                mark={a.mark}
                isHovered={hoveredNodeId === a.id}
                isDimmed={isDimmed(a.id)}
                onClick={() => setSelectedAsset(a)}
                onMouseEnter={() => setHoveredNodeId(a.id)}
                onMouseLeave={() => setHoveredNodeId(null)}
              />
            ))}

            {/* Layer 2: Risk Factor nodes */}
            {riskFactorPositions.map((rf) => (
              <RiskFactorNode
                key={rf.id}
                x={rf.x} y={rf.y}
                label={rf.label}
                level={rf.level}
                stressed={rf.stressed}
                isHard={rf.isHard}
                isHovered={hoveredNodeId === rf.id}
                isDimmed={isDimmed(rf.id)}
                onMouseEnter={() => setHoveredNodeId(rf.id)}
                onMouseLeave={() => setHoveredNodeId(null)}
              />
            ))}

            {/* Layer 3: Portfolio node with circular ring */}
            <PortfolioNode
              x={COL_PORTFOLIO} y={portfolioY}
              score={score} state={riskState}
              isHovered={hoveredNodeId === "portfolio"}
              isDimmed={isDimmed("portfolio")}
              onMouseEnter={() => setHoveredNodeId("portfolio")}
              onMouseLeave={() => setHoveredNodeId(null)}
            />

            {/* Layer 4: Credit node */}
            <CreditNode
              x={COL_CREDIT} y={creditY}
              effectiveLtv={effectiveLtvBps}
              borrowPower={borrowPowerUsd}
              allowed={borrowAllowed}
              hardOverride={hardOverride}
              isHovered={hoveredNodeId === "credit"}
              isDimmed={isDimmed("credit")}
              onMouseEnter={() => setHoveredNodeId("credit")}
              onMouseLeave={() => setHoveredNodeId(null)}
            />

            {/* Layer 5: Permissions node */}
            <PermissionNode
              x={COL_PERM} y={permY}
              borrowAllowed={borrowAllowed}
              hardOverride={hardOverride}
              isDimmed={isDimmed("perm")}
              onMouseEnter={() => setHoveredNodeId("perm")}
              onMouseLeave={() => setHoveredNodeId(null)}
            />
          </svg>
        </div>
      )}

      {/* ── Risk Flow Ribbon ── */}
      <div
        style={{
          marginTop: 12,
          padding: "10px 14px",
          background: "rgba(255, 255, 255, 0.02)",
          borderRadius: 8,
          border: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 6,
          fontSize: 11,
          fontFamily: "var(--mono)",
          color: "var(--text-3)",
        }}
      >
        <span style={{ color: "var(--text-2)" }}>CAUSAL CHAIN:</span>
        <span>MARKET DATA</span>
        <span style={{ color: "var(--accent)" }}>→</span>
        <span>ASSET RISK</span>
        <span style={{ color: "var(--accent)" }}>→</span>
        <span style={{ color: STATE_COLOR[riskState], fontWeight: 650 }}>PORTFOLIO ({riskState})</span>
        <span style={{ color: "var(--accent)" }}>→</span>
        <span>LTV ({(effectiveLtvBps / 100).toFixed(0)}%)</span>
        <span style={{ color: "var(--accent)" }}>→</span>
        <span>CREDIT (${formatMoney(borrowPowerUsd)})</span>
        <span style={{ color: "var(--accent)" }}>→</span>
        <span style={{ color: borrowAllowed ? "var(--success)" : "var(--danger)", fontWeight: 700 }}>
          {hardOverride ? "BORROW BLOCKED" : borrowAllowed ? "BORROW ALLOWED" : "BORROW RESTRICTED"}
        </span>
      </div>

      {/* ── Asset Detail Slide-out Inspector / Bottom Sheet Modal ── */}
      {selectedAsset && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 16,
          }}
          onClick={() => setSelectedAsset(null)}
        >
          <div
            style={{
              background: "var(--surface, #0c0c0e)",
              border: "1px solid var(--border-strong, #2e2e34)",
              borderRadius: 14,
              maxWidth: 480,
              width: "100%",
              padding: 24,
              boxShadow: "0 24px 60px rgba(0, 0, 0, 0.8)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="row between" style={{ alignItems: "center", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: "rgba(255, 255, 255, 0.05)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {selectedAsset.mark ? (
                    <svg viewBox="0 0 24 24" width={22} height={22}>
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
                    {selectedAsset.symbol}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                    {selectedAsset.name || getAssetName(selectedAsset.symbol)}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                style={{ padding: "4px 8px", fontSize: 14 }}
                onClick={() => setSelectedAsset(null)}
              >
                ✕
              </button>
            </div>

            {/* Metrics grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
                marginBottom: 16,
              }}
            >
              <div style={{ padding: "10px 12px", background: "var(--surface-2)", borderRadius: 8, border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 10, color: "var(--text-3)" }}>Portfolio Weight</div>
                <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--mono)", color: selectedAsset.weightPct > 40 ? "var(--warning)" : "var(--text)" }}>
                  {selectedAsset.weightPct}%
                </div>
                <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2 }}>
                  {selectedAsset.weightPct > 40 ? "Concentration Haircut Active" : "Nominal Weight"}
                </div>
              </div>

              <div style={{ padding: "10px 12px", background: "var(--surface-2)", borderRadius: 8, border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 10, color: "var(--text-3)" }}>Pyth Spread / Uncertainty</div>
                <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--mono)", color: selectedAsset.confBps > 50 ? "var(--warning)" : "var(--success)" }}>
                  ±{selectedAsset.confBps} bps
                </div>
                <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2 }}>
                  Max allowance: {selectedAsset.maxConfBps} bps
                </div>
              </div>
            </div>

            {/* Causal Explanation Card */}
            <div
              style={{
                padding: "12px 14px",
                background: "rgba(207, 173, 116, 0.06)",
                border: "1px solid rgba(207, 173, 116, 0.2)",
                borderRadius: 8,
                marginBottom: 18,
              }}
            >
              <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--warning)", textTransform: "uppercase", marginBottom: 4 }}>
                Causal Risk Contribution
              </div>
              <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.5 }}>
                {selectedAsset.explanation ||
                  `Portfolio exposure is allocated at ${selectedAsset.weightPct}%. ` +
                    (selectedAsset.weightPct > 40
                      ? `Single-asset concentration penalty reduces Effective LTV by -${Math.round((selectedAsset.weightPct - 40) * 36)} bps.`
                      : "Risk parameters nominal under on-chain Risk Ratchet checks.")}
              </div>
            </div>

            {/* Actions */}
            <div className="row g-10" style={{ justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => setSelectedAsset(null)}
              >
                Close
              </button>
              <Link
                to={`/app/position?market=${selectedAsset.symbol}`}
                className="btn btn--accent btn--sm"
                onClick={() => setSelectedAsset(null)}
              >
                Manage Collateral →
              </Link>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
