import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useMarket } from "../../context/MarketContext";
import { useAction } from "../../context/ActionContext";
import { useCircuitDomain } from "../../lib/domain/context";
import { useTheme } from "../../context/ThemeContext";
import { Icon, IconName } from "../ui";
import { DeployedMarket } from "../../data/markets";

interface CommandItem {
  id: string;
  category: "MARKET" | "ACTION" | "AUDIT" | "SYSTEM";
  title: string;
  subtitle?: string;
  shortcut?: string;
  icon: IconName;
  onSelect: () => void;
}

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const navigate = useNavigate();
  const { markets, selectedMarket, selectMarket } = useMarket();
  const { openAction } = useAction();
  const { controlMode, setControlMode } = useCircuitDomain();
  const { theme, toggle: toggleTheme } = useTheme();

  // Reset query and focus on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Build command catalogue
  const allCommands = useMemo<CommandItem[]>(() => {
    const list: CommandItem[] = [];

    // 1. Markets
    markets.forEach((m) => {
      const isSelected =
        m.symbol === selectedMarket.symbol &&
        m.quoteSymbol === selectedMarket.quoteSymbol;
      list.push({
        id: `market-${m.symbol}-${m.quoteSymbol}`,
        category: "MARKET",
        title: `${m.tokenSymbol} / ${m.quoteSymbol}`,
        subtitle: `${m.name} · ${(m.baseLtvBps / 100).toFixed(0)}% Max LTV ${isSelected ? "· ACTIVE" : ""}`,
        icon: "markets",
        onSelect: () => {
          selectMarket(m.symbol, m.quoteSymbol);
          onClose();
        },
      });
    });

    // 2. Capital Actions
    list.push(
      {
        id: "action-deposit",
        category: "ACTION",
        title: `Deposit ${selectedMarket.tokenSymbol} Collateral`,
        subtitle: "Provide verified tokenized stock as loan collateral",
        shortcut: "D",
        icon: "deposit",
        onSelect: () => {
          openAction({ type: "deposit", market: selectedMarket });
          onClose();
        },
      },
      {
        id: "action-borrow",
        category: "ACTION",
        title: `Borrow ${selectedMarket.quoteSymbol}`,
        subtitle: `Borrow against deposited ${selectedMarket.tokenSymbol} collateral`,
        shortcut: "B",
        icon: "borrow",
        onSelect: () => {
          navigate(`/app/borrow?market=${selectedMarket.symbol}&quote=${selectedMarket.quoteSymbol}`);
          onClose();
        },
      },
      {
        id: "action-repay",
        category: "ACTION",
        title: `Repay ${selectedMarket.quoteSymbol} Debt`,
        subtitle: "Settle outstanding debt and improve position health factor",
        shortcut: "R",
        icon: "repay",
        onSelect: () => {
          openAction({ type: "repay", market: selectedMarket });
          onClose();
        },
      },
      {
        id: "action-withdraw",
        category: "ACTION",
        title: `Withdraw ${selectedMarket.tokenSymbol}`,
        subtitle: "Release excess collateral back to sovereign wallet",
        shortcut: "W",
        icon: "withdraw",
        onSelect: () => {
          openAction({ type: "withdraw", market: selectedMarket });
          onClose();
        },
      },
      {
        id: "action-faucet",
        category: "ACTION",
        title: "Devnet Collateral Faucet",
        subtitle: "Mint free tokenized stocks to test borrowing capacity",
        icon: "faucet",
        onSelect: () => {
          navigate("/app/faucet");
          onClose();
        },
      }
    );

    // 3. Audit & Cryptographic Verification
    list.push(
      {
        id: "audit-oracle",
        category: "AUDIT",
        title: "Inspect Pyth Oracle Proof",
        subtitle: "Audit on-chain slot timestamp, confidence bounds & receiver address",
        icon: "verify",
        onSelect: () => {
          navigate("/app/verify");
          onClose();
        },
      },
      {
        id: "audit-position",
        category: "AUDIT",
        title: "Inspect Global Position State",
        subtitle: "View multi-market portfolio health and debt allocation",
        icon: "position",
        onSelect: () => {
          navigate("/app/position");
          onClose();
        },
      },
      {
        id: "audit-risk-matrix",
        category: "AUDIT",
        title: "View Quantitative Capital Policy Matrix",
        subtitle: "Inspect the 4-state risk ratchet thresholds (Safe/Restricted/Defensive/Emergency)",
        icon: "learn",
        onSelect: () => {
          navigate("/app/learn");
          onClose();
        },
      }
    );

    // 4. System Controls
    list.push(
      {
        id: "sys-mode-toggle",
        category: "SYSTEM",
        title: controlMode === "MANUAL" ? "Switch to Autonomous Agent Mode" : "Switch to Sovereign Manual Mode",
        subtitle: controlMode === "MANUAL" ? "Enable bounded strategy agent execution" : "Return to direct wallet execution",
        icon: "gauge",
        onSelect: () => {
          setControlMode(controlMode === "MANUAL" ? "AUTONOMOUS" : "MANUAL");
          onClose();
        },
      },
      {
        id: "sys-theme-toggle",
        category: "SYSTEM",
        title: `Switch Theme to ${theme === "dark" ? "Light (Mist)" : "Dark (Obsidian)"}`,
        subtitle: "Toggle 4K UHD atmospheric display mode",
        shortcut: "T",
        icon: theme === "dark" ? "sun" : "moon",
        onSelect: () => {
          toggleTheme();
          onClose();
        },
      }
    );

    return list;
  }, [markets, selectedMarket, controlMode, theme, selectMarket, openAction, navigate, setControlMode, toggleTheme, onClose]);

  // Filter commands by search query
  const filtered = useMemo(() => {
    if (!query.trim()) return allCommands;
    const lower = query.toLowerCase();
    return allCommands.filter(
      (c) =>
        c.title.toLowerCase().includes(lower) ||
        c.category.toLowerCase().includes(lower) ||
        (c.subtitle && c.subtitle.toLowerCase().includes(lower))
    );
  }, [allCommands, query]);

  // Clamp selected index
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Keyboard navigation inside palette
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filtered.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % Math.max(1, filtered.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].onSelect();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Institutional Command Palette"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100000,
        background: "rgba(18, 35, 17, 0.45)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "12vh",
        paddingLeft: 16,
        paddingRight: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 640,
          background: "var(--surface)",
          border: "1.5px solid var(--border-strong)",
          borderRadius: 14,
          boxShadow: "0 24px 72px rgba(18, 35, 17, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.1)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Terminal Header & Input */}
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: "var(--surface-2)",
          }}
        >
          <span style={{ color: "var(--accent)", display: "flex" }}>
            <Icon name="search" size={17} />
          </span>

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command, market ticker (e.g. NVDA, AAPL), or action..."
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: 14,
              fontFamily: "var(--sans)",
              fontWeight: 550,
              color: "var(--text)",
            }}
          />

          <kbd
            style={{
              padding: "2px 6px",
              background: "var(--surface-3)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              fontSize: 10,
              fontFamily: "var(--mono)",
              color: "var(--text-3)",
            }}
          >
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          style={{
            maxHeight: 380,
            overflowY: "auto",
            padding: "8px 6px",
          }}
        >
          {filtered.length === 0 ? (
            <div
              style={{
                padding: "28px 16px",
                textAlign: "center",
                color: "var(--text-3)",
                fontSize: 13,
                fontFamily: "var(--mono)",
              }}
            >
              NO MATCHING COMMANDS FOR "{query.toUpperCase()}"
            </div>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.onSelect}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    width: "100%",
                    padding: "9px 12px",
                    background: isSelected ? "var(--surface-3)" : "transparent",
                    border: isSelected ? "1px solid var(--border-strong)" : "1px solid transparent",
                    borderRadius: 8,
                    cursor: "pointer",
                    textAlign: "left",
                    color: "var(--text)",
                    transition: "background 0.08s ease",
                  }}
                >
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: isSelected ? "var(--accent)" : "var(--surface-2)",
                      color: isSelected ? "#122311" : "var(--text-2)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      transition: "all 0.08s ease",
                    }}
                  >
                    <Icon name={item.icon} size={14} />
                  </span>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 650, fontSize: 13.5 }}>
                        {item.title}
                      </span>
                      <span
                        style={{
                          fontSize: 9.5,
                          fontFamily: "var(--mono)",
                          padding: "1px 5px",
                          borderRadius: 3,
                          background: "var(--surface-2)",
                          color: "var(--text-3)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        {item.category}
                      </span>
                    </div>
                    {item.subtitle && (
                      <div
                        className="truncate"
                        style={{ fontSize: 11.5, color: "var(--text-2)", marginTop: 2 }}
                      >
                        {item.subtitle}
                      </div>
                    )}
                  </div>

                  {item.shortcut && (
                    <kbd
                      style={{
                        padding: "2px 6px",
                        background: "var(--surface-2)",
                        border: "1px solid var(--border)",
                        borderRadius: 4,
                        fontSize: 10,
                        fontFamily: "var(--mono)",
                        color: "var(--text-3)",
                      }}
                    >
                      {item.shortcut}
                    </kbd>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Terminal Footer */}
        <div
          style={{
            padding: "8px 16px",
            borderTop: "1px solid var(--border)",
            background: "var(--surface-2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 10.5,
            fontFamily: "var(--mono)",
            color: "var(--text-3)",
          }}
        >
          <div className="row g-12" style={{ alignItems: "center" }}>
            <span>&uarr;&darr; NAVIGATE</span>
            <span>&crarr; EXECUTE</span>
            <span>ESC CLOSE</span>
          </div>
          <span>CIRCUIT DETERMINISTIC COMMAND TERMINAL</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
