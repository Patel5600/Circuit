import React, { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";

import { PageContainer } from "../components/layout/AppShell";
import { ConfigNotice, ConnectPrompt } from "../components/layout/Guards";
import {
  Button,
  Card,
  DataRow,
  Icon,
  Notice,
  Pill,
  Segmented,
  Skeleton,
} from "../components/ui";
import { TransactionModal } from "../components/transactions/TransactionModal";
import {
  AssetRiskDrawer,
  PermissionDrawer,
  RiskEventDrawer,
} from "../components/drawers";
import { useCircuitDomain } from "../lib/domain/context";
import { useTransaction } from "../hooks/useTransaction";
import { useMarket } from "../context/MarketContext";
import { useAction } from "../context/ActionContext";
import { DEPLOYED_MARKETS, getDeployedMarket, getDeployedMarketByMint } from "../data/markets";
import { formatCurrency, formatMoney, formatPercent, formatTokens } from "../lib/format";
import { getAssetMark } from "../data/logos";
import { Position as PositionModel } from "../lib/portfolio/provider";
import {
  PortfolioRiskGraph,
  AssetNode,
} from "../components/profile/PortfolioRiskGraph";
import {
  buildDeposit,
  buildRepay,
  buildWithdraw,
  toNative,
  toUi,
} from "../lib/protocol";
import { derivePriceAccount } from "../lib/pyth";
import { PYTH_FEED_ID } from "../config";

type ActionType = "deposit" | "repay" | "withdraw";

export default function Position() {
  const { connected, publicKey } = useWallet();
  const { portfolio, risk, credit, invalidate } = useCircuitDomain();
  const { selectedMarket, selectMarket } = useMarket();
  const [searchParams] = useSearchParams();
  const marketQuery = searchParams.get("market");
  const { openAction } = useAction();
  const tx = useTransaction();

  // Drawer states
  const [selectedAsset, setSelectedAsset] = useState<PositionModel | null>(null);
  const [riskDrawerOpen, setRiskDrawerOpen] = useState(false);
  const [permissionDrawerAction, setPermissionDrawerAction] = useState<string | null>(null);

  // Action states
  const [action, setAction] = useState<ActionType>("deposit");
  const [amount, setAmount] = useState("");
  const [txOpen, setTxOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "graph">("table");

  const positions = portfolio.positions;
  const hasPositions = portfolio.hasPositions;

  const assetNodes: AssetNode[] = useMemo(() => {
    return positions.map((p) => ({
      symbol: p.symbol,
      name: p.name,
      mint: p.mint,
      weightPct: Math.round(p.weightPct),
      oracleHealthy: p.oracleHealthy,
      confBps: p.confBps,
      maxConfBps: p.maxConfBps,
      marketOpen: p.marketOpen,
      mark: getAssetMark(p.symbol),
      priceUsd: p.priceUsd,
      change24hPercent: p.change24hPercent,
      collateralValueUsd: p.collateralValueUsd,
      impactBorrowPowerUsd: p.riskContributionUsd,
      explanation: p.explanation,
    }));
  }, [positions]);

  // Canonical market context strictly from URL query if provided:
  // 1. If ?market= is provided in URL, resolve from DEPLOYED_MARKETS
  // 2. If invalid/unknown query, resolve to null (safe empty/neutral state, never fallback to Google)
  // 3. If no query, targetMarket is null (neutral state, user chooses from portfolio or market selector)
  const targetMarket = useMemo(() => {
    if (!marketQuery) return null;
    return getDeployedMarket(marketQuery) ?? null;
  }, [marketQuery]);

  // Derive active position strictly for the target market
  const activePosition = useMemo(() => {
    if (!targetMarket) return null;
    return positions.find((p) => p.symbol === targetMarket.symbol) ?? null;
  }, [positions, targetMarket]);

  const activeSymbol = targetMarket ? targetMarket.symbol : null;
  const activeTokenSymbol = targetMarket ? targetMarket.tokenSymbol : null;
  const isWithdrawBlocked = credit.permissions.withdraw.status === "BLOCKED";
  const isBorrowBlocked = credit.permissions.borrow.status === "BLOCKED";

  const handleDepositClick = (pos: PositionModel) => {
    const m = getDeployedMarketByMint(pos.mint) || getDeployedMarket(pos.symbol);
    if (m) {
      openAction({ type: "deposit", market: m, position: pos });
    }
  };

  const handleWithdrawClick = (pos: PositionModel) => {
    const m = getDeployedMarketByMint(pos.mint) || getDeployedMarket(pos.symbol);
    if (m) {
      openAction({ type: "withdraw", market: m, position: pos });
    }
  };

  const executeAction = async () => {
    const parsed = Number(amount);
    if (!parsed || parsed <= 0 || !publicKey || !targetMarket) return;

    setTxOpen(true);
    const amountNative = toNative(parsed);
    const priceAccount = derivePriceAccount(targetMarket.feedId || PYTH_FEED_ID, 0);

    const success = await tx.run({
      verb: action === "deposit" ? "Deposit" : action === "withdraw" ? "Withdraw" : "Repay",
      summary: `${parsed} ${action === "repay" ? "USDC" : activeTokenSymbol} ${action === "deposit" ? "deposited" : action === "withdraw" ? "withdrawn" : "repaid"}`,
      priceUpdate: priceAccount,
      equityMint: new PublicKey(targetMarket.mint),
      quoteMint: new PublicKey(targetMarket.quoteMint),
      build: async (ctx) => {
        if (action === "deposit") return buildDeposit(ctx, amountNative);
        if (action === "withdraw") return buildWithdraw(ctx, amountNative);
        return buildRepay(ctx, amountNative);
      },
      onSuccess: () => {
        invalidate({ portfolio: true, wallet: true, activity: true });
        setAmount("");
      },
    });
  };

  return (
    <PageContainer
      title="Collateral Management Terminal"
      subtitle="Authoritative on-chain collateral positions, dynamic valuations, and solvency risk control."
    >
      <ConfigNotice />

      {!connected ? (
        <ConnectPrompt what="Your collateral positions" />
      ) : (
        <div className="stack g-24">
          {/* Top Summary: 6-Stat Terminal Matrix */}
          <div className="grid grid--stats">
            <Card>
              <span className="t-label">Portfolio Collateral</span>
              <div className="stat-num" style={{ color: "var(--text)" }}>
                {formatCurrency(portfolio.totalCollateralUsd)}
              </div>
              <span className="t-meta">
                {positions.length} active collateral holding{positions.length !== 1 ? "s" : ""}
              </span>
            </Card>

            <Card>
              <span className="t-label">Total Debt</span>
              <div className="stat-num" style={{ color: portfolio.totalDebtUsd > 0 ? "var(--warning)" : "var(--text)" }}>
                {formatCurrency(portfolio.totalDebtUsd)}
              </div>
              <span className="t-meta">USDC drawn liability</span>
            </Card>

            <Card>
              <span className="t-label">Available Borrow Power</span>
              <div className="stat-num" style={{ color: "var(--accent)" }}>
                {formatCurrency(portfolio.borrowCapacityUsd)}
              </div>
              <span className="t-meta">Haircut-adjusted capacity</span>
            </Card>

            <Card>
              <span className="t-label">Health Factor</span>
              <div
                className="stat-num"
                style={{
                  color:
                    portfolio.healthFactor === null
                      ? "var(--text-3)"
                      : portfolio.healthFactor >= 1.5
                      ? "var(--success)"
                      : portfolio.healthFactor >= 1.15
                      ? "var(--warning)"
                      : "var(--danger)",
                }}
              >
                {portfolio.healthFactor !== null ? portfolio.healthFactor.toFixed(2) : "No Debt"}
              </div>
              <span className="t-meta">Liquidation threshold: 1.00</span>
            </Card>

            <Card>
              <span className="t-label">Effective LTV</span>
              <div className="stat-num">
                {(portfolio.effectiveLtvBps / 100).toFixed(1)}%
              </div>
              <span className="t-meta">
                {portfolio.cMaxPenaltyBps > 0
                  ? `-${(portfolio.cMaxPenaltyBps / 100).toFixed(1)}% concentration haircut`
                  : "Base ceiling 70.0%"}
              </span>
            </Card>

            <Card>
              <span className="t-label">Risk Ratchet State</span>
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setRiskDrawerOpen(true)}
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
                  title="Inspect Risk Ratchet State Machine"
                >
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
                </button>
              </div>
              <span className="t-meta">Click to inspect permissions</span>
            </Card>
          </div>

          {/* POSITIONS SECTION: Professional Multi-Asset Table & Live Risk Graph */}
          <Card
            title="Deposited Collateral Holdings"
            action={
              <div className="row g-8" style={{ alignItems: "center" }}>
                {hasPositions && (
                  <div className="chips" style={{ margin: 0 }}>
                    <button
                      type="button"
                      className={`chip ${viewMode === "table" ? "chip--active" : ""}`}
                      onClick={() => setViewMode("table")}
                      style={{ fontSize: 11, padding: "3px 10px", height: 26 }}
                    >
                      Table
                    </button>
                    <button
                      type="button"
                      className={`chip ${viewMode === "graph" ? "chip--active" : ""}`}
                      onClick={() => setViewMode("graph")}
                      style={{ fontSize: 11, padding: "3px 10px", height: 26 }}
                    >
                      Risk Graph
                    </button>
                  </div>
                )}
                <Link to="/app/faucet" className="btn btn--secondary btn--sm" style={{ textDecoration: "none" }}>
                  <Icon name="faucet" size={13} />
                  Get Test Equities
                </Link>
              </div>
            }
          >
            {!hasPositions ? (
              <div style={{ padding: "36px 16px", textAlign: "center" }} className="stack g-12">
                <div style={{ fontSize: 15, fontWeight: 650 }}>No Collateral Deposited On-Chain</div>
                <p className="t-meta" style={{ maxWidth: 440, margin: "0 auto" }}>
                  Your connected wallet does not hold any open Circuit collateral positions. Claim test equities from the Devnet Faucet and deposit below to unlock borrowing capacity.
                </p>
                <div style={{ marginTop: 8 }}>
                  <Link to="/app/faucet" className="btn btn--accent">
                    Open Devnet Faucet &rarr;
                  </Link>
                </div>
              </div>
            ) : viewMode === "graph" ? (
              <div style={{ margin: "4px 0" }}>
                <PortfolioRiskGraph
                  assets={assetNodes}
                  riskState={risk.ratchetState}
                  baseLtvBps={portfolio.weightedBaseLtvBps}
                  effectiveLtvBps={portfolio.effectiveLtvBps}
                  borrowPowerUsd={portfolio.borrowCapacityUsd}
                  totalCollateralUsd={portfolio.totalCollateralUsd}
                  borrowAllowed={credit.permissions.borrow.status === "ALLOWED"}
                  hardOverride={risk.hardOverride}
                  hardOverrideReason={risk.hardOverrideReason}
                  uneditable
                />
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    textAlign: "left",
                    fontSize: 13,
                  }}
                >
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-3)", fontSize: 11 }}>
                      <th style={{ padding: "10px 12px" }}>ASSET</th>
                      <th style={{ padding: "10px 12px" }}>QUANTITY</th>
                      <th style={{ padding: "10px 12px" }}>ORACLE PRICE</th>
                      <th style={{ padding: "10px 12px" }}>24H CHANGE</th>
                      <th style={{ padding: "10px 12px" }}>POSITION VALUE</th>
                      <th style={{ padding: "10px 12px" }}>WEIGHT</th>
                      <th style={{ padding: "10px 12px" }}>CONFIDENCE</th>
                      <th style={{ padding: "10px 12px", textAlign: "right" }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((pos) => {
                      const mark = getAssetMark(pos.symbol);
                      return (
                        <tr
                          key={pos.mint}
                          style={{
                            borderBottom: "1px solid var(--border-subtle, rgba(255,255,255,0.04))",
                            cursor: "pointer",
                            transition: "background var(--t-fast)",
                          }}
                          onClick={() => setSelectedAsset(pos)}
                        >
                          <td style={{ padding: "14px 12px" }}>
                            <div className="row g-10" style={{ alignItems: "center" }}>
                              <div
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: "50%",
                                  background: "#141721",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  flexShrink: 0,
                                }}
                              >
                                {mark ? (
                                  <svg width={16} height={16} viewBox="0 0 24 24">
                                    {mark.parts ? (
                                      mark.parts.map((p, idx) => <path key={idx} d={p.d} fill={p.fill} />)
                                    ) : (
                                      <path d={mark.d} fill={mark.hex} />
                                    )}
                                  </svg>
                                ) : (
                                  <span style={{ fontSize: 10, fontWeight: 700 }}>{pos.symbol}</span>
                                )}
                              </div>
                              <div>
                                <div style={{ fontWeight: 650 }}>{pos.symbol}</div>
                                <div style={{ fontSize: 11, color: "var(--text-3)" }}>{pos.name}</div>
                              </div>
                            </div>
                          </td>

                          <td style={{ padding: "14px 12px", fontFamily: "var(--mono)", fontWeight: 600 }}>
                            {formatTokens(pos.collateralUi)}
                          </td>

                          <td style={{ padding: "14px 12px", fontFamily: "var(--mono)" }}>
                            {formatCurrency(pos.priceUsd)}
                          </td>

                          <td
                            style={{
                              padding: "14px 12px",
                              fontFamily: "var(--mono)",
                              color:
                                pos.change24hPercent !== null && pos.change24hPercent !== undefined && pos.change24hPercent >= 0
                                  ? "var(--success)"
                                  : "var(--danger)",
                            }}
                          >
                            {pos.change24hPercent !== null && pos.change24hPercent !== undefined
                              ? `${pos.change24hPercent >= 0 ? "+" : ""}${pos.change24hPercent.toFixed(2)}%`
                              : "--"}
                          </td>

                          <td style={{ padding: "14px 12px", fontFamily: "var(--mono)", fontWeight: 700 }}>
                            {formatCurrency(pos.collateralValueUsd)}
                          </td>

                          <td style={{ padding: "14px 12px" }}>
                            <div className="row g-6" style={{ alignItems: "center" }}>
                              <span className="mono" style={{ fontSize: 12 }}>
                                {pos.weightPct.toFixed(1)}%
                              </span>
                              {pos.weightPct > 40 && (
                                <Pill tone="warning">
                                  Concentrated
                                </Pill>
                              )}
                            </div>
                          </td>

                          <td style={{ padding: "14px 12px", fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-3)" }}>
                            ±${pos.confidenceUsd.toFixed(3)}
                          </td>

                          <td style={{ padding: "14px 12px", textAlign: "right" }}>
                            <div className="row g-6" style={{ justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                className="btn btn--secondary btn--sm"
                                style={{ height: 28, padding: "0 8px", fontSize: 11 }}
                                onClick={() => handleDepositClick(pos)}
                              >
                                Deposit
                              </button>
                              <button
                                type="button"
                                className="btn btn--secondary btn--sm"
                                style={{ height: 28, padding: "0 8px", fontSize: 11 }}
                                onClick={() => handleWithdrawClick(pos)}
                              >
                                Withdraw
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* QUICK EXECUTION CARD */}
          {targetMarket ? (
            <Card title={`Manage ${activeTokenSymbol} Collateral (${targetMarket.name})`}>
              <div className="stack g-16" style={{ maxWidth: 520 }}>
                {!activePosition && (
                  <Notice tone="neutral" title={`No active ${activeTokenSymbol} position`}>
                    You do not have active {targetMarket.name} ({activeTokenSymbol}) collateral on-chain. Deposit below to initialize this collateral line.
                  </Notice>
                )}

                <Segmented
                  label="Action Type"
                  options={
                    !activePosition
                      ? [{ value: "deposit", label: "Deposit" }]
                      : [
                          { value: "deposit", label: "Deposit" },
                          { value: "withdraw", label: "Withdraw" },
                          { value: "repay", label: "Repay Debt" },
                        ]
                  }
                  value={action}
                  onChange={(val) => setAction(val as ActionType)}
                />

                {action === "withdraw" && isWithdrawBlocked && (
                  <div
                    style={{
                      padding: 12,
                      background: "rgba(224, 82, 82, 0.1)",
                      border: "1px solid var(--danger)",
                      borderRadius: "var(--r)",
                    }}
                  >
                    <div className="row between g-8" style={{ alignItems: "center" }}>
                      <span style={{ fontWeight: 700, color: "var(--danger)", fontSize: 12.5 }}>
                        WITHDRAW BLOCKED: Risk Ratchet = {risk.ratchetState}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPermissionDrawerAction("Withdraw")}
                      >
                        Explain
                      </Button>
                    </div>
                  </div>
                )}

                <div className="stack g-6">
                  <label className="t-label">
                    Amount ({action === "repay" ? "USDC" : activeTokenSymbol})
                  </label>
                  <div className="row g-8" style={{ alignItems: "center" }}>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      style={{
                        flex: 1,
                        padding: "10px 14px",
                        background: "var(--surface-2)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--r)",
                        color: "var(--text)",
                        fontSize: 15,
                        fontFamily: "var(--mono)",
                      }}
                    />
                  </div>
                </div>

                <Button
                  variant="primary"
                  disabled={!amount || Number(amount) <= 0 || (action === "withdraw" && isWithdrawBlocked)}
                  onClick={executeAction}
                >
                  {action === "deposit"
                    ? `Deposit ${amount || "0"} ${activeTokenSymbol}`
                    : action === "withdraw"
                    ? `Withdraw ${amount || "0"} ${activeTokenSymbol}`
                    : `Repay ${amount || "0"} USDC`}
                </Button>
              </div>
            </Card>
          ) : (
            <Card title="Collateral Management Terminal">
              <div className="stack g-12">
                <p className="t-sm muted" style={{ margin: 0 }}>
                  Select an asset from your active portfolio holdings table above to withdraw or add collateral, or choose a market below to open a new position.
                </p>
                <div className="row g-8 wrap" style={{ marginTop: 4 }}>
                  {DEPLOYED_MARKETS.map((m) => (
                    <button
                      key={m.symbol}
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => {
                        openAction({ type: "deposit", market: m });
                      }}
                    >
                      Manage {m.symbol}x
                    </button>
                  ))}
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Drawers */}
      <AssetRiskDrawer
        position={selectedAsset}
        open={Boolean(selectedAsset)}
        onClose={() => setSelectedAsset(null)}
        onDeposit={handleDepositClick}
        onWithdraw={handleWithdrawClick}
      />

      <RiskEventDrawer
        ratchetState={risk.ratchetState}
        open={riskDrawerOpen}
        onClose={() => setRiskDrawerOpen(false)}
      />

      <PermissionDrawer
        actionName={permissionDrawerAction ?? "Action"}
        permission={
          permissionDrawerAction === "Withdraw"
            ? credit.permissions.withdraw
            : credit.permissions.borrow
        }
        open={Boolean(permissionDrawerAction)}
        onClose={() => setPermissionDrawerAction(null)}
      />

      {/* Execution Lifecycle Modal */}
      <TransactionModal
        open={txOpen}
        state={tx.state}
        title={`${action.charAt(0).toUpperCase() + action.slice(1)} Collateral`}
        action={action}
        asset={action === "repay" ? "USDC" : activeSymbol}
        amount={amount}
        wallet={publicKey?.toBase58()}
        onClose={() => {
          setTxOpen(false);
          tx.reset();
        }}
      />
    </PageContainer>
  );
}
