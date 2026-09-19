export const BPS = 10_000;

export interface AssetRiskDetail {
  symbol: string;
  name: string;
  collateralUi: number;
  priceUsd: number;
  confidenceUsd: number;
  confBps: number;
  conservativePriceUsd: number;
  collateralValueUsd: number;
  conservativeValueUsd: number;
  weightPct: number;
  baseLtvBps: number;
  liqThresholdBps: number;
  oracleHealthy: boolean;
  marketOpen: boolean;
  
  // Risk factor contributions
  concentrationRisk: "LOW" | "MED" | "HIGH";
  oracleRisk: "LOW" | "MED" | "HIGH";
  marketRisk: "LOW" | "MED" | "HIGH";
  riskContributionUsd: number; // impact on borrow capacity
  explanation: string;
}

export interface PortfolioRiskAnalysis {
  totalCollateralUsd: number;
  conservativeCollateralUsd: number;
  totalDebtUsd: number;
  weightedBaseLtvBps: number;
  effectiveLtvBps: number;
  borrowCapacityUsd: number;
  healthFactorBps: number | null;
  maxWeightPct: number;
  dominantAssetSymbol: string;
  
  // LTV Drivers
  concentrationPenaltyBps: number;
  oraclePenaltyBps: number;
  totalHaircutBps: number;
  
  // Asset Breakdowns
  assetDetails: AssetRiskDetail[];
  
  // Hard Safety & Risk Ratchet State
  hardOverride: boolean;
  hardOverrideReason?: string;
  riskState: "SAFE" | "RESTRICTED" | "DEFENSIVE" | "EMERGENCY";

  // Explainability
  primaryRiskDriver: string;
  borrowPowerDiffUsd: number;
  causalExplanations: {
    title: string;
    description: string;
    impactBps: number;
    impactUsd: number;
    targetNode: "ASSETS" | "RISK_FACTORS" | "PORTFOLIO" | "CREDIT" | "PERMISSIONS";
  }[];
}

/**
 * Normalizes a raw Pyth price/conf integer with its signed exponent to floating USD.
 * E.g., raw 14850000000 with exponent -8 -> 148.50 USD.
 */
export function normalizePythPrice(rawPrice: bigint | number, exponent: number): number {
  return Number(rawPrice) * Math.pow(10, exponent);
}

/**
 * Computes conservative collateral valuation using Pyth confidence lower-bound:
 * p_conservative = max(0, price - confidence)
 */
export function calculateConservativePrice(priceUsd: number, confidenceUsd: number): number {
  return Math.max(0, priceUsd - confidenceUsd);
}

/**
 * Evaluates full dynamic portfolio risk and explainable causal drivers
 */
export function analyzePortfolioRisk(
  assets: {
    symbol: string;
    name: string;
    collateralUi: number;
    priceUsd: number;
    confidenceUsd: number;
    confBps: number;
    baseLtvBps: number;
    liqThresholdBps: number;
    oracleHealthy: boolean;
    marketOpen: boolean;
  }[],
  totalDebtUsd: number = 0
): PortfolioRiskAnalysis {
  // 1. Compute individual valuations
  const nominalValuations = assets.map((a) => {
    const conservativePrice = calculateConservativePrice(a.priceUsd, a.confidenceUsd);
    const nominalValue = a.collateralUi * a.priceUsd;
    const conservativeValue = a.collateralUi * conservativePrice;
    return {
      ...a,
      conservativePrice,
      nominalValue,
      conservativeValue,
    };
  });

  const totalCollateralUsd = nominalValuations.reduce((sum, a) => sum + a.nominalValue, 0);
  const conservativeCollateralUsd = nominalValuations.reduce((sum, a) => sum + a.conservativeValue, 0);

  // 2. Weights and single-asset concentration
  let maxWeightPct = 0;
  let dominantAssetSymbol = assets[0]?.symbol ?? "NVDA";

  const withWeights = nominalValuations.map((a) => {
    const weightPct = totalCollateralUsd > 0 ? (a.nominalValue / totalCollateralUsd) * 100 : 0;
    if (weightPct > maxWeightPct) {
      maxWeightPct = weightPct;
      dominantAssetSymbol = a.symbol;
    }
    return { ...a, weightPct };
  });

  // 3. Concentration Penalty: C_max > 40% incurs (C_max - 40) * 36 bps haircut
  const concentrationPenaltyBps = maxWeightPct > 40
    ? Math.round((maxWeightPct - 40) * 36)
    : 0;

  // 4. Oracle Confidence Penalty across portfolio
  const maxConfBps = assets.length > 0 ? Math.max(...assets.map((a) => a.confBps)) : 0;
  const oraclePenaltyBps = maxConfBps > 50
    ? Math.round((maxConfBps - 50) * 4)
    : 0;

  const totalHaircutBps = concentrationPenaltyBps + oraclePenaltyBps;

  // 5. Weighted Base LTV
  const weightedBaseLtvBps = totalCollateralUsd > 0
    ? Math.round(withWeights.reduce((sum, a) => sum + a.nominalValue * a.baseLtvBps, 0) / totalCollateralUsd)
    : 7000;

  // Dynamic Effective LTV floor at 30% (3000 bps)
  const effectiveLtvBps = totalCollateralUsd > 0
    ? Math.max(3000, weightedBaseLtvBps - totalHaircutBps)
    : 0;

  const maxBorrowCapacityUsd = totalCollateralUsd * (effectiveLtvBps / BPS);
  const borrowCapacityUsd = Math.max(0, maxBorrowCapacityUsd - totalDebtUsd);

  // 6. Weighted Liquidation Threshold and Health Factor
  const weightedLiqThresholdBps = totalCollateralUsd > 0
    ? withWeights.reduce((sum, a) => sum + a.nominalValue * a.liqThresholdBps, 0) / totalCollateralUsd
    : 8000;

  const healthFactorBps = totalDebtUsd > 0
    ? Math.round(((totalCollateralUsd * (weightedLiqThresholdBps / BPS)) / totalDebtUsd) * BPS)
    : null;

  // 7. Generate Per-Asset Explanatory Breakdown
  const assetDetails: AssetRiskDetail[] = withWeights.map((a) => {
    const isConcentrated = a.weightPct > 40;
    const isOracleElevated = a.confBps > 50;

    const concentrationRisk: "LOW" | "MED" | "HIGH" = a.weightPct > 60 ? "HIGH" : a.weightPct > 40 ? "MED" : "LOW";
    const oracleRisk: "LOW" | "MED" | "HIGH" = a.confBps > 150 ? "HIGH" : a.confBps > 50 ? "MED" : "LOW";
    const marketRisk: "LOW" | "MED" | "HIGH" = !a.marketOpen ? "HIGH" : "LOW";

    // Estimated impact on borrow capacity
    const assetHaircutBps = (a.weightPct > 40 ? (a.weightPct - 40) * 36 : 0) + (a.confBps > 50 ? (a.confBps - 50) * 4 : 0);
    const riskContributionUsd = Math.round(totalCollateralUsd * (assetHaircutBps / BPS));

    let explanation = `Nominal risk posture (${Math.round(a.weightPct)}% portfolio allocation).`;
    if (isConcentrated && isOracleElevated) {
      explanation = `Exposure concentrated at ${Math.round(a.weightPct)}% with elevated oracle uncertainty (${a.confBps} bps), reducing borrowing power by $${riskContributionUsd.toLocaleString()}.`;
    } else if (isConcentrated) {
      explanation = `Single-asset concentration (${Math.round(a.weightPct)}% > 40% threshold) triggers Risk Ratchet haircut of -${Math.round((a.weightPct - 40) * 36)} bps.`;
    } else if (isOracleElevated) {
      explanation = `Oracle confidence spread widened to ${a.confBps} bps, applying defensive valuation haircut.`;
    }

    return {
      symbol: a.symbol,
      name: a.name,
      collateralUi: a.collateralUi,
      priceUsd: a.priceUsd,
      confidenceUsd: a.confidenceUsd,
      confBps: a.confBps,
      conservativePriceUsd: a.conservativePrice,
      collateralValueUsd: a.nominalValue,
      conservativeValueUsd: a.conservativeValue,
      weightPct: a.weightPct,
      baseLtvBps: a.baseLtvBps,
      liqThresholdBps: a.liqThresholdBps,
      oracleHealthy: a.oracleHealthy,
      marketOpen: a.marketOpen,
      concentrationRisk,
      oracleRisk,
      marketRisk,
      riskContributionUsd,
      explanation,
    };
  });

  // 8. Causal Explanations for "Why Your Borrow Power Changed"
  const causalExplanations: PortfolioRiskAnalysis["causalExplanations"] = [];

  if (concentrationPenaltyBps > 0) {
    const impactUsd = Math.round(totalCollateralUsd * (concentrationPenaltyBps / BPS));
    causalExplanations.push({
      title: `${dominantAssetSymbol} Concentration (${Math.round(maxWeightPct)}%)`,
      description: `Exposure exceeds 40% threshold. Risk Ratchet deducts ${concentrationPenaltyBps} bps from Effective LTV.`,
      impactBps: -concentrationPenaltyBps,
      impactUsd: -impactUsd,
      targetNode: "RISK_FACTORS",
    });
  }

  if (oraclePenaltyBps > 0) {
    const impactUsd = Math.round(totalCollateralUsd * (oraclePenaltyBps / BPS));
    causalExplanations.push({
      title: `Pyth Oracle Uncertainty (${maxConfBps} bps)`,
      description: `Confidence spread exceeds 50 bps. Valuation haircut of ${oraclePenaltyBps} bps applied.`,
      impactBps: -oraclePenaltyBps,
      impactUsd: -impactUsd,
      targetNode: "ASSETS",
    });
  }

  const unadjustedCapacity = totalCollateralUsd * (weightedBaseLtvBps / BPS);
  const borrowPowerDiffUsd = maxBorrowCapacityUsd - unadjustedCapacity;

  // Hard Safety Gate checks (oracle stale, invalid, or blown confidence)
  let hardOverride = false;
  let hardOverrideReason: string | undefined = undefined;

  for (const a of assets) {
    if (!a.oracleHealthy) {
      hardOverride = true;
      hardOverrideReason = `${a.symbol} oracle confidence or freshness breached (Stale Oracle)`;
      break;
    }
    if (a.confBps > 300) {
      hardOverride = true;
      hardOverrideReason = `${a.symbol} oracle confidence blown (${a.confBps} bps > 300 bps)`;
      break;
    }
  }

  let riskState: "SAFE" | "RESTRICTED" | "DEFENSIVE" | "EMERGENCY" = "SAFE";
  if (hardOverride) {
    riskState = "EMERGENCY";
  } else if (maxConfBps > 150) {
    riskState = "DEFENSIVE";
  } else if (assets.some((a) => !a.marketOpen)) {
    riskState = "RESTRICTED";
  } else if (maxWeightPct > 40 || maxConfBps > 50) {
    riskState = "RESTRICTED";
  } else {
    riskState = "SAFE";
  }

  return {
    totalCollateralUsd,
    conservativeCollateralUsd,
    totalDebtUsd,
    weightedBaseLtvBps,
    effectiveLtvBps,
    borrowCapacityUsd,
    healthFactorBps,
    maxWeightPct,
    dominantAssetSymbol,
    concentrationPenaltyBps,
    oraclePenaltyBps,
    totalHaircutBps,
    assetDetails,
    hardOverride,
    hardOverrideReason,
    riskState,
    primaryRiskDriver: concentrationPenaltyBps > 0 ? `${dominantAssetSymbol} Concentration` : "Nominal State",
    borrowPowerDiffUsd,
    causalExplanations,
  };
}

/**
 * Deterministic stress scenario calculations (-5%, -10%, -20%)
 */
export function calculateStressScenarios(
  totalCollateralUsd: number,
  totalDebtUsd: number,
  baseLtvBps: number,
  liqThresholdBps: number
) {
  const drops = [-0.05, -0.10, -0.20];
  return drops.map((drop) => {
    const dropPct = Math.round(drop * 100);
    const stressedCollateral = totalCollateralUsd * (1 + drop);
    const stressedCapacity = Math.max(0, stressedCollateral * (baseLtvBps / BPS) - totalDebtUsd);
    const stressedHf = totalDebtUsd > 0
      ? ((stressedCollateral * (liqThresholdBps / BPS)) / totalDebtUsd)
      : null;
    const isLiquidatable = stressedHf !== null && stressedHf < 1.0;

    return {
      dropLabel: `${dropPct}%`,
      dropPct,
      stressedCollateral,
      stressedCapacity,
      stressedHf,
      isLiquidatable,
      projectedState: isLiquidatable ? "EMERGENCY" : drop <= -0.15 ? "DEFENSIVE" : "RESTRICTED",
    };
  });
}

/**
 * Closed Feedback Loop:
 * Recalculates portfolio risk immediately following a confirmed DBC execution.
 *
 * Sequence:
 * 1. Agent or human executes DBC swap / entry / exit
 * 2. Token balances change on-chain
 * 3. applyDbcExecutionToPortfolio recomputes concentration, haircuts, LTV, and risk state
 * 4. Permission engine and agent immediately observe the updated boundary on the next turn.
 */
export function applyDbcExecutionToPortfolio(params: {
  currentAssets: {
    symbol: string;
    name: string;
    collateralUi: number;
    priceUsd: number;
    confidenceUsd: number;
    confBps: number;
    baseLtvBps: number;
    liqThresholdBps: number;
    oracleHealthy: boolean;
    marketOpen: boolean;
  }[];
  totalDebtUsd: number;
  tradedSymbol: string;
  deltaCollateralUi: number; // positive = added collateral/bought asset; negative = sold/withdrawn
}): PortfolioRiskAnalysis {
  const updatedAssets = params.currentAssets.map((a) => {
    if (a.symbol === params.tradedSymbol) {
      return {
        ...a,
        collateralUi: Math.max(0, a.collateralUi + params.deltaCollateralUi),
      };
    }
    return a;
  });

  return analyzePortfolioRisk(updatedAssets, params.totalDebtUsd);
}
