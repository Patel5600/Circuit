import { expect } from "chai";
import {
  FAUCET_ASSETS,
  FAUCET_COOLDOWN_MS,
  formatCooldown,
  sanitizeFaucetError,
  getCooldownRemaining,
  recordClaim,
} from "../app/src/lib/faucet";

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
});
