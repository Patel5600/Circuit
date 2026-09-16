/**
 * Circuit Protocol - Autonomous Control Authority Setup Drawer
 *
 * Real on-chain delegated authority configurator for Solana Devnet.
 * Configures bounded strategy policy, signs with owner wallet, and creates
 * the canonical AgentAuthority PDA on-chain.
 * Zero simulation, zero fake identities, zero private key requests.
 */

import React, { useState, useMemo } from "react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Drawer } from "../ui/Drawer";
import { Button, Pill, Icon, Notice } from "../ui";
import { DEPLOYED_MARKETS } from "../../data/markets";
import {
  CIRCUIT_DEVNET_AGENT_KEY,
  AllowedActionsMask,
  buildCreateAgentAuthorityInstruction,
  deriveAgentAuthorityPda,
} from "../../lib/agentAuthority";
import { useCircuitDomain } from "../../lib/domain/context";
import { shortenAddress } from "../../lib/format";

export function AutonomousSetupModal({
  open,
  onClose,
  initialMint,
}: {
  open: boolean;
  onClose: () => void;
  initialMint?: string;
}) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { refreshAuthorities, setControlMode } = useCircuitDomain();

  // Form state
  const [selectedMint, setSelectedMint] = useState<string>(() => {
    return initialMint || DEPLOYED_MARKETS[0].mint;
  });
  const [agentPubkeyStr, setAgentPubkeyStr] = useState<string>(
    CIRCUIT_DEVNET_AGENT_KEY.toBase58()
  );
  const [actions, setActions] = useState<AllowedActionsMask>({
    deposit: false,
    borrow: true,
    repay: true,
    withdraw: false,
  });
  const [borrowLimitUsd, setBorrowLimitUsd] = useState<string>("500");
  const [withdrawLimitShares, setWithdrawLimitShares] = useState<string>("10");
  const [riskBudgetUsd, setRiskBudgetUsd] = useState<string>("500");
  const [expiryOption, setExpiryOption] = useState<"24h" | "7d" | "30d" | "none">("7d");

  // Flow state: "CONFIG" | "SIGNING" | "CONFIRMING" | "SUCCESS" | "ERROR"
  const [flowState, setFlowState] = useState<
    "CONFIG" | "SIGNING" | "CONFIRMING" | "SUCCESS" | "ERROR"
  >("CONFIG");
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedMarket = useMemo(() => {
    return DEPLOYED_MARKETS.find((m) => m.mint === selectedMint) || DEPLOYED_MARKETS[0];
  }, [selectedMint]);

  // Validate agent pubkey
  const parsedAgentKey = useMemo<PublicKey | null>(() => {
    try {
      return new PublicKey(agentPubkeyStr.trim());
    } catch {
      return null;
    }
  }, [agentPubkeyStr]);

  const pdaAddress = useMemo(() => {
    if (!publicKey || !parsedAgentKey) return null;
    try {
      const [pda] = deriveAgentAuthorityPda(
        publicKey,
        parsedAgentKey,
        new PublicKey(selectedMarket.mint)
      );
      return pda.toBase58();
    } catch {
      return null;
    }
  }, [publicKey, parsedAgentKey, selectedMarket.mint]);

  const expirySeconds = useMemo(() => {
    switch (expiryOption) {
      case "24h":
        return 86400;
      case "7d":
        return 86400 * 7;
      case "30d":
        return 86400 * 30;
      case "none":
        return 0;
    }
  }, [expiryOption]);

  const handleCreate = async () => {
    if (!publicKey || !parsedAgentKey) return;
    setFlowState("SIGNING");
    setErrorMessage(null);

    try {
      const { instruction } = await buildCreateAgentAuthorityInstruction(connection, {
        owner: publicKey,
        agent: parsedAgentKey,
        assetMint: new PublicKey(selectedMarket.mint),
        allowedActions: actions,
        maxBorrowLimitUi: parseFloat(borrowLimitUsd) || 0,
        maxWithdrawLimitUi: parseFloat(withdrawLimitShares) || 0,
        riskBudgetUi: parseFloat(riskBudgetUsd) || 0,
        expirySecondsFromNow: expirySeconds,
      });

      const tx = new Transaction().add(instruction);
      tx.feePayer = publicKey;
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;

      setFlowState("CONFIRMING");
      const sig = await sendTransaction(tx, connection);
      setTxSignature(sig);

      await connection.confirmTransaction(
        { signature: sig, blockhash, lastValidBlockHeight },
        "confirmed"
      );

      // Chain confirmed: refresh domain state and activate mode
      await refreshAuthorities();
      setFlowState("SUCCESS");
      setControlMode("AUTONOMOUS");
    } catch (err: any) {
      console.error("Authority creation failed:", err);
      setErrorMessage(err?.message || String(err));
      setFlowState("ERROR");
    }
  };

  const handleReset = () => {
    setFlowState("CONFIG");
    setErrorMessage(null);
    setTxSignature(null);
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Autonomous Control"
      subtitle="Bounded Capital Authority Setup"
      badge={<Pill tone="accent">DEVNET PDA</Pill>}
      width={480}
    >
      <div className="stack g-16" style={{ paddingBottom: 20 }}>
        {/* Core Product Principle Banner */}
        <div
          style={{
            padding: "12px 14px",
            background: "rgba(236, 234, 230, 0.03)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r)",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 650, color: "var(--text)" }}>
            Delegate Execution. Retain Final Capital Authority.
          </div>
          <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 4, lineHeight: 1.5 }}>
            An autonomous strategy receives bounded permission to execute on your behalf.
            Circuit's on-chain Risk Ratchet and MarketGuard enforce safety bounds at all times.
          </div>
        </div>

        {flowState === "CONFIG" && (
          <>
            {/* Step 1: Agent Public Key */}
            <div className="stack g-8">
              <label className="t-label" style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Agent Wallet (Public Key)</span>
                <button
                  type="button"
                  onClick={() => setAgentPubkeyStr(CIRCUIT_DEVNET_AGENT_KEY.toBase58())}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--mint, #79c2a4)",
                    fontSize: 11,
                    cursor: "pointer",
                    textDecoration: "underline",
                    padding: 0,
                  }}
                >
                  Use Devnet Sentinel
                </button>
              </label>
              <input
                type="text"
                value={agentPubkeyStr}
                onChange={(e) => setAgentPubkeyStr(e.target.value)}
                placeholder="Solana Agent Public Key..."
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  background: "var(--surface-2)",
                  border: `1px solid ${parsedAgentKey ? "var(--border)" : "var(--danger)"}`,
                  borderRadius: "var(--r-sm)",
                  color: "var(--text)",
                  fontFamily: "var(--mono)",
                  fontSize: 12,
                }}
              />
              {!parsedAgentKey && agentPubkeyStr.length > 0 && (
                <div style={{ fontSize: 11, color: "var(--danger)" }}>
                  Invalid Solana public key format
                </div>
              )}
            </div>

            {/* Step 2: Asset Scope */}
            <div className="stack g-8">
              <label className="t-label">Asset Scope</label>
              <select
                value={selectedMint}
                onChange={(e) => setSelectedMint(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r-sm)",
                  color: "var(--text)",
                  fontFamily: "var(--sans)",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {DEPLOYED_MARKETS.map((m) => (
                  <option key={m.mint} value={m.mint}>
                    {m.tokenSymbol} ({m.name}) · {m.quoteSymbol}
                  </option>
                ))}
              </select>
            </div>

            {/* Step 3: Allowed Actions Bitmask */}
            <div className="stack g-8">
              <label className="t-label">Allowed Action Permissions</label>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                }}
              >
                {(["borrow", "repay", "deposit", "withdraw"] as const).map((act) => {
                  const isChecked = actions[act];
                  return (
                    <button
                      key={act}
                      type="button"
                      onClick={() =>
                        setActions((prev) => ({ ...prev, [act]: !prev[act] }))
                      }
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 12px",
                        background: isChecked ? "rgba(121, 194, 164, 0.08)" : "var(--surface-2)",
                        border: `1px solid ${isChecked ? "var(--mint, #79c2a4)" : "var(--border)"}`,
                        borderRadius: "var(--r-sm)",
                        color: isChecked ? "var(--text)" : "var(--text-3)",
                        cursor: "pointer",
                        textTransform: "uppercase",
                        fontSize: 12,
                        fontWeight: 650,
                        fontFamily: "var(--mono)",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <span>{act}</span>
                      <Icon name={isChecked ? "check" : "close"} size={14} />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 4: Policy Limits & Risk Budget */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <div className="stack g-6">
                <label className="t-label">Max Borrow Limit ($)</label>
                <input
                  type="number"
                  value={borrowLimitUsd}
                  onChange={(e) => setBorrowLimitUsd(e.target.value)}
                  placeholder="500"
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--r-sm)",
                    color: "var(--text)",
                    fontFamily: "var(--mono)",
                    fontSize: 13,
                  }}
                />
              </div>
              <div className="stack g-6">
                <label className="t-label">Risk Budget ($)</label>
                <input
                  type="number"
                  value={riskBudgetUsd}
                  onChange={(e) => setRiskBudgetUsd(e.target.value)}
                  placeholder="500"
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--r-sm)",
                    color: "var(--text)",
                    fontFamily: "var(--mono)",
                    fontSize: 13,
                  }}
                />
              </div>
            </div>

            {/* Step 5: Expiry */}
            <div className="stack g-8">
              <label className="t-label">Authority Expiry</label>
              <div style={{ display: "flex", gap: 8 }}>
                {(
                  [
                    { id: "24h", label: "24 Hours" },
                    { id: "7d", label: "7 Days" },
                    { id: "30d", label: "30 Days" },
                    { id: "none", label: "Perpetual" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setExpiryOption(opt.id)}
                    style={{
                      flex: 1,
                      padding: "8px 0",
                      background: expiryOption === opt.id ? "var(--surface-3)" : "var(--surface-2)",
                      border: `1px solid ${expiryOption === opt.id ? "var(--accent)" : "var(--border)"}`,
                      borderRadius: "var(--r-sm)",
                      color: expiryOption === opt.id ? "var(--text)" : "var(--text-3)",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* On-Chain PDA Derived Preview */}
            {pdaAddress && (
              <div
                style={{
                  padding: 10,
                  background: "var(--surface-1)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r-sm)",
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ color: "var(--text-3)" }}>Authority PDA:</span>
                <span style={{ color: "var(--text-2)" }}>{shortenAddress(pdaAddress)}</span>
              </div>
            )}

            {/* Submit Action */}
            <Button
              variant="accent"
              block
              disabled={!publicKey || !parsedAgentKey}
              onClick={handleCreate}
              style={{ marginTop: 8 }}
            >
              Sign & Authorize on Devnet
            </Button>
          </>
        )}

        {(flowState === "SIGNING" || flowState === "CONFIRMING") && (
          <div
            className="stack g-16"
            style={{
              padding: "36px 16px",
              textAlign: "center",
              alignItems: "center",
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                border: "3px solid var(--accent)",
                borderTopColor: "transparent",
                animation: "spin 1s linear infinite",
              }}
            />
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>
                {flowState === "SIGNING"
                  ? "Awaiting Wallet Signature"
                  : "Confirming on Solana Devnet..."}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>
                {flowState === "SIGNING"
                  ? "Approve the authority creation transaction in your wallet."
                  : "Transaction submitted to Devnet. Awaiting block confirmation."}
              </div>
            </div>
          </div>
        )}

        {flowState === "SUCCESS" && (
          <div
            className="stack g-16"
            style={{
              padding: "24px 16px",
              textAlign: "center",
              alignItems: "center",
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "rgba(121, 194, 164, 0.15)",
                border: "1px solid var(--mint)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--mint)",
              }}
            >
              <Icon name="check" size={24} />
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700 }}>
                Autonomous Authority Active!
              </div>
              <div style={{ fontSize: 13, color: "var(--text-2)", marginTop: 6, lineHeight: 1.5 }}>
                Your bounded delegated authority is now live on Solana Devnet. Execution actor has been
                set to Autonomous.
              </div>
            </div>

            {txSignature && (
              <a
                href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
                target="_blank"
                rel="noreferrer"
                style={{
                  fontSize: 12,
                  fontFamily: "var(--mono)",
                  color: "var(--mint)",
                  textDecoration: "underline",
                }}
              >
                View on Solana Explorer ↗
              </a>
            )}

            <Button variant="accent" block onClick={onClose} style={{ marginTop: 8 }}>
              Done & Return to App
            </Button>
          </div>
        )}

        {flowState === "ERROR" && (
          <div className="stack g-16" style={{ padding: "20px 0" }}>
            <Notice tone="danger" title="Authority Creation Failed">
              {errorMessage || "Transaction was rejected or failed on Devnet."}
            </Notice>
            <Button variant="secondary" block onClick={handleReset}>
              Try Again
            </Button>
          </div>
        )}
      </div>
    </Drawer>
  );
}
