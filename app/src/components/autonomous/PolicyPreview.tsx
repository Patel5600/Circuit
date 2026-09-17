/**
 * Circuit Protocol — Policy Preview Card
 * Shown in chat when agent proposes a task. User must explicitly confirm.
 */
import React, { useState } from "react";
import type { ParsedTaskProposal } from "../../lib/automation/types";
import { createTask } from "../../lib/automation/store";

interface Props {
  proposal: ParsedTaskProposal;
  owner: string;
  onCreated: (taskName: string) => void;
  onDismiss: () => void;
}

export function PolicyPreview({ proposal, owner, onCreated, onDismiss }: Props) {
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);

  const rows = [
    { label: "Name", value: proposal.name },
    { label: "Type", value: proposal.type },
    { label: "Frequency", value: `Every ${proposal.frequencyMinutes} min` },
    { label: "Expires", value: `${proposal.expireDays} days` },
    ...(proposal.condition ? [{ label: "Condition", value: proposal.condition.description }] : []),
    ...(proposal.policy ? [
      { label: "Objective", value: proposal.policy.objective },
      { label: "Max/Action", value: `$${proposal.policy.maxAmountPerActionUsd.toFixed(2)}` },
      { label: "Max Total", value: `$${proposal.policy.maxTotalUsd.toFixed(2)}` },
      { label: "Assets", value: proposal.policy.assetScope.length > 0 ? proposal.policy.assetScope.join(", ") : "Portfolio" },
      { label: "Risk Adaptive", value: proposal.policy.riskAdaptive ? "Yes — stops in DEFENSIVE" : "No" },
    ] : []),
  ];

  const handleCreate = () => {
    if (!owner) return;
    setCreating(true);
    const task = createTask(owner, proposal);
    setCreated(true);
    setCreating(false);
    onCreated(task.name);
  };

  if (created) {
    return (
      <div style={{ padding: "12px 14px", background: "rgba(121,194,164,0.08)", border: "1px solid rgba(121,194,164,0.3)", borderRadius: 8, fontSize: 12 }}>
        <div style={{ fontWeight: 700, color: "var(--mint,#79c2a4)", marginBottom: 4 }}>Task created</div>
        <div style={{ color: "var(--text-2)" }}>"{proposal.name}" is now ACTIVE. Check the TASKS tab.</div>
      </div>
    );
  }

  return (
    <div style={{ background: "var(--surface-2)", border: "1px solid rgba(207,173,116,0.35)", borderRadius: 8, overflow: "hidden", fontSize: 12 }}>
      <div style={{ padding: "10px 14px", background: "rgba(207,173,116,0.08)", borderBottom: "1px solid rgba(207,173,116,0.2)", fontWeight: 700, fontSize: 11, fontFamily: "var(--mono)", color: "var(--warning,#cfad74)", letterSpacing: "0.06em" }}>
        POLICY PREVIEW — CONFIRM BEFORE ACTIVATION
      </div>
      <div style={{ padding: "12px 14px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <tbody>
            {rows.map(row => (
              <tr key={row.label}>
                <td style={{ padding: "3px 0", color: "var(--text-3)", width: "40%", verticalAlign: "top" }}>{row.label}</td>
                <td style={{ padding: "3px 0", color: "var(--text)", fontFamily: row.label === "Condition" || row.label === "Type" || row.label === "Frequency" ? "var(--mono)" : undefined }}>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
        <button type="button" onClick={handleCreate} disabled={creating || !owner} style={{ flex: 1, padding: "7px 0", fontSize: 11, fontWeight: 700, fontFamily: "var(--mono)", background: "rgba(121,194,164,0.12)", border: "1px solid rgba(121,194,164,0.35)", borderRadius: 6, color: "var(--mint,#79c2a4)", cursor: !owner || creating ? "not-allowed" : "pointer" }}>
          {creating ? "CREATING..." : "AUTHORIZE & CREATE TASK"}
        </button>
        <button type="button" onClick={onDismiss} style={{ padding: "7px 14px", fontSize: 11, fontFamily: "var(--mono)", background: "transparent", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-3)", cursor: "pointer" }}>
          DISMISS
        </button>
      </div>
    </div>
  );
}
