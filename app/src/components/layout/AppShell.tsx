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
import { useInkButtons } from "../../hooks/useInkButtons";
import { circuitTransport, TransportHealthState } from "../../lib/transport/circuit-transport";

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
  { to: "/app/lab", label: "Adversarial Lab", icon: "shield" },
  { to: "/app/faucet", label: "Faucet", icon: "faucet" },
];

/** Compact static network indicator for the app bar. Always visible on ≥768px. */
function NetworkPill() {
  return (
    <div className="net-pill appbar__capsule-btn" title={`Connected to Solana ${CLUSTER_LABEL}`}>
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
            className="appbar__cmd-btn appbar__capsule-btn"
            title="Open Command Terminal (⌘K or Ctrl+K)"
          >
            <Icon name="search" size={12} />
            <span className="appbar__hide-mobile">COMMAND</span>
            <kbd className="appbar__cmd-kbd">⌘K</kbd>
          </button>
        )}
      </div>

      <div className="appbar__center">
        {/* Authoritative Execution Actor Switcher */}
        <div className="appbar__mode-segmented">
          <button
            type="button"
            className={`appbar__mode-btn ${!isAutonomous ? "appbar__mode-btn--active" : ""}`}
            onClick={() => {
              setControlMode("MANUAL");
              if (isAutonomous) {
                navigate("/app");
              }
            }}
            title="Manual Mode: Direct wallet actions"
          >
            MANUAL
          </button>
          <button
            type="button"
            className={`appbar__mode-btn ${isAutonomous ? "appbar__mode-btn--active" : ""}`}
            onClick={() => {
              setControlMode("AUTONOMOUS");
              if (!isAutonomous) {
                navigate("/app/autonomous");
              }
            }}
            title="Agent Mode: Bounded execution within your risk limits"
          >
            <span>AGENT</span>
            {authorityStatusBadge && (
              <span
                className={`appbar__mode-badge appbar__mode-badge--${authorityStatusBadge.tone}`}
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
          className="theme-toggle appbar__capsule-btn"
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          aria-label={`Current mode: ${theme}. Click to switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          <span className="theme-toggle__icon" aria-hidden="true">
            <Icon name={theme === "dark" ? "sun" : "moon"} size={14} />
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
          className={({ isActive }) =>
            `appbar__profile-btn appbar__capsule-btn ${isActive ? "appbar__profile-btn--active" : ""}`
          }
          title="Risk Profile & Account Settings"
        >
          <Icon name="user" size={14} />
          <span className="appbar__hide-mobile">Profile</span>
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
      <div style={{ marginTop: "auto", paddingTop: 16 }}>
        <NavLink
          to="/app/profile"
          className={({ isActive }) =>
            `sidebar-profile-card ${isActive ? "sidebar-profile-card--active" : ""}`
          }
          title={collapsed ? "Risk Profile" : undefined}
        >
          <span className="sidebar-profile-icon">
            <Icon name="user" size={15} />
          </span>
          {!collapsed && (
            <>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="sidebar-profile-title">Profile</div>
                <div className="sidebar-profile-sub">Risk Posture</div>
              </div>
              <span className="sidebar-profile-chevron">
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

/** Derives real network source statuses from domain context and transport health */
function NetworkStatusBarWrapper() {
  const { systemHealth } = useCircuitDomain();
  const [transportHealth, setTransportHealth] = useState<TransportHealthState>(() =>
    circuitTransport.getHealth()
  );

  useEffect(() => {
    return circuitTransport.subscribeHealth((h) => {
      setTransportHealth({ ...h });
    });
  }, []);

  const rpcStatus = !systemHealth.isOnline
    ? "DISCONNECTED"
    : transportHealth.solanaRpc === "DEGRADED" || systemHealth.rpcLatencyMs > 3000
    ? "DEGRADED"
    : "LIVE";

  const pythStatus = !systemHealth.isOnline
    ? "DISCONNECTED"
    : transportHealth.pythOracle === "LIVE"
    ? "LIVE"
    : transportHealth.pythOracle === "DEGRADED"
    ? "DEGRADED"
    : "UNAVAILABLE";

  const circuitStatus = !systemHealth.isOnline
    ? "DISCONNECTED"
    : transportHealth.programState === "LIVE"
    ? "LIVE"
    : "UNAVAILABLE";

  return (
    <div
      className="shell__network-bar"
      style={{
        display: "flex",
        justifyContent: "center",
        padding: "2px 16px",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface-0)",
        flex: "none",
        zIndex: 55,
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
          { name: "CIRCUIT", status: circuitStatus },
        ]}
      />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isAutonomous = location.pathname.startsWith("/app/autonomous");
  const mainRef = React.useRef<HTMLElement>(null);

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("circuit_sidebar_collapsed") === "true";
    }
    return false;
  });

  const [healthOpen, setHealthOpen] = useState<boolean>(false);
  const [commandOpen, setCommandOpen] = useState<boolean>(false);

  // ── Ink micro-interactions: fill, magnetic, underline, squash ──
  useInkButtons();

  // Reset main view scroll to top on route change
  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [location.pathname]);

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
        <div className={`shell__body ${collapsed ? "shell__body--collapsed" : ""}`}>
          {!isAutonomous && <Sidebar collapsed={collapsed} onToggleCollapse={toggleCollapse} />}
          <main
            ref={mainRef}
            className="main"
            id="main"
            style={
              isAutonomous
                ? {
                    padding: 0,
                    margin: 0,
                    maxWidth: "100%",
                    width: "100%",
                    height: "100%",
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
