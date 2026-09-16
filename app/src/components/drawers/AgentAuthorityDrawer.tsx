/**
 * Circuit Protocol - Agent Authority Drawer
 *
 * Displays on-chain bounded delegation parameters for autonomous stock strategies,
 * including current Risk Ratchet state, effective capital authority, and owner revocation.
 */

import React, { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { Drawer } from "../ui/Drawer";
import { Pill, Button, Icon, DataRow, Notice } from "../ui";
import { AgentAuthorityDomainState, RiskRatchetState } from "../../lib/domain/types";
import { shortenAddress, formatMoney } from "../../lib/format";
import { useCircuitDomain } from "../../lib/domain/context";

export function AgentAuthorityDrawer({
  authority,
  riskState,
  open,
  onClose,
  onRevoke,
}: {
  authority: AgentAuthorityDomainState | null;
  riskState: RiskRatchetState;
  open: boolean;
  onClose: () => void;
  onRevoke?: (assetSymbol: string) => void;
}) {
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const { revokeAuthorityOnChain, revokeAgentAuthority } = useCircuitDomain();

  if (!authority) return null;

  const authorityTone =
    authority.effectiveAuthority === "FULL"
      ? "success"
      : authority.effectiveAuthority === "LIMITED"
      ? "warning"
      : "danger";

  const riskTone =
    riskState === "SAFE"
      ? "success"
      : riskState === "RESTRICTED"
      ? "warning"
      : "danger";

  const handleRevoke = async () => {
    if (!authority) return;
    setRevoking(true);
    setRevokeError(null);
    try {
      if (authority.agentAddress && authority.assetMint) {
        await revokeAuthorityOnChain(
          new PublicKey(authority.agentAddress),
          new PublicKey(authority.assetMint)
        );
      }
      revokeAgentAuthority(authority.assetSymbol);
      onRevoke?.(authority.assetSymbol);
      onClose();
    } catch (err: any) {
      console.error("Revocation failed:", err);
      setRevokeError(err?.message || "Failed to revoke on-chain authority on Devnet");
    } finally {
      setRevoking(false);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Autonomous Strategy"
      subtitle={`${authority.assetSymbol} Bounded Capital Authority`}
      badge={<Pill tone={authorityTone} withDot>{authority.status}</Pill>}
    >
      <div className="stack g-16">
        {/* Core Strategy Overview Card */}
        <div
          style={{
            padding: 16,
            background: "var(--surface-2, #0d0f15)",
            borderRadius: "var(--r, 10px)",
            border: "1px solid var(--border, #1a1d26)",
          }}
          className="stack g-12"
        >
          <div className="row between g-8" style={{ alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{authority.strategyName}</div>
              <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                Controlled Autonomous Stock Agent
              </div>
            </div>
            <Pill tone={authorityTone}>{authority.status}</Pill>
          </div>

          <div
            style={{
              padding: "10px 12px",
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid var(--border-subtle, rgba(255,255,255,0.05))",
              borderRadius: "var(--r-sm, 6px)",
              fontSize: 12,
              lineHeight: 1.5,
              color: "var(--text-2)",
            }}
          >
            "Agents decide what to do. Circuit decides what capital they are allowed to risk."
          </div>
        </div>

        {/* Capital & Permission Parameters */}
        <div
          style={{
            padding: 16,
            background: "var(--surface-2, #0d0f15)",
            borderRadius: "var(--r, 10px)",
            border: "1px solid var(--border, #1a1d26)",
          }}
          className="stack g-10"
        >
          <div className="t-label" style={{ marginBottom: 4 }}>
            Delegation Policy & Limits
          </div>

          <DataRow
            label="Asset Scope"
            value={<span style={{ fontWeight: 600 }}>{authority.assetSymbol}</span>}
          />
          <DataRow
            label="Authorized Agent"
            value={
              <span className="mono" style={{ fontSize: 12 }}>
                {authority.agentAddress ? shortenAddress(authority.agentAddress, 6, 6) : "Delegated Key"}
              </span>
            }
          />
          <DataRow
            label="Owner / Delegator"
            value={
              <span className="mono" style={{ fontSize: 12 }}>
                {authority.ownerAddress ? shortenAddress(authority.ownerAddress, 6, 6) : "Connected Wallet"}
              </span>
            }
          />
          <DataRow
            label="Allowed Actions"
            value={
              <div className="row g-6">
                {authority.allowedActions.borrow && (
                  <Pill tone="success">
                    BORROW
                  </Pill>
                )}
                {authority.allowedActions.repay && (
                  <Pill tone="success">
                    REPAY
                  </Pill>
                )}
                {authority.allowedActions.deposit && (
                  <Pill tone="neutral">
                    DEPOSIT
                  </Pill>
                )}
                {authority.allowedActions.withdraw && (
                  <Pill tone="neutral">
                    WITHDRAW
                  </Pill>
                )}
                {!authority.allowedActions.withdraw && (
                  <Pill tone="neutral">
                    WITHDRAW: OFF
                  </Pill>
                )}
              </div>
            }
          />
          <DataRow
            label="Max Borrow Limit"
            value={<span className="mono">{formatMoney(authority.maxBorrowLimit)}</span>}
          />
          <DataRow
            label="Current Borrowed"
            value={<span className="mono">{formatMoney(authority.currentBorrowed)}</span>}
          />
          <DataRow
            label="Dynamic Risk Budget (Bt)"
            value={<span className="mono">{formatMoney(authority.riskBudget)}</span>}
          />
          <DataRow
            label="Delegation Expiry"
            value={<span>{authority.expiryTs === 0 ? "Perpetual (No Expiry)" : "Active Window"}</span>}
          />
        </div>

        {/* Current Risk State & Effective Authority */}
        <div
          style={{
            padding: 16,
            background: "var(--surface-2, #0d0f15)",
            borderRadius: "var(--r, 10px)",
            border: "1px solid var(--border, #1a1d26)",
          }}
          className="stack g-10"
        >
          <div className="t-label" style={{ marginBottom: 4 }}>
            Risk-Adaptive Control Plane
          </div>

          <DataRow
            label="Protocol Risk Ratchet"
            value={
              <Pill tone={riskTone} withDot>
                {riskState}
              </Pill>
            }
          />
          <DataRow
            label="Effective Authority"
            value={
              <Pill tone={authorityTone} withDot>
                {authority.effectiveAuthority}
              </Pill>
            }
          />
          <DataRow
            label="Available Borrow to Agent"
            value={
              <span className="mono" style={{ fontWeight: 700, color: "var(--accent)" }}>
                {formatMoney(authority.availableBorrow)}
              </span>
            }
          />

          <div
            style={{
              marginTop: 6,
              fontSize: 12,
              color: "var(--text-3)",
              lineHeight: 1.5,
              padding: "8px 10px",
              background: "rgba(0,0,0,0.2)",
              borderRadius: "var(--r-sm, 6px)",
            }}
          >
            {authority.effectiveAuthority === "FULL"
              ? "Strategy holds standard bounded borrow capacity under SAFE market conditions."
              : authority.effectiveAuthority === "LIMITED"
              ? "Strategy borrowing is constrained by Risk Ratchet RESTRICTED state. Additional credit is throttled."
              : "Strategy borrowing is BLOCKED by DEFENSIVE / EMERGENCY protocol containment or revocation."}
          </div>
        </div>

        {/* Owner Revocation Action */}
        <div style={{ marginTop: 8 }} className="stack g-8">
          {revokeError && (
            <Notice tone="danger" title="Revocation Failed">
              {revokeError}
            </Notice>
          )}
          <Button
            variant="danger"
            block
            loading={revoking}
            disabled={authority.status === "REVOKED"}
            onClick={handleRevoke}
            icon="close"
          >
            {authority.status === "REVOKED" ? "Authority Revoked" : "Revoke Strategy Authority"}
          </Button>
          <span style={{ fontSize: 11, color: "var(--text-3)", textAlign: "center" }}>
            Owner can revoke agent authority at any time onchain. Does not affect position collateral.
          </span>
        </div>
      </div>
    </Drawer>
  );
}
