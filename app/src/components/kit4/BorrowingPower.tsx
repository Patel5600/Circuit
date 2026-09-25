import React, { useState, useMemo, useEffect } from "react";

export interface BorrowingPowerProps {
  availableCapacityUsd: number;
  totalCapacityUsd: number;
  currentDebtUsd: number;
  collateralUsd: number;
  borrowAllowed: boolean;
  restrictionReason?: string;
  onBorrow?: (amount: number) => void;
  currencySymbol?: string;
}

export function BorrowingPower({
  availableCapacityUsd,
  totalCapacityUsd,
  currentDebtUsd,
  collateralUsd,
  borrowAllowed,
  restrictionReason,
  onBorrow,
  currencySymbol = "USDC",
}: BorrowingPowerProps) {
  const [sliderPct, setSliderPct] = useState<number>(30);

  // Derived amounts
  const maxAvailable = Math.max(0, availableCapacityUsd);
  const proposedAmount = useMemo(() => {
    if (maxAvailable <= 0) return 0;
    const raw = (sliderPct / 100) * maxAvailable;
    return Math.round(raw / 5) * 5;
  }, [sliderPct, maxAvailable]);

  // Widths
  const tot = Math.max(1, totalCapacityUsd);
  const usedWidthPct = Math.min(100, Math.max(0, (currentDebtUsd / tot) * 100));
  const availWidthPct = Math.min(100 - usedWidthPct, Math.max(0, (maxAvailable / tot) * 100));

  // Marker position
  const markerPosPct = Math.min(100, Math.max(0, ((currentDebtUsd + proposedAmount) / tot) * 100));

  const isOverPower = proposedAmount > maxAvailable;
  const isGated = !borrowAllowed && maxAvailable > 0;

  // Post borrow LTV
  const postBorrowDebt = currentDebtUsd + proposedAmount;
  const postBorrowLtvPct = collateralUsd > 0 ? (postBorrowDebt / collateralUsd) * 100 : 0;
  const remainingCapacity = Math.max(0, maxAvailable - proposedAmount);

  const canExecute = borrowAllowed && proposedAmount > 0 && !isOverPower;

  return (
    <div
      className="card bp"
      style={{
        padding: "22px clamp(18px, 3vw, 28px)",
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
      }}
    >
      <span className="meta">
        (Circuit)<b>Borrowing power</b>
      </span>

      <div className="bp-big">
        <b>
          ${maxAvailable.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </b>
        <span>available</span>
        <span className={`tag ${borrowAllowed ? "ok" : "warn"}`}>
          {borrowAllowed ? "Available" : "Constrained"}
        </span>
      </div>

      <div className="bp-bar" style={{ marginTop: 12 }}>
        <i className="s used" style={{ width: `${usedWidthPct}%` }} />
        <i
          className={`s av ${isGated ? "gated" : ""}`}
          style={{ width: `${availWidthPct}%` }}
        />
        <i
          className={`bp-mk ${isOverPower ? "over" : ""}`}
          style={{
            left: `${markerPosPct}%`,
            color: isOverPower ? "var(--bad)" : "var(--ink)",
          }}
          data-v={`$${proposedAmount.toFixed(0)}`}
        />
      </div>

      <div className="bp-leg">
        <span>
          <i style={{ background: "var(--ink)" }} />
          Borrowed (${currentDebtUsd.toFixed(2)})
        </span>
        <span>
          <i
            style={{
              background:
                "repeating-linear-gradient(135deg, var(--paper) 0 4px, var(--bg) 4px 8px)",
              boxShadow: "inset 0 0 0 1px var(--line2)",
            }}
          />
          Available (${maxAvailable.toFixed(2)})
        </span>
        {isGated && (
          <span>
            <i
              style={{
                background:
                  "repeating-linear-gradient(135deg, var(--ink) 0 2px, var(--paper) 2px 5px)",
              }}
            />
            Gated by market state
          </span>
        )}
      </div>

      <div className="bp-try">
        <label htmlFor="bp-slider">
          <span>Try a borrow</span>
          <output>${proposedAmount.toFixed(0)} {currencySymbol}</output>
        </label>
        <input
          id="bp-slider"
          className="rng"
          type="range"
          min="0"
          max="100"
          value={sliderPct}
          onChange={(e) => setSliderPct(Number(e.target.value))}
          style={{ ["--v" as any]: `${sliderPct}%` }}
        />
      </div>

      <div className="row between g-12 wrap" style={{ fontSize: 13, color: "var(--mute)", margin: "14px 0 18px" }}>
        <span>
          Post-borrow LTV: <strong style={{ color: "var(--ink)" }}>{postBorrowLtvPct.toFixed(1)}%</strong>
        </span>
        <span>
          Remaining capacity: <strong style={{ color: "var(--ink)" }}>${remainingCapacity.toFixed(2)}</strong>
        </span>
      </div>

      <div className="bp-row">
        <button
          type="button"
          className={`btn ${!canExecute ? "dis" : ""}`}
          disabled={!canExecute}
          onClick={() => {
            if (canExecute && onBorrow) {
              onBorrow(proposedAmount);
            }
          }}
        >
          Borrow {proposedAmount > 0 ? `$${proposedAmount.toFixed(0)} ` : ""}{currencySymbol}
        </button>

        <span className={`bp-why ${!borrowAllowed || isOverPower ? "bad" : ""}`}>
          {!borrowAllowed
            ? `Blocked: ${restrictionReason || "Risk policy restricts borrowing"}`
            : isOverPower
            ? `Exceeds available power by $${(proposedAmount - maxAvailable).toFixed(2)}`
            : proposedAmount > 0
            ? `Leaves $${remainingCapacity.toFixed(2)} available`
            : "Slide to pick a borrow amount"}
        </span>
      </div>
    </div>
  );
}
