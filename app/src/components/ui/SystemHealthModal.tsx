/**
 * Circuit Protocol - System Health Diagnostic Modal
 */

import React from "react";
import { Modal, Pill, Button, Icon } from "./index";
import { useCircuitDomain } from "../../lib/domain/context";
import { PROGRAM_ID } from "../../config";

export function SystemHealthModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { systemHealth, refreshAll, risk, hasActiveAuthority, onChainAuthorities } = useCircuitDomain();

  const isHealthy = systemHealth.status === "SYSTEM_HEALTHY";
  const tone = isHealthy ? "success" : "warning";

  return (
    <Modal open={open} onClose={onClose} title="System Telemetry & Health">
      <div className="stack g-16" style={{ minWidth: 340 }}>
        {/* Overall Status */}
        <div
          style={{
            padding: 14,
            borderRadius: "var(--r, 10px)",
            background: isHealthy ? "rgba(127, 195, 154, 0.08)" : "rgba(229, 169, 59, 0.08)",
            border: isHealthy ? "1px solid rgba(127, 195, 154, 0.2)" : "1px solid rgba(229, 169, 59, 0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 700, letterSpacing: "0.06em" }}>
              PROTOCOL HEALTH
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>
              {isHealthy ? "All Subsystems Nominal" : systemHealth.status}
            </div>
          </div>
          <Pill tone={tone} withDot>
            {isHealthy ? "SYSTEM HEALTHY" : "DEGRADED"}
          </Pill>
        </div>

        {/* Semantic Subsystem Status Indicators */}
        <div
          className="stack g-10"
          style={{
            padding: 14,
            background: "var(--surface-2, #0d0f15)",
            borderRadius: "var(--r, 10px)",
            border: "1px solid var(--border, #1a1d26)",
          }}
        >
          <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 700, letterSpacing: "0.06em", marginBottom: 2 }}>
            SEMANTIC SUBSYSTEM STATUS
          </div>

          <div className="row between g-8" style={{ alignItems: "center" }}>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>PROTOCOL</span>
            <Pill tone={systemHealth.isOnline && !systemHealth.status.includes("DEGRADED") ? "success" : "warning"} withDot>
              {systemHealth.isOnline ? "CONNECTED" : "OFFLINE"}
            </Pill>
          </div>

          <div className="row between g-8" style={{ alignItems: "center" }}>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>MARKET DATA</span>
            <Pill tone={risk.isStaleOracle ? "warning" : "success"} withDot>
              {risk.isStaleOracle ? "STALE" : risk.isMarketOpen ? "LIVE (NYSE OPEN)" : "RECENT (NYSE CLOSED)"}
            </Pill>
          </div>

          <div className="row between g-8" style={{ alignItems: "center" }}>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>RISK RATCHET</span>
            <Pill tone={risk.ratchetState === "SAFE" ? "success" : risk.ratchetState === "RESTRICTED" ? "warning" : "danger"} withDot>
              {risk.ratchetState}
            </Pill>
          </div>

          <div className="row between g-8" style={{ alignItems: "center" }}>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>AUTONOMOUS</span>
            <Pill
              tone={
                hasActiveAuthority
                  ? "success"
                  : onChainAuthorities.some((a) => a.isExpired)
                  ? "warning"
                  : onChainAuthorities.some((a) => a.isRevoked)
                  ? "danger"
                  : "neutral"
              }
              withDot={hasActiveAuthority}
            >
              {hasActiveAuthority
                ? "ACTIVE"
                : onChainAuthorities.some((a) => a.isExpired)
                ? "EXPIRED"
                : onChainAuthorities.some((a) => a.isRevoked)
                ? "REVOKED"
                : "NOT CONFIGURED"}
            </Pill>
          </div>
        </div>

        {/* Telemetry Metrics */}
        <div
          className="stack g-10"
          style={{
            padding: 14,
            background: "var(--surface-2, #0d0f15)",
            borderRadius: "var(--r, 10px)",
            border: "1px solid var(--border, #1a1d26)",
          }}
        >
          <div className="row between g-8" style={{ alignItems: "center" }}>
            <span className="t-label">Cluster</span>
            <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>
              Solana Devnet
            </span>
          </div>

          <div className="row between g-8" style={{ alignItems: "center" }}>
            <span className="t-label">Confirmed Slot</span>
            <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>
              {systemHealth.slot > 0 ? systemHealth.slot.toLocaleString() : "Syncing..."}
            </span>
          </div>

          <div className="row between g-8" style={{ alignItems: "center" }}>
            <span className="t-label">RPC Heartbeat Latency</span>
            <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>
              {systemHealth.rpcLatencyMs > 0 ? `${systemHealth.rpcLatencyMs} ms` : "<100 ms"}
            </span>
          </div>

          <div className="row between g-8" style={{ alignItems: "center" }}>
            <span className="t-label">Network Status</span>
            <span style={{ fontSize: 12, color: systemHealth.isOnline ? "var(--success)" : "var(--danger)" }}>
              {systemHealth.isOnline ? "Online" : "Offline"}
            </span>
          </div>
        </div>

        {/* Program Identification */}
        <div
          className="stack g-6"
          style={{
            padding: 14,
            background: "#08090d",
            borderRadius: "var(--r, 10px)",
            border: "1px solid var(--border, #1a1d26)",
          }}
        >
          <span className="t-label">Circuit Program ID</span>
          <span
            className="mono"
            style={{
              fontSize: 11,
              wordBreak: "break-all",
              color: "var(--text-2)",
            }}
          >
            {PROGRAM_ID.toBase58()}
          </span>
        </div>

        {/* Actions */}
        <div className="row g-8" style={{ justifyContent: "flex-end", marginTop: 4 }}>
          <Button variant="secondary" size="sm" onClick={() => refreshAll()}>
            Refresh Diagnostics
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
