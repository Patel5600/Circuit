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
import { useMarket } from "../context/MarketContext";
import { activeAssetDisplay } from "../lib/asset";
import { greeting, formatMoney, formatPercent } from "../lib/format";
import { toUi } from "../lib/protocol";

export default function Dashboard() {
  const { selectedMarket, markets, selectMarket } = useMarket();
  const s = useProtocolState();
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
                  <Link
                    to={`/app/position?market=${selectedMarket.symbol}`}
                    className="btn btn--accent btn--sm"
                  >
                    Deposit {display.symbol}
                  </Link>
                  <Link
                    to={`/app/borrow?market=${selectedMarket.symbol}`}
                    className="btn btn--secondary btn--sm"
                  >
                    Borrow {quoteSymbol}
                  </Link>
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
                  <Link
                    to={`/app/position?market=${selectedMarket.symbol}`}
                    className="btn btn--ghost btn--sm"
                  >
                    Manage
                  </Link>
                }
              />

              <BorrowCapacity
                loading={s.loading}
                risk={s.risk}
                vaultLiquidity={s.vaultLiquidity}
                action={
                  <Link
                    to={`/app/borrow?market=${selectedMarket.symbol}`}
                    className="btn btn--accent btn--sm"
                    aria-disabled={borrowBlocked || undefined}
                  >
                    Borrow {quoteSymbol}
                  </Link>
                }
              />
            </div>
          )}

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
                          const quoteParam = isSol ? "&quote=WSOL" : "";
                          navigate(`/app/borrow?market=${m.symbol}${quoteParam}`);
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
