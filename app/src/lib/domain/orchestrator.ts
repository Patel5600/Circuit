/**
 * Circuit Protocol - Coordinated RPC Orchestrator & Request Deduplicator
 *
 * Prevents redundant Devnet RPC calls by batching, deduplicating in-flight requests,
 * throttling when tab is hidden, and handling selective invalidation.
 */

import { Connection, PublicKey, AccountInfo } from "@solana/web3.js";
import { InvalidationScope } from "./types";

export class RpcOrchestrator {
  private connection: Connection;
  private inFlightRequests: Map<string, Promise<any>> = new Map();
  private cache: Map<string, { data: any; expiry: number }> = new Map();
  private invalidationListeners: Set<(scope: InvalidationScope) => void> = new Set();
  private visibilityListeners: Set<(isVisible: boolean) => void> = new Set();
  private isTabVisible: boolean = typeof document !== "undefined" ? !document.hidden : true;

  constructor(connection: Connection) {
    this.connection = connection;

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        const visible = !document.hidden;
        this.isTabVisible = visible;
        this.visibilityListeners.forEach((fn) => {
          try {
            fn(visible);
          } catch (e) {
            console.error("Visibility listener error", e);
          }
        });
      });
    }
  }

  public getConnection(): Connection {
    return this.connection;
  }

  public isVisible(): boolean {
    return this.isTabVisible;
  }

  public onVisibilityChange(listener: (isVisible: boolean) => void): () => void {
    this.visibilityListeners.add(listener);
    return () => this.visibilityListeners.delete(listener);
  }

  public onInvalidate(listener: (scope: InvalidationScope) => void): () => void {
    this.invalidationListeners.add(listener);
    return () => this.invalidationListeners.delete(listener);
  }

  public invalidate(scope: InvalidationScope): void {
    // Clear relevant caches
    if (scope.portfolio) {
      this.clearCachePrefix("portfolio:");
    }
    if (scope.protocol) {
      this.clearCachePrefix("protocol:");
    }
    if (scope.markets) {
      this.clearCachePrefix("market:");
      this.clearCachePrefix("pyth:");
    }
    if (scope.wallet) {
      this.clearCachePrefix("balance:");
    }
    if (scope.activity) {
      this.clearCachePrefix("signatures:");
    }

    // Notify all listeners
    this.invalidationListeners.forEach((listener) => {
      try {
        listener(scope);
      } catch (err) {
        console.error("Invalidation listener error", err);
      }
    });
  }

  private clearCachePrefix(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Deduplicated & cached account fetch.
   */
  public async getAccountInfo(
    pubkey: PublicKey,
    ttlMs: number = 3000
  ): Promise<AccountInfo<Buffer> | null> {
    const key = `account:${pubkey.toBase58()}`;
    return this.dedupeAndCache(key, ttlMs, () => this.connection.getAccountInfo(pubkey));
  }

  /**
   * Deduplicated & cached balance fetch.
   */
  public async getBalance(pubkey: PublicKey, ttlMs: number = 4000): Promise<number> {
    const key = `balance:${pubkey.toBase58()}`;
    return this.dedupeAndCache(key, ttlMs, () => this.connection.getBalance(pubkey));
  }

  /**
   * Generic deduplication + TTL caching engine.
   */
  public async dedupeAndCache<T>(
    key: string,
    ttlMs: number,
    fetcher: () => Promise<T>
  ): Promise<T> {
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && cached.expiry > now) {
      return cached.data as T;
    }

    if (this.inFlightRequests.has(key)) {
      return this.inFlightRequests.get(key) as Promise<T>;
    }

    const promise = fetcher()
      .then((data) => {
        this.cache.set(key, { data, expiry: Date.now() + ttlMs });
        this.inFlightRequests.delete(key);
        return data;
      })
      .catch((err) => {
        this.inFlightRequests.delete(key);
        throw err;
      });

    this.inFlightRequests.set(key, promise);
    return promise;
  }
}
