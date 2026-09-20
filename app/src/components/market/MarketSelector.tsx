import React, { useEffect, useRef, useState } from "react";
import { useMarket } from "../../context/MarketContext";
import { Icon, Pill } from "../ui";
import { DeployedMarket } from "../../data/markets";

interface MarketSelectorProps {
  compact?: boolean;
  onSelect?: (market: DeployedMarket) => void;
}

export function MarketSelector({ compact = false, onSelect }: MarketSelectorProps) {
  const { markets, selectedMarket, selectedMeta, selectMarket } = useMarket();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const handlePick = (m: DeployedMarket) => {
    selectMarket(m.symbol, m.quoteSymbol);
    setOpen(false);
    onSelect?.(m);
  };

  const isSolBorrow = selectedMarket.quoteSymbol === "WSOL";

  return (
    <div className="market-selector-container" ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className="market-selector-trigger"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label="Select collateral market"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: compact ? "5px 10px" : "8px 14px",
          background: "var(--surface-2)",
          border: "1px solid var(--border-strong)",
          borderRadius: 10,
          color: "var(--text)",
          cursor: "pointer",
          fontSize: compact ? 13 : 14,
          fontWeight: 600,
          transition: "all 0.15s ease",
        }}
      >
        <span
          style={{
            width: 18,
            height: 18,
            borderRadius: 5,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: isSolBorrow ? "#9945FF22" : "var(--surface-3)",
            border: `1px solid ${isSolBorrow ? "#9945FF55" : "var(--border)"}`,
            flex: "none",
            fontSize: 10,
          }}
        >
          {selectedMeta?.logoSvg ? (
            <span style={{ transform: "scale(0.75)" }}>{selectedMeta.logoSvg}</span>
          ) : (
            <Icon name="layers" size={12} />
          )}
        </span>

        <span className="truncate" style={{ maxWidth: compact ? 110 : 160 }}>
          {selectedMarket.tokenSymbol} / {selectedMarket.quoteSymbol}
        </span>

        <Pill tone={isSolBorrow ? "accent" : "success"} withDot>
          {selectedMarket.quoteSymbol === "WSOL" ? "BORROW SOL" : "LIVE"}
        </Pill>

        <span
          style={{
            color: "var(--text-3)",
            display: "flex",
            alignItems: "center",
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.15s ease",
          }}
        >
          <Icon name="chevronDown" size={13} />
        </span>
      </button>

      {open && (
        <div
          className="market-dropdown"
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            width: 320,
            maxHeight: 420,
            overflowY: "auto",
            backgroundColor: "var(--surface)",
            background: "var(--surface)",
            border: "1px solid var(--border-strong)",
            borderRadius: 14,
            boxShadow: "var(--shadow-lg)",
            zIndex: 1000,
            padding: 8,
          }}
        >
          <div
            style={{
              padding: "6px 8px 10px 8px",
              borderBottom: "1px solid var(--border)",
              marginBottom: 6,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Live Collateral Markets ({markets.length})
            </div>
            <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 2 }}>
              Select a tokenized stock to borrow against or manage.
            </div>
          </div>

          <div className="stack g-4">
            {markets.map((m) => {
              const active =
                m.symbol === selectedMarket.symbol &&
                m.quoteSymbol === selectedMarket.quoteSymbol;
              const isSol = m.quoteSymbol === "WSOL";

              return (
                <button
                  key={`${m.symbol}-${m.quoteSymbol}`}
                  type="button"
                  onClick={() => handlePick(m)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: "8px 10px",
                    background: active ? "var(--surface-3)" : "transparent",
                    border: active ? "1px solid var(--border-strong)" : "1px solid transparent",
                    borderRadius: 8,
                    cursor: "pointer",
                    textAlign: "left",
                    color: "var(--text)",
                    transition: "background 0.12s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!active) (e.currentTarget.style.background = "var(--surface-2)");
                  }}
                  onMouseLeave={(e) => {
                    if (!active) (e.currentTarget.style.background = "transparent");
                  }}
                >
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row g-6" style={{ alignItems: "center" }}>
                      <span style={{ fontWeight: 700, fontSize: 13.5 }}>
                        {m.tokenSymbol}
                      </span>
                      <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                        / {m.quoteSymbol}
                      </span>
                      {isSol && (
                        <Pill tone="accent">
                          SOL
                        </Pill>
                      )}
                    </div>
                    <div className="truncate" style={{ fontSize: 11.5, color: "var(--text-2)", marginTop: 1 }}>
                      {m.name}
                    </div>
                  </div>

                  <div style={{ textAlign: "right", flex: "none" }}>
                    <div style={{ fontSize: 12, fontWeight: 650, color: "var(--success)" }}>
                      {(m.baseLtvBps / 100).toFixed(0)}% LTV
                    </div>
                    <div style={{ fontSize: 10.5, color: "var(--text-3)" }}>
                      max borrow
                    </div>
                  </div>

                  {active && (
                    <span style={{ color: "var(--accent)", display: "flex" }}>
                      <Icon name="check" size={14} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
