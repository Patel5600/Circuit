/**
 * NetworkStatusBar — Compact per-source network health display.
 *
 * Shows real connection state for Solana RPC, Pyth, and Circuit Program.
 * Turns amber on DEGRADED, red on DISCONNECTED.
 * Shows STALE indicators honestly — never green LIVE with stale data.
 */
import React from "react";
import type { NetworkStatus } from "../../lib/realtime/network-health";

interface SourceDisplay {
  name: string;
  status: NetworkStatus;
  detail?: string;
}

interface NetworkStatusBarProps {
  sources: SourceDisplay[];
}

const STATUS_COLORS: Record<NetworkStatus, string> = {
  LIVE: "#79C2A4",
  DEGRADED: "#AD8820",
  STALE: "#90844A",
  DISCONNECTED: "#CF8B8B",
  UNAVAILABLE: "#555",
};

export default function NetworkStatusBar({ sources }: NetworkStatusBarProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        flexWrap: "wrap",
      }}
    >
      {sources.map((src, i) => (
        <React.Fragment key={src.name}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "2px 8px",
              fontFamily: "var(--mono)",
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: "0.04em",
              color: "var(--text-3, #666)",
              whiteSpace: "nowrap",
            }}
          >
            <div
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: STATUS_COLORS[src.status],
                boxShadow:
                  src.status === "LIVE"
                    ? `0 0 4px ${STATUS_COLORS.LIVE}88`
                    : "none",
                flexShrink: 0,
              }}
            />
            <span>{src.name}</span>
            <span style={{ color: STATUS_COLORS[src.status] }}>
              {src.status}
            </span>
            {src.detail && (
              <span style={{ color: "var(--text-3, #555)" }}>
                {src.detail}
              </span>
            )}
          </div>
          {i < sources.length - 1 && (
            <span
              style={{
                color: "var(--border, #333)",
                fontSize: 9,
                padding: "0 2px",
              }}
            >
              │
            </span>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
