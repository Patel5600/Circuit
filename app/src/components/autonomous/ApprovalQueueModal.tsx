/**
 * Circuit Protocol — Human Approval Queue
 *
 * Dedicated queue for actions requiring human-in-the-loop review.
 * Approval is NOT permission — permission is evaluated freshly upon approval.
 */

import React from "react";
import { CircuitActionProposal } from "../../pages/Autonomous";

interface ApprovalQueueModalProps {
  isOpen: boolean;
  onClose: () => void;
  pendingProposals: CircuitActionProposal[];
  onApprove: (proposal: CircuitActionProposal) => void;
  onReject: (id: string) => void;
}

export function ApprovalQueueModal({
  isOpen,
  onClose,
  pendingProposals,
  onApprove,
  onReject,
}: ApprovalQueueModalProps) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(4px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          background: "var(--surface-1, #121214)",
          border: "1px solid var(--border-strong, #3f3f46)",
          borderRadius: 12,
          boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--warning, #cfad74)", fontFamily: "var(--mono)" }}>
              APPROVAL QUEUE
            </span>
            <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text-3)" }}>
              ({pendingProposals.length} PENDING)
            </span>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--text-3)", cursor: "pointer" }}>
            ✕
          </button>
        </div>

        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12, maxHeight: "60vh", overflowY: "auto" }}>
          {pendingProposals.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-3)", fontSize: 13 }}>
              No pending execution approvals.
            </div>
          ) : (
            pendingProposals.map((p) => (
              <div
                key={p.id}
                style={{
                  background: "var(--surface-2, #18181b)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: 14,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  fontFamily: "var(--mono)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                    {p.action.toUpperCase()} ${p.amountUsd.toFixed(2)} {p.symbol}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      padding: "2px 6px",
                      borderRadius: 4,
                      background: p.permission === "ALLOWED" ? "rgba(121,194,164,0.12)" : "rgba(207,173,116,0.12)",
                      color: p.permission === "ALLOWED" ? "var(--mint, #79c2a4)" : "var(--warning, #cfad74)",
                    }}
                  >
                    {p.permission}
                  </span>
                </div>

                <div style={{ fontSize: 11, color: "var(--text-2)", lineHeight: 1.4 }}>
                  {p.reason}
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <button
                    onClick={() => {
                      onApprove(p);
                      onClose();
                    }}
                    style={{
                      flex: 1,
                      padding: "7px 12px",
                      background: "var(--accent, #eceae6)",
                      color: "#0c0c0d",
                      border: "none",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "var(--mono)",
                    }}
                  >
                    Approve &amp; Sign
                  </button>
                  <button
                    onClick={() => onReject(p.id)}
                    style={{
                      padding: "7px 12px",
                      background: "transparent",
                      color: "var(--text-3)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      fontSize: 11,
                      cursor: "pointer",
                      fontFamily: "var(--mono)",
                    }}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
