import React from "react";

import { Button, Icon, Modal, Notice } from "../ui";
import { ExplorerLink } from "../technical/AddressCard";
import { explorerUrl } from "../../config";
import { TxState } from "../../hooks/useTransaction";

/** Ordered stages, used to render progress rather than a bare spinner. */
const STAGES: { key: TxState["phase"]; label: string }[] = [
  { key: "preparing", label: "Preparing" },
  { key: "awaiting-wallet", label: "Approve in wallet" },
  { key: "submitting", label: "Sending" },
  { key: "confirming", label: "Confirming" },
];

function stageIndex(phase: TxState["phase"]): number {
  const i = STAGES.findIndex((s) => s.key === phase);
  if (i !== -1) return i;
  return phase === "success" ? STAGES.length : -1;
}

export function TransactionStatus({ state }: { state: TxState }) {
  const current = stageIndex(state.phase);

  return (
    <ol className="stack g-2" aria-live="polite">
      {STAGES.map((s, i) => {
        const done = current > i;
        const active = current === i;
        return (
          <li
            key={s.key}
            className="row g-10"
            style={{ padding: "9px 0", opacity: done || active ? 1 : 0.45 }}
          >
            <span
              style={{
                width: 20,
                display: "flex",
                justifyContent: "center",
                color: done
                  ? "var(--success)"
                  : active
                  ? "var(--accent)"
                  : "var(--text-3)",
              }}
            >
              {done ? (
                <Icon name="check" size={15} />
              ) : active ? (
                <Icon name="spinner" size={15} spin />
              ) : (
                <span
                  className="dot"
                  style={{ width: 6, height: 6 }}
                  aria-hidden="true"
                />
              )}
            </span>
            <span className="t-sm" style={{ fontWeight: active ? 650 : 500 }}>
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Transaction modal covering the full lifecycle. It cannot be dismissed while a
 * signature is in flight, so the user is never left unsure whether something
 * was submitted.
 */
export function TransactionModal({
  open,
  state,
  title,
  onClose,
  onDone,
}: {
  open: boolean;
  state: TxState;
  title: string;
  onClose: () => void;
  onDone?: () => void;
}) {
  const inFlight =
    state.phase === "preparing" ||
    state.phase === "awaiting-wallet" ||
    state.phase === "submitting" ||
    state.phase === "confirming";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      dismissable={!inFlight}
    >
      {state.phase === "success" ? (
        <div className="stack g-16">
          <Notice tone="success" title={`${title} successful`}>
            {state.summary}
          </Notice>
          {state.signature && (
            <a
              className="row g-8 t-sm"
              href={explorerUrl("tx", state.signature)}
              target="_blank"
              rel="noreferrer noopener"
              style={{ color: "var(--accent)" }}
            >
              View transaction
              <Icon name="external" size={14} />
            </a>
          )}
          <Button
            variant="primary"
            block
            onClick={() => {
              onDone?.();
              onClose();
            }}
          >
            Done
          </Button>
        </div>
      ) : state.phase === "error" ? (
        <div className="stack g-16">
          <Notice tone="danger" title="Transaction not completed">
            {state.error}
          </Notice>
          {state.signature && (
            <span className="row g-8 t-sm">
              Signature
              <ExplorerLink kind="tx" id={state.signature} />
            </span>
          )}
          <Button variant="secondary" block onClick={onClose}>
            Close
          </Button>
        </div>
      ) : (
        <div className="stack g-14">
          <p className="t-sm muted">{state.label}...</p>
          <TransactionStatus state={state} />
          <p className="t-meta">
            Keep this window open. Approving in your wallet may take a moment.
          </p>
        </div>
      )}
    </Modal>
  );
}
