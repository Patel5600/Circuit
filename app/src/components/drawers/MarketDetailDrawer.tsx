/**
 * Circuit Protocol - Market Detail Drawer
 *
 * Detailed contextual parameters for a deployed tokenized equity market.
 */

import React from "react";
import { Drawer } from "../ui/Drawer";
import { DeployedMarket } from "../../data/markets";
import { Pill, Button, Icon } from "../ui";
import { getAssetMark, getAssetName } from "../../data/logos";
import { isNyseMarketOpen } from "../../lib/session";
import { useNavigate } from "react-router-dom";

export function MarketDetailDrawer({
  market,
  open,
  onClose,
}: {
  market: DeployedMarket | null;
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  if (!market) return null;

  const mark = getAssetMark(market.symbol);
  const fullName = getAssetName(market.symbol);
  const nyse = isNyseMarketOpen();

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`${fullName} (${market.symbol})`}
      subtitle={`Devnet Market · ${market.symbol}/USDC`}
      badge={
        <Pill tone={nyse.isOpen ? "success" : "neutral"} withDot>
          {nyse.isOpen ? "NYSE Open" : "NYSE Closed"}
        </Pill>
      }
    >
      <div className="stack g-16">
        {/* Market Badge */}
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
              <span style={{ fontWeight: 700 }}>{market.symbol}</span>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{fullName}</div>
            <div style={{ fontSize: 12, color: "var(--text-3)" }}>
              Token Mint: {market.symbol}x
            </div>
          </div>
        </div>

        {/* Risk & Credit Parameters */}
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
            ON-CHAIN RISK CONFIGURATION
          </div>

          <div className="row between g-8" style={{ alignItems: "center" }}>
            <span className="t-label">Base LTV</span>
            <span className="mono" style={{ fontWeight: 650 }}>
              {(market.baseLtvBps / 100).toFixed(1)}%
            </span>
          </div>

          <div className="row between g-8" style={{ alignItems: "center" }}>
            <span className="t-label">Liquidation Threshold</span>
            <span className="mono" style={{ fontWeight: 650 }}>
              {((market.liqThresholdBps || 8000) / 100).toFixed(1)}%
            </span>
          </div>

          <div className="row between g-8" style={{ alignItems: "center" }}>
            <span className="t-label">Liquidation Penalty</span>
            <span className="mono" style={{ fontWeight: 650 }}>
              {((market.liqBonusBps || 500) / 100).toFixed(1)}%
            </span>
          </div>

          <div className="row between g-8" style={{ alignItems: "center" }}>
            <span className="t-label">Market Session Calendar</span>
            <span className="mono" style={{ fontSize: 12 }}>
              {nyse.message}
            </span>
          </div>
        </div>

        {/* Pyth Feed Details */}
        <div
          className="stack g-8"
          style={{
            padding: 14,
            background: "#08090d",
            borderRadius: "var(--r, 10px)",
            border: "1px solid var(--border, #1a1d26)",
          }}
        >
          <span className="t-label">Pyth Price Feed ID</span>
          <span
            className="mono"
            style={{
              fontSize: 11,
              wordBreak: "break-all",
              color: "var(--text-2)",
            }}
          >
            {market.feedId}
          </span>
        </div>

        {/* Action Button */}
        <Button
          variant="primary"
          icon="deposit"
          onClick={() => {
            onClose();
            navigate(`/app/position?market=${market.symbol}`);
          }}
          style={{ marginTop: 8 }}
        >
          Open Position for {market.symbol}
        </Button>
      </div>
    </Drawer>
  );
}
