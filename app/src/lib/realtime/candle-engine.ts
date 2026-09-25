/**
 * Circuit Protocol - Realtime Candle Engine & Ingestion Pipeline
 *
 * Builds authenticated OHLCV candles from genuine real-time price observations:
 * - Supports intervals: 1m, 5m, 15m, 1h, 4h, 1d
 * - Current candle update: update high/low/close and volume
 * - New bucket creation: rollover into fresh candle at time boundary
 * - Memory-bounded ring buffer: caps history to max 1,000 candles per interval
 * - Deduplication & Monotonicity: guarantees strictly increasing timestamps for Lightweight Charts
 * - Batched animation frame updates to prevent frame drops
 */

export type CandleTimeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export const TIMEFRAME_SECONDS: Record<CandleTimeframe, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
};

export interface ChartCandle {
  time: number; // Unix timestamp in seconds (Lightweight Charts UTCTimestamp)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export class RealtimeCandleEngine {
  private static _instance: RealtimeCandleEngine | null = null;

  public static getInstance(): RealtimeCandleEngine {
    if (!RealtimeCandleEngine._instance) {
      RealtimeCandleEngine._instance = new RealtimeCandleEngine();
    }
    return RealtimeCandleEngine._instance;
  }

  private _maxBufferPerTimeframe = 1000;
  // Map of `symbol:timeframe` -> ChartCandle[]
  private _buffers: Map<string, ChartCandle[]> = new Map();
  // Callbacks for incremental candle updates: `symbol:timeframe` -> Set<(candle: ChartCandle, isNew: boolean) => void>
  private _subscribers: Map<string, Set<(candle: ChartCandle, isNew: boolean) => void>> = new Map();

  // Pending rAF batch
  private _pendingTicks: Map<string, Array<{ price: number; volume: number; timestampSec: number }>> = new Map();
  private _rafScheduled = false;

  /**
   * Initialize historical candles for an asset and timeframe.
   * Guarantees strict monotonic ascending sort and zero duplicates.
   */
  public setHistoricalCandles(
    symbol: string,
    timeframe: CandleTimeframe,
    candles: ChartCandle[]
  ) {
    const key = `${symbol.toUpperCase()}:${timeframe}`;
    const sorted = [...candles]
      .filter(
        (c) =>
          typeof c.time === "number" &&
          typeof c.open === "number" &&
          typeof c.high === "number" &&
          typeof c.low === "number" &&
          typeof c.close === "number" &&
          c.high >= c.low &&
          c.close > 0
      )
      .sort((a, b) => a.time - b.time);

    // Deduplicate by time (latest wins)
    const deduped: ChartCandle[] = [];
    for (const c of sorted) {
      if (deduped.length === 0 || deduped[deduped.length - 1].time !== c.time) {
        deduped.push(c);
      } else {
        deduped[deduped.length - 1] = c;
      }
    }

    // Apply ring buffer cap
    const trimmed =
      deduped.length > this._maxBufferPerTimeframe
        ? deduped.slice(-this._maxBufferPerTimeframe)
        : deduped;

    this._buffers.set(key, trimmed);
  }

  public getCandles(symbol: string, timeframe: CandleTimeframe): ChartCandle[] {
    const key = `${symbol.toUpperCase()}:${timeframe}`;
    return this._buffers.get(key) ?? [];
  }

  /**
   * Ingest a new real-time price tick and batch it with requestAnimationFrame.
   */
  public ingestTick(
    symbol: string,
    price: number,
    volume: number = 0,
    timestampMs: number = Date.now()
  ) {
    const sym = symbol.toUpperCase();
    let list = this._pendingTicks.get(sym);
    if (!list) {
      list = [];
      this._pendingTicks.set(sym, list);
    }
    list.push({
      price,
      volume,
      timestampSec: Math.floor(timestampMs / 1000),
    });

    if (!this._rafScheduled) {
      this._rafScheduled = true;
      if (typeof window !== "undefined" && window.requestAnimationFrame) {
        window.requestAnimationFrame(() => this.flushTicks());
      } else {
        setTimeout(() => this.flushTicks(), 16);
      }
    }
  }

  public flushTicks() {
    this._rafScheduled = false;
    const entries = Array.from(this._pendingTicks.entries());
    this._pendingTicks.clear();

    for (const [sym, tickList] of entries) {
      for (const tick of tickList) {
        const timeframes: CandleTimeframe[] = ["1m", "5m", "15m", "1h", "4h", "1d"];
        for (const tf of timeframes) {
          this.processTickForTimeframe(sym, tf, tick.price, tick.volume, tick.timestampSec);
        }
      }
    }
  }

  private processTickForTimeframe(
    symbol: string,
    timeframe: CandleTimeframe,
    price: number,
    volume: number,
    timestampSec: number
  ) {
    const key = `${symbol}:${timeframe}`;
    const intervalSec = TIMEFRAME_SECONDS[timeframe];
    const bucketTime = Math.floor(timestampSec / intervalSec) * intervalSec;

    let buffer = this._buffers.get(key);
    if (!buffer) {
      buffer = [];
      this._buffers.set(key, buffer);
    }

    let isNew = false;
    let targetCandle: ChartCandle;

    if (buffer.length === 0) {
      isNew = true;
      targetCandle = {
        time: bucketTime,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: volume,
      };
      buffer.push(targetCandle);
    } else {
      const last = buffer[buffer.length - 1];
      if (last.time === bucketTime) {
        // Update current candle
        last.high = Math.max(last.high, price);
        last.low = Math.min(last.low, price);
        last.close = price;
        last.volume += volume;
        targetCandle = last;
      } else if (bucketTime > last.time) {
        // Roll over to new candle
        isNew = true;
        targetCandle = {
          time: bucketTime,
          open: price,
          high: price,
          low: price,
          close: price,
          volume: volume,
        };
        buffer.push(targetCandle);

        // Ring buffer trim
        if (buffer.length > this._maxBufferPerTimeframe) {
          buffer.shift();
        }
      } else {
        // Out of order late tick arrived - safely ignore or update past candle
        return;
      }
    }

    // Notify series subscribers
    const subs = this._subscribers.get(key);
    if (subs) {
      subs.forEach((cb) => {
        try {
          cb(targetCandle, isNew);
        } catch (e) {
          console.warn("Candle subscriber error:", e);
        }
      });
    }
  }

  /**
   * Subscribe to incremental candle updates for a chart series.
   */
  public subscribeCandles(
    symbol: string,
    timeframe: CandleTimeframe,
    callback: (candle: ChartCandle, isNew: boolean) => void
  ): () => void {
    const key = `${symbol.toUpperCase()}:${timeframe}`;
    let set = this._subscribers.get(key);
    if (!set) {
      set = new Set();
      this._subscribers.set(key, set);
    }
    set.add(callback);

    return () => {
      const s = this._subscribers.get(key);
      if (s) {
        s.delete(callback);
        if (s.size === 0) {
          this._subscribers.delete(key);
        }
      }
    };
  }
}

export const candleEngine = RealtimeCandleEngine.getInstance();
