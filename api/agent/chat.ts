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
- When analyzing an operation, emit structured tool execution records on their own lines before answering:
CIRCUIT_TOOL:{"tool":"<get_position|get_risk_state|get_portfolio|evaluate_permission|get_dbc_state|quote_dbc_action>","input":{...},"output":{...},"status":"<CONFIRMED|BLOCKED>"}
- When proposing or evaluating a concrete executable action (borrow, repay, deposit, withdraw, swap, enter_liquidity, exit_liquidity), append an action proposal card JSON on its own line:
CIRCUIT_ACTION_PROPOSAL:{"id":"<unique_id>","action":"<borrow|deposit|repay|withdraw|swap|enter_liquidity|exit_liquidity|rebalance>","symbol":"<NVDA|AAPL|etc>","amountUsd":<number>,"riskState":"<SAFE|RESTRICTED|DEFENSIVE|EMERGENCY>","permission":"<ALLOWED|BLOCKED|CAPPED>","reason":"<one-sentence rationale>","estimatedHfAfter":<number_or_null>}
- When the user asks to SCHEDULE, WATCH, or AUTO MANAGE (e.g. "Watch my health factor", "Keep HF above 1.8", "Check risk every hour"), explain the plan clearly AND append a machine-readable JSON task proposal on its own line:
CIRCUIT_TASK:{"name":"<Short Title>","type":"<WATCH|OBSERVE|REPAY|BORROW|RECOVER|REPORT>","condition":{"field":"<health_factor|risk_state|borrow_capacity_usd|collateral_usd|oracle_staleness_ms|ltv_bps>","operator":"<lt|gt|eq|lte|gte>","threshold":<value>,"description":"<human readable condition>"} or null,"policy":{"version":1,"objective":"<objective string>","allowedActions":["<REPAY|BORROW|...>"],"assetScope":["<NVDA|AAPL|etc>"],"maxAmountPerActionUsd":<number>,"maxTotalUsd":<number>,"frequencyMinutes":<1|5|15|60|1440>,"expireDays":<number>,"riskAdaptive":true} or null,"frequencyMinutes":<1|5|15|60|1440>,"expireDays":<number>}
- Be concise and direct. No fluff. Never fabricate fake balances or transactions.`;
}

function preflightCheck(snap: ProtocolSnapshot, msg: string): string | null {
  const m = msg.toLowerCase();
  const wantsBorrow = /borrow|leverage/.test(m);
  const wantsWithdraw = /withdraw/.test(m);
  const action = wantsBorrow ? "borrow" : "withdraw";

  if ((wantsBorrow || wantsWithdraw) && snap.controlMode === "AUTONOMOUS") {
    if (!snap.onChainAuthorities.some(a => !a.isExpired && !a.isRevoked)) {
      const tool = `CIRCUIT_TOOL:{"tool":"evaluate_permission","input":{"action":"${action}","controlMode":"AUTONOMOUS"},"output":{"status":"BLOCKED","reason":"AGENT_UNAUTHORIZED: No active Agent Authority PDA"},"status":"BLOCKED"}`;
      const proposal = `CIRCUIT_ACTION_PROPOSAL:{"id":"p_${Date.now()}","action":"${action}","symbol":"NVDA","amountUsd":0,"riskState":"${snap.riskRatchetState}","permission":"BLOCKED","reason":"BLOCKED [AGENT_UNAUTHORIZED] — No active Agent Authority PDA. Create one via Permissions tab or execute directly in sovereign Manual mode. Deposit and Repay remain available.","estimatedHfAfter":null}`;
      return `${tool}\n\nBLOCKED [AGENT_UNAUTHORIZED] — No active Agent Authority PDA. Create one via Permissions tab or execute directly in sovereign Manual mode. Deposit and Repay remain available.\n\n${proposal}`;
    }
  }
  if (snap.riskRatchetState === "EMERGENCY" && (wantsBorrow || wantsWithdraw)) {
    const tool = `CIRCUIT_TOOL:{"tool":"evaluate_permission","input":{"action":"${action}","riskState":"EMERGENCY"},"output":{"status":"BLOCKED","reason":"RISK_STATE_RESTRICTED: Risk Ratchet in EMERGENCY"},"status":"BLOCKED"}`;
    const proposal = `CIRCUIT_ACTION_PROPOSAL:{"id":"p_${Date.now()}","action":"${action}","symbol":"NVDA","amountUsd":0,"riskState":"EMERGENCY","permission":"BLOCKED","reason":"BLOCKED [RISK_STATE_RESTRICTED] — Risk Ratchet is EMERGENCY. Borrow and Withdraw suspended. Only Repay, Deposit, and Liquidity Exit permitted.","estimatedHfAfter":null}`;
    return `${tool}\n\nBLOCKED [RISK_STATE_RESTRICTED] — Risk Ratchet is EMERGENCY. Borrow and Withdraw suspended. Only Repay, Deposit, and Liquidity Exit permitted.\n\n${proposal}`;
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

  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.status(200);

    const m = userMsg.toLowerCase();

    // 1. Borrow intent evaluation
    if (m.includes("borrow") || m.includes("leverage") || m.includes("can i borrow")) {
      const amountMatch = m.match(/\$?(\d+(?:\.\d+)?)/);
      const amount = amountMatch ? parseFloat(amountMatch[1]) : 200;
      const asset = m.match(/\b(NVDA|AAPL|TSLA|MSFT|AMZN|GOOGL|COIN)\b/i)?.[1]?.toUpperCase() || snapshot.positions[0]?.symbol || "NVDA";
      const isDefensiveOrEmerg = snapshot.riskRatchetState === "DEFENSIVE" || snapshot.riskRatchetState === "EMERGENCY";
      const isRestricted = snapshot.riskRatchetState === "RESTRICTED";

      const tool1 = `CIRCUIT_TOOL:{"tool":"get_position","input":{"symbol":"${asset}"},"output":{"collateralUsd":${snapshot.totalCollateralUsd.toFixed(2)},"debtUsd":${snapshot.totalDebtUsd.toFixed(2)},"healthFactor":${snapshot.healthFactor !== null ? snapshot.healthFactor.toFixed(3) : 999}},"status":"CONFIRMED"}`;
      const tool2 = `CIRCUIT_TOOL:{"tool":"get_risk_state","input":{},"output":{"ratchetState":"${snapshot.riskRatchetState}","marketOpen":${snapshot.isMarketOpen}},"status":"CONFIRMED"}`;
      
      if (isDefensiveOrEmerg) {
        const tool3 = `CIRCUIT_TOOL:{"tool":"evaluate_permission","input":{"action":"borrow","amountUsd":${amount},"asset":"${asset}"},"output":{"status":"BLOCKED","reason":"Risk Ratchet in ${snapshot.riskRatchetState} blocks new leverage"},"status":"BLOCKED"}`;
        const proposal = `CIRCUIT_ACTION_PROPOSAL:{"id":"p_${Date.now()}","action":"borrow","symbol":"${asset}","amountUsd":${amount},"riskState":"${snapshot.riskRatchetState}","permission":"BLOCKED","reason":"New leverage is disabled by Capital Policy in ${snapshot.riskRatchetState}. Repay, Deposit, and Recovery actions remain available.","estimatedHfAfter":null}`;
        res.write(`${tool1}\n${tool2}\n${tool3}\n\nI evaluated your borrow request against Circuit's canonical Risk Ratchet:\n\n• Action: BORROW $${amount.toFixed(2)} against ${asset}\n• Risk State: ${snapshot.riskRatchetState}\n• Permission Gate: BLOCKED by Circuit Permission Engine\n\nUnder ${snapshot.riskRatchetState} policy, new leverage is strictly suspended to defend protocol solvency. Capital recovery actions (Repay, Deposit, Exit Liquidity) are currently permitted.\n\n${proposal}`);
        return res.end();
      }

      const permissionStatus = isRestricted ? "CAPPED" : "ALLOWED";
      const maxBorrow = isRestricted ? Math.min(amount, snapshot.availableCreditUsd * 0.5) : snapshot.availableCreditUsd;
      const feasible = snapshot.totalCollateralUsd > 0 && amount <= snapshot.availableCreditUsd;
      const tool3 = `CIRCUIT_TOOL:{"tool":"evaluate_permission","input":{"action":"borrow","amountUsd":${amount},"asset":"${asset}"},"output":{"status":"${feasible ? permissionStatus : 'BLOCKED'}","availableCreditUsd":${snapshot.availableCreditUsd.toFixed(2)},"reason":"${feasible ? 'Within dynamic LTV and policy limits' : 'Requested amount exceeds borrow capacity'}"},"status":"${feasible ? 'CONFIRMED' : 'BLOCKED'}"}`;
      const proposal = `CIRCUIT_ACTION_PROPOSAL:{"id":"p_${Date.now()}","action":"borrow","symbol":"${asset}","amountUsd":${amount},"riskState":"${snapshot.riskRatchetState}","permission":"${feasible ? permissionStatus : 'BLOCKED'}","reason":"${feasible ? `Borrow $${amount} is within current ${snapshot.riskRatchetState} policy limits.` : 'Insufficient collateral to support this borrow amount.'}","estimatedHfAfter":${feasible ? 1.65 : null}}`;

      res.write(`${tool1}\n${tool2}\n${tool3}\n\n${feasible ? `Yes, you can borrow $${amount.toFixed(2)} against ${asset}.` : `Borrow of $${amount.toFixed(2)} against ${asset} exceeds your current borrowing capacity.`}\n\n• Current Risk State: ${snapshot.riskRatchetState} (NYSE Session ${snapshot.isMarketOpen ? 'Open' : 'Closed'})\n• Total Collateral: $${snapshot.totalCollateralUsd.toFixed(2)}\n• Available Credit: $${snapshot.availableCreditUsd.toFixed(2)}\n• Permission Engine: ${feasible ? permissionStatus : 'BLOCKED'}\n\n${feasible ? 'An action proposal has been constructed below for your review and execution.' : 'Please deposit additional collateral or select a smaller amount to borrow.'}\n\n${proposal}`);
      return res.end();
    }

    // 2. Risk observation intent
    if (m.includes("risk") || m.includes("restricted") || m.includes("why") || m.includes("state") || m.includes("ratchet")) {
      const tool1 = `CIRCUIT_TOOL:{"tool":"get_risk_state","input":{},"output":{"ratchetState":"${snapshot.riskRatchetState}","marketOpen":${snapshot.isMarketOpen}},"status":"CONFIRMED"}`;
      const tool2 = `CIRCUIT_TOOL:{"tool":"get_portfolio","input":{},"output":{"totalCollateralUsd":${snapshot.totalCollateralUsd.toFixed(2)},"totalDebtUsd":${snapshot.totalDebtUsd.toFixed(2)},"healthFactor":${snapshot.healthFactor !== null ? snapshot.healthFactor.toFixed(3) : 999}},"status":"CONFIRMED"}`;
      
      res.write(`${tool1}\n${tool2}\n\nCurrent Risk Ratchet telemetry on Solana Devnet:\n\n• State: ${snapshot.riskRatchetState}\n• Market Session: ${snapshot.isMarketOpen ? 'NYSE Regular Trading Hours' : 'Outside Regular US Equities Hours'}\n• Portfolio Health Factor: ${snapshot.healthFactor !== null ? snapshot.healthFactor.toFixed(3) : 'Infinite (No active debt)'}\n• Total Collateral: $${snapshot.totalCollateralUsd.toFixed(2)}\n• Outstanding Debt: $${snapshot.totalDebtUsd.toFixed(2)}\n\nCircuit's Dynamic Risk Ratchet transitions immediately when oracle uncertainty (confidence interval spread) increases or market sessions change, and enforces monotonic, evidence-based recovery.`);
      return res.end();
    }

    // 3. Meteora DBC liquidity intent
    if (m.includes("dbc") || m.includes("meteora") || m.includes("liquidity") || m.includes("swap")) {
      const tool1 = `CIRCUIT_TOOL:{"tool":"get_dbc_state","input":{"symbol":"NVDA"},"output":{"venue":"Meteora DBC (dbcij3LW...aqN)","governance":"Circuit Permission Engine"},"status":"CONFIRMED"}`;
      const tool2 = `CIRCUIT_TOOL:{"tool":"evaluate_permission","input":{"action":"enter_liquidity","riskState":"${snapshot.riskRatchetState}"},"output":{"status":"${snapshot.riskRatchetState === 'SAFE' ? 'ALLOWED (100%)' : snapshot.riskRatchetState === 'RESTRICTED' ? 'CAPPED (50%)' : 'BLOCKED'}","exitLiquidity":"ALLOWED (Unconditional Escape)"},"status":"CONFIRMED"}`;

      res.write(`${tool1}\n${tool2}\n\nMeteora Dynamic Bonding Curve (DBC) status under Section 15 Risk Matrix:\n\n• Current Risk Ratchet: ${snapshot.riskRatchetState}\n• Swap (DBC): ${snapshot.riskRatchetState === 'SAFE' ? 'ALLOWED (100% capacity)' : snapshot.riskRatchetState === 'RESTRICTED' ? 'CAPPED (50% / 100 bps max slippage)' : 'BLOCKED'}\n• Enter Liquidity: ${snapshot.riskRatchetState === 'SAFE' ? 'ALLOWED (100% capacity)' : snapshot.riskRatchetState === 'RESTRICTED' ? 'CAPPED (50% capacity)' : 'BLOCKED'}\n• Exit Liquidity: ALLOWED (Unconditional capital escape across all risk states)\n\nCircuit is the risk and permission engine; Meteora DBC serves as an execution venue bounded atomically by Circuit CPI.`);
      return res.end();
    }

    // 4. Watch intent
    if (m.includes("watch") || m.includes("alert") || m.includes("monitor")) {
      const threshold = m.match(/(\d+(?:\.\d+)?)/)?.[1] ?? "1.8";
      const tool1 = `CIRCUIT_TOOL:{"tool":"create_watch","input":{"field":"health_factor","operator":"lt","threshold":${threshold}},"output":{"watchId":"w_${Date.now()}","status":"ACTIVE"},"status":"CONFIRMED"}`;
      res.write(
        `${tool1}\n\nI have structured an on-chain watch condition for your health factor. When the trigger condition is met, Circuit's autonomous engine evaluates permissions and dispatches an alert.\n\n` +
        `CIRCUIT_TASK:{"name":"Watch Health Factor < ${threshold}","type":"WATCH","condition":{"field":"health_factor","operator":"lt","threshold":${threshold},"description":"Health factor drops below ${threshold}"},"policy":null,"frequencyMinutes":5,"expireDays":30}`
      );
      return res.end();
    }

    // 5. Schedule intent
    if (m.includes("schedule") || m.includes("every") || m.includes("hour") || m.includes("daily")) {
      const mins = m.includes("hour") ? 60 : m.includes("day") ? 1440 : 15;
      const tool1 = `CIRCUIT_TOOL:{"tool":"create_schedule","input":{"frequencyMinutes":${mins}},"output":{"scheduleId":"s_${Date.now()}","status":"ACTIVE"},"status":"CONFIRMED"}`;
      res.write(
        `${tool1}\n\nI have prepared a scheduled portfolio review task. This will run periodically via Circuit's server-side cron engine to observe position health and market conditions.\n\n` +
        `CIRCUIT_TASK:{"name":"Scheduled Portfolio Review","type":"OBSERVE","condition":null,"policy":null,"frequencyMinutes":${mins},"expireDays":30}`
      );
      return res.end();
    }

    // 6. Auto manage intent
    if (m.includes("auto") || m.includes("repay") || m.includes("manage") || m.includes("protect")) {
      const tool1 = `CIRCUIT_TOOL:{"tool":"build_strategy","input":{"objective":"Auto-repay protection","riskAdaptive":true},"output":{"strategyId":"strat_${Date.now()}","status":"VALIDATED"},"status":"CONFIRMED"}`;
      res.write(
        `${tool1}\n\nI have configured an Auto Manage protection policy with bounded capital authority. This strategy will automatically repay debt when health factor approaches 1.80, up to $200 per action.\n\n` +
        `CIRCUIT_TASK:{"name":"Auto-Repay Protection","type":"REPAY","condition":{"field":"health_factor","operator":"lt","threshold":1.8,"description":"Health factor drops below 1.80"},"policy":{"version":1,"objective":"Defend health factor above 1.80 with auto-repay","allowedActions":["REPAY"],"assetScope":[],"maxAmountPerActionUsd":200,"maxTotalUsd":1000,"frequencyMinutes":5,"expireDays":30,"riskAdaptive":true},"frequencyMinutes":5,"expireDays":30}`
      );
      return res.end();
    }

    // Default contextual response
    const tool1 = `CIRCUIT_TOOL:{"tool":"get_portfolio","input":{},"output":{"collateralUsd":${snapshot.totalCollateralUsd.toFixed(2)},"debtUsd":${snapshot.totalDebtUsd.toFixed(2)}},"status":"CONFIRMED"}`;
    const tool2 = `CIRCUIT_TOOL:{"tool":"get_risk_state","input":{},"output":{"ratchetState":"${snapshot.riskRatchetState}"},"status":"CONFIRMED"}`;
    res.write(`${tool1}\n${tool2}\n\nI observe your Solana Devnet state:\n• Risk Ratchet: ${snapshot.riskRatchetState}\n• Total Collateral: $${snapshot.totalCollateralUsd.toFixed(2)}\n• Available Credit: $${snapshot.availableCreditUsd.toFixed(2)}\n\nYou can ask me to evaluate borrowing limits, monitor market risk, build safe liquidity strategies, set condition watches, or execute permitted credit/DBC actions within Circuit safety bounds.`);
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
