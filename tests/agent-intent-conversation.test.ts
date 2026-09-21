import { expect } from "chai";
import chatHandler, { handleOfflineChat } from "../api/agent/chat";

describe("Circuit Autonomous Agent — Conversational Intent & Analysis Suite", () => {
  const mockSnapshot = {
    walletAddress: "7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE",
    controlMode: "MANUAL",
    hasActiveAuthority: false,
    riskRatchetState: "RESTRICTED",
    isMarketOpen: true,
    totalCollateralUsd: 7862.6,
    totalDebtUsd: 0,
    availableCreditUsd: 5503.82,
    healthFactor: null,
    positions: [
      {
        symbol: "NVDA",
        collateralValueUsd: 7862.6,
        debtUi: 0,
        mint: "CARqKy5GTCxz5G1tFiYA96A3Q8jaUE9Vppk7cjGJxRqq",
      },
    ],
    markets: [
      { symbol: "NVDA", price: 138.25, change24hPct: 3.4 },
      { symbol: "AAPL", price: 232.5, change24hPct: -0.8 },
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

  async function invokeChat(content: string, messagesHistory: Array<{ role: "user" | "assistant"; content: string }> = []) {
    let responseContent = "";
    let statusCode = 200;
    const headers: Record<string, string> = {};

    const mockReq: any = {
      method: "POST",
      body: {
        messages: [...messagesHistory, { role: "user", content }],
        snapshot: mockSnapshot,
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

  describe("1. Conversational Greetings (No Harness Dump)", () => {
    it("handles 'hello' conversationally without dumping CIRCUIT_TOOL", async () => {
      const { statusCode, responseContent } = await invokeChat("hello");
      expect(statusCode).to.equal(200);
      expect(responseContent).to.not.include("CIRCUIT_TOOL:");
      expect(responseContent).to.include("Hello! I am the Circuit Autonomous Agent");
      expect(responseContent).to.include("RESTRICTED");
      expect(responseContent).to.include("7862.60");
    });

    it("handles 'gm' and 'hi' without dumping CIRCUIT_TOOL", async () => {
      const res1 = await invokeChat("gm");
      expect(res1.responseContent).to.not.include("CIRCUIT_TOOL:");
      expect(res1.responseContent).to.include("Circuit Autonomous Agent");

      const res2 = await invokeChat("hi");
      expect(res2.responseContent).to.not.include("CIRCUIT_TOOL:");
      expect(res2.responseContent).to.include("Circuit Autonomous Agent");
    });
  });

  describe("2. Identity & Role Inquiries (No Harness Dump)", () => {
    it("explains identity when asked 'who are you?' without dumping tools", async () => {
      const { statusCode, responseContent } = await invokeChat("who are you?");
      expect(statusCode).to.equal(200);
      expect(responseContent).to.not.include("CIRCUIT_TOOL:");
      expect(responseContent).to.include("I am the Circuit Autonomous Agent");
      expect(responseContent).to.include("Human Sovereignty");
      expect(responseContent).to.include("Risk Ratchet");
    });

    it("handles 'what are you' and 'what is your role'", async () => {
      const res = await invokeChat("what is your role?");
      expect(res.responseContent).to.not.include("CIRCUIT_TOOL:");
      expect(res.responseContent).to.include("Risk-Governed Execution");
    });
  });

  describe("3. Protocol Architecture Inquiries (No Harness Dump)", () => {
    it("explains Circuit architecture for 'what is circuit?'", async () => {
      const { statusCode, responseContent } = await invokeChat("what is circuit?");
      expect(statusCode).to.equal(200);
      expect(responseContent).to.not.include("CIRCUIT_TOOL:");
      expect(responseContent).to.include("Dutch Auctions");
      expect(responseContent).to.include("Dynamic 4-State Risk Ratchet");
    });
  });

  describe("4. Clarifications & Courtesies (No Harness Dump)", () => {
    it("handles 'what?' and 'why?' with contextual clarification", async () => {
      const history = [
        { role: "assistant" as const, content: "Risk Ratchet is currently RESTRICTED due to oracle spread." },
      ];
      const { statusCode, responseContent } = await invokeChat("what?", history);
      expect(statusCode).to.equal(200);
      expect(responseContent).to.not.include("CIRCUIT_TOOL:");
      expect(responseContent).to.include("RESTRICTED");
      expect(responseContent).to.include("To clarify:");
    });

    it("handles 'thanks' courteously without tools", async () => {
      const { statusCode, responseContent } = await invokeChat("thanks!");
      expect(statusCode).to.equal(200);
      expect(responseContent).to.not.include("CIRCUIT_TOOL:");
      expect(responseContent).to.include("You're welcome");
    });

    it("handles 'help' by listing guide options without tools", async () => {
      const { statusCode, responseContent } = await invokeChat("help");
      expect(statusCode).to.equal(200);
      expect(responseContent).to.not.include("CIRCUIT_TOOL:");
      expect(responseContent).to.include("Check Positions & Credit");
    });
  });

  describe("5. Targeted Financial Operations (Emits Specific Tools & Proposals)", () => {
    it("evaluates portfolio inspection with get_portfolio tool", async () => {
      const { statusCode, responseContent } = await invokeChat("show my portfolio");
      expect(statusCode).to.equal(200);
      expect(responseContent).to.include("CIRCUIT_TOOL:");
      expect(responseContent).to.include('"tool":"get_portfolio"');
      expect(responseContent).to.include("Your Solana Devnet portfolio breakdown:");
    });

    it("evaluates borrow request with tools and action proposal", async () => {
      const { statusCode, responseContent } = await invokeChat("Can I borrow $200 against NVDA?");
      expect(statusCode).to.equal(200);
      expect(responseContent).to.include("CIRCUIT_TOOL:");
      expect(responseContent).to.include('"tool":"evaluate_permission"');
      expect(responseContent).to.include("CIRCUIT_ACTION_PROPOSAL:");
      expect(responseContent).to.include('"action":"borrow"');
    });

    it("evaluates deleveraging request with tools and action proposal", async () => {
      const { statusCode, responseContent } = await invokeChat("reduce my risk");
      expect(statusCode).to.equal(200);
      expect(responseContent).to.include("CIRCUIT_TOOL:");
      expect(responseContent).to.include("CIRCUIT_ACTION_PROPOSAL:");
    });

    it("evaluates watch requests with create_watch tool and CIRCUIT_TASK", async () => {
      const { statusCode, responseContent } = await invokeChat("watch health factor < 1.8");
      expect(statusCode).to.equal(200);
      expect(responseContent).to.include("CIRCUIT_TOOL:");
      expect(responseContent).to.include('"tool":"create_watch"');
      expect(responseContent).to.include("CIRCUIT_TASK:");
    });
  });

  describe("6. Unrecognized / Ambiguous Fallback", () => {
    it("reasons over unrecognized inputs without blind tool harness dumps", async () => {
      const { statusCode, responseContent } = await invokeChat("tell me something unique 987");
      expect(statusCode).to.equal(200);
      expect(responseContent).to.not.include("CIRCUIT_TOOL:");
      expect(responseContent).to.include('I analyzed your message: "tell me something unique 987"');
      expect(responseContent).to.include("Credit Headroom");
    });
  });
});
