import { expect } from "chai";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { BN } from "@anchor-lang/core";
import {
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  createInitializeMint2Instruction,
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
import { isFailure, isSuccess, logsOf } from "./helpers/svm";

describe("Section 24: Human-First, Agent-Optional, Protocol-Sovereign Suite (18 Tests)", () => {
  let h: Harness;
  let agent: Keypair;
  let rogueAgent: Keypair;
  let secondaryMint: PublicKey;
  let userSecondaryAta: PublicKey;
  let agentQuoteAta: PublicKey;
  let agentEquityAta: PublicKey;
  let agentAuthorityPda: PublicKey;

  const ACTION_DEPOSIT = 1 << 0;  // 1
  const ACTION_BORROW = 1 << 1;   // 2
  const ACTION_REPAY = 1 << 2;    // 4
  const ACTION_WITHDRAW = 1 << 3; // 8

  beforeEach(async () => {
    h = await setupHarness();
    agent = Keypair.generate();
    rogueAgent = Keypair.generate();

    h.svm.airdrop(agent.publicKey, 10_000_000_000n);
    h.svm.airdrop(rogueAgent.publicKey, 10_000_000_000n);

    // Create a secondary asset mint (e.g. NVDA) to test cross-asset unauthorized attempts
    const secKp = Keypair.generate();
    secondaryMint = secKp.publicKey;
    const mintRent = Number(h.svm.rent(MINT_SIZE));

    h.sendOk(
      [
        SystemProgram.createAccount({
          fromPubkey: h.admin.publicKey,
          newAccountPubkey: secondaryMint,
          space: MINT_SIZE,
          lamports: mintRent,
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMint2Instruction(secondaryMint, 6, h.admin.publicKey, null),
      ],
      [h.admin, secKp]
    );

    userSecondaryAta = getAssociatedTokenAddressSync(secondaryMint, h.user.publicKey);
    agentQuoteAta = getAssociatedTokenAddressSync(h.quoteMint, agent.publicKey);
    agentEquityAta = getAssociatedTokenAddressSync(h.equityMint, agent.publicKey);

    [agentAuthorityPda] = PublicKey.findProgramAddressSync(
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
          userSecondaryAta,
          h.user.publicKey,
          secondaryMint
        ),
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
        createMintToInstruction(
          secondaryMint,
          userSecondaryAta,
          h.admin.publicKey,
          BigInt(100 * TOKEN)
        ),
        createMintToInstruction(
          h.equityMint,
          agentEquityAta,
          h.admin.publicKey,
          BigInt(100 * TOKEN)
        ),
        createMintToInstruction(
          h.equityMint,
          h.userEquityAta,
          h.admin.publicKey,
          BigInt(100 * TOKEN)
        ),
      ],
      [h.admin]
    );

    h.setTime(TS_MARKET_OPEN);
    h.setPrice({ priceUsd: 100, confUsd: 0.2 }); // 20 BPS -> SAFE ($100 per token)
    await h.bootstrapProtocol(1_000_000, 500);

    // Initial crank to establish SAFE baseline
    h.sendOk([await h.ixRefreshGuard()], [h.outsider]);
  });

  /* -------------------------------------------------------------------------- */
  /*  TEST 1: Disable every agent. Manual deposit works.                        */
  /* -------------------------------------------------------------------------- */
  it("TEST 1: Disable every agent. Manual deposit works.", async () => {
    // Assert 0 agent authority PDA exists for user
    const authAccount = h.svm.getAccount(agentAuthorityPda);
    expect(authAccount).to.be.null;

    // Manual user deposits 10 tokens directly ($1,000 collateral)
    const res = h.send([await h.ixDeposit(10 * TOKEN)], [h.user]);
    expect(isSuccess(res)).to.be.true;

    const pos = h.fetch("position", h.position);
    expect(pos.collateralAmount.toNumber()).to.equal(10 * TOKEN);
    expect(pos.debtAmount.toNumber()).to.equal(0);
  });

  /* -------------------------------------------------------------------------- */
  /*  TEST 2: Disable every agent. Manual repay works.                          */
  /* -------------------------------------------------------------------------- */
  it("TEST 2: Disable every agent. Manual repay works.", async () => {
    // Zero agents active. Deposit collateral, borrow $200 USDC, then manually repay $100 USDC
    h.sendOk([await h.ixDeposit(10 * TOKEN)], [h.user]);
    h.sendOk([await h.ixBorrow(200 * TOKEN)], [h.user]);

    let pos = h.fetch("position", h.position);
    expect(pos.debtAmount.toNumber()).to.equal(200 * TOKEN);

    // User directly repays 100 TOKEN ($100 USDC) without any agent
    const repayRes = h.send([await h.ixRepay(100 * TOKEN)], [h.user]);
    expect(isSuccess(repayRes)).to.be.true;

    pos = h.fetch("position", h.position);
    expect(pos.debtAmount.toNumber()).to.equal(100 * TOKEN);
  });

  /* -------------------------------------------------------------------------- */
  /*  TEST 3: Disable every agent. Manual borrow works when SAFE.               */
  /* -------------------------------------------------------------------------- */
  it("TEST 3: Disable every agent. Manual borrow works when SAFE.", async () => {
    // Zero agents active. Under SAFE market conditions, manual borrow succeeds
    h.sendOk([await h.ixDeposit(10 * TOKEN)], [h.user]);

    const borrowRes = h.send([await h.ixBorrow(300 * TOKEN)], [h.user]);
    expect(isSuccess(borrowRes)).to.be.true;

    const pos = h.fetch("position", h.position);
    expect(pos.debtAmount.toNumber()).to.equal(300 * TOKEN);
  });

  /* -------------------------------------------------------------------------- */
  /*  TEST 4: Disable every agent. Manual borrow fails when risk policy blocks. */
  /* -------------------------------------------------------------------------- */
  it("TEST 4: Disable every agent. Manual borrow fails when risk policy blocks it (Restricted / Defensive / Emergency).", async () => {
    h.sendOk([await h.ixDeposit(10 * TOKEN)], [h.user]);

    // Set custody state to Delayed -> Restricted/Defensive risk policy blocks borrowing
    h.sendOk([await h.ixSetCustody("delayed")], [h.admin]);

    const res = h.send([await h.ixBorrow(100 * TOKEN)], [h.user]);
    expect(isFailure(res)).to.be.true;
    expect(logsOf(res).some((l) => l.includes("InvalidCustodyState") || l.includes("BorrowDisabledByRiskPolicy"))).to.be.true;
  });

  /* -------------------------------------------------------------------------- */
  /*  TEST 5: Agent offline. Manual operation remains functional.               */
  /* -------------------------------------------------------------------------- */
  it("TEST 5: Agent offline. Manual operation remains functional.", async () => {
    // Register an agent authority
    h.sendOk(
      [
        await h.ixCreateAgentAuthority(h.user, agent, {
          allowedActions: ACTION_BORROW | ACTION_REPAY,
          maxBorrowLimit: 500 * TOKEN,
          riskBudget: 500 * TOKEN,
        }),
      ],
      [h.user]
    );

    // Agent is offline (never transmits transactions, no server running).
    // Human user executes full lifecycle directly:
    h.sendOk([await h.ixDeposit(10 * TOKEN)], [h.user]);
    h.sendOk([await h.ixBorrow(200 * TOKEN)], [h.user]);
    h.sendOk([await h.ixRepay(50 * TOKEN)], [h.user]);
    h.sendOk([await h.ixWithdraw(2 * TOKEN)], [h.user]);

    const pos = h.fetch("position", h.position);
    expect(pos.collateralAmount.toNumber()).to.equal(8 * TOKEN);
    expect(pos.debtAmount.toNumber()).to.equal(150 * TOKEN);
  });

  /* -------------------------------------------------------------------------- */
  /*  TEST 6: Agent compromised. Agent cannot exceed delegation.                */
  /* -------------------------------------------------------------------------- */
  it("TEST 6: Agent compromised. Agent cannot exceed delegation.", async () => {
    h.sendOk([await h.ixDeposit(10 * TOKEN)], [h.user]);

    // Delegate BORROW and REPAY only. WITHDRAW is strictly NOT permitted (0 in bitmask)
    h.sendOk(
      [
        await h.ixCreateAgentAuthority(h.user, agent, {
          allowedActions: ACTION_BORROW | ACTION_REPAY,
          maxBorrowLimit: 500 * TOKEN,
          riskBudget: 500 * TOKEN,
        }),
      ],
      [h.user]
    );

    // Compromised agent attempts unauthorized WITHDRAW
    const res = h.send(
      [
        await h.ixExecuteAgentAction(agent, h.user, {
          action: "withdraw",
          amount: 1 * TOKEN,
          nonce: 0,
          userCollateralAta: agentEquityAta,
        }),
      ],
      [agent]
    );

    expect(isFailure(res)).to.be.true;
    expect(logsOf(res).some((l) => l.includes("AgentActionNotPermitted"))).to.be.true;
  });

  /* -------------------------------------------------------------------------- */
  /*  TEST 7: Agent sends unauthorized asset. Rejected.                         */
  /* -------------------------------------------------------------------------- */
  it("TEST 7: Agent sends unauthorized asset. Rejected.", async () => {
    // Delegate agent for AAPL (h.equityMint)
    h.sendOk(
      [
        await h.ixCreateAgentAuthority(h.user, agent, {
          allowedActions: ACTION_BORROW,
          maxBorrowLimit: 500 * TOKEN,
          riskBudget: 500 * TOKEN,
        }),
      ],
      [h.user]
    );

    // Agent attempts action on secondaryMint (unauthorized asset)
    const res = h.send(
      [
        await h.ixExecuteAgentAction(agent, h.user, {
          action: "borrow",
          amount: 50 * TOKEN,
          nonce: 0,
          mint: secondaryMint,
          userQuoteAta: agentQuoteAta,
          userCollateralAta: agentEquityAta,
        }),
      ],
      [agent]
    );

    expect(isFailure(res)).to.be.true;
  });

  /* -------------------------------------------------------------------------- */
  /*  TEST 8: Agent attempts over-limit borrow. Rejected.                       */
  /* -------------------------------------------------------------------------- */
  it("TEST 8: Agent attempts over-limit borrow. Rejected.", async () => {
    h.sendOk([await h.ixDeposit(20 * TOKEN)], [h.user]);

    // Delegate agent with max borrow limit $200
    h.sendOk(
      [
        await h.ixCreateAgentAuthority(h.user, agent, {
          allowedActions: ACTION_BORROW,
          maxBorrowLimit: 200 * TOKEN,
          riskBudget: 500 * TOKEN,
        }),
      ],
      [h.user]
    );

    // Agent attempts to borrow $250 (> $200 limit)
    const res = h.send(
      [
        await h.ixExecuteAgentAction(agent, h.user, {
          action: "borrow",
          amount: 250 * TOKEN,
          nonce: 0,
          userQuoteAta: agentQuoteAta,
          userCollateralAta: agentEquityAta,
        }),
      ],
      [agent]
    );

    expect(isFailure(res)).to.be.true;
    expect(logsOf(res).some((l) => l.includes("AgentBorrowLimitExceeded"))).to.be.true;
  });

  /* -------------------------------------------------------------------------- */
  /*  TEST 9: Agent attempts authority escalation. Rejected.                    */
  /* -------------------------------------------------------------------------- */
  it("TEST 9: Agent attempts authority escalation. Rejected.", async () => {
    // Delegated initial authority
    h.sendOk(
      [
        await h.ixCreateAgentAuthority(h.user, agent, {
          allowedActions: ACTION_BORROW,
          maxBorrowLimit: 100 * TOKEN,
          riskBudget: 100 * TOKEN,
        }),
      ],
      [h.user]
    );

    // Rogue agent attempts to call updateAgentAuthority signing with its own key
    const res = h.send(
      [
        await h.ixUpdateAgentAuthority(agent as any, agent, {
          allowedActions: 0x0f,
          maxBorrowLimit: 100_000 * TOKEN,
          riskBudget: 100_000 * TOKEN,
        }),
      ],
      [agent]
    );

    expect(isFailure(res)).to.be.true;
  });

  /* -------------------------------------------------------------------------- */
  /*  TEST 10: Human & Agent submit equivalent borrow under identical conditions*/
  /* -------------------------------------------------------------------------- */
  it("TEST 10: Human and agent submit equivalent borrow under identical conditions. Risk evaluation is identical.", async () => {
    h.sendOk([await h.ixDeposit(10 * TOKEN)], [h.user]);

    // Delegate agent with sufficient authority
    h.sendOk(
      [
        await h.ixCreateAgentAuthority(h.user, agent, {
          allowedActions: ACTION_BORROW,
          maxBorrowLimit: 500 * TOKEN,
          riskBudget: 500 * TOKEN,
        }),
      ],
      [h.user]
    );

    // Agent executes borrow $100
    h.sendOk(
      [
        await h.ixExecuteAgentAction(agent, h.user, {
          action: "borrow",
          amount: 100 * TOKEN,
          nonce: 0,
          userQuoteAta: agentQuoteAta,
          userCollateralAta: agentEquityAta,
        }),
      ],
      [agent]
    );

    let pos = h.fetch("position", h.position);
    expect(pos.debtAmount.toNumber()).to.equal(100 * TOKEN);

    // Human executes manual borrow $100 under same market condition
    h.sendOk([await h.ixBorrow(100 * TOKEN)], [h.user]);

    pos = h.fetch("position", h.position);
    expect(pos.debtAmount.toNumber()).to.equal(200 * TOKEN);
  });

  /* -------------------------------------------------------------------------- */
  /*  TEST 11: MarketGuard blocks unsafe human borrow.                          */
  /* -------------------------------------------------------------------------- */
  it("TEST 11: MarketGuard blocks unsafe human borrow.", async () => {
    h.sendOk([await h.ixDeposit(10 * TOKEN)], [h.user]);

    // Advance clock past max oracle age (oracle stale)
    h.setTime(TS_MARKET_OPEN + 600n);

    const res = h.send([await h.ixBorrow(100 * TOKEN)], [h.user]);
    expect(isFailure(res)).to.be.true;
    expect(logsOf(res).some((l) => l.includes("StaleOracle") || l.includes("6004") || l.includes("stale"))).to.be.true;
  });

  /* -------------------------------------------------------------------------- */
  /*  TEST 12: MarketGuard blocks unsafe agent borrow.                          */
  /* -------------------------------------------------------------------------- */
  it("TEST 12: MarketGuard blocks unsafe agent borrow.", async () => {
    h.sendOk([await h.ixDeposit(10 * TOKEN)], [h.user]);
    h.sendOk(
      [
        await h.ixCreateAgentAuthority(h.user, agent, {
          allowedActions: ACTION_BORROW,
          maxBorrowLimit: 500 * TOKEN,
          riskBudget: 500 * TOKEN,
        }),
      ],
      [h.user]
    );

    // Advance clock past max oracle age (oracle stale)
    h.setTime(TS_MARKET_OPEN + 600n);

    const res = h.send(
      [
        await h.ixExecuteAgentAction(agent, h.user, {
          action: "borrow",
          amount: 50 * TOKEN,
          nonce: 0,
          userQuoteAta: agentQuoteAta,
          userCollateralAta: agentEquityAta,
        }),
      ],
      [agent]
    );

    expect(isFailure(res)).to.be.true;
    expect(logsOf(res).some((l) => l.includes("StaleOracle") || l.includes("6004") || l.includes("stale"))).to.be.true;
  });

  /* -------------------------------------------------------------------------- */
  /*  TEST 13: Risk state changes SAFE -> RESTRICTED. Both permissions update.  */
  /* -------------------------------------------------------------------------- */
  it("TEST 13: Risk state changes from SAFE -> RESTRICTED. Both human and agent permissions update.", async () => {
    h.sendOk([await h.ixDeposit(10 * TOKEN)], [h.user]);
    h.sendOk(
      [
        await h.ixCreateAgentAuthority(h.user, agent, {
          allowedActions: ACTION_BORROW,
          maxBorrowLimit: 500 * TOKEN,
          riskBudget: 500 * TOKEN,
        }),
      ],
      [h.user]
    );

    // Widen confidence ratio past 50 BPS (80 BPS)
    h.setPrice({ priceUsd: 100, confUsd: 0.8 });
    h.sendOk([await h.ixRefreshGuard()], [h.outsider]);

    // Agent borrow blocked
    const agentRes = h.send(
      [
        await h.ixExecuteAgentAction(agent, h.user, {
          action: "borrow",
          amount: 50 * TOKEN,
          nonce: 0,
          userQuoteAta: agentQuoteAta,
          userCollateralAta: agentEquityAta,
        }),
      ],
      [agent]
    );
    expect(isFailure(agentRes)).to.be.true;
    expect(logsOf(agentRes).some((l) => l.includes("BorrowDisabledByRiskPolicy"))).to.be.true;

    // Human borrow blocked
    const humanRes = h.send([await h.ixBorrow(50 * TOKEN)], [h.user]);
    expect(isFailure(humanRes)).to.be.true;
  });

  /* -------------------------------------------------------------------------- */
  /*  TEST 14: Risk state reaches EMERGENCY. Both borrowings blocked.           */
  /* -------------------------------------------------------------------------- */
  it("TEST 14: Risk state reaches EMERGENCY. Both human and agent borrowing are blocked.", async () => {
    h.sendOk([await h.ixDeposit(10 * TOKEN)], [h.user]);
    h.sendOk(
      [
        await h.ixCreateAgentAuthority(h.user, agent, {
          allowedActions: ACTION_BORROW | ACTION_REPAY,
          maxBorrowLimit: 500 * TOKEN,
          riskBudget: 500 * TOKEN,
        }),
      ],
      [h.user]
    );

    // Emergency condition: custody impaired
    h.sendOk([await h.ixSetCustody("impaired")], [h.admin]);
    h.sendOk([await h.ixRefreshGuard()], [h.outsider]);

    // Agent borrow blocked
    const agentRes = h.send(
      [
        await h.ixExecuteAgentAction(agent, h.user, {
          action: "borrow",
          amount: 50 * TOKEN,
          nonce: 0,
          userQuoteAta: agentQuoteAta,
          userCollateralAta: agentEquityAta,
        }),
      ],
      [agent]
    );
    expect(isFailure(agentRes)).to.be.true;

    // Human borrow blocked
    const humanRes = h.send([await h.ixBorrow(50 * TOKEN)], [h.user]);
    expect(isFailure(humanRes)).to.be.true;
  });

  /* -------------------------------------------------------------------------- */
  /*  TEST 15: Repayment remains available during emergency.                    */
  /* -------------------------------------------------------------------------- */
  it("TEST 15: Repayment remains available during emergency.", async () => {
    // Establish position with debt while SAFE
    h.sendOk([await h.ixDeposit(10 * TOKEN)], [h.user]);
    h.sendOk([await h.ixBorrow(200 * TOKEN)], [h.user]);

    // Enter EMERGENCY state
    h.sendOk([await h.ixSetCustody("impaired")], [h.admin]);
    h.sendOk([await h.ixRefreshGuard()], [h.outsider]);

    // User executes repay: SUCCESS
    const res = h.send([await h.ixRepay(100 * TOKEN)], [h.user]);
    expect(isSuccess(res)).to.be.true;

    const pos = h.fetch("position", h.position);
    expect(pos.debtAmount.toNumber()).to.equal(100 * TOKEN);
  });

  /* -------------------------------------------------------------------------- */
  /*  TEST 16: Agent expiry automatically invalidates autonomous execution.     */
  /* -------------------------------------------------------------------------- */
  it("TEST 16: Agent expiry automatically invalidates autonomous execution.", async () => {
    h.sendOk([await h.ixDeposit(10 * TOKEN)], [h.user]);

    const expiryTime = TS_MARKET_OPEN + 100n;
    h.sendOk(
      [
        await h.ixCreateAgentAuthority(h.user, agent, {
          allowedActions: ACTION_BORROW,
          maxBorrowLimit: 500 * TOKEN,
          riskBudget: 500 * TOKEN,
          expiryTs: expiryTime,
        }),
      ],
      [h.user]
    );

    // Advance past expiry and update fresh price so oracle staleness is not the issue
    h.setTime(TS_MARKET_OPEN + 200n);
    h.setPrice({ priceUsd: 100, confUsd: 0.2 });

    // Agent borrow fails due to expiry
    const agentRes = h.send(
      [
        await h.ixExecuteAgentAction(agent, h.user, {
          action: "borrow",
          amount: 50 * TOKEN,
          nonce: 0,
          userQuoteAta: agentQuoteAta,
          userCollateralAta: agentEquityAta,
        }),
      ],
      [agent]
    );
    expect(isFailure(agentRes)).to.be.true;
    expect(logsOf(agentRes).some((l) => l.includes("AgentAuthorityExpired") || l.includes("6020"))).to.be.true;

    // Human manual borrow still functions normally
    const humanRes = h.send([await h.ixBorrow(50 * TOKEN)], [h.user]);
    expect(isSuccess(humanRes)).to.be.true;
  });

  /* -------------------------------------------------------------------------- */
  /*  TEST 17: Owner revocation invalidates agent immediately.                  */
  /* -------------------------------------------------------------------------- */
  it("TEST 17: Owner revocation invalidates the agent immediately according to protocol state.", async () => {
    h.sendOk([await h.ixDeposit(10 * TOKEN)], [h.user]);
    h.sendOk(
      [
        await h.ixCreateAgentAuthority(h.user, agent, {
          allowedActions: ACTION_BORROW,
          maxBorrowLimit: 500 * TOKEN,
          riskBudget: 500 * TOKEN,
        }),
      ],
      [h.user]
    );

    // Owner revokes by setting allowed_actions = 0
    h.sendOk(
      [
        await h.ixUpdateAgentAuthority(h.user, agent, {
          allowedActions: 0,
          maxBorrowLimit: 0,
          riskBudget: 0,
        }),
      ],
      [h.user]
    );

    // Agent attempt immediately rejected on-chain
    const res = h.send(
      [
        await h.ixExecuteAgentAction(agent, h.user, {
          action: "borrow",
          amount: 50 * TOKEN,
          nonce: 0,
          userQuoteAta: agentQuoteAta,
          userCollateralAta: agentEquityAta,
        }),
      ],
      [agent]
    );
    expect(isFailure(res)).to.be.true;
    expect(logsOf(res).some((l) => l.includes("AgentActionNotPermitted"))).to.be.true;
  });

  /* -------------------------------------------------------------------------- */
  /*  TEST 18: No agent service/API/network process required for protocol tests.*/
  /* -------------------------------------------------------------------------- */
  it("TEST 18: No agent service/API/network process is required for protocol tests.", async () => {
    // Verifies the protocol test environment has zero external AI or agent dependencies.
    expect(process.env.OPENAI_API_KEY).to.be.undefined;
    expect(process.env.ANTHROPIC_API_KEY).to.be.undefined;
    expect(process.env.AGENT_ENDPOINT).to.be.undefined;

    // All execution occurs natively within the Solana VM and deterministic Rust program
    const config = h.fetch("protocolConfig", h.protocolConfig);
    expect(config).to.not.be.null;
    expect(config.authority.toBase58()).to.equal(h.admin.publicKey.toBase58());
  });
});
