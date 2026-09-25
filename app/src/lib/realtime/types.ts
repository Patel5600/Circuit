/**
 * Circuit Protocol - Realtime Truth Architecture Types & Provenance Model
 *
 * Every authoritative state object includes explicit provenance metadata:
 * - source (e.g. "pyth-websocket", "solana-rpc", "circuit-program")
 * - observedAt (timestamp ms)
 * - slot (Solana cluster slot at observation)
 * - commitment ("processed" | "confirmed" | "finalized")
 * - freshness (age in ms)
 * - status ("LIVE" | "FRESH" | "STALE" | "LOADING" | "PENDING" | "UNAVAILABLE" | "ERROR" | "DISCONNECTED" | "UNKNOWN")
 * - version (monotonic revision)
 */

export type ProvenanceStatus =
  | "LIVE"
  | "FRESH"
  | "STALE"
  | "LOADING"
  | "PENDING"
  | "UNAVAILABLE"
  | "ERROR"
  | "DISCONNECTED"
  | "UNKNOWN";

export interface Provenance<T> {
  value: T;
  source: string;
  observedAt: number;
  slot: number | null;
  commitment: "processed" | "confirmed" | "finalized";
  freshnessMs: number;
  status: ProvenanceStatus;
  version: number;
}

export function makeProvenance<T>(
  value: T,
  source: string,
  status: ProvenanceStatus = "LIVE",
  slot: number | null = null,
  version = 1
): Provenance<T> {
  return {
    value,
    source,
    observedAt: Date.now(),
    slot,
    commitment: "confirmed",
    freshnessMs: 0,
    status,
    version,
  };
}

// ── 3. Separated Market State Domains ──

export type ReferenceMarketState = "OPEN" | "CLOSED" | "HALTED" | "UNKNOWN";
export type OnchainMarketState = "OPEN" | "CLOSED" | "ILLIQUID" | "UNKNOWN";
export type OracleState = "FRESH" | "STALE" | "INVALID" | "UNAVAILABLE";
export type CircuitRiskState = "SAFE" | "RESTRICTED" | "DEFENSIVE" | "EMERGENCY";
export type PermissionVerdict = "ALLOW" | "RESTRICT" | "BLOCK";

export interface MarketStateDomains {
  referenceMarketState: ReferenceMarketState;
  onchainMarketState: OnchainMarketState;
  oracleState: OracleState;
  circuitRiskState: CircuitRiskState;
  permissionState: PermissionVerdict;
}

// ── High-Frequency Market Slice ──

export interface LiveMarketData {
  mint: string;
  symbol: string;
  name: string;
  price: number | null;
  bid: number | null;
  ask: number | null;
  spreadBps: number | null;
  volume24h: number | null;
  priceChange24hPct: number | null;
  high24h: number | null;
  low24h: number | null;
  oraclePrice: number | null;
  oracleConfBps: number | null;
  oracleAgeSeconds: number | null;
  oraclePublishTime: number | null;
  oracleFeedId: string | null;
  domains: MarketStateDomains;
  lastUpdateSlot: number | null;
  lastUpdateTs: number;
}

// ── Position Slice ──

export interface LivePositionData {
  mint: string;
  symbol: string;
  collateralAmount: bigint;
  collateralAmountUi: number;
  collateralValueUsd: number;
  debtAmount: bigint;
  debtAmountUi: number;
  currentLtvPct: number;
  healthFactor: number | null;
  lastValidPrice: number | null;
  updatedAtSlot: number | null;
  updatedAtTs: number;
}

// ── Protocol Slice ──

export interface LiveProtocolData {
  paused: boolean;
  minHealthFactorBps: number;
  borrowFeeBps: number;
  feeEnabled: boolean;
  vaultLiquidityUsd: number;
  riskEpoch: number;
  policyVersion: string;
  lastUpdateSlot: number | null;
  lastUpdateTs: number;
}

// ── Derived Financial Calculation ──

export interface DerivedFinancialState {
  mint: string;
  symbol: string;
  collateralValueUsd: number;
  debtUsd: number;
  currentLtvPct: number;
  nominalLtvPct: number;
  effectiveLtvPct: number;
  theoreticalBorrowCapacityUsd: number;
  executableBorrowCapacityUsd: number;
  remainingCapacityUsd: number;
  healthFactor: number | null;
  riskState: CircuitRiskState;
  riskBudgetPct: number;
  permission: {
    verdict: PermissionVerdict;
    reason: string;
    borrowAllowed: boolean;
    repayAllowed: boolean;
    depositAllowed: boolean;
    withdrawAllowed: boolean;
  };
  domains: MarketStateDomains;
  calculatedAtTs: number;
}

// ── 6. Explicit Transaction State Machine ──

export type TransactionLifecycleState =
  | "IDLE"
  | "PREPARING"
  | "SIMULATING"
  | "AWAITING_SIGNATURE"
  | "SIGNED"
  | "SUBMITTED"
  | "CONFIRMING"
  | "CONFIRMED"
  | "FINALIZED"
  | "FAILED"
  | "EXPIRED";

export interface TransactionRecord {
  id: string;
  action: "DEPOSIT" | "BORROW" | "REPAY" | "WITHDRAW" | "SWAP" | "AUTHORIZE" | "REVOKE";
  assetSymbol: string;
  assetMint: string;
  amount: number;
  quoteSymbol: string;
  state: TransactionLifecycleState;
  stateLabel: string;
  signature: string | null;
  slot: number | null;
  simulatedUnits: number | null;
  error: string | null;
  errorCode: string | null;
  startedAtTs: number;
  confirmedAtTs: number | null;
}

// ── Latency & Diagnostics ──

export interface RealtimeTelemetry {
  connectionStatus: "connected" | "degraded" | "disconnected" | "reconnecting";
  activeRpcUrl: string;
  currentSlot: number | null;
  slotVelocityPerSec: number;
  eventCount: number;
  lastEventSource: string;
  lastEventSlot: number | null;
  lastEventTs: number;
  latencies: {
    eventToStoreMs: number;
    storeToDerivedMs: number;
    derivedToRenderMs: number;
    derivedToChartMs: number;
    totalPipelineLatencyMs: number;
  };
  consistencyChecks: {
    passed: boolean;
    violations: string[];
    lastCheckedTs: number;
  };
}
