/**
 * Circuit Protocol — Curated Agent Models
 *
 * Whitelist of verified, high-performance reasoning models for autonomous execution.
 * Raw Google Gemini catalogs containing 50+ experimental/preview/vision/audio/embedding
 * models are strictly filtered out to preserve Circuit's minimal institutional interface.
 */

export interface AgentModelOption {
  id: string;
  name: string;
  badge: string;
  desc: string;
}

export const DEFAULT_MODEL_ID = "gemini-3.8-flash";
export const FALLBACK_MODEL_ID = "gemini-3.6-flash";

export const CURATED_MODELS: AgentModelOption[] = [
  { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", badge: "DEFAULT", desc: "Fast agentic reasoning & live telemetry" },
  { id: "gemini-3.7-flash", name: "Gemini 3.7 Flash", badge: "HYBRID", desc: "High precision agent execution" },
  { id: "gemini-3.6-flash", name: "Gemini 3.6 Flash", badge: "STABLE", desc: "Financial reasoning & risk synthesis" },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", badge: "FAST", desc: "Low latency streaming" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", badge: "PRO", desc: "Complex multi-step portfolio analysis" },
];

/**
 * Filter an upstream Google Gemini model catalog to only the verified curated set.
 * Returns only models that exist in CURATED_MODELS, preserving curated order and display labels.
 */
export function filterCuratedModels(rawCatalog: Array<{ name?: string }>): AgentModelOption[] {
  if (!Array.isArray(rawCatalog) || rawCatalog.length === 0) {
    return [...CURATED_MODELS];
  }

  const liveIds = new Set(
    rawCatalog
      .map(m => (m.name?.replace(/^models\//, "") || "").toLowerCase())
      .filter(Boolean)
  );

  return CURATED_MODELS.map(curated => {
    const isLive = liveIds.has(curated.id.toLowerCase());
    return {
      ...curated,
      badge: isLive ? curated.badge : "READY",
    };
  });
}
