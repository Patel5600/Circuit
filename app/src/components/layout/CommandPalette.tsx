import React, { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useCircuitDomain } from "../../lib/domain/context";
import { useTheme } from "../../context/ThemeContext";

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

interface CommandItem {
  group: "Navigate" | "Actions" | "Mode" | "View";
  title: string;
  iconName: string;
  shortcut?: string;
  run: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { controlMode, setControlMode, risk } = useCircuitDomain();
  const { toggle: toggleTheme } = useTheme();

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: CommandItem[] = useMemo(() => [
    // Navigation
    { group: "Navigate", title: "Dashboard", iconName: "dashboard", shortcut: "G D", run: () => navigate("/app") },
    { group: "Navigate", title: "Markets", iconName: "markets", shortcut: "G M", run: () => navigate("/app/markets") },
    { group: "Navigate", title: "Position", iconName: "position", shortcut: "G P", run: () => navigate("/app/position") },
    { group: "Navigate", title: "Borrow", iconName: "borrow", shortcut: "G B", run: () => navigate("/app/borrow") },
    { group: "Navigate", title: "Activity", iconName: "activity", shortcut: "G A", run: () => navigate("/app/activity") },
    { group: "Navigate", title: "Learn", iconName: "learn", shortcut: "G L", run: () => navigate("/app/learn") },
    { group: "Navigate", title: "Verify", iconName: "verify", shortcut: "G V", run: () => navigate("/app/verify") },
    { group: "Navigate", title: "Faucet", iconName: "faucet", shortcut: "G F", run: () => navigate("/app/faucet") },
    { group: "Navigate", title: "Adversarial Lab", iconName: "lab", shortcut: "G T", run: () => navigate("/app/lab") },
    { group: "Navigate", title: "Profile", iconName: "profile", shortcut: "G R", run: () => navigate("/app/profile") },

    // Actions
    { group: "Actions", title: "Borrow USDC", iconName: "borrow", run: () => navigate("/app/borrow") },
    { group: "Actions", title: "Deposit Collateral", iconName: "position", run: () => navigate("/app/position?action=deposit") },
    { group: "Actions", title: "Repay Debt", iconName: "borrow", run: () => navigate("/app/position?action=repay") },
    { group: "Actions", title: "Claim Devnet Faucet", iconName: "faucet", run: () => navigate("/app/faucet") },

    // Mode
    {
      group: "Mode",
      title: controlMode === "MANUAL" ? "Switch to Agent Mode" : "Switch to Manual Mode",
      iconName: "agent",
      run: () => {
        const next = controlMode === "MANUAL" ? "AUTONOMOUS" : "MANUAL";
        setControlMode(next);
        if (next === "AUTONOMOUS") navigate("/app/autonomous");
        else navigate("/app");
      },
    },

    // View
    { group: "View", title: "Toggle Theme (Light / Dark)", iconName: "theme", run: () => toggleTheme() },
  ], [navigate, controlMode, setControlMode, toggleTheme]);

  // Fuzzy match
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((cmd) => {
      return (
        cmd.title.toLowerCase().includes(q) ||
        cmd.group.toLowerCase().includes(q)
      );
    });
  }, [commands, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(filtered.length - 1, prev + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].run();
        onClose();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  if (!open) return null;

  let currentGroup = "";

  return (
    <div className={`cp ${open ? "show" : ""}`} role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="cp-bd" onClick={onClose} />
      <div className="cp-box">
        <div className="cp-in">
          <svg viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16 16l4.5 4.5" />
          </svg>
          <input
            ref={inputRef}
            placeholder="Type a command or search…"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <kbd onClick={onClose} style={{ cursor: "pointer" }}>esc</kbd>
        </div>

        <div className="cp-list" role="listbox">
          {filtered.length === 0 ? (
            <div className="cp-empty">No results for “{query}”</div>
          ) : (
            filtered.map((item, idx) => {
              const isFirstInGroup = !query && item.group !== currentGroup;
              if (isFirstInGroup) currentGroup = item.group;

              return (
                <React.Fragment key={`${item.group}-${item.title}`}>
                  {isFirstInGroup && (
                    <div className="cp-g meta">
                      <b>{item.group}</b>
                    </div>
                  )}
                  <div
                    className="cp-it"
                    role="option"
                    aria-selected={idx === selectedIndex}
                    onClick={() => {
                      item.run();
                      onClose();
                    }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <span>{item.title}</span>
                    {item.shortcut && <kbd>{item.shortcut}</kbd>}
                  </div>
                </React.Fragment>
              );
            })
          )}
        </div>

        <div className="cp-ft">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> move
          </span>
          <span>
            <kbd>↵</kbd> run
          </span>
          <span>
            <kbd>esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
