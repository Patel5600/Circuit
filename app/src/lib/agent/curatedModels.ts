/**
 * Circuit Protocol — Curated Agent Tiers & Models
 *
 * Exposes exactly two institutional user-facing agent tiers:
 *   1. CIRCUIT LITE (Fast everyday interaction, low latency, 1 credit base)
 *   2. CIRCUIT PRO AGENT (Deep strategy planning, multi-step orchestration, 4 credits base)
 *
 * Provider/model details remain internal implementation details.
 */

export interface AgentModelOption {
  id: string;
  name: string;
  badge: string;
  desc: string;
  tier?: "LITE" | "PRO";
  creditCost?: number;
}

export const CIRCUIT_LITE_ID = "circuit-lite";
export const CIRCUIT_PRO_ID = "circuit-pro";

export const CANONICAL_AGENT_TIERS: AgentModelOption[] = [
  {
    id: CIRCUIT_LITE_ID,
    name: "Circuit Lite",
    badge: "1 CREDIT",
    desc: "Fast everyday interaction: telemetry, market checks, simple planning & navigation",
    tier: "LITE",
    creditCost: 1,
  },
  {
    id: CIRCUIT_PRO_ID,
    name: "Circuit Pro Agent",
    badge: "4 CREDITS",
    desc: "Deep multi-step reasoning: portfolio strategy, risk recovery, DBC liquidity planning",
    tier: "PRO",
    creditCost: 4,
  },
];

export const DEFAULT_MODEL_ID = CIRCUIT_LITE_ID;
export const FALLBACK_MODEL_ID = "circuit-lite";

export const CURATED_MODELS: AgentModelOption[] = [
  ...CANONICAL_AGENT_TIERS,
];

export function filterCuratedModels(rawCatalog: Array<{ name?: string }>): AgentModelOption[] {
  return [...CANONICAL_AGENT_TIERS];
}
