import React, { useMemo } from "react";

export interface RiskGateDialProps {
  riskState: "SAFE" | "RESTRICTED" | "DEFENSIVE" | "EMERGENCY" | string;
  reasons?: string[];
  description?: string;
  oracleStatus?: string;
  borrowVerdict?: string;
  effectiveLtvPct?: number;
  onViewTopology?: () => void;
}

export function RiskGateDial({
  riskState,
  reasons = [],
  description,
  oracleStatus = "FRESH",
  borrowVerdict,
  effectiveLtvPct = 0,
  onViewTopology,
}: RiskGateDialProps) {
  const normState = useMemo(() => {
    const s = (riskState || "SAFE").toUpperCase();
    if (s === "SAFE") return "NORMAL";
    if (s === "RESTRICTED") return "RESTRICTED";
    return "CRITICAL";
  }, [riskState]);

  // Radius 75, half circle circumference = PI * 75 ≈ 235.6
  const ARC_LEN = 236;
  const frac = normState === "NORMAL" ? 0.15 : normState === "RESTRICTED" ? 0.5 : 0.88;
  const strokeDash = `${(ARC_LEN * frac).toFixed(0)} 300`;

  // Needle angle in degrees (-70 normal, 0 restricted, 70 critical)
  const angle = normState === "NORMAL" ? -70 : normState === "RESTRICTED" ? 0 : 70;

  const defaultDesc = useMemo(() => {
    if (normState === "NORMAL") {
      return "Reference equity market open and oracle healthy. Borrowing available.";
    }
    if (normState === "RESTRICTED") {
      return "Reference equity market closed or elevated uncertainty. Borrowing constrained.";
    }
    return "Health factor is close to the liquidation threshold. Borrowing blocked.";
  }, [normState]);

  const stateColor =
    normState === "NORMAL"
      ? "var(--ok)"
      : normState === "RESTRICTED"
      ? "var(--warn)"
      : "var(--bad)";

  const isBorrowAllowed = borrowVerdict === "PERMITTED" || borrowVerdict === "ALLOWED";

  return (
    <div className="card gate">
      {/* Left: Compact, Bounded Dial */}
      <div className="gd-wrap">
        <div className="gd" data-crit={normState === "CRITICAL"}>
          <svg viewBox="0 0 200 115" role="img" aria-label="Risk gate dial">
            <path className="arc-bg" d="M 25 100 A 75 75 0 0 1 175 100" />
            <path
              className="arc-fg"
              d="M 25 100 A 75 75 0 0 1 175 100"
              strokeDasharray={strokeDash}
            />
            <line className="tick" x1="25" y1="100" x2="36" y2="92" />
            <line className="tick" x1="100" y1="25" x2="100" y2="37" />
            <line className="tick" x1="175" y1="100" x2="164" y2="92" />
            <text className="tk-lbl" x="14" y="112">NORMAL</text>
            <text className="tk-lbl" x="80" y="18">RESTRICTED</text>
            <text className="tk-lbl" x="150" y="112">CRITICAL</text>
            <line
              className="needle"
              x1="100"
              y1="100"
              x2="100"
              y2="38"
              transform={`rotate(${angle}, 100, 100)`}
            />
            <circle className="hub" cx="100" cy="100" r="6" />
          </svg>
        </div>
        <div className="gd-read">
          <span className="meta">
            (Circuit)<b>Risk state</b>
          </span>
          <div className="gd-state" style={{ color: stateColor }}>
            {riskState}
          </div>
        </div>
      </div>

      {/* Right: Current State Diagnostic Details */}
      <div className="gate-r">
        <div className="row between g-8" style={{ alignItems: "center" }}>
          <span className="meta">
            (Circuit)<b>Automated Solvency Assessment</b>
          </span>
          <span className={`tag ${normState === "NORMAL" ? "ok" : normState === "RESTRICTED" ? "warn" : "bad"}`}>
            {riskState}
          </span>
        </div>

        <p className="desc">{description || defaultDesc}</p>

        {/* Diagnostic Badges */}
        <div className="gate-stats" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, margin: "8px 0 12px" }}>
          <div style={{ padding: "6px 10px", background: "var(--surface-2)", borderRadius: 4, border: "1px solid var(--line2)" }}>
            <span className="meta" style={{ fontSize: 9 }}>Oracle telemetry</span>
            <b style={{ fontSize: 12, fontFamily: "var(--mono)", color: oracleStatus === "FRESH" || oracleStatus === "LIVE" ? "var(--ok)" : "var(--warn)" }}>
              Oracle {oracleStatus}
            </b>
          </div>
          <div style={{ padding: "6px 10px", background: "var(--surface-2)", borderRadius: 4, border: "1px solid var(--line2)" }}>
            <span className="meta" style={{ fontSize: 9 }}>Borrow permission</span>
            <b style={{ fontSize: 12, fontFamily: "var(--mono)", color: isBorrowAllowed ? "var(--ok)" : "var(--warn)" }}>
              Borrow {borrowVerdict || (isBorrowAllowed ? "ALLOWED" : "CONSTRAINED")}
            </b>
          </div>
          <div style={{ padding: "6px 10px", background: "var(--surface-2)", borderRadius: 4, border: "1px solid var(--line2)" }}>
            <span className="meta" style={{ fontSize: 9 }}>Effective LTV</span>
            <b style={{ fontSize: 12, fontFamily: "var(--mono)", color: "var(--ink)" }}>
              LTV {effectiveLtvPct.toFixed(1)}%
            </b>
          </div>
        </div>

        {/* Reasons & Action */}
        <div className="row between g-8 wrap" style={{ alignItems: "center" }}>
          {reasons && reasons.length > 0 && (
            <div className="reasons">
              {reasons.slice(0, 3).map((r, i) => (
                <span key={i}>{r}</span>
              ))}
            </div>
          )}

          {onViewTopology && (
            <button
              type="button"
              className="pill sm"
              onClick={onViewTopology}
              style={{ marginLeft: "auto", height: 28, fontSize: 11.5 }}
            >
              View Risk Topology →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
