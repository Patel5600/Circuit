/**
 * Circuit Protocol — Conversational Intent Classifier
 *
 * Classifies user messages into typed, distinct intent classes BEFORE tool execution.
 * Decouples reasoning, conversational explanation, portfolio inspection, and financial execution.
 */

export type IntentClass =
  | "GREETING"
  | "QUESTION"
  | "EXPLANATION"
  | "PORTFOLIO_QUERY"
  | "RISK_QUERY"
  | "CREDIT_QUERY"
  | "TRANSACTION_REQUEST"
  | "STRATEGY_REQUEST"
  | "CONDITIONAL_INTENT"
  | "ADVERSARIAL_ATTEMPT";

export interface ExtractedCondition {
  field: string;
  operator?: string;
  threshold?: number | string | boolean;
  description: string;
}

export interface ClassifiedIntent {
  intent: IntentClass;
  confidence: number;
  extractedAsset?: string;
  extractedAmount?: number;
  extractedAction?: "borrow" | "repay" | "deposit" | "withdraw" | "swap";
  explanationTopic?:
    | "collateral"
    | "risk"
    | "borrow"
    | "deposit"
    | "repay"
    | "withdraw"
    | "ltv"
    | "liquidation"
    | "dutch_auction"
    | "oracle"
    | "meteora_dbc"
    | "circuit"
    | "lending"
    | "general";
  targetCondition?: ExtractedCondition;
  sanitizedQuery: string;
  isGarbledOrVulgar?: boolean;
}

const SUPPORTED_ASSETS = ["NVDA", "AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "META", "NFLX", "COIN", "AMD", "SPY", "BTC", "ETH", "SOL"];

export function extractAsset(text: string): string | undefined {
  const upper = text.toUpperCase();
  for (const asset of SUPPORTED_ASSETS) {
    const re = new RegExp(`\\b${asset}(?:x)?\\b`, "i");
    if (re.test(upper)) {
      return asset;
    }
  }
  return undefined;
}

export function extractAmount(text: string): number | undefined {
  // Matches $1000, 1000 USDC, 500 dollars, borrow 250
  const match = text.match(/(?:\$|£|€)?\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:usdc|usd|dollars)?/i);
  if (match) {
    const raw = match[1].replace(/,/g, "");
    const val = parseFloat(raw);
    if (!isNaN(val) && val > 0) return val;
  }
  return undefined;
}

/**
 * Sanitizes input by stripping profanity/garbled characters for downstream processing
 */
export function sanitizeInputText(raw: string): { clean: string; hadGarble: boolean } {
  const vulgarRegex = /\b(?:fuck|shit|bitch|ass|damn|dick|cock|bastard|cunt|piss|crap|wtf)\b/gi;
  const hadGarble = vulgarRegex.test(raw);
  const clean = raw.replace(vulgarRegex, "").replace(/[^\w\s\$\?\.\,\-\<\>\=\']/g, " ").replace(/\s+/g, " ").trim();
  return { clean, hadGarble };
}

export function classifyIntent(rawText: string, contextAsset = "NVDA"): ClassifiedIntent {
  const original = rawText.trim();
  const { clean: sanitized, hadGarble } = sanitizeInputText(original);
  const lower = sanitized.toLowerCase();
  const rawLower = original.toLowerCase();

  const asset = extractAsset(sanitized) || extractAsset(original);

  // 1. ADVERSARIAL_ATTEMPT — Prompt injection, limit bypass, policy override
  const wantsOverride =
    /\b(?:ignore.*(?:risk|state|limit|rule|instruction|system|prompt|safety)|override|borrow\s+anyway|bypass|skip\s+permission|change\s+(?:my\s+)?limits|jailbreak|system\s+prompt|developer\s+mode|root\s+access|admin\s+mode)\b/i.test(
      rawLower
    );
  if (wantsOverride) {
    return {
      intent: "ADVERSARIAL_ATTEMPT",
      confidence: 0.99,
      extractedAsset: asset || contextAsset,
      sanitizedQuery: sanitized,
    };
  }

  // 2. CONDITIONAL_INTENT — Triggers, auto-borrow, auto-repay, persistent watching
  const isConditional =
    /\b(?:when\s+(?:borrow|risk|price|hf|health)|if\s+(?:nvda|aapl|msft|[a-z0-9]+|price|hf)|automatically\s+(?:grab|borrow|repay|withdraw|deposit)|auto-?(?:borrow|repay|trade|execute|manage)|watch\s+(?:my\s+)?(?:health|hf|risk|collateral|debt|factor)|keep\s+hf\s+above|set\s+(?:up\s+)?(?:a\s+)?(?:trigger|condition|intent|watch))\b/i.test(
      lower
    );
  if (isConditional) {
    let amount: number | undefined;
    const amtMatch = lower.match(/(?:grab|borrow|repay|withdraw|deposit|take)\s+\$?(\d+(?:\.\d+)?)/i) ||
                     lower.match(/\$?(\d+(?:\.\d+)?)\s*(?:automatically|auto)/i) ||
                     lower.match(/(?:below|above|at)\s+\$?(\d+(?:\.\d+)?)[,\s]+(?:grab|borrow|repay|withdraw|deposit)\s+\$?(\d+(?:\.\d+)?)/i);
    if (amtMatch) {
      amount = parseFloat(amtMatch[amtMatch.length - 1]);
    }

    let field = "BORROW_CAPACITY_ABOVE";
    let operator = "gt";
    let threshold: number | string = 0;
    let description = "When condition triggers, execute bounded action";

    if (/when\s+borrow\s+is\s+allowed/i.test(lower)) {
      field = "PERMISSION_EQUALS";
      operator = "eq";
      threshold = "ALLOWED";
      description = "When borrow action permission transitions to ALLOWED";
    } else if (/(?:hf|health\s+factor)\s*<\s*(\d+(?:\.\d+)?)/i.test(lower)) {
      const val = parseFloat(lower.match(/(?:hf|health\s+factor)\s*<\s*(\d+(?:\.\d+)?)/i)![1]);
      field = "HEALTH_BELOW";
      operator = "lt";
      threshold = val;
      description = `When Health Factor drops below ${val}`;
    } else if (/(?:drops|falls)\s+below\s+\$?(\d+(?:\.\d+)?)/i.test(lower)) {
      const val = parseFloat(lower.match(/(?:drops|falls)\s+below\s+\$?(\d+(?:\.\d+)?)/i)![1]);
      field = "PRICE_BELOW";
      operator = "lt";
      threshold = val;
      description = `When ${asset || contextAsset} price falls below $${val}`;
    }

    return {
      intent: "CONDITIONAL_INTENT",
      confidence: 0.95,
      extractedAsset: asset || contextAsset,
      extractedAmount: amount,
      extractedAction: /repay/i.test(lower) ? "repay" : "borrow",
      targetCondition: { field, operator, threshold, description },
      sanitizedQuery: sanitized,
    };
  }

  // 3. EXPLICIT STRATEGY REQUEST (Yield, multi-step optimization)
  const isStrategy =
    /\b(?:strategy|multi-?step|maximize\s+yield|optimize\s+(?:portfolio|debt|collateral)|leverage\s+plan|rebalance\s+plan|how\s+can\s+i\s+(?:maximize|optimize|hedge))\b/i.test(
      lower
    ) && !/\bwhat\s+is\b/i.test(lower);
  if (isStrategy) {
    return {
      intent: "STRATEGY_REQUEST",
      confidence: 0.9,
      extractedAsset: asset || contextAsset,
      sanitizedQuery: sanitized,
    };
  }

  // 4. PORTFOLIO QUERY — User's actual position/collateral/debt/health
  const isPortfolioQuery =
    /\b(?:my\s+collateral|my\s+debt|my\s+positions?|my\s+portfolio|my\s+health\s+factor|my\s+hf|show\s+(?:my\s+)?portfolio|what\s+do\s+i\s+have\s+deposited|check\s+my\s+balance)\b/i.test(
      lower
    );
  if (isPortfolioQuery) {
    return {
      intent: "PORTFOLIO_QUERY",
      confidence: 0.95,
      extractedAsset: asset || contextAsset,
      sanitizedQuery: sanitized,
    };
  }

  // 5. CREDIT QUERY — Available credit, headroom, borrow capacity
  const isCreditQuery =
    /\b(?:how\s+much\s+can\s+i\s+borrow|what\s+is\s+my\s+available\s+credit|borrow\s+headroom|borrow\s+capacity|max\s+borrow|credit\s+limit|how\s+much\s+credit)\b/i.test(
      lower
    ) && !/\bborrow\s+\$?\d+/i.test(lower);
  if (isCreditQuery) {
    return {
      intent: "CREDIT_QUERY",
      confidence: 0.92,
      extractedAsset: asset || contextAsset,
      sanitizedQuery: sanitized,
    };
  }

  // 6. RISK QUERY — Current risk state, oracle status, why blocked
  const isRiskQuery =
    /\b(?:why\s+(?:can['\s]?t|cannot)\s+i\s+borrow|why\s+is\s+borrow\s+(?:blocked|suspended|disabled|unavailable)|why\s+is\s+risk\s+(?:restricted|defensive|emergency)|current\s+risk\s+state|what\s+is\s+the\s+risk\s+state|risk\s+ratchet\s+state|is\s+market\s+open|market\s+status|oracle\s+(?:status|freshness|spread|confidence))\b/i.test(
      lower
    );
  if (isRiskQuery) {
    return {
      intent: "RISK_QUERY",
      confidence: 0.92,
      extractedAsset: asset || contextAsset,
      sanitizedQuery: sanitized,
    };
  }

  // 7. TRANSACTION_REQUEST — Explicit actionable command with amount
  // E.g. "borrow 1000", "borrow $500 USDC", "repay 200", "deposit 10 NVDA", "can I borrow $200"
  const hasTxVerb = /\b(borrow|repay|deposit|withdraw|swap)\b/i.test(lower);
  const isHowTo = /\b(?:how\s+(?:do|to|can|would|should)|explain|what\s+is)\b/i.test(lower);
  const explicitAmount = extractAmount(lower);

  if (hasTxVerb && !isHowTo) {
    let action: "borrow" | "repay" | "deposit" | "withdraw" | "swap" = "borrow";
    if (/\brepay\b/i.test(lower)) action = "repay";
    else if (/\bdeposit\b/i.test(lower)) action = "deposit";
    else if (/\bwithdraw\b/i.test(lower)) action = "withdraw";
    else if (/\bswap\b/i.test(lower)) action = "swap";

    // If explicit amount or user asks "can I borrow $200"
    if (explicitAmount !== undefined) {
      return {
        intent: "TRANSACTION_REQUEST",
        confidence: 0.95,
        extractedAsset: asset || contextAsset,
        extractedAmount: explicitAmount,
        extractedAction: action,
        sanitizedQuery: sanitized,
      };
    }
  }

  // 8. EXPLANATION — Conceptual definitions & "how does it work"
  // Handles questions like "what is collateral", "what is risk", "what is risk ? how get fuck", "how do I borrow"
  const isExplanationQuery =
    /\b(?:what\s+is|what\s+are|how\s+does|how\s+do\s+i|how\s+to|explain|describe|tell\s+me\s+about)\b/i.test(lower) ||
    lower === "lend" ||
    lower === "lending";

  if (isExplanationQuery) {
    let topic: ClassifiedIntent["explanationTopic"] = "general";
    if (/\bcollateral\b/i.test(lower)) topic = "collateral";
    else if (/\brisk\b/i.test(lower)) topic = "risk";
    else if (/\bltv\b|loan\s+to\s+value/i.test(lower)) topic = "ltv";
    else if (/\bliquidation\b/i.test(lower)) topic = "liquidation";
    else if (/\bdutch\s+auction\b/i.test(lower)) topic = "dutch_auction";
    else if (/\boracle\b|pyth|confidence/i.test(lower)) topic = "oracle";
    else if (/\bmeteora|dbc\b/i.test(lower)) topic = "meteora_dbc";
    else if (/\blend|lending\b/i.test(lower)) topic = "lending";
    else if (/\bborrow\b/i.test(lower)) topic = "borrow";
    else if (/\bdeposit\b/i.test(lower)) topic = "deposit";
    else if (/\brepay\b/i.test(lower)) topic = "repay";
    else if (/\bwithdraw\b/i.test(lower)) topic = "withdraw";
    else if (/\bcircuit\b/i.test(lower)) topic = "circuit";

    return {
      intent: "EXPLANATION",
      confidence: 0.93,
      extractedAsset: asset || contextAsset,
      explanationTopic: topic,
      sanitizedQuery: sanitized,
      isGarbledOrVulgar: hadGarble,
    };
  }

  // 9. GREETING — "hello", "hi", "hey", "gm", "good morning", "yo"
  const isGreeting = /^(?:hello|hi|hey|gm|greetings|yo|sup|howdy|good\s+(?:morning|afternoon|evening))\b/i.test(lower);
  if (isGreeting) {
    return {
      intent: "GREETING",
      confidence: 0.98,
      extractedAsset: contextAsset,
      sanitizedQuery: sanitized,
    };
  }

  // 10. QUESTION (General question / Identity / External)
  const isQuestion =
    /\b(?:who\s+(?:are\s+you|made\s+you)|what\s+are\s+you|who\s+is\s+this|what\s+is\s+solana|what\s+is\s+defi)\b/i.test(
      lower
    ) || lower.endsWith("?");
  if (isQuestion) {
    return {
      intent: "QUESTION",
      confidence: 0.85,
      extractedAsset: asset || contextAsset,
      sanitizedQuery: sanitized,
    };
  }

  // Fallback to QUESTION or general prompt
  return {
    intent: "QUESTION",
    confidence: 0.7,
    extractedAsset: asset || contextAsset,
    sanitizedQuery: sanitized,
  };
}
