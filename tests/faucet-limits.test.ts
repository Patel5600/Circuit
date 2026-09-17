import { expect } from "chai";
import { Keypair } from "@solana/web3.js";
import {
  FAUCET_ASSETS,
  FAUCET_COOLDOWN_MS,
  formatCooldown,
  sanitizeFaucetError,
  getCooldownRemaining,
  recordClaim,
} from "../app/src/lib/faucet";
import { getFaucetAuthority } from "../api/faucet";

describe("Devnet Faucet Limits & Multi-Wallet Isolation Tests", () => {
  // Mock localStorage for Node.js test environment
  const mockStorage: Record<string, string> = {};
  const originalWindow = (global as any).window;

  before(() => {
    (global as any).window = {};
    (global as any).localStorage = {
      getItem: (key: string) => mockStorage[key] || null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = value;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        for (const k in mockStorage) delete mockStorage[k];
      },
    };
  });

  after(() => {
    if (originalWindow) {
      (global as any).window = originalWindow;
    } else {
      delete (global as any).window;
      delete (global as any).localStorage;
    }
  });

  beforeEach(() => {
    (global as any).localStorage.clear();
  });

  describe("1. Faucet Asset Quotas & Mint Safety", () => {
    it("ensures all assets have 5x connected wallet multiplier (100% vs 20%)", () => {
      for (const asset of FAUCET_ASSETS) {
        expect(asset.fullAmount).to.be.greaterThan(0);
        expect(asset.addressAmount).to.be.greaterThan(0);
        expect(asset.fullAmount).to.equal(asset.addressAmount * 5);
      }
    });

    it("verifies 11 equity collaterals, 2 quotes, and 1 native SOL", () => {
      const equities = FAUCET_ASSETS.filter((a) => a.category === "equity");
      const quotes = FAUCET_ASSETS.filter((a) => a.category === "quote");
      const natives = FAUCET_ASSETS.filter((a) => a.category === "native");

      expect(equities.length).to.equal(11);
      expect(quotes.length).to.equal(2);
      expect(natives.length).to.equal(1);
    });

    it("ensures all mint addresses are valid strings", () => {
      for (const asset of FAUCET_ASSETS) {
        expect(asset.mint).to.be.a("string");
        expect(asset.mint.length).to.be.at.least(32);
      }
    });
  });

  describe("2. Per-Wallet Isolation on Same Device", () => {
    const WALLET_A = "7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE";
    const WALLET_B = "9zL8RXx39lD8v3zDrgH88l8uI6wT0x98a2fY3z4A5B6C";

    it("records claims independently per wallet address", () => {
      recordClaim(WALLET_A, "NVDA");

      const cdA = getCooldownRemaining(WALLET_A, "NVDA");
      const cdB = getCooldownRemaining(WALLET_B, "NVDA");

      expect(cdA).to.be.greaterThan(0);
      expect(cdA).to.be.at.most(FAUCET_COOLDOWN_MS);
      // Wallet B must NOT be blocked by Wallet A's claim on the same machine
      expect(cdB).to.equal(0);
    });

    it("isolates cooldowns across different assets for the same wallet", () => {
      recordClaim(WALLET_A, "NVDA");

      const nvdaCd = getCooldownRemaining(WALLET_A, "NVDA");
      const aaplCd = getCooldownRemaining(WALLET_A, "AAPL");
      const usdcCd = getCooldownRemaining(WALLET_A, "USDC");

      expect(nvdaCd).to.be.greaterThan(0);
      expect(aaplCd).to.equal(0);
      expect(usdcCd).to.equal(0);
    });
  });

  describe("3. Cooldown Calculation & Formatting", () => {
    it("formats minutes and seconds accurately", () => {
      expect(formatCooldown(45 * 60 * 1000)).to.equal("45m 00s");
      expect(formatCooldown(5 * 60 * 1000 + 12 * 1000)).to.equal("5m 12s");
      expect(formatCooldown(59 * 1000)).to.equal("0m 59s");
    });

    it("formats hours and minutes for durations >= 1 hour", () => {
      expect(formatCooldown(3600 * 1000)).to.equal("1h 0m");
      expect(formatCooldown(3600 * 1000 + 900 * 1000)).to.equal("1h 15m");
    });
  });

  describe("4. Error Sanitization & Devnet Protection", () => {
    it("translates 429 rate limits into human-readable advice", () => {
      const err = new Error("429 Too Many Requests: rate limit exceeded");
      const sanitized = sanitizeFaucetError(err);
      expect(sanitized).to.include("Devnet rate limit reached");
    });

    it("translates insufficient lamports into authority explanation", () => {
      const err = new Error("Transfer: insufficient lamports 1029360, need 1488440");
      const sanitized = sanitizeFaucetError(err);
      expect(sanitized).to.include("Faucet authority has insufficient Devnet SOL");
    });

    it("preserves standard actionable error messages", () => {
      const err = new Error("Invalid Solana address: bad_pubkey");
      expect(sanitizeFaucetError(err)).to.equal("Invalid Solana address: bad_pubkey");
    });
  });

  describe("5. Serverless Faucet Authority & Secret Separation", () => {
    // Generate a temporary 64-byte keypair for testing
    const testKeypair = Keypair.generate();
    const validJsonArray = JSON.stringify(Array.from(testKeypair.secretKey));
    const validCommaSeparated = Array.from(testKeypair.secretKey).join(",");

    it("works with valid FAUCET_AUTHORITY_KEY (JSON array)", () => {
      const auth = getFaucetAuthority(validJsonArray);
      expect(auth).to.not.be.null;
      expect(auth!.publicKey.toBase58()).to.equal(testKeypair.publicKey.toBase58());
    });

    it("works with valid FAUCET_AUTHORITY_KEY (comma-separated)", () => {
      const auth = getFaucetAuthority(validCommaSeparated);
      expect(auth).to.not.be.null;
      expect(auth!.publicKey.toBase58()).to.equal(testKeypair.publicKey.toBase58());
    });

    it("fails safely (returns null) when FAUCET_AUTHORITY_KEY is absent", () => {
      const prev = process.env.FAUCET_AUTHORITY_KEY;
      delete process.env.FAUCET_AUTHORITY_KEY;
      try {
        const auth = getFaucetAuthority();
        expect(auth).to.be.null;
      } finally {
        if (prev) process.env.FAUCET_AUTHORITY_KEY = prev;
      }
    });

    it("strictly does NOT use DEPLOYER_KEYPAIR when FAUCET_AUTHORITY_KEY is absent", () => {
      const prevFaucet = process.env.FAUCET_AUTHORITY_KEY;
      const prevDeployer = process.env.DEPLOYER_KEYPAIR;
      delete process.env.FAUCET_AUTHORITY_KEY;
      process.env.DEPLOYER_KEYPAIR = validJsonArray;

      try {
        const auth = getFaucetAuthority();
        // MUST return null, strictly refusing to fall back to DEPLOYER_KEYPAIR
        expect(auth).to.be.null;
      } finally {
        if (prevFaucet) process.env.FAUCET_AUTHORITY_KEY = prevFaucet;
        else delete process.env.FAUCET_AUTHORITY_KEY;

        if (prevDeployer) process.env.DEPLOYER_KEYPAIR = prevDeployer;
        else delete process.env.DEPLOYER_KEYPAIR;
      }
    });

    it("rejects malformed or invalid-length keys safely without throwing", () => {
      expect(getFaucetAuthority("not_a_key")).to.be.null;
      expect(getFaucetAuthority("[1, 2, 3]")).to.be.null; // only 3 bytes, requires 64
      expect(getFaucetAuthority("")).to.be.null;
      expect(getFaucetAuthority("   ")).to.be.null;
    });

    it("verifies that no runtime code in api/ or app/ reads DEPLOYER_KEYPAIR", () => {
      const fs = require("fs");
      const path = require("path");

      function scanDir(dir: string): string[] {
        let results: string[] = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name !== "node_modules" && entry.name !== ".git" && entry.name !== "dist") {
              results = results.concat(scanDir(fullPath));
            }
          } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
            const content = fs.readFileSync(fullPath, "utf-8");
            if (content.includes("DEPLOYER_KEYPAIR")) {
              results.push(fullPath);
            }
          }
        }
        return results;
      }

      const apiHits = scanDir(path.resolve(__dirname, "../api"));
      const appHits = scanDir(path.resolve(__dirname, "../app/src"));

      expect(apiHits).to.deep.equal([]);
      expect(appHits).to.deep.equal([]);
    });

    it("verifies deployment tooling still works with DEPLOYER_KEYPAIR", () => {
      const fs = require("fs");
      const path = require("path");
      const os = require("os");
      const { loadKeypair } = require("../scripts/lib/config");

      const tmpKeyPath = path.join(os.tmpdir(), `circuit_test_deployer_${Date.now()}.json`);
      fs.writeFileSync(tmpKeyPath, validJsonArray);

      try {
        const loaded = loadKeypair(tmpKeyPath);
        expect(loaded).to.not.be.null;
        expect(loaded.publicKey.toBase58()).to.equal(testKeypair.publicKey.toBase58());
      } finally {
        if (fs.existsSync(tmpKeyPath)) fs.unlinkSync(tmpKeyPath);
      }
    });

    it("verifies Gemini server route handles requests safely without crashing or leaking keys", async () => {
      const chatHandler = require("../api/agent/chat").default;

      let responseContent = "";
      let statusCode = 200;
      const headers: Record<string, string> = {};

      const mockReq = {
        method: "POST",
        body: {
          messages: [{ role: "user", content: "What can I do with my position right now?" }],
          snapshot: {
            walletAddress: "7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE",
            controlMode: "MANUAL",
            hasActiveAuthority: false,
            riskRatchetState: "SAFE",
            isMarketOpen: true,
            totalCollateralUsd: 1500,
            totalDebtUsd: 200,
            availableCreditUsd: 420,
            healthFactor: 2.15,
            positions: [{ symbol: "NVDA", collateralValueUsd: 1500, debtUi: 200, mint: "CARqKy5GTCxz5G1tFiYA96A3Q8jaUE9Vppk7cjGJxRqq" }],
            markets: [{ symbol: "NVDA", price: 138.25, change24hPct: 3.4 }],
            onChainAuthorities: [],
          },
        },
      };

      const mockRes = {
        setHeader: (k: string, v: string) => { headers[k] = v; },
        status: (code: number) => { statusCode = code; return mockRes; },
        write: (chunk: string) => { responseContent += chunk; },
        end: () => {},
      };

      await chatHandler(mockReq, mockRes);

      expect(statusCode).to.equal(200);
      expect(responseContent).to.be.a("string");
      expect(responseContent.length).to.be.greaterThan(0);
      // Response must NOT contain any secret key material
      expect(responseContent).to.not.include("GEMINI_AI_KEY=");
      expect(responseContent).to.not.include("FAUCET_AUTHORITY_KEY=");
      expect(responseContent).to.not.include("DEPLOYER_KEYPAIR=");
    });
  });
});
