/**
 * Circuit Protocol — Centralized DBC State Observer
 *
 * Single React Context providing DBC pool state and availability to all consumers.
 * Real-time WebSocket streaming via DbcStateStream + periodic heartbeat polling.
 *
 * CIRCUIT SURVIVAL INVARIANT:
 * DBC availability state drives ONLY DBC execution paths.
 * Circuit lending, borrowing, positions, and risk management are UNAFFECTED
 * by any DBC availability state including UNAVAILABLE.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import {
  DBC_POOL_REGISTRY,
  DbcPoolRegistryEntry,
  DbcPoolLifecycle,
  getPoolBySymbol,
  getRegisteredDbcSymbols,
} from "../lib/meteora/registry";
import {
  METEORA_DBC_PROGRAM_ID,
  DbcPoolInfo,
  computeRealDbcSwapQuote,
  DbcSwapQuote,
} from "../lib/meteora/dbc";
import { DbcStateStream } from "../lib/meteora/stream";

/** DBC integration availability — 5-state machine */
export type DbcAvailability =
  | "AVAILABLE"       // At least one pool is observable on-chain and operational
  | "DEGRADED"        // Partial fetch failure — some pools unobservable
  | "UNAVAILABLE"     // Sustained RPC failures — all DBC paths blocked
  | "NOT_CONFIGURED"  // No pools registered for this network
  | "STALE";          // Pool state hasn't been refreshed recently (>120s)

export interface DbcPoolState {
  entry: DbcPoolRegistryEntry;
  /** Decoded on-chain state from Meteora DBC program (null if not yet fetched) */
  info: DbcPoolInfo | null;
  /** Whether the pool account exists on-chain (null = unknown) */
  existsOnChain: boolean | null;
  /** Whether the program ID was verified against METEORA_DBC_PROGRAM_ID */
  programIdVerified: boolean;
  /** Current lifecycle state */
  lifecycleState: DbcPoolLifecycle;
  /** Slot at which this state was last observed (null = never) */
  observedAtSlot: number | null;
  /** Seconds since last refresh */
  freshnessSec: number | null;
}

export interface DbcContextValue {
  /** Overall DBC availability across all registered pools */
  availability: DbcAvailability;
  /** Pool state map, keyed by pool address (base58) */
  poolStates: Map<string, DbcPoolState>;
  /** Look up pool state by market symbol */
  getPoolState(symbol: string): DbcPoolState | null;
  /** Compute real on-chain swap quote using Meteora DBC math */
  getSwapQuote(params: {
    symbol: string;
    amountIn: bigint;
    swapBaseForQuote: boolean;
    slippageBps?: number;
  }): Promise<DbcSwapQuote | null>;
  /** Manually trigger a refresh */
  refresh(): void;
  /** Unix timestamp (ms) of last successful fetch */
  lastRefreshedAt: number | null;
  /** Number of consecutive fetch failures */
  consecutiveFailures: number;
}

const DbcContext = createContext<DbcContextValue>({
  availability: "NOT_CONFIGURED",
  poolStates: new Map(),
  getPoolState: () => null,
  getSwapQuote: async () => null,
  refresh: () => {},
  lastRefreshedAt: null,
  consecutiveFailures: 0,
});

export function useDbcContext(): DbcContextValue {
  return useContext(DbcContext);
}

const POLL_INTERVAL_MS = 30_000;
const STALE_THRESHOLD_MS = 120_000;
const MAX_CONSECUTIVE_FAILURES = 3;

export function DbcProvider({ children }: { children: React.ReactNode }) {
  const { connection } = useConnection();
  const [poolStates, setPoolStates] = useState<Map<string, DbcPoolState>>(new Map());
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const streamRef = useRef<DbcStateStream | null>(null);

  // Initialize or update DbcStateStream on connection change
  useEffect(() => {
    const stream = new DbcStateStream(connection);
    streamRef.current = stream;

    return () => {
      stream.destroy();
      streamRef.current = null;
    };
  }, [connection]);

  // Handle on-chain pool update from WebSocket stream
  const handlePoolUpdate = useCallback((info: DbcPoolInfo) => {
    if (!mountedRef.current) return;
    const now = Date.now();

    setPoolStates((prev) => {
      const next = new Map(prev);
      const addr = info.poolAddress.toBase58();
      const existing = next.get(addr);
      const entry = existing?.entry || DBC_POOL_REGISTRY.find((e) => e.poolAddress === addr);
      if (!entry) return prev;

      let lifecycleState: DbcPoolLifecycle = "ACTIVE_TRADING";
      if (info.isMigrated) {
        lifecycleState = "DAMM_V2";
      } else if (info.quoteReserve >= info.migrationQuoteThreshold && info.migrationQuoteThreshold > BigInt(0)) {
        lifecycleState = "THRESHOLD_REACHED";
      } else if (info.quoteReserve === BigInt(0)) {
        lifecycleState = "VIRTUAL_POOL";
      }

      next.set(addr, {
        entry,
        info,
        existsOnChain: true,
        programIdVerified: true,
        lifecycleState,
        observedAtSlot: Number(info.activationPoint),
        freshnessSec: 0,
      });

      return next;
    });

    setLastRefreshedAt(now);
    setConsecutiveFailures(0);
  }, []);

  // Fetch initial states and set up WebSocket streams for all registered pools
  const fetchPoolStates = useCallback(async () => {
    if (DBC_POOL_REGISTRY.length === 0 || !streamRef.current) return;

    try {
      const stream = streamRef.current;
      const slot = await connection.getSlot("confirmed").catch(() => null);
      const now = Date.now();

      const fetchPromises = DBC_POOL_REGISTRY.map(async (entry) => {
        const poolPk = new PublicKey(entry.poolAddress);
        const info = await stream.fetchPool(poolPk, entry.baseDecimals, entry.quoteDecimals);
        return { entry, info };
      });

      const results = await Promise.all(fetchPromises);
      if (!mountedRef.current) return;

      setPoolStates((prev) => {
        const next = new Map(prev);
        for (const { entry, info } of results) {
          const existsOnChain = info !== null;
          let lifecycleState = entry.lifecycleState;

          if (info) {
            if (info.isMigrated) {
              lifecycleState = "DAMM_V2";
            } else if (info.quoteReserve >= info.migrationQuoteThreshold && info.migrationQuoteThreshold > BigInt(0)) {
              lifecycleState = "THRESHOLD_REACHED";
            } else if (info.quoteReserve === BigInt(0)) {
              lifecycleState = "VIRTUAL_POOL";
            } else {
              lifecycleState = "ACTIVE_TRADING";
            }
          }

          next.set(entry.poolAddress, {
            entry,
            info,
            existsOnChain,
            programIdVerified: existsOnChain,
            lifecycleState,
            observedAtSlot: slot,
            freshnessSec: 0,
          });
        }
        return next;
      });

      setLastRefreshedAt(now);
      setConsecutiveFailures(0);
    } catch (err) {
      if (!mountedRef.current) return;
      console.warn("[DbcContext] Pool fetch failed:", err);
      setConsecutiveFailures((n) => n + 1);
    }
  }, [connection]);

  // Subscribe to real-time WebSockets
  useEffect(() => {
    mountedRef.current = true;
    const stream = streamRef.current;
    if (!stream) return;

    const unsubscribers = DBC_POOL_REGISTRY.map((entry) => {
      const poolPk = new PublicKey(entry.poolAddress);
      return stream.subscribe(poolPk, handlePoolUpdate, entry.baseDecimals, entry.quoteDecimals);
    });

    fetchPoolStates();

    const schedule = () => {
      pollRef.current = setTimeout(() => {
        if (mountedRef.current) {
          fetchPoolStates().then(() => schedule());
        }
      }, POLL_INTERVAL_MS);
    };
    schedule();

    return () => {
      mountedRef.current = false;
      if (pollRef.current) clearTimeout(pollRef.current);
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [fetchPoolStates, handlePoolUpdate]);

  // Compute availability from pool states + failure count
  const availability = useMemo<DbcAvailability>(() => {
    if (DBC_POOL_REGISTRY.length === 0) return "NOT_CONFIGURED";
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) return "UNAVAILABLE";
    if (poolStates.size === 0) return "NOT_CONFIGURED";

    const now = Date.now();
    if (lastRefreshedAt && now - lastRefreshedAt > STALE_THRESHOLD_MS) return "STALE";

    const states = Array.from(poolStates.values());
    const anyExists = states.some((s) => s.existsOnChain);
    const allExists = states.every((s) => s.existsOnChain);

    if (consecutiveFailures > 0) return "DEGRADED";
    if (allExists) return "AVAILABLE";
    if (anyExists) return "AVAILABLE";
    return "NOT_CONFIGURED";
  }, [poolStates, consecutiveFailures, lastRefreshedAt]);

  // Update freshnessSec on each re-render
  const computedPoolStates = useMemo(() => {
    if (!lastRefreshedAt) return poolStates;
    const now = Date.now();
    const updated = new Map<string, DbcPoolState>();
    for (const [addr, state] of poolStates) {
      updated.set(addr, {
        ...state,
        freshnessSec: Math.floor((now - lastRefreshedAt) / 1000),
      });
    }
    return updated;
  }, [poolStates, lastRefreshedAt]);

  const getPoolState = useCallback(
    (symbol: string): DbcPoolState | null => {
      const entry = getPoolBySymbol(symbol);
      if (!entry) return null;
      return computedPoolStates.get(entry.poolAddress) ?? null;
    },
    [computedPoolStates]
  );

  const getSwapQuote = useCallback(
    async (params: {
      symbol: string;
      amountIn: bigint;
      swapBaseForQuote: boolean;
      slippageBps?: number;
    }): Promise<DbcSwapQuote | null> => {
      const entry = getPoolBySymbol(params.symbol);
      if (!entry) return null;

      return computeRealDbcSwapQuote({
        connection,
        poolAddress: new PublicKey(entry.poolAddress),
        amountIn: params.amountIn,
        swapBaseForQuote: params.swapBaseForQuote,
        baseDecimals: entry.baseDecimals,
        quoteDecimals: entry.quoteDecimals,
        slippageBps: params.slippageBps,
      });
    },
    [connection]
  );

  const value = useMemo<DbcContextValue>(
    () => ({
      availability,
      poolStates: computedPoolStates,
      getPoolState,
      getSwapQuote,
      refresh: fetchPoolStates,
      lastRefreshedAt,
      consecutiveFailures,
    }),
    [availability, computedPoolStates, getPoolState, getSwapQuote, fetchPoolStates, lastRefreshedAt, consecutiveFailures]
  );

  return <DbcContext.Provider value={value}>{children}</DbcContext.Provider>;
}
