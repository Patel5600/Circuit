/**
 * Circuit Protocol — Network Health Monitor
 *
 * Tracks per-source connection health:
 * LIVE | DEGRADED | STALE | DISCONNECTED | UNAVAILABLE
 *
 * Never shows green LIVE when data is stale.
 */

export type NetworkStatus =
  | "LIVE"
  | "DEGRADED"
  | "STALE"
  | "DISCONNECTED"
  | "UNAVAILABLE";

export interface SourceHealth {
  name: string;
  status: NetworkStatus;
  latencyMs: number | null;
  lastSuccessAt: number; // unix ms, 0 if never
  lastErrorAt: number; // unix ms, 0 if never
  lastError: string | null;
  consecutiveErrors: number;
}

export interface NetworkHealthState {
  solanaRpc: SourceHealth;
  pyth: SourceHealth;
  meteora: SourceHealth;
  circuitProgram: SourceHealth;
  overall: NetworkStatus;
}

function makeSource(name: string): SourceHealth {
  return {
    name,
    status: "UNAVAILABLE",
    latencyMs: null,
    lastSuccessAt: 0,
    lastErrorAt: 0,
    lastError: null,
    consecutiveErrors: 0,
  };
}

export function createInitialHealthState(): NetworkHealthState {
  return {
    solanaRpc: makeSource("Solana RPC"),
    pyth: makeSource("Pyth Oracle"),
    meteora: makeSource("Meteora DBC"),
    circuitProgram: makeSource("Circuit Program"),
    overall: "UNAVAILABLE",
  };
}

export function recordSuccess(
  source: SourceHealth,
  latencyMs: number
): SourceHealth {
  return {
    ...source,
    status: latencyMs > 3000 ? "DEGRADED" : "LIVE",
    latencyMs,
    lastSuccessAt: Date.now(),
    consecutiveErrors: 0,
  };
}

export function recordError(
  source: SourceHealth,
  error: string
): SourceHealth {
  const consec = source.consecutiveErrors + 1;
  return {
    ...source,
    status: consec >= 3 ? "DISCONNECTED" : "DEGRADED",
    lastErrorAt: Date.now(),
    lastError: error,
    consecutiveErrors: consec,
  };
}

export function checkStaleness(
  source: SourceHealth,
  maxAgeMs: number = 30_000
): SourceHealth {
  if (source.lastSuccessAt === 0) return source;
  const age = Date.now() - source.lastSuccessAt;
  if (age > maxAgeMs && source.status === "LIVE") {
    return { ...source, status: "STALE" };
  }
  return source;
}

export function deriveOverallStatus(
  state: NetworkHealthState
): NetworkStatus {
  const sources = [state.solanaRpc, state.pyth, state.circuitProgram];
  if (sources.every((s) => s.status === "LIVE")) return "LIVE";
  if (sources.some((s) => s.status === "DISCONNECTED")) return "DISCONNECTED";
  if (sources.some((s) => s.status === "STALE")) return "STALE";
  if (sources.some((s) => s.status === "DEGRADED")) return "DEGRADED";
  return "UNAVAILABLE";
}
