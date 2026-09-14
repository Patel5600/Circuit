import { PublicKey } from "@solana/web3.js";

/**
 * Data Freshness classification
 */
export type DataFreshness = "LIVE" | "RECENT" | "STALE" | "UNAVAILABLE";

/**
 * Market Session classification
 */
export type MarketSessionState = "REGULAR" | "PRE_MARKET" | "AFTER_HOURS" | "CLOSED" | "WEEKEND" | "HOLIDAY";

/**
 * Historical 24h Reference Data Point
 */
export interface HistoricalReference {
  symbol: string;
  referencePriceUsd: number | null;
  referenceTimestamp: number | null; // unix seconds
  source: string;
  status: "AVAILABLE" | "UNAVAILABLE";
  reason?: string;
}

/**
 * Real-time Market Quote
 */
export interface MarketQuote {
  symbol: string;
  name: string;
  priceUsd: number;
  confidenceUsd: number;
  confBps: number; // confidence as basis points of price (e.g. 18 bps = 0.18%)
  exponent: number;
  publishTime: number; // unix seconds
  ageSeconds: number;
  freshness: DataFreshness;
  
  // Real 24h metrics
  referencePrice24h: number | null;
  change24hUsd: number | null;
  change24hPercent: number | null;
  changeStatus: "AVAILABLE" | "UNAVAILABLE";

  // Session & Protocol
  sessionState: MarketSessionState;
  marketOpen: boolean;
  pythFeedIdHex: string;
  pythPriceAccount?: PublicKey;
  
  // Collateral availability
  isCollateralConfigured: boolean;
  mint?: string;
  baseLtvBps?: number;
  liqThresholdBps?: number;
}
