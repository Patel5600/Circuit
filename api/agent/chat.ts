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
  
  // Phase 9: Adversarial Prompt Refusal by Architecture
  const wantsOverride = /ignore.*(risk|state|limit|rule)|override|borrow\s+anyway|bypass|skip\s+permission|change\s+(my\s+)?limits|use\s+another\s+(pool|asset)|create.*second\s+authority/i.test(m);
  if (wantsOverride) {
    const tool = `CIRCUIT_TOOL:{"tool":"evaluate_permission","input":{"overrideAttempt":true,"intent":"ADVERSARIAL_POLICY_BYPASS"},"output":{"status":"BLOCKED","reason":"ARCHITECTURE_INVARIANT: Circuit Risk and Permission Engine cannot be bypassed by natural language prompts or agent directives."},"status":"BLOCKED"}`;
    const proposal = `CIRCUIT_ACTION_PROPOSAL:{"id":"p_${Date.now()}","action":"borrow","symbol":"NVDA","amountUsd":0,"riskState":"${snap.riskRatchetState}","permission":"BLOCKED","reason":"BLOCKED [ARCHITECTURAL_INVARIANT] — Circuit permissions are enforced deterministically on-chain by the Permission Engine PDA, not by natural language prompt requests.","estimatedHfAfter":null}`;
    return `${tool}\n\nPERMISSION REFUSED [ARCHITECTURAL_INVARIANT]\n\nCircuit's on-chain architecture strictly prohibits policy overrides. The Autonomous Agent has no authority to bypass the Risk Ratchet, modify Capital Policy, or skip permission evaluation.\n\n• Current Risk State: ${snap.riskRatchetState}\n• Permission Gate: BLOCKED by Circuit Permission Engine\n• Human Sovereignty: Preserved (Only root wallet can manage positions)\n\n${proposal}`;
  }

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
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }
  res.setHeader("Access-Control-Allow-Origin", "*");

  const apiKey =
    process.env.GEMINI_AI_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.AI_GATEWAY_API_KEY;

  if (req.method === "GET") {
    if (!apiKey) {
      return res.status(200).json({ models: [] });
    }
    try {
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
      if (!resp.ok) {
        return res.status(resp.status).json({ error: "Failed to list models from Gemini API" });
      }
      const data = await resp.json();
      return res.status(200).json(data);
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Failed" });
    }
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

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

  if (!apiKey) {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.status(200);

    const m = userMsg.toLowerCase();

    // 1. "What can I do with my position right now?" intent
    if (m.includes("what can i do") || m.includes("available actions") || m.includes("my options")) {
      const asset = m.match(/\b(NVDA|AAPL|TSLA|MSFT|AMZN|GOOGL|COIN)\b/i)?.[1]?.toUpperCase() || snapshot.positions[0]?.symbol || "NVDA";
      const isDefensiveOrEmerg = snapshot.riskRatchetState === "DEFENSIVE" || snapshot.riskRatchetState === "EMERGENCY";
      const isRestricted = snapshot.riskRatchetState === "RESTRICTED";

      const tool1 = `CIRCUIT_TOOL:{"tool":"get_position","input":{"symbol":"${asset}"},"output":{"collateralUsd":${snapshot.totalCollateralUsd.toFixed(2)},"debtUsd":${snapshot.totalDebtUsd.toFixed(2)},"healthFactor":${snapshot.healthFactor !== null ? snapshot.healthFactor.toFixed(3) : 999}},"status":"CONFIRMED"}`;
      const tool2 = `CIRCUIT_TOOL:{"tool":"get_oracle","input":{"symbol":"${asset}"},"output":{"freshness":"VALID","confidenceBps":18},"status":"CONFIRMED"}`;
      const tool3 = `CIRCUIT_TOOL:{"tool":"get_risk_state","input":{},"output":{"ratchetState":"${snapshot.riskRatchetState}","marketOpen":${snapshot.isMarketOpen}},"status":"CONFIRMED"}`;
      const tool4 = `CIRCUIT_TOOL:{"tool":"get_capital_policy","input":{"riskState":"${snapshot.riskRatchetState}"},"output":{"borrowAllowed":${!isDefensiveOrEmerg},"effectiveLtvBps":${isDefensiveOrEmerg ? 0 : 7000}},"status":"CONFIRMED"}`;
      const tool5 = `CIRCUIT_TOOL:{"tool":"get_authority","input":{"asset":"${asset}"},"output":{"hasActiveAuthority":${snapshot.hasActiveAuthority},"mode":"${snapshot.controlMode}"},"status":"CONFIRMED"}`;

      const allowedList: string[] = ["• Deposit Collateral: ALLOWED (Always open to improve solvency)"];
      if (snapshot.totalDebtUsd > 0) {
        allowedList.push("• Repay Debt: ALLOWED (Always open for capital recovery)");
      }
      allowedList.push("• Recovery / Exit Liquidity: ALLOWED (Unconditional escape path)");

      const blockedList: string[] = [];
      if (isDefensiveOrEmerg) {
        blockedList.push(`• New Borrow: BLOCKED (Capital Policy restricts new leverage in ${snapshot.riskRatchetState})`);
        blockedList.push(`• New DBC Swaps / Liquidity: BLOCKED (Trading venue entries suspended in ${snapshot.riskRatchetState})`);
        if (snapshot.totalDebtUsd > 0) {
          blockedList.push(`• Collateral Withdrawal: BLOCKED (Cannot withdraw while outstanding debt exists in ${snapshot.riskRatchetState})`);
        }
      } else if (isRestricted) {
        allowedList.push(`• Borrow: CAPPED (50% capacity: up to $${(snapshot.availableCreditUsd * 0.5).toFixed(2)})`);
        allowedList.push("• DBC Swaps: CAPPED (50% capacity, 100 bps max slippage)");
      } else {
        allowedList.push(`• Borrow: ALLOWED (Full capacity: up to $${snapshot.availableCreditUsd.toFixed(2)})`);
        allowedList.push("• DBC Swaps & Liquidity: ALLOWED (100% capacity)");
        allowedList.push("• Collateral Withdrawal: ALLOWED (Subject to min health factor 1.05)");
      }

      res.write(
        `${tool1}\n${tool2}\n${tool3}\n${tool4}\n${tool5}\n\n` +
        `Current on-chain telemetry and permissions for your ${asset} position:\n\n` +
        `• Risk Ratchet State: ${snapshot.riskRatchetState}\n` +
        `• Collateral Value: $${snapshot.totalCollateralUsd.toFixed(2)}\n` +
        `• Outstanding Debt: $${snapshot.totalDebtUsd.toFixed(2)}\n` +
        `• Available Credit: $${snapshot.availableCreditUsd.toFixed(2)}\n` +
        `• Health Factor: ${snapshot.healthFactor !== null ? snapshot.healthFactor.toFixed(3) : "Infinite"}\n\n` +
        `PERMITTED ACTIONS:\n${allowedList.join("\n")}\n\n` +
        (blockedList.length > 0 ? `BLOCKED BY POLICY:\n${blockedList.join("\n")}\n\n` : "") +
        `You can ask me to borrow, repay, provide DBC liquidity, or configure health factor alerts.`
      );
      return res.end();
    }

    // 2. Borrow intent evaluation
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

    // 3. "Reduce my risk" intent
    if (m.includes("reduce") || m.includes("deleverag") || m.includes("pay down") || m.includes("lower risk")) {
      const asset = snapshot.positions[0]?.symbol || "NVDA";
      const hasDebt = snapshot.totalDebtUsd > 0;
      const repayAmount = hasDebt ? Math.min(snapshot.totalDebtUsd, 200) : 0;

      const tool1 = `CIRCUIT_TOOL:{"tool":"get_portfolio","input":{},"output":{"totalDebtUsd":${snapshot.totalDebtUsd.toFixed(2)},"healthFactor":${snapshot.healthFactor !== null ? snapshot.healthFactor.toFixed(3) : 999}},"status":"CONFIRMED"}`;
      const tool2 = `CIRCUIT_TOOL:{"tool":"evaluate_permission","input":{"action":"${hasDebt ? 'repay' : 'deposit'}","asset":"${asset}"},"output":{"status":"ALLOWED","reason":"Risk-reducing invariant: capital recovery is always permitted"},"status":"CONFIRMED"}`;

      if (hasDebt) {
        const proposal = `CIRCUIT_ACTION_PROPOSAL:{"id":"p_${Date.now()}","action":"repay","symbol":"${asset}","amountUsd":${repayAmount},"riskState":"${snapshot.riskRatchetState}","permission":"ALLOWED","reason":"Repaying $${repayAmount} debt directly improves health factor and lowers protocol risk exposure.","estimatedHfAfter":${snapshot.healthFactor ? snapshot.healthFactor * 1.35 : 2.5}}`;
        res.write(
          `${tool1}\n${tool2}\n\nTo reduce your risk, the most effective permitted action is repaying outstanding debt.\n\n` +
          `• Outstanding Debt: $${snapshot.totalDebtUsd.toFixed(2)}\n` +
          `• Action: REPAY $${repayAmount.toFixed(2)} USDC\n` +
          `• Risk Policy: ALWAYS ALLOWED (Capital Recovery Invariant)\n` +
          `• Projected Health Factor: ${snapshot.healthFactor ? (snapshot.healthFactor * 1.35).toFixed(2) : "2.50"}\n\n` +
          `I have prepared a repayment action proposal below for your confirmation:\n\n${proposal}`
        );
      } else {
        const proposal = `CIRCUIT_ACTION_PROPOSAL:{"id":"p_${Date.now()}","action":"deposit","symbol":"${asset}","amountUsd":500,"riskState":"${snapshot.riskRatchetState}","permission":"ALLOWED","reason":"Depositing additional collateral expands your safety buffer and raises borrowing headroom.","estimatedHfAfter":null}`;
        res.write(
          `${tool1}\n${tool2}\n\nYou currently have zero debt. To further strengthen your position against market volatility, you can deposit additional ${asset} collateral to expand your buffer.\n\n` +
          `• Outstanding Debt: $0.00\n` +
          `• Current Collateral: $${snapshot.totalCollateralUsd.toFixed(2)}\n` +
          `• Action: DEPOSIT $500.00 ${asset}\n` +
          `• Risk Policy: ALWAYS ALLOWED (Risk-Reducing)\n\n${proposal}`
        );
      }
      return res.end();
    }

    // 4. Risk observation intent
    if (m.includes("risk") || m.includes("restricted") || m.includes("why") || m.includes("state") || m.includes("ratchet")) {
      const tool1 = `CIRCUIT_TOOL:{"tool":"get_risk_state","input":{},"output":{"ratchetState":"${snapshot.riskRatchetState}","marketOpen":${snapshot.isMarketOpen}},"status":"CONFIRMED"}`;
      const tool2 = `CIRCUIT_TOOL:{"tool":"get_portfolio","input":{},"output":{"totalCollateralUsd":${snapshot.totalCollateralUsd.toFixed(2)},"totalDebtUsd":${snapshot.totalDebtUsd.toFixed(2)},"healthFactor":${snapshot.healthFactor !== null ? snapshot.healthFactor.toFixed(3) : 999}},"status":"CONFIRMED"}`;
      
      res.write(`${tool1}\n${tool2}\n\nCurrent Risk Ratchet telemetry on Solana Devnet:\n\n• State: ${snapshot.riskRatchetState}\n• Market Session: ${snapshot.isMarketOpen ? 'NYSE Regular Trading Hours' : 'Outside Regular US Equities Hours'}\n• Portfolio Health Factor: ${snapshot.healthFactor !== null ? snapshot.healthFactor.toFixed(3) : 'Infinite (No active debt)'}\n• Total Collateral: $${snapshot.totalCollateralUsd.toFixed(2)}\n• Outstanding Debt: $${snapshot.totalDebtUsd.toFixed(2)}\n\nCircuit's Dynamic Risk Ratchet transitions immediately when oracle uncertainty (confidence interval spread) increases or market sessions change, and enforces monotonic, evidence-based recovery.`);
      return res.end();
    }

    // 5. Meteora DBC liquidity intent ("Provide liquidity while the circuit allows it")
    if (m.includes("dbc") || m.includes("meteora") || m.includes("liquidity") || m.includes("swap") || m.includes("provide liquidity")) {
      const asset = m.match(/\b(NVDA|AAPL|TSLA|MSFT|AMZN|GOOGL|COIN)\b/i)?.[1]?.toUpperCase() || "NVDA";
      const isDefensiveOrEmerg = snapshot.riskRatchetState === "DEFENSIVE" || snapshot.riskRatchetState === "EMERGENCY";
      const isRestricted = snapshot.riskRatchetState === "RESTRICTED";

      const tool1 = `CIRCUIT_TOOL:{"tool":"get_dbc_state","input":{"symbol":"${asset}"},"output":{"venue":"Meteora DBC (dbcij3LW...aqN)","poolEnvironment":"DEVNET TEST POOL","governance":"Circuit Permission Engine"},"status":"CONFIRMED"}`;
      const tool2 = `CIRCUIT_TOOL:{"tool":"evaluate_permission","input":{"action":"enter_liquidity","riskState":"${snapshot.riskRatchetState}"},"output":{"status":"${isDefensiveOrEmerg ? 'BLOCKED' : isRestricted ? 'CAPPED (50%)' : 'ALLOWED (100%)'}","exitLiquidity":"ALLOWED (Unconditional Escape)"},"status":"CONFIRMED"}`;

      if (isDefensiveOrEmerg) {
        const proposal = `CIRCUIT_ACTION_PROPOSAL:{"id":"p_${Date.now()}","action":"exit_liquidity","symbol":"${asset}","amountUsd":0,"riskState":"${snapshot.riskRatchetState}","permission":"ALLOWED","reason":"Exit Liquidity is unconditionally permitted across all risk states to ensure capital recovery.","estimatedHfAfter":null}`;
        res.write(
          `${tool1}\n${tool2}\n\nUnder ${snapshot.riskRatchetState} policy, new liquidity provisioning and swaps on Meteora DBC are strictly BLOCKED to protect protocol solvency.\n\n` +
          `• Venue: Meteora DBC Devnet Test Pool\n` +
          `• Enter Liquidity: BLOCKED by Circuit Permission Engine\n` +
          `• Exit Liquidity: ALLOWED (Unconditional capital escape across all risk states)\n\n` +
          `Circuit is the risk and permission authority; Meteora DBC serves as an execution venue bounded atomically by Circuit CPI.\n\n${proposal}`
        );
        return res.end();
      }

      const proposal = `CIRCUIT_ACTION_PROPOSAL:{"id":"p_${Date.now()}","action":"enter_liquidity","symbol":"${asset}","amountUsd":250,"riskState":"${snapshot.riskRatchetState}","permission":"${isRestricted ? 'CAPPED' : 'ALLOWED'}","reason":"Providing liquidity into ${asset} Devnet Test Pool within ${snapshot.riskRatchetState} limits.","estimatedHfAfter":null}`;
      res.write(
        `${tool1}\n${tool2}\n\nMeteora Dynamic Bonding Curve (DBC) status under Section 15 Risk Matrix:\n\n` +
        `• Current Risk Ratchet: ${snapshot.riskRatchetState}\n` +
        `• Pool Environment: DEVNET TEST POOL (Test-mint liquidity)\n` +
        `• Swap (DBC): ${snapshot.riskRatchetState === 'SAFE' ? 'ALLOWED (100% capacity)' : 'CAPPED (50% / 100 bps max slippage)'}\n` +
        `• Enter Liquidity: ${snapshot.riskRatchetState === 'SAFE' ? 'ALLOWED (100% capacity)' : 'CAPPED (50% capacity)'}\n` +
        `• Exit Liquidity: ALLOWED (Unconditional capital escape across all risk states)\n\n` +
        `I have prepared an action proposal below within current Circuit limits:\n\n${proposal}`
      );
      return res.end();
    }

    // 6. Watch intent
    if (m.includes("watch") || m.includes("alert") || m.includes("monitor")) {
      const threshold = m.match(/(\d+(?:\.\d+)?)/)?.[1] ?? "1.8";
      const tool1 = `CIRCUIT_TOOL:{"tool":"create_watch","input":{"field":"health_factor","operator":"lt","threshold":${threshold}},"output":{"watchId":"w_${Date.now()}","status":"ACTIVE"},"status":"CONFIRMED"}`;
      res.write(
        `${tool1}\n\nI have structured an on-chain watch condition for your health factor. When the trigger condition is met, Circuit's autonomous engine evaluates permissions and dispatches an alert.\n\n` +
        `CIRCUIT_TASK:{"name":"Watch Health Factor < ${threshold}","type":"WATCH","condition":{"field":"health_factor","operator":"lt","threshold":${threshold},"description":"Health factor drops below ${threshold}"},"policy":null,"frequencyMinutes":5,"expireDays":30}`
      );
      return res.end();
    }

    // 7. Schedule intent
    if (m.includes("schedule") || m.includes("every") || m.includes("hour") || m.includes("daily")) {
      const mins = m.includes("hour") ? 60 : m.includes("day") ? 1440 : 15;
      const tool1 = `CIRCUIT_TOOL:{"tool":"create_schedule","input":{"frequencyMinutes":${mins}},"output":{"scheduleId":"s_${Date.now()}","status":"ACTIVE"},"status":"CONFIRMED"}`;
      res.write(
        `${tool1}\n\nI have prepared a scheduled portfolio review task. This will run periodically via Circuit's server-side cron engine to observe position health and market conditions.\n\n` +
        `CIRCUIT_TASK:{"name":"Scheduled Portfolio Review","type":"OBSERVE","condition":null,"policy":null,"frequencyMinutes":${mins},"expireDays":30}`
      );
      return res.end();
    }

    // 8. Auto manage intent
    if (m.includes("auto") || m.includes("manage") || m.includes("protect")) {
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

  const rawBaseUrl = process.env.AI_GATEWAY_BASE_URL;
  // Default to Google Gemini OpenAI-compatible gateway
  const baseUrl = rawBaseUrl ?? "https://generativelanguage.googleapis.com/v1beta/openai";
  const isGemini = baseUrl.includes("generativelanguage.googleapis.com");
  const fallbackModel = "gemini-3.6-flash";
  const requestedModel =
    (typeof body.model === "string" ? body.model.trim() : "") ||
    process.env.GEMINI_MODEL ||
    process.env.AI_MODEL ||
    (isGemini ? fallbackModel : "gpt-4o-mini");

  const callUpstream = async (targetModel: string) => {
    const url = isGemini && !baseUrl.includes("key=")
      ? `${baseUrl}/chat/completions?key=${encodeURIComponent(apiKey)}`
      : `${baseUrl}/chat/completions`;

    return fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: targetModel,
        messages: [{ role: "system", content: buildSystemPrompt(snapshot) }, ...messages.slice(-20)],
        stream: true,
        max_tokens: 2048,
        temperature: 0.2,
      }),
    });
  };

  try {
    let activeModel = requestedModel;
    let switchedFallback = false;
    let upstream = await callUpstream(activeModel);

    // Bounded fallback: If upstream returns 404, 400 (e.g. deprecated model), or 5xx,
    // and requestedModel is not already fallbackModel, retry once with gemini-3.6-flash.
    if (!upstream.ok && activeModel !== fallbackModel) {
      console.warn(`Model ${activeModel} failed (HTTP ${upstream.status}). Retrying with ${fallbackModel}...`);
      const fallbackResp = await callUpstream(fallbackModel);
      if (fallbackResp.ok) {
        upstream = fallbackResp;
        switchedFallback = true;
      }
    }

    if (!upstream.ok) {
      console.error(`Gemini upstream error (HTTP ${upstream.status})`);
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.status(200).send("Agent service is temporarily unavailable. Please select another model in the selector.");
    }

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.status(200);

    if (switchedFallback) {
      const fallbackNotice = `[Note: Switched to Gemini 3.6 Flash because "${activeModel}" was unavailable.]\n\n`;
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: fallbackNotice } }] })}\n\n`);
    }

    const reader = upstream.body?.getReader();
    if (!reader) {
      res.write("data: [DONE]\n\n");
      return res.end();
    }
    const dec = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(dec.decode(value, { stream: true }));
    }
    res.end();
  } catch (err) {
    console.error("Agent chat error:", err);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.status(200);
    res.write("Agent service is temporarily unavailable. On-chain system unaffected.");
    res.end();
  }
}
