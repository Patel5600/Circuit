/**
 * Circuit Protocol - Live Metric Display Component
 *
 * Renders live financial telemetry with tabular numeric alignment,
 * subtle update cues, zero layout shifts, and honest handling of
 * unavailable / uninitialized data.
 */

import React, { useEffect, useRef, useState } from "react";

export interface LiveMetricProps {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "accent";
  isUpdating?: boolean;
}

export function LiveMetric({
  label,
  value,
  sub,
  tone = "neutral",
  isUpdating = false,
}: LiveMetricProps) {
  const [pulsing, setPulsing] = useState(false);
  const prevValRef = useRef(value);

  useEffect(() => {
    if (prevValRef.current !== value) {
      prevValRef.current = value;
      setPulsing(true);
      const timer = setTimeout(() => setPulsing(false), 800);
      return () => clearTimeout(timer);
    }
  }, [value]);

  const toneColorMap = {
    neutral: "var(--text-1, #f8fafc)",
    success: "var(--success, #22c55e)",
    warning: "var(--warning, #eab308)",
    danger: "var(--danger, #ef4444)",
    accent: "var(--accent, #9945FF)",
  };

  return (
    <div
      style={{
        flex: 1,
        minWidth: 140,
        position: "relative",
        padding: "10px 14px",
        background: "var(--surface-2, rgba(255, 255, 255, 0.02))",
        border: "1px solid var(--border)",
        borderRadius: 8,
        transition: "border-color 0.3s ease, background 0.3s ease",
        borderColor: pulsing ? "rgba(153, 69, 255, 0.4)" : "var(--border)",
      }}
    >
      {/* Label */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 4,
        }}
      >
        <span
          style={{
            fontSize: 10.5,
            fontFamily: "var(--mono)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--text-3, #94a3b8)",
            fontWeight: 650,
          }}
        >
          {label}
        </span>
        {isUpdating && (
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: "var(--accent, #9945FF)",
              animation: "pulse 1s infinite",
            }}
            title="Updating live on-chain data..."
          />
        )}
      </div>

      {/* Primary Value */}
      <div
        style={{
          fontSize: 19,
          fontWeight: 750,
          fontFamily: "var(--mono)",
          fontVariantNumeric: "tabular-nums",
          color: toneColorMap[tone],
          lineHeight: 1.2,
          transition: "color 0.3s ease",
        }}
      >
        {value ?? <span style={{ color: "var(--text-3)", fontSize: 14 }}>Unavailable</span>}
      </div>

      {/* Subtitle / context */}
      {sub && (
        <div
          style={{
            fontSize: 10.5,
            color: "var(--text-3, #94a3b8)",
            marginTop: 4,
            lineHeight: 1.3,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}
