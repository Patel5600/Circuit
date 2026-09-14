import { useEffect, useState, useCallback, useRef } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { useConnection } from "@solana/wallet-adapter-react";
import { DEPLOYED_MARKETS, MARKETS_DATA, DeployedMarket, MarketMetadata } from "../../data/markets";
import { derivePriceAccount, decodePriceUpdateV2, PriceUpdate } from "../pyth";
import { MarketQuote, DataFreshness, MarketSessionState } from "./types";
import { fetchHistoricalReference, calculate24hChange } from "./historical";

/**
 * Deterministic NYSE session derivation matching on-chain session.rs
 */
export function getMarketSessionState(unixSeconds: number): {
  session: MarketSessionState;
  open: boolean;
  label: string;
} {
  const d = new Date(unixSeconds * 1000);
  const et = new Date(d.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const dow = et.getDay(); // 0 = Sunday, 6 = Saturday
  const minutes = et.getHours() * 60 + et.getMinutes();

  if (dow === 0 || dow === 6) {
    return { session: "WEEKEND", open: false, label: "Weekend (NYSE Closed)" };
  }
  if (minutes < 9 * 60 + 30) {
    return { session: "PRE_MARKET", open: false, label: "Pre-Market" };
  }
  if (minutes >= 16 * 60) {
    return { session: "AFTER_HOURS", open: false, label: "After Close" };
  }
  return { session: "REGULAR", open: true, label: "Regular Session (Open)" };
}

/**
 * Classifies data freshness based on oracle publication age
 */
export function classifyFreshness(ageSeconds: number): DataFreshness {
  if (ageSeconds < 0) return "LIVE";
  if (ageSeconds <= 30) return "LIVE";
  if (ageSeconds <= 120) return "RECENT";
  return "STALE";
}

/**
 * Loads a continuous, batched stream of quotes for all configured markets.
 */
export function useLiveQuotes() {
  const { connection } = useConnection();
  const [quotes, setQuotes] = useState<Record<string, MarketQuote>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number>(Date.now());

  const activeRef = useRef(true);

  const refreshQuotes = useCallback(async () => {
    if (!activeRef.current) return;

    try {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const sessionInfo = getMarketSessionState(nowSeconds);

      // 1. Prepare price accounts for all markets
      const markets = DEPLOYED_MARKETS;
      const accountPubkeys = markets.map((m) => derivePriceAccount(m.feedId, 0));

      // 2. Fetch all on-chain price accounts in one batch
      const infos = await connection.getMultipleAccountsInfo(accountPubkeys);

      const nextQuotes: Record<string, MarketQuote> = {};

      // 3. Process each deployed market
      await Promise.all(
        markets.map(async (m, i) => {
          const info = infos[i];
          let priceUsd = 0;
          let confidenceUsd = 0;
          let confBps = 18;
          let exponent = -6;
          let publishTime = nowSeconds;
          let ageSeconds = 12;
          let freshness: DataFreshness = "UNAVAILABLE";

          if (info && info.data.length > 0) {
            const update = decodePriceUpdateV2(new Uint8Array(info.data));
            if (update && update.isFull && update.price > 0n) {
              exponent = update.exponent;
              publishTime = Number(update.publishTime);
              ageSeconds = Math.max(0, nowSeconds - publishTime);
              priceUsd = Number(update.price) * Math.pow(10, exponent);
              confidenceUsd = Number(update.conf) * Math.pow(10, exponent);
              const abs = update.price < 0n ? -update.price : update.price;
              confBps = abs === 0n ? 0 : Number((update.conf * 10_000n) / abs);
              freshness = classifyFreshness(ageSeconds);
            }
          }

          // Fallback to catalogue price if Devnet account has 0
          if (priceUsd <= 0) {
            const cat = MARKETS_DATA.find((c) => c.symbol === m.symbol);
            priceUsd = cat?.price ?? 100;
          }

          // Fetch real 24h historical reference
          const histRef = await fetchHistoricalReference(m.symbol);
          const changeResult = calculate24hChange(priceUsd, histRef);

          nextQuotes[m.symbol] = {
            symbol: m.symbol,
            name: m.name,
            priceUsd,
            confidenceUsd,
            confBps,
            exponent,
            publishTime,
            ageSeconds,
            freshness,
            referencePrice24h: histRef.referencePriceUsd,
            change24hUsd: changeResult.change24hUsd,
            change24hPercent: changeResult.change24hPercent,
            changeStatus: changeResult.status,
            sessionState: sessionInfo.session,
            marketOpen: sessionInfo.open,
            pythFeedIdHex: m.feedId,
            pythPriceAccount: accountPubkeys[i],
            isCollateralConfigured: true,
            mint: m.mint,
            baseLtvBps: m.baseLtvBps,
            liqThresholdBps: m.liqThresholdBps,
          };
        })
      );

      if (activeRef.current) {
        setQuotes(nextQuotes);
        setLoading(false);
        setLastRefreshedAt(Date.now());
      }
    } catch (err) {
      console.warn("Error streaming live quotes:", err);
      if (activeRef.current) setLoading(false);
    }
  }, [connection]);

  useEffect(() => {
    activeRef.current = true;
    refreshQuotes();

    // Poll live prices every 6 seconds from Devnet
    const interval = setInterval(refreshQuotes, 6000);
    return () => {
      activeRef.current = false;
      clearInterval(interval);
    };
  }, [refreshQuotes]);

  return {
    quotes,
    loading,
    lastRefreshedAt,
    refreshQuotes,
  };
}
