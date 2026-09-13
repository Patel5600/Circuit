import React, { Suspense, lazy } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { AppShell } from "./components/layout/AppShell";
import { IconKeyframes } from "./components/ui/Icon";
import { Skeleton } from "./components/ui";
import { MarketProvider } from "./context/MarketContext";

/**
 * Route table.
 *
 * The landing page and each app page are split so the initial visit does not
 * pay for the whole application. The wallet and Solana providers live above this
 * in main.tsx, which keeps a single connection for the entire app.
 */
const SolanaProviders = lazy(() => import("./providers/SolanaProviders"));

const Landing = lazy(() => import("./pages/Landing"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Markets = lazy(() => import("./pages/Markets"));
const Position = lazy(() => import("./pages/Position"));
const Borrow = lazy(() => import("./pages/Borrow"));
const Activity = lazy(() => import("./pages/Activity"));
const Learn = lazy(() => import("./pages/Learn"));
const Verify = lazy(() => import("./pages/Verify"));
const Demo = lazy(() => import("./pages/Demo"));
const Profile = lazy(() => import("./pages/Profile"));
const NotFound = lazy(() => import("./pages/NotFound"));

/** Announce route changes so the page title stays meaningful. */
const TITLES: Record<string, string> = {
  "/app": "Dashboard",
  "/app/markets": "Markets",
  "/app/position": "Position",
  "/app/borrow": "Borrow",
  "/app/profile": "Risk Profile",
  "/app/activity": "Activity",
  "/app/learn": "How it works",
  "/app/verify": "Verification",
  "/app/demo": "Interactive Demo",
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
 * Wraps an app page in the wallet providers and the shell. The providers are
 * lazy so the landing page never downloads them.
 */
function AppRoute({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <SolanaProviders>
        <MarketProvider>
          <AppShell>
            <Suspense fallback={<PageFallback />}>{children}</Suspense>
          </AppShell>
        </MarketProvider>
      </SolanaProviders>
    </Suspense>
  );
}

/** Minimal chrome shown while the wallet providers load. */
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

export default function App() {
  return (
    <>
      <IconKeyframes />
      <TitleSync />
      <Routes>
        <Route
          path="/"
          element={
            <Suspense fallback={<PageFallback />}>
              <Landing />
            </Suspense>
          }
        />

        <Route path="/app" element={<AppRoute><Dashboard /></AppRoute>} />
        <Route path="/app/markets" element={<AppRoute><Markets /></AppRoute>} />
        <Route path="/app/position" element={<AppRoute><Position /></AppRoute>} />
        <Route path="/app/borrow" element={<AppRoute><Borrow /></AppRoute>} />
        <Route path="/app/profile" element={<AppRoute><Profile /></AppRoute>} />
        <Route path="/app/activity" element={<AppRoute><Activity /></AppRoute>} />
        <Route path="/app/learn" element={<AppRoute><Learn /></AppRoute>} />
        <Route path="/app/verify" element={<AppRoute><Verify /></AppRoute>} />

        <Route path="/app/demo" element={<AppRoute><Demo /></AppRoute>} />

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
