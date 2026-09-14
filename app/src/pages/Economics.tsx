import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

import { PageContainer } from "../components/layout/AppShell";
import {
  Button,
  Card,
  DataRow,
  Icon,
  Notice,
  Pill,
} from "../components/ui";
import { useProtocolState } from "../hooks/useProtocolState";
import { useCircuitDomain } from "../lib/domain/context";
import { formatMoney, formatTokens } from "../lib/format";
import {
  CIRCUIT_TREASURY_ADDRESS,
  CIRCUIT_TREASURY_KEY,
  DEFAULT_BORROW_FEE_BPS,
  MAX_BORROW_FEE_BPS,
  QUOTE_MINT,
  PROGRAM_ID,
  explorerUrl,
} from "../config";
import { calculateProtocolFee, toNative, toUi } from "../lib/protocol";

export default function Economics() {
  const s = useProtocolState();
  const { risk } = useCircuitDomain();
  const [copiedTreasury, setCopiedTreasury] = useState(false);
  const [copiedAta, setCopiedAta] = useState(false);

  // Interactive Simulator State
  const [simAmount, setSimAmount] = useState(10000);
  const [simRiskShock, setSimRiskShock] = useState(false);

  const feeBps = s.protocol?.borrowFeeBps ?? DEFAULT_BORROW_FEE_BPS;
  const feeEnabled = s.protocol?.feeEnabled ?? true;
  const treasuryAddress = s.protocol?.feeRecipient?.toBase58() ?? CIRCUIT_TREASURY_ADDRESS;

  const treasuryQuoteAta = useMemo(() => {
    if (!QUOTE_MINT) return null;
    try {
      return getAssociatedTokenAddressSync(QUOTE_MINT, new PublicKey(treasuryAddress));
    } catch {
      return null;
    }
  }, [treasuryAddress]);

  const copyText = (text: string, setCopied: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const simFee = useMemo(() => {
    if (simRiskShock) {
      return { fee: 0n, netDisbursed: 0n, status: "BLOCKED" };
    }
    const native = toNative(simAmount);
    const { fee, netDisbursed } = calculateProtocolFee(native, feeBps, feeEnabled);
    return { fee, netDisbursed, status: "ALLOWED" };
  }, [simAmount, simRiskShock, feeBps, feeEnabled]);

  return (
    <PageContainer
      title="Protocol Economics & Treasury Engine"
      subtitle="Real on-chain monetization model: Safe credit execution fees, zero liquidation exploitation."
    >
      <div className="stack g-16">
        {/* Top Highlight Banner */}
        <Card>
          <div className="row between wrap g-12" style={{ alignItems: "center" }}>
            <div>
              <span className="t-label">Monetization Thesis</span>
              <h2 className="t-title" style={{ margin: "4px 0 0" }}>
                "Safe credit creates protocol revenue."
              </h2>
              <p className="t-meta" style={{ margin: "6px 0 0", maxWidth: 650 }}>
                Circuit rejects the predatory DeFi convention of profiting from cascading liquidations.
                The protocol earns revenue strictly on verified, safe credit execution. When the market is distressed,
                unhedged, or closed, borrowing halts and Circuit earns exactly <strong>$0.00</strong>.
              </p>
            </div>
            <Pill tone="success" withDot>
              25 BPS ON-CHAIN EXECUTION FEE
            </Pill>
          </div>
        </Card>

        {/* Live On-Chain Parameters & Circuit Treasury */}
        <div className="grid col-2 g-16">
          {/* Card 1: On-Chain Parameters */}
          <Card title="Live Protocol Parameters">
            <DataRow
              label="Borrow Execution Fee"
              value={`${(feeBps / 100).toFixed(2)}% (${feeBps} BPS)`}
            />
            <DataRow
              label="Hard Maximum Fee Cap"
              value={`${(MAX_BORROW_FEE_BPS / 100).toFixed(2)}% (${MAX_BORROW_FEE_BPS} BPS)`}
            />
            <DataRow
              label="Fee Enforcement"
              value="Smart Contract (borrow.rs)"
            />
            <DataRow
              label="Fee Status"
              value={
                <Pill tone={feeEnabled ? "success" : "warning"} withDot>
                  {feeEnabled ? "ACTIVE & ENFORCED" : "PAUSED"}
                </Pill>
              }
            />
            <DataRow
              label="Liquidation Protocol Take"
              value="0 BPS ($0.00)"
            />
            <div style={{ marginTop: 12, padding: "10px 12px", background: "var(--surface-2)", borderRadius: "var(--r)", fontSize: 12, color: "var(--text-3)", lineHeight: 1.5 }}>
              * Dynamic liquidation bonus is paid 100% to the liquidator to clear underwater positions swiftly. Circuit extracts zero protocol cut from user liquidations.
            </div>
          </Card>

          {/* Card 2: Circuit Treasury Public Key */}
          <Card title="Circuit Protocol Treasury">
            <DataRow
              label="Treasury Address"
              value={
                <div className="row g-8" style={{ alignItems: "center" }}>
                  <span className="mono" style={{ fontSize: 12 }}>
                    {treasuryAddress.slice(0, 6)}...{treasuryAddress.slice(-6)}
                  </span>
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={() => copyText(treasuryAddress, setCopiedTreasury)}
                    title="Copy Address"
                  >
                    <Icon name={copiedTreasury ? "check" : "copy"} size={12} />
                  </button>
                  <a
                    href={explorerUrl("address", treasuryAddress)}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn--secondary btn--sm"
                    title="View on Solana Explorer"
                  >
                    <Icon name="external" size={12} />
                  </a>
                </div>
              }
            />
            {treasuryQuoteAta && (
              <DataRow
                label="USDC Fee Vault (ATA)"
                value={
                  <div className="row g-8" style={{ alignItems: "center" }}>
                    <span className="mono" style={{ fontSize: 12 }}>
                      {treasuryQuoteAta.toBase58().slice(0, 6)}...{treasuryQuoteAta.toBase58().slice(-6)}
                    </span>
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => copyText(treasuryQuoteAta.toBase58(), setCopiedAta)}
                      title="Copy ATA"
                    >
                      <Icon name={copiedAta ? "check" : "copy"} size={12} />
                    </button>
                    <a
                      href={explorerUrl("address", treasuryQuoteAta.toBase58())}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn--secondary btn--sm"
                    >
                      <Icon name="external" size={12} />
                    </a>
                  </div>
                }
              />
            )}
            <DataRow
              label="Key Management"
              value="Single-Sig MVP (Devnet)"
            />
            <DataRow
              label="Production Governance"
              value="Squads v4 Multisig (Mainnet)"
            />
            <div style={{ marginTop: 12, padding: "10px 12px", background: "var(--surface-2)", borderRadius: "var(--r)", fontSize: 12, color: "var(--text-3)", lineHeight: 1.5 }}>
              Anchor constraint in <code>borrow.rs</code> rejects any fee transfer where <code>treasury_quote_ata.owner != protocol_config.fee_recipient</code>.
            </div>
          </Card>
        </div>

        {/* Interactive Simulator Card */}
        <Card title="Interactive Economic Simulator">
          <div className="stack g-14">
            <p className="t-meta" style={{ margin: 0 }}>
              Test how on-chain origination fees settle during safe operation vs. how risk gates protect capital and zero out protocol revenue during distress.
            </p>

            <div className="row between wrap g-12" style={{ alignItems: "center" }}>
              <div className="row g-8 wrap">
                {[1000, 5000, 10000, 50000, 100000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    className={`btn btn--sm ${simAmount === amt ? "btn--accent" : "btn--secondary"}`}
                    onClick={() => setSimAmount(amt)}
                  >
                    ${formatMoney(amt)}
                  </button>
                ))}
              </div>

              <label className="row g-8" style={{ alignItems: "center", cursor: "pointer", fontSize: 13, userSelect: "none" }}>
                <input
                  type="checkbox"
                  checked={simRiskShock}
                  onChange={(e) => setSimRiskShock(e.target.checked)}
                />
                <span style={{ color: simRiskShock ? "var(--danger)" : "var(--text-2)" }}>
                  Trigger Risk Shock (Defensive / Closed Session)
                </span>
              </label>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
                marginTop: 8,
              }}
            >
              <div style={{ padding: "14px 16px", background: "var(--surface-2)", borderRadius: "var(--r)", border: "1px solid var(--border)" }}>
                <span className="t-label">Requested Borrow</span>
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--mono)", marginTop: 4 }}>
                  ${formatMoney(simAmount)} USDC
                </div>
                <div className="t-meta" style={{ marginTop: 2 }}>Gross obligation recorded</div>
              </div>

              <div style={{ padding: "14px 16px", background: "var(--surface-2)", borderRadius: "var(--r)", border: "1px solid var(--border)" }}>
                <span className="t-label">Protocol Fee (0.25%)</span>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    fontFamily: "var(--mono)",
                    marginTop: 4,
                    color: simRiskShock ? "var(--text-3)" : "var(--success)",
                  }}
                >
                  ${formatMoney(toUi(simFee.fee))} USDC
                </div>
                <div className="t-meta" style={{ marginTop: 2 }}>
                  {simRiskShock ? "Blocked ($0.00 fee)" : "Settles to Circuit Treasury"}
                </div>
              </div>

              <div style={{ padding: "14px 16px", background: "var(--surface-2)", borderRadius: "var(--r)", border: "1px solid var(--border)" }}>
                <span className="t-label">Net Disbursed</span>
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--mono)", marginTop: 4 }}>
                  ${formatMoney(toUi(simFee.netDisbursed))} USDC
                </div>
                <div className="t-meta" style={{ marginTop: 2 }}>
                  {simRiskShock ? "Transaction rejected" : "Transferred to borrower ATA"}
                </div>
              </div>

              <div style={{ padding: "14px 16px", background: "var(--surface-2)", borderRadius: "var(--r)", border: "1px solid var(--border)" }}>
                <span className="t-label">Execution Status</span>
                <div style={{ marginTop: 4 }}>
                  <Pill tone={simRiskShock ? "danger" : "success"} withDot>
                    {simRiskShock ? "BLOCKED BY RATCHET" : "SAFE EXECUTION"}
                  </Pill>
                </div>
                <div className="t-meta" style={{ marginTop: 2 }}>
                  {simRiskShock ? "Risk gate protects protocol" : "All 4 risk gates nominal"}
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* 3 Pillar Strategic Roadmap */}
        <Card title="Three Revenue Pillars">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 16,
            }}
          >
            <div style={{ padding: "16px", background: "var(--surface-2)", borderRadius: "var(--r)", border: "1px solid var(--border)" }}>
              <div className="row g-8" style={{ alignItems: "center", marginBottom: 8 }}>
                <Pill tone="success">Pillar 1</Pill>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Credit Execution</h3>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: "var(--text-2)", lineHeight: 1.5 }}>
                25 BPS origination fee on every safe borrow. Enforced on-chain via checked fixed-point arithmetic with floor rounding.
              </p>
              <div style={{ marginTop: 12, fontSize: 11.5, fontFamily: "var(--mono)", color: "var(--success)" }}>
                Live & Active on Devnet
              </div>
            </div>

            <div style={{ padding: "16px", background: "var(--surface-2)", borderRadius: "var(--r)", border: "1px solid var(--border)" }}>
              <div className="row g-8" style={{ alignItems: "center", marginBottom: 8 }}>
                <Pill tone="accent">Pillar 2</Pill>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Risk Infrastructure</h3>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: "var(--text-2)", lineHeight: 1.5 }}>
                Enterprise licensing for MarketGuard session feeds and programmatic risk ratchet telemetry for institutional Solana credit protocols.
              </p>
              <div style={{ marginTop: 12, fontSize: 11.5, fontFamily: "var(--mono)", color: "var(--accent)" }}>
                Architecture Ready / Planned
              </div>
            </div>

            <div style={{ padding: "16px", background: "var(--surface-2)", borderRadius: "var(--r)", border: "1px solid var(--border)" }}>
              <div className="row g-8" style={{ alignItems: "center", marginBottom: 8 }}>
                <Pill tone="neutral">Pillar 3</Pill>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Circuit Network</h3>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: "var(--text-2)", lineHeight: 1.5 }}>
                Shared multi-collateral clearing and insurance reserve pool for tokenized real-world assets on Solana.
              </p>
              <div style={{ marginTop: 12, fontSize: 11.5, fontFamily: "var(--mono)", color: "var(--text-3)" }}>
                Long-Term Protocol Vision
              </div>
            </div>
          </div>
        </Card>

        {/* Smart Contract Audit & Verification Card */}
        <Card title="Smart Contract Fee Invariants">
          <div className="stack g-10">
            <DataRow
              label="Smart Contract Source"
              value={<code className="mono">programs/circuit/src/instructions/borrow.rs</code>}
            />
            <DataRow
              label="Fee Math"
              value={<code className="mono">calculate_protocol_fee(amount, fee_bps) in fixed_point.rs</code>}
            />
            <DataRow
              label="Anchor Recipient Constraint"
              value={<code className="mono">treasury_quote_ata.owner == protocol_config.fee_recipient</code>}
            />
            <DataRow
              label="Admin Configuration Instruction"
              value={<code className="mono">update_fee_config(fee_recipient, fee_bps, fee_enabled)</code>}
            />
            <DataRow
              label="Hard Maximum Safety Check"
              value={<code className="mono">require!(fee_bps &lt;= 1_000, FeeBpsExceedsMaximum)</code>}
            />
            <div className="row g-8 wrap" style={{ marginTop: 12 }}>
              <Link to="/app/verify" className="btn btn--secondary btn--sm">
                <Icon name="check" size={13} />
                Full On-Chain Verification
              </Link>
              <Link to="/app/markets" className="btn btn--secondary btn--sm">
                View 12 Live Markets
              </Link>
              <Link to="/app/borrow" className="btn btn--accent btn--sm">
                Borrow Against Tokenized Stocks
                <Icon name="arrowRight" size={13} />
              </Link>
            </div>
          </div>
        </Card>
      </div>
    </PageContainer>
  );
}
