/**
 * Circuit Protocol - Simulation Portfolio Provider
 * 
 * Sandboxed virtual portfolio environment dedicated strictly to /app/learn.
 * Explicitly flagged with isSimulated: true and zero wallet / on-chain interaction.
 */

import { useState, useMemo, useCallback } from "react";
import { getAssetMark, getAssetName } from "../../data/logos";
import { BPS } from "../risk/portfolio";
import { Position, PortfolioSnapshot } from "./provider";

export interface SimulationControlParams {
  nvdaWeightPct: number; // e.g. 60
  aaplWeightPct: number; // e.g. 25
  msftWeightPct: number; // e.g. 15
  nvdaConfBps: number;   // e.g. 18
  aaplConfBps: number;   // e.g. 18
  msftConfBps: number;   // e.g. 14
  marketOpen: boolean;
  marketDropPct: number; // 0 to -30
  simulatedDebtUsd: number;
}

export const DEFAULT_SIMULATION_PARAMS: SimulationControlParams = {
  nvdaWeightPct: 58,
  aaplWeightPct: 27,
  msftWeightPct: 15,
  nvdaConfBps: 18,
  aaplConfBps: 18,
  msftConfBps: 14,
  marketOpen: true,
  marketDropPct: 0,
  simulatedDebtUsd: 1800,
};

export function buildSimulatedPortfolioSnapshot(params: SimulationControlParams): PortfolioSnapshot {
  const baseCollateralUsd = 10_000;
  const dropMultiplier = 1 + params.marketDropPct / 100;
  const stressedTotalCollateral = baseCollateralUsd * dropMultiplier;

  // Normalized weights
  const totalWeight = params.nvdaWeightPct + params.aaplWeightPct + params.msftWeightPct;
  const wNvda = totalWeight > 0 ? params.nvdaWeightPct / totalWeight : 0.5;
  const wAapl = totalWeight > 0 ? params.aaplWeightPct / totalWeight : 0.3;
  const wMsft = totalWeight > 0 ? params.msftWeightPct / totalWeight : 0.2;

  const nvdaPrice = 138.25 * dropMultiplier;
  const aaplPrice = 228.80 * dropMultiplier;
  const msftPrice = 432.10 * dropMultiplier;

  const nvdaVal = stressedTotalCollateral * wNvda;
  const aaplVal = stressedTotalCollateral * wAapl;
  const msftVal = stressedTotalCollateral * wMsft;

  const nvdaShares = nvdaVal / nvdaPrice;
  const aaplShares = aaplVal / aaplPrice;
  const msftShares = msftVal / msftPrice;

  const nvdaConfUsd = (nvdaPrice * params.nvdaConfBps) / BPS;
  const aaplConfUsd = (aaplPrice * params.aaplConfBps) / BPS;
  const msftConfUsd = (msftPrice * params.msftConfBps) / BPS;

  const nvdaConservativePrice = Math.max(0, nvdaPrice - nvdaConfUsd);
  const aaplConservativePrice = Math.max(0, aaplPrice - aaplConfUsd);
  const msftConservativePrice = Math.max(0, msftPrice - msftConfUsd);

  const rawPositions: {
    symbol: string;
    name: string;
    mint: string;
    shares: number;
    price: number;
    confBps: number;
    maxConfBps: number;
    confUsd: number;
    conservativePrice: number;
    val: number;
    weightPct: number;
    baseLtvBps: number;
    liqThresholdBps: number;
  }[] = [
    {
      symbol: "NVDA",
      name: "NVIDIA Corporation",
      mint: "CARqKy5GTCxz5G1tFiYA96A3Q8jaUE9Vppk7cjGJxRqq",
      shares: nvdaShares,
      price: nvdaPrice,
      confBps: params.nvdaConfBps,
      maxConfBps: 150,
      confUsd: nvdaConfUsd,
      conservativePrice: nvdaConservativePrice,
      val: nvdaVal,
      weightPct: wNvda * 100,
      baseLtvBps: 7000,
      liqThresholdBps: 8000,
    },
    {
      symbol: "AAPL",
      name: "Apple Inc.",
      mint: "4zs2vg7MXYms9gwQxA6VYTZCfGy4NVyp1pca8TqdMmnS",
      shares: aaplShares,
      price: aaplPrice,
      confBps: params.aaplConfBps,
      maxConfBps: 150,
      confUsd: aaplConfUsd,
      conservativePrice: aaplConservativePrice,
      val: aaplVal,
      weightPct: wAapl * 100,
      baseLtvBps: 7000,
      liqThresholdBps: 8000,
    },
    {
      symbol: "MSFT",
      name: "Microsoft Corporation",
      mint: "gLjzboHgbevzEedufXfWyrgaFk7ePNLBKzRnpGbWpF2",
      shares: msftShares,
      price: msftPrice,
      confBps: params.msftConfBps,
      maxConfBps: 150,
      confUsd: msftConfUsd,
      conservativePrice: msftConservativePrice,
      val: msftVal,
      weightPct: wMsft * 100,
      baseLtvBps: 7000,
      liqThresholdBps: 8000,
    },
  ];

  let maxWeightPct = 0;
  let dominantAssetSymbol = "NVDA";

  const positions: Position[] = rawPositions.map((p) => {
    if (p.weightPct > maxWeightPct) {
      maxWeightPct = p.weightPct;
      dominantAssetSymbol = p.symbol;
    }

    const isConcentrated = p.weightPct > 40;
    const isOracleElevated = p.confBps > 50;
    const assetHaircutBps = (isConcentrated ? (p.weightPct - 40) * 36 : 0) + (isOracleElevated ? (p.confBps - 50) * 4 : 0);
    const riskContributionUsd = Math.round(stressedTotalCollateral * (assetHaircutBps / BPS));

    let explanation = `Virtual learning asset with ${Math.round(p.weightPct)}% portfolio allocation.`;
    if (isConcentrated) {
      explanation = `Single-asset concentration (${Math.round(p.weightPct)}% > 40% threshold) triggers virtual Risk Ratchet penalty of -${Math.round((p.weightPct - 40) * 36)} bps.`;
    }

    return {
      identity: {
        wallet: "SimulatedWallet111111111111111111111111111111111",
        assetMint: p.mint,
        collateralAccount: `SimulatedCollateral_${p.symbol}`,
        marketSymbol: p.symbol,
      },
      symbol: p.symbol,
      name: p.name,
      mint: p.mint,
      collateralRaw: BigInt(Math.round(p.shares * 1e6)),
      collateralUi: p.shares,
      debtRaw: 0n,
      debtUi: 0,
      priceUsd: p.price,
      confidenceUsd: p.confUsd,
      confBps: p.confBps,
      maxConfBps: p.maxConfBps,
      conservativePriceUsd: p.conservativePrice,
      collateralValueUsd: p.val,
      conservativeValueUsd: p.shares * p.conservativePrice,
      weightPct: p.weightPct,
      baseLtvBps: p.baseLtvBps,
      liqThresholdBps: p.liqThresholdBps,
      oracleHealthy: p.confBps <= p.maxConfBps,
      marketOpen: params.marketOpen,
      mark: getAssetMark(p.symbol),
      riskContributionUsd,
      explanation,
    };
  });

  const conservativeCollateralUsd = positions.reduce((sum, p) => sum + p.conservativeValueUsd, 0);

  // Concentration penalty
  const concentrationPenaltyBps = maxWeightPct > 40
    ? Math.round((maxWeightPct - 40) * 36)
    : 0;

  // Oracle penalty
  const maxConfBps = Math.max(...positions.map((p) => p.confBps));
  const oraclePenaltyBps = maxConfBps > 50 ? Math.round((maxConfBps - 50) * 4) : 0;
  const totalHaircutBps = concentrationPenaltyBps + oraclePenaltyBps;

  const weightedBaseLtvBps = 7000;
  const effectiveLtvBps = Math.max(3000, weightedBaseLtvBps - totalHaircutBps);

  const borrowCapacityUsd = Math.max(
    0,
    stressedTotalCollateral * (effectiveLtvBps / BPS) - params.simulatedDebtUsd
  );

  const weightedLiqThreshold = 8000;
  const healthFactorBps = params.simulatedDebtUsd > 0
    ? Math.round(((stressedTotalCollateral * (weightedLiqThreshold / BPS)) / params.simulatedDebtUsd) * BPS)
    : null;

  let hardOverride = false;
  let hardOverrideReason: string | undefined = undefined;
  if (!params.marketOpen) {
    hardOverride = true;
    hardOverrideReason = "Simulated NYSE Market Session Closed";
  } else if (maxConfBps > 150) {
    hardOverride = true;
    hardOverrideReason = `Simulated Pyth confidence spread breached (${maxConfBps} bps > 150 bps)`;
  }

  let riskState: "SAFE" | "RESTRICTED" | "DEFENSIVE" | "EMERGENCY" = "SAFE";
  if (hardOverride) {
    riskState = "EMERGENCY";
  } else if (maxWeightPct > 60 || maxConfBps > 100) {
    riskState = "DEFENSIVE";
  } else if (maxWeightPct > 40 || maxConfBps > 50) {
    riskState = "RESTRICTED";
  }

  return {
    isSimulated: true,
    providerType: "SIMULATION",
    walletAddress: "SimulatedWallet111111111111111111111111111111111",
    positions,
    totalCollateralUsd: stressedTotalCollateral,
    conservativeCollateralUsd,
    totalDebtUsd: params.simulatedDebtUsd,
    weightedBaseLtvBps,
    effectiveLtvBps,
    borrowCapacityUsd,
    healthFactorBps,
    maxWeightPct,
    dominantAssetSymbol,
    concentrationPenaltyBps,
    oraclePenaltyBps,
    totalHaircutBps,
    riskState,
    hardOverride,
    hardOverrideReason,
    borrowAllowed: !hardOverride && borrowCapacityUsd > 0 && riskState !== "EMERGENCY",
    withdrawAllowed: !hardOverride && riskState !== "EMERGENCY",
    repayAllowed: true,
    liquidationActive: healthFactorBps !== null && healthFactorBps < BPS,
    lastSyncTimestamp: Date.now(),
  };
}

export function useSimulationPortfolio(initialParams = DEFAULT_SIMULATION_PARAMS) {
  const [params, setParams] = useState<SimulationControlParams>(initialParams);

  const snapshot = useMemo(() => {
    return buildSimulatedPortfolioSnapshot(params);
  }, [params]);

  const updateParam = useCallback(<K extends keyof SimulationControlParams>(
    key: K,
    value: SimulationControlParams[K]
  ) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  }, []);

  return {
    params,
    snapshot,
    updateParam,
    resetParams: () => setParams(DEFAULT_SIMULATION_PARAMS),
  };
}
