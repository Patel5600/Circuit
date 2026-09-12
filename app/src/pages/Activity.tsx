import React, { useMemo } from "react";
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

function Row({ item, collateralSymbol }: { item: ActivityItem; collateralSymbol: string }) {
  const meta = KIND_META[item.kind];
  const unitSymbol =
    item.unit === "collateral" ? collateralSymbol : item.unit === "quote" ? QUOTE_SYMBOL : "";

  return (
    <li className="act">
      <span className="act__icon" style={{ color: meta.color }}>
        <Icon name={meta.icon} size={16} />
      </span>

      <div className="grow" style={{ minWidth: 0 }}>
        <div className="row g-8 wrap">
          <span style={{ fontWeight: 600, fontSize: 14 }}>{meta.label}</span>
          {item.amount !== null && (
            <span
              className="t-sm"
              style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-2)" }}
            >
              {formatTokens(toUi(item.amount))} {unitSymbol}
            </span>
          )}
        </div>
        <div className="act__meta">
          <span>{formatRelativeTime(item.blockTime)}</span>
          <span className="mono">{shortenAddress(item.signature, 6, 6)}</span>
        </div>
      </div>

      <div className="act__right">
        <Pill tone={item.success ? "success" : "danger"}>
          {item.success ? "Confirmed" : "Failed"}
        </Pill>
        <ExplorerLink kind="tx" id={item.signature} />
      </div>
    </li>
  );
}

export default function Activity() {
  const { connected } = useWallet();
  const { items, loading, error, refresh } = useActivity(25);
  const display = useMemo(activeAssetDisplay, []);

  return (
    <PageContainer
      title="Activity"
      subtitle="Every transaction that has touched your position, read directly from Solana."
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
        <EmptyState icon="activity" title="No activity yet">
          Once you deposit, borrow, repay or withdraw, those transactions will
          appear here.
        </EmptyState>
      ) : (
        <Card flush>
          <ul>
            {items.map((it) => (
              <Row key={it.signature} item={it} collateralSymbol={display.symbol} />
            ))}
          </ul>
        </Card>
      )}

      {items && items.length > 0 && (
        <p className="t-meta" style={{ marginTop: 14 }}>
          Showing the most recent {items.length} transactions involving your
          position account.
        </p>
      )}
    </PageContainer>
  );
}
