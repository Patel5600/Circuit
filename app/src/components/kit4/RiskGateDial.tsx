import React, { useMemo } from "react";

export interface RiskGateDialProps {
  riskState: "SAFE" | "RESTRICTED" | "DEFENSIVE" | "EMERGENCY" | string;
  reasons?: string[];
  description?: string;
  onViewTopology?: () => void;
}

export function RiskGateDial({
  riskState,
  reasons = [],
  description,
  onViewTopology,
}: RiskGateDialProps) {
  const normState = useMemo(() => {
    const s = (riskState || "SAFE").toUpperCase();
    if (s === "SAFE") return "NORMAL";
    if (s === "RESTRICTED") return "RESTRICTED";
    return "CRITICAL";
  }, [riskState]);

  const ARC_LEN = 314; // half-circle radius 100
  const frac = normState === "NORMAL" ? 0.15 : normState === "RESTRICTED" ? 0.5 : 0.88;
  const strokeDash = `${(ARC_LEN * frac).toFixed(0)} 400`;

  // needle angle in degrees (-78 normal, 0 restricted, 78 critical)
  const angle = normState === "NORMAL" ? -78 : normState === "RESTRICTED" ? 0 : 78;

  const defaultDesc = useMemo(() => {
    if (normState === "NORMAL") {
      return "Reference equity market open and oracle healthy. Borrowing available.";
    }
    if (normState === "RESTRICTED") {
      return "Reference equity market closed or elevated uncertainty. Borrowing constrained.";
    }
    return "Health factor is close to the liquidation threshold. Borrowing blocked.";
  }, [normState]);

  return (
    <div className="card gate" style={{ padding: "24px clamp(18px, 3vw, 32px)" }}>
      <div className="gd-wrap">
        <div className="gd" data-crit={normState === "CRITICAL"}>
          <svg viewBox="0 0 240 160" role="img" aria-label="Risk gate dial">
            <defs>
              <clipPath id="gc">
                <path d="M20 130 A100 100 0 0 1 220 130 Z" />
              </clipPath>
            </defs>
            <path className="arc-bg" d="M20 130 A100 100 0 0 1 220 130" />
            <path
              className="arc-fg"
              d="M20 130 A100 100 0 0 1 220 130"
              strokeDasharray={strokeDash}
            />
            <line className="tick" x1="20" y1="130" x2="34" y2="117" />
            <line className="tick" x1="120" y1="30" x2="120" y2="46" />
            <line className="tick" x1="220" y1="130" x2="206" y2="117" />
            <text className="tk-lbl" x="14" y="146">
              NORMAL
            </text>
            <text className="tk-lbl" x="103" y="24">
              RESTRICTED
            </text>
            <text className="tk-lbl" x="182" y="146">
              CRITICAL
            </text>
            <line
              className="needle"
              x1="120"
              y1="130"
              x2="120"
              y2="52"
              style={{ transform: `rotate(${angle}deg)` }}
            />
            <circle className="hub" cx="120" cy="130" r="7" />
          </svg>
          <div className="gd-read">
            <span className="meta">
              (Circuit)<b>Risk state</b>
            </span>
            <div
              className="gd-state"
              style={{
                color:
                  normState === "NORMAL"
                    ? "var(--ok)"
                    : normState === "RESTRICTED"
                    ? "var(--warn)"
                    : "var(--bad)",
              }}
            >
              {riskState}
            </div>
          </div>
        </div>
      </div>

      <div className="gate-r">
        <span className="meta">
          (Circuit)<b>Automated Solvency Assessment</b>
        </span>
        <p className="desc">{description || defaultDesc}</p>

        {reasons && reasons.length > 0 && (
          <div className="reasons">
            {reasons.map((r, i) => (
              <span key={i}>{r}</span>
            ))}
          </div>
        )}

        {onViewTopology && (
          <button type="button" className="pill sm" onClick={onViewTopology}>
            View Risk Topology →
          </button>
        )}
      </div>
    </div>
  );
}
