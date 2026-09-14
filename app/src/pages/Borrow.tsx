import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";

import { PageContainer } from "../components/layout/AppShell";
import { ConfigNotice, ConnectPrompt } from "../components/layout/Guards";
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
import { MarketSelector } from "../components/market/MarketSelector";
import { useProtocolState } from "../hooks/useProtocolState";
import { useTransaction } from "../hooks/useTransaction";
import { useMarket } from "../context/MarketContext";
import { useCircuitDomain } from "../lib/domain/context";
import { activeAssetDisplay } from "../lib/asset";
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
  action,
  children,
  done = false,
}: {
  n: number;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  done?: boolean;
}) {
  return (
    <Card>
      <div className="row between g-10" style={{ marginBottom: 14, alignItems: "center" }}>
        <div className="row g-10" style={{ alignItems: "center" }}>
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
        {action && <div>{action}</div>}
      </div>
      {children}
    </Card>
  );
}

export default function Borrow() {
  const { selectedMarket, markets, selectMarket } = useMarket();
  const s = useProtocolState();
  const { connected, publicKey } = useWallet();
  const { invalidate, risk, credit } = useCircuitDomain();
  const tx = useTransaction();

  const display = useMemo(() => activeAssetDisplay(selectedMarket), [selectedMarket]);
  const quoteSymbol = selectedMarket.quoteSymbol || "USDC";
  const isSolBorrow = quoteSymbol === "WSOL";

  const [amount, setAmount] = useState("");
  const [txOpen, setTxOpen] = useState(false);

  const minBps = s.protocol?.minHealthFactorBps ?? 10_000;
  const collateral = s.position?.collateralAmount ?? 0n;
  const debt = s.position?.debtAmount ?? 0n;
  const hasCollateral = collateral > 0n;

  const priceAccount = useMemo(
    () => s.oracle?.address ?? derivePriceAccount(selectedMarket.feedId || PYTH_FEED_ID, 0),
    [s.oracle, selectedMarket.feedId]
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
    if (credit.permissions.borrow.status === "BLOCKED") {
      out.push(
        credit.permissions.borrow.reason ||
          `Blocked by Circuit: Risk Ratchet in ${risk.ratchetState} state`
      );
    }
    if (amountNative > max) {
      out.push(
        `Above your current limit of ${isSolBorrow ? "" : "$"}${formatMoney(toUi(max))} ${quoteSymbol}`
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
  }, [valid, amountNative, max, s.protocol, s.risk, projectedHf, minBps, isSolBorrow, quoteSymbol, credit, risk]);

  const canSubmit = valid && objections.length === 0 && tx.ready && !tx.busy;

  const submit = async () => {
    setTxOpen(true);
    await tx.run({
      verb: "Borrow",
      summary: `${formatMoney(toUi(amountNative))} ${quoteSymbol} borrowed against ${display.symbol}`,
      priceUpdate: priceAccount,
      build: (ctx) => buildBorrow(ctx, amountNative),
      onSuccess: () => {
        setAmount("");
        s.refresh();
        invalidate({ portfolio: true, wallet: true, activity: true });
      },
    });
  };

  if (!connected) {
    return (
      <PageContainer title="Borrow" subtitle="Borrow USDC or SOL against your tokenized equity collateral.">
        <ConfigNotice />
        <ConnectPrompt what="Your borrowing capacity" />
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="Borrow"
      subtitle={`Borrow ${quoteSymbol} against your deposited ${display.symbol} collateral. Every borrow is checked against live Pyth feeds and market conditions.`}
      narrow
    >
      <ConfigNotice />

      <div className="stack g-16">
        {/* Real Risk Ratchet State & Credit Policy Banner */}
        <div
          style={{
            padding: "12px 16px",
            background:
              risk.ratchetState === "SAFE"
                ? "rgba(127, 195, 154, 0.08)"
                : risk.ratchetState === "RESTRICTED"
                ? "rgba(207, 173, 116, 0.08)"
                : "rgba(207, 139, 139, 0.12)",
            border: `1px solid ${
              risk.ratchetState === "SAFE"
                ? "rgba(127, 195, 154, 0.3)"
                : risk.ratchetState === "RESTRICTED"
                ? "rgba(207, 173, 116, 0.3)"
                : "rgba(207, 139, 139, 0.4)"
            }`,
            borderRadius: "var(--r)",
          }}
        >
          <div className="row between g-12" style={{ alignItems: "center" }}>
            <div className="row g-10" style={{ alignItems: "center" }}>
              <Pill
                tone={
                  risk.ratchetState === "SAFE"
                    ? "success"
                    : risk.ratchetState === "RESTRICTED"
                    ? "warning"
                    : "danger"
                }
                withDot
              >
                RATCHET: {risk.ratchetState}
              </Pill>
              <span style={{ fontSize: 13, color: "var(--text-2)" }}>
                {risk.ratchetState === "SAFE"
                  ? "Market & oracle nominal. Full credit permissions active."
                  : credit.permissions.borrow.reason ||
                    `Credit constrained under ${risk.ratchetState} protocol policy.`}
              </span>
            </div>
            <Link
              to="/app/verify"
              className="btn btn--secondary btn--sm"
              style={{ fontSize: 11, padding: "2px 8px", height: 24, textDecoration: "none" }}
            >
              Inspect Proof &rarr;
            </Link>
          </div>
        </div>

        {/* Step 1 - Market & Collateral Selection */}
        <Step
          n={1}
          title="Collateral asset & quote"
          action={<MarketSelector compact />}
          done
        >
          <div className="row g-12 wrap" style={{ alignItems: "center" }}>
            <span
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: isSolBorrow ? "#9945FF22" : "var(--surface-2)",
                border: `1px solid ${isSolBorrow ? "#9945FF55" : "var(--border)"}`,
                flex: "none",
              }}
            >
              {display.logo ?? <Icon name="layers" size={18} />}
            </span>
            <div className="grow" style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>
                {display.symbol}{" "}
                <span className="muted" style={{ fontWeight: 500, fontSize: 13 }}>
                  / {quoteSymbol}
                </span>
              </div>
              <div className="t-meta">{display.name}</div>
            </div>
            <Pill tone={isSolBorrow ? "accent" : "success"} withDot>
              {isSolBorrow ? "BORROW SOL" : "REGISTERED ON DEVNET"}
            </Pill>
          </div>

          <div style={{ marginTop: 14 }}>
            <div className="t-label" style={{ marginBottom: 6 }}>
              Quick switch stock market
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
        </Step>

        {/* Step 2 - Collateral Status */}
        <Step n={2} title="Your collateral" done={hasCollateral}>
          {s.loading ? (
            <Skeleton height={22} width="55%" />
          ) : !hasCollateral ? (
            <div className="stack g-12">
              <Notice tone="warning" title={`No ${display.symbol} collateral deposited`}>
                You need to deposit {display.symbol} before you can borrow {quoteSymbol} against it.
              </Notice>
              <div className="row g-8 wrap">
                <Link
                  to={`/app/position?market=${selectedMarket.symbol}`}
                  className="btn btn--accent btn--sm"
                >
                  Deposit {display.symbol} now
                </Link>
                <Link to="/app/faucet" className="btn btn--secondary btn--sm">
                  <Icon name="faucet" size={14} />
                  Get Free Test {display.symbol}
                </Link>
                <Link to="/app/markets" className="btn btn--secondary btn--sm">
                  View other markets
                </Link>
              </div>
            </div>
          ) : (
            <>
              <DataRow
                label="Deposited"
                value={`${formatTokens(toUi(collateral))} ${display.symbol}`}
              />
              <DataRow
                label="Collateral value"
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
              <DataRow
                label="Protocol lendable liquidity"
                value={`${formatMoney(toUi(s.vaultLiquidity))} ${quoteSymbol}`}
              />
            </>
          )}
        </Step>

        {/* Step 3 - Amount to borrow (Only active when collateral is present) */}
        {hasCollateral && (
          <Step n={3} title={`Amount to borrow`} done={valid && objections.length === 0}>
            <div className="field__top">
              <label htmlFor="borrow-amount" className="t-sm muted">
                {quoteSymbol}
              </label>
              <span className="t-sm muted">
                Available: {isSolBorrow ? "" : "$"}{formatMoney(toUi(max))} {quoteSymbol}
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
              <DataRow
                label="Currently borrowed"
                value={`${isSolBorrow ? "" : "$"}${formatMoney(toUi(debt))} ${quoteSymbol}`}
              />
              <DataRow
                label="After this borrow"
                value={`${isSolBorrow ? "" : "$"}${formatMoney(toUi(newDebt))} ${quoteSymbol}`}
              />
              <DataRow
                label="Remaining capacity"
                value={`${isSolBorrow ? "" : "$"}${formatMoney(Math.max(0, toUi(max) - (valid ? parsed : 0)))} ${quoteSymbol}`}
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
        )}

        {/* Step 4 - Live market safety check */}
        {hasCollateral && (
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
                      All risk conditions the protocol requires are currently satisfied.
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
        )}

        {hasCollateral && valid && objections.length > 0 && gatesPass && (
          <BlockedAction title="Cannot borrow this amount" reasons={objections} />
        )}

        {hasCollateral && (
          <div className="stickyaction">
            <Button
              variant="accent"
              block
              disabled={!canSubmit}
              loading={tx.busy}
              onClick={submit}
            >
              {credit.permissions.borrow.status === "BLOCKED"
                ? `Blocked by Circuit: ${risk.ratchetState}`
                : valid
                ? `Borrow ${formatMoney(toUi(amountNative))} ${quoteSymbol}`
                : `Borrow ${quoteSymbol}`}
            </Button>
          </div>
        )}

        <p className="t-meta center">
          Borrowed funds are sent directly to your connected wallet ATA.{" "}
          <Link to="/app/learn" style={{ color: "var(--accent)" }}>
            How borrowing works
          </Link>
        </p>
      </div>

      <TransactionModal
        open={txOpen}
        state={tx.state}
        title="Borrow"
        action="Borrow"
        asset={quoteSymbol}
        amount={amount ? `$${amount}` : undefined}
        wallet={publicKey?.toBase58()}
        onClose={() => {
          setTxOpen(false);
          tx.reset();
        }}
        onDone={() => {
          s.refresh();
          invalidate({ portfolio: true, wallet: true, activity: true });
        }}
      />
    </PageContainer>
  );
}
