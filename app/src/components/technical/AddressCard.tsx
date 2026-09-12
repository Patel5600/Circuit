import React from "react";
import { PublicKey } from "@solana/web3.js";

import { CopyButton, Icon } from "../ui";
import { explorerUrl } from "../../config";
import { shortenAddress } from "../../lib/format";

export function ExplorerLink({
  kind = "address",
  id,
  label = "Solana Explorer",
}: {
  kind?: "address" | "tx";
  id: string;
  label?: string;
}) {
  return (
    <a
      className="iconbtn"
      href={explorerUrl(kind, id)}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={`View on ${label}`}
      title={label}
    >
      <Icon name="external" size={14} />
    </a>
  );
}

/**
 * One labelled on-chain address with copy + explorer affordances.
 * Lives only in the verification area, never on the consumer dashboard.
 */
export function AddressCard({
  label,
  address,
  note,
  kind = "address",
}: {
  label: string;
  address: PublicKey | string | null;
  note?: string;
  kind?: "address" | "tx";
}) {
  const value = address
    ? typeof address === "string"
      ? address
      : address.toBase58()
    : null;

  return (
    <div
      className="stack g-8"
      style={{
        padding: "13px 14px",
        border: "1px solid var(--border)",
        borderRadius: "var(--r)",
        background: "var(--bg-elevated)",
      }}
    >
      <div className="row between g-10">
        <span className="t-label">{label}</span>
        {value && (
          <span className="row g-6">
            <CopyButton value={value} label={label} />
            <ExplorerLink kind={kind} id={value} />
          </span>
        )}
      </div>
      {value ? (
        <span className="addr">
          <span className="addr__val" title={value}>
            {shortenAddress(value, 6, 6)}
          </span>
        </span>
      ) : (
        <span className="t-sm dim">Not created yet</span>
      )}
      {note && <span className="t-meta">{note}</span>}
    </div>
  );
}
