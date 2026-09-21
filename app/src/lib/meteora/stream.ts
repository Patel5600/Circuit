/**
 * Circuit Protocol — Meteora DBC Realtime State Stream
 *
 * Provides real-time WebSocket state streaming of Meteora Dynamic Bonding Curve pools
 * on Solana Devnet. Listens directly to account changes via `connection.onAccountChange`
 * and updates subscribers with decoded, verified on-chain state with zero synthetic data.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { DynamicBondingCurveClient, getPriceFromSqrtPrice } from "@meteora-ag/dynamic-bonding-curve-sdk";
import { METEORA_DBC_PROGRAM_ID, DbcPoolInfo } from "./dbc";

export type DbcStreamListener = (info: DbcPoolInfo) => void;

export class DbcStateStream {
  private connection: Connection;
  private client: DynamicBondingCurveClient;
  private subscriptions: Map<string, number> = new Map(); // poolAddress -> onAccountChange subId
  private listeners: Map<string, Set<DbcStreamListener>> = new Map();
  private cache: Map<string, DbcPoolInfo> = new Map();
  private pollTimers: Map<string, NodeJS.Timeout> = new Map();
  private isDestroyed = false;

  constructor(connection: Connection) {
    this.connection = connection;
    this.client = new DynamicBondingCurveClient(connection, "confirmed");
  }

  /**
   * Subscribes to real-time on-chain updates for a Meteora DBC pool.
   */
  public subscribe(
    poolAddress: PublicKey,
    listener: DbcStreamListener,
    baseDecimals = 9,
    quoteDecimals = 9
  ): () => void {
    const key = poolAddress.toBase58();

    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
      this.startStreaming(poolAddress, baseDecimals, quoteDecimals);
    }

    this.listeners.get(key)!.add(listener);

    // Emit cached state immediately if available
    const cached = this.cache.get(key);
    if (cached) {
      listener(cached);
    } else {
      // Immediate initial fetch
      this.fetchAndEmit(poolAddress, baseDecimals, quoteDecimals).catch((err) =>
        console.warn(`[DbcStream] Initial fetch failed for ${key}:`, err)
      );
    }

    // Return un-subscribe closure
    return () => {
      const set = this.listeners.get(key);
      if (set) {
        set.delete(listener);
        if (set.size === 0) {
          this.stopStreaming(key);
          this.listeners.delete(key);
        }
      }
    };
  }

  /**
   * Fetches latest pool state on demand.
   */
  public async fetchPool(
    poolAddress: PublicKey,
    baseDecimals = 9,
    quoteDecimals = 9
  ): Promise<DbcPoolInfo | null> {
    return this.fetchAndEmit(poolAddress, baseDecimals, quoteDecimals);
  }

  /**
   * Returns current cached state if already observed.
   */
  public getCached(poolAddress: string): DbcPoolInfo | null {
    return this.cache.get(poolAddress) ?? null;
  }

  private async fetchAndEmit(
    poolAddress: PublicKey,
    baseDecimals: number,
    quoteDecimals: number
  ): Promise<DbcPoolInfo | null> {
    if (this.isDestroyed) return null;

    try {
      const poolAcc = await this.client.state.getPool(poolAddress);
      if (!poolAcc || !poolAcc.poolState) return null;

      const pState = poolAcc.poolState;
      const configAddress = pState.config;
      const poolConfig = await this.client.state.getPoolConfig(configAddress);

      const sqrtPriceBN = pState.sqrtPrice;
      const priceNumeric = Number(getPriceFromSqrtPrice(sqrtPriceBN, baseDecimals, quoteDecimals).toString());

      const curvePoints = (poolConfig.curve || []).map((cp: { sqrtPrice: { toString(): string }; liquidity: { toString(): string } }) => ({
        sqrtPrice: BigInt(cp.sqrtPrice.toString()),
        liquidity: BigInt(cp.liquidity.toString()),
      }));

      const isMigrated = Boolean(pState.isMigrated);
      const quoteReserve = BigInt(pState.quoteReserve.toString());
      const migrationQuoteThreshold = BigInt(poolConfig.migrationQuoteThreshold.toString());

      const info: DbcPoolInfo = {
        poolAddress,
        configAddress,
        baseMint: pState.baseMint,
        quoteMint: poolConfig.quoteMint,
        baseReserve: BigInt(pState.baseReserve.toString()),
        quoteReserve,
        sqrtPrice: BigInt(sqrtPriceBN.toString()),
        activationPoint: BigInt(pState.activationPoint?.toString() ?? "0"),
        migrationQuoteThreshold,
        migrationBaseThreshold: BigInt(poolConfig.migrationBaseThreshold.toString()),
        migrationSqrtPrice: BigInt(poolConfig.migrationSqrtPrice.toString()),
        sqrtStartPrice: BigInt(poolConfig.sqrtStartPrice.toString()),
        priceUsd: priceNumeric,
        curve: curvePoints,
        isMigrated,
        hasSwap: Boolean(pState.hasSwap),
        environment: "DEVNET TEST POOL",
      };

      const key = poolAddress.toBase58();
      this.cache.set(key, info);

      const set = this.listeners.get(key);
      if (set) {
        for (const cb of set) {
          try {
            cb(info);
          } catch (e) {
            console.error("[DbcStream] Listener error:", e);
          }
        }
      }

      return info;
    } catch (err) {
      console.warn(`[DbcStream] Error fetching pool ${poolAddress.toBase58()}:`, err);
      return null;
    }
  }

  private startStreaming(
    poolAddress: PublicKey,
    baseDecimals: number,
    quoteDecimals: number
  ): void {
    const key = poolAddress.toBase58();

    try {
      const subId = this.connection.onAccountChange(
        poolAddress,
        () => {
          this.fetchAndEmit(poolAddress, baseDecimals, quoteDecimals).catch((e) =>
            console.warn("[DbcStream] WebSocket update handler error:", e)
          );
        },
        "confirmed"
      );
      this.subscriptions.set(key, subId);
    } catch (e) {
      console.warn(`[DbcStream] Failed to register WebSocket for ${key}:`, e);
    }

    // Periodic heartbeat poll (every 10s) as fallback for dropped WebSockets
    const timer = setInterval(() => {
      this.fetchAndEmit(poolAddress, baseDecimals, quoteDecimals).catch(() => {});
    }, 10_000);
    this.pollTimers.set(key, timer);
  }

  private stopStreaming(key: string): void {
    const subId = this.subscriptions.get(key);
    if (subId !== undefined) {
      this.connection.removeAccountChangeListener(subId).catch(() => {});
      this.subscriptions.delete(key);
    }

    const timer = this.pollTimers.get(key);
    if (timer) {
      clearInterval(timer);
      this.pollTimers.delete(key);
    }
  }

  public destroy(): void {
    this.isDestroyed = true;
    for (const key of Array.from(this.subscriptions.keys())) {
      this.stopStreaming(key);
    }
    this.listeners.clear();
    this.cache.clear();
  }
}
