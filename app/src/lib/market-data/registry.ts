import React from "react";
import marketsJson from "../../data/markets.json";

export interface AssetDefinition {
  id: string;
  symbol: string;
  tokenSymbol: string;
  name: string;
  category: "Technology" | "Automotive" | "Entertainment" | "Finance" | "Consumer" | "Index";
  logoColor: string;
  logoSvg?: React.ReactNode;
  collateralSupported: boolean;
  marketDataSupported: boolean;
  historySupported: boolean;
  enabled: boolean;
  mint?: string;
  quoteSymbol: string;
  quoteMint?: string;
  oracleFeedId?: string;
  baseLtvBps: number;
  liqThresholdBps: number;
  liqBonusBps: number;
  initialPriceUsd: number;
  initial24hPercent: number;
}

const DISCOVERY_ASSETS: {
  symbol: string;
  tokenSymbol: string;
  name: string;
  category: AssetDefinition["category"];
  logoColor: string;
  baseLtvBps: number;
  liqThresholdBps: number;
  initialPriceUsd: number;
  initial24hPercent: number;
}[] = [
  { symbol: "INTC", tokenSymbol: "INTCx", name: "Intel Corporation", category: "Technology", logoColor: "#0071C5", baseLtvBps: 6000, liqThresholdBps: 7000, initialPriceUsd: 24.85, initial24hPercent: -1.0 },
  { symbol: "MU", tokenSymbol: "MUx", name: "Micron Technology Inc.", category: "Technology", logoColor: "#005596", baseLtvBps: 6000, liqThresholdBps: 7000, initialPriceUsd: 104.20, initial24hPercent: 1.66 },
  { symbol: "MRVL", tokenSymbol: "MRVLx", name: "Marvell Technology", category: "Technology", logoColor: "#003A70", baseLtvBps: 6000, liqThresholdBps: 7000, initialPriceUsd: 82.40, initial24hPercent: 1.6 },
  { symbol: "HOOD", tokenSymbol: "HOODx", name: "Robinhood Markets", category: "Finance", logoColor: "#00C805", baseLtvBps: 5500, liqThresholdBps: 6500, initialPriceUsd: 28.30, initial24hPercent: 2.91 },
  { symbol: "MCD", tokenSymbol: "MCDx", name: "McDonald's Corporation", category: "Consumer", logoColor: "#FFC72C", baseLtvBps: 7500, liqThresholdBps: 8500, initialPriceUsd: 304.50, initial24hPercent: 0.23 },
  { symbol: "NKE", tokenSymbol: "NKEx", name: "NIKE Inc.", category: "Consumer", logoColor: "#FA5400", baseLtvBps: 6500, liqThresholdBps: 7500, initialPriceUsd: 86.40, initial24hPercent: -0.92 },
  { symbol: "JPM", tokenSymbol: "JPMx", name: "JPMorgan Chase & Co.", category: "Finance", logoColor: "#117AC9", baseLtvBps: 7500, liqThresholdBps: 8500, initialPriceUsd: 224.50, initial24hPercent: 1.08 },
  { symbol: "V", tokenSymbol: "Vx", name: "Visa Inc.", category: "Finance", logoColor: "#1A1F71", baseLtvBps: 7500, liqThresholdBps: 8500, initialPriceUsd: 284.10, initial24hPercent: 0.42 },
  { symbol: "MA", tokenSymbol: "MAx", name: "Mastercard Inc.", category: "Finance", logoColor: "#EB001B", baseLtvBps: 7500, liqThresholdBps: 8500, initialPriceUsd: 492.30, initial24hPercent: 0.57 },
  { symbol: "DIS", tokenSymbol: "DISx", name: "The Walt Disney Co.", category: "Entertainment", logoColor: "#113CCF", baseLtvBps: 6500, liqThresholdBps: 7500, initialPriceUsd: 98.40, initial24hPercent: -0.71 },
  { symbol: "PEP", tokenSymbol: "PEPx", name: "PepsiCo Inc.", category: "Consumer", logoColor: "#004B93", baseLtvBps: 7500, liqThresholdBps: 8500, initialPriceUsd: 178.60, initial24hPercent: 0.39 },
  { symbol: "KO", tokenSymbol: "KOx", name: "The Coca-Cola Co.", category: "Consumer", logoColor: "#F40009", baseLtvBps: 7500, liqThresholdBps: 8500, initialPriceUsd: 68.20, initial24hPercent: 0.22 },
];

function buildCanonicalRegistry(): AssetDefinition[] {
  const rawMarkets: any[] =
    (marketsJson as any)?.markets || (marketsJson as any)?.default?.markets || [];

  const definitions: AssetDefinition[] = [];
  const seen = new Set<string>();

  // 1. All Deployed On-Chain Markets
  for (const m of rawMarkets) {
    const id = `${m.symbol}-${m.quoteSymbol}`;
    seen.add(id);

    definitions.push({
      id,
      symbol: m.symbol,
      tokenSymbol: m.tokenSymbol,
      name: m.name,
      category: m.symbol === "COIN" ? "Finance" : m.symbol === "TSLA" ? "Automotive" : m.symbol === "NFLX" ? "Entertainment" : m.symbol === "SPY" ? "Index" : "Technology",
      logoColor: "#76B900",
      collateralSupported: true,
      marketDataSupported: true,
      historySupported: true,
      enabled: true,
      mint: m.mint,
      quoteSymbol: m.quoteSymbol,
      quoteMint: m.quoteMint,
      oracleFeedId: m.feedId,
      baseLtvBps: m.baseLtvBps,
      liqThresholdBps: m.liqThresholdBps,
      liqBonusBps: m.liqBonusBps,
      initialPriceUsd: m.symbol === "NVDA" ? 218.29 : m.symbol === "AAPL" ? 332.27 : m.symbol === "MSFT" ? 495.63 : m.symbol === "AMZN" ? 256.78 : m.symbol === "GOOGL" ? 338.50 : m.symbol === "META" ? 648.03 : m.symbol === "TSLA" ? 365.44 : m.symbol === "NFLX" ? 77.40 : m.symbol === "COIN" ? 175.26 : m.symbol === "AMD" ? 516.13 : 764.29,
      initial24hPercent: m.symbol === "NVDA" ? -4.45 : m.symbol === "AAPL" ? 1.24 : m.symbol === "MSFT" ? -2.84 : m.symbol === "AMZN" ? -0.82 : m.symbol === "GOOGL" ? -1.16 : m.symbol === "META" ? 6.12 : m.symbol === "TSLA" ? -2.90 : m.symbol === "NFLX" ? -6.37 : m.symbol === "COIN" ? -9.05 : m.symbol === "AMD" ? 13.15 : -1.15,
    });
  }

  // 2. Discovery Pipeline Equities
  for (const c of DISCOVERY_ASSETS) {
    const id = `${c.symbol}-USDC`;
    if (seen.has(id)) continue;
    seen.add(id);

    definitions.push({
      id,
      symbol: c.symbol,
      tokenSymbol: c.tokenSymbol,
      name: c.name,
      category: c.category,
      logoColor: c.logoColor,
      collateralSupported: false,
      marketDataSupported: true,
      historySupported: true,
      enabled: true,
      quoteSymbol: "USDC",
      baseLtvBps: c.baseLtvBps,
      liqThresholdBps: c.liqThresholdBps,
      liqBonusBps: 500,
      initialPriceUsd: c.initialPriceUsd,
      initial24hPercent: c.initial24hPercent,
    });
  }

  return definitions;
}

export const CANONICAL_ASSET_REGISTRY = buildCanonicalRegistry();

export function getAssetDefinition(symbol: string, quoteSymbol = "USDC"): AssetDefinition | undefined {
  const norm = symbol.toUpperCase().replace("X", "").replace("-SOL", "");
  return (
    CANONICAL_ASSET_REGISTRY.find((a) => a.symbol === norm && a.quoteSymbol === quoteSymbol) ||
    CANONICAL_ASSET_REGISTRY.find((a) => a.symbol === norm)
  );
}

export function getAssetDefinitionByMint(mint: string): AssetDefinition | undefined {
  return CANONICAL_ASSET_REGISTRY.find((a) => a.mint === mint);
}
