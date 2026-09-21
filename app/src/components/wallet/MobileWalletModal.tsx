import React from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Modal, Pill, Icon } from "../ui";

export function isMobileDevice(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile/i.test(ua);
  return isMobileUA || (isTouch && window.innerWidth <= 840);
}

export function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function detectInAppWallet(): { name: string; key: string } | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  if (w.phantom?.solana?.isPhantom || (w.solana?.isPhantom && !w.solflare?.isSolflare)) {
    return { name: "Phantom In-App", key: "Phantom" };
  }
  if (w.solflare?.isSolflare || w.SolflareApp) {
    return { name: "Solflare In-App", key: "Solflare" };
  }
  if (w.coinbaseSolana) {
    return { name: "Coinbase Wallet In-App", key: "Coinbase Wallet" };
  }
  if (w.backpack) {
    return { name: "Backpack In-App", key: "Backpack" };
  }
  return null;
}

interface MobileWalletModalProps {
  open: boolean;
  onClose: () => void;
  onOpenStandardModal: () => void;
}

export function MobileWalletModal({
  open,
  onClose,
  onOpenStandardModal,
}: MobileWalletModalProps) {
  const { select } = useWallet();
  const inApp = detectInAppWallet();
  const android = isAndroid();

  const handleInAppConnect = (key: string) => {
    try {
      select(key as any);
      onClose();
    } catch {
      onOpenStandardModal();
    }
  };

  const handlePhantomMobile = () => {
    if (inApp?.key === "Phantom") {
      handleInAppConnect("Phantom");
      return;
    }
    const currentUrl = encodeURIComponent(window.location.href);
    const currentOrigin = encodeURIComponent(window.location.origin);
    // Universal link opens the current dApp URL inside Phantom's browser
    window.location.href = `https://phantom.app/ul/browse/${currentUrl}?ref=${currentOrigin}`;
  };

  const handleSolflareMobile = () => {
    if (inApp?.key === "Solflare") {
      handleInAppConnect("Solflare");
      return;
    }
    const currentUrl = encodeURIComponent(window.location.href);
    // Universal link opens the current dApp URL inside Solflare's browser
    window.location.href = `https://solflare.com/ul/v1/browse/${currentUrl}`;
  };

  const handleCoinbaseMobile = () => {
    if (inApp?.key === "Coinbase Wallet") {
      handleInAppConnect("Coinbase Wallet");
      return;
    }
    const currentUrl = encodeURIComponent(window.location.href);
    window.location.href = `https://go.cb-w.com/dapp?cb_url=${currentUrl}`;
  };

  const handleOkxMobile = () => {
    const currentUrl = encodeURIComponent(window.location.href);
    window.location.href = `okx://wallet/dapp/details?dappUrl=${currentUrl}`;
  };

  const handleAndroidMwa = () => {
    try {
      select("Mobile Wallet Adapter" as any);
      onClose();
    } catch {
      onOpenStandardModal();
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Connect Solana Wallet">
      <div className="stack g-16" style={{ minWidth: "min(360px, 90vw)" }}>
        {/* Network & Status Header */}
        <div
          className="row between g-8"
          style={{
            alignItems: "center",
            padding: "8px 12px",
            background: "var(--surface-2)",
            borderRadius: "var(--r-sm)",
            border: "1px solid var(--border)",
          }}
        >
          <div className="row g-8" style={{ alignItems: "center" }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "var(--mint, #14F195)",
                boxShadow: "0 0 6px rgba(20, 241, 149, 0.6)",
              }}
            />
            <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--text)" }}>
              SOLANA DEVNET
            </span>
          </div>
          <Pill tone="accent">MOBILE ADAPTER</Pill>
        </div>

        {/* If detected in-app browser */}
        {inApp && (
          <div
            style={{
              padding: "12px 14px",
              background: "rgba(20, 241, 149, 0.08)",
              border: "1px solid rgba(20, 241, 149, 0.3)",
              borderRadius: "var(--r)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--mint, #14F195)" }}>
              ✓ In-App Wallet Detected: {inApp.name}
            </div>
            <button
              type="button"
              className="btn btn--accent btn--sm"
              onClick={() => handleInAppConnect(inApp.key)}
              style={{ width: "100%", height: 38 }}
            >
              Connect {inApp.name} Directly →
            </button>
          </div>
        )}

        {/* Mobile Deep Link & MWA Options */}
        <div className="stack g-8">
          {/* Android Native MWA */}
          {android && (
            <button
              type="button"
              onClick={handleAndroidMwa}
              className="mobile-wallet-btn"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 14px",
                borderRadius: "var(--r)",
                background: "var(--surface-1)",
                border: "1px solid var(--accent)",
                color: "var(--text)",
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.15s ease",
              }}
            >
              <div className="row g-12" style={{ alignItems: "center" }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: "rgba(20, 241, 149, 0.12)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <svg viewBox="0 0 24 24" width={22} height={22} fill="none">
                    <path
                      d="M4.5 16.2C4.7 16 5 15.9 5.3 15.9H18.9C19.2 15.9 19.3 16.3 19.1 16.5L16.5 19.1C16.3 19.3 16 19.4 15.7 19.4H2.1C1.8 19.4 1.7 19 1.9 18.8L4.5 16.2Z"
                      fill="#14F195"
                    />
                    <path
                      d="M4.5 4.6C4.7 4.4 5 4.3 5.3 4.3H18.9C19.2 4.3 19.3 4.7 19.1 4.9L16.5 7.5C16.3 7.7 16 7.8 15.7 7.8H2.1C1.8 7.8 1.7 7.4 1.9 7.2L4.5 4.6Z"
                      fill="#9945FF"
                    />
                    <path
                      d="M16.5 10.4C16.3 10.2 16 10.1 15.7 10.1H2.1C1.8 10.1 1.7 10.5 1.9 10.7L4.5 13.3C4.7 13.5 5 13.6 5.3 13.6H18.9C19.2 13.6 19.3 13.2 19.1 13L16.5 10.4Z"
                      fill="#00C2FF"
                    />
                  </svg>
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>Android Mobile Wallet Adapter</div>
                  <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                    Direct system prompt to any installed Solana wallet
                  </div>
                </div>
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontFamily: "var(--mono)",
                  fontWeight: 700,
                  padding: "2px 7px",
                  borderRadius: 4,
                  background: "rgba(20, 241, 149, 0.15)",
                  color: "var(--mint, #14F195)",
                }}
              >
                NATIVE MWA
              </span>
            </button>
          )}

          {/* Phantom Mobile */}
          <button
            type="button"
            onClick={handlePhantomMobile}
            className="mobile-wallet-btn"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 14px",
              borderRadius: "var(--r)",
              background: "var(--surface-1)",
              border: "1px solid var(--border)",
              color: "var(--text)",
              cursor: "pointer",
              textAlign: "left",
              transition: "all 0.15s ease",
            }}
          >
            <div className="row g-12" style={{ alignItems: "center" }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: "#AB9FF2",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <svg viewBox="0 0 24 24" width={22} height={22} fill="none">
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M10.33 15.54C9.33 17.08 7.65 19.03 5.41 19.03C4.35 19.03 3.33 18.59 3.33 16.7C3.33 11.88 9.92 4.41 16.03 4.41C19.5 4.41 20.89 6.82 20.89 9.56C20.89 13.07 18.61 17.09 16.34 17.09C15.62 17.09 15.27 16.7 15.27 16.07C15.27 15.91 15.3 15.73 15.35 15.54C14.58 16.86 13.08 18.09 11.68 18.09C10.66 18.09 10.15 17.45 10.15 16.55C10.15 16.22 10.22 15.88 10.33 15.54ZM18.59 9.46C18.59 10.26 18.12 10.66 17.6 10.66C17.06 10.66 16.6 10.26 16.6 9.46C16.6 8.66 17.06 8.26 17.6 8.26C18.12 8.26 18.59 8.66 18.59 9.46ZM15.6 9.46C15.6 10.26 15.13 10.66 14.6 10.66C14.07 10.66 13.61 10.26 13.61 9.46C13.61 8.66 14.07 8.26 14.6 8.26C15.13 8.26 15.6 8.66 15.6 9.46Z"
                    fill="#FFFFFF"
                  />
                </svg>
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>Phantom Mobile</div>
                <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                  Open Circuit directly in Phantom App
                </div>
              </div>
            </div>
            <span
              style={{
                fontSize: 10,
                fontFamily: "var(--mono)",
                fontWeight: 700,
                padding: "2px 7px",
                borderRadius: 4,
                background: "rgba(171, 159, 242, 0.15)",
                color: "#AB9FF2",
              }}
            >
              APP LINK
            </span>
          </button>

          {/* Solflare Mobile */}
          <button
            type="button"
            onClick={handleSolflareMobile}
            className="mobile-wallet-btn"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 14px",
              borderRadius: "var(--r)",
              background: "var(--surface-1)",
              border: "1px solid var(--border)",
              color: "var(--text)",
              cursor: "pointer",
              textAlign: "left",
              transition: "all 0.15s ease",
            }}
          >
            <div className="row g-12" style={{ alignItems: "center" }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: "#1C1625",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  border: "1px solid rgba(252, 98, 56, 0.4)",
                }}
              >
                <svg viewBox="0 0 24 24" width={22} height={22} fill="none">
                  <path
                    d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
                    fill="#FC6238"
                  />
                </svg>
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>Solflare Mobile</div>
                <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                  Open Circuit directly in Solflare App
                </div>
              </div>
            </div>
            <span
              style={{
                fontSize: 10,
                fontFamily: "var(--mono)",
                fontWeight: 700,
                padding: "2px 7px",
                borderRadius: 4,
                background: "rgba(252, 98, 56, 0.15)",
                color: "#FC6238",
              }}
            >
              APP LINK
            </span>
          </button>

          {/* Coinbase Wallet */}
          <button
            type="button"
            onClick={handleCoinbaseMobile}
            className="mobile-wallet-btn"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 14px",
              borderRadius: "var(--r)",
              background: "var(--surface-1)",
              border: "1px solid var(--border)",
              color: "var(--text)",
              cursor: "pointer",
              textAlign: "left",
              transition: "all 0.15s ease",
            }}
          >
            <div className="row g-12" style={{ alignItems: "center" }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: "#0052FF",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <svg viewBox="0 0 24 24" width={20} height={20} fill="none">
                  <circle cx="12" cy="12" r="6" fill="#FFFFFF" />
                  <rect x="10.5" y="10.5" width="3" height="3" rx="0.5" fill="#0052FF" />
                </svg>
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>Coinbase Wallet</div>
                <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                  Open Circuit in Coinbase Wallet
                </div>
              </div>
            </div>
            <span
              style={{
                fontSize: 10,
                fontFamily: "var(--mono)",
                fontWeight: 700,
                padding: "2px 7px",
                borderRadius: 4,
                background: "rgba(0, 82, 255, 0.15)",
                color: "#38bdf8",
              }}
            >
              DEEP LINK
            </span>
          </button>

          {/* OKX Mobile */}
          <button
            type="button"
            onClick={handleOkxMobile}
            className="mobile-wallet-btn"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 14px",
              borderRadius: "var(--r)",
              background: "var(--surface-1)",
              border: "1px solid var(--border)",
              color: "var(--text)",
              cursor: "pointer",
              textAlign: "left",
              transition: "all 0.15s ease",
            }}
          >
            <div className="row g-12" style={{ alignItems: "center" }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: "#000000",
                  border: "1px solid rgba(255,255,255,0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <span style={{ fontWeight: 800, fontSize: 12, color: "#fff", fontFamily: "var(--mono)" }}>
                  OKX
                </span>
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>OKX Wallet</div>
                <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                  Open Circuit in OKX App
                </div>
              </div>
            </div>
            <span
              style={{
                fontSize: 10,
                fontFamily: "var(--mono)",
                fontWeight: 700,
                padding: "2px 7px",
                borderRadius: 4,
                background: "rgba(255, 255, 255, 0.1)",
                color: "var(--text-2)",
              }}
            >
              APP LINK
            </span>
          </button>
        </div>

        {/* Fallback to Standard / Extension Modal */}
        <div style={{ paddingTop: 4, borderTop: "1px solid var(--border)" }}>
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenStandardModal();
            }}
            className="btn btn--secondary btn--sm"
            style={{ width: "100%", height: 36, justifyContent: "center" }}
          >
            <Icon name="search" size={12} />
            Show All Wallets &amp; Extensions →
          </button>
        </div>

        {/* Security / Devnet note */}
        <div
          style={{
            fontSize: 10.5,
            color: "var(--text-3)",
            lineHeight: 1.45,
            textAlign: "center",
          }}
        >
          Circuit is non-custodial. Private keys never leave your wallet app. All transactions simulate risk ratchet bounds before on-chain commit.
        </div>
      </div>
    </Modal>
  );
}
