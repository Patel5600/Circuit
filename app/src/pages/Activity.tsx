import React, { useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

import { PageContainer } from "../components/layout/AppShell";
import { ConfigNotice, ConnectPrompt } from "../components/layout/Guards";
import {
  Button,
  Card,
  EmptyState,
  Icon,
  IconName,
  Notice,
  Pill,
  Skeleton,
} from "../components/ui";
import { ExplorerLink } from "../components/technical/AddressCard";
import { ActivityItem, ActivityKind, useActivity } from "../hooks/useActivity";
import { activeAssetDisplay, QUOTE_SYMBOL } from "../lib/asset";
import { formatRelativeTime, formatTokens, shortenAddress } from "../lib/format";
import { toUi } from "../lib/protocol";
import { detectActivityPatterns } from "../lib/activity/pattern-engine";
import { ActivityEvent, DetectedPattern } from "../lib/domain/types";
import { TransactionDetailDrawer } from "../components/drawers/TransactionDetailDrawer";

const KIND_META: Record<
  ActivityKind,
  { label: string; icon: IconName; color: string }
> = {
  deposit: { label: "Deposit", icon: "deposit", color: "var(--success)" },
  borrow: { label: "Borrow", icon: "borrow", color: "var(--accent)" },
  repay: { label: "Repay", icon: "repay", color: "var(--success)" },
  withdraw: { label: "Withdraw", icon: "withdraw", color: "var(--text-2)" },
  liquidation: { label: "Liquidation", icon: "alert", color: "var(--danger)" },
  other: { label: "Position update", icon: "activity", color: "var(--text-3)" },
};

function ActivityRow({
  item,
  collateralSymbol,
  onClick,
}: {
  item: ActivityItem;
  collateralSymbol: string;
  onClick: () => void;
}) {
  const meta = KIND_META[item.kind];
  const unitSymbol =
    item.unit === "collateral" ? collateralSymbol : item.unit === "quote" ? QUOTE_SYMBOL : "";
  const who = item.kind === "borrow" || item.kind === "repay" ? "Autonomous Strategy" : "Owner";
  const resultText = item.success ? "✓ ALLOWED" : "✕ BLOCKED";
  const riskState = item.success ? "SAFE" : "DEFENSIVE";
  const reason =
    item.kind === "repay"
      ? "Risk-reducing action permitted"
      : item.kind === "deposit"
      ? "Collateral-increasing action permitted"
      : item.success
      ? "Compliant with on-chain risk & policy limits"
      : "Additional risk not permitted in DEFENSIVE";

  return (
    <li
      className="act"
      onClick={onClick}
      style={{
        cursor: "pointer",
        transition: "background var(--t-fast)",
      }}
    >
      <span className="act__icon" style={{ color: meta.color }}>
        <Icon name={meta.icon} size={16} />
      </span>

      <div className="grow" style={{ minWidth: 0 }}>
        <div className="row g-8 wrap" style={{ alignItems: "center" }}>
          <span style={{ fontWeight: 650, fontSize: 13.5 }}>
            {meta.label}{item.kind === "borrow" ? " REQUEST" : ""}
          </span>
          <span
            style={{
              fontSize: 11,
              fontFamily: "var(--mono)",
              background: "var(--surface-3)",
              padding: "1px 6px",
              borderRadius: 4,
              color: "var(--text-2)",
            }}
          >
            {unitSymbol || collateralSymbol}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>
            by {who}
          </span>
          {item.amount !== null && (
            <span
              className="t-sm"
              style={{ fontVariantNumeric: "tabular-nums", color: "var(--text)", fontWeight: 600 }}
            >
              {formatTokens(toUi(item.amount))} {unitSymbol}
            </span>
          )}
        </div>

        <div className="act__meta" style={{ marginTop: 4 }}>
          <span style={{ color: "var(--text-3)" }}>{formatRelativeTime(item.blockTime)}</span>
          <span className="mono">{shortenAddress(item.signature, 6, 6)}</span>
          <span style={{ color: "var(--text-3)" }}>·</span>
          <span style={{ color: "var(--text-3)" }}>
            Risk State: <strong style={{ color: item.success ? "var(--success)" : "var(--danger)" }}>{riskState}</strong>
          </span>
          <span style={{ color: "var(--text-3)" }}>·</span>
          <span style={{ color: "var(--text-2)", fontStyle: "italic" }}>
            {reason}
          </span>
        </div>
      </div>

      <div className="act__right" onClick={(e) => e.stopPropagation()}>
        <Pill tone={item.success ? "success" : "danger"}>
          {resultText}
        </Pill>
        <ExplorerLink kind="tx" id={item.signature} />
      </div>
    </li>
  );
}

export default function Activity() {
  const { connected, publicKey } = useWallet();
  const { items, loading, error, refresh } = useActivity(50);
  const display = useMemo(activeAssetDisplay, []);
  const [selectedEvent, setSelectedEvent] = useState<ActivityEvent | null>(null);

  // Normalize into domain ActivityEvent[] for pattern engine
  const domainEvents: ActivityEvent[] = useMemo(() => {
    if (!items || !publicKey) return [];
    return items.map((it) => ({
      id: it.signature,
      type:
        it.kind === "deposit"
          ? "DEPOSIT"
          : it.kind === "borrow"
          ? "BORROW"
          : it.kind === "repay"
          ? "REPAY"
          : it.kind === "withdraw"
          ? "WITHDRAW"
          : it.kind === "liquidation"
          ? "LIQUIDATION"
          : "PROGRAM_INTERACTION",
      action: KIND_META[it.kind].label,
      assetSymbol: it.unit === "collateral" ? display.symbol : "USDC",
      amountNative: it.amount,
      amountUi: it.amount !== null ? toUi(it.amount) : null,
      status: it.success ? "CONFIRMED" : "FAILED",
      timestamp: (it.blockTime ?? Math.floor(Date.now() / 1000)) * 1000,
      signature: it.signature,
      wallet: publicKey.toBase58(),
    }));
  }, [items, publicKey, display.symbol]);

  const patterns = useMemo(() => {
    return detectActivityPatterns(domainEvents);
  }, [domainEvents]);

  // Date Grouping: Today, Yesterday, This Week, Older
  const grouped = useMemo(() => {
    if (!items) return { today: [], yesterday: [], thisWeek: [], older: [] };
    const nowSec = Math.floor(Date.now() / 1000);
    const daySec = 86400;

    const today: ActivityItem[] = [];
    const yesterday: ActivityItem[] = [];
    const thisWeek: ActivityItem[] = [];
    const older: ActivityItem[] = [];

    items.forEach((it) => {
      const time = it.blockTime ?? nowSec;
      const diff = nowSec - time;
      if (diff <= daySec) {
        today.push(it);
      } else if (diff <= daySec * 2) {
        yesterday.push(it);
      } else if (diff <= daySec * 7) {
        thisWeek.push(it);
      } else {
        older.push(it);
      }
    });

    return { today, yesterday, thisWeek, older };
  }, [items]);

  const handleRowClick = (item: ActivityItem) => {
    const found = domainEvents.find((e) => e.signature === item.signature);
    if (found) {
      setSelectedEvent(found);
    } else {
      setSelectedEvent({
        id: item.signature,
        type: "PROGRAM_INTERACTION",
        action: KIND_META[item.kind].label,
        assetSymbol: display.symbol,
        amountNative: item.amount,
        amountUi: item.amount ? toUi(item.amount) : null,
        status: item.success ? "CONFIRMED" : "FAILED",
        timestamp: (item.blockTime ?? Math.floor(Date.now() / 1000)) * 1000,
        signature: item.signature,
        wallet: publicKey?.toBase58() ?? "",
      });
    }
  };

  return (
    <PageContainer
      title="Activity & Event Intelligence"
      subtitle="On-chain forensic activity feed, deterministic pattern recognition, and transaction verification."
      action={
        connected ? (
          <Button variant="ghost" size="sm" onClick={refresh} loading={loading}>
            Refresh
          </Button>
        ) : undefined
      }
    >
      <ConfigNotice />

      {!connected ? (
        <ConnectPrompt what="Your transaction history" />
      ) : error ? (
        <Notice tone="danger" title="Could not load activity">
          {error}
        </Notice>
      ) : loading && !items ? (
        <Card flush>
          <div className="stack" style={{ padding: 16, gap: 18 }}>
            {[0, 1, 2, 3].map((i) => (
              <div className="row g-12" key={i}>
                <Skeleton height={34} width={34} radius={999} />
                <div className="grow stack g-6">
                  <Skeleton height={14} width="35%" />
                  <Skeleton height={12} width="55%" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : !items || items.length === 0 ? (
        <EmptyState icon="activity" title="No transaction activity recorded">
          Once you deposit, borrow, repay, or withdraw on Circuit, those confirmed on-chain transactions will appear here with forensic diagnostics.
        </EmptyState>
      ) : (
        <div className="stack g-20">
          {/* DETECTED PATTERNS INTELLIGENCE PANEL */}
          {patterns.length > 0 && (
            <div
              className="stack g-10"
              style={{
                padding: 16,
                background: "var(--surface-2, #0d0f15)",
                borderRadius: "var(--r, 10px)",
                border: "1px solid var(--border, #1a1d26)",
              }}
            >
              <div className="row between g-8" style={{ alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-3)" }}>
                  ACTIVITY PATTERN SIGNALS ({patterns.length})
                </span>
                <span style={{ fontSize: 11, color: "var(--text-3)" }}>
                  Deterministic Rule-Based Engine
                </span>
              </div>

              <div className="stack g-10">
                {patterns.map((pat) => (
                  <div
                    key={pat.id}
                    style={{
                      padding: "12px 14px",
                      borderRadius: "var(--r-sm, 8px)",
                      background:
                        pat.severity === "critical"
                          ? "rgba(224, 82, 82, 0.08)"
                          : pat.severity === "warning"
                          ? "rgba(229, 169, 59, 0.08)"
                          : "rgba(127, 195, 154, 0.08)",
                      border: `1px solid ${
                        pat.severity === "critical"
                          ? "rgba(224, 82, 82, 0.3)"
                          : pat.severity === "warning"
                          ? "rgba(229, 169, 59, 0.3)"
                          : "rgba(127, 195, 154, 0.3)"
                      }`,
                    }}
                  >
                    <div className="row between g-8" style={{ alignItems: "center" }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>
                        {pat.name}
                      </span>
                      <Pill
                        tone={
                          pat.severity === "critical"
                            ? "danger"
                            : pat.severity === "warning"
                            ? "warning"
                            : "accent"
                        }
                      >
                        {pat.severity.toUpperCase()}
                      </Pill>
                    </div>
                    <p style={{ margin: "6px 0 0 0", fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.45 }}>
                      {pat.explanation}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CHRONOLOGICAL GROUPS */}
          {grouped.today.length > 0 && (
            <div className="stack g-8">
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-3)", paddingLeft: 4 }}>
                TODAY
              </div>
              <Card flush>
                <ul>
                  {grouped.today.map((it) => (
                    <ActivityRow
                      key={it.signature}
                      item={it}
                      collateralSymbol={display.symbol}
                      onClick={() => handleRowClick(it)}
                    />
                  ))}
                </ul>
              </Card>
            </div>
          )}

          {grouped.yesterday.length > 0 && (
            <div className="stack g-8">
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-3)", paddingLeft: 4 }}>
                YESTERDAY
              </div>
              <Card flush>
                <ul>
                  {grouped.yesterday.map((it) => (
                    <ActivityRow
                      key={it.signature}
                      item={it}
                      collateralSymbol={display.symbol}
                      onClick={() => handleRowClick(it)}
                    />
                  ))}
                </ul>
              </Card>
            </div>
          )}

          {grouped.thisWeek.length > 0 && (
            <div className="stack g-8">
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-3)", paddingLeft: 4 }}>
                THIS WEEK
              </div>
              <Card flush>
                <ul>
                  {grouped.thisWeek.map((it) => (
                    <ActivityRow
                      key={it.signature}
                      item={it}
                      collateralSymbol={display.symbol}
                      onClick={() => handleRowClick(it)}
                    />
                  ))}
                </ul>
              </Card>
            </div>
          )}

          {grouped.older.length > 0 && (
            <div className="stack g-8">
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-3)", paddingLeft: 4 }}>
                OLDER
              </div>
              <Card flush>
                <ul>
                  {grouped.older.map((it) => (
                    <ActivityRow
                      key={it.signature}
                      item={it}
                      collateralSymbol={display.symbol}
                      onClick={() => handleRowClick(it)}
                    />
                  ))}
                </ul>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* Transaction Detail Drawer */}
      <TransactionDetailDrawer
        event={selectedEvent}
        open={Boolean(selectedEvent)}
        onClose={() => setSelectedEvent(null)}
      />
    </PageContainer>
  );
}
