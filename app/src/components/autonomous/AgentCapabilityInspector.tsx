/**
 * Circuit Protocol — Agent Capability Inspector
 *
 * "What can you do?"
 * Explains exact read capabilities, permitted execution actions, active limits,
 * and current risk/session restrictions without marketing fluff.
 */

import React from "react";
import { shortenAddress } from "../../lib/format";

interface AgentCapabilityInspectorProps {
  isOpen: boolean;
  onClose: () => void;
  agentAuthority: any;
  riskState: string;
  isMarketOpen: boolean;
  borrowLimitUsd: number;
}

export function AgentCapabilityInspector({
  isOpen,
  onClose,
  agentAuthority,
  riskState,
  isMarketOpen,
  borrowLimitUsd,
}: AgentCapabilityInspectorProps) {
  if (!isOpen) return null;

  const hasAuthority = Boolean(agentAuthority?.active);
  const isEmergency = riskState === "EMERGENCY";
  const isDefensive = riskState === "DEFENSIVE";
  const isRestricted = riskState === "RESTRICTED";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(4px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 580,
          background: "var(--surface-1, #121214)",
          border: "1px solid var(--border-strong, #3f3f46)",
          borderRadius: 12,
          boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", fontFamily: "var(--mono)" }}>
              AGENT CAPABILITY INSPECTOR
            </span>
            <span
              style={{
                fontSize: 10,
                fontFamily: "var(--mono)",
                padding: "2px 6px",
                borderRadius: 4,
                background: hasAuthority ? "rgba(121,194,164,0.12)" : "rgba(207,173,116,0.12)",
                color: hasAuthority ? "var(--mint, #79c2a4)" : "var(--warning, #cfad74)",
                fontWeight: 700,
              }}
            >
              {hasAuthority ? "DELEGATED PDA ACTIVE" : "INTERACTIVE WALLET MODE"}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-3)",
              cursor: "pointer",
              fontSize: 16,
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 16, maxHeight: "75vh", overflowY: "auto" }}>
          {/* 1. READ Capabilities */}
          <div>
            <div style={{ fontSize: 11, fontFamily: "var(--mono)", fontWeight: 700, color: "var(--text-3)", marginBottom: 8, letterSpacing: "0.08em" }}>
              1. READ CAPABILITIES (ALWAYS ACCESSIBLE)
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 6, fontSize: 12, fontFamily: "var(--mono)" }}>
              <CapabilityItem label="Portfolio &amp; Collateral" active />
              <CapabilityItem label="Pyth Oracle Feeds" active />
              <CapabilityItem label="Risk Ratchet State" active />
              <CapabilityItem label="Meteora DBC Pools" active />
              <CapabilityItem label="On-chain Positions" active />
              <CapabilityItem label="Transaction History" active />
            </div>
          </div>

          {/* 2. EXECUTE Capabilities */}
          <div>
            <div style={{ fontSize: 11, fontFamily: "var(--mono)", fontWeight: 700, color: "var(--text-3)", marginBottom: 8, letterSpacing: "0.08em" }}>
              2. EXECUTION CAPABILITIES
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <ExecutionRow
                action="Deposit Collateral"
                allowed={true}
                note="Always allowed to add equity collateral"
              />
              <ExecutionRow
                action="Repay Debt"
                allowed={true}
                note="Always allowed for recovery in all risk states"
              />
              <ExecutionRow
                action="Exit DBC Liquidity"
                allowed={true}
                note="Recovery-safe exit permitted in all risk states"
              />
              <ExecutionRow
                action="Borrow Credit"
                allowed={!isEmergency && !isDefensive && isMarketOpen}
                note={
                  isEmergency || isDefensive
                    ? `Blocked: Risk Ratchet is in ${riskState}`
                    : !isMarketOpen
                    ? "Blocked: NYSE underlying session is CLOSED"
                    : `Allowed up to $${borrowLimitUsd.toFixed(2)}`
                }
              />
              <ExecutionRow
                action="Enter DBC Liquidity"
                allowed={!isEmergency && !isDefensive}
                note={
                  isEmergency || isDefensive
                    ? `Blocked: Risk Ratchet is in ${riskState}`
                    : isRestricted
                    ? "Capped: 50% capacity cap in RESTRICTED state"
                    : "Allowed at 100% capacity"
                }
              />
              <ExecutionRow
                action="Withdraw Collateral"
                allowed={!isEmergency && !isDefensive}
                note={
                  isEmergency || isDefensive
                    ? "Blocked: Collateral withdrawal restricted when debt exists"
                    : "Allowed if Health Factor remains > protocol minimum"
                }
              />
            </div>
          </div>

          {/* 3. ACTIVE LIMITS & BOUNDS */}
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px" }}>
            <div style={{ fontSize: 11, fontFamily: "var(--mono)", fontWeight: 700, color: "var(--text-3)", marginBottom: 8 }}>
              3. DELEGATED LIMITS &amp; GOVERNANCE
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontFamily: "var(--mono)" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-2)" }}>Borrow Limit:</span>
                <span style={{ color: "var(--text)", fontWeight: 600 }}>${borrowLimitUsd.toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-2)" }}>DBC Slippage Clamp:</span>
                <span style={{ color: "var(--text)", fontWeight: 600 }}>10 – 200 bps (0.10% – 2.00%)</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-2)" }}>Authority Type:</span>
                <span style={{ color: "var(--text)", fontWeight: 600 }}>
                  {hasAuthority ? "Circuit Agent Authority PDA" : "Human Interactive Signer"}
                </span>
              </div>
              {agentAuthority?.pda && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-2)" }}>PDA Address:</span>
                  <span style={{ color: "#818cf8", fontWeight: 600 }}>{shortenAddress(agentAuthority.pda)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "7px 16px",
              background: "var(--surface-3, #27272a)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 12,
              fontFamily: "var(--mono)",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function CapabilityItem({ label, active }: { label: string; active: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, color: active ? "var(--text)" : "var(--text-3)" }}>
      <span style={{ color: active ? "var(--mint, #79c2a4)" : "var(--text-3)" }}>✓</span>
      <span>{label}</span>
    </div>
  );
}

function ExecutionRow({ action, allowed, note }: { action: string; allowed: boolean; note: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "6px 8px",
        background: "rgba(255,255,255,0.015)",
        borderRadius: 4,
        fontSize: 12,
        fontFamily: "var(--mono)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: allowed ? "var(--mint, #79c2a4)" : "var(--danger, #cf8b8b)", fontWeight: 700 }}>
          {allowed ? "✓" : "✕"}
        </span>
        <span style={{ color: "var(--text)", fontWeight: 600 }}>{action}</span>
      </div>
      <span style={{ color: allowed ? "var(--text-3)" : "var(--danger)", fontSize: 11 }}>
        {note}
      </span>
    </div>
  );
}
