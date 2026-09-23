/**
 * Circuit Protocol - Decision Kernel Invariants & Single Source of Truth Suite
 *
 * Verifies that the canonical evaluateAction produces mathematically and
 * logically consistent DecisionSnapshots across all execution modes and market regimes:
 *
 * 1. Vector 1: SAFE risk + protocolPaused -> borrow = BLOCKED (PROTOCOL_PAUSED), never "Borrowing is available".
 * 2. Vector 2: SAFE risk + manual mode -> authority is NOT_APPLICABLE; manual operations proceed unhindered by agent delegation.
 * 3. Vector 3: Agent mode without active authority delegation -> BLOCKED (AGENT_UNAUTHORIZED).
 * 4. Vector 4: Stale feed during open session with healthy global oracle -> HALTED_INFERRED; borrow = BLOCKED, repay = ALLOWED.
 * 5. Vector 5: Asset isolation -> NVDA halted feed does not affect AAPL healthy feed evaluation.
 * 6. Vector 6: Position debt dynamics -> available credit recalculates immediately without cached lag.
 * 7. Vector 7: Measured freshness thresholds (LIVE < 30s, RECENT 30-120s, STALE > 120s, UNAVAILABLE).
 * 8. Vector 8: Dynamic LTV ratchet containment (SAFE -> RESTRICTED -> DEFENSIVE -> EMERGENCY).
 * 9. Vector 9: Oracle confidence band enforcement (confBps > 100 -> CONFIDENCE_TOO_WIDE).
 */

import { expect } from "chai";
import { evaluateAction, LiveStateInput } from "../app/src/lib/decision/evaluator";
import { ExecutionMode } from "../app/src/lib/decision/types";

describe("Circuit Protocol — Decision Kernel Invariants (Single Source of Truth)", () => {
  const manualMode: ExecutionMode = { mode: "MANUAL" };
  const agentMode: ExecutionMode = { mode: "AGENT", agentPubkey: "CircuitAgent111111111111111111111111111111111" };

  const baseHealthyState: LiveStateInput = {
    slot: 100_000,
    blockTime: 1_700_000_000,
    protocolPaused: false,
    assetEnabled: true,
    assetMint: "AMDxMint111111111111111111111111111111111111",
    assetSymbol: "AMDx",
    oraclePrice: 150.0,
    oracleExpo: -8,
    oracleConf: 0.05,
    oracleConfBps: 33, // 0.033% < 100 bps
    oraclePublishTime: 1_700_000_000 - 10, // 10s old (LIVE)
    globalOracleHealthy: true,
    isMarketOpen: true,
    sessionLabel: "Regular Session",
    ratchetState: "SAFE",
    riskScore: 12,
    baseLtvBps: 7000, // 70%
    liquidationThresholdBps: 8000,
    collateralUsd: 10_000,
    debtUsd: 2_000,
    agentAuthority: null,
  };

  describe("Vector 1: Protocol Pause vs. Market Risk Contradiction Shield", () => {
    it("strictly blocks borrow with PROTOCOL_PAUSED even when market risk is SAFE", () => {
      const pausedState: LiveStateInput = {
        ...baseHealthyState,
        protocolPaused: true,
        ratchetState: "SAFE",
      };

      const decision = evaluateAction(manualMode, "borrow", 500, pausedState);

      expect(decision.risk.state).to.equal("SAFE");
      expect(decision.verdict.status).to.equal("BLOCK");
      expect(decision.verdict.code).to.equal("PROTOCOL_PAUSED");
      expect(decision.capitalPolicy.borrowAllowed).to.be.false;
      expect(decision.permission.allowed).to.be.false;
      expect(decision.verdict.reason).to.include("paused by protocol administration");
    });

    it("allows repay unconditionally during protocol pause", () => {
      const pausedState: LiveStateInput = {
        ...baseHealthyState,
        protocolPaused: true,
        debtUsd: 2_000,
      };

      const decision = evaluateAction(manualMode, "repay", 500, pausedState);

      expect(decision.verdict.status).to.equal("ALLOW");
      expect(decision.verdict.code).to.equal("ALLOWED");
      expect(decision.capitalPolicy.repayAllowed).to.be.true;
    });
  });

  describe("Vector 2: Manual Sovereignty vs. Agent Authority Invariant", () => {
    it("reports authority as NOT_APPLICABLE and permits manual borrow when no agent is configured", () => {
      const decision = evaluateAction(manualMode, "borrow", 500, baseHealthyState);

      expect(decision.authority.mode).to.equal("MANUAL");
      expect(decision.authority.status).to.equal("NOT_APPLICABLE");
      expect(decision.authority.applicable).to.be.false;
      expect(decision.authority.allowed).to.be.true;
      expect(decision.verdict.status).to.equal("ALLOW");
      expect(decision.verdict.code).to.equal("ALLOWED");
    });

    it("verifies insufficient collateral cleanly in manual mode without blaming agent authority", () => {
      const zeroCollateralState: LiveStateInput = {
        ...baseHealthyState,
        collateralUsd: 0,
        debtUsd: 0,
      };

      const decision = evaluateAction(manualMode, "borrow", 100, zeroCollateralState);

      expect(decision.authority.status).to.equal("NOT_APPLICABLE");
      expect(decision.verdict.status).to.equal("BLOCK");
      expect(decision.verdict.code).to.equal("INSUFFICIENT_COLLATERAL");
      expect(decision.verdict.reason).to.equal("Deposit collateral to activate borrowing power.");
    });
  });

  describe("Vector 3: Autonomous Agent Delegation Enforcement", () => {
    it("strictly blocks agent execution when delegation is unconfigured or absent", () => {
      const decision = evaluateAction(agentMode, "borrow", 500, {
        ...baseHealthyState,
        agentAuthority: null,
      });

      expect(decision.authority.mode).to.equal("AGENT");
      expect(decision.authority.applicable).to.be.true;
      expect(decision.authority.status).to.equal("BLOCK");
      expect(decision.verdict.status).to.equal("BLOCK");
      expect(decision.verdict.code).to.equal("AGENT_UNAUTHORIZED");
    });

    it("strictly blocks agent execution when delegation is expired", () => {
      const decision = evaluateAction(agentMode, "borrow", 500, {
        ...baseHealthyState,
        agentAuthority: {
          active: true,
          isExpired: true,
          allowedActions: { deposit: true, borrow: true, repay: true, withdraw: true },
          maxBorrowLimitUsd: 5000,
          maxWithdrawLimitUsd: 1000,
          currentBorrowedUsd: 0,
          riskBudgetUsd: 5000,
        },
      });

      expect(decision.authority.status).to.equal("BLOCK");
      expect(decision.verdict.status).to.equal("BLOCK");
      expect(decision.verdict.code).to.equal("AGENT_UNAUTHORIZED");
      expect(decision.authority.reason).to.include("expired");
    });

    it("permits agent execution when valid unexpired authority covers the requested amount", () => {
      const decision = evaluateAction(agentMode, "borrow", 500, {
        ...baseHealthyState,
        agentAuthority: {
          active: true,
          isExpired: false,
          allowedActions: { deposit: true, borrow: true, repay: true, withdraw: true },
          maxBorrowLimitUsd: 5000,
          maxWithdrawLimitUsd: 1000,
          currentBorrowedUsd: 0,
          riskBudgetUsd: 5000,
        },
      });

      expect(decision.authority.status).to.equal("ALLOW");
      expect(decision.verdict.status).to.equal("ALLOW");
      expect(decision.verdict.code).to.equal("ALLOWED");
    });

    it("blocks agent borrow when requested amount exceeds delegated strategy limit", () => {
      const decision = evaluateAction(agentMode, "borrow", 2500, {
        ...baseHealthyState,
        agentAuthority: {
          active: true,
          isExpired: false,
          allowedActions: { deposit: true, borrow: true, repay: true, withdraw: true },
          maxBorrowLimitUsd: 2000, // limit is 2000, request is 2500
          maxWithdrawLimitUsd: 1000,
          currentBorrowedUsd: 0,
          riskBudgetUsd: 2000,
        },
      });

      expect(decision.verdict.status).to.equal("BLOCK");
      expect(decision.verdict.code).to.equal("BORROW_LIMIT_EXCEEDED");
    });
  });

  describe("Vector 4: Stale Feed & Inferred Halt Security Isolation", () => {
    it("detects HALTED_INFERRED and blocks borrow when session is open but price is older than 60s", () => {
      const haltedState: LiveStateInput = {
        ...baseHealthyState,
        isMarketOpen: true,
        oraclePublishTime: 1_700_000_000 - 90, // 90s old during open market
        globalOracleHealthy: true,
      };

      const decision = evaluateAction(manualMode, "borrow", 500, haltedState);

      expect(decision.market.haltInference).to.equal("HALTED_INFERRED");
      expect(decision.verdict.status).to.equal("BLOCK");
      expect(decision.verdict.code).to.equal("SECURITY_HALT_INFERRED");
      expect(decision.capitalPolicy.borrowAllowed).to.be.false;
    });

    it("unconditionally permits debt repayment when asset is in HALTED_INFERRED state", () => {
      const haltedState: LiveStateInput = {
        ...baseHealthyState,
        isMarketOpen: true,
        oraclePublishTime: 1_700_000_000 - 90,
        globalOracleHealthy: true,
        debtUsd: 2_000,
      };

      const decision = evaluateAction(manualMode, "repay", 500, haltedState);

      expect(decision.market.haltInference).to.equal("HALTED_INFERRED");
      expect(decision.verdict.status).to.equal("ALLOW");
      expect(decision.verdict.code).to.equal("ALLOWED");
      expect(decision.capitalPolicy.repayAllowed).to.be.true;
    });

    it("distinguishes global oracle outage from single-stock halt", () => {
      const degradedGlobalState: LiveStateInput = {
        ...baseHealthyState,
        globalOracleHealthy: false,
      };

      const decision = evaluateAction(manualMode, "borrow", 500, degradedGlobalState);

      expect(decision.market.haltInference).to.equal("ORACLE_UNAVAILABLE");
      expect(decision.verdict.status).to.equal("BLOCK");
      expect(decision.verdict.code).to.equal("ORACLE_UNAVAILABLE");
    });
  });

  describe("Vector 5: Multi-Asset Isolation Invariant", () => {
    it("proves halted NVDA does not prevent borrowing against healthy AAPL", () => {
      const nvdaHaltedState: LiveStateInput = {
        ...baseHealthyState,
        assetMint: "NVDAMint11111111111111111111111111111111111",
        assetSymbol: "NVDA",
        oraclePublishTime: 1_700_000_000 - 150, // 150s old -> Halted
      };

      const aaplHealthyState: LiveStateInput = {
        ...baseHealthyState,
        assetMint: "AAPLMint11111111111111111111111111111111111",
        assetSymbol: "AAPL",
        oraclePublishTime: 1_700_000_000 - 5, // 5s old -> LIVE
      };

      const nvdaDecision = evaluateAction(manualMode, "borrow", 500, nvdaHaltedState);
      const aaplDecision = evaluateAction(manualMode, "borrow", 500, aaplHealthyState);

      // NVDA is blocked
      expect(nvdaDecision.market.haltInference).to.equal("HALTED_INFERRED");
      expect(nvdaDecision.verdict.status).to.equal("BLOCK");

      // AAPL is allowed
      expect(aaplDecision.market.haltInference).to.equal("OPEN_NORMAL");
      expect(aaplDecision.oracle.freshness).to.equal("LIVE");
      expect(aaplDecision.verdict.status).to.equal("ALLOW");
    });
  });

  describe("Vector 6: Position Debt Dynamics & Credit Power Invariant", () => {
    it("dynamically recalculates available credit when debt increases", () => {
      // 10,000 collateral * 70% LTV = 7,000 capacity
      // At debt = 2,000 -> credit = 5,000
      const dec1 = evaluateAction(manualMode, "borrow", 100, {
        ...baseHealthyState,
        collateralUsd: 10_000,
        debtUsd: 2_000,
      });
      expect(dec1.position.availableCreditUsd).to.equal(5_000);

      // At debt = 6,500 -> credit = 500
      const dec2 = evaluateAction(manualMode, "borrow", 100, {
        ...baseHealthyState,
        collateralUsd: 10_000,
        debtUsd: 6_500,
      });
      expect(dec2.position.availableCreditUsd).to.equal(500);

      // Attempting to borrow 600 exceeds 500 available credit
      const dec3 = evaluateAction(manualMode, "borrow", 600, {
        ...baseHealthyState,
        collateralUsd: 10_000,
        debtUsd: 6_500,
      });
      expect(dec3.verdict.status).to.equal("BLOCK");
      expect(dec3.verdict.code).to.equal("BORROW_LIMIT_EXCEEDED");
    });
  });

  describe("Vector 7: Measured Freshness Thresholds", () => {
    it("categorizes oracle freshness faithfully", () => {
      // LIVE: < 30s
      const live = evaluateAction(manualMode, "borrow", 100, {
        ...baseHealthyState,
        oraclePublishTime: 1_700_000_000 - 15,
      });
      expect(live.oracle.freshness).to.equal("LIVE");

      // RECENT: 30s - 120s
      const recent = evaluateAction(manualMode, "borrow", 100, {
        ...baseHealthyState,
        isMarketOpen: false, // avoid HALTED_INFERRED during session
        oraclePublishTime: 1_700_000_000 - 45,
      });
      expect(recent.oracle.freshness).to.equal("RECENT");

      // STALE: > 120s
      const stale = evaluateAction(manualMode, "borrow", 100, {
        ...baseHealthyState,
        oraclePublishTime: 1_700_000_000 - 200,
      });
      expect(stale.oracle.freshness).to.equal("STALE");

      // UNAVAILABLE: price <= 0 or publishTime <= 0
      const unavailable = evaluateAction(manualMode, "borrow", 100, {
        ...baseHealthyState,
        oraclePrice: 0,
      });
      expect(unavailable.oracle.freshness).to.equal("UNAVAILABLE");
    });
  });

  describe("Vector 8: Ratchet LTV Throttling & Capital Containment", () => {
    it("progressively throttles LTV and containment across ratchet states", () => {
      // SAFE: 70% LTV
      const safe = evaluateAction(manualMode, "borrow", 100, {
        ...baseHealthyState,
        ratchetState: "SAFE",
      });
      expect(safe.capitalPolicy.maxLtv).to.equal(0.7);
      expect(safe.capitalPolicy.borrowAllowed).to.be.true;

      // RESTRICTED: 60% LTV (base 70% - 10%)
      const restricted = evaluateAction(manualMode, "borrow", 100, {
        ...baseHealthyState,
        ratchetState: "RESTRICTED",
        debtUsd: 0, // no existing debt permits initial borrow under reduced LTV
      });
      expect(restricted.capitalPolicy.maxLtv).to.equal(0.6);

      // DEFENSIVE: Borrowing blocked, 50% LTV
      const defensive = evaluateAction(manualMode, "borrow", 100, {
        ...baseHealthyState,
        ratchetState: "DEFENSIVE",
      });
      expect(defensive.capitalPolicy.maxLtv).to.equal(0.5);
      expect(defensive.capitalPolicy.borrowAllowed).to.be.false;
      expect(defensive.verdict.status).to.equal("BLOCK");
      expect(defensive.verdict.code).to.equal("BORROW_DISABLED");

      // EMERGENCY: 0% LTV, borrow blocked, repay allowed
      const emergencyBorrow = evaluateAction(manualMode, "borrow", 100, {
        ...baseHealthyState,
        ratchetState: "EMERGENCY",
      });
      expect(emergencyBorrow.capitalPolicy.maxLtv).to.equal(0);
      expect(emergencyBorrow.verdict.status).to.equal("BLOCK");

      const emergencyRepay = evaluateAction(manualMode, "repay", 500, {
        ...baseHealthyState,
        ratchetState: "EMERGENCY",
        debtUsd: 2_000,
      });
      expect(emergencyRepay.verdict.status).to.equal("ALLOW");
      expect(emergencyRepay.capitalPolicy.repayAllowed).to.be.true;
    });
  });

  describe("Vector 9: Oracle Confidence Band Enforcement", () => {
    it("blocks borrow when oracle confidence interval exceeds 100 bps", () => {
      const wideConfState: LiveStateInput = {
        ...baseHealthyState,
        oracleConfBps: 150, // 1.5% > 100 bps
      };

      const decision = evaluateAction(manualMode, "borrow", 100, wideConfState);

      expect(decision.verdict.status).to.equal("BLOCK");
      expect(decision.verdict.code).to.equal("CONFIDENCE_TOO_WIDE");
      expect(decision.verdict.reason).to.include("exceeds asset bound (100 bps)");
    });
  });
});
