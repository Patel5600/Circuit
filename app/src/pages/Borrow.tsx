import React, { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
import { RiskTopology3D } from "../components/risk/RiskTopology3D";
import { RiskSensitivityMatrix } from "../components/risk/RiskSensitivityMatrix";
import { MarketSelector } from "../components/market/MarketSelector";
import { useProtocolState } from "../hooks/useProtocolState";
import { useTransaction } from "../hooks/useTransaction";
import { useMarket } from "../context/MarketContext";
import { useAction } from "../context/ActionContext";
import { getDeployedMarket } from "../data/markets";
import { useCircuitDomain } from "../lib/domain/context";
import { PolicyVisualizationCard } from "../components/authority/PolicyVisualizationCard";
import { PermissionPreviewCard } from "../components/authority/PermissionPreviewCard";
import { activeAssetDisplay } from "../lib/asset";
import { formatMoney, formatPercent, formatTokens } from "../lib/format";
import {
  buildBorrow,
  calculateProtocolFee,
  collateralValue,
  healthFactorBps,
  toNative,
  toUi,
} from "../lib/protocol";
import { derivePriceAccount } from "../lib/pyth";
import { CIRCUIT_TREASURY_ADDRESS, PYTH_FEED_ID } from "../config";

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
  const [searchParams] = useSearchParams();
  const { openAction } = useAction();

  const marketQuery = searchParams.get("market");
  const quoteQuery = searchParams.get("quote");

  const activeMarket = useMemo(() => {
    if (marketQuery) {
      const found = getDeployedMarket(marketQuery, quoteQuery ?? undefined);
      if (found) return found;
    }
    return selectedMarket;
  }, [marketQuery, quoteQuery, selectedMarket]);

  const s = useProtocolState(activeMarket);
  const { connected, publicKey } = useWallet();
  const {
    invalidate,
    risk,
    credit,
    portfolio,
    getAgentAuthorityForAsset,
    controlMode,
    evaluatePermissionForAction,
    evaluateDecision,
    decision,
  } = useCircuitDomain();
  const tx = useTransaction(activeMarket);

  const display = useMemo(() => activeAssetDisplay(activeMarket), [activeMarket]);
  const quoteSymbol = activeMarket.quoteSymbol || "USDC";
  const isSolBorrow = quoteSymbol === "WSOL";

  const agentAuth = useMemo(() => {
    return getAgentAuthorityForAsset(activeMarket.symbol);
  }, [getAgentAuthorityForAsset, activeMarket.symbol]);

  const [amount, setAmount] = useState("");
  const [txOpen, setTxOpen] = useState(false);
  const [riskModelView, setRiskModelView] = useState<"none" | "topology3d" | "sensitivity">("none");

  const minBps = s.protocol?.minHealthFactorBps ?? 10_000;
  const collateral = s.position?.collateralAmount ?? 0n;
  const debt = s.position?.debtAmount ?? 0n;
  const hasCollateral = collateral > 0n;

  const collateralPriceUsd = useMemo(() => {
    if (s.oracle?.update) {
      return Number(s.oracle.update.price) * Math.pow(10, s.oracle.update.exponent);
    }
    return null;
  }, [s.oracle]);

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

  const permResult = useMemo(() => {
    return evaluatePermissionForAction("borrow", valid ? parsed : 0, activeMarket.symbol);
  }, [evaluatePermissionForAction, valid, parsed, activeMarket.symbol]);

  const decisionResult = useMemo(() => {
    return evaluateDecision("borrow", valid ? parsed : 0, activeMarket.symbol);
  }, [evaluateDecision, valid, parsed, activeMarket.symbol]);

  const projectedHf = useMemo<number | null>(() => {
    if (!s.asset || !s.oracle || !valid) return null;
    const value = collateralValue(
      collateral,
      s.oracle.update.price,
      s.oracle.update.exponent
    );
    return healthFactorBps(value, s.asset.liquidationThresholdBps, newDebt);
  }, [s.asset, s.oracle, valid, collateral, newDebt]);

  const feeBps = s.protocol?.borrowFeeBps ?? 25;
  const feeEnabled = s.protocol?.feeEnabled ?? true;
  const feeDetails = useMemo(() => {
    return calculateProtocolFee(amountNative, feeBps, feeEnabled);
  }, [amountNative, feeBps, feeEnabled]);

  const checks = buildSafetyChecks(s.asset, s.oracle, s.session);
  const gatesPass = checks.every((c) => c.ok);

  /** Amount-specific objections, on top of the market gates. */
  const objections = useMemo<string[]>(() => {
    const out: string[] = [];
    if (!valid) return out;
    if (decisionResult.verdict.status !== "ALLOW") {
      out.push(decisionResult.verdict.reason);
    }
    if (amountNative > max) {
      out.push(
        `Above your current limit of ${isSolBorrow ? "" : "$"}${formatMoney(toUi(max))} ${quoteSymbol}`
      );
    }
    if (s.protocol?.paused || !decisionResult.capitalPolicy.borrowAllowed) {
      out.push("Borrowing is paused right now by protocol policy");
    }
    if (projectedHf !== null && projectedHf < minBps) {
      out.push(
        `This would leave a health factor of ${(projectedHf / 10_000).toFixed(2)}, below the ${(minBps / 10_000).toFixed(2)} minimum`
      );
    }
    return Array.from(new Set(out));
  }, [valid, decisionResult, amountNative, max, isSolBorrow, quoteSymbol, s.protocol, projectedHf, minBps]);

  const canSubmit = valid && decisionResult.verdict.status === "ALLOW" && objections.length === 0 && tx.ready && !tx.busy;

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
        {/* Control Mode Context & Authority Pathway Banner */}
        <div
          style={{
            padding: "12px 16px",
            background:
              controlMode === "MANUAL"
                ? "var(--surface-2)"
                : "rgba(245, 158, 11, 0.08)",
            border: `1px solid ${
              controlMode === "MANUAL"
                ? "var(--border)"
                : "rgba(245, 158, 11, 0.25)"
            }`,
            borderRadius: "var(--r)",
          }}
          className="row between g-12"
        >
          <div className="row g-10" style={{ alignItems: "center" }}>
            <Pill tone={controlMode === "MANUAL" ? "neutral" : "warning"} withDot>
              {controlMode === "MANUAL" ? "MANUAL MODE" : "AGENT MODE"}
            </Pill>
            <span style={{ fontSize: 12.5, color: "var(--text-2)" }}>
              {controlMode === "MANUAL"
                ? "Direct sovereign wallet execution. Evaluated by Circuit Permission Engine."
                : `Bounded strategy execution (${agentAuth.strategyName}). Subject to owner delegation.`}
            </span>
          </div>
          <span
            className="mono"
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: permResult.allowed ? "var(--success)" : "var(--danger)",
            }}
          >
            {permResult.reasonCode}
          </span>
        </div>

        {controlMode === "AUTONOMOUS" && (
          <PolicyVisualizationCard assetSymbol={activeMarket.symbol} />
        )}

        {/* Real Risk Ratchet State & Credit Policy Banner */}
        <div
          style={{
            padding: "12px 16px",
            background:
              s.protocol?.paused || !decisionResult.capitalPolicy.borrowAllowed
                ? "rgba(207, 139, 139, 0.12)"
                : decisionResult.risk.state === "SAFE"
                ? "rgba(127, 195, 154, 0.08)"
                : decisionResult.risk.state === "RESTRICTED"
                ? "rgba(207, 173, 116, 0.08)"
                : "rgba(207, 139, 139, 0.12)",
            border: `1px solid ${
              s.protocol?.paused || !decisionResult.capitalPolicy.borrowAllowed
                ? "rgba(207, 139, 139, 0.4)"
                : decisionResult.risk.state === "SAFE"
                ? "rgba(127, 195, 154, 0.3)"
                : decisionResult.risk.state === "RESTRICTED"
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
                  s.protocol?.paused || !decisionResult.capitalPolicy.borrowAllowed
                    ? "danger"
                    : decisionResult.risk.state === "SAFE"
                    ? "success"
                    : decisionResult.risk.state === "RESTRICTED"
                    ? "warning"
                    : "danger"
                }
                withDot
              >
                {s.protocol?.paused || !decisionResult.capitalPolicy.borrowAllowed
                  ? "POLICY: PAUSED"
                  : `RATCHET: ${decisionResult.risk.state}`}
              </Pill>
              <span style={{ fontSize: 13, color: "var(--text-2)" }}>
                {s.protocol?.paused || !decisionResult.capitalPolicy.borrowAllowed
                  ? "New borrowing is paused by protocol capital policy."
                  : decisionResult.verdict.status !== "ALLOW"
                  ? decisionResult.verdict.reason
                  : decisionResult.risk.state === "SAFE"
                  ? "Market & oracle nominal. Full credit permissions active."
                  : `Credit constrained under ${decisionResult.risk.state} protocol policy.`}
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

        {/* Structured Protocol Rejection Card */}
        {!permResult.allowed && permResult.reasonCode !== "INSUFFICIENT_COLLATERAL" && (
          <div
            style={{
              padding: 16,
              background: "rgba(207, 139, 139, 0.08)",
              border: "1px solid rgba(207, 139, 139, 0.35)",
              borderRadius: "var(--r)",
            }}
            className="stack g-10"
          >
            <div className="row between g-8" style={{ alignItems: "center" }}>
              <span
                style={{
                  fontWeight: 750,
                  color: "var(--danger)",
                  fontSize: 13,
                  letterSpacing: "0.04em",
                }}
              >
                BORROW RESTRICTED BY PROTOCOL
              </span>
              <Pill tone="danger" withDot>
                {risk.ratchetState}
              </Pill>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.5 }}>
              Circuit Permission Engine: <strong>{permResult.message}</strong>
            </div>
            <div className="grid grid--2 g-8" style={{ marginTop: 4 }}>
              <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                Risk State: <span style={{ color: "var(--danger)", fontWeight: 650 }}>{risk.ratchetState}</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                Reason Code: <span style={{ color: "var(--text-2)", fontWeight: 600 }}>{permResult.reasonCode}</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                Oracle Freshness: <span style={{ color: s.oracle?.ageSeconds && s.oracle.ageSeconds < 30 ? "var(--success)" : "var(--warning)", fontWeight: 650 }}>{s.oracle?.ageSeconds && s.oracle.ageSeconds < 30 ? "LIVE" : "STALE"}</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                Execution Mode: <span style={{ color: "var(--text-2)", fontWeight: 600 }}>{controlMode}</span>
              </div>
            </div>
          </div>
        )}

        {/* Capital & Authority Parameters Summary Card */}
        <Card>
          <div className="t-label" style={{ marginBottom: 12 }}>
            Capital & Authority Parameters ({display.symbol})
          </div>
          <div className="grid grid--2 g-12">
            <DataRow
              label="Collateral Deposited"
              value={`$${formatMoney(toUi(s.risk?.collateralValueNative ?? 0n))}`}
            />
            <DataRow
              label="Current Debt"
              value={`$${formatMoney(toUi(debt))} ${quoteSymbol}`}
            />
            <DataRow
              label="Current LTV"
              value={`${(toUi(s.risk?.collateralValueNative ?? 0n) > 0 ? (toUi(debt) / toUi(s.risk?.collateralValueNative ?? 0n)) * 100 : 0).toFixed(1)}%`}
            />
            <DataRow
              label="Effective LTV Limit"
              value={`${formatPercent(portfolio.effectiveLtvBps)}`}
            />
            <DataRow
              label="Available Borrow"
              value={
                <span className="mono" style={{ fontWeight: 700, color: "var(--accent)" }}>
                  ${formatMoney(toUi(max))} {quoteSymbol}
                </span>
              }
            />
            <DataRow
              label="Protocol Risk State"
              value={
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
                  {risk.ratchetState}
                </Pill>
              }
            />
            {controlMode === "MANUAL" ? (
              <>
                <DataRow
                  label="Execution Authority"
                  value={
                    <Pill tone="success" withDot>
                      HUMAN · WALLET DIRECT
                    </Pill>
                  }
                />
                <DataRow
                  label="Agent Dependency"
                  value={
                    <span className="mono" style={{ fontSize: 12, color: "var(--text-3)" }}>
                      NONE (SOVEREIGN)
                    </span>
                  }
                />
              </>
            ) : (
              <>
                <DataRow
                  label="Agent Strategy Authority"
                  value={
                    <Pill
                      tone={
                        agentAuth.effectiveAuthority === "FULL"
                          ? "success"
                          : agentAuth.effectiveAuthority === "LIMITED"
                          ? "warning"
                          : "danger"
                      }
                      withDot
                    >
                      {agentAuth.status} · {agentAuth.effectiveAuthority}
                    </Pill>
                  }
                />
                <DataRow
                  label="Agent Available Borrow"
                  value={
                    <span className="mono" style={{ fontWeight: 600 }}>
                      ${formatMoney(agentAuth.availableBorrow)}
                    </span>
                  }
                />
              </>
            )}
          </div>
        </Card>

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
                <button
                  type="button"
                  onClick={() => openAction({ type: "deposit", market: activeMarket })}
                  className="btn btn--accent btn--sm"
                >
                  Deposit {display.symbol} now
                </button>
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
                label="Gross debt drawn"
                value={`${isSolBorrow ? "" : "$"}${formatMoney(toUi(newDebt))} ${quoteSymbol}`}
              />
              <DataRow
                label={`Protocol execution fee (${(feeBps / 100).toFixed(2)}%)`}
                value={
                  valid
                    ? `${isSolBorrow ? "" : "$"}${formatMoney(toUi(feeDetails.fee))} ${quoteSymbol}`
                    : "—"
                }
              />
              <DataRow
                label="Net received to wallet"
                value={
                  valid
                    ? `${isSolBorrow ? "" : "$"}${formatMoney(toUi(feeDetails.netDisbursed))} ${quoteSymbol}`
                    : "—"
                }
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
              <div
                style={{
                  marginTop: 10,
                  padding: "8px 12px",
                  borderRadius: 6,
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  fontSize: 11.5,
                  color: "var(--text-3)",
                  lineHeight: 1.4,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <span>
                  Circuit Treasury: <code style={{ color: "var(--text-2)" }}>{CIRCUIT_TREASURY_ADDRESS.slice(0, 4)}...{CIRCUIT_TREASURY_ADDRESS.slice(-4)}</code>
                </span>
                <span style={{ color: "var(--success)", fontWeight: 600 }}>Monetizes safe execution only</span>
              </div>
            </div>
          </Step>
        )}

        {/* Quantitative Solvency Modeling (3D CAD Topology / Sensitivity Matrix) */}
        {hasCollateral && (
          <Card>
            <div className="row between g-12" style={{ alignItems: "center", marginBottom: 12 }}>
              <div>
                <div className="row g-8" style={{ alignItems: "center" }}>
                  <Icon name="activity" size={16} />
                  <h3 className="t-title" style={{ margin: 0, fontSize: 14 }}>
                    Solvency Risk Horizon
                  </h3>
                </div>
                <div className="t-meta" style={{ marginTop: 2 }}>
                  Parametric stress testing and 3D CAD liquidation projection for this borrow
                </div>
              </div>

              <div className="chips" style={{ margin: 0 }}>
                <button
                  type="button"
                  className={`chip ${riskModelView === "none" ? "chip--active" : ""}`}
                  onClick={() => setRiskModelView("none")}
                  style={{ fontSize: 11, padding: "2px 8px" }}
                >
                  Summary
                </button>
                <button
                  type="button"
                  className={`chip ${riskModelView === "topology3d" ? "chip--active" : ""}`}
                  onClick={() => setRiskModelView("topology3d")}
                  style={{ fontSize: 11, padding: "2px 8px" }}
                >
                  3D CAD Risk Topology
                </button>
                <button
                  type="button"
                  className={`chip ${riskModelView === "sensitivity" ? "chip--active" : ""}`}
                  onClick={() => setRiskModelView("sensitivity")}
                  style={{ fontSize: 11, padding: "2px 8px" }}
                >
                  Stress Matrix
                </button>
              </div>
            </div>

            {riskModelView === "topology3d" && (
              <div style={{ marginTop: 12 }}>
                <RiskTopology3D
                  collateralPriceUsd={collateralPriceUsd}
                  collateralAmountUi={toUi(collateral)}
                  currentDebtUsd={toUi(valid ? newDebt : debt)}
                  liquidationThresholdBps={s.asset?.liquidationThresholdBps ?? 8000}
                  maxBorrowUsd={toUi(max)}
                  tokenSymbol={display.symbol}
                  quoteSymbol={quoteSymbol}
                  compact
                />
              </div>
            )}

            {riskModelView === "sensitivity" && (
              <div style={{ marginTop: 12 }}>
                <RiskSensitivityMatrix
                  collateralPriceUsd={collateralPriceUsd}
                  collateralAmountUi={toUi(collateral)}
                  currentDebtUsd={toUi(valid ? newDebt : debt)}
                  liquidationThresholdBps={s.asset?.liquidationThresholdBps ?? 8000}
                  tokenSymbol={display.symbol}
                  quoteSymbol={quoteSymbol}
                />
              </div>
            )}

            {riskModelView === "none" && (
              <div
                style={{
                  padding: "10px 14px",
                  background: "var(--surface-2)",
                  borderRadius: "var(--r)",
                  border: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: 12,
                }}
              >
                <span className="muted">
                  Projected Health Factor with {valid ? `${formatMoney(parsed)} ${quoteSymbol}` : "current"} debt:{" "}
                  <strong style={{ color: projectedHf && projectedHf < minBps ? "var(--danger)" : "var(--success)" }}>
                    {projectedHf ? (projectedHf / 10_000).toFixed(2) : (s.risk?.healthFactorBps ? (s.risk.healthFactorBps / 10_000).toFixed(2) : "Infinite")}
                  </strong>
                </span>
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={() => setRiskModelView("topology3d")}
                  style={{ fontSize: 11, padding: "3px 10px" }}
                >
                  Inspect 3D Surface &rarr;
                </button>
              </div>
            )}
          </Card>
        )}

        {/* Step 4 - Live market safety check */}
        {hasCollateral && (
          <Step n={4} title="Market check" done={gatesPass && decisionResult.capitalPolicy.borrowAllowed && !s.protocol?.paused}>
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
                  {!gatesPass ? (
                    <BlockedAction
                      reasons={checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.status.toLowerCase()}`)}
                    />
                  ) : s.protocol?.paused || !decisionResult.capitalPolicy.borrowAllowed ? (
                    <BlockedAction
                      title="Borrowing paused"
                      reasons={["New borrowing is currently disabled by protocol capital policy."]}
                    />
                  ) : decisionResult.verdict.status !== "ALLOW" ? (
                    <BlockedAction
                      title="Borrowing restricted"
                      reasons={[decisionResult.verdict.reason]}
                    />
                  ) : (
                    <Notice tone="success" title="Borrowing allowed">
                      All risk conditions and capital policies the protocol requires are currently satisfied.
                    </Notice>
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
          <PermissionPreviewCard
            action="borrow"
            assetSymbol={display.symbol}
            amountUsd={valid ? parsed : 0}
            actor={controlMode === "MANUAL" ? "HUMAN" : "AGENT"}
            authorityStatus={controlMode === "MANUAL" ? "SOVEREIGN OWNER" : agentAuth.status}
            riskState={risk.ratchetState}
            policy={
              risk.ratchetState === "SAFE"
                ? "Standard (Max LTV 65%)"
                : risk.ratchetState === "RESTRICTED"
                ? "Restricted Volatility (Max LTV 40%)"
                : "Defensive Preservation (0% New Debt)"
            }
            limit={
              controlMode === "MANUAL"
                ? `$${formatMoney(toUi(max))} ${quoteSymbol}`
                : `$${formatMoney(agentAuth.availableBorrow)} ${quoteSymbol}`
            }
            result={permResult}
          />
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
