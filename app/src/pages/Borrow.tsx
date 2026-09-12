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
  Notice,
  Pill,
  Skeleton,
} from "../components/ui";
import { BlockedAction, RiskCheckList, buildSafetyChecks } from "../components/risk/SafetyStatus";
import { HealthFactor } from "../components/position/PositionParts";
import { TransactionModal } from "../components/transactions/TransactionModal";
import { useProtocolState } from "../hooks/useProtocolState";
import { useTransaction } from "../hooks/useTransaction";
import { activeAssetDisplay, QUOTE_SYMBOL } from "../lib/asset";
import { formatMoney, formatPercent, formatTokens } from "../lib/format";
import {
  buildBorrow,
  collateralValue,
  healthFactorBps,
  toNative,
  toUi,
} from "../lib/protocol";
import { derivePriceAccount } from "../lib/pyth";
import { PYTH_FEED_ID } from "../config";

function Step({
  n,
  title,
  children,
  done = false,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
  done?: boolean;
}) {
  return (
    <Card>
      <div className="row g-10" style={{ marginBottom: 14 }}>
        <span
          aria-hidden="true"
          style={{
            width: 24,
            height: 24,
            borderRadius: 999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "none",
            fontSize: 11.5,
            fontWeight: 700,
            background: done ? "var(--success-dim)" : "var(--surface-3)",
            color: done ? "var(--success)" : "var(--text-2)",
            border: `1px solid ${done ? "var(--success)" : "var(--border-strong)"}`,
          }}
        >
          {done ? <Icon name="check" size={13} /> : n}
        </span>
        <h2 className="t-title" style={{ margin: 0 }}>
          {title}
        </h2>
      </div>
      {children}
    </Card>
  );
}

export default function Borrow() {
  const s = useProtocolState();
  const { connected } = useWallet();
  const tx = useTransaction();
  const display = useMemo(activeAssetDisplay, []);

  const [amount, setAmount] = useState("");
  const [txOpen, setTxOpen] = useState(false);

  const minBps = s.protocol?.minHealthFactorBps ?? 10_000;
  const collateral = s.position?.collateralAmount ?? 0n;
  const debt = s.position?.debtAmount ?? 0n;
  const hasCollateral = collateral > 0n;

  const priceAccount = useMemo(
    () => s.oracle?.address ?? derivePriceAccount(PYTH_FEED_ID, 0),
    [s.oracle]
  );

  const available = s.risk?.availableToBorrowNative ?? 0n;
  const max = available < s.vaultLiquidity ? available : s.vaultLiquidity;

  const parsed = Number(amount);
  const valid = amount !== "" && Number.isFinite(parsed) && parsed > 0;
  const amountNative = valid ? toNative(parsed) : 0n;

  const newDebt = debt + amountNative;

  const projectedHf = useMemo<number | null>(() => {
    if (!s.asset || !s.oracle || !valid) return null;
    const value = collateralValue(
      collateral,
      s.oracle.update.price,
      s.oracle.update.exponent
    );
    return healthFactorBps(value, s.asset.liquidationThresholdBps, newDebt);
  }, [s.asset, s.oracle, valid, collateral, newDebt]);

  const checks = buildSafetyChecks(s.asset, s.oracle, s.session);
  const gatesPass = checks.every((c) => c.ok);

  /** Amount-specific objections, on top of the market gates. */
  const objections = useMemo<string[]>(() => {
    const out: string[] = [];
    if (!valid) return out;
    if (amountNative > max) {
      out.push(
        `Above your current limit of $${formatMoney(toUi(max))}`
      );
    }
    if (s.protocol?.paused) out.push("Borrowing is paused right now");
    if (projectedHf !== null && projectedHf < minBps) {
      out.push(
        `This would leave a health factor of ${(projectedHf / 10_000).toFixed(2)}, below the ${(minBps / 10_000).toFixed(2)} minimum`
      );
    }
    if (s.risk) {
      for (const b of s.risk.blockers) {
        if (b === "No remaining borrow capacity" && amountNative <= max) continue;
        out.push(b);
      }
    }
    return Array.from(new Set(out));
  }, [valid, amountNative, max, s.protocol, s.risk, projectedHf, minBps]);

  const canSubmit = valid && objections.length === 0 && tx.ready && !tx.busy;

  const submit = async () => {
    setTxOpen(true);
    await tx.run({
      verb: "Borrow",
      summary: `$${formatMoney(toUi(amountNative))} ${QUOTE_SYMBOL} borrowed`,
      priceUpdate: priceAccount,
      build: (ctx) => buildBorrow(ctx, amountNative),
      onSuccess: () => {
        setAmount("");
        s.refresh();
      },
    });
  };

  if (!connected) {
    return (
      <PageContainer title="Borrow" subtitle="Borrow against your tokenized equity.">
        <ConfigNotice />
        <ConnectPrompt what="Your borrowing capacity" />
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="Borrow"
      subtitle={`Borrow ${QUOTE_SYMBOL} against your deposited collateral. Every borrow is checked against live market conditions first.`}
      narrow
    >
      <ConfigNotice />

      {!s.loading && !hasCollateral ? (
        <NoPositionPrompt />
      ) : (
        <div className="stack g-16">
          {/* Step 1 - asset */}
          <Step n={1} title="Asset" done>
            <div className="row g-12">
              <span
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  flex: "none",
                }}
              >
                {display.logo ?? <Icon name="layers" size={17} />}
              </span>
              <div className="grow">
                <div style={{ fontWeight: 650 }}>{display.symbol}</div>
                <div className="t-meta">{display.name}</div>
              </div>
              <Pill tone="success" withDot>
                REGISTERED
              </Pill>
            </div>
          </Step>

          {/* Step 2 - collateral */}
          <Step n={2} title="Your collateral" done={hasCollateral}>
            {s.loading ? (
              <Skeleton height={22} width="55%" />
            ) : (
              <>
                <DataRow
                  label="Deposited"
                  value={`${formatTokens(toUi(collateral))} ${display.symbol}`}
                />
                <DataRow
                  label="Value"
                  value={`$${formatMoney(toUi(s.risk?.collateralValueNative ?? 0n))}`}
                />
                <DataRow
                  label="Borrowing limit"
                  value={
                    s.asset
                      ? `${formatPercent(s.asset.baseLtvBps)} of collateral value`
                      : "--"
                  }
                />
              </>
            )}
          </Step>

          {/* Step 3 - amount */}
          <Step n={3} title={`Amount to borrow`} done={valid && objections.length === 0}>
            <div className="field__top">
              <label htmlFor="borrow-amount" className="t-sm muted">
                {QUOTE_SYMBOL}
              </label>
              <span className="t-sm muted">
                Available ${formatMoney(toUi(max))}
              </span>
            </div>

            <input
              id="borrow-amount"
              className="input"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-describedby="borrow-projection"
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

            <div id="borrow-projection" style={{ marginTop: 18 }}>
              <DataRow label="Currently borrowed" value={`$${formatMoney(toUi(debt))}`} />
              <DataRow
                label="After this borrow"
                value={`$${formatMoney(toUi(newDebt))}`}
              />
              <DataRow
                label="Remaining capacity"
                value={`$${formatMoney(Math.max(0, toUi(max) - (valid ? parsed : 0)))}`}
              />
              <div className="drow">
                <span className="drow__k">Health factor after</span>
                <span className="drow__v">
                  {valid ? (
                    <HealthFactor hfBps={projectedHf} minBps={minBps} size="sm" />
                  ) : (
                    <span className="dim">Enter an amount</span>
                  )}
                </span>
              </div>
            </div>
          </Step>

          {/* Step 4 - market check */}
          <Step n={4} title="Market check" done={gatesPass}>
            {s.loading ? (
              <div className="stack g-10">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} height={18} />
                ))}
              </div>
            ) : (
              <>
                <RiskCheckList checks={checks} />
                <div style={{ marginTop: 14 }}>
                  {gatesPass ? (
                    <Notice tone="success" title="Borrowing allowed">
                      All conditions the protocol requires are currently
                      satisfied.
                    </Notice>
                  ) : (
                    <BlockedAction
                      reasons={checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.status.toLowerCase()}`)}
                    />
                  )}
                </div>
              </>
            )}
          </Step>

          {valid && objections.length > 0 && gatesPass && (
            <BlockedAction title="Cannot borrow this amount" reasons={objections} />
          )}

          <div className="stickyaction">
            <Button
              variant="accent"
              block
              disabled={!canSubmit}
              loading={tx.busy}
              onClick={submit}
            >
              {valid
                ? `Borrow $${formatMoney(toUi(amountNative))} ${QUOTE_SYMBOL}`
                : `Borrow ${QUOTE_SYMBOL}`}
            </Button>
          </div>

          <p className="t-meta center">
            Borrowed funds are sent to your wallet.{" "}
            <Link to="/app/learn" style={{ color: "var(--accent)" }}>
              How borrowing works
            </Link>
          </p>
        </div>
      )}

      <TransactionModal
        open={txOpen}
        state={tx.state}
        title="Borrow"
        onClose={() => {
          setTxOpen(false);
          tx.reset();
        }}
        onDone={s.refresh}
      />
    </PageContainer>
  );
}
