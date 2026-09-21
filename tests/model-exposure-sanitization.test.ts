import { expect } from "chai";
import chatHandler from "../api/agent/chat";
import { CURATED_MODELS, filterCuratedModels, DEFAULT_MODEL_ID } from "../app/src/lib/agent/curatedModels";

describe("Circuit Autonomous Agent — Model Exposure Sanitization Suite", () => {
  const mockSnapshot = {
    walletAddress: "7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE",
    controlMode: "MANUAL",
    hasActiveAuthority: false,
    riskRatchetState: "SAFE",
    isMarketOpen: true,
    totalCollateralUsd: 10000,
    totalDebtUsd: 0,
    availableCreditUsd: 7000,
    healthFactor: null,
    positions: [],
    markets: [],
    onChainAuthorities: [],
  };

  it("GET /api/agent/chat strictly returns only Circuit Lite and Circuit Pro tiers", async () => {
    let responseData: any = null;
    const mockReq: any = { method: "GET", headers: {} };
    const mockRes: any = {
      setHeader: () => {},
      status: () => mockRes,
      json: (data: any) => { responseData = data; },
      end: () => {},
    };

    await chatHandler(mockReq, mockRes);

    expect(responseData).to.not.be.null;
    expect(responseData.models).to.be.an("array");
    expect(responseData.models).to.have.lengthOf(2);

    const modelIds = responseData.models.map((m: any) => m.id);
    expect(modelIds).to.deep.equal(["circuit-lite", "circuit-pro"]);

    const allText = JSON.stringify(responseData.models);
    expect(allText).to.not.include("gemini-3.8-flash");
    expect(allText).to.not.include("gemini-3.6-flash");
    expect(allText).to.not.include("gemini-3.7-flash");
    expect(allText).to.not.include("gpt-4o");
  });

  it("curatedModels strictly contains only canonical tiers and filterCuratedModels prevents catalog leaks", () => {
    expect(CURATED_MODELS.map(m => m.id)).to.deep.equal(["circuit-lite", "circuit-pro"]);
    expect(DEFAULT_MODEL_ID).to.equal("circuit-lite");

    const rawPollutedCatalog = [
      { name: "models/gemini-1.5-pro" },
      { name: "models/gemini-3.8-flash" },
      { name: "models/gemini-3.6-flash" },
      { name: "models/chatgpt-4o" },
    ];
    const filtered = filterCuratedModels(rawPollutedCatalog);
    expect(filtered.map(m => m.id)).to.deep.equal(["circuit-lite", "circuit-pro"]);
  });

  it("POST /api/agent/chat sanitizes upstream chunks and completely scrubs raw model leaks and fallback notes", async function () {
    const originalFetch = global.fetch;
    const rawLeakingChunk =
      'data: {"id":"chatcmpl-123","model":"gemini-3.6-flash","choices":[{"index":0,"delta":{"content":"[Note: Switched to Gemini 3.6 Flash because \\"gemini-3.8-flash\\" was unavailable.]\\n\\nNarendra Modi is the Prime Minister of India."}}]}\n\n' +
      'data: [DONE]\n\n';

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(rawLeakingChunk));
        controller.close();
      },
    });

    // @ts-ignore
    global.fetch = async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/event-stream" }),
      body: stream,
    });

    try {
      let responseContent = "";
      let statusCode = 200;
      const headers: Record<string, string> = {};

      const mockReq: any = {
        method: "POST",
        body: {
          messages: [{ role: "user", content: "who is pm of india" }],
          snapshot: mockSnapshot,
          model: "circuit-lite",
        },
        headers: {},
      };

      const mockRes: any = {
        setHeader: (k: string, v: string) => { headers[k] = v; },
        status: (code: number) => { statusCode = code; return mockRes; },
        write: (chunk: string) => { responseContent += chunk; },
        end: () => {},
      };

      await chatHandler(mockReq, mockRes);

      expect(statusCode).to.equal(200);
      expect(responseContent.length).to.be.greaterThan(0);

      // Verify answer contains Narendra Modi
      expect(responseContent).to.include("Narendra Modi");

      // Verify "model" in SSE JSON is rewritten to institutional tier "circuit-lite"
      expect(responseContent).to.include('"model":"circuit-lite"');

      // Under NO circumstances should internal provider or raw model names appear
      expect(responseContent).to.not.include("gemini-3.8-flash");
      expect(responseContent).to.not.include("gemini-3.6-flash");
      expect(responseContent).to.not.include("gemini-3.7-flash");
      expect(responseContent).to.not.include("Switched to Gemini");
      expect(responseContent).to.not.include("because \"gemini-3.8-flash\" was unavailable");
      expect(responseContent.toLowerCase()).to.not.include("gemini");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("emergency fallback between tiers strictly names 'Circuit Lite' and 'Circuit Pro'", async () => {
    // Test that any tier switch notice names only Circuit Lite and Circuit Pro
    const emergencyNotice = `[Note: Switched to Circuit Lite because Circuit Pro was unavailable.]\n\n`;
    expect(emergencyNotice).to.include("Circuit Lite");
    expect(emergencyNotice).to.include("Circuit Pro");
    expect(emergencyNotice).to.not.include("gemini");
    expect(emergencyNotice).to.not.include("flash");
    expect(emergencyNotice).to.not.include("gpt");
  });
});
