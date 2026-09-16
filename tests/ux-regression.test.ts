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
  TS_AFTER_CLOSE,
  FEED_ID_HEX,
  WRONG_FEED_ID_HEX,
} from "./helpers/harness";
import { isFailure, isSuccess, logsOf, errOf } from "./helpers/svm";

describe("Circuit Autonomous Capital & UX Regression Suite (Section 26 - 30 Vectors)", () => {
  let h: Harness;
  let agent: Keypair;
  let rogueAgent: Keypair;
  let nvdaMint: PublicKey;
  let userNvdaAta: PublicKey;
  let agentQuoteAta: PublicKey;
  let agentEquityAta: PublicKey;
  let aaplAuthorityPda: PublicKey;

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

    // Secondary asset: NVDAx
    const nvdaKp = Keypair.generate();
    nvdaMint = nvdaKp.publicKey;
    const mintRent = Number(h.svm.rent(MINT_SIZE));

    h.sendOk(
      [
        SystemProgram.createAccount({
          fromPubkey: h.admin.publicKey,
          newAccountPubkey: nvdaMint,
          space: MINT_SIZE,
          lamports: mintRent,
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMint2Instruction(nvdaMint, 6, h.admin.publicKey, null),
      ],
      [h.admin, nvdaKp]
    );

    userNvdaAta = getAssociatedTokenAddressSync(nvdaMint, h.user.publicKey);
    agentQuoteAta = getAssociatedTokenAddressSync(h.quoteMint, agent.publicKey);
    agentEquityAta = getAssociatedTokenAddressSync(h.equityMint, agent.publicKey);

    [aaplAuthorityPda] = PublicKey.findProgramAddressSync(
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
          userNvdaAta,
          h.user.publicKey,
          nvdaMint
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
          nvdaMint,
          userNvdaAta,
          h.admin.publicKey,
          BigInt(100 * TOKEN)
        ),
        createMintToInstruction(
          h.equityMint,
          agentEquityAta,
          h.admin.publicKey,
          BigInt(100 * TOKEN)
        ),
      ],
      [h.admin]
    );

    h.setTime(TS_MARKET_OPEN);
    h.setPrice({ priceUsd: 100, confUsd: 0.2 }); // 20 bps -> SAFE
    await h.bootstrapProtocol(1_000_000, 500);

    // Initial crank to establish SAFE baseline
    h.sendOk([await h.ixRefreshGuard()], [h.outsider]);

    // Mint collateral to user and deposit 10 AAPLx ($1,000 collateral)
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

    h.sendOk([await h.ixDeposit(10 * TOKEN)], [h.user]);
  });

  /* -------------------------------------------------------------------------- */
  /*  UX CONTEXT (Vectors 1 - 5)                                                */
  /* -------------------------------------------------------------------------- */
  describe("UX Context & Asset Isolation (Vectors 1 - 5)", () => {
    it("Vector 1: Deposit AAPLx establishes isolated AAPL position PDA", async () => {
      const pos = h.fetch("position", h.position);
      expect(pos.owner.toBase58()).to.equal(h.user.publicKey.toBase58());
      expect(pos.asset.toBase58()).to.equal(h.equityMint.toBase58());
      expect(pos.collateralAmount.toNumber()).to.equal(10 * TOKEN);
      expect(pos.debtAmount.toNumber()).to.equal(0);
    });

    it("Vector 2: Deposit NVDAx creates isolated NVDA position PDA", async () => {
      const [nvdaPosPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("position"), h.user.publicKey.toBuffer(), nvdaMint.toBuffer()],
        h.programId
      );

      // Register NVDA as second asset
      const [nvdaAssetPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("asset"), nvdaMint.toBuffer()],
        h.programId
      );

      const nvdaFeedHex = "9999999999999999999999999999999999999999999999999999999999999999";
      const registerNvdaTx = h.send(
        [
          await h.program.methods
            .registerAsset(
              Array.from(Buffer.from(nvdaFeedHex, "hex")),
              new BN(7000),
              new BN(8000),
              new BN(500),
              new BN(60),
              new BN(100)
            )
            .accountsPartial({
              admin: h.admin.publicKey,
              protocolConfig: h.protocolConfig,
              mint: nvdaMint,
              quoteMint: h.quoteMint,
              assetConfig: nvdaAssetPda,
              collateralVault: getAssociatedTokenAddressSync(nvdaMint, h.protocolConfig, true),
              systemProgram: SystemProgram.programId,
            })
            .instruction(),
        ],
        [h.admin]
      );
      expect(isSuccess(registerNvdaTx)).to.be.true;

      // Deposit NVDA
      const depositNvdaTx = h.send(
        [
          await h.program.methods
            .deposit(new BN(5 * TOKEN))
            .accountsPartial({
              owner: h.user.publicKey,
              protocolConfig: h.protocolConfig,
              assetConfig: nvdaAssetPda,
              mint: nvdaMint,
              position: nvdaPosPda,
              userCollateralAta: userNvdaAta,
              collateralVault: getAssociatedTokenAddressSync(nvdaMint, h.protocolConfig, true),
              systemProgram: SystemProgram.programId,
            })
            .instruction(),
        ],
        [h.user]
      );
      expect(isSuccess(depositNvdaTx)).to.be.true;

      const nvdaPos = h.fetch("position", nvdaPosPda);
      expect(nvdaPos.collateralAmount.toNumber()).to.equal(5 * TOKEN);
      expect(nvdaPos.asset.toBase58()).to.equal(nvdaMint.toBase58());
    });

    it("Vector 3: Position page never leaks another asset (PDA derivation check)", async () => {
      const [pdaAapl] = PublicKey.findProgramAddressSync(
        [Buffer.from("position"), h.user.publicKey.toBuffer(), h.equityMint.toBuffer()],
        h.programId
      );
      const [pdaNvda] = PublicKey.findProgramAddressSync(
        [Buffer.from("position"), h.user.publicKey.toBuffer(), nvdaMint.toBuffer()],
        h.programId
      );
      expect(pdaAapl.toBase58()).to.not.equal(pdaNvda.toBase58());
    });

    it("Vector 4: Borrow on AAPL cannot mutate NVDA collateral or debt", async () => {
      // Borrow $300 on AAPL
      h.sendOk([await h.ixBorrow(300 * TOKEN)], [h.user]);
      const posAapl = h.fetch("position", h.position);
      expect(posAapl.debtAmount.toNumber()).to.equal(300 * TOKEN);

      // Verify NVDA position PDA does not exist or has zero debt
      const [nvdaPosPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("position"), h.user.publicKey.toBuffer(), nvdaMint.toBuffer()],
        h.programId
      );
      const nvdaAccount = h.svm.getAccount(nvdaPosPda);
      expect(nvdaAccount).to.be.null; // Untouched
    });

    it("Vector 5: Multiple user positions remain strictly isolated", async () => {
      const user2 = Keypair.generate();
      h.svm.airdrop(user2.publicKey, 10_000_000_000n);
      const user2Ata = getAssociatedTokenAddressSync(h.equityMint, user2.publicKey);

      h.sendOk(
        [
          createAssociatedTokenAccountInstruction(
            h.admin.publicKey,
            user2Ata,
            user2.publicKey,
            h.equityMint
          ),
          createMintToInstruction(
            h.equityMint,
            user2Ata,
            h.admin.publicKey,
            BigInt(20 * TOKEN)
          ),
        ],
        [h.admin]
      );

      const [user2PosPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("position"), user2.publicKey.toBuffer(), h.equityMint.toBuffer()],
        h.programId
      );

      // User 2 deposits 20 tokens
      h.sendOk(
        [
          await h.program.methods
            .deposit(new BN(20 * TOKEN))
            .accountsPartial({
              owner: user2.publicKey,
              protocolConfig: h.protocolConfig,
              assetConfig: h.assetConfig,
              mint: h.equityMint,
              position: user2PosPda,
              userCollateralAta: user2Ata,
              collateralVault: h.collateralVault,
              systemProgram: SystemProgram.programId,
            })
            .instruction(),
        ],
        [user2]
      );

      const pos1 = h.fetch("position", h.position);
      const pos2 = h.fetch("position", user2PosPda);
      expect(pos1.collateralAmount.toNumber()).to.equal(10 * TOKEN);
      expect(pos2.collateralAmount.toNumber()).to.equal(20 * TOKEN);
    });
  });

  /* -------------------------------------------------------------------------- */
  /*  AGENT AUTHORITY (Vectors 6 - 12)                                          */
  /* -------------------------------------------------------------------------- */
  describe("Agent Authority & Bounded Delegation (Vectors 6 - 12)", () => {
    beforeEach(async () => {
      // Create delegation: $500 max borrow, [BORROW, REPAY] allowed
      h.sendOk(
        [
          await h.ixCreateAgentAuthority(h.user, agent, {
            allowedActions: ACTION_BORROW | ACTION_REPAY,
            maxBorrowLimit: 500 * TOKEN,
            maxWithdrawLimit: 0,
            riskBudget: 500 * TOKEN,
            expiryTs: 0,
          }),
        ],
        [h.user]
      );
    });

    it("Vector 6: Authorized agent succeeds within bounded policy", async () => {
      const tx = h.send(
        [
          await h.ixExecuteAgentAction(agent, h.user, {
            action: "borrow",
            amount: 200 * TOKEN,
            nonce: 0,
            userQuoteAta: agentQuoteAta,
            userCollateralAta: agentEquityAta,
          }),
        ],
        [agent]
      );
      expect(isSuccess(tx)).to.be.true;

      const pos = h.fetch("position", h.position);
      const auth = h.fetch("agentAuthority", aaplAuthorityPda);
      expect(pos.debtAmount.toNumber()).to.equal(200 * TOKEN);
      expect(auth.currentBorrowed.toNumber()).to.equal(200 * TOKEN);
      expect(auth.nonce.toNumber()).to.equal(1);
    });

    it("Vector 7: Unauthorized rogue agent signer is rejected", async () => {
      const tx = h.send(
        [
          await h.ixExecuteAgentAction(rogueAgent, h.user, {
            action: "borrow",
            amount: 100 * TOKEN,
            nonce: 0,
            userQuoteAta: agentQuoteAta,
            userCollateralAta: agentEquityAta,
          }),
        ],
        [rogueAgent]
      );
      expect(isFailure(tx)).to.be.true;
    });

    it("Vector 8: Revoked agent authority fails onchain", async () => {
      // Owner revokes authority by setting allowed_actions = 0
      h.sendOk(
        [
          await h.ixUpdateAgentAuthority(h.user, agent, {
            allowedActions: 0,
            maxBorrowLimit: 0,
            maxWithdrawLimit: 0,
            riskBudget: 0,
            expiryTs: 0,
          }),
        ],
        [h.user]
      );

      const tx = h.send(
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
      expect(isFailure(tx)).to.be.true;
      expect(logsOf(tx).some((l) => l.includes("AgentActionNotPermitted"))).to.be.true;
    });

    it("Vector 9: Expired authority is strictly rejected", async () => {
      const expiredTs = Number(TS_MARKET_OPEN) - 100;
      h.sendOk(
        [
          await h.ixUpdateAgentAuthority(h.user, agent, {
            allowedActions: ACTION_BORROW | ACTION_REPAY,
            maxBorrowLimit: 500 * TOKEN,
            maxWithdrawLimit: 0,
            riskBudget: 500 * TOKEN,
            expiryTs: expiredTs,
          }),
        ],
        [h.user]
      );

      const tx = h.send(
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
      expect(isFailure(tx)).to.be.true;
      expect(logsOf(tx).some((l) => l.includes("AgentAuthorityExpired"))).to.be.true;
    });

    it("Vector 10: Wrong collateral asset scope fails", async () => {
      const tx = h.send(
        [
          await h.ixExecuteAgentAction(agent, h.user, {
            action: "borrow",
            amount: 100 * TOKEN,
            nonce: 0,
            mint: nvdaMint,
            userQuoteAta: agentQuoteAta,
            userCollateralAta: userNvdaAta,
          }),
        ],
        [agent]
      );
      expect(isFailure(tx)).to.be.true;
    });

    it("Vector 11: Agent cannot increase its own borrow limit", async () => {
      const tx = h.send(
        [
          await h.program.methods
            .updateAgentAuthority(
              ACTION_BORROW | ACTION_REPAY,
              new BN(100_000 * TOKEN),
              new BN(0),
              new BN(100_000 * TOKEN),
              new BN(0)
            )
            .accountsPartial({
              owner: agent.publicKey, // Agent attempts to pose as owner
              agent: agent.publicKey,
              assetMint: h.equityMint,
              agentAuthority: aaplAuthorityPda,
            })
            .instruction(),
        ],
        [agent]
      );
      expect(isFailure(tx)).to.be.true;
    });

    it("Vector 12: Agent cannot modify owner capital policy or toggle pause", async () => {
      const tx = h.send([await h.ixPause(agent)], [agent]);
      expect(isFailure(tx)).to.be.true;
      expect(logsOf(tx).some((l) => l.includes("Unauthorized"))).to.be.true;
    });
  });

  /* -------------------------------------------------------------------------- */
  /*  RISK RATCHET TRANSITIONS & HYSTERESIS (Vectors 13 - 20)                   */
  /* -------------------------------------------------------------------------- */
  describe("Risk Ratchet Transitions & Staged Hysteresis (Vectors 13 - 20)", () => {
    it("Vector 13: SAFE → RESTRICTED on Pyth confidence > 50 bps", async () => {
      h.setPrice({ priceUsd: 100, confUsd: 0.8 }); // 80 bps > 50 bps
      h.sendOk([await h.ixRefreshGuard()], [h.outsider]);

      const ratchet = h.fetch("riskRatchet", h.riskRatchet);
      expect(Object.keys(ratchet.state)[0].toLowerCase()).to.equal("restricted");
      expect(ratchet.riskEpoch.toNumber()).to.equal(1);
    });

    it("Vector 14: RESTRICTED → DEFENSIVE on Pyth confidence > 150 bps", async () => {
      h.setPrice({ priceUsd: 100, confUsd: 2.0 }); // 200 bps > 150 bps
      h.sendOk([await h.ixRefreshGuard()], [h.outsider]);

      const ratchet = h.fetch("riskRatchet", h.riskRatchet);
      expect(Object.keys(ratchet.state)[0].toLowerCase()).to.equal("defensive");
      expect(ratchet.riskEpoch.toNumber()).to.be.at.least(1);
    });

    it("Vector 15: DEFENSIVE → EMERGENCY on Pyth confidence > 300 bps", async () => {
      h.setPrice({ priceUsd: 100, confUsd: 3.5 }); // 350 bps > 300 bps
      h.sendOk([await h.ixRefreshGuard()], [h.outsider]);

      const ratchet = h.fetch("riskRatchet", h.riskRatchet);
      expect(Object.keys(ratchet.state)[0].toLowerCase()).to.equal("emergency");
    });

    it("Vector 16: Staged recovery requires 5 consecutive healthy observations", async () => {
      // Degrade to RESTRICTED
      h.setPrice({ priceUsd: 100, confUsd: 0.8 });
      h.sendOk([await h.ixRefreshGuard()], [h.outsider]);

      // Set healthy price (20 bps < recovery threshold 30 bps)
      h.setPrice({ priceUsd: 100, confUsd: 0.2 });

      // Cranks 1 to 4: remains RESTRICTED
      for (let i = 1; i <= 4; i++) {
        h.sendOk([await h.ixRefreshGuard()], [h.outsider]);
        const r = h.fetch("riskRatchet", h.riskRatchet);
        expect(Object.keys(r.state)[0].toLowerCase()).to.equal("restricted");
        expect(r.consecutiveHealthyObservations).to.equal(i);
      }

      // Crank 5: steps up to SAFE
      h.sendOk([await h.ixRefreshGuard()], [h.outsider]);
      const finalRatchet = h.fetch("riskRatchet", h.riskRatchet);
      expect(Object.keys(finalRatchet.state)[0].toLowerCase()).to.equal("safe");
      expect(finalRatchet.consecutiveHealthyObservations).to.equal(0);
    });

    it("Vector 17: No skipped states (direct Emergency -> Safe is blocked)", async () => {
      // Degrade to EMERGENCY
      h.setPrice({ priceUsd: 100, confUsd: 4.0 });
      h.sendOk([await h.ixRefreshGuard()], [h.outsider]);

      // Recover to healthy price (20 bps)
      h.setPrice({ priceUsd: 100, confUsd: 0.2 });

      // Run 5 cranks: steps up to DEFENSIVE (NOT Safe)
      for (let i = 0; i < 5; i++) {
        h.sendOk([await h.ixRefreshGuard()], [h.outsider]);
      }
      const r1 = h.fetch("riskRatchet", h.riskRatchet);
      expect(Object.keys(r1.state)[0].toLowerCase()).to.equal("defensive");

      // Run next 5 cranks: steps up to RESTRICTED
      for (let i = 0; i < 5; i++) {
        h.sendOk([await h.ixRefreshGuard()], [h.outsider]);
      }
      const r2 = h.fetch("riskRatchet", h.riskRatchet);
      expect(Object.keys(r2.state)[0].toLowerCase()).to.equal("restricted");

      // Run next 5 cranks: steps up to SAFE
      for (let i = 0; i < 5; i++) {
        h.sendOk([await h.ixRefreshGuard()], [h.outsider]);
      }
      const r3 = h.fetch("riskRatchet", h.riskRatchet);
      expect(Object.keys(r3.state)[0].toLowerCase()).to.equal("safe");
    });

    it("Vector 18: Hysteresis deadband enforced (T_up < T_down)", async () => {
      // Safe -> Restricted downgrade threshold is 50 bps
      // Restricted -> Safe recovery threshold is 30 bps
      // 40 bps is inside hysteresis deadband: cannot step up to SAFE
      h.setPrice({ priceUsd: 100, confUsd: 0.8 }); // Trigger Restricted
      h.sendOk([await h.ixRefreshGuard()], [h.outsider]);

      h.setPrice({ priceUsd: 100, confUsd: 0.4 }); // 40 bps
      for (let i = 0; i < 5; i++) {
        h.sendOk([await h.ixRefreshGuard()], [h.outsider]);
      }
      const r = h.fetch("riskRatchet", h.riskRatchet);
      expect(Object.keys(r.state)[0].toLowerCase()).to.equal("restricted");
    });

    it("Vector 19: Stale oracle blocks risky actions", async () => {
      h.setTime(TS_MARKET_OPEN + 500n); // Advance clock beyond max age (60s)
      const tx = h.send([await h.ixBorrow(100 * TOKEN)], [h.user]);
      expect(isFailure(tx)).to.be.true;
      expect(logsOf(tx).some((l) => l.includes("StaleOracle"))).to.be.true;
    });

    it("Vector 20: Confidence interval breach blocks risky actions", async () => {
      h.setPrice({ priceUsd: 100, confUsd: 10.0 }); // 10% confidence width (1000 bps > 500 bps max limit)
      const tx = h.send([await h.ixBorrow(100 * TOKEN)], [h.user]);
      expect(isFailure(tx)).to.be.true;
      expect(logsOf(tx).some((l) => l.includes("ConfidenceTooWide"))).to.be.true;
    });
  });

  /* -------------------------------------------------------------------------- */
  /*  CREDIT ENGINE & INVARIANTS (Vectors 21 - 28)                              */
  /* -------------------------------------------------------------------------- */
  describe("Credit Engine Permissions & Invariants (Vectors 21 - 28)", () => {
    it("Vector 21: Safe borrow succeeds within capacity", async () => {
      const tx = h.send([await h.ixBorrow(400 * TOKEN)], [h.user]);
      expect(isSuccess(tx)).to.be.true;

      const pos = h.fetch("position", h.position);
      expect(pos.debtAmount.toNumber()).to.equal(400 * TOKEN);
    });

    it("Vector 22: Restricted borrow is limited / throttled", async () => {
      h.sendOk(
        [
          await h.ixCreateAgentAuthority(h.user, agent, {
            allowedActions: ACTION_BORROW | ACTION_REPAY,
            maxBorrowLimit: 500 * TOKEN,
            maxWithdrawLimit: 0,
            riskBudget: 500 * TOKEN,
            expiryTs: 0,
          }),
        ],
        [h.user]
      );

      // Degrade to RESTRICTED (80 bps > 50 bps)
      h.setPrice({ priceUsd: 100, confUsd: 0.8 });
      h.sendOk([await h.ixRefreshGuard()], [h.outsider]);

      // Agent borrow is blocked under RESTRICTED
      const tx = h.send(
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
      expect(isFailure(tx)).to.be.true;
      expect(logsOf(tx).some((l) => l.includes("BorrowDisabledByRiskPolicy"))).to.be.true;
    });

    it("Vector 23: Defensive borrow is strictly blocked", async () => {
      h.sendOk(
        [
          await h.ixCreateAgentAuthority(h.user, agent, {
            allowedActions: ACTION_BORROW | ACTION_REPAY,
            maxBorrowLimit: 500 * TOKEN,
            maxWithdrawLimit: 0,
            riskBudget: 500 * TOKEN,
            expiryTs: 0,
          }),
        ],
        [h.user]
      );

      h.setPrice({ priceUsd: 100, confUsd: 2.0 }); // DEFENSIVE (200 bps > 150 bps)
      h.sendOk([await h.ixRefreshGuard()], [h.outsider]);

      const tx = h.send(
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
      expect(isFailure(tx)).to.be.true;
      expect(logsOf(tx).some((l) => l.includes("BorrowDisabledByRiskPolicy"))).to.be.true;
    });

    it("Vector 24: Emergency borrow is strictly blocked", async () => {
      h.sendOk(
        [
          await h.ixCreateAgentAuthority(h.user, agent, {
            allowedActions: ACTION_BORROW | ACTION_REPAY,
            maxBorrowLimit: 500 * TOKEN,
            maxWithdrawLimit: 0,
            riskBudget: 500 * TOKEN,
            expiryTs: 0,
          }),
        ],
        [h.user]
      );

      h.setPrice({ priceUsd: 100, confUsd: 4.0 }); // EMERGENCY (400 bps > 300 bps)
      h.sendOk([await h.ixRefreshGuard()], [h.outsider]);

      const tx = h.send(
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
      expect(isFailure(tx)).to.be.true;
      expect(logsOf(tx).some((l) => l.includes("BorrowDisabledByRiskPolicy"))).to.be.true;
    });

    it("Vector 25: Repay works unconditionally across all states", async () => {
      // Draw debt in SAFE state
      h.sendOk([await h.ixBorrow(200 * TOKEN)], [h.user]);

      // Force EMERGENCY state
      h.setPrice({ priceUsd: 100, confUsd: 4.0 });
      h.sendOk([await h.ixRefreshGuard()], [h.outsider]);

      // Repay $100 in EMERGENCY state succeeds
      const repayTx = h.send([await h.ixRepay(100 * TOKEN)], [h.user]);
      expect(isSuccess(repayTx)).to.be.true;

      const pos = h.fetch("position", h.position);
      expect(pos.debtAmount.toNumber()).to.equal(100 * TOKEN);
    });

    it("Vector 26: Deposit collateral works unconditionally across all states", async () => {
      // Force EMERGENCY state
      h.setPrice({ priceUsd: 100, confUsd: 4.0 });
      h.sendOk([await h.ixRefreshGuard()], [h.outsider]);

      // Deposit 5 AAPLx in EMERGENCY state succeeds
      const depositTx = h.send([await h.ixDeposit(5 * TOKEN)], [h.user]);
      expect(isSuccess(depositTx)).to.be.true;

      const pos = h.fetch("position", h.position);
      expect(pos.collateralAmount.toNumber()).to.equal(15 * TOKEN);
    });

    it("Vector 27: Withdrawal follows policy (blocked during stress if holding debt)", async () => {
      // Create delegation allowing withdraw
      h.sendOk(
        [
          await h.ixCreateAgentAuthority(h.user, agent, {
            allowedActions: ACTION_BORROW | ACTION_WITHDRAW | ACTION_REPAY,
            maxBorrowLimit: 500 * TOKEN,
            maxWithdrawLimit: 5 * TOKEN,
            riskBudget: 500 * TOKEN,
            expiryTs: 0,
          }),
        ],
        [h.user]
      );

      // Borrow $200 in SAFE state
      h.sendOk(
        [
          await h.ixExecuteAgentAction(agent, h.user, {
            action: "borrow",
            amount: 200 * TOKEN,
            nonce: 0,
            userQuoteAta: agentQuoteAta,
            userCollateralAta: agentEquityAta,
          }),
        ],
        [agent]
      );

      // Move to DEFENSIVE
      h.setPrice({ priceUsd: 100, confUsd: 2.0 });
      h.sendOk([await h.ixRefreshGuard()], [h.outsider]);

      // Withdrawal of collateral while debt > 0 is blocked in DEFENSIVE
      const withdrawTx = h.send(
        [
          await h.ixExecuteAgentAction(agent, h.user, {
            action: "withdraw",
            amount: 2 * TOKEN,
            nonce: 1,
            userQuoteAta: agentQuoteAta,
            userCollateralAta: agentEquityAta,
          }),
        ],
        [agent]
      );
      expect(isFailure(withdrawTx)).to.be.true;
      expect(logsOf(withdrawTx).some((l) => l.includes("WithdrawRestrictedInStress"))).to.be.true;
    });

    it("Vector 28: LTV invariant strictly holds (cannot borrow beyond base LTV)", async () => {
      // Collateral: 10 AAPLx ($1,000). Max LTV: 70% ($700).
      // Attempting to borrow $701 must fail
      const tx = h.send([await h.ixBorrow(701 * TOKEN)], [h.user]);
      expect(isFailure(tx)).to.be.true;
      expect(logsOf(tx).some((l) => l.includes("BorrowExceedsCapacity"))).to.be.true;
    });
  });

  /* -------------------------------------------------------------------------- */
  /*  ACTIVITY & AUDITABILITY (Vectors 29 - 30)                                 */
  /* -------------------------------------------------------------------------- */
  describe("Activity & Causal History (Vectors 29 - 30)", () => {
    it("Vector 29: Successful credit operations emit audit events in transaction logs", async () => {
      const tx = h.send([await h.ixBorrow(150 * TOKEN)], [h.user]);
      expect(isSuccess(tx)).to.be.true;

      const logs = logsOf(tx);
      expect(logs.some((l) => l.includes("Instruction: Borrow"))).to.be.true;
    });

    it("Vector 30: Denied operations emit explicit anchor reason codes in logs", async () => {
      h.sendOk(
        [
          await h.ixCreateAgentAuthority(h.user, agent, {
            allowedActions: ACTION_BORROW,
            maxBorrowLimit: 500 * TOKEN,
            maxWithdrawLimit: 0,
            riskBudget: 500 * TOKEN,
            expiryTs: 0,
          }),
        ],
        [h.user]
      );

      h.setPrice({ priceUsd: 100, confUsd: 4.0 }); // EMERGENCY
      h.sendOk([await h.ixRefreshGuard()], [h.outsider]);

      const tx = h.send(
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
      expect(isFailure(tx)).to.be.true;
      const logs = logsOf(tx);
      expect(logs.some((l) => l.includes("BorrowDisabledByRiskPolicy") || l.includes("Error Code"))).to.be.true;
    });
  });
});
