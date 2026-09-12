import React from "react";
import { MARKETS_DATA, MarketMetadata } from "../data/markets";

/**
 * Display metadata for the asset that is actually registered on-chain.
 *
 * SPL mints carry no symbol on-chain here, so a label has to come from
 * somewhere. It is read from env first, then falls back to the catalogue entry
 * flagged as collateral-enabled, then to a neutral label. Only presentational
 * fields are taken from the catalogue - never price, mint or feed id.
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

export function activeAssetDisplay(): AssetDisplay {
  const catalogue: MarketMetadata | undefined =
    MARKETS_DATA.find((m) => m.collateralEnabled) ?? MARKETS_DATA[0];

  return {
    symbol: env("VITE_COLLATERAL_SYMBOL") || catalogue?.tokenSymbol || "Collateral",
    name:
      env("VITE_COLLATERAL_NAME") ||
      catalogue?.displayName ||
      "Tokenized equity",
    logo: catalogue?.logoSvg,
  };
}

export const QUOTE_SYMBOL = env("VITE_QUOTE_SYMBOL") || "USDC";
