import { HistoricalReference } from "./types";

interface CacheEntry {
  ref: HistoricalReference;
  cachedAt: number; // ms
}

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes cache
const referenceCache = new Map<string, CacheEntry>();

/**
 * Normalizes symbols for market data lookups (e.g. NVDA, AAPL, SPY).
 */
function cleanSymbol(symbol: string): string {
  return symbol.toUpperCase().replace("X", "").replace("-SOL", "");
}

/**
 * Fetches the real 24-hour reference price for a given stock symbol.
 * Uses official historical close or previous session settlement.
 * If data is unavailable, strictly returns status: "UNAVAILABLE" (never fabricated).
 */
export async function fetchHistoricalReference(symbol: string): Promise<HistoricalReference> {
  const normSymbol = cleanSymbol(symbol);
  
  // 1. Check in-memory cache
  const cached = referenceCache.get(normSymbol);
  const now = Date.now();
  if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
    return cached.ref;
  }

  // 2. Fetch from market data chart API
  try {
    // Yahoo Finance public chart endpoint provides authoritative prior session close
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(normSymbol)}?interval=1d&range=5d`;
    
    // Use timeout to prevent hanging UI
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`Market provider returned HTTP ${res.status}`);
    }

    const data: any = await res.json();
    const result = data?.chart?.result?.[0];
    const meta = result?.meta;
    
    const previousClose = meta?.chartPreviousClose ?? meta?.previousClose;
    const previousTimestamp = meta?.regularMarketTime ?? Math.floor(now / 1000) - 86400;

    if (typeof previousClose === "number" && previousClose > 0) {
      const ref: HistoricalReference = {
        symbol: normSymbol,
        referencePriceUsd: previousClose,
        referenceTimestamp: previousTimestamp,
        source: "Market Close Reference",
        status: "AVAILABLE",
      };
      referenceCache.set(normSymbol, { ref, cachedAt: now });
      return ref;
    }

    throw new Error("No previous close price in response");
  } catch (err: any) {
    // Graceful explicit failure — no random or synthetic fallback
    const ref: HistoricalReference = {
      symbol: normSymbol,
      referencePriceUsd: null,
      referenceTimestamp: null,
      source: "Market Provider",
      status: "UNAVAILABLE",
      reason: "24h change unavailable",
    };
    // Cache negative result for 3 minutes to prevent rapid retry storms
    referenceCache.set(normSymbol, { ref, cachedAt: now - CACHE_TTL_MS + 3 * 60 * 1000 });
    return ref;
  }
}

/**
 * Calculates true 24h change and percentage from live price and historical reference.
 */
export function calculate24hChange(
  currentPriceUsd: number,
  ref: HistoricalReference
): {
  change24hUsd: number | null;
  change24hPercent: number | null;
  status: "AVAILABLE" | "UNAVAILABLE";
} {
  if (ref.status !== "AVAILABLE" || ref.referencePriceUsd === null || ref.referencePriceUsd <= 0) {
    return {
      change24hUsd: null,
      change24hPercent: null,
      status: "UNAVAILABLE",
    };
  }

  const changeUsd = currentPriceUsd - ref.referencePriceUsd;
  const changePercent = (changeUsd / ref.referencePriceUsd) * 100;

  return {
    change24hUsd: changeUsd,
    change24hPercent: changePercent,
    status: "AVAILABLE",
  };
}
