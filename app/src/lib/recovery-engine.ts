/**
 * Circuit Protocol — Canonical Recovery Engine
 *
 * Client-side implementation of the on-chain recovery and minimum restoration math
 * from `programs/circuit/src/math/fixed_point.rs`.
 *
 * Purpose:
 * When position health deteriorates towards liquidation (HF < 1.05),
 * calculate the EXACT minimum debt repayment required to restore health to target (1.05),
 * preventing unnecessary or punitive over-liquidation.
 */

export const BPS = 10_000;
export const DEFAULT_TARGET_HEALTH_FACTOR_BPS = 10_500; // 1.05 target HF
export const DEFAULT_LIQUIDATION_THRESHOLD_BPS = 8_000; // 80% threshold
export const DEFAULT_LIQUIDATION_BONUS_BPS = 500; // 5% bonus

export interface PositionHealthMetrics {
  collateralUsd: number;
  debtUsd: number;
  liqThresholdBps: number;
  healthFactor: number | null;
  healthFactorBps: number | null;
  isHealthy: boolean;
  isLiquidationTarget: boolean;
  maxBorrowUsd: number;
  availableBorrowUsd: number;
}

export interface MinimumRecoveryResult {
  currentDebtUsd: number;
  collateralUsd: number;
  currentHealthFactor: number | null;
  targetHealthFactor: number;
  requiredRepayUsd: number;
  projectedDebtUsd: number;
  projectedHealthFactor: number;
  isRecoveryNeeded: boolean;
  explanation: string;
}

/**
 * Calculates position health factor.
 * HF = (Collateral * LiqThreshold) / Debt
 * Returns null if debt is zero (infinite health).
 */
export function calculateHealthFactor(
  collateralUsd: number,
  debtUsd: number,
  liqThresholdBps: number = DEFAULT_LIQUIDATION_THRESHOLD_BPS
): number | null {
  if (debtUsd <= 0) return null;
  if (collateralUsd <= 0) return 0;
  return (collateralUsd * (liqThresholdBps / BPS)) / debtUsd;
}

/**
 * Calculates exact minimum debt repayment required to restore health factor to target.
 *
 * Direct port of onchain Anchor formula:
 * d* = ceil( (D * 10000 * h_target - V * 10000 * tau) / (10000 * h_target - beta * tau) )
 */
export function calculateMinimumRestorationDebt(
  collateralUsd: number,
  debtUsd: number,
  liqThresholdBps: number = DEFAULT_LIQUIDATION_THRESHOLD_BPS,
  targetHfBps: number = DEFAULT_TARGET_HEALTH_FACTOR_BPS,
  bonusBps: number = DEFAULT_LIQUIDATION_BONUS_BPS
): MinimumRecoveryResult {
  const currentHf = calculateHealthFactor(collateralUsd, debtUsd, liqThresholdBps);
  const targetHf = targetHfBps / BPS;

  // If already at or above target, no recovery needed
  if (currentHf === null || currentHf >= targetHf) {
    return {
      currentDebtUsd: debtUsd,
      collateralUsd,
      currentHealthFactor: currentHf,
      targetHealthFactor: targetHf,
      requiredRepayUsd: 0,
      projectedDebtUsd: debtUsd,
      projectedHealthFactor: currentHf ?? 999,
      isRecoveryNeeded: false,
      explanation: "Position health is nominal. No capital recovery required.",
    };
  }

  // Position is underwater or below target
  const D = debtUsd;
  const V = collateralUsd;
  const tau = liqThresholdBps / BPS;
  const hTarget = targetHfBps / BPS;

  let requiredRepay = 0;

  if (V <= 0) {
    // Zero collateral: must repay all debt
    requiredRepay = D;
  } else {
    // Voluntary capital recovery: user repays debt directly, retaining 100% of collateral (no seizure)
    // Target: (V * tau) / (D - d*) >= hTarget  =>  D - d* <= (V * tau) / hTarget
    // d* = D - (V * tau) / hTarget
    const maxPermittedDebt = (V * tau) / hTarget;
    requiredRepay = Math.max(0, Math.ceil(D - maxPermittedDebt));
  }

  // Clamp between 0 and total debt
  requiredRepay = Math.max(0, Math.min(D, requiredRepay));

  const projectedDebt = Math.max(0, D - requiredRepay);
  const projectedHf = calculateHealthFactor(collateralUsd, projectedDebt, liqThresholdBps) ?? targetHf;

  return {
    currentDebtUsd: D,
    collateralUsd: V,
    currentHealthFactor: currentHf,
    targetHealthFactor: targetHf,
    requiredRepayUsd: requiredRepay,
    projectedDebtUsd: projectedDebt,
    projectedHealthFactor: projectedHf,
    isRecoveryNeeded: true,
    explanation: `Position HF (${currentHf.toFixed(2)}) is below safe target (${targetHf.toFixed(2)}). Minimum repayment of $${requiredRepay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} restores position to healthy state without excess liquidation.`,
  };
}
