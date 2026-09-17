/**
 * Circuit Protocol - Autonomous Strategy Authority Card
 *
 * Sovereign Delegation Control Center on Solana Devnet.
 * Reads real on-chain AgentAuthority PDAs, provides real transaction-based revocation,
 * and displays true bounded execution parameters. Zero fake identities.
 */

import React, { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useNavigate } from "react-router-dom";
import { Card, Button, Pill, Icon, Notice } from "../ui";
import { useCircuitDomain } from "../../lib/domain/context";
import { shortenAddress, formatMoney } from "../../lib/format";
import { DEPLOYED_MARKETS } from "../../data/markets";
import { OnChainAgentAuthority } from "../../lib/agentAuthority";

export function AutonomousAuthorityCard() {
  const navigate = useNavigate();
  const {
    controlMode,
    setControlMode,
    hasActiveAuthority,
    onChainAuthorities,
    authoritiesLoading,
    revokeAuthorityOnChain,
    refreshAuthorities,
  } = useCircuitDomain();

  const [revokingPda, setRevokingPda] = useState<string | null>(null);
  const [revokeSuccessSig, setRevokeSuccessSig] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const handleRevoke = async (auth: OnChainAgentAuthority) => {
    setRevokingPda(auth.pda.toBase58());
    setRevokeError(null);
    setRevokeSuccessSig(null);
    try {
      const sig = await revokeAuthorityOnChain(auth.agent, auth.assetMint);
      setRevokeSuccessSig(sig);
      await refreshAuthorities();
    } catch (err: any) {
      console.error("Revocation failed:", err);
      setRevokeError(err?.message || "Failed to execute revocation on Devnet.");
    } finally {
      setRevokingPda(null);
    }
  };

  const getMarketSymbol = (mint: PublicKey): string => {
    const market = DEPLOYED_MARKETS.find((m) => m.mint === mint.toBase58());
    return market ? market.symbol : shortenAddress(mint.toBase58(), 4, 4);
  };

  return (
    <Card>
      <div className="stack g-16">
        {/* Header Section */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            paddingBottom: 16,
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                background: "rgba(100, 180, 255, 0.08)",
                border: "1px solid rgba(100, 180, 255, 0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon name="verify" size={20} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h3
                  style={{
                    margin: 0,
                    fontSize: 15,
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    fontFamily: "var(--mono)",
                    textTransform: "uppercase",
                  }}
                >
                  Autonomous Agent Access
                </h3>
                <Pill
                  tone={
                    hasActiveAuthority
                      ? "success"
                      : onChainAuthorities.length > 0
                      ? "warning"
                      : "neutral"
                  }
                  withDot={hasActiveAuthority}
                >
                  {hasActiveAuthority
                    ? "ACTIVE ONCHAIN"
                    : onChainAuthorities.length > 0
                    ? "INACTIVE / EXPIRED"
                    : "NOT CONFIGURED"}
                </Pill>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 2 }}>
                Sovereign delegated execution bounded by your risk limits and market conditions.
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Button
              variant="secondary"
              size="sm"
              icon="shield"
              onClick={() => navigate("/app/autonomous?tab=permissions")}
            >
              Configure Agent Access
            </Button>
          </div>
        </div>

        {/* Notices */}
        {revokeSuccessSig && (
          <Notice tone="success" title="Agent Access Revoked On-Chain">
            Transaction confirmed on Solana Devnet:{" "}
            <a
              href={`https://explorer.solana.com/tx/${revokeSuccessSig}?cluster=devnet`}
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--mint)", textDecoration: "underline", fontFamily: "var(--mono)", fontSize: 11.5 }}
            >
              {shortenAddress(revokeSuccessSig, 8, 8)} ↗
            </a>
          </Notice>
        )}

        {revokeError && (
          <Notice tone="danger" title="Revocation Error">
            {revokeError}
          </Notice>
        )}

        {/* Core Principles Banner */}
        <div
          style={{
            padding: "10px 14px",
            background: "rgba(255, 255, 255, 0.02)",
            border: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
            borderRadius: "var(--r-sm, 6px)",
            fontSize: 12,
            color: "var(--text-2)",
            lineHeight: 1.5,
          }}
        >
          <strong style={{ color: "var(--text-1)" }}>Protocol Principle:</strong> Manual execution is the foundation of Circuit. Autonomous mode delegates strictly bounded execution rights via on-chain agent access. The agent can never withdraw your collateral to an arbitrary address and cannot bypass your risk limits.
        </div>

        {/* On-Chain Authorities List */}
        {authoritiesLoading ? (
          <div style={{ padding: "20px 0", textAlign: "center", color: "var(--text-3)", fontSize: 12 }}>
            <Icon name="spinner" size={16} spin /> Checking on-chain agent access...
          </div>
        ) : onChainAuthorities.length === 0 ? (
          <div
            style={{
              padding: "24px 16px",
              textAlign: "center",
              background: "var(--surface-2)",
              borderRadius: "var(--r-sm, 6px)",
              border: "1px dashed var(--border)",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-2)", marginBottom: 4 }}>
              No Active Agent Access
            </div>
            <div style={{ fontSize: 12, color: "var(--text-3)", maxWidth: 520, margin: "0 auto 16px auto", lineHeight: 1.4 }}>
              Your wallet is operating in Manual mode. You have not granted agent access on Devnet. To delegate bounded execution within safe limits, click below.
            </div>
            <Button variant="accent" size="sm" onClick={() => navigate("/app/autonomous?tab=permissions")} icon="shield">
              Configure Agent Access
            </Button>
          </div>
        ) : (
          <div className="stack g-12">
            <div
              style={{
                fontSize: 11,
                fontFamily: "var(--mono)",
                color: "var(--text-3)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Active Agent Access Delegations ({onChainAuthorities.length})
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead>
                  <tr
                    style={{
                      borderBottom: "1px solid var(--border)",
                      textAlign: "left",
                      color: "var(--text-3)",
                      fontSize: 11,
                      fontFamily: "var(--mono)",
                    }}
                  >
                    <th style={{ padding: "8px 10px" }}>ASSET SCOPE</th>
                    <th style={{ padding: "8px 10px" }}>AGENT KEY</th>
                    <th style={{ padding: "8px 10px" }}>PERMITTED ACTIONS</th>
                    <th style={{ padding: "8px 10px" }}>BORROW LIMIT</th>
                    <th style={{ padding: "8px 10px" }}>RISK BUDGET</th>
                    <th style={{ padding: "8px 10px" }}>STATUS</th>
                    <th style={{ padding: "8px 10px", textAlign: "right" }}>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {onChainAuthorities.map((auth) => {
                    const sym = getMarketSymbol(auth.assetMint);
                    const isRevoking = revokingPda === auth.pda.toBase58();
                    const statusTone =
                      auth.status === "ACTIVE"
                        ? "success"
                        : auth.status === "EXPIRED"
                        ? "warning"
                        : "danger";

                    return (
                      <tr
                        key={auth.pda.toBase58()}
                        style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.04)" }}
                      >
                        <td style={{ padding: "10px", fontWeight: 700 }}>
                          <span style={{ color: "var(--mint)" }}>{sym}</span>
                        </td>
                        <td style={{ padding: "10px", fontFamily: "var(--mono)", fontSize: 11.5 }}>
                          <a
                            href={`https://explorer.solana.com/address/${auth.agent.toBase58()}?cluster=devnet`}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: "var(--text-2)", textDecoration: "underline" }}
                            title={auth.agent.toBase58()}
                          >
                            {shortenAddress(auth.agent.toBase58(), 4, 4)}
                          </a>
                        </td>
                        <td style={{ padding: "10px" }}>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {auth.allowedActions.borrow && (
                              <Pill tone="success">BORROW</Pill>
                            )}
                            {auth.allowedActions.repay && (
                              <Pill tone="success">REPAY</Pill>
                            )}
                            {auth.allowedActions.deposit && (
                              <Pill tone="neutral">DEPOSIT</Pill>
                            )}
                            {auth.allowedActions.withdraw && (
                              <Pill tone="warning">WITHDRAW</Pill>
                            )}
                            {!auth.allowedActions.borrow &&
                              !auth.allowedActions.repay &&
                              !auth.allowedActions.deposit &&
                              !auth.allowedActions.withdraw && (
                                <span style={{ color: "var(--text-3)", fontSize: 11 }}>None (Revoked)</span>
                              )}
                          </div>
                        </td>
                        <td style={{ padding: "10px", fontFamily: "var(--mono)" }}>
                          ${formatMoney(auth.maxBorrowLimitUi)}
                        </td>
                        <td style={{ padding: "10px", fontFamily: "var(--mono)" }}>
                          ${formatMoney(auth.riskBudgetUi)}
                        </td>
                        <td style={{ padding: "10px" }}>
                          <Pill tone={statusTone} withDot={auth.status === "ACTIVE"}>
                            {auth.status}
                          </Pill>
                        </td>
                        <td style={{ padding: "10px", textAlign: "right" }}>
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={auth.isRevoked || isRevoking}
                            loading={isRevoking}
                            onClick={() => handleRevoke(auth)}
                          >
                            {auth.isRevoked ? "Revoked" : "Revoke"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
