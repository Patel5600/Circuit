import React from "react";
import { MARKETS_DATA, MarketMetadata, DeployedMarket } from "../data/markets";

/**
 * Display metadata for the asset that is actually registered on-chain.
 *
 * SPL mints carry no symbol on-chain here, so a label has to come from
 * somewhere. It resolves from the active market, then falls back to env,
 * then to the catalogue entry flagged as collateral-enabled, then to a neutral label.
 */
export interface AssetDisplay {
  symbol: string;
  name: string;
  logo?: React.ReactNode;
}

function env(key: string): string {
  const v = (import.meta as any).env?.[key];
  return v === undefined || v === "" ? "" : String(v);
}

export function activeAssetDisplay(marketOrSymbol?: DeployedMarket | string): AssetDisplay {
  const symbol =
    typeof marketOrSymbol === "string"
      ? marketOrSymbol
      : marketOrSymbol?.symbol;

  const catalogue: MarketMetadata | undefined = symbol
    ? MARKETS_DATA.find((m) => m.symbol === symbol)
    : (MARKETS_DATA.find((m) => m.collateralEnabled) ?? MARKETS_DATA[0]);

  return {
    symbol:
      catalogue?.tokenSymbol ||
      (typeof marketOrSymbol === "object" ? marketOrSymbol?.tokenSymbol : null) ||
      env("VITE_COLLATERAL_SYMBOL") ||
      "Collateral",
    name:
      catalogue?.displayName ||
      (typeof marketOrSymbol === "object" ? marketOrSymbol?.name : null) ||
      env("VITE_COLLATERAL_NAME") ||
      "Tokenized equity",
    logo: catalogue?.logoSvg,
  };
}

export function activeQuoteSymbol(market?: DeployedMarket): string {
  return market?.quoteSymbol || env("VITE_QUOTE_SYMBOL") || "USDC";
}

export const QUOTE_SYMBOL = env("VITE_QUOTE_SYMBOL") || "USDC";
