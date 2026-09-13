import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";

import { PageContainer } from "../components/layout/AppShell";
import { ConfigNotice, ConnectPrompt, NoPositionPrompt } from "../components/layout/Guards";
import {
  Button,
  Card,
  DataRow,
  Icon,
  Modal,
  Notice,
  Pill,
  Segmented,
  Skeleton,
} from "../components/ui";
import {
  CollateralCard,
  HealthFactor,
  PositionSummary,
  RiskBar,
  healthLabel,
} from "../components/position/PositionParts";
import { TransactionModal } from "../components/transactions/TransactionModal";
import { BlockedAction } from "../components/risk/SafetyStatus";
import { MarketSelector } from "../components/market/MarketSelector";
import { useProtocolState } from "../hooks/useProtocolState";
import { useTransaction } from "../hooks/useTransaction";
import { useMarket } from "../context/MarketContext";
import { activeAssetDisplay } from "../lib/asset";
import { formatPercent, formatTokens } from "../lib/format";
import {
  buildDeposit,
  buildRepay,
  buildWithdraw,
  collateralValue,
  healthFactorBps,
  toNative,
  toUi,
} from "../lib/protocol";
import { derivePriceAccount } from "../lib/pyth";
import { PYTH_FEED_ID } from "../config";

type Action = "deposit" | "repay" | "withdraw";

const ACTION_META: Record<
  Action,
  { title: string; verb: string; help: string; unit: "collateral" | "quote" }
> = {
  deposit: {
    title: "Deposit collateral",
    verb: "Deposit",
    help: "Adds collateral and increases your borrowing power.",
    unit: "collateral",
  },
  repay: {
    title: "Repay borrowed funds",
    verb: "Repay",
    help: "Reduces what you owe and improves your health factor.",
    unit: "quote",
  },
  withdraw: {
    title: "Withdraw collateral",
    verb: "Withdraw",
    help: "Removes collateral. Blocked if it would make your position unsafe.",
    unit: "collateral",
  },
};

export default function Position() {
  const { selectedMarket, markets, selectMarket } = useMarket();
  const s = useProtocolState();
  const { connected } = useWallet();
  const tx = useTransaction();

  const display = useMemo(() => activeAssetDisplay(selectedMarket), [selectedMarket]);
  const quoteSymbol = selectedMarket.quoteSymbol || "USDC";

  const [action, setAction] = useState<Action>("deposit");
  const [amount, setAmount] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [txOpen, setTxOpen] = useState(false);

  const minBps = s.protocol?.minHealthFactorBps ?? 10_000;
  const collateral = s.position?.collateralAmount ?? 0n;
  const debt = s.position?.debtAmount ?? 0n;
  const hasPosition = collateral > 0n || debt > 0n;

  const priceAccount = useMemo(
    () => s.oracle?.address ?? derivePriceAccount(selectedMarket.feedId || PYTH_FEED_ID, 0),
    [s.oracle, selectedMarket.feedId]
  );

  const meta = ACTION_META[action];
  const unitSymbol = meta.unit === "collateral" ? display.symbol : quoteSymbol;

  const max = useMemo<bigint>(() => {
    switch (action) {
      case "deposit":
        return s.walletEquity;
      case "repay":
        return debt < s.walletQuote ? debt : s.walletQuote;
      case "withdraw":
        return collateral;
    }
  }, [action, s.walletEquity, s.walletQuote, debt, collateral]);

  const parsed = Number(amount);
  const valid = amount !== "" && Number.isFinite(parsed) && parsed > 0;
  const amountNative = valid ? toNative(parsed) : 0n;

  /** Health factor if this action lands, using the same math as the program. */
  const projectedHf = useMemo<number | null>(() => {
    if (!s.asset || !s.oracle || !valid) return null;
    let c = collateral;
    let d = debt;
    if (action === "deposit") c += amountNative;
    if (action === "withdraw") c = c > amountNative ? c - amountNative : 0n;
    if (action === "repay") d = d > amountNative ? d - amountNative : 0n;
    const value = collateralValue(c, s.oracle.update.price, s.oracle.update.exponent);
    return healthFactorBps(value, s.asset.liquidationThresholdBps, d);
  }, [action, amountNative, valid, collateral, debt, s.asset, s.oracle]);

  /** Reasons the program would refuse this specific amount. */
  const objections = useMemo<string[]>(() => {
    const out: string[] = [];
    if (!s.asset || !s.protocol) return ["Market is not available"];
    if (!valid) return [];

    if (amountNative > max) {
      out.push(`Amount is more than the available ${formatTokens(toUi(max))} ${unitSymbol}`);
    }
    if (action === "deposit" && !s.asset.enabled) {
      out.push("This asset is not accepting deposits");
    }
    if (action === "withdraw") {
      if (s.protocol.paused) out.push("Withdrawals are paused right now");
      if (debt > 0n && s.risk) {
        for (const b of s.risk.blockers) {
          if (b === "No remaining borrow capacity") continue;
          if (b === "Protocol vault has no liquidity") continue;
          out.push(b);
        }
        if (projectedHf !== null && projectedHf < minBps) {
          out.push(
            `This would leave a health factor of ${(projectedHf / 10_000).toFixed(2)}, below the ${(minBps / 10_000).toFixed(2)} minimum`
          );
        }
      }
    }
    return Array.from(new Set(out));
  }, [
    s.asset,
    s.protocol,
    s.risk,
    valid,
    amountNative,
    max,
    action,
    debt,
    projectedHf,
    minBps,
    unitSymbol,
  ]);

  const blocked = objections.length > 0 || !valid;

  const submit = async () => {
    setConfirmOpen(false);
    setTxOpen(true);
    const uiAmount = formatTokens(toUi(amountNative));
    await tx.run({
      verb: meta.verb,
      summary: `${uiAmount} ${unitSymbol} ${action === "deposit" ? "deposited" : action === "repay" ? "repaid" : "withdrawn"}`,
      priceUpdate: priceAccount,
      build: (ctx) =>
        action === "deposit"
          ? buildDeposit(ctx, amountNative)
          : action === "repay"
          ? buildRepay(ctx, amountNative)
          : buildWithdraw(ctx, amountNative),
      onSuccess: () => {
        setAmount("");
        s.refresh();
      },
    });
  };

  const value = s.risk?.collateralValueNative ?? 0n;
  const ltvBps = value > 0n ? Number((debt * 10_000n) / value) : 0;

  return (
    <PageContainer
      title="Your position"
      subtitle={`Collateral, borrowed funds and safety metrics for ${display.symbol} on Solana Devnet.`}
    >
      <ConfigNotice />

      {!connected ? (
        <ConnectPrompt what="Your collateral and borrowing" />
      ) : (
        <div className="stack g-16">
          {/* Active Market Selector header card */}
          <Card>
            <div className="row between g-12 wrap" style={{ alignItems: "center" }}>
              <div className="row g-12" style={{ alignItems: "center" }}>
                <span
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 10,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: selectedMarket.quoteSymbol === "WSOL" ? "#9945FF22" : "var(--surface-2)",
                    border: "1px solid var(--border)",
                    flex: "none",
                  }}
                >
                  {display.logo ?? <Icon name="layers" size={20} />}
                </span>
                <div>
                  <div style={{ fontWeight: 750, fontSize: 16 }}>
                    {display.symbol} / {quoteSymbol}
                  </div>
                  <div className="t-meta">{display.name}</div>
                </div>
              </div>

              <div className="row g-8" style={{ alignItems: "center" }}>
                <MarketSelector compact />
                <Link
                  to={`/app/borrow?market=${selectedMarket.symbol}`}
                  className="btn btn--accent btn--sm"
                >
                  Borrow {quoteSymbol}
                </Link>
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <div className="t-label" style={{ marginBottom: 6 }}>
                Switch asset position
              </div>
              <div className="chips wrap">
                {markets.map((m) => {
                  const active =
                    m.symbol === selectedMarket.symbol &&
                    m.quoteSymbol === selectedMarket.quoteSymbol;
                  return (
                    <button
                      key={`${m.symbol}-${m.quoteSymbol}`}
                      type="button"
                      className={`chip ${active ? "chip--active" : ""}`}
                      onClick={() => selectMarket(m.symbol, m.quoteSymbol)}
                      style={{
                        borderColor: active ? "var(--accent)" : undefined,
                        background: active ? "var(--surface-3)" : undefined,
                        fontWeight: active ? 700 : 500,
                      }}
                    >
                      {m.tokenSymbol} ({m.quoteSymbol})
                    </button>
                  );
                })}
              </div>
            </div>
          </Card>

          <PositionSummary
            loading={s.loading}
            position={s.position}
            asset={s.asset}
            risk={s.risk}
            minBps={minBps}
          />

          {!s.loading && !hasPosition ? (
            <Card>
              <Notice tone="neutral" title={`No ${display.symbol} position yet`}>
                You currently have 0 {display.symbol} deposited and 0 {quoteSymbol} borrowed.
                Use the form below to deposit {display.symbol} as collateral.
              </Notice>
            </Card>
          ) : null}

          {hasPosition && (
            <Card title="Risk">
              {s.loading ? (
                <Skeleton height={54} />
              ) : (
                <>
                  <div className="row between g-12 wrap" style={{ marginBottom: 16 }}>
                    <HealthFactor hfBps={s.risk?.healthFactorBps ?? null} minBps={minBps} />
                    <Pill
                      tone={
                        ltvBps > (s.asset?.liquidationThresholdBps ?? 8000)
                          ? "danger"
                          : ltvBps > (s.asset?.baseLtvBps ?? 7000)
                          ? "warning"
                          : "success"
                      }
                    >
                      CURRENT LTV {(ltvBps / 100).toFixed(1)}%
                    </Pill>
                  </div>
                  <RiskBar hfBps={s.risk?.healthFactorBps ?? null} minBps={minBps} />
                </>
              )}
            </Card>
          )}

          {/* Action form: Deposit / Repay / Withdraw */}
          <Card
            title={meta.title}
            action={
              <Segmented<Action>
                label="Position action"
                value={action}
                onChange={(a) => {
                  setAction(a);
                  setAmount("");
                }}
                options={[
                  { value: "deposit", label: "Deposit" },
                  { value: "repay", label: "Repay" },
                  { value: "withdraw", label: "Withdraw" },
                ]}
              />
            }
          >
            <p className="t-sm muted" style={{ marginTop: 0, marginBottom: 16 }}>
              {meta.help}
            </p>

            <div className="field__top">
              <label htmlFor="position-amount" className="t-sm muted">
                {unitSymbol}
              </label>
              <span className="t-sm muted">
                Available: {formatTokens(toUi(max))} {unitSymbol}
              </span>
            </div>

            <input
              id="position-amount"
              className="input"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />

            <div className="chips">
              {[0.25, 0.5, 0.75, 1].map((f) => (
                <button
                  key={f}
                  type="button"
                  className="chip"
                  disabled={max === 0n}
                  onClick={() => setAmount(String(toUi(max) * f))}
                >
                  {f === 1 ? "Max" : `${f * 100}%`}
                </button>
              ))}
            </div>

            {valid && objections.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <BlockedAction title="Cannot complete action" reasons={objections} />
              </div>
            )}

            <div style={{ marginTop: 20 }}>
              <Button
                variant="accent"
                block
                disabled={blocked || !tx.ready || tx.busy}
                loading={tx.busy}
                onClick={() => setConfirmOpen(true)}
              >
                {valid
                  ? `${meta.verb} ${formatTokens(toUi(amountNative))} ${unitSymbol}`
                  : meta.verb}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Confirmation Modal */}
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`Confirm ${meta.verb}`}
      >
        <div className="stack g-16">
          <p className="t-sm muted">
            Please review the details below before submitting the transaction to Solana Devnet.
          </p>
          <DataRow label="Action" value={meta.verb} />
          <DataRow
            label="Amount"
            value={`${formatTokens(toUi(amountNative))} ${unitSymbol}`}
          />
          <DataRow
            label="Asset Pair"
            value={`${display.symbol} / ${quoteSymbol}`}
          />
          <DataRow
            label="Health Factor After"
            value={
              projectedHf !== null ? (
                <HealthFactor hfBps={projectedHf} minBps={minBps} size="sm" />
              ) : (
                "Infinite (No Debt)"
              )
            }
          />
          <div className="row g-8" style={{ marginTop: 12 }}>
            <Button
              variant="secondary"
              block
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="accent"
              block
              loading={tx.busy}
              onClick={submit}
            >
              Confirm & Submit
            </Button>
          </div>
        </div>
      </Modal>

      <TransactionModal
        open={txOpen}
        state={tx.state}
        title={meta.title}
        onClose={() => {
          setTxOpen(false);
          tx.reset();
        }}
        onDone={s.refresh}
      />
    </PageContainer>
  );
}
