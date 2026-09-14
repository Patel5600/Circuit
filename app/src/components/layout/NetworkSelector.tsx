import React, { useState, useRef, useEffect } from "react";
import { CLUSTER, CLUSTER_LABEL } from "../../env";

interface NetworkOption {
  id: string;
  name: string;
  status: "active" | "coming_soon";
  badge: string;
  detail: string;
  endpoint: string;
}

const NETWORKS: NetworkOption[] = [
  {
    id: "devnet",
    name: "Solana Devnet",
    status: "active",
    badge: "ACTIVE",
    detail: "Live protocol deployment with real Pyth price feeds",
    endpoint: "api.devnet.solana.com",
  },
  {
    id: "testnet",
    name: "Solana Testnet",
    status: "coming_soon",
    badge: "COMING SOON",
    detail: "Staging cluster for protocol consensus validation",
    endpoint: "api.testnet.solana.com",
  },
  {
    id: "mainnet-beta",
    name: "Solana Mainnet-Beta",
    status: "coming_soon",
    badge: "COMING SOON",
    detail: "Production deployment pending security audit review",
    endpoint: "api.mainnet-beta.solana.com",
  },
];

export function NetworkSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") setIsOpen(false);
      };
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [isOpen]);

  return (
    <div ref={containerRef} style={{ position: "relative", display: "inline-block" }}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
          background: isOpen ? "var(--surface-3, #1e2230)" : "var(--surface-2, #141721)",
          border: `1px solid ${isOpen ? "var(--accent, #6366f1)" : "var(--border, rgba(255,255,255,0.1))"}`,
          borderRadius: "var(--r-full, 9999px)",
          color: "var(--text, #fff)",
          fontFamily: "var(--mono, monospace)",
          fontSize: 11,
          fontWeight: 600,
          cursor: "pointer",
          letterSpacing: "0.04em",
          transition: "all 0.15s ease",
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--mint, #7fc39a)",
            boxShadow: "0 0 6px rgba(127, 195, 154, 0.6)",
          }}
        />
        <span>{CLUSTER_LABEL}</span>
        <svg
          width="10"
          height="6"
          viewBox="0 0 10 6"
          fill="none"
          style={{
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.15s ease",
            opacity: 0.6,
          }}
        >
          <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Popover */}
      {isOpen && (
        <div
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            width: 280,
            background: "var(--surface-1, #0d0f17)",
            border: "1px solid var(--border-strong, rgba(255,255,255,0.15))",
            borderRadius: "var(--r, 8px)",
            boxShadow: "0 12px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255,255,255,0.05)",
            padding: "8px 6px",
            zIndex: 1000,
            backdropFilter: "blur(16px)",
          }}
        >
          <div
            style={{
              padding: "4px 8px 8px 8px",
              borderBottom: "1px solid var(--border, rgba(255,255,255,0.08))",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: "var(--text-3, #71788e)",
                textTransform: "uppercase",
              }}
            >
              Solana Cluster
            </span>
            <span
              style={{
                fontSize: 9.5,
                color: "var(--mint, #7fc39a)",
                fontFamily: "var(--mono, monospace)",
                fontWeight: 600,
              }}
            >
              EPOCH LIVE
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 6 }}>
            {NETWORKS.map((net) => {
              const isActive = net.id === CLUSTER;
              const isAvailable = net.status === "active";

              return (
                <div
                  key={net.id}
                  style={{
                    padding: "8px 10px",
                    borderRadius: "var(--r-sm, 6px)",
                    background: isActive
                      ? "rgba(99, 102, 241, 0.09)"
                      : "transparent",
                    border: isActive
                      ? "1px solid rgba(99, 102, 241, 0.28)"
                      : "1px solid transparent",
                    opacity: isAvailable ? 1 : 0.55,
                    cursor: isAvailable ? "default" : "not-allowed",
                    display: "flex",
                    flexDirection: "column",
                    gap: 3,
                    transition: "all 0.15s ease",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: isActive
                            ? "var(--mint, #7fc39a)"
                            : "var(--text-3, #71788e)",
                        }}
                      />
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: isActive ? 700 : 500,
                          color: isActive ? "var(--text, #fff)" : "var(--text-2, #a0a6b8)",
                        }}
                      >
                        {net.name}
                      </span>
                    </div>

                    <span
                      style={{
                        fontSize: 9,
                        fontFamily: "var(--mono, monospace)",
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        padding: "1px 6px",
                        borderRadius: 3,
                        background: isActive
                          ? "rgba(127, 195, 154, 0.16)"
                          : "rgba(255, 255, 255, 0.06)",
                        color: isActive
                          ? "var(--mint, #7fc39a)"
                          : "var(--text-3, #71788e)",
                      }}
                    >
                      {net.badge}
                    </span>
                  </div>

                  <span
                    style={{
                      fontSize: 10,
                      color: "var(--text-3, #71788e)",
                      lineHeight: 1.35,
                      paddingLeft: 12,
                    }}
                  >
                    {net.detail}
                  </span>
                </div>
              );
            })}
          </div>

          <div
            style={{
              marginTop: 8,
              padding: "6px 8px 2px 8px",
              borderTop: "1px solid var(--border, rgba(255,255,255,0.08))",
              fontSize: 9.5,
              color: "var(--text-3, #71788e)",
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>Protocol: Anchor 1.2.0</span>
            <span style={{ fontFamily: "var(--mono, monospace)" }}>Pyth v2</span>
          </div>
        </div>
      )}
    </div>
  );
}
