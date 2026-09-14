import { PublicKey } from "@solana/web3.js";

/**
 * 4 Independent Semantic Market Dimensions
 */
export type UnderlyingSession = "REGULAR" | "PRE_MARKET" | "POST_MARKET" | "OVERNIGHT" | "CLOSED";
export type OracleStatus = "LIVE" | "RECENT" | "STALE" | "UNAVAILABLE";
export type OnchainMarketState = "OPEN" | "TRADEABLE" | "NO_LIQUIDITY" | "UNAVAILABLE" | "UNKNOWN";
export type CollateralStatus = "AVAILABLE" | "COMING_SOON" | "UNSUPPORTED";

/**
 * Legacy aliases for backwards compatibility
 */
export type DataFreshness = OracleStatus;
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
 * Normalized High-Resolution Market Snapshot
 */
export interface MarketSnapshot {
  assetId: string;
  symbol: string;
  displaySymbol: string;
  name: string;
  
  // Real Price Data
  priceUsd: number | null;
  previousPriceUsd?: number | null;
  priceDirection?: "UP" | "DOWN" | "FLAT";
  lastPriceUpdatedAt: number; // unix timestamp ms
  
  // 1. Oracle State
  oracleStatus: OracleStatus;
  oracleTimestamp: number; // unix seconds
  oracleConfidenceUsd: number;
  oracleConfBps: number; // e.g. 18 bps = 0.18% of price
  
  // 2. Underlying Equity Session
  underlyingSession: UnderlyingSession;
  sessionDescription?: string;
  
  // 3. On-chain Secondary Token Market State
  onchainAvailability: OnchainMarketState;
  
  // 4. Collateral Status
  collateralStatus: CollateralStatus;
  
  // 24h Movement & Intraday High/Low
  referencePrice24h: number | null;
  change24hUsd: number | null;
  change24hPercent: number | null;
  changeStatus: "AVAILABLE" | "UNAVAILABLE" | "available" | "unavailable";
  dayHighUsd: number | null;
  dayLowUsd: number | null;
  sparkline: number[]; // real intraday points
  
  // Protocol Metadata
  marketDataSource: string;
  baseLtvBps: number;
  liqThresholdBps: number;
  liqBonusBps?: number;
  quoteSymbol: string;
  quoteMint?: string;
  mint?: string;
  pythFeedId?: string;
  pythPriceAccount?: PublicKey | null;
  category: string;
  isLiveMarket: boolean;
}

/**
 * MarketQuote for compatibility with existing modules
 */
export interface MarketQuote {
  symbol: string;
  name: string;
  priceUsd: number;
  confidenceUsd: number;
  confBps: number;
  exponent: number;
  publishTime: number;
  ageSeconds: number;
  freshness: DataFreshness;
  
  referencePrice24h: number | null;
  change24hUsd: number | null;
  change24hPercent: number | null;
  changeStatus: "AVAILABLE" | "UNAVAILABLE";

  sessionState: MarketSessionState;
  marketOpen: boolean;
  pythFeedIdHex: string;
  pythPriceAccount?: PublicKey;
  
  isCollateralConfigured: boolean;
  mint?: string;
  baseLtvBps?: number;
  liqThresholdBps?: number;
}
