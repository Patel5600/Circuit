import React, { useState } from "react";
import { NavLink } from "react-router-dom";

import { CircuitWordmark } from "../brand/CircuitLogo";
import { WalletButton } from "../wallet/WalletButton";
import { Icon, IconName, Pill } from "../ui";

import { SystemHealthModal } from "../ui/SystemHealthModal";
import { ToastProvider } from "../ui/Toaster";
import { useCircuitDomain } from "../../lib/domain/context";
import { NetworkSelector } from "./NetworkSelector";

/** Primary destinations, shared by the sidebar and the mobile bottom bar. */
const PRIMARY: { to: string; label: string; icon: IconName }[] = [
  { to: "/app", label: "Dashboard", icon: "dashboard" },
  { to: "/app/markets", label: "Markets", icon: "markets" },
  { to: "/app/position", label: "Position", icon: "position" },
  { to: "/app/activity", label: "Activity", icon: "activity" },
  { to: "/app/borrow", label: "Borrow", icon: "borrow" },
];

const SECONDARY: { to: string; label: string; icon: IconName }[] = [
  { to: "/app/learn", label: "Learn", icon: "learn" },
  { to: "/app/verify", label: "Verify", icon: "verify" },
  { to: "/app/faucet", label: "Faucet", icon: "faucet" },
];

function SystemHealthPill({ onClick }: { onClick: () => void }) {
  const { systemHealth } = useCircuitDomain();
  const isHealthy = systemHealth.status === "SYSTEM_HEALTHY";
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "transparent",
        border: "none",
        padding: 0,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
      }}
      title="View System Health & RPC Diagnostics"
    >
      <Pill tone={isHealthy ? "success" : "warning"} withDot>
        {isHealthy ? "HEALTHY" : "DEGRADED"}
      </Pill>
    </button>
  );
}

function Header({ onOpenHealth }: { onOpenHealth: () => void }) {
  const { controlMode, setControlMode } = useCircuitDomain();
  return (
    <header className="appbar">
      <div className="row g-8" style={{ alignItems: "center" }}>
        <NavLink to="/" aria-label="circuit home" style={{ display: "flex", alignItems: "center" }}>
          <CircuitWordmark size={22} />
        </NavLink>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
        {/* Protocol Sovereign Control Mode Toggle */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            background: "var(--surface-2, rgba(255, 255, 255, 0.04))",
            borderRadius: "var(--r-sm, 6px)",
            padding: "2px 3px",
            border: "1px solid var(--border, rgba(255, 255, 255, 0.08))",
          }}
        >
          <button
            type="button"
            onClick={() => setControlMode("MANUAL")}
            style={{
              padding: "4px 10px",
              fontSize: 11,
              fontWeight: controlMode === "MANUAL" ? 700 : 500,
              color: controlMode === "MANUAL" ? "var(--text-1, #fff)" : "var(--text-3, #777)",
              background: controlMode === "MANUAL" ? "var(--surface-3, rgba(255, 255, 255, 0.12))" : "transparent",
              borderRadius: "var(--r-sm, 4px)",
              border: "none",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            title="Manual Mode: Sovereign direct wallet control without agents"
          >
            MANUAL
          </button>
          <button
            type="button"
            onClick={() => setControlMode("AUTONOMOUS")}
            style={{
              padding: "4px 10px",
              fontSize: 11,
              fontWeight: controlMode === "AUTONOMOUS" ? 700 : 500,
              color: controlMode === "AUTONOMOUS" ? "var(--accent, #f59e0b)" : "var(--text-3, #777)",
              background: controlMode === "AUTONOMOUS" ? "rgba(245, 158, 11, 0.15)" : "transparent",
              borderRadius: "var(--r-sm, 4px)",
              border: "none",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            title="Autonomous Mode: Bounded strategy execution multiplier"
          >
            AUTONOMOUS
          </button>
        </div>

        <SystemHealthPill onClick={onOpenHealth} />
      </div>

      <div className="row g-8" style={{ alignItems: "center" }}>
        <NetworkSelector />
        <WalletButton compact />
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

      {/* Bottom Rail: Profile Card + Network & Wallet */}
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

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("circuit_sidebar_collapsed") === "true";
    }
    return false;
  });

  const [healthOpen, setHealthOpen] = useState<boolean>(false);

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
        <Header onOpenHealth={() => setHealthOpen(true)} />
        <div className="shell__body">
          <Sidebar collapsed={collapsed} onToggleCollapse={toggleCollapse} />
          <main className="main" id="main">
            {children}
          </main>
        </div>
        <MobileNav />

        <SystemHealthModal open={healthOpen} onClose={() => setHealthOpen(false)} />
      </div>
    </ToastProvider>
  );
}
