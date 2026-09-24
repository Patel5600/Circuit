import { PublicKey } from "@solana/web3.js";

/**
 * 4 Canonical Independent Semantic Domains:
 * REFERENCE_MARKET ≠ ONCHAIN_MARKET ≠ ORACLE_STATE ≠ CIRCUIT_POLICY
 */
export type ReferenceMarketState = "OPEN" | "CLOSED" | "HALTED" | "UNKNOWN";
export type OnchainMarketState = "OPEN" | "CLOSED" | "ILLIQUID" | "UNKNOWN" | "TRADEABLE" | "NO_LIQUIDITY" | "UNAVAILABLE";
export type OracleState = "FRESH" | "STALE" | "INVALID" | "UNAVAILABLE";
export type CircuitPermissionState = "SAFE" | "RESTRICTED" | "DEFENSIVE" | "EMERGENCY" | "BLOCKED";

export type UnderlyingSession = "REGULAR" | "PRE_MARKET" | "POST_MARKET" | "OVERNIGHT" | "CLOSED";
export type OracleStatus = "LIVE" | "RECENT" | "STALE" | "UNAVAILABLE";
/**
 * MarketGuard Risk State (Circuit on-chain policy layer).
 * INVARIANT: MarketGuard is NEVER "CLOSED". If reference market is closed, MarketGuard is RESTRICTED or SAFE.
 */
export type MarketSecurityState = "SAFE" | "RESTRICTED" | "DEFENSIVE" | "EMERGENCY" | "NORMAL" | "HALTED_INFERRED" | "ORACLE_UNAVAILABLE" | "UNKNOWN";
export type CollateralStatus = "AVAILABLE" | "COMING_SOON" | "UNSUPPORTED";
export type CreditPermissionStatus = "AVAILABLE" | "RESTRICTED" | "BLOCKED";

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
 * Single real observation point in rolling history
 */
export interface HistoricalPoint {
  timestamp: number; // unix ms
  price: number;
}

/**
 * Standard Financial OHLC Candlestick Observation
 */
export interface Candle {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
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
  
  // 4 Canonical Independent State Domains
  referenceMarketState: ReferenceMarketState;
  onchainMarketState: OnchainMarketState;
  oracleState: OracleState;
  circuitRiskState: CircuitPermissionState;

  // Preserved Truthful Oracle Observation
  lastValidPrice: number | null;
  lastValidPublishTime: number | null;
  oracleAgeSeconds: number | null;

  // 2. Underlying Equity Session
  underlyingSession: UnderlyingSession;
  sessionDescription?: string;
  
  // 3. On-chain Secondary Token Market State
  onchainAvailability: OnchainMarketState;
  
  // 4. Collateral Status
  collateralStatus: CollateralStatus;

  // 5. Market Security / Halt State (Deterministic MarketGuard inference)
  securityState: MarketSecurityState;
  haltReason?: string;
  
  // 24h Movement & Intraday High/Low
  referencePrice24h: number | null;
  change24hUsd: number | null;
  change24hPercent: number | null;
  changeStatus: "AVAILABLE" | "UNAVAILABLE" | "available" | "unavailable";
  dayHighUsd: number | null;
  dayLowUsd: number | null;
  sparkline: number[]; // real intraday points
  history?: HistoricalPoint[]; // rolling historical series of actual observations
  candles?: Candle[]; // institutional OHLC candlestick observations
  
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
