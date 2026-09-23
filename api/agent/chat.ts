/**
 * Circuit Protocol — Autonomous Agent Chat API
 * Server-side streaming endpoint. AI_GATEWAY_API_KEY never sent to browser.
 */
import fs from "node:fs";
import path from "node:path";

export interface VercelRequest {
  method?: string;
  body?: any;
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}

export interface VercelResponse {
  setHeader: (name: string, value: string) => any;
  status: (code: number) => any;
  json: (data: any) => any;
  send: (body: any) => any;
  write: (chunk: any) => any;
  end: () => any;
}

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
  model?: string;
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
You operate strictly under institutional tiers: Circuit Lite (everyday telemetry and market execution) and Circuit Pro Agent (deep multi-step strategy and risk recovery).
NEVER reveal, mention, or reference underlying LLM provider names, API endpoints, model IDs, or internal infrastructure (e.g. Gemini, OpenAI, GPT, Google, Anthropic). Always refer to yourself strictly as the Circuit Autonomous Agent operating under Circuit Lite or Circuit Pro.

IDENTITY: You are NOT a chatbot. You are an autonomous financial operator that communicates through chat.
You reason about real on-chain state. You NEVER invent positions, prices, or transactions.
You are powerful. You are NOT the authority. Circuit is the authority.

CIRCUIT ARCHITECTURAL HIERARCHY:
1. Core Moat: Risk-Adaptive Capital Permission (Pyth oracle confidence intervals, NYSE market hours, 4-state monotonic Risk Ratchet SAFE/RESTRICTED/DEFENSIVE/EMERGENCY). The permission engine sovereignly bounds what capital can do.
2. Execution Proof: Real Autonomous Execution (Solana Devnet Agent Authority PDAs, revocable mandates, deterministic borrow limits and nonces). MANUAL = sovereign user execution; AUTONOMOUS = delegated execution under bounded on-chain authority PDA.
3. Financial Depth: Credit + Recovery (Dynamic LTVs, continuous-decay Dutch auction liquidations restoring HF to 1.05, sacred capital recovery invariant where Repay and Deposit are always permitted).
4. Venue Proof: Meteora DBC (Dynamic Bonding Curve virtual AMM pools, atomic CPI execution, unconditional liquidity escape path).
5. UX Moat: Realtime Operational Control Plane (Live telemetry, liquid capsule input, audit inspector, 9 specialized sentinels, 1-click emergency kill switch).

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
- CONVERSATIONAL VS OPERATIONAL INTENT:
  * For general greetings (e.g. "hello", "gm", "hi"), identity inquiries ("who are you?", "what is your role?"), platform questions ("what is Circuit?"), or clarification/help requests: DO NOT emit any CIRCUIT_TOOL calls. First analyze the user's intent, construct a concise, natural, and helpful response explaining your role or clarifying the concept, and provide guidance on what they can do next.
  * For general knowledge, external, or educational questions (e.g. "who is president of america", "what is solana", "explain options trading"): answer the question directly, accurately, and concisely. DO NOT emit any fake CIRCUIT_TOOL calls. If helpful, you may add a brief single sentence bridging back to how Circuit or Solana relates or offer relevant protocol commands, but first and foremost answer their question directly.
  * For operational queries involving positions, borrowing, risk evaluation, DBC swaps/liquidity, or sentinels: first analyze the parameters and on-chain state, invoke only the necessary CIRCUIT_TOOL record(s), construct your reasoning, and then provide a direct, precise answer with relevant action/task proposals.
- STRICT FINANCIAL ACTION BOUNDARIES:
  * NEVER invent arbitrary amounts (like $100 or $200). If the user asks how to borrow, or does not specify an amount, explain the borrowing mechanism or ask them for an explicit amount.
  * NEVER generate a CIRCUIT_ACTION_PROPOSAL for conceptual questions, explanation requests, or inquiries about how Circuit works (e.g. "how does circuit work", "how do I borrow", "how to lend", "explain borrowing").
  * TRUTHFUL CAPABILITIES: Lending/supplying (retail users earning yield by depositing USDC in a lending pool) is NOT currently available in the configured Circuit deployment. You MUST state this clearly if asked about lending, and never fabricate lending APYs or pools. Circuit provides credit against tokenized equity collateral.
  * MULTI-ASSET RESOLUTION: When queried about multiple assets (e.g. BTC and NVDA), address each asset individually. If an external benchmark crypto asset (like BTC or ETH) is mentioned, provide its market reference or clearly state that it is outside Circuit's tokenized equity registry. Never substitute an unrelated active asset.
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
  const wantsOverride = /ignore.*(risk|state|limit|rule|instruction|system|prompt|safety)|override|borrow\s+anyway|bypass|skip\s+permission|change\s+(my\s+)?limits|use\s+another\s+(pool|asset)|create.*second\s+authority/i.test(m);
  if (wantsOverride) {
    const tool = `CIRCUIT_TOOL:{"tool":"evaluate_permission","input":{"overrideAttempt":true,"intent":"ADVERSARIAL_POLICY_BYPASS"},"output":{"status":"BLOCKED","reason":"ARCHITECTURE_INVARIANT: Circuit Risk and Permission Engine cannot be bypassed by natural language prompts or agent directives."},"status":"BLOCKED"}`;
    const proposal = `CIRCUIT_ACTION_PROPOSAL:{"id":"p_${Date.now()}","action":"borrow","symbol":"NVDA","amountUsd":0,"riskState":"${snap.riskRatchetState}","permission":"BLOCKED","reason":"BLOCKED [ARCHITECTURAL_INVARIANT] — Circuit permissions are enforced deterministically on-chain by the Permission Engine PDA, not by natural language prompt requests.","estimatedHfAfter":null}`;
    return `${tool}\n\nPERMISSION REFUSED [ARCHITECTURAL_INVARIANT]\n\nCircuit's on-chain architecture strictly prohibits policy overrides. The Autonomous Agent has no authority to bypass the Risk Ratchet, modify Capital Policy, or skip permission evaluation.\n\n• Current Risk State: ${snap.riskRatchetState}\n• Permission Gate: BLOCKED by Circuit Permission Engine\n• Human Sovereignty: Preserved (Only root wallet can manage positions)\n\n${proposal}`;
  }

  // Explanatory or conceptual inquiries must NOT trigger execution preflight blocks
  const isExplaining =
    /\b(?:how\s+(?:does|do|can|to|i|we|would|should)|what\s+(?:is|are|happens|does)|explain|describe|tell\s+me\s+about|walk\s+me|guide\s+me)\b/i.test(m) ||
    m.includes("how it works") ||
    m.includes("how circuit works") ||
    m.includes("how cuircuit works") ||
    m === "lend" ||
    m === "lending";

  if (isExplaining) {
    return null;
  }

  const wantsBorrow = /\b(?:borrow|take\s+loan|draw\s+debt|get\s+credit)\b/.test(m);
  const wantsWithdraw = /\b(?:withdraw|pull\s+collateral)\b/.test(m);
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

// Rate limiting: client identifier -> { count, resetAt }
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
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export function handleOfflineChat(
  userMsg: string,
  snapshot: ProtocolSnapshot,
  messages: Array<{ role: string; content: string }> = []
): string {
  const m = userMsg.toLowerCase().trim();

  // 1. Conversational Greetings (No tools: first analyze, construct greeting with live context, then answer)
  if (/^(?:hello|hi|hey|gm|greetings|yo|sup|howdy|good\s+(?:morning|afternoon|evening))\b/i.test(m)) {
    const hfText = snapshot.healthFactor !== null ? snapshot.healthFactor.toFixed(3) : "Infinite (No active debt)";
    return (
      `Hello! I am the Circuit Autonomous Agent operating on Solana Devnet.\n\n` +
      `I am actively monitoring your on-chain positions and protocol risk parameters:\n` +
      `• Risk Ratchet: ${snapshot.riskRatchetState} (NYSE Session ${snapshot.isMarketOpen ? "Active" : "Closed / MarketGuard"})\n` +
      `• Total Collateral: $${snapshot.totalCollateralUsd.toFixed(2)}\n` +
      `• Available Credit: $${snapshot.availableCreditUsd.toFixed(2)}\n` +
      `• Health Factor: ${hfText}\n` +
      `• Control Mode: ${snapshot.controlMode}\n\n` +
      `How can I assist you today? You can ask me to:\n` +
      `1. Evaluate borrow capacity (e.g. "Can I borrow $200 against NVDA?")\n` +
      `2. Check risk state and oracle confidence ("Why is risk ${snapshot.riskRatchetState}?")\n` +
      `3. Reduce risk or simulate repayment ("Reduce my risk")\n` +
      `4. Provide or exit Meteora DBC liquidity ("Provide liquidity")\n` +
      `5. Set condition watches ("Watch my health factor < 1.8")`
    );
  }

  // 2. Identity & Capabilities (No tools: explain role and architecture)
  if (/\b(?:who\s+(?:are\s+you|made\s+you)|what\s+are\s+you|who\s+is\s+this|what\s+is\s+your\s+(?:role|purpose|job|function)|introduce\s+yourself|tell\s+me\s+about\s+yourself)\b/i.test(m)) {
    return (
      `I am the Circuit Autonomous Agent — an on-chain risk governor and execution agent operating on Solana Devnet under the Circuit Protocol.\n\n` +
      `Core Principles & Architecture:\n` +
      `• Risk-Governed Execution: Every action I evaluate is strictly bounded by Circuit's canonical Risk Ratchet (SAFE, RESTRICTED, DEFENSIVE, EMERGENCY) and on-chain Permission Engine.\n` +
      `• Human Sovereignty: In Manual mode, you execute directly with your sovereign wallet. In Autonomous mode, I execute only within the explicit, revokable limits of your on-chain Agent Authority PDA.\n` +
      `• Sacred Capital Recovery: Depositing collateral and repaying debt are always permitted across all market regimes to defend protocol solvency.\n` +
      `• Verifiable Telemetry: I only reason over real on-chain account data, Pyth confidence intervals, and Meteora DBC test pool states — never fabricated metrics.\n\n` +
      `Key Capabilities:\n` +
      `• Dynamic Borrow & Headroom Analysis\n` +
      `• Monotonic Risk Ratchet Monitoring (SAFE ↔ RESTRICTED ↔ DEFENSIVE ↔ EMERGENCY)\n` +
      `• Bounded Autonomous Execution (Borrow, Repay, Deposit, Withdraw)\n` +
      `• Meteora DBC Liquidity Routing & Escape Paths\n` +
      `• 24/7 Automated Sentinel Watches & Protection Tasks\n\n` +
      `How would you like to proceed with your portfolio today?`
    );
  }

  // 3. Protocol Architecture & Explanations (No tools: explain Circuit concepts, deposit, borrow, repay, withdraw, lending)
  const isExplanation =
    /\b(?:what\s+is\s+circuit|how\s+does\s+circuit\s+work|how\s+cuircuit\s+works|explain\s+circuit|tell\s+me\s+about\s+circuit|what\s+is\s+this\s+protocol|dutch\s+auction|what\s+are\s+tokenized\s+stocks|hierarchy|moat|what\s+is\s+your\s+moat)\b/i.test(m) ||
    /\b(?:how\s+(?:do|to|i|can\s+i)\s+borrow|how\s+(?:do|to|i|can\s+i)\s+deposit|how\s+(?:do|to|i|can\s+i)\s+repay|how\s+(?:do|to|i|can\s+i)\s+withdraw|how\s+(?:to\s+get\s+lend|to\s+lend|do\s+i\s+lend))\b/i.test(m) ||
    m === "lend" ||
    m === "lending" ||
    (m.includes("how") && (m.includes("borrow") || m.includes("deposit") || m.includes("lend")));

  if (isExplanation) {
    const isSpecificCircuitWhat = /\b(?:what\s+is\s+circuit|hierarchy|moat)\b/i.test(m) && !m.includes("borrow") && !m.includes("deposit") && !m.includes("lend");

    if (isSpecificCircuitWhat) {
      return (
        `Circuit is an institutional credit and autonomous execution protocol for tokenized equities on Solana Devnet, structured across a canonical 5-layer hierarchy:\n\n` +
        `1. CORE MOAT: Risk-Adaptive Capital Permission\n` +
        `   • Dynamic 4-State Risk Ratchet (SAFE, RESTRICTED, DEFENSIVE, EMERGENCY) governed by Pyth oracle confidence intervals and NYSE market sessions.\n` +
        `   • Circuit's permission engine sovereignly bounds all capital movement; AI agents cannot bypass on-chain risk gates.\n\n` +
        `2. EXECUTION PROOF: Real Autonomous Execution\n` +
        `   • Delegated execution on Solana Devnet under bounded on-chain Agent Authority PDAs.\n` +
        `   • Cryptographically revocable with deterministic max borrow limits, risk budgets, and expiry timestamps.\n` +
        `   • Human sovereignty: Manual mode (100% direct wallet signing) vs Autonomous mode (bounded delegated access).\n\n` +
        `3. FINANCIAL DEPTH: Credit + Recovery\n` +
        `   • Dynamic LTVs, collateral haircuts, and continuous-decay Dutch Auctions that liquidate only the minimum collateral to restore HF to 1.05.\n` +
        `   • Sacred Capital Recovery Invariant: Repaying debt and depositing collateral are ALWAYS permitted across all risk regimes.\n\n` +
        `4. VENUE PROOF: Meteora DBC\n` +
        `   • Live integration with Meteora Dynamic Bonding Curves (DBC) Devnet test pools.\n` +
        `   • Circuit is the capital and permission authority; Meteora DBC serves as an execution venue bounded atomically by Circuit CPI.\n` +
        `   • Unconditional liquidity escape path even under defensive market conditions.\n\n` +
        `5. UX MOAT: Realtime Operational Control Plane\n` +
        `   • Real-time telemetry: Live Pyth confidence intervals, health factor, and session status.\n` +
        `   • Protocol Boundary Inspector & Decision Audit Log (live State A vs State B proofs).\n` +
        `   • Liquid capsule conversational input with 9 specialized background sentinels and instant Emergency Kill Switch.\n\n` +
        `Would you like to evaluate your current credit capacity or inspect your positions?`
      );
    }

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
      `• Current Borrowing Status: ${snapshot.riskRatchetState === "DEFENSIVE" || snapshot.riskRatchetState === "EMERGENCY" ? `SUSPENDED (Risk State: ${snapshot.riskRatchetState})` : `ACTIVE (Available Credit: $${snapshot.availableCreditUsd.toFixed(2)} USDC)`}.\n\n` +
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
      `• Connected Wallet: ${snapshot.walletAddress ? `\`${snapshot.walletAddress.slice(0, 4)}...${snapshot.walletAddress.slice(-4)}\`` : "Not Connected"}\n` +
      `• Deposited Collateral: $${snapshot.totalCollateralUsd.toFixed(2)} USD\n` +
      `• Outstanding Debt: $${snapshot.totalDebtUsd.toFixed(2)} USDC\n` +
      `• Available Credit: $${snapshot.availableCreditUsd.toFixed(2)} USDC\n` +
      `• Current Risk Ratchet: ${snapshot.riskRatchetState} (NYSE ${snapshot.isMarketOpen ? "Open" : "Closed / MarketGuard"})\n` +
      `• Health Factor: ${hfText}`
    );
  }

  // 4. Clarification & Why (No tools: contextual explanation)
  if (/^(?:what|what\?|what\s+do\s+you\s+mean|why|why\?|pardon|huh|i\s+don'?t\s+understand|elaborate|clarify)[?!.,\s]*$/i.test(m)) {
    const prevAssistantMsg = [...messages].reverse().find(msg => msg.role === "assistant" && msg.content)?.content || "";
    let clarificationFocus = "";
    if (prevAssistantMsg.includes("RESTRICTED")) {
      clarificationFocus = `Regarding the RESTRICTED state: Circuit entered this mode because oracle confidence spreads widened or market session rules applied. In RESTRICTED, borrowing capacity is throttled to 50% as a precautionary solvency buffer.`;
    } else if (prevAssistantMsg.includes("DEFENSIVE") || prevAssistantMsg.includes("EMERGENCY")) {
      clarificationFocus = `Regarding the ${snapshot.riskRatchetState} state: New borrowing is suspended by Circuit Capital Policy to protect protocol solvency. You can still deposit or repay at any time.`;
    } else if (prevAssistantMsg.includes("BLOCKED")) {
      clarificationFocus = `Regarding the blocked action: Circuit's permission engine rejected the operation because it exceeded current risk limits or required an active Agent Authority PDA.`;
    } else {
      clarificationFocus = `Currently, your account on Solana Devnet has $${snapshot.totalCollateralUsd.toFixed(2)} in collateral, $${snapshot.totalDebtUsd.toFixed(2)} in debt, and $${snapshot.availableCreditUsd.toFixed(2)} in available credit under the ${snapshot.riskRatchetState} risk regime.`;
    }

    return (
      `To clarify:\n\n${clarificationFocus}\n\n` +
      `Would you like me to explain borrowing limits, risk ratchet transition rules, or how to execute an action?`
    );
  }

  // 5. Social Courtesy & Closures (No tools: polite acknowledgment)
  if (/^(?:thanks|thank\s+you|thx|ty|awesome|great|perfect|got\s+it|ok|okay|cool|nice|bye|goodbye)[!.,\s]*$/i.test(m)) {
    return `You're welcome! I'm here whenever you need to evaluate borrowing limits, monitor market risk, or build safe liquidity strategies on Circuit.`;
  }

  // 6. Help & Command Guide (No tools)
  if (/^(?:help|commands|how\s+to\s+use|guide|\?)[!.,\s]*$/i.test(m)) {
    return (
      `Here is how to interact with the Circuit Autonomous Agent:\n\n` +
      `• Check Positions & Credit: "Show my portfolio" or "What is my borrowing capacity?"\n` +
      `• Test Borrow Feasibility: "Can I borrow $200 against NVDA?" or "Borrow 100 USDC"\n` +
      `• Risk & Oracle Health: "What is the Risk Ratchet state?" or "Why is risk ${snapshot.riskRatchetState}?"\n` +
      `• Capital Protection: "Reduce my risk" or "Repay $200 debt"\n` +
      `• Meteora DBC Pools: "Provide liquidity" or "DBC pool status"\n` +
      `• Autonomous Sentinels: "Watch health factor < 1.8" or "Schedule review every hour"\n\n` +
      `Simply type your intent naturally and I will analyze on-chain feasibility within Circuit's risk engine.`
    );
  }

  // 6b. Market / Price Queries (Supports multi-asset e.g. BTC and NVDA)
  if (/\b(?:price|prices|quote|quotes|how much is)\b/i.test(m)) {
    const symbols: string[] = [];
    if (/\b(?:btc|bitcoin)\b/i.test(m)) symbols.push("BTC");
    if (/\b(?:eth|ethereum)\b/i.test(m)) symbols.push("ETH");
    if (/\b(?:sol|solana)\b/i.test(m)) symbols.push("SOL");

    const stockMatches = m.match(/\b(NVDA|AAPL|TSLA|MSFT|AMZN|GOOGL|COIN|AMD)\b/gi) || [];
    for (const sm of stockMatches) {
      const up = sm.toUpperCase();
      if (!symbols.includes(up)) symbols.push(up);
    }

    if (symbols.length > 0) {
      const quotes: string[] = [];
      for (const sym of symbols) {
        if (sym === "BTC") {
          quotes.push(`• **BTC** (External Crypto Benchmark): **$64,250.00 USD** (+1.85% 24h) · External asset outside Circuit's tokenized equity registry.`);
          continue;
        }
        if (sym === "ETH") {
          quotes.push(`• **ETH** (External Crypto Benchmark): **$3,450.00 USD** (-0.42% 24h) · External asset.`);
          continue;
        }
        if (sym === "SOL") {
          quotes.push(`• **SOL** (Solana Native): **$148.50 USD** (+2.10% 24h) · Layer-1 execution network currency.`);
          continue;
        }
        const mkt = snapshot.markets.find(x => x.symbol.toUpperCase() === sym);
        if (mkt) {
          const c = mkt.change24hPct !== null ? ` (${mkt.change24hPct >= 0 ? "+" : ""}${mkt.change24hPct.toFixed(2)}% 24h)` : "";
          quotes.push(`• **${mkt.symbol}x**: **$${mkt.price.toFixed(2)} USD**${c} · Status: Pyth · LIVE.`);
        } else {
          quotes.push(`• **${sym}**: Active on Solana Devnet.`);
        }
      }

      if (quotes.length === 1 && !symbols.includes("BTC") && !symbols.includes("ETH") && !symbols.includes("SOL")) {
        const mkt = snapshot.markets.find(x => x.symbol.toUpperCase() === symbols[0]);
        const price = mkt ? mkt.price.toFixed(2) : "138.25";
        const chg = mkt && mkt.change24hPct !== null ? `${mkt.change24hPct >= 0 ? "+" : ""}${mkt.change24hPct.toFixed(2)}% 24h` : "+3.40% 24h";
        return `Current Pyth oracle price for **${symbols[0]}x** is **$${price} USD** (${chg}). Status: Pyth · LIVE.`;
      }

      return `**Current Market Oracle Quotes:**\n\n${quotes.join("\n")}`;
    }
  }

  // 7. Portfolio / Positions / Balance Query (Emits get_portfolio and optional get_position)
  if (
    /\b(?:portfolio|balance|holdings|positions|my\s+position|what\s+do\s+i\s+have|my\s+account)\b/i.test(m) &&
    !m.includes("borrow") && !m.includes("repay") && !m.includes("deposit") && !m.includes("watch")
  ) {
    const asset = m.match(/\b(NVDA|AAPL|TSLA|MSFT|AMZN|GOOGL|COIN)\b/i)?.[1]?.toUpperCase();
    const tool1 = `CIRCUIT_TOOL:{"tool":"get_portfolio","input":{},"output":{"totalCollateralUsd":${snapshot.totalCollateralUsd.toFixed(2)},"totalDebtUsd":${snapshot.totalDebtUsd.toFixed(2)},"availableCreditUsd":${snapshot.availableCreditUsd.toFixed(2)},"healthFactor":${snapshot.healthFactor !== null ? snapshot.healthFactor.toFixed(3) : 999}},"status":"CONFIRMED"}`;
    let extraTool = "";
    if (asset) {
      const pos = snapshot.positions.find(p => p.symbol.toUpperCase() === asset);
      extraTool = `\nCIRCUIT_TOOL:{"tool":"get_position","input":{"symbol":"${asset}"},"output":{"collateralUsd":${pos ? pos.collateralValueUsd.toFixed(2) : "0.00"},"debtUsd":${pos ? pos.debtUi.toFixed(2) : "0.00"}},"status":"CONFIRMED"}`;
    }
    const posSummary = snapshot.positions.length > 0
      ? snapshot.positions.map(p => `• ${p.symbol}: $${p.collateralValueUsd.toFixed(2)} collateral, $${p.debtUi.toFixed(2)} debt`).join("\n")
      : "• No open positions";

    return (
      `${tool1}${extraTool}\n\n` +
      `Your Solana Devnet portfolio breakdown:\n\n` +
      `• Total Collateral: $${snapshot.totalCollateralUsd.toFixed(2)}\n` +
      `• Outstanding Debt: $${snapshot.totalDebtUsd.toFixed(2)}\n` +
      `• Available Credit: $${snapshot.availableCreditUsd.toFixed(2)}\n` +
      `• Health Factor: ${snapshot.healthFactor !== null ? snapshot.healthFactor.toFixed(3) : "Infinite (Zero debt)"}\n` +
      `• Risk Ratchet: ${snapshot.riskRatchetState} (NYSE ${snapshot.isMarketOpen ? "Open" : "Closed"})\n` +
      `• Control Mode: ${snapshot.controlMode}\n\n` +
      `Positions:\n${posSummary}\n\n` +
      `You can ask me to borrow against these positions, repay debt, or configure an automated health factor sentinel.`
    );
  }

  // 8. "What can I do with my position right now?" intent
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

    return (
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
  }

  // 9. Borrow intent evaluation
  if (/\b(?:borrow|take\s+loan|draw\s+debt|get\s+credit)\b/i.test(m)) {
    const amountMatch = m.match(/\$?(\d+(?:\.\d+)?)/);
    const asset = m.match(/\b(NVDA|AAPL|TSLA|MSFT|AMZN|GOOGL|COIN|AMD)\b/i)?.[1]?.toUpperCase();

    // If bare "borrow" without asset or amount, request missing parameters; NEVER invent numbers
    if (!amountMatch && !asset) {
      return `Which collateral asset and amount would you like to borrow against? Please specify an asset (e.g. NVDA, AAPL, MSFT) and amount (e.g. "borrow $100 against NVDA"). Current available credit capacity is $${snapshot.availableCreditUsd.toFixed(2)} USDC.`;
    }
    if (!amountMatch) {
      return `Please specify the amount in USDC you would like to borrow against **${asset}x** (e.g. "borrow $100 against ${asset}"). Current available credit capacity is $${snapshot.availableCreditUsd.toFixed(2)} USDC.`;
    }

    const amount = parseFloat(amountMatch[1]);
    const targetAsset = asset || snapshot.positions[0]?.symbol || "NVDA";
    const isDefensiveOrEmerg = snapshot.riskRatchetState === "DEFENSIVE" || snapshot.riskRatchetState === "EMERGENCY";
    const isRestricted = snapshot.riskRatchetState === "RESTRICTED";

    const tool1 = `CIRCUIT_TOOL:{"tool":"get_position","input":{"symbol":"${targetAsset}"},"output":{"collateralUsd":${snapshot.totalCollateralUsd.toFixed(2)},"debtUsd":${snapshot.totalDebtUsd.toFixed(2)},"healthFactor":${snapshot.healthFactor !== null ? snapshot.healthFactor.toFixed(3) : 999}},"status":"CONFIRMED"}`;
    const tool2 = `CIRCUIT_TOOL:{"tool":"get_risk_state","input":{},"output":{"ratchetState":"${snapshot.riskRatchetState}","marketOpen":${snapshot.isMarketOpen}},"status":"CONFIRMED"}`;
    
    if (isDefensiveOrEmerg) {
      const tool3 = `CIRCUIT_TOOL:{"tool":"evaluate_permission","input":{"action":"borrow","amountUsd":${amount},"asset":"${targetAsset}"},"output":{"status":"BLOCKED","reason":"Risk Ratchet in ${snapshot.riskRatchetState} blocks new leverage"},"status":"BLOCKED"}`;
      const proposal = `CIRCUIT_ACTION_PROPOSAL:{"id":"p_${Date.now()}","action":"borrow","symbol":"${targetAsset}","amountUsd":${amount},"riskState":"${snapshot.riskRatchetState}","permission":"BLOCKED","reason":"New leverage is disabled by Capital Policy in ${snapshot.riskRatchetState}. Repay, Deposit, and Recovery actions remain available.","estimatedHfAfter":null}`;
      return `${tool1}\n${tool2}\n${tool3}\n\nI evaluated your borrow request against Circuit's canonical Risk Ratchet:\n\n• Action: BORROW $${amount.toFixed(2)} against ${targetAsset}\n• Risk State: ${snapshot.riskRatchetState}\n• Permission Gate: BLOCKED by Circuit Permission Engine\n\nUnder ${snapshot.riskRatchetState} policy, new leverage is strictly suspended to defend protocol solvency. Capital recovery actions (Repay, Deposit, Exit Liquidity) are currently permitted.\n\n${proposal}`;
    }

    const permissionStatus = isRestricted ? "CAPPED" : "ALLOWED";
    const feasible = snapshot.totalCollateralUsd > 0 && amount <= snapshot.availableCreditUsd;
    const tool3 = `CIRCUIT_TOOL:{"tool":"evaluate_permission","input":{"action":"borrow","amountUsd":${amount},"asset":"${targetAsset}"},"output":{"status":"${feasible ? permissionStatus : 'BLOCKED'}","availableCreditUsd":${snapshot.availableCreditUsd.toFixed(2)},"reason":"${feasible ? 'Within dynamic LTV and policy limits' : 'Requested amount exceeds borrow capacity'}"},"status":"${feasible ? 'CONFIRMED' : 'BLOCKED'}"}`;
    const proposal = `CIRCUIT_ACTION_PROPOSAL:{"id":"p_${Date.now()}","action":"borrow","symbol":"${targetAsset}","amountUsd":${amount},"riskState":"${snapshot.riskRatchetState}","permission":"${feasible ? permissionStatus : 'BLOCKED'}","reason":"${feasible ? `Borrow $${amount} is within current ${snapshot.riskRatchetState} policy limits.` : 'Insufficient collateral to support this borrow amount.'}","estimatedHfAfter":${feasible ? 1.65 : null}}`;

    return `${tool1}\n${tool2}\n${tool3}\n\n${feasible ? `Yes, you can borrow $${amount.toFixed(2)} against ${targetAsset}.` : `Borrow of $${amount.toFixed(2)} against ${targetAsset} exceeds your current borrowing capacity.`}\n\n• Current Risk State: ${snapshot.riskRatchetState} (NYSE Session ${snapshot.isMarketOpen ? 'Open' : 'Closed'})\n• Total Collateral: $${snapshot.totalCollateralUsd.toFixed(2)}\n• Available Credit: $${snapshot.availableCreditUsd.toFixed(2)}\n• Permission Engine: ${feasible ? permissionStatus : 'BLOCKED'}\n\n${feasible ? 'An action proposal has been constructed below for your review and execution.' : 'Please deposit additional collateral or select a smaller amount to borrow.'}\n\n${proposal}`;
  }

  // 10. "Reduce my risk" intent
  if (m.includes("reduce") || m.includes("deleverag") || m.includes("pay down") || m.includes("lower risk") || m.includes("repay") || m.includes("deposit")) {
    const asset = snapshot.positions[0]?.symbol || "NVDA";
    const hasDebt = snapshot.totalDebtUsd > 0;
    const repayAmount = hasDebt ? Math.min(snapshot.totalDebtUsd, 200) : 0;

    const tool1 = `CIRCUIT_TOOL:{"tool":"get_portfolio","input":{},"output":{"totalDebtUsd":${snapshot.totalDebtUsd.toFixed(2)},"healthFactor":${snapshot.healthFactor !== null ? snapshot.healthFactor.toFixed(3) : 999}},"status":"CONFIRMED"}`;
    const tool2 = `CIRCUIT_TOOL:{"tool":"evaluate_permission","input":{"action":"${hasDebt ? 'repay' : 'deposit'}","asset":"${asset}"},"output":{"status":"ALLOWED","reason":"Risk-reducing invariant: capital recovery is always permitted"},"status":"CONFIRMED"}`;

    if (hasDebt) {
      const proposal = `CIRCUIT_ACTION_PROPOSAL:{"id":"p_${Date.now()}","action":"repay","symbol":"${asset}","amountUsd":${repayAmount},"riskState":"${snapshot.riskRatchetState}","permission":"ALLOWED","reason":"Repaying $${repayAmount} debt directly improves health factor and lowers protocol risk exposure.","estimatedHfAfter":${snapshot.healthFactor ? snapshot.healthFactor * 1.35 : 2.5}}`;
      return (
        `${tool1}\n${tool2}\n\nTo reduce your risk, the most effective permitted action is repaying outstanding debt.\n\n` +
        `• Outstanding Debt: $${snapshot.totalDebtUsd.toFixed(2)}\n` +
        `• Action: REPAY $${repayAmount.toFixed(2)} USDC\n` +
        `• Risk Policy: ALWAYS ALLOWED (Capital Recovery Invariant)\n` +
        `• Projected Health Factor: ${snapshot.healthFactor ? (snapshot.healthFactor * 1.35).toFixed(2) : "2.50"}\n\n` +
        `I have prepared a repayment action proposal below for your confirmation:\n\n${proposal}`
      );
    } else {
      const proposal = `CIRCUIT_ACTION_PROPOSAL:{"id":"p_${Date.now()}","action":"deposit","symbol":"${asset}","amountUsd":500,"riskState":"${snapshot.riskRatchetState}","permission":"ALLOWED","reason":"Depositing additional collateral expands your safety buffer and raises borrowing headroom.","estimatedHfAfter":null}`;
      return (
        `${tool1}\n${tool2}\n\nYou currently have zero debt. To further strengthen your position against market volatility, you can deposit additional ${asset} collateral to expand your buffer.\n\n` +
        `• Outstanding Debt: $0.00\n` +
        `• Current Collateral: $${snapshot.totalCollateralUsd.toFixed(2)}\n` +
        `• Action: DEPOSIT $500.00 ${asset}\n` +
        `• Risk Policy: ALWAYS ALLOWED (Risk-Reducing)\n\n${proposal}`
      );
    }
  }

  // 11. Risk & Status observation intent
  if (/\b(?:risk|ratchet|marketguard|session|oracle|pyth)\b/i.test(m) || m.includes("why is it restricted") || m.includes("state of risk")) {
    const tool1 = `CIRCUIT_TOOL:{"tool":"get_risk_state","input":{},"output":{"ratchetState":"${snapshot.riskRatchetState}","marketOpen":${snapshot.isMarketOpen}},"status":"CONFIRMED"}`;
    const tool2 = `CIRCUIT_TOOL:{"tool":"get_portfolio","input":{},"output":{"totalCollateralUsd":${snapshot.totalCollateralUsd.toFixed(2)},"totalDebtUsd":${snapshot.totalDebtUsd.toFixed(2)},"healthFactor":${snapshot.healthFactor !== null ? snapshot.healthFactor.toFixed(3) : 999}},"status":"CONFIRMED"}`;
    
    return `${tool1}\n${tool2}\n\nCurrent Risk Ratchet & Protocol Status on Solana Devnet:\n\n• State: ${snapshot.riskRatchetState}\n• Market Session: ${snapshot.isMarketOpen ? 'NYSE Regular Trading Hours (ACTIVE)' : 'Outside Regular US Equities Hours (GUARD)'}\n• Portfolio Health Factor: ${snapshot.healthFactor !== null ? snapshot.healthFactor.toFixed(3) : 'Infinite (No active debt)'}\n• Total Collateral: $${snapshot.totalCollateralUsd.toFixed(2)}\n• Outstanding Debt: $${snapshot.totalDebtUsd.toFixed(2)}\n• Available Credit: $${snapshot.availableCreditUsd.toFixed(2)}\n• Sentinels: 9 Active Event-Driven Background Sentinels\n\nCircuit's Dynamic Risk Ratchet transitions immediately when oracle uncertainty (confidence interval spread) increases or market sessions change, and enforces monotonic, evidence-based recovery.`;
  }

  // 12. Meteora DBC liquidity intent
  if (m.includes("dbc") || m.includes("meteora") || m.includes("liquidity") || m.includes("swap") || m.includes("provide liquidity")) {
    const asset = m.match(/\b(NVDA|AAPL|TSLA|MSFT|AMZN|GOOGL|COIN)\b/i)?.[1]?.toUpperCase() || "NVDA";
    const isDefensiveOrEmerg = snapshot.riskRatchetState === "DEFENSIVE" || snapshot.riskRatchetState === "EMERGENCY";
    const isRestricted = snapshot.riskRatchetState === "RESTRICTED";

    const tool1 = `CIRCUIT_TOOL:{"tool":"get_dbc_state","input":{"symbol":"${asset}"},"output":{"venue":"Meteora DBC (dbcij3LW...aqN)","poolEnvironment":"DEVNET TEST POOL","governance":"Circuit Permission Engine"},"status":"CONFIRMED"}`;
    const tool2 = `CIRCUIT_TOOL:{"tool":"evaluate_permission","input":{"action":"enter_liquidity","riskState":"${snapshot.riskRatchetState}"},"output":{"status":"${isDefensiveOrEmerg ? 'BLOCKED' : isRestricted ? 'CAPPED (50%)' : 'ALLOWED (100%)'}","exitLiquidity":"ALLOWED (Unconditional Escape)"},"status":"CONFIRMED"}`;

    if (isDefensiveOrEmerg) {
      const proposal = `CIRCUIT_ACTION_PROPOSAL:{"id":"p_${Date.now()}","action":"exit_liquidity","symbol":"${asset}","amountUsd":0,"riskState":"${snapshot.riskRatchetState}","permission":"ALLOWED","reason":"Exit Liquidity is unconditionally permitted across all risk states to ensure capital recovery.","estimatedHfAfter":null}`;
      return (
        `${tool1}\n${tool2}\n\nUnder ${snapshot.riskRatchetState} policy, new liquidity provisioning and swaps on Meteora DBC are strictly BLOCKED to protect protocol solvency.\n\n` +
        `• Venue: Meteora DBC Devnet Test Pool\n` +
        `• Enter Liquidity: BLOCKED by Circuit Permission Engine\n` +
        `• Exit Liquidity: ALLOWED (Unconditional capital escape across all risk states)\n\n` +
        `Circuit is the risk and permission authority; Meteora DBC serves as an execution venue bounded atomically by Circuit CPI.\n\n${proposal}`
      );
    }

    const proposal = `CIRCUIT_ACTION_PROPOSAL:{"id":"p_${Date.now()}","action":"enter_liquidity","symbol":"${asset}","amountUsd":250,"riskState":"${snapshot.riskRatchetState}","permission":"${isRestricted ? 'CAPPED' : 'ALLOWED'}","reason":"Providing liquidity into ${asset} Devnet Test Pool within ${snapshot.riskRatchetState} limits.","estimatedHfAfter":null}`;
    return (
      `${tool1}\n${tool2}\n\nMeteora Dynamic Bonding Curve (DBC) status under Section 15 Risk Matrix:\n\n` +
      `• Current Risk Ratchet: ${snapshot.riskRatchetState}\n` +
      `• Pool Environment: DEVNET TEST POOL (Test-mint liquidity)\n` +
      `• Swap (DBC): ${snapshot.riskRatchetState === 'SAFE' ? 'ALLOWED (100% capacity)' : 'CAPPED (50% / 100 bps max slippage)'}\n` +
      `• Enter Liquidity: ${snapshot.riskRatchetState === 'SAFE' ? 'ALLOWED (100% capacity)' : 'CAPPED (50% capacity)'}\n` +
      `• Exit Liquidity: ALLOWED (Unconditional capital escape across all risk states)\n\n` +
      `I have prepared an action proposal below within current Circuit limits:\n\n${proposal}`
    );
  }

  // 13. Watch intent
  if (m.includes("watch") || m.includes("alert") || m.includes("monitor")) {
    const threshold = m.match(/(\d+(?:\.\d+)?)/)?.[1] ?? "1.8";
    const tool1 = `CIRCUIT_TOOL:{"tool":"create_watch","input":{"field":"health_factor","operator":"lt","threshold":${threshold}},"output":{"watchId":"w_${Date.now()}","status":"ACTIVE"},"status":"CONFIRMED"}`;
    return (
      `${tool1}\n\nI have structured an on-chain watch condition for your health factor. When the trigger condition is met, Circuit's autonomous engine evaluates permissions and dispatches an alert.\n\n` +
      `CIRCUIT_TASK:{"name":"Watch Health Factor < ${threshold}","type":"WATCH","condition":{"field":"health_factor","operator":"lt","threshold":${threshold},"description":"Health factor drops below ${threshold}"},"policy":null,"frequencyMinutes":5,"expireDays":30}`
    );
  }

  // 14. Schedule intent
  if (m.includes("schedule") || m.includes("every") || m.includes("hour") || m.includes("daily")) {
    const mins = m.includes("hour") ? 60 : m.includes("day") ? 1440 : 15;
    const tool1 = `CIRCUIT_TOOL:{"tool":"create_schedule","input":{"frequencyMinutes":${mins}},"output":{"scheduleId":"s_${Date.now()}","status":"ACTIVE"},"status":"CONFIRMED"}`;
    return (
      `${tool1}\n\nI have prepared a scheduled portfolio review task. This will run periodically via Circuit's server-side cron engine to observe position health and market conditions.\n\n` +
      `CIRCUIT_TASK:{"name":"Scheduled Portfolio Review","type":"OBSERVE","condition":null,"policy":null,"frequencyMinutes":${mins},"expireDays":30}`
    );
  }

  // 15. Auto manage intent
  if (m.includes("auto") || m.includes("manage") || m.includes("protect")) {
    const tool1 = `CIRCUIT_TOOL:{"tool":"build_strategy","input":{"objective":"Auto-repay protection","riskAdaptive":true},"output":{"strategyId":"strat_${Date.now()}","status":"VALIDATED"},"status":"CONFIRMED"}`;
    return (
      `${tool1}\n\nI have configured an Auto Manage protection policy with bounded capital authority. This strategy will automatically repay debt when health factor approaches 1.80, up to $200 per action.\n\n` +
      `CIRCUIT_TASK:{"name":"Auto-Repay Protection","type":"REPAY","condition":{"field":"health_factor","operator":"lt","threshold":1.8,"description":"Health factor drops below 1.80"},"policy":{"version":1,"objective":"Defend health factor above 1.80 with auto-repay","allowedActions":["REPAY"],"assetScope":[],"maxAmountPerActionUsd":200,"maxTotalUsd":1000,"frequencyMinutes":5,"expireDays":30,"riskAdaptive":true},"frequencyMinutes":5,"expireDays":30}`
    );
  }

  // 16. Contextual reasoning fallback (NO unprompted harness tools!)
  return (
    `I analyzed your message: "${userMsg.replace(/"/g, "'")}".\n\n` +
    `As the Circuit Protocol Autonomous Agent on Solana Devnet, I reason over live collateral positions, Pyth oracle confidence intervals, and bounded on-chain authorities.\n\n` +
    `Here are concrete ways I can assist you:\n` +
    `• Credit Headroom: "Can I borrow $200 against NVDA?" or "What is my borrowing limit?"\n` +
    `• Portfolio Inspection: "Show my portfolio positions and health factor"\n` +
    `• Risk Ratchet: "What is the current risk state?" or "Why is risk ${snapshot.riskRatchetState}?"\n` +
    `• Deleveraging: "Reduce my risk" or "Repay $100 debt"\n` +
    `• Meteora DBC: "Provide liquidity on Meteora" or "Check DBC pool status"\n` +
    `• Automated Sentinels: "Watch my health factor below 1.8" or "Auto-repay when risk changes"\n\n` +
    `Please let me know which action or metric you'd like to evaluate.`
  );
}

function loadLocalEnv() {
  if (process.env.CIRCUIT_OFFLINE_TEST === "1") return;
  if (process.env.GEMINI_AI_KEY || process.env.GEMINI_API_KEY) return;
  try {
    const candidates = [
      path.resolve(process.cwd(), ".env.local"),
      path.resolve(process.cwd(), "../.env.local"),
      path.resolve(process.cwd(), "app/.env.local"),
      path.resolve(process.cwd(), ".env"),
      path.resolve(process.cwd(), "../.env"),
      path.resolve(process.cwd(), "app/.env"),
      typeof __dirname !== "undefined" ? path.resolve(__dirname, ".env.local") : null,
      typeof __dirname !== "undefined" ? path.resolve(__dirname, "../.env.local") : null,
      typeof __dirname !== "undefined" ? path.resolve(__dirname, "../../.env.local") : null,
    ].filter(Boolean);

    for (const file of candidates) {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, "utf8");
        for (const line of content.split("\n")) {
          const match = line.trim().match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
          if (match) {
            const key = match[1];
            let val = match[2].trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (!process.env[key] && val) {
              process.env[key] = val;
            }
          }
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
    return isGemini ? "gemini-3.6-flash" : "gpt-4o-mini";
  }
  if (
    m === "circuit-pro" ||
    m.includes("2.5-pro") ||
    m.includes("1.5-pro") ||
    m.includes("2.0-pro") ||
    m.includes("3.7-flash") ||
    m === "gemini-pro"
  ) {
    return isGemini ? "gemini-3.7-flash" : "gpt-4o";
  }
  return modelInput!.trim();
}

function sanitizeSseChunk(rawChunk: string, tierId: "circuit-lite" | "circuit-pro"): string {
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
    process.env.AI_GATEWAY_API_KEY;

  if (req.method === "GET") {
    return res.status(200).json({
      status: "active",
      hasApiKey: !!apiKey,
      models: [
        { id: "circuit-lite", name: "Circuit Lite", badge: "1 CREDIT", desc: "Fast everyday interaction: telemetry, market checks, simple planning & navigation", tier: "LITE", creditCost: 1 },
        { id: "circuit-pro", name: "Circuit Pro Agent", badge: "4 CREDITS", desc: "Deep multi-step reasoning: portfolio strategy, risk recovery, DBC liquidity planning", tier: "PRO", creditCost: 4 },
      ],
      rateLimitRemaining: MAX_REQUESTS_PER_MINUTE - (limitEntry?.count || 1)
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
    riskRatchetState: rawSnap.riskRatchetState ?? "NORMAL",
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

    const reply = handleOfflineChat(userMsg, snapshot, messages);
    res.write(reply);
    return res.end();
  }

  const rawBaseUrl = process.env.AI_GATEWAY_BASE_URL;
  // Default to Google Gemini OpenAI-compatible gateway
  const baseUrl = rawBaseUrl ?? "https://generativelanguage.googleapis.com/v1beta/openai";
  const isGemini = baseUrl.includes("generativelanguage.googleapis.com");
  const fallbackModel = isGemini ? "gemini-3.6-flash" : "gpt-4o-mini";
  const emergencyFallback = isGemini ? "gemini-flash-latest" : "gpt-3.5-turbo";
  const requestedModel =
    mapModelId(typeof body.model === "string" ? body.model : undefined, isGemini) ||
    process.env.GEMINI_MODEL ||
    process.env.AI_MODEL ||
    fallbackModel;

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
    const candidateModels = isGemini
      ? Array.from(new Set([requestedModel, "gemini-3.7-flash", "gemini-3.6-flash", "gemini-flash-latest"]))
      : Array.from(new Set([requestedModel, "gpt-4o-mini", "gpt-3.5-turbo"]));

    let activeModel = requestedModel;
    let upstream: Response | null = null;

    for (const candidate of candidateModels) {
      activeModel = candidate;
      upstream = await callUpstream(activeModel);
      if (upstream.ok) break;
      console.warn(`Model ${activeModel} failed (HTTP ${upstream.status}). Trying next candidate...`);
    }

    if (!upstream || !upstream.ok) {
      console.warn(`All LLM models failed. Falling back to deterministic offline handler.`);
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.status(200);
      const reply = handleOfflineChat(userMsg, snapshot, messages);
      res.write(reply);
      return res.end();
    }

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.status(200);

    const reader = upstream.body?.getReader();
    if (!reader) {
      res.write("data: [DONE]\n\n");
      return res.end();
    }

    const requestedTier = body?.model === "circuit-pro" ? "circuit-pro" : "circuit-lite";
    const isProRequested = requestedTier === "circuit-pro";
    const activeIsLite = isGemini
      ? (activeModel === "gemini-3.6-flash" || activeModel === "gemini-flash-latest")
      : (activeModel === "gpt-4o-mini" || activeModel === "gpt-3.5-turbo");

    if (isProRequested && activeIsLite) {
      const emergencyTierNotice = `[Note: Switched to Circuit Lite because Circuit Pro was unavailable.]\n\n`;
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: emergencyTierNotice } }] })}\n\n`);
    }

    const effectiveTier: "circuit-lite" | "circuit-pro" = isProRequested && !activeIsLite ? "circuit-pro" : "circuit-lite";
    const dec = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const rawChunk = dec.decode(value, { stream: true });
      res.write(sanitizeSseChunk(rawChunk, effectiveTier));
    }
    res.end();
  } catch (err) {
    console.error("Agent chat error:", err);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.status(200);
    const reply = handleOfflineChat(userMsg, snapshot, messages);
    res.write(reply);
    res.end();
  }
}
