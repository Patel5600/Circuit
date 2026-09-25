/**
 * /api/agent
 *
 * Primary serverless gateway for Circuit Autonomous Agent.
 * Returns structured response channels: response, intent, executionPlan, toolCalls, permission.
 * GEMINI_AI_KEY is kept strictly server-side.
 */

import type { VercelRequest, VercelResponse } from "./_types";
import { orchestrateAgentChat, type AgentResponsePayload } from "./agent/_orchestrator";
import { isGeminiConfigured } from "./agent/_gemini";
import type { ProtocolSnapshot } from "./agent/_tools";

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
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method === "GET") {
    return res.status(200).json({
      status: "active",
      configured: isGeminiConfigured(),
      models: [
        { id: "circuit-lite", name: "Circuit Lite", badge: "1 CREDIT", desc: "Fast everyday interaction: telemetry, market checks, simple planning & navigation", tier: "LITE" },
        { id: "circuit-pro", name: "Circuit Pro Agent", badge: "4 CREDITS", desc: "Deep multi-step reasoning: portfolio strategy, risk recovery, DBC liquidity planning", tier: "PRO" },
      ],
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    const messages = Array.isArray(body.messages) ? body.messages : [];
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

    const assetId = typeof body.assetId === "string" ? body.assetId : undefined;
    const model = typeof body.model === "string" ? body.model : "circuit-lite";

    const payload: AgentResponsePayload = await orchestrateAgentChat({
      messages,
      snapshot,
      assetId,
      model,
    });

    return res.status(200).json(payload);
  } catch (err: any) {
    console.error("/api/agent handler error:", err);
    return res.status(200).json({
      response: "Hello! I am the Circuit Autonomous Agent. I am monitoring your on-chain positions and Solana Devnet market state. How can I assist you today?",
      intent: "GREETING",
      executionPlan: null,
      toolCalls: [],
      permission: null,
      assetId: "NVDA",
    });
  }
}
