import React, { useMemo, useState, useEffect } from "react";
import { Card, Pill, Tone } from "../ui";
import { LOGOS, type LogoMark } from "../../data/logos";

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
  simMode?: "LIVE" | "HEALTHY" | "STRESS" | "EMERGENCY";
  onSimModeChange?: (mode: "LIVE" | "HEALTHY" | "STRESS" | "EMERGENCY") => void;
  onDynamicStateChange?: (payload: DynamicStatePayload) => void;
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
    case "USDC": return "USD Coin";
    default: return symbol;
  }
}

/* -------------------------------------------------------------------------- */
/*  Colors & helpers                                                          */
/* -------------------------------------------------------------------------- */

const STATE_COLOR: Record<string, string> = {
  SAFE: "#7fc39a",
  RESTRICTED: "#cfad74",
  DEFENSIVE: "#e08c4e",
  EMERGENCY: "#e06c6c",
};

const STATE_TONE: Record<string, Tone> = {
  SAFE: "success",
  RESTRICTED: "warning",
  DEFENSIVE: "warning",
  EMERGENCY: "danger",
};

/* -------------------------------------------------------------------------- */
/*  SVG Layout Constants                                                      */
/* -------------------------------------------------------------------------- */

const W = 960;
const H = 510;

const COL_ASSET = 106;
const COL_RISK = 320;
const COL_PORTFOLIO = 560;
const COL_CREDIT = 800;

/* -------------------------------------------------------------------------- */
/*  Edge component                                                            */
/* -------------------------------------------------------------------------- */

function Edge({
  x1, y1, x2, y2,
  thickness = 1.5,
  color = "var(--border)",
  dashed = false,
  animated = false,
}: {
  x1: number; y1: number; x2: number; y2: number;
  thickness?: number; color?: string; dashed?: boolean; animated?: boolean;
}) {
  const mx = (x1 + x2) / 2;
  const d = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={thickness}
      strokeDasharray={dashed ? "6 4" : undefined}
      opacity={animated ? undefined : 0.65}
      style={{ transition: "stroke 0.4s ease, stroke-width 0.4s ease" }}
    >
      {animated && (
        <animate
          attributeName="stroke-opacity"
          values="0.4;1;0.4"
          dur="1.8s"
          repeatCount="indefinite"
        />
      )}
    </path>
  );
}

/* -------------------------------------------------------------------------- */
/*  Node components                                                           */
/* -------------------------------------------------------------------------- */

function AssetCardNode({
  x, y, symbol, name, weightPct, stressed, mark,
}: {
  x: number;
  y: number;
  symbol: string;
  name: string;
  weightPct: number;
  stressed: boolean;
  mark?: LogoMark;
}) {
  const cardW = 156;
  const cardH = 48;
  const rx = 8;
  const leftX = x - cardW / 2;
  const topY = y - cardH / 2;

  const isConcentrated = weightPct > 40;
  const borderColor = stressed
    ? "#e06c6c"
    : isConcentrated
    ? "#cfad74"
    : "var(--border)";
  const bgColor = stressed
    ? "rgba(224, 108, 108, 0.08)"
    : "rgba(18, 22, 32, 0.85)";

  const cx = leftX + 22;
  const cy = topY + 24;
  const scale = (20 / 24) * (mark?.optical || 1);

  return (
    <g>
      {/* Background card */}
      <rect
        x={leftX}
        y={topY}
        width={cardW}
        height={cardH}
        rx={rx}
        fill={bgColor}
        stroke={borderColor}
        strokeWidth={stressed ? 1.5 : 1}
      />
      {stressed && (
        <rect
          x={leftX - 2}
          y={topY - 2}
          width={cardW + 4}
          height={cardH + 4}
          rx={rx + 2}
          fill="none"
          stroke="#e06c6c"
          strokeWidth={1}
          opacity={0.4}
        >
          <animate
            attributeName="opacity"
            values="0.2;0.7;0.2"
            dur="2s"
            repeatCount="indefinite"
          />
        </rect>
      )}

      {/* Brand logo circular badge frame */}
      <circle
        cx={cx}
        cy={cy}
        r={14}
        fill="rgba(255, 255, 255, 0.04)"
        stroke="rgba(255, 255, 255, 0.1)"
        strokeWidth={0.8}
      />

      {/* Real SVG brand logo mark with accurate optical centering */}
      {mark ? (
        <g transform={`translate(${cx}, ${cy}) scale(${scale}) translate(-12, -12)`}>
          {mark.parts ? (
            mark.parts.map((p, idx) => (
              <path key={idx} d={p.d} fill={p.fill} />
            ))
          ) : (
            <path d={mark.d} fill={mark.onDark || "#ffffff"} />
          )}
        </g>
      ) : (
        <text
          x={cx}
          y={cy + 4}
          textAnchor="middle"
          fontSize={10.5}
          fontWeight={700}
          fill="var(--text)"
          fontFamily="var(--mono)"
        >
          {symbol.slice(0, 2)}
        </text>
      )}

      {/* Symbol & Name */}
      <text
        x={leftX + 44}
        y={topY + 21}
        fontSize={13}
        fontWeight={700}
        fill="var(--text)"
        fontFamily="var(--font-sans)"
      >
        {symbol}
      </text>
      <text
        x={leftX + 44}
        y={topY + 36}
        fontSize={9.5}
        fill="var(--text-3)"
        fontFamily="var(--font-sans)"
      >
        {name.length > 9 ? name.slice(0, 8) + "…" : name}
      </text>

      {/* Weight Pill */}
      <rect
        x={leftX + cardW - 46}
        y={topY + 13}
        width={38}
        height={22}
        rx={5}
        fill={
          isConcentrated
            ? "rgba(207, 173, 116, 0.15)"
            : "rgba(255, 255, 255, 0.05)"
        }
        stroke={
          isConcentrated
            ? "rgba(207, 173, 116, 0.4)"
            : "rgba(255, 255, 255, 0.1)"
        }
        strokeWidth={1}
      />
      <text
        x={leftX + cardW - 27}
        y={topY + 28}
        textAnchor="middle"
        fontSize={10.5}
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
  x, y, label, level, stressed, isHard,
}: {
  x: number; y: number; label: string; level: "low" | "med" | "high"; stressed: boolean; isHard?: boolean;
}) {
  const color = stressed ? "#e06c6c" : level === "high" ? "#cfad74" : "var(--text-3)";
  const pillW = 96;
  const pillH = 20;

  return (
    <g>
      <rect
        x={x - pillW / 2} y={y - pillH / 2}
        width={pillW} height={pillH}
        rx={5}
        fill={stressed ? "rgba(224, 108, 108, 0.12)" : "rgba(22, 26, 36, 0.6)"}
        stroke={stressed ? "#e06c6c" : "var(--border)"}
        strokeWidth={stressed ? 1.5 : 1}
      />
      <text x={x} y={y + 3.5} textAnchor="middle" fontSize={9.5} fontFamily="var(--mono)" fill={color} fontWeight={stressed ? 650 : 500}>
        {label} {isHard ? "•" : ""}
      </text>
    </g>
  );
}

function PortfolioNode({
  x, y, score, state,
}: {
  x: number; y: number; score: number; state: string;
}) {
  const color = STATE_COLOR[state] ?? "var(--text-3)";
  return (
    <g>
      <circle cx={x} cy={y} r={54} fill="none" stroke={color} strokeWidth={2} opacity={0.25} />
      <circle
        cx={x} cy={y} r={54}
        fill="none"
        stroke={color}
        strokeWidth={4}
        strokeDasharray={`${score * 3.39} ${339 - score * 3.39}`}
        strokeDashoffset={85}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.6s ease, stroke 0.4s ease" }}
      />
      <circle cx={x} cy={y} r={44} fill={`${color}11`} />
      <text x={x} y={y - 15} textAnchor="middle" fontSize={9} fontFamily="var(--mono)" fill="var(--text-3)"
        letterSpacing="0.1em">
        PORTFOLIO RISK
      </text>
      <text x={x} y={y + 6} textAnchor="middle" fontSize={23} fontWeight={700} fill={color}>
        {score}
      </text>
      <text x={x} y={y + 20} textAnchor="middle" fontSize={10} fontFamily="var(--mono)" fill={color}>
        / 100
      </text>
      <text x={x} y={y + 38} textAnchor="middle" fontSize={11} fontWeight={650} fill={color}>
        {state}
      </text>
    </g>
  );
}

function CreditNode({
  x, y, effectiveLtv, borrowPower, allowed, hardOverride, hardReason,
}: {
  x: number; y: number; effectiveLtv: number; borrowPower: number;
  allowed: boolean; hardOverride: boolean; hardReason?: string;
}) {
  const color = hardOverride ? "#e06c6c" : allowed ? "#7fc39a" : "#cfad74";
  const cardW = 146;
  const cardH = 130;

  return (
    <g>
      <rect
        x={x - cardW / 2} y={y - cardH / 2}
        width={cardW} height={cardH}
        rx={12}
        fill={hardOverride ? "rgba(224, 108, 108, 0.08)" : "rgba(127, 195, 154, 0.04)"}
        stroke={color}
        strokeWidth={1.5}
      />
      <text x={x} y={y - 44} textAnchor="middle" fontSize={9} fontFamily="var(--mono)"
        fill="var(--text-3)" letterSpacing="0.1em">
        CREDIT CONSEQUENCE
      </text>
      <text x={x} y={y - 22} textAnchor="middle" fontSize={10} fill="var(--text-3)">
        Effective LTV
      </text>
      <text x={x} y={y - 4} textAnchor="middle" fontSize={19} fontWeight={700} fill={color}>
        {(effectiveLtv / 100).toFixed(0)}%
      </text>
      <text x={x} y={y + 15} textAnchor="middle" fontSize={10} fill="var(--text-3)">
        Borrow Capacity
      </text>
      <text x={x} y={y + 31} textAnchor="middle" fontSize={15} fontWeight={650}
        fill={color} fontFamily="var(--mono)">
        ${borrowPower.toLocaleString("en-US", { maximumFractionDigits: 0 })}
      </text>
      <rect
        x={x - 58} y={y + 41}
        width={116} height={20}
        rx={4}
        fill={`${color}18`}
      />
      <text x={x} y={y + 54} textAnchor="middle" fontSize={9.5} fontWeight={650}
        fontFamily="var(--mono)" fill={color}>
        {hardOverride ? "BORROW BLOCKED" : allowed ? "BORROW ALLOWED" : "BORROW RESTRICTED"}
      </text>
    </g>
  );
}

function HardOverrideLine({ y, reason }: { y: number; reason?: string }) {
  return (
    <g>
      <line x1={40} y1={y} x2={W - 40} y2={y}
        stroke="#e06c6c" strokeWidth={2} strokeDasharray="8 4">
        <animate attributeName="stroke-opacity" values="0.3;0.9;0.3" dur="1.5s" repeatCount="indefinite" />
      </line>
      <rect x={W / 2 - 120} y={y - 12} width={240} height={24} rx={5} fill="rgba(224,108,108,0.2)" stroke="#e06c6c" strokeWidth={1} />
      <text x={W / 2} y={y + 4} textAnchor="middle" fontSize={10} fontWeight={700}
        fontFamily="var(--mono)" fill="#e06c6c">
        ⚠ HARD RISK OVERRIDE ACTIVE
      </text>
      {reason && (
        <text x={W / 2} y={y + 24} textAnchor="middle" fontSize={9.5} fill="#e06c6c" opacity={0.9}>
          {reason} — Overrides soft score directly to BLOCKED
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
  simMode: controlledSimMode,
  onSimModeChange,
  onDynamicStateChange,
}: PortfolioRiskGraphProps) {
  // Mode selection: 'LIVE' | 'HEALTHY' | 'STRESS' | 'EMERGENCY'
  const [internalMode, setInternalMode] = useState<"LIVE" | "HEALTHY" | "STRESS" | "EMERGENCY">("LIVE");
  const simMode = controlledSimMode ?? internalMode;

  // Interactive fine-tuning slider states (initialized from live values)
  const [customPrimaryWeight, setCustomPrimaryWeight] = useState<number>(liveAssets[0]?.weightPct ?? 58);
  const [customConfBps, setCustomConfBps] = useState<number>(liveAssets[0]?.confBps ?? 18);
  const [custodyHalted, setCustodyHalted] = useState<boolean>(false);
  const [marketSessionClosed, setMarketSessionClosed] = useState<boolean>(false);

  const handleModeChange = (m: "LIVE" | "HEALTHY" | "STRESS" | "EMERGENCY") => {
    setInternalMode(m);
    onSimModeChange?.(m);

    if (m === "LIVE") {
      setCustomPrimaryWeight(liveAssets[0]?.weightPct ?? 58);
      setCustomConfBps(liveAssets[0]?.confBps ?? 18);
      setCustodyHalted(liveHardOverride);
      setMarketSessionClosed(false);
    } else if (m === "HEALTHY") {
      setCustomPrimaryWeight(35);
      setCustomConfBps(18);
      setCustodyHalted(false);
      setMarketSessionClosed(false);
    } else if (m === "STRESS") {
      setCustomPrimaryWeight(58);
      setCustomConfBps(285);
      setCustodyHalted(false);
      setMarketSessionClosed(false);
    } else if (m === "EMERGENCY") {
      setCustomPrimaryWeight(58);
      setCustomConfBps(520);
      setCustodyHalted(true);
      setMarketSessionClosed(false);
    }
  };

  // Primary symbol derived from liveAssets[0] or default NVDA
  const primarySymbol = liveAssets[0]?.symbol ?? "NVDA";
  // Secondary assets deduplicated so primary is never repeated!
  const secondarySymbols = useMemo(() => {
    const pool = ["AAPL", "MSFT", "NVDA", "AMZN", "USDC"].filter((s) => s !== primarySymbol);
    return [pool[0] || "AAPL", pool[1] || "MSFT", "USDC"];
  }, [primarySymbol]);

  // Compute dynamic assets & risk parameters
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
    // 1. Determine weights from interactive slider
    const w0 = customPrimaryWeight;
    const remainingW = Math.max(0, 100 - w0);
    const w1 = Math.round(remainingW * 0.52);
    const w2 = Math.round(remainingW * 0.36);
    const w3 = Math.max(0, 100 - w0 - w1 - w2);

    const activeConf = customConfBps;
    const isOracleBlown = activeConf > 450;
    const isHardOverride =
      simMode === "EMERGENCY" ||
      custodyHalted ||
      marketSessionClosed ||
      isOracleBlown ||
      (simMode === "LIVE" && liveHardOverride);

    const hardReason = custodyHalted
      ? "Upstream custody settlement link impaired"
      : isOracleBlown
      ? `Pyth confidence blown (${activeConf} bps > 450 bps limit)`
      : marketSessionClosed
      ? "NYSE trading session closed (MarketGuard active)"
      : liveHardReason || "Hard Risk override active";

    // Build 4 cleanly deduplicated assets
    const dynAssets: AssetNode[] = [
      {
        symbol: primarySymbol,
        name: getAssetName(primarySymbol),
        weightPct: w0,
        oracleHealthy: !isOracleBlown,
        confBps: activeConf,
        maxConfBps: 150,
        marketOpen: !marketSessionClosed,
        mark: getAssetMark(primarySymbol),
      },
      {
        symbol: secondarySymbols[0],
        name: getAssetName(secondarySymbols[0]),
        weightPct: w1,
        oracleHealthy: true,
        confBps: 18,
        maxConfBps: 150,
        marketOpen: true,
        mark: getAssetMark(secondarySymbols[0]),
      },
      {
        symbol: secondarySymbols[1],
        name: getAssetName(secondarySymbols[1]),
        weightPct: w2,
        oracleHealthy: true,
        confBps: 12,
        maxConfBps: 150,
        marketOpen: true,
        mark: getAssetMark(secondarySymbols[1]),
      },
      {
        symbol: "USDC",
        name: "USD Coin",
        weightPct: w3,
        oracleHealthy: true,
        confBps: 0,
        maxConfBps: 150,
        marketOpen: true,
        mark: getAssetMark("USDC"),
      },
    ];

    // Mathematical calculations
    const maxWeight = Math.max(...dynAssets.map((a) => a.weightPct));
    const penaltyBps = maxWeight > 40 ? Math.round((maxWeight - 40) * 100 * 0.36) : 0;
    const dynEffectiveLtvBps = isHardOverride
      ? 4000
      : Math.max(3000, baseLtvBps - penaltyBps);

    // Collateral base: use real or $10,000 reference for simulation
    const effectiveCollateral = totalCollateralUsd > 0 ? totalCollateralUsd : 10000;
    const debt = totalCollateralUsd > 0 ? totalCollateralUsd * 0.25 : 2500;
    const capacityUsd = effectiveCollateral * (dynEffectiveLtvBps / 10000);
    const dynBorrowPower = isHardOverride ? 0 : Math.max(0, capacityUsd - debt);

    // Derive Risk Ratchet State
    let derivedState: "SAFE" | "RESTRICTED" | "DEFENSIVE" | "EMERGENCY" = "SAFE";
    let calculatedScore = 18;

    if (isHardOverride) {
      derivedState = "EMERGENCY";
      calculatedScore = 94;
    } else if (activeConf > 150 || maxWeight > 60) {
      derivedState = "RESTRICTED";
      calculatedScore = 48 + Math.min(20, Math.round((maxWeight - 40) * 0.5));
    } else if (maxWeight > 40 || activeConf > 80) {
      derivedState = "RESTRICTED";
      calculatedScore = 32 + Math.round((maxWeight - 40) * 0.4);
    } else {
      derivedState = "SAFE";
      calculatedScore = 18;
    }

    const dynAllowed = !isHardOverride && dynBorrowPower > 0 && derivedState !== "EMERGENCY";

    // What changed callout payload
    let changePayload = {
      deltaScore: "Nominal (Safe)",
      reason: "All oracle and market checks nominal",
      impact: "Full capacity available under Risk Ratchet",
      tone: "success" as Tone,
    };

    if (isHardOverride) {
      changePayload = {
        deltaScore: "CRITICAL FAILURE (Emergency)",
        reason: hardReason,
        impact: "HARD OVERRIDE: All new borrow instructions rejected on-chain",
        tone: "danger" as Tone,
      };
    } else if (derivedState === "RESTRICTED") {
      changePayload = {
        deltaScore: `+${calculatedScore - 18}% Portfolio Risk`,
        reason:
          maxWeight > 40
            ? `${primarySymbol} concentration (${maxWeight}%) + Pyth confidence (${activeConf} bps)`
            : `Pyth confidence widened (${activeConf} bps)`,
        impact: `Soft Risk penalty reduced Effective LTV by -${(penaltyBps / 100).toFixed(1)}%`,
        tone: "warning" as Tone,
      };
    }

    return {
      assets: dynAssets,
      riskState: derivedState,
      score: calculatedScore,
      effectiveLtvBps: dynEffectiveLtvBps,
      borrowPowerUsd: dynBorrowPower,
      borrowAllowed: dynAllowed,
      hardOverride: isHardOverride,
      hardOverrideReason: hardReason,
      whatChanged: changePayload,
    };
  }, [
    simMode,
    customPrimaryWeight,
    customConfBps,
    custodyHalted,
    marketSessionClosed,
    primarySymbol,
    secondarySymbols,
    liveHardOverride,
    liveHardReason,
    baseLtvBps,
    totalCollateralUsd,
  ]);

  // Inform parent Profile of dynamic calculation updates
  useEffect(() => {
    onDynamicStateChange?.({
      riskState,
      effectiveLtvBps,
      borrowPowerUsd,
      borrowAllowed,
      concentrationPct: assets[0]?.weightPct ?? 58,
      confBps: assets[0]?.confBps ?? 18,
      hardOverride,
      hardOverrideReason,
    });
  }, [
    riskState,
    effectiveLtvBps,
    borrowPowerUsd,
    borrowAllowed,
    assets,
    hardOverride,
    hardOverrideReason,
    onDynamicStateChange,
  ]);

  const portfolioY = 221;
  const creditY = 221;

  // Vertical positions for 4 assets
  const assetSpacing = 98;
  const assetStartY = 74;

  const assetPositions = useMemo(() => {
    return assets.map((a, i) => ({
      ...a,
      x: COL_ASSET,
      y: assetStartY + i * assetSpacing,
      stressed: !a.oracleHealthy || a.confBps > a.maxConfBps || !a.marketOpen || a.weightPct > 60,
    }));
  }, [assets]);

  // Risk factor pills per asset
  const FACTORS = [
    { name: "Oracle", isHard: true },
    { name: "Confidence", isHard: false },
    { name: "Market", isHard: true },
    { name: "Concentration", isHard: false },
  ] as const;

  const riskFactorPositions = useMemo(() => {
    const result: {
      x: number; y: number; label: string; level: "low" | "med" | "high";
      stressed: boolean; isHard: boolean; parentIdx: number;
    }[] = [];
    const factorOffsets = [-30, -10, 10, 30];

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
          stressed = !asset.marketOpen || custodyHalted;
          level = stressed ? "high" : "low";
        } else if (f.name === "Concentration") {
          level = asset.weightPct > 60 ? "high" : asset.weightPct > 40 ? "med" : "low";
          stressed = asset.weightPct > 60;
        }
        result.push({
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
  }, [assetPositions, custodyHalted]);

  return (
    <Card
      title="Portfolio Risk Graph"
      action={
        <div className="row g-6 wrap" style={{ alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "var(--text-3)", marginRight: 4 }}>Simulate:</span>
          {(["LIVE", "HEALTHY", "STRESS", "EMERGENCY"] as const).map((m) => (
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
          background: "var(--surface-2, rgba(20, 24, 33, 0.4))",
          borderRadius: 8,
          border: "1px solid var(--border)",
        }}
      >
        {/* What changed callout */}
        <div>
          <div className="row between g-6" style={{ marginBottom: 4 }}>
            <span
              style={{
                fontFamily: "var(--mono)",
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--text-3)",
              }}
            >
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

        {/* Hard vs Soft Risk distinction */}
        <div style={{ borderLeft: "1px solid var(--border)", paddingLeft: 14 }}>
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--text-3)",
              marginBottom: 4,
            }}
          >
            Hard vs. Soft Risk
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-2)", lineHeight: 1.4 }}>
            <strong style={{ color: "var(--text)" }}>Soft Risk</strong> (concentration, leverage) scales Effective LTV smoothly.
            <br />
            <strong style={{ color: "var(--danger)" }}>Hard Risk (•)</strong> (stale oracle, custody halt) immediately overrides and <strong>BLOCKS</strong> borrow.
          </div>
        </div>
      </div>

      {/* ── Interactive SVG Flow Graph ── */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ maxHeight: 510, display: "block" }}
        aria-label="Portfolio risk flow graph"
      >
        {/* Layer Column Headers */}
        <text x={COL_ASSET} y={26} textAnchor="middle" fontSize={10} fontFamily="var(--mono)"
          fill="var(--text-3)" letterSpacing="0.08em" opacity={0.65}>
          LAYER 1: ASSETS
        </text>
        <text x={COL_RISK} y={26} textAnchor="middle" fontSize={10} fontFamily="var(--mono)"
          fill="var(--text-3)" letterSpacing="0.08em" opacity={0.65}>
          LAYER 2: RISK FACTORS
        </text>
        <text x={COL_PORTFOLIO} y={26} textAnchor="middle" fontSize={10} fontFamily="var(--mono)"
          fill="var(--text-3)" letterSpacing="0.08em" opacity={0.65}>
          LAYER 3: PORTFOLIO RISK
        </text>
        <text x={COL_CREDIT} y={26} textAnchor="middle" fontSize={10} fontFamily="var(--mono)"
          fill="var(--text-3)" letterSpacing="0.08em" opacity={0.65}>
          LAYER 4: CREDIT
        </text>

        {/* Edges: Asset Card Right Edge (x = 184) → Risk Factors Left Edge (x = 272) */}
        {riskFactorPositions.map((rf, i) => {
          const parent = assetPositions[rf.parentIdx];
          const thickness = rf.stressed ? 2.5 : rf.level === "med" ? 1.8 : 1;
          const color = rf.stressed ? "#e06c6c" : rf.level === "med" ? "#cfad74" : "var(--border)";
          return (
            <Edge
              key={`a-r-${i}`}
              x1={184} y1={parent.y}
              x2={272} y2={rf.y}
              thickness={thickness}
              color={color}
              animated={rf.stressed}
            />
          );
        })}

        {/* Edges: Risk Factors Right Edge (x = 368) → Portfolio Left Edge (x = 506) */}
        {riskFactorPositions.map((rf, i) => {
          const thickness = rf.stressed ? 2.5 : 1;
          const color = rf.stressed ? "#e06c6c" : "var(--border)";
          return (
            <Edge
              key={`r-p-${i}`}
              x1={368} y1={rf.y}
              x2={506} y2={portfolioY}
              thickness={thickness}
              color={color}
              animated={rf.stressed}
            />
          );
        })}

        {/* Edge: Portfolio Right Edge (x = 614) → Credit Left Edge (x = 727) */}
        <Edge
          x1={614} y1={portfolioY}
          x2={727} y2={creditY}
          thickness={hardOverride ? 3.5 : 2}
          color={hardOverride ? "#e06c6c" : STATE_COLOR[riskState]}
          animated={hardOverride || riskState !== "SAFE"}
        />

        {/* Hard-risk override banner line */}
        {hardOverride && <HardOverrideLine y={H - 42} reason={hardOverrideReason} />}

        {/* Layer 1: Asset nodes with brand logo, name, ticker, and weight pill */}
        {assetPositions.map((a, i) => (
          <AssetCardNode
            key={`asset-${i}`}
            x={a.x} y={a.y}
            symbol={a.symbol}
            name={a.name || a.symbol}
            weightPct={a.weightPct}
            stressed={a.stressed}
            mark={a.mark}
          />
        ))}

        {/* Layer 2: Risk Factor nodes */}
        {riskFactorPositions.map((rf, i) => (
          <RiskFactorNode
            key={`rf-${i}`}
            x={rf.x} y={rf.y}
            label={rf.label}
            level={rf.level}
            stressed={rf.stressed}
            isHard={rf.isHard}
          />
        ))}

        {/* Layer 3: Portfolio node with circular ring */}
        <PortfolioNode x={COL_PORTFOLIO} y={portfolioY} score={score} state={riskState} />

        {/* Layer 4: Credit node */}
        <CreditNode
          x={COL_CREDIT} y={creditY}
          effectiveLtv={effectiveLtvBps}
          borrowPower={borrowPowerUsd}
          allowed={borrowAllowed}
          hardOverride={hardOverride}
          hardReason={hardOverrideReason}
        />
      </svg>

      {/* ── Dynamic Risk Playground / Sliders Section ── */}
      <div
        style={{
          marginTop: 14,
          padding: "12px 16px",
          background: "rgba(255, 255, 255, 0.02)",
          borderRadius: 8,
          border: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
            borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
            paddingBottom: 8,
          }}
        >
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--text-3)",
            }}
          >
            Interactive Sandbox Controls (Real-Time SVN Engine)
          </span>
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>
            Modulate concentration, oracle spread, and custody invariants
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
          {/* Concentration slider */}
          <div>
            <div className="row between" style={{ marginBottom: 4 }}>
              <span style={{ fontSize: 11.5, color: "var(--text-2)" }}>
                {primarySymbol} Concentration (C_max)
              </span>
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 12,
                  fontWeight: 700,
                  color: customPrimaryWeight > 40 ? "var(--warning)" : "var(--success)",
                }}
              >
                {customPrimaryWeight}%
              </span>
            </div>
            <input
              type="range"
              min={20}
              max={85}
              value={customPrimaryWeight}
              onChange={(e) => {
                setCustomPrimaryWeight(Number(e.target.value));
                if (simMode === "HEALTHY" && Number(e.target.value) > 40) {
                  handleModeChange("STRESS");
                }
              }}
              style={{ width: "100%", accentColor: "var(--accent)" }}
            />
            <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2 }}>
              {customPrimaryWeight > 40
                ? `Penalty: -${Math.round((customPrimaryWeight - 40) * 36)} bps LTV (Threshold: 40%)`
                : "Nominal: 0 bps penalty on Effective LTV"}
            </div>
          </div>

          {/* Oracle confidence slider */}
          <div>
            <div className="row between" style={{ marginBottom: 4 }}>
              <span style={{ fontSize: 11.5, color: "var(--text-2)" }}>
                Pyth Oracle Spread (Confidence Width)
              </span>
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 12,
                  fontWeight: 700,
                  color:
                    customConfBps > 350
                      ? "var(--danger)"
                      : customConfBps > 150
                      ? "var(--warning)"
                      : "var(--success)",
                }}
              >
                {customConfBps} bps
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={550}
              value={customConfBps}
              onChange={(e) => {
                setCustomConfBps(Number(e.target.value));
                if (Number(e.target.value) > 450) {
                  handleModeChange("EMERGENCY");
                } else if (Number(e.target.value) > 150) {
                  handleModeChange("STRESS");
                }
              }}
              style={{ width: "100%", accentColor: "var(--accent)" }}
            />
            <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2 }}>
              {customConfBps > 450
                ? "Blown spread (> 450 bps) triggers EMERGENCY Hard Risk"
                : customConfBps > 150
                ? "Widened spread triggers RESTRICTED risk state"
                : "Tight spread (<= 150 bps) nominal valuation"}
            </div>
          </div>

          {/* Upstream Custody status */}
          <div>
            <div className="row between" style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 11.5, color: "var(--text-2)" }}>Upstream Custody Invariant</span>
              <Pill tone={custodyHalted ? "danger" : "success"}>
                {custodyHalted ? "Halted (Hard Risk)" : "1:1 Isolated"}
              </Pill>
            </div>
            <div className="row g-8">
              <button
                type="button"
                className={`btn ${!custodyHalted ? "btn--secondary" : "btn--ghost"} btn--sm`}
                style={{ flex: 1, fontSize: 11, height: 26 }}
                onClick={() => {
                  setCustodyHalted(false);
                  if (simMode === "EMERGENCY") handleModeChange("LIVE");
                }}
              >
                Nominal
              </button>
              <button
                type="button"
                className={`btn ${custodyHalted ? "btn--danger" : "btn--ghost"} btn--sm`}
                style={{ flex: 1, fontSize: 11, height: 26 }}
                onClick={() => {
                  setCustodyHalted(true);
                  handleModeChange("EMERGENCY");
                }}
              >
                Impair Link
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Visual Equation Footer ── */}
      <div
        style={{
          borderTop: "1px solid var(--border)",
          padding: "14px 0 4px",
          marginTop: 12,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 650, color: "var(--text)", marginBottom: 4 }}>
          Assets → Risk Factors → Portfolio State → Permissions → Credit
        </div>
        <p
          style={{
            fontSize: 12,
            color: "var(--text-3)",
            margin: 0,
            fontStyle: "italic",
          }}
        >
          “Your borrowing capacity is a consequence of portfolio risk, not a fixed number.”
        </p>
      </div>
    </Card>
  );
}
