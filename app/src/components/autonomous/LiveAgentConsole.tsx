/**
 * Circuit Protocol — Live Agent Operating Console
 *
 * Dedicated console for autonomous capital management.
 * Shows active objectives, conditions being watched, next permitted action,
 * delegated authority boundaries, and execution controls.
 */

import React, { useState, useEffect } from "react";
import type { DurableIntent } from "../../lib/agent/intent/types";
import { loadIntents, subscribeIntents, pauseDurableIntent, resumeDurableIntent, cancelDurableIntent } from "../../lib/agent/intent/store";
import { DecisionStream } from "./DecisionStream";

interface LiveAgentConsoleProps {
  ownerAddress?: string | null;
  onOpenAuthorityModal?: () => void;
}

export function LiveAgentConsole({ ownerAddress, onOpenAuthorityModal }: LiveAgentConsoleProps) {
  const [intents, setIntents] = useState<DurableIntent[]>([]);
  const [isEvaluating, setIsEvaluating] = useState(false);

  useEffect(() => {
    const refresh = () => {
      const all = loadIntents();
      setIntents(ownerAddress ? all.filter(i => i.owner === ownerAddress) : all);
    };
    refresh();
    return subscribeIntents(refresh);
  }, [ownerAddress]);

  const activeIntent = intents.find(i => i.status === "ARMED" || i.status === "WATCHING" || i.status === "TRIGGERED" || i.status === "WAITING");

  const handleEvaluateNow = async () => {
    setIsEvaluating(true);
    try {
      await fetch("/api/automation/tick", { method: "POST" });
      const all = loadIntents();
      setIntents(ownerAddress ? all.filter(i => i.owner === ownerAddress) : all);
    } catch {
      /* ignore */
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleTogglePause = () => {
    if (!activeIntent) return;
    if (activeIntent.status === "PAUSED") {
      resumeDurableIntent(activeIntent.id);
    } else {
      pauseDurableIntent(activeIntent.id);
    }
  };

  const handleCancel = () => {
    if (!activeIntent) return;
    cancelDurableIntent(activeIntent.id);
  };

  if (!activeIntent) {
    return (
      <div
        style={{
          background: "var(--surface, #111)",
          border: "1px solid var(--border, rgba(255,255,255,0.08))",
          borderRadius: "var(--r, 8px)",
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--text-muted, #555)" }} />
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted, #888)", textTransform: "uppercase" }}>
              Agent Status: Idle
            </span>
          </div>
          <span style={{ fontSize: 11, color: "var(--text-muted, #666)" }}>Zero Active Intents</span>
        </div>

        <div style={{ fontSize: 13, color: "var(--text-secondary, #aaa)", lineHeight: 1.5 }}>
          The autonomous agent has no active instructions. Instruct the agent via Chat or the Strategy form to arm a condition-aware capital intent.
        </div>

        <div style={{ background: "var(--surface-2, rgba(255,255,255,0.02))", padding: "14px", borderRadius: "var(--r-sm, 6px)", border: "1px solid var(--border, rgba(255,255,255,0.05))" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted, #777)", textTransform: "uppercase", marginBottom: "6px" }}>
            Example Directives:
          </div>
          <div style={{ fontSize: 12, color: "var(--text, #ddd)", fontStyle: "italic", lineHeight: 1.6 }}>
            • "When Circuit allows borrowing again, borrow 1,000 USDC automatically. Do not exceed 35% LTV."<br />
            • "Keep my AAPL LTV below 35%. If LTV exceeds 40%, repay automatically using available USDC."
          </div>
        </div>
      </div>
    );
  }

  const isPaused = activeIntent.status === "PAUSED";
  const isTriggered = activeIntent.status === "TRIGGERED";
  const isWatching = activeIntent.status === "WATCHING" || activeIntent.status === "ARMED";

  const statusColor = isPaused
    ? "var(--danger, #f87171)"
    : isTriggered
    ? "var(--accent, #38bdf8)"
    : isWatching
    ? "var(--success, #79c2a4)"
    : "var(--text-muted, #888)";

  return (
    <div
      style={{
        background: "var(--surface, #111)",
        border: "1px solid var(--border, rgba(255,255,255,0.08))",
        borderRadius: "var(--r, 8px)",
        padding: "24px",
        display: "flex",
        flexDirection: "column",
        gap: "20px",
      }}
    >
      {/* Header with Status Pill */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: statusColor,
              boxShadow: `0 0 8px ${statusColor}`,
            }}
          />
          <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.08em", color: "var(--text, #fff)", textTransform: "uppercase" }}>
            Agent · {activeIntent.status.replace(/_/g, " ")}
          </span>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={handleEvaluateNow}
            disabled={isEvaluating}
            style={{ fontSize: 11, height: 26, padding: "0 10px" }}
          >
            {isEvaluating ? "Evaluating..." : "Evaluate Now"}
          </button>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={handleTogglePause}
            style={{ fontSize: 11, height: 26, padding: "0 10px" }}
          >
            {isPaused ? "Resume" : "Pause"}
          </button>
          <button
            type="button"
            className="btn btn--danger btn--sm"
            onClick={handleCancel}
            style={{ fontSize: 11, height: 26, padding: "0 10px" }}
          >
            Cancel Intent
          </button>
        </div>
      </div>

      {/* Primary Objective Card */}
      <div style={{ background: "var(--surface-2, rgba(255,255,255,0.02))", border: "1px solid var(--border, rgba(255,255,255,0.06))", borderRadius: "var(--r-sm, 6px)", padding: "14px 16px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted, #777)", textTransform: "uppercase", marginBottom: "4px" }}>
          Current Objective
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text, #fff)" }}>
          {activeIntent.objective}
        </div>
      </div>

      {/* Grid: Watching Conditions & Next Action */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
        <div style={{ background: "var(--surface-2, rgba(255,255,255,0.02))", border: "1px solid var(--border, rgba(255,255,255,0.06))", borderRadius: "var(--r-sm, 6px)", padding: "14px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted, #777)", textTransform: "uppercase", marginBottom: "8px" }}>
            Watching Conditions
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: 12 }}>
            {activeIntent.conditions.map(c => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-secondary, #ccc)" }}>
                <span style={{ color: "var(--accent, #38bdf8)" }}>•</span>
                <span>{c.description || `${c.field.replace(/_/g, " ")}: ${String(c.threshold)}`}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: "var(--surface-2, rgba(255,255,255,0.02))", border: "1px solid var(--border, rgba(255,255,255,0.06))", borderRadius: "var(--r-sm, 6px)", padding: "14px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted, #777)", textTransform: "uppercase", marginBottom: "8px" }}>
            Next Autonomous Action
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text, #fff)", marginBottom: "4px" }}>
            {activeIntent.action.toUpperCase()} ${activeIntent.amountLimits.targetAmountUsd.toLocaleString()} USDC
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted, #888)" }}>
            Authority: Delegated Signer · No human click required
          </div>
        </div>
      </div>

      {/* Delegated Authority & Risk Bounds */}
      <div style={{ background: "var(--surface-2, rgba(255,255,255,0.02))", border: "1px solid var(--border, rgba(255,255,255,0.06))", borderRadius: "var(--r-sm, 6px)", padding: "14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted, #777)", textTransform: "uppercase" }}>
            Delegated Authority Boundary
          </span>
          {onOpenAuthorityModal && (
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={onOpenAuthorityModal}
              style={{ fontSize: 10, padding: "1px 6px", height: 22 }}
            >
              Manage Authority PDA
            </button>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", fontSize: 12 }}>
          <div>
            <span style={{ color: "var(--text-muted, #777)" }}>Max Borrow: </span>
            <span style={{ fontWeight: 600, color: "#fff" }}>${activeIntent.authoritySnapshot.maxBorrowLimit.toLocaleString()} USDC</span>
          </div>
          <div>
            <span style={{ color: "var(--text-muted, #777)" }}>LTV Ceiling: </span>
            <span style={{ fontWeight: 600, color: "#fff" }}>{(activeIntent.riskLimits.maxLtvBps / 100).toFixed(1)}%</span>
          </div>
          <div>
            <span style={{ color: "var(--text-muted, #777)" }}>Asset Scope: </span>
            <span style={{ fontWeight: 600, color: "#fff" }}>{activeIntent.assetScope.join(", ")}</span>
          </div>
        </div>
      </div>

      {/* Decision Stream */}
      <DecisionStream intentId={activeIntent.id} onRefresh={handleEvaluateNow} />
    </div>
  );
}
