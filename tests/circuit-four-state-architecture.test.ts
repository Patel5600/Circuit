/**
 * Circuit Protocol - Four Independent State Domains Test Suite
 *
 * Verifies the fundamental architectural invariant:
 * REFERENCE_MARKET ≠ ONCHAIN_MARKET ≠ ORACLE_STATE ≠ CIRCUIT_POLICY
 *
 * Circuit itself must NOT become "closed" merely because the reference equity market is closed.
 * Covers all 12 scenarios from Section 16.
 */

import { expect } from "chai";
import { evaluateAction } from "../app/src/lib/decision/evaluator";
import { evaluatePermission } from "../app/src/lib/permission-engine";
import {
  getReferenceMarketState,
  classifyOracleState,
} from "../app/src/lib/market-data/stream";
import type { LiveStateInput, ExecutionMode } from "../app/src/lib/decision/types";

describe("Circuit Four-State Architecture & Decoupled Market Hours Suite (Section 16)", () => {
  const manualMode: ExecutionMode = { mode: "MANUAL" };
  const agentMode: ExecutionMode = {
    mode: "AGENT",
    agentPubkey: "CircuitAgent111111111111111111111111111111111",
  };

  const baseInput: LiveStateInput = {
    slot: 100_000,
    blockTime: 1_700_000_000,
    protocolPaused: false,
    assetEnabled: true,
    assetMint: "NVDAxMint1111111111111111111111111111111111",
    assetSymbol: "NVDA",
    oraclePrice: 130.0,
    oracleExpo: -8,
    oracleConf: 0.05,
    oracleConfBps: 25,
    oraclePublishTime: 1_700_000_000 - 10, // 10s fresh
    globalOracleHealthy: true,
    isMarketOpen: true,
    referenceMarketState: "OPEN",
    onchainMarketState: "OPEN",
    ratchetState: "SAFE",
    baseLtvBps: 7000,
    liquidationThresholdBps: 8000,
    collateralUsd: 10_000,
    debtUsd: 0,
    agentAuthority: null,
  };

  // --------------------------------------------------------------------------
  // Scenario 1: Reference OPEN + Onchain OPEN + Oracle FRESH
  // --------------------------------------------------------------------------
  it("Scenario 1: Reference OPEN + Onchain OPEN + Oracle FRESH -> Circuit operational (borrow permitted)", () => {
    const input: LiveStateInput = {
      ...baseInput,
      referenceMarketState: "OPEN",
      onchainMarketState: "OPEN",
      oraclePublishTime: 1_700_000_000 - 10,
    };

    const decision = evaluateAction(manualMode, "borrow", 1000, input);
    expect(decision.market.referenceState).to.equal("OPEN");
    expect(decision.market.onchainState).to.equal("OPEN");
    expect(decision.oracle.oracleState).to.equal("FRESH");
    expect(decision.market.securityState).to.equal("NORMAL");
    expect(decision.market.marketGuardState).to.equal("SAFE");
    expect(decision.verdict.status).to.equal("ALLOW");
    expect(decision.verdict.code).to.equal("ALLOWED");
  });

  // --------------------------------------------------------------------------
  // Scenario 2: Reference CLOSED + Onchain OPEN + Oracle FRESH
  // --------------------------------------------------------------------------
  it("Scenario 2: Reference CLOSED + Onchain OPEN + Oracle FRESH -> Circuit operational (deposit/repay allowed; borrow restricted by policy)", () => {
    const input: LiveStateInput = {
      ...baseInput,
      isMarketOpen: false,
      referenceMarketState: "CLOSED",
      onchainMarketState: "OPEN",
      oraclePublishTime: 1_700_000_000 - 15, // 15s fresh
    };

    // Borrow is restricted by policy, but Circuit is NOT closed
    const borrowDecision = evaluateAction(manualMode, "borrow", 500, input);
    expect(borrowDecision.market.referenceState).to.equal("CLOSED");
    expect(borrowDecision.market.onchainState).to.equal("OPEN");
    expect(borrowDecision.oracle.oracleState).to.equal("FRESH");
    expect(borrowDecision.market.securityState).to.equal("RESTRICTED");
    expect(borrowDecision.market.securityState).to.not.equal("CLOSED");
    expect(borrowDecision.market.marketGuardState).to.equal("RESTRICTED");
    expect(borrowDecision.verdict.status).to.equal("BLOCK");
    expect(borrowDecision.verdict.code).to.equal("RISK_STATE_RESTRICTED");
    expect(borrowDecision.verdict.reason).to.include("Reference market is closed. Onchain trading remains available.");

    // Deposit is unconditionally ALLOWED
    const depositDecision = evaluateAction(manualMode, "deposit", 500, input);
    expect(depositDecision.verdict.status).to.equal("ALLOW");
    expect(depositDecision.capitalPolicy.depositAllowed).to.be.true;

    // Repay is unconditionally ALLOWED
    const repayDecision = evaluateAction(manualMode, "repay", 200, { ...input, debtUsd: 1000 });
    expect(repayDecision.verdict.status).to.equal("ALLOW");
    expect(repayDecision.capitalPolicy.repayAllowed).to.be.true;
  });

  // --------------------------------------------------------------------------
  // Scenario 3: Reference CLOSED + Onchain OPEN + Oracle STALE
  // --------------------------------------------------------------------------
  it("Scenario 3: Reference CLOSED + Onchain OPEN + Oracle STALE -> Circuit operational with restricted permissions (never Circuit closed)", () => {
    const input: LiveStateInput = {
      ...baseInput,
      isMarketOpen: false,
      referenceMarketState: "CLOSED",
      onchainMarketState: "OPEN",
      oraclePublishTime: 1_700_000_000 - 900, // 15m old stale
      lastValidPrice: 130.0,
      lastValidPublishTime: 1_700_000_000 - 900,
    };

    const borrowDecision = evaluateAction(manualMode, "borrow", 500, input);
    expect(borrowDecision.market.referenceState).to.equal("CLOSED");
    expect(borrowDecision.market.onchainState).to.equal("OPEN");
    expect(borrowDecision.oracle.oracleState).to.equal("STALE");
    expect(borrowDecision.oracle.oracleState).to.not.equal("UNAVAILABLE");
    expect(borrowDecision.market.securityState).to.equal("RESTRICTED");
    expect(borrowDecision.verdict.status).to.equal("BLOCK");

    // Deposit & repay remain allowed
    const depositDecision = evaluateAction(manualMode, "deposit", 1000, input);
    expect(depositDecision.verdict.status).to.equal("ALLOW");
    const repayDecision = evaluateAction(manualMode, "repay", 500, { ...input, debtUsd: 1000 });
    expect(repayDecision.verdict.status).to.equal("ALLOW");
  });

  // --------------------------------------------------------------------------
  // Scenario 4: Reference CLOSED + Onchain OPEN + Oracle UNAVAILABLE
  // --------------------------------------------------------------------------
  it("Scenario 4: Reference CLOSED + Onchain OPEN + Oracle UNAVAILABLE -> deposit & repay allowed; borrow blocked with ORACLE_UNAVAILABLE", () => {
    const input: LiveStateInput = {
      ...baseInput,
      isMarketOpen: false,
      referenceMarketState: "CLOSED",
      onchainMarketState: "OPEN",
      oraclePrice: 0,
      oraclePublishTime: 0,
    };

    const borrowDecision = evaluateAction(manualMode, "borrow", 500, input);
    expect(borrowDecision.oracle.oracleState).to.equal("UNAVAILABLE");
    expect(borrowDecision.market.securityState).to.equal("ORACLE_UNAVAILABLE");
    expect(borrowDecision.verdict.code).to.equal("ORACLE_UNAVAILABLE");

    // Deposit & repay remain universally allowed
    const depositDecision = evaluateAction(manualMode, "deposit", 500, input);
    expect(depositDecision.verdict.status).to.equal("ALLOW");
    const repayDecision = evaluateAction(manualMode, "repay", 200, { ...input, debtUsd: 500 });
    expect(repayDecision.verdict.status).to.equal("ALLOW");
  });

  // --------------------------------------------------------------------------
  // Scenario 5: Reference OPEN + Onchain CLOSED
  // --------------------------------------------------------------------------
  it("Scenario 5: Reference OPEN + Onchain CLOSED -> onchain actions unavailable", () => {
    const input: LiveStateInput = {
      ...baseInput,
      assetEnabled: false,
      referenceMarketState: "OPEN",
      onchainMarketState: "CLOSED",
    };

    const decision = evaluateAction(manualMode, "borrow", 500, input);
    expect(decision.verdict.status).to.equal("BLOCK");
    expect(decision.verdict.code).to.equal("ASSET_DISABLED");
  });

  // --------------------------------------------------------------------------
  // Scenario 6: Reference CLOSED + Onchain CLOSED
  // --------------------------------------------------------------------------
  it("Scenario 6: Reference CLOSED + Onchain CLOSED -> onchain actions unavailable", () => {
    const input: LiveStateInput = {
      ...baseInput,
      assetEnabled: false,
      referenceMarketState: "CLOSED",
      onchainMarketState: "CLOSED",
    };

    const decision = evaluateAction(manualMode, "borrow", 500, input);
    expect(decision.verdict.status).to.equal("BLOCK");
    expect(decision.verdict.code).to.equal("ASSET_DISABLED");
  });

  // --------------------------------------------------------------------------
  // Scenario 7: Oracle RECOVERS -> permissions automatically recalculate
  // --------------------------------------------------------------------------
  it("Scenario 7: Oracle RECOVERS -> permissions automatically recalculate to ALLOW", () => {
    const staleInput: LiveStateInput = {
      ...baseInput,
      referenceMarketState: "OPEN",
      oraclePublishTime: 1_700_000_000 - 150, // 150s stale
    };
    const staleDecision = evaluateAction(manualMode, "borrow", 500, staleInput);
    expect(staleDecision.oracle.freshness).to.equal("STALE");
    expect(staleDecision.verdict.status).to.equal("BLOCK");

    // Oracle recovers with new tick 5s ago
    const recoveredInput: LiveStateInput = {
      ...staleInput,
      oraclePublishTime: 1_700_000_000 - 5,
    };
    const recoveredDecision = evaluateAction(manualMode, "borrow", 500, recoveredInput);
    expect(recoveredDecision.oracle.freshness).to.equal("LIVE");
    expect(recoveredDecision.oracle.oracleState).to.equal("FRESH");
    expect(recoveredDecision.verdict.status).to.equal("ALLOW");
  });

  // --------------------------------------------------------------------------
  // Scenario 8: Manual action calls same canonical evaluator
  // --------------------------------------------------------------------------
  it("Scenario 8: Manual action calls same canonical evaluator without requiring agent authority", () => {
    const manualDecision = evaluateAction(manualMode, "borrow", 500, baseInput);
    expect(manualDecision.authority.mode).to.equal("MANUAL");
    expect(manualDecision.authority.applicable).to.be.false;
    expect(manualDecision.verdict.status).to.equal("ALLOW");
  });

  // --------------------------------------------------------------------------
  // Scenario 9: Agent action calls same canonical evaluator
  // --------------------------------------------------------------------------
  it("Scenario 9: Agent action calls same canonical evaluator and enforces delegated authority boundaries", () => {
    const validAuth = {
      active: true,
      isExpired: false,
      allowedActions: { deposit: true, borrow: true, repay: true, withdraw: true },
      maxBorrowLimitUsd: 1000,
      maxWithdrawLimitUsd: 1000,
      currentBorrowedUsd: 0,
      riskBudgetUsd: 500,
    };

    const agentDecision = evaluateAction(agentMode, "borrow", 500, {
      ...baseInput,
      agentAuthority: validAuth,
    });
    expect(agentDecision.authority.mode).to.equal("AGENT");
    expect(agentDecision.authority.applicable).to.be.true;
    expect(agentDecision.authority.allowed).to.be.true;
    expect(agentDecision.verdict.status).to.equal("ALLOW");

    // Agent exceeds limit -> blocked
    const overLimitDecision = evaluateAction(agentMode, "borrow", 1500, {
      ...baseInput,
      agentAuthority: validAuth,
    });
    expect(overLimitDecision.verdict.status).to.equal("BLOCK");
    expect(overLimitDecision.verdict.code).to.equal("BORROW_LIMIT_EXCEEDED");
  });

  // --------------------------------------------------------------------------
  // Scenario 10: Meteora DBC action evaluated independently from reference market session
  // --------------------------------------------------------------------------
  it("Scenario 10: Meteora DBC action evaluated independently from reference market session", () => {
    const permResult = evaluatePermission({
      actor: "HUMAN",
      action: "exit_liquidity",
      referenceMarketState: "CLOSED",
      onchainMarketState: "OPEN",
      riskState: "RESTRICTED",
      venue: "METEORA_DBC",
    });

    expect(permResult.allowed).to.be.true;
    expect(permResult.venue).to.equal("METEORA_DBC");
    expect(permResult.message).to.include("DBC liquidity exit/recovery permitted across all market states");
  });

  // --------------------------------------------------------------------------
  // Scenario 11: No oracle -> no fabricated price or fake publish time
  // --------------------------------------------------------------------------
  it("Scenario 11: No oracle -> honest UNAVAILABLE, no fabricated numbers or fake timestamps", () => {
    const state = classifyOracleState(999999, false, 0, false);
    expect(state).to.equal("UNAVAILABLE");

    const noOracleInput: LiveStateInput = {
      ...baseInput,
      oraclePrice: 0,
      oraclePublishTime: 0,
      lastValidPrice: null,
      lastValidPublishTime: null,
    };
    const decision = evaluateAction(manualMode, "borrow", 500, noOracleInput);
    expect(decision.oracle.price).to.equal(0);
    expect(decision.oracle.publishTime).to.equal(0);
    expect(decision.oracle.freshness).to.equal("UNAVAILABLE");
    expect(decision.oracle.oracleState).to.equal("UNAVAILABLE");
    expect(decision.verdict.code).to.equal("ORACLE_UNAVAILABLE");
  });

  // --------------------------------------------------------------------------
  // Scenario 12: Stale oracle preserves lastValidPrice and is not labeled unavailable
  // --------------------------------------------------------------------------
  it("Scenario 12: Stale oracle preserves lastValidPrice and is NOT labeled unavailable", () => {
    const staleState = classifyOracleState(3600, true, 20, true);
    expect(staleState).to.equal("STALE");
    expect(staleState).to.not.equal("UNAVAILABLE");

    const closingPriceInput: LiveStateInput = {
      ...baseInput,
      isMarketOpen: false,
      referenceMarketState: "CLOSED",
      oraclePrice: 132.50,
      oraclePublishTime: 1_700_000_000 - 3600, // 1 hour ago
      lastValidPrice: 132.50,
      lastValidPublishTime: 1_700_000_000 - 3600,
    };

    const decision = evaluateAction(manualMode, "borrow", 500, closingPriceInput);
    expect(decision.oracle.oracleState).to.equal("STALE");
    expect(decision.oracle.oracleState).to.not.equal("UNAVAILABLE");
    expect(decision.oracle.lastValidPrice).to.equal(132.50);
    expect(decision.oracle.lastValidPublishTime).to.equal(1_700_000_000 - 3600);
    expect(decision.oracle.ageSeconds).to.equal(3600);
  });
});
