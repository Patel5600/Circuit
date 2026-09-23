/**
 * Circuit Protocol - Unified Live Transport Layer
 *
 * Stream-First, Non-Blocking, Rate-Limit Resilient Architecture:
 * 1. RpcScheduler: Priority queue (P0-P4), concurrency ceiling (3), in-flight deduplication,
 *    bounded timeouts (3.5s), and exponential backoff with jitter on HTTP 429.
 * 2. SubscriptionRegistry: Ref-counted, deduplicated WebSocket subscriptions per account pubkey.
 * 3. SlotStream: Independent, reactive slot heartbeat via connection.onSlotChange.
 * 4. CircuitHealthTracker: Independent health status for RPC, WebSocket, Pyth, and Program.
 */

import { Connection, PublicKey, AccountInfo, SlotInfo } from "@solana/web3.js";

// ============================================================================
// Types & Priority Levels
// ============================================================================

export type RpcPriority =
  | "P0_CRITICAL"     // Tx simulation, signature confirmation, user-directed execution
  | "P1_ACTIVE_MARKET" // User's currently inspected market Pyth feed and position PDA
  | "P2_PORTFOLIO"     // Portfolio overview and user positions batch
  | "P3_MARKETS_LIST"  // Secondary markets and catalog data
  | "P4_BACKGROUND";   // Background metrics and telemetry

export const PRIORITY_WEIGHTS: Record<RpcPriority, number> = {
  P0_CRITICAL: 0,
  P1_ACTIVE_MARKET: 1,
  P2_PORTFOLIO: 2,
  P3_MARKETS_LIST: 3,
  P4_BACKGROUND: 4,
};

export type SubsystemHealth = "CONNECTING" | "LIVE" | "DEGRADED" | "RECONNECTING" | "OFFLINE" | "UNAVAILABLE";

export interface TransportHealthState {
  solanaRpc: SubsystemHealth;
  solanaWs: SubsystemHealth;
  pythOracle: SubsystemHealth;
  programState: SubsystemHealth;
  currentSlot: number | null;
  rpcLatencyMs: number;
  rateLimitHits: number;
  lastSyncTime: number | null;
}

export interface ScheduledTask<T> {
  id: string;
  key: string;
  priority: RpcPriority;
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: any) => void;
  timeoutMs: number;
  enqueuedAt: number;
  retries: number;
}

// ============================================================================
// 1. Centralized Request Scheduler
// ============================================================================

export class RpcScheduler {
  private maxConcurrency: number;
  private baseBackoffMs: number;
  private activeCount: number = 0;
  private queue: ScheduledTask<any>[] = [];
  private inFlightMap: Map<string, Promise<any>> = new Map();
  private cache: Map<string, { value: any; expiresAt: number }> = new Map();

  // Rate-limiting backoff state
  private isBackingOff: boolean = false;
  private backoffMultiplier: number = 1;
  private backoffResetTimer: NodeJS.Timeout | null = null;
  private consecutive429s: number = 0;

  // Telemetry callback
  public onHealthChange?: (health: Partial<TransportHealthState>) => void;

  constructor(maxConcurrency: number = 3, baseBackoffMs: number = 1000) {
    this.maxConcurrency = maxConcurrency;
    this.baseBackoffMs = baseBackoffMs;
  }

  /**
   * Schedule an RPC operation through the priority queue with deduplication,
   * bounded timeouts, and rate-limit resilience.
   */
  public schedule<T>(
    key: string,
    priority: RpcPriority,
    execute: () => Promise<T>,
    options?: {
      timeoutMs?: number;
      ttlMs?: number;
      bypassCache?: boolean;
    }
  ): Promise<T> {
    const timeoutMs = options?.timeoutMs ?? 3500;
    const ttlMs = options?.ttlMs ?? 0;
    const bypassCache = options?.bypassCache ?? false;

    // 1. Check TTL cache if not bypassed
    if (!bypassCache && ttlMs > 0) {
      const cached = this.cache.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        return Promise.resolve(cached.value as T);
      }
    }

    // 2. In-flight promise deduplication
    if (this.inFlightMap.has(key)) {
      return this.inFlightMap.get(key)! as Promise<T>;
    }

    const promise = new Promise<T>((resolve, reject) => {
      const taskId = `${key}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const task: ScheduledTask<T> = {
        id: taskId,
        key,
        priority,
        execute,
        resolve: (val) => {
          if (ttlMs > 0) {
            this.cache.set(key, { value: val, expiresAt: Date.now() + ttlMs });
          }
          resolve(val);
        },
        reject,
        timeoutMs,
        enqueuedAt: Date.now(),
        retries: 0,
      };

      this.enqueue(task);
      this.processQueue();
    });

    // Record in-flight promise and clear on completion
    this.inFlightMap.set(key, promise);
    promise.finally(() => {
      this.inFlightMap.delete(key);
    });

    return promise;
  }

  private enqueue<T>(task: ScheduledTask<T>): void {
    // Insert ordered by priority (lower number = higher priority)
    const taskWeight = PRIORITY_WEIGHTS[task.priority];
    let inserted = false;
    for (let i = 0; i < this.queue.length; i++) {
      if (taskWeight < PRIORITY_WEIGHTS[this.queue[i].priority]) {
        this.queue.splice(i, 0, task);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      this.queue.push(task);
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isBackingOff) return;
    if (this.activeCount >= this.maxConcurrency) return;
    if (this.queue.length === 0) return;

    const task = this.queue.shift();
    if (!task) return;

    this.activeCount++;
    const startTime = Date.now();

    // Execute with hard timeout
    let timer: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`RPC request timeout after ${task.timeoutMs}ms: [${task.key}]`));
      }, task.timeoutMs);
    });

    try {
      const result = await Promise.race([task.execute(), timeoutPromise]);
      if (timer) clearTimeout(timer);

      const latency = Date.now() - startTime;
      this.onSuccess(latency);
      task.resolve(result);
    } catch (err: any) {
      if (timer) clearTimeout(timer);

      const is429 = this.isRateLimitError(err);
      if (is429) {
        this.handleRateLimit(task, err);
      } else {
        task.reject(err);
      }
    } finally {
      this.activeCount--;
      // Continue draining queue
      setTimeout(() => this.processQueue(), 10);
    }
  }

  private isRateLimitError(err: any): boolean {
    if (!err) return false;
    const msg = String(err?.message || err);
    return (
      msg.includes("429") ||
      msg.includes("Too Many Requests") ||
      msg.includes("Connection rate limits exceeded") ||
      msg.includes("rate limit")
    );
  }

  private handleRateLimit<T>(task: ScheduledTask<T>, err: any): void {
    this.consecutive429s++;
    this.isBackingOff = true;

    // Report degradation
    if (this.onHealthChange) {
      this.onHealthChange({
        solanaRpc: "DEGRADED",
        rateLimitHits: this.consecutive429s,
      });
    }

    // Exponential backoff with jitter: baseBackoffMs * (2 ^ min(attempts, 4)) +/- 20%
    const baseDelay = this.baseBackoffMs * Math.pow(2, Math.min(this.consecutive429s, 4));
    const jitter = (Math.random() - 0.5) * 0.4 * baseDelay;
    const backoffMs = Math.round(Math.min(baseDelay + jitter, 15000));

    console.warn(`[RpcScheduler] 429 Rate Limit hit. Backing off for ${backoffMs}ms (attempt ${this.consecutive429s})`);

    // Re-queue task if under retry limit (max 2 retries)
    if (task.retries < 2) {
      task.retries++;
      this.enqueue(task);
    } else {
      task.reject(err);
    }

    // Schedule resumption
    setTimeout(() => {
      this.isBackingOff = false;
      this.processQueue();
    }, backoffMs);

    // Reset backoff streak after 30 seconds of quiet
    if (this.backoffResetTimer) clearTimeout(this.backoffResetTimer);
    this.backoffResetTimer = setTimeout(() => {
      this.consecutive429s = 0;
      this.backoffMultiplier = 1;
      if (this.onHealthChange) {
        this.onHealthChange({ solanaRpc: "LIVE" });
      }
    }, 30000);
  }

  private onSuccess(latencyMs: number): void {
    if (this.onHealthChange) {
      this.onHealthChange({
        solanaRpc: "LIVE",
        rpcLatencyMs: latencyMs,
        lastSyncTime: Date.now(),
      });
    }
  }

  public clearCache(): void {
    this.cache.clear();
  }

  public getPendingCount(): number {
    return this.queue.length;
  }

  public getActiveCount(): number {
    return this.activeCount;
  }
}

// ============================================================================
// 2. Centralized Subscription Registry (Deduplicated WebSocket Accounts)
// ============================================================================

interface SubscriptionEntry {
  subId: number | null;
  subscribers: Set<(info: AccountInfo<Buffer>) => void>;
  teardownTimer: NodeJS.Timeout | null;
}

export class SubscriptionRegistry {
  private subscriptions: Map<string, SubscriptionEntry> = new Map();
  private teardownGraceMs: number = 5000; // Debounce unmounts to prevent subscription thrash

  public subscribeAccount(
    connection: Connection,
    pubkey: PublicKey,
    callback: (info: AccountInfo<Buffer>) => void
  ): () => void {
    const key = pubkey.toBase58();
    let entry = this.subscriptions.get(key);

    if (!entry) {
      entry = {
        subId: null,
        subscribers: new Set(),
        teardownTimer: null,
      };
      this.subscriptions.set(key, entry);

      try {
        entry.subId = connection.onAccountChange(
          pubkey,
          (info) => {
            const currentEntry = this.subscriptions.get(key);
            if (currentEntry) {
              currentEntry.subscribers.forEach((sub) => {
                try {
                  sub(info);
                } catch (e) {
                  console.error(`Subscription error for account ${key}:`, e);
                }
              });
            }
          },
          "confirmed"
        );
      } catch (err) {
        console.warn(`Failed to open account subscription for ${key}:`, err);
      }
    } else if (entry.teardownTimer) {
      // Cancel pending teardown if a subscriber reconnected during grace period
      clearTimeout(entry.teardownTimer);
      entry.teardownTimer = null;
    }

    entry.subscribers.add(callback);

    // Return unsubscriber
    return () => {
      const curEntry = this.subscriptions.get(key);
      if (!curEntry) return;

      curEntry.subscribers.delete(callback);

      if (curEntry.subscribers.size === 0) {
        // Start debounced teardown
        if (curEntry.teardownTimer) clearTimeout(curEntry.teardownTimer);
        curEntry.teardownTimer = setTimeout(() => {
          if (curEntry.subscribers.size === 0) {
            if (curEntry.subId !== null) {
              try {
                connection.removeAccountChangeListener(curEntry.subId);
              } catch {}
            }
            this.subscriptions.delete(key);
          }
        }, this.teardownGraceMs);
      }
    };
  }

  public getSubscriberCount(pubkey: PublicKey): number {
    return this.subscriptions.get(pubkey.toBase58())?.subscribers.size ?? 0;
  }

  public clearAll(connection: Connection): void {
    this.subscriptions.forEach((entry) => {
      if (entry.teardownTimer) clearTimeout(entry.teardownTimer);
      if (entry.subId !== null) {
        try {
          connection.removeAccountChangeListener(entry.subId);
        } catch {}
      }
    });
    this.subscriptions.clear();
  }
}

// ============================================================================
// 3. Independent Reactive Slot Stream
// ============================================================================

export class SlotStream {
  private currentSlot: number | null = null;
  private subId: number | null = null;
  private listeners: Set<(slot: number) => void> = new Set();
  private connection: Connection | null = null;

  public init(connection: Connection): void {
    if (this.connection === connection && this.subId !== null) return;
    this.destroy();
    this.connection = connection;

    // Immediately fetch current slot to seed state without waiting for first WS tick
    connection
      .getSlot("confirmed")
      .then((slot) => {
        if (this.currentSlot === null) {
          this.updateSlot(slot);
        }
      })
      .catch(() => {});

    try {
      this.subId = connection.onSlotChange((slotInfo: SlotInfo) => {
        this.currentSlot = slotInfo.slot;
        this.listeners.forEach((listener) => {
          try {
            listener(slotInfo.slot);
          } catch (e) {
            console.error("SlotStream listener error:", e);
          }
        });
      });
    } catch (err) {
      console.warn("SlotStream onSlotChange failed, fallback to quiet mode:", err);
    }
  }

  public getCurrentSlot(): number | null {
    return this.currentSlot;
  }

  public updateSlot(slot: number): void {
    this.currentSlot = slot;
    this.listeners.forEach((listener) => {
      try {
        listener(slot);
      } catch (e) {
        console.error("SlotStream listener error:", e);
      }
    });
  }

  public subscribe(listener: (slot: number) => void): () => void {
    this.listeners.add(listener);
    if (this.currentSlot !== null) {
      listener(this.currentSlot);
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  public destroy(): void {
    if (this.subId !== null && this.connection) {
      try {
        this.connection.removeSlotChangeListener(this.subId);
      } catch {}
      this.subId = null;
    }
    this.connection = null;
  }
}

// ============================================================================
// 4. Circuit Transport Coordinator (Singleton)
// ============================================================================

export class CircuitTransport {
  public readonly scheduler: RpcScheduler;
  public readonly subscriptionRegistry: SubscriptionRegistry;
  public readonly slotStream: SlotStream;

  private healthState: TransportHealthState = {
    solanaRpc: "CONNECTING",
    solanaWs: "CONNECTING",
    pythOracle: "UNAVAILABLE" as SubsystemHealth,
    programState: "LIVE",
    currentSlot: null,
    rpcLatencyMs: 0,
    rateLimitHits: 0,
    lastSyncTime: null,
  };

  private healthListeners: Set<(state: TransportHealthState) => void> = new Set();

  constructor() {
    this.scheduler = new RpcScheduler(3); // Max 3 concurrent RPC requests
    this.subscriptionRegistry = new SubscriptionRegistry();
    this.slotStream = new SlotStream();

    this.scheduler.onHealthChange = (partial) => {
      this.updateHealth(partial);
    };

    this.slotStream.subscribe((slot) => {
      this.updateHealth({ currentSlot: slot, solanaWs: "LIVE" });
    });
  }

  public init(connection: Connection): void {
    this.slotStream.init(connection);
    this.updateHealth({ solanaRpc: "LIVE", solanaWs: "LIVE" });
  }

  public getHealth(): TransportHealthState {
    return this.healthState;
  }

  public updateHealth(partial: Partial<TransportHealthState>): void {
    let changed = false;
    for (const [k, v] of Object.entries(partial)) {
      if ((this.healthState as any)[k] !== v) {
        (this.healthState as any)[k] = v;
        changed = true;
      }
    }
    if (changed) {
      this.healthListeners.forEach((l) => {
        try {
          l(this.healthState);
        } catch (e) {
          console.error("Health listener error:", e);
        }
      });
    }
  }

  public subscribeHealth(listener: (state: TransportHealthState) => void): () => void {
    this.healthListeners.add(listener);
    listener(this.healthState);
    return () => {
      this.healthListeners.delete(listener);
    };
  }

  /**
   * Helper: Batched getMultipleAccountsInfo scheduled through the concurrency limiter.
   */
  public async getMultipleAccountsInfo(
    connection: Connection,
    pubkeys: PublicKey[],
    priority: RpcPriority = "P2_PORTFOLIO",
    ttlMs: number = 2000
  ): Promise<(AccountInfo<Buffer> | null)[]> {
    if (pubkeys.length === 0) return [];

    const key = `getMultipleAccountsInfo:[${pubkeys.map((p) => p.toBase58()).sort().join(",")}]`;
    return this.scheduler.schedule(
      key,
      priority,
      () => connection.getMultipleAccountsInfo(pubkeys),
      { ttlMs, timeoutMs: 3500 }
    );
  }

  /**
   * Helper: Single getAccountInfo scheduled through the concurrency limiter.
   */
  public async getAccountInfo(
    connection: Connection,
    pubkey: PublicKey,
    priority: RpcPriority = "P1_ACTIVE_MARKET",
    ttlMs: number = 2000
  ): Promise<AccountInfo<Buffer> | null> {
    const key = `getAccountInfo:${pubkey.toBase58()}`;
    return this.scheduler.schedule(
      key,
      priority,
      () => connection.getAccountInfo(pubkey),
      { ttlMs, timeoutMs: 3500 }
    );
  }

  /**
   * Helper: getBalance scheduled through the concurrency limiter.
   */
  public async getBalance(
    connection: Connection,
    pubkey: PublicKey,
    priority: RpcPriority = "P2_PORTFOLIO",
    ttlMs: number = 3000
  ): Promise<number> {
    const key = `getBalance:${pubkey.toBase58()}`;
    return this.scheduler.schedule(
      key,
      priority,
      () => connection.getBalance(pubkey),
      { ttlMs, timeoutMs: 3500 }
    );
  }
}

// Global Singleton
export const circuitTransport = new CircuitTransport();
