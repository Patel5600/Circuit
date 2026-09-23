import React from "react";
import { Card, Pill, Tone } from "../ui";

export interface RiskPostureProps {
  concentrationPct: number; // 0–100, max single-asset weight
  oracleConfBps: number;
  maxConfBps: number;
  oracleAgeSec: number;
  maxOracleAge: number;
  liquidityState: string;
  leverageRatio: number; // debt / collateral, 0–1
  riskScore?: number; // 0–100
  riskState?: "SAFE" | "RESTRICTED" | "DEFENSIVE" | "EMERGENCY";
}

interface PostureCardData {
  title: string;
  value: string;
  severity: string;
  tone: Tone;
  explanation: string;
  source: string;
  progressPct: number;
}

export function RiskPosture({
  concentrationPct,
  oracleConfBps,
  maxConfBps,
  oracleAgeSec,
  maxOracleAge,
  liquidityState,
  leverageRatio,
  riskScore,
  riskState = "SAFE",
}: RiskPostureProps) {
  const effectiveScore =
    riskScore !== undefined
      ? riskScore
      : riskState === "SAFE"
      ? 10
      : riskState === "RESTRICTED"
      ? 40
      : riskState === "DEFENSIVE"
      ? 70
      : 95;
  // 1. Concentration
  const concSeverity = concentrationPct <= 40 ? "LOW" : concentrationPct <= 60 ? "MEDIUM" : "HIGH";
  const concTone: Tone = concentrationPct <= 40 ? "success" : concentrationPct <= 60 ? "warning" : "danger";
  const concExplanation =
    concentrationPct === 0
      ? "Zero collateral deposited. No single-asset concentration exposure."
      : concentrationPct > 40
      ? `${Math.round(concentrationPct)}% of collateral is concentrated in one asset, applying a -${Math.round((concentrationPct - 40) * 36)} bps haircut.`
      : `${Math.round(concentrationPct)}% allocated to top asset, safely below the 40% concentration haircut threshold.`;

  // 2. Leverage
  const levSeverity = leverageRatio === 0 ? "UNLEVERAGED" : leverageRatio <= 0.35 ? "CONSERVATIVE" : leverageRatio <= 0.65 ? "MODERATE" : "HIGH";
  const levTone: Tone = leverageRatio === 0 ? "neutral" : leverageRatio <= 0.35 ? "success" : leverageRatio <= 0.65 ? "warning" : "danger";
  const levExplanation =
    leverageRatio === 0
      ? "Zero borrowed debt drawn. Collateral maintains 100% equity cushion."
      : `Debt represents ${(leverageRatio * 100).toFixed(1)}% of conservative collateral valuation.`;

  // 3. Oracle Quality
  const confRatio = maxConfBps > 0 ? oracleConfBps / maxConfBps : 0;
  const oracleSeverity = confRatio <= 0.35 ? "OPTIMAL" : confRatio <= 0.75 ? "ELEVATED" : "CRITICAL";
  const oracleTone: Tone = confRatio <= 0.35 ? "success" : confRatio <= 0.75 ? "warning" : "danger";
  const oracleExplanation =
    oracleConfBps <= 50
      ? `Pyth confidence spread is ±${oracleConfBps} bps, reflecting tight market consensus.`
      : `Publisher uncertainty widened to ±${oracleConfBps} bps (${Math.round(confRatio * 100)}% of ${maxConfBps} bps ceiling).`;

  // 4. Liquidity Exposure
  const liqMap: Record<string, { severity: string; tone: Tone; explanation: string }> = {
    deep: { severity: "DEEP", tone: "success", explanation: "Deep liquidity buffer in protocol vaults; borrowing capacity unrestricted." },
    normal: { severity: "NORMAL", tone: "success", explanation: "Standard protocol quote liquidity available for instantaneous borrowing." },
    thin: { severity: "THIN", tone: "warning", explanation: "Vault liquidity compressed; borrow sizing subject to capacity ceiling." },
    critical: { severity: "CRITICAL", tone: "danger", explanation: "Upstream liquidity halt or vault constraint blocking new credit." },
  };
  const liq = liqMap[liquidityState] ?? liqMap.normal;

  // 5. Portfolio Risk
  const portSeverity = riskState;
  const portTone: Tone = riskState === "SAFE" ? "success" : riskState === "EMERGENCY" ? "danger" : "warning";
  const portExplanation =
    riskState === "SAFE"
      ? "All oracle, concentration, and market session parameters satisfy nominal bounds."
      : riskState === "RESTRICTED"
      ? "Capacity restricted by Risk Ratchet due to concentration or spread widening."
      : riskState === "DEFENSIVE"
      ? "Defensive posture active: all new borrowing blocked pending risk reduction."
      : "Emergency circuit breaker active: protocol halted to protect depositor solvency.";

  const cards: PostureCardData[] = [
    {
      title: "Concentration",
      value: `${Math.round(concentrationPct)}%`,
      severity: concSeverity,
      tone: concTone,
      explanation: concExplanation,
      source: "max(w_i) vs 40% threshold",
      progressPct: Math.min(100, concentrationPct),
    },
    {
      title: "Leverage",
      value: leverageRatio === 0 ? "0.00x" : `${leverageRatio.toFixed(2)}x`,
      severity: levSeverity,
      tone: levTone,
      explanation: levExplanation,
      source: "Total Debt / Total Collateral",
      progressPct: Math.min(100, Math.round(leverageRatio * 100)),
    },
    {
      title: "Oracle Quality",
      value: oracleConfBps > 0 ? `±${oracleConfBps} bps` : "Unavailable",
      severity: oracleSeverity,
      tone: oracleTone,
      explanation: oracleExplanation,
      source: `Pyth feed conf / ${maxConfBps} bps max`,
      progressPct: Math.min(100, Math.round(confRatio * 100)),
    },
    {
      title: "Liquidity Exposure",
      value: liq.severity,
      severity: liq.severity,
      tone: liq.tone,
      explanation: liq.explanation,
      source: "Liquidity Vault ATA balance",
      progressPct: liq.severity === "DEEP" ? 25 : liq.severity === "NORMAL" ? 40 : liq.severity === "THIN" ? 75 : 95,
    },
    {
      title: "Portfolio Risk",
      value: `${effectiveScore} / 100`,
      severity: portSeverity,
      tone: portTone,
      explanation: portExplanation,
      source: "Dynamic Risk Ratchet engine",
      progressPct: effectiveScore,
    },
  ];

  return (
    <Card title="Risk Posture">
      <p style={{ fontSize: 12.5, color: "var(--text-3)", margin: "0 0 16px 0", lineHeight: 1.5 }}>
        Multi-dimensional risk breakdown evaluating asset concentration, oracle uncertainty, leverage, and protocol liquidity buffers.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12,
        }}
      >
        {cards.map((c) => (
          <div
            key={c.title}
            style={{
              padding: "14px 16px",
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "var(--mono)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--text-3)",
                }}
              >
                {c.title}
              </span>
              <Pill tone={c.tone}>{c.severity}</Pill>
            </div>

            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "var(--mono)", color: "var(--text)" }}>
              {c.value}
            </div>

            <div
              style={{
                height: 4,
                borderRadius: 2,
                background: "var(--surface-3)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${c.progressPct}%`,
                  borderRadius: 2,
                  background:
                    c.tone === "success"
                      ? "var(--success)"
                      : c.tone === "warning"
                      ? "var(--warning)"
                      : c.tone === "danger"
                      ? "var(--danger)"
                      : "var(--text-3)",
                  transition: "width 0.4s ease",
                }}
              />
            </div>

            <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.4, marginTop: 2, flexGrow: 1 }}>
              {c.explanation}
            </div>

            <div style={{ fontSize: 10.5, fontFamily: "var(--mono)", color: "var(--text-3)", paddingTop: 4, borderTop: "1px solid rgba(255, 255, 255, 0.04)" }}>
              {c.source}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

