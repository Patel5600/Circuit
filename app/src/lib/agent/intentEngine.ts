/**
 * Circuit Protocol - Conversational Intent Recognition Engine
 *
 * Implements:
 * 1. Text normalization and pattern classification
 * 2. Amount and currency parsing (e.g., "$200", "200 usdc", "0.2k")
 * 3. Conversational reference resolution ("it", "that", "this", "make it 150", "actually make it GOOGL")
 * 4. Multi-intent decomposition
 * 5. Structured action extraction bound to canonical protocol assets
 */

import { DEPLOYED_MARKETS, DeployedMarket } from "../../data/markets-registry";
import { resolveAssetEntity, findMentionedAssets, extractQueriedSymbols } from "./entityResolver";
import {
  StructuredIntent,
  IntentType,
  ConversationalContext,
  EntityConfidence,
} from "./types";
import { ProtocolAction } from "../permission-engine";

/**
 * Determine if a user input represents an explanatory inquiry (how does it work, how do I do X, explain X, lend)
 * rather than an immediate transaction directive.
 */
export function isExplanationQuery(text: string): boolean {
  const t = text.toLowerCase().trim();

  // Price queries are market inquiries, not protocol explanations
  if (/\b(?:price|prices|quote|quotes|how much is|current quote|how much does.*cost)\b/i.test(t)) {
    return false;
  }

  // Capacity queries asking for a specific dollar limit or amount
  if (/\b(?:how\s+much\s+can\s+i\s+borrow|can\s+i\s+borrow\s+\$?[\d.]+)\b/i.test(t)) {
    return false;
  }

  // Lending queries: lending is not implemented in Circuit, so 'lend' or 'how to lend' is always an explanation inquiry
  if (
    t === "lend" ||
    t === "lending" ||
    /\b(?:how\s+to\s+get\s+lend|how\s+to\s+lend|how\s+do\s+i\s+lend|can\s+i\s+lend|supply\s+usdc|earn\s+apy|lending\s+pool)\b/i.test(t)
  ) {
    return true;
  }

  // Explanatory question patterns
  if (
    /\b(?:how\s+(?:does|do|can|to|i|we|would|should)|what\s+(?:is|are|happens|does)|explain|describe|tell\s+me\s+about|walk\s+me\s+through|guide\s+me)\b/i.test(t) ||
    /\b(?:how\s+it\s+works|how\s+circuit\s+works|how\s+cuircuit\s+works|how\s+borrowing\s+works|how\s+deposit\s+works|how\s+to\s+borrow|how\s+to\s+deposit)\b/i.test(t)
  ) {
    return true;
  }

  return false;
}

/**
 * Extract distinct explanation topics from an explanatory inquiry
 */
export function extractExplanationTopics(text: string): string[] {
  const t = text.toLowerCase();
  const topics: string[] = [];

  if (
    t.includes("circuit") ||
    t.includes("cuircuit") ||
    t.includes("overview") ||
    t.includes("how it works") ||
    t.includes("what is circuit") ||
    t.includes("explain circuit")
  ) {
    topics.push("overview");
  }
  if (t.includes("deposit") || t.includes("collateral") || t.includes("aset") || t.includes("asset")) {
    topics.push("deposit");
  }
  if (t.includes("borrow") || t.includes("loan") || t.includes("credit") || t.includes("debt")) {
    topics.push("borrow");
  }
  if (t.includes("repay") || t.includes("pay back")) {
    topics.push("repay");
  }
  if (t.includes("withdraw")) {
    topics.push("withdraw");
  }
  if (t.includes("lend") || t.includes("yield") || t.includes("supply")) {
    topics.push("lending");
  }

  // If general inquiry or no sub-topics matched, return all 6 canonical topics
  if (topics.length === 0 || (topics.length === 1 && topics[0] === "overview")) {
    return ["overview", "deposit", "borrow", "repay", "withdraw", "lending"];
  }

  return Array.from(new Set(topics));
}

/**
 * Parse numeric amounts with currency symbols and shorthand
 */
export function parseAmount(text: string): number | null {
  if (!text) return null;

  // Patterns like $200, 200, 200.50, 200 usdc, 0.2k, 2k
  const clean = text.toLowerCase().replace(/,/g, "");
  if (clean.includes("-") || clean.includes("negative")) return null;

  // Match "$200", "200 usdc", "200 dollars", "200"
  const kMatch = clean.match(/(?:^|\s|\$)([\d.]+)\s*k\b/i);
  if (kMatch) {
    const val = parseFloat(kMatch[1]);
    return isNaN(val) ? null : Math.round(val * 1000);
  }

  const numMatch = clean.match(/(?:\$|\b)([\d]+(?:\.[\d]+)?)(?:\s*(?:usdc|usd|dollars?|tokens?))?\b/i);
  if (numMatch) {
    const val = parseFloat(numMatch[1]);
    return isNaN(val) || val <= 0 ? null : val;
  }

  return null;
}

/**
 * Identify protocol action verb from user text
 */
export function parseActionVerb(text: string): ProtocolAction | null {
  const t = text.toLowerCase();

  // If text is an explanation query, do not parse as an execution action verb
  if (isExplanationQuery(t)) {
    return null;
  }

  if (/\b(?:borrow|take loan|get loan|get credit|lend me|draw debt)\b/.test(t)) {
    return "borrow";
  }
  if (/\b(?:deposit|add collateral|put in|collateralize|supply)\b/.test(t)) {
    return "deposit";
  }
  if (/\b(?:withdraw|remove|take out|pull collateral)\b/.test(t)) {
    return "withdraw";
  }
  if (/\b(?:repay|pay back|reduce debt|clear debt|settle debt)\b/.test(t)) {
    return "repay";
  }
  if (/\b(?:swap|trade|exchange)\b/.test(t)) {
    return "swap";
  }
  if (/\b(?:enter liquidity|add liquidity|provide liquidity|lp|enter dbc|enter pool)\b/.test(t)) {
    return "enter_liquidity";
  }
  if (/\b(?:exit liquidity|remove liquidity|pull liquidity|withdraw lp|exit pool|exit dbc)\b/.test(t)) {
    return "exit_liquidity";
  }
  if (/\b(?:recover liquidity|recover lp|emergency exit|protective exit)\b/.test(t)) {
    return "recover_liquidity";
  }
  if (/\b(?:rebalance liquidity|rebalance lp|rebalance pool)\b/.test(t)) {
    return "rebalance_liquidity";
  }
  if (/\b(?:create dbc position|open position|create position)\b/.test(t)) {
    return "create_dbc_position";
  }
  if (/\b(?:recover|protect position|mitigate risk|de-risk)\b/.test(t)) {
    return "repay";
  }
  return null;
}

export const DEFAULT_CONVERSATIONAL_CONTEXT: ConversationalContext = {
  activeAsset: null,
  pendingIntent: null,
  pendingProposal: null,
  lastAction: null,
  lastAmount: null,
  lastQueryTime: 0,
};

/**
 * Main intent classification function
 */
export function classifyIntent(
  rawInput: string,
  context: ConversationalContext = DEFAULT_CONVERSATIONAL_CONTEXT
): StructuredIntent {
  const trimmed = rawInput.trim();
  const lower = trimmed.toLowerCase();

  // 1. Confirmations ("yes", "do it", "approve", "confirm", "proceed")
  if (/^(?:yes|do it|approve|confirm|proceed|sign|execute|yep|sure|go ahead)$/i.test(lower)) {
    return {
      type: "ACTION_CONFIRM",
      rawText: trimmed,
      confidence: "HIGH",
    };
  }

  // 2. Cancellations ("cancel", "stop", "never mind", "dont do it", "abort")
  if (/^(?:cancel|stop|never mind|nevermind|dont do it|don't do it|abort|discard|reject)$/i.test(lower)) {
    return {
      type: "ACTION_CANCEL",
      rawText: trimmed,
      confidence: "HIGH",
    };
  }

  // 3. Pronoun / Amount updates ("make it 150", "actually 100", "change to 150", "do 150 instead")
  const updateMatch = lower.match(/(?:make it|actually|change to|update to|do|set to|instead)\s*(?:\$)?\s*([\d.]+)(?:\s*k)?\b/i);
  if (updateMatch) {
    const updatedAmt = parseAmount(updateMatch[0]);
    if (updatedAmt !== null) {
      return {
        type: "ACTION_UPDATE",
        rawText: trimmed,
        amount: updatedAmt,
        confidence: "HIGH",
      };
    }
  }

  // 4. Asset switch ("actually make it GOOGL", "switch to AAPL", "change to MSFT")
  const switchMatch = lower.match(/(?:actually make it|switch to|change to|instead use|look at|view)\s+([a-zA-Z]+)\b/i);
  if (switchMatch) {
    const candidate = switchMatch[1];
    const resolved = resolveAssetEntity(candidate);
    if (resolved) {
      return {
        type: "ACTION_SWITCH_ASSET",
        rawText: trimmed,
        asset: resolved.market,
        confidence: resolved.confidence,
      };
    }
  }

  const mentionedAssets = findMentionedAssets(lower);
  const queriedSymbols = extractQueriedSymbols(lower);

  // 5. Price / Market queries ("what is the current price of btc and nvda", "what is nvda price", "price?")
  const isPriceOrQuote = /\b(?:price|prices|quote|quotes|how much is|current quote|oracle|how much does.*cost)\b/i.test(lower);
  if (isPriceOrQuote) {
    if (queriedSymbols.length > 1) {
      return {
        type: "MARKET_QUERY",
        rawText: trimmed,
        asset: mentionedAssets[0]?.market || null,
        requestedSymbols: queriedSymbols,
        confidence: "HIGH",
      };
    } else if (queriedSymbols.length === 1) {
      return {
        type: "PRICE_QUERY",
        rawText: trimmed,
        asset: mentionedAssets[0]?.market || null,
        requestedSymbols: queriedSymbols,
        confidence: "HIGH",
      };
    } else {
      return {
        type: "PRICE_QUERY",
        rawText: trimmed,
        asset: context.activeAsset || DEPLOYED_MARKETS[0],
        confidence: "HIGH",
      };
    }
  }

  // 6. Explanation Mode ("how does Circuit work?", "how do I borrow?", "how does deposit work?", "how to get lend", "lend")
  if (isExplanationQuery(lower)) {
    return {
      type: "EXPLANATION_MODE",
      rawText: trimmed,
      asset: mentionedAssets[0]?.market || null, // NEVER default to context.activeAsset for conceptual inquiries
      explanationTopics: extractExplanationTopics(lower),
      confidence: "HIGH",
    };
  }

  // 7. DBC pool queries ("show pool state for nvda", "nvda dbc pool", "meteora nvda")
  if (
    /\b(?:pool state|dbc pool|pool status|meteora pool|dbc|bonding curve|liquidity pool)\b/.test(lower) &&
    !lower.includes("provide") && !lower.includes("enter") && !lower.includes("exit")
  ) {
    const asset = mentionedAssets[0]?.market || context.activeAsset || DEPLOYED_MARKETS[0];
    return {
      type: "DBC_POOL_QUERY",
      rawText: trimmed,
      asset,
      confidence: "HIGH",
    };
  }

  // 7b. DBC liquidity plans ("provide liquidity to nvda", "enter nvda pool")
  if (/\b(?:provide liquidity|enter pool|enter liquidity|add liquidity|lp into|enter dbc)\b/.test(lower)) {
    const asset = mentionedAssets[0]?.market || context.activeAsset || DEPLOYED_MARKETS[0];
    return {
      type: "DBC_LIQUIDITY_PLAN",
      rawText: trimmed,
      action: "enter_liquidity",
      asset,
      amount: parseAmount(lower) || undefined,
      confidence: "HIGH",
    };
  }

  // 7c. DBC exit plans ("exit nvda liquidity", "recover liquidity", "exit pool")
  if (/\b(?:exit pool|exit liquidity|exit dbc|recover liquidity|pull liquidity|remove liquidity)\b/.test(lower)) {
    const asset = mentionedAssets[0]?.market || context.activeAsset || DEPLOYED_MARKETS[0];
    return {
      type: "DBC_EXIT_PLAN",
      rawText: trimmed,
      action: "exit_liquidity",
      asset,
      confidence: "HIGH",
    };
  }

  // 7d. DBC strategy creation ("keep dbc exposure below 10%", "dbc strategy")
  if (/\b(?:dbc strategy|dbc exposure|automate liquidity|liquidity strategy)\b/.test(lower)) {
    const asset = mentionedAssets[0]?.market || context.activeAsset || DEPLOYED_MARKETS[0];
    return {
      type: "DBC_STRATEGY_CREATE",
      rawText: trimmed,
      asset,
      condition: trimmed,
      confidence: "HIGH",
    };
  }

  // 8. Watch & Strategy requests
  if (/\b(?:watch|monitor|alert|notify)\b/.test(lower)) {
    const asset = mentionedAssets[0]?.market || context.activeAsset || DEPLOYED_MARKETS[0];
    return {
      type: "WATCH_CREATE",
      rawText: trimmed,
      asset,
      condition: trimmed,
      confidence: "HIGH",
    };
  }

  if (/\b(?:manage|auto manage|strategy|automate|keep hf|keep health)\b/.test(lower)) {
    const asset = mentionedAssets[0]?.market || context.activeAsset || DEPLOYED_MARKETS[0];
    return {
      type: "STRATEGY_CREATE",
      rawText: trimmed,
      asset,
      condition: trimmed,
      confidence: "HIGH",
    };
  }

  // 9. Capabilities query ("what can I do here?", "what are my options?", "help")
  if (/\b(?:what can i do|what are my options|available actions|capabilities|what is possible|how do i start|help)\b/.test(lower)) {
    return {
      type: "CAPABILITIES_QUERY",
      rawText: trimmed,
      asset: context.activeAsset || DEPLOYED_MARKETS[0],
      confidence: "HIGH",
    };
  }

  // 10. Check if user typed ONLY a ticker / brand (e.g. "nvda", "NVDA", "Nvidia", "aapl")
  const singleWord = trimmed.replace(/^[^\w]+|[^\w]+$/g, "");
  const directEntity = resolveAssetEntity(singleWord);
  if (directEntity && (lower === directEntity.matchedTerm.toLowerCase() || lower === directEntity.market.tokenSymbol.toLowerCase() || lower === directEntity.market.name.toLowerCase())) {
    return {
      type: "ASSET_LOOKUP",
      rawText: trimmed,
      asset: directEntity.market,
      confidence: directEntity.confidence,
    };
  }

  // 11. Chart requests ("chart", "chart 24h", "chart 7d", "show chart")
  if (/\b(?:chart|graph|candle|price history)\b/.test(lower)) {
    const asset = mentionedAssets[0]?.market || context.activeAsset || DEPLOYED_MARKETS[0];
    const timeframe = lower.includes("7d") ? "7d" : "24h";
    return {
      type: "CHART_REQUEST",
      rawText: trimmed,
      asset,
      timeframe,
      confidence: "HIGH",
    };
  }

  // 12. Risk queries ("risk?", "what is my risk", "is risk safe")
  if (/\b(?:risk|ratchet|marketguard|is it safe|safe or defensive)\b/.test(lower)) {
    const asset = mentionedAssets[0]?.market || context.activeAsset || DEPLOYED_MARKETS[0];
    return {
      type: "RISK_QUERY",
      rawText: trimmed,
      asset,
      confidence: "HIGH",
    };
  }

  // 13. Position queries ("my position", "collateral", "debt", "balance")
  if (/\b(?:position|my balance|my collateral|my debt|health factor)\b/.test(lower) && !lower.includes("borrow") && !lower.includes("deposit")) {
    const asset = mentionedAssets[0]?.market || context.activeAsset || DEPLOYED_MARKETS[0];
    return {
      type: "POSITION_QUERY",
      rawText: trimmed,
      asset,
      confidence: "HIGH",
    };
  }

  // 14. Capacity queries ("can I borrow 300?", "how much can I borrow", "borrow capacity")
  const isQuestion = lower.includes("can i") || lower.includes("could i") || lower.includes("how much can") || lower.endsWith("?");
  const actionVerb = parseActionVerb(lower);
  const parsedAmt = parseAmount(lower);
  const targetAsset = mentionedAssets[0]?.market || context.activeAsset || DEPLOYED_MARKETS[0];

  if (isQuestion && (lower.includes("borrow") || lower.includes("capacity") || lower.includes("limit"))) {
    return {
      type: "CAPACITY_QUERY",
      rawText: trimmed,
      action: "borrow",
      asset: targetAsset,
      amount: parsedAmt || undefined,
      confidence: "HIGH",
    };
  }

  // 15. Direct action requests ("borrow 200", "deposit 50", "repay 100", "withdraw 10", "borrow")
  if (actionVerb) {
    // If user specified an amount or explicitly named an asset, activeAsset may be inferred.
    // But if neither was provided (e.g. bare "borrow"), DO NOT default to AMDx!
    const explicitOrContextAsset = mentionedAssets[0]?.market || (parsedAmt !== null ? context.activeAsset : null);

    return {
      type: "ACTION_PREPARE",
      rawText: trimmed,
      action: actionVerb,
      asset: explicitOrContextAsset,
      amount: parsedAmt || undefined,
      confidence: "HIGH",
    };
  }

  // 16. Multi-asset comparison or lookup ("compare nvda and googl")
  if (mentionedAssets.length >= 2) {
    return {
      type: "MULTI_INTENT",
      rawText: trimmed,
      asset: mentionedAssets[0].market,
      secondaryAsset: mentionedAssets[1].market,
      confidence: "HIGH",
    };
  }

  // 17. Single mentioned asset fallback
  if (mentionedAssets.length === 1 && trimmed.length < 30) {
    return {
      type: "ASSET_LOOKUP",
      rawText: trimmed,
      asset: mentionedAssets[0].market,
      confidence: mentionedAssets[0].confidence,
    };
  }

  // 18. Fallback to general chat / reasoning
  return {
    type: "GENERAL_CHAT",
    rawText: trimmed,
    asset: context.activeAsset || DEPLOYED_MARKETS[0],
    confidence: "MEDIUM",
  };
}
