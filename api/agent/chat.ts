/**
 * Circuit Protocol — Autonomous Agent Chat API
 * Server-side streaming endpoint. AI_GATEWAY_API_KEY never sent to browser.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";

interface ProtocolSnapshot {
  walletAddress: string | null;
  controlMode: string;
  hasActiveAuthority: boolean;
  riskRatchetState: string;
  isMarketOpen: boolean;
  totalCollateralUsd: number;
  totalDebtUsd: number;
  availableCreditUsd: number;
  healthFactor: number | null;
  positions: Array<{ symbol: string; collateralValueUsd: number; debtUi: number; mint: string }>;
  markets: Array<{ symbol: string; price: number; change24hPct: number | null }>;
  onChainAuthorities: Array<{ agentAddress: string; assetSymbol: string; isExpired: boolean; isRevoked: boolean; maxBorrowLimit: number; expiryTs: number }>;
}

interface ChatRequest {
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  snapshot: ProtocolSnapshot;
}

function buildSystemPrompt(snap: ProtocolSnapshot): string {
  const authCount = snap.onChainAuthorities.filter(a => !a.isExpired && !a.isRevoked).length;
  const pos = snap.positions.length > 0
    ? snap.positions.map(p => `  - ${p.symbol}: $${p.collateralValueUsd.toFixed(2)} collateral, $${p.debtUi.toFixed(2)} debt`).join("\n")
    : "  - No open positions";
  const mkt = snap.markets.length > 0
    ? snap.markets.map(m => { const c = m.change24hPct !== null ? ` (${m.change24hPct >= 0 ? "+" : ""}${m.change24hPct.toFixed(2)}% 24h)` : ""; return `  - ${m.symbol}: $${m.price.toFixed(2)}${c}`; }).join("\n")
    : "  - No market data";
  const auth = authCount > 0
    ? `${authCount} active on-chain authority PDA(s). Agent may execute bounded actions.`
    : "No active agent authority. Cannot execute borrow/withdraw without creating one first.";

  return `You are the Circuit Protocol Autonomous Agent on Solana Devnet.

IDENTITY: You are NOT a chatbot. You are an autonomous financial operator that communicates through chat.
You reason about real on-chain state. You NEVER invent positions, prices, or transactions.
You are powerful. You are NOT the authority. Circuit is the authority.

PRINCIPLES:
1. MANUAL = sovereign direct wallet execution
2. AUTONOMOUS = delegated execution under bounded on-chain authority PDA
3. Every agent action is governed by the Circuit permission engine
4. Repay and Deposit are always permitted (capital recovery is sacred)
5. Borrow and Withdraw require: active authority PDA + risk state SAFE/RESTRICTED + LTV within bounds

REAL-TIME STATE (Solana Devnet):
Wallet: ${snap.walletAddress ?? "Not connected"}
Control Mode: ${snap.controlMode}
Risk State: ${snap.riskRatchetState}
Market Open: ${snap.isMarketOpen ? "YES" : "NO"}
Collateral: $${snap.totalCollateralUsd.toFixed(2)}
Debt: $${snap.totalDebtUsd.toFixed(2)}
Available Credit: $${snap.availableCreditUsd.toFixed(2)}
Health Factor: ${snap.healthFactor !== null ? snap.healthFactor.toFixed(4) : "N/A"}

POSITIONS:
${pos}

MARKET PRICES:
${mkt}

AUTHORITY:
${auth}

RULES:
- Analyze feasibility using only the real numbers above
- When proposing a strategy, list: objective, constraints, actions with amounts
- If blocked, state the exact Circuit reason code (RISK_STATE_RESTRICTED, LTV_EXCEEDED, AGENT_UNAUTHORIZED, etc.)
- Be concise and direct. No fluff.`;
}

function preflightCheck(snap: ProtocolSnapshot, msg: string): string | null {
  const m = msg.toLowerCase();
  const wantsBorrow = /borrow|leverage/.test(m);
  const wantsWithdraw = /withdraw/.test(m);
  if ((wantsBorrow || wantsWithdraw) && snap.controlMode === "AUTONOMOUS") {
    if (!snap.onChainAuthorities.some(a => !a.isExpired && !a.isRevoked)) {
      return "BLOCKED [AGENT_UNAUTHORIZED] — No active Agent Authority PDA. Create one via Authority Setup. Deposit and Repay remain available.";
    }
  }
  if (snap.riskRatchetState === "EMERGENCY" && (wantsBorrow || wantsWithdraw)) {
    return "BLOCKED [RISK_STATE_RESTRICTED] — Risk Ratchet is EMERGENCY. Borrow and Withdraw suspended. Only Repay and Deposit permitted.";
  }
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  res.setHeader("Access-Control-Allow-Origin", "*");

  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.status(200);
    res.write("AI Gateway not configured. Set AI_GATEWAY_API_KEY in Vercel environment variables to enable autonomous reasoning.\n\nThe on-chain authority system is fully operational. Create Agent Authority PDAs, view permission gates, and execute manual transactions without AI.");
    return res.end();
  }

  const body = req.body as ChatRequest;
  if (!body?.messages || !Array.isArray(body.messages)) return res.status(400).json({ error: "messages required" });

  const { messages, snapshot } = body;
  const userMsg = messages[messages.length - 1]?.content ?? "";

  const blocked = preflightCheck(snapshot, userMsg);
  if (blocked) {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.status(200);
    res.write(blocked);
    return res.end();
  }

  const baseUrl = process.env.AI_GATEWAY_BASE_URL ?? "https://api.openai.com/v1";
  const model = process.env.AI_MODEL ?? "gpt-4o-mini";

  try {
    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: buildSystemPrompt(snapshot) }, ...messages.slice(-20)],
        stream: true,
        max_tokens: 1024,
        temperature: 0.3,
      }),
    });

    if (!upstream.ok) {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.status(200);
      res.write(`AI model unavailable (HTTP ${upstream.status}). On-chain functions fully operational.`);
      return res.end();
    }

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.status(200);

    const reader = upstream.body?.getReader();
    if (!reader) { res.write("data: [DONE]\n\n"); return res.end(); }
    const dec = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(dec.decode(value, { stream: true }));
    }
    res.end();
  } catch (err) {
    console.error("Agent chat:", err);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.status(200);
    res.write("Connection error. On-chain system unaffected.");
    res.end();
  }
}
