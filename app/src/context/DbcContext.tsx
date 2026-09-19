/**
 * Circuit Protocol — Centralized DBC State Observer
 *
 * Single React Context providing DBC pool state and availability to all consumers.
 * One polling loop (30s), deduplicated requests, no per-component RPC calls.
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
import { METEORA_DBC_PROGRAM_ID } from "../lib/meteora/dbc";

/** DBC integration availability — 5-state machine */
export type DbcAvailability =
  | "AVAILABLE"       // At least one pool is observable on-chain
  | "DEGRADED"        // Partial fetch failure — some pools unobservable
  | "UNAVAILABLE"     // Sustained RPC failures — all DBC paths blocked
  | "NOT_CONFIGURED"  // No pools registered for this network
  | "STALE";          // Pool state hasn't been refreshed recently (>120s)

export interface DbcPoolState {
  entry: DbcPoolRegistryEntry;
  /** Whether the pool account exists on-chain (null = unknown) */
  existsOnChain: boolean | null;
  /** Whether the program ID was verified against METEORA_DBC_PROGRAM_ID */
  programIdVerified: boolean;
  /** Current lifecycle state (from registry; on-chain reading is future work) */
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

  const fetchPoolStates = useCallback(async () => {
    if (DBC_POOL_REGISTRY.length === 0) return;

    try {
      const poolAddresses = DBC_POOL_REGISTRY.map((e) => new PublicKey(e.poolAddress));
      const accounts = await connection.getMultipleAccountsInfo(poolAddresses, "confirmed");

      if (!mountedRef.current) return;

      const now = Date.now();
      const slot = await connection.getSlot("confirmed").catch(() => null);

      const newStates = new Map<string, DbcPoolState>();
      let fetchedCount = 0;

      for (let i = 0; i < DBC_POOL_REGISTRY.length; i++) {
        const entry = DBC_POOL_REGISTRY[i];
        const acc = accounts[i];
        const existsOnChain = acc !== null;
        const programIdVerified = existsOnChain
          ? acc!.owner.equals(METEORA_DBC_PROGRAM_ID)
          : false;

        if (existsOnChain) fetchedCount++;

        newStates.set(entry.poolAddress, {
          entry,
          existsOnChain,
          programIdVerified,
          lifecycleState: entry.lifecycleState,
          observedAtSlot: slot,
          freshnessSec: 0,
        });
      }

      setPoolStates(newStates);
      setLastRefreshedAt(now);
      setConsecutiveFailures(0);
    } catch (err) {
      if (!mountedRef.current) return;
      console.warn("[DbcContext] Pool fetch failed:", err);
      setConsecutiveFailures((n) => n + 1);
    }
  }, [connection]);

  // Start polling loop
  useEffect(() => {
    mountedRef.current = true;
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
    };
  }, [fetchPoolStates]);

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
    if (anyExists) return "DEGRADED";
    return "NOT_CONFIGURED";
  }, [poolStates, consecutiveFailures, lastRefreshedAt]);

  // Update freshnessSec on each re-render (but only if we have last refresh time)
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

  const value = useMemo<DbcContextValue>(
    () => ({
      availability,
      poolStates: computedPoolStates,
      getPoolState,
      refresh: fetchPoolStates,
      lastRefreshedAt,
      consecutiveFailures,
    }),
    [availability, computedPoolStates, getPoolState, fetchPoolStates, lastRefreshedAt, consecutiveFailures]
  );

  return <DbcContext.Provider value={value}>{children}</DbcContext.Provider>;
}
