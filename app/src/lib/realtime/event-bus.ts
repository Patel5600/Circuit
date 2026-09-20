/**
 * Circuit Protocol — Realtime Event Bus
 *
 * Typed event emitter for protocol state changes.
 * Every event has a real timestamp (Date.now()), never invented.
 * If no event happened, the stream is empty — not fake activity.
 */

import type { RiskRatchetState } from "../risk/ratchet";

export type ProtocolEventType =
  | "ORACLE_UPDATE"
  | "RISK_TRANSITION"
  | "PERMISSION_CHANGE"
  | "POSITION_CHANGE"
  | "TRANSACTION_LIFECYCLE"
  | "AGENT_STATE_CHANGE"
  | "AUTHORITY_CHANGE"
  | "NETWORK_STATUS_CHANGE"
  | "SYSTEM_EVENT";

export interface ProtocolEvent {
  id: string;
  type: ProtocolEventType;
  timestamp: number; // Date.now() — real, never invented
  source: string;
  summary: string;
  detail?: string;
  assetSymbol?: string;
  data?: Record<string, unknown>;
}

export interface OracleUpdateEvent extends ProtocolEvent {
  type: "ORACLE_UPDATE";
  data: {
    symbol: string;
    priceUsd: number;
    confBps: number;
    publishTime: number;
    ageSeconds: number;
    slot?: number;
  };
}

export interface RiskTransitionEvent extends ProtocolEvent {
  type: "RISK_TRANSITION";
  data: {
    from: RiskRatchetState;
    to: RiskRatchetState;
    reason: string;
  };
}

export interface PermissionChangeEvent extends ProtocolEvent {
  type: "PERMISSION_CHANGE";
  data: {
    action: string;
    previousStatus: string;
    newStatus: string;
    reason?: string;
  };
}

let _nextId = 1;
function generateEventId(): string {
  return `evt_${Date.now()}_${_nextId++}`;
}

export function createEvent(
  type: ProtocolEventType,
  source: string,
  summary: string,
  opts?: {
    detail?: string;
    assetSymbol?: string;
    data?: Record<string, unknown>;
  }
): ProtocolEvent {
  return {
    id: generateEventId(),
    type,
    timestamp: Date.now(),
    source,
    summary,
    detail: opts?.detail,
    assetSymbol: opts?.assetSymbol,
    data: opts?.data,
  };
}

export type EventListener = (event: ProtocolEvent) => void;
export type EventFilter = (event: ProtocolEvent) => boolean;

export class ProtocolEventBus {
  private _listeners: Set<{
    filter: EventFilter | null;
    handler: EventListener;
  }> = new Set();
  private _history: ProtocolEvent[] = [];
  private _maxHistory: number;

  constructor(maxHistory = 200) {
    this._maxHistory = maxHistory;
  }

  emit(event: ProtocolEvent): void {
    this._history.push(event);
    if (this._history.length > this._maxHistory) {
      this._history.shift();
    }
    this._listeners.forEach(({ filter, handler }) => {
      if (!filter || filter(event)) {
        try {
          handler(event);
        } catch (e) {
          console.error("[EventBus] Listener error:", e);
        }
      }
    });
  }

  on(handler: EventListener, filter?: EventFilter): () => void {
    const entry = { filter: filter ?? null, handler };
    this._listeners.add(entry);
    return () => {
      this._listeners.delete(entry);
    };
  }

  onType(type: ProtocolEventType, handler: EventListener): () => void {
    return this.on(handler, (e) => e.type === type);
  }

  get history(): readonly ProtocolEvent[] {
    return this._history;
  }

  /** Recent events, newest first */
  recent(count = 50): ProtocolEvent[] {
    return this._history.slice(-count).reverse();
  }

  clear(): void {
    this._history = [];
  }

  destroy(): void {
    this._listeners.clear();
    this._history = [];
  }
}

/** Singleton event bus for the application */
export const protocolEventBus = new ProtocolEventBus();
