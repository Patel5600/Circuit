import React, { useState, useEffect, useRef } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useTheme } from "../../context/ThemeContext";
import { useCircuitDomain } from "../../lib/domain/context";
import { circuitTransport } from "../../lib/transport/circuit-transport";
import { shortenAddress } from "../../lib/format";
import { CLUSTER_LABEL } from "../../env";

export interface CommandBarProps {
  onOpenCommand?: () => void;
}

export function CommandBar({ onOpenCommand }: CommandBarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isAutonomous = location.pathname.startsWith("/app/autonomous");

  const { theme, toggle } = useTheme();
  const { connected, publicKey, disconnect } = useWallet();
  const { setVisible: openWalletModal } = useWalletModal();
  const { setControlMode, systemHealth } = useCircuitDomain();

  const [netOpen, setNetOpen] = useState(false);
  const [walOpen, setWalOpen] = useState(false);
  const [currentSlot, setCurrentSlot] = useState<number>(312048113);
  const [rpcLatency, setRpcLatency] = useState<number>(() => systemHealth.rpcLatencyMs || 42);

  const netRef = useRef<HTMLDivElement>(null);
  const walRef = useRef<HTMLDivElement>(null);

  // Subscribe to real transport health & slot
  useEffect(() => {
    const unsub = circuitTransport.subscribeHealth((h) => {
      if (h.currentSlot && h.currentSlot > 0) {
        setCurrentSlot(h.currentSlot);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (systemHealth.rpcLatencyMs > 0) {
      setRpcLatency(systemHealth.rpcLatencyMs);
    }
  }, [systemHealth.rpcLatencyMs]);

  // Close popovers on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (netRef.current && !netRef.current.contains(e.target as Node)) {
        setNetOpen(false);
      }
      if (walRef.current && !walRef.current.contains(e.target as Node)) {
        setWalOpen(false);
      }
    };
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  // Theme circular wipe transition
  const handleThemeToggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX || rect.left + rect.width / 2;
    const y = e.clientY || rect.top + rect.height / 2;

    if (document.startViewTransition) {
      const end = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
      const root = document.documentElement;
      document
        .startViewTransition(() => {
          toggle();
        })
        .ready.then(() => {
          root.animate(
            { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
            { duration: 600, easing: "cubic-bezier(0.7, 0, 0.2, 1)", pseudoElement: "::view-transition-new(root)" }
          );
        });
    } else {
      toggle();
    }
  };

  const copyAddress = () => {
    if (publicKey) {
      navigator.clipboard?.writeText(publicKey.toBase58());
      setWalOpen(false);
    }
  };

  return (
    <div className="tb">
      {/* Left: Brand + Command Chip */}
      <div className="tb-l">
        <NavLink to="/" className="brand" aria-label="Circuit Home">
          <svg viewBox="0 0 24 24">
            <circle cx="4" cy="12" r="2.2" />
            <path d="M6.2 12H12" />
            <path d="M12 12h5.8" strokeOpacity=".4" />
            <circle cx="20" cy="12" r="2.2" />
          </svg>
          circuit
        </NavLink>

        <button
          type="button"
          className="cmdchip"
          onClick={onOpenCommand}
          title="Open Command Palette (⌘K or Ctrl+K)"
        >
          COMMAND <kbd>⌘K</kbd>
        </button>
      </div>

      {/* Center: Authoritative Execution Mode Segmented Switcher */}
      <div
        className="seg"
        role="radiogroup"
        aria-label="Execution Mode"
        style={{ ["--i" as any]: isAutonomous ? 1 : 0, ["--n" as any]: 2 }}
      >
        <i className="thumb" />
        <button
          type="button"
          role="radio"
          aria-checked={!isAutonomous}
          onClick={() => {
            setControlMode("MANUAL");
            if (isAutonomous) {
              navigate("/app");
            }
          }}
        >
          MANUAL
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={isAutonomous}
          onClick={() => {
            setControlMode("AUTONOMOUS");
            if (!isAutonomous) {
              navigate("/app/autonomous");
            }
          }}
        >
          AGENT
        </button>
      </div>

      {/* Right: Theme Toggle, Network Popover, Wallet Popover, Profile Button */}
      <div className="tb-r">
        {/* Theme Toggle */}
        <button
          type="button"
          className="themebtn"
          onClick={handleThemeToggle}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          <span className="ic-swap">
            <svg className="moon" viewBox="0 0 24 24">
              <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
            </svg>
            <svg className="sun" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6L19 19M5 19l1.4-1.4M17.6 6.4L19 5" />
            </svg>
          </span>
          <span className="theme-lbl">{theme === "dark" ? "LIGHT" : "DARK"}</span>
        </button>

        {/* Network Status Popover */}
        <div className={`anchor ${netOpen ? "open" : ""}`} ref={netRef}>
          <button
            type="button"
            className="pchip"
            onClick={(e) => {
              e.stopPropagation();
              setNetOpen((prev) => !prev);
              setWalOpen(false);
            }}
            aria-haspopup="true"
            aria-expanded={netOpen}
          >
            <i className="dotp" />
            {CLUSTER_LABEL}
          </button>
          <div className="pop" role="dialog" aria-label="Network telemetry">
            <div className="kv">
              <span>Cluster</span>
              <b>devnet</b>
            </div>
            <div className="kv">
              <span>RPC latency</span>
              <b>{rpcLatency} ms</b>
            </div>
            <div className="kv">
              <span>Slot</span>
              <b>{currentSlot.toLocaleString("en-US")}</b>
            </div>
            <hr />
            <div className="kv">
              <span>Program</span>
              <b style={{ fontSize: 10 }}>Cq4Lvd...sFh4</b>
            </div>
          </div>
        </div>

        {/* Wallet Popover */}
        <div className={`anchor ${walOpen ? "open" : ""}`} ref={walRef}>
          {connected && publicKey ? (
            <>
              <button
                type="button"
                className="pchip"
                onClick={(e) => {
                  e.stopPropagation();
                  setWalOpen((prev) => !prev);
                  setNetOpen(false);
                }}
                aria-haspopup="menu"
                aria-expanded={walOpen}
              >
                {shortenAddress(publicKey.toBase58())}
              </button>
              <div className="pop" role="menu">
                <button type="button" role="menuitem" onClick={copyAddress}>
                  Copy address
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    navigate("/app/faucet");
                    setWalOpen(false);
                  }}
                >
                  Request faucet
                </button>
                <a
                  role="menuitem"
                  href={`https://explorer.solana.com/address/${publicKey.toBase58()}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setWalOpen(false)}
                >
                  View on explorer
                </a>
                <hr />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    disconnect();
                    setWalOpen(false);
                  }}
                  style={{ color: "var(--bad)" }}
                >
                  Disconnect
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              className="pchip"
              onClick={() => openWalletModal(true)}
              style={{ fontWeight: 600 }}
            >
              Connect
            </button>
          )}
        </div>

        {/* Profile Link */}
        <NavLink to="/app/profile" className="prof" title="Risk Profile & Settings">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
          </svg>
          Profile
        </NavLink>
      </div>
    </div>
  );
}
