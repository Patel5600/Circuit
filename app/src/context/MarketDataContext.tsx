/**
 * MarketDataContext
 *
 * Single source of truth for all market snapshot data.
 * useMarketDataService() runs ONCE here, in the persistent AppLayout provider tree.
 * Every page reads from this shared store via useMarketData() — zero duplicate polling loops.
 *
 * Before: Markets + Dashboard + Borrow each spawned an independent fetch/poll cycle.
 *         Stock switch = new instance boot + full API round trip before any data shown.
 *
 * After:  One poll loop, data already in memory when any page mounts.
 *         Stock switch = instant render from cached store.
 */

import React, { createContext, useContext } from "react";
import { useMarketDataService } from "../lib/market-data/stream";
import { MarketSnapshot } from "../lib/market-data/types";

interface MarketDataContextValue {
  snapshots: Record<string, MarketSnapshot>;
  loading: boolean;
  lastRefreshedAt: number;
  isStreamHealthy: boolean;
  refreshAllMarkets: () => Promise<void>;
}

const MarketDataContext = createContext<MarketDataContextValue | null>(null);

export function MarketDataProvider({ children }: { children: React.ReactNode }) {
  // Instantiate the real polling service exactly once.
  const service = useMarketDataService();
  return (
    <MarketDataContext.Provider value={service}>
      {children}
    </MarketDataContext.Provider>
  );
}

/**
 * useMarketData() — reads from the shared singleton store.
 * No new fetch loop is created; returns live data from the single provider instance.
 */
export function useMarketData(): MarketDataContextValue {
  const ctx = useContext(MarketDataContext);
  if (!ctx) {
    throw new Error("useMarketData must be used inside <MarketDataProvider>");
  }
  return ctx;
}
