import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

import { PageContainer } from "../components/layout/AppShell";
import { ConfigNotice } from "../components/layout/Guards";
import {
  Button,
  Card,
  DataRow,
  Icon,
  Notice,
  Pill,
  Skeleton,
} from "../components/ui";
import { AddressCard } from "../components/technical/AddressCard";
import { TransactionModal } from "../components/transactions/TransactionModal";
import { MarketSelector } from "../components/market/MarketSelector";
import { useProtocolState } from "../hooks/useProtocolState";
import { useTransaction } from "../hooks/useTransaction";
import { useMarket } from "../context/MarketContext";
import {
  CLUSTER,
  EQUITY_MINT,
  PROGRAM_ID,
  PYTH_FEED_ID,
  PYTH_PUSH_ORACLE_ID,
  PYTH_RECEIVER_ID,
  QUOTE_MINT,
  RPC_URL,
  CIRCUIT_TREASURY_ADDRESS,
  DEFAULT_BORROW_FEE_BPS,
  MAX_BORROW_FEE_BPS,
  explorerUrl,
} from "../config";
import {
  CustodyState,
  LiquidityState,
  assetConfigPda,
  buildRefreshGuard,
  buildSetCustodyState,
  buildSetLiquidityState,
  marketGuardPda,
  positionPda,
  protocolConfigPda,
  toUi,
  vaultFor,
} from "../lib/protocol";
import { derivePriceAccount } from "../lib/pyth";
import { formatMoney } from "../lib/format";

export default function Verify() {
  const { selectedMarket, markets, selectMarket } = useMarket();
  const s = useProtocolState();
  const { publicKey } = useWallet();
  const tx = useTransaction();
  const [txOpen, setTxOpen] = useState(false);
  const [txTitle, setTxTitle] = useState("Transaction");

  const activeEquityMint = useMemo(
    () => (selectedMarket.mint ? new PublicKey(selectedMarket.mint) : EQUITY_MINT),
    [selectedMarket.mint]
  );
  const activeQuoteMint = useMemo(
    () => (selectedMarket.quoteMint ? new PublicKey(selectedMarket.quoteMint) : QUOTE_MINT),
    [selectedMarket.quoteMint]
  );
  const activeFeedId = selectedMarket.feedId || PYTH_FEED_ID;

  const priceAccount = useMemo(
    () => s.oracle?.address ?? derivePriceAccount(activeFeedId, 0),
    [s.oracle, activeFeedId]
  );

  const run = async (
    title: string,
    build: Parameters<typeof tx.run>[0]["build"],
    summary: string
  ) => {
    setTxTitle(title);
    setTxOpen(true);
    await tx.run({
      verb: title,
      summary,
      priceUpdate: priceAccount,
      build,
      onSuccess: s.refresh,
    });
  };

  return (
    <PageContainer
      title="On-chain verification"
      subtitle="Verify the protocol state directly on Solana Devnet across all 12 deployed tokenized equity markets."
    >
      <ConfigNotice />

      <div className="stack g-16">
        {/* -- Network ------------------------------------------------- */}
        <Card title="Network">
          <DataRow label="Cluster" value={CLUSTER} />
          <DataRow label="RPC endpoint" value={RPC_URL} mono />
          <DataRow
            label="Current slot"
            value={s.slot === null ? <Skeleton height={14} width={90} /> : s.slot}
            mono
          />
          <DataRow
            label="Cluster time"
            value={
              s.chainUnixTime === null ? (
                <Skeleton height={14} width={150} />
              ) : (
                new Date(s.chainUnixTime * 1000)
                  .toISOString()
                  .replace("T", " ")
                  .slice(0, 19) + "Z"
              )
            }
            mono
          />
        </Card>

        {/* -- Program and accounts ------------------------------------ */}
        <Card
          title={
            <div className="row between g-12 wrap" style={{ alignItems: "center" }}>
              <span>Program and accounts: {selectedMarket.tokenSymbol} / {selectedMarket.quoteSymbol}</span>
              <MarketSelector compact />
            </div>
          }
        >
          <div className="grid grid--2">
            <AddressCard
              label="Program"
              address={PROGRAM_ID}
              badge="Smart Contract"
              badgeTone="accent"
              note="Anchor bytecode on Solana Devnet enforcing all protocol credit rules"
            />
            <AddressCard
              label="Protocol config"
              address={protocolConfigPda()}
              badge="Singleton PDA"
              badgeTone="neutral"
              seeds={["protocol"]}
              note="Global singleton holding admin authority, pause switch, and min health factor"
            />
            <AddressCard
              label={`Asset config (${selectedMarket.tokenSymbol})`}
              address={selectedMarket.assetConfigPda ? new PublicKey(selectedMarket.assetConfigPda) : (activeEquityMint ? assetConfigPda(activeEquityMint) : null)}
              badge="Collateral PDA"
              badgeTone="neutral"
              seeds={["asset", `${selectedMarket.tokenSymbol}_mint`]}
              note={`Collateral parameters: ${(selectedMarket.baseLtvBps / 100).toFixed(0)}% base LTV, ${(selectedMarket.liqThresholdBps / 100).toFixed(0)}% liquidation threshold, custody & liquidity state`}
            />
            <AddressCard
              label={`Market guard (${selectedMarket.symbol})`}
              address={selectedMarket.marketGuardPda ? new PublicKey(selectedMarket.marketGuardPda) : marketGuardPda(activeFeedId)}
              badge="Circuit Breaker PDA"
              badgeTone="warning"
              seeds={["guard", "pyth_feed"]}
              note="Deterministic reference-market session gate, Pyth feed binding, and emergency price snapshot"
            />
            <AddressCard
              label={`Your position (${selectedMarket.tokenSymbol})`}
              address={
                publicKey && activeEquityMint ? positionPda(publicKey, activeEquityMint) : null
              }
              badge="Position PDA"
              badgeTone="success"
              seeds={["position", "wallet", `${selectedMarket.tokenSymbol}_mint`]}
              note={
                publicKey
                  ? "Isolated borrower account tracking deposited collateral and borrowed debt"
                  : "Connect your wallet to inspect your on-chain position PDA"
              }
            />
            <AddressCard
              label={`Collateral mint (${selectedMarket.tokenSymbol})`}
              address={activeEquityMint}
              badge="SPL Token (6 dec)"
              badgeTone="neutral"
              note={`Accepted collateral token mint representing tokenized ${selectedMarket.name}`}
            />
            <AddressCard
              label={`Quote mint (${selectedMarket.quoteSymbol})`}
              address={activeQuoteMint}
              badge="SPL Token (6 dec)"
              badgeTone="neutral"
              note="Lendable quote token mint issued on borrow and repaid to clear debt"
            />
          </div>
        </Card>

        {/* -- Vaults --------------------------------------------------- */}
        <Card title="Token vaults">
          <p className="t-sm muted" style={{ marginBottom: 14 }}>
            Both vaults are associated token accounts owned by the protocol
            config PDA. No operator key can move funds from them.
          </p>
          <div className="grid grid--2">
            <AddressCard
              label={`Collateral vault (${selectedMarket.tokenSymbol})`}
              address={selectedMarket.collateralVault ? new PublicKey(selectedMarket.collateralVault) : (activeEquityMint ? vaultFor(activeEquityMint) : null)}
              badge="Vault ATA"
              badgeTone="neutral"
              balance={`${formatMoney(toUi(s.vaultCollateral), 4)} ${selectedMarket.tokenSymbol}`}
              note={`Holds deposited ${selectedMarket.tokenSymbol} collateral, locked on-chain by the ProtocolConfig PDA`}
            />
            <AddressCard
              label={`Liquidity vault (${selectedMarket.quoteSymbol})`}
              address={selectedMarket.liquidityVault ? new PublicKey(selectedMarket.liquidityVault) : (activeQuoteMint ? vaultFor(activeQuoteMint) : null)}
              badge="Vault ATA"
              badgeTone="success"
              balance={`${formatMoney(toUi(s.vaultLiquidity))} ${selectedMarket.quoteSymbol}`}
              note={`Holds lendable ${selectedMarket.quoteSymbol} capital to fund user borrow operations`}
            />
          </div>
        </Card>

        {/* -- Protocol Treasury & Economics --------------------------- */}
        <Card
          title={
            <div className="row between g-12 wrap" style={{ alignItems: "center" }}>
              <span>Protocol Treasury & Economics</span>
              <div className="row g-6">
                <Pill tone="success" withDot>{DEFAULT_BORROW_FEE_BPS} BPS Borrow Fee</Pill>
                <Pill tone="neutral">{MAX_BORROW_FEE_BPS} BPS Hard Cap</Pill>
              </div>
            </div>
          }
        >
          <p className="t-sm muted" style={{ marginBottom: 14 }}>
            Circuit monetizes safe credit execution, not liquidations or user losses.
            100% of the 25 BPS origination fee is transferred directly to the Circuit Treasury on-chain.
            Unsafe or blocked operations generate $0.00 fee.
          </p>
          <div className="grid grid--2">
            <AddressCard
              label="Circuit Treasury"
              address={new PublicKey(CIRCUIT_TREASURY_ADDRESS)}
              badge="Protocol Treasury"
              badgeTone="accent"
              note="Public protocol treasury account. Enforced by Anchor constraint treasury_quote_ata.owner == protocol_config.fee_recipient."
            />
            <AddressCard
              label={`Treasury Quote ATA (${selectedMarket.quoteSymbol})`}
              address={activeQuoteMint ? getAssociatedTokenAddressSync(activeQuoteMint, new PublicKey(CIRCUIT_TREASURY_ADDRESS)) : null}
              badge="Fee Vault ATA"
              badgeTone="success"
              note={`Accumulates ${selectedMarket.quoteSymbol} origination fees from executed borrows across all tokenized equity markets.`}
            />
          </div>
          <div style={{ marginTop: 14 }}>
            <Link to="/app/economics" className="btn btn--secondary btn--sm">
              <Icon name="layers" size={13} />
              Open Dedicated Economics Dashboard
            </Link>
          </div>
        </Card>

        {/* -- Security & Verifiable Build ---------------------------- */}
        <Card
          title={
            <div className="row between g-12 wrap" style={{ alignItems: "center" }}>
              <span>Smart contract security & verifiable build attestation</span>
              <div className="row g-6">
                <Pill tone="success" withDot>Security.txt Included</Pill>
                <Pill tone="accent" withDot>On-Chain Verified PDA</Pill>
              </div>
            </div>
          }
        >
          <div className="stack g-12" style={{ marginBottom: 14 }}>
            <p className="t-sm muted" style={{ margin: 0 }}>
              The Circuit Protocol program binary embeds cryptographic security metadata and publishes its reproducible build attestation to the official Solana Foundation / OtterSec verifiable build registry.
            </p>
          </div>

          <div className="grid grid--2">
            <AddressCard
              label="Solana Verifiable Build PDA"
              address="ASEZW9QkzcycmhMN6j3Ej8hCVAGN5bvdbTbKthk9nXEc"
              badge="OtterSec Verified PDA"
              badgeTone="accent"
              seeds={["otter_verify", "program", "authority"]}
              note="Official on-chain PDA uploaded by upgrade authority linking program bytecode to GitHub commit 4faab2e"
            />
            <AddressCard
              label="Verification Upload TX"
              address="YPCNPcbJoVVBqaF1d1xUCp4EsaF777Fn7vX8eAttLE8nFhrFxPUHEVmVbzsHv3byERh6LwLeNEFyyGYFzJLbnBN"
              kind="tx"
              badge="Devnet Transaction"
              badgeTone="success"
              note="Confirmed on-chain transaction writing verifiable build parameters to the Solana blockchain"
            />
            <AddressCard
              label="Program Upgrade Authority"
              address="F5JmuDsKh9oswAhR9rJSfL2PGU1UpQF2cN3n7NjZrFAT"
              badge="Signer Authority"
              badgeTone="neutral"
              note="Authorized keypair that signed the on-chain verifiable build attestation and controls program upgrades"
            />
            <AddressCard
              label="Source Code Snapshot"
              address="Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2"
              badge="Commit 4faab2e"
              badgeTone="neutral"
              note="Compiled from public repository at github.com/Patel5600/Circuit for program Cq4Lvd6...iTs2"
            />
          </div>

          <div
            style={{
              marginTop: 14,
              padding: "12px 16px",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r)",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div className="stack g-4">
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                Embedded Security.txt Policy
              </div>
              <div style={{ fontSize: 12, color: "var(--text-2)" }}>
                Auditors: None (Devnet MVP) • Policy: <span className="mono">docs/SECURITY.md</span> • Contact: <span className="mono">github:Patel5600/Circuit/issues</span>
              </div>
            </div>

            <a
              href="https://explorer.solana.com/address/Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2/security?cluster=devnet"
              target="_blank"
              rel="noreferrer"
              className="btn btn--secondary btn--sm"
            >
              <Icon name="shield" size={14} />
              <span>Inspect Security.txt on Explorer &rarr;</span>
            </a>
          </div>
        </Card>

        {/* -- Oracle -------------------------------------------------- */}
        <Card
          title="Oracle"
          action={
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                run("Refresh guard", (ctx) => buildRefreshGuard(ctx), "Guard state refreshed")
              }
              disabled={!publicKey || !s.asset || tx.busy}
            >
              Refresh guard
            </Button>
          }
        >
          <div className="grid grid--2" style={{ marginBottom: 16 }}>
            <AddressCard
              label="Price account"
              address={priceAccount}
              badge="PriceUpdateV2"
              badgeTone="neutral"
              note="PriceUpdateV2 read by the program"
            />
            <AddressCard
              label="Receiver program"
              address={PYTH_RECEIVER_ID}
              badge="Pyth Receiver"
              badgeTone="accent"
              note="Required owner of the price account"
            />
            <AddressCard
              label="Push oracle program"
              address={PYTH_PUSH_ORACLE_ID}
              badge="Push Oracle"
              badgeTone="neutral"
              note="Owns sponsored price feed accounts"
            />
            <div
              className="stack g-8"
              style={{
                padding: "13px 14px",
                border: "1px solid var(--border)",
                borderRadius: "var(--r)",
                background: "var(--bg-elevated)",
              }}
            >
              <span className="t-label">Feed id ({selectedMarket.symbol})</span>
              <span className="mono" style={{ fontSize: 12, overflowWrap: "anywhere" }}>
                {activeFeedId}
              </span>
            </div>
          </div>

          {s.oracle ? (
            <>
              <DataRow label="Price (raw)" value={s.oracle.update.price.toString()} mono />
              <DataRow label="Exponent" value={s.oracle.update.exponent} mono />
              <DataRow label="Price (decimal)" value={`$${formatMoney(s.oracle.priceUsd)}`} />
              <DataRow label="Confidence (raw)" value={s.oracle.update.conf.toString()} mono />
              <DataRow label="Confidence (bps of price)" value={s.oracle.confBps} mono />
              <DataRow
                label="Publish time"
                value={
                  new Date(Number(s.oracle.update.publishTime) * 1000)
                    .toISOString()
                    .replace("T", " ")
                    .slice(0, 19) + "Z"
                }
                mono
              />
              <DataRow label="Age at last read" value={`${s.oracle.ageSeconds}s`} mono />
              <DataRow
                label="Verification level"
                value={s.oracle.update.isFull ? "Full" : "Partial"}
                tone={s.oracle.update.isFull ? "success" : "danger"}
              />
              <DataRow
                label="Embedded feed id matches"
                value={s.oracle.update.feedId === PYTH_FEED_ID ? "Yes" : "No"}
                tone={s.oracle.update.feedId === PYTH_FEED_ID ? "success" : "danger"}
              />
            </>
          ) : (
            <Notice tone="warning" title="No price account found">
              No PriceUpdateV2 account owned by the receiver program was found for
              this feed. Risk-increasing instructions cannot execute without one.
            </Notice>
          )}
        </Card>

        {/* -- Guard --------------------------------------------------- */}
        <Card title="Market guard state">
          {s.guard ? (
            <>
              <DataRow label="Market state" value={s.guard.marketState} />
              <DataRow label="Reason" value={s.guard.reason} mono />
              <DataRow
                label="Last checked slot"
                value={
                  s.guard.lastCheckedSlot === 0n
                    ? "never refreshed"
                    : s.guard.lastCheckedSlot.toString()
                }
                mono
              />
              <DataRow
                label="Last valid price (raw)"
                value={s.guard.lastValidPrice.toString()}
                mono
              />
              <DataRow label="Last valid exponent" value={s.guard.lastValidExpo} mono />
              <DataRow
                label="Last publish time"
                value={
                  s.guard.lastPublishTime === 0n
                    ? "none"
                    : new Date(Number(s.guard.lastPublishTime) * 1000)
                        .toISOString()
                        .replace("T", " ")
                        .slice(0, 19) + "Z"
                }
                mono
              />
              <div className="card__foot">
                The guard is a cached observation. borrow and withdraw re-derive
                market state on-chain, so a stale Safe value here cannot
                authorize anything.
              </div>
            </>
          ) : (
            <p className="t-sm muted">No guard account for this feed yet.</p>
          )}
        </Card>

        {/* -- Position ------------------------------------------------ */}
        <Card title="Position account">
          {s.position ? (
            <>
              <DataRow label="Owner" value={s.position.owner.toBase58()} mono />
              <DataRow
                label="Collateral (native units)"
                value={s.position.collateralAmount.toString()}
                mono
              />
              <DataRow
                label="Debt (native units)"
                value={s.position.debtAmount.toString()}
                mono
              />
              <DataRow
                label="Frozen price (raw)"
                value={s.position.lastValidPrice.toString()}
                mono
              />
              <DataRow label="Frozen exponent" value={s.position.lastValidExpo} mono />
              <DataRow label="State" value={s.position.state} />
            </>
          ) : (
            <p className="t-sm muted">
              No position account exists for the connected wallet yet.
            </p>
          )}
        </Card>

        {/* -- Risk parameters ----------------------------------------- */}
        <Card title="Risk parameters">
          {s.asset && s.protocol ? (
            <div className="grid grid--2">
              <div>
                <DataRow label="Base LTV" value={`${s.asset.baseLtvBps} bps`} mono />
                <DataRow
                  label="Liquidation threshold"
                  value={`${s.asset.liquidationThresholdBps} bps`}
                  mono
                />
                <DataRow
                  label="Liquidation bonus"
                  value={`${s.asset.liquidationBonusBps} bps`}
                  mono
                />
              </div>
              <div>
                <DataRow
                  label="Min health factor"
                  value={`${s.protocol.minHealthFactorBps} bps`}
                  mono
                />
                <DataRow label="Max oracle age" value={`${s.asset.maxOracleAge}s`} mono />
                <DataRow label="Max confidence" value={`${s.asset.maxConfBps} bps`} mono />
                <DataRow
                  label="Protocol paused"
                  value={s.protocol.paused ? "Yes" : "No"}
                  tone={s.protocol.paused ? "warning" : "success"}
                />
              </div>
            </div>
          ) : (
            <p className="t-sm muted">Asset configuration not available.</p>
          )}
        </Card>

        {/* -- All 12 Deployed Markets Directory ------------------------ */}
        <Card
          title="All 12 Live On-Chain Devnet Markets"
          action={<Pill tone="success" withDot>12 LIVE MARKETS</Pill>}
        >
          <p className="t-sm muted" style={{ marginTop: 0, marginBottom: 14 }}>
            Every market below is deployed and initialized on Solana Devnet with Anchor program{" "}
            <code className="mono">{PROGRAM_ID.toBase58().slice(0, 8)}...</code>. Click &quot;Inspect&quot; to load that market&apos;s on-chain PDAs and price feed above.
          </p>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-strong)", textAlign: "left", color: "var(--text-3)" }}>
                  <th style={{ padding: "8px 10px" }}>Market</th>
                  <th style={{ padding: "8px 10px" }}>Quote</th>
                  <th style={{ padding: "8px 10px" }}>Collateral Mint</th>
                  <th style={{ padding: "8px 10px" }}>AssetConfig PDA</th>
                  <th style={{ padding: "8px 10px" }}>Collateral Vault</th>
                  <th style={{ padding: "8px 10px", textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {markets.map((m) => {
                  const active =
                    m.symbol === selectedMarket.symbol &&
                    m.quoteSymbol === selectedMarket.quoteSymbol;

                  return (
                    <tr
                      key={`${m.symbol}-${m.quoteSymbol}`}
                      style={{
                        borderBottom: "1px solid var(--border)",
                        background: active ? "var(--surface-2)" : "transparent",
                      }}
                    >
                      <td style={{ padding: "10px 10px", fontWeight: 700 }}>
                        <div className="row g-6" style={{ alignItems: "center" }}>
                          <span>{m.tokenSymbol}</span>
                          {active && <Pill tone="accent">ACTIVE</Pill>}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 400 }}>
                          {m.name}
                        </div>
                      </td>
                      <td style={{ padding: "10px 10px" }}>
                        <Pill tone={m.quoteSymbol === "WSOL" ? "accent" : "neutral"}>
                          {m.quoteSymbol}
                        </Pill>
                      </td>
                      <td style={{ padding: "10px 10px" }} className="mono">
                        <a
                          href={explorerUrl("address", m.mint)}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "var(--accent)" }}
                        >
                          {m.mint.slice(0, 4)}...{m.mint.slice(-4)}
                        </a>
                      </td>
                      <td style={{ padding: "10px 10px" }} className="mono">
                        <a
                          href={explorerUrl("address", m.assetConfigPda)}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "var(--text-2)" }}
                        >
                          {m.assetConfigPda.slice(0, 4)}...{m.assetConfigPda.slice(-4)}
                        </a>
                      </td>
                      <td style={{ padding: "10px 10px" }} className="mono">
                        <a
                          href={explorerUrl("address", m.collateralVault)}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "var(--text-2)" }}
                        >
                          {m.collateralVault.slice(0, 4)}...{m.collateralVault.slice(-4)}
                        </a>
                      </td>
                      <td style={{ padding: "10px 10px", textAlign: "right" }}>
                        <button
                          type="button"
                          className={`btn ${active ? "btn--accent" : "btn--secondary"} btn--sm`}
                          style={{ padding: "3px 8px", fontSize: 11.5 }}
                          onClick={() => selectMarket(m.symbol, m.quoteSymbol)}
                        >
                          {active ? "Inspecting" : "Inspect"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* -- Emergency Liquidation & Frozen Price Policy ------------ */}
        <Card
          title="Emergency Liquidation & last_valid_price Protocol Invariant"
          action={<Pill tone="accent">ON-CHAIN INVARIANT</Pill>}
        >
          <div className="stack g-12">
            <p className="t-sm" style={{ margin: 0, color: "var(--text-2)" }}>
              A critical vulnerability in DeFi lending protocols is oracle spoofing during liquidations. In Circuit, if a Pyth price feed becomes stale, missing, or confidence expands beyond safe parameters, the liquidation engine <strong>never reopens an unsafe price vector</strong>.
            </p>
            <div
              style={{
                padding: "12px 14px",
                background: "rgba(20, 24, 34, 0.6)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r)",
                fontFamily: "var(--mono)",
                fontSize: 11.5,
              }}
              className="stack g-6"
            >
              <div style={{ color: "var(--accent)" }}>
                // programs/circuit/src/instructions/liquidate.rs:47-53
              </div>
              <div style={{ color: "var(--text-3)" }}>
                let (ref_price, ref_expo) = match oracle::try_validate_pyth_price(...) &#123;
              </div>
              <div style={{ paddingLeft: 16 }}>
                Some(validated) =&gt; (validated.price, validated.expo),
              </div>
              <div style={{ paddingLeft: 16, color: "var(--warning)" }}>
                None =&gt; &#123;
              </div>
              <div style={{ paddingLeft: 32, color: "var(--warning)" }}>
                require!(position.last_valid_price &gt; 0, CircuitError::InvalidPrice);
              </div>
              <div style={{ paddingLeft: 32, color: "var(--warning)" }}>
                msg!(&quot;EMERGENCY: Using frozen last-valid price for liquidation&quot;);
              </div>
              <div style={{ paddingLeft: 32 }}>
                (position.last_valid_price, position.last_valid_expo)
              </div>
              <div style={{ paddingLeft: 16 }}>&#125;</div>
              <div>&#125;;</div>
            </div>
            <DataRow
              label="Emergency Liquidation Reference"
              value="position.last_valid_price (Frozen On-Chain Snapshot)"
              mono
            />
            <DataRow
              label="Off-Chain / Unverified Fallback"
              value="STRICTLY REJECTED (Zero unverified oracle inputs)"
            />
          </div>
        </Card>

        {/* -- Risk Ratchet State Machine Specification ---------------- */}
        <Card
          title="Risk Ratchet State Machine Specification"
          action={<Pill tone="success" withDot>DETERMINISTIC</Pill>}
        >
          <div className="stack g-12">
            <p className="t-sm" style={{ margin: 0, color: "var(--text-2)" }}>
              The Risk Ratchet operates as a formal state machine governed by the <code>RiskRatchet</code> PDA (<code>seeds = [b&quot;ratchet&quot;, pyth_feed_id]</code>). Deterioration tightens quickly, while recovery is staged and monotonic with hysteresis.
            </p>
            <div className="grid grid--stats" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
              <div style={{ padding: "10px 12px", background: "rgba(127,195,154,0.08)", border: "1px solid rgba(127,195,154,0.3)", borderRadius: "var(--r)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--success)" }}>SAFE</div>
                <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 4 }}>Conf &lt; 50 bps, NYSE Open, Custody Deep. Full borrow permissions.</div>
              </div>
              <div style={{ padding: "10px 12px", background: "rgba(207,173,116,0.08)", border: "1px solid rgba(207,173,116,0.3)", borderRadius: "var(--r)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--warning)" }}>RESTRICTED</div>
                <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 4 }}>Conf &gt; 50 bps, C_max &gt; 40%, or NYSE Closed. Borrow constrained.</div>
              </div>
              <div style={{ padding: "10px 12px", background: "rgba(224,140,78,0.08)", border: "1px solid rgba(224,140,78,0.3)", borderRadius: "var(--r)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#e08c4e" }}>DEFENSIVE</div>
                <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 4 }}>Conf &gt; 150 bps. Borrow blocked, withdrawals constrained.</div>
              </div>
              <div style={{ padding: "10px 12px", background: "rgba(207,139,139,0.08)", border: "1px solid rgba(207,139,139,0.3)", borderRadius: "var(--r)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--danger)" }}>EMERGENCY</div>
                <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 4 }}>Conf &gt; 300 bps, Stale Oracle, Impaired Custody. Liquidations at last_valid_price.</div>
              </div>
            </div>
            <DataRow
              label="Deterioration Tightening"
              value="Asymmetric & Instant (can jump to Emergency in 1 block)"
            />
            <DataRow
              label="Staged Recovery Requirement"
              value="5 Consecutive Healthy Crank Observations per step"
            />
            <DataRow
              label="Hysteresis Deadband"
              value="Safe: <30 bps | Restricted: <100 bps | Defensive: <250 bps"
              mono
            />
            <DataRow
              label="Direct EMERGENCY -> SAFE Jump"
              value="STRICTLY PROHIBITED (Monotonic step recovery enforced)"
            />
          </div>
        </Card>

        {/* -- Demo controls ------------------------------------------- */}
        <DemoControls
          isAuthority={s.isAuthority}
          custody={s.asset?.custodyState ?? null}
          liquidity={s.asset?.liquidityState ?? null}
          busy={tx.busy}
          onCustody={(v) =>
            run(
              "Set custody state",
              (ctx) => buildSetCustodyState(ctx, v),
              `Custody state set to ${v}`
            )
          }
          onLiquidity={(v) =>
            run(
              "Set liquidity state",
              (ctx) => buildSetLiquidityState(ctx, v),
              `Liquidity state set to ${v}`
            )
          }
        />
      </div>

      <TransactionModal
        open={txOpen}
        state={tx.state}
        title={txTitle}
        onClose={() => {
          setTxOpen(false);
          tx.reset();
        }}
        onDone={s.refresh}
      />
    </PageContainer>
  );
}

/**
 * Demo controls.
 *
 * Only custody and liquidity are operator-settable in the program, so those are
 * the only levers offered. Oracle staleness, price certainty and the market
 * session are determined by external reality (Pyth publishes, the calendar
 * decides) and there is no instruction to fake them - so no button pretends to.
 */
function DemoControls({
  isAuthority,
  custody,
  liquidity,
  busy,
  onCustody,
  onLiquidity,
}: {
  isAuthority: boolean;
  custody: CustodyState | null;
  liquidity: LiquidityState | null;
  busy: boolean;
  onCustody: (v: CustodyState) => void;
  onLiquidity: (v: LiquidityState) => void;
}) {
  return (
    <Card
      title="Demo controls"
      action={<Pill tone="warning">DEMO ONLY</Pill>}
    >
      <Notice tone="warning" title="These write simulated state on-chain">
        Custody and liquidity are operator-set inputs in this MVP, not live
        external feeds. Changing them affects real gating, so treat the resulting
        values as <strong>simulated</strong>, never as observed market data.
      </Notice>

      <div className="stack g-16" style={{ marginTop: 16 }}>
        <div>
          <div className="row between g-10" style={{ marginBottom: 8 }}>
            <span className="t-label">Custody state</span>
            <Pill
              tone={
                custody === "healthy"
                  ? "success"
                  : custody === "delayed"
                  ? "warning"
                  : custody === "impaired"
                  ? "danger"
                  : "neutral"
              }
            >
              {(custody ?? "unknown").toUpperCase()}
            </Pill>
          </div>
          <div className="chips">
            {(["healthy", "delayed", "impaired"] as CustodyState[]).map((v) => (
              <button
                key={v}
                type="button"
                className="chip"
                disabled={!isAuthority || busy || custody === v}
                onClick={() => onCustody(v)}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="row between g-10" style={{ marginBottom: 8 }}>
            <span className="t-label">Liquidity state</span>
            <Pill
              tone={
                liquidity === "deep" || liquidity === "normal"
                  ? "success"
                  : liquidity === "thin"
                  ? "warning"
                  : liquidity === "critical"
                  ? "danger"
                  : "neutral"
              }
            >
              {(liquidity ?? "unknown").toUpperCase()}
            </Pill>
          </div>
          <div className="chips">
            {(["deep", "normal", "thin", "critical"] as LiquidityState[]).map((v) => (
              <button
                key={v}
                type="button"
                className="chip"
                disabled={!isAuthority || busy || liquidity === v}
                onClick={() => onLiquidity(v)}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card__foot">
        {isAuthority ? (
          <span className="row g-6">
            <span style={{ color: "var(--success)" }}>
              <Icon name="check" size={14} />
            </span>
            Connected wallet is the protocol authority, so these controls are
            enabled.
          </span>
        ) : (
          <>
            Only the protocol authority can change these. Price freshness, price
            certainty and the market session cannot be simulated at all - they
            come from Pyth and the cluster clock, and the program has no
            instruction to override them.
          </>
        )}
      </div>
    </Card>
  );
}
