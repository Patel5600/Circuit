/**
 * Circuit Protocol - Normalized Realtime Store
 *
 * Implements isolated, granular stores with full provenance metadata:
 * - marketStore (High-frequency price & oracle stream)
 * - positionStore (Collateral & debt positions)
 * - protocolStore (Risk ratchet, policies, vaults)
 * - transactionStore (11-stage explicit transaction state machine)
 * - telemetryStore (Latency & invariant consistency checks)
 *
 * Each slice is independently observable via useSyncExternalStore selectors.
 * A price tick in NVDAx does NOT notify or rerender sidebar, wallet, or other positions.
 */

import { useSyncExternalStore, useMemo } from "react";
import {
  Provenance,
  makeProvenance,
  ProvenanceStatus,
  LiveMarketData,
  LivePositionData,
  LiveProtocolData,
  TransactionRecord,
  RealtimeTelemetry,
  MarketStateDomains,
  CircuitRiskState,
} from "./types";
import { realtimeConnection } from "./connection-manager";
import { DEPLOYED_MARKETS } from "../../data/markets-registry";

// ── Default Provenance Slices ──

export function defaultMarketData(mint: string, symbol: string = ""): LiveMarketData {
  return {
    mint,
    symbol,
    name: symbol,
    price: null,
    bid: null,
    ask: null,
    spreadBps: null,
    volume24h: null,
    priceChange24hPct: null,
    high24h: null,
    low24h: null,
    oraclePrice: null,
    oracleConfBps: null,
    oracleAgeSeconds: null,
    oraclePublishTime: null,
    oracleFeedId: null,
    domains: {
      referenceMarketState: "UNKNOWN",
      onchainMarketState: "OPEN",
      oracleState: "UNAVAILABLE",
      circuitRiskState: "SAFE",
      permissionState: "ALLOW",
    },
    lastUpdateSlot: null,
    lastUpdateTs: 0,
  };
}

export function defaultPositionData(mint: string, symbol: string = ""): LivePositionData {
  return {
    mint,
    symbol,
    collateralAmount: 0n,
    collateralAmountUi: 0,
    collateralValueUsd: 0,
    debtAmount: 0n,
    debtAmountUi: 0,
    currentLtvPct: 0,
    healthFactor: null,
    lastValidPrice: null,
    updatedAtSlot: null,
    updatedAtTs: 0,
  };
}

export const defaultProtocolData: LiveProtocolData = {
  paused: false,
  minHealthFactorBps: 10000,
  borrowFeeBps: 25,
  feeEnabled: true,
  vaultLiquidityUsd: 0,
  riskEpoch: 1,
  policyVersion: "v1.0.0-canonical",
  lastUpdateSlot: null,
  lastUpdateTs: 0,
};

export const defaultTelemetry: RealtimeTelemetry = {
  connectionStatus: "disconnected",
  activeRpcUrl: "",
  currentSlot: null,
  slotVelocityPerSec: 2.5,
  eventCount: 0,
  lastEventSource: "system-init",
  lastEventSlot: null,
  lastEventTs: Date.now(),
  latencies: {
    eventToStoreMs: 0,
    storeToDerivedMs: 0,
    derivedToRenderMs: 0,
    derivedToChartMs: 0,
    totalPipelineLatencyMs: 0,
  },
  consistencyChecks: {
    passed: true,
    violations: [],
    lastCheckedTs: Date.now(),
  },
};

// ── Canonical Normalized Store Class ──

export class NormalizedRealtimeStore {
  private static _instance: NormalizedRealtimeStore | null = null;

  public static getInstance(): NormalizedRealtimeStore {
    if (!NormalizedRealtimeStore._instance) {
      NormalizedRealtimeStore._instance = new NormalizedRealtimeStore();
    }
    return NormalizedRealtimeStore._instance;
  }

  // Slices
  private _marketSlices: Map<string, Provenance<LiveMarketData>> = new Map();
  private _positionSlices: Map<string, Provenance<LivePositionData>> = new Map();
  private _protocolSlice: Provenance<LiveProtocolData> = makeProvenance(
    defaultProtocolData,
    "circuit-protocol-config",
    "LOADING"
  );
  private _transactions: Map<string, Provenance<TransactionRecord>> = new Map();
  private _telemetry: Provenance<RealtimeTelemetry> = makeProvenance(
    defaultTelemetry,
    "system-telemetry",
    "LIVE"
  );

  // Cached array snapshots for stable useSyncExternalStore references
  private _cachedAllMarkets: Provenance<LiveMarketData>[] = [];
  private _cachedAllPositions: Provenance<LivePositionData>[] = [];
  private _cachedAllTransactions: Provenance<TransactionRecord>[] = [];

  // Fallback cache for unseeded lookups so getMarket/getPosition remain strictly pure
  private _fallbackMarkets: Map<string, Provenance<LiveMarketData>> = new Map();
  private _fallbackPositions: Map<string, Provenance<LivePositionData>> = new Map();
  private _telemetryTimer: any = null;

  // Granular Listeners
  private _marketListeners: Map<string, Set<() => void>> = new Map();
  private _allMarketsListeners: Set<() => void> = new Set();
  private _positionListeners: Map<string, Set<() => void>> = new Map();
  private _allPositionsListeners: Set<() => void> = new Set();
  private _protocolListeners: Set<() => void> = new Set();
  private _transactionListeners: Set<() => void> = new Set();
  private _telemetryListeners: Set<() => void> = new Set();

  constructor() {
    // Seed initial deployed markets and positions so reads and snapshots are pure
    for (const m of DEPLOYED_MARKETS) {
      this._marketSlices.set(
        m.mint,
        makeProvenance(defaultMarketData(m.mint, m.symbol), "init", "LOADING")
      );
      this._positionSlices.set(
        m.mint,
        makeProvenance(defaultPositionData(m.mint, m.symbol), "init", "LOADING")
      );
    }
    this._cachedAllMarkets = Array.from(this._marketSlices.values());
    this._cachedAllPositions = Array.from(this._positionSlices.values());

    // Connect telemetry to connection manager
    realtimeConnection.subscribeState((state) => {
      this.updateTelemetry(
        {
          connectionStatus: state,
          currentSlot: realtimeConnection.getCurrentSlot(),
          slotVelocityPerSec: realtimeConnection.getSlotVelocity(),
        },
        true
      );
    });

    realtimeConnection.subscribeSlot((slot) => {
      this.updateTelemetry({
        currentSlot: slot,
        slotVelocityPerSec: realtimeConnection.getSlotVelocity(),
        lastEventSlot: slot,
      });
    });
  }

  // ── Market Slice Operations ──

  public getMarket(mint: string): Provenance<LiveMarketData> {
    const existing = this._marketSlices.get(mint);
    if (!existing) {
      let fb = this._fallbackMarkets.get(mint);
      if (!fb) {
        fb = makeProvenance(defaultMarketData(mint), "init", "LOADING");
        this._fallbackMarkets.set(mint, fb);
      }
      return fb;
    }
    return existing;
  }

  public getAllMarkets(): Provenance<LiveMarketData>[] {
    return this._cachedAllMarkets;
  }

  public updateMarket(
    mint: string,
    patch: Partial<LiveMarketData>,
    source: string,
    status: ProvenanceStatus = "LIVE",
    slot: number | null = null
  ) {
    const startMs = Date.now();
    const current = this.getMarket(mint);
    const updatedValue: LiveMarketData = {
      ...current.value,
      ...patch,
      mint,
      lastUpdateSlot: slot ?? current.value.lastUpdateSlot,
      lastUpdateTs: Date.now(),
    };

    const nextProvenance: Provenance<LiveMarketData> = {
      value: updatedValue,
      source,
      observedAt: Date.now(),
      slot: slot ?? current.slot,
      commitment: "confirmed",
      freshnessMs: 0,
      status,
      version: current.version + 1,
    };

    this._marketSlices.set(mint, nextProvenance);
    this._cachedAllMarkets = Array.from(this._marketSlices.values());

    // Notify only subscribers of this specific market
    const set = this._marketListeners.get(mint);
    if (set) {
      set.forEach((cb) => {
        try {
          cb();
        } catch (e) {
          console.warn("Market listener error:", e);
        }
      });
    }
    this._allMarketsListeners.forEach((cb) => {
      try {
        cb();
      } catch (e) {
        console.warn("All markets listener error:", e);
      }
    });

    this.recordEventTelemetry(source, slot, Date.now() - startMs);
  }

  public subscribeMarket(mint: string, callback: () => void): () => void {
    let set = this._marketListeners.get(mint);
    if (!set) {
      set = new Set();
      this._marketListeners.set(mint, set);
    }
    set.add(callback);
    return () => {
      const s = this._marketListeners.get(mint);
      if (s) {
        s.delete(callback);
        if (s.size === 0) {
          this._marketListeners.delete(mint);
        }
      }
    };
  }

  public subscribeAllMarkets(callback: () => void): () => void {
    this._allMarketsListeners.add(callback);
    return () => this._allMarketsListeners.delete(callback);
  }

  // ── Position Slice Operations ──

  public getPosition(mint: string): Provenance<LivePositionData> {
    const existing = this._positionSlices.get(mint);
    if (!existing) {
      let fb = this._fallbackPositions.get(mint);
      if (!fb) {
        fb = makeProvenance(defaultPositionData(mint), "init", "LOADING");
        this._fallbackPositions.set(mint, fb);
      }
      return fb;
    }
    return existing;
  }

  public getAllPositions(): Provenance<LivePositionData>[] {
    return this._cachedAllPositions;
  }

  public updatePosition(
    mint: string,
    patch: Partial<LivePositionData>,
    source: string,
    status: ProvenanceStatus = "LIVE",
    slot: number | null = null
  ) {
    const startMs = Date.now();
    const current = this.getPosition(mint);
    const updatedValue: LivePositionData = {
      ...current.value,
      ...patch,
      mint,
      updatedAtSlot: slot ?? current.value.updatedAtSlot,
      updatedAtTs: Date.now(),
    };

    const nextProvenance: Provenance<LivePositionData> = {
      value: updatedValue,
      source,
      observedAt: Date.now(),
      slot: slot ?? current.slot,
      commitment: "confirmed",
      freshnessMs: 0,
      status,
      version: current.version + 1,
    };

    this._positionSlices.set(mint, nextProvenance);
    this._cachedAllPositions = Array.from(this._positionSlices.values());

    const set = this._positionListeners.get(mint);
    if (set) {
      set.forEach((cb) => {
        try {
          cb();
        } catch (e) {
          console.warn("Position listener error:", e);
        }
      });
    }
    this._allPositionsListeners.forEach((cb) => {
      try {
        cb();
      } catch (e) {
        console.warn("All positions listener error:", e);
      }
    });

    this.recordEventTelemetry(source, slot, Date.now() - startMs);
  }

  public subscribePosition(mint: string, callback: () => void): () => void {
    let set = this._positionListeners.get(mint);
    if (!set) {
      set = new Set();
      this._positionListeners.set(mint, set);
    }
    set.add(callback);
    return () => {
      const s = this._positionListeners.get(mint);
      if (s) {
        s.delete(callback);
        if (s.size === 0) {
          this._positionListeners.delete(mint);
        }
      }
    };
  }

  public subscribeAllPositions(callback: () => void): () => void {
    this._allPositionsListeners.add(callback);
    return () => this._allPositionsListeners.delete(callback);
  }

  // ── Protocol Slice Operations ──

  public getProtocol(): Provenance<LiveProtocolData> {
    return this._protocolSlice;
  }

  public updateProtocol(
    patch: Partial<LiveProtocolData>,
    source: string,
    status: ProvenanceStatus = "LIVE",
    slot: number | null = null
  ) {
    const startMs = Date.now();
    const updatedValue: LiveProtocolData = {
      ...this._protocolSlice.value,
      ...patch,
      lastUpdateSlot: slot ?? this._protocolSlice.value.lastUpdateSlot,
      lastUpdateTs: Date.now(),
    };

    this._protocolSlice = {
      value: updatedValue,
      source,
      observedAt: Date.now(),
      slot: slot ?? this._protocolSlice.slot,
      commitment: "confirmed",
      freshnessMs: 0,
      status,
      version: this._protocolSlice.version + 1,
    };

    this._protocolListeners.forEach((cb) => {
      try {
        cb();
      } catch (e) {
        console.warn("Protocol listener error:", e);
      }
    });

    this.recordEventTelemetry(source, slot, Date.now() - startMs);
  }

  public subscribeProtocol(callback: () => void): () => void {
    this._protocolListeners.add(callback);
    return () => this._protocolListeners.delete(callback);
  }

  // ── Transaction Slice Operations ──

  public getTransaction(id: string): Provenance<TransactionRecord> | null {
    return this._transactions.get(id) ?? null;
  }

  public getAllTransactions(): Provenance<TransactionRecord>[] {
    return this._cachedAllTransactions;
  }

  public setTransaction(record: TransactionRecord, source = "transaction-engine") {
    const existing = this._transactions.get(record.id);
    const provenance = makeProvenance(
      record,
      source,
      record.state === "CONFIRMED" ? "LIVE" : "PENDING",
      record.slot,
      existing ? existing.version + 1 : 1
    );

    this._transactions.set(record.id, provenance);
    this._cachedAllTransactions = Array.from(this._transactions.values()).sort(
      (a, b) => b.value.startedAtTs - a.value.startedAtTs
    );
    this._transactionListeners.forEach((cb) => {
      try {
        cb();
      } catch (e) {
        console.warn("Transaction listener error:", e);
      }
    });
  }

  public subscribeTransactions(callback: () => void): () => void {
    this._transactionListeners.add(callback);
    return () => this._transactionListeners.delete(callback);
  }

  // ── Telemetry & Observability ──

  public getTelemetry(): Provenance<RealtimeTelemetry> {
    return this._telemetry;
  }

  public updateTelemetry(patch: Partial<RealtimeTelemetry>, immediate = false) {
    this._telemetry = {
      ...this._telemetry,
      value: {
        ...this._telemetry.value,
        ...patch,
      },
      observedAt: Date.now(),
    };

    if (immediate) {
      if (this._telemetryTimer) {
        clearTimeout(this._telemetryTimer);
        this._telemetryTimer = null;
      }
      this._telemetry.version += 1;
      this._telemetryListeners.forEach((cb) => {
        try {
          cb();
        } catch (e) {
          console.warn("Telemetry listener error:", e);
        }
      });
      return;
    }

    if (!this._telemetryTimer) {
      this._telemetryTimer = setTimeout(() => {
        this._telemetryTimer = null;
        this._telemetry.version += 1;
        this._telemetryListeners.forEach((cb) => {
          try {
            cb();
          } catch (e) {
            console.warn("Telemetry listener error:", e);
          }
        });
      }, 350);
    }
  }

  public subscribeTelemetry(callback: () => void): () => void {
    this._telemetryListeners.add(callback);
    return () => this._telemetryListeners.delete(callback);
  }

  private recordEventTelemetry(source: string, slot: number | null, processingMs: number) {
    const cur = this._telemetry.value;
    this.updateTelemetry(
      {
        eventCount: cur.eventCount + 1,
        lastEventSource: source,
        lastEventSlot: slot ?? cur.lastEventSlot,
        lastEventTs: Date.now(),
        latencies: {
          ...cur.latencies,
          eventToStoreMs: processingMs,
          totalPipelineLatencyMs: processingMs + cur.latencies.storeToDerivedMs,
        },
      },
      false
    );
  }
}

export const normalizedStore = NormalizedRealtimeStore.getInstance();

// -------------------------------------------------------------
// Granular React Hooks with useSyncExternalStore
// -------------------------------------------------------------

const NULL_SNAPSHOT = () => null;

export function useMarketSlice(mint: string | undefined): Provenance<LiveMarketData> | null {
  const subscribe = useMemo(() => {
    return (cb: () => void) => {
      if (!mint) return () => {};
      return normalizedStore.subscribeMarket(mint, cb);
    };
  }, [mint]);

  const getSnapshot = useMemo(() => {
    return () => {
      if (!mint) return null;
      return normalizedStore.getMarket(mint);
    };
  }, [mint]);

  return useSyncExternalStore(subscribe, getSnapshot, NULL_SNAPSHOT);
}

export function usePositionSlice(mint: string | undefined): Provenance<LivePositionData> | null {
  const subscribe = useMemo(() => {
    return (cb: () => void) => {
      if (!mint) return () => {};
      return normalizedStore.subscribePosition(mint, cb);
    };
  }, [mint]);

  const getSnapshot = useMemo(() => {
    return () => {
      if (!mint) return null;
      return normalizedStore.getPosition(mint);
    };
  }, [mint]);

  return useSyncExternalStore(subscribe, getSnapshot, NULL_SNAPSHOT);
}

const subscribeProtocol = (cb: () => void) => normalizedStore.subscribeProtocol(cb);
const getProtocolSnapshot = () => normalizedStore.getProtocol();

export function useProtocolSlice(): Provenance<LiveProtocolData> {
  return useSyncExternalStore(
    subscribeProtocol,
    getProtocolSnapshot,
    getProtocolSnapshot
  );
}

const subscribeTransactions = (cb: () => void) => normalizedStore.subscribeTransactions(cb);
const getTransactionsSnapshot = () => normalizedStore.getAllTransactions();
const EMPTY_TX_ARRAY: Provenance<TransactionRecord>[] = [];
const getTransactionsServerSnapshot = () => EMPTY_TX_ARRAY;

export function useTransactionSlices(): Provenance<TransactionRecord>[] {
  return useSyncExternalStore(
    subscribeTransactions,
    getTransactionsSnapshot,
    getTransactionsServerSnapshot
  );
}

const subscribeTelemetry = (cb: () => void) => normalizedStore.subscribeTelemetry(cb);
const getTelemetrySnapshot = () => normalizedStore.getTelemetry();

export function useRealtimeTelemetry(): Provenance<RealtimeTelemetry> {
  return useSyncExternalStore(
    subscribeTelemetry,
    getTelemetrySnapshot,
    getTelemetrySnapshot
  );
}
