import { expect } from "chai";
import {
  normalizePythPrice,
  calculateConservativePrice,
  analyzePortfolioRisk,
  BPS,
} from "../app/src/lib/risk/portfolio";
import {
  formatMoney,
  formatCurrency,
  formatMoneyCompact,
  formatTokens,
  formatHealthFactor,
  formatPercent,
} from "../app/src/lib/format";

describe("Fixed-Point Math & Decimal Safety Tests", () => {
  describe("1. Pyth Raw Exponent Normalization", () => {
    it("normalizes -8 exponent (standard Pyth price feeds)", () => {
      const rawPrice = 14850000000n; // 148.50 * 10^8
      const price = normalizePythPrice(rawPrice, -8);
      expect(price).to.be.closeTo(148.5, 0.0001);
    });

    it("normalizes -6 exponent accurately", () => {
      const rawPrice = 250000000n; // 250.00 * 10^6
      const price = normalizePythPrice(rawPrice, -6);
      expect(price).to.be.closeTo(250.0, 0.0001);
    });

    it("handles zero price and zero confidence without throwing", () => {
      expect(normalizePythPrice(0n, -8)).to.equal(0);
      expect(calculateConservativePrice(0, 0)).to.equal(0);
    });

    it("clamps conservative price to 0 when confidence exceeds price", () => {
      // If price = 100 and confidence = 120, conservative price must never be negative
      const conservative = calculateConservativePrice(100, 120);
      expect(conservative).to.equal(0);
    });
  });

  describe("2. BPS Math & Penalty Invariants", () => {
    it("preserves BPS constant as 10,000 (100%)", () => {
      expect(BPS).to.equal(10_000);
    });

    it("ensures effective LTV never exceeds base LTV", () => {
      const analysis = analyzePortfolioRisk([
        {
          symbol: "NVDA",
          name: "NVIDIA",
          collateralUi: 10,
          priceUsd: 140,
          confidenceUsd: 0.5,
          confBps: 35,
          baseLtvBps: 7000,
          liqThresholdBps: 8000,
          oracleHealthy: true,
          marketOpen: true,
        },
      ]);

      expect(analysis.effectiveLtvBps).to.be.at.most(analysis.weightedBaseLtvBps);
      expect(analysis.effectiveLtvBps).to.be.at.least(0);
    });

    it("computes concentration penalty accurately according to (C_max - 40) * 36 bps formula", () => {
      // 100% single asset: (100 - 40) * 36 = 2160 bps
      const single = analyzePortfolioRisk([
        {
          symbol: "NVDA",
          name: "NVIDIA",
          collateralUi: 100,
          priceUsd: 100,
          confidenceUsd: 0.1,
          confBps: 10,
          baseLtvBps: 7000,
          liqThresholdBps: 8000,
          oracleHealthy: true,
          marketOpen: true,
        },
      ]);
      expect(single.concentrationPenaltyBps).to.equal(2160);

      // Balanced 50/50 dual asset: max weight = 50%, (50 - 40) * 36 = 360 bps
      const dual = analyzePortfolioRisk([
        {
          symbol: "NVDA",
          name: "NVIDIA",
          collateralUi: 50,
          priceUsd: 100,
          confidenceUsd: 0.1,
          confBps: 10,
          baseLtvBps: 7000,
          liqThresholdBps: 8000,
          oracleHealthy: true,
          marketOpen: true,
        },
        {
          symbol: "AAPL",
          name: "Apple",
          collateralUi: 50,
          priceUsd: 100,
          confidenceUsd: 0.1,
          confBps: 10,
          baseLtvBps: 7000,
          liqThresholdBps: 8000,
          oracleHealthy: true,
          marketOpen: true,
        },
      ]);
      expect(dual.concentrationPenaltyBps).to.equal(360);
    });
  });

  describe("3. UI Token & Lamports Decimal Conversions", () => {
    it("converts 6-decimal token amounts accurately to raw units", () => {
      const uiAmount = 50.123456;
      const decimals = 6;
      const rawUnits = BigInt(Math.round(uiAmount * 10 ** decimals));
      expect(rawUnits).to.equal(50123456n);
    });

    it("converts 9-decimal SOL amounts accurately to lamports", () => {
      const sol = 1.85;
      const decimals = 9;
      const lamports = BigInt(Math.round(sol * 10 ** decimals));
      expect(lamports).to.equal(1850000000n);
    });

    it("safely handles fractional dust without losing whole units", () => {
      const dust = 0.000001;
      const raw = BigInt(Math.round(dust * 1e6));
      expect(raw).to.equal(1n);
    });
  });

  describe("4. Number & Financial Formatting Safety", () => {
    it("handles non-finite values safely in formatMoney", () => {
      expect(formatMoney(NaN)).to.equal("0.00");
      expect(formatMoney(Infinity)).to.equal("0.00");
      expect(formatMoney(-Infinity)).to.equal("0.00");
    });

    it("formats currency with proper dollar sign and precision", () => {
      expect(formatCurrency(1250.5)).to.equal("$1,250.50");
      expect(formatCurrency(0)).to.equal("$0.00");
    });

    it("formats compact money for headline statistics", () => {
      expect(formatMoneyCompact(15000)).to.equal("$15.0K");
      expect(formatMoneyCompact(2500000)).to.equal("$2.50M");
      expect(formatMoneyCompact(1200000000)).to.equal("$1.20B");
      expect(formatMoneyCompact(350)).to.equal("$350.00");
    });

    it("formats health factor from BPS without infinity glyph", () => {
      expect(formatHealthFactor(null)).to.equal("No debt");
      expect(formatHealthFactor(15000)).to.equal("1.50");
      expect(formatHealthFactor(10000)).to.equal("1.00");
      expect(formatHealthFactor(8500)).to.equal("0.85");
    });

    it("formats percent from BPS correctly", () => {
      expect(formatPercent(7000)).to.equal("70%");
      expect(formatPercent(7550, 1)).to.equal("75.5%");
      expect(formatPercent(35, 2)).to.equal("0.35%");
    });
  });
});
