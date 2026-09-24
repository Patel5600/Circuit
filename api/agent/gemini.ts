/**
 * Circuit Protocol — Gemini Integration via @google/genai
 *
 * Server-side LLM reasoning layer.
 * GEMINI_AI_KEY is kept strictly server-side and never exposed to client bundles, logs, or state.
 */

import { GoogleGenAI } from "@google/genai";
import type { ProtocolSnapshot, AssetContext } from "./tools";
import { explainConcept } from "./tools";
import type { ClassifiedIntent } from "./classifier";

function resolveApiKey(): string | null {
  return (
    process.env.GEMINI_AI_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.AI_GATEWAY_API_KEY ||
    null
  );
}

export function isGeminiConfigured(): boolean {
  return Boolean(resolveApiKey());
}

function buildSystemInstruction(assetCtx: AssetContext, snap: ProtocolSnapshot): string {
  const activeAsset = assetCtx.assetId;
  const isMarketOpen = snap.isMarketOpen ? "OPEN" : "CLOSED";

  return `You are the Circuit Autonomous Agent operating on Solana Devnet.
You provide intelligent credit risk management, portfolio monitoring, and autonomous execution for tokenized equities.

CRITICAL IDENTITY & BEHAVIORAL RULES:
1. NEVER reveal, mention, or reference underlying LLM provider names, API endpoints, or model IDs (e.g. Gemini, OpenAI, Google, Anthropic, GPT). Always identify yourself as the Circuit Agent.
2. ANSWER DIRECTLY & CONCISELY:
   - When asked a question, answer the user's specific question first.
   - Keep conversational answers to 2-4 sentences unless deep strategy is explicitly requested.
   - ZERO CANNED DUMPS: Never output canned capabilities lists, 8-point outlines, or marketing brochures.
3. CONVERSATIONAL VS EXECUTION SEPARATION:
   - NEVER output execution plans or numbered step-by-step transaction instructions unless the user explicitly requested an actionable transaction or strategy.
   - General questions, greetings, and explanations must NEVER contain execution plan blocks.
4. STRICT ASSET ISOLATION:
   - The user is currently viewing ${activeAsset}.
   - All pricing, collateral, debt, and risk evaluations must reference ${activeAsset} ($${assetCtx.price.toFixed(2)}).
   - NEVER leak or reference AAPL oracle or risk state when operating in ${activeAsset}.
5. FINANCIAL CONCEPTS:
   - "what is collateral": Explain collateral clearly and concisely in finance/DeFi terms (assets pledged to secure a loan). Then in 1-2 sentences explain how Circuit uses tokenized equities (${activeAsset}x) as collateral.
   - "what is risk": Explain risk directly (probability of loss, collateral devaluation, liquidation). Then explain Circuit's 4 risk regimes (SAFE, RESTRICTED, DEFENSIVE, EMERGENCY) governed by Pyth oracle confidence and NYSE market hours.
   - "how do I borrow": Explain the borrowing mechanism concisely. If available credit > 0 ($${snap.availableCreditUsd.toFixed(2)}), mention it. Do NOT execute or create an execution plan without a specific amount.
   - If user input contains vulgar or garbled text alongside a question (e.g. "what is risk ? how get fuck"), answer the valid question politely and completely ignore the vulgarity.
6. LENDING AVAILABILITY:
   - Retail lending (supplying USDC to earn interest) is NOT currently available in Circuit. Circuit is an institutional credit facility for borrowing against tokenized equity collateral.

CURRENT LIVE CONTEXT:
- Canonical Asset: ${activeAsset}
- Asset Price: $${assetCtx.price.toFixed(2)}
- Protocol Risk Ratchet: ${snap.riskRatchetState}
- NYSE Session: ${isMarketOpen}
- User Collateral: $${snap.totalCollateralUsd.toFixed(2)} ($${assetCtx.collateralValueUsd.toFixed(2)} in ${activeAsset})
- User Debt: $${snap.totalDebtUsd.toFixed(2)}
- Available Credit: $${snap.availableCreditUsd.toFixed(2)}
- Health Factor: ${snap.healthFactor !== null ? snap.healthFactor.toFixed(3) : "N/A (No active debt)"}
- Control Mode: ${snap.controlMode}`;
}

export async function generateGeminiReply(params: {
  userMessage: string;
  classified: ClassifiedIntent;
  assetCtx: AssetContext;
  snapshot: ProtocolSnapshot;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<string> {
  const { userMessage, classified, assetCtx, snapshot, history = [] } = params;
  const apiKey = resolveApiKey();

  // If no Gemini API key configured or offline test mode forced, use deterministic typed response
  if (!apiKey || process.env.CIRCUIT_OFFLINE_TEST === "1") {
    return generateDeterministicFallback(userMessage, classified, assetCtx, snapshot);
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const systemInstruction = buildSystemInstruction(assetCtx, snapshot);

    const candidateModels = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];

    // Format chat contents
    const promptText = classified.isGarbledOrVulgar
      ? `User question: "${classified.sanitizedQuery}". Please answer the question directly and politely.`
      : userMessage;

    let responseText: string | null = null;

    for (const model of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: promptText,
          config: {
            systemInstruction,
            temperature: 0.2,
            maxOutputTokens: 1024,
          },
        });

        if (response && response.text) {
          responseText = response.text.trim();
          break;
        }
      } catch (err: any) {
        // Continue to next model candidate
        console.warn(`Gemini model ${model} attempt failed:`, err?.message || err);
      }
    }

    if (responseText && responseText.length > 0) {
      return responseText;
    }

    return generateDeterministicFallback(userMessage, classified, assetCtx, snapshot);
  } catch (err) {
    console.error("Gemini invocation error, falling back to deterministic handler:", err);
    return generateDeterministicFallback(userMessage, classified, assetCtx, snapshot);
  }
}

/**
 * High-quality deterministic fallback when Gemini API key is absent or unreachable.
 * Obeying the exact same direct, conversational, zero-canned-dump standards.
 */
export function generateDeterministicFallback(
  userMessage: string,
  classified: ClassifiedIntent,
  assetCtx: AssetContext,
  snapshot: ProtocolSnapshot
): string {
  const m = classified.sanitizedQuery.toLowerCase();

  switch (classified.intent) {
    case "GREETING":
      return (
        "Hello! I'm the Circuit Agent. I can help you monitor your tokenized equity collateral, check borrowing capacity, or manage risk. " +
        `Currently monitoring ${assetCtx.assetId} ($${assetCtx.price.toFixed(2)}) with Risk Ratchet in ${snapshot.riskRatchetState}. ` +
        "What would you like to know?"
      );

    case "EXPLANATION":
      if (classified.explanationTopic) {
        return explainConcept(classified.explanationTopic, assetCtx.assetId, snapshot);
      }
      return explainConcept("circuit", assetCtx.assetId, snapshot);

    case "PORTFOLIO_QUERY":
      if (!snapshot.walletAddress) {
        return "Connect your Solana wallet to view your live collateral positions, outstanding USDC debt, and Health Factor.";
      }
      return (
        `Your portfolio has $${snapshot.totalCollateralUsd.toFixed(2)} in total collateral and $${snapshot.totalDebtUsd.toFixed(2)} in outstanding debt. ` +
        `You have $${snapshot.availableCreditUsd.toFixed(2)} in available borrowing capacity under ${snapshot.riskRatchetState} market conditions.` +
        (snapshot.healthFactor !== null ? ` Current Health Factor is ${snapshot.healthFactor.toFixed(3)}.` : "")
      );

    case "CREDIT_QUERY":
      return (
        `You currently have $${snapshot.availableCreditUsd.toFixed(2)} in available borrowing credit against your tokenized equity collateral. ` +
        `Current Risk Ratchet state is ${snapshot.riskRatchetState}, which governs effective borrowing capacity.`
      );

    case "RISK_QUERY":
      return (
        `The Circuit Risk Ratchet is currently in the ${snapshot.riskRatchetState} state. ` +
        `NYSE Reference Market is ${snapshot.isMarketOpen ? "OPEN" : "CLOSED"}. ` +
        `Pyth oracle price for ${assetCtx.assetId} is $${assetCtx.price.toFixed(2)}. ` +
        (snapshot.riskRatchetState === "SAFE"
          ? "All credit and trading facilities are operating normally at full capacity."
          : snapshot.riskRatchetState === "RESTRICTED"
          ? "Borrow capacity is capped at 50% due to market session or volatility."
          : snapshot.riskRatchetState === "DEFENSIVE"
          ? "New borrowing is suspended due to elevated oracle spread or volatility. Repay and deposit remain open."
          : "Borrowing and withdrawals are suspended. Repay and deposit remain open under sacred recovery invariants.")
      );

    case "QUESTION":
      if (/\b(?:who\s+are\s+you|what\s+are\s+you|role)\b/i.test(m)) {
        return (
          "I am the Circuit Autonomous Agent operating on Solana Devnet. " +
          "I monitor market risk, evaluate credit parameters, and execute bounded actions under on-chain Agent Authority PDAs. " +
          "Human sovereignty is preserved: in Manual mode you sign all transactions directly, while in Autonomous mode I execute only within your explicit, revocable limits."
        );
      }
      if (/\b(?:solana)\b/i.test(m)) {
        return "Solana is a high-throughput, low-latency blockchain. Circuit uses Solana's sub-second finality to stream real-time Pyth oracle updates and enforce millisecond capital permissions.";
      }
      return (
        `I am the Circuit Autonomous Agent. I help monitor risk and capital permissions for tokenized equities (${assetCtx.assetId}). ` +
        "You can ask me about collateral, borrowing headroom, or risk conditions."
      );

    default:
      return (
        `I am monitoring ${assetCtx.assetId} ($${assetCtx.price.toFixed(2)}). ` +
        `Protocol risk state is ${snapshot.riskRatchetState} with $${snapshot.availableCreditUsd.toFixed(2)} available credit. ` +
        "How can I assist you with your position?"
      );
  }
}
