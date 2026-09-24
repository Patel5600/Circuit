/**
 * Circuit Protocol - Asset-Scoped Oracle Service
 *
 * Implements strict per-asset oracle resolution:
 * assetId -> AssetRegistry -> FeedRegistry -> OracleService
 *
 * Invariant: Every read requires assetId. No singleton/global currentOracle.
 * NVDA feed strictly resolves NVDA price account. AAPL resolves AAPL.
 * An oracle outage or staleness on AAPL never impacts NVDA.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { AssetRegistry, normalizeAssetId } from "./registry";
import {
  OracleSnapshot,
  fetchOracle,
  oracleCache,
  derivePriceAccount,
  decodePriceUpdateV2,
  PYTH_RECEIVER_ID,
} from "../pyth";

export type OracleSemanticState = "FRESH" | "STALE" | "INVALID" | "UNAVAILABLE";
export type OracleFreshnessLevel = "LIVE" | "RECENT" | "STALE" | "UNAVAILABLE";

export interface AssetOracleState {
  assetId: string;
  symbol: string;
  feedId: string;
  priceAccount: string;
  priceUsd: number;
  confUsd: number;
  confBps: number;
  exponent: number;
  publishTime: number;
  ageSeconds: number;
  freshness: OracleFreshnessLevel;
  oracleState: OracleSemanticState;
  healthy: boolean;
  maxOracleAge: number;
  maxConfBps: number;
  lastValidPrice: number | null;
  lastValidPublishTime: number | null;
  updatedAt: number;
}

class AssetScopedOracleService {
  private readonly stateByAssetId = new Map<string, AssetOracleState>();
  private readonly subscribers = new Set<(assetId: string, state: AssetOracleState) => void>();

  constructor() {
    this.initializeFromRegistry();
  }

  private initializeFromRegistry() {
    for (const config of AssetRegistry.list()) {
      this.stateByAssetId.set(config.assetId, {
        assetId: config.assetId,
        symbol: config.symbol,
        feedId: config.pythFeedId,
        priceAccount: config.pythFeedAccount,
        priceUsd: 0,
        confUsd: 0,
        confBps: 0,
        exponent: -8,
        publishTime: 0,
        ageSeconds: 999999,
        freshness: "UNAVAILABLE",
        oracleState: "UNAVAILABLE",
        healthy: false,
        maxOracleAge: config.riskConfig.maxOracleAge,
        maxConfBps: config.riskConfig.maxConfBps,
        lastValidPrice: null,
        lastValidPublishTime: null,
        updatedAt: Date.now(),
      });
    }
  }

  public getState(assetIdOrMintOrSymbol: string): AssetOracleState {
    const config = AssetRegistry.get(assetIdOrMintOrSymbol);
    const assetId = config?.assetId || normalizeAssetId(assetIdOrMintOrSymbol);

    let state = this.stateByAssetId.get(assetId);
    if (!state) {
      const cfg = AssetRegistry.require(assetId);
      state = {
        assetId: cfg.assetId,
        symbol: cfg.symbol,
        feedId: cfg.pythFeedId,
        priceAccount: cfg.pythFeedAccount,
        priceUsd: 0,
        confUsd: 0,
        confBps: 0,
        exponent: -8,
        publishTime: 0,
        ageSeconds: 999999,
        freshness: "UNAVAILABLE",
        oracleState: "UNAVAILABLE",
        healthy: false,
        maxOracleAge: cfg.riskConfig.maxOracleAge,
        maxConfBps: cfg.riskConfig.maxConfBps,
        lastValidPrice: null,
        lastValidPublishTime: null,
        updatedAt: Date.now(),
      };
      this.stateByAssetId.set(assetId, state);
    }

    // Check pyth cache for recent updates specific to this asset's feedId / priceAccount
    this.syncFromPythCache(state);

    return { ...state };
  }

  private syncFromPythCache(state: AssetOracleState) {
    if (!state.feedId) return;

    const cachedEntry =
      oracleCache.get(state.priceAccount) ||
      oracleCache.get(state.feedId) ||
      oracleCache.get(state.assetId) ||
      oracleCache.get(state.symbol);

    if (cachedEntry) {
      const snap = cachedEntry.snapshot;
      const nowSec = Math.floor(Date.now() / 1000);
      const pubSec = snap.update?.publishTime ? Number(snap.update.publishTime) : state.publishTime;
      const ageSec = pubSec > 0 ? Math.max(0, nowSec - pubSec) : 999999;
      const confBps = snap.confBps ?? state.confBps;
      const priceUsd = snap.priceUsd > 0 ? snap.priceUsd : state.priceUsd;

      let freshness: OracleFreshnessLevel = "UNAVAILABLE";
      if (priceUsd <= 0) freshness = "UNAVAILABLE";
      else if (ageSec < 30) freshness = "LIVE";
      else if (ageSec <= state.maxOracleAge) freshness = "RECENT";
      else freshness = "STALE";

      let semanticState: OracleSemanticState = "FRESH";
      if (priceUsd <= 0) semanticState = "UNAVAILABLE";
      else if (confBps > state.maxConfBps) semanticState = "INVALID";
      else if (ageSec <= state.maxOracleAge) semanticState = "FRESH";
      else semanticState = "STALE";

      const healthy = (freshness === "LIVE" || freshness === "RECENT") && semanticState === "FRESH";

      state.priceUsd = priceUsd;
      state.confUsd = snap.confUsd ?? 0;
      state.confBps = confBps;
      state.exponent = snap.update?.exponent ?? -8;
      state.publishTime = pubSec;
      state.ageSeconds = ageSec;
      state.freshness = freshness;
      state.oracleState = semanticState;
      state.healthy = healthy;
      if (priceUsd > 0) state.lastValidPrice = priceUsd;
      if (pubSec > 0) state.lastValidPublishTime = pubSec;
      state.updatedAt = cachedEntry.fetchedAt || Date.now();
    }
  }

  public updateState(assetIdOrSymbol: string, update: Partial<AssetOracleState>): AssetOracleState {
    const config = AssetRegistry.get(assetIdOrSymbol);
    const assetId = config?.assetId || normalizeAssetId(assetIdOrSymbol);

    const existing = this.getState(assetId);
    const merged: AssetOracleState = {
      ...existing,
      ...update,
      assetId,
      symbol: config?.symbol || existing.symbol,
      feedId: config?.pythFeedId || existing.feedId,
      priceAccount: config?.pythFeedAccount || existing.priceAccount,
      updatedAt: Date.now(),
    };

    // Recompute freshness and health if price/publishTime changed
    if (update.priceUsd !== undefined || update.publishTime !== undefined || update.confBps !== undefined) {
      const nowSec = Math.floor(Date.now() / 1000);
      const pubSec = merged.publishTime;
      const ageSec = pubSec > 0 ? Math.max(0, nowSec - pubSec) : 999999;
      merged.ageSeconds = ageSec;

      let freshness: OracleFreshnessLevel = "UNAVAILABLE";
      if (merged.priceUsd <= 0) freshness = "UNAVAILABLE";
      else if (ageSec < 30) freshness = "LIVE";
      else if (ageSec <= merged.maxOracleAge) freshness = "RECENT";
      else freshness = "STALE";

      let semanticState: OracleSemanticState = "FRESH";
      if (merged.priceUsd <= 0) semanticState = "UNAVAILABLE";
      else if (merged.confBps > merged.maxConfBps) semanticState = "INVALID";
      else if (ageSec <= merged.maxOracleAge) semanticState = "FRESH";
      else semanticState = "STALE";

      merged.freshness = update.freshness ?? freshness;
      merged.oracleState = update.oracleState ?? semanticState;
      merged.healthy =
        update.healthy !== undefined
          ? update.healthy
          : (merged.freshness === "LIVE" || merged.freshness === "RECENT") &&
            merged.oracleState === "FRESH";

      if (merged.priceUsd > 0) merged.lastValidPrice = merged.priceUsd;
      if (pubSec > 0) merged.lastValidPublishTime = pubSec;
    }

    this.stateByAssetId.set(assetId, merged);
    this.notifySubscribers(assetId, merged);
    return { ...merged };
  }

  public async fetchState(
    connection: Connection,
    assetIdOrSymbol: string,
    referenceUnixSeconds?: number
  ): Promise<AssetOracleState> {
    const config = AssetRegistry.require(assetIdOrSymbol);
    const refSec = referenceUnixSeconds ?? Math.floor(Date.now() / 1000);

    try {
      const snap = await fetchOracle(connection, refSec, config.pythFeedId);
      if (snap) {
        return this.updateState(config.assetId, {
          priceUsd: snap.priceUsd,
          confUsd: snap.confUsd ?? 0,
          confBps: snap.confBps,
          exponent: snap.update?.exponent ?? -8,
          publishTime: snap.update?.publishTime ? Number(snap.update.publishTime) : 0,
          freshness: snap.status === "LIVE" ? "LIVE" : snap.status === "RECENT" ? "RECENT" : "STALE",
          healthy: snap.status === "LIVE" || snap.status === "RECENT",
        });
      }
    } catch (err) {
      console.warn(`[OracleService] fetchState error for ${config.assetId}:`, err);
    }

    return this.getState(config.assetId);
  }

  public getAllStates(): Record<string, AssetOracleState> {
    const out: Record<string, AssetOracleState> = {};
    for (const [id, state] of this.stateByAssetId.entries()) {
      out[id] = { ...state };
    }
    return out;
  }

  public subscribe(fn: (assetId: string, state: AssetOracleState) => void): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  private notifySubscribers(assetId: string, state: AssetOracleState) {
    for (const sub of this.subscribers) {
      try {
        sub(assetId, state);
      } catch (e) {
        console.error("[OracleService] subscriber error:", e);
      }
    }
  }
}

export const OracleService = new AssetScopedOracleService();
