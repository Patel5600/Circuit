import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const dropdownWidth = 320;
    // Align right edge of dropdown with trigger right edge
    let left = rect.right - dropdownWidth;
    if (left < 12) left = 12;
    if (left + dropdownWidth > window.innerWidth - 12) {
      left = window.innerWidth - dropdownWidth - 12;
    }
    const top = rect.bottom + 6;
    setDropdownPos({ top, left, width: dropdownWidth });
  }, []);

  // Update position on open, scroll, resize
  useEffect(() => {
    if (!open) return;
    updatePosition();
    const onScroll = () => updatePosition();
    const onResize = () => updatePosition();
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onResize);
    };
  }, [open, updatePosition]);

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handlePick = (m: DeployedMarket) => {
    selectMarket(m.symbol, m.quoteSymbol);
    setOpen(false);
    onSelect?.(m);
  };

  const isSolBorrow = selectedMarket.quoteSymbol === "WSOL";

  return (
    <div className="market-selector-container" ref={containerRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        ref={triggerRef}
        type="button"
        className="market-selector-trigger"
        onClick={() => {
          setOpen((prev) => {
            const next = !prev;
            if (next) updatePosition();
            return next;
          });
        }}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Select collateral market"
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

      {open &&
        dropdownPos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={dropdownRef}
            className="market-dropdown"
            role="menu"
            style={{
              position: "fixed",
              top: dropdownPos.top,
              left: dropdownPos.left,
              width: dropdownPos.width,
              maxHeight: "min(420px, calc(100vh - " + (dropdownPos.top + 16) + "px))",
              overflowY: "auto",
              backgroundColor: "var(--surface)",
              background: "var(--surface)",
              border: "1.5px solid var(--border-strong)",
              borderRadius: 14,
              boxShadow: "var(--shadow-lg)",
              zIndex: 99999,
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
        </div>,
        document.body
      )}
    </div>
  );
}
