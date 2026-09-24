import React, { useRef, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useCircuitDomain } from "../../lib/domain/context";

export interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const PRIMARY_LINKS = [
  {
    to: "/app",
    name: "Dashboard",
    icon: (
      <svg viewBox="0 0 24 24">
        <rect x="3.5" y="3.5" width="7" height="7" rx="1" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="1" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="1" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    to: "/app/markets",
    name: "Markets",
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M5 20V11M12 20V4M19 20v-6" />
      </svg>
    ),
  },
  {
    to: "/app/position",
    name: "Position",
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M4 8l8-4 8 4-8 4-8-4z" />
        <path d="M4 16l8 4 8-4" />
      </svg>
    ),
  },
  {
    to: "/app/borrow",
    name: "Borrow",
    hasFlag: true,
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M12 3v18" />
        <path d="M16.5 7.5c-.8-1.2-2.4-2-4.5-2-2.5 0-4 1.2-4 3s1.5 2.6 4 3 4 1.2 4 3-1.5 3-4 3c-2.2 0-3.9-.9-4.7-2.2" />
      </svg>
    ),
  },
  {
    to: "/app/activity",
    name: "Activity",
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M3 12h4l2.5-7 5 14 2.5-7h4" />
      </svg>
    ),
  },
];

const SECONDARY_LINKS = [
  {
    to: "/app/learn",
    name: "Learn",
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M2 9l10-5 10 5-10 5L2 9z" />
      </svg>
    ),
  },
  {
    to: "/app/verify",
    name: "Verify",
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6l8-3z" />
      </svg>
    ),
  },
  {
    to: "/app/faucet",
    name: "Faucet",
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M12 3c3 4 5 6.5 5 9.2a5 5 0 0 1-10 0C7 9.5 9 7 12 3z" />
      </svg>
    ),
  },
  {
    to: "/app/lab",
    name: "Lab",
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M4 17l6-6-6-6M12 19h8" />
      </svg>
    ),
  },
];

export function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  const location = useLocation();
  const { risk } = useCircuitDomain();
  const navRef = useRef<HTMLElement>(null);
  const indRef = useRef<HTMLElement>(null);

  const borrowConstrained = risk?.riskState !== "SAFE";

  // Position the active sliding indicator
  useEffect(() => {
    if (!navRef.current || !indRef.current) return;
    const activeLink = navRef.current.querySelector<HTMLAnchorElement>("a.on");
    if (activeLink) {
      indRef.current.style.height = `${activeLink.offsetHeight}px`;
      indRef.current.style.transform = `translateY(${activeLink.offsetTop}px)`;
    }
  }, [location.pathname, collapsed]);

  return (
    <aside className="sb" data-collapsed={collapsed}>
      <div className="sb-top">
        <span className="meta">Platform</span>
        <button
          type="button"
          className="sb-tg"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
        >
          <svg viewBox="0 0 24 24">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <nav className="sb-nav" ref={navRef} aria-label="Platform navigation">
        <i className="sb-ind" ref={indRef} />

        {PRIMARY_LINKS.map((link) => {
          const isActive =
            link.to === "/app"
              ? location.pathname === "/app"
              : location.pathname.startsWith(link.to);
          return (
            <NavLink
              key={link.to}
              to={link.to}
              data-n={link.name}
              className={isActive ? "on" : ""}
              aria-current={isActive ? "page" : undefined}
            >
              {link.icon}
              <span>{link.name}</span>
              {link.hasFlag && borrowConstrained && <span className="flag" title="Borrowing constrained" />}
            </NavLink>
          );
        })}

        <div className="sb-sep" />

        {SECONDARY_LINKS.map((link) => {
          const isActive = location.pathname.startsWith(link.to);
          return (
            <NavLink
              key={link.to}
              to={link.to}
              data-n={link.name}
              className={isActive ? "on" : ""}
              aria-current={isActive ? "page" : undefined}
            >
              {link.icon}
              <span>{link.name}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Bottom Profile Anchor */}
      <NavLink to="/app/profile" className="sb-prof" title="Risk Posture Profile">
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
        </svg>
        <span className="pt">
          <b>Profile</b>
          <small>RISK POSTURE</small>
        </span>
      </NavLink>
    </aside>
  );
}
