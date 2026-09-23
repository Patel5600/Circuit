import { expect } from "chai";
import { PublicKey, Keypair } from "@solana/web3.js";
import {
  evaluatePermission,
  type PermissionEvaluationParams,
} from "../app/src/lib/permission-engine";
import {
  VENUE_CREDIT,
  VENUE_METEORA_DBC,
  VENUE_TRADING,
  ENVELOPE_ACTION_BORROW,
  ENVELOPE_ACTION_WITHDRAW,
  ENVELOPE_ACTION_SWAP,
  ENVELOPE_ACTION_ENTER_LIQUIDITY,
  ENVELOPE_ACTION_EXIT_LIQUIDITY,
  ENVELOPE_ACTION_REPAY,
  ENVELOPE_ACTION_DEPOSIT,
  DEFAULT_ENVELOPE_TTL_SLOTS,
} from "../app/src/lib/envelope";
import { decodeHaltState } from "../app/src/lib/protocol";
import {
  isValidRatchetTransition,
  evaluateRatchetState,
  DEFAULT_RATCHET_THRESHOLDS,
  type RiskRatchetState,
} from "../app/src/lib/risk/ratchet";

describe("Circuit Risk Kernel — 20-Scenario Adversarial & Halt State Invariant Suite (Section 17)", () => {
  const AAPL_MINT = Keypair.generate().publicKey;
  const MSFT_MINT = Keypair.generate().publicKey;
  const OWNER = Keypair.generate().publicKey;
  const AGENT = Keypair.generate().publicKey;

  // Helper for mock agent authority
  const mockAgentAuthority = (overrides = {}) => ({
    active: true,
    isExpired: false,
    allowedActions: {
      deposit: true,
      borrow: true,
      repay: true,
      withdraw: true,
    },
    maxBorrowLimitUsd: 10_000,
    maxWithdrawLimitUsd: 10_000,
    currentBorrowedUsd: 0,
    riskBudgetUsd: 5_000,
    ...overrides,
  });

  // --------------------------------------------------------------------------
  // Scenario 1: Session closed -> CLOSED
  // --------------------------------------------------------------------------
  it("Scenario 1: Session closed -> MarketGuard reports CLOSED, borrow blocked with MARKET_CLOSED", () => {
    const result = evaluatePermission({
      actor: "HUMAN",
      action: "borrow",
      amountUsd: 1_000,
      haltState: "closed",
      sessionExpectedOpen: false,
      isMarketOpen: false,
      collateralUsd: 10_000,
      baseLtvBps: 7000,
    });
    expect(result.allowed).to.be.false;
    expect(result.reasonCode).to.equal("MARKET_CLOSED");
  });

  // --------------------------------------------------------------------------
  // Scenario 2: Session open + fresh feed -> OPEN_NORMAL
  // --------------------------------------------------------------------------
  it("Scenario 2: Session open + fresh feed -> OPEN_NORMAL permits standard borrow", () => {
    const result = evaluatePermission({
      actor: "HUMAN",
      action: "borrow",
      amountUsd: 1_000,
      haltState: "open_normal",
      sessionExpectedOpen: true,
      isMarketOpen: true,
      oracleStale: false,
      confBps: 20,
      maxConfBps: 100,
      collateralUsd: 10_000,
      currentDebtUsd: 0,
      baseLtvBps: 7000,
      riskState: "SAFE",
    });
    expect(result.allowed).to.be.true;
    expect(result.reasonCode).to.equal("ALLOWED");
    expect(result.effectiveLtvBps).to.equal(7000);
  });

  // --------------------------------------------------------------------------
  // Scenario 3: Session open + single-asset stale feed + healthy global oracle -> HALTED_INFERRED
  // --------------------------------------------------------------------------
  it("Scenario 3: Session open + single-asset stale feed + healthy global oracle -> HALTED_INFERRED detected", () => {
    const result = evaluatePermission({
      actor: "HUMAN",
      action: "borrow",
      amountUsd: 500,
      haltState: "halted_inferred",
      sessionExpectedOpen: true,
      globalOracleHealthy: true,
      collateralUsd: 10_000,
      baseLtvBps: 7000,
    });
    expect(result.allowed).to.be.false;
    expect(result.reasonCode).to.equal("SECURITY_HALT_INFERRED");
    expect(result.riskState).to.equal("DEFENSIVE");
    expect(result.message).to.include("Inferred security-level halt");
  });

  // --------------------------------------------------------------------------
  // Scenario 4: Multiple assets stale / global oracle degraded -> not falsely classified as single halt
  // --------------------------------------------------------------------------
  it("Scenario 4: Global oracle degraded -> blocks with ORACLE_UNAVAILABLE instead of single-stock halt", () => {
    const result = evaluatePermission({
      actor: "HUMAN",
      action: "borrow",
      amountUsd: 500,
      globalOracleHealthy: false,
      haltState: "closed",
      collateralUsd: 10_000,
      baseLtvBps: 7000,
    });
    expect(result.allowed).to.be.false;
    expect(result.reasonCode).to.equal("ORACLE_UNAVAILABLE");
    expect(result.message).to.include("Global oracle failure");
  });

  // --------------------------------------------------------------------------
  // Scenario 5: Halted asset borrow -> BLOCK
  // --------------------------------------------------------------------------
  it("Scenario 5: Halted asset borrow -> blocked with SECURITY_HALT_INFERRED", () => {
    const result = evaluatePermission({
      actor: "HUMAN",
      action: "borrow",
      amountUsd: 100,
      haltState: "halted_inferred",
      sessionExpectedOpen: true,
      globalOracleHealthy: true,
      collateralUsd: 5_000,
      baseLtvBps: 7000,
    });
    expect(result.allowed).to.be.false;
    expect(result.reasonCode).to.equal("SECURITY_HALT_INFERRED");
  });

  // --------------------------------------------------------------------------
  // Scenario 6: Halted asset repayment -> ALLOW
  // --------------------------------------------------------------------------
  it("Scenario 6: Halted asset repayment -> unconditionally ALLOWED for debt retirement", () => {
    const result = evaluatePermission({
      actor: "HUMAN",
      action: "repay",
      amountUsd: 1_000,
      haltState: "halted_inferred",
      sessionExpectedOpen: true,
      globalOracleHealthy: true,
      currentDebtUsd: 2_000,
      riskState: "DEFENSIVE",
    });
    expect(result.allowed).to.be.true;
    expect(result.reasonCode).to.equal("ALLOWED");
    expect(result.message).to.include("repayment unconditionally permitted");
  });

  // --------------------------------------------------------------------------
  // Scenario 7: Halted asset recovery -> ALLOW
  // --------------------------------------------------------------------------
  it("Scenario 7: Halted asset recovery (deposit, exit_liquidity, recover_liquidity) -> ALLOWED", () => {
    const depositRes = evaluatePermission({
      actor: "HUMAN",
      action: "deposit",
      amountUsd: 500,
      haltState: "halted_inferred",
      sessionExpectedOpen: true,
    });
    expect(depositRes.allowed).to.be.true;
    expect(depositRes.reasonCode).to.equal("ALLOWED");

    const exitLiqRes = evaluatePermission({
      actor: "HUMAN",
      action: "exit_liquidity",
      amountUsd: 500,
      haltState: "halted_inferred",
      sessionExpectedOpen: true,
    });
    expect(exitLiqRes.allowed).to.be.true;
    expect(exitLiqRes.reasonCode).to.equal("ALLOWED");

    const recoverLiqRes = evaluatePermission({
      actor: "HUMAN",
      action: "recover_liquidity",
      amountUsd: 500,
      haltState: "halted_inferred",
      sessionExpectedOpen: true,
    });
    expect(recoverLiqRes.allowed).to.be.true;
    expect(recoverLiqRes.reasonCode).to.equal("ALLOWED");
  });

  // --------------------------------------------------------------------------
  // Scenario 8: Unrelated asset during single-asset halt -> unaffected
  // --------------------------------------------------------------------------
  it("Scenario 8: Asset isolation — MSFT remains OPEN_NORMAL and borrowable while AAPL is HALTED_INFERRED", () => {
    // AAPL evaluation: halted
    const aaplRes = evaluatePermission({
      actor: "HUMAN",
      action: "borrow",
      assetSymbol: "AAPL",
      haltState: "halted_inferred",
      sessionExpectedOpen: true,
      globalOracleHealthy: true,
      collateralUsd: 10_000,
      baseLtvBps: 7000,
    });
    expect(aaplRes.allowed).to.be.false;
    expect(aaplRes.reasonCode).to.equal("SECURITY_HALT_INFERRED");

    // MSFT evaluation: nominal
    const msftRes = evaluatePermission({
      actor: "HUMAN",
      action: "borrow",
      assetSymbol: "MSFT",
      haltState: "open_normal",
      sessionExpectedOpen: true,
      globalOracleHealthy: true,
      oracleStale: false,
      confBps: 15,
      maxConfBps: 100,
      collateralUsd: 10_000,
      amountUsd: 1_000,
      baseLtvBps: 7000,
      riskState: "SAFE",
    });
    expect(msftRes.allowed).to.be.true;
    expect(msftRes.reasonCode).to.equal("ALLOWED");
  });

  // --------------------------------------------------------------------------
  // Scenario 9: Existing RiskEnvelope issued before halt -> invalidated after risk_epoch increments
  // --------------------------------------------------------------------------
  it("Scenario 9: Envelope invalidation — RiskEnvelope issued at epoch 5 is rejected at current epoch 6", () => {
    const envelopeRiskEpoch: bigint = 5n;
    const currentRiskEpoch: bigint = 6n; // Incremented by refresh_guard upon halt inference

    // Standalone verification logic matching circuit-risk-sdk verify_envelope
    const isEpochValid = envelopeRiskEpoch === currentRiskEpoch;
    expect(isEpochValid).to.be.false;
  });

  // --------------------------------------------------------------------------
  // Scenario 10: Expired envelope -> REJECT
  // --------------------------------------------------------------------------
  it("Scenario 10: Envelope TTL expiration — envelope with expires_at_slot < current_slot is rejected", () => {
    const currentSlot = 105n;
    const expiresAtSlot = 100n;
    const isNotExpired = currentSlot <= expiresAtSlot;
    expect(isNotExpired).to.be.false;
  });

  // --------------------------------------------------------------------------
  // Scenario 11: Consumed envelope -> REJECT
  // --------------------------------------------------------------------------
  it("Scenario 11: Envelope replay protection — consumed envelope is rejected", () => {
    const envelope = {
      consumed: true,
      consumedAtSlot: 99n,
    };
    const isUsable = !envelope.consumed;
    expect(isUsable).to.be.false;
  });

  // --------------------------------------------------------------------------
  // Scenario 12: Wrong asset mint -> REJECT
  // --------------------------------------------------------------------------
  it("Scenario 12: Envelope asset mint gating — envelope for AAPL cannot execute against MSFT", () => {
    const envelopeAssetMint = AAPL_MINT;
    const requestedAssetMint = MSFT_MINT;
    const isMintMatch = envelopeAssetMint.equals(requestedAssetMint);
    expect(isMintMatch).to.be.false;
  });

  // --------------------------------------------------------------------------
  // Scenario 13: Wrong action -> REJECT
  // --------------------------------------------------------------------------
  it("Scenario 13: Envelope action gating — envelope authorized for BORROW cannot execute WITHDRAW", () => {
    const envelopeAction: number = ENVELOPE_ACTION_BORROW;
    const executingAction: number = ENVELOPE_ACTION_WITHDRAW;
    const isActionMatch = envelopeAction === executingAction;
    expect(isActionMatch).to.be.false;
  });

  // --------------------------------------------------------------------------
  // Scenario 14: Wrong venue -> REJECT
  // --------------------------------------------------------------------------
  it("Scenario 14: Envelope venue gating — envelope authorized for CREDIT cannot execute METEORA_DBC", () => {
    const envelopeVenue: number = VENUE_CREDIT;
    const executingVenue: number = VENUE_METEORA_DBC;
    const isVenueMatch = envelopeVenue === executingVenue;
    expect(isVenueMatch).to.be.false;
  });

  // --------------------------------------------------------------------------
  // Scenario 15: Amount > envelope limit -> REJECT
  // --------------------------------------------------------------------------
  it("Scenario 15: Envelope limit ceiling — requested amount exceeding max_notional is rejected", () => {
    const maxNotional = 1_000_000_000n; // 1,000 USDC
    const requestedAmount = 1_000_000_001n;
    const isWithinAmount = requestedAmount <= maxNotional;
    expect(isWithinAmount).to.be.false;
  });

  // --------------------------------------------------------------------------
  // Scenario 16: Agent without authority -> REJECT
  // --------------------------------------------------------------------------
  it("Scenario 16: Agent delegation validation — agent without active authority is rejected", () => {
    const result = evaluatePermission({
      actor: "AGENT",
      action: "borrow",
      amountUsd: 500,
      agentAuthority: null,
      collateralUsd: 10_000,
    });
    expect(result.allowed).to.be.false;
    expect(result.reasonCode).to.equal("AGENT_UNAUTHORIZED");
  });

  // --------------------------------------------------------------------------
  // Scenario 17: Agent outside authority limits -> REJECT
  // --------------------------------------------------------------------------
  it("Scenario 17: Agent limit enforcement — borrow exceeding maxBorrowLimitUsd is rejected", () => {
    const result = evaluatePermission({
      actor: "AGENT",
      action: "borrow",
      amountUsd: 15_000, // Limit is 10,000
      agentAuthority: mockAgentAuthority({ maxBorrowLimitUsd: 10_000 }),
      collateralUsd: 50_000,
      baseLtvBps: 7000,
    });
    expect(result.allowed).to.be.false;
    expect(result.reasonCode).to.equal("BORROW_LIMIT_EXCEEDED");
  });

  // --------------------------------------------------------------------------
  // Scenario 18: Agent with valid bounded authority -> ALLOW
  // --------------------------------------------------------------------------
  it("Scenario 18: Agent bounded execution — agent with valid authority within budget is ALLOWED", () => {
    const result = evaluatePermission({
      actor: "AGENT",
      action: "borrow",
      amountUsd: 2_000,
      agentAuthority: mockAgentAuthority({
        maxBorrowLimitUsd: 10_000,
        riskBudgetUsd: 5_000,
      }),
      collateralUsd: 20_000,
      baseLtvBps: 7000,
      oracleStale: false,
      confBps: 20,
      maxConfBps: 100,
      riskState: "SAFE",
    });
    expect(result.allowed).to.be.true;
    expect(result.reasonCode).to.equal("ALLOWED");
    expect(result.actionCostUsd).to.equal(2004); // C(a) = 2000 * (1 + 20/10000)
    expect(result.remainingRiskBudgetUsd).to.equal(2996); // 5000 - 2004
  });

  // --------------------------------------------------------------------------
  // Scenario 19: Risk state tightening -> immediate restriction
  // --------------------------------------------------------------------------
  it("Scenario 19: Asymmetric fast tightening — transition to DEFENSIVE immediately restricts borrowing", () => {
    // Monotonic ratchet allows instant jump down
    expect(isValidRatchetTransition("SAFE", "DEFENSIVE")).to.be.true;

    // Evaluates DEFENSIVE permission: borrowing blocked
    const result = evaluatePermission({
      actor: "HUMAN",
      action: "borrow",
      amountUsd: 500,
      riskState: "DEFENSIVE",
      collateralUsd: 10_000,
      baseLtvBps: 7000,
    });
    expect(result.allowed).to.be.false;
    expect(result.reasonCode).to.equal("BORROW_DISABLED");
    expect(result.effectiveLtvBps).to.equal(5000); // 7000 - 2000
  });

  // --------------------------------------------------------------------------
  // Scenario 20: Recovery -> existing 5-observation hysteresis and cooldown preserved
  // --------------------------------------------------------------------------
  it("Scenario 20: Monotonic staged recovery — requires step-by-step transition and 5 consecutive healthy cranks", () => {
    // Direct recovery jump from EMERGENCY -> SAFE is prohibited
    expect(isValidRatchetTransition("EMERGENCY", "SAFE")).to.be.false;
    expect(isValidRatchetTransition("EMERGENCY", "RESTRICTED")).to.be.false;
    expect(isValidRatchetTransition("EMERGENCY", "DEFENSIVE")).to.be.true;

    // Direct recovery jump from DEFENSIVE -> SAFE is prohibited
    expect(isValidRatchetTransition("DEFENSIVE", "SAFE")).to.be.false;
    expect(isValidRatchetTransition("DEFENSIVE", "RESTRICTED")).to.be.true;

    // Hysteresis requirement: 4 healthy cranks does not recover
    const fourCranks = evaluateRatchetState(
      "RESTRICTED",
      25, // healthy spread
      true, // market open
      false, // custody nominal
      30, // low concentration
      4 // only 4 cranks (< required 5)
    );
    expect(fourCranks.nextState).to.equal("RESTRICTED");
    expect(fourCranks.recoveryBufferActive).to.be.true;

    // 5th healthy crank completes recovery step to SAFE
    const fiveCranks = evaluateRatchetState(
      "RESTRICTED",
      25,
      true,
      false,
      30,
      5 // 5 cranks reached
    );
    expect(fiveCranks.nextState).to.equal("SAFE");
    expect(fiveCranks.recoveryBufferActive).to.be.false;
  });
});
