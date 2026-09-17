import React, { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";

import { PageContainer } from "../components/layout/AppShell";
import { ConfigNotice, ConnectPrompt, NoPositionPrompt } from "../components/layout/Guards";
import { Card, Icon, Notice, Pill, Skeleton, LoadingRegion } from "../components/ui";
import { SafetyStatus } from "../components/risk/SafetyStatus";
import { MarketSelector } from "../components/market/MarketSelector";
import {
  BorrowCapacity,
  CollateralCard,
  PositionSummary,
} from "../components/position/PositionParts";
import { useProtocolState } from "../hooks/useProtocolState";
import { useCircuitDomain } from "../lib/domain/context";
import { PolicyVisualizationCard } from "../components/authority/PolicyVisualizationCard";
import { useMarket } from "../context/MarketContext";
import { useAction } from "../context/ActionContext";
import { activeAssetDisplay } from "../lib/asset";
import { greeting, formatMoney, formatPercent } from "../lib/format";
import { toUi } from "../lib/protocol";

export default function Dashboard() {
  const { selectedMarket, markets, selectMarket } = useMarket();
  const { openAction } = useAction();
  const s = useProtocolState();
  const domain = useCircuitDomain();
  const { connected } = useWallet();
  const navigate = useNavigate();

  const display = useMemo(() => activeAssetDisplay(selectedMarket), [selectedMarket]);
  const quoteSymbol = selectedMarket.quoteSymbol || "USDC";

  const minBps = s.protocol?.minHealthFactorBps ?? 10_000;
  const hasPosition =
    Boolean(s.position) &&
    ((s.position?.collateralAmount ?? 0n) > 0n ||
      (s.position?.debtAmount ?? 0n) > 0n);

  // Plain-language summary of the user's standing, driven by real state only.
  const headline = useMemo(() => {
    if (!connected) return "Connect a wallet to view your multi-market credit.";
    if (s.loading) return "Loading your position...";
    if (!hasPosition) return `You do not have a ${display.symbol} position yet.`;
    const hf = s.risk?.healthFactorBps ?? null;
    if (hf === null) return `You have ${display.symbol} deposited and no debt.`;
    if (hf < minBps) return "Your position is at risk of liquidation.";
    if (hf < minBps * 1.25) return "Your position is close to its safety limit.";
    return "Your position is healthy.";
  }, [connected, s.loading, hasPosition, s.risk, minBps, display.symbol]);

  const borrowBlocked = Boolean(s.risk && !s.risk.borrowAllowed);

  return (
    <PageContainer>
      <ConfigNotice />

      <header style={{ marginBottom: 20 }}>
        <div className="row between g-12 wrap" style={{ alignItems: "center" }}>
          <div>
            <p className="t-label">{greeting()}</p>
            <h1
              className="pagehead__title"
              style={{ marginTop: 6 }}
              aria-live="polite"
            >
              {headline}
            </h1>
          </div>

          <div className="row g-8" style={{ alignItems: "center" }}>
            <MarketSelector compact />
            <Link to="/app/markets" className="btn btn--secondary btn--sm">
              All 12 Markets
            </Link>
          </div>
        </div>
      </header>

      {s.error && (
        <div style={{ marginBottom: 18 }}>
          <Notice tone="danger" title="Could not reach the network">
            {s.error}
          </Notice>
        </div>
      )}

      {!connected ? (
        <ConnectPrompt />
      ) : (
        <div className="stack g-16">
          {s.loading && <LoadingRegion label="Loading position data" />}

          {/* Top: PORTFOLIO RISK STATE (Protocol Risk is Primary) */}
          <div
            style={{
              padding: "16px 20px",
              background: "rgba(18, 20, 26, 0.85)",
              border: `1px solid ${
                domain.risk.riskState === "SAFE"
                  ? "rgba(127, 195, 154, 0.4)"
                  : domain.risk.riskState === "RESTRICTED"
                  ? "rgba(207, 173, 116, 0.4)"
                  : "rgba(207, 139, 139, 0.4)"
              }`,
              borderRadius: "var(--r)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "14px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  background:
                    domain.risk.riskState === "SAFE"
                      ? "#7fc39a"
                      : domain.risk.riskState === "RESTRICTED"
                      ? "#cfad74"
                      : "#cf8b8b",
                  boxShadow: `0 0 10px ${
                    domain.risk.riskState === "SAFE"
                      ? "#7fc39a88"
                      : domain.risk.riskState === "RESTRICTED"
                      ? "#cfad7488"
                      : "#cf8b8b88"
                  }`,
                }}
              />
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "11px", fontFamily: "var(--mono)", color: "var(--text-3)", letterSpacing: "0.08em" }}>
                    PORTFOLIO RISK STATE
                  </span>
                  <span
                    style={{
                      fontSize: "11px",
                      fontFamily: "var(--mono)",
                      fontWeight: 700,
                      color:
                        domain.risk.riskState === "SAFE"
                          ? "#7fc39a"
                          : domain.risk.riskState === "RESTRICTED"
                          ? "#cfad74"
                          : "#cf8b8b",
                    }}
                  >
                    {domain.risk.riskState}
                  </span>
                </div>
                <p style={{ margin: "2px 0 0", fontSize: "12.5px", color: "var(--text-2)" }}>
                  {domain.risk.hardOverride && domain.risk.hardOverrideReason
                    ? `Hard Safety Gate: ${domain.risk.hardOverrideReason}`
                    : domain.risk.riskState === "SAFE"
                    ? "Normal market condition. Borrowing and withdrawals permitted."
                    : domain.risk.riskState === "RESTRICTED"
                    ? "Reference equity market closed or elevated uncertainty. Borrowing constrained."
                    : "High market stress. New borrowing blocked to protect solvency."}
                </p>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Link to="/app/profile" className="btn btn--secondary btn--sm">
                View Risk Topology
              </Link>
            </div>
          </div>

          {domain.controlMode === "AUTONOMOUS" && (
            <PolicyVisualizationCard assetSymbol={selectedMarket.symbol} />
          )}

          <PositionSummary
            loading={s.loading}
            position={s.position}
            asset={s.asset}
            risk={s.risk}
            minBps={minBps}
          />

          {!s.loading && !hasPosition ? (
            <Card>
              <div className="row between g-12 wrap" style={{ alignItems: "center" }}>
                <div>
                  <h3 className="t-title" style={{ margin: "0 0 4px 0" }}>
                    No active {display.symbol} position
                  </h3>
                  <p className="t-sm muted" style={{ margin: 0 }}>
                    Deposit {display.symbol} to open a credit line, or pick another stock market below.
                  </p>
                </div>
                <div className="row g-8">
                  <button
                    type="button"
                    onClick={() => openAction({ type: "deposit", market: selectedMarket })}
                    className="btn btn--accent btn--sm"
                  >
                    Deposit {display.symbol}
                  </button>
                  <button
                    type="button"
                    onClick={() => openAction({ type: "borrow", market: selectedMarket })}
                    className="btn btn--secondary btn--sm"
                  >
                    Borrow {quoteSymbol}
                  </button>
                </div>
              </div>
            </Card>
          ) : (
            <div className="grid grid--2">
              <CollateralCard
                loading={s.loading}
                position={s.position}
                risk={s.risk}
                symbol={display.symbol}
                name={display.name}
                priceUsd={s.oracle?.priceUsd ?? null}
                logo={display.logo}
                action={
                  <button
                    type="button"
                    onClick={() => openAction({ type: "deposit", market: selectedMarket })}
                    className="btn btn--ghost btn--sm"
                  >
                    Manage
                  </button>
                }
              />

              <BorrowCapacity
                loading={s.loading}
                risk={s.risk}
                vaultLiquidity={s.vaultLiquidity}
                action={
                  <button
                    type="button"
                    onClick={() => openAction({ type: "borrow", market: selectedMarket })}
                    className="btn btn--accent btn--sm"
                    disabled={borrowBlocked}
                    aria-disabled={borrowBlocked || undefined}
                  >
                    Borrow {quoteSymbol}
                  </button>
                }
              />
            </div>
          )}

          {/* Autonomous Capital Status Surface */}
          <Card>
            <div className="row between g-12 wrap" style={{ alignItems: "center" }}>
              <div className="row g-10" style={{ alignItems: "center" }}>
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "var(--r-sm, 6px)",
                    background: "rgba(127, 195, 154, 0.1)",
                    border: "1px solid rgba(127, 195, 154, 0.25)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--success)",
                  }}
                >
                  <Icon name="layers" size={16} />
                </span>
                <div>
                  <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--text-3)", letterSpacing: "0.06em" }}>
                    AUTONOMOUS CAPITAL CONTROL
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginTop: 1 }}>
                    {domain.agentAuthority.strategyName} ({display.symbol} Collateral)
                  </div>
                </div>
              </div>

              <div className="row g-8 wrap" style={{ alignItems: "center" }}>
                <div className="row g-4" style={{ alignItems: "center", fontSize: 12 }}>
                  <span className="muted">Strategy:</span>
                  <Pill
                    tone={
                      domain.agentAuthority.status === "ACTIVE"
                        ? "success"
                        : domain.agentAuthority.status === "LIMITED"
                        ? "warning"
                        : "danger"
                    }
                  >
                    {domain.agentAuthority.status}
                  </Pill>
                </div>

                <div className="row g-4" style={{ alignItems: "center", fontSize: 12 }}>
                  <span className="muted">Risk:</span>
                  <Pill
                    tone={
                      domain.risk.ratchetState === "SAFE"
                        ? "success"
                        : domain.risk.ratchetState === "RESTRICTED"
                        ? "warning"
                        : "danger"
                    }
                    withDot
                  >
                    {domain.risk.ratchetState}
                  </Pill>
                </div>

                <div className="row g-4" style={{ alignItems: "center", fontSize: 12 }}>
                  <span className="muted">Authority:</span>
                  <Pill
                    tone={
                      domain.agentAuthority.effectiveAuthority === "FULL"
                        ? "success"
                        : domain.agentAuthority.effectiveAuthority === "LIMITED"
                        ? "warning"
                        : "danger"
                    }
                  >
                    {domain.agentAuthority.effectiveAuthority}
                  </Pill>
                </div>

                <div className="row g-4" style={{ alignItems: "center", fontSize: 12 }}>
                  <span className="muted">Borrow:</span>
                  <span
                    style={{
                      fontFamily: "var(--mono)",
                      fontWeight: 650,
                      color:
                        domain.agentAuthority.effectiveAuthority === "BLOCKED"
                          ? "var(--danger)"
                          : domain.agentAuthority.effectiveAuthority === "LIMITED"
                          ? "var(--warning)"
                          : "var(--success)",
                    }}
                  >
                    {domain.agentAuthority.effectiveAuthority === "BLOCKED"
                      ? "BLOCKED"
                      : domain.agentAuthority.effectiveAuthority === "LIMITED"
                      ? "CONSTRAINED"
                      : "ENABLED"}
                  </span>
                </div>

                <Link to="/app/position" className="btn btn--secondary btn--sm" style={{ fontSize: 11, padding: "2px 8px", height: 26 }}>
                  Manage Authority &rarr;
                </Link>
              </div>
            </div>
          </Card>

          {borrowBlocked && !s.loading && (
            <Notice tone="warning" title="New borrowing is paused">
              {s.risk!.blockers[0]}
              {s.risk!.blockers.length > 1
                ? ` (and ${s.risk!.blockers.length - 1} more)`
                : ""}
              . Your existing position is not affected.
            </Notice>
          )}

          <SafetyStatus
            loading={s.loading}
            asset={s.asset}
            oracle={s.oracle}
            session={s.session}
            guardReason={s.guard?.reason}
          />

          {/* 12 Live Markets Grid */}
          <Card
            title="Supported Live Collateral Equities"
            action={<Pill tone="success" withDot>12 DEPLOYED MARKETS</Pill>}
          >
            <p className="t-sm muted" style={{ marginTop: 0, marginBottom: 14 }}>
              Select any tokenized stock below to borrow USDC or SOL against it on Solana Devnet.
            </p>

            <div className="grid grid--3">
              {markets.map((m) => {
                const active =
                  m.symbol === selectedMarket.symbol &&
                  m.quoteSymbol === selectedMarket.quoteSymbol;
                const isSol = m.quoteSymbol === "WSOL";

                return (
                  <div
                    key={`${m.symbol}-${m.quoteSymbol}`}
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      background: active ? "var(--surface-3)" : "var(--surface-2)",
                      border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <div className="row between g-6" style={{ alignItems: "center" }}>
                      <span style={{ fontWeight: 750, fontSize: 14 }}>
                        {m.tokenSymbol}
                      </span>
                      <Pill tone={isSol ? "accent" : "neutral"}>
                        {isSol ? "BORROW SOL" : m.quoteSymbol}
                      </Pill>
                    </div>

                    <div className="truncate t-meta" style={{ fontSize: 12 }}>
                      {m.name}
                    </div>

                    <div className="row between g-6" style={{ marginTop: 4, alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: "var(--success)", fontWeight: 650 }}>
                        {formatPercent(m.baseLtvBps)} LTV
                      </span>
                      <button
                        type="button"
                        className={`btn ${active ? "btn--accent" : "btn--secondary"} btn--sm`}
                        style={{ padding: "3px 8px", fontSize: 11.5 }}
                        onClick={() => {
                          selectMarket(m.symbol, m.quoteSymbol);
                          openAction({ type: "borrow", market: m });
                        }}
                      >
                        Borrow
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Protocol Liquidity */}
          <Card title="Protocol liquidity">
            {s.loading ? (
              <Skeleton height={22} width="45%" />
            ) : (
              <div className="row between g-12 wrap">
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                    {formatMoney(toUi(s.vaultLiquidity))} {quoteSymbol}
                  </div>
                  <div className="stat__sub">
                    Lendable {quoteSymbol} vault liquidity available in the protocol
                  </div>
                </div>
                <Link to="/app/verify" className="row g-6 t-sm" style={{ color: "var(--accent)" }}>
                  Verify on-chain accounts
                  <Icon name="arrowRight" size={14} />
                </Link>
              </div>
            )}
          </Card>
        </div>
      )}
    </PageContainer>
  );
}
