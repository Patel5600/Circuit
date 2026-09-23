import { expect } from "chai";
import { decodeHaltState } from "../app/src/lib/protocol";
import { evaluateAction } from "../app/src/lib/decision/evaluator";
import { evaluatePermission } from "../app/src/lib/permission-engine";
import {
  getDetailedMarketSession,
  classifyOracleStatus,
} from "../app/src/lib/market-data/stream";
import type { LiveStateInput, ExecutionMode } from "../app/src/lib/decision/types";
import type { MarketSecurityState } from "../app/src/lib/market-data/types";

describe("Circuit Market-State Semantics & Orthogonal Dimensions Suite", () => {
  const manualMode: ExecutionMode = { mode: "MANUAL" };

  const baseHealthyState: LiveStateInput = {
    oraclePrice: 150.0,
    oracleConfBps: 20,
    oraclePublishTime: 1_700_000_000,
    blockTime: 1_700_000_010, // 10s old
    slot: 1000,
    baseLtvBps: 7000,
    ratchetState: "SAFE",
    collateralUsd: 10_000,
    debtUsd: 0,
    assetEnabled: true,
    protocolPaused: false,
    isMarketOpen: true,
    globalOracleHealthy: true,
    assetSymbol: "NVDA",
    debtAssetSymbol: "USDC",
  };

  // --------------------------------------------------------------------------
  // Dimension 1 & 2: Inverted Default Prevention & Decoder Integrity
  // --------------------------------------------------------------------------
  describe("Invariant 1: Zero False Halt Fallbacks on Undefined / Missing State", () => {
    it("decodeHaltState(null) and decodeHaltState(undefined) return 'open_normal', never 'halted_inferred'", () => {
      expect(decodeHaltState(null)).to.equal("open_normal");
      expect(decodeHaltState(undefined)).to.equal("open_normal");
      expect(decodeHaltState("")).to.equal("open_normal");
      expect(decodeHaltState({})).to.equal("open_normal");
    });

    it("decodeHaltState preserves explicit variants faithfully", () => {
      expect(decodeHaltState("open_normal")).to.equal("open_normal");
      expect(decodeHaltState("closed")).to.equal("closed");
      expect(decodeHaltState("halted_inferred")).to.equal("halted_inferred");
      expect(decodeHaltState({ openNormal: {} })).to.equal("open_normal");
      expect(decodeHaltState({ closed: {} })).to.equal("closed");
      expect(decodeHaltState({ haltedInferred: {} })).to.equal("halted_inferred");
    });

    it("evaluator classifies uninitialized oracle as ORACLE_UNAVAILABLE, never HALTED_INFERRED", () => {
      const uninitOracleState: LiveStateInput = {
        ...baseHealthyState,
        oraclePrice: 0,
        oraclePublishTime: 0,
        isMarketOpen: true,
        globalOracleHealthy: true,
      };

      const decision = evaluateAction(manualMode, "borrow", 100, uninitOracleState);
      expect(decision.market.haltInference).to.equal("ORACLE_UNAVAILABLE");
      expect(decision.verdict.code).to.equal("ORACLE_UNAVAILABLE");
      expect(decision.market.securityState).to.equal("ORACLE_UNAVAILABLE");
    });
  });

  // --------------------------------------------------------------------------
  // Dimension 3: Reference Session vs Security Halt Separation
  // --------------------------------------------------------------------------
  describe("Invariant 2: Reference Market Closed is an Operational Calendar State, NOT a Halt", () => {
    it("session closed with fresh feed reports CLOSED, never HALTED_INFERRED", () => {
      const closedState: LiveStateInput = {
        ...baseHealthyState,
        isMarketOpen: false, // weekend or overnight
        blockTime: 1_700_000_010,
        oraclePublishTime: 1_700_000_000, // 10s fresh feed
        globalOracleHealthy: true,
      };

      const decision = evaluateAction(manualMode, "borrow", 500, closedState);
      expect(decision.market.haltInference).to.equal("CLOSED");
      expect(decision.market.securityState).to.equal("CLOSED");
      expect(decision.verdict.code).to.equal("MARKET_CLOSED");
      expect(decision.verdict.status).to.equal("BLOCK");
      expect(decision.verdict.reason).to.include("closed");
    });

    it("permission engine separates MARKET_CLOSED from SECURITY_HALT_INFERRED", () => {
      const closedRes = evaluatePermission({
        actor: "HUMAN",
        action: "borrow",
        amountUsd: 100,
        haltState: "closed",
        sessionExpectedOpen: false,
        isMarketOpen: false,
        collateralUsd: 10_000,
        baseLtvBps: 7000,
      });

      expect(closedRes.allowed).to.be.false;
      expect(closedRes.reasonCode).to.equal("MARKET_CLOSED");
      expect(closedRes.message).to.include("closed");
      expect(closedRes.message).to.not.include("Inferred security-level halt");
    });
  });

  // --------------------------------------------------------------------------
  // Dimension 4: Strict Conditions for HALTED_INFERRED
  // --------------------------------------------------------------------------
  describe("Invariant 3: Strict HALTED_INFERRED Criteria (Session Open + Stale Feed + Healthy Oracle)", () => {
    it("strictly triggers HALTED_INFERRED when session is open, feed is >60s stale, and global oracle is healthy", () => {
      const haltedState: LiveStateInput = {
        ...baseHealthyState,
        isMarketOpen: true,
        oraclePublishTime: 1_700_000_000 - 90, // 90s stale
        blockTime: 1_700_000_000,
        globalOracleHealthy: true,
      };

      const decision = evaluateAction(manualMode, "borrow", 500, haltedState);
      expect(decision.market.haltInference).to.equal("HALTED_INFERRED");
      expect(decision.market.securityState).to.equal("HALTED_INFERRED");
      expect(decision.verdict.code).to.equal("SECURITY_HALT_INFERRED");
      expect(decision.verdict.status).to.equal("BLOCK");
    });

    it("degraded global oracle triggers ORACLE_UNAVAILABLE instead of single-stock halt", () => {
      const globalDegradedState: LiveStateInput = {
        ...baseHealthyState,
        isMarketOpen: true,
        oraclePublishTime: 1_700_000_000 - 90,
        blockTime: 1_700_000_000,
        globalOracleHealthy: false, // multiple feeds failing
      };

      const decision = evaluateAction(manualMode, "borrow", 500, globalDegradedState);
      expect(decision.market.haltInference).to.equal("ORACLE_UNAVAILABLE");
      expect(decision.market.securityState).to.equal("ORACLE_UNAVAILABLE");
      expect(decision.verdict.code).to.equal("ORACLE_UNAVAILABLE");
    });

    it("preserves risk-reducing actions (repay and deposit) during inferred halt", () => {
      const haltedState: LiveStateInput = {
        ...baseHealthyState,
        isMarketOpen: true,
        oraclePublishTime: 1_700_000_000 - 90,
        blockTime: 1_700_000_000,
        globalOracleHealthy: true,
        debtUsd: 1_000,
      };

      const repayDecision = evaluateAction(manualMode, "repay", 200, haltedState);
      expect(repayDecision.verdict.status).to.equal("ALLOW");
      expect(repayDecision.capitalPolicy.repayAllowed).to.be.true;

      const depositDecision = evaluateAction(manualMode, "deposit", 500, haltedState);
      expect(depositDecision.verdict.status).to.equal("ALLOW");
      expect(depositDecision.capitalPolicy.depositAllowed).to.be.true;
    });
  });

  // --------------------------------------------------------------------------
  // Dimension 5: Multi-Asset Isolation
  // --------------------------------------------------------------------------
  describe("Invariant 4: Multi-Asset Fault Isolation", () => {
    it("halted NVDA does not impact healthy AAPL or MSFT credit creation", () => {
      const nvdaHaltedState: LiveStateInput = {
        ...baseHealthyState,
        assetSymbol: "NVDA",
        isMarketOpen: true,
        oraclePublishTime: 1_700_000_000 - 120,
        blockTime: 1_700_000_000,
        globalOracleHealthy: true,
      };

      const aaplHealthyState: LiveStateInput = {
        ...baseHealthyState,
        assetSymbol: "AAPL",
        oraclePrice: 220.0,
        oraclePublishTime: 1_700_000_000 - 10, // 10s fresh
        blockTime: 1_700_000_000,
        isMarketOpen: true,
        globalOracleHealthy: true,
      };

      const nvdaDecision = evaluateAction(manualMode, "borrow", 100, nvdaHaltedState);
      const aaplDecision = evaluateAction(manualMode, "borrow", 100, aaplHealthyState);

      expect(nvdaDecision.market.securityState).to.equal("HALTED_INFERRED");
      expect(nvdaDecision.verdict.status).to.equal("BLOCK");

      expect(aaplDecision.market.securityState).to.equal("NORMAL");
      expect(aaplDecision.verdict.status).to.equal("ALLOW");
    });
  });

  // --------------------------------------------------------------------------
  // Dimension 6: User Collateral Zero vs Market Lock Decoupling
  // --------------------------------------------------------------------------
  describe("Invariant 5: User Zero Collateral Does NOT Lock Market as Halted", () => {
    it("reports INSUFFICIENT_COLLATERAL for zero collateral user while market state is NORMAL", () => {
      const zeroCollateralState: LiveStateInput = {
        ...baseHealthyState,
        collateralUsd: 0,
        debtUsd: 0,
        isMarketOpen: true,
        globalOracleHealthy: true,
      };

      const decision = evaluateAction(manualMode, "borrow", 100, zeroCollateralState);
      expect(decision.market.securityState).to.equal("NORMAL");
      expect(decision.market.haltInference).to.equal("OPEN_NORMAL");
      expect(decision.verdict.status).to.equal("BLOCK");
      expect(decision.verdict.code).to.equal("INSUFFICIENT_COLLATERAL");
      expect(decision.verdict.reason).to.include("Deposit collateral to activate");
      expect(decision.verdict.reason).to.not.include("Halt");
    });
  });
});
