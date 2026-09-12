import React from "react";

import { Card, DataRow, Icon, Skeleton, Tone } from "../ui";
import {
  formatHealthFactor,
  formatMoney,
  formatPercent,
  formatTokens,
} from "../../lib/format";
import { AssetConfigView, PositionView, toUi } from "../../lib/protocol";
import { RiskView } from "../../hooks/useProtocolState";

/* -- Health factor -------------------------------------------------------- */

export function healthTone(hfBps: number | null, minBps: number): Tone {
  if (hfBps === null) return "success";
  if (hfBps < minBps) return "danger";
  if (hfBps < minBps * 1.25) return "warning";
  return "success";
}

export function healthLabel(hfBps: number | null, minBps: number): string {
  if (hfBps === null) return "No debt";
  if (hfBps < minBps) return "At risk";
  if (hfBps < minBps * 1.25) return "Caution";
  return "Healthy";
}

/**
 * Health factor display. When there is no debt it reads "Healthy / No debt"
 * rather than an infinity glyph, which is meaningless to most users.
 */
export function HealthFactor({
  hfBps,
  minBps,
  loading = false,
  size = "lg",
}: {
  hfBps: number | null;
  minBps: number;
  loading?: boolean;
  size?: "lg" | "sm";
}) {
  const tone = healthTone(hfBps, minBps);
  const label = healthLabel(hfBps, minBps);
  const color = tone === "danger" ? "var(--danger)" : tone === "warning" ? "var(--warning)" : "var(--success)";

  if (loading) return <Skeleton height={size === "lg" ? 30 : 20} width="60%" />;

  return (
    <span className="row g-8" style={{ alignItems: "baseline" }}>
      <span
        style={{
          fontSize: size === "lg" ? 28 : 18,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          fontVariantNumeric: "tabular-nums",
          color,
        }}
      >
        {formatHealthFactor(hfBps)}
      </span>
      <span className="row g-6 t-meta" style={{ color }}>
        <span className="dot" aria-hidden="true" />
        {label}
      </span>
    </span>
  );
}

/**
 * Risk bar. The marker sits at the current health factor on a 0..2+ scale, with
 * the liquidation point marked so the distance to it is legible at a glance.
 */
export function RiskBar({
  hfBps,
  minBps,
}: {
  hfBps: number | null;
  minBps: number;
}) {
  // No debt is full-width healthy; there is no liquidation distance to show.
  const hf = hfBps === null ? 2.5 : hfBps / 10_000;
  const min = minBps / 10_000;
  const maxScale = 2.5;
  const pct = Math.max(2, Math.min(100, (hf / maxScale) * 100));
  const minPct = Math.min(100, (min / maxScale) * 100);
  const tone = healthTone(hfBps, minBps);
  const fill =
    tone === "danger"
      ? "var(--danger)"
      : tone === "warning"
      ? "var(--warning)"
      : "var(--success)";

  return (
    <div>
      <div className="row between g-8" style={{ marginBottom: 8 }}>
        <span className="t-label">{healthLabel(hfBps, minBps)}</span>
        <span className="t-meta">
          Liquidation at {min.toFixed(2)}
        </span>
      </div>

      <div
        className="hbar"
        role="meter"
        aria-label="Health factor"
        aria-valuemin={0}
        aria-valuemax={maxScale}
        aria-valuenow={hfBps === null ? undefined : Number(hf.toFixed(2))}
        aria-valuetext={
          hfBps === null ? "No debt" : `${hf.toFixed(2)}, ${healthLabel(hfBps, minBps)}`
        }
      >
        <span className="hbar__fill" style={{ width: `${pct}%`, background: fill }} />
        {/* Liquidation threshold marker */}
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: `${minPct}%`,
            top: -2,
            bottom: -2,
            width: 2,
            background: "var(--text)",
            opacity: 0.65,
          }}
        />
      </div>

      <div className="hbar__ticks">
        <span>0</span>
        <span>1.0</span>
        <span>2.0+</span>
      </div>
    </div>
  );
}

/* -- Summary -------------------------------------------------------------- */

export function PositionSummary({
  loading,
  position,
  asset,
  risk,
  minBps,
}: {
  loading: boolean;
  position: PositionView | null;
  asset: AssetConfigView | null;
  risk: RiskView | null;
  minBps: number;
}) {
  const collateral = position?.collateralAmount ?? 0n;
  const debt = position?.debtAmount ?? 0n;
  const value = risk?.collateralValueNative ?? 0n;
  const hf = risk?.healthFactorBps ?? null;

  // LTV is presented as a utilisation figure users recognise from brokerages.
  const ltvBps =
    value > 0n ? Number((debt * 10_000n) / value) : 0;

  return (
    <div className="grid grid--stats">
      <div className="card">
        <div className="stat__label">Collateral value</div>
        {loading ? (
          <Skeleton height={30} width="70%" />
        ) : (
          <div className="stat__value">${formatMoney(toUi(value))}</div>
        )}
        {!loading && (
          <div className="stat__sub">
            {formatTokens(toUi(collateral))} tokens deposited
          </div>
        )}
      </div>

      <div className="card">
        <div className="stat__label">Borrowed</div>
        {loading ? (
          <Skeleton height={30} width="70%" />
        ) : (
          <div className="stat__value">${formatMoney(toUi(debt))}</div>
        )}
        {!loading && (
          <div className="stat__sub">
            {debt === 0n ? "Nothing borrowed" : `${formatPercent(ltvBps, 1)} of collateral`}
          </div>
        )}
      </div>

      <div className="card">
        <div className="stat__label">Health</div>
        <div style={{ marginTop: 2 }}>
          <HealthFactor hfBps={hf} minBps={minBps} loading={loading} />
        </div>
        {!loading && asset && (
          <div className="stat__sub">
            Liquidation threshold {formatPercent(asset.liquidationThresholdBps)}
          </div>
        )}
      </div>
    </div>
  );
}

/* -- Borrowing power ------------------------------------------------------ */

export function BorrowCapacity({
  loading,
  risk,
  vaultLiquidity,
  action,
}: {
  loading: boolean;
  risk: RiskView | null;
  vaultLiquidity: bigint;
  action?: React.ReactNode;
}) {
  const available = risk?.availableToBorrowNative ?? 0n;
  const capacity = risk?.capacityNative ?? 0n;
  // A user can never draw more than the protocol actually holds.
  const effective = available < vaultLiquidity ? available : vaultLiquidity;
  const usedPct =
    capacity > 0n
      ? Math.min(100, Number(((capacity - available) * 100n) / capacity))
      : 0;

  return (
    <Card title="Borrowing power">
      {loading ? (
        <Skeleton height={30} width="60%" />
      ) : (
        <>
          <div className="row between g-12" style={{ alignItems: "baseline" }}>
            <div>
              <div className="stat__value">${formatMoney(toUi(effective))}</div>
              <div className="stat__sub">Available to borrow now</div>
            </div>
            {action}
          </div>

          <div style={{ marginTop: 16 }}>
            <div className="hbar" aria-hidden="true">
              <span
                className="hbar__fill"
                style={{ width: `${usedPct}%`, background: "var(--accent)" }}
              />
            </div>
            <div className="row between t-meta" style={{ marginTop: 7 }}>
              <span>{usedPct.toFixed(0)}% of limit used</span>
              <span>Limit ${formatMoney(toUi(capacity))}</span>
            </div>
          </div>

          {effective < available && (
            <p className="t-meta" style={{ marginTop: 12 }}>
              Limited by available protocol liquidity of $
              {formatMoney(toUi(vaultLiquidity))}.
            </p>
          )}
        </>
      )}
    </Card>
  );
}

/* -- Collateral ----------------------------------------------------------- */

export function CollateralCard({
  loading,
  position,
  risk,
  symbol,
  name,
  priceUsd,
  logo,
  action,
}: {
  loading: boolean;
  position: PositionView | null;
  risk: RiskView | null;
  symbol: string;
  name: string;
  priceUsd: number | null;
  logo?: React.ReactNode;
  action?: React.ReactNode;
}) {
  const collateral = position?.collateralAmount ?? 0n;

  return (
    <Card title="Your collateral" action={action}>
      {loading ? (
        <div className="stack g-10">
          <Skeleton height={22} width="45%" />
          <Skeleton height={16} width="65%" />
        </div>
      ) : (
        <>
          <div className="row g-12" style={{ marginBottom: 14 }}>
            <span
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                flex: "none",
              }}
            >
              {logo ?? <Icon name="layers" size={18} />}
            </span>
            <div className="grow">
              <div className="t-title">{symbol}</div>
              <div className="t-meta">{name}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>
                {priceUsd === null ? "--" : `$${formatMoney(priceUsd)}`}
              </div>
              <div className="t-meta">Verified price</div>
            </div>
          </div>

          <DataRow
            label="Amount deposited"
            value={`${formatTokens(toUi(collateral))} ${symbol}`}
          />
          <DataRow
            label="Value as collateral"
            value={`$${formatMoney(toUi(risk?.collateralValueNative ?? 0n))}`}
          />
        </>
      )}
    </Card>
  );
}
