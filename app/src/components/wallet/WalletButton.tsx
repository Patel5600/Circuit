import React, { useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

import { Button, Icon, Modal } from "../ui";
import { shortenAddress } from "../../lib/format";

/**
 * Wallet control.
 *
 * Replaces the adapter's default button so the connected state reads as
 * "Connected / 7Vdx...Se6J" rather than exposing adapter chrome. The adapter's
 * own modal is still used for wallet selection, since it handles detection.
 */
export function WalletButton({ compact = false }: { compact?: boolean }) {
  const { publicKey, connected, connecting, disconnect, wallet } = useWallet();
  const { setVisible } = useWalletModal();
  const [menuOpen, setMenuOpen] = useState(false);

  const address = useMemo(() => publicKey?.toBase58() ?? "", [publicKey]);

  if (!connected) {
    return (
      <Button
        variant="primary"
        size={compact ? "sm" : undefined}
        icon="wallet"
        loading={connecting}
        onClick={() => setVisible(true)}
      >
        {connecting ? "Connecting" : compact ? "Connect" : "Connect Wallet"}
      </Button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setMenuOpen(true)}
        className="row g-8"
        style={{
          minHeight: 40,
          padding: "0 12px",
          borderRadius: "var(--r)",
          border: "1px solid var(--border-strong)",
          background: "var(--surface-2)",
        }}
        aria-label={`Wallet connected: ${address}. Open wallet menu`}
      >
        <span className="dot" style={{ color: "var(--success)" }} aria-hidden="true" />
        <span className="stack" style={{ lineHeight: 1.15, textAlign: "left" }}>
          {!compact && (
            <span style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 600 }}>
              Connected
            </span>
          )}
          <span className="mono" style={{ fontSize: 12.5, fontWeight: 600 }}>
            {shortenAddress(address)}
          </span>
        </span>
      </button>

      <Modal open={menuOpen} onClose={() => setMenuOpen(false)} title="Wallet">
        <div className="stack g-16">
          <div className="stack g-6">
            <span className="t-label">Connected with {wallet?.adapter.name ?? "wallet"}</span>
            <span className="mono t-sm" style={{ overflowWrap: "anywhere" }}>
              {address}
            </span>
          </div>
          <div className="row g-8 wrap">
            <Button
              variant="secondary"
              icon="copy"
              onClick={() => navigator.clipboard?.writeText(address)}
            >
              Copy address
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                setMenuOpen(false);
                await disconnect();
              }}
            >
              Disconnect
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

/** Small inline connection indicator used on disconnected empty states. */
export function WalletStatus() {
  const { connected, publicKey } = useWallet();
  return (
    <span className="row g-6 t-meta">
      <span
        className="dot"
        style={{ color: connected ? "var(--success)" : "var(--text-3)" }}
        aria-hidden="true"
      />
      {connected ? (
        <>
          Connected <span className="mono">{shortenAddress(publicKey!.toBase58())}</span>
        </>
      ) : (
        "Not connected"
      )}
    </span>
  );
}

export { Icon };
