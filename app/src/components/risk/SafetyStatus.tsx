import React from "react";
import { Link } from "react-router-dom";

import { Card, Disclosure, DataRow, Icon, Pill, Skeleton, Tone } from "../ui";
import { AssetConfigView } from "../../lib/protocol";
import { OracleSnapshot } from "../../lib/pyth";
import { SessionHint } from "../../hooks/useProtocolState";
import { formatAge, formatMoney } from "../../lib/format";

/**
 * The four conditions the program verifies before it will allow a
 * risk-increasing action. Each row is derived from live state; nothing here is
 * hardcoded. Status is conveyed by icon + word + colour, never colour alone.
 */

export interface SafetyCheck {
  name: string;
  detail: string;
  ok: boolean;
  status: string;
}

export function buildSafetyChecks(
  asset: AssetConfigView | null,
  oracle: OracleSnapshot | null,
  session: SessionHint | null
): SafetyCheck[] {
  const checks: SafetyCheck[] = [];

  const freshOk = Boolean(
    oracle && asset && oracle.ageSeconds <= asset.maxOracleAge
  );
  checks.push({
    name: "Price freshness",
    detail: oracle
      ? `Last verified ${formatAge(oracle.ageSeconds)}`
      : "No verified price available",
    ok: freshOk,
    status: freshOk ? "Fresh" : "Stale",
  });

  const confOk = Boolean(oracle && asset && oracle.confBps <= asset.maxConfBps);
  checks.push({
    name: "Price certainty",
    detail: oracle
      ? `Uncertainty ${(oracle.confBps / 100).toFixed(2)}% of price`
      : "Unknown",
    ok: confOk,
    status: confOk ? "Healthy" : "Too wide",
  });

  checks.push({
    name: "Stock market",
    detail: session ? session.label : "Checking session",
    ok: Boolean(session?.open),
    status: session?.open ? "Open" : "Closed",
  });

  const custodyOk = asset ? asset.custodyState !== "impaired" : false;
  const liqOk = asset
    ? asset.liquidityState !== "thin" && asset.liquidityState !== "critical"
    : false;
  checks.push({
    name: "Asset conditions",
    detail:
      asset
        ? `Custody ${asset.custodyState}, liquidity ${asset.liquidityState}`
        : "Unknown",
    ok: custodyOk && liqOk,
    status: custodyOk && liqOk ? "Normal" : "Degraded",
  });

  return checks;
}

export function RiskCheckList({ checks }: { checks: SafetyCheck[] }) {
  return (
    <ul>
      {checks.map((c) => (
        <li className="check" key={c.name}>
          <span
            className="check__icon"
            style={{ color: c.ok ? "var(--success)" : "var(--warning)" }}
          >
            <Icon name={c.ok ? "check" : "alert"} size={15} />
          </span>
          <span className="check__body">
            <span className="check__name">{c.name}</span>
            <span className="check__note">{c.detail}</span>
          </span>
          <span
            className="check__val"
            style={{ color: c.ok ? "var(--success)" : "var(--warning)" }}
          >
            {c.status}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Headline safety state. "SAFE" is the dominant user-facing signal; the
 * per-condition detail sits underneath and the raw protocol fields are behind a
 * disclosure so a normal user never has to read them.
 */
export function SafetyStatus({
  loading,
  asset,
  oracle,
  session,
  guardReason,
  showTechnical = true,
}: {
  loading: boolean;
  asset: AssetConfigView | null;
  oracle: OracleSnapshot | null;
  session: SessionHint | null;
  guardReason?: string;
  showTechnical?: boolean;
}) {
  const checks = buildSafetyChecks(asset, oracle, session);
  const allOk = checks.every((c) => c.ok);
  const tone: Tone = allOk ? "success" : "warning";
  const headline = allOk ? "Safe" : "Restricted";

  return (
    <Card
      title="Market conditions"
      action={
        loading ? (
          <Skeleton width={78} height={22} radius={999} />
        ) : (
          <Pill tone={tone} withDot>
            {headline.toUpperCase()}
          </Pill>
        )
      }
    >
      {loading ? (
        <div className="stack g-12">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={18} />
          ))}
        </div>
      ) : (
        <>
          <p className="t-sm muted" style={{ marginBottom: 12 }}>
            {allOk
              ? "All safety checks pass. Borrowing is available."
              : "One or more checks did not pass, so new borrowing is paused. Existing positions are unaffected."}
          </p>

          <RiskCheckList checks={checks} />

          {showTechnical && (
            <div style={{ marginTop: 10 }}>
              <Disclosure label="View technical details">
                <div style={{ paddingTop: 4 }}>
                  {oracle && (
                    <>
                      <DataRow
                        label="Verified price"
                        value={`$${formatMoney(oracle.priceUsd)}`}
                      />
                      <DataRow
                        label="Publish time"
                        value={new Date(
                          Number(oracle.update.publishTime) * 1000
                        ).toISOString().replace("T", " ").slice(0, 19) + "Z"}
                        mono
                      />
                      <DataRow
                        label="Confidence"
                        value={`${oracle.confBps} bps`}
                        mono
                      />
                      <DataRow
                        label="Exponent"
                        value={oracle.update.exponent}
                        mono
                      />
                      <DataRow
                        label="Verification level"
                        value={oracle.update.isFull ? "Full" : "Partial"}
                      />
                    </>
                  )}
                  {asset && (
                    <>
                      <DataRow
                        label="Max price age"
                        value={`${asset.maxOracleAge}s`}
                        mono
                      />
                      <DataRow
                        label="Max confidence"
                        value={`${asset.maxConfBps} bps`}
                        mono
                      />
                    </>
                  )}
                  {guardReason && (
                    <DataRow label="Guard reason" value={guardReason} mono />
                  )}
                  <div style={{ marginTop: 12 }}>
                    <Link to="/app/verify" className="row g-6 t-sm" style={{ color: "var(--accent)" }}>
                      Open on-chain verification
                      <Icon name="arrowRight" size={14} />
                    </Link>
                  </div>
                </div>
              </Disclosure>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

/**
 * Shown in place of an action when the protocol will refuse it.
 * Translates gating into plain language and never surfaces raw error text.
 */
export function BlockedAction({
  title = "Borrow unavailable",
  reasons,
  note = "Your existing position is not affected.",
}: {
  title?: string;
  reasons: string[];
  note?: string;
}) {
  return (
    <div className="notice notice--warning" role="alert">
      <span className="notice__icon" style={{ color: "var(--warning)" }}>
        <Icon name="alert" size={17} />
      </span>
      <div className="grow">
        <div className="notice__title">{title}</div>
        <ul className="stack g-4" style={{ marginTop: 6 }}>
          {reasons.map((r) => (
            <li key={r} className="t-sm muted row g-8" style={{ alignItems: "flex-start" }}>
              <span style={{ color: "var(--warning)", marginTop: 5 }}>
                <span
                  className="dot"
                  style={{ width: 5, height: 5, display: "block" }}
                  aria-hidden="true"
                />
              </span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
        <p className="t-meta" style={{ marginTop: 10 }}>
          {note}
        </p>
        <div className="row g-8 wrap" style={{ marginTop: 12 }}>
          <Link to="/app/learn" className="btn btn--ghost btn--sm">
            Why?
          </Link>
          <Link to="/app/verify" className="btn btn--ghost btn--sm">
            View verification
          </Link>
        </div>
      </div>
    </div>
  );
}
