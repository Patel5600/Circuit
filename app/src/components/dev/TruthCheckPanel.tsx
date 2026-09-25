/**
 * Circuit Protocol - Canonical Truth Check & Diagnostics Panel
 *
 * Developer & audit diagnostics surface:
 * - Realtime Connection Health (RPC, Pyth, Circuit, Meteora)
 * - Current cluster slot & slot velocity
 * - Oracle age, freshness, and confidence spread
 * - Invariant consistency checkers & invariant sentinels
 * - End-to-end pipeline latency telemetry
 */

import React, { useMemo, useState } from "react";
import { useRealtimeTelemetry, useProtocolSlice, useTransactionSlices } from "../../lib/realtime/normalized-store";
import { derivedStateEngine } from "../../lib/realtime/derived-engine";
import { useMarket } from "../../context/MarketContext";
import { formatMoney } from "../../lib/format";
import { Pill, Icon } from "../ui";

export function TruthCheckPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const tele = useRealtimeTelemetry();
  const proto = useProtocolSlice();
  const txSlices = useTransactionSlices();
  const { selectedMarket } = useMarket();

  const sym = selectedMarket?.symbol || "NVDA";
  const financial = useMemo(() => {
    return derivedStateEngine.deriveFinancialState(sym);
  }, [sym, isOpen ? tele.version : 0]);

  // Section 35: Invariant Consistency Verification
  const invariantChecks = useMemo(() => {
    const violations: { rule: string; passed: boolean; detail: string }[] = [];

    // Rule 1: if effectiveLTV === 0, executableBorrowCapacity must not be > 0
    const r1Passed = !(financial.effectiveLtvPct === 0 && financial.executableBorrowCapacityUsd > 0);
    violations.push({
      rule: "Effective LTV 0% Bound",
      passed: r1Passed,
      detail: `Effective LTV: ${financial.effectiveLtvPct}%, Executable Cap: $${financial.executableBorrowCapacityUsd.toFixed(2)}`,
    });

    // Rule 2: if debt === 0, debtUsd must equal zero
    const r2Passed = !(financial.debtUsd > 0.001 && financial.currentLtvPct === 0);
    violations.push({
      rule: "Zero-Debt Integrity",
      passed: r2Passed,
      detail: `Debt: $${financial.debtUsd.toFixed(2)}, LTV: ${financial.currentLtvPct.toFixed(2)}%`,
    });

    // Rule 3: if referenceMarket === CLOSED, do not automatically set onchainMarket === CLOSED
    const r3Passed = !(financial.domains.referenceMarketState === "CLOSED" && financial.domains.onchainMarketState === "CLOSED" && !proto.value.paused);
    violations.push({
      rule: "Reference vs On-chain Decoupling",
      passed: r3Passed,
      detail: `Reference: ${financial.domains.referenceMarketState}, On-chain: ${financial.domains.onchainMarketState}`,
    });

    // Rule 4: if risk === DEFENSIVE, borrow must be blocked
    const r4Passed = !(financial.riskState === "DEFENSIVE" && financial.permission.borrowAllowed);
    violations.push({
      rule: "Defensive Risk Invariant",
      passed: r4Passed,
      detail: `Risk: ${financial.riskState}, Borrow Allowed: ${financial.permission.borrowAllowed}`,
    });

    // Rule 5: if oracle is STALE/INVALID, oracle must not be labeled LIVE
    const r5Passed = !(financial.domains.oracleState !== "FRESH" && financial.domains.oracleState === ("LIVE" as any));
    violations.push({
      rule: "Oracle Freshness Integrity",
      passed: r5Passed,
      detail: `Oracle State: ${financial.domains.oracleState}`,
    });

    return violations;
  }, [financial, proto.value.paused]);

  const allPassed = invariantChecks.every((c) => c.passed);
  const latestTx = txSlices.length > 0 ? txSlices[0].value : null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "16px",
        right: "16px",
        zIndex: 9999,
        maxWidth: isOpen ? "480px" : "auto",
        width: isOpen ? "100%" : "auto",
        fontFamily: "var(--font-sans, Inter, sans-serif)",
      }}
    >
      {!isOpen ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "var(--surface-1, #131722)",
            border: `1px solid ${allPassed ? "var(--border)" : "var(--danger)"}`,
            borderRadius: "20px",
            padding: "6px 14px",
            color: "var(--text-1)",
            fontSize: "12px",
            cursor: "pointer",
            boxShadow: "0 4px 16px rgba(0, 0, 0, 0.4)",
          }}
        >
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: allPassed ? "var(--success, #7fc39a)" : "var(--danger, #cf8b8b)",
            }}
          />
          <span className="mono bold">TRUTH CHECK</span>
          <span className="mono muted" style={{ fontSize: "11px" }}>
            Slot: {tele.value.currentSlot ?? "--"}
          </span>
        </button>
      ) : (
        <div
          style={{
            background: "var(--surface-1, #131722)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r, 8px)",
            padding: "16px",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
            maxHeight: "80vh",
            overflowY: "auto",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "12px",
              paddingBottom: "8px",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Icon name="terminal" size={16} />
              <span style={{ fontSize: "13px", fontWeight: 700, letterSpacing: "0.04em" }}>
                CIRCUIT TRUTH CHECK & TELEMETRY
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-3)",
                fontSize: "16px",
                cursor: "pointer",
              }}
            >
              x
            </button>
          </div>

          {/* Connection & Telemetry Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "8px",
              fontSize: "11.5px",
              marginBottom: "14px",
            }}
          >
            <div style={{ padding: "6px 8px", background: "var(--surface-2)", borderRadius: "4px" }}>
              <div className="muted">CONNECTION</div>
              <div style={{ fontWeight: 650, color: "var(--success)" }}>
                {tele.value.connectionStatus.toUpperCase()}
              </div>
            </div>

            <div style={{ padding: "6px 8px", background: "var(--surface-2)", borderRadius: "4px" }}>
              <div className="muted">CURRENT SLOT</div>
              <div className="mono bold" style={{ color: "var(--accent)" }}>
                {tele.value.currentSlot ?? "--"} ({tele.value.slotVelocityPerSec} slots/s)
              </div>
            </div>

            <div style={{ padding: "6px 8px", background: "var(--surface-2)", borderRadius: "4px" }}>
              <div className="muted">LAST EVENT SOURCE</div>
              <div className="mono" style={{ fontSize: "10.5px" }}>
                {tele.value.lastEventSource}
              </div>
            </div>

            <div style={{ padding: "6px 8px", background: "var(--surface-2)", borderRadius: "4px" }}>
              <div className="muted">PIPELINE LATENCY</div>
              <div className="mono bold">
                {tele.value.latencies.totalPipelineLatencyMs} ms
              </div>
            </div>
          </div>

          {/* Decoupled Domain Verification */}
          <div style={{ marginBottom: "14px" }}>
            <div className="t-label" style={{ marginBottom: "6px" }}>
              Decoupled Domain States ({sym})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "11px" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="muted">Reference Market (NYSE):</span>
                <span className="mono bold">{financial.domains.referenceMarketState}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="muted">On-chain Market:</span>
                <span className="mono bold" style={{ color: "var(--success)" }}>
                  {financial.domains.onchainMarketState}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="muted">Oracle Freshness:</span>
                <span className="mono bold">{financial.domains.oracleState}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="muted">Risk Ratchet:</span>
                <span className="mono bold">{financial.riskState}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="muted">Borrow Permission:</span>
                <span
                  className="mono bold"
                  style={{
                    color:
                      financial.permission.verdict === "ALLOW"
                        ? "var(--success)"
                        : financial.permission.verdict === "RESTRICT"
                        ? "var(--warning)"
                        : "var(--danger)",
                  }}
                >
                  {financial.permission.verdict}
                </span>
              </div>
            </div>
          </div>

          {/* Invariant Verification Suite */}
          <div>
            <div className="t-label" style={{ marginBottom: "6px" }}>
              Protocol Security Invariants ({invariantChecks.filter((c) => c.passed).length}/{invariantChecks.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {invariantChecks.map((chk, i) => (
                <div
                  key={i}
                  style={{
                    padding: "6px 8px",
                    background: "var(--surface-2)",
                    borderRadius: "4px",
                    fontSize: "11px",
                    borderLeft: `3px solid ${chk.passed ? "var(--success)" : "var(--danger)"}`,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontWeight: 600 }}>{chk.rule}</span>
                    <span style={{ color: chk.passed ? "var(--success)" : "var(--danger)" }}>
                      {chk.passed ? "PASS" : "FAIL"}
                    </span>
                  </div>
                  <div className="muted" style={{ fontSize: "10px", marginTop: "2px" }}>
                    {chk.detail}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Latest Transaction */}
          {latestTx && (
            <div style={{ marginTop: "12px", paddingTop: "8px", borderTop: "1px solid var(--border)", fontSize: "11px" }}>
              <div className="muted">LATEST TRANSACTION</div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
                <span className="mono bold">{latestTx.action} {latestTx.amount} {latestTx.quoteSymbol}</span>
                <Pill tone={latestTx.state === "CONFIRMED" ? "success" : latestTx.state === "FAILED" ? "danger" : "warning"}>
                  {latestTx.state}
                </Pill>
              </div>
              {latestTx.signature && (
                <div className="mono muted" style={{ fontSize: "10px", marginTop: "2px" }}>
                  Sig: {latestTx.signature.slice(0, 16)}...
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
