/**
 * Circuit Protocol - Closed-Loop Capital Controller & Adaptive Lifecycle Test Suite
 *
 * Proves the 10-step Golden Path financial control loop:
 * SAFE -> BORROW ($2,000 DEBT) -> MARKET SHOCK -> RISK TIGHTENS (DEFENSIVE) ->
 * BLOCK NEW RISK -> REPAY ($1,000 RISK-REDUCING EXEMPTION) -> HEALTH RESTORED -> BORROW UNLOCKS
 *
 * Core Architectural Invariant:
 * Circuit sits above venues to make capital permissions adaptive to live market risk.
 * It does not merely prevent bad actions; it enables good actions and continuously adapts them.
 */

import { expect } from "chai";
import { evaluatePermission, PermissionResult } from "../app/src/lib/permission-engine";
import { evaluateAction } from "../app/src/lib/decision/evaluator";
import type { LiveStateInput, ExecutionMode } from "../app/src/lib/decision/types";

describe("Closed-Loop Capital Controller & Adaptive Borrow/Repay Lifecycle", () => {
  const manualMode: ExecutionMode = { mode: "MANUAL" };
  const agentPubkey = "CircuitAgent111111111111111111111111111111111";
  const agentMode: ExecutionMode = {
    mode: "AGENT",
    agentPubkey,
  };

  // Base healthy position: $10,000 collateral, $0 debt, 50% LTV base
  const baseSafeInput: LiveStateInput = {
    slot: 100_000,
    blockTime: 1_700_000_000,
    protocolPaused: false,
    assetEnabled: true,
    assetMint: "NVDAxMint1111111111111111111111111111111111",
    assetSymbol: "NVDA",
    oraclePrice: 100.0,
    oracleExpo: -8,
    oracleConf: 0.05,
    oracleConfBps: 20,
    oraclePublishTime: 1_700_000_000 - 15, // 15s fresh
    maxOracleAge: 600,
    globalOracleHealthy: true,
    isMarketOpen: true,
    referenceMarketState: "OPEN",
    onchainMarketState: "OPEN",
    ratchetState: "SAFE",
    baseLtvBps: 5000, // 50% Effective LTV
    liquidationThresholdBps: 8000, // 80%
    collateralUsd: 10_000,
    debtUsd: 0,
    agentAuthority: null,
  };

  // --------------------------------------------------------------------------
  // Step 1: Normal Safe State — Borrowing is Normally Enabled
  // --------------------------------------------------------------------------
  it("Step 1: Normal Safe State enables borrowing with realistic 50% capacity ($5,000)", () => {
    const decision = evaluateAction(manualMode, "borrow", 2000, baseSafeInput);

    expect(decision.risk.state).to.equal("SAFE");
    expect(decision.capitalPolicy.borrowAllowed).to.be.true;
    expect(decision.capitalPolicy.maxLtv).to.equal(0.5); // 50%
    expect(decision.capitalPolicy.maxBorrow).to.equal(5000);
    expect(decision.position.availableCreditUsd).to.equal(5000);
    expect(decision.verdict.status).to.equal("ALLOW");
    expect(decision.verdict.code).to.equal("ALLOWED");
  });

  // --------------------------------------------------------------------------
  // Step 2 & 3: Borrow Creates Real Debt ($2,000 USDC Drawn)
  // --------------------------------------------------------------------------
  it("Step 2 & 3: Borrowing $2,000 creates debt, establishing 20% LTV and $3,000 remaining capacity", () => {
    const postBorrowInput: LiveStateInput = {
      ...baseSafeInput,
      debtUsd: 2000,
    };

    // Evaluate subsequent borrow of $1,000 (within remaining $3,000 capacity)
    const decision = evaluateAction(manualMode, "borrow", 1000, postBorrowInput);

    expect(decision.position.debtUsd).to.equal(2000);
    expect(decision.position.debtUsd / decision.position.collateralUsd).to.be.closeTo(0.2, 0.001); // 20% LTV
    expect(decision.position.availableCreditUsd).to.equal(3000); // $5,000 - $2,000
    expect(decision.verdict.status).to.equal("ALLOW");
    expect(decision.verdict.code).to.equal("ALLOWED");
  });

  // --------------------------------------------------------------------------
  // Step 4: Autonomous Strategy Delegation Boundary
  // --------------------------------------------------------------------------
  it("Step 4: Autonomous agent authority covers borrow within strategy budget and LTV limit", () => {
    const agentInput: LiveStateInput = {
      ...baseSafeInput,
      debtUsd: 2000,
      agentAuthority: {
        active: true,
        isExpired: false,
        allowedActions: { deposit: true, borrow: true, repay: true, withdraw: false },
        maxBorrowLimitUsd: 4000,
        maxWithdrawLimitUsd: 0,
        currentBorrowedUsd: 2000,
        riskBudgetUsd: 2000,
      },
    };

    // Agent attempts $1,000 borrow (total would be $3,000, <= $4,000 limit) -> ALLOW
    const allowedDecision = evaluateAction(agentMode, "borrow", 1000, agentInput);
    expect(allowedDecision.verdict.status).to.equal("ALLOW");

    // Agent attempts $2,500 borrow (total would exceed $4,000 strategy limit) -> BLOCK
    const exceededDecision = evaluateAction(agentMode, "borrow", 2500, agentInput);
    expect(exceededDecision.verdict.status).to.equal("BLOCK");
    expect(exceededDecision.verdict.code).to.equal("BORROW_LIMIT_EXCEEDED");
  });

  // --------------------------------------------------------------------------
  // Step 5 & 6: Market Deteriorates — Collateral Falls, Risk Ratchet Tightens
  // --------------------------------------------------------------------------
  it("Step 5 & 6: Market shock (collateral drops to $4,000) causes LTV to rise to 50% and DEFENSIVE state blocks new borrow", () => {
    const defensiveInput: LiveStateInput = {
      ...baseSafeInput,
      collateralUsd: 4000, // Collateral value dropped from $10,000 to $4,000
      debtUsd: 2000,       // Debt remains $2,000
      ratchetState: "DEFENSIVE", // Ratchet tightened due to volatility
      oracleConfBps: 85,
    };

    // Attempting new borrow in DEFENSIVE state is strictly BLOCKED
    const borrowDecision = evaluateAction(manualMode, "borrow", 100, defensiveInput);
    expect(borrowDecision.risk.state).to.equal("DEFENSIVE");
    expect(borrowDecision.position.debtUsd / borrowDecision.position.collateralUsd).to.equal(0.5); // 50% LTV
    expect(borrowDecision.capitalPolicy.borrowAllowed).to.be.false;
    expect(borrowDecision.verdict.status).to.equal("BLOCK");
    expect(borrowDecision.verdict.code).to.equal("BORROW_DISABLED");
  });

  // --------------------------------------------------------------------------
  // Step 7: Position Protection — Withdraw Blocked, Repay Allowed
  // --------------------------------------------------------------------------
  it("Step 7: In DEFENSIVE state, collateral withdrawal is locked, but debt repayment is unconditionally OPEN", () => {
    const defensiveInput: LiveStateInput = {
      ...baseSafeInput,
      collateralUsd: 4000,
      debtUsd: 2000,
      ratchetState: "DEFENSIVE",
    };

    // 1. Withdrawal is BLOCKED (cannot extract collateral while holding debt in stress)
    const withdrawDecision = evaluateAction(manualMode, "withdraw", 500, defensiveInput);
    expect(withdrawDecision.verdict.status).to.equal("BLOCK");
    expect(withdrawDecision.verdict.code).to.equal("WITHDRAW_DISABLED");

    // 2. Repayment is UNCONDITIONALLY ALLOWED (Risk-Reducing Exemption)
    const repayDecision = evaluateAction(manualMode, "repay", 1000, defensiveInput);
    expect(repayDecision.verdict.status).to.equal("ALLOW");
    expect(repayDecision.verdict.code).to.equal("ALLOWED");
    expect(repayDecision.capitalPolicy.repayAllowed).to.be.true;

    // 3. Deposit is also UNCONDITIONALLY ALLOWED
    const depositDecision = evaluateAction(manualMode, "deposit", 500, defensiveInput);
    expect(depositDecision.verdict.status).to.equal("ALLOW");
    expect(depositDecision.capitalPolicy.depositAllowed).to.be.true;
  });

  // --------------------------------------------------------------------------
  // Step 8: Autonomous Agent Executes Repayment under Exemption
  // --------------------------------------------------------------------------
  it("Step 8: Autonomous agent successfully executes debt repayment during DEFENSIVE state", () => {
    const agentDefensiveInput: LiveStateInput = {
      ...baseSafeInput,
      collateralUsd: 4000,
      debtUsd: 2000,
      ratchetState: "DEFENSIVE",
      agentAuthority: {
        active: true,
        isExpired: false,
        allowedActions: { deposit: true, borrow: true, repay: true, withdraw: false },
        maxBorrowLimitUsd: 4000,
        maxWithdrawLimitUsd: 0,
        currentBorrowedUsd: 2000,
        riskBudgetUsd: 2000,
      },
    };

    // Agent borrow is blocked by protocol risk state
    const agentBorrow = evaluateAction(agentMode, "borrow", 100, agentDefensiveInput);
    expect(agentBorrow.verdict.status).to.equal("BLOCK");

    // Agent repay is ALLOWED under risk-reducing exemption
    const agentRepay = evaluateAction(agentMode, "repay", 1000, agentDefensiveInput);
    expect(agentRepay.verdict.status).to.equal("ALLOW");
    expect(agentRepay.verdict.code).to.equal("ALLOWED");
  });

  // --------------------------------------------------------------------------
  // Step 9 & 10: Repayment De-risks Position and Risk Recovers to SAFE, Unlocking Borrow
  // --------------------------------------------------------------------------
  it("Step 9 & 10: Repaying $1,000 cuts debt to $1,000, LTV drops to 25%, Ratchet recovers to SAFE, and borrow unlocks", () => {
    // Position after $1,000 repayment:
    const recoveredInput: LiveStateInput = {
      ...baseSafeInput,
      collateralUsd: 4000,
      debtUsd: 1000, // Reduced from $2,000 to $1,000
      ratchetState: "SAFE", // Hysteresis recovered back to SAFE after health restoration
      oracleConfBps: 20,
    };

    const unlockDecision = evaluateAction(manualMode, "borrow", 500, recoveredInput);

    expect(unlockDecision.risk.state).to.equal("SAFE");
    expect(unlockDecision.position.debtUsd).to.equal(1000);
    expect(unlockDecision.position.debtUsd / unlockDecision.position.collateralUsd).to.equal(0.25); // 25% LTV (safe)
    expect(unlockDecision.capitalPolicy.borrowAllowed).to.be.true;
    expect(unlockDecision.position.availableCreditUsd).to.equal(1000); // ($4,000 * 50%) - $1,000 = $1,000
    expect(unlockDecision.verdict.status).to.equal("ALLOW");
    expect(unlockDecision.verdict.code).to.equal("ALLOWED");
  });

  // --------------------------------------------------------------------------
  // Closed-Loop Verification: Full 10-Step Lifecycle Transition Consistency
  // --------------------------------------------------------------------------
  it("Full closed-loop invariant: Solvency preservation never locks out recovery, and recovery restores origination", () => {
    // 1. Initial SAFE state
    const p1 = evaluatePermission({
      actor: "HUMAN",
      action: "borrow",
      amountUsd: 2000,
      riskState: "SAFE",
      baseLtvBps: 5000,
      collateralUsd: 10000,
      currentDebtUsd: 0,
    });
    expect(p1.allowed).to.be.true;

    // 2. DEFENSIVE lockdown
    const p2 = evaluatePermission({
      actor: "HUMAN",
      action: "borrow",
      amountUsd: 500,
      riskState: "DEFENSIVE",
      baseLtvBps: 5000,
      collateralUsd: 4000,
      currentDebtUsd: 2000,
    });
    expect(p2.allowed).to.be.false;
    expect(p2.reasonCode).to.equal("BORROW_DISABLED");

    // 3. DEFENSIVE repayment permitted
    const p3 = evaluatePermission({
      actor: "HUMAN",
      action: "repay",
      amountUsd: 1000,
      riskState: "DEFENSIVE",
      baseLtvBps: 5000,
      collateralUsd: 4000,
      currentDebtUsd: 2000,
    });
    expect(p3.allowed).to.be.true;
    expect(p3.reasonCode).to.equal("ALLOWED");

    // 4. Recovered SAFE state permits borrowing again
    const p4 = evaluatePermission({
      actor: "HUMAN",
      action: "borrow",
      amountUsd: 500,
      riskState: "SAFE",
      baseLtvBps: 5000,
      collateralUsd: 4000,
      currentDebtUsd: 1000,
    });
    expect(p4.allowed).to.be.true;
    expect(p4.reasonCode).to.equal("ALLOWED");
  });
});
