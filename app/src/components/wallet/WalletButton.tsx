import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

import { Button, Icon, Modal, Pill } from "../ui";
import { shortenAddress } from "../../lib/format";
import { useCircuitDomain } from "../../lib/domain/context";
import { formatSol } from "../../lib/domain/wallet";
import { MobileWalletModal, isMobileDevice, detectInAppWallet } from "./MobileWalletModal";

/**
 * Institutional Wallet Control & Network Safety Popover
 */
export function WalletButton({ compact = false }: { compact?: boolean }) {
  const { publicKey, connected, connecting, disconnect, wallet } = useWallet();
  const { setVisible } = useWalletModal();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileModalOpen, setMobileModalOpen] = useState(false);
  const { wallet: walletDomain, refreshAll } = useCircuitDomain();

  const address = useMemo(() => publicKey?.toBase58() ?? "", [publicKey]);
  const isWrongNetwork = walletDomain.status === "WRONG_NETWORK";
  const solText = formatSol(walletDomain.solBalanceLamports);

  const handleConnectClick = () => {
    if (isMobileDevice() && !detectInAppWallet()) {
      setMobileModalOpen(true);
    } else {
      setVisible(true);
    }
  };

  if (!connected) {
    return (
      <>
        <Button
          variant="primary"
          size={compact ? "sm" : undefined}
          icon="wallet"
          loading={connecting}
          onClick={handleConnectClick}
        >
          {connecting ? "Connecting" : compact ? "Connect" : "Connect Wallet"}
        </Button>
        <MobileWalletModal
          open={mobileModalOpen}
          onClose={() => setMobileModalOpen(false)}
          onOpenStandardModal={() => setVisible(true)}
        />
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setMenuOpen(true)}
        className={`wallet-btn appbar__capsule-btn ${isWrongNetwork ? "wallet-btn--wrong-net" : ""}`}
        aria-label={`Wallet connected: ${address}. Open account menu`}
      >
        <span
          className="dot"
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: isWrongNetwork ? "var(--danger)" : "var(--mint, #14F195)",
            boxShadow: isWrongNetwork
              ? "0 0 6px rgba(239, 68, 68, 0.6)"
              : "0 0 6px rgba(20, 241, 149, 0.6)",
            flexShrink: 0,
          }}
          aria-hidden="true"
        />
        <span style={{ color: "var(--text-3)", display: "inline-flex", flexShrink: 0 }}>
          <Icon name="user" size={13} />
        </span>
        <span className="row g-6" style={{ lineHeight: 1.15, alignItems: "center" }}>
          {isWrongNetwork ? (
            <span style={{ fontSize: 10.5, color: "var(--danger)", fontWeight: 700 }}>
              WRONG NETWORK
            </span>
          ) : (
            !compact && (
              <span style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 600 }}>
                {solText}
              </span>
            )
          )}
          <span className="mono" style={{ fontSize: 11.5, fontWeight: 600 }}>
            {shortenAddress(address)}
          </span>
        </span>
      </button>

      <Modal open={menuOpen} onClose={() => setMenuOpen(false)} title="Wallet Session">
        <div className="stack g-16" style={{ minWidth: 320 }}>
          {isWrongNetwork && (
            <div
              style={{
                padding: "12px 14px",
                borderRadius: "var(--r)",
                background: "rgba(224, 82, 82, 0.12)",
                border: "1px solid var(--danger)",
                color: "var(--text)",
                fontSize: 12.5,
                lineHeight: 1.4,
              }}
            >
              <div style={{ fontWeight: 700, color: "var(--danger)", marginBottom: 4 }}>
                WRONG NETWORK DETECTED
              </div>
              <div>
                Switch your wallet network to <strong>Solana Devnet</strong> to interact with Circuit Protocol. All transactions are blocked while on other clusters.
              </div>
            </div>
          )}

          <div
            className="stack g-10"
            style={{
              padding: 14,
              background: "var(--surface-2)",
              borderRadius: "var(--r)",
              border: "1px solid var(--border)",
            }}
          >
            <div className="row between g-8" style={{ alignItems: "center" }}>
              <span className="t-label">Wallet Provider</span>
              <span style={{ fontWeight: 600, fontSize: 13 }}>
                {wallet?.adapter.name ?? "Solana Wallet"}
              </span>
            </div>

            <div className="row between g-8" style={{ alignItems: "center" }}>
              <span className="t-label">Network</span>
              <Pill tone={isWrongNetwork ? "danger" : "accent"} withDot>
                {isWrongNetwork ? "Wrong Network" : "Solana Devnet"}
              </Pill>
            </div>

            <div className="row between g-8" style={{ alignItems: "center" }}>
              <span className="t-label">Devnet SOL Balance</span>
              <div className="row g-6" style={{ alignItems: "center" }}>
                <span className="mono" style={{ fontWeight: 650, fontSize: 13 }}>
                  {solText}
                </span>
                <button
                  type="button"
                  onClick={() => refreshAll()}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-3)",
                    cursor: "pointer",
                    padding: 2,
                    display: "flex",
                  }}
                  title="Refresh Balance"
                >
                  <Icon name="refresh" size={12} />
                </button>
              </div>
            </div>

            <div className="stack g-4" style={{ marginTop: 4 }}>
              <span className="t-label">Address</span>
              <span
                className="mono t-sm"
                style={{
                  wordBreak: "break-all",
                  background: "var(--surface-1)",
                  padding: "6px 8px",
                  borderRadius: "var(--r-sm)",
                  fontSize: 11,
                  color: "var(--text-2)",
                }}
              >
                {address}
              </span>
            </div>
          </div>

          <div className="row g-8 wrap" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <Link
              to="/app/profile"
              onClick={() => setMenuOpen(false)}
              className="btn btn--secondary btn--sm"
              style={{ textDecoration: "none" }}
            >
              <Icon name="user" size={13} />
              Risk Profile
            </Link>

            <div className="row g-8 wrap" style={{ alignItems: "center" }}>
              <Button
                variant="secondary"
                size="sm"
                icon="copy"
                onClick={() => navigator.clipboard?.writeText(address)}
              >
                Copy
              </Button>

              <a
                href={`https://explorer.solana.com/address/${address}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn--secondary btn--sm"
                style={{ textDecoration: "none" }}
              >
                <Icon name="external" size={13} />
                Explorer
              </a>

              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  setMenuOpen(false);
                  await disconnect();
                }}
              >
                Disconnect
              </Button>
            </div>
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
