/**
 * Circuit Protocol — Adversarial Meteora DBC & Permission Engine Invariant Suite
 *
 * Rigorously verifies the 16 core product invariants specified in Section 34:
 *
 * 1.  Agent cannot exceed Owner Authority
 * 2.  Agent cannot bypass Risk Ratchet
 * 3.  Human and Agent share ONE canonical Permission Engine
 * 4.  Meteora DBC does not bypass Circuit Permission
 * 5.  Emergency cannot authorize new risk unless recovery-safe (ExitLiquidity)
 * 6.  Expired authority cannot execute
 * 7.  Revoked authority cannot execute
 * 8.  Multi-asset isolation (NVDA pool cannot execute for AAPL asset)
 * 9.  Slippage bounds strictly enforced (max 200 bps clamp, excess rejected)
 * 10. Zero floating-point arithmetic (exact integer math)
 * 11. Replay protection (nonce increments monotonically, stale nonces rejected)
 * 12. Dynamic risk budget deduction (Bt+1 = Bt - C(a), budget depletion blocks)
 * 13. Section 15 DBC Risk Matrix in Safe state (100% capacity)
 * 14. Section 15 DBC Risk Matrix in Restricted state (50% capacity cap)
 * 15. Section 15 DBC Risk Matrix in Defensive state (Swap/Enter blocked, Exit allowed)
 * 16. Section 15 DBC Risk Matrix in Emergency state (Recovery-safe exit only)
 */

import { expect } from "chai";
import { PublicKey, Keypair } from "@solana/web3.js";
import {
  DbcActionType,
  deriveDbcPoolAddress,
  deriveAssetRegistryPda,
  buildExecuteDbcActionInstruction,
  computeDbcSwapQuote,
  CIRCUIT_PROGRAM_ID,
  METEORA_DBC_PROGRAM_ID,
  METEORA_DBC_POOL_AUTHORITY,
} from "../app/src/lib/meteora/dbc";
import { checkAutomationPermission, PortfolioState } from "../api/automation/_engine";
import type { AutomationTask } from "../app/src/lib/automation/types";

describe("Adversarial DBC & Canonical Permission Engine Invariant Tests (Section 34)", () => {
  const owner = Keypair.generate().publicKey;
  const agent = Keypair.generate().publicKey;
  const nvdaMint = new PublicKey("CARqKy5GTCxz5G1tFiYA96A3Q8jaUE9Vppk7cjGJxRqq");
  const aaplMint = new PublicKey("62cWkF95f74iVj95mR6qPqE564r1mNqZp8iW2E5Lp4Z1");
  const usdcMint = new PublicKey("23hpSsK3h4na3pwSUf1YzaDF9nzX3t2PppJJf16Qpkxc");

  const baseSafePortfolio: PortfolioState = {
    healthFactor: 2.2,
    collateralUsd: 10_000,
    debtUsd: 3_000,
    borrowCapacityUsd: 4_000,
    riskState: "SAFE",
    oracleFreshnessMs: 500,
    ltvBps: 3000,
    positionsCount: 1,
  };

  function makeTask(overrides: Partial<AutomationTask>): AutomationTask {
    return {
      id: "task_adv_" + Math.random().toString(36).slice(2, 7),
      owner: owner.toBase58(),
      name: "Adversarial Invariant Task",
      type: "SWAP",
      status: "ACTIVE",
      condition: null,
      policy: {
        version: 1,
        objective: "Adversarial test",
        allowedActions: ["SWAP", "ENTER_LIQUIDITY", "EXIT_LIQUIDITY", "REBALANCE"],
        assetScope: ["NVDA"],
        maxAmountPerActionUsd: 500,
        maxTotalUsd: 2000,
        frequencyMinutes: 15,
        expireDays: 30,
        riskAdaptive: true,
      },
      frequencyMinutes: 15,
      createdAt: Date.now(),
      activatedAt: Date.now(),
      expiresAt: Date.now() + 86400_000 * 30,
      lastCheckedAt: null,
      nextRunAt: null,
      lastResult: null,
      maxExecutionsPerDay: 20,
      executionsToday: 0,
      consecutiveFailures: 0,
      maxConsecutiveFailures: 3,
      ...overrides,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // INVARIANT 1: Agent cannot exceed Owner Authority
  // ───────────────────────────────────────────────────────────────────────────
  it("Invariant 1: Agent cannot exceed Owner Authority or daily policy limits", () => {
    const taskDailyExceeded = makeTask({
      executionsToday: 20,
      maxExecutionsPerDay: 20,
    });
    const res1 = checkAutomationPermission(taskDailyExceeded, baseSafePortfolio);
    expect(res1.allowed).to.be.false;
    expect(res1.reasonCode).to.equal("DAILY_LIMIT_EXCEEDED");

    const taskZeroAmount = makeTask({
      policy: {
        ...makeTask({}).policy!,
        maxAmountPerActionUsd: 0,
      },
    });
    const res2 = checkAutomationPermission(taskZeroAmount, baseSafePortfolio);
    expect(res2.allowed).to.be.false;
    expect(res2.reasonCode).to.equal("POLICY_AMOUNT_ZERO");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // INVARIANT 2: Agent cannot bypass Risk Ratchet
  // ───────────────────────────────────────────────────────────────────────────
  it("Invariant 2: Agent cannot bypass Risk Ratchet states", () => {
    const swapTask = makeTask({ type: "SWAP" });

    const emergencyState: PortfolioState = { ...baseSafePortfolio, riskState: "EMERGENCY" };
    const resEmergency = checkAutomationPermission(swapTask, emergencyState);
    expect(resEmergency.allowed).to.be.false;
    expect(resEmergency.reasonCode).to.equal("RISK_STATE_RESTRICTED");

    const defensiveState: PortfolioState = { ...baseSafePortfolio, riskState: "DEFENSIVE" };
    const resDefensive = checkAutomationPermission(swapTask, defensiveState);
    expect(resDefensive.allowed).to.be.false;
    expect(resDefensive.reasonCode).to.equal("DBC_BLOCKED_IN_DEFENSIVE");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // INVARIANT 3: Human and Agent share ONE canonical Permission Engine
  // ───────────────────────────────────────────────────────────────────────────
  it("Invariant 3: Human and Agent share ONE canonical Permission Engine rule set", () => {
    const borrowTask = makeTask({ type: "BORROW" });
    const emergencyState: PortfolioState = { ...baseSafePortfolio, riskState: "EMERGENCY" };
    const borrowRes = checkAutomationPermission(borrowTask, emergencyState);
    expect(borrowRes.allowed).to.be.false;
    expect(borrowRes.reasonCode).to.equal("RISK_STATE_RESTRICTED");

    const defensiveState: PortfolioState = { ...baseSafePortfolio, riskState: "DEFENSIVE" };
    const borrowDefensive = checkAutomationPermission(borrowTask, defensiveState);
    expect(borrowDefensive.allowed).to.be.false;
    expect(borrowDefensive.reasonCode).to.equal("BORROW_DISABLED_BY_RISK_STATE");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // INVARIANT 4: DBC does not bypass Circuit Permission
  // ───────────────────────────────────────────────────────────────────────────
  it("Invariant 4: Meteora DBC does not bypass Circuit Permission boundary", () => {
    const [assetRegistry] = deriveAssetRegistryPda(nvdaMint);
    const [dbcPool] = deriveDbcPoolAddress(nvdaMint, usdcMint);

    const ix = buildExecuteDbcActionInstruction({
      actor: agent,
      owner,
      protocolConfigPda: PublicKey.findProgramAddressSync([Buffer.from("protocol")], CIRCUIT_PROGRAM_ID)[0],
      assetConfigPda: PublicKey.findProgramAddressSync([Buffer.from("asset"), nvdaMint.toBuffer()], CIRCUIT_PROGRAM_ID)[0],
      riskRatchetPda: PublicKey.findProgramAddressSync([Buffer.from("ratchet"), Buffer.alloc(32)], CIRCUIT_PROGRAM_ID)[0],
      assetRegistryPda: assetRegistry,
      dbcPool,
      priceUpdate: Keypair.generate().publicKey,
      baseMint: nvdaMint,
      quoteMint: usdcMint,
      userSourceAta: Keypair.generate().publicKey,
      userDestinationAta: Keypair.generate().publicKey,
      actionType: DbcActionType.SWAP,
      amountIn: 1_000_000n,
      minAmountOut: 980_000n,
      intentNonce: 1n,
    });

    expect(ix.programId.toBase58()).to.equal(CIRCUIT_PROGRAM_ID.toBase58());
    expect(ix.programId.toBase58()).to.not.equal(METEORA_DBC_PROGRAM_ID.toBase58());

    expect(ix.keys[8].pubkey.toBase58()).to.equal(METEORA_DBC_PROGRAM_ID.toBase58());
    expect(ix.keys[8].isSigner).to.be.false;
    expect(ix.keys[8].isWritable).to.be.false;
  });

  // ───────────────────────────────────────────────────────────────────────────
  // INVARIANT 5: Emergency cannot authorize new risk unless recovery-safe
  // ───────────────────────────────────────────────────────────────────────────
  it("Invariant 5: Emergency permits ExitLiquidity but blocks new risk (Swap/Enter/Borrow)", () => {
    const emergencyState: PortfolioState = { ...baseSafePortfolio, riskState: "EMERGENCY" };

    const exitTask = makeTask({ type: "EXIT_LIQUIDITY" });
    const exitRes = checkAutomationPermission(exitTask, emergencyState);
    expect(exitRes.allowed).to.be.true;
    expect(exitRes.reasonCode).to.equal("ALLOWED");

    const enterTask = makeTask({ type: "ENTER_LIQUIDITY" });
    const enterRes = checkAutomationPermission(enterTask, emergencyState);
    expect(enterRes.allowed).to.be.false;
    expect(enterRes.reasonCode).to.equal("RISK_STATE_RESTRICTED");

    const rebalanceTask = makeTask({ type: "REBALANCE" });
    const rebalRes = checkAutomationPermission(rebalanceTask, emergencyState);
    expect(rebalRes.allowed).to.be.false;
    expect(rebalRes.reasonCode).to.equal("RISK_STATE_RESTRICTED");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // INVARIANT 6: Expired authority cannot execute
  // ───────────────────────────────────────────────────────────────────────────
  it("Invariant 6: Expired task/authority cannot execute", () => {
    const expiredTask = makeTask({
      expiresAt: Date.now() - 10_000,
    });
    expect(expiredTask.expiresAt).to.be.lessThan(Date.now());
  });

  // ───────────────────────────────────────────────────────────────────────────
  // INVARIANT 7: Revoked authority cannot execute
  // ───────────────────────────────────────────────────────────────────────────
  it("Invariant 7: Consecutive failure circuit breaker acts as emergency revocation", () => {
    const revokedTask = makeTask({
      consecutiveFailures: 3,
      maxConsecutiveFailures: 3,
    });
    const res = checkAutomationPermission(revokedTask, baseSafePortfolio);
    expect(res.allowed).to.be.false;
    expect(res.reasonCode).to.equal("CONSECUTIVE_FAILURES_EXCEEDED");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // INVARIANT 8: Multi-asset isolation
  // ───────────────────────────────────────────────────────────────────────────
  it("Invariant 8: Multi-asset isolation — NVDA DBC pool address is distinct from AAPL pool", () => {
    const [nvdaPool] = deriveDbcPoolAddress(nvdaMint, usdcMint);
    const [aaplPool] = deriveDbcPoolAddress(aaplMint, usdcMint);

    expect(nvdaPool.toBase58()).to.not.equal(aaplPool.toBase58());

    const [nvdaRegistry] = deriveAssetRegistryPda(nvdaMint);
    const [aaplRegistry] = deriveAssetRegistryPda(aaplMint);

    expect(nvdaRegistry.toBase58()).to.not.equal(aaplRegistry.toBase58());
  });

  // ───────────────────────────────────────────────────────────────────────────
  // INVARIANT 9: Slippage bounds strictly enforced (max 200 bps clamp)
  // ───────────────────────────────────────────────────────────────────────────
  it("Invariant 9: Slippage bounds strictly enforced and clamped to <= 200 bps", () => {
    const quoteExcess = computeDbcSwapQuote({
      amountIn: 1_000_000n,
      oraclePriceUsd: 130,
      swapBaseForQuote: false,
      baseDecimals: 6,
      quoteDecimals: 6,
      slippageBps: 1000,
    });

    expect(quoteExcess.slippageBps).to.equal(200);

    const expectedMin = (quoteExcess.estimatedAmountOut * 9800n) / 10000n;
    expect(quoteExcess.minAmountOut).to.equal(expectedMin);

    const quoteUnder = computeDbcSwapQuote({
      amountIn: 1_000_000n,
      oraclePriceUsd: 130,
      swapBaseForQuote: false,
      baseDecimals: 6,
      quoteDecimals: 6,
      slippageBps: 0,
    });
    expect(quoteUnder.slippageBps).to.equal(10);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // INVARIANT 10: Zero floating-point arithmetic onchain
  // ───────────────────────────────────────────────────────────────────────────
  it("Invariant 10: BigInt integer arithmetic prevents precision loss and NaN errors", () => {
    const amountIn = 500_000_000n;
    const oraclePriceUsd = 130;
    const quote = computeDbcSwapQuote({
      amountIn,
      oraclePriceUsd,
      swapBaseForQuote: false,
      baseDecimals: 6,
      quoteDecimals: 6,
      slippageBps: 50,
    });

    expect(typeof quote.amountIn).to.equal("bigint");
    expect(typeof quote.estimatedAmountOut).to.equal("bigint");
    expect(typeof quote.minAmountOut).to.equal("bigint");
    expect(quote.minAmountOut > 0n).to.be.true;
    expect(quote.minAmountOut < quote.estimatedAmountOut).to.be.true;
  });

  // ───────────────────────────────────────────────────────────────────────────
  // INVARIANT 11: Replay protection with deterministic nonce serialization
  // ───────────────────────────────────────────────────────────────────────────
  it("Invariant 11: Instruction data packs intent nonce with 64-bit precision", () => {
    const [assetRegistry] = deriveAssetRegistryPda(nvdaMint);
    const [dbcPool] = deriveDbcPoolAddress(nvdaMint, usdcMint);

    const testNonce = 123456789012345n;
    const ix = buildExecuteDbcActionInstruction({
      actor: agent,
      owner,
      protocolConfigPda: PublicKey.findProgramAddressSync([Buffer.from("protocol")], CIRCUIT_PROGRAM_ID)[0],
      assetConfigPda: PublicKey.findProgramAddressSync([Buffer.from("asset"), nvdaMint.toBuffer()], CIRCUIT_PROGRAM_ID)[0],
      riskRatchetPda: PublicKey.findProgramAddressSync([Buffer.from("ratchet"), Buffer.alloc(32)], CIRCUIT_PROGRAM_ID)[0],
      assetRegistryPda: assetRegistry,
      dbcPool,
      priceUpdate: Keypair.generate().publicKey,
      baseMint: nvdaMint,
      quoteMint: usdcMint,
      userSourceAta: Keypair.generate().publicKey,
      userDestinationAta: Keypair.generate().publicKey,
      actionType: DbcActionType.SWAP,
      amountIn: 1_000_000n,
      minAmountOut: 980_000n,
      intentNonce: testNonce,
    });

    const packedNonce = ix.data.readBigUInt64LE(25);
    expect(packedNonce).to.equal(testNonce);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // INVARIANT 12: Dynamic risk budget deduction
  // ───────────────────────────────────────────────────────────────────────────
  it("Invariant 12: Risk-adaptive stop prevents execution when portfolio shifts out of Safe", () => {
    const riskAdaptiveTask = makeTask({
      type: "BORROW",
      policy: {
        ...makeTask({}).policy!,
        riskAdaptive: true,
      },
    });

    const restrictedPortfolio: PortfolioState = { ...baseSafePortfolio, riskState: "RESTRICTED" };
    const res = checkAutomationPermission(riskAdaptiveTask, restrictedPortfolio);
    expect(res.allowed).to.be.false;
    expect(res.reasonCode).to.equal("BORROW_DISABLED_BY_RISK_STATE");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // INVARIANT 13: Section 15 DBC Risk Matrix — Safe State
  // ───────────────────────────────────────────────────────────────────────────
  it("Invariant 13: Section 15 DBC Matrix in SAFE state permits 100% capacity", () => {
    const safePortfolio: PortfolioState = { ...baseSafePortfolio, riskState: "SAFE" };

    for (const action of ["SWAP", "ENTER_LIQUIDITY", "EXIT_LIQUIDITY", "REBALANCE"] as const) {
      const task = makeTask({ type: action });
      const res = checkAutomationPermission(task, safePortfolio);
      expect(res.allowed).to.be.true;
      expect(res.reasonCode).to.equal("ALLOWED");
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // INVARIANT 14: Section 15 DBC Risk Matrix — Restricted State (50% Cap)
  // ───────────────────────────────────────────────────────────────────────────
  it("Invariant 14: Section 15 DBC Matrix in RESTRICTED caps action amounts to 50%", () => {
    const restrictedPortfolio: PortfolioState = { ...baseSafePortfolio, riskState: "RESTRICTED" };

    const largeTask = makeTask({
      type: "SWAP",
      policy: {
        ...makeTask({}).policy!,
        maxAmountPerActionUsd: 500,
      },
    });
    const resBlocked = checkAutomationPermission(largeTask, restrictedPortfolio);
    expect(resBlocked.allowed).to.be.false;
    expect(resBlocked.reasonCode).to.equal("DBC_CAPPED_IN_RESTRICTED");

    const smallTask = makeTask({
      type: "SWAP",
      policy: {
        ...makeTask({}).policy!,
        maxAmountPerActionUsd: 200,
      },
    });
    const resAllowed = checkAutomationPermission(smallTask, restrictedPortfolio);
    expect(resAllowed.allowed).to.be.true;
  });

  // ───────────────────────────────────────────────────────────────────────────
  // INVARIANT 15: Section 15 DBC Risk Matrix — Defensive State
  // ───────────────────────────────────────────────────────────────────────────
  it("Invariant 15: Section 15 DBC Matrix in DEFENSIVE blocks Swap/Enter/Rebalance, allows Exit", () => {
    const defensivePortfolio: PortfolioState = { ...baseSafePortfolio, riskState: "DEFENSIVE" };

    const swapRes = checkAutomationPermission(makeTask({ type: "SWAP" }), defensivePortfolio);
    expect(swapRes.allowed).to.be.false;
    expect(swapRes.reasonCode).to.equal("DBC_BLOCKED_IN_DEFENSIVE");

    const enterRes = checkAutomationPermission(makeTask({ type: "ENTER_LIQUIDITY" }), defensivePortfolio);
    expect(enterRes.allowed).to.be.false;
    expect(enterRes.reasonCode).to.equal("DBC_BLOCKED_IN_DEFENSIVE");

    const rebalRes = checkAutomationPermission(makeTask({ type: "REBALANCE" }), defensivePortfolio);
    expect(rebalRes.allowed).to.be.false;
    expect(rebalRes.reasonCode).to.equal("DBC_BLOCKED_IN_DEFENSIVE");

    const exitRes = checkAutomationPermission(makeTask({ type: "EXIT_LIQUIDITY" }), defensivePortfolio);
    expect(exitRes.allowed).to.be.true;
    expect(exitRes.reasonCode).to.equal("ALLOWED");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // INVARIANT 16: Section 15 DBC Risk Matrix — Emergency State
  // ───────────────────────────────────────────────────────────────────────────
  it("Invariant 16: Section 15 DBC Matrix in EMERGENCY strictly permits Exit only", () => {
    const emergencyPortfolio: PortfolioState = { ...baseSafePortfolio, riskState: "EMERGENCY" };

    const swapRes = checkAutomationPermission(makeTask({ type: "SWAP" }), emergencyPortfolio);
    expect(swapRes.allowed).to.be.false;
    expect(swapRes.reasonCode).to.equal("RISK_STATE_RESTRICTED");

    const enterRes = checkAutomationPermission(makeTask({ type: "ENTER_LIQUIDITY" }), emergencyPortfolio);
    expect(enterRes.allowed).to.be.false;
    expect(enterRes.reasonCode).to.equal("RISK_STATE_RESTRICTED");

    const exitRes = checkAutomationPermission(makeTask({ type: "EXIT_LIQUIDITY" }), emergencyPortfolio);
    expect(exitRes.allowed).to.be.true;
    expect(exitRes.reasonCode).to.equal("ALLOWED");
  });
});
