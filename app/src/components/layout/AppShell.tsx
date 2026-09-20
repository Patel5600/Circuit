import React, { useState, useMemo, useEffect } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";

import { CircuitWordmark } from "../brand/CircuitLogo";
import { WalletButton } from "../wallet/WalletButton";
import { Icon, IconName, Pill } from "../ui";

import { SystemHealthModal } from "../ui/SystemHealthModal";
import { ToastProvider } from "../ui/Toaster";
import { useCircuitDomain } from "../../lib/domain/context";
import { CLUSTER_LABEL } from "../../env";
import { useTheme } from "../../context/ThemeContext";

import { CommandPalette } from "../terminal/CommandPalette";
import NetworkStatusBar from "../ui/NetworkStatusBar";

/** Primary destinations, shared by the sidebar and the mobile bottom bar. Autonomous is excluded (top-level workspace mode). */
const PRIMARY: { to: string; label: string; icon: IconName }[] = [
  { to: "/app", label: "Dashboard", icon: "dashboard" },
  { to: "/app/markets", label: "Markets", icon: "markets" },
  { to: "/app/position", label: "Position", icon: "position" },
  { to: "/app/borrow", label: "Borrow", icon: "borrow" },
  { to: "/app/activity", label: "Activity", icon: "activity" },
];

const SECONDARY: { to: string; label: string; icon: IconName }[] = [
  { to: "/app/learn", label: "Learn", icon: "learn" },
  { to: "/app/verify", label: "Verify", icon: "verify" },
  { to: "/app/faucet", label: "Faucet", icon: "faucet" },
];

/** Compact static network indicator for the app bar. Always visible on ≥768px. */
function NetworkPill() {
  return (
    <div className="net-pill" title={`Connected to Solana ${CLUSTER_LABEL}`}>
      <span className="net-pill__dot" aria-hidden="true" />
      <span>{CLUSTER_LABEL}</span>
    </div>
  );
}

function Header({
  onOpenHealth,
  onOpenCommand,
}: {
  onOpenHealth?: () => void;
  onOpenCommand?: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const isAutonomous = location.pathname.startsWith("/app/autonomous");
  const { theme, toggle } = useTheme();

  const {
    controlMode,
    setControlMode,
    hasActiveAuthority,
    onChainAuthorities,
  } = useCircuitDomain();

  const authorityStatusBadge = useMemo(() => {
    if (hasActiveAuthority) {
      return { label: "ACTIVE", tone: "active" as const };
    }
    if (onChainAuthorities.some((a) => a.isExpired)) {
      return { label: "EXPIRED", tone: "warning" as const };
    }
    if (onChainAuthorities.some((a) => a.isRevoked)) {
      return { label: "REVOKED", tone: "danger" as const };
    }
    return null;
  }, [hasActiveAuthority, onChainAuthorities]);

  return (
    <header className="appbar">
      <div className="row g-8 appbar__left" style={{ alignItems: "center", flexShrink: 0 }}>
        <NavLink to="/" aria-label="circuit home" style={{ display: "flex", alignItems: "center" }}>
          <CircuitWordmark size={22} />
        </NavLink>
        {onOpenCommand && (
          <button
            type="button"
            onClick={onOpenCommand}
            className="command-trigger-btn"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 8px",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-sm, 6px)",
              color: "var(--text-3)",
              fontSize: 11,
              fontFamily: "var(--mono)",
              cursor: "pointer",
              transition: "all var(--t-fast)",
            }}
            title="Open Command Terminal (⌘K or Ctrl+K)"
          >
            <Icon name="search" size={12} />
            <span className="appbar__hide-mobile">COMMAND</span>
            <kbd style={{ fontSize: 9.5, opacity: 0.8, fontFamily: "var(--mono)" }}>⌘K</kbd>
          </button>
        )}
      </div>

      <div className="appbar__center">
        {/* Authoritative Execution Actor Switcher */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            background: "var(--surface-2)",
            borderRadius: "var(--r-sm, 6px)",
            padding: "2px 3px",
            border: "1px solid var(--border)",
          }}
        >
          <button
            type="button"
            onClick={() => {
              setControlMode("MANUAL");
              if (isAutonomous) {
                navigate("/app");
              }
            }}
            style={{
              padding: "5px 12px",
              fontSize: 11,
              fontWeight: !isAutonomous ? 700 : 500,
              color: !isAutonomous ? "var(--text-1)" : "var(--text-3)",
              background: !isAutonomous ? "var(--surface-3)" : "transparent",
              border: !isAutonomous ? "1px solid var(--border)" : "1px solid transparent",
              borderRadius: "var(--r-sm, 4px)",
              cursor: "pointer",
              transition: "all var(--t-fast)",
            }}
            title="Manual Mode: Direct wallet actions"
          >
            MANUAL
          </button>
          <button
            type="button"
            onClick={() => {
              setControlMode("AUTONOMOUS");
              if (!isAutonomous) {
                navigate("/app/autonomous");
              }
            }}
            style={{
              padding: authorityStatusBadge ? "5px 10px" : "5px 12px",
              fontSize: 11,
              fontWeight: isAutonomous ? 700 : 500,
              color: isAutonomous ? "var(--accent)" : "var(--text-3)",
              background: isAutonomous ? "var(--surface-3)" : "transparent",
              border: isAutonomous ? "1px solid var(--border-strong)" : "1px solid transparent",
              borderRadius: "var(--r-sm, 4px)",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              transition: "all var(--t-fast)",
            }}
            title="Agent Mode: Bounded execution within your risk limits"
          >
            <span>AGENT</span>
            {authorityStatusBadge && (
              <span
                className="appbar__mode-badge"
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  fontFamily: "var(--mono)",
                  letterSpacing: "0.04em",
                  padding: "1px 5px",
                  borderRadius: 3,
                  background:
                    authorityStatusBadge.tone === "active"
                      ? "rgba(121, 194, 164, 0.18)"
                      : authorityStatusBadge.tone === "danger"
                      ? "rgba(207, 139, 139, 0.18)"
                      : "rgba(207, 173, 116, 0.18)",
                  color:
                    authorityStatusBadge.tone === "active"
                      ? "var(--mint, #79c2a4)"
                      : authorityStatusBadge.tone === "danger"
                      ? "var(--danger, #cf8b8b)"
                      : "var(--warning, #cfad74)",
                  border:
                    authorityStatusBadge.tone === "active"
                      ? "1px solid rgba(121, 194, 164, 0.3)"
                      : "1px solid transparent",
                }}
              >
                {authorityStatusBadge.label}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="row g-8 appbar__right" style={{ alignItems: "center", flexShrink: 0 }}>
        {/* Theme toggle */}
        <button
          type="button"
          onClick={toggle}
          className="theme-toggle"
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          aria-label={`Current mode: ${theme}. Click to switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          <span className="theme-toggle__icon" aria-hidden="true">
            <Icon name={theme === "dark" ? "sun" : "moon"} size={15} />
          </span>
          <span className="theme-toggle__label appbar__hide-mobile">
            {theme === "dark" ? "LIGHT" : "DARK"}
          </span>
        </button>
        {/* Network pill: visible on ≥768px via CSS (appbar__hide-mobile hidden only below 640px) */}
        <div className="appbar__hide-mobile">
          <NetworkPill />
        </div>
        <WalletButton compact />
        <NavLink
          to="/app/profile"
          style={({ isActive }) => ({
            padding: "5px 9px",
            fontSize: 12,
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            border: `1px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
            borderRadius: "var(--r-sm, 6px)",
            background: isActive ? "var(--surface-3)" : "var(--surface-2)",
            color: isActive ? "var(--text)" : "var(--text-2)",
            textDecoration: "none",
            height: 32,
            boxSizing: "border-box",
            transition: "all var(--t-fast)",
          })}
          title="Risk Profile & Account Settings"
        >
          <Icon name="user" size={14} />
          <span className="appbar__hide-mobile" style={{ fontSize: 11, fontWeight: 600, fontFamily: "var(--sans)" }}>Profile</span>
        </NavLink>
      </div>
    </header>
  );
}

function Sidebar({
  collapsed,
  onToggleCollapse,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  return (
    <aside className={`sidebar ${collapsed ? "sidebar--collapsed" : ""}`}>
      {/* Rail toggle control */}
      <div
        className="row between g-8"
        style={{
          padding: "0 4px 10px 4px",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "space-between",
        }}
      >
        {!collapsed && (
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: "0.06em",
              color: "var(--text-3)",
            }}
          >
            PLATFORM
          </span>
        )}
        <button
          type="button"
          onClick={onToggleCollapse}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          style={{
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-sm, 6px)",
            color: "var(--text-3)",
            width: 28,
            height: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "all var(--t-fast)",
          }}
        >
          <Icon name="chevron" size={13} />
        </button>
      </div>

      <nav aria-label="Sections" className="stack g-2">
        {PRIMARY.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/app"}
            className="navlink"
            title={collapsed ? item.label : undefined}
          >
            <span className="navlink__icon">
              <Icon name={item.icon} size={17} />
            </span>
            <span className="navlink__label">{item.label}</span>
          </NavLink>
        ))}

        <div className="navgroup stack g-2" style={{ marginTop: 8 }}>
          {SECONDARY.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className="navlink"
              title={collapsed ? item.label : undefined}
            >
              <span className="navlink__icon">
                <Icon name={item.icon} size={17} />
              </span>
              <span className="navlink__label">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      <div className="grow" />

      {/* Bottom Rail: Profile Card */}
      <div
        className="stack g-10"
        style={{ paddingTop: 14, borderTop: "1px solid var(--border)" }}
      >
        <NavLink
          to="/app/profile"
          className="navlink"
          style={({ isActive }) => ({
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: collapsed ? "8px 0" : "8px 10px",
            justifyContent: collapsed ? "center" : "flex-start",
            borderRadius: "var(--r)",
            background: isActive ? "var(--surface-3)" : "rgba(255, 255, 255, 0.03)",
            border: `1px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
            color: "var(--text)",
            textDecoration: "none",
            transition: "all var(--t-fast)",
            marginBottom: 2,
          })}
          title={collapsed ? "Risk Profile" : undefined}
        >
          <span
            style={{
              width: 30,
              height: 30,
              borderRadius: 7,
              background: "rgba(236, 234, 230, 0.08)",
              color: "var(--accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Icon name="user" size={16} />
          </span>
          {!collapsed && (
            <>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 650, lineHeight: 1.2 }}>Profile</div>
                <div style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "var(--mono)" }}>
                  Risk Posture
                </div>
              </div>
              <span style={{ opacity: 0.4, display: "flex", alignItems: "center" }}>
                <Icon name="chevron" size={13} />
              </span>
            </>
          )}
        </NavLink>
      </div>
    </aside>
  );
}

function MobileNav() {
  return (
    <nav className="bottomnav" aria-label="Primary">
      {PRIMARY.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/app"}
          className="bottomnav__item"
        >
          <Icon name={item.icon} size={19} />
          {item.label === "Dashboard" ? "Home" : item.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function PageContainer({
  title,
  subtitle,
  action,
  narrow = false,
  children,
}: {
  title?: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  narrow?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`container${narrow ? " container--narrow" : ""}`}>
      {(title || action) && (
        <div className="pagehead row between g-16 wrap">
          <div>
            {title && <h1 className="pagehead__title">{title}</h1>}
            {subtitle && <p className="pagehead__sub">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

/** Derives real network source statuses from domain context */
function NetworkStatusBarWrapper() {
  const { systemHealth } = useCircuitDomain();
  const rpcStatus = systemHealth.isOnline
    ? systemHealth.rpcLatencyMs > 3000
      ? "DEGRADED" as const
      : "LIVE" as const
    : "DISCONNECTED" as const;
  const pythStatus = systemHealth.isOnline ? "LIVE" as const : "UNAVAILABLE" as const;

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        padding: "2px 16px",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface-0)",
      }}
    >
      <NetworkStatusBar
        sources={[
          {
            name: "SOLANA RPC",
            status: rpcStatus,
            detail: systemHealth.rpcLatencyMs > 0 ? `${systemHealth.rpcLatencyMs}ms` : undefined,
          },
          { name: "PYTH", status: pythStatus },
          { name: "CIRCUIT", status: systemHealth.isOnline ? "LIVE" : "UNAVAILABLE" },
        ]}
      />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isAutonomous = location.pathname.startsWith("/app/autonomous");

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("circuit_sidebar_collapsed") === "true";
    }
    return false;
  });

  const [healthOpen, setHealthOpen] = useState<boolean>(false);
  const [commandOpen, setCommandOpen] = useState<boolean>(false);

  // Global shortcut for Command Palette (⌘K, Ctrl+K, or /)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
      } else if (
        e.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("circuit_sidebar_collapsed", String(next));
      }
      return next;
    });
  };

  return (
    <ToastProvider>
      <div className="shell">
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <Header
          onOpenHealth={() => setHealthOpen(true)}
          onOpenCommand={() => setCommandOpen(true)}
        />
        {/* Real-state network health bar */}
        <NetworkStatusBarWrapper />
        <div className="shell__body">
          {!isAutonomous && <Sidebar collapsed={collapsed} onToggleCollapse={toggleCollapse} />}
          <main
            className="main"
            id="main"
            style={
              isAutonomous
                ? {
                    padding: 0,
                    margin: 0,
                    maxWidth: "100%",
                    width: "100%",
                    height: "calc(100vh - var(--header-h, 57px))",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                  }
                : undefined
            }
          >
            {children}
          </main>
        </div>
        {!isAutonomous && <MobileNav />}

        <SystemHealthModal open={healthOpen} onClose={() => setHealthOpen(false)} />
        <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
      </div>
    </ToastProvider>
  );
}
