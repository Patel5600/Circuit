import React, { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";

import { Icon, IconName } from "../ui";
import { ToastProvider } from "../ui/Toaster";
import { useInkButtons } from "../../hooks/useInkButtons";

import { CommandBar } from "./CommandBar";
import { RealtimeStrip } from "./RealtimeStrip";
import { Sidebar } from "./Sidebar";
import { CommandPalette } from "./CommandPalette";
import { TruthCheckPanel } from "../dev/TruthCheckPanel";

/** Primary destinations for mobile bottom bar */
const PRIMARY_MOBILE: { to: string; label: string; icon: IconName }[] = [
  { to: "/app", label: "Dashboard", icon: "dashboard" },
  { to: "/app/markets", label: "Markets", icon: "markets" },
  { to: "/app/position", label: "Position", icon: "position" },
  { to: "/app/borrow", label: "Borrow", icon: "borrow" },
  { to: "/app/activity", label: "Activity", icon: "activity" },
];

function MobileNav() {
  return (
    <nav className="bottomnav" aria-label="Mobile Navigation">
      {PRIMARY_MOBILE.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/app"}
          className="bottomnav__item"
        >
          <Icon name={item.icon} size={19} />
          {item.label}
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
    <div
      className={`container${narrow ? " container--narrow" : ""}`}
      style={{
        maxWidth: 1280,
        margin: "0 auto",
        padding: "0 clamp(16px, 2.5vw, 24px)",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      {(title || action) && (
        <div className="pagehead row between g-16 wrap" style={{ marginBottom: 20 }}>
          <div>
            {title && <h1 className="pagehead__title" style={{ fontWeight: 400, fontSize: "clamp(26px, 3.5vw, 36px)", letterSpacing: "-0.035em" }}>{title}</h1>}
            {subtitle && <p className="pagehead__sub" style={{ color: "var(--mute)", fontSize: 14 }}>{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
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

  const [commandOpen, setCommandOpen] = useState<boolean>(false);

  // Ink micro-interactions
  useInkButtons();

  // Reset scroll on navigation
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
      <div className="shell" style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg)", color: "var(--ink)" }}>
        <a className="skip-link" href="#main">
          Skip to content
        </a>

        {/* Top Shell: Sticky Command Bar + Realtime Status Strip */}
        <div className="shell__top">
          <header className="shell__header">
            <CommandBar onOpenCommand={() => setCommandOpen(true)} />
          </header>
          <div className="shell__realtime">
            <RealtimeStrip />
          </div>
        </div>

        {/* 3. Product Body: Sidebar + Main Canvas */}
        <div
          className={`shell__body ${collapsed ? "shell__body--collapsed" : ""}`}
          style={{ display: "flex", flex: 1, minHeight: 0, position: "relative" }}
        >
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
                    flex: 1,
                  }
                : {
                    flex: 1,
                    minWidth: 0,
                    padding: "24px clamp(16px, 2.5vw, 24px) 80px",
                    overflowY: "auto",
                  }
            }
          >
            {children}
          </main>
        </div>

        {!isAutonomous && <MobileNav />}

        <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
        <TruthCheckPanel />
      </div>
    </ToastProvider>
  );
}
