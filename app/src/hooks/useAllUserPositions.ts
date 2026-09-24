import { useState, useEffect, useCallback } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { DEPLOYED_MARKETS, DeployedMarket, MARKETS_DATA } from "../data/markets";
import {
  positionPda,
  assetConfigPda,
  marketGuardPda,
  decodeMarketGuardView,
  readOnlyProgram,
  PositionView,
  CustodyState,
  MarketState,
  toUi,
  BPS,
} from "../lib/protocol";
import { derivePriceAccount, decodePriceUpdateV2, oracleCache } from "../lib/pyth";
import { circuitTransport } from "../lib/transport/circuit-transport";
import { protocolEventBus } from "../lib/realtime/event-bus";

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
  maxOracleAge: number;
  publishTime: number;
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
  overridesByAssetId?: Record<string, { hardOverride: boolean; hardOverrideReason?: string }>;
  riskStateByAssetId?: Record<string, "SAFE" | "RESTRICTED" | "DEFENSIVE" | "EMERGENCY">;
  positionsByAssetId?: Record<string, UserMarketPosition>;
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

        // 2. Fetch all 48 accounts in a single batched RPC request scheduled via CircuitTransport
        const allPdas = [...posPdas, ...assetPdas, ...guardPdas, ...pythPdas];
        const allInfos = await circuitTransport.getMultipleAccountsInfo(
          connection,
          allPdas,
          "P2_PORTFOLIO",
          3000
        );

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
              const decodedG = decodeMarketGuardView(program, guardInfo);
              if (decodedG) {
                marketState = decodedG.marketState;
                lastValidPriceBig = decodedG.lastValidPrice;
                lastValidExpoNum = decodedG.lastValidExpo;
              }
            } catch {}
          }

          // Decode Pyth (real on-chain PriceUpdateV2)
          let priceUsd = 0;
          let confBps = 0;
          let oracleHealthy = false;
          let publishTime = 0;
          const pythInfo = pythInfos[i];
          if (pythInfo && pythInfo.data.length > 0) {
            try {
              const update = decodePriceUpdateV2(new Uint8Array(pythInfo.data));
              if (update && update.isFull && update.price > 0n) {
                priceUsd = Number(update.price) * Math.pow(10, update.exponent);
                const abs = update.price < 0n ? -update.price : update.price;
                confBps = abs === 0n ? 0 : Number((update.conf * 10_000n) / abs);
                publishTime = Number(update.publishTime);
                const ageSec = Math.max(0, nowSeconds - publishTime);
                oracleHealthy = ageSec <= maxOracleAge && confBps <= maxConfBps;
              }
            } catch {}
          }

          // Check real Pyth oracle cache
          if (priceUsd <= 0) {
            const cached = oracleCache.get(m.mint) || (m.feedId ? oracleCache.get(m.feedId) : null);
            if (cached && cached.snapshot.priceUsd > 0) {
              priceUsd = cached.snapshot.priceUsd;
              confBps = cached.snapshot.confBps;
              publishTime = Number(cached.snapshot.update.publishTime);
              const ageSec = Math.max(0, nowSeconds - publishTime);
              oracleHealthy = ageSec <= maxOracleAge && confBps <= maxConfBps;
            }
          }

          // Fallback to on-chain lastValidPrice recorded by the circuit program if live Pyth not yet posted
          if (priceUsd <= 0 && lastValidPriceBig > 0n) {
            priceUsd = Number(lastValidPriceBig) * Math.pow(10, lastValidExpoNum);
            confBps = 0;
            oracleHealthy = true; // On-chain verified collateral valuation from position PDA
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
            maxOracleAge,
            publishTime,
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

    // Event bus integration: reload on position change or transaction confirmation
    const unsubPos = protocolEventBus.onType("POSITION_CHANGE", () => {
      if (isMounted) loadPositions();
    });
    const unsubTx = protocolEventBus.onType("TRANSACTION_LIFECYCLE", (ev) => {
      if (ev.data?.status === "CONFIRMED" || ev.data?.status === "SUCCESS") {
        if (isMounted) loadPositions();
      }
    });

    return () => {
      isMounted = false;
      unsubPos();
      unsubTx();
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

  // ── Asset-Scoped Overrides & Risk Derivations ──
  const nowSeconds = Math.floor(Date.now() / 1000);
  const overridesByAssetId: Record<string, { hardOverride: boolean; hardOverrideReason?: string }> = {};
  const riskStateByAssetId: Record<string, "SAFE" | "RESTRICTED" | "DEFENSIVE" | "EMERGENCY"> = {};
  const positionsByAssetId: Record<string, UserMarketPosition> = {};

  let hardOverride = false;
  let hardOverrideReason: string | undefined = undefined;

  for (const p of enrichedPositions) {
    positionsByAssetId[p.market.symbol] = p;

    let assetHardOverride = false;
    let assetHardOverrideReason: string | undefined = undefined;

    if (p.confBps > p.maxConfBps && p.maxConfBps > 0) {
      assetHardOverride = true;
      assetHardOverrideReason = `${p.market.symbol} oracle confidence breached (${p.confBps} bps > ${p.maxConfBps} bps)`;
    } else if (p.confBps > 300) {
      assetHardOverride = true;
      assetHardOverrideReason = `${p.market.symbol} oracle confidence blown (${p.confBps} bps > 300 bps)`;
    } else if (p.publishTime > 0 && (nowSeconds - p.publishTime) > p.maxOracleAge) {
      assetHardOverride = true;
      assetHardOverrideReason = `${p.market.symbol} oracle price stale (${nowSeconds - p.publishTime}s > ${p.maxOracleAge}s)`;
    } else if (!p.oracleHealthy && p.priceUsd <= 0) {
      assetHardOverride = true;
      assetHardOverrideReason = `${p.market.symbol} oracle price unavailable`;
    }

    overridesByAssetId[p.market.symbol] = { hardOverride: assetHardOverride, hardOverrideReason: assetHardOverrideReason };

    let assetRiskState: "SAFE" | "RESTRICTED" | "DEFENSIVE" | "EMERGENCY" = "SAFE";
    if (assetHardOverride) {
      assetRiskState = "EMERGENCY";
    } else if (p.confBps > 150) {
      assetRiskState = "DEFENSIVE";
    } else if (!p.marketOpen || p.confBps > 50) {
      assetRiskState = "RESTRICTED";
    } else {
      assetRiskState = "SAFE";
    }
    riskStateByAssetId[p.market.symbol] = assetRiskState;

    // Only active deposited collateral or outstanding debt can trigger a portfolio-wide override
    const hasHolding = (p.collateralRaw ?? 0n) > 0n || (p.debtRaw ?? 0n) > 0n;
    if (hasHolding && assetHardOverride && !hardOverride) {
      hardOverride = true;
      hardOverrideReason = assetHardOverrideReason;
    }
  }

  // Risk state derivation
  let riskState: "SAFE" | "RESTRICTED" | "DEFENSIVE" | "EMERGENCY" = "SAFE";
  if (hardOverride) {
    riskState = "EMERGENCY";
  } else if (enrichedPositions.some((p) => ((p.collateralRaw ?? 0n) > 0n || (p.debtRaw ?? 0n) > 0n) && p.confBps > 150)) {
    riskState = "DEFENSIVE";
  } else if (
    maxWeightPct > 40 ||
    enrichedPositions.some((p) => ((p.collateralRaw ?? 0n) > 0n || (p.debtRaw ?? 0n) > 0n) && (p.confBps > 50 || !p.marketOpen))
  ) {
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
    overridesByAssetId,
    riskStateByAssetId,
    positionsByAssetId,
    borrowAllowed,
    refresh,
  };
}
