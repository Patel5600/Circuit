import { useState, useEffect, useCallback } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { DEPLOYED_MARKETS, DeployedMarket, MARKETS_DATA } from "../data/markets";
import {
  positionPda,
  assetConfigPda,
  marketGuardPda,
  readOnlyProgram,
  PositionView,
  CustodyState,
  MarketState,
  toUi,
  BPS,
} from "../lib/protocol";
import { derivePriceAccount, decodePriceUpdateV2 } from "../lib/pyth";

export interface UserMarketPosition {
  market: DeployedMarket;
  position: PositionView;
  collateralRaw: bigint;
  collateralUi: number;
  debtRaw: bigint;
  debtUi: number;
  priceUsd: number;
  collateralValueUsd: number;
  confBps: number;
  maxConfBps: number;
  oracleHealthy: boolean;
  marketOpen: boolean;
  baseLtvBps: number;
  liqThresholdBps: number;
  weightPct: number;
}

export interface UserPortfolioData {
  loading: boolean;
  error: string | null;
  positions: UserMarketPosition[];
  totalCollateralUsd: number;
  totalDebtUsd: number;
  weightedBaseLtvBps: number;
  effectiveLtvBps: number;
  borrowCapacityUsd: number;
  healthFactorBps: number | null;
  maxWeightPct: number;
  concentrationPenaltyBps: number;
  riskState: "SAFE" | "RESTRICTED" | "DEFENSIVE" | "EMERGENCY";
  hardOverride: boolean;
  hardOverrideReason?: string;
  borrowAllowed: boolean;
  refresh: () => void;
}

export function useAllUserPositions(): UserPortfolioData {
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [positions, setPositions] = useState<UserMarketPosition[]>([]);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!publicKey) {
      setPositions([]);
      setLoading(false);
      return;
    }

    let isMounted = true;

    async function loadPositions() {
      if (!publicKey) return;
      setLoading(true);
      setError(null);

      try {
        const program = readOnlyProgram(connection);
        const markets = DEPLOYED_MARKETS;

        // 1. Derive all account PDAs in parallel
        const posPdas = markets.map((m) => positionPda(publicKey, new PublicKey(m.mint)));
        const assetPdas = markets.map((m) => assetConfigPda(new PublicKey(m.mint)));
        const guardPdas = markets.map((m) => marketGuardPda(m.feedId));
        const pythPdas = markets.map((m) => derivePriceAccount(m.feedId, 0));

        // 2. Fetch all 48 accounts in a single batched RPC request (up to 100 accounts per call)
        const allPdas = [...posPdas, ...assetPdas, ...guardPdas, ...pythPdas];
        const allInfos = await connection.getMultipleAccountsInfo(allPdas);

        const posInfos = allInfos.slice(0, markets.length);
        const assetInfos = allInfos.slice(markets.length, markets.length * 2);
        const guardInfos = allInfos.slice(markets.length * 2, markets.length * 3);
        const pythInfos = allInfos.slice(markets.length * 3, markets.length * 4);

        const nowSeconds = Math.floor(Date.now() / 1000);
        const activeList: UserMarketPosition[] = [];

        for (let i = 0; i < markets.length; i++) {
          const m = markets[i];
          const posInfo = posInfos[i];
          if (!posInfo || posInfo.data.length < 90) continue;

          let pos: PositionView;
          try {
            const raw = program.coder.accounts.decode("position", Buffer.from(posInfo.data));
            pos = {
              owner: raw.owner,
              collateralAmount: BigInt(raw.collateralAmount.toString()),
              debtAmount: BigInt(raw.debtAmount.toString()),
              lastValidPrice: BigInt(raw.lastValidPrice.toString()),
              lastValidExpo: Number(raw.lastValidExpo),
              state: raw.state?.liquidatable ? "liquidatable" : "healthy",
            };
          } catch {
            continue;
          }

          // Strictly filter to accounts that actually have deposited collateral or debt
          if (pos.collateralAmount === 0n && pos.debtAmount === 0n) continue;

          // Decode AssetConfig
          let maxOracleAge = 600;
          let maxConfBps = 200;
          let custodyState: CustodyState = "healthy";
          const assetInfo = assetInfos[i];
          if (assetInfo && assetInfo.data.length > 0) {
            try {
              const rawA = program.coder.accounts.decode("assetConfig", Buffer.from(assetInfo.data));
              maxOracleAge = Number(rawA.maxOracleAge);
              maxConfBps = Number(rawA.maxConfBps);
              custodyState = rawA.custodyState?.impaired ? "impaired" : rawA.custodyState?.delayed ? "delayed" : "healthy";
            } catch {}
          }

          // Decode MarketGuard
          let marketState: MarketState = "safe";
          let lastValidPriceBig = pos.lastValidPrice;
          let lastValidExpoNum = pos.lastValidExpo;
          const guardInfo = guardInfos[i];
          if (guardInfo && guardInfo.data.length > 0) {
            try {
              const rawG = program.coder.accounts.decode("marketGuard", Buffer.from(guardInfo.data));
              marketState = rawG.marketState?.emergency ? "emergency" : rawG.marketState?.restricted ? "restricted" : "safe";
              if (rawG.lastValidPrice) lastValidPriceBig = BigInt(rawG.lastValidPrice.toString());
              if (rawG.lastValidExpo) lastValidExpoNum = Number(rawG.lastValidExpo);
            } catch {}
          }

          // Decode Pyth (real on-chain PriceUpdateV2)
          let priceUsd = 0;
          let confBps = 0;
          let oracleHealthy = false;
          const pythInfo = pythInfos[i];
          if (pythInfo && pythInfo.data.length > 0) {
            try {
              const update = decodePriceUpdateV2(new Uint8Array(pythInfo.data));
              if (update && update.isFull && update.price > 0n) {
                priceUsd = Number(update.price) * Math.pow(10, update.exponent);
                const abs = update.price < 0n ? -update.price : update.price;
                confBps = abs === 0n ? 0 : Number((update.conf * 10_000n) / abs);
                const ageSec = Math.max(0, nowSeconds - Number(update.publishTime));
                oracleHealthy = ageSec <= maxOracleAge && confBps <= maxConfBps;
              }
            } catch {}
          }

          // Fallback to on-chain lastValidPrice recorded by the circuit program if live Pyth not yet posted
          if (priceUsd <= 0 && lastValidPriceBig > 0n) {
            priceUsd = Number(lastValidPriceBig) * Math.pow(10, lastValidExpoNum);
            oracleHealthy = false; // Using stale lastValidPrice is not considered healthy live oracle
          }

          const collateralUi = toUi(pos.collateralAmount);
          const debtUi = toUi(pos.debtAmount);
          const collateralValueUsd = collateralUi * priceUsd;

          activeList.push({
            market: m,
            position: pos,
            collateralRaw: pos.collateralAmount,
            collateralUi,
            debtRaw: pos.debtAmount,
            debtUi,
            priceUsd,
            collateralValueUsd,
            confBps,
            maxConfBps,
            oracleHealthy: oracleHealthy && custodyState !== "impaired",
            marketOpen: marketState !== "emergency",
            baseLtvBps: m.baseLtvBps,
            liqThresholdBps: m.liqThresholdBps,
            weightPct: 0,
          });
        }

        if (isMounted) {
          setPositions(activeList);
          setLoading(false);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err?.message || "Failed to load on-chain positions");
          setLoading(false);
        }
      }
    }

    loadPositions();

    // Auto-refresh every 12 seconds
    const interval = setInterval(loadPositions, 12000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [connection, publicKey, tick]);

  // Compute portfolio totals and risk aggregates
  const totalCollateralUsd = positions.reduce((acc, p) => acc + p.collateralValueUsd, 0);
  const totalDebtUsd = positions.reduce((acc, p) => acc + p.debtUi, 0);

  // Compute weights
  const enrichedPositions = positions.map((p) => ({
    ...p,
    weightPct: totalCollateralUsd > 0 ? (p.collateralValueUsd / totalCollateralUsd) * 100 : 0,
  }));

  const maxWeightPct = enrichedPositions.length > 0
    ? Math.max(...enrichedPositions.map((p) => p.weightPct))
    : 0;

  // Concentration Penalty: if max single asset > 40%, penalty = (maxWeight - 40) * 36 bps
  const concentrationPenaltyBps = maxWeightPct > 40
    ? Math.round((maxWeightPct - 40) * 36)
    : 0;

  // Weighted Base LTV
  const weightedBaseLtvBps = totalCollateralUsd > 0
    ? Math.round(enrichedPositions.reduce((acc, p) => acc + p.collateralValueUsd * p.baseLtvBps, 0) / totalCollateralUsd)
    : 7000;

  const effectiveLtvBps = totalCollateralUsd > 0
    ? Math.max(3000, weightedBaseLtvBps - concentrationPenaltyBps)
    : 0;

  const borrowCapacityUsd = Math.max(0, totalCollateralUsd * (effectiveLtvBps / BPS) - totalDebtUsd);

  // Weighted Liquidation Threshold
  const weightedLiqThreshold = totalCollateralUsd > 0
    ? enrichedPositions.reduce((acc, p) => acc + p.collateralValueUsd * p.liqThresholdBps, 0) / totalCollateralUsd
    : 8000;

  const healthFactorBps = totalDebtUsd > 0
    ? Math.round((totalCollateralUsd * (weightedLiqThreshold / BPS) / totalDebtUsd) * BPS)
    : null;

  // Hard risk overrides check
  let hardOverride = false;
  let hardOverrideReason: string | undefined = undefined;

  for (const p of enrichedPositions) {
    if (!p.oracleHealthy) {
      hardOverride = true;
      hardOverrideReason = `${p.market.symbol} oracle confidence or freshness breached (${p.confBps} bps > ${p.maxConfBps} bps)`;
      break;
    }
    if (!p.marketOpen) {
      hardOverride = true;
      hardOverrideReason = `${p.market.symbol} market session emergency`;
      break;
    }
  }

  // Risk state derivation
  let riskState: "SAFE" | "RESTRICTED" | "DEFENSIVE" | "EMERGENCY" = "SAFE";
  if (hardOverride) {
    riskState = "EMERGENCY";
  } else if (maxWeightPct > 60) {
    riskState = "RESTRICTED";
  } else if (maxWeightPct > 40) {
    riskState = "RESTRICTED";
  } else {
    riskState = "SAFE";
  }

  const borrowAllowed = totalCollateralUsd > 0 && !hardOverride && borrowCapacityUsd > 0 && riskState !== "EMERGENCY";

  return {
    loading,
    error,
    positions: enrichedPositions,
    totalCollateralUsd,
    totalDebtUsd,
    weightedBaseLtvBps,
    effectiveLtvBps,
    borrowCapacityUsd,
    healthFactorBps,
    maxWeightPct,
    concentrationPenaltyBps,
    riskState,
    hardOverride,
    hardOverrideReason,
    borrowAllowed,
    refresh,
  };
}
