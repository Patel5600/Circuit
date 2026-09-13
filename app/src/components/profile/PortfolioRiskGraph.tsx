import React, { useMemo, useState } from "react";
import { Card, Pill, Tone, Button, Icon } from "../ui";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export interface AssetNode {
  symbol: string;
  weightPct: number; // 0–100
  oracleHealthy: boolean;
  confBps: number;
  maxConfBps: number;
  marketOpen: boolean;
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

function riskScore(state: string): number {
  switch (state) {
    case "SAFE": return 18;
    case "RESTRICTED": return 48;
    case "DEFENSIVE": return 72;
    case "EMERGENCY": return 94;
    default: return 50;
  }
}

/* -------------------------------------------------------------------------- */
/*  SVG Layout Constants                                                      */
/* -------------------------------------------------------------------------- */

const W = 920;
const H = 490;

// Column x-positions for the 4 layers
const COL_ASSET = 80;
const COL_RISK = 300;
const COL_PORTFOLIO = 540;
const COL_CREDIT = 780;

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

function AssetCircle({
  x, y, symbol, weightPct, stressed,
}: {
  x: number; y: number; symbol: string; weightPct: number; stressed: boolean;
}) {
  const r = Math.max(18, Math.min(36, 14 + weightPct * 0.36));
  const fill = stressed ? "rgba(224, 108, 108, 0.12)" : "rgba(127, 195, 154, 0.08)";
  const stroke = stressed ? "#e06c6c" : "rgba(127, 195, 154, 0.3)";

  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={fill} stroke={stroke} strokeWidth={stressed ? 2 : 1}>
        {stressed && (
          <animate attributeName="r" values={`${r};${r + 3};${r}`} dur="2s" repeatCount="indefinite" />
        )}
      </circle>
      <text x={x} y={y - 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--text)">
        {symbol}
      </text>
      <text x={x} y={y + 10} textAnchor="middle" fontSize={10} fontFamily="var(--mono)" fill="var(--text-3)">
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
  return (
    <g>
      <rect
        x={x - 42} y={y - 11}
        width={84} height={22}
        rx={5}
        fill={stressed ? "rgba(224, 108, 108, 0.1)" : "var(--surface-2, rgba(30,34,44,0.5))"}
        stroke={stressed ? "#e06c6c" : "var(--border)"}
        strokeWidth={stressed ? 1.5 : 1}
      />
      <text x={x} y={y + 3} textAnchor="middle" fontSize={9.5} fontFamily="var(--mono)" fill={color} fontWeight={stressed ? 600 : 450}>
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
      <circle cx={x} cy={y} r={52} fill="none" stroke={color} strokeWidth={2} opacity={0.25} />
      <circle
        cx={x} cy={y} r={52}
        fill="none"
        stroke={color}
        strokeWidth={3.5}
        strokeDasharray={`${score * 3.27} ${327 - score * 3.27}`}
        strokeDashoffset={82}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.6s ease" }}
      />
      <circle cx={x} cy={y} r={42} fill={`${color}11`} />
      <text x={x} y={y - 14} textAnchor="middle" fontSize={9} fontFamily="var(--mono)" fill="var(--text-3)"
        textDecoration="uppercase" letterSpacing="0.1em">
        PORTFOLIO RISK
      </text>
      <text x={x} y={y + 6} textAnchor="middle" fontSize={22} fontWeight={700} fill={color}>
        {score}
      </text>
      <text x={x} y={y + 20} textAnchor="middle" fontSize={10} fontFamily="var(--mono)" fill={color}>
        / 100
      </text>
      <text x={x} y={y + 40} textAnchor="middle" fontSize={11} fontWeight={650} fill={color}>
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
  return (
    <g>
      <rect
        x={x - 66} y={y - 62}
        width={132} height={124}
        rx={12}
        fill={hardOverride ? "rgba(224, 108, 108, 0.08)" : "rgba(127, 195, 154, 0.04)"}
        stroke={color}
        strokeWidth={1.5}
      />
      <text x={x} y={y - 42} textAnchor="middle" fontSize={9} fontFamily="var(--mono)"
        fill="var(--text-3)" letterSpacing="0.1em">
        CREDIT CONSEQUENCE
      </text>
      <text x={x} y={y - 20} textAnchor="middle" fontSize={10} fill="var(--text-3)">
        Effective LTV
      </text>
      <text x={x} y={y - 2} textAnchor="middle" fontSize={18} fontWeight={700} fill={color}>
        {(effectiveLtv / 100).toFixed(0)}%
      </text>
      <text x={x} y={y + 16} textAnchor="middle" fontSize={10} fill="var(--text-3)">
        Borrow Capacity
      </text>
      <text x={x} y={y + 32} textAnchor="middle" fontSize={14} fontWeight={650}
        fill={color} fontFamily="var(--mono)">
        ${borrowPower.toLocaleString("en-US", { maximumFractionDigits: 0 })}
      </text>
      <rect
        x={x - 52} y={y + 42}
        width={104} height={20}
        rx={4}
        fill={`${color}18`}
      />
      <text x={x} y={y + 55} textAnchor="middle" fontSize={10} fontWeight={650}
        fontFamily="var(--mono)" fill={color}>
        {hardOverride ? "BORROW BLOCKED" : allowed ? "BORROW ALLOWED" : "BORROW RESTRICTED"}
      </text>
    </g>
  );
}

/* -------------------------------------------------------------------------- */
/*  Hard-risk override banner line                                            */
/* -------------------------------------------------------------------------- */

function HardOverrideLine({ y, reason }: { y: number; reason?: string }) {
  return (
    <g>
      <line x1={50} y1={y} x2={W - 50} y2={y}
        stroke="#e06c6c" strokeWidth={2} strokeDasharray="8 4">
        <animate attributeName="stroke-opacity" values="0.3;0.9;0.3" dur="1.5s" repeatCount="indefinite" />
      </line>
      <rect x={W / 2 - 110} y={y - 11} width={220} height={22} rx={4} fill="rgba(224,108,108,0.18)" stroke="#e06c6c" strokeWidth={1} />
      <text x={W / 2} y={y + 4} textAnchor="middle" fontSize={10} fontWeight={700}
        fontFamily="var(--mono)" fill="#e06c6c">
        ⚠ HARD RISK OVERRIDE ACTIVE
      </text>
      {reason && (
        <text x={W / 2} y={y + 22} textAnchor="middle" fontSize={9.5} fill="#e06c6c" opacity={0.85}>
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
}: PortfolioRiskGraphProps) {
  // Mode selection: 'LIVE' | 'STRESS' | 'EMERGENCY'
  const [simMode, setSimMode] = useState<"LIVE" | "HEALTHY" | "STRESS" | "EMERGENCY">("LIVE");

  // Derive active display values based on mode
  const { assets, riskState, effectiveLtvBps, borrowPowerUsd, borrowAllowed, hardOverride, hardOverrideReason, whatChanged } =
    useMemo(() => {
      if (simMode === "HEALTHY") {
        const balancedAssets: AssetNode[] = [
          { symbol: "NVDA", weightPct: 35, oracleHealthy: true, confBps: 20, maxConfBps: 150, marketOpen: true },
          { symbol: "AAPL", weightPct: 30, oracleHealthy: true, confBps: 18, maxConfBps: 150, marketOpen: true },
          { symbol: "MSFT", weightPct: 25, oracleHealthy: true, confBps: 12, maxConfBps: 150, marketOpen: true },
          { symbol: "USDC", weightPct: 10, oracleHealthy: true, confBps: 0, maxConfBps: 150, marketOpen: true },
        ];
        return {
          assets: balancedAssets,
          riskState: "SAFE" as const,
          effectiveLtvBps: 7000,
          borrowPowerUsd: 12600,
          borrowAllowed: true,
          hardOverride: false,
          hardOverrideReason: undefined,
          whatChanged: {
            deltaScore: "-15% Risk (Nominal)",
            reason: "Balanced collateral (max 35% NVDA) & tight Pyth spread",
            impact: "+$1,800 Borrow capacity unlocked",
            tone: "success" as const,
          },
        };
      }

      if (simMode === "STRESS") {
        const stressedAssets: AssetNode[] = [
          { symbol: "NVDA", weightPct: 62, oracleHealthy: true, confBps: 285, maxConfBps: 150, marketOpen: true },
          { symbol: "AAPL", weightPct: 20, oracleHealthy: true, confBps: 18, maxConfBps: 150, marketOpen: true },
          { symbol: "MSFT", weightPct: 13, oracleHealthy: true, confBps: 12, maxConfBps: 150, marketOpen: true },
          { symbol: "USDC", weightPct: 5, oracleHealthy: true, confBps: 0, maxConfBps: 150, marketOpen: true },
        ];
        return {
          assets: stressedAssets,
          riskState: "RESTRICTED" as const,
          effectiveLtvBps: 5200,
          borrowPowerUsd: 7800,
          borrowAllowed: false,
          hardOverride: false,
          hardOverrideReason: undefined,
          whatChanged: {
            deltaScore: "+18% Portfolio Risk",
            reason: "NVDA concentration high (62%) + Pyth confidence widened (285 bps)",
            impact: "Borrow capacity reduced -$2,140",
            tone: "warning" as const,
          },
        };
      }

      if (simMode === "EMERGENCY") {
        const emergencyAssets: AssetNode[] = [
          { symbol: "NVDA", weightPct: 58, oracleHealthy: false, confBps: 520, maxConfBps: 150, marketOpen: false },
          { symbol: "AAPL", weightPct: 22, oracleHealthy: true, confBps: 18, maxConfBps: 150, marketOpen: true },
          { symbol: "MSFT", weightPct: 15, oracleHealthy: true, confBps: 12, maxConfBps: 150, marketOpen: true },
          { symbol: "USDC", weightPct: 5, oracleHealthy: true, confBps: 0, maxConfBps: 150, marketOpen: true },
        ];
        return {
          assets: emergencyAssets,
          riskState: "EMERGENCY" as const,
          effectiveLtvBps: 4000,
          borrowPowerUsd: 0,
          borrowAllowed: false,
          hardOverride: true,
          hardOverrideReason: "Pyth price stale (> 60s) or confidence exceeded critical bound (520 bps)",
          whatChanged: {
            deltaScore: "CRITICAL FAILURE (Emergency)",
            reason: "Oracle confidence blown & exchange session closed",
            impact: "ALL NEW BORROWING BLOCKED ON-CHAIN",
            tone: "danger" as const,
          },
        };
      }

      // Default: LIVE
      return {
        assets: liveAssets,
        riskState: liveState,
        effectiveLtvBps: liveLtv,
        borrowPowerUsd: liveBorrowPower,
        borrowAllowed: liveAllowed,
        hardOverride: liveHardOverride,
        hardOverrideReason: liveHardReason,
        whatChanged: {
          deltaScore: liveState === "SAFE" ? "Nominal (Safe)" : "+14% Stress Factor",
          reason: liveState === "SAFE" ? "All oracle and market checks nominal" : "Single-asset concentration penalty active",
          impact: liveAllowed ? "Full capacity available" : "Capacity restricted by Risk Ratchet",
          tone: liveState === "SAFE" ? ("success" as const) : ("warning" as const),
        },
      };
    }, [simMode, liveAssets, liveState, liveLtv, liveBorrowPower, liveAllowed, liveHardOverride, liveHardReason]);

  const score = riskScore(riskState);
  const portfolioY = H / 2;
  const creditY = H / 2;

  // Position assets vertically
  const assetPositions = useMemo(() => {
    const spacing = Math.min(80, (H - 90) / Math.max(1, assets.length - 1));
    const startY = H / 2 - ((assets.length - 1) * spacing) / 2;
    return assets.map((a, i) => ({
      ...a,
      x: COL_ASSET,
      y: startY + i * spacing,
      stressed: !a.oracleHealthy || a.confBps > a.maxConfBps || !a.marketOpen || a.weightPct > 60,
    }));
  }, [assets]);

  // Risk factor nodes per asset
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
    const factorSpacing = 26;
    const factorBlockHeight = FACTORS.length * factorSpacing;

    assetPositions.forEach((asset, ai) => {
      const blockStart = asset.y - factorBlockHeight / 2 + factorSpacing / 2;
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
          x: COL_RISK,
          y: blockStart + fi * factorSpacing,
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
              onClick={() => setSimMode(m)}
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
        style={{ maxHeight: 490, display: "block" }}
        aria-label="Portfolio risk flow graph"
      >
        {/* Layer Column Headers */}
        <text x={COL_ASSET} y={24} textAnchor="middle" fontSize={10} fontFamily="var(--mono)"
          fill="var(--text-3)" letterSpacing="0.08em" opacity={0.6}>
          LAYER 1: ASSETS
        </text>
        <text x={COL_RISK} y={24} textAnchor="middle" fontSize={10} fontFamily="var(--mono)"
          fill="var(--text-3)" letterSpacing="0.08em" opacity={0.6}>
          LAYER 2: RISK FACTORS
        </text>
        <text x={COL_PORTFOLIO} y={24} textAnchor="middle" fontSize={10} fontFamily="var(--mono)"
          fill="var(--text-3)" letterSpacing="0.08em" opacity={0.6}>
          LAYER 3: PORTFOLIO RISK
        </text>
        <text x={COL_CREDIT} y={24} textAnchor="middle" fontSize={10} fontFamily="var(--mono)"
          fill="var(--text-3)" letterSpacing="0.08em" opacity={0.6}>
          LAYER 4: CREDIT
        </text>

        {/* Edges: Asset → Risk Factors */}
        {riskFactorPositions.map((rf, i) => {
          const parent = assetPositions[rf.parentIdx];
          const thickness = rf.stressed ? 3 : rf.level === "med" ? 2 : 1;
          const color = rf.stressed ? "#e06c6c" : rf.level === "med" ? "#cfad74" : "var(--border)";
          return (
            <Edge
              key={`a-r-${i}`}
              x1={parent.x + 36} y1={parent.y}
              x2={rf.x - 44} y2={rf.y}
              thickness={thickness}
              color={color}
              animated={rf.stressed}
            />
          );
        })}

        {/* Edges: Risk Factors → Portfolio */}
        {riskFactorPositions.map((rf, i) => {
          const thickness = rf.stressed ? 2.5 : 1;
          const color = rf.stressed ? "#e06c6c" : "var(--border)";
          return (
            <Edge
              key={`r-p-${i}`}
              x1={rf.x + 44} y1={rf.y}
              x2={COL_PORTFOLIO - 54} y2={portfolioY}
              thickness={thickness}
              color={color}
              animated={rf.stressed}
            />
          );
        })}

        {/* Edge: Portfolio → Credit */}
        <Edge
          x1={COL_PORTFOLIO + 54} y1={portfolioY}
          x2={COL_CREDIT - 68} y2={creditY}
          thickness={hardOverride ? 3.5 : 2}
          color={hardOverride ? "#e06c6c" : STATE_COLOR[riskState]}
          animated={hardOverride || riskState !== "SAFE"}
        />

        {/* Hard-risk override banner line */}
        {hardOverride && <HardOverrideLine y={H - 36} reason={hardOverrideReason} />}

        {/* Layer 1: Asset nodes */}
        {assetPositions.map((a, i) => (
          <AssetCircle
            key={`asset-${i}`}
            x={a.x} y={a.y}
            symbol={a.symbol}
            weightPct={a.weightPct}
            stressed={a.stressed}
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

        {/* Layer 3: Portfolio node */}
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

      {/* ── Visual Equation Footer ── */}
      <div
        style={{
          borderTop: "1px solid var(--border)",
          padding: "14px 0 4px",
          marginTop: 8,
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
