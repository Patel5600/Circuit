import { expect } from "chai";
import {
  calculate24hChange,
} from "../app/src/lib/market-data/historical";
import { HistoricalReference } from "../app/src/lib/market-data/types";
import {
  normalizePythPrice,
  calculateConservativePrice,
  analyzePortfolioRisk,
  calculateStressScenarios,
} from "../app/src/lib/risk/portfolio";
import {
  isValidRatchetTransition,
  assertValidRatchetTransition,
  evaluateRatchetState,
  DEFAULT_RATCHET_THRESHOLDS,
  RiskRatchetState,
} from "../app/src/lib/risk/ratchet";

describe("Circuit Risk Engine Unit Tests", () => {
  /* -------------------------------------------------------------------------- */
  /*  1. 24h Percent Calculation                                                */
  /* -------------------------------------------------------------------------- */
  describe("1. 24h Price Change & Percentage Calculation", () => {
    it("computes correct positive percentage movement", () => {
      const ref: HistoricalReference = {
        symbol: "NVDA",
        referencePriceUsd: 100.0,
        referenceTimestamp: Date.now() / 1000 - 86400,
        source: "Market Close Reference",
        status: "AVAILABLE",
      };

      const result = calculate24hChange(125.0, ref);
      expect(result.status).to.equal("AVAILABLE");
      expect(result.change24hUsd).to.be.closeTo(25.0, 0.0001);
      expect(result.change24hPercent).to.be.closeTo(25.0, 0.0001);
    });

    it("computes correct negative percentage movement", () => {
      const ref: HistoricalReference = {
        symbol: "AAPL",
        referencePriceUsd: 200.0,
        referenceTimestamp: Date.now() / 1000 - 86400,
        source: "Market Close Reference",
        status: "AVAILABLE",
      };

      const result = calculate24hChange(170.0, ref);
      expect(result.status).to.equal("AVAILABLE");
      expect(result.change24hUsd).to.be.closeTo(-30.0, 0.0001);
      expect(result.change24hPercent).to.be.closeTo(-15.0, 0.0001);
    });

    it("returns UNAVAILABLE and null when reference status is UNAVAILABLE", () => {
      const ref: HistoricalReference = {
        symbol: "NVDA",
        referencePriceUsd: null,
        referenceTimestamp: null,
        source: "Market Provider",
        status: "UNAVAILABLE",
        reason: "24h change unavailable",
      };

      const result = calculate24hChange(148.5, ref);
      expect(result.status).to.equal("UNAVAILABLE");
      expect(result.change24hUsd).to.be.null;
      expect(result.change24hPercent).to.be.null;
    });

    it("returns UNAVAILABLE when reference price is zero or negative", () => {
      const ref: HistoricalReference = {
        symbol: "TSLA",
        referencePriceUsd: 0,
        referenceTimestamp: 123456,
        source: "Market Provider",
        status: "AVAILABLE",
      };

      const result = calculate24hChange(220.0, ref);
      expect(result.status).to.equal("UNAVAILABLE");
      expect(result.change24hPercent).to.be.null;
    });
  });

  /* -------------------------------------------------------------------------- */
  /*  2. Pyth Exponent Normalization & Conservative Price Lower-Bound           */
  /* -------------------------------------------------------------------------- */
  describe("2. Pyth Exponent Normalization & Conservative Price Lower-Bound", () => {
    it("normalizes integer price and negative exponent to USD float", () => {
      // NVDA: raw 14850000000 with expo -8 -> 148.50
      const price = normalizePythPrice(14850000000n, -8);
      expect(price).to.be.closeTo(148.5, 0.0001);

      // USDC: raw 1000100 with expo -6 -> 1.0001
      const usdc = normalizePythPrice(1000100, -6);
      expect(usdc).to.be.closeTo(1.0001, 0.0001);
    });

    it("computes conservative collateral price: p_conservative = max(0, price - conf)", () => {
      const price = 148.5;
      const conf = 1.25;
      const conservative = calculateConservativePrice(price, conf);
      expect(conservative).to.be.closeTo(147.25, 0.0001);
    });

    it("clamps conservative price to zero when confidence exceeds price", () => {
      // Severe uncertainty shock where conf > price
      const conservative = calculateConservativePrice(50.0, 65.0);
      expect(conservative).to.equal(0);
    });
  });

  /* -------------------------------------------------------------------------- */
  /*  3. Portfolio Weights & Concentration Penalty Math                         */
  /* -------------------------------------------------------------------------- */
  describe("3. Portfolio Weights & C_max > 40% Concentration Penalty Math", () => {
    it("applies 0 bps haircut when all asset weights are <= 40%", () => {
      const assets = [
        {
          symbol: "NVDA",
          name: "NVIDIA",
          collateralUi: 10,
          priceUsd: 100,
          confidenceUsd: 0.5,
          confBps: 20,
          baseLtvBps: 7000,
          liqThresholdBps: 8000,
          oracleHealthy: true,
          marketOpen: true,
        },
        {
          symbol: "AAPL",
          name: "Apple",
          collateralUi: 10,
          priceUsd: 100,
          confidenceUsd: 0.5,
          confBps: 20,
          baseLtvBps: 7000,
          liqThresholdBps: 8000,
          oracleHealthy: true,
          marketOpen: true,
        },
        {
          symbol: "MSFT",
          name: "Microsoft",
          collateralUi: 10,
          priceUsd: 100,
          confidenceUsd: 0.5,
          confBps: 20,
          baseLtvBps: 7000,
          liqThresholdBps: 8000,
          oracleHealthy: true,
          marketOpen: true,
        },
      ];

      const analysis = analyzePortfolioRisk(assets, 0);
      expect(analysis.maxWeightPct).to.be.closeTo(33.33, 0.1);
      expect(analysis.concentrationPenaltyBps).to.equal(0);
      expect(analysis.effectiveLtvBps).to.equal(7000);
    });

    it("applies (C_max - 40) * 36 bps haircut when C_max > 40%", () => {
      // 50/50 dual collateral portfolio: C_max = 50%
      // Penalty: (50 - 40) * 36 = 360 bps
      const assets5050 = [
        {
          symbol: "NVDA",
          name: "NVIDIA",
          collateralUi: 10,
          priceUsd: 100,
          confidenceUsd: 0.2,
          confBps: 20,
          baseLtvBps: 7000,
          liqThresholdBps: 8000,
          oracleHealthy: true,
          marketOpen: true,
        },
        {
          symbol: "AAPL",
          name: "Apple",
          collateralUi: 10,
          priceUsd: 100,
          confidenceUsd: 0.2,
          confBps: 20,
          baseLtvBps: 7000,
          liqThresholdBps: 8000,
          oracleHealthy: true,
          marketOpen: true,
        },
      ];

      const analysis5050 = analyzePortfolioRisk(assets5050, 0);
      expect(analysis5050.maxWeightPct).to.equal(50);
      expect(analysis5050.concentrationPenaltyBps).to.equal(360);
      expect(analysis5050.effectiveLtvBps).to.equal(7000 - 360); // 6640 bps (66.4%)

      // 90/10 concentrated portfolio: C_max = 90%
      // Penalty: (90 - 40) * 36 = 1800 bps
      const assets9010 = [
        {
          symbol: "NVDA",
          name: "NVIDIA",
          collateralUi: 90,
          priceUsd: 100,
          confidenceUsd: 0.2,
          confBps: 20,
          baseLtvBps: 7000,
          liqThresholdBps: 8000,
          oracleHealthy: true,
          marketOpen: true,
        },
        {
          symbol: "AAPL",
          name: "Apple",
          collateralUi: 10,
          priceUsd: 100,
          confidenceUsd: 0.2,
          confBps: 20,
          baseLtvBps: 7000,
          liqThresholdBps: 8000,
          oracleHealthy: true,
          marketOpen: true,
        },
      ];

      const analysis9010 = analyzePortfolioRisk(assets9010, 0);
      expect(analysis9010.maxWeightPct).to.equal(90);
      expect(analysis9010.concentrationPenaltyBps).to.equal(1800);
      expect(analysis9010.effectiveLtvBps).to.equal(7000 - 1800); // 5200 bps (52.0%)
    });

    it("respects the 3000 bps (30%) Effective LTV safety floor", () => {
      // 100% single-asset portfolio with severe oracle penalty
      const singleAsset = [
        {
          symbol: "NVDA",
          name: "NVIDIA",
          collateralUi: 100,
          priceUsd: 100,
          confidenceUsd: 20,
          confBps: 1500, // extreme confidence spread
          baseLtvBps: 6000,
          liqThresholdBps: 7500,
          oracleHealthy: true,
          marketOpen: true,
        },
      ];

      const analysis = analyzePortfolioRisk(singleAsset, 0);
      expect(analysis.effectiveLtvBps).to.be.at.least(3000);
    });
  });

  /* -------------------------------------------------------------------------- */
  /*  4. Risk Ratchet State Transition Logic & Recovery Invariants              */
  /* -------------------------------------------------------------------------- */
  describe("4. Risk Ratchet State Transitions & Monotonic Recovery", () => {
    it("allows fast tightening to any deteriorated state", () => {
      expect(isValidRatchetTransition("SAFE", "RESTRICTED")).to.be.true;
      expect(isValidRatchetTransition("SAFE", "DEFENSIVE")).to.be.true;
      expect(isValidRatchetTransition("SAFE", "EMERGENCY")).to.be.true;
      expect(isValidRatchetTransition("RESTRICTED", "EMERGENCY")).to.be.true;
      expect(isValidRatchetTransition("DEFENSIVE", "EMERGENCY")).to.be.true;
    });

    it("strictly permits only monotonic step-by-step recovery", () => {
      expect(isValidRatchetTransition("EMERGENCY", "DEFENSIVE")).to.be.true;
      expect(isValidRatchetTransition("DEFENSIVE", "RESTRICTED")).to.be.true;
      expect(isValidRatchetTransition("RESTRICTED", "SAFE")).to.be.true;
    });

    it("rejects illegal recovery jumps", () => {
      expect(isValidRatchetTransition("EMERGENCY", "SAFE")).to.be.false;
      expect(isValidRatchetTransition("EMERGENCY", "RESTRICTED")).to.be.false;
      expect(isValidRatchetTransition("DEFENSIVE", "SAFE")).to.be.false;
    });

    it("assertValidRatchetTransition throws on illegal jump (EMERGENCY -> SAFE)", () => {
      expect(() => {
        assertValidRatchetTransition("EMERGENCY", "SAFE");
      }).to.throw(/Illegal Risk Ratchet transition from EMERGENCY directly to SAFE/);

      expect(() => {
        assertValidRatchetTransition("EMERGENCY", "RESTRICTED");
      }).to.throw(/Illegal Risk Ratchet transition/);
    });

    it("enforces hysteresis recovery buffer (conf < 30 bps required to exit RESTRICTED to SAFE)", () => {
      // 40 bps is below the 50 bps enter threshold, but above 30 bps recovery threshold
      const evaluated = evaluateRatchetState("RESTRICTED", 40, true, false, 30, 5);
      expect(evaluated.nextState).to.equal("RESTRICTED");
      expect(evaluated.recoveryBufferActive).to.be.true;

      // When conf drops to 20 bps (< 30 bps) with 5 healthy observations, recovery succeeds
      const recovered = evaluateRatchetState("RESTRICTED", 20, true, false, 30, 5);
      expect(recovered.nextState).to.equal("SAFE");
    });
  });

  /* -------------------------------------------------------------------------- */
  /*  5. Stress Scenario Projections (-5%, -10%, -20%)                          */
  /* -------------------------------------------------------------------------- */
  describe("5. Stress Scenario Projections (-5%, -10%, -20%)", () => {
    it("accurately projects collateral, borrow capacity, and health factor across drops", () => {
      const collateral = 10_000;
      const debt = 5_000;
      const baseLtvBps = 7000;
      const liqThresholdBps = 8000;

      const scenarios = calculateStressScenarios(collateral, debt, baseLtvBps, liqThresholdBps);
      expect(scenarios).to.have.length(3);

      const [s5, s10, s20] = scenarios;

      // -5% drop
      expect(s5.dropPct).to.equal(-5);
      expect(s5.stressedCollateral).to.be.closeTo(9_500, 0.01);
      // Stressed HF: (9,500 * 0.8) / 5,000 = 1.52
      expect(s5.stressedHf).to.be.closeTo(1.52, 0.01);
      expect(s5.isLiquidatable).to.be.false;
      expect(s5.projectedState).to.equal("RESTRICTED");

      // -10% drop
      expect(s10.dropPct).to.equal(-10);
      expect(s10.stressedCollateral).to.be.closeTo(9_000, 0.01);
      // Stressed HF: (9,000 * 0.8) / 5,000 = 1.44
      expect(s10.stressedHf).to.be.closeTo(1.44, 0.01);
      expect(s10.isLiquidatable).to.be.false;

      // -20% drop
      expect(s20.dropPct).to.equal(-20);
      expect(s20.stressedCollateral).to.be.closeTo(8_000, 0.01);
      // Stressed HF: (8,000 * 0.8) / 5,000 = 1.28
      expect(s20.stressedHf).to.be.closeTo(1.28, 0.01);
      expect(s20.projectedState).to.equal("DEFENSIVE");
    });

    it("flags liquidation and projects EMERGENCY state when stressed HF falls below 1.0", () => {
      const collateral = 10_000;
      const debt = 7_000; // Highly leveraged
      const baseLtvBps = 7000;
      const liqThresholdBps = 8000;

      const scenarios = calculateStressScenarios(collateral, debt, baseLtvBps, liqThresholdBps);
      const s20 = scenarios[2]; // -20% drop

      // Collateral becomes 8,000. Stressed HF: (8,000 * 0.8) / 7,000 = 0.914 < 1.00
      expect(s20.stressedHf).to.be.lessThan(1.0);
      expect(s20.isLiquidatable).to.be.true;
      expect(s20.projectedState).to.equal("EMERGENCY");
    });
  });
});
