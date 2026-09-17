import React, { Suspense, lazy } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";

import { AppShell } from "./components/layout/AppShell";
import { IconKeyframes } from "./components/ui/Icon";
import { Skeleton } from "./components/ui";
import { MarketProvider } from "./context/MarketContext";
import { ActionProvider } from "./context/ActionContext";
import { CircuitProtocolProvider, useCircuitDomain } from "./lib/domain/context";
import { MarketDataProvider } from "./context/MarketDataContext";
import { AssetActionDrawer } from "./components/drawers/AssetActionDrawer";
import { AutonomousSetupModal } from "./components/authority/AutonomousSetupModal";

/**
 * Route table.
 *
 * SolanaProviders, CircuitProtocolProvider, MarketProvider, and ActionProvider
 * are all mounted ONCE inside AppLayout (the parent layout route). They survive
 * navigation between /app/* pages — the Solana connection, market data polling
 * service, and domain context never restart on page switches.
 *
 * Individual pages are code-split and lazy-loaded. Only page content swaps on
 * navigation; the entire provider and shell tree stays mounted.
 */
const SolanaProviders = lazy(() => import("./providers/SolanaProviders"));

const Landing  = lazy(() => import("./pages/Landing"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Markets   = lazy(() => import("./pages/Markets"));
const Position  = lazy(() => import("./pages/Position"));
const Borrow    = lazy(() => import("./pages/Borrow"));
const Activity  = lazy(() => import("./pages/Activity"));
const Learn     = lazy(() => import("./pages/Learn"));
const Verify    = lazy(() => import("./pages/Verify"));
const Demo      = lazy(() => import("./pages/Demo"));
const Faucet    = lazy(() => import("./pages/Faucet"));
const Profile    = lazy(() => import("./pages/Profile"));
const Autonomous = lazy(() => import("./pages/Autonomous"));
const NotFound   = lazy(() => import("./pages/NotFound"));

/** Page title map — Economics entry removed; route redirects to Verify. */
const TITLES: Record<string, string> = {
  "/app":               "Dashboard",
  "/app/markets":       "Markets",
  "/app/position":      "Position",
  "/app/borrow":        "Borrow",
  "/app/profile":       "Risk Profile",
  "/app/portfolio-risk":"Portfolio Risk Intelligence",
  "/app/faucet":        "Devnet Faucet",
  "/app/activity":      "Activity",
  "/app/learn":         "How it works",
  "/learn":             "How it works",
  "/app/verify":        "Verification",
  "/app/demo":          "Interactive Demo",
  "/app/autonomous":    "Autonomous Agent",
};

function TitleSync() {
  const { pathname } = useLocation();
  React.useEffect(() => {
    const base = "circuit — Tokenized Equity Credit on Solana";
    const section = TITLES[pathname];
    document.title = section ? `${section} · circuit` : base;
  }, [pathname]);
  return null;
}

/** Skeleton shown while a lazy page chunk loads. Content-area only. */
function PageFallback() {
  return (
    <div className="container stack g-16" aria-busy="true">
      <span role="status" aria-live="polite" className="sr-only">
        Loading page
      </span>
      <Skeleton height={30} width="42%" />
      <div className="grid grid--stats">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={104} radius={14} />
        ))}
      </div>
      <Skeleton height={210} radius={14} />
    </div>
  );
}

/**
 * Minimal chrome rendered immediately while the wallet providers bootstrap.
 * Keeps the shell visible (header + sidebar structure) so the user never
 * sees a blank page during provider initialisation.
 */
function ShellFallback() {
  return (
    <div className="shell">
      <div className="appbar" />
      <main className="main">
        <PageFallback />
      </main>
    </div>
  );
}

/**
 * Single persistent layout route for all /app/* pages.
 *
 * Providers mount once here. Navigating between Dashboard, Markets, Position,
 * Borrow, Activity, Learn, Verify, Faucet, Profile does NOT remount this tree.
 * The Solana connection, market data service, and domain context remain alive.
 *
 * <Outlet /> is where page-level content swaps in/out.
 */
function GlobalAuthorityModal() {
  const { isAuthoritySetupOpen, closeAuthoritySetup } = useCircuitDomain();
  return (
    <AutonomousSetupModal
      open={isAuthoritySetupOpen}
      onClose={closeAuthoritySetup}
    />
  );
}

function AppLayout() {
  return (
    <Suspense fallback={<ShellFallback />}>
      <SolanaProviders>
        <CircuitProtocolProvider>
          <MarketProvider>
            <MarketDataProvider>
              <ActionProvider>
                <AppShell>
                  <Suspense fallback={<PageFallback />}>
                    <Outlet />
                  </Suspense>
                </AppShell>
                <AssetActionDrawer />
                <GlobalAuthorityModal />
              </ActionProvider>
            </MarketDataProvider>
          </MarketProvider>
        </CircuitProtocolProvider>
      </SolanaProviders>
    </Suspense>
  );
}

export default function App() {
  return (
    <>
      <IconKeyframes />
      <TitleSync />
      <Routes>
        {/* Public landing page — providers never downloaded unless navigating to /app */}
        <Route
          path="/"
          element={
            <Suspense fallback={<PageFallback />}>
              <Landing />
            </Suspense>
          }
        />

        {/* Standalone /learn accessible without full app context */}
        <Route
          path="/learn"
          element={
            <Suspense fallback={<ShellFallback />}>
              <SolanaProviders>
                <CircuitProtocolProvider>
                  <MarketProvider>
                    <ActionProvider>
                      <AppShell>
                        <Suspense fallback={<PageFallback />}>
                          <Learn />
                        </Suspense>
                      </AppShell>
                    </ActionProvider>
                  </MarketProvider>
                </CircuitProtocolProvider>
              </SolanaProviders>
            </Suspense>
          }
        />

        {/*
         * Single persistent layout: providers mount once, pages swap via Outlet.
         * This is the core fix for slow navigation and stock-switching latency.
         */}
        <Route element={<AppLayout />}>
          <Route path="/app"               element={<Dashboard />} />
          <Route path="/app/markets"        element={<Markets />} />
          <Route path="/app/position"       element={<Position />} />
          <Route path="/app/borrow"         element={<Borrow />} />
          <Route path="/app/profile"        element={<Profile />} />
          <Route path="/app/portfolio-risk" element={<Profile />} />
          <Route path="/app/faucet"         element={<Faucet />} />
          <Route path="/app/activity"       element={<Activity />} />
          <Route path="/app/learn"          element={<Learn />} />
          <Route path="/app/verify"         element={<Verify />} />
          <Route path="/app/demo"           element={<Demo />} />
          <Route path="/app/autonomous"     element={<Autonomous />} />

          {/* /app/economics → redirect to Verify (contains treasury section inline) */}
          <Route path="/app/economics" element={<Navigate to="/app/verify" replace />} />
        </Route>

        <Route
          path="*"
          element={
            <Suspense fallback={<PageFallback />}>
              <NotFound />
            </Suspense>
          }
        />
      </Routes>
    </>
  );
}
