import React, { Suspense, lazy } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";

import { AppShell } from "./components/layout/AppShell";
import { ErrorBoundary } from "./components/layout/ErrorBoundary";
import { IconKeyframes } from "./components/ui/Icon";
import { Skeleton, InkBarProvider, useInkBar, InkRouteTracker } from "./components/ui";
import { MarketProvider } from "./context/MarketContext";
import { ActionProvider } from "./context/ActionContext";
import { CircuitProtocolProvider, useCircuitDomain } from "./lib/domain/context";
import { MarketDataProvider } from "./context/MarketDataContext";
import { DbcProvider } from "./context/DbcContext";
import { AssetActionDrawer } from "./components/drawers/AssetActionDrawer";
import { ThemeProvider } from "./context/ThemeContext";
import { DecisionInspector } from "./components/dev/DecisionInspector";


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
const Lab        = lazy(() => import("./pages/Lab"));
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
  "/app/autonomous":    "Agent",
  "/app/lab":           "Adversarial Lab",
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
  const { start, finish } = useInkBar();
  React.useEffect(() => {
    start();
    return () => {
      finish();
    };
  }, [start, finish]);

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
 * Single persistent layout for all manual /app/* pages.
 * Providers mount once. AppShell provides sidebar + header.
 */
function AppLayout() {
  return (
    <Suspense fallback={<ShellFallback />}>
      <SolanaProviders>
        <MarketProvider>
          <MarketDataProvider>
            <CircuitProtocolProvider>
              <DbcProvider>
                <ActionProvider>
                  <AppShell>
                    <ErrorBoundary section>
                      <Suspense fallback={<PageFallback />}>
                        <Outlet />
                      </Suspense>
                    </ErrorBoundary>
                  </AppShell>
                  <AssetActionDrawer />
                  <DecisionInspector />
                </ActionProvider>
              </DbcProvider>
            </CircuitProtocolProvider>
          </MarketDataProvider>
        </MarketProvider>
      </SolanaProviders>
    </Suspense>
  );
}

export default function App() {
  return (
    <>
      <IconKeyframes />
      <TitleSync />
      <ThemeProvider>
        <InkBarProvider>
          <InkRouteTracker />
          <Routes>
            {/* Public landing page — Ultra-lightweight, 60fps Format presentation */}
            <Route
              path="/"
              element={
                <Suspense fallback={<PageFallback />}>
                  <Landing />
                </Suspense>
              }
            />

            {/* Standalone /learn */}
            <Route
              path="/learn"
              element={
                <Suspense fallback={<ShellFallback />}>
                  <SolanaProviders>
                    <MarketProvider>
                      <MarketDataProvider>
                        <CircuitProtocolProvider>
                          <ActionProvider>
                            <AppShell>
                              <Suspense fallback={<PageFallback />}>
                                <Learn />
                              </Suspense>
                            </AppShell>
                          </ActionProvider>
                        </CircuitProtocolProvider>
                      </MarketDataProvider>
                    </MarketProvider>
                  </SolanaProviders>
                </Suspense>
              }
            />

            {/*
             * App routes — all wrapped in AppLayout.
             * AppShell automatically hides sidebar on /app/autonomous for full-screen agent workspace,
             * while keeping the top Header for seamless switching between MANUAL and AUTONOMOUS modes.
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
              <Route path="/app/lab"            element={<Lab />} />
              <Route path="/app/economics"      element={<Navigate to="/app/verify" replace />} />
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
        </InkBarProvider>
      </ThemeProvider>
    </>
  );
}
