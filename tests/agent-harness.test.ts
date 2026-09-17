import { expect } from "chai";
import { resolveAssetEntity, findMentionedAssets, normalizeEntityQuery } from "../app/src/lib/agent/entityResolver";
import { classifyIntent, parseAmount, parseActionVerb } from "../app/src/lib/agent/intentEngine";
import { AgentHarnessCoordinator, ProtocolSnapshot } from "../app/src/lib/agent/harness";
import { AgentHarnessRateLimiter } from "../app/src/lib/agent/rateLimiter";
import { DEPLOYED_MARKETS } from "../app/src/data/markets-registry";

describe("Agent Harness & Conversational Protocol Execution Tests", () => {
  const mockSnapshot: ProtocolSnapshot = {
    walletAddress: "DevnetWallet11111111111111111111111111111111",
    ratchetState: "SAFE",
    isMarketOpen: true,
    totalCollateralUsd: 1500,
    totalDebtUsd: 200,
    healthFactor: 2.15,
    availableCreditUsd: 420,
    positions: [
      {
        symbol: "NVDA",
        collateralValueUsd: 1200,
        debtUi: 200,
        healthFactor: 2.15,
      },
    ],
    markets: {
      NVDA: { price: 138.25, change24h: 3.42, oracleFreshness: "VALID" },
      AAPL: { price: 232.5, change24h: -0.85, oracleFreshness: "VALID" },
      GOOGL: { price: 180.1, change24h: 1.15, oracleFreshness: "VALID" },
    },
    agentBorrowLimitUsd: 500,
  };

  describe("1. Entity Resolution & Typo Tolerance", () => {
    it("resolves exact tickers: nvda, NVDA, nvdax", () => {
      const e1 = resolveAssetEntity("nvda");
      expect(e1).to.not.be.null;
      expect(e1!.market.symbol).to.equal("NVDA");
      expect(e1!.confidence).to.equal("HIGH");

      const e2 = resolveAssetEntity("NVDA");
      expect(e2!.market.symbol).to.equal("NVDA");

      const e3 = resolveAssetEntity("nvdax");
      expect(e3!.market.symbol).to.equal("NVDA");
    });

    it("resolves company name and aliases: Nvidia, Apple, Microsoft, Google", () => {
      const e1 = resolveAssetEntity("Nvidia");
      expect(e1!.market.symbol).to.equal("NVDA");

      const e2 = resolveAssetEntity("Apple");
      expect(e2!.market.symbol).to.equal("AAPL");

      const e3 = resolveAssetEntity("microsoft");
      expect(e3!.market.symbol).to.equal("MSFT");

      const e4 = resolveAssetEntity("google");
      expect(e4!.market.symbol).to.equal("GOOGL");
    });

    it("handles typo tolerance: nvida, appl, googel, micrsoft", () => {
      const e1 = resolveAssetEntity("nvida");
      expect(e1).to.not.be.null;
      expect(e1!.market.symbol).to.equal("NVDA");

      const e2 = resolveAssetEntity("appl");
      expect(e2).to.not.be.null;
      expect(e2!.market.symbol).to.equal("AAPL");

      const e3 = resolveAssetEntity("googel");
      expect(e3).to.not.be.null;
      expect(e3!.market.symbol).to.equal("GOOGL");

      const e4 = resolveAssetEntity("micrsoft");
      expect(e4).to.not.be.null;
      expect(e4!.market.symbol).to.equal("MSFT");
    });
  });

  describe("2. Amount Parsing & Normalization", () => {
    it("parses diverse currency and amount notations", () => {
      expect(parseAmount("200")).to.equal(200);
      expect(parseAmount("$200")).to.equal(200);
      expect(parseAmount("200 usdc")).to.equal(200);
      expect(parseAmount("200 dollars")).to.equal(200);
      expect(parseAmount("0.2k")).to.equal(200);
      expect(parseAmount("2k")).to.equal(2000);
      expect(parseAmount("1,500 USDC")).to.equal(1500);
      expect(parseAmount("invalid")).to.be.null;
      expect(parseAmount("-50")).to.be.null;
    });
  });

  describe("3. Action Verb Recognition", () => {
    it("maps diverse natural synonyms to typed ProtocolAction", () => {
      expect(parseActionVerb("borrow")).to.equal("borrow");
      expect(parseActionVerb("take loan")).to.equal("borrow");
      expect(parseActionVerb("get credit")).to.equal("borrow");

      expect(parseActionVerb("deposit")).to.equal("deposit");
      expect(parseActionVerb("add collateral")).to.equal("deposit");

      expect(parseActionVerb("withdraw")).to.equal("withdraw");
      expect(parseActionVerb("remove collateral")).to.equal("withdraw");

      expect(parseActionVerb("repay")).to.equal("repay");
      expect(parseActionVerb("pay back")).to.equal("repay");
      expect(parseActionVerb("clear debt")).to.equal("repay");

      expect(parseActionVerb("swap")).to.equal("swap");
      expect(parseActionVerb("provide liquidity")).to.equal("enter_liquidity");
      expect(parseActionVerb("exit liquidity")).to.equal("exit_liquidity");
    });
  });

  describe("4. Conversational Context & Multi-turn Execution Flow", () => {
    let harness: AgentHarnessCoordinator;

    beforeEach(() => {
      harness = new AgentHarnessCoordinator(DEPLOYED_MARKETS[0]);
    });

    it("Step 1: 'nvda' activates NVDAx market context and emits MARKET_CARD block", () => {
      const res = harness.processInput("nvda", mockSnapshot);
      expect(res.intent.type).to.equal("ASSET_LOOKUP");
      expect(res.intent.asset!.symbol).to.equal("NVDA");
      expect(res.blocks.some(b => b.type === "MARKET_CARD")).to.be.true;

      const card = res.blocks.find(b => b.type === "MARKET_CARD") as any;
      expect(card.priceUsd).to.equal(138.25);
      expect(card.riskState).to.equal("SAFE");
      expect(card.borrowCapacityUsd).to.equal(420);
    });

    it("Step 2: 'borrow 200' infers active asset NVDAx without asking", () => {
      harness.processInput("nvda", mockSnapshot);
      const res = harness.processInput("borrow 200", mockSnapshot);

      expect(res.intent.type).to.equal("ACTION_PREPARE");
      expect(res.intent.action).to.equal("borrow");
      expect(res.intent.amount).to.equal(200);
      expect(res.intent.asset!.symbol).to.equal("NVDA");
      expect(res.blocks.some(b => b.type === "PROPOSAL_CARD")).to.be.true;

      const prop = res.blocks.find(b => b.type === "PROPOSAL_CARD") as any;
      expect(prop.permission).to.equal("ALLOWED");
      expect(prop.amountUsd).to.equal(200);
    });

    it("Step 3: 'make it 150' updates the pending proposal amount from 200 to 150", () => {
      harness.processInput("nvda", mockSnapshot);
      harness.processInput("borrow 200", mockSnapshot);

      const res = harness.processInput("make it 150", mockSnapshot);
      expect(res.intent.type).to.equal("ACTION_UPDATE");
      expect(res.intent.amount).to.equal(150);
      expect(res.blocks.some(b => b.type === "PROPOSAL_CARD")).to.be.true;

      const prop = res.blocks.find(b => b.type === "PROPOSAL_CARD") as any;
      expect(prop.amountUsd).to.equal(150);
    });

    it("Step 4: 'actually make it GOOGL' switches active asset and invalidates NVDA proposal", () => {
      harness.processInput("nvda", mockSnapshot);
      harness.processInput("borrow 200", mockSnapshot);
      expect(harness.getContext().pendingProposal).to.not.be.null;

      const res = harness.processInput("actually make it GOOGL", mockSnapshot);
      expect(res.intent.type).to.equal("ACTION_SWITCH_ASSET");
      expect(res.intent.asset!.symbol).to.equal("GOOGL");
      expect(harness.getContext().activeAsset!.symbol).to.equal("GOOGL");

      // Prior NVDA proposal MUST be invalidated
      expect(harness.getContext().pendingProposal).to.be.null;
      expect(res.blocks.some(b => b.type === "MARKET_CARD")).to.be.true;
    });

    it("Step 5: 'can I borrow 300?' answers YES with capacity and attaches proposal", () => {
      harness.processInput("nvda", mockSnapshot);
      const res = harness.processInput("can I borrow 300?", mockSnapshot);

      expect(res.intent.type).to.equal("CAPACITY_QUERY");
      expect(res.replyText).to.include("YES");
      expect(res.blocks.some(b => b.type === "PROPOSAL_CARD")).to.be.true;
    });

    it("Step 6: 'can I borrow 600?' answers NO when exceeding capacity ($420)", () => {
      harness.processInput("nvda", mockSnapshot);
      const res = harness.processInput("can I borrow 600?", mockSnapshot);

      expect(res.intent.type).to.equal("CAPACITY_QUERY");
      expect(res.replyText).to.include("NO");
      expect(res.replyText).to.include("exceeds");
      // Does not attach an allowed proposal
      expect(res.blocks.some(b => b.type === "PROPOSAL_CARD" && (b as any).permission === "ALLOWED")).to.be.false;
    });

    it("Step 7: 'chart' renders chart block for active asset", () => {
      harness.processInput("nvda", mockSnapshot);
      const res = harness.processInput("chart", mockSnapshot);

      expect(res.intent.type).to.equal("CHART_REQUEST");
      expect(res.blocks.some(b => b.type === "CHART_CARD")).to.be.true;
    });

    it("Step 8: 'cancel' purges pending proposal safely", () => {
      harness.processInput("nvda", mockSnapshot);
      harness.processInput("borrow 200", mockSnapshot);
      expect(harness.getContext().pendingProposal).to.not.be.null;

      const res = harness.processInput("cancel", mockSnapshot);
      expect(res.intent.type).to.equal("ACTION_CANCEL");
      expect(harness.getContext().pendingProposal).to.be.null;
      expect(res.replyText).to.include("cancelled");
    });
  });

  describe("5. Safety & Risk Ratchet Invariants", () => {
    it("strictly blocks borrow proposal in DEFENSIVE state", () => {
      const defensiveSnapshot: ProtocolSnapshot = {
        ...mockSnapshot,
        ratchetState: "DEFENSIVE",
      };

      const harness = new AgentHarnessCoordinator();
      const res = harness.processInput("borrow 200", defensiveSnapshot);

      const prop = res.blocks.find(b => b.type === "PROPOSAL_CARD") as any;
      expect(prop).to.not.be.undefined;
      expect(prop.permission).to.equal("BLOCKED");
      expect(prop.reason).to.include("DEFENSIVE");
    });

    it("allows repay in DEFENSIVE and EMERGENCY states (Capital Recovery)", () => {
      const emergencySnapshot: ProtocolSnapshot = {
        ...mockSnapshot,
        ratchetState: "EMERGENCY",
      };

      const harness = new AgentHarnessCoordinator();
      const res = harness.processInput("repay 100", emergencySnapshot);

      const prop = res.blocks.find(b => b.type === "PROPOSAL_CARD") as any;
      expect(prop).to.not.be.undefined;
      expect(prop.permission).to.equal("ALLOWED");
    });
  });

  describe("6. Rate Limiting & Loop Detector", () => {
    it("enforces conversational message rate limiting", () => {
      const limiter = new AgentHarnessRateLimiter({
        maxChatPerMinute: 3,
        maxExecutionsPerMinute: 2,
        executionCooldownMs: 1000,
        maxConsecutiveIdenticalActions: 3,
      });

      expect(limiter.checkChatLimit().allowed).to.be.true;
      expect(limiter.checkChatLimit().allowed).to.be.true;
      expect(limiter.checkChatLimit().allowed).to.be.true;
      // 4th message within a minute is throttled
      const check4 = limiter.checkChatLimit();
      expect(check4.allowed).to.be.false;
      expect(check4.reason).to.include("too quickly");
    });

    it("trips loop detector on 3 consecutive identical failures", () => {
      const limiter = new AgentHarnessRateLimiter({
        maxChatPerMinute: 30,
        maxExecutionsPerMinute: 10,
        executionCooldownMs: 0,
        maxConsecutiveIdenticalActions: 3,
      });

      limiter.recordExecution("borrow", "NVDA", 200, false);
      limiter.recordExecution("borrow", "NVDA", 200, false);
      limiter.recordExecution("borrow", "NVDA", 200, false);

      const check = limiter.checkExecutionLimit("borrow", "NVDA", 200);
      expect(check.allowed).to.be.false;
      expect(check.reason).to.include("Repeated execution");
    });
  });
});
