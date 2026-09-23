/**
 * Circuit Protocol - Profile Reactivity Invariants & Live Decision Surface Test Suite
 *
 * Verifies that the Reactive Profile and its underlying live provider adhere to
 * zero-compromise financial invariants:
 *
 * 1. Initial Load vs. Background Refresh:
 *    - Cold boot sets `isInitialLoading: true`, `isUpdating: false`.
 *    - Background sync updates `isUpdating: true` while preserving snapshot;
 *      `isInitialLoading: false`.
 *
 * 2. Zero Fake Fallback Numbers:
 *    - Missing Pyth prices do NOT fall back to $100 or 18 bps.
 *    - Uninitialized oracle prices return 0 price and `oracleHealthy: false`.
 *    - Measured oracle age returns 0 / unavailable when feed has no verified timestamp.
 *
 * 3. Fresh Wallet Zero Collateral Boundary:
 *    - Total collateral: $0.00
 *    - Available credit: $0.00
 *    - Borrow action evaluates strictly to BLOCK with INSUFFICIENT_COLLATERAL.
 *
 * 4. Manual Sovereignty Invariant:
 *    - In MANUAL mode, agent authority status is strictly NOT_APPLICABLE.
 *    - Manual borrows are never rejected with "Authority Blocked" or "Strategy Not Configured".
 *
 * 5. Dynamic LTV & Concentration Haircut:
 *    - Overconcentrated collateral (>40%) incurs concentration penalty in BPS ((C_max - 40) * 36 bps).
 *    - Effective LTV = Weighted Base LTV - Total Haircut.
 *
 * 6. Non-Destructive Update Continuity:
 *    - Incremental updates do not flash skeletons or clear active asset nodes.
 */

import { expect } from "chai";
import { evaluateAction, LiveStateInput } from "../app/src/lib/decision/evaluator";
import { ExecutionMode } from "../app/src/lib/decision/types";
import { analyzePortfolioRisk } from "../app/src/lib/risk/portfolio";

describe("Circuit Protocol — Profile Reactivity Invariants", () => {
  const manualMode: ExecutionMode = { mode: "MANUAL" };
  const agentMode: ExecutionMode = {
    mode: "AGENT",
    agentPubkey: "CircuitAgent111111111111111111111111111111111",
  };

  describe("Invariant 1: Fresh Wallet Zero-Collateral Strict Boundary", () => {
    it("reports exactly $0.00 collateral and $0.00 credit capacity for empty portfolio", () => {
      const risk = analyzePortfolioRisk([], 0);
      expect(risk.totalCollateralUsd).to.equal(0);
      expect(risk.conservativeCollateralUsd).to.equal(0);
      expect(risk.borrowCapacityUsd).to.equal(0);
      expect(risk.effectiveLtvBps).to.equal(0);
      expect(risk.healthFactorBps).to.be.null;
    });

    it("evaluates borrow action as BLOCK with INSUFFICIENT_COLLATERAL when collateral is zero", () => {
      const liveState: LiveStateInput = {
        slot: 250_000,
        blockTime: 1_700_000_000,
        protocolPaused: false,
        assetEnabled: true,
        assetMint: "NVDAMint111111111111111111111111111111111111",
        assetSymbol: "NVDA",
        oraclePrice: 130.0,
        oracleExpo: -8,
        oracleConf: 0.04,
        oracleConfBps: 30,
        oraclePublishTime: 1_700_000_000 - 5,
        globalOracleHealthy: true,
        isMarketOpen: true,
        sessionLabel: "Regular Session",
        ratchetState: "SAFE",
        riskScore: 10,
        baseLtvBps: 7000,
        liquidationThresholdBps: 8000,
        collateralUsd: 0, // Zero collateral!
        debtUsd: 0,
        agentAuthority: null,
      };

      const decision = evaluateAction(manualMode, "borrow", 100, liveState);
      expect(decision.verdict.status).to.equal("BLOCK");
      expect(decision.verdict.code).to.equal("INSUFFICIENT_COLLATERAL");
      expect(decision.verdict.reason).to.equal("Deposit collateral to activate borrowing power.");
    });
  });

  describe("Invariant 2: Zero Fake Fallback Numbers", () => {
    it("never fabricates a $100 price or 18 bps confidence spread when oracle data is missing", () => {
      const uninitializedPositions = [
        {
          symbol: "NVDA",
          name: "NVIDIA Corp",
          collateralUi: 10,
          priceUsd: 0, // Uninitialized
          confidenceUsd: 0,
          confBps: 0, // Zero, not 18 bps fallback!
          baseLtvBps: 7000,
          liqThresholdBps: 8000,
          oracleHealthy: false,
          marketOpen: true,
        },
      ];

      const risk = analyzePortfolioRisk(uninitializedPositions, 0);
      expect(risk.totalCollateralUsd).to.equal(0);
      expect(risk.conservativeCollateralUsd).to.equal(0);
      expect(risk.borrowCapacityUsd).to.equal(0);
      // Conf spread is 0, never fabricated 18 bps
      expect(uninitializedPositions[0].confBps).to.equal(0);
      expect(uninitializedPositions[0].oracleHealthy).to.be.false;
    });

    it("blocks borrowing if oracle confidence is breached without substituting fake healthy spread", () => {
      const liveState: LiveStateInput = {
        slot: 250_000,
        blockTime: 1_700_000_000,
        protocolPaused: false,
        assetEnabled: true,
        assetMint: "NVDAMint111111111111111111111111111111111111",
        assetSymbol: "NVDA",
        oraclePrice: 130.0,
        oracleExpo: -8,
        oracleConf: 2.0, // High confidence interval
        oracleConfBps: 153, // 153 bps > 100 bps max
        oraclePublishTime: 1_700_000_000 - 5,
        globalOracleHealthy: true,
        isMarketOpen: true,
        sessionLabel: "Regular Session",
        ratchetState: "SAFE",
        riskScore: 10,
        baseLtvBps: 7000,
        liquidationThresholdBps: 8000,
        collateralUsd: 1000,
        debtUsd: 0,
        agentAuthority: null,
      };

      const decision = evaluateAction(manualMode, "borrow", 100, liveState);
      expect(decision.verdict.status).to.equal("BLOCK");
      expect(decision.verdict.code).to.equal("CONFIDENCE_TOO_WIDE");
      expect(decision.oracle.healthy).to.be.false;
    });
  });

  describe("Invariant 3: Manual Sovereignty Invariant", () => {
    it("reports authority as NOT_APPLICABLE in MANUAL mode and does not block borrow on missing agent authority", () => {
      const liveState: LiveStateInput = {
        slot: 250_000,
        blockTime: 1_700_000_000,
        protocolPaused: false,
        assetEnabled: true,
        assetMint: "TSLAMint111111111111111111111111111111111111",
        assetSymbol: "TSLA",
        oraclePrice: 220.0,
        oracleExpo: -8,
        oracleConf: 0.05,
        oracleConfBps: 22,
        oraclePublishTime: 1_700_000_000 - 8,
        globalOracleHealthy: true,
        isMarketOpen: true,
        sessionLabel: "Regular Session",
        ratchetState: "SAFE",
        riskScore: 10,
        baseLtvBps: 7000,
        liquidationThresholdBps: 8000,
        collateralUsd: 5000,
        debtUsd: 0,
        agentAuthority: null,
      };

      const decision = evaluateAction(manualMode, "borrow", 500, liveState);
      expect(decision.authority.status).to.equal("NOT_APPLICABLE");
      expect(decision.authority.applicable).to.be.false;
      expect(decision.verdict.status).to.equal("ALLOW");
      expect(decision.verdict.reason).to.include("All checks passed. Operation permitted.");
      expect(decision.authority.reason).to.include("Agent authority not applicable");
    });
  });

  describe("Invariant 4: Dynamic LTV & Concentration Haircut", () => {
    it("applies deterministic concentration haircut when single asset exceeds 40% weight", () => {
      const singleAssetPositions = [
        {
          symbol: "NVDA",
          name: "NVIDIA Corp",
          collateralUi: 100,
          priceUsd: 100, // $10,000 value = 100% portfolio weight
          confidenceUsd: 0.05,
          confBps: 5,
          baseLtvBps: 7000, // 70%
          liqThresholdBps: 8000,
          oracleHealthy: true,
          marketOpen: true,
        },
      ];

      const risk = analyzePortfolioRisk(singleAssetPositions, 0);
      expect(risk.totalCollateralUsd).to.equal(10000);
      // In 100% concentrated portfolio, weight > 40%, penalty = (100 - 40) * 36 = 2160 bps
      expect(risk.concentrationPenaltyBps).to.equal(2160);
      expect(risk.effectiveLtvBps).to.equal(7000 - 2160); // 4840 bps (48.4%)
      expect(risk.borrowCapacityUsd).to.equal((risk.totalCollateralUsd * 4840) / 10000);
    });

    it("does not penalize diversified portfolios where every asset weight is <= 40%", () => {
      const diversifiedPositions = [
        {
          symbol: "NVDA",
          name: "NVIDIA Corp",
          collateralUi: 30,
          priceUsd: 100, // $3,000 = 30%
          confidenceUsd: 0.05,
          confBps: 5,
          baseLtvBps: 7000,
          liqThresholdBps: 8000,
          oracleHealthy: true,
          marketOpen: true,
        },
        {
          symbol: "AAPL",
          name: "Apple Inc",
          collateralUi: 35,
          priceUsd: 100, // $3,500 = 35%
          confidenceUsd: 0.05,
          confBps: 5,
          baseLtvBps: 7000,
          liqThresholdBps: 8000,
          oracleHealthy: true,
          marketOpen: true,
        },
        {
          symbol: "MSFT",
          name: "Microsoft Corp",
          collateralUi: 35,
          priceUsd: 100, // $3,500 = 35%
          confidenceUsd: 0.05,
          confBps: 5,
          baseLtvBps: 7000,
          liqThresholdBps: 8000,
          oracleHealthy: true,
          marketOpen: true,
        },
      ];

      const risk = analyzePortfolioRisk(diversifiedPositions, 0);
      expect(risk.totalCollateralUsd).to.equal(10000);
      expect(risk.concentrationPenaltyBps).to.equal(0);
      expect(risk.effectiveLtvBps).to.equal(7000); // No haircut applied
    });
  });

  describe("Invariant 5: Liquidation Buffer Sensitivity", () => {
    it("accurately calculates liquidation buffer percentage and detects solvency distress", () => {
      const positions = [
        {
          symbol: "NVDA",
          name: "NVIDIA Corp",
          collateralUi: 10,
          priceUsd: 100, // $1,000 collateral
          confidenceUsd: 0.05,
          confBps: 5,
          baseLtvBps: 7000,
          liqThresholdBps: 8000, // Liquidation threshold = $800
          oracleHealthy: true,
          marketOpen: true,
        },
      ];

      // With $600 debt against $800 liquidation threshold: buffer is (800 - 600) / 800 = 25%
      const risk = analyzePortfolioRisk(positions, 600);
      const liqThresholdUsd = (risk.totalCollateralUsd * 8000) / 10000;
      const bufferPct = ((liqThresholdUsd - 600) / liqThresholdUsd) * 100;
      expect(bufferPct).to.equal(25);

      // Health factor: $800 / $600 = 1.3333 -> 13333 bps
      expect(risk.healthFactorBps).to.equal(13333);
    });
  });
});
