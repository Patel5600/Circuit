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
  change24hPercent?: number | null;
  changeStatus?: "available" | "unavailable" | "AVAILABLE" | "UNAVAILABLE";
  confBps?: number;
  freshness?: "LIVE" | "RECENT" | "STALE" | "UNAVAILABLE";
  ltvBps: number | null;
  quoteSymbol?: string;
  marketSymbol?: string;
  mint?: string;
}

/**
 * Market card.
 *
 * Live registered markets display on-chain parameters, real Pyth feed status,
 * real 24h price changes, and direct one-click actions to borrow or deposit.
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
            {isSol ? "BORROW SOL" : "COLLATERAL AVAILABLE"}
          </Pill>
        ) : (
          <Pill tone="neutral">DISCOVERY</Pill>
        )}
      </div>

      {row.live ? (
        <>
          {loading ? (
            <Skeleton height={28} width="50%" />
          ) : (
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 2 }}>
              <div className="stat__value" style={{ fontSize: 24, fontVariantNumeric: "tabular-nums" }}>
                {row.priceUsd === null ? (
                  row.ltvBps ? `--` : "--"
                ) : (
                  `$${formatMoney(row.priceUsd)}`
                )}
              </div>
              {(row.changeStatus === "available" || row.changeStatus === "AVAILABLE") && row.change24hPercent !== null && row.change24hPercent !== undefined ? (
                <span
                  style={{
                    fontSize: 12,
                    fontFamily: "var(--mono)",
                    fontWeight: 650,
                    color: row.change24hPercent >= 0 ? "var(--success, #7fc39a)" : "var(--danger, #cf8b8b)",
                  }}
                >
                  {row.change24hPercent >= 0 ? "+" : ""}
                  {row.change24hPercent.toFixed(2)}%
                </span>
              ) : (
                <span style={{ fontSize: 11, color: "var(--text-3)", fontStyle: "italic" }}>
                  24h change unavailable
                </span>
              )}
            </div>
          )}
          <div className="stat__sub" style={{ marginBottom: 12 }}>
            Pyth on-chain push oracle {row.quoteSymbol ? `· Quote: ${row.quoteSymbol}` : ""}
          </div>

          <DataRow
            label="Price status"
            value={
              row.freshness ? (
                <Pill
                  tone={row.freshness === "LIVE" ? "success" : row.freshness === "RECENT" ? "warning" : "danger"}
                  withDot
                >
                  {row.freshness}
                </Pill>
              ) : (
                <OracleStatus oracle={oracle} asset={asset} loading={loading} compact />
              )
            }
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
        <div style={{ padding: "8px 0" }}>
          <p className="t-sm muted" style={{ margin: "0 0 8px 0" }}>
            Pipeline equity. Real-time market oracle integration undergoing risk parameter calibration.
          </p>
          <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--text-3)" }}>
            Standard Base LTV: {row.ltvBps ? `${(row.ltvBps / 100).toFixed(0)}%` : "60%"}
          </div>
        </div>
      )}
    </Card>
  );
}
