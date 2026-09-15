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

export const DEPLOYED_MARKETS: DeployedMarket[] =
  (marketsJson as any)?.markets || (marketsJson as any)?.default?.markets || [];

export function getDeployedMarket(symbol: string, quoteSymbol?: string): DeployedMarket | undefined {
  if (quoteSymbol) {
    return DEPLOYED_MARKETS.find((m) => m.symbol === symbol && m.quoteSymbol === quoteSymbol);
  }
  return DEPLOYED_MARKETS.find((m) => m.symbol === symbol);
}

export function getDeployedMarketByMint(mint: string): DeployedMarket | undefined {
  return DEPLOYED_MARKETS.find((m) => m.mint === mint);
}
