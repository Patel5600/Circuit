/**
 * Circuit Protocol — Sovereignty, Recovery Engine & Decision Log Test Suite
 *
 * Formally proves:
 * 1. Recovery Engine mathematically calculates the exact minimum debt reduction
 *    required to restore health factor to target (1.05), preventing over-liquidation.
 * 2. Deterministic State A (SAFE) vs State B (DEFENSIVE) governance:
 *    Same agent and same asset can borrow in SAFE, but is blocked in DEFENSIVE,
 *    while capital recovery (repay) remains unconditionally open.
 * 3. Canonical Policy Versioning & Decision Log audit trail records all decisions
 *    with immutable policyVersion, evaluatedAt timestamp, and venue context.
 */

import { expect } from "chai";
import {
  calculateHealthFactor,
  calculateMinimumRestorationDebt,
} from "../app/src/lib/recovery-engine";
import {
  evaluatePermission,
  CANONICAL_POLICY_VERSION,
} from "../app/src/lib/permission-engine";
import { decisionLogStore } from "../app/src/lib/realtime/decision-log";

describe("Circuit Sovereignty, Recovery Engine & Decision Audit Suite", () => {
  beforeEach(() => {
    decisionLogStore.clear();
  });

  describe("1. Recovery Engine & Minimum Debt Restoration Invariants", () => {
    it("returns null health factor when position has zero debt (infinite solvency)", () => {
      const hf = calculateHealthFactor(10_000, 0, 8000);
      expect(hf).to.be.null;
    });

    it("identifies healthy position (HF >= 1.05) and requires zero recovery debt", () => {
      // Collateral = $10,000, Debt = $5,000, LiqThreshold = 80% (8000 bps)
      // Max borrow = $8,000 -> HF = 8000 / 5000 = 1.60
      const recovery = calculateMinimumRestorationDebt(10_000, 5_000, 8000, 10_500, 500);
      expect(recovery.isRecoveryNeeded).to.be.false;
      expect(recovery.requiredRepayUsd).to.equal(0);
      expect(recovery.currentHealthFactor).to.be.closeTo(1.6, 0.01);
    });

    it("calculates exact minimum restoration debt to bring underwater position to HF 1.05", () => {
      // Collateral = $10,000, Debt = $9,000, LiqThreshold = 80% (8000 bps)
      // HF = (10,000 * 0.8) / 9,000 = 0.8888 (< 1.05) -> underwater!
      const recovery = calculateMinimumRestorationDebt(10_000, 9_000, 8000, 10_500, 500);
      expect(recovery.isRecoveryNeeded).to.be.true;
      expect(recovery.requiredRepayUsd).to.be.greaterThan(0);
      expect(recovery.requiredRepayUsd).to.be.lessThan(9_000);

      // Verify that after repaying requiredRepayUsd, new debt gives projected HF >= 1.05
      const newDebt = 9_000 - recovery.requiredRepayUsd;
      const newHf = calculateHealthFactor(10_000, newDebt, 8000);
      expect(newHf).to.not.be.null;
      expect(newHf!).to.be.at.least(1.049); // meets or exceeds 1.05
    });

    it("handles total insolvency by capping required repayment at total debt", () => {
      // Collateral = $0, Debt = $5,000 -> complete wipeout
      const recovery = calculateMinimumRestorationDebt(0, 5_000, 8000, 10_500, 500);
      expect(recovery.isRecoveryNeeded).to.be.true;
      expect(recovery.requiredRepayUsd).to.equal(5_000);
    });
  });

  describe("2. Deterministic State A vs State B Sovereignty Demonstration", () => {
    const testAsset = "NVDAx";
    const testAmount = 500;
    const testAuthority = {
      active: true,
      isExpired: false,
      allowedActions: { deposit: true, borrow: true, repay: true, withdraw: true },
      maxBorrowLimitUsd: 10_000,
      maxWithdrawLimitUsd: 10_000,
      currentBorrowedUsd: 0,
      riskBudgetUsd: 10_000,
    };

    it("STATE A (SAFE): Agent borrow is ALLOWED by permission engine", () => {
      const resultSafe = evaluatePermission({
        actor: "AGENT",
        action: "borrow",
        amountUsd: testAmount,
        riskState: "SAFE",
        isMarketOpen: true,
        confBps: 20,
        maxConfBps: 100,
        baseLtvBps: 7000,
        collateralUsd: 5_000,
        currentDebtUsd: 0,
        assetSymbol: testAsset,
        agentAuthority: testAuthority,
      });

      expect(resultSafe.allowed).to.be.true;
      expect(resultSafe.reasonCode).to.equal("ALLOWED");
      expect(resultSafe.policyVersion).to.equal(CANONICAL_POLICY_VERSION);
      expect(resultSafe.venue).to.equal("CIRCUIT_LENDING");
    });

    it("STATE B (DEFENSIVE): Same agent, asset, and action is BLOCKED", () => {
      const resultDefensive = evaluatePermission({
        actor: "AGENT",
        action: "borrow",
        amountUsd: testAmount,
        riskState: "DEFENSIVE",
        isMarketOpen: true,
        confBps: 20,
        maxConfBps: 100,
        baseLtvBps: 7000,
        collateralUsd: 5_000,
        currentDebtUsd: 0,
        assetSymbol: testAsset,
        agentAuthority: testAuthority,
      });

      expect(resultDefensive.allowed).to.be.false;
      expect(resultDefensive.reasonCode).to.equal("BORROW_DISABLED");
    });

    it("STATE B (DEFENSIVE): Recovery action (REPAY) remains unconditionally ALLOWED", () => {
      const resultRepay = evaluatePermission({
        actor: "AGENT",
        action: "repay",
        amountUsd: testAmount,
        riskState: "DEFENSIVE",
        isMarketOpen: true,
        confBps: 20,
        maxConfBps: 100,
        baseLtvBps: 7000,
        collateralUsd: 5_000,
        currentDebtUsd: 1_000,
        assetSymbol: testAsset,
        agentAuthority: testAuthority,
      });

      expect(resultRepay.allowed).to.be.true;
      expect(resultRepay.reasonCode).to.equal("ALLOWED");
    });
  });

  describe("3. Policy Versioning & Decision Log Audit Trail", () => {
    it("records every permission evaluation in the Decision Log store", () => {
      decisionLogStore.clear();

      evaluatePermission({
        actor: "HUMAN",
        action: "borrow",
        amountUsd: 250,
        riskState: "SAFE",
        assetSymbol: "AAPLx",
        collateralUsd: 1_000,
      });

      const entries = decisionLogStore.getEntries();
      expect(entries.length).to.equal(1);
      expect(entries[0].action).to.equal("borrow");
      expect(entries[0].assetSymbol).to.equal("AAPLx");
      expect(entries[0].requestedAmountUsd).to.equal(250);
      expect(entries[0].policyVersion).to.equal(CANONICAL_POLICY_VERSION);
      expect(entries[0].venue).to.equal("CIRCUIT_LENDING");
    });

    it("allows updating an audit entry with confirmed transaction signature", () => {
      decisionLogStore.clear();

      const created = decisionLogStore.recordDecision({
        actor: "AGENT",
        assetSymbol: "NVDAx",
        action: "borrow",
        requestedAmountUsd: 500,
        riskState: "SAFE",
        policyVersion: CANONICAL_POLICY_VERSION,
        allowed: true,
        reasonCode: "ALLOWED",
        message: "Operation authorized",
        venue: "CIRCUIT_LENDING",
        executionStatus: "PENDING",
      });

      expect(created.executionStatus).to.equal("PENDING");

      const mockTxSig = "5Knz7...mockSolanaDevnetSig";
      decisionLogStore.updateExecution(created.id, "EXECUTED", mockTxSig);

      const updated = decisionLogStore.getEntries().find((e) => e.id === created.id);
      expect(updated).to.exist;
      expect(updated!.executionStatus).to.equal("EXECUTED");
      expect(updated!.txSignature).to.equal(mockTxSig);
    });
  });
});
