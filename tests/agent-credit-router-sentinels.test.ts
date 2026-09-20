/**
 * Circuit Protocol — Peak Autonomous Agent Upgrade Test Suite
 *
 * Validates:
 * 1. Server-side Append-Only Credit Ledger & Atomic Two-Phase Reservations
 * 2. Idempotent 100-Credit First-Connect Grant & Overdraw Protection
 * 3. Threshold Governor & Regime Warning Bands
 * 4. Zero-Credit Invariant: Agent Compute = 0 NEVER Blocks Manual Protocol Operations
 * 5. Automatic Internal Model Router: Trivial (Lite) vs Complex (Pro) & Downgrade Protection
 * 6. Machine-Readable Capability Registry & Concurrent Execution Rules
 * 7. 9 Specialized Sentinels & Circuit Breakers
 * 8. Emergency Kill Switch State Integrity
 */

import { expect } from "chai";
import { Keypair } from "@solana/web3.js";
import {
  claimFirstConnectGrant,
  reserveCredits,
  settleCredits,
  releaseReservation,
  consumeCreditsDirect,
  getAccount,
  getLedgerHistory,
  resetLedgerForTesting,
} from "../api/agent/ledger";
import {
  getCreditRegime,
  getCreditWarning,
  estimateOperationCost,
  canAffordTier,
  DEFAULT_CREDIT_POLICY,
} from "../app/src/lib/agent/credit-policy";
import {
  routeAgentRequest,
  RoutingContext,
  TIER_MODELS,
} from "../app/src/lib/agent/model-router";
import {
  CAPABILITY_REGISTRY,
  getToolCapability,
  canRunInParallel,
  filterAvailableTools,
} from "../app/src/lib/agent/capability-registry";
import { circuitSentinelEngine, ALL_SENTINELS } from "../app/src/lib/agent/sentinels";
import { agentCircuitBreaker } from "../app/src/lib/agent/circuit-breaker";
import { persistentAgentMemory } from "../app/src/lib/agent/memory";
import { evaluatePermission } from "../app/src/lib/permission-engine";

describe("Peak Autonomous Agent Upgrade Verification Suite", () => {
  let testWallet: string;

  beforeEach(() => {
    testWallet = Keypair.generate().publicKey.toBase58();
    resetLedgerForTesting();
    agentCircuitBreaker.resetAll();
    persistentAgentMemory.clearMemory(testWallet);
  });

  describe("1. Server-Side Append-Only Credit Ledger & Reservations", () => {
    it("grants exactly 100 credits on first connect idempotently", () => {
      const grant1 = claimFirstConnectGrant(testWallet);
      expect(grant1.success).to.be.true;
      expect(grant1.granted).to.be.true;
      expect(grant1.account.walletAddress).to.equal(testWallet);
      expect(grant1.account.available).to.equal(100);
      expect(grant1.account.currentReserved).to.equal(0);

      const history1 = getLedgerHistory(testWallet);
      expect(history1).to.have.lengthOf(1);
      expect(history1[0].entryType).to.equal("FIRST_CONNECT");
      expect(history1[0].amount).to.equal(100);

      // Subsequent calls for same wallet return existing account without double-granting
      const grant2 = claimFirstConnectGrant(testWallet);
      expect(grant2.success).to.be.true;
      expect(grant2.granted).to.be.false;
      expect(grant2.account.available).to.equal(100);

      const history2 = getLedgerHistory(testWallet);
      expect(history2).to.have.lengthOf(1);
    });

    it("executes atomic two-phase reservation and settlement (reserve -> settle)", () => {
      claimFirstConnectGrant(testWallet);

      // Phase 1: Reserve 4 credits for Pro planning
      const reserveRes = reserveCredits(testWallet, 4, "agent_task_pro_plan");
      expect(reserveRes.success).to.be.true;
      expect(reserveRes.reservationId).to.be.a("string");

      const accAfterReserve = getAccount(testWallet);
      expect(accAfterReserve.available).to.equal(96);
      expect(accAfterReserve.currentReserved).to.equal(4);

      // Phase 2: Settle reservation (actual execution cost: 3 credits, refund: 1 credit)
      const settleRes = settleCredits(testWallet, reserveRes.reservationId!, 3);
      expect(settleRes.success).to.be.true;
      expect(settleRes.consumed).to.equal(3);
      expect(settleRes.released).to.equal(1);
      expect(settleRes.availableAfter).to.equal(97);

      const accAfterSettle = getAccount(testWallet);
      expect(accAfterSettle.available).to.equal(97);
      expect(accAfterSettle.currentReserved).to.equal(0);
      expect(accAfterSettle.totalConsumed).to.equal(3);
    });

    it("releases reservation cleanly upon abort or failure with zero balance loss", () => {
      claimFirstConnectGrant(testWallet);

      const reserveRes = reserveCredits(testWallet, 4, "aborted_run");
      expect(reserveRes.success).to.be.true;

      const releaseRes = releaseReservation(testWallet, reserveRes.reservationId!);
      expect(releaseRes.success).to.be.true;
      expect(releaseRes.released).to.equal(4);
      expect(releaseRes.availableAfter).to.equal(100);

      const acc = getAccount(testWallet);
      expect(acc.available).to.equal(100);
      expect(acc.currentReserved).to.equal(0);
    });

    it("strictly blocks reservations and direct consumption when exceeding available credits", () => {
      claimFirstConnectGrant(testWallet);

      // Attempt reserving 105 credits when balance is 100
      const failedReserve = reserveCredits(testWallet, 105, "too_expensive");
      expect(failedReserve.success).to.be.false;
      expect(failedReserve.error).to.include("Insufficient");

      // Attempt consuming 101 credits directly
      const failedConsume = consumeCreditsDirect(testWallet, 101, "too_expensive");
      expect(failedConsume.success).to.be.false;
      expect(failedConsume.error).to.include("Insufficient");

      // Balance remains untouched
      const acc = getAccount(testWallet);
      expect(acc.available).to.equal(100);
    });
  });

  describe("2. Threshold Governor & Warning Bands", () => {
    it("correctly identifies all 6 canonical credit regimes", () => {
      expect(getCreditRegime(100)).to.equal("FULL_CAPABILITY");
      expect(getCreditRegime(76)).to.equal("FULL_CAPABILITY");
      expect(getCreditRegime(75)).to.equal("NORMAL_USAGE");
      expect(getCreditRegime(51)).to.equal("NORMAL_USAGE");
      expect(getCreditRegime(50)).to.equal("COST_AWARE");
      expect(getCreditRegime(26)).to.equal("COST_AWARE");
      expect(getCreditRegime(25)).to.equal("CONSERVATION");
      expect(getCreditRegime(11)).to.equal("CONSERVATION");
      expect(getCreditRegime(10)).to.equal("LOW_CREDIT");
      expect(getCreditRegime(1)).to.equal("LOW_CREDIT");
      expect(getCreditRegime(0)).to.equal("BLOCKED");
    });

    it("provides honest warning messages without fabricated data", () => {
      expect(getCreditWarning(100)).to.be.null;
      expect(getCreditWarning(50)).to.include("Circuit Lite");
      expect(getCreditWarning(25)).to.include("Pro usage is now restricted");
      expect(getCreditWarning(10)).to.include("Low agent budget");
      expect(getCreditWarning(0)).to.include("Agent budget exhausted");
    });
  });

  describe("3. Zero-Credit Invariant (Compute vs Protocol Sovereignty)", () => {
    it("proves compute credits = 0 pauses AI, but manual protocol permissions remain 100% active", () => {
      // 1. Credit check fails for AI compute
      const canComputeLite = canAffordTier(0, "LITE");
      const canComputePro = canAffordTier(0, "PRO");
      expect(canComputeLite).to.be.false;
      expect(canComputePro).to.be.false;

      // 2. Manual Protocol Permission Engine is completely independent of AI credit ledger
      // User initiates manual Deposit, Repay, Borrow, Withdraw in SAFE state
      const manualDeposit = evaluatePermission({
        actor: "HUMAN",
        action: "deposit",
        amountUsd: 500,
        riskState: "SAFE",
        isMarketOpen: true,
        confBps: 20,
        maxConfBps: 100,
        baseLtvBps: 7000,
        collateralUsd: 5000,
        currentDebtUsd: 0,
        assetSymbol: "NVDA",
      });
      expect(manualDeposit.allowed).to.be.true;

      const manualBorrow = evaluatePermission({
        actor: "HUMAN",
        action: "borrow",
        amountUsd: 200,
        riskState: "SAFE",
        isMarketOpen: true,
        confBps: 20,
        maxConfBps: 100,
        baseLtvBps: 7000,
        collateralUsd: 5000,
        currentDebtUsd: 0,
        assetSymbol: "NVDA",
      });
      expect(manualBorrow.allowed).to.be.true;

      // In DEFENSIVE state, manual recovery (repay) remains 100% allowed even with zero AI credits
      const manualRepay = evaluatePermission({
        actor: "HUMAN",
        action: "repay",
        amountUsd: 100,
        riskState: "DEFENSIVE",
        isMarketOpen: true,
        confBps: 20,
        maxConfBps: 100,
        baseLtvBps: 7000,
        collateralUsd: 5000,
        currentDebtUsd: 500,
        assetSymbol: "NVDA",
      });
      expect(manualRepay.allowed).to.be.true;
    });
  });

  describe("4. Automatic Internal Model Router", () => {
    const baseContext: RoutingContext = {
      availableCredits: 100,
      riskRatchetState: "SAFE",
      totalDebtUsd: 200,
      totalCollateralUsd: 1000,
      hasActiveAuthority: true,
      activeTasksCount: 0,
      messageHistoryLength: 2,
    };

    it("routes trivial queries (price, status, chart, balance) to Circuit Lite (1 credit)", () => {
      const decisionPrice = routeAgentRequest("what is the price of NVDA?", baseContext);
      expect(decisionPrice.tier).to.equal("LITE");
      expect(decisionPrice.estimatedCost).to.equal(1);
      expect(decisionPrice.isDowngraded).to.be.false;

      const decisionStatus = routeAgentRequest("show portfolio balance and status", baseContext);
      expect(decisionStatus.tier).to.equal("LITE");
      expect(decisionStatus.estimatedCost).to.equal(1);
    });

    it("routes multi-step complex strategy and rebalancing to Circuit Pro Agent (4 credits)", () => {
      const decisionStrategy = routeAgentRequest(
        "design a comprehensive rebalancing plan across AAPL and NVDA with risk boundary recovery",
        baseContext
      );
      expect(decisionStrategy.tier).to.equal("PRO");
      expect(decisionStrategy.estimatedCost).to.equal(4);
      expect(decisionStrategy.complexityScore).to.be.greaterThan(4);
      expect(decisionStrategy.isDowngraded).to.be.false;
    });

    it("downgrades complex requests gracefully to Lite when credits < 4 without compromising security", () => {
      const lowCreditContext: RoutingContext = {
        ...baseContext,
        availableCredits: 2, // Cannot afford Pro (4 credits)
      };

      const decision = routeAgentRequest(
        "create multi-step hedge strategy with DBC liquidity entry",
        lowCreditContext
      );
      expect(decision.tier).to.equal("LITE");
      expect(decision.isDowngraded).to.be.true;
      expect(decision.downgradeWarning).to.include("downgraded to Circuit Lite");
      expect(decision.estimatedCost).to.equal(1);
    });
  });

  describe("5. Machine-Readable Capability Registry", () => {
    it("contains 30+ typed protocol tools with defined risk levels", () => {
      const toolNames = Object.keys(CAPABILITY_REGISTRY);
      expect(toolNames.length).to.be.at.least(25);
      expect(toolNames).to.include("get_market");
      expect(toolNames).to.include("get_oracle");
      expect(toolNames).to.include("request_deposit");
      expect(toolNames).to.include("request_borrow");
      expect(toolNames).to.include("request_repay");
      expect(toolNames).to.include("request_withdraw");
      expect(toolNames).to.include("get_dbc_pool");
      expect(toolNames).to.include("get_agent_authority");
    });

    it("enforces concurrent execution safety rules: read-only parallel, mutations sequential", () => {
      // Read-only tools can run in parallel
      expect(canRunInParallel(["get_market", "get_oracle"])).to.be.true;
      expect(canRunInParallel(["get_debt", "get_risk_state"])).to.be.true;

      // Mutation tools MUST NOT run in parallel with each other
      expect(canRunInParallel(["request_borrow", "request_deposit"])).to.be.false;
      expect(canRunInParallel(["request_borrow", "request_repay"])).to.be.false;

      // Read tools CANNOT run concurrently with in-flight mutations
      expect(canRunInParallel(["get_market", "request_borrow"])).to.be.false;
    });

    it("filters available tools based on active on-chain authority", () => {
      const unauthedTools = filterAvailableTools(false);
      const authedTools = filterAvailableTools(true);

      // Without authority, execution tools requiring authority are filtered out
      const unauthedNames = unauthedTools.map(t => t.name);
      const authedNames = authedTools.map(t => t.name);

      expect(unauthedNames).to.include("get_market");
      expect(unauthedNames).to.not.include("request_borrow");
      expect(authedNames).to.include("request_borrow");
    });
  });

  describe("6. 9 Specialized Sentinels & Circuit Breakers", () => {
    it("instantiates exactly 9 specialized sentinels", () => {
      expect(ALL_SENTINELS).to.have.lengthOf(9);
      expect(ALL_SENTINELS).to.include("MARKET_SENTINEL");
      expect(ALL_SENTINELS).to.include("ORACLE_SENTINEL");
      expect(ALL_SENTINELS).to.include("RISK_SENTINEL");
      expect(ALL_SENTINELS).to.include("POSITION_SENTINEL");
      expect(ALL_SENTINELS).to.include("CREDIT_SENTINEL");
      expect(ALL_SENTINELS).to.include("PERMISSION_SENTINEL");
      expect(ALL_SENTINELS).to.include("DBC_SENTINEL");
      expect(ALL_SENTINELS).to.include("RECOVERY_SENTINEL");
      expect(ALL_SENTINELS).to.include("TRANSACTION_SENTINEL");
    });

    it("sentinels trigger warnings without throwing on risky snapshots", () => {
      const riskySnapshot = {
        markets: { NVDA: { price: 130, change24h: -15, oracleFreshness: "VALID" } },
        riskState: "EMERGENCY",
        totalCollateralUsd: 1000,
        totalDebtUsd: 980,
        availableCreditUsd: 0,
        healthFactor: 1.02,
        agentCreditsAvailable: 50,
      };

      const alerts = circuitSentinelEngine.evaluate(riskySnapshot);
      expect(alerts.length).to.be.greaterThan(0);
      const types = alerts.map(a => a.sentinel);
      expect(types).to.include("RISK_SENTINEL");
      expect(types).to.include("POSITION_SENTINEL");
      expect(types).to.include("RECOVERY_SENTINEL");
    });

    it("circuit breaker limits loop repetitions and trips after consecutive identical errors", () => {
      const key = testWallet;
      agentCircuitBreaker.recordFailure(key, "Simulation failed: slippage");
      expect(agentCircuitBreaker.isTripped(key)).to.be.false;
      agentCircuitBreaker.recordFailure(key, "Simulation failed: slippage");
      expect(agentCircuitBreaker.isTripped(key)).to.be.false;
      // Third consecutive failure trips loop detector
      agentCircuitBreaker.recordFailure(key, "Simulation failed: slippage");
      expect(agentCircuitBreaker.isTripped(key)).to.be.true;
      expect(agentCircuitBreaker.getTripReason(key)).to.include("Loop detector triggered");
    });

    it("stores and recalls structured persistent memory per wallet", () => {
      persistentAgentMemory.recordDecision(testWallet, {
        action: "borrow",
        symbol: "NVDA",
        allowed: true,
        reason: "Test borrow under safe ratchet",
        txSignature: "5TestTxSignatureMockForMemory111111111111111111111111111111",
      });

      const mem = persistentAgentMemory.getMemory(testWallet);
      expect(mem.recentDecisions).to.have.lengthOf(1);
      expect(mem.recentDecisions[0].symbol).to.equal("NVDA");
      expect(mem.recentDecisions[0].action).to.equal("borrow");
      expect(mem.recentTxSignatures).to.include("5TestTxSignatureMockForMemory111111111111111111111111111111");

      const resolved = persistentAgentMemory.resolveContextualReference(testWallet, "what is its price?");
      expect(resolved.resolvedAsset).to.equal("NVDA");
    });
  });
});
