import React from "react";

import { Card, DataRow, Icon, Pill, Skeleton, Tone } from "../ui";
import { formatAge, formatMoney, formatPercent } from "../../lib/format";
import { AssetConfigView } from "../../lib/protocol";
import { OracleSnapshot } from "../../lib/pyth";
import { SessionHint } from "../../hooks/useProtocolState";

/** Oracle freshness / certainty summary, reusable across pages. */
export function OracleStatus({
  oracle,
  asset,
  loading = false,
  compact = false,
}: {
  oracle: OracleSnapshot | null;
  asset: AssetConfigView | null;
  loading?: boolean;
  compact?: boolean;
}) {
  if (loading) return <Skeleton height={compact ? 18 : 24} width="55%" />;

  if (!oracle) {
    return (
      <Pill tone="warning" withDot>
        NO PRICE
      </Pill>
    );
  }

  const stale = asset ? oracle.ageSeconds > asset.maxOracleAge : false;
  const wide = asset ? oracle.confBps > asset.maxConfBps : false;
  const tone: Tone = stale || wide ? "warning" : "success";
  const label = stale ? "STALE" : wide ? "UNCERTAIN" : "FRESH";

  if (compact) {
    return (
      <Pill tone={tone} withDot>
        {label}
      </Pill>
    );
  }

  return (
    <span className="row g-10 wrap">
      <Pill tone={tone} withDot>
        {label}
      </Pill>
      <span className="t-meta">{formatAge(oracle.ageSeconds)}</span>
    </span>
  );
}

/** Reference stock-market session state. */
export function MarketStatus({
  session,
  loading = false,
}: {
  session: SessionHint | null;
  loading?: boolean;
}) {
  if (loading) return <Skeleton height={22} width={90} radius={999} />;
  return (
    <Pill tone={session?.open ? "success" : "warning"} withDot>
      {session?.open ? "OPEN" : "CLOSED"}
    </Pill>
  );
}

export interface MarketRow {
  symbol: string;
  name: string;
  logo?: React.ReactNode;
  /** True when this asset is registered on-chain on devnet. */
  live: boolean;
  priceUsd: number | null;
  ltvBps: number | null;
  quoteSymbol?: string;
  marketSymbol?: string;
  mint?: string;
}

/**
 * Market card.
 *
 * Live registered markets display on-chain parameters, real Pyth feed status,
 * and direct one-click actions to borrow quote tokens or deposit collateral.
 */
export function MarketCard({
  row,
  oracle,
  asset,
  session,
  loading,
  onSelect,
}: {
  row: MarketRow;
  oracle: OracleSnapshot | null;
  asset: AssetConfigView | null;
  session: SessionHint | null;
  loading: boolean;
  onSelect?: () => void;
}) {
  const isSol = row.quoteSymbol === "WSOL";

  return (
    <Card>
      <div className="row g-12" style={{ marginBottom: 14 }}>
        <span
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: isSol ? "#9945FF18" : "var(--surface-2)",
            border: `1px solid ${isSol ? "#9945FF44" : "var(--border)"}`,
            flex: "none",
          }}
        >
          {row.logo ?? <Icon name="layers" size={18} />}
        </span>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row g-6" style={{ alignItems: "center" }}>
            <span className="t-title truncate">{row.symbol}</span>
            {row.quoteSymbol && (
              <span className="t-meta" style={{ fontSize: 12 }}>
                / {row.quoteSymbol}
              </span>
            )}
          </div>
          <div className="t-meta truncate">{row.name}</div>
        </div>
        {row.live ? (
          <Pill tone={isSol ? "accent" : "success"} withDot>
            {isSol ? "BORROW SOL" : "LIVE"}
          </Pill>
        ) : (
          <Pill>SOON</Pill>
        )}
      </div>

      {row.live ? (
        <>
          {loading ? (
            <Skeleton height={28} width="50%" />
          ) : (
            <div className="stat__value" style={{ fontSize: 24 }}>
              {row.priceUsd === null ? (
                row.ltvBps ? `--` : "--"
              ) : (
                `$${formatMoney(row.priceUsd)}`
              )}
            </div>
          )}
          <div className="stat__sub" style={{ marginBottom: 12 }}>
            Verified on-chain price {row.quoteSymbol ? `· Quote: ${row.quoteSymbol}` : ""}
          </div>

          <DataRow
            label="Price status"
            value={<OracleStatus oracle={oracle} asset={asset} loading={loading} compact />}
          />
          <DataRow
            label="Stock market"
            value={<MarketStatus session={session} loading={loading} />}
          />
          <DataRow
            label="Borrowing limit"
            value={row.ltvBps === null ? "--" : formatPercent(row.ltvBps)}
          />

          <div className="row g-8" style={{ marginTop: 14 }}>
            <button
              type="button"
              className="btn btn--accent btn--sm grow"
              onClick={onSelect}
            >
              Borrow {isSol ? "SOL" : (row.quoteSymbol || "USDC")}
            </button>
            <a
              href={`/app/position?market=${row.marketSymbol || row.symbol}`}
              className="btn btn--secondary btn--sm"
            >
              Deposit
            </a>
          </div>
        </>
      ) : (
        <p className="t-sm muted">
          Not yet supported as collateral. circuit only accepts assets that have
          been registered on-chain with a verified price feed.
        </p>
      )}
    </Card>
  );
}
