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
  AgentAuthorityDrawer,
} from "../components/drawers";
import { useCircuitDomain } from "../lib/domain/context";
import { useTransaction } from "../hooks/useTransaction";
import { useMarket } from "../context/MarketContext";
import { useAction } from "../context/ActionContext";
import { DEPLOYED_MARKETS, getDeployedMarket, getDeployedMarketByMint } from "../data/markets";
import { formatCurrency, formatMoney, formatPercent, formatTokens } from "../lib/format";
import { getAssetMark } from "../data/logos";
import { Position as PositionModel } from "../lib/portfolio/provider";
import { PortfolioRiskGraph, AssetNode } from "../components/profile/PortfolioRiskGraph";
import { RiskTopology3D } from "../components/risk/RiskTopology3D";
import { RiskSensitivityMatrix } from "../components/risk/RiskSensitivityMatrix";
import {
  buildDeposit,
  buildRepay,
  buildWithdraw,
  toNative,
  toUi,
} from "../lib/protocol";
import { derivePriceAccount } from "../lib/pyth";
import { PYTH_FEED_ID } from "../config";
import { calculateMinimumRestorationDebt } from "../lib/recovery-engine";

type ActionType = "deposit" | "repay" | "withdraw";
type ViewMode = "table" | "graph" | "topology3d" | "sensitivity";

export default function Position() {
  const { connected, publicKey } = useWallet();
  const { portfolio, risk, credit, invalidate, getAgentAuthorityForAsset, revokeAgentAuthority, controlMode, setControlMode } = useCircuitDomain();
  const { selectedMarket, selectMarket } = useMarket();
  const [searchParams] = useSearchParams();
  const marketQuery = searchParams.get("market");
  const { openAction } = useAction();
  const tx = useTransaction();

  // Drawer states
  const [selectedAsset, setSelectedAsset] = useState<PositionModel | null>(null);
  const [riskDrawerOpen, setRiskDrawerOpen] = useState(false);
  const [permissionDrawerAction, setPermissionDrawerAction] = useState<string | null>(null);
  const [agentDrawerAsset, setAgentDrawerAsset] = useState<PositionModel | null>(null);

  // Action states
  const [action, setAction] = useState<ActionType>("deposit");
  const [amount, setAmount] = useState("");
  const [txOpen, setTxOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("table");

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

  const recoveryAdvice = useMemo(() => {
    if (portfolio.totalDebtUsd <= 0 || portfolio.healthFactor === null) return null;
    return calculateMinimumRestorationDebt(
      portfolio.totalCollateralUsd,
      portfolio.totalDebtUsd,
      8000,
      10500,
      500
    );
  }, [portfolio.totalCollateralUsd, portfolio.totalDebtUsd, portfolio.healthFactor]);

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
          {/* Sovereign Execution Mode Context */}
          {controlMode === "MANUAL" ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                background: "rgba(127, 195, 154, 0.08)",
                border: "1px solid rgba(127, 195, 154, 0.25)",
                borderRadius: "var(--r, 10px)",
                fontSize: 12.5,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--success)" }} />
                <span>
                  <strong>MANUAL CONTROL ACTIVE</strong> — Direct sovereign wallet execution. Zero AI or agent dependency. Direct manual deposit, borrow, repay, and withdraw.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setControlMode("AUTONOMOUS")}
                style={{
                  background: "transparent",
                  border: "1px solid var(--border)",
                  color: "var(--text-2)",
                  borderRadius: 4,
                  padding: "3px 8px",
                  fontSize: 11,
                  cursor: "pointer",
                  fontFamily: "var(--mono)",
                }}
              >
                Switch to Agent Mode &rarr;
              </button>
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                background: "rgba(96, 165, 250, 0.08)",
                border: "1px solid rgba(96, 165, 250, 0.25)",
                borderRadius: "var(--r, 10px)",
                fontSize: 12.5,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#60a5fa" }} />
                <span>
                  <strong>AGENT STRATEGY MODE</strong> — Delegated execution active. Bounded by Circuit Risk Ratchet, Capital Policy, and agent authorization limits.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setControlMode("MANUAL")}
                style={{
                  background: "transparent",
                  border: "1px solid var(--border)",
                  color: "var(--text-2)",
                  borderRadius: 4,
                  padding: "3px 8px",
                  fontSize: 11,
                  cursor: "pointer",
                  fontFamily: "var(--mono)",
                }}
              >
                Switch to Manual Mode &rarr;
              </button>
            </div>
          )}

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

          {/* Capital Recovery Advisor Banner */}
          {recoveryAdvice && recoveryAdvice.isRecoveryNeeded && (
            <div
              style={{
                padding: "14px 18px",
                borderRadius: "var(--r, 8px)",
                background: "rgba(207, 139, 139, 0.08)",
                border: "1px solid rgba(207, 139, 139, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
              }}
            >
              <div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700, color: "var(--danger, #cf8b8b)", letterSpacing: "0.05em" }}>
                  CAPITAL RECOVERY ENGINE · PREVENT EXCESS LIQUIDATION
                </div>
                <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 4, lineHeight: 1.4 }}>
                  {recoveryAdvice.explanation}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (positions[0]) {
                    const m = getDeployedMarketByMint(positions[0].mint) || getDeployedMarket(positions[0].symbol);
                    if (m) {
                      openAction({
                        type: "repay",
                        market: m,
                        amount: String(recoveryAdvice.requiredRepayUsd),
                      });
                    }
                  }
                }}
                className="btn btn--primary btn--sm"
                style={{ flexShrink: 0, fontFamily: "var(--mono)", fontSize: 11, whiteSpace: "nowrap" }}
              >
                Repay ${recoveryAdvice.requiredRepayUsd.toFixed(2)} &rarr;
              </button>
            </div>
          )}

          {/* POSITIONS SECTION: Professional Multi-Asset Table & Live Risk Graph */}
          <Card
            title="Deposited Collateral Holdings"
            action={
              <div className="row g-8" style={{ alignItems: "center" }}>
                {hasPositions && (
                  <div className="chips" style={{ margin: 0, gap: 5 }}>
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
                    <button
                      type="button"
                      className={`chip ${viewMode === "topology3d" ? "chip--active" : ""}`}
                      onClick={() => setViewMode("topology3d")}
                      style={{ fontSize: 11, padding: "3px 10px", height: 26 }}
                    >
                      3D Risk CAD
                    </button>
                    <button
                      type="button"
                      className={`chip ${viewMode === "sensitivity" ? "chip--active" : ""}`}
                      onClick={() => setViewMode("sensitivity")}
                      style={{ fontSize: 11, padding: "3px 10px", height: 26 }}
                    >
                      Stress Matrix
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
            ) : viewMode === "topology3d" ? (
              <div style={{ margin: "4px 0" }}>
                <RiskTopology3D
                  collateralPriceUsd={
                    activePosition?.priceUsd ??
                    positions[0]?.priceUsd ??
                    200
                  }
                  collateralAmountUi={
                    activePosition?.collateralUi ??
                    positions[0]?.collateralUi ??
                    10
                  }
                  currentDebtUsd={
                    activePosition?.debtUi ??
                    portfolio.totalDebtUsd ??
                    0
                  }
                  liquidationThresholdBps={
                    targetMarket?.liqThresholdBps ?? 6500
                  }
                  maxBorrowUsd={portfolio.borrowCapacityUsd}
                  tokenSymbol={
                    targetMarket?.tokenSymbol ??
                    positions[0]?.symbol ??
                    "NVDAx"
                  }
                />
              </div>
            ) : viewMode === "sensitivity" ? (
              <div style={{ margin: "4px 0" }}>
                <RiskSensitivityMatrix
                  collateralPriceUsd={
                    activePosition?.priceUsd ??
                    positions[0]?.priceUsd ??
                    200
                  }
                  collateralAmountUi={
                    activePosition?.collateralUi ??
                    positions[0]?.collateralUi ??
                    10
                  }
                  currentDebtUsd={
                    activePosition?.debtUi ??
                    portfolio.totalDebtUsd ??
                    0
                  }
                  liquidationThresholdBps={
                    targetMarket?.liqThresholdBps ?? 6500
                  }
                  tokenSymbol={
                    targetMarket?.tokenSymbol ??
                    positions[0]?.symbol ??
                    "NVDAx"
                  }
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
                      <th style={{ padding: "10px 12px" }}>COLLATERAL</th>
                      <th style={{ padding: "10px 12px" }}>DEBT</th>
                      <th style={{ padding: "10px 12px" }}>LTV</th>
                      <th style={{ padding: "10px 12px" }}>RISK STATE</th>
                      <th style={{ padding: "10px 12px" }}>AGENT AUTHORITY</th>
                      <th style={{ padding: "10px 12px", textAlign: "right" }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((pos) => {
                      const mark = getAssetMark(pos.symbol);
                      const ltvPct = pos.collateralValueUsd > 0
                        ? (pos.debtUi / pos.collateralValueUsd) * 100
                        : 0;
                      const auth = getAgentAuthorityForAsset(pos.symbol);
                      const authTone =
                        auth.effectiveAuthority === "FULL"
                          ? "success"
                          : auth.effectiveAuthority === "LIMITED"
                          ? "warning"
                          : "danger";

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

                          <td style={{ padding: "14px 12px" }}>
                            <div style={{ fontFamily: "var(--mono)", fontWeight: 700 }}>
                              {formatCurrency(pos.collateralValueUsd)}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--mono)" }}>
                              {formatTokens(pos.collateralUi)} {pos.symbol}
                            </div>
                          </td>

                          <td style={{ padding: "14px 12px", fontFamily: "var(--mono)", fontWeight: 600 }}>
                            {pos.debtUi > 0 ? formatCurrency(pos.debtUi) : "$0.00"}
                          </td>

                          <td style={{ padding: "14px 12px", fontFamily: "var(--mono)" }}>
                            <span style={{ color: ltvPct > 50 ? "var(--warning)" : "var(--text)" }}>
                              {ltvPct.toFixed(1)}%
                            </span>
                          </td>

                          <td style={{ padding: "14px 12px" }}>
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
                          </td>

                          <td style={{ padding: "14px 12px" }}>
                            <button
                              type="button"
                              className="chip"
                              onClick={(e) => {
                                e.stopPropagation();
                                setAgentDrawerAsset(pos);
                              }}
                              style={{
                                border: "1px solid var(--border-strong)",
                                cursor: "pointer",
                                padding: "3px 8px",
                                height: 24,
                                fontSize: 11,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                              }}
                              title="Inspect Autonomous Strategy Authority"
                            >
                              <span
                                style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: "50%",
                                  background:
                                    authTone === "success"
                                      ? "var(--success)"
                                      : authTone === "warning"
                                      ? "var(--warning)"
                                      : "var(--danger)",
                                }}
                              />
                              <span style={{ fontWeight: 650 }}>{auth.status}</span>
                              <span style={{ color: "var(--text-3)", fontSize: 10 }}>· {auth.effectiveAuthority}</span>
                            </button>
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

      {/* Autonomous Strategy Authority Drawer */}
      <AgentAuthorityDrawer
        authority={agentDrawerAsset ? getAgentAuthorityForAsset(agentDrawerAsset.symbol) : null}
        riskState={risk.ratchetState}
        open={Boolean(agentDrawerAsset)}
        onClose={() => setAgentDrawerAsset(null)}
        onRevoke={revokeAgentAuthority}
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
