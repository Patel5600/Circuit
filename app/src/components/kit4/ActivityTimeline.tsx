import React, { useState, useMemo } from "react";
import { ActivityItem } from "../../hooks/useActivity";
import { toUi } from "../../lib/protocol";

export interface ActivityTimelineProps {
  items: ActivityItem[];
  collateralSymbol?: string;
  onItemClick?: (item: ActivityItem) => void;
}

export function ActivityTimeline({
  items = [],
  collateralSymbol = "NVDAx",
  onItemClick,
}: ActivityTimelineProps) {
  const [filter, setFilter] = useState<"all" | "deposit" | "borrow" | "withdraw" | "rejected">("all");

  const filteredItems = useMemo(() => {
    return (items || []).filter((item) => {
      if (filter === "all") return true;
      if (filter === "deposit") return item.kind === "deposit";
      if (filter === "borrow") return item.kind === "borrow" || item.kind === "repay";
      if (filter === "withdraw") return item.kind === "withdraw";
      if (filter === "rejected") return !item.success;
      return true;
    });
  }, [items, filter]);

  return (
    <div className="card act" style={{ padding: "24px clamp(16px, 3vw, 28px)" }}>
      <div className="act-h">
        <span className="meta">
          (Circuit)<b>Activity timeline</b>
        </span>

        <div className="act-f" role="group" aria-label="Filter">
          <button
            type="button"
            className={filter === "all" ? "active" : ""}
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
          >
            All
          </button>
          <button
            type="button"
            className={filter === "deposit" ? "active" : ""}
            aria-pressed={filter === "deposit"}
            onClick={() => setFilter("deposit")}
          >
            Deposits
          </button>
          <button
            type="button"
            className={filter === "borrow" ? "active" : ""}
            aria-pressed={filter === "borrow"}
            onClick={() => setFilter("borrow")}
          >
            Borrows
          </button>
          <button
            type="button"
            className={filter === "withdraw" ? "active" : ""}
            aria-pressed={filter === "withdraw"}
            onClick={() => setFilter("withdraw")}
          >
            Withdrawals
          </button>
          <button
            type="button"
            className={filter === "rejected" ? "active" : ""}
            aria-pressed={filter === "rejected"}
            onClick={() => setFilter("rejected")}
          >
            Rejected
          </button>
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div style={{ padding: "32px 0", textAlign: "center", color: "var(--mute)", font: "500 13px var(--mono)" }}>
          No activity records matching filter.
        </div>
      ) : (
        <div className="tl">
          {filteredItems.map((item, idx) => {
            const timeStr = item.blockTime
              ? new Date(item.blockTime * 1000).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "Just now";

            const uiAmount = item.amount !== null ? toUi(item.amount, 6) : null;
            const amountStr = uiAmount !== null ? uiAmount.toFixed(2) : "";
            const currentSymbol = item.assetSymbol || (item.unit === "quote" ? "USDC" : collateralSymbol);

            const title =
              item.kind === "deposit"
                ? `Deposited ${amountStr ? amountStr + " " : ""}${currentSymbol}`
                : item.kind === "borrow"
                ? `Borrowed ${amountStr ? "$" + amountStr : "USDC"}`
                : item.kind === "repay"
                ? `Repaid ${amountStr ? "$" + amountStr : "USDC"}`
                : item.kind === "withdraw"
                ? `Withdrew ${amountStr ? amountStr + " " : ""}${currentSymbol}`
                : `Position update · ${currentSymbol}`;

            const desc = item.success
              ? `Executed by ${item.actor === "AGENT" ? "Autonomous Agent" : "Manual Wallet"}. Confirmed on Solana Devnet.`
              : `Blocked: ${item.reasonCode || "Violates risk or market policy."} Reverted safely.`;

            return (
              <div
                key={item.signature || idx}
                className="ev"
                onClick={() => onItemClick && onItemClick(item)}
                style={{ cursor: onItemClick ? "pointer" : "default" }}
              >
                <div className="row">
                  <b>{title}</b>
                  <span className="metaline">{timeStr}</span>
                </div>
                <p>{desc}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
