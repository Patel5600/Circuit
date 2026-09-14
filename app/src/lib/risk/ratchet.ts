export type RiskRatchetState = "SAFE" | "RESTRICTED" | "DEFENSIVE" | "EMERGENCY";

export interface RatchetThresholds {
  enterRestrictedConfBps: number; // e.g. 50 bps
  recoverSafeConfBps: number;      // e.g. 30 bps (hysteresis buffer)
  enterDefensiveConfBps: number;  // e.g. 150 bps
  recoverRestrictedConfBps: number; // e.g. 110 bps
  enterEmergencyConfBps: number;  // e.g. 400 bps
  recoverDefensiveConfBps: number; // e.g. 320 bps
  requiredHealthyCranks: number;  // e.g. 5 consecutive observations
}

export const DEFAULT_RATCHET_THRESHOLDS: RatchetThresholds = {
  enterRestrictedConfBps: 50,
  recoverSafeConfBps: 30,
  enterDefensiveConfBps: 150,
  recoverRestrictedConfBps: 110,
  enterEmergencyConfBps: 400,
  recoverDefensiveConfBps: 320,
  requiredHealthyCranks: 5,
};

export interface RiskTransitionEvent {
  timestamp: number;
  fromState: RiskRatchetState;
  toState: RiskRatchetState;
  triggerCondition: string;
  affectedPermission: string;
  epoch: number;
  isSimulated?: boolean;
}

/**
 * Validates whether a requested state transition is legally permissible under
 * Circuit's on-chain monotonic ratchet rules.
 * Direct jumps from EMERGENCY -> SAFE or EMERGENCY -> RESTRICTED are illegal.
 */
export function isValidRatchetTransition(
  from: RiskRatchetState,
  to: RiskRatchetState
): boolean {
  if (from === to) return true;

  // Deterioration can jump immediately to any worse state
  const severityRank: Record<RiskRatchetState, number> = {
    SAFE: 0,
    RESTRICTED: 1,
    DEFENSIVE: 2,
    EMERGENCY: 3,
  };

  if (severityRank[to] > severityRank[from]) {
    return true; // Fast tightening is always permitted
  }

  // Recovery must be strictly monotonic (step-by-step)
  if (from === "EMERGENCY" && to !== "DEFENSIVE") return false;
  if (from === "DEFENSIVE" && to !== "RESTRICTED") return false;
  if (from === "RESTRICTED" && to !== "SAFE") return false;

  return true;
}

/**
 * Asserts that a ratchet state transition is valid under monotonic recovery rules.
 * Throws an Error if an illegal jump (e.g. EMERGENCY -> SAFE directly) is attempted.
 */
export function assertValidRatchetTransition(
  from: RiskRatchetState,
  to: RiskRatchetState
): void {
  if (!isValidRatchetTransition(from, to)) {
    throw new Error(
      `Illegal Risk Ratchet transition from ${from} directly to ${to}. Monotonic staged recovery is strictly enforced.`
    );
  }
}

/**
 * Computes the next risk state given current conditions, respecting hysteresis.
 */
export function evaluateRatchetState(
  currentState: RiskRatchetState,
  confBps: number,
  isMarketOpen: boolean,
  isCustodyHalted: boolean,
  maxWeightPct: number,
  consecutiveHealthyCranks: number,
  thresholds: RatchetThresholds = DEFAULT_RATCHET_THRESHOLDS
): {
  nextState: RiskRatchetState;
  transitionReason?: string;
  recoveryBufferActive: boolean;
} {
  // 1. Hard Overrides (Instant Emergency)
  if (isCustodyHalted) {
    return {
      nextState: "EMERGENCY",
      transitionReason: "Upstream custody settlement link impaired (Hard Override)",
      recoveryBufferActive: false,
    };
  }

  if (confBps >= thresholds.enterEmergencyConfBps) {
    return {
      nextState: "EMERGENCY",
      transitionReason: `Pyth oracle confidence blown (${confBps} bps >= ${thresholds.enterEmergencyConfBps} bps limit)`,
      recoveryBufferActive: false,
    };
  }

  // 2. Fast Deterioration Checks
  if (confBps >= thresholds.enterDefensiveConfBps) {
    return {
      nextState: "DEFENSIVE",
      transitionReason: `Pyth oracle spread elevated (${confBps} bps >= ${thresholds.enterDefensiveConfBps} bps)`,
      recoveryBufferActive: false,
    };
  }

  if (!isMarketOpen) {
    return {
      nextState: "RESTRICTED",
      transitionReason: "NYSE reference market session closed (MarketGuard active)",
      recoveryBufferActive: false,
    };
  }

  if (confBps >= thresholds.enterRestrictedConfBps || maxWeightPct > 60) {
    return {
      nextState: "RESTRICTED",
      transitionReason: maxWeightPct > 60
        ? `Single-asset concentration (${Math.round(maxWeightPct)}%) exceeds 60% stress limit`
        : `Pyth confidence spread widened (${confBps} bps >= ${thresholds.enterRestrictedConfBps} bps)`,
      recoveryBufferActive: false,
    };
  }

  // 3. Monotonic Staged Recovery with Hysteresis
  if (currentState === "EMERGENCY") {
    // Requires conf < recoverDefensiveConfBps to step down to DEFENSIVE
    if (confBps < thresholds.recoverDefensiveConfBps && consecutiveHealthyCranks >= thresholds.requiredHealthyCranks) {
      return {
        nextState: "DEFENSIVE",
        transitionReason: `Oracle recovered below ${thresholds.recoverDefensiveConfBps} bps with ${consecutiveHealthyCranks} clean observations`,
        recoveryBufferActive: true,
      };
    }
    return { nextState: "EMERGENCY", recoveryBufferActive: true };
  }

  if (currentState === "DEFENSIVE") {
    if (confBps < thresholds.recoverRestrictedConfBps && consecutiveHealthyCranks >= thresholds.requiredHealthyCranks) {
      return {
        nextState: "RESTRICTED",
        transitionReason: `Spread stabilized below ${thresholds.recoverRestrictedConfBps} bps with ${consecutiveHealthyCranks} clean observations`,
        recoveryBufferActive: true,
      };
    }
    return { nextState: "DEFENSIVE", recoveryBufferActive: true };
  }

  if (currentState === "RESTRICTED") {
    // Requires conf < recoverSafeConfBps (30 bps < 50 bps hysteresis) AND concentration <= 40%
    if (
      confBps < thresholds.recoverSafeConfBps &&
      maxWeightPct <= 40 &&
      isMarketOpen &&
      consecutiveHealthyCranks >= thresholds.requiredHealthyCranks
    ) {
      return {
        nextState: "SAFE",
        transitionReason: `Fully cleared hysteresis buffer (< ${thresholds.recoverSafeConfBps} bps) across ${consecutiveHealthyCranks} healthy observations`,
        recoveryBufferActive: false,
      };
    }
    return {
      nextState: "RESTRICTED",
      recoveryBufferActive: confBps < thresholds.enterRestrictedConfBps,
    };
  }

  return { nextState: "SAFE", recoveryBufferActive: false };
}
