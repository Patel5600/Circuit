/**
 * Circuit Protocol - Realtime Connection Manager
 *
 * Centralized, single WebSocket connection manager for Solana RPC & telemetry:
 * - Single persistent WebSocket connection with automatic backoff reconnection
 * - Reference-counted, deduplicated subscription registry
 * - Account change, slot stream, and transaction log streaming
 * - Clean unsubscribe when reference count reaches 0
 * - Page visibility handling: detects backgrounding and seamlessly resyncs
 * - Latency and health telemetry tracking
 */

import { Connection, PublicKey, AccountInfo } from "@solana/web3.js";
import { RPC_URL } from "../../config";

export type ConnectionState = "connected" | "degraded" | "disconnected" | "reconnecting";

interface AccountSubRecord {
  pubkey: string;
  subId: number | null;
  refCount: number;
  callbacks: Set<(info: AccountInfo<Buffer>) => void>;
}

export class RealtimeConnectionManager {
  private static _instance: RealtimeConnectionManager | null = null;

  public static getInstance(): RealtimeConnectionManager {
    if (!RealtimeConnectionManager._instance) {
      RealtimeConnectionManager._instance = new RealtimeConnectionManager();
    }
    return RealtimeConnectionManager._instance;
  }

  private _connection: Connection;
  private _state: ConnectionState = "disconnected";
  private _stateListeners: Set<(state: ConnectionState) => void> = new Set();

  private _currentSlot: number | null = null;
  private _slotListeners: Set<(slot: number) => void> = new Set();
  private _slotSubId: number | null = null;

  private _accountSubs: Map<string, AccountSubRecord> = new Map();
  private _reconnectAttempts = 0;
  private _maxReconnectBackoffMs = 30000;
  private _reconnectTimer: any = null;

  private _lastHeartbeatTs = Date.now();
  private _lastSlotTs = Date.now();
  private _slotVelocity = 2.5; // default ~2.5 slots/sec on Solana

  constructor(rpcUrl: string = RPC_URL) {
    const wsUrl = rpcUrl.replace("https://", "wss://").replace("http://", "ws://");
    this._connection = new Connection(rpcUrl, {
      commitment: "confirmed",
      wsEndpoint: wsUrl,
    });

    this.initLifecycle();
  }

  public getConnection(): Connection {
    return this._connection;
  }

  public getState(): ConnectionState {
    return this._state;
  }

  public getCurrentSlot(): number | null {
    return this._currentSlot;
  }

  public getSlotVelocity(): number {
    return this._slotVelocity;
  }

  public subscribeState(listener: (state: ConnectionState) => void): () => void {
    this._stateListeners.add(listener);
    listener(this._state);
    return () => this._stateListeners.delete(listener);
  }

  public subscribeSlot(listener: (slot: number) => void): () => void {
    this._slotListeners.add(listener);
    if (this._currentSlot !== null) {
      listener(this._currentSlot);
    }
    return () => this._slotListeners.delete(listener);
  }

  /**
   * Reference-counted Account Subscription.
   * If an account is subscribed by multiple UI components or engines,
   * only ONE RPC websocket subscription is maintained.
   */
  public subscribeAccount(
    pubkeyStr: string,
    callback: (info: AccountInfo<Buffer>) => void
  ): () => void {
    let record = this._accountSubs.get(pubkeyStr);

    if (!record) {
      record = {
        pubkey: pubkeyStr,
        subId: null,
        refCount: 1,
        callbacks: new Set([callback]),
      };
      this._accountSubs.set(pubkeyStr, record);
      this.attachAccountSub(record);
    } else {
      record.refCount += 1;
      record.callbacks.add(callback);
    }

    return () => {
      const rec = this._accountSubs.get(pubkeyStr);
      if (rec) {
        rec.callbacks.delete(callback);
        rec.refCount -= 1;
        if (rec.refCount <= 0) {
          this.detachAccountSub(rec);
          this._accountSubs.delete(pubkeyStr);
        }
      }
    };
  }

  private attachAccountSub(record: AccountSubRecord) {
    try {
      const pk = new PublicKey(record.pubkey);
      record.subId = this._connection.onAccountChange(
        pk,
        (info) => {
          record.callbacks.forEach((cb) => {
            try {
              cb(info);
            } catch (err) {
              console.warn(`Error in account callback for ${record.pubkey}:`, err);
            }
          });
        },
        "confirmed"
      );
    } catch (err) {
      console.warn(`Failed to attach account subscription for ${record.pubkey}:`, err);
    }
  }

  private detachAccountSub(record: AccountSubRecord) {
    if (record.subId !== null) {
      try {
        this._connection.removeAccountChangeListener(record.subId).catch(() => {});
      } catch (err) {
        console.warn(`Failed to remove account sub ${record.subId}:`, err);
      }
      record.subId = null;
    }
  }

  private initLifecycle() {
    this.setState("reconnecting");
    this.startSlotStream();

    // Browser visibility handling
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          this.reconnect();
        }
      });
    }

    // Network online/offline
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => this.reconnect());
      window.addEventListener("offline", () => this.setState("disconnected"));
    }
  }

  private startSlotStream() {
    try {
      if (this._slotSubId !== null) {
        this._connection.removeSlotChangeListener(this._slotSubId).catch(() => {});
      }

      this._slotSubId = this._connection.onSlotChange((slotInfo) => {
        const now = Date.now();
        const deltaSec = (now - this._lastSlotTs) / 1000;
        if (deltaSec > 0 && this._currentSlot !== null) {
          const deltaSlot = slotInfo.slot - this._currentSlot;
          if (deltaSlot > 0) {
            this._slotVelocity = Number((deltaSlot / deltaSec).toFixed(2));
          }
        }
        this._lastSlotTs = now;
        this._lastHeartbeatTs = now;
        this._currentSlot = slotInfo.slot;

        if (this._state !== "connected") {
          this.setState("connected");
          this._reconnectAttempts = 0;
        }

        this._slotListeners.forEach((l) => {
          try {
            l(slotInfo.slot);
          } catch (err) {
            console.warn("Slot listener error:", err);
          }
        });
      });
    } catch (err) {
      console.warn("Failed to initiate slot stream:", err);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this._reconnectTimer) return;
    this.setState("reconnecting");

    const backoffMs = Math.min(
      1000 * Math.pow(2, this._reconnectAttempts),
      this._maxReconnectBackoffMs
    );
    this._reconnectAttempts++;

    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this.reconnect();
    }, backoffMs);
  }

  public reconnect() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    this.setState("reconnecting");
    this.startSlotStream();

    // Reattach all active account subscriptions
    this._accountSubs.forEach((record) => {
      this.detachAccountSub(record);
      this.attachAccountSub(record);
    });
  }

  private setState(next: ConnectionState) {
    if (this._state === next) return;
    this._state = next;
    this._stateListeners.forEach((l) => l(next));
  }
}

export const realtimeConnection = RealtimeConnectionManager.getInstance();
