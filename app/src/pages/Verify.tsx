import React, { useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

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
import { useProtocolState } from "../hooks/useProtocolState";
import { useTransaction } from "../hooks/useTransaction";
import {
  CLUSTER,
  EQUITY_MINT,
  PROGRAM_ID,
  PYTH_FEED_ID,
  PYTH_PUSH_ORACLE_ID,
  PYTH_RECEIVER_ID,
  QUOTE_MINT,
  RPC_URL,
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
  const s = useProtocolState();
  const { publicKey } = useWallet();
  const tx = useTransaction();
  const [txOpen, setTxOpen] = useState(false);
  const [txTitle, setTxTitle] = useState("Transaction");

  const priceAccount = useMemo(
    () => s.oracle?.address ?? derivePriceAccount(PYTH_FEED_ID, 0),
    [s.oracle]
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
      subtitle="Verify the protocol state directly on Solana. Every address below can be opened in an explorer."
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
        <Card title="Program and accounts">
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
              label="Asset config (NVDAx)"
              address={EQUITY_MINT ? assetConfigPda(EQUITY_MINT) : null}
              badge="Collateral PDA"
              badgeTone="neutral"
              seeds={["asset", "NVDAx_mint"]}
              note="Collateral parameters: 70% base LTV, 80% liquidation threshold, custody & liquidity state"
            />
            <AddressCard
              label="Market guard"
              address={marketGuardPda()}
              badge="Circuit Breaker PDA"
              badgeTone="warning"
              seeds={["guard", "pyth_feed"]}
              note="Deterministic reference-market session gate, Pyth feed binding, and emergency price snapshot"
            />
            <AddressCard
              label="Your position"
              address={
                publicKey && EQUITY_MINT ? positionPda(publicKey, EQUITY_MINT) : null
              }
              badge="Position PDA"
              badgeTone="success"
              seeds={["position", "wallet", "NVDAx_mint"]}
              note={
                publicKey
                  ? "Isolated borrower account tracking deposited collateral and borrowed debt"
                  : "Connect your wallet to inspect your on-chain position PDA"
              }
            />
            <AddressCard
              label="Collateral mint (NVDAx)"
              address={EQUITY_MINT}
              badge="SPL Token (6 dec)"
              badgeTone="neutral"
              note="Accepted collateral token mint representing tokenized equity"
            />
            <AddressCard
              label="Quote mint (USDC)"
              address={QUOTE_MINT}
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
              label="Collateral vault"
              address={EQUITY_MINT ? vaultFor(EQUITY_MINT) : null}
              badge="Vault ATA"
              badgeTone="neutral"
              balance={`${formatMoney(toUi(s.vaultCollateral), 4)} NVDAx`}
              note="Holds deposited collateral tokens, locked on-chain by the ProtocolConfig PDA"
            />
            <AddressCard
              label="Liquidity vault"
              address={QUOTE_MINT ? vaultFor(QUOTE_MINT) : null}
              badge="Vault ATA"
              badgeTone="success"
              balance={`$${formatMoney(toUi(s.vaultLiquidity))} USDC`}
              note="Holds lendable capital to fund user borrow operations"
            />
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
              <span className="t-label">Feed id</span>
              <span className="mono" style={{ fontSize: 12, overflowWrap: "anywhere" }}>
                {PYTH_FEED_ID}
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
