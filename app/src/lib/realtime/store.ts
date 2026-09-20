/**
 * Circuit Protocol — Canonical Realtime Store
 *
 * Every datum in the system carries metadata distinguishing:
 * value, source, slot, observedAt, freshness, status, error
 *
 * This prevents stale values from being silently reused as live values.
 */

export type Freshness = "FRESH" | "STALE" | "UNKNOWN";
export type DatumStatus = "LIVE" | "LOADING" | "UNAVAILABLE" | "ERROR";

export interface RealtimeDatum<T> {
  value: T;
  source: string;
  slot: number;
  observedAt: number; // unix ms
  freshness: Freshness;
  status: DatumStatus;
  error?: string;
}

export function makeDatum<T>(
  value: T,
  source: string,
  slot: number = 0
): RealtimeDatum<T> {
  return {
    value,
    source,
    slot,
    observedAt: Date.now(),
    freshness: "FRESH",
    status: "LIVE",
  };
}

export function makeLoading<T>(defaultValue: T): RealtimeDatum<T> {
  return {
    value: defaultValue,
    source: "none",
    slot: 0,
    observedAt: 0,
    freshness: "UNKNOWN",
    status: "LOADING",
  };
}

export function makeUnavailable<T>(
  defaultValue: T,
  error?: string
): RealtimeDatum<T> {
  return {
    value: defaultValue,
    source: "none",
    slot: 0,
    observedAt: 0,
    freshness: "UNKNOWN",
    status: error ? "ERROR" : "UNAVAILABLE",
    error,
  };
}

export function markStale<T>(datum: RealtimeDatum<T>): RealtimeDatum<T> {
  return { ...datum, freshness: "STALE" };
}

/** Classify freshness based on age in seconds */
export function classifyDatumFreshness(ageSeconds: number): Freshness {
  if (ageSeconds < 0 || ageSeconds <= 45) return "FRESH";
  if (ageSeconds <= 300) return "STALE";
  return "UNKNOWN";
}

/** Check if a datum is usable (has real data, not just a placeholder) */
export function isDatumLive<T>(datum: RealtimeDatum<T>): boolean {
  return datum.status === "LIVE" && datum.freshness !== "UNKNOWN";
}

/** Type-safe subscription store */
export type Listener<T> = (value: T) => void;

export class RealtimeStore<T> {
  private _state: T;
  private _listeners: Set<Listener<T>> = new Set();

  constructor(initialState: T) {
    this._state = initialState;
  }

  get state(): T {
    return this._state;
  }

  update(updater: (prev: T) => T): void {
    this._state = updater(this._state);
    this._listeners.forEach((fn) => fn(this._state));
  }

  set(next: T): void {
    this._state = next;
    this._listeners.forEach((fn) => fn(this._state));
  }

  subscribe(listener: Listener<T>): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  destroy(): void {
    this._listeners.clear();
  }
}
