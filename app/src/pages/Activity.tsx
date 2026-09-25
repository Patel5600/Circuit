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
import { formatRelativeTime, formatTokens, humanizeReasonCode, shortenAddress } from "../lib/format";
import { toUi } from "../lib/protocol";
import { detectActivityPatterns } from "../lib/activity/pattern-engine";
import { ActivityEvent, DetectedPattern } from "../lib/domain/types";
import { TransactionDetailDrawer } from "../components/drawers/TransactionDetailDrawer";
import { ActivityTimeline } from "../components/kit4/ActivityTimeline";

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
  const meta = KIND_META[item.kind] || KIND_META.other;
  const unitSymbol =
    item.unit === "collateral" ? (item.assetSymbol || collateralSymbol) : item.unit === "quote" ? QUOTE_SYMBOL : "";
  const resultText = item.success ? "ALLOWED" : "BLOCKED";
  const riskState = item.success ? "SAFE" : "DEFENSIVE";
  const reasonCode = item.reasonCode || (item.success ? "ALLOWED" : "BORROW_DISABLED_BY_RISK_STATE");

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
          <span
            style={{
              fontSize: 11,
              padding: "1px 6px",
              borderRadius: 4,
              fontFamily: "var(--mono)",
              fontWeight: 600,
              background: item.actor === "AGENT" ? "var(--accent-dim)" : "var(--success-dim)",
              color: item.actor === "AGENT" ? "var(--accent)" : "var(--success)",
            }}
          >
            {item.actor === "AGENT" ? "AGENT" : "MANUAL"}
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
          <span
            className="mono"
            title={`Policy: ${humanizeReasonCode(reasonCode)}`}
            style={{
              fontSize: 11,
              padding: "1px 6px",
              borderRadius: 3,
              background: item.success ? "var(--success-dim)" : "var(--danger-dim)",
              color: item.success ? "var(--success)" : "var(--danger)",
            }}
          >
            {humanizeReasonCode(reasonCode)}
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
  const [actorFilter, setActorFilter] = useState<"ALL" | "HUMAN" | "AGENT">("ALL");
  const [viewMode, setViewMode] = useState<"timeline" | "forensic" | "split">("timeline");

  // Summary Metrics Calculation
  const metrics = useMemo(() => {
    if (!items || items.length === 0) {
      return { total: 0, allowed: 0, blocked: 0, ratePct: 100, agentCount: 0, manualCount: 0 };
    }
    const total = items.length;
    const allowed = items.filter((i) => i.success).length;
    const blocked = total - allowed;
    const ratePct = total > 0 ? Math.round((allowed / total) * 100) : 100;
    const agentCount = items.filter((i) => i.actor === "AGENT").length;
    const manualCount = total - agentCount;
    return { total, allowed, blocked, ratePct, agentCount, manualCount };
  }, [items]);

  // Normalize into domain ActivityEvent[] for pattern engine and drawer
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
      action: (KIND_META[it.kind] || KIND_META.other).label,
      assetSymbol: it.assetSymbol || (it.unit === "collateral" ? display.symbol : "USDC"),
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

    const filtered = items.filter((it) => {
      if (actorFilter === "ALL") return true;
      return it.actor === actorFilter;
    });

    const today: ActivityItem[] = [];
    const yesterday: ActivityItem[] = [];
    const thisWeek: ActivityItem[] = [];
    const older: ActivityItem[] = [];

    filtered.forEach((it) => {
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
  }, [items, actorFilter]);

  const handleRowClick = (item: ActivityItem) => {
    const found = domainEvents.find((e) => e.signature === item.signature);
    if (found) {
      setSelectedEvent(found);
    } else {
      setSelectedEvent({
        id: item.signature,
        type: "PROGRAM_INTERACTION",
        action: (KIND_META[item.kind] || KIND_META.other).label,
        assetSymbol: item.assetSymbol || display.symbol,
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
      subtitle="On-chain forensic activity feed, deterministic pattern recognition, and transaction verification across all markets."
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
          {/* EXECUTIVE METRICS BAR */}
          <div className="grid grid--4 g-12">
            <div
              style={{
                padding: "14px 16px",
                background: "var(--surface-2)",
                borderRadius: "var(--r)",
                border: "1px solid var(--border)",
              }}
            >
              <span className="t-label">Total Transactions</span>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, fontFamily: "var(--mono)" }}>
                {metrics.total}
              </div>
              <span style={{ fontSize: 11, color: "var(--text-3)" }}>All Deployed Markets</span>
            </div>

            <div
              style={{
                padding: "14px 16px",
                background: "var(--surface-2)",
                borderRadius: "var(--r)",
                border: "1px solid var(--border)",
              }}
            >
              <span className="t-label">Solana Policy Pass Rate</span>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, fontFamily: "var(--mono)", color: "var(--success)" }}>
                {metrics.ratePct}%
              </div>
              <span style={{ fontSize: 11, color: "var(--text-3)" }}>
                {metrics.allowed} allowed · {metrics.blocked} blocked
              </span>
            </div>

            <div
              style={{
                padding: "14px 16px",
                background: "var(--surface-2)",
                borderRadius: "var(--r)",
                border: "1px solid var(--border)",
              }}
            >
              <span className="t-label">Agent Authority Ratio</span>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, fontFamily: "var(--mono)", color: "var(--accent)" }}>
                {metrics.agentCount} / {metrics.total}
              </div>
              <span style={{ fontSize: 11, color: "var(--text-3)" }}>
                {metrics.manualCount} manual · {metrics.agentCount} autonomous
              </span>
            </div>

            <div
              style={{
                padding: "14px 16px",
                background: "var(--surface-2)",
                borderRadius: "var(--r)",
                border: "1px solid var(--border)",
              }}
            >
              <span className="t-label">Verification Mode</span>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 8, color: "var(--text)" }}>
                On-Chain Canonical
              </div>
              <span style={{ fontSize: 11, color: "var(--success)" }}>Live Solana Devnet</span>
            </div>
          </div>

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
                          ? "var(--danger-dim)"
                          : pat.severity === "warning"
                          ? "var(--warning-dim)"
                          : "var(--success-dim)",
                      border: `1px solid ${
                        pat.severity === "critical"
                          ? "var(--danger)"
                          : pat.severity === "warning"
                          ? "var(--warning)"
                          : "var(--success)"
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

          {/* CONTROLS BAR: ACTOR FILTER & VIEW SELECTOR */}
          <div className="row between g-12 wrap" style={{ alignItems: "center", padding: "4px 0" }}>
            <div className="row g-8" style={{ alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-3)" }}>
                ACTOR:
              </span>
              <div className="chips" style={{ margin: 0 }}>
                <button
                  type="button"
                  className={`chip ${actorFilter === "ALL" ? "chip--active" : ""}`}
                  onClick={() => setActorFilter("ALL")}
                  style={{ fontSize: 11, padding: "3px 10px", height: 26 }}
                >
                  ALL ({items.length})
                </button>
                <button
                  type="button"
                  className={`chip ${actorFilter === "HUMAN" ? "chip--active" : ""}`}
                  onClick={() => setActorFilter("HUMAN")}
                  style={{ fontSize: 11, padding: "3px 10px", height: 26 }}
                >
                  HUMAN ({items.filter((i) => i.actor === "HUMAN").length})
                </button>
                <button
                  type="button"
                  className={`chip ${actorFilter === "AGENT" ? "chip--active" : ""}`}
                  onClick={() => setActorFilter("AGENT")}
                  style={{ fontSize: 11, padding: "3px 10px", height: 26 }}
                >
                  AGENT ({items.filter((i) => i.actor === "AGENT").length})
                </button>
              </div>
            </div>

            <div className="row g-8" style={{ alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-3)" }}>
                VIEW:
              </span>
              <div className="chips" style={{ margin: 0 }}>
                <button
                  type="button"
                  className={`chip ${viewMode === "timeline" ? "chip--active" : ""}`}
                  onClick={() => setViewMode("timeline")}
                  style={{ fontSize: 11, padding: "3px 10px", height: 26 }}
                >
                  Timeline
                </button>
                <button
                  type="button"
                  className={`chip ${viewMode === "forensic" ? "chip--active" : ""}`}
                  onClick={() => setViewMode("forensic")}
                  style={{ fontSize: 11, padding: "3px 10px", height: 26 }}
                >
                  Forensic List
                </button>
                <button
                  type="button"
                  className={`chip ${viewMode === "split" ? "chip--active" : ""}`}
                  onClick={() => setViewMode("split")}
                  style={{ fontSize: 11, padding: "3px 10px", height: 26 }}
                >
                  Split View
                </button>
              </div>
            </div>
          </div>

          {/* VIEW: TIMELINE */}
          {(viewMode === "timeline" || viewMode === "split") && (
            <ActivityTimeline
              items={items.filter((it) => actorFilter === "ALL" || it.actor === actorFilter)}
              collateralSymbol={display.symbol}
              onItemClick={handleRowClick}
            />
          )}

          {/* VIEW: FORENSIC LIST */}
          {(viewMode === "forensic" || viewMode === "split") && (
            <Card flush>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }} className="row between g-8">
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-3)" }}>
                  ON-CHAIN FORENSIC TRANSACTION LEDGER
                </span>
                <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--mono)" }}>
                  Click row to inspect on-chain execution details
                </span>
              </div>

              <div className="stack">
                {grouped.today.length > 0 && (
                  <div>
                    <div style={{ padding: "8px 20px", background: "var(--surface-3)", fontSize: 11, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.05em" }}>
                      TODAY ({grouped.today.length})
                    </div>
                    <ul className="act-list" style={{ margin: 0, padding: 0, listStyle: "none" }}>
                      {grouped.today.map((item) => (
                        <ActivityRow
                          key={item.signature}
                          item={item}
                          collateralSymbol={display.symbol}
                          onClick={() => handleRowClick(item)}
                        />
                      ))}
                    </ul>
                  </div>
                )}

                {grouped.yesterday.length > 0 && (
                  <div>
                    <div style={{ padding: "8px 20px", background: "var(--surface-3)", fontSize: 11, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.05em" }}>
                      YESTERDAY ({grouped.yesterday.length})
                    </div>
                    <ul className="act-list" style={{ margin: 0, padding: 0, listStyle: "none" }}>
                      {grouped.yesterday.map((item) => (
                        <ActivityRow
                          key={item.signature}
                          item={item}
                          collateralSymbol={display.symbol}
                          onClick={() => handleRowClick(item)}
                        />
                      ))}
                    </ul>
                  </div>
                )}

                {grouped.thisWeek.length > 0 && (
                  <div>
                    <div style={{ padding: "8px 20px", background: "var(--surface-3)", fontSize: 11, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.05em" }}>
                      THIS WEEK ({grouped.thisWeek.length})
                    </div>
                    <ul className="act-list" style={{ margin: 0, padding: 0, listStyle: "none" }}>
                      {grouped.thisWeek.map((item) => (
                        <ActivityRow
                          key={item.signature}
                          item={item}
                          collateralSymbol={display.symbol}
                          onClick={() => handleRowClick(item)}
                        />
                      ))}
                    </ul>
                  </div>
                )}

                {grouped.older.length > 0 && (
                  <div>
                    <div style={{ padding: "8px 20px", background: "var(--surface-3)", fontSize: 11, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.05em" }}>
                      OLDER ({grouped.older.length})
                    </div>
                    <ul className="act-list" style={{ margin: 0, padding: 0, listStyle: "none" }}>
                      {grouped.older.map((item) => (
                        <ActivityRow
                          key={item.signature}
                          item={item}
                          collateralSymbol={display.symbol}
                          onClick={() => handleRowClick(item)}
                        />
                      ))}
                    </ul>
                  </div>
                )}

                {grouped.today.length === 0 &&
                  grouped.yesterday.length === 0 &&
                  grouped.thisWeek.length === 0 &&
                  grouped.older.length === 0 && (
                    <div style={{ padding: 24, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
                      No forensic activity records found matching current actor filter.
                    </div>
                  )}
              </div>
            </Card>
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
