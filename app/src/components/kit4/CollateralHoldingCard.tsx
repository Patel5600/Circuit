import React from "react";

export interface CollateralHoldingCardProps {
  symbol: string;
  name: string;
  tokenAmount: number;
  collateralUsd: number;
  priceUsd: number;
  debtUsd?: number;
  onDeposit?: () => void;
  onWithdraw?: () => void;
  loading?: boolean;
}

export function CollateralHoldingCard({
  symbol,
  name,
  tokenAmount,
  collateralUsd,
  priceUsd,
  debtUsd = 0,
  onDeposit,
  onWithdraw,
  loading = false,
}: CollateralHoldingCardProps) {
  const currentLtvPct = collateralUsd > 0 ? (debtUsd / collateralUsd) * 100 : 0;
  const maxLtvPct = 50;
  const liqThresholdPct = 65;

  return (
    <div className={`card bp ${loading ? "loading" : ""}`} style={{ padding: "22px clamp(18px, 3vw, 28px)" }}>
      <span className="meta">
        (Circuit)<b>Collateral holding</b>
      </span>

      <div className="bp-big">
        <b>
          ${collateralUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </b>
        <span>valuation</span>
        <span className="tag ok">
          {tokenAmount > 0 ? `${tokenAmount.toFixed(2)} ${symbol}x` : "No Collateral"}
        </span>
      </div>

      {/* Utilization Bar */}
      <div className="bp-bar" style={{ marginTop: 12 }}>
        <i
          className="s used"
          style={{ width: `${Math.min(100, (currentLtvPct / liqThresholdPct) * 100)}%` }}
        />
        <i
          className="s av"
          style={{ width: `${Math.max(0, 100 - (currentLtvPct / liqThresholdPct) * 100)}%` }}
        />
      </div>

      <div className="bp-leg">
        <span>
          <i style={{ background: "var(--ink)" }} />
          Pledged Debt (${debtUsd.toFixed(2)})
        </span>
        <span>
          <i
            style={{
              background:
                "repeating-linear-gradient(135deg, var(--paper) 0 4px, var(--bg) 4px 8px)",
              boxShadow: "inset 0 0 0 1px var(--line2)",
            }}
          />
          Free Buffer (${Math.max(0, collateralUsd * 0.5 - debtUsd).toFixed(2)})
        </span>
        <span>
          <i
            style={{
              background:
                "repeating-linear-gradient(135deg, var(--ink) 0 2px, var(--paper) 2px 5px)",
            }}
          />
          Max 50% LTV
        </span>
      </div>

      {/* Metric specs */}
      <div
        className="row between g-12 wrap"
        style={{
          padding: "12px 14px",
          background: "var(--surface-2)",
          borderRadius: 4,
          border: "1px solid var(--line2)",
          fontSize: 12.5,
          color: "var(--mute)",
          margin: "12px 0 16px",
        }}
      >
        <div>
          <span className="meta" style={{ fontSize: 9 }}>Oracle spot price</span>
          <b style={{ color: "var(--ink)", fontFamily: "var(--mono)", fontSize: 13 }}>
            ${priceUsd > 0 ? priceUsd.toFixed(2) : "--"}
          </b>
        </div>
        <div>
          <span className="meta" style={{ fontSize: 9 }}>Deposited units</span>
          <b style={{ color: "var(--ink)", fontFamily: "var(--mono)", fontSize: 13 }}>
            {tokenAmount.toFixed(4)} {symbol}
          </b>
        </div>
        <div>
          <span className="meta" style={{ fontSize: 9 }}>Borrow limit (50%)</span>
          <b style={{ color: "var(--ink)", fontFamily: "var(--mono)", fontSize: 13 }}>
            ${(collateralUsd * 0.5).toFixed(2)}
          </b>
        </div>
      </div>

      <div className="row between g-12 wrap" style={{ fontSize: 13, color: "var(--mute)", margin: "14px 0 18px" }}>
        <span>
          Current LTV: <strong style={{ color: "var(--ink)" }}>{currentLtvPct.toFixed(1)}%</strong>
        </span>
        <span>
          Liquidation floor: <strong style={{ color: "var(--bad)" }}>${(collateralUsd * 0.65).toFixed(2)}</strong> (65%)
        </span>
      </div>

      {/* Action buttons */}
      <div className="bp-row">
        <button
          type="button"
          className="btn"
          onClick={onDeposit}
        >
          Deposit {symbol}
        </button>
        <button
          type="button"
          className="btn secondary"
          onClick={onWithdraw}
          disabled={tokenAmount <= 0}
        >
          Withdraw
        </button>
        <span className="bp-why">
          Solana Devnet Tokenized Equity Collateral
        </span>
      </div>
    </div>
  );
}
