/**
 * Circuit Protocol — Agent Command Palette (Cmd/Ctrl + K)
 *
 * Fast keyboard-navigable command center for triggering agent actions,
 * inspecting risk and permissions, and launching strategies.
 */

import React, { useState, useEffect, useRef } from "react";

export interface CommandItem {
  id: string;
  title: string;
  category: "RISK & PERMISSION" | "ACTIONS" | "MONITORING" | "SYSTEM";
  shortcut?: string;
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: CommandItem[];
}

export function CommandPalette({ isOpen, onClose, commands }: CommandPaletteProps) {
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const filtered = commands.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase()) ||
    c.category.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % (filtered.length || 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filtered.length) % (filtered.length || 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          filtered[selectedIndex].action();
          onClose();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, filtered, selectedIndex, onClose]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(4px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "15vh",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 540,
          background: "var(--surface-1, #121214)",
          border: "1px solid var(--border-strong, #3f3f46)",
          borderRadius: 12,
          boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div style={{ display: "flex", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <span style={{ color: "var(--text-3)", fontSize: 13, marginRight: 10, fontFamily: "var(--mono)" }}>⌘</span>
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command or search actions..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedIndex(0);
            }}
            style={{
              width: "100%",
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--text, #e4e4e7)",
              fontSize: 14,
              fontFamily: "inherit",
            }}
          />
          <kbd
            style={{
              fontSize: 10,
              fontFamily: "var(--mono)",
              background: "rgba(255,255,255,0.08)",
              padding: "2px 6px",
              borderRadius: 4,
              color: "var(--text-3)",
            }}
          >
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div style={{ maxHeight: 320, overflowY: "auto", padding: "8px 0" }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "16px", textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
              No commands found
            </div>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    item.action();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "9px 16px",
                    background: isSelected ? "var(--surface-3, #27272a)" : "transparent",
                    cursor: "pointer",
                    transition: "background 0.1s",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: "var(--mono)",
                        color: "var(--text-3)",
                        padding: "1px 5px",
                        background: "rgba(255,255,255,0.05)",
                        borderRadius: 3,
                      }}
                    >
                      {item.category}
                    </span>
                    <span style={{ fontSize: 13, color: isSelected ? "var(--text)" : "var(--text-2)", fontWeight: 500 }}>
                      {item.title}
                    </span>
                  </div>
                  {item.shortcut && (
                    <kbd style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text-3)" }}>
                      {item.shortcut}
                    </kbd>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "8px 16px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-3)", fontFamily: "var(--mono)" }}>
          <span>Navigate: ↑↓</span>
          <span>Select: ↵</span>
          <span>Close: Esc</span>
        </div>
      </div>
    </div>
  );
}
