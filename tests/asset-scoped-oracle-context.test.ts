/**
 * Circuit Protocol - Mandatory Test Matrix: Asset-Scoped Oracle Context
 *
 * Verifies strict per-asset isolation across all layers:
 * AssetRegistry -> OracleService -> PermissionEngine -> DecisionEvaluator -> Execution
 *
 * Prevents cross-asset contamination (e.g. AAPL oracle outage blocking NVDA borrowing).
 */

import { expect } from "chai";
import {
  AssetRegistry,
  normalizeAssetId,
  assertAssetContextIntegrity,
  AssetContextMismatchError,
} from "../app/src/lib/assets/registry";
import { OracleService } from "../app/src/lib/assets/oracle-service";
import {
  evaluatePermission,
  PermissionEvaluationParams,
} from "../app/src/lib/permission-engine";
import { evaluateAction } from "../app/src/lib/decision/evaluator";
import type { LiveStateInput, ExecutionMode } from "../app/src/lib/decision/types";

describe("Asset-Scoped Oracle Context & Isolation Suite (Requirement 15)", () => {
  const nvdaConfig = AssetRegistry.require("NVDA");
  const aaplConfig = AssetRegistry.require("AAPL");
  const msftConfig = AssetRegistry.require("MSFT");

  beforeEach(() => {
    // Reset oracles to fresh baseline
    OracleService.updateState("NVDA", {
      priceUsd: 117.32,
      confBps: 15,
      healthy: true,
      oracleState: "FRESH",
      freshness: "LIVE",
      publishTime: Math.floor(Date.now() / 1000) - 5,
      ageSeconds: 5,
    });

    OracleService.updateState("AAPL", {
      priceUsd: 224.5,
      confBps: 18,
      healthy: true,
      oracleState: "FRESH",
      freshness: "LIVE",
      publishTime: Math.floor(Date.now() / 1000) - 5,
      ageSeconds: 5,
    });
  });

  after(() => {
    OracleService.updateState("NVDA", {
      priceUsd: 117.32,
      confBps: 15,
      healthy: true,
      oracleState: "FRESH",
      freshness: "LIVE",
      publishTime: Math.floor(Date.now() / 1000) - 5,
      ageSeconds: 5,
    });

    OracleService.updateState("AAPL", {
      priceUsd: 224.5,
      confBps: 18,
      healthy: true,
      oracleState: "FRESH",
      freshness: "LIVE",
      publishTime: Math.floor(Date.now() / 1000) - 5,
      ageSeconds: 5,
    });
  });

  // --------------------------------------------------------------------------
  // TEST 1: Open NVDA route -> oracle must be NVDA
  // --------------------------------------------------------------------------
  it("TEST 1: Open NVDA route -> oracle must be NVDA", () => {
    const asset = AssetRegistry.require("NVDA");
    expect(asset.assetId).to.equal("NVDA");
    expect(asset.symbol).to.equal("NVDA");
    expect(asset.pythFeedId).to.equal(nvdaConfig.pythFeedId);
    expect(asset.pythFeedAccount).to.equal(nvdaConfig.pythFeedAccount);

    const oracle = OracleService.getState("NVDA");
    expect(oracle.assetId).to.equal("NVDA");
    expect(oracle.symbol).to.equal("NVDA");
    expect(oracle.feedId).to.equal(nvdaConfig.pythFeedId);
    expect(oracle.priceAccount).to.equal(nvdaConfig.pythFeedAccount);
    expect(oracle.feedId).to.not.equal(aaplConfig.pythFeedId);
    expect(oracle.priceAccount).to.not.equal(aaplConfig.pythFeedAccount);
  });

  // --------------------------------------------------------------------------
  // TEST 2: Open AAPL route -> oracle must be AAPL
  // --------------------------------------------------------------------------
  it("TEST 2: Open AAPL route -> oracle must be AAPL", () => {
    const asset = AssetRegistry.require("AAPL");
    expect(asset.assetId).to.equal("AAPL");
    expect(asset.symbol).to.equal("AAPL");
    expect(asset.pythFeedId).to.equal(aaplConfig.pythFeedId);
    expect(asset.pythFeedAccount).to.equal(aaplConfig.pythFeedAccount);

    const oracle = OracleService.getState("AAPL");
    expect(oracle.assetId).to.equal("AAPL");
    expect(oracle.symbol).to.equal("AAPL");
    expect(oracle.feedId).to.equal(aaplConfig.pythFeedId);
    expect(oracle.priceAccount).to.equal(aaplConfig.pythFeedAccount);
    expect(oracle.feedId).to.not.equal(nvdaConfig.pythFeedId);
    expect(oracle.priceAccount).to.not.equal(nvdaConfig.pythFeedAccount);
  });

  // --------------------------------------------------------------------------
  // TEST 3: AAPL oracle unavailable -> NVDA remains unaffected
  // --------------------------------------------------------------------------
  it("TEST 3: AAPL oracle unavailable -> NVDA remains unaffected", () => {
    // AAPL oracle dies completely
    OracleService.updateState("AAPL", {
      healthy: false,
      oracleState: "UNAVAILABLE",
      freshness: "UNAVAILABLE",
      priceUsd: 0,
      ageSeconds: 999999,
    });

    // NVDA oracle remains healthy
    OracleService.updateState("NVDA", {
      priceUsd: 117.32,
      healthy: true,
      oracleState: "FRESH",
      freshness: "LIVE",
      ageSeconds: 4,
    });

    const nvdaPerm = evaluatePermission({
      actor: "HUMAN",
      action: "borrow",
      assetId: "NVDA",
      collateralUsd: 25 * 117.32,
      amountUsd: 500,
      riskState: "SAFE",
      isMarketOpen: true,
    });

    expect(nvdaPerm.allowed).to.equal(true);
    expect(nvdaPerm.reasonCode).to.equal("ALLOWED");
    expect(nvdaPerm.message).to.not.include("AAPL");

    // Decision evaluator for NVDA must report ALLOWED with NVDA price
    const nvdaDecision = evaluateAction(
      { mode: "MANUAL" },
      "borrow",
      500,
      {
        slot: 1000,
        blockTime: null,
        protocolPaused: false,
        assetEnabled: true,
        assetMint: nvdaConfig.tokenMint,
        assetSymbol: "NVDA",
        oraclePrice: 117.32,
        oracleExpo: -8,
        oracleConf: 0.1,
        oracleConfBps: 15,
        oraclePublishTime: Math.floor(Date.now() / 1000) - 4,
        maxOracleAge: 600,
        globalOracleHealthy: true,
        isMarketOpen: true,
        referenceMarketState: "OPEN",
        onchainMarketState: "OPEN",
        oracleState: "FRESH",
        ratchetState: "SAFE",
        baseLtvBps: 7000,
        collateralUsd: 25 * 117.32,
        debtUsd: 0,
        agentAuthority: null,
      }
    );

    expect(nvdaDecision.permission.allowed).to.equal(true);
    expect(nvdaDecision.assetSymbol).to.equal("NVDA");
    expect(nvdaDecision.oracle.price).to.equal(117.32);
    expect(nvdaDecision.oracle.freshness).to.equal("LIVE");
    expect(nvdaDecision.oracle.oracleState).to.equal("FRESH");
  });

  // --------------------------------------------------------------------------
  // TEST 4: NVDA oracle unavailable -> NVDA permission reflects NVDA oracle state
  // --------------------------------------------------------------------------
  it("TEST 4: NVDA oracle unavailable -> NVDA permission reflects NVDA oracle state", () => {
    OracleService.updateState("NVDA", {
      healthy: false,
      oracleState: "UNAVAILABLE",
      freshness: "UNAVAILABLE",
      priceUsd: 0,
      ageSeconds: 999999,
    });

    const nvdaPerm = evaluatePermission({
      actor: "HUMAN",
      action: "borrow",
      assetId: "NVDA",
      collateralUsd: 25 * 117.32,
      amountUsd: 500,
      riskState: "SAFE",
      isMarketOpen: true,
    });

    expect(nvdaPerm.allowed).to.equal(false);
    expect(nvdaPerm.reasonCode).to.equal("ORACLE_UNAVAILABLE");
    expect(nvdaPerm.message).to.include("NVDA oracle price unavailable");
    expect(nvdaPerm.message).to.not.include("AAPL");
  });

  // --------------------------------------------------------------------------
  // TEST 5: Switch: NVDA -> AAPL -> NVDA, verify no stale AAPL state on final NVDA screen
  // --------------------------------------------------------------------------
  it("TEST 5: Switch: NVDA -> AAPL -> NVDA, verify no stale AAPL state on final NVDA screen", () => {
    // 1. Visit NVDA
    const screen1 = OracleService.getState("NVDA");
    expect(screen1.assetId).to.equal("NVDA");
    expect(screen1.feedId).to.equal(nvdaConfig.pythFeedId);

    // 2. Visit AAPL and simulate an AAPL issue
    OracleService.updateState("AAPL", {
      healthy: false,
      oracleState: "STALE",
      freshness: "STALE",
      ageSeconds: 1500,
    });
    const screen2 = OracleService.getState("AAPL");
    expect(screen2.assetId).to.equal("AAPL");
    expect(screen2.oracleState).to.equal("STALE");

    // 3. Navigate back to NVDA
    const screen3 = OracleService.getState("NVDA");
    expect(screen3.assetId).to.equal("NVDA");
    expect(screen3.feedId).to.equal(nvdaConfig.pythFeedId);
    expect(screen3.oracleState).to.equal("FRESH");
    expect(screen3.healthy).to.equal(true);

    const nvdaPerm = evaluatePermission({
      actor: "HUMAN",
      action: "borrow",
      assetId: "NVDA",
      collateralUsd: 2000,
      amountUsd: 200,
      riskState: "SAFE",
      isMarketOpen: true,
    });

    expect(nvdaPerm.allowed).to.equal(true);
    expect(nvdaPerm.reasonCode).to.equal("ALLOWED");
  });

  // --------------------------------------------------------------------------
  // TEST 6: NVDA borrow capacity -> calculated from NVDA collateral + NVDA oracle
  // --------------------------------------------------------------------------
  it("TEST 6: NVDA borrow capacity -> calculated from NVDA collateral + NVDA oracle", () => {
    const nvdaPrice = 117.32;
    const nvdaShares = 25;
    const collateralUsd = nvdaShares * nvdaPrice; // $2,933.00
    const baseLtvBps = nvdaConfig.riskConfig.baseLtvBps; // 7000 (70%)
    const expectedCapacity = (collateralUsd * baseLtvBps) / 10_000; // $2,053.10

    const perm = evaluatePermission({
      actor: "HUMAN",
      action: "borrow",
      assetId: "NVDA",
      collateralUsd,
      currentDebtUsd: 0,
      amountUsd: 500,
      riskState: "SAFE",
      isMarketOpen: true,
    });

    expect(perm.allowed).to.equal(true);
    expect(perm.borrowCapacityUsd).to.be.closeTo(expectedCapacity, 0.01);
    expect(perm.effectiveLtvBps).to.equal(7000);
  });

  // --------------------------------------------------------------------------
  // TEST 7: AAPL oracle stale -> AAPL borrow restricted -> NVDA borrow remains governed by NVDA state
  // --------------------------------------------------------------------------
  it("TEST 7: AAPL oracle stale -> AAPL borrow restricted -> NVDA borrow remains governed by NVDA state", () => {
    // AAPL is stale
    OracleService.updateState("AAPL", {
      oracleState: "STALE",
      freshness: "STALE",
      ageSeconds: 1200,
      healthy: false,
    });

    // NVDA is fresh
    OracleService.updateState("NVDA", {
      oracleState: "FRESH",
      freshness: "LIVE",
      ageSeconds: 10,
      healthy: true,
    });

    const aaplPerm = evaluatePermission({
      actor: "HUMAN",
      action: "borrow",
      assetId: "AAPL",
      collateralUsd: 5000,
      amountUsd: 500,
      riskState: "SAFE",
      isMarketOpen: true,
    });

    expect(aaplPerm.allowed).to.equal(false);
    expect(aaplPerm.reasonCode).to.equal("STALE_ORACLE");
    expect(aaplPerm.message).to.include("AAPL oracle price is stale");

    const nvdaPerm = evaluatePermission({
      actor: "HUMAN",
      action: "borrow",
      assetId: "NVDA",
      collateralUsd: 5000,
      amountUsd: 500,
      riskState: "SAFE",
      isMarketOpen: true,
    });

    expect(nvdaPerm.allowed).to.equal(true);
    expect(nvdaPerm.reasonCode).to.equal("ALLOWED");
  });

  // --------------------------------------------------------------------------
  // TEST 8: Concurrent subscriptions: NVDA + AAPL, both states must coexist without crosstalk
  // --------------------------------------------------------------------------
  it("TEST 8: Concurrent subscriptions: NVDA + AAPL, both states must coexist without crosstalk", () => {
    const receivedNVDA: any[] = [];
    const receivedAAPL: any[] = [];

    const unsubscribe = OracleService.subscribe((assetId, state) => {
      if (assetId === "NVDA") receivedNVDA.push({ ...state });
      if (assetId === "AAPL") receivedAAPL.push({ ...state });
    });

    OracleService.updateState("NVDA", { priceUsd: 118.5, confBps: 12 });
    OracleService.updateState("AAPL", { priceUsd: 226.75, confBps: 22 });

    unsubscribe();

    const stateNVDA = OracleService.getState("NVDA");
    const stateAAPL = OracleService.getState("AAPL");

    expect(stateNVDA.priceUsd).to.equal(118.5);
    expect(stateNVDA.confBps).to.equal(12);
    expect(stateNVDA.assetId).to.equal("NVDA");

    expect(stateAAPL.priceUsd).to.equal(226.75);
    expect(stateAAPL.confBps).to.equal(22);
    expect(stateAAPL.assetId).to.equal("AAPL");

    expect(receivedNVDA.length).to.be.greaterThan(0);
    expect(receivedAAPL.length).to.be.greaterThan(0);
    expect(receivedNVDA[receivedNVDA.length - 1].priceUsd).to.equal(118.5);
    expect(receivedAAPL[receivedAAPL.length - 1].priceUsd).to.equal(226.75);
  });

  // --------------------------------------------------------------------------
  // TEST 9: Agent operating NVDA -> agent receives NVDA oracle
  // --------------------------------------------------------------------------
  it("TEST 9: Agent operating NVDA -> agent receives NVDA oracle", () => {
    const nvdaPerm = evaluatePermission({
      actor: "AGENT",
      action: "borrow",
      assetId: "NVDA",
      collateralUsd: 3000,
      amountUsd: 300,
      riskState: "SAFE",
      isMarketOpen: true,
      agentAuthority: {
        active: true,
        isExpired: false,
        targetAssetMint: nvdaConfig.tokenMint,
        currentAssetMint: nvdaConfig.tokenMint,
        allowedActions: { deposit: true, borrow: true, repay: true, withdraw: true },
        maxBorrowLimitUsd: 1000,
        maxWithdrawLimitUsd: 1000,
        currentBorrowedUsd: 0,
        riskBudgetUsd: 500,
      },
    });

    expect(nvdaPerm.allowed).to.equal(true);
    expect(nvdaPerm.reasonCode).to.equal("ALLOWED");
  });

  // --------------------------------------------------------------------------
  // TEST 10: Agent operating AAPL -> agent receives AAPL oracle & asset isolation
  // --------------------------------------------------------------------------
  it("TEST 10: Agent operating AAPL -> agent receives AAPL oracle", () => {
    const aaplPerm = evaluatePermission({
      actor: "AGENT",
      action: "borrow",
      assetId: "AAPL",
      collateralUsd: 4000,
      amountUsd: 400,
      riskState: "SAFE",
      isMarketOpen: true,
      agentAuthority: {
        active: true,
        isExpired: false,
        targetAssetMint: aaplConfig.tokenMint,
        currentAssetMint: aaplConfig.tokenMint,
        allowedActions: { deposit: true, borrow: true, repay: true, withdraw: true },
        maxBorrowLimitUsd: 1000,
        maxWithdrawLimitUsd: 1000,
        currentBorrowedUsd: 0,
        riskBudgetUsd: 500,
      },
    });

    expect(aaplPerm.allowed).to.equal(true);
    expect(aaplPerm.reasonCode).to.equal("ALLOWED");

    // Agent authority scoped to AAPL cannot execute on NVDA
    const crossAssetPerm = evaluatePermission({
      actor: "AGENT",
      action: "borrow",
      assetId: "NVDA",
      collateralUsd: 4000,
      amountUsd: 400,
      riskState: "SAFE",
      isMarketOpen: true,
      agentAuthority: {
        active: true,
        isExpired: false,
        targetAssetMint: aaplConfig.tokenMint, // Scoped to AAPL
        allowedActions: { deposit: true, borrow: true, repay: true, withdraw: true },
        maxBorrowLimitUsd: 1000,
        maxWithdrawLimitUsd: 1000,
        currentBorrowedUsd: 0,
        riskBudgetUsd: 500,
      },
    });

    expect(crossAssetPerm.allowed).to.equal(false);
    expect(crossAssetPerm.reasonCode).to.equal("AGENT_UNAUTHORIZED");
    expect(crossAssetPerm.message).to.include("asset-scoped");
  });

  // --------------------------------------------------------------------------
  // TEST 11: Manual borrow NVDA -> permission evaluator receives NVDA
  // --------------------------------------------------------------------------
  it("TEST 11: Manual borrow NVDA -> permission evaluator receives NVDA", () => {
    const perm = evaluatePermission({
      actor: "HUMAN",
      action: "borrow",
      assetId: "NVDA",
      collateralUsd: 2000,
      amountUsd: 200,
      riskState: "SAFE",
      isMarketOpen: true,
    });

    expect(perm.allowed).to.equal(true);
    expect(perm.effectiveLtvBps).to.equal(nvdaConfig.riskConfig.baseLtvBps);
    expect(perm.borrowCapacityUsd).to.be.greaterThan(0);
  });

  // --------------------------------------------------------------------------
  // TEST 12: Autonomous borrow NVDA -> same NVDA permission evaluator
  // --------------------------------------------------------------------------
  it("TEST 12: Autonomous borrow NVDA -> same NVDA permission evaluator", () => {
    const manualPerm = evaluatePermission({
      actor: "HUMAN",
      action: "borrow",
      assetId: "NVDA",
      collateralUsd: 2000,
      amountUsd: 200,
      riskState: "SAFE",
      isMarketOpen: true,
    });

    const agentPerm = evaluatePermission({
      actor: "AGENT",
      action: "borrow",
      assetId: "NVDA",
      collateralUsd: 2000,
      amountUsd: 200,
      riskState: "SAFE",
      isMarketOpen: true,
      agentAuthority: {
        active: true,
        isExpired: false,
        targetAssetMint: nvdaConfig.tokenMint,
        currentAssetMint: nvdaConfig.tokenMint,
        allowedActions: { deposit: true, borrow: true, repay: true, withdraw: true },
        maxBorrowLimitUsd: 1000,
        maxWithdrawLimitUsd: 1000,
        currentBorrowedUsd: 0,
        riskBudgetUsd: 500,
      },
    });

    // Both manual and agent undergo the same protocol policy math
    expect(manualPerm.allowed).to.equal(true);
    expect(agentPerm.allowed).to.equal(true);
    expect(manualPerm.effectiveLtvBps).to.equal(agentPerm.effectiveLtvBps);
    expect(manualPerm.borrowCapacityUsd).to.equal(1400); // 70% of $2000 collateral
    expect(agentPerm.borrowCapacityUsd).to.equal(500); // Delegated risk budget cap
  });

  // --------------------------------------------------------------------------
  // Plus: Transaction Context Mismatch (assertAssetContextIntegrity)
  // --------------------------------------------------------------------------
  describe("Transaction Context Integrity Sentinel", () => {
    it("passes cleanly when all context asset IDs match canonical target", () => {
      expect(() => {
        assertAssetContextIntegrity({
          actionAssetId: "NVDA",
          positionAssetId: "NVDAx",
          oracleAssetId: "NVDA",
          riskAssetId: "nvda",
          marketAssetId: "NVDA-USDC",
        });
      }).to.not.throw();
    });

    it("fails closed with ASSET_CONTEXT_MISMATCH when position leaks across assets", () => {
      expect(() => {
        assertAssetContextIntegrity({
          actionAssetId: "NVDA",
          positionAssetId: "AAPL",
        });
      }).to.throw(AssetContextMismatchError, /ASSET_CONTEXT_MISMATCH/);
    });

    it("fails closed with ASSET_CONTEXT_MISMATCH when oracle leaks across assets", () => {
      expect(() => {
        assertAssetContextIntegrity({
          actionAssetId: "NVDA",
          oracleAssetId: "AAPL",
        });
      }).to.throw(AssetContextMismatchError, /ASSET_CONTEXT_MISMATCH/);
    });

    it("fails closed with ASSET_CONTEXT_MISMATCH when risk state leaks across assets", () => {
      expect(() => {
        assertAssetContextIntegrity({
          actionAssetId: "NVDA",
          riskAssetId: "MSFT",
        });
      }).to.throw(AssetContextMismatchError, /ASSET_CONTEXT_MISMATCH/);
    });

    it("fails closed with ASSET_CONTEXT_MISMATCH when market leaks across assets", () => {
      expect(() => {
        assertAssetContextIntegrity({
          actionAssetId: "NVDA",
          marketAssetId: "GOOGL",
        });
      }).to.throw(AssetContextMismatchError, /ASSET_CONTEXT_MISMATCH/);
    });
  });
});
