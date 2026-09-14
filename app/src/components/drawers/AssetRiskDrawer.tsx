/**
 * Circuit Protocol - Asset Risk Detail Drawer
 *
 * Detailed contextual telemetry for a deposited collateral holding.
 */

import React from "react";
import { Drawer } from "../ui/Drawer";
import { Position } from "../../lib/portfolio/provider";
import { Pill, Button, Icon } from "../ui";
import { formatCurrency, formatTokens, formatPercent } from "../../lib/format";
import { getAssetMark } from "../../data/logos";

export function AssetRiskDrawer({
  position,
  open,
  onClose,
  onDeposit,
  onWithdraw,
}: {
  position: Position | null;
  open: boolean;
  onClose: () => void;
  onDeposit?: (pos: Position) => void;
  onWithdraw?: (pos: Position) => void;
}) {
  if (!position) return null;

  const mark = getAssetMark(position.symbol);
  const isHighConcentration = position.weightPct > 40;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`${position.name} (${position.symbol})`}
      subtitle={`On-Chain Collateral Holding · ${position.symbol}`}
      badge={<Pill tone="success" withDot>LIVE ON-CHAIN</Pill>}
    >
      <div className="stack g-16">
        {/* Asset Header Card */}
        <div
          style={{
            padding: 16,
            background: "var(--surface-2, #0d0f15)",
            borderRadius: "var(--r, 10px)",
            border: "1px solid var(--border, #1a1d26)",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: "#141721",
              border: "1px solid var(--border-strong, #272c3d)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {mark ? (
              <svg width={24} height={24} viewBox="0 0 24 24">
                {mark.parts ? (
                  mark.parts.map((p, idx) => <path key={idx} d={p.d} fill={p.fill} />)
                ) : (
                  <path d={mark.d} fill={mark.hex} />
                )}
              </svg>
            ) : (
              <span style={{ fontWeight: 700, fontSize: 13 }}>{position.symbol}</span>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              {formatCurrency(position.collateralValueUsd)}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-3, #727a8e)" }}>
              {formatTokens(position.collateralUi)} {position.symbol} tokens
            </div>
          </div>

          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 14, fontWeight: 650 }}>
              {formatCurrency(position.priceUsd)}
            </div>
            <div
              style={{
                fontSize: 11,
                fontFamily: "var(--mono)",
                color:
                  position.change24hPercent !== null && position.change24hPercent !== undefined && position.change24hPercent >= 0
                    ? "var(--success)"
                    : "var(--danger)",
              }}
            >
              {position.change24hPercent !== null && position.change24hPercent !== undefined
                ? `${position.change24hPercent >= 0 ? "+" : ""}${position.change24hPercent.toFixed(2)}%`
                : "--"}
            </div>
          </div>
        </div>

        {/* Telemetry Metrics */}
        <div
          className="stack g-10"
          style={{
            padding: 16,
            background: "var(--surface-2, #0d0f15)",
            borderRadius: "var(--r, 10px)",
            border: "1px solid var(--border, #1a1d26)",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-3)" }}>
            PORTFOLIO RISK CONTRIBUTION
          </div>

          <div className="row between g-8" style={{ alignItems: "center" }}>
            <span className="t-label">Portfolio Weight</span>
            <span className="mono" style={{ fontWeight: 650 }}>
              {position.weightPct.toFixed(1)}%
            </span>
          </div>

          <div className="row between g-8" style={{ alignItems: "center" }}>
            <span className="t-label">Concentration Penalty</span>
            <span
              className="mono"
              style={{
                fontWeight: 650,
                color: isHighConcentration ? "var(--warning)" : "var(--success)",
              }}
            >
              {isHighConcentration ? "-36 bps / point above 40%" : "0 bps (Diversified)"}
            </span>
          </div>

          <div className="row between g-8" style={{ alignItems: "center" }}>
            <span className="t-label">Pyth Confidence Interval</span>
            <span className="mono" style={{ fontWeight: 650 }}>
              ±${position.confidenceUsd.toFixed(4)} ({position.confBps} bps)
            </span>
          </div>

          <div className="row between g-8" style={{ alignItems: "center" }}>
            <span className="t-label">Conservative Collateral Price</span>
            <span className="mono" style={{ fontWeight: 650, color: "var(--accent)" }}>
              {formatCurrency(position.conservativePriceUsd)}
            </span>
          </div>

          <div className="row between g-8" style={{ alignItems: "center" }}>
            <span className="t-label">Base LTV Floor</span>
            <span className="mono" style={{ fontWeight: 650 }}>
              {(position.baseLtvBps / 100).toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Oracle Verification Card */}
        <div
          className="stack g-8"
          style={{
            padding: 14,
            background: "rgba(127, 195, 154, 0.05)",
            borderRadius: "var(--r, 10px)",
            border: "1px solid rgba(127, 195, 154, 0.2)",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--success)" }}>
            ORACLE SAFETY INVARIANT
          </div>
          <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.45 }}>
            Pyth price feeds are consumed with conservative valuation:{" "}
            <code>p_conservative = max(0, p - conf)</code>. This ensures borrow power
            reflects lower-bound market liquidity even during rapid volatility.
          </div>
        </div>

        {/* Actions */}
        <div className="row g-10" style={{ marginTop: 8 }}>
          <Button
            variant="primary"
            style={{ flex: 1 }}
            icon="deposit"
            onClick={() => {
              onClose();
              onDeposit?.(position);
            }}
          >
            Deposit {position.symbol}
          </Button>

          <Button
            variant="secondary"
            style={{ flex: 1 }}
            icon="withdraw"
            onClick={() => {
              onClose();
              onWithdraw?.(position);
            }}
          >
            Withdraw
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
