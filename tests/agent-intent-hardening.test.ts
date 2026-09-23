import { expect } from "chai";
import { classifyIntent } from "../app/src/lib/agent/intentEngine";
import { AgentHarnessCoordinator, ProtocolSnapshot } from "../app/src/lib/agent/harness";
import { DEPLOYED_MARKETS, getDeployedMarket } from "../app/src/data/markets-registry";
import chatHandler, { handleOfflineChat } from "../api/agent/chat";

describe("Critical Agent Intent & Financial Action Hardening Regression Suite", () => {
  const amdMarket = getDeployedMarket("AMD") || DEPLOYED_MARKETS[0];
  const nvdaMarket = getDeployedMarket("NVDA") || DEPLOYED_MARKETS.find(m => m.symbol === "NVDA")!;

  const mockSnapshot: ProtocolSnapshot = {
    walletAddress: "8QjYsJYYyYMiYuqaig9oH2dpZ1JY1HfEgsJQRtogs51L",
    ratchetState: "SAFE",
    isMarketOpen: true,
    totalCollateralUsd: 1500,
    totalDebtUsd: 0,
    healthFactor: null,
    availableCreditUsd: 1050,
    positions: [
      {
        symbol: "NVDA",
        collateralValueUsd: 1500,
        debtUi: 0,
        healthFactor: null,
      },
    ],
    markets: {
      AMD: { price: 172.50, change24h: 1.25, oracleFreshness: "VALID" },
      NVDA: { price: 138.25, change24h: 3.42, oracleFreshness: "VALID" },
      AAPL: { price: 232.50, change24h: -0.85, oracleFreshness: "VALID" },
      BTC: { price: 64250.00, change24h: 1.85, oracleFreshness: "VALID" },
    },
    agentBorrowLimitUsd: 500,
  };

  const apiSnapshot = {
    walletAddress: "8QjYsJYYyYMiYuqaig9oH2dpZ1JY1HfEgsJQRtogs51L",
    controlMode: "AUTONOMOUS",
    hasActiveAuthority: false,
    riskRatchetState: "SAFE",
    isMarketOpen: true,
    totalCollateralUsd: 1500,
    totalDebtUsd: 0,
    availableCreditUsd: 1050,
    healthFactor: null,
    positions: [
      {
        symbol: "NVDA",
        collateralValueUsd: 1500,
        debtUi: 0,
        mint: nvdaMarket?.mint || "CARqKy5GTCxz5G1tFiYA96A3Q8jaUE9Vppk7cjGJxRqq",
      },
    ],
    markets: [
      { symbol: "AMD", price: 172.50, change24hPct: 1.25 },
      { symbol: "NVDA", price: 138.25, change24hPct: 3.42 },
      { symbol: "BTC", price: 64250.00, change24hPct: 1.85 },
    ],
    onChainAuthorities: [],
  };

  let origKey: string | undefined;
  before(() => {
    process.env.CIRCUIT_OFFLINE_TEST = "1";
    origKey = process.env.GEMINI_AI_KEY;
    delete process.env.GEMINI_AI_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.AI_GATEWAY_API_KEY;
  });
  after(() => {
    delete process.env.CIRCUIT_OFFLINE_TEST;
    if (origKey) process.env.GEMINI_AI_KEY = origKey;
  });

  async function invokeChat(content: string) {
    let responseContent = "";
    let statusCode = 200;
    const headers: Record<string, string> = {};

    const mockReq: any = {
      method: "POST",
      body: {
        messages: [{ role: "user", content }],
        snapshot: apiSnapshot,
      },
    };

    const mockRes: any = {
      setHeader: (k: string, v: string) => { headers[k] = v; },
      status: (code: number) => { statusCode = code; return mockRes; },
      write: (chunk: string) => { responseContent += chunk; },
      send: (body: any) => { responseContent += typeof body === "string" ? body : JSON.stringify(body); return mockRes; },
      json: (body: any) => { responseContent += JSON.stringify(body); return mockRes; },
      end: () => {},
    };

    await chatHandler(mockReq, mockRes);
    return { statusCode, responseContent, headers };
  }

  describe("CASE 1: Stale context asset = AMDx + 'how does Circuit work?'", () => {
    it("routes strictly to EXPLANATION_MODE with asset = null and zero proposal cards", () => {
      const harness = new AgentHarnessCoordinator(amdMarket);
      expect(harness.getContext().activeAsset?.symbol).to.equal("AMD");

      const intent = classifyIntent("how does Circuit work?", harness.getContext());
      expect(intent.type).to.equal("EXPLANATION_MODE");
      expect(intent.asset).to.be.null;

      const res = harness.processInput("how does Circuit work?", mockSnapshot);
      expect(res.intent.type).to.equal("EXPLANATION_MODE");
      expect(res.blocks.some(b => b.type === "PROPOSAL_CARD")).to.be.false;
      expect(res.replyText).to.include("Circuit Protocol Overview");
      expect(res.replyText).to.include("Canonical Architectural Flow");
      expect(res.replyText).to.not.include("PROPOSAL");
    });
  });

  describe("CASE 2: Stale context asset = AMDx + 'what is NVDA price?'", () => {
    it("resolves NVDA market and never substitutes AMDx", () => {
      const harness = new AgentHarnessCoordinator(amdMarket);
      expect(harness.getContext().activeAsset?.symbol).to.equal("AMD");

      const intent = classifyIntent("what is NVDA price?", harness.getContext());
      expect(intent.type).to.equal("PRICE_QUERY");
      expect(intent.asset?.symbol).to.equal("NVDA");

      const res = harness.processInput("what is NVDA price?", mockSnapshot);
      expect(res.replyText).to.include("NVDAx");
      expect(res.replyText).to.include("138.25");
      expect(res.replyText).to.not.include("AMDx");
    });
  });

  describe("CASE 3: Stale context asset = AMDx + 'how do I borrow?'", () => {
    it("treats inquiry as EXPLANATION_MODE without inventing $100 or AMD proposal", () => {
      const harness = new AgentHarnessCoordinator(amdMarket);
      const intent = classifyIntent("how do I borrow?", harness.getContext());
      expect(intent.type).to.equal("EXPLANATION_MODE");
      expect(intent.amount).to.be.undefined;
      expect(intent.asset).to.be.null;

      const res = harness.processInput("how do I borrow?", mockSnapshot);
      expect(res.blocks.some(b => b.type === "PROPOSAL_CARD")).to.be.false;
      expect(res.replyText).to.include("Borrowing Mechanism");
      expect(res.replyText).to.not.include("BORROW PROPOSAL");
      expect(res.replyText).to.not.include("$100.00 USDC against AMDx");
    });
  });

  describe("CASE 4: User: 'borrow $100 USDC against NVDA'", () => {
    it("prepares valid executable proposal with explicit asset and amount", () => {
      const harness = new AgentHarnessCoordinator(amdMarket);
      const intent = classifyIntent("borrow $100 USDC against NVDA", harness.getContext());

      expect(intent.type).to.equal("ACTION_PREPARE");
      expect(intent.action).to.equal("borrow");
      expect(intent.amount).to.equal(100);
      expect(intent.asset?.symbol).to.equal("NVDA");

      const res = harness.processInput("borrow $100 USDC against NVDA", mockSnapshot);
      const prop = res.blocks.find(b => b.type === "PROPOSAL_CARD") as any;
      expect(prop).to.not.be.undefined;
      expect(prop.symbol).to.equal("NVDA");
      expect(prop.amountUsd).to.equal(100);
      expect(prop.action).to.equal("borrow");
      expect(prop.permission).to.equal("ALLOWED");
    });
  });

  describe("CASE 5: User: 'how do I deposit assets and borrow?'", () => {
    it("explains both deposit and borrow workflows without creating proposal blocks", () => {
      const harness = new AgentHarnessCoordinator(amdMarket);
      const intent = classifyIntent("how do I deposit assets and borrow?", harness.getContext());
      expect(intent.type).to.equal("EXPLANATION_MODE");
      expect(intent.explanationTopics).to.include("deposit");
      expect(intent.explanationTopics).to.include("borrow");

      const res = harness.processInput("how do I deposit assets and borrow?", mockSnapshot);
      expect(res.blocks.some(b => b.type === "PROPOSAL_CARD")).to.be.false;
      expect(res.replyText).to.include("Deposit Mechanism");
      expect(res.replyText).to.include("Borrowing Mechanism");
    });
  });

  describe("CASE 6: User: 'lend'", () => {
    it("articulates truthfully that retail lending is not currently available in Circuit", () => {
      const harness = new AgentHarnessCoordinator(amdMarket);
      const intent = classifyIntent("lend", harness.getContext());
      expect(intent.type).to.equal("EXPLANATION_MODE");
      expect(intent.explanationTopics).to.include("lending");

      const res = harness.processInput("lend", mockSnapshot);
      expect(res.blocks.some(b => b.type === "PROPOSAL_CARD")).to.be.false;
      expect(res.replyText).to.include("Lending is not currently available in the configured Circuit deployment");
      expect(res.replyText).to.not.include("5.4% APY");
    });
  });

  describe("CASE 7: User: 'borrow' (Missing amount and missing asset)", () => {
    it("requests missing asset and amount; never invents $100 or AMDx; zero proposals", () => {
      const harness = new AgentHarnessCoordinator();
      const intent = classifyIntent("borrow", harness.getContext());
      expect(intent.type).to.equal("ACTION_PREPARE");
      expect(intent.amount).to.be.undefined;
      expect(intent.asset).to.be.null;

      const res = harness.processInput("borrow", mockSnapshot);
      expect(res.blocks.some(b => b.type === "PROPOSAL_CARD")).to.be.false;
      expect(res.replyText).to.include("Which collateral asset would you like to borrow against?");
      expect(res.replyText).to.not.include("$100.00 USDC against AMDx");
    });
  });

  describe("CASE 8: User: 'what is the current price of btc and nvda'", () => {
    it("resolves BTC and NVDA individually and never substitutes AMDx", () => {
      const harness = new AgentHarnessCoordinator(amdMarket);
      const intent = classifyIntent("what is the current price of btc and nvda", harness.getContext());

      expect(intent.type).to.equal("MARKET_QUERY");
      expect(intent.requestedSymbols).to.deep.equal(["BTC", "NVDA"]);

      const res = harness.processInput("what is the current price of btc and nvda", mockSnapshot);
      expect(res.replyText).to.include("BTC");
      expect(res.replyText).to.include("64,250.00");
      expect(res.replyText).to.include("NVDAx");
      expect(res.replyText).to.include("138.25");
      expect(res.replyText).to.not.include("AMDx");
    });
  });

  describe("CASE 9: Compound User Question: 'how cuircuit works and how i borrow and deposit asets and how to get lend'", () => {
    it("delivers full 8-part canonical explanation with zero proposal cards and truthful lending boundary", () => {
      const harness = new AgentHarnessCoordinator(amdMarket);
      const query = "how cuircuit works and how i borrow and deposit asets and how to get lend";
      const intent = classifyIntent(query, harness.getContext());

      expect(intent.type).to.equal("EXPLANATION_MODE");
      expect(intent.asset).to.be.null;

      const res = harness.processInput(query, mockSnapshot);
      // Zero proposal blocks
      expect(res.blocks.some(b => b.type === "PROPOSAL_CARD")).to.be.false;

      // Canonical 8 parts
      expect(res.replyText).to.include("1. Circuit Protocol Overview");
      expect(res.replyText).to.include("2. Canonical Architectural Flow");
      expect(res.replyText).to.include("3. Deposit Mechanism");
      expect(res.replyText).to.include("4. Borrowing Mechanism");
      expect(res.replyText).to.include("5. Repay Mechanism");
      expect(res.replyText).to.include("6. Withdrawal Mechanism");
      expect(res.replyText).to.include("7. Lending & Yield Availability");
      expect(res.replyText).to.include("Lending is not currently available in the configured Circuit deployment");
      expect(res.replyText).to.include("8. Wallet State & Prerequisites");

      // Verify no false borrow proposal was generated
      expect(res.replyText).to.not.include("BORROW PROPOSAL");
      expect(res.replyText).to.not.include("$100.00 USDC against AMDx");
      expect(res.replyText).to.not.include("BORROW BLOCKED");
    });
  });

  describe("CASE 10: Serverless API Endpoint (/api/agent/chat) Verification", () => {
    it("does not trip preflight block on 'how cuircuit works and how i borrow and deposit asets and how to get lend'", async () => {
      const { statusCode, responseContent } = await invokeChat(
        "how cuircuit works and how i borrow and deposit asets and how to get lend"
      );
      expect(statusCode).to.equal(200);
      expect(responseContent).to.not.include("AGENT_UNAUTHORIZED");
      expect(responseContent).to.not.include("CIRCUIT_ACTION_PROPOSAL:");
      expect(responseContent).to.include("1. Circuit Protocol Overview");
      expect(responseContent).to.include("Lending is not currently available in the configured Circuit deployment");
    });

    it("evaluates multi-asset price query for BTC and NVDA without mentioning AMDx", async () => {
      const { statusCode, responseContent } = await invokeChat("what is the current price of btc and nvda");
      expect(statusCode).to.equal(200);
      expect(responseContent).to.include("BTC");
      expect(responseContent).to.include("NVDAx");
      expect(responseContent).to.not.include("AMDx");
    });
  });
});
