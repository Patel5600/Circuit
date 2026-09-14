import React, { useState } from "react";
import { PublicKey } from "@solana/web3.js";

import { CopyButton, Icon, Pill, Tone } from "../ui";
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
      style={{
        width: 28,
        height: 28,
        borderRadius: "var(--r-sm)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        color: "var(--text-2)",
        transition: "all var(--t-fast)",
      }}
    >
      <Icon name="external" size={13} />
    </a>
  );
}

/**
 * Enhanced, smooth on-chain address card with category badges, PDA seed chips,
 * and copy/explorer interactions.
 */
export function AddressCard({
  label,
  address,
  note,
  kind = "address",
  badge,
  badgeTone = "neutral",
  seeds,
  balance,
  isLive = true,
}: {
  label: string;
  address: PublicKey | string | null;
  note?: string;
  kind?: "address" | "tx";
  badge?: string;
  badgeTone?: Tone;
  seeds?: string[];
  balance?: string;
  isLive?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);

  const value = address
    ? typeof address === "string"
      ? address
      : address.toBase58()
    : null;

  const handleCopy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };

  return (
    <div
      className="stack g-10"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "16px 18px",
        border: `1px solid ${hovered ? "var(--border-strong)" : "var(--border)"}`,
        borderRadius: "var(--r)",
        background: hovered ? "var(--surface)" : "var(--bg-elevated)",
        boxShadow: hovered ? "0 4px 20px rgba(0, 0, 0, 0.35)" : "var(--shadow)",
        transform: hovered ? "translateY(-1px)" : "none",
        transition: "all var(--t)",
        position: "relative",
      }}
    >
      {/* Header: Label + Badges */}
      <div className="row between g-10" style={{ alignItems: "center" }}>
        <div className="row g-8" style={{ alignItems: "center" }}>
          {isLive && value && (
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--success)",
                boxShadow: "0 0 8px var(--success)",
                display: "inline-block",
                flexShrink: 0,
              }}
              title="Active on-chain"
            />
          )}
          <span
            style={{
              fontSize: 13,
              fontWeight: 650,
              letterSpacing: "-0.01em",
              color: "var(--text)",
            }}
          >
            {label}
          </span>
        </div>

        <div className="row g-6" style={{ alignItems: "center" }}>
          {badge && (
            <Pill tone={badgeTone}>
              {badge}
            </Pill>
          )}
          {value && <ExplorerLink kind={kind} id={value} />}
        </div>
      </div>

      {/* Address Container */}
      {value ? (
        <div
          onClick={handleCopy}
          role="button"
          tabIndex={0}
          title="Click to copy full address"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") handleCopy();
          }}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 12px",
            borderRadius: "var(--r-sm)",
            background: "var(--surface-2)",
            border: `1px solid ${copied ? "var(--success)" : "var(--border)"}`,
            cursor: "pointer",
            transition: "all var(--t-fast)",
          }}
        >
          <span
            className="mono"
            style={{
              fontSize: 12.5,
              fontWeight: 550,
              color: copied ? "var(--success)" : "var(--accent)",
              letterSpacing: "0.02em",
            }}
          >
            {shortenAddress(value, 8, 8)}
          </span>

          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: copied ? "var(--success)" : "var(--text-3)",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Icon name={copied ? "check" : "copy"} size={12} />
            {copied ? "Copied" : "Copy"}
          </span>
        </div>
      ) : (
        <div
          style={{
            padding: "8px 12px",
            borderRadius: "var(--r-sm)",
            background: "var(--surface-2)",
            border: "1px dashed var(--border)",
            fontSize: 12,
            color: "var(--text-3)",
          }}
        >
          Not initialized yet
        </div>
      )}

      {/* PDA Seeds Tag if provided */}
      {seeds && seeds.length > 0 && (
        <div
          className="row g-6"
          style={{
            alignItems: "center",
            fontSize: 11,
            color: "var(--text-3)",
            fontFamily: "var(--mono)",
          }}
        >
          <span style={{ color: "var(--text-3)" }}>seeds:</span>
          <span
            style={{
              padding: "2px 6px",
              borderRadius: 4,
              background: "rgba(139, 123, 196, 0.12)",
              color: "var(--violet)",
              border: "1px solid rgba(139, 123, 196, 0.25)",
            }}
          >
            [{seeds.map((s) => `"${s}"`).join(", ")}]
          </span>
        </div>
      )}

      {/* Balance Indicator for Vaults */}
      {balance && (
        <div
          style={{
            padding: "6px 10px",
            borderRadius: "var(--r-sm)",
            background: "var(--surface-3)",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--text)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ color: "var(--text-2)", fontWeight: 500 }}>Vault Balance:</span>
          <span className="mono" style={{ color: "var(--success)" }}>
            {balance}
          </span>
        </div>
      )}

      {/* Explanatory note */}
      {note && (
        <span
          style={{
            fontSize: 12,
            color: "var(--text-2)",
            lineHeight: 1.45,
          }}
        >
          {note}
        </span>
      )}
    </div>
  );
}
