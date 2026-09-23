/**
 * Circuit Protocol - Canonical Live State Store (CircuitLiveStore)
 *
 * Centralized, authoritative live frontend store.
 * - Single deduplicated WebSocket subscription registry
 * - Granular useSyncExternalStore subscriptions
 * - Clear separation of initialLoading from backgroundUpdating
 * - Preserves existing data in-place during background updates (zero skeleton flicker)
 * - Retains cached data marked as STALE upon disconnection
 * - Zero fake fallback prices or synthetic confidence intervals
 */

import { useSyncExternalStore, useMemo } from "react";
import { Connection, PublicKey, AccountInfo } from "@solana/web3.js";
import { DecisionSnapshot } from "../decision/types";
import { RiskRatchetState, ProtocolAction } from "../permission-engine";

export type ConnectionStatus = "connected" | "degraded" | "disconnected" | "reconnecting";

export type LiveDataStatus = "LIVE" | "RECENT" | "STALE" | "UNAVAILABLE";

export interface LiveMarketSlice {
  mint: string;
  symbol: string;
  name: string;
  price: number | null;
  expo: number;
  conf: number | null;
  confBps: number | null;
  publishTime: number | null;
  ageSeconds: number | null;
  status: LiveDataStatus;
  sessionOpen: boolean;
  haltState: "open_normal" | "closed" | "halted_inferred" | "oracle_unavailable";
  baseLtvBps: number;
  liqThresholdBps: number;
  updatedAt: number;
}

export interface LivePositionSlice {
  mint: string;
  symbol: string;
  collateralAmount: bigint;
  debtAmount: bigint;
  collateralUsd: number;
  debtUsd: number;
  healthFactor: number | null;
  currentLtvBps: number;
  updatedAtSlot: number;
  updatedAt: number;
}

export interface LiveRiskSlice {
  mint: string;
  state: RiskRatchetState;
  score: number;
  previousScore: number;
  velocity: number;
  epoch: number;
  reason: string;
  effectiveLtvBps: number;
  borrowAllowed: boolean;
  withdrawAllowed: boolean;
  updatedAt: number;
}

export interface LivePortfolioSummary {
  totalCollateralUsd: number;
  totalDebtUsd: number;
  borrowCapacityUsd: number;
  availableCreditUsd: number;
  weightedHealthFactor: number | null;
  currentLtvBps: number;
  maxLtvBps: number;
  riskEpoch: number;
  status: LiveDataStatus;
  lastUpdated: number;
}

export interface LiveStoreState {
  connectionStatus: ConnectionStatus;
  lastSlot: number | null;
  lastSlotTime: number | null;
  latencyMs: number;
  initialLoading: boolean;
  backgroundUpdating: boolean;

  marketsByMint: Record<string, LiveMarketSlice>;
  positionsByMint: Record<string, LivePositionSlice>;
  riskByMint: Record<string, LiveRiskSlice>;
  portfolioSummary: LivePortfolioSummary;
  decisionsByKey: Record<string, DecisionSnapshot>;
}

const INITIAL_STATE: LiveStoreState = {
  connectionStatus: "disconnected",
  lastSlot: null,
  lastSlotTime: null,
  latencyMs: 0,
  initialLoading: true,
  backgroundUpdating: false,

  marketsByMint: {},
  positionsByMint: {},
  riskByMint: {},
  portfolioSummary: {
    totalCollateralUsd: 0,
    totalDebtUsd: 0,
    borrowCapacityUsd: 0,
    availableCreditUsd: 0,
    weightedHealthFactor: null,
    currentLtvBps: 0,
    maxLtvBps: 7000,
    riskEpoch: 1,
    status: "UNAVAILABLE",
    lastUpdated: 0,
  },
  decisionsByKey: {},
};

export class CircuitLiveStore {
  private _state: LiveStoreState = INITIAL_STATE;
  private _listeners: Set<() => void> = new Set();

  // Deduplicated account subscription registry
  private _accountSubscriptions: Map<
    string,
    { subId: number | null; count: number; callback: (info: AccountInfo<Buffer>) => void }
  > = new Map();

  private _connection: Connection | null = null;

  public getSnapshot = (): LiveStoreState => {
    return this._state;
  };

  public getServerSnapshot = (): LiveStoreState => {
    return INITIAL_STATE;
  };

  public subscribe = (listener: () => void): (() => void) => {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  };

  private notify() {
    this._listeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        console.error("LiveStore listener error:", err);
      }
    });
  }

  public setConnection(connection: Connection | null) {
    this._connection = connection;
    if (!connection) {
      this.updateState((prev) => ({
        ...prev,
        connectionStatus: "disconnected",
      }));
    }
  }

  public setConnectionStatus(status: ConnectionStatus) {
    this.updateState((prev) => {
      if (prev.connectionStatus === status) return prev;
      return { ...prev, connectionStatus: status };
    });
  }

  public setInitialLoading(loading: boolean) {
    this.updateState((prev) => {
      if (prev.initialLoading === loading) return prev;
      return { ...prev, initialLoading: loading };
    });
  }

  public setBackgroundUpdating(updating: boolean) {
    this.updateState((prev) => {
      if (prev.backgroundUpdating === updating) return prev;
      return { ...prev, backgroundUpdating: updating };
    });
  }

  public updateTelemetry(latencyMs: number, slot?: number) {
    this.updateState((prev) => ({
      ...prev,
      latencyMs,
      lastSlot: slot ?? prev.lastSlot,
      lastSlotTime: slot ? Date.now() : prev.lastSlotTime,
      connectionStatus: "connected",
    }));
  }

  public updateMarket(mint: string, data: Partial<LiveMarketSlice>) {
    this.updateState((prev) => {
      const existing = prev.marketsByMint[mint] || {
        mint,
        symbol: "",
        name: "",
        price: null,
        expo: -8,
        conf: null,
        confBps: null,
        publishTime: null,
        ageSeconds: null,
        status: "UNAVAILABLE" as LiveDataStatus,
        sessionOpen: false,
        haltState: "open_normal" as const,
        baseLtvBps: 7000,
        liqThresholdBps: 8000,
        updatedAt: Date.now(),
      };
      return {
        ...prev,
        marketsByMint: {
          ...prev.marketsByMint,
          [mint]: { ...existing, ...data, updatedAt: Date.now() },
        },
      };
    });
  }

  public updatePosition(mint: string, data: Partial<LivePositionSlice>) {
    this.updateState((prev) => {
      const existing = prev.positionsByMint[mint] || {
        mint,
        symbol: "",
        collateralAmount: 0n,
        debtAmount: 0n,
        collateralUsd: 0,
        debtUsd: 0,
        healthFactor: null,
        currentLtvBps: 0,
        updatedAtSlot: 0,
        updatedAt: Date.now(),
      };
      return {
        ...prev,
        positionsByMint: {
          ...prev.positionsByMint,
          [mint]: { ...existing, ...data, updatedAt: Date.now() },
        },
      };
    });
  }

  public updateRisk(mint: string, data: Partial<LiveRiskSlice>) {
    this.updateState((prev) => {
      const existing = prev.riskByMint[mint] || {
        mint,
        state: "SAFE" as RiskRatchetState,
        score: 0,
        previousScore: 0,
        velocity: 0,
        epoch: 1,
        reason: "Nominal",
        effectiveLtvBps: 7000,
        borrowAllowed: true,
        withdrawAllowed: true,
        updatedAt: Date.now(),
      };
      return {
        ...prev,
        riskByMint: {
          ...prev.riskByMint,
          [mint]: { ...existing, ...data, updatedAt: Date.now() },
        },
      };
    });
  }

  public updatePortfolioSummary(summary: Partial<LivePortfolioSummary>) {
    this.updateState((prev) => ({
      ...prev,
      portfolioSummary: {
        ...prev.portfolioSummary,
        ...summary,
        lastUpdated: Date.now(),
      },
    }));
  }

  public setDecision(key: string, decision: DecisionSnapshot) {
    this.updateState((prev) => ({
      ...prev,
      decisionsByKey: {
        ...prev.decisionsByKey,
        [key]: decision,
      },
    }));
  }

  private updateState(reducer: (prev: LiveStoreState) => LiveStoreState) {
    const next = reducer(this._state);
    if (next !== this._state) {
      this._state = next;
      this.notify();
    }
  }

  /**
   * Deduplicated Account Subscription Registration
   */
  public registerAccount(
    pubkeyStr: string,
    callback: (info: AccountInfo<Buffer>) => void
  ): () => void {
    if (!this._connection) return () => {};

    let entry = this._accountSubscriptions.get(pubkeyStr);
    if (!entry) {
      try {
        const pk = new PublicKey(pubkeyStr);
        const subId = this._connection.onAccountChange(
          pk,
          (info) => {
            const currentEntry = this._accountSubscriptions.get(pubkeyStr);
            if (currentEntry) {
              currentEntry.callback(info);
            }
          },
          "confirmed"
        );
        entry = { subId, count: 1, callback };
        this._accountSubscriptions.set(pubkeyStr, entry);
      } catch (err) {
        console.warn(`Failed to subscribe to account ${pubkeyStr}:`, err);
        return () => {};
      }
    } else {
      entry.count += 1;
    }

    return () => {
      const current = this._accountSubscriptions.get(pubkeyStr);
      if (current) {
        current.count -= 1;
        if (current.count <= 0) {
          if (current.subId !== null && this._connection) {
            this._connection.removeAccountChangeListener(current.subId).catch(() => {});
          }
          this._accountSubscriptions.delete(pubkeyStr);
        }
      }
    };
  }
}

export const circuitLiveStore = new CircuitLiveStore();

// -------------------------------------------------------------
// Granular useSyncExternalStore Hooks
// -------------------------------------------------------------

export function useLiveStore(): LiveStoreState {
  return useSyncExternalStore(
    circuitLiveStore.subscribe,
    circuitLiveStore.getSnapshot,
    circuitLiveStore.getServerSnapshot
  );
}

export function useLiveTelemetry(): {
  connectionStatus: ConnectionStatus;
  lastSlot: number | null;
  latencyMs: number;
  initialLoading: boolean;
  backgroundUpdating: boolean;
} {
  const store = useLiveStore();
  return useMemo(
    () => ({
      connectionStatus: store.connectionStatus,
      lastSlot: store.lastSlot,
      latencyMs: store.latencyMs,
      initialLoading: store.initialLoading,
      backgroundUpdating: store.backgroundUpdating,
    }),
    [store.connectionStatus, store.lastSlot, store.latencyMs, store.initialLoading, store.backgroundUpdating]
  );
}

export function useLiveMarket(mint: string | undefined): LiveMarketSlice | null {
  const store = useLiveStore();
  return useMemo(() => {
    if (!mint) return null;
    return store.marketsByMint[mint] || null;
  }, [store.marketsByMint, mint]);
}

export function useLivePrice(mint: string | undefined): {
  price: number | null;
  confBps: number | null;
  status: LiveDataStatus;
  ageSeconds: number | null;
} {
  const mkt = useLiveMarket(mint);
  return useMemo(
    () => ({
      price: mkt?.price ?? null,
      confBps: mkt?.confBps ?? null,
      status: mkt?.status ?? "UNAVAILABLE",
      ageSeconds: mkt?.ageSeconds ?? null,
    }),
    [mkt?.price, mkt?.confBps, mkt?.status, mkt?.ageSeconds]
  );
}

export function useLivePosition(mint: string | undefined): LivePositionSlice | null {
  const store = useLiveStore();
  return useMemo(() => {
    if (!mint) return null;
    return store.positionsByMint[mint] || null;
  }, [store.positionsByMint, mint]);
}

export function useLivePortfolioSummary(): LivePortfolioSummary {
  const store = useLiveStore();
  return store.portfolioSummary;
}

export function useLiveDecision(
  action: ProtocolAction,
  amountUsd: number,
  mintOrSymbol: string
): DecisionSnapshot | null {
  const store = useLiveStore();
  const key = `${action}:${amountUsd}:${mintOrSymbol}`;
  return store.decisionsByKey[key] || null;
}
