import React, { useState, useRef, useEffect } from "react";

export interface AgentCapitalControlProps {
  strategyName?: string | null;
  isArmed?: boolean;
  borrowAllowed?: boolean;
  availableCapacityUsd?: number;
  maxPerBorrow?: number;
  dailyCap?: number;
  ltvCeilingPct?: number;
  onSaveStrategy?: (params: { maxPerBorrow: number; dailyCap: number; ltvCeiling: number }) => void;
  onArmAuthority?: () => void;
  onRevokeAuthority?: () => void;
}

export function AgentCapitalControl({
  strategyName = "Conservative Arbitrage",
  isArmed = false,
  borrowAllowed = true,
  availableCapacityUsd = 2000,
  maxPerBorrow: initialMax = 500,
  dailyCap: initialDaily = 1500,
  ltvCeilingPct: initialLtv = 40,
  onSaveStrategy,
  onArmAuthority,
  onRevokeAuthority,
}: AgentCapitalControlProps) {
  const [open, setOpen] = useState(false);
  const [maxBorrow, setMaxBorrow] = useState(initialMax);
  const [daily, setDaily] = useState(initialDaily);
  const [ltvCeil, setLtvCeil] = useState(initialLtv);

  // Hold-to-arm state machine
  const [holdProgress, setHoldProgress] = useState(0);
  const holdingRef = useRef(false);
  const holdStartRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const startHold = () => {
    if (isArmed) {
      if (onRevokeAuthority) onRevokeAuthority();
      return;
    }
    holdingRef.current = true;
    holdStartRef.current = performance.now() - holdProgress * 1200;

    const tick = (now: number) => {
      if (holdingRef.current) {
        const p = Math.min(1, (now - holdStartRef.current) / 1200);
        setHoldProgress(p);
        if (p >= 1) {
          holdingRef.current = false;
          setHoldProgress(0);
          if (onArmAuthority) onArmAuthority();
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setHoldProgress((prev) => {
          const next = Math.max(0, prev - 0.08);
          if (next > 0) {
            rafRef.current = requestAnimationFrame(tick);
          }
          return next;
        });
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const stopHold = () => {
    holdingRef.current = false;
  };

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const canBorrow = isArmed && borrowAllowed;
  const headroomCap = Math.min(maxBorrow, availableCapacityUsd);
  const headroomPct = maxBorrow > 0 ? Math.min(100, (headroomCap / maxBorrow) * 100) : 0;

  return (
    <div className="card ag" style={{ padding: "22px clamp(16px, 3vw, 28px)" }}>
      <div className="ag-h">
        <span className="meta">
          (Circuit)<b>Agent capital control</b>
        </span>
        <button
          type="button"
          className="pill sm"
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
        >
          {open ? "Close" : "Manage bounds"}
        </button>
      </div>

      <div className="ag-row">
        <span>
          Strategy: <b>{strategyName || "Not Configured"}</b>
        </span>
        <span>
          Authority:{" "}
          <em className={`tag ${isArmed ? "ok" : "bad"}`} style={{ fontStyle: "normal" }}>
            {isArmed ? "ARMED" : "UNAUTHORIZED"}
          </em>
        </span>
        <span>
          Execution:{" "}
          <b className={`st ${canBorrow ? "ok" : "bad"}`}>
            {canBorrow ? "ALLOWED" : "BLOCKED"}
          </b>
        </span>
      </div>

      <p className="ag-why">
        {!strategyName
          ? "Configure a strategy to define execution boundaries."
          : !isArmed
          ? "Authority is not armed. Press and hold to delegate bounded on-chain execution authority."
          : canBorrow
          ? "Agent may execute borrows within policy bounds."
          : "Authority is armed, but protocol risk ratchet restricts borrowing at this time."}
      </p>

      {/* Headroom bar */}
      <div className="env" style={{ marginTop: 14 }}>
        <small>
          {borrowAllowed
            ? `Agent can borrow up to $${headroomCap.toFixed(2)} right now`
            : `$${headroomCap.toFixed(2)} of headroom, gated by market state`}
        </small>
        <div className="bar" style={{ marginTop: 6, height: 6, background: "var(--bg)", borderRadius: 2 }}>
          <i
            style={{
              display: "block",
              height: "100%",
              width: `${headroomPct}%`,
              background: "var(--ink)",
              transition: "width 0.4s var(--ease)",
            }}
          />
        </div>
      </div>

      {/* Collapsible Config Area */}
      <div className={`ag-p ${open ? "open" : ""}`} style={{ marginTop: open ? 16 : 0 }}>
        <div>
          <div className="ag-in">
            <div className="ag-fields">
              <label>
                <span>
                  Max per borrow <output>${maxBorrow}</output>
                </span>
                <input
                  className="rng"
                  type="range"
                  min="100"
                  max="2000"
                  step="50"
                  value={maxBorrow}
                  onChange={(e) => setMaxBorrow(Number(e.target.value))}
                  style={{ ["--v" as any]: `${((maxBorrow - 100) / 1900) * 100}%` }}
                />
              </label>

              <label>
                <span>
                  Daily cap <output>${daily}</output>
                </span>
                <input
                  className="rng"
                  type="range"
                  min="500"
                  max="5000"
                  step="100"
                  value={daily}
                  onChange={(e) => setDaily(Number(e.target.value))}
                  style={{ ["--v" as any]: `${((daily - 500) / 4500) * 100}%` }}
                />
              </label>

              <label>
                <span>
                  LTV ceiling <output>{ltvCeil}%</output>
                </span>
                <input
                  className="rng"
                  type="range"
                  min="10"
                  max="50"
                  step="1"
                  value={ltvCeil}
                  onChange={(e) => setLtvCeil(Number(e.target.value))}
                  style={{ ["--v" as any]: `${((ltvCeil - 10) / 40) * 100}%` }}
                />
              </label>
            </div>

            <div className="ag-act" style={{ marginTop: 14 }}>
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  if (onSaveStrategy) {
                    onSaveStrategy({ maxPerBorrow: maxBorrow, dailyCap: daily, ltvCeiling: ltvCeil });
                  }
                }}
              >
                Save parameters
              </button>

              <button
                type="button"
                className={`hold ${isArmed ? "armed" : ""}`}
                style={{ ["--hp" as any]: holdProgress }}
                onPointerDown={startHold}
                onPointerUp={stopHold}
                onPointerLeave={stopHold}
                aria-label={isArmed ? "Click to revoke authority" : "Hold to arm authority"}
              >
                <span>{isArmed ? "Authority armed · Click to revoke" : "Hold to arm authority"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
