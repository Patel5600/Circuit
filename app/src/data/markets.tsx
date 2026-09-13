import React from "react";
import marketsJson from "./markets.json";

export interface DeployedMarket {
  symbol: string;
  name: string;
  tokenSymbol: string;
  mint: string;
  quoteSymbol: string;
  quoteMint: string;
  assetConfigPda: string;
  marketGuardPda: string;
  collateralVault: string;
  liquidityVault: string;
  feedId: string;
  baseLtvBps: number;
  liqThresholdBps: number;
  liqBonusBps: number;
}

export const DEPLOYED_MARKETS: DeployedMarket[] = (marketsJson as any).markets || [];

export function getDeployedMarket(symbol: string, quoteSymbol?: string): DeployedMarket | undefined {
  if (quoteSymbol) {
    return DEPLOYED_MARKETS.find((m) => m.symbol === symbol && m.quoteSymbol === quoteSymbol);
  }
  return DEPLOYED_MARKETS.find((m) => m.symbol === symbol);
}

export function getDeployedMarketByMint(mint: string): DeployedMarket | undefined {
  return DEPLOYED_MARKETS.find((m) => m.mint === mint);
}

/**
 * CATALOGUE - branding metadata with verified on-chain devnet parameters.
 */
export interface MarketMetadata {
  symbol: string;
  displayName: string;
  tokenSymbol: string;
  category: "Technology" | "Automotive" | "Entertainment" | "Finance" | "Consumer" | "Index";
  logoColor: string;
  logoSvg: React.ReactNode;
  enabled: boolean;
  collateralEnabled: boolean;
  pythFeedId?: string;
  mint?: string;
  quoteSymbol?: string;
  quoteMint?: string;
  baseLtv: number; // e.g. 70 = 70%
  liqThreshold: number; // e.g. 80 = 80%
  price: number;
  change24h: number;
  marketCap: string;
  volume24h: string;
  oracleProvider: string;
}

export const MARKETS_DATA: MarketMetadata[] = [
  {
    symbol: "NVDA",
    displayName: "NVIDIA Corporation",
    tokenSymbol: "NVDAx",
    category: "Technology",
    logoColor: "#76B900",
    logoSvg: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
        <path d="M4 6.5C4 6.5 7.5 3 12 3C16.5 3 20 6.5 20 6.5C20 6.5 16.5 10 12 10C7.5 10 4 6.5 4 6.5Z" fill="#76B900" />
        <path d="M6 12C6 12 8.5 9.5 12 9.5C15.5 9.5 18 12 18 12C18 12 15.5 14.5 12 14.5C8.5 14.5 6 12 6 12Z" fill="#76B900" opacity="0.8" />
        <path d="M8 17.5C8 17.5 9.8 15.8 12 15.8C14.2 15.8 16 17.5 16 17.5C16 17.5 14.2 19.2 12 19.2C9.8 19.2 8 17.5 8 17.5Z" fill="#76B900" opacity="0.6" />
      </svg>
    ),
    enabled: true,
    collateralEnabled: true,
    pythFeedId: "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
    mint: "CARqKy5GTCxz5G1tFiYA96A3Q8jaUE9Vppk7cjGJxRqq",
    quoteSymbol: "USDC",
    quoteMint: "23hpSsK3h4na3pwSUf1YzaDF9nzX3t2PppJJf16Qpkxc",
    baseLtv: 70,
    liqThreshold: 80,
    price: 138.25,
    change24h: 3.42,
    marketCap: "$3.41T",
    volume24h: "$48.2M",
    oracleProvider: "Pyth Network (PriceUpdateV2)",
  },
  {
    symbol: "AAPL",
    displayName: "Apple Inc.",
    tokenSymbol: "AAPLx",
    category: "Technology",
    logoColor: "#A2AAAD",
    logoSvg: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.38c.62-.75 1.04-1.8 0.93-2.88-.9.04-1.98.6-2.61 1.34-.56.63-.99 1.66-.88 2.72 1 .08 1.95-.45 2.56-1.18z"/>
      </svg>
    ),
    enabled: true,
    collateralEnabled: true,
    pythFeedId: "49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b17d1533cf6ae859",
    mint: "4zs2vg7MXYms9gwQxA6VYTZCfGy4NVyp1pca8TqdMmnS",
    quoteSymbol: "USDC",
    quoteMint: "23hpSsK3h4na3pwSUf1YzaDF9nzX3t2PppJJf16Qpkxc",
    baseLtv: 70,
    liqThreshold: 80,
    price: 228.80,
    change24h: 1.15,
    marketCap: "$3.49T",
    volume24h: "$34.1M",
    oracleProvider: "Pyth Network",
  },
  {
    symbol: "MSFT",
    displayName: "Microsoft Corporation",
    tokenSymbol: "MSFTx",
    category: "Technology",
    logoColor: "#00A4EF",
    logoSvg: (
      <svg viewBox="0 0 24 24" width="24" height="24">
        <rect x="3" y="3" width="8.5" height="8.5" fill="#F25022"/>
        <rect x="12.5" y="3" width="8.5" height="8.5" fill="#7FBA00"/>
        <rect x="3" y="12.5" width="8.5" height="8.5" fill="#00A4EF"/>
        <rect x="12.5" y="12.5" width="8.5" height="8.5" fill="#FFB900"/>
      </svg>
    ),
    enabled: true,
    collateralEnabled: true,
    pythFeedId: "034f59c84918e77c593685e8a3297a7a514ddb00085420313f8c5b0561571d8a",
    mint: "gLjzboHgbevzEedufXfWyrgaFk7ePNLBKzRnpGbWpF2",
    quoteSymbol: "USDC",
    quoteMint: "23hpSsK3h4na3pwSUf1YzaDF9nzX3t2PppJJf16Qpkxc",
    baseLtv: 70,
    liqThreshold: 80,
    price: 432.10,
    change24h: -0.45,
    marketCap: "$3.21T",
    volume24h: "$21.6M",
    oracleProvider: "Pyth Network",
  },
  {
    symbol: "AMZN",
    displayName: "Amazon.com Inc.",
    tokenSymbol: "AMZNx",
    category: "Consumer",
    logoColor: "#FF9900",
    logoSvg: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
        <path d="M12.8 14.8c-2.4 1.8-6.1 2.7-9.1 2.7-4.3 0-7.8-1.5-10.6-4.5-.2-.2 0-.6.3-.4 2.9 1.7 6.4 2.7 10 2.7 2.7 0 5.7-.7 8.3-2.1.4-.2.7.2.1.6z" transform="translate(5, 0)"/>
        <path d="M15.4 17.5c-.3-.4-1.9-.2-2.7-.1-.2 0-.3-.2-.1-.3 1.1-.9 2.9-.6 3.1-.4.2.2.1 2-.9 3-.2.2-.3.1-.3 0 .2-.7.2-1.8.9-2.2z" transform="translate(5, 0)"/>
        <circle cx="12" cy="8" r="4" fill="#FF9900"/>
      </svg>
    ),
    enabled: true,
    collateralEnabled: true,
    pythFeedId: "8894df05be17034beea20b6e9dfefdf84e1b40283b8b171cc430852e987178c7",
    mint: "CuAhF2Y4via5vd85WxuXGS6NEjhQ6moTwpbJmvzX2ZNo",
    quoteSymbol: "USDC",
    quoteMint: "23hpSsK3h4na3pwSUf1YzaDF9nzX3t2PppJJf16Qpkxc",
    baseLtv: 65,
    liqThreshold: 75,
    price: 189.50,
    change24h: 2.10,
    marketCap: "$1.97T",
    volume24h: "$19.3M",
    oracleProvider: "Pyth Network",
  },
  {
    symbol: "GOOGL",
    displayName: "Alphabet Inc.",
    tokenSymbol: "GOOGLx",
    category: "Technology",
    logoColor: "#4285F4",
    logoSvg: (
      <svg viewBox="0 0 24 24" width="24" height="24">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
      </svg>
    ),
    enabled: true,
    collateralEnabled: true,
    pythFeedId: "c796bbf0eb98ff599be821eb59cae31be182440fae41f1737f02fc00b86a83e5",
    mint: "8VjvTWpKHJYkMzhNDhVWWJTLx1FPBVfCextL5fDRgq11",
    quoteSymbol: "USDC",
    quoteMint: "23hpSsK3h4na3pwSUf1YzaDF9nzX3t2PppJJf16Qpkxc",
    baseLtv: 70,
    liqThreshold: 80,
    price: 167.35,
    change24h: 0.85,
    marketCap: "$2.06T",
    volume24h: "$15.4M",
    oracleProvider: "Pyth Network",
  },
  {
    symbol: "META",
    displayName: "Meta Platforms Inc.",
    tokenSymbol: "METAx",
    category: "Technology",
    logoColor: "#0081FB",
    logoSvg: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="#0081FB">
        <path d="M12 4.5C7.2 4.5 3.5 7.8 2.2 12c1.3 4.2 5 7.5 9.8 7.5s8.5-3.3 9.8-7.5c-1.3-4.2-5-7.5-9.8-7.5zm0 12c-2.5 0-4.5-2-4.5-4.5S9.5 7.5 12 7.5s4.5 2 4.5 4.5-2 4.5-4.5 4.5z"/>
      </svg>
    ),
    enabled: true,
    collateralEnabled: true,
    pythFeedId: "d87e0fa125c150fc90fe9c43d99d1fa9ff506e7884ffdd2475e7a9183783c509",
    mint: "9hLNCvmhQqcadie1Bi978z4FVAJADNpruN8SsUEy5dZ3",
    quoteSymbol: "USDC",
    quoteMint: "23hpSsK3h4na3pwSUf1YzaDF9nzX3t2PppJJf16Qpkxc",
    baseLtv: 65,
    liqThreshold: 75,
    price: 585.20,
    change24h: 4.12,
    marketCap: "$1.48T",
    volume24h: "$22.0M",
    oracleProvider: "Pyth Network",
  },
  {
    symbol: "TSLA",
    displayName: "Tesla Inc.",
    tokenSymbol: "TSLAx",
    category: "Automotive",
    logoColor: "#E82127",
    logoSvg: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="#E82127">
        <path d="M12 5.5c2.4 0 5.2.4 7.4 1.3l.8-2.1C17.4 3.6 14.5 3 12 3S6.6 3.6 3.8 4.7l.8 2.1c2.2-.9 5-1.3 7.4-1.3zm0 3.2c-1.8 0-4 .3-5.8 1l.6 2c1.5-.6 3.4-.8 5.2-.8s3.7.2 5.2.8l.6-2c-1.8-.7-4-1-5.8-1zm1 5.3h-2v7h2v-7z"/>
      </svg>
    ),
    enabled: true,
    collateralEnabled: true,
    pythFeedId: "4aa5a9531818296a267e802058b76fc888e7456d94a9749176182db596238bfa",
    mint: "8aN6tJaFz4SfM5Tw3SYVs7sBwi4tYoJcb3tmsYf7159B",
    quoteSymbol: "USDC",
    quoteMint: "23hpSsK3h4na3pwSUf1YzaDF9nzX3t2PppJJf16Qpkxc",
    baseLtv: 60,
    liqThreshold: 70,
    price: 248.90,
    change24h: -1.75,
    marketCap: "$790B",
    volume24h: "$38.5M",
    oracleProvider: "Pyth Network",
  },
  {
    symbol: "NFLX",
    displayName: "Netflix Inc.",
    tokenSymbol: "NFLXx",
    category: "Entertainment",
    logoColor: "#E50914",
    logoSvg: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="#E50914">
        <path d="M4 2h4v20H4zM16 2h4v20h-4z"/>
        <path d="M8 2h3.5l4.5 20H12.5z" opacity="0.9"/>
      </svg>
    ),
    enabled: true,
    collateralEnabled: true,
    pythFeedId: "02868ff1853db5c33842cb838ce479868be8db30058b8fd91d8e1c6aaeb43d92",
    mint: "6QpijMYxF1TFWNqfvDJUzDoX5D1zPnpKV7LacV85BmaQ",
    quoteSymbol: "USDC",
    quoteMint: "23hpSsK3h4na3pwSUf1YzaDF9nzX3t2PppJJf16Qpkxc",
    baseLtv: 65,
    liqThreshold: 75,
    price: 698.40,
    change24h: 1.88,
    marketCap: "$301B",
    volume24h: "$12.8M",
    oracleProvider: "Pyth Network",
  },
  {
    symbol: "AMD",
    displayName: "Advanced Micro Devices",
    tokenSymbol: "AMDx",
    category: "Technology",
    logoColor: "#ED1C24",
    logoSvg: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="#ED1C24">
        <path d="M4 4h16v16H4V4zm4 4v8h8V8H8z"/>
      </svg>
    ),
    enabled: true,
    collateralEnabled: true,
    pythFeedId: "825efd1645c3b53c7c10b41c9ec437a346e969ba1be9a2ae454fa572a1599321",
    mint: "7KewtMcmKxvw9vMfpuqmPGVr9GNT5v5mgdggBa9gQYEi",
    quoteSymbol: "USDC",
    quoteMint: "23hpSsK3h4na3pwSUf1YzaDF9nzX3t2PppJJf16Qpkxc",
    baseLtv: 65,
    liqThreshold: 75,
    price: 156.40,
    change24h: 2.70,
    marketCap: "$252B",
    volume24h: "$17.1M",
    oracleProvider: "Pyth Network",
  },
  {
    symbol: "INTC",
    displayName: "Intel Corporation",
    tokenSymbol: "INTCx",
    category: "Technology",
    logoColor: "#0071C5",
    logoSvg: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="#0071C5">
        <circle cx="12" cy="12" r="9" stroke="#0071C5" strokeWidth="2"/>
        <text x="12" y="16" textAnchor="middle" fill="#0071C5" fontSize="10" fontWeight="bold" fontFamily="sans-serif">i</text>
      </svg>
    ),
    enabled: true,
    collateralEnabled: false,
    baseLtv: 60,
    liqThreshold: 70,
    price: 21.30,
    change24h: -0.65,
    marketCap: "$91B",
    volume24h: "$8.4M",
    oracleProvider: "Pyth Network",
  },
  {
    symbol: "MU",
    displayName: "Micron Technology Inc.",
    tokenSymbol: "MUx",
    category: "Technology",
    logoColor: "#005596",
    logoSvg: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="#005596">
        <rect x="4" y="4" width="6" height="16" rx="1"/>
        <rect x="14" y="4" width="6" height="16" rx="1"/>
        <path d="M10 8h4v8h-4z"/>
      </svg>
    ),
    enabled: true,
    collateralEnabled: false,
    baseLtv: 60,
    liqThreshold: 70,
    price: 92.15,
    change24h: 1.45,
    marketCap: "$102B",
    volume24h: "$7.2M",
    oracleProvider: "Pyth Network",
  },
  {
    symbol: "MRVL",
    displayName: "Marvell Technology",
    tokenSymbol: "MRVLx",
    category: "Technology",
    logoColor: "#003A70",
    logoSvg: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="#003A70">
        <polygon points="12,2 22,8 22,16 12,22 2,16 2,8"/>
      </svg>
    ),
    enabled: true,
    collateralEnabled: false,
    baseLtv: 60,
    liqThreshold: 70,
    price: 76.50,
    change24h: 3.20,
    marketCap: "$66B",
    volume24h: "$5.8M",
    oracleProvider: "Pyth Network",
  },
  {
    symbol: "COIN",
    displayName: "Coinbase Global Inc.",
    tokenSymbol: "COINx",
    category: "Finance",
    logoColor: "#0052FF",
    logoSvg: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="#0052FF">
        <circle cx="12" cy="12" r="10"/>
        <rect x="9.5" y="9.5" width="5" height="5" fill="#FFFFFF" rx="1"/>
      </svg>
    ),
    enabled: true,
    collateralEnabled: true,
    pythFeedId: "84654fd2e7845f7457788448eb5850949dbeee0418c30c80b2a59a72cc33e680",
    mint: "FTcW7uFQkHfXLQ8TJz38vPTMoD3QruzYjbsN27SjEtiK",
    quoteSymbol: "USDC",
    quoteMint: "23hpSsK3h4na3pwSUf1YzaDF9nzX3t2PppJJf16Qpkxc",
    baseLtv: 60,
    liqThreshold: 70,
    price: 182.70,
    change24h: 5.80,
    marketCap: "$45B",
    volume24h: "$24.6M",
    oracleProvider: "Pyth Network",
  },
  {
    symbol: "HOOD",
    displayName: "Robinhood Markets",
    tokenSymbol: "HOODx",
    category: "Finance",
    logoColor: "#00C805",
    logoSvg: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="#00C805">
        <path d="M12 3C8 7 6 12 6 17c0 2.5 1.5 4 3.5 4s3.5-1.5 3.5-4c0-3-1.5-6-1-9z"/>
        <path d="M12 3c4 4 6 9 6 14 0 2.5-1.5 4-3.5 4s-3.5-1.5-3.5-4c0-3 1.5-6 1-9z" opacity="0.7"/>
      </svg>
    ),
    enabled: true,
    collateralEnabled: false,
    baseLtv: 55,
    liqThreshold: 65,
    price: 24.10,
    change24h: 4.25,
    marketCap: "$21B",
    volume24h: "$9.7M",
    oracleProvider: "Pyth Network",
  },
  {
    symbol: "MCD",
    displayName: "McDonald's Corporation",
    tokenSymbol: "MCDx",
    category: "Consumer",
    logoColor: "#FFC72C",
    logoSvg: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
        <path d="M4 19C4 12 7 6 9 6C11 6 12 11 12 19" stroke="#FFC72C" strokeWidth="2.5" strokeLinecap="round"/>
        <path d="M12 19C12 11 13 6 15 6C17 6 20 12 20 19" stroke="#FFC72C" strokeWidth="2.5" strokeLinecap="round"/>
      </svg>
    ),
    enabled: true,
    collateralEnabled: false,
    baseLtv: 75,
    liqThreshold: 85,
    price: 301.20,
    change24h: 0.22,
    marketCap: "$216B",
    volume24h: "$4.1M",
    oracleProvider: "Pyth Network",
  },
  {
    symbol: "NKE",
    displayName: "NIKE Inc.",
    tokenSymbol: "NKEx",
    category: "Consumer",
    logoColor: "#FA5400",
    logoSvg: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="#FA5400">
        <path d="M21.5 6.5C15 9.5 9 14.5 4 17.5C7 16 11 14.5 15 13C17 12 19.5 10 21.5 6.5Z"/>
      </svg>
    ),
    enabled: true,
    collateralEnabled: false,
    baseLtv: 65,
    liqThreshold: 75,
    price: 84.60,
    change24h: -1.10,
    marketCap: "$127B",
    volume24h: "$5.3M",
    oracleProvider: "Pyth Network",
  },
  {
    symbol: "DIS",
    displayName: "The Walt Disney Company",
    tokenSymbol: "DISx",
    category: "Entertainment",
    logoColor: "#113CCF",
    logoSvg: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="#113CCF">
        <circle cx="12" cy="14" r="6"/>
        <circle cx="7" cy="8" r="3.5"/>
        <circle cx="17" cy="8" r="3.5"/>
      </svg>
    ),
    enabled: true,
    collateralEnabled: false,
    baseLtv: 65,
    liqThreshold: 75,
    price: 93.80,
    change24h: 0.95,
    marketCap: "$171B",
    volume24h: "$6.2M",
    oracleProvider: "Pyth Network",
  },
  {
    symbol: "JPM",
    displayName: "JPMorgan Chase & Co.",
    tokenSymbol: "JPMx",
    category: "Finance",
    logoColor: "#0A2F64",
    logoSvg: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="#0A2F64">
        <polygon points="12,3 21,9 21,21 3,21 3,9"/>
        <polygon points="12,7 17,11 17,18 7,18 7,11" fill="#FFFFFF"/>
      </svg>
    ),
    enabled: true,
    collateralEnabled: false,
    baseLtv: 75,
    liqThreshold: 85,
    price: 215.40,
    change24h: 1.05,
    marketCap: "$618B",
    volume24h: "$11.3M",
    oracleProvider: "Pyth Network",
  },
  {
    symbol: "V",
    displayName: "Visa Inc.",
    tokenSymbol: "Vx",
    category: "Finance",
    logoColor: "#1A1F71",
    logoSvg: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="#1A1F71">
        <path d="M4 6l4 12h3l-4-12zM10 6l3 12h3l4-12h-3l-2.5 8-1.5-8z"/>
      </svg>
    ),
    enabled: true,
    collateralEnabled: false,
    baseLtv: 75,
    liqThreshold: 85,
    price: 288.60,
    change24h: 0.40,
    marketCap: "$582B",
    volume24h: "$8.9M",
    oracleProvider: "Pyth Network",
  },
  {
    symbol: "MA",
    displayName: "Mastercard Incorporated",
    tokenSymbol: "MAx",
    category: "Finance",
    logoColor: "#EB001B",
    logoSvg: (
      <svg viewBox="0 0 24 24" width="24" height="24">
        <circle cx="9" cy="12" r="6" fill="#EB001B"/>
        <circle cx="15" cy="12" r="6" fill="#F79E1B" fillOpacity="0.85"/>
      </svg>
    ),
    enabled: true,
    collateralEnabled: false,
    baseLtv: 75,
    liqThreshold: 85,
    price: 504.10,
    change24h: 0.65,
    marketCap: "$468B",
    volume24h: "$7.5M",
    oracleProvider: "Pyth Network",
  },
  {
    symbol: "PEP",
    displayName: "PepsiCo Inc.",
    tokenSymbol: "PEPx",
    category: "Consumer",
    logoColor: "#004B93",
    logoSvg: (
      <svg viewBox="0 0 24 24" width="24" height="24">
        <circle cx="12" cy="12" r="9" fill="#004B93"/>
        <path d="M5 12c3-4 11-4 14 0" stroke="#FFFFFF" strokeWidth="2.5" fill="none"/>
        <path d="M5 12c3 4 11 4 14 0" stroke="#E32934" strokeWidth="2.5" fill="none"/>
      </svg>
    ),
    enabled: true,
    collateralEnabled: false,
    baseLtv: 70,
    liqThreshold: 80,
    price: 172.80,
    change24h: -0.15,
    marketCap: "$237B",
    volume24h: "$3.9M",
    oracleProvider: "Pyth Network",
  },
  {
    symbol: "KO",
    displayName: "The Coca-Cola Company",
    tokenSymbol: "KOx",
    category: "Consumer",
    logoColor: "#F40009",
    logoSvg: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="#F40009">
        <circle cx="12" cy="12" r="9"/>
        <path d="M6 13c2.5-3 9.5-3 12 0" stroke="#FFFFFF" strokeWidth="2" fill="none"/>
      </svg>
    ),
    enabled: true,
    collateralEnabled: false,
    baseLtv: 70,
    liqThreshold: 80,
    price: 68.90,
    change24h: 0.35,
    marketCap: "$297B",
    volume24h: "$4.5M",
    oracleProvider: "Pyth Network",
  },
  {
    symbol: "SPY",
    displayName: "SPDR S&P 500 ETF Trust",
    tokenSymbol: "SPYx",
    category: "Index",
    logoColor: "#0A3161",
    logoSvg: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
        <rect x="2" y="2" width="20" height="20" rx="4" fill="#0A3161" />
        <path d="M6 16L10 11L14 14L18 8" stroke="#D32F2F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="18" cy="8" r="2" fill="#D32F2F" />
      </svg>
    ),
    enabled: true,
    collateralEnabled: true,
    pythFeedId: "26e2e5052960be41f5a5433a08b9815a5cb3556ea5e45c4723924dbbcfbcf2ec",
    mint: "HGD3ERQrsDXZnrR2EjmKKdoCuw2eBABtfkZgWYxjy2MP",
    quoteSymbol: "USDC",
    quoteMint: "23hpSsK3h4na3pwSUf1YzaDF9nzX3t2PppJJf16Qpkxc",
    baseLtv: 75,
    liqThreshold: 85,
    price: 562.40,
    change24h: 0.62,
    marketCap: "$560B",
    volume24h: "$78.4M",
    oracleProvider: "Pyth Network (PriceUpdateV2)",
  },
  {
    symbol: "NVDA-SOL",
    displayName: "NVIDIA (Borrow SOL)",
    tokenSymbol: "NVDAx",
    category: "Technology",
    logoColor: "#9945FF",
    logoSvg: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
        <path d="M4 6.5C4 6.5 7.5 3 12 3C16.5 3 20 6.5 20 6.5C20 6.5 16.5 10 12 10C7.5 10 4 6.5 4 6.5Z" fill="#9945FF" />
        <path d="M6 12C6 12 8.5 9.5 12 9.5C15.5 9.5 18 12 18 12C18 12 15.5 14.5 12 14.5C8.5 14.5 6 12 6 12Z" fill="#14F195" opacity="0.8" />
        <path d="M8 17.5C8 17.5 9.8 15.8 12 15.8C14.2 15.8 16 17.5 16 17.5C16 17.5 14.2 19.2 12 19.2C9.8 19.2 8 17.5 8 17.5Z" fill="#9945FF" opacity="0.6" />
      </svg>
    ),
    enabled: true,
    collateralEnabled: true,
    pythFeedId: "0000000000000000000000000000000000000000000000000000000000000001",
    mint: "28jjNoosEReKPfSgjHnEEth5A4dKZnviQsiH4NsWRDVj",
    quoteSymbol: "WSOL",
    quoteMint: "DsjcwkWNxJk5Rvw7dvdJLY3AY5jg9fpnYJvewUaVjxbL",
    baseLtv: 65,
    liqThreshold: 75,
    price: 138.25,
    change24h: 3.42,
    marketCap: "$3.41T",
    volume24h: "$12.5M",
    oracleProvider: "Pyth Network (PriceUpdateV2)",
  },
];

export function isNyseMarketOpen(): { isOpen: boolean; message: string } {
  const now = new Date();
  // US Eastern Time calculation
  const etStr = now.toLocaleString("en-US", { timeZone: "America/New_York" });
  const et = new Date(etStr);
  const day = et.getDay(); // 0 = Sun, 6 = Sat
  const hour = et.getHours();
  const minute = et.getMinutes();
  const currentMinutes = hour * 60 + minute;
  const openMinutes = 9 * 60 + 30; // 09:30 AM ET
  const closeMinutes = 16 * 60;    // 04:00 PM ET

  if (day === 0 || day === 6) {
    return { isOpen: false, message: "Weekend — NYSE Closed" };
  }
  if (currentMinutes >= openMinutes && currentMinutes < closeMinutes) {
    return { isOpen: true, message: "NYSE Regular Session Open (9:30-16:00 ET)" };
  }
  if (currentMinutes < openMinutes) {
    return { isOpen: false, message: `Pre-Market (Opens 9:30 AM ET)` };
  }
  return { isOpen: false, message: "After-Hours — NYSE Closed" };
}
