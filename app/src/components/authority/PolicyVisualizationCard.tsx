/**
 * Circuit Protocol - Policy Visualization Card
 *
 * Visualizes the 4-quadrant delegated policy:
 * 1. Who is acting (Agent Pubkey)
 * 2. What they are allowed to do (Allowed Actions bitmask)
 * 3. Scope & Limits (Asset Scope, Borrow Limit, Risk Budget Bt)
 * 4. Real-time Circuit Protocol Gate (Safe -> Allowed vs Defensive -> Blocked)
 */

import React, { useMemo } from "react";
import { Card, Pill, Icon, DataRow } from "../ui";
import { useCircuitDomain } from "../../lib/domain/context";
import { formatMoney, shortenAddress } from "../../lib/format";
import { DEPLOYED_MARKETS } from "../../data/markets";

export function PolicyVisualizationCard({ assetSymbol }: { assetSymbol?: string }) {
  const {
    activeMarketKey,
    getAgentAuthorityForAsset,
    risk,
    controlMode,
    evaluatePermissionForAction,
    openAuthoritySetup,
  } = useCircuitDomain();

  const sym = (assetSymbol || activeMarketKey).toUpperCase();
  const authority = useMemo(() => getAgentAuthorityForAsset(sym), [getAgentAuthorityForAsset, sym]);

  const borrowPerm = useMemo(() => {
    return evaluatePermissionForAction("borrow", 100, sym);
  }, [evaluatePermissionForAction, sym]);

  const withdrawPerm = useMemo(() => {
    return evaluatePermissionForAction("withdraw", 100, sym);
  }, [evaluatePermissionForAction, sym]);

  const market = DEPLOYED_MARKETS.find((m) => m.symbol.toUpperCase() === sym);

  if (!authority.hasAuthority || authority.status === "NOT_CONFIGURED") {
    return (
      <Card>
        <div className="stack g-12">
          <div className="row between g-8" style={{ alignItems: "center" }}>
            <div className="row g-8" style={{ alignItems: "center" }}>
              <Icon name="shield" size={16} />
              <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "var(--mono)", letterSpacing: "0.04em" }}>
                DELEGATED CAPITAL POLICY — {sym}
              </span>
            </div>
            <Pill tone="neutral">NOT CONFIGURED</Pill>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.5 }}>
            No bounded agent authority is configured for {sym}. All execution operates under direct sovereign wallet authority.
          </div>
        </div>
      </Card>
    );
  }

  const riskTone =
    risk.ratchetState === "SAFE"
      ? "success"
      : risk.ratchetState === "RESTRICTED"
      ? "warning"
      : "danger";

  const authTone =
    authority.status === "ACTIVE"
      ? "success"
      : authority.status === "EXPIRED"
      ? "warning"
      : "danger";

  return (
    <Card>
      <div className="stack g-14">
        {/* Header */}
        <div
          className="row between g-8 wrap"
          style={{ paddingBottom: 12, borderBottom: "1px solid var(--border)", alignItems: "center" }}
        >
          <div>
            <div className="row g-8" style={{ alignItems: "center" }}>
              <Icon name="shield" size={16} />
              <h3
                style={{
                  margin: 0,
                  fontSize: 13,
                  fontWeight: 750,
                  fontFamily: "var(--mono)",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                Delegated Policy & Circuit Permissions
              </h3>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
              Asset Scope: <strong style={{ color: "var(--text-1)" }}>{sym}</strong> · Agent:{" "}
              <code style={{ color: "var(--text-2)" }}>
                {authority.agentAddress ? shortenAddress(authority.agentAddress, 4, 4) : "—"}
              </code>
            </div>
          </div>

          <div className="row g-8" style={{ alignItems: "center" }}>
            <Pill tone={riskTone} withDot>
              RATCHET: {risk.ratchetState}
            </Pill>
            <Pill tone={authTone} withDot>
              {authority.status}
            </Pill>
          </div>
        </div>

        {/* Policy & Permissions Table */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid var(--border)",
                  textAlign: "left",
                  color: "var(--text-3)",
                  fontSize: 10.5,
                  fontFamily: "var(--mono)",
                }}
              >
                <th style={{ padding: "6px 8px" }}>ACTION</th>
                <th style={{ padding: "6px 8px" }}>DELEGATED LIMIT</th>
                <th style={{ padding: "6px 8px" }}>AGENT POLICY</th>
                <th style={{ padding: "6px 8px" }}>CIRCUIT GATE</th>
                <th style={{ padding: "6px 8px", textAlign: "right" }}>RESULT</th>
              </tr>
            </thead>
            <tbody>
              {/* DEPOSIT */}
              <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.03)" }}>
                <td style={{ padding: "8px", fontWeight: 650 }}>DEPOSIT</td>
                <td style={{ padding: "8px", fontFamily: "var(--mono)", color: "var(--text-3)" }}>Uncapped</td>
                <td style={{ padding: "8px" }}>
                  <Pill tone={authority.allowedActions.deposit ? "neutral" : "danger"}>
                    {authority.allowedActions.deposit ? "ENABLED" : "DISABLED"}
                  </Pill>
                </td>
                <td style={{ padding: "8px", color: "var(--text-2)" }}>Unconditional</td>
                <td style={{ padding: "8px", textAlign: "right" }}>
                  <span style={{ color: "var(--success)", fontWeight: 700, fontFamily: "var(--mono)" }}>
                    ✓ ALLOWED
                  </span>
                </td>
              </tr>

              {/* BORROW */}
              <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.03)" }}>
                <td style={{ padding: "8px", fontWeight: 650 }}>BORROW</td>
                <td style={{ padding: "8px", fontFamily: "var(--mono)" }}>
                  ${formatMoney(authority.maxBorrowLimit)}
                </td>
                <td style={{ padding: "8px" }}>
                  <Pill tone={authority.allowedActions.borrow ? "success" : "danger"}>
                    {authority.allowedActions.borrow ? "ENABLED" : "DISABLED"}
                  </Pill>
                </td>
                <td style={{ padding: "8px", color: "var(--text-2)" }}>
                  {risk.ratchetState === "SAFE"
                    ? "Safe Market"
                    : risk.ratchetState === "RESTRICTED"
                    ? "Constrained (Throttled)"
                    : "Blocked by Containment"}
                </td>
                <td style={{ padding: "8px", textAlign: "right" }}>
                  {borrowPerm.allowed && authority.allowedActions.borrow ? (
                    <span style={{ color: "var(--success)", fontWeight: 700, fontFamily: "var(--mono)" }}>
                      ✓ ALLOWED
                    </span>
                  ) : (
                    <span
                      style={{ color: "var(--danger)", fontWeight: 700, fontFamily: "var(--mono)" }}
                      title={borrowPerm.message}
                    >
                      ✕ BLOCKED ({borrowPerm.reasonCode})
                    </span>
                  )}
                </td>
              </tr>

              {/* REPAY */}
              <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.03)" }}>
                <td style={{ padding: "8px", fontWeight: 650 }}>REPAY</td>
                <td style={{ padding: "8px", fontFamily: "var(--mono)", color: "var(--text-3)" }}>Uncapped</td>
                <td style={{ padding: "8px" }}>
                  <Pill tone={authority.allowedActions.repay ? "success" : "danger"}>
                    {authority.allowedActions.repay ? "ENABLED" : "DISABLED"}
                  </Pill>
                </td>
                <td style={{ padding: "8px", color: "var(--text-2)" }}>Solvency Protected</td>
                <td style={{ padding: "8px", textAlign: "right" }}>
                  <span style={{ color: "var(--success)", fontWeight: 700, fontFamily: "var(--mono)" }}>
                    ✓ ALLOWED
                  </span>
                </td>
              </tr>

              {/* WITHDRAW */}
              <tr>
                <td style={{ padding: "8px", fontWeight: 650 }}>WITHDRAW</td>
                <td style={{ padding: "8px", fontFamily: "var(--mono)" }}>
                  ${formatMoney(authority.maxWithdrawLimit)}
                </td>
                <td style={{ padding: "8px" }}>
                  <Pill tone={authority.allowedActions.withdraw ? "warning" : "neutral"}>
                    {authority.allowedActions.withdraw ? "ENABLED" : "DISABLED"}
                  </Pill>
                </td>
                <td style={{ padding: "8px", color: "var(--text-2)" }}>
                  {risk.ratchetState === "EMERGENCY" ? "Blocked in Emergency" : "LTV Safe"}
                </td>
                <td style={{ padding: "8px", textAlign: "right" }}>
                  {withdrawPerm.allowed && authority.allowedActions.withdraw ? (
                    <span style={{ color: "var(--success)", fontWeight: 700, fontFamily: "var(--mono)" }}>
                      ✓ ALLOWED
                    </span>
                  ) : (
                    <span
                      style={{ color: "var(--danger)", fontWeight: 700, fontFamily: "var(--mono)" }}
                      title={withdrawPerm.message}
                    >
                      ✕ BLOCKED ({withdrawPerm.reasonCode})
                    </span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Dynamic Risk Budget and Status summary */}
        <div
          style={{
            padding: "8px 12px",
            borderRadius: 6,
            background: "rgba(255, 255, 255, 0.02)",
            border: "1px solid var(--border-subtle, rgba(255,255,255,0.05))",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 8,
            fontSize: 11.5,
          }}
        >
          <div>
            <span style={{ color: "var(--text-3)" }}>Dynamic Risk Budget (Bt): </span>
            <strong className="mono" style={{ color: "var(--text-1)" }}>
              ${formatMoney(authority.riskBudget)}
            </strong>{" "}
            <span style={{ color: "var(--text-3)" }}>/ ${formatMoney(authority.initialRiskBudget)}</span>
          </div>

          <div style={{ color: "var(--text-3)" }}>
            Expiry:{" "}
            <span style={{ color: "var(--text-2)" }}>
              {authority.expiryTs === 0 ? "Perpetual (No Expiry)" : new Date(authority.expiryTs * 1000).toUTCString()}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
