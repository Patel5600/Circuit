import React from "react";
import { NavLink, useLocation } from "react-router-dom";

import { CircuitWordmark } from "../brand/CircuitLogo";
import { WalletButton } from "../wallet/WalletButton";
import { Icon, IconName, Pill } from "../ui";
import { CLUSTER, CLUSTER_LABEL } from "../../env";

/** Primary destinations, shared by the sidebar and the mobile bottom bar. */
const PRIMARY: { to: string; label: string; icon: IconName }[] = [
  { to: "/app", label: "Dashboard", icon: "dashboard" },
  { to: "/app/markets", label: "Markets", icon: "markets" },
  { to: "/app/position", label: "Position", icon: "position" },
  { to: "/app/demo", label: "Risk Demo", icon: "gauge" },
  { to: "/app/activity", label: "Activity", icon: "activity" },
];

const SECONDARY: { to: string; label: string; icon: IconName }[] = [
  { to: "/app/faucet", label: "Faucet", icon: "faucet" },
  { to: "/app/learn", label: "Learn", icon: "learn" },
  { to: "/app/verify", label: "Verify", icon: "verify" },
];

function NetworkPill() {
  return (
    <Pill tone={CLUSTER === "devnet" ? "accent" : "neutral"} withDot>
      {CLUSTER_LABEL}
    </Pill>
  );
}

function Header() {
  return (
    <header className="appbar">
      <NavLink to="/" aria-label="circuit home">
        <CircuitWordmark size={24} />
      </NavLink>

      {/* Desktop inline nav without Profile option */}
      <nav
        aria-label="Primary"
        className="row g-4 grow"
        style={{ marginLeft: 12, display: "none" }}
        data-desktop-nav
      >
        {PRIMARY.slice(0, 3).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/app"}
            className="navlink"
            style={{ minHeight: 36 }}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <span className="grow" data-mobile-spacer />

      <div className="row g-8" style={{ alignItems: "center" }}>
        <span data-hide-narrow>
          <NetworkPill />
        </span>
        <WalletButton compact />
      </div>

      <style>{`
        @media (min-width: 1024px) {
          nav[data-desktop-nav] { display: flex !important; }
          span[data-mobile-spacer] { display: none; }
        }
        @media (max-width: 400px) {
          span[data-hide-narrow] { display: none; }
        }
      `}</style>
    </header>
  );
}

function Sidebar() {
  return (
    <aside className="sidebar">
      <nav aria-label="Sections" className="stack g-2">
        {PRIMARY.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/app"}
            className="navlink"
          >
            <span className="navlink__icon">
              <Icon name={item.icon} size={17} />
            </span>
            {item.label}
          </NavLink>
        ))}

        <div className="navgroup stack g-2">
          {SECONDARY.map((item) => (
            <NavLink key={item.to} to={item.to} className="navlink">
              <span className="navlink__icon">
                <Icon name={item.icon} size={17} />
              </span>
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>

      <div className="grow" />

      {/* Bottom Left Corner: Connected to Profile + Network & Wallet */}
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
            padding: "8px 10px",
            borderRadius: "var(--r)",
            background: isActive ? "var(--surface-3)" : "rgba(255, 255, 255, 0.03)",
            border: `1px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
            color: "var(--text)",
            textDecoration: "none",
            transition: "all var(--t-fast)",
            marginBottom: 2,
          })}
        >
          <span
            style={{
              width: 30,
              height: 30,
              borderRadius: 7,
              background: "rgba(127, 195, 154, 0.14)",
              color: "var(--success)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Icon name="shield" size={16} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 650, lineHeight: 1.2 }}>Profile</div>
            <div style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "var(--mono)" }}>
              Risk Posture
            </div>
          </div>
          <span style={{ opacity: 0.4, display: "flex", alignItems: "center" }}>
            <Icon name="chevron" size={13} />
          </span>
        </NavLink>

        <div className="row between g-8">
          <span className="t-label">Network</span>
          <NetworkPill />
        </div>
        <WalletButton />
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

/** Sticky borrow action on mobile, where Borrow is not a bottom-nav item. */
function BorrowFab() {
  const { pathname } = useLocation();
  if (pathname.startsWith("/app/borrow")) return null;
  return (
    <NavLink to="/app/borrow" className="btn btn--accent fab" aria-label="Borrow">
      <Icon name="borrow" size={16} />
      Borrow
    </NavLink>
  );
}

/** Bottom Left Corner Profile FAB on mobile */
function ProfileFab() {
  const { pathname } = useLocation();
  if (pathname.startsWith("/app/profile")) return null;
  return (
    <NavLink
      to="/app/profile"
      className="profile-fab"
      aria-label="Risk Profile"
    >
      <Icon name="shield" size={15} />
      <span>Profile</span>
    </NavLink>
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
  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Header />
      <div className="shell__body">
        <Sidebar />
        <main className="main" id="main">
          {children}
        </main>
      </div>
      <MobileNav />
      <ProfileFab />
      <BorrowFab />
    </div>
  );
}
