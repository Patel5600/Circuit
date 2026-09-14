/**
 * Circuit Protocol - Transaction Detail Drawer
 *
 * Provides institutional on-chain forensic detail for any activity event.
 */

import React from "react";
import { Drawer } from "../ui/Drawer";
import { ActivityEvent } from "../../lib/domain/types";
import { Pill, Button, Icon } from "../ui";
import { formatRelativeTime } from "../../lib/format";

export function TransactionDetailDrawer({
  event,
  open,
  onClose,
}: {
  event: ActivityEvent | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!event) return null;

  const isConfirmed = event.status === "CONFIRMED";
  const explorerUrl = event.signature
    ? `https://explorer.solana.com/tx/${event.signature}?cluster=devnet`
    : null;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`${event.action} · ${event.assetSymbol}`}
      subtitle={`On-Chain Event Forensics`}
      badge={
        <Pill tone={isConfirmed ? "success" : "danger"} withDot>
          {event.status}
        </Pill>
      }
    >
      <div className="stack g-16">
        {/* Summary Card */}
        <div
          style={{
            padding: 16,
            background: "var(--surface-2, #0d0f15)",
            borderRadius: "var(--r, 10px)",
            border: "1px solid var(--border, #1a1d26)",
          }}
        >
          <div className="row between g-8" style={{ alignItems: "center" }}>
            <div>
              <span className="t-label">Transaction Type</span>
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>
                {event.action}
              </div>
            </div>

            {event.amountUi !== null && (
              <div style={{ textAlign: "right" }}>
                <span className="t-label">Transferred Amount</span>
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>
                  {event.amountUi} {event.assetSymbol}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Forensic Metadata */}
        <div
          className="stack g-10"
          style={{
            padding: 16,
            background: "var(--surface-2, #0d0f15)",
            borderRadius: "var(--r, 10px)",
            border: "1px solid var(--border, #1a1d26)",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-3)" }}>
            TRANSACTION METADATA
          </div>

          <div className="row between g-8" style={{ alignItems: "center" }}>
            <span className="t-label">Timestamp</span>
            <span className="mono" style={{ fontSize: 12.5 }}>
              {new Date(event.timestamp).toLocaleString()} ({formatRelativeTime(event.timestamp / 1000)})
            </span>
          </div>

          <div className="row between g-8" style={{ alignItems: "center" }}>
            <span className="t-label">Risk Ratchet at Execution</span>
            <Pill tone={event.riskStateAtAction === "SAFE" ? "success" : "warning"}>
              {event.riskStateAtAction ?? "SAFE"}
            </Pill>
          </div>

          <div className="row between g-8" style={{ alignItems: "center" }}>
            <span className="t-label">Cluster</span>
            <span className="mono" style={{ fontSize: 12.5 }}>
              Solana Devnet
            </span>
          </div>

          <div className="stack g-4" style={{ marginTop: 6 }}>
            <span className="t-label">Wallet Address</span>
            <span
              className="mono"
              style={{
                fontSize: 11,
                wordBreak: "break-all",
                background: "var(--surface-1)",
                padding: "6px 8px",
                borderRadius: "var(--r-sm)",
                color: "var(--text-2)",
              }}
            >
              {event.wallet}
            </span>
          </div>

          {event.signature && (
            <div className="stack g-4" style={{ marginTop: 6 }}>
              <span className="t-label">Transaction Signature</span>
              <span
                className="mono"
                style={{
                  fontSize: 11,
                  wordBreak: "break-all",
                  background: "var(--surface-1)",
                  padding: "6px 8px",
                  borderRadius: "var(--r-sm)",
                  color: "var(--text-2)",
                }}
              >
                {event.signature}
              </span>
            </div>
          )}
        </div>

        {/* Execution Log */}
        {event.logSummary && (
          <div
            className="stack g-6"
            style={{
              padding: 14,
              background: "#08090d",
              borderRadius: "var(--r, 10px)",
              border: "1px solid var(--border, #1a1d26)",
            }}
          >
            <span className="t-label">Program Log Snippet</span>
            <pre
              style={{
                margin: 0,
                fontSize: 11,
                fontFamily: "var(--mono)",
                color: "var(--text-2)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {event.logSummary}
            </pre>
          </div>
        )}

        {/* Action Buttons */}
        <div className="row g-10" style={{ marginTop: 8 }}>
          {event.signature && (
            <Button
              variant="secondary"
              style={{ flex: 1 }}
              icon="copy"
              onClick={() => navigator.clipboard?.writeText(event.signature!)}
            >
              Copy Signature
            </Button>
          )}

          {explorerUrl && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn--primary"
              style={{ flex: 1, textDecoration: "none" }}
            >
              <Icon name="external" size={14} />
              Open in Explorer
            </a>
          )}
        </div>
      </div>
    </Drawer>
  );
}
