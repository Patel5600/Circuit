/**
 * Circuit Protocol - Canonical Asset Registry & Asset Scoping
 *
 * Implements the single canonical asset identity contract:
 * assetId -> asset config -> token mint -> oracle feed ID -> oracle account
 *         -> reference market session -> onchain market -> collateral valuation
 *         -> risk state -> borrow capacity -> permission state
 *
 * Invariant: Never allow cross-asset state contamination.
 */

import marketsJson from "../../data/markets.json";
import { derivePriceAccount, PYTH_PRICE_ACCOUNT } from "../pyth";

export interface AssetSessionConfig {
  referenceMarket: "EQUITY_US";
  hasPreMarket: boolean;
  hasPostMarket: boolean;
  openHourEt: number;
  openMinuteEt: number;
  closeHourEt: number;
  closeMinuteEt: number;
}

export interface AssetRiskConfig {
  baseLtvBps: number;
  liqThresholdBps: number;
  liqBonusBps: number;
  maxConfBps: number;
  maxOracleAge: number;
  maxWeightPct: number;
  concentrationThresholdPct: number;
}

export interface CanonicalAssetConfig {
  assetId: string;
  symbol: string;
  tokenSymbol: string;
  name: string;
  tokenMint: string;
  quoteSymbol: string;
  quoteMint: string;
  pythFeedId: string;
  pythFeedAccount: string;
  assetConfigPda: string;
  marketGuardPda: string;
  collateralVault: string;
  liquidityVault: string;
  sessionConfig: AssetSessionConfig;
  riskConfig: AssetRiskConfig;
}

export class AssetContextMismatchError extends Error {
  readonly code = "ASSET_CONTEXT_MISMATCH";
  readonly details: Record<string, string | undefined>;

  constructor(message: string, details: Record<string, string | undefined>) {
    super(`ASSET_CONTEXT_MISMATCH: ${message}`);
    this.name = "AssetContextMismatchError";
    this.details = details;
    Object.setPrototypeOf(this, AssetContextMismatchError.prototype);
  }
}

/**
 * Normalizes input string to canonical assetId (e.g. "NVDAx", "nvda", "NVDA-USDC" -> "NVDA").
 */
export function normalizeAssetId(input?: string | null): string {
  if (!input) return "NVDA";
  const trimmed = input.trim();
  const withoutQuote = trimmed.split("-")[0].split("/")[0].trim();
  const upper = withoutQuote.toUpperCase();
  if (upper.endsWith("X") && upper.length > 2 && upper !== "SPX") {
    return upper.slice(0, -1);
  }
  return upper;
}

class CanonicalAssetRegistry {
  private readonly assetsById = new Map<string, CanonicalAssetConfig>();
  private readonly assetsByMint = new Map<string, CanonicalAssetConfig>();
  private readonly assetsByFeedId = new Map<string, CanonicalAssetConfig>();
  private readonly assetList: CanonicalAssetConfig[] = [];

  constructor() {
    this.initializeFromConfig();
  }

  private initializeFromConfig() {
    const rawMarkets: any[] =
      (marketsJson as any)?.markets || (marketsJson as any)?.default?.markets || [];

    for (const m of rawMarkets) {
      const canonicalId = normalizeAssetId(m.symbol);
      const isExactMatch = m.symbol === canonicalId;
      const isPrimaryQuote = m.quoteSymbol === "USDC" || !m.quoteSymbol;
      const derivedPriceAccount =
        PYTH_PRICE_ACCOUNT && canonicalId === "NVDA"
          ? PYTH_PRICE_ACCOUNT.toBase58()
          : derivePriceAccount(m.feedId, 0).toBase58();

      const config: CanonicalAssetConfig = {
        assetId: canonicalId,
        symbol: isExactMatch ? canonicalId : m.symbol,
        tokenSymbol: m.tokenSymbol || `${canonicalId}x`,
        name: m.name || m.symbol,
        tokenMint: m.mint,
        quoteSymbol: m.quoteSymbol || "USDC",
        quoteMint: m.quoteMint,
        pythFeedId: m.feedId,
        pythFeedAccount: derivedPriceAccount,
        assetConfigPda: m.assetConfigPda,
        marketGuardPda: m.marketGuardPda,
        collateralVault: m.collateralVault,
        liquidityVault: m.liquidityVault,
        sessionConfig: {
          referenceMarket: "EQUITY_US",
          hasPreMarket: true,
          hasPostMarket: true,
          openHourEt: 9,
          openMinuteEt: 30,
          closeHourEt: 16,
          closeMinuteEt: 0,
        },
        riskConfig: {
          baseLtvBps: m.baseLtvBps || 7000,
          liqThresholdBps: m.liqThresholdBps || 8000,
          liqBonusBps: m.liqBonusBps || 500,
          maxConfBps: 100,
          maxOracleAge: 600,
          maxWeightPct: 40,
          concentrationThresholdPct: 40,
        },
      };

      const existing = this.assetsById.get(canonicalId);
      if (!existing || isExactMatch || (isPrimaryQuote && existing.quoteSymbol !== "USDC")) {
        this.assetsById.set(canonicalId, {
          ...config,
          symbol: canonicalId,
        });
      }
      if (config.tokenMint) {
        this.assetsByMint.set(config.tokenMint, config);
      }
      if (config.pythFeedId) {
        this.assetsByFeedId.set(config.pythFeedId.toLowerCase(), config);
      }
      this.assetList.push(config);
    }
  }

  public get(assetIdOrMintOrSymbol?: string | null): CanonicalAssetConfig | undefined {
    if (!assetIdOrMintOrSymbol) return undefined;
    const direct = this.assetsByMint.get(assetIdOrMintOrSymbol);
    if (direct) return direct;

    const norm = normalizeAssetId(assetIdOrMintOrSymbol);
    const byId = this.assetsById.get(norm);
    if (byId) return byId;

    const byFeed = this.assetsByFeedId.get(assetIdOrMintOrSymbol.toLowerCase());
    if (byFeed) return byFeed;

    return undefined;
  }

  public require(assetIdOrMintOrSymbol?: string | null): CanonicalAssetConfig {
    const config = this.get(assetIdOrMintOrSymbol);
    if (!config) {
      throw new Error(`AssetRegistry: Unknown canonical asset '${assetIdOrMintOrSymbol}'`);
    }
    return config;
  }

  public list(): CanonicalAssetConfig[] {
    return [...this.assetList];
  }

  public has(assetIdOrMintOrSymbol?: string | null): boolean {
    return this.get(assetIdOrMintOrSymbol) !== undefined;
  }

  public getFeedId(assetIdOrMintOrSymbol: string): string {
    return this.require(assetIdOrMintOrSymbol).pythFeedId;
  }

  public getPriceAccount(assetIdOrMintOrSymbol: string): string {
    return this.require(assetIdOrMintOrSymbol).pythFeedAccount;
  }
}

export const AssetRegistry = new CanonicalAssetRegistry();

/**
 * Requirement 12: Assert transaction context integrity across action, position, oracle, risk, and market.
 * Fail closed if any context leaks across assets.
 */
export function assertAssetContextIntegrity(context: {
  actionAssetId: string;
  positionAssetId?: string;
  oracleAssetId?: string;
  riskAssetId?: string;
  marketAssetId?: string;
}): void {
  const target = normalizeAssetId(context.actionAssetId);

  if (context.positionAssetId && normalizeAssetId(context.positionAssetId) !== target) {
    throw new AssetContextMismatchError(
      `Position asset '${context.positionAssetId}' does not match action asset '${target}'`,
      { ...context, target }
    );
  }

  if (context.oracleAssetId && normalizeAssetId(context.oracleAssetId) !== target) {
    throw new AssetContextMismatchError(
      `Oracle asset '${context.oracleAssetId}' does not match action asset '${target}'`,
      { ...context, target }
    );
  }

  if (context.riskAssetId && normalizeAssetId(context.riskAssetId) !== target) {
    throw new AssetContextMismatchError(
      `Risk asset '${context.riskAssetId}' does not match action asset '${target}'`,
      { ...context, target }
    );
  }

  if (context.marketAssetId && normalizeAssetId(context.marketAssetId) !== target) {
    throw new AssetContextMismatchError(
      `Market asset '${context.marketAssetId}' does not match action asset '${target}'`,
      { ...context, target }
    );
  }
}
