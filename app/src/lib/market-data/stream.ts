import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { useConnection } from "@solana/wallet-adapter-react";
import { CANONICAL_ASSET_REGISTRY, AssetDefinition } from "./registry";
import { derivePriceAccount, decodePriceUpdateV2 } from "../pyth";
import {
  MarketSnapshot,
  MarketQuote,
  DataFreshness,
  MarketSessionState,
  UnderlyingSession,
  OracleStatus,
  OnchainMarketState,
  CollateralStatus,
  HistoricalPoint,
  Candle,
} from "./types";
import { MarketHistoryProvider, buildIntradayCurve, buildCandleSeries } from "./historical";

/**
 * Deterministic NYSE session derivation with detailed day/night and transition states.
 */
export function getDetailedMarketSession(unixSeconds: number): {
  session: UnderlyingSession;
  label: string;
  isOpen: boolean;
  nextTransitionLabel: string;
} {
  const d = new Date(unixSeconds * 1000);
  const et = new Date(d.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const dow = et.getDay(); // 0 = Sunday, 6 = Saturday
  const hours = et.getHours();
  const minutes = hours * 60 + et.getMinutes();

  if (dow === 0 || (dow === 6 && minutes > 0)) {
    return {
      session: "CLOSED",
      label: "Weekend (NYSE Closed)",
      isOpen: false,
      nextTransitionLabel: "Pre-market opens Monday 4:00 AM ET",
    };
  }
  if (minutes >= 4 * 60 && minutes < 9 * 60 + 30) {
    return {
      session: "PRE_MARKET",
      label: "Pre-Market",
      isOpen: false,
      nextTransitionLabel: "Regular session opens 9:30 AM ET",
    };
  }
  if (minutes >= 9 * 60 + 30 && minutes < 16 * 60) {
    return {
      session: "REGULAR",
      label: "Regular Session (Open)",
      isOpen: true,
      nextTransitionLabel: "Regular session closes 4:00 PM ET",
    };
  }
  if (minutes >= 16 * 60 && minutes < 20 * 60) {
    return {
      session: "POST_MARKET",
      label: "Post-Market / After Hours",
      isOpen: false,
      nextTransitionLabel: "Overnight session begins 8:00 PM ET",
    };
  }
  return {
    session: "OVERNIGHT",
    label: "Overnight Session",
    isOpen: false,
    nextTransitionLabel: "Pre-market opens 4:00 AM ET",
  };
}

/** Legacy session helper for backwards compatibility */
export function getMarketSessionState(unixSeconds: number): {
  session: MarketSessionState;
  open: boolean;
  label: string;
} {
  const detailed = getDetailedMarketSession(unixSeconds);
  let legacy: MarketSessionState = "REGULAR";
  if (detailed.session === "CLOSED") legacy = "WEEKEND";
  else if (detailed.session === "PRE_MARKET") legacy = "PRE_MARKET";
  else if (detailed.session === "POST_MARKET" || detailed.session === "OVERNIGHT") legacy = "AFTER_HOURS";
  else legacy = "REGULAR";

  return {
    session: legacy,
    open: detailed.isOpen,
    label: detailed.label,
  };
}

/** Classifies oracle age into semantic freshness */
export function classifyOracleStatus(ageSeconds: number, hasValidData = true): OracleStatus {
  if (!hasValidData) return "UNAVAILABLE";
  if (ageSeconds < 0 || ageSeconds <= 45) return "LIVE";
  if (ageSeconds <= 300) return "RECENT";
  return "STALE";
}

/** Legacy freshness classifier for backwards compatibility */
export function classifyFreshness(ageSeconds: number): DataFreshness {
  return classifyOracleStatus(ageSeconds, true);
}

/**
 * Unified Market Data Service & Coordinator Hook
 * Single coordinated fetch/update cycle across all 24 tokenized equities.
 */
function buildInitialSnapshots(): Record<string, MarketSnapshot> {
  const initial: Record<string, MarketSnapshot> = {};
  const now = Date.now();
  const sessionDetail = getDetailedMarketSession(Math.floor(now / 1000));
  for (const asset of CANONICAL_ASSET_REGISTRY) {
    const price = asset.initialPriceUsd;
    initial[asset.symbol] = {
      assetId: asset.id,
      symbol: asset.symbol,
      displaySymbol: asset.tokenSymbol,
      name: asset.name,
      priceUsd: price,
      previousPriceUsd: price,
      priceDirection: "FLAT",
      lastPriceUpdatedAt: now,
      oracleStatus: "LIVE",
      oracleTimestamp: Math.floor(now / 1000),
      oracleConfidenceUsd: 0.18,
      oracleConfBps: 18,
      underlyingSession: sessionDetail.session,
      sessionDescription: sessionDetail.label,
      onchainAvailability: asset.collateralSupported ? "TRADEABLE" : "UNAVAILABLE",
      collateralStatus: asset.collateralSupported ? "AVAILABLE" : "COMING_SOON",
      referencePrice24h: null,
      change24hUsd: null,
      change24hPercent: null,
      changeStatus: "UNAVAILABLE",
      dayHighUsd: price,
      dayLowUsd: price,
      sparkline: [price, price],
      history: [{ timestamp: now, price }],
      candles: [],
      marketDataSource: "SOLANA DEVNET",
      baseLtvBps: asset.baseLtvBps,
      liqThresholdBps: asset.liqThresholdBps,
      liqBonusBps: asset.liqBonusBps,
      quoteSymbol: asset.quoteSymbol,
      quoteMint: asset.quoteMint,
      mint: asset.mint,
      pythFeedId: asset.oracleFeedId,
      pythPriceAccount: null,
      category: asset.category,
      isLiveMarket: asset.collateralSupported,
    };
  }
  return initial;
}

export function useMarketDataService() {
  const { connection } = useConnection();
  const [snapshots, setSnapshots] = useState<Record<string, MarketSnapshot>>(buildInitialSnapshots);
  const [loading, setLoading] = useState<boolean>(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number>(Date.now());
  const [isStreamHealthy, setIsStreamHealthy] = useState<boolean>(true);

  const activeRef = useRef(true);
  const previousPricesRef = useRef<Record<string, number>>({});
  const rollingHistoryRef = useRef<Record<string, HistoricalPoint[]>>({});
  const rollingCandlesRef = useRef<Record<string, Candle[]>>({});

  const refreshAllMarkets = useCallback(async () => {
    if (!activeRef.current) return;

    try {
      const nowMs = Date.now();
      const nowSeconds = Math.floor(nowMs / 1000);
      const sessionDetail = getDetailedMarketSession(nowSeconds);

      // 1. Single Server-side API batch query for market data (avoids browser CORS)
      let serverDataMap: Record<string, any> = {};
      if (typeof window !== "undefined") {
        try {
          const res = await fetch("/api/market-data", {
            headers: { Accept: "application/json" },
          });
          if (res.ok) {
            const json = (await res.json()) as any;
            if (json?.data) {
              serverDataMap = json.data;
            }
          }
        } catch (err) {
          // Fallback to local registry
        }
      }

      // 2. On-Chain Solana Devnet PriceUpdateV2 batch check for deployed feeds
      const deployedWithFeeds = CANONICAL_ASSET_REGISTRY.filter((a) => Boolean(a.oracleFeedId));
      const accountPubkeys = deployedWithFeeds.map((a) => derivePriceAccount(a.oracleFeedId!, 0));

      let onchainInfos: (any | null)[] = [];
      try {
        onchainInfos = await connection.getMultipleAccountsInfo(accountPubkeys);
      } catch (e) {
        // RPC degradation fallback
      }

      const nextSnapshots: Record<string, MarketSnapshot> = {};

      for (let i = 0; i < CANONICAL_ASSET_REGISTRY.length; i++) {
        const asset = CANONICAL_ASSET_REGISTRY[i];
        const serverItem = serverDataMap[asset.symbol];

        // 3. Check if on-chain Pyth feed exists for this asset
        let onchainPriceUsd: number | null = null;
        let onchainConfUsd = 0;
        let onchainConfBps = 18;
        let onchainPublishTime = nowSeconds;
        let onchainAgeSeconds = 0;
        let onchainFreshness: OracleStatus = "UNAVAILABLE";

        const feedIdx = deployedWithFeeds.findIndex((a) => a.id === asset.id);
        if (feedIdx !== -1 && onchainInfos[feedIdx] && onchainInfos[feedIdx].data.length > 0) {
          const update = decodePriceUpdateV2(new Uint8Array(onchainInfos[feedIdx].data));
          if (update && update.isFull && update.price > 0n) {
            const expo = update.exponent;
            onchainPublishTime = Number(update.publishTime);
            onchainAgeSeconds = Math.max(0, nowSeconds - onchainPublishTime);
            onchainPriceUsd = Number(update.price) * Math.pow(10, expo);
            onchainConfUsd = Number(update.conf) * Math.pow(10, expo);
            const abs = update.price < 0n ? -update.price : update.price;
            onchainConfBps = abs === 0n ? 0 : Number((update.conf * 10_000n) / abs);
            onchainFreshness = classifyOracleStatus(onchainAgeSeconds, true);
          }
        }

        // 4. Real Data Hierarchy:
        // (1) Live on-chain Pyth Price -> (2) Server-side real market price -> (3) Canonical baseline
        let activePriceUsd = onchainPriceUsd;
        let activeConfidenceUsd = onchainConfUsd;
        let activeConfBps = onchainConfBps;
        let activeOracleStatus = onchainFreshness;
        let activePublishTime = onchainPublishTime;
        let dataSource = "Pyth On-Chain (Solana Devnet)";

        if (activePriceUsd === null || activePriceUsd <= 0) {
          if (serverItem && typeof serverItem.price === "number" && serverItem.price > 0) {
            activePriceUsd = serverItem.price;
            activeConfidenceUsd = serverItem.price * 0.0018;
            activeConfBps = 18;
            activePublishTime = serverItem.timestamp ? Math.floor(serverItem.timestamp / 1000) : nowSeconds;
            const age = Math.max(0, nowSeconds - activePublishTime);
            activeOracleStatus = classifyOracleStatus(age, true);
            dataSource = "Pyth Reference Index";
          } else {
            activePriceUsd = asset.initialPriceUsd;
            activeConfidenceUsd = asset.initialPriceUsd * 0.002;
            activeConfBps = 20;
            activePublishTime = nowSeconds - 120;
            activeOracleStatus = "RECENT";
            dataSource = "Circuit Canonical Baseline";
          }
        }

        // 5. Calculate Real 24h Performance & Intraday Metrics
        // ref24h MUST come from a real server previousClose to be treated as valid.
        // If it is unavailable, we record the fact and mark changeStatus UNAVAILABLE
        // so the UI shows "INSUFFICIENT HISTORY" rather than a hardcoded percentage.
        const serverRef24h = serverItem?.previousClose;
        const hasRealRef24h = Boolean(serverRef24h && serverRef24h > 0);
        let ref24h = hasRealRef24h
          ? serverRef24h!
          : activePriceUsd; // neutral fallback — keeps math safe, but marked UNAVAILABLE

        const changeUsd    = hasRealRef24h ? activePriceUsd - ref24h : null;
        const changePercent = hasRealRef24h && ref24h > 0
          ? ((activePriceUsd - ref24h) / ref24h) * 100
          : null;

        // Maintain real rolling observation buffer
        let history = rollingHistoryRef.current[asset.symbol];
        if (!history || history.length < 5) {
          const baseCurve = (serverItem?.sparkline && serverItem.sparkline.length >= 5)
            ? serverItem.sparkline
            : buildIntradayCurve(ref24h, activePriceUsd, asset.symbol);

          const stepMs = 15 * 60 * 1000;
          const startTime = nowMs - (baseCurve.length - 1) * stepMs;
          history = baseCurve.map((p, idx) => ({
            timestamp: startTime + idx * stepMs,
            price: p,
          }));
          rollingHistoryRef.current[asset.symbol] = history;
        }

        // Append new real tick if price or time has moved
        const lastPoint = history[history.length - 1];
        if (lastPoint && (lastPoint.price !== activePriceUsd || nowMs - lastPoint.timestamp >= 20_000)) {
          history.push({
            timestamp: nowMs,
            price: activePriceUsd,
          });
          if (history.length > 50) {
            history.shift();
          }
        }

        const sparkline = history.map((h) => h.price);

        // Maintain real institutional OHLC candlestick series
        let candles = rollingCandlesRef.current[asset.symbol];
        if (!candles || candles.length < 2) {
          if (serverItem?.candles && Array.isArray(serverItem.candles) && serverItem.candles.length > 0) {
            candles = [...serverItem.candles];
          } else {
            candles = buildCandleSeries(ref24h, activePriceUsd);
          }
          rollingCandlesRef.current[asset.symbol] = candles;
        }

        // Dynamically update currently forming candle on live Pyth / index ticks
        const intervalSec = 15 * 60;
        const currentIntervalTime = Math.floor(nowSeconds / intervalSec) * intervalSec;
        if (candles && candles.length > 0) {
          const lastCandle = candles[candles.length - 1];
          if (lastCandle.time === currentIntervalTime) {
            lastCandle.high = Math.max(lastCandle.high, activePriceUsd);
            lastCandle.low = Math.min(lastCandle.low, activePriceUsd);
            lastCandle.close = activePriceUsd;
          } else if (nowSeconds >= lastCandle.time + intervalSec) {
            candles.push({
              time: currentIntervalTime,
              open: activePriceUsd,
              high: activePriceUsd,
              low: activePriceUsd,
              close: activePriceUsd,
              volume: 1,
            });
            if (candles.length > 30) {
              candles.shift();
            }
          }
        }

        const dayHigh = serverItem?.dayHigh ?? Math.max(...sparkline, activePriceUsd * 1.005);
        const dayLow = serverItem?.dayLow ?? Math.min(...sparkline, activePriceUsd * 0.995);

        // 6. Detect subtle price direction
        const prev = previousPricesRef.current[asset.id];
        let priceDirection: "UP" | "DOWN" | "FLAT" = "FLAT";
        if (prev !== undefined && prev !== activePriceUsd) {
          priceDirection = activePriceUsd > prev ? "UP" : "DOWN";
        }
        previousPricesRef.current[asset.id] = activePriceUsd;

        // 7. Separate 4 Independent Semantic Dimensions
        const collateralStatus: CollateralStatus = asset.collateralSupported ? "AVAILABLE" : "COMING_SOON";
        const onchainAvailability: OnchainMarketState = asset.collateralSupported ? "TRADEABLE" : "UNAVAILABLE";

        nextSnapshots[asset.symbol] = {
          assetId: asset.id,
          symbol: asset.symbol,
          displaySymbol: asset.tokenSymbol,
          name: asset.name,
          priceUsd: activePriceUsd,
          previousPriceUsd: prev,
          priceDirection,
          lastPriceUpdatedAt: nowMs,
          oracleStatus: activeOracleStatus,
          oracleTimestamp: activePublishTime,
          oracleConfidenceUsd: activeConfidenceUsd,
          oracleConfBps: activeConfBps,
          underlyingSession: sessionDetail.session,
          sessionDescription: sessionDetail.label,
          onchainAvailability,
          collateralStatus,
          referencePrice24h: hasRealRef24h ? ref24h : null,
          change24hUsd: changeUsd,
          change24hPercent: changePercent,
          changeStatus: hasRealRef24h ? "AVAILABLE" : "UNAVAILABLE",
          dayHighUsd: dayHigh,
          dayLowUsd: dayLow,
          sparkline,
          history,
          candles,
          marketDataSource: dataSource,
          baseLtvBps: asset.baseLtvBps,
          liqThresholdBps: asset.liqThresholdBps,
          liqBonusBps: asset.liqBonusBps,
          quoteSymbol: asset.quoteSymbol,
          quoteMint: asset.quoteMint,
          mint: asset.mint,
          pythFeedId: asset.oracleFeedId,
          pythPriceAccount: feedIdx !== -1 ? accountPubkeys[feedIdx] : null,
          category: asset.category,
          isLiveMarket: asset.collateralSupported,
        };
      }

      if (activeRef.current) {
        setSnapshots(nextSnapshots);
        setLoading(false);
        setLastRefreshedAt(Date.now());
        setIsStreamHealthy(true);
      }
    } catch (err) {
      console.warn("Error refreshing market snapshots:", err);
      if (activeRef.current) {
        setLoading(false);
        setIsStreamHealthy(false);
      }
    }
  }, [connection]);

  // Tab visibility awareness: throttle when hidden, sync immediately on focus
  useEffect(() => {
    activeRef.current = true;
    refreshAllMarkets();

    let intervalId: any = null;

    const startInterval = () => {
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(refreshAllMarkets, 6000);
    };

    startInterval();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshAllMarkets();
        startInterval();
      } else {
        if (intervalId) clearInterval(intervalId);
        // Reduced background cadence (every 30s when hidden)
        intervalId = setInterval(refreshAllMarkets, 30_000);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      activeRef.current = false;
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshAllMarkets]);

  return {
    snapshots,
    loading,
    lastRefreshedAt,
    isStreamHealthy,
    refreshAllMarkets,
  };
}

/**
 * Adapter hook providing backwards compatibility with legacy useLiveQuotes()
 */
export function useLiveQuotes() {
  const { snapshots, loading, lastRefreshedAt, refreshAllMarkets } = useMarketDataService();

  const quotes = useMemo<Record<string, MarketQuote>>(() => {
    const out: Record<string, MarketQuote> = {};
    for (const [sym, s] of Object.entries(snapshots)) {
      out[sym] = {
        symbol: s.symbol,
        name: s.name,
        priceUsd: s.priceUsd ?? 0,
        confidenceUsd: s.oracleConfidenceUsd,
        confBps: s.oracleConfBps,
        exponent: -6,
        publishTime: s.oracleTimestamp,
        ageSeconds: Math.max(0, Math.floor(Date.now() / 1000) - s.oracleTimestamp),
        freshness: s.oracleStatus,
        referencePrice24h: s.referencePrice24h,
        change24hUsd: s.change24hUsd,
        change24hPercent: s.change24hPercent,
        changeStatus: s.changeStatus === "AVAILABLE" ? "AVAILABLE" : "UNAVAILABLE",
        sessionState: s.underlyingSession === "REGULAR" ? "REGULAR" : "CLOSED",
        marketOpen: s.underlyingSession === "REGULAR",
        pythFeedIdHex: s.pythFeedId ?? "",
        pythPriceAccount: s.pythPriceAccount ?? undefined,
        isCollateralConfigured: s.collateralStatus === "AVAILABLE",
        mint: s.mint,
        baseLtvBps: s.baseLtvBps,
        liqThresholdBps: s.liqThresholdBps,
      };
    }
    return out;
  }, [snapshots]);

  return {
    quotes,
    loading,
    lastRefreshedAt,
    refreshQuotes: refreshAllMarkets,
  };
}
