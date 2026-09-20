/**
 * Circuit Protocol — Automatic Model Router
 *
 * Directs user inputs and background agent workflows between:
 *   1. CIRCUIT LITE (Fast everyday interaction, low latency, 1 credit base)
 *   2. CIRCUIT PRO AGENT (Deep strategy planning, multi-step orchestration, 4 credits base)
 *
 * Pipeline:
 *   INPUT → intent classifier → complexity estimator → risk classifier → context size → available credit check → model selection
 *
 * Invariant:
 * Model routing NEVER bypasses Circuit Permission Engine authorization.
 * Approved risk-increasing executions are NEVER silently downgraded.
 */

import { classifyIntent } from "./intentEngine";
import { StructuredIntent } from "./types";
import { DEFAULT_CREDIT_POLICY, estimateOperationCost } from "./credit-policy";

export type AgentTier = "LITE" | "PRO";

export interface RoutingContext {
  availableCredits: number;
  riskRatchetState: string;
  totalDebtUsd: number;
  totalCollateralUsd: number;
  hasActiveAuthority: boolean;
  activeTasksCount: number;
  messageHistoryLength: number;
}

export interface ModelRoutingDecision {
  tier: AgentTier;
  targetModelId: string;
  estimatedCost: number;
  complexityScore: number; // 1 (simplest) to 10 (highest)
  reason: string;
  isDowngraded: boolean;
  downgradeWarning?: string;
  intent: StructuredIntent;
}

// Canonical underlying models for each tier
export const TIER_MODELS = {
  LITE: "gemini-3.8-flash",
  PRO: "gemini-2.5-pro",
};

/**
 * Evaluates semantic complexity of query (1 to 10 scale).
 */
export function estimateComplexity(text: string, intent: StructuredIntent, ctx: RoutingContext): number {
  let score = 1;
  const lower = text.toLowerCase();

  // Multi-step planning, strategy synthesis, or portfolio restructuring
  if (
    lower.includes("strategy") ||
    lower.includes("plan") ||
    lower.includes("rebalance") ||
    lower.includes("optimize") ||
    lower.includes("hedge") ||
    lower.includes("recovering") ||
    lower.includes("recovery") ||
    lower.includes("multi-step") ||
    lower.includes("dbc")
  ) {
    score += 4;
  }

  // Cross-asset or comparative evaluation
  const assetMatches = lower.match(/\b(nvda|aapl|msft|googl|tsla|coin|amzn)\b/gi) || [];
  if (assetMatches.length >= 2) {
    score += 3;
  }

  // Complex conditional triggers or background task creation
  const isTaskCreate =
    intent.type === "WATCH_CREATE" ||
    intent.type === "STRATEGY_CREATE" ||
    intent.type === "DBC_STRATEGY_CREATE";

  if (
    isTaskCreate ||
    lower.includes("if ") ||
    lower.includes("whenever") ||
    lower.includes("keep my") ||
    lower.includes("auto manage")
  ) {
    score += 3;
  }

  // Risk-sensitive regime or high portfolio complexity
  if (ctx.riskRatchetState === "DEFENSIVE" || ctx.riskRatchetState === "EMERGENCY") {
    score += 2;
  }

  // Deep conversational context
  if (ctx.messageHistoryLength > 8) {
    score += 1;
  }

  return Math.min(10, score);
}

/**
 * Routes user input to either Circuit Lite or Circuit Pro Agent.
 */
export function routeAgentRequest(
  inputText: string,
  ctx: RoutingContext,
  policy = DEFAULT_CREDIT_POLICY
): ModelRoutingDecision {
  const intent = classifyIntent(inputText);
  const complexity = estimateComplexity(inputText, intent, ctx);
  const lower = inputText.toLowerCase();

  // Explicit read-only or simple status queries always use LITE
  const isTrivialQuery =
    intent.type === "GENERAL_CHAT" ||
    lower.includes("price") ||
    lower.includes("what is") ||
    lower.includes("status") ||
    lower.includes("chart") ||
    lower.includes("position") ||
    lower.includes("hello") ||
    lower.includes("help") ||
    lower.includes("balance");

  const isTaskCreate =
    intent.type === "WATCH_CREATE" ||
    intent.type === "STRATEGY_CREATE" ||
    intent.type === "DBC_STRATEGY_CREATE";

  // Determine ideal tier based on complexity, intent, and risk
  let idealTier: AgentTier = "LITE";

  if (
    complexity >= 5 ||
    intent.type === "RISK_QUERY" ||
    lower.includes("strategy") ||
    lower.includes("recovery plan") ||
    lower.includes("auto manage") ||
    (isTaskCreate && !isTrivialQuery)
  ) {
    idealTier = "PRO";
  }

  // Credit budget check: Can user afford the ideal tier?
  const proCost = policy.proCost;
  const canAffordPro = ctx.availableCredits >= proCost;

  if (idealTier === "PRO" && !canAffordPro) {
    // Graceful downgrade to LITE for read-only / reduced plan
    const liteCost = policy.liteCost;
    return {
      tier: "LITE",
      targetModelId: TIER_MODELS.LITE,
      estimatedCost: liteCost,
      complexityScore: complexity,
      reason: `Routing downgraded to Circuit Lite: Remaining budget (${ctx.availableCredits} credits) below Pro requirement (${proCost} credits).`,
      isDowngraded: true,
      downgradeWarning: `Pro reasoning requires ~${proCost} credits. Execution downgraded to Circuit Lite for initial observation.`,
      intent,
    };
  }

  const selectedTier = idealTier;
  const estimatedCost = estimateOperationCost(
    selectedTier,
    isTrivialQuery ? 0 : (isTaskCreate ? 1 : 0),
    isTaskCreate,
    policy
  );

  return {
    tier: selectedTier,
    targetModelId: TIER_MODELS[selectedTier],
    estimatedCost,
    complexityScore: complexity,
    reason: selectedTier === "PRO"
      ? `Routed to Circuit Pro: Complexity score ${complexity}/10 warrants deep multi-step risk synthesis.`
      : `Routed to Circuit Lite: Fast everyday interaction (Complexity ${complexity}/10).`,
    isDowngraded: false,
    intent,
  };
}
