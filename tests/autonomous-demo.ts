import { expect } from "chai";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { BN } from "@anchor-lang/core";
import {
  createMintToInstruction,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  setupHarness,
  Harness,
  TOKEN,
  USD,
  TS_MARKET_OPEN,
  FEED_ID_HEX,
} from "./helpers/harness";
import { isFailure, isSuccess, logsOf, errOf } from "./helpers/svm";

describe("Autonomous Stock Strategy Control: End-to-End Lifecycle Demo (Section 33)", () => {
  let h: Harness;
  let agent: Keypair;
  let agentQuoteAta: PublicKey;
  let agentEquityAta: PublicKey;
  let authorityPda: PublicKey;

  // Action bitmask constants
  const ACTION_BORROW = 1 << 1;
  const ACTION_REPAY = 1 << 2;

  before(async () => {
    h = await setupHarness();
    agent = Keypair.generate();

    // Airdrop SOL to agent for transaction fees
    h.svm.airdrop(agent.publicKey, 10_000_000_000n);

    // Setup Agent ATAs
    agentQuoteAta = getAssociatedTokenAddressSync(h.quoteMint, agent.publicKey);
    agentEquityAta = getAssociatedTokenAddressSync(h.equityMint, agent.publicKey);

    [authorityPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("authority"),
        h.user.publicKey.toBuffer(),
        agent.publicKey.toBuffer(),
        h.equityMint.toBuffer(),
      ],
      h.programId
    );

    h.sendOk(
      [
        createAssociatedTokenAccountInstruction(
          h.admin.publicKey,
          agentQuoteAta,
          agent.publicKey,
          h.quoteMint
        ),
        createAssociatedTokenAccountInstruction(
          h.admin.publicKey,
          agentEquityAta,
          agent.publicKey,
          h.equityMint
        ),
        // Fund agent with 5,000 USDC for repayments
        createMintToInstruction(
          h.quoteMint,
          agentQuoteAta,
          h.admin.publicKey,
          BigInt(5_000 * TOKEN)
        ),
      ],
      [h.admin]
    );

    // Set initial environment: NYSE Regular Open, Healthy Pyth Oracle ($100 price, $0.20 conf = 20 BPS)
    h.setTime(TS_MARKET_OPEN);
    h.setPrice({ priceUsd: 100, confUsd: 0.2 });

    // Initialize Protocol with 1,000,000 USDC liquidity and registered equity asset
    await h.bootstrapProtocol(1_000_000, 500);

    // Initial crank to establish Safe baseline
    h.sendOk([await h.ixRefreshGuard()], [h.outsider]);

    // Fund user with 100 AAPLx tokens ($10,000 collateral)
    h.sendOk(
      [
        createMintToInstruction(
          h.equityMint,
          h.userEquityAta,
          h.admin.publicKey,
          BigInt(100 * TOKEN)
        ),
      ],
      [h.admin]
    );
  });

  it("Executes the complete 8-step autonomous strategy lifecycle", async () => {
    console.log("\n============================================================");
    console.log("STARTING AUTONOMOUS STOCK STRATEGY CONTROL LIFECYCLE DEMO");
    console.log("============================================================\n");

    // --------------------------------------------------------------------------
    // STEP 1: User deposits tokenized stock ($10,000 AAPLx collateral)
    // --------------------------------------------------------------------------
    console.log("▶ STEP 1: User deposits 100 AAPLx tokens ($10,000 valuation)...");
    const depositTx = h.send(
      [await h.ixDeposit(100 * TOKEN)],
      [h.user]
    );
    expect(isSuccess(depositTx)).to.be.true;

    let position = h.fetch("position", h.position);
    expect(position.collateralAmount.toNumber()).to.equal(100 * TOKEN);
    expect(position.debtAmount.toNumber()).to.equal(0);
    console.log(`  ✔ Position established: Collateral = 100 AAPLx, Debt = $0.00 USDC`);

    // --------------------------------------------------------------------------
    // STEP 2: User creates bounded autonomous strategy authority
    // --------------------------------------------------------------------------
    console.log("\n▶ STEP 2: User configures AgentAuthority PDA...");
    console.log("  Policy limits: Max Borrow = $3,000 | Allowed = [BORROW, REPAY] | Withdraw = DISABLED");
    const createAuthTx = h.send(
      [
        await h.ixCreateAgentAuthority(
          h.user,
          agent,
          {
            allowedActions: ACTION_BORROW | ACTION_REPAY,
            maxBorrowLimit: 3_000 * TOKEN,
            maxWithdrawLimit: 0,
            riskBudget: 3_000 * TOKEN,
            expiryTs: 0,
          }
        ),
      ],
      [h.user]
    );
    expect(isSuccess(createAuthTx)).to.be.true;

    let auth = h.fetch("agentAuthority", authorityPda);
    expect(auth.owner.toBase58()).to.equal(h.user.publicKey.toBase58());
    expect(auth.agent.toBase58()).to.equal(agent.publicKey.toBase58());
    expect(auth.maxBorrowLimit.toNumber()).to.equal(3_000 * TOKEN);
    expect(auth.allowedActions).to.equal(ACTION_BORROW | ACTION_REPAY);
    expect(auth.riskBudget.toNumber()).to.equal(3_000 * TOKEN);
    expect(auth.nonce.toNumber()).to.equal(0);
    console.log("  ✔ AgentAuthority PDA initialized on-chain with bounded policy.");

    // --------------------------------------------------------------------------
    // STEP 3: Strategy executes BORROW $2,000 under SAFE market conditions
    // --------------------------------------------------------------------------
    console.log("\n▶ STEP 3: Autonomous strategy requests BORROW $2,000 USDC...");
    let ratchet = h.fetch("riskRatchet", h.riskRatchet);
    expect(Object.keys(ratchet.state)[0].toLowerCase()).to.equal("safe");
    console.log(`  Current Risk Ratchet State: SAFE (Oracle uncertainty = 20 bps)`);

    const borrowTx1 = h.send(
      [
        await h.ixExecuteAgentAction(agent, h.user, {
          action: "borrow",
          amount: 2_000 * TOKEN,
          nonce: 0,
          userQuoteAta: agentQuoteAta,
          userCollateralAta: agentEquityAta,
        }),
      ],
      [agent]
    );
    expect(isSuccess(borrowTx1)).to.be.true;

    position = h.fetch("position", h.position);
    auth = h.fetch("agentAuthority", authorityPda);
    expect(position.debtAmount.toNumber()).to.equal(2_000 * TOKEN);
    expect(auth.currentBorrowed.toNumber()).to.equal(2_000 * TOKEN);
    expect(auth.nonce.toNumber()).to.equal(1);
    console.log(`  ✔ Borrow SUCCESS: Position Debt = $${position.debtAmount.toNumber() / TOKEN} USDC | Agent Authority Nonce = ${auth.nonce}`);

    // --------------------------------------------------------------------------
    // STEP 4: MarketGuard detects deteriorating conditions (SAFE -> RESTRICTED)
    // --------------------------------------------------------------------------
    console.log("\n▶ STEP 4: Market stress event occurs: Pyth confidence widens to 80 bps (> 50 bps threshold)...");
    h.setPrice({ priceUsd: 100, confUsd: 0.8 }); // 80 BPS relative uncertainty
    const refreshTx1 = h.send([await h.ixRefreshGuard()], [h.outsider]);
    expect(isSuccess(refreshTx1)).to.be.true;

    ratchet = h.fetch("riskRatchet", h.riskRatchet);
    expect(Object.keys(ratchet.state)[0].toLowerCase()).to.equal("restricted");
    console.log(`  ✔ Risk Ratchet State degraded: SAFE -> RESTRICTED (Epoch = ${ratchet.riskEpoch})`);

    // --------------------------------------------------------------------------
    // STEP 5: Strategy attempts another BORROW $1,000 -> REJECTED ON-CHAIN
    // --------------------------------------------------------------------------
    console.log("\n▶ STEP 5: Autonomous strategy requests additional BORROW $1,000 USDC during RESTRICTED state...");
    const borrowTx2 = h.send(
      [
        await h.ixExecuteAgentAction(agent, h.user, {
          action: "borrow",
          amount: 1_000 * TOKEN,
          nonce: 1,
          userQuoteAta: agentQuoteAta,
          userCollateralAta: agentEquityAta,
        }),
      ],
      [agent]
    );
    expect(isFailure(borrowTx2)).to.be.true;
    expect(logsOf(borrowTx2).some((l) => l.includes("BorrowDisabledByRiskPolicy"))).to.be.true;

    // Verify position debt is completely untouched
    position = h.fetch("position", h.position);
    expect(position.debtAmount.toNumber()).to.equal(2_000 * TOKEN);
    console.log("  ✔ Transaction REJECTED by Circuit Protocol: BorrowDisabledByRiskPolicy");
    console.log(`    Position Debt remains strictly capped at $${position.debtAmount.toNumber() / TOKEN} USDC.`);

    // --------------------------------------------------------------------------
    // STEP 6: Strategy executes REPAY $500 (Risk-reducing path succeeds)
    // --------------------------------------------------------------------------
    console.log("\n▶ STEP 6: Autonomous strategy executes risk-reducing REPAY $500 USDC...");
    const repayTx = h.send(
      [
        await h.ixExecuteAgentAction(agent, h.user, {
          action: "repay",
          amount: 500 * TOKEN,
          nonce: 1, // Nonce 1 (re-attempted nonce since borrow failed)
          userQuoteAta: agentQuoteAta,
          userCollateralAta: agentEquityAta,
        }),
      ],
      [agent]
    );
    expect(isSuccess(repayTx)).to.be.true;

    position = h.fetch("position", h.position);
    auth = h.fetch("agentAuthority", authorityPda);
    expect(position.debtAmount.toNumber()).to.equal(1_500 * TOKEN);
    expect(auth.currentBorrowed.toNumber()).to.equal(1_500 * TOKEN);
    expect(auth.nonce.toNumber()).to.equal(2);
    console.log(`  ✔ Repay SUCCESS: Debt reduced to $${position.debtAmount.toNumber() / TOKEN} USDC | Risk budget restored.`);

    // --------------------------------------------------------------------------
    // STEP 7: Market conditions recover (RESTRICTED -> SAFE via 5 clean observations)
    // --------------------------------------------------------------------------
    console.log("\n▶ STEP 7: Market volatility subsides: Confidence returns to 20 bps (< 30 bps deadband)...");
    h.setPrice({ priceUsd: 100, confUsd: 0.2 });

    console.log("  Executing 5 consecutive healthy observations for staged hysteresis recovery...");
    for (let i = 1; i <= 5; i++) {
      h.advanceSlots(1);
      const crankTx = h.send([await h.ixRefreshGuard()], [h.outsider]);
      expect(isSuccess(crankTx)).to.be.true;
    }

    ratchet = h.fetch("riskRatchet", h.riskRatchet);
    expect(Object.keys(ratchet.state)[0].toLowerCase()).to.equal("safe");
    console.log(`  ✔ Hysteresis verified: Risk Ratchet stepped up RESTRICTED -> SAFE.`);

    // --------------------------------------------------------------------------
    // STEP 8: Borrow permission returns according to owner's policy
    // --------------------------------------------------------------------------
    console.log("\n▶ STEP 8: Autonomous strategy re-requests BORROW $500 USDC under restored SAFE state...");
    const borrowTx3 = h.send(
      [
        await h.ixExecuteAgentAction(agent, h.user, {
          action: "borrow",
          amount: 500 * TOKEN,
          nonce: 2,
          userQuoteAta: agentQuoteAta,
          userCollateralAta: agentEquityAta,
        }),
      ],
      [agent]
    );
    expect(isSuccess(borrowTx3)).to.be.true;

    position = h.fetch("position", h.position);
    auth = h.fetch("agentAuthority", authorityPda);
    expect(position.debtAmount.toNumber()).to.equal(2_000 * TOKEN);
    expect(auth.currentBorrowed.toNumber()).to.equal(2_000 * TOKEN);
    expect(auth.nonce.toNumber()).to.equal(3);
    console.log(`  ✔ Final Borrow SUCCESS: Debt = $${position.debtAmount.toNumber() / TOKEN} USDC (within $3,000 cap).`);

    console.log("\n============================================================");
    console.log("DEMO COMPLETE: ALL 8 STEPS VERIFIED ON-CHAIN SUCCESSFULLY");
    console.log("============================================================\n");
  });
});
