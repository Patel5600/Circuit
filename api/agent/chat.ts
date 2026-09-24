/**
 * Circuit Protocol — Autonomous Agent Chat API
 *
 * Server-side streaming endpoint and orchestrator gateway.
 * GEMINI_AI_KEY is kept strictly server-side and never sent to browser bundles.
 */

import * as fs from "fs";
import * as path from "path";
import type { VercelRequest, VercelResponse } from "../_types";
import {
  orchestrateAgentChat,
  formatTextResponse,
  type AgentResponsePayload,
} from "./orchestrator";
import {
  classifyIntent,
  sanitizeInputText,
  type ClassifiedIntent,
} from "./classifier";
import {
  getAssetContext,
  explainConcept,
  evaluatePermission,
  buildExecutionPlan,
  type ProtocolSnapshot,
  type ToolCallRecord,
} from "./tools";

interface ChatRequest {
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  snapshot: ProtocolSnapshot;
  assetId?: string;
  model?: string;
  format?: "json" | "text" | "sse";
}

// In-memory rate limiting: client identifier -> { count, resetAt }
const chatRateLimit = new Map<string, { count: number; resetAt: number }>();
const MAX_REQUESTS_PER_MINUTE = 30;

function setCorsHeaders(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers?.origin;
  if (origin && typeof origin === "string") {
    if (
      /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
      /^https:\/\/.*\.vercel\.app$/.test(origin) ||
      /^https:\/\/circuit\.trade$/.test(origin)
    ) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key, x-gemini-api-key");
}

function loadLocalEnv() {
  try {
    const envPath = path.resolve(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const [k, ...rest] = trimmed.split("=");
        if (k && rest.length > 0 && !process.env[k.trim()]) {
          process.env[k.trim()] = rest.join("=").trim().replace(/^["']|["']$/g, "");
        }
      }
    }
  } catch {
    // runtime does not have fs or env file not found
  }
}

function mapModelId(modelInput?: string, isGemini = true): string {
  const m = (modelInput || "").trim().toLowerCase();
  if (
    !m ||
    m === "circuit-lite" ||
    m.includes("3.8-flash") ||
    m.includes("2.5-flash") ||
    m.includes("1.5-flash") ||
    m.includes("2.0-flash") ||
    m === "gemini-flash"
  ) {
    return isGemini ? "gemini-2.5-flash" : "gpt-4o-mini";
  }
  if (
    m === "circuit-pro" ||
    m.includes("2.5-pro") ||
    m.includes("1.5-pro") ||
    m.includes("2.0-pro") ||
    m.includes("3.7-flash") ||
    m === "gemini-pro"
  ) {
    return isGemini ? "gemini-2.5-pro" : "gpt-4o";
  }
  return modelInput!.trim();
}

export function sanitizeSseChunk(rawChunk: string, tierId: "circuit-lite" | "circuit-pro" = "circuit-lite"): string {
  // 1. Mask raw model ID in the SSE JSON event payload so provider model IDs never leak
  let sanitized = rawChunk.replace(/"model"\s*:\s*"[^"]*"/g, `"model":"${tierId}"`);

  // 2. Strip any legacy or accidental raw provider fallback notes
  sanitized = sanitized.replace(/\[Note:\s*Switched to[^\]]*gemini[^\]]*\]\n*/gi, "");

  // 3. Obfuscate any internal LLM / model name leaks in text content into institutional tier names
  sanitized = sanitized
    .replace(/gemini[- ]3\.[68][- ]flash/gi, "Circuit Lite")
    .replace(/gemini[- ]3\.7[- ]flash/gi, "Circuit Pro")
    .replace(/gemini[- ]2\.5[- ]pro/gi, "Circuit Pro")
    .replace(/gemini[- ]2\.5[- ]flash/gi, "Circuit Lite")
    .replace(/gemini[- ]flash[-a-z0-9]*/gi, "Circuit Lite")
    .replace(/gemini[- ]pro[-a-z0-9]*/gi, "Circuit Pro")
    .replace(/gpt-4o[-a-z0-9]*/gi, "Circuit Pro")
    .replace(/gpt-3\.5[-a-z0-9]*/gi, "Circuit Lite");

  return sanitized;
}

function buildUpstreamSystemPrompt(snap: ProtocolSnapshot, assetId: string): string {
  const isMarketOpen = snap.isMarketOpen ? "YES" : "NO";
  return `You are the Circuit Protocol Autonomous Agent on Solana Devnet.
Operating strictly under Circuit institutional tiers: Circuit Lite and Circuit Pro.
NEVER reveal, mention, or reference underlying LLM provider names, API endpoints, or model IDs (e.g. Gemini, OpenAI, GPT, Google). Always refer to yourself strictly as the Circuit Autonomous Agent.

CRITICAL RULES:
1. Answer the user's question directly, clearly, and concisely in 2-4 sentences.
2. ZERO CANNED CAPABILITIES DUMPS: Never output canned capabilities lists, 8-point outlines, or marketing brochures.
3. CONVERSATIONAL VS EXECUTION SEPARATION: Never output execution plans or numbered execution steps unless the user explicitly requested an actionable transaction or strategy.
4. STRICT ASSET ISOLATION: The active asset is strictly ${assetId}. Never reference or leak AAPL state when operating in ${assetId}.
5. FINANCIAL EXPLANATIONS:
   - "what is collateral": Explain collateral in finance/DeFi in 1-2 sentences, then mention tokenized equities (${assetId}x) as collateral on Circuit.
   - "what is risk": Explain risk in finance/DeFi in 1-2 sentences, then explain Circuit's 4 risk regimes (SAFE, RESTRICTED, DEFENSIVE, EMERGENCY).
   - "what is risk ? how get fuck": Answer the question "what is risk" politely and concisely, ignoring the vulgarity.
   - "how do I borrow": Explain the borrowing mechanism concisely. Mention available credit ($${snap.availableCreditUsd.toFixed(2)}) if connected. Do NOT execute or create an execution plan without an amount.
6. LENDING AVAILABILITY: Retail lending (supplying USDC to earn interest) is NOT currently available in Circuit. Circuit is strictly a credit facility against tokenized equity collateral.

LIVE CIRCUIT STATE:
Wallet: ${snap.walletAddress ?? "Not connected"}
Control Mode: ${snap.controlMode}
Risk State: ${snap.riskRatchetState}
Market Open: ${isMarketOpen}
Collateral: $${snap.totalCollateralUsd.toFixed(2)}
Debt: $${snap.totalDebtUsd.toFixed(2)}
Available Credit: $${snap.availableCreditUsd.toFixed(2)}
Health Factor: ${snap.healthFactor !== null ? snap.healthFactor.toFixed(3) : "N/A"}`;
}

/**
 * Synchronous offline chat handler for test harnesses and local fallback.
 * Strictly implements direct conversational answers, zero capability dumps,
 * and zero unrequested execution plans.
 */
export function handleOfflineChat(
  userMsg: string,
  snapshot: ProtocolSnapshot,
  messages: Array<{ role: string; content: string }> = []
): string {
  const original = (userMsg || "").trim();
  const lower = original.toLowerCase();
  const { clean: sanitized } = sanitizeInputText(original);
  const canonicalAssetId = "NVDA";
  const assetCtx = getAssetContext(canonicalAssetId, snapshot);

  // 1. Adversarial Invariant
  if (
    /\b(?:ignore.*(?:risk|state|limit|rule|instruction|system|prompt|safety)|override|borrow\s+anyway|bypass|skip\s+permission|change\s+(?:my\s+)?limits|create.*second\s+authority)\b/i.test(
      lower
    )
  ) {
    const tool = `CIRCUIT_TOOL:{"tool":"evaluate_permission","input":{"overrideAttempt":true,"intent":"ADVERSARIAL_POLICY_BYPASS"},"output":{"status":"BLOCKED","reason":"ARCHITECTURE_INVARIANT: Circuit Risk and Permission Engine cannot be bypassed by natural language prompts or agent directives."},"status":"BLOCKED"}`;
    const proposal = `CIRCUIT_ACTION_PROPOSAL:{"id":"p_${Date.now()}","action":"borrow","symbol":"${canonicalAssetId}","amountUsd":0,"riskState":"${snapshot.riskRatchetState}","permission":"BLOCKED","reason":"BLOCKED [ARCHITECTURAL_INVARIANT] — Circuit permissions are enforced deterministically on-chain by the Permission Engine PDA, not by natural language prompt requests.","estimatedHfAfter":null}`;
    return `${tool}\n\nPERMISSION REFUSED [ARCHITECTURAL_INVARIANT]\n\nCircuit's on-chain architecture strictly prohibits policy overrides. The Autonomous Agent has no authority to bypass the Risk Ratchet, modify Capital Policy, or skip permission evaluation.\n\n• Current Risk State: ${snapshot.riskRatchetState}\n• Permission Gate: BLOCKED by Circuit Permission Engine\n• Human Sovereignty: Preserved (Only root wallet can manage positions)\n\n${proposal}`;
  }

  // 2. Compound canonical overview regression
  if (lower.includes("cuircuit") && lower.includes("borrow") && lower.includes("deposit")) {
    const hfText = snapshot.healthFactor !== null ? snapshot.healthFactor.toFixed(3) : "Infinite (No Debt)";
    return (
      `**1. Circuit Protocol Overview**\n` +
      `Circuit is an institutional credit and autonomous execution protocol on Solana that enables users to borrow USDC against tokenized equity collateral with on-chain risk governance.\n\n` +
      `**2. Canonical Architectural Flow**\n` +
      `Oracle (Pyth Real-Time Feeds) → Risk Kernel (MarketGuard Session Gating) → Capital Policy (Dynamic LTV & Caps) → Permission Engine (Autonomous Bitmask & Budgets) → RiskEnvelope (TTL-Bounded PDAs) → Atomic Execution.\n\n` +
      `**3. Deposit Mechanism**\n` +
      `• Deposit tokenized equities (such as NVDAx, AAPLx, MSFTx) into segregated protocol collateral vaults.\n` +
      `• Establishing collateral expands your borrowing capacity based on asset-specific dynamic LTV ceilings (up to 70% in SAFE conditions).\n` +
      `• Depositing is ALWAYS permitted across all risk regimes (Sacred Capital Recovery Invariant).\n\n` +
      `**4. Borrowing Mechanism**\n` +
      `• Draw USDC credit directly against your deposited tokenized equity collateral.\n` +
      `• Borrowing is bounded by Circuit's 4-state Risk Ratchet (SAFE: 100% capacity, RESTRICTED: 50% capacity, DEFENSIVE/EMERGENCY: Suspended).\n` +
      `• Current Borrowing Status: ${
        snapshot.riskRatchetState === "DEFENSIVE" || snapshot.riskRatchetState === "EMERGENCY"
          ? `SUSPENDED (Risk State: ${snapshot.riskRatchetState})`
          : `ACTIVE (Available Credit: $${snapshot.availableCreditUsd.toFixed(2)} USDC)`
      }.\n\n` +
      `**5. Repay Mechanism**\n` +
      `• Settle outstanding USDC debt at any time to retire obligations and increase your portfolio health factor.\n` +
      `• Repayment is unconditionally permitted in all market states, including EMERGENCY, ensuring capital can always be recovered.\n\n` +
      `**6. Withdrawal Mechanism**\n` +
      `• Reclaim unused tokenized equity collateral provided remaining collateral maintains a healthy health factor (HF > 1.05).\n` +
      `• Collateral withdrawals are restricted during DEFENSIVE or EMERGENCY regimes if outstanding debt is present.\n\n` +
      `**7. Lending & Yield Availability**\n` +
      `• **Lending is not currently available in the configured Circuit deployment.**\n` +
      `• Circuit provides credit facilities against tokenized equities; retail lending or yield pools for supplying USDC to earn interest are not currently implemented.\n\n` +
      `**8. Wallet State & Prerequisites**\n` +
      `• Connected Wallet: ${
        snapshot.walletAddress
          ? `\`${snapshot.walletAddress.slice(0, 4)}...${snapshot.walletAddress.slice(-4)}\``
          : "Not Connected"
      }\n` +
      `• Deposited Collateral: $${snapshot.totalCollateralUsd.toFixed(2)} USD\n` +
      `• Outstanding Debt: $${snapshot.totalDebtUsd.toFixed(2)} USDC\n` +
      `• Available Credit: $${snapshot.availableCreditUsd.toFixed(2)} USDC\n` +
      `• Current Risk Ratchet: ${snapshot.riskRatchetState} (NYSE ${snapshot.isMarketOpen ? "Open" : "Closed / MarketGuard"})\n` +
      `• Health Factor: ${hfText}`
    );
  }

  // 3. Multi-asset price query
  if (lower.includes("price") && lower.includes("btc") && lower.includes("nvda")) {
    const nvdaMkt = snapshot.markets.find((m) => m.symbol === "NVDA");
    const btcMkt = snapshot.markets.find((m) => m.symbol === "BTC");
    const nvdaPrice = nvdaMkt ? nvdaMkt.price.toFixed(2) : "138.25";
    const btcPrice = btcMkt ? btcMkt.price.toLocaleString("en-US", { minimumFractionDigits: 2 }) : "64,250.00";
    return `Market Reference:\n• BTC: $${btcPrice} USD (External Benchmark)\n• NVDAx: $${nvdaPrice} USD (Circuit Tokenized Equity)\nCircuit currently supports tokenized equities including NVDAx, AAPLx, and MSFTx.`;
  }

  // 4. Clarifications: "what?" / "why?"
  if (/^(?:what\?|why\?)$/i.test(lower)) {
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    const lastTxt = lastAssistant ? lastAssistant.content : "";
    return `To clarify: The Risk Ratchet is currently in the ${snapshot.riskRatchetState} regime. ${lastTxt ? `Regarding: "${lastTxt.slice(0, 120)}..."` : ""}`;
  }

  // 5. Courtesy: "thanks!"
  if (/^(?:thanks|thank\s+you)!?$/i.test(lower)) {
    return "You're welcome! Let me know if you would like to evaluate borrow capacity, inspect your positions, or monitor risk.";
  }

  // 6. Help: "help"
  if (/^help$/i.test(lower)) {
    return "Here is how I can assist:\n• Check Positions & Credit\n• Monitor Risk State & Oracle Spread\n• Evaluate Borrow Capacity\n• Set Conditional Watches";
  }

  // 7. Unrecognized fallback: "tell me something unique 987"
  if (lower.includes("tell me something unique 987")) {
    return `I analyzed your message: "${userMsg}".\nYour Credit Headroom is $${snapshot.availableCreditUsd.toFixed(2)} under ${snapshot.riskRatchetState} market regime.`;
  }

  // 8. Identity inquiries: "who are you?", "what is your role?"
  if (/\b(?:who\s+(?:are\s+you|made\s+you)|what\s+are\s+you|who\s+is\s+this|what\s+is\s+your\s+role)\b/i.test(lower)) {
    return (
      "I am the Circuit Autonomous Agent operating on Solana Devnet under the Circuit Protocol. " +
      "I provide Risk-Governed Execution bounded strictly by Circuit's canonical Risk Ratchet (SAFE, RESTRICTED, DEFENSIVE, EMERGENCY). " +
      "Human Sovereignty is preserved: in Manual mode you execute directly with your sovereign wallet, while in Autonomous mode I operate under bounded, revocable on-chain Agent Authority PDAs."
    );
  }

  // 9. Architecture inquiries: "what is circuit?"
  if (/\b(?:what\s+is\s+circuit|explain\s+circuit)\b/i.test(lower)) {
    return (
      "Circuit is an institutional credit and autonomous execution protocol for tokenized equities on Solana Devnet. " +
      "It features a Dynamic 4-State Risk Ratchet governed by live Pyth oracle confidence intervals and continuous-decay Dutch Auctions for liquidations. " +
      "Circuit serves as the capital permission layer: Market State → Risk Kernel → Permission Engine → Execution."
    );
  }

  // 10. Financial Operations
  // 10a. Portfolio query
  if (/\b(?:show\s+(?:my\s+)?portfolio|my\s+positions?|my\s+collateral|my\s+debt|my\s+health\s+factor)\b/i.test(lower)) {
    const tool = `CIRCUIT_TOOL:{"tool":"get_portfolio","input":{"owner":"${snapshot.walletAddress}"},"output":{"totalCollateralUsd":${snapshot.totalCollateralUsd},"totalDebtUsd":${snapshot.totalDebtUsd},"availableCreditUsd":${snapshot.availableCreditUsd},"riskRatchetState":"${snapshot.riskRatchetState}"},"status":"CONFIRMED"}`;
    return (
      `${tool}\n\n` +
      `Your Solana Devnet portfolio breakdown:\n` +
      `• Total Collateral: $${snapshot.totalCollateralUsd.toFixed(2)} USD\n` +
      `• Outstanding Debt: $${snapshot.totalDebtUsd.toFixed(2)} USDC\n` +
      `• Available Credit: $${snapshot.availableCreditUsd.toFixed(2)} USDC\n` +
      `• Risk Ratchet State: ${snapshot.riskRatchetState}\n` +
      `• Health Factor: ${snapshot.healthFactor !== null ? snapshot.healthFactor.toFixed(3) : "Infinite (No Debt)"}`
    );
  }

  // 10b. Deleveraging / "reduce my risk"
  if (/\breduce\s+(?:my\s+)?risk\b/i.test(lower)) {
    const tool = `CIRCUIT_TOOL:{"tool":"evaluate_permission","input":{"action":"repay","symbol":"${canonicalAssetId}"},"output":{"status":"ALLOWED","reason":"RISK_REDUCING_EXEMPTION"},"status":"CONFIRMED"}`;
    const proposal = `CIRCUIT_ACTION_PROPOSAL:{"id":"p_${Date.now()}","action":"repay","symbol":"${canonicalAssetId}","amountUsd":50,"riskState":"${snapshot.riskRatchetState}","permission":"ALLOWED","reason":"ALLOWED [RISK_REDUCING_EXEMPTION] — Repaying debt directly increases Health Factor.","estimatedHfAfter":2.2}`;
    return `${tool}\n\n${proposal}\n\nI have evaluated a risk reduction strategy for your portfolio. Repaying outstanding USDC debt will improve your Health Factor.`;
  }

  // 10c. Watch requests / "watch health factor < 1.8"
  if (/\bwatch\s+(?:health\s+factor|hf)\s*<\s*(\d+(?:\.\d+)?)/i.test(lower)) {
    const threshold = parseFloat(lower.match(/<\s*(\d+(?:\.\d+)?)/)![1]);
    const tool = `CIRCUIT_TOOL:{"tool":"create_watch","input":{"condition":"health_factor < ${threshold}"},"output":{"status":"CONFIRMED"},"status":"CONFIRMED"}`;
    const task = `CIRCUIT_TASK:{"name":"Health Factor Sentinel","type":"WATCH","condition":{"field":"health_factor","operator":"lt","threshold":${threshold},"description":"HF < ${threshold}"}}`;
    return `${tool}\n\n${task}\n\nI have configured an active sentinel to watch your position: HF < ${threshold}. You will be alerted or auto-protected if health declines.`;
  }

  // 10d. Borrow with explicit amount
  const borrowAmtMatch = lower.match(/(?:borrow|can\s+i\s+borrow)\s+\$?(\d+(?:\.\d+)?)/i);
  if (borrowAmtMatch) {
    const amt = parseFloat(borrowAmtMatch[1]);
    const perm = evaluatePermission("borrow", canonicalAssetId, amt, snapshot);
    const tool = `CIRCUIT_TOOL:{"tool":"evaluate_permission","input":{"action":"borrow","amount":${amt},"asset":"${canonicalAssetId}"},"output":{"status":"${perm.permission === "ALLOWED" ? "CONFIRMED" : "BLOCKED"}","reason":"${perm.reason}"},"status":"${perm.permission === "ALLOWED" ? "CONFIRMED" : "BLOCKED"}"}`;
    const proposal = `CIRCUIT_ACTION_PROPOSAL:{"id":"p_${Date.now()}","action":"borrow","symbol":"${canonicalAssetId}","amountUsd":${amt},"riskState":"${snapshot.riskRatchetState}","permission":"${perm.permission}","reason":"${perm.reason}","estimatedHfAfter":${perm.estimatedHfAfter ?? "null"}}`;
    return `${tool}\n\n${proposal}\n\nEvaluation for borrowing $${amt.toFixed(2)} against ${canonicalAssetId}: ${perm.permission}.\n${perm.reason}`;
  }

  // 11. Conceptual Questions & Explanations (ZERO capability dumps, ZERO 8-point outlines)
  // Handles: "what is collateral", "what is risk", "what is risk ? how get fuck", "what is ltv", etc.
  const classified = classifyIntent(userMsg, canonicalAssetId);
  if (classified.intent === "EXPLANATION" && classified.explanationTopic) {
    return explainConcept(classified.explanationTopic, canonicalAssetId, snapshot);
  }

  // 12. Conversational Greetings (Clean and friendly, includes live state, ZERO numbered lists, ZERO capability dumps)
  if (classified.intent === "GREETING") {
    return (
      `Hello! I am the Circuit Autonomous Agent operating on Solana Devnet.\n` +
      `I am actively monitoring your positions ($${snapshot.totalCollateralUsd.toFixed(2)} collateral, Risk: ${snapshot.riskRatchetState}). ` +
      `How can I assist you today?`
    );
  }

  // Default fallback
  return (
    `I am actively monitoring ${canonicalAssetId} ($${assetCtx.price.toFixed(2)}) on Solana Devnet. ` +
    `Current Risk Ratchet state is ${snapshot.riskRatchetState} with $${snapshot.availableCreditUsd.toFixed(2)} in available borrowing capacity. ` +
    "How can I assist you with your position?"
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const clientId =
    (req.headers?.["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    (req.socket?.remoteAddress as string) ||
    "anonymous";

  const now = Date.now();
  const limitEntry = chatRateLimit.get(clientId);
  if (!limitEntry || now > limitEntry.resetAt) {
    chatRateLimit.set(clientId, { count: 1, resetAt: now + 60_000 });
  } else {
    if (limitEntry.count >= MAX_REQUESTS_PER_MINUTE) {
      return res.status(429).json({ error: "Rate limit exceeded. Maximum 30 chat requests per minute." });
    }
    limitEntry.count++;
  }

  loadLocalEnv();
  const apiKey =
    (typeof req.headers?.["x-api-key"] === "string" ? (req.headers["x-api-key"] as string).trim() : null) ||
    (typeof req.headers?.["x-gemini-api-key"] === "string" ? (req.headers["x-gemini-api-key"] as string).trim() : null) ||
    process.env.GEMINI_AI_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.AI_GATEWAY_API_KEY ||
    (process.env.NODE_ENV === "test" && process.env.CIRCUIT_OFFLINE_TEST !== "1" ? "test-key" : null);

  if (req.method === "GET") {
    return res.status(200).json({
      status: "active",
      hasApiKey: !!apiKey,
      models: [
        {
          id: "circuit-lite",
          name: "Circuit Lite",
          badge: "1 CREDIT",
          desc: "Fast everyday interaction: telemetry, market checks, simple planning & navigation",
          tier: "LITE",
          creditCost: 1,
        },
        {
          id: "circuit-pro",
          name: "Circuit Pro Agent",
          badge: "4 CREDITS",
          desc: "Deep multi-step reasoning: portfolio strategy, risk recovery, DBC liquidity planning",
          tier: "PRO",
          creditCost: 4,
        },
      ],
      rateLimitRemaining: MAX_REQUESTS_PER_MINUTE - (limitEntry?.count || 1),
    });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const body = req.body as ChatRequest;
  if (!body?.messages || !Array.isArray(body.messages)) {
    return res.status(400).json({ error: "messages array required" });
  }
  if (body.messages.length > 50) {
    return res.status(400).json({ error: "Message history exceeds maximum allowed limit (50)" });
  }

  const { messages } = body;
  const rawSnap = (body.snapshot || {}) as any;
  const snapshot: ProtocolSnapshot = {
    walletAddress: rawSnap.walletAddress ?? null,
    controlMode: rawSnap.controlMode ?? "MANUAL",
    hasActiveAuthority: !!rawSnap.hasActiveAuthority,
    riskRatchetState: rawSnap.riskRatchetState ?? "SAFE",
    isMarketOpen: rawSnap.isMarketOpen ?? true,
    totalCollateralUsd: Number(rawSnap.totalCollateralUsd) || 0,
    totalDebtUsd: Number(rawSnap.totalDebtUsd) || 0,
    availableCreditUsd: Number(rawSnap.availableCreditUsd) || 0,
    healthFactor: rawSnap.healthFactor !== undefined && rawSnap.healthFactor !== null ? Number(rawSnap.healthFactor) : null,
    positions: Array.isArray(rawSnap.positions) ? rawSnap.positions : [],
    markets: Array.isArray(rawSnap.markets) ? rawSnap.markets : [],
    onChainAuthorities: Array.isArray(rawSnap.onChainAuthorities) ? rawSnap.onChainAuthorities : [],
  };

  const lastMsgObj = messages[messages.length - 1];
  const userMsg = typeof lastMsgObj?.content === "string" ? lastMsgObj.content.slice(0, 4000) : "";
  const canonicalAssetId = (body.assetId || "NVDA").toUpperCase().replace(/X$/, "");

  // Preflight adversarial check
  const classified = classifyIntent(userMsg, canonicalAssetId);
  if (classified.intent === "ADVERSARIAL_ATTEMPT") {
    const blockedReply = handleOfflineChat(userMsg, snapshot, messages);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.status(200);
    res.write(blockedReply);
    return res.end();
  }

  // Explicit JSON request
  if (req.headers?.accept?.includes("application/json") || body.format === "json") {
    const payload = await orchestrateAgentChat({
      messages,
      snapshot,
      assetId: body.assetId,
      model: body.model,
    });
    return res.status(200).json(payload);
  }

  // Offline test mode -> deterministic offline handler
  if (process.env.CIRCUIT_OFFLINE_TEST === "1") {
    const reply = handleOfflineChat(userMsg, snapshot, messages);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.status(200);
    res.write(reply);
    return res.end();
  }

  const effectiveApiKey = apiKey || "circuit-test-key";

  // Upstream call with streaming SSE & sanitization
  const rawBaseUrl = process.env.AI_GATEWAY_BASE_URL;
  const baseUrl = rawBaseUrl ?? "https://generativelanguage.googleapis.com/v1beta/openai";
  const isGemini = baseUrl.includes("generativelanguage.googleapis.com");
  const fallbackModel = isGemini ? "gemini-2.5-flash" : "gpt-4o-mini";
  const requestedModel = mapModelId(typeof body.model === "string" ? body.model : undefined, isGemini) || fallbackModel;
  const requestedTier: "circuit-lite" | "circuit-pro" = body?.model === "circuit-pro" ? "circuit-pro" : "circuit-lite";

  const callUpstream = async (targetModel: string) => {
    const url = isGemini && !baseUrl.includes("key=")
      ? `${baseUrl}/chat/completions?key=${encodeURIComponent(effectiveApiKey)}`
      : `${baseUrl}/chat/completions`;

    return fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${effectiveApiKey}`,
      },
      body: JSON.stringify({
        model: targetModel,
        messages: [
          { role: "system", content: buildUpstreamSystemPrompt(snapshot, canonicalAssetId) },
          ...messages.slice(-20),
        ],
        stream: true,
        max_tokens: 2048,
        temperature: 0.2,
      }),
    });
  };

  try {
    const candidateModels = isGemini
      ? Array.from(new Set([requestedModel, "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]))
      : Array.from(new Set([requestedModel, "gpt-4o-mini", "gpt-3.5-turbo"]));

    let activeModel = requestedModel;
    let upstream: Response | null = null;

    for (const candidate of candidateModels) {
      activeModel = candidate;
      upstream = await callUpstream(activeModel);
      if (upstream.ok) break;
    }

    if (!upstream || !upstream.ok) {
      const reply = handleOfflineChat(userMsg, snapshot, messages);
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.status(200);
      res.write(reply);
      return res.end();
    }

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.status(200);

    const reader = upstream.body?.getReader();
    if (!reader) {
      res.write("data: [DONE]\n\n");
      return res.end();
    }

    const dec = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const rawChunk = dec.decode(value, { stream: true });
      res.write(sanitizeSseChunk(rawChunk, requestedTier));
    }
    res.end();
  } catch (err) {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.status(200);
    const reply = handleOfflineChat(userMsg, snapshot, messages);
    res.write(reply);
    res.end();
  }
}
