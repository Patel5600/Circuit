import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";

import { PageContainer } from "../components/layout/AppShell";
import { ConfigNotice, ConnectPrompt, NoPositionPrompt } from "../components/layout/Guards";
import { Card, Icon, Notice, Skeleton, LoadingRegion } from "../components/ui";
import { SafetyStatus } from "../components/risk/SafetyStatus";
import {
  BorrowCapacity,
  CollateralCard,
  PositionSummary,
} from "../components/position/PositionParts";
import { useProtocolState } from "../hooks/useProtocolState";
import { activeAssetDisplay, QUOTE_SYMBOL } from "../lib/asset";
import { greeting } from "../lib/format";
import { toUi } from "../lib/protocol";

export default function Dashboard() {
  const s = useProtocolState();
  const { connected } = useWallet();
  const display = useMemo(activeAssetDisplay, []);

  const minBps = s.protocol?.minHealthFactorBps ?? 10_000;
  const hasPosition =
    Boolean(s.position) &&
    ((s.position?.collateralAmount ?? 0n) > 0n ||
      (s.position?.debtAmount ?? 0n) > 0n);

  // Plain-language summary of the user's standing, driven by real state only.
  const headline = useMemo(() => {
    if (!connected) return "Connect a wallet to view your position.";
    if (s.loading) return "Loading your position...";
    if (!hasPosition) return "You do not have a position yet.";
    const hf = s.risk?.healthFactorBps ?? null;
    if (hf === null) return "You have collateral deposited and no debt.";
    if (hf < minBps) return "Your position is at risk of liquidation.";
    if (hf < minBps * 1.25) return "Your position is close to its safety limit.";
    return "Your position is healthy.";
  }, [connected, s.loading, hasPosition, s.risk, minBps]);

  const borrowBlocked = Boolean(s.risk && !s.risk.borrowAllowed);

  return (
    <PageContainer>
      <ConfigNotice />

      <header style={{ marginBottom: 20 }}>
        <p className="t-label">{greeting()}</p>
        <h1
          className="pagehead__title"
          style={{ marginTop: 6 }}
          aria-live="polite"
        >
          {headline}
        </h1>
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
            <NoPositionPrompt />
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
                  <Link to="/app/position" className="btn btn--ghost btn--sm">
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
                    to="/app/borrow"
                    className="btn btn--accent btn--sm"
                    aria-disabled={borrowBlocked || undefined}
                  >
                    Borrow
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

          <Card title="Protocol liquidity">
            {s.loading ? (
              <Skeleton height={22} width="45%" />
            ) : (
              <div className="row between g-12 wrap">
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                    ${toUi(s.vaultLiquidity).toLocaleString("en-US", { maximumFractionDigits: 2 })}
                  </div>
                  <div className="stat__sub">
                    {QUOTE_SYMBOL} available to borrow across the protocol
                  </div>
                </div>
                <Link to="/app/verify" className="row g-6 t-sm" style={{ color: "var(--accent)" }}>
                  Verify on-chain
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
