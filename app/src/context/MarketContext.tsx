import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  DEPLOYED_MARKETS,
  DeployedMarket,
  MARKETS_DATA,
  MarketMetadata,
  getDeployedMarket,
} from "../data/markets";

interface MarketContextValue {
  markets: DeployedMarket[];
  selectedMarket: DeployedMarket;
  selectedMeta: MarketMetadata | undefined;
  quoteSymbols: string[];
  selectMarket: (symbol: string, quoteSymbol?: string) => void;
  setMarket: (market: DeployedMarket) => void;
}

const MarketContext = createContext<MarketContextValue | null>(null);

const STORAGE_KEY = "circuit_active_market_symbol";
const STORAGE_QUOTE_KEY = "circuit_active_market_quote";

export function MarketProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();

  // Distinct quote symbols available across markets (e.g. USDC, WSOL)
  const quoteSymbols = useMemo(() => {
    const set = new Set<string>();
    for (const m of DEPLOYED_MARKETS) {
      if (m.quoteSymbol) set.add(m.quoteSymbol);
    }
    return Array.from(set);
  }, []);

  // Determine initial market: URL search param > localStorage > default (NVDA/USDC)
  const [selectedMarket, setSelectedMarket] = useState<DeployedMarket>(() => {
    const params = new URLSearchParams(window.location.search);
    const paramSymbol = params.get("market");
    const paramQuote = params.get("quote");

    if (paramSymbol) {
      const found = getDeployedMarket(paramSymbol, paramQuote ?? undefined);
      if (found) return found;
    }

    try {
      const savedSymbol = localStorage.getItem(STORAGE_KEY);
      const savedQuote = localStorage.getItem(STORAGE_QUOTE_KEY);
      if (savedSymbol) {
        const found = getDeployedMarket(savedSymbol, savedQuote ?? undefined);
        if (found) return found;
      }
    } catch {
      // ignore localStorage errors in sandboxed environments
    }

    return DEPLOYED_MARKETS[0];
  });

  // Keep state in sync if URL query parameter changes
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const paramSymbol = params.get("market");
    const paramQuote = params.get("quote");
    if (paramSymbol) {
      const found = getDeployedMarket(paramSymbol, paramQuote ?? undefined);
      if (found && (found.symbol !== selectedMarket.symbol || found.quoteSymbol !== selectedMarket.quoteSymbol)) {
        setSelectedMarket(found);
      }
    }
  }, [location.search, selectedMarket]);

  const selectMarket = (symbol: string, quoteSymbol?: string) => {
    const match = getDeployedMarket(symbol, quoteSymbol);
    if (!match) return;

    setSelectedMarket(match);
    try {
      localStorage.setItem(STORAGE_KEY, match.symbol);
      localStorage.setItem(STORAGE_QUOTE_KEY, match.quoteSymbol);
    } catch {
      // ignore
    }

    // Update current URL query parameter smoothly if on an app route
    const params = new URLSearchParams(location.search);
    params.set("market", match.symbol);
    if (match.quoteSymbol !== "USDC") {
      params.set("quote", match.quoteSymbol);
    } else {
      params.delete("quote");
    }
    const newSearch = params.toString();
    const newPath = `${location.pathname}${newSearch ? `?${newSearch}` : ""}`;
    navigate(newPath, { replace: true });
  };

  const setMarket = (market: DeployedMarket) => {
    selectMarket(market.symbol, market.quoteSymbol);
  };

  const selectedMeta = useMemo(() => {
    return MARKETS_DATA.find(
      (m) => m.symbol === selectedMarket.symbol && (!m.quoteSymbol || m.quoteSymbol === selectedMarket.quoteSymbol)
    ) ?? MARKETS_DATA.find((m) => m.symbol === selectedMarket.symbol);
  }, [selectedMarket]);

  const value = useMemo<MarketContextValue>(
    () => ({
      markets: DEPLOYED_MARKETS,
      selectedMarket,
      selectedMeta,
      quoteSymbols,
      selectMarket,
      setMarket,
    }),
    [selectedMarket, selectedMeta, quoteSymbols]
  );

  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>;
}

export function useMarket(): MarketContextValue {
  const ctx = useContext(MarketContext);
  if (!ctx) {
    // Fallback if rendered outside provider
    const fallbackMarket = DEPLOYED_MARKETS[0];
    return {
      markets: DEPLOYED_MARKETS,
      selectedMarket: fallbackMarket,
      selectedMeta: MARKETS_DATA[0],
      quoteSymbols: ["USDC", "WSOL"],
      selectMarket: () => {},
      setMarket: () => {},
    };
  }
  return ctx;
}
