/**
 * Circuit Protocol — Agent Credit Policy & Threshold Governor
 *
 * Configurable metering parameters governing compute resource consumption.
 * Decoupled from hardcoded magic numbers across the application.
 *
 * Cardinal Invariant:
 * Agent Credits govern COMPUTE.
 * Circuit Permissions govern CAPITAL.
 * When Credits = 0, AI stops. Manual Solana protocol operations remain 100% active.
 */

export interface AgentCreditPolicy {
  /** Baseline cost for a Circuit Lite inference */
  liteCost: number;
  /** Baseline cost for a Circuit Pro inference */
  proCost: number;
  /** Surcharge per tool execution block */
  toolCost: number;
  /** Surcharge per multi-step workflow progression */
  workflowStepCost: number;
  /** Background watcher periodic evaluation cost */
  backgroundEvaluationCost: number;
  /** Maximum credits allowed to be reserved per single task */
  maxReserve: number;
  /** Maximum compute spend allowed per single autonomous execution */
  maxRunCost: number;
  /** Maximum credit spend per wallet per 24 hours */
  dailyLimit: number;
  /** Maximum concurrent Pro / workflow executions per wallet */
  concurrencyLimit: number;
}

export const DEFAULT_CREDIT_POLICY: AgentCreditPolicy = {
  liteCost: 1,
  proCost: 4,
  toolCost: 1,
  workflowStepCost: 2,
  backgroundEvaluationCost: 0.5,
  maxReserve: 25,
  maxRunCost: 20,
  dailyLimit: 200,
  concurrencyLimit: 3,
};

export type CreditRegime =
  | "FULL_CAPABILITY" // 100–76 credits
  | "NORMAL_USAGE"    // 75–51 credits
  | "COST_AWARE"     // 50–26 credits
  | "CONSERVATION"   // 25–11 credits
  | "LOW_CREDIT"     // 10–1 credits
  | "BLOCKED";       // 0 credits

export function getCreditRegime(available: number): CreditRegime {
  if (available <= 0) return "BLOCKED";
  if (available <= 10) return "LOW_CREDIT";
  if (available <= 25) return "CONSERVATION";
  if (available <= 50) return "COST_AWARE";
  if (available <= 75) return "NORMAL_USAGE";
  return "FULL_CAPABILITY";
}

/**
 * Returns clean, non-manipulative operational status warnings according to credit threshold.
 */
export function getCreditWarning(available: number): string | null {
  if (available <= 0) {
    return "Agent budget exhausted. Automatic reasoning and background watchers are paused. Manual deposits, borrows, repays, and withdrawals remain fully operational.";
  }
  if (available <= 10) {
    return "Low agent budget. Only essential queries permitted unless cost is explicitly approved.";
  }
  if (available <= 25) {
    return "Pro usage is now restricted by your remaining agent budget. Lightweight queries preferred.";
  }
  if (available <= 50) {
    return "Agent budget is getting lower. Circuit Lite will be preferred for everyday tasks.";
  }
  return null;
}

/**
 * Deterministically estimates maximum credit consumption before execution.
 */
export function estimateOperationCost(
  tier: "LITE" | "PRO",
  toolCount = 0,
  isWorkflow = false,
  policy: AgentCreditPolicy = DEFAULT_CREDIT_POLICY
): number {
  const baseCost = tier === "PRO" ? policy.proCost : policy.liteCost;
  const toolAddon = toolCount * policy.toolCost;
  const workflowAddon = isWorkflow ? policy.workflowStepCost : 0;
  const total = baseCost + toolAddon + workflowAddon;
  return Math.min(total, policy.maxRunCost);
}

/**
 * Checks whether an account has sufficient budget to initiate an operation in a given tier.
 */
export function canAffordTier(
  available: number,
  tier: "LITE" | "PRO",
  toolCount = 0,
  policy: AgentCreditPolicy = DEFAULT_CREDIT_POLICY
): boolean {
  if (available <= 0) return false;
  const estimated = estimateOperationCost(tier, toolCount, false, policy);
  return available >= estimated;
}
