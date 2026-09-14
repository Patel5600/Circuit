import React from "react";

import { Button, Icon, Modal, Notice, Pill } from "../ui";
import { explorerUrl } from "../../config";
import { TxState } from "../../hooks/useTransaction";
import { shortenAddress } from "../../lib/format";

/** Ordered stages, used to render progress rather than a bare spinner. */
const STAGES: { key: TxState["phase"]; label: string }[] = [
  { key: "preparing", label: "Preparing transaction & verifying invariants" },
  { key: "awaiting-wallet", label: "Awaiting wallet signature approval" },
  { key: "submitting", label: "Submitting transaction to Solana Devnet" },
  { key: "confirming", label: "Confirming block slot on-chain" },
];

function stageIndex(phase: TxState["phase"]): number {
  const i = STAGES.findIndex((s) => s.key === phase);
  if (i !== -1) return i;
  return phase === "success" ? STAGES.length : -1;
}

export function TransactionStatus({ state }: { state: TxState }) {
  const current = stageIndex(state.phase);

  return (
    <ol className="stack g-2" aria-live="polite" style={{ margin: "8px 0", padding: 0, listStyle: "none" }}>
      {STAGES.map((s, i) => {
        const done = current > i;
        const active = current === i;
        return (
          <li
            key={s.key}
            className="row g-10"
            style={{
              padding: "10px 0",
              opacity: done || active ? 1 : 0.4,
              borderBottom: "1px solid var(--border-subtle, rgba(255,255,255,0.04))",
            }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "50%",
                background: done
                  ? "rgba(127, 195, 154, 0.15)"
                  : active
                  ? "rgba(207, 173, 116, 0.15)"
                  : "transparent",
                color: done
                  ? "var(--success)"
                  : active
                  ? "var(--accent)"
                  : "var(--text-3)",
                flexShrink: 0,
              }}
            >
              {done ? (
                <Icon name="check" size={13} />
              ) : active ? (
                <Icon name="spinner" size={13} spin />
              ) : (
                <span
                  className="dot"
                  style={{ width: 6, height: 6 }}
                  aria-hidden="true"
                />
              )}
            </span>
            <span className="t-sm" style={{ fontWeight: active ? 650 : 500, flex: 1 }}>
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Institutional transaction modal covering the full execution lifecycle.
 * Provides explicit evidence of money movement: Action, Asset, Amount, Wallet, Signature, Explorer.
 */
export function TransactionModal({
  open,
  state,
  title,
  action = "Transaction",
  asset,
  amount,
  wallet,
  onClose,
  onDone,
}: {
  open: boolean;
  state: TxState;
  title: string;
  action?: string;
  asset?: string;
  amount?: string;
  wallet?: string;
  onClose: () => void;
  onDone?: () => void;
}) {
  const inFlight =
    state.phase === "preparing" ||
    state.phase === "awaiting-wallet" ||
    state.phase === "submitting" ||
    state.phase === "confirming";

  const explorerLink = state.signature
    ? `https://explorer.solana.com/tx/${state.signature}?cluster=devnet`
    : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      dismissable={!inFlight}
    >
      {state.phase === "success" ? (
        <div className="stack g-16">
          {/* Institutional Confirmation Card */}
          <div
            style={{
              padding: 16,
              background: "rgba(127, 195, 154, 0.08)",
              border: "1px solid var(--success)",
              borderRadius: "var(--r, 10px)",
            }}
          >
            <div className="row between g-8" style={{ alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 750, color: "var(--success)", letterSpacing: "0.06em" }}>
                {action.toUpperCase()} CONFIRMED
              </span>
              <Pill tone="success" withDot>
                CONFIRMED ON-CHAIN
              </Pill>
            </div>

            {(asset || amount) && (
              <div style={{ marginTop: 10, fontSize: 18, fontWeight: 700 }}>
                {amount ? `${amount} ` : ""}
                {asset ?? ""}
              </div>
            )}

            {state.summary && (
              <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--text-2)" }}>
                {state.summary}
              </div>
            )}
          </div>

          {/* Forensic Signature Block */}
          <div
            className="stack g-8"
            style={{
              padding: 14,
              background: "var(--surface-2, #0d0f15)",
              borderRadius: "var(--r, 10px)",
              border: "1px solid var(--border, #1a1d26)",
            }}
          >
            {wallet && (
              <div className="row between g-8" style={{ alignItems: "center" }}>
                <span className="t-label">Signer Wallet</span>
                <span className="mono" style={{ fontSize: 12 }}>
                  {shortenAddress(wallet)}
                </span>
              </div>
            )}

            {state.signature && (
              <div className="stack g-4" style={{ marginTop: 4 }}>
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
                  {state.signature}
                </span>
              </div>
            )}
          </div>

          {/* Explorer Link & Close Action */}
          <div className="row g-10 wrap">
            {explorerLink && (
              <a
                href={explorerLink}
                target="_blank"
                rel="noreferrer noopener"
                className="btn btn--secondary"
                style={{ flex: 1, textDecoration: "none" }}
              >
                <Icon name="external" size={14} />
                Open in Explorer
              </a>
            )}

            <Button
              variant="primary"
              style={{ flex: 1 }}
              onClick={() => {
                onDone?.();
                onClose();
              }}
            >
              Done
            </Button>
          </div>
        </div>
      ) : state.phase === "error" ? (
        <div className="stack g-16">
          <Notice tone="danger" title={`${action} Reverted`}>
            {state.error ?? "Transaction could not be completed on-chain."}
          </Notice>

          {state.signature && (
            <div
              className="stack g-4"
              style={{
                padding: 12,
                background: "var(--surface-2)",
                borderRadius: "var(--r)",
                border: "1px solid var(--border)",
              }}
            >
              <span className="t-label">Failed Signature</span>
              <span className="mono t-sm" style={{ wordBreak: "break-all" }}>
                {state.signature}
              </span>
            </div>
          )}

          <Button variant="secondary" block onClick={onClose}>
            Dismiss
          </Button>
        </div>
      ) : (
        <div className="stack g-14">
          <div className="row between g-8" style={{ alignItems: "center" }}>
            <span className="t-label">{state.label}...</span>
            <span className="mono t-sm" style={{ color: "var(--text-3)" }}>
              {stageIndex(state.phase) + 1} of {STAGES.length}
            </span>
          </div>

          <TransactionStatus state={state} />

          <p className="t-meta" style={{ margin: 0 }}>
            Do not close or refresh this window while transaction confirmation is in progress.
          </p>
        </div>
      )}
    </Modal>
  );
}
