/**
 * Circuit Protocol - Canonical Domain State Model
 *
 * Defines the authoritative domain types, freshness metadata, and unified
 * lifecycle states consumed across all product screens.
 */

import { Position } from "../portfolio/provider";
import { DeployedMarket } from "../../data/markets";

export type DataFreshness = "LIVE" | "RECENT" | "STALE" | "SYNCING" | "ERROR";

export interface FreshnessMeta {
  updatedAt: number;
  source: string;
  freshness: DataFreshness;
  error: string | null;
}

export type WalletStatus =
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "RECONNECTING"
  | "WRONG_NETWORK"
  | "WALLET_LOCKED"
  | "TX_SIGNING"
  | "TX_CONFIRMING"
  | "RPC_DEGRADED";

export interface WalletDomainState {
  address: string | null;
  cluster: string;
  isDevnet: boolean;
  status: WalletStatus;
  solBalanceLamports: bigint;
  solBalanceUi: number;
  tokenBalances: Record<string, bigint>;
  freshness: FreshnessMeta;
}

export interface ProtocolDomainState {
  isFrozen: boolean;
  minHealthFactorBps: number;
  authority: string | null;
  freshness: FreshnessMeta;
}

export interface NormalizedMarketPrice {
  price: number;
  conf: number;
  confBps: number;
  publishTime: number;
  referencePrice: number | null;
  change24hPct: number | null;
  change24hStatus: "AVAILABLE" | "UNAVAILABLE";
  freshness: DataFreshness;
}

export interface MarketDomainState {
  markets: Record<string, DeployedMarket & { priceData?: NormalizedMarketPrice }>;
  activeMarketKey: string;
  freshness: FreshnessMeta;
}

export interface PortfolioDomainState {
  positions: Position[];
  totalCollateralUsd: number;
  totalDebtUsd: number;
  borrowCapacityUsd: number;
  healthFactor: number | null;
  effectiveLtvBps: number;
  weightedBaseLtvBps: number;
  cMax: number;
  cMaxPenaltyBps: number;
  hasPositions: boolean;
  freshness: FreshnessMeta;
}

export type RiskRatchetState = "SAFE" | "RESTRICTED" | "DEFENSIVE" | "EMERGENCY";

export interface RiskDomainState {
  ratchetState: RiskRatchetState;
  maxConfSpreadBps: number;
  isStaleOracle: boolean;
  isMarketOpen: boolean;
  freshness: FreshnessMeta;
}

export type OperationPermission = "ALLOWED" | "RESTRICTED" | "BLOCKED" | "INACTIVE";

export interface PermissionDetail {
  status: OperationPermission;
  reason?: string;
}

export interface CreditDomainState {
  permissions: {
    borrow: PermissionDetail;
    withdraw: PermissionDetail;
    repay: PermissionDetail;
    deposit: PermissionDetail;
    liquidate: PermissionDetail;
  };
  availableCreditUsd: number;
  creditUtilizationPct: number;
  freshness: FreshnessMeta;
}

export type ActivityActionType =
  | "DEPOSIT"
  | "WITHDRAW"
  | "BORROW"
  | "REPAY"
  | "LIQUIDATION"
  | "RISK_STATE_CHANGE"
  | "RECOVERY"
  | "FAUCET_CLAIM"
  | "WALLET_CONNECTION"
  | "PROGRAM_INTERACTION";

export interface ActivityEvent {
  id: string;
  type: ActivityActionType;
  action: string;
  assetSymbol: string;
  assetMint?: string;
  amountNative: bigint | null;
  amountUi: number | null;
  status: "CONFIRMED" | "FAILED" | "PENDING";
  timestamp: number;
  signature: string | null;
  wallet: string;
  riskStateAtAction?: RiskRatchetState;
  logSummary?: string;
}

export interface DetectedPattern {
  id: string;
  name: string;
  severity: "info" | "warning" | "critical";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  evidence: string[];
  timeWindow: string;
  affectedAssets: string[];
  explanation: string;
  firstSeen: number;
  lastSeen: number;
}

export interface ActivityDomainState {
  events: ActivityEvent[];
  patterns: DetectedPattern[];
  freshness: FreshnessMeta;
}

export type SystemHealthStatus =
  | "SYSTEM_HEALTHY"
  | "MARKET_DATA_DEGRADED"
  | "RPC_DEGRADED"
  | "ORACLE_STALE"
  | "DEVNET_SYNCING";

export interface SystemHealthState {
  status: SystemHealthStatus;
  rpcLatencyMs: number;
  slot: number;
  lastHeartbeat: number;
  rpcEndpoint: string;
  isOnline: boolean;
}

export interface InvalidationScope {
  portfolio?: boolean;
  protocol?: boolean;
  markets?: boolean;
  wallet?: boolean;
  activity?: boolean;
}
