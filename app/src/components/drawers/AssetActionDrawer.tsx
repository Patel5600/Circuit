import React, { useMemo, useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { Drawer } from "../ui/Drawer";
import { Button, Card, DataRow, Icon, Notice, Pill, Segmented } from "../ui";
import { AssetLogo } from "../brand/AssetLogo";
import { TransactionStatus } from "../transactions/TransactionModal";
import { useAction, ActionType, ActionIntent } from "../../context/ActionContext";
import { useProtocolState } from "../../hooks/useProtocolState";
import { useTransaction } from "../../hooks/useTransaction";
import { useCircuitDomain } from "../../lib/domain/context";
import { formatMoney, formatPercent, formatTokens } from "../../lib/format";
import {
  buildDeposit,
  buildBorrow,
  buildWithdraw,
  buildRepay,
  toNative,
  toUi,
  collateralValue,
  healthFactorBps,
} from "../../lib/protocol";
import { derivePriceAccount } from "../../lib/pyth";
import { PYTH_FEED_ID } from "../../config";

export function AssetActionDrawer() {
  const { actionIntent } = useAction();

  if (!actionIntent || !actionIntent.market) return null;

  return <AssetActionDrawerContent intent={actionIntent} />;
}

function AssetActionDrawerContent({ intent }: { intent: ActionIntent }) {
  const { closeAction, setActionType } = useAction();
  const { connected, publicKey } = useWallet();
  const { invalidate, risk: domainRisk, credit } = useCircuitDomain();

  const market = intent.market;
  const action = intent.type;

  // Authoritative live state queried specifically for this market
  const s = useProtocolState(market);
  const tx = useTransaction(market);

  const [amount, setAmount] = useState(intent.amount ?? "");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Clear or set amount when action or market changes
  useEffect(() => {
    setAmount(intent.amount ?? "");
    setErrorMsg(null);
    tx.reset?.();
  }, [intent.market.symbol, intent.type, intent.amount]);

  const quoteSymbol = market.quoteSymbol || "USDC";
  const displaySymbol = market.symbol;
  const tokenSymbol = market.tokenSymbol || `${market.symbol}x`;

  const minBps = s.protocol?.minHealthFactorBps ?? 10_000;
  const liqThresholdBps = market.liqThresholdBps || 8000;
  const collateral = s.position?.collateralAmount ?? 0n;
  const debt = s.position?.debtAmount ?? 0n;

  // Oracle Price
  const priceUsd = s.oracle?.priceUsd ?? 0;
  const confBps = s.oracle?.confBps ?? 0;

  // Balances
  const walletEquityUi = toUi(s.walletEquity);
  const walletQuoteUi = toUi(s.walletQuote);
  const collateralUi = toUi(collateral);
  const debtUi = toUi(debt);

  // Risk & Permissions
  const isWithdrawBlocked = credit.permissions.withdraw.status === "BLOCKED";
  const isBorrowBlocked =
    !s.risk?.borrowAllowed || credit.permissions.borrow.status === "BLOCKED";
  const borrowBlockerReason =
    s.risk?.blockers?.[0] ||
    credit.permissions.borrow.reason ||
    "Borrowing is currently restricted by Capital Policy";

  // Compute maximum withdrawable collateral amount
  const maxWithdrawableUi = useMemo(() => {
    if (debt === 0n) {
      return collateralUi;
    }
    if (!s.oracle || priceUsd <= 0) return 0;
    // requiredCollateralUsd = (debt * 10000) / liqThresholdBps
    const requiredCollateralUsd = (debtUi * 10000) / liqThresholdBps;
    const requiredCollateralAmount = requiredCollateralUsd / priceUsd;
    const remaining = collateralUi - requiredCollateralAmount;
    return Math.max(0, Number(remaining.toFixed(4)));
  }, [debt, debtUi, collateralUi, s.oracle, priceUsd, liqThresholdBps]);

  // Compute max borrow available
  const availableBorrowUi = useMemo(() => {
    if (!s.risk) return 0;
    return toUi(s.risk.availableToBorrowNative);
  }, [s.risk]);

  // Projections
  const parsedAmount = Number(amount) || 0;

  const projectedHF = useMemo(() => {
    if (!s.oracle) return null;
    let nextCollateral = collateral;
    let nextDebt = debt;

    if (action === "deposit") {
      nextCollateral = collateral + toNative(parsedAmount);
    } else if (action === "withdraw") {
      const nativeSub = toNative(parsedAmount);
      nextCollateral = nativeSub >= collateral ? 0n : collateral - nativeSub;
    } else if (action === "borrow") {
      nextDebt = debt + toNative(parsedAmount);
    } else if (action === "repay") {
      const nativeSub = toNative(parsedAmount);
      nextDebt = nativeSub >= debt ? 0n : debt - nativeSub;
    }

    if (nextDebt === 0n) return null; // Infinite health
    const val = collateralValue(
      nextCollateral,
      s.oracle.update.price,
      s.oracle.update.exponent
    );
    return healthFactorBps(val, liqThresholdBps, nextDebt);
  }, [action, parsedAmount, collateral, debt, s.oracle, liqThresholdBps]);

  const handlePreset = (percent: number) => {
    let max = 0;
    if (action === "deposit") max = walletEquityUi;
    else if (action === "withdraw") max = maxWithdrawableUi;
    else if (action === "borrow") max = availableBorrowUi;
    else if (action === "repay") max = Math.min(debtUi, walletQuoteUi);

    const val = (max * percent) / 100;
    setAmount(val > 0 ? (val < 1 ? val.toFixed(4) : val.toFixed(2)) : "");
  };

  const handleExecute = async () => {
    if (!parsedAmount || parsedAmount <= 0 || !publicKey) return;
    setErrorMsg(null);

    const amountNative = toNative(parsedAmount);
    const priceAccount = derivePriceAccount(market.feedId || PYTH_FEED_ID, 0);

    let verb = "Deposit";
    let summary = `${parsedAmount} ${tokenSymbol} deposited`;

    if (action === "withdraw") {
      verb = "Withdraw";
      summary = `${parsedAmount} ${tokenSymbol} withdrawn`;
    } else if (action === "borrow") {
      verb = "Borrow";
      summary = `${parsedAmount} ${quoteSymbol} borrowed against ${tokenSymbol}`;
    } else if (action === "repay") {
      verb = "Repay";
      summary = `${parsedAmount} ${quoteSymbol} debt repaid`;
    }

    const success = await tx.run({
      verb,
      summary,
      priceUpdate: priceAccount,
      equityMint: new PublicKey(market.mint),
      quoteMint: new PublicKey(market.quoteMint),
      build: async (ctx) => {
        if (action === "deposit") return buildDeposit(ctx, amountNative);
        if (action === "withdraw") return buildWithdraw(ctx, amountNative);
        if (action === "borrow") return buildBorrow(ctx, amountNative);
        return buildRepay(ctx, amountNative);
      },
      onSuccess: () => {
        invalidate({ portfolio: true, wallet: true, activity: true });
        s.refresh();
        setAmount("");
      },
    });

    if (!success && tx.state.error) {
      setErrorMsg(`${tokenSymbol} ${action} failed: ${tx.state.error}`);
    }
  };

  const isExecuting =
    tx.state.phase === "preparing" ||
    tx.state.phase === "awaiting-wallet" ||
    tx.state.phase === "submitting" ||
    tx.state.phase === "confirming";

  return (
    <Drawer
      open={true}
      onClose={closeAction}
      title={`${market.name} (${tokenSymbol})`}
      subtitle={`Authoritative Contextual Execution · ${market.symbol}/${quoteSymbol}`}
      width={480}
      badge={
        <Pill tone={s.session?.open ? "success" : "neutral"} withDot>
          {s.session?.open ? "NYSE Regular Open" : "NYSE Closed"}
        </Pill>
      }
    >
      <div className="stack g-16" style={{ paddingBottom: 24 }}>
        {/* Asset Identity Card */}
        <div
          style={{
            padding: "14px 16px",
            background: "var(--surface-2, #0d0f15)",
            borderRadius: "var(--r, 10px)",
            border: "1px solid var(--border, #1a1d26)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div className="row g-12" style={{ alignItems: "center" }}>
            <span
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--surface-3, #181b24)",
                border: "1px solid var(--border, #262b3a)",
                flexShrink: 0,
              }}
            >
              <AssetLogo symbol={market.symbol} size={24} />
            </span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                {tokenSymbol}
                <span className="muted" style={{ marginLeft: 6, fontSize: 12, fontWeight: 500 }}>
                  ({market.name})
                </span>
              </div>
              <div className="row g-8" style={{ marginTop: 2, fontSize: 11.5, color: "var(--text-3)" }}>
                <span>Mint: {market.mint.slice(0, 6)}...{market.mint.slice(-4)}</span>
                <span>·</span>
                <span>LTV: {market.baseLtvBps / 100}%</span>
              </div>
            </div>
          </div>

          <div style={{ textAlign: "right" }}>
            <div style={{ fontWeight: 700, fontSize: 15, fontFamily: "var(--mono)" }}>
              {priceUsd > 0 ? `$${formatMoney(priceUsd)}` : "—"}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--mono)" }}>
              {confBps > 0 ? `±${confBps} bps conf` : "Live Pyth"}
            </div>
          </div>
        </div>

        {/* Risk-Adaptive Capital Authority Badge */}
        <div
          style={{
            padding: "12px 14px",
            background: "var(--surface-2, #0d0f15)",
            borderRadius: "var(--r, 10px)",
            border: "1px solid var(--border, #1a1d26)",
          }}
        >
          <div className="row between" style={{ alignItems: "center", marginBottom: 6 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--text-3)",
              }}
            >
              Capital Authority
            </span>
            <Pill
              tone={
                domainRisk.ratchetState === "SAFE"
                  ? "success"
                  : domainRisk.ratchetState === "RESTRICTED"
                  ? "warning"
                  : domainRisk.ratchetState === "DEFENSIVE"
                  ? "warning"
                  : "danger"
              }
              withDot
            >
              {domainRisk.ratchetState}
            </Pill>
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--text-2)",
              lineHeight: 1.4,
              marginBottom: 8,
              fontStyle: "italic",
            }}
          >
            &ldquo;Agents decide what to do. circuit decides what capital they are allowed to risk.&rdquo;
          </div>
          <div
            className="row between"
            style={{
              fontSize: 11,
              color: "var(--text-3)",
              borderTop: "1px solid var(--border, #1a1d26)",
              paddingTop: 6,
            }}
          >
            <span>
              Agent Authority:{" "}
              <strong style={{ color: "var(--text-2)", fontWeight: 600 }}>
                Bounded by Onchain Policy
              </strong>
            </span>
            <span style={{ fontFamily: "var(--mono)" }}>
              {action === "borrow" && isBorrowBlocked
                ? "BORROW_BLOCKED"
                : action === "withdraw" && isWithdrawBlocked
                ? "WITHDRAW_BLOCKED"
                : "ACTION_PERMITTED"}
            </span>
          </div>
        </div>

        {/* Action Type Selector */}
        <Segmented
          label="Action Mode"
          options={[
            { value: "deposit", label: "Deposit" },
            { value: "borrow", label: "Borrow" },
            { value: "withdraw", label: "Withdraw" },
            { value: "repay", label: "Repay" },
          ]}
          value={action}
          onChange={(val) => setActionType(val as ActionType)}
        />

        {/* Policy & Risk Gate Notice */}
        {action === "borrow" && isBorrowBlocked && (
          <Notice tone="warning" title="Borrowing Currently Blocked">
            {borrowBlockerReason}
          </Notice>
        )}

        {action === "withdraw" && isWithdrawBlocked && (
          <Notice tone="danger" title="Withdrawals Blocked by Circuit">
            Withdrawal is locked under Risk Ratchet state {domainRisk.ratchetState} to preserve protocol solvency.
          </Notice>
        )}

        {/* Form Details per Action */}
        <Card>
          <div className="stack g-12">
            {action === "deposit" && (
              <>
                <DataRow
                  label="Wallet Balance"
                  value={`${formatTokens(walletEquityUi)} ${tokenSymbol}`}
                  hint="Available tokenized equities in connected wallet"
                />
                <DataRow
                  label="Current Deposited"
                  value={`${formatTokens(collateralUi)} ${tokenSymbol}`}
                  hint={`$${formatMoney(collateralUi * priceUsd)} collateral value`}
                />
                <DataRow
                  label="Base LTV Ceiling"
                  value={`${market.baseLtvBps / 100}%`}
                  hint={`Liquidation threshold: ${liqThresholdBps / 100}%`}
                />
              </>
            )}

            {action === "borrow" && (
              <>
                <DataRow
                  label="Active Collateral"
                  value={`${formatTokens(collateralUi)} ${tokenSymbol}`}
                  hint={`$${formatMoney(collateralUi * priceUsd)} valuation`}
                />
                <DataRow
                  label="Outstanding Debt"
                  value={`$${formatMoney(debtUi)} ${quoteSymbol}`}
                  hint={debtUi > 0 ? "Existing line of credit" : "No debt"}
                />
                <DataRow
                  label="Available to Borrow"
                  value={`$${formatMoney(availableBorrowUi)} ${quoteSymbol}`}
                  hint={`Under Risk Ratchet ${domainRisk.ratchetState}`}
                />
              </>
            )}

            {action === "withdraw" && (
              <>
                <DataRow
                  label="Total Deposited"
                  value={`${formatTokens(collateralUi)} ${tokenSymbol}`}
                  hint={`Valuation: $${formatMoney(collateralUi * priceUsd)}`}
                />
                <DataRow
                  label="Active Debt"
                  value={`$${formatMoney(debtUi)} ${quoteSymbol}`}
                  hint="Must maintain minimum 1.00x health factor"
                />
                <DataRow
                  label="Max Withdrawable"
                  value={`${formatTokens(maxWithdrawableUi)} ${tokenSymbol}`}
                  hint="Safe withdrawal amount preserving liquidation cushion"
                />
              </>
            )}

            {action === "repay" && (
              <>
                <DataRow
                  label="Current Debt"
                  value={`$${formatMoney(debtUi)} ${quoteSymbol}`}
                  hint="Outstanding principal obligation"
                />
                <DataRow
                  label="Wallet Balance"
                  value={`$${formatMoney(walletQuoteUi)} ${quoteSymbol}`}
                  hint="Available USDC to repay"
                />
                <DataRow
                  label="Current Health Factor"
                  value={
                    s.risk?.healthFactorBps
                      ? `${(s.risk.healthFactorBps / 10000).toFixed(2)}x`
                      : "Infinite (0 Debt)"
                  }
                  hint="Repaying debt restores collateral borrowing capacity"
                />
              </>
            )}

            {/* Input & Quick Presets */}
            <div className="stack g-6" style={{ marginTop: 6 }}>
              <div className="row between g-8" style={{ alignItems: "center" }}>
                <label className="t-label" style={{ margin: 0 }}>
                  Amount ({action === "repay" || action === "borrow" ? quoteSymbol : tokenSymbol})
                </label>
                <div className="row g-4">
                  {[25, 50, 75, 100].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      className="btn btn--ghost btn--xs"
                      onClick={() => handlePreset(pct)}
                      style={{ fontSize: 10, padding: "2px 6px" }}
                    >
                      {pct === 100 ? "MAX" : `${pct}%`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="row g-8" style={{ alignItems: "center" }}>
                <input
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={isExecuting}
                  style={{
                    flex: 1,
                    padding: "10px 14px",
                    background: "var(--surface-1)",
                    border: "1px solid var(--border-strong)",
                    borderRadius: "var(--r)",
                    color: "var(--text)",
                    fontSize: 16,
                    fontFamily: "var(--mono)",
                  }}
                />
              </div>
            </div>

            {/* Live Impact Preview */}
            {parsedAmount > 0 && (
              <div
                style={{
                  padding: "10px 12px",
                  background: "var(--surface-3, #151821)",
                  borderRadius: "var(--r, 8px)",
                  fontSize: 12,
                }}
              >
                <div className="row between g-8">
                  <span className="muted">Projected Health Factor:</span>
                  <span
                    style={{
                      fontWeight: 700,
                      fontFamily: "var(--mono)",
                      color:
                        projectedHF === null
                          ? "var(--success)"
                          : projectedHF >= 15000
                          ? "var(--success)"
                          : projectedHF >= 11000
                          ? "var(--warning)"
                          : "var(--danger)",
                    }}
                  >
                    {projectedHF === null ? "Infinite (Safe)" : `${(projectedHF / 10000).toFixed(2)}x`}
                  </span>
                </div>
                {action === "deposit" && (
                  <div className="row between g-8" style={{ marginTop: 4 }}>
                    <span className="muted">Estimated Collateral Value:</span>
                    <span style={{ fontWeight: 600, fontFamily: "var(--mono)" }}>
                      +${formatMoney(parsedAmount * priceUsd)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>

        {/* Transaction Status Progress */}
        {tx.state.phase !== "idle" && (
          <div
            style={{
              padding: "12px 14px",
              background: "var(--surface-2)",
              borderRadius: "var(--r)",
              border: "1px solid var(--border)",
            }}
          >
            <TransactionStatus state={tx.state} />
          </div>
        )}

        {/* Error Feedback with explicit Asset Context */}
        {errorMsg && (
          <Notice tone="danger" title={`${tokenSymbol} Action Error`}>
            {errorMsg}
          </Notice>
        )}

        {/* Action Button */}
        <div>
          <button
            type="button"
            className="btn btn--accent btn--block"
            disabled={
              !connected ||
              !parsedAmount ||
              parsedAmount <= 0 ||
              isExecuting ||
              (action === "borrow" && isBorrowBlocked) ||
              (action === "withdraw" && isWithdrawBlocked)
            }
            onClick={handleExecute}
            style={{ height: 44, fontSize: 14, fontWeight: 700 }}
          >
            {!connected
              ? "Connect Wallet"
              : isExecuting
              ? tx.state.label || "Processing..."
              : action === "deposit"
              ? `Deposit ${tokenSymbol}`
              : action === "borrow"
              ? `Borrow ${quoteSymbol}`
              : action === "withdraw"
              ? `Withdraw ${tokenSymbol}`
              : `Repay ${quoteSymbol}`}
          </button>
        </div>
      </div>
    </Drawer>
  );
}
