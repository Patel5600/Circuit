import React from "react";
import { Card, Pill, Tone } from "../ui";

interface PostureItem {
  label: string;
  value: string;
  level: number; // 0–1 fill
  tone: Tone;
}

function postureTone(level: number): Tone {
  if (level <= 0.3) return "success";
  if (level <= 0.6) return "warning";
  return "danger";
}

function PostureBar({ item }: { item: PostureItem }) {
  return (
    <div style={{ flex: 1, minWidth: 180 }}>
      <div className="row between" style={{ marginBottom: 6 }}>
        <span
          style={{
            fontSize: 11,
            fontFamily: "var(--mono)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--text-3)",
          }}
        >
          {item.label}
        </span>
        <Pill tone={item.tone}>{item.value}</Pill>
      </div>
      <div
        style={{
          height: 6,
          borderRadius: 3,
          background: "var(--surface-3)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${Math.round(item.level * 100)}%`,
            borderRadius: 3,
            background:
              item.tone === "success"
                ? "var(--success)"
                : item.tone === "warning"
                ? "var(--warning)"
                : "var(--danger)",
            transition: "width 0.4s ease",
          }}
        />
      </div>
    </div>
  );
}

export interface RiskPostureProps {
  concentrationPct: number; // 0–100, max single-asset weight
  oracleConfBps: number;
  maxConfBps: number;
  oracleAgeSec: number;
  maxOracleAge: number;
  liquidityState: string;
  leverageRatio: number; // debt / collateral, 0–1
}

export function RiskPosture({
  concentrationPct,
  oracleConfBps,
  maxConfBps,
  oracleAgeSec,
  maxOracleAge,
  liquidityState,
  leverageRatio,
}: RiskPostureProps) {
  // Concentration
  const concLevel = Math.min(1, concentrationPct / 100);
  const concLabel =
    concentrationPct <= 40 ? "Low" : concentrationPct <= 65 ? "Medium" : "High";

  // Oracle quality
  const confRatio = maxConfBps > 0 ? oracleConfBps / maxConfBps : 0;
  const ageRatio = maxOracleAge > 0 ? oracleAgeSec / maxOracleAge : 0;
  const oracleLevel = Math.min(1, Math.max(confRatio, ageRatio));
  const oracleLabel =
    oracleLevel <= 0.3 ? "Healthy" : oracleLevel <= 0.7 ? "Degraded" : "Stale";

  // Liquidity
  const liqMap: Record<string, { level: number; label: string }> = {
    deep: { level: 0.1, label: "High" },
    normal: { level: 0.3, label: "Normal" },
    thin: { level: 0.7, label: "Thin" },
    critical: { level: 0.95, label: "Critical" },
  };
  const liq = liqMap[liquidityState] ?? liqMap.normal;

  // Leverage
  const levLevel = Math.min(1, leverageRatio);
  const levLabel =
    leverageRatio <= 0.3 ? "Low" : leverageRatio <= 0.6 ? "Medium" : "High";

  const items: PostureItem[] = [
    {
      label: "Concentration",
      value: concLabel,
      level: concLevel,
      tone: postureTone(concLevel),
    },
    {
      label: "Oracle Quality",
      value: oracleLabel,
      level: oracleLevel,
      tone: postureTone(oracleLevel),
    },
    {
      label: "Liquidity",
      value: liq.label,
      level: liq.level,
      tone: postureTone(liq.level),
    },
    {
      label: "Leverage",
      value: levLabel,
      level: levLevel,
      tone: postureTone(levLevel),
    },
  ];

  return (
    <Card title="Risk Posture">
      <div
        style={{
          display: "flex",
          gap: 20,
          flexWrap: "wrap",
          padding: "4px 0",
        }}
      >
        {items.map((item) => (
          <PostureBar key={item.label} item={item} />
        ))}
      </div>
    </Card>
  );
}
