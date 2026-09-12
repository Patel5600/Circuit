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
import { useProtocolState } from "../hooks/useProtocolState";
import { useTransaction } from "../hooks/useTransaction";
import { activeAssetDisplay, QUOTE_SYMBOL } from "../lib/asset";
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
  const s = useProtocolState();
  const { connected } = useWallet();
  const tx = useTransaction();
  const display = useMemo(activeAssetDisplay, []);

  const [action, setAction] = useState<Action>("deposit");
  const [amount, setAmount] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [txOpen, setTxOpen] = useState(false);

  const minBps = s.protocol?.minHealthFactorBps ?? 10_000;
  const collateral = s.position?.collateralAmount ?? 0n;
  const debt = s.position?.debtAmount ?? 0n;
  const hasPosition = collateral > 0n || debt > 0n;

  const priceAccount = useMemo(
    () => s.oracle?.address ?? derivePriceAccount(PYTH_FEED_ID, 0),
    [s.oracle]
  );

  const meta = ACTION_META[action];
  const unitSymbol = meta.unit === "collateral" ? display.symbol : QUOTE_SYMBOL;

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
      // With debt outstanding, withdrawing is risk-increasing and carries the
      // full gate set plus a health check.
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
      subtitle="Collateral, borrowed funds and how much room you have before liquidation."
    >
      <ConfigNotice />

      {!connected ? (
        <ConnectPrompt what="Your collateral and borrowing" />
      ) : (
        <div className="stack g-16">
          <PositionSummary
            loading={s.loading}
            position={s.position}
            asset={s.asset}
            risk={s.risk}
            minBps={minBps}
          />

          {!s.loading && !hasPosition && <NoPositionPrompt />}

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
                        (s.risk?.healthFactorBps ?? null) === null
                          ? "success"
                          : (s.risk!.healthFactorBps as number) < minBps
                          ? "danger"
                          : "success"
                      }
                    >
                      {(s.risk?.healthFactorBps ?? null) === null ||
                      (s.risk!.healthFactorBps as number) >= minBps
                        ? "NOT LIQUIDATABLE"
                        : "LIQUIDATABLE"}
                    </Pill>
                  </div>

                  <RiskBar hfBps={s.risk?.healthFactorBps ?? null} minBps={minBps} />

                  <div style={{ marginTop: 18 }}>
                    <DataRow label="Borrowed against collateral" value={formatPercent(ltvBps, 1)} />
                    <DataRow
                      label="Liquidation threshold"
                      value={s.asset ? formatPercent(s.asset.liquidationThresholdBps) : "--"}
                    />
                    <DataRow
                      label="Status"
                      value={healthLabel(s.risk?.healthFactorBps ?? null, minBps)}
                    />
                  </div>
                </>
              )}
            </Card>
          )}

          <div className="grid grid--2">
            <CollateralCard
              loading={s.loading}
              position={s.position}
              risk={s.risk}
              symbol={display.symbol}
              name={display.name}
              priceUsd={s.oracle?.priceUsd ?? null}
              logo={display.logo}
            />

            <Card title="Manage position">
              <div style={{ marginBottom: 14 }}>
                <Segmented<Action>
                  label="Choose an action"
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
              </div>

              <p className="t-meta" style={{ marginBottom: 12 }}>
                {meta.help}
              </p>

              <div className="field__top">
                <label htmlFor="pos-amount" className="t-sm muted">
                  Amount in {unitSymbol}
                </label>
                <button
                  type="button"
                  className="t-sm"
                  style={{ color: max > 0n ? "var(--accent)" : "var(--text-3)" }}
                  disabled={max === 0n}
                  onClick={() => setAmount(String(toUi(max)))}
                >
                  Max {formatTokens(toUi(max))}
                </button>
              </div>

              <input
                id="pos-amount"
                className="input"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />

              {valid && projectedHf !== null && (
                <p className="t-meta" style={{ marginTop: 10 }}>
                  Health factor after this action:{" "}
                  <strong
                    style={{
                      color: projectedHf < minBps ? "var(--danger)" : "var(--success)",
                    }}
                  >
                    {(projectedHf / 10_000).toFixed(2)}
                  </strong>
                </p>
              )}

              {valid && objections.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <BlockedAction
                    title={`${meta.verb} unavailable`}
                    reasons={objections}
                    note="Nothing has been submitted and your position is unchanged."
                  />
                </div>
              )}

              <Button
                variant={action === "withdraw" ? "secondary" : "primary"}
                block
                disabled={blocked || tx.busy || !tx.ready}
                loading={tx.busy}
                onClick={() =>
                  action === "deposit" ? submit() : setConfirmOpen(true)
                }
                style={{ marginTop: 16 }}
              >
                {meta.verb} {valid ? `${formatTokens(toUi(amountNative))} ${unitSymbol}` : unitSymbol}
              </Button>
            </Card>
          </div>

          <Card title="Borrow more" quiet>
            <div className="row between g-12 wrap">
              <p className="t-sm muted" style={{ maxWidth: "48ch" }}>
                Borrowing has its own checks and a dedicated flow so you can see
                the effect before confirming.
              </p>
              <Link to="/app/borrow" className="btn btn--accent btn--sm">
                Go to borrow
                <Icon name="arrowRight" size={15} />
              </Link>
            </div>
          </Card>
        </div>
      )}

      {/* Confirmation for the two actions that reduce safety or move funds out. */}
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`Confirm ${meta.verb.toLowerCase()}`}
      >
        <div className="stack g-16">
          <p className="t-sm muted">{meta.help}</p>
          <div>
            <DataRow
              label="Amount"
              value={`${formatTokens(toUi(amountNative))} ${unitSymbol}`}
            />
            {projectedHf !== null && (
              <DataRow
                label="Health factor after"
                value={(projectedHf / 10_000).toFixed(2)}
                tone={projectedHf < minBps ? "danger" : "success"}
              />
            )}
          </div>
          {action === "withdraw" && debt > 0n && (
            <Notice tone="warning" title="You still have borrowed funds">
              Withdrawing collateral while you owe money reduces your safety
              margin.
            </Notice>
          )}
          <div className="row g-8">
            <Button variant="ghost" block onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" block onClick={submit}>
              Confirm
            </Button>
          </div>
        </div>
      </Modal>

      <TransactionModal
        open={txOpen}
        state={tx.state}
        title={meta.verb}
        onClose={() => {
          setTxOpen(false);
          tx.reset();
        }}
        onDone={s.refresh}
      />
    </PageContainer>
  );
}
