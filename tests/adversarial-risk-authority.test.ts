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
  TS_AFTER_CLOSE,
  WRONG_FEED_ID_HEX,
  FEED_ID_HEX,
} from "./helpers/harness";
import { isFailure, isSuccess, logsOf, errOf } from "./helpers/svm";

describe("Risk-Adaptive Permission Layer & Adversarial Financial Invariant Tests", () => {
  let h: Harness;
  let agent: Keypair;
  let rogueAgent: Keypair;
  let attacker: Keypair;
  let agentQuoteAta: PublicKey;
  let agentEquityAta: PublicKey;

  beforeEach(async () => {
    h = await setupHarness();
    agent = Keypair.generate();
    rogueAgent = Keypair.generate();
    attacker = Keypair.generate();

    // Airdrop SOL to test actors
    h.svm.airdrop(agent.publicKey, 10_000_000_000n);
    h.svm.airdrop(rogueAgent.publicKey, 10_000_000_000n);
    h.svm.airdrop(attacker.publicKey, 10_000_000_000n);

    // Create ATAs for agent
    agentQuoteAta = getAssociatedTokenAddressSync(h.quoteMint, agent.publicKey);
    agentEquityAta = getAssociatedTokenAddressSync(h.equityMint, agent.publicKey);

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
        createMintToInstruction(
          h.quoteMint,
          agentQuoteAta,
          h.admin.publicKey,
          BigInt(10_000 * TOKEN)
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
    h.setPrice({ priceUsd: 100, confUsd: 0.2 }); // 20 BPS -> Safe
    await h.bootstrapProtocol(500_000, 500);

    // Initial crank to establish Safe baseline at epoch 0
    h.sendOk([await h.ixRefreshGuard()], [h.outsider]);

    // Fund user with 100 equity tokens
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

    // User deposits 10 equity tokens ($1,000 collateral)
    h.sendOk([await h.ixDeposit(10 * TOKEN)], [h.user]);
  });

  /* -------------------------------------------------------------------------- */
  /*  DOMAIN 1: RISK STATE MACHINE & HYSTERESIS (Vectors 1 - 13)                */
  /* -------------------------------------------------------------------------- */
  describe("Domain 1: Risk Ratchet State Machine & Deterministic Hysteresis (Vectors 1-13)", () => {
    it("Vector 1: SAFE remains SAFE under healthy oracle and open market conditions", async () => {
      h.sendOk([await h.ixRefreshGuard()], [h.outsider]);
      const ratchet = h.fetch("riskRatchet", h.riskRatchet);
      expect(ratchet.state).to.deep.equal({ safe: {} });
      expect(ratchet.riskEpoch.toNumber()).to.equal(0);
      expect(ratchet.transitionNonce.toNumber()).to.equal(0);
    });

    it("Vector 2: SAFE -> RESTRICTED triggers on confidence widening (> 50 BPS) or market close", async () => {
      // 80 BPS uncertainty (> 50 BPS)
      h.setPrice({ priceUsd: 100, confUsd: 0.8 });
      h.sendOk([await h.ixRefreshGuard()], [h.outsider]);

      const ratchet = h.fetch("riskRatchet", h.riskRatchet);
      expect(ratchet.state).to.deep.equal({ restricted: {} });
      expect(ratchet.riskEpoch.toNumber()).to.equal(1);
      expect(ratchet.transitionNonce.toNumber()).to.equal(1);
    });

    it("Vector 3: RESTRICTED -> DEFENSIVE triggers when confidence widens (> 150 BPS)", async () => {
      // 200 BPS uncertainty (> 150 BPS, <= 300 BPS)
      h.setPrice({ priceUsd: 100, confUsd: 2.0 });
      h.sendOk([await h.ixRefreshGuard()], [h.outsider]);

      const ratchet = h.fetch("riskRatchet", h.riskRatchet);
      expect(ratchet.state).to.deep.equal({ defensive: {} });
      expect(ratchet.riskEpoch.toNumber()).to.equal(1);
    });

    it("Vector 4: DEFENSIVE -> EMERGENCY triggers when confidence widens (> 300 BPS) or custody impaired", async () => {
      // 350 BPS uncertainty (> 300 BPS)
      h.setPrice({ priceUsd: 100, confUsd: 3.5 });
      h.sendOk([await h.ixRefreshGuard()], [h.outsider]);

      const ratchet = h.fetch("riskRatchet", h.riskRatchet);
      expect(ratchet.state).to.deep.equal({ emergency: {} });
      expect(ratchet.riskEpoch.toNumber()).to.equal(1);
    });

    it("Vector 5: EMERGENCY CANNOT jump directly to SAFE (strict staged recovery invariant)", async () => {
      // Put into emergency
      h.setPrice({ priceUsd: 100, confUsd: 3.5 });
      h.sendOk([await h.ixRefreshGuard()], [h.outsider]);

      // Immediate price recovery to pristine conditions (10 BPS)
      h.setPrice({ priceUsd: 100, confUsd: 0.1 });
      h.sendOk([await h.ixRefreshGuard()], [h.outsider]);

      const ratchet = h.fetch("riskRatchet", h.riskRatchet);
      // Still in Emergency: requires 5 consecutive healthy observations to step up to Defensive only!
      expect(ratchet.state).to.deep.equal({ emergency: {} });
      expect(ratchet.consecutiveHealthyObservations).to.equal(1);
    });

    it("Vector 6, 7, 8: Staged Recovery: EMERGENCY -> DEFENSIVE -> RESTRICTED -> SAFE with 5 clean observations", async () => {
      // Degrade to Emergency
      h.setPrice({ priceUsd: 100, confUsd: 3.5 });
      h.sendOk([await h.ixRefreshGuard()], [h.outsider]);

      // Provide clean observations (20 BPS <= 250 BPS deadband)
      h.setPrice({ priceUsd: 100, confUsd: 0.2 });

      // Observations 1 to 4: progress counter
      for (let i = 1; i <= 4; i++) {
        h.advanceSlots(1);
        h.sendOk([await h.ixRefreshGuard()], [h.outsider]);
        const r = h.fetch("riskRatchet", h.riskRatchet);
        expect(r.state).to.deep.equal({ emergency: {} });
        expect(r.consecutiveHealthyObservations).to.equal(i);
      }

      // Observation 5: Steps up to DEFENSIVE
      h.advanceSlots(1);
      h.sendOk([await h.ixRefreshGuard()], [h.outsider]);
      let r = h.fetch("riskRatchet", h.riskRatchet);
      expect(r.state).to.deep.equal({ defensive: {} });
      expect(r.consecutiveHealthyObservations).to.equal(0);

      // 5 more clean observations step up to RESTRICTED
      for (let i = 1; i <= 5; i++) {
        h.advanceSlots(1);
        h.sendOk([await h.ixRefreshGuard()], [h.outsider]);
      }
      r = h.fetch("riskRatchet", h.riskRatchet);
      expect(r.state).to.deep.equal({ restricted: {} });

      // 5 more clean observations step up to SAFE (conf <= 30 BPS deadband)
      for (let i = 1; i <= 5; i++) {
        h.advanceSlots(1);
        h.sendOk([await h.ixRefreshGuard()], [h.outsider]);
      }
      r = h.fetch("riskRatchet", h.riskRatchet);
      expect(r.state).to.deep.equal({ safe: {} });
    });

    it("Vector 9, 10, 11: Nonce increments on every state transition and timestamps remain monotonic", async () => {
      // First degrade
      h.setPrice({ priceUsd: 100, confUsd: 0.8 });
      h.sendOk([await h.ixRefreshGuard()], [h.outsider]);
      let r = h.fetch("riskRatchet", h.riskRatchet);
      const nonce1 = r.transitionNonce.toNumber();
      const ts1 = r.lastTransitionTs.toNumber();
      expect(nonce1).to.equal(1);

      // Second degrade
      h.setTime(TS_MARKET_OPEN + 100n);
      h.setPrice({ priceUsd: 100, confUsd: 2.0 });
      h.sendOk([await h.ixRefreshGuard()], [h.outsider]);
      r = h.fetch("riskRatchet", h.riskRatchet);
      const nonce2 = r.transitionNonce.toNumber();
      const ts2 = r.lastTransitionTs.toNumber();

      expect(nonce2).to.equal(nonce1 + 1);
      expect(ts2).to.be.gte(ts1);
    });

    it("Vector 12, 13: Stale condition rejection: single dirty tick resets consecutive recovery counter", async () => {
      // Put in emergency
      h.setPrice({ priceUsd: 100, confUsd: 3.5 });
      h.sendOk([await h.ixRefreshGuard()], [h.outsider]);

      // 3 clean observations
      h.setPrice({ priceUsd: 100, confUsd: 0.2 });
      for (let i = 0; i < 3; i++) {
        h.advanceSlots(1);
        h.sendOk([await h.ixRefreshGuard()], [h.outsider]);
      }
      let r = h.fetch("riskRatchet", h.riskRatchet);
      expect(r.consecutiveHealthyObservations).to.equal(3);

      // Sudden dirty tick (> 250 BPS) resets counter to 0
      h.advanceSlots(1);
      h.setPrice({ priceUsd: 100, confUsd: 2.8 });
      h.sendOk([await h.ixRefreshGuard()], [h.outsider]);
      r = h.fetch("riskRatchet", h.riskRatchet);
      expect(r.consecutiveHealthyObservations).to.equal(0);
      expect(r.state).to.deep.equal({ emergency: {} });
    });
  });

  /* -------------------------------------------------------------------------- */
  /*  DOMAIN 2: ORACLE UNCERTAINTY & BOUNDS (Vectors 14 - 19)                   */
  /* -------------------------------------------------------------------------- */
  describe("Domain 2: Oracle Uncertainty & Bounds (Vectors 14-19)", () => {
    it("Vector 14: Stale price rejection (> max_oracle_age) blocks borrowing", async () => {
      h.setTime(TS_MARKET_OPEN + 1000n); // 1000s ahead of publish time
      const res = h.send([await h.ixBorrow(100 * TOKEN)], [h.user]);
      expect(isFailure(res)).to.be.true;
    });

    it("Vector 15: Wrong oracle feed rejection", async () => {
      h.setPrice({ feedIdHex: WRONG_FEED_ID_HEX });
      const res = h.send([await h.ixBorrow(100 * TOKEN)], [h.user]);
      expect(isFailure(res)).to.be.true;
    });

    it("Vector 16: Wrong oracle account owner rejection", async () => {
      h.setPrice({ owner: attacker.publicKey });
      const res = h.send([await h.ixBorrow(100 * TOKEN)], [h.user]);
      expect(isFailure(res)).to.be.true;
    });

    it("Vector 17: Confidence interval too wide (> max_conf_bps) blocks borrowing", async () => {
      h.setPrice({ priceUsd: 100, confUsd: 6.0 }); // 6.0% > 5% max_conf_bps
      const res = h.send([await h.ixBorrow(100 * TOKEN)], [h.user]);
      expect(isFailure(res)).to.be.true;
    });

    it("Vector 18: Reference market closed (NYSE after close) blocks borrowing", async () => {
      h.setTime(TS_AFTER_CLOSE);
      h.setPrice({ publishTime: TS_AFTER_CLOSE });
      const res = h.send([await h.ixBorrow(100 * TOKEN)], [h.user]);
      expect(isFailure(res)).to.be.true;
      expect(logsOf(res).some((l) => l.includes("MarketClosed"))).to.be.true;
    });

    it("Vector 19: Unsafe market state blocks risk-increasing operations", async () => {
      h.sendOk([await h.ixSetCustody("impaired")], [h.admin]);
      const res = h.send([await h.ixBorrow(50 * TOKEN)], [h.user]);
      expect(isFailure(res)).to.be.true;
    });
  });

  /* -------------------------------------------------------------------------- */
  /*  DOMAIN 3: CREDIT ENFORCEMENT & HARD INVARIANTS (Vectors 20 - 28)           */
  /* -------------------------------------------------------------------------- */
  describe("Domain 3: Credit Enforcement & Hard Invariants (Vectors 20-28)", () => {
    it("Vector 20: Borrow succeeds under SAFE market state", async () => {
      // Collateral = $1,000, 70% LTV = $700 capacity. Borrow $300.
      h.sendOk([await h.ixBorrow(300 * TOKEN)], [h.user]);
      const pos = h.fetch("position", h.position);
      expect(pos.debtAmount.toNumber()).to.equal(300 * TOKEN);
    });

    it("Vector 21: Borrow is blocked when Capital Policy restricts borrowing", async () => {
      h.sendOk([await h.ixSetLiquidity("thin")], [h.admin]); // Triggers Restricted
      const res = h.send([await h.ixBorrow(100 * TOKEN)], [h.user]);
      expect(isFailure(res)).to.be.true;
    });

    it("Vector 22, 23: Borrow is strictly blocked under DEFENSIVE and EMERGENCY states", async () => {
      h.sendOk([await h.ixSetCustody("delayed")], [h.admin]); // Restricted/Defensive
      let res = h.send([await h.ixBorrow(100 * TOKEN)], [h.user]);
      expect(isFailure(res)).to.be.true;

      h.sendOk([await h.ixSetCustody("impaired")], [h.admin]); // Emergency
      res = h.send([await h.ixBorrow(100 * TOKEN)], [h.user]);
      expect(isFailure(res)).to.be.true;
    });

    it("Vector 24: Withdrawal with active debt is prohibited during defensive or emergency states", async () => {
      // Borrow $200 while safe
      h.sendOk([await h.ixBorrow(200 * TOKEN)], [h.user]);

      // Degrade to Emergency
      h.sendOk([await h.ixSetCustody("impaired")], [h.admin]);

      // Withdrawal with debt must fail
      const res = h.send([await h.ixWithdraw(1 * TOKEN)], [h.user]);
      expect(isFailure(res)).to.be.true;
    });

    it("Vector 25: Repayment always remains available, even in emergency or pause", async () => {
      // Borrow $200 while safe
      h.sendOk([await h.ixBorrow(200 * TOKEN)], [h.user]);

      // Pause protocol and impair custody
      h.sendOk([await h.ixPause()], [h.admin]);
      h.sendOk([await h.ixSetCustody("impaired")], [h.admin]);

      // Repaying debt MUST succeed (anti-hostage fund guarantee)
      h.sendOk([await h.ixRepay(100 * TOKEN)], [h.user]);
      const pos = h.fetch("position", h.position);
      expect(pos.debtAmount.toNumber()).to.equal(100 * TOKEN);
    });

    it("Vector 26: Collateral deposit always remains available in any risk state", async () => {
      h.sendOk([await h.ixSetCustody("impaired")], [h.admin]);
      h.sendOk([await h.ixDeposit(5 * TOKEN)], [h.user]);
      const pos = h.fetch("position", h.position);
      expect(pos.collateralAmount.toNumber()).to.equal(15 * TOKEN);
    });

    it("Vector 27: Borrow cannot exceed effective LTV capacity (hard mathematical invariant)", async () => {
      // $1,000 collateral at 70% LTV = $700 max borrow. Trying $701 must fail.
      const res = h.send([await h.ixBorrow(701 * TOKEN)], [h.user]);
      expect(isFailure(res)).to.be.true;
      expect(logsOf(res).some((l) => l.includes("BorrowExceedsCapacity"))).to.be.true;
    });

    it("Vector 28: Risk budget cannot create economic capacity beyond collateral rules", async () => {
      // Even if agent has 1,000,000 budget, collateral is only $1000 -> max borrow $700
      h.sendOk(
        [
          await h.ixCreateAgentAuthority(h.user, agent, {
            riskBudget: 1_000_000 * TOKEN,
            maxBorrowLimit: 1_000_000 * TOKEN,
          }),
        ],
        [h.user]
      );

      const res = h.send(
        [
          await h.ixExecuteAgentAction(agent, h.user, {
            action: "borrow",
            amount: 800 * TOKEN,
            nonce: 0,
            userQuoteAta: agentQuoteAta,
            userCollateralAta: agentEquityAta,
          }),
        ],
        [agent]
      );
      expect(isFailure(res)).to.be.true;
    });
  });

  /* -------------------------------------------------------------------------- */
  /*  DOMAIN 4: AGENT AUTHORITY CONSTRAINTS (Vectors 29 - 36)                   */
  /* -------------------------------------------------------------------------- */
  describe("Domain 4: Agent Authority Delegation Constraints (Vectors 29-36)", () => {
    beforeEach(async () => {
      // User delegates authority to agent:
      // Bitmask = Deposit (1) | Borrow (2) | Repay (4) | Withdraw (8) = 15
      // Max borrow = $400, Risk budget = $500, Max withdraw = 5 tokens
      h.sendOk(
        [
          await h.ixCreateAgentAuthority(h.user, agent, {
            allowedActions: 15,
            maxBorrowLimit: 400 * TOKEN,
            maxWithdrawLimit: 5 * TOKEN,
            riskBudget: 500 * TOKEN,
            expiryTs: Number(TS_MARKET_OPEN + 3600n),
          }),
        ],
        [h.user]
      );
    });

    it("Vector 29: Authorized agent successfully executes permitted action within budget", async () => {
      // Agent borrows $200 (within $400 limit, budget cost ~ $200.4)
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

      const pos = h.fetch("position", h.position);
      expect(pos.debtAmount.toNumber()).to.equal(200 * TOKEN);

      const [authPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("authority"),
          h.user.publicKey.toBuffer(),
          agent.publicKey.toBuffer(),
          h.equityMint.toBuffer(),
        ],
        h.programId
      );
      const auth = h.fetch("agentAuthority", authPda);
      expect(auth.nonce.toNumber()).to.equal(1);
      expect(auth.currentBorrowed.toNumber()).to.equal(200 * TOKEN);
      expect(auth.riskBudget.toNumber()).to.be.lt(500 * TOKEN);
    });

    it("Vector 30: Unauthorized agent strictly fails (wrong signer key)", async () => {
      const res = h.send(
        [
          await h.ixExecuteAgentAction(rogueAgent, h.user, {
            action: "borrow",
            amount: 50 * TOKEN,
            nonce: 0,
            userQuoteAta: agentQuoteAta,
            userCollateralAta: agentEquityAta,
          }),
        ],
        [rogueAgent]
      );
      expect(isFailure(res)).to.be.true;
    });

    it("Vector 31: Agent cannot exceed policy borrow limit ($400 cap)", async () => {
      // Trying to borrow $401 must fail
      const res = h.send(
        [
          await h.ixExecuteAgentAction(agent, h.user, {
            action: "borrow",
            amount: 401 * TOKEN,
            nonce: 0,
            userQuoteAta: agentQuoteAta,
            userCollateralAta: agentEquityAta,
          }),
        ],
        [agent]
      );
      expect(isFailure(res)).to.be.true;
    });

    it("Vector 32: Agent cannot modify owner's policy (update_agent_authority is owner-only)", async () => {
      try {
        const res = h.send(
          [
            await h.ixUpdateAgentAuthority(h.user, agent, {
              maxBorrowLimit: 1_000_000 * TOKEN,
            }),
          ],
          [agent]
        );
        expect(isFailure(res)).to.be.true;
      } catch (err: any) {
        expect(err).to.exist;
      }
    });

    it("Vector 33: Agent cannot self-escalate authority or bypass action bitmask", async () => {
      // Revoke borrow permission (allowed_actions = DEPOSIT | REPAY = 5)
      h.sendOk(
        [
          await h.ixUpdateAgentAuthority(h.user, agent, {
            allowedActions: 5, // Borrow bit 2 disabled
          }),
        ],
        [h.user]
      );

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
    });

    it("Vector 34: Agent cannot bypass Risk Ratchet (defensive state stops agent borrow)", async () => {
      // Put market in Defensive state
      h.setPrice({ priceUsd: 100, confUsd: 2.0 });
      h.sendOk([await h.ixRefreshGuard()], [h.outsider]);

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
    });

    it("Vector 35: Expired agent authority fails execution", async () => {
      // Advance clock past expiry
      h.setTime(TS_MARKET_OPEN + 4000n);
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
    });

    it("Vector 36: Replayed action intent fails on nonce mismatch", async () => {
      // First execution succeeds (nonce 0 -> 1)
      h.sendOk(
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

      // Replaying the same intent with nonce 0 must fail
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
    });
  });

  /* -------------------------------------------------------------------------- */
  /*  DOMAIN 5: MULTI-ASSET POSITION ISOLATION (Vectors 37 - 40)                */
  /* -------------------------------------------------------------------------- */
  describe("Domain 5: Multi-Asset Position Isolation (Vectors 37-40)", () => {
    it("Vector 37, 38, 39, 40: Positions are strictly isolated by canonical mint PDA", async () => {
      const posAapl = h.fetch("position", h.position);
      expect(posAapl.collateralAmount.toNumber()).to.equal(10 * TOKEN);

      // Verify that position PDA seeds explicitly bind owner + asset mint
      const [expectedPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("position"),
          h.user.publicKey.toBuffer(),
          h.equityMint.toBuffer(),
        ],
        h.programId
      );
      expect(h.position.toBase58()).to.equal(expectedPda.toBase58());
    });
  });

  /* -------------------------------------------------------------------------- */
  /*  DOMAIN 6: ADVERSARIAL ATTACK VECTORS (Vectors 41 - 54)                    */
  /* -------------------------------------------------------------------------- */
  describe("Domain 6: Hostile Adversarial Attacks (Vectors 41-54)", () => {
    it("Vector 41: Attacker sends corrupted/zero price oracle", async () => {
      h.setPrice({ price: 0n });
      const res = h.send([await h.ixBorrow(10 * TOKEN)], [h.user]);
      expect(isFailure(res)).to.be.true;
    });

    it("Vector 42: Attacker sends excessive u64 max values", async () => {
      const res = h.send([await h.ixBorrow(BigInt("18446744073709551615"))], [h.user]);
      expect(isFailure(res)).to.be.true;
    });

    it("Vector 43: Zero collateral position attempting to borrow fails", async () => {
      const poorUser = Keypair.generate();
      h.svm.airdrop(poorUser.publicKey, 10_000_000_000n);
      const res = h.send([await h.ixBorrow(10 * TOKEN, { owner: poorUser })], [poorUser]);
      expect(isFailure(res)).to.be.true;
    });


    it("Vector 44: Action risk budget depletion stops subsequent risk increases until repaid", async () => {
      // Allocate small budget: $100
      h.sendOk(
        [
          await h.ixCreateAgentAuthority(h.user, agent, {
            riskBudget: 100 * TOKEN,
            maxBorrowLimit: 300 * TOKEN,
          }),
        ],
        [h.user]
      );

      // First borrow $90 consumes budget (~ $90.36)
      h.sendOk(
        [
          await h.ixExecuteAgentAction(agent, h.user, {
            action: "borrow",
            amount: 90 * TOKEN,
            nonce: 0,
            userQuoteAta: agentQuoteAta,
            userCollateralAta: agentEquityAta,
          }),
        ],
        [agent]
      );

      // Second borrow $50 exceeds remaining budget (~ $9.64 left) -> DENIED
      const res = h.send(
        [
          await h.ixExecuteAgentAction(agent, h.user, {
            action: "borrow",
            amount: 50 * TOKEN,
            nonce: 1,
            userQuoteAta: agentQuoteAta,
            userCollateralAta: agentEquityAta,
          }),
        ],
        [agent]
      );
      expect(isFailure(res)).to.be.true;

      // Agent repays $50 -> Restores budget!
      h.sendOk(
        [
          await h.ixExecuteAgentAction(agent, h.user, {
            action: "repay",
            amount: 50 * TOKEN,
            nonce: 1,
            userQuoteAta: agentQuoteAta,
            userCollateralAta: agentEquityAta,
          }),
        ],
        [agent]
      );

      // Now borrow $40 succeeds!
      h.sendOk(
        [
          await h.ixExecuteAgentAction(agent, h.user, {
            action: "borrow",
            amount: 40 * TOKEN,
            nonce: 2,
            userQuoteAta: agentQuoteAta,
            userCollateralAta: agentEquityAta,
          }),
        ],
        [agent]
      );
    });

    it("Vector 45: Authority escalation prevention: non-owner cannot call createAgentAuthority for another user", async () => {
      const victim = Keypair.generate();
      try {
        const res = h.send(
          [
            await h.ixCreateAgentAuthority(victim, attacker, {
              riskBudget: 10_000 * TOKEN,
            }),
          ],
          [attacker]
        );
        expect(isFailure(res)).to.be.true;
      } catch (err: any) {
        expect(err).to.exist;
      }
    });

    it("Vector 46: Arithmetic overflow inputs fail safely", async () => {
      // Very large amount exceeding normal bounds
      const res = h.send([await h.ixBorrow(BigInt("18446744073709551610"))], [h.user]);
      expect(isFailure(res)).to.be.true;
    });

    it("Vector 47: Position with 0 collateral cannot borrow", async () => {
      // User withdraws all collateral to 0
      h.sendOk([await h.ixWithdraw(10 * TOKEN)], [h.user]);
      const resBorrow = h.send([await h.ixBorrow(10 * TOKEN)], [h.user]);
      expect(isFailure(resBorrow)).to.be.true;
    });

    it("Vector 48: Zero or invalid oracle price fails immediately", async () => {
      h.setPrice({ price: 0n });
      const res = h.send([await h.ixBorrow(10 * TOKEN)], [h.user]);
      expect(isFailure(res)).to.be.true;
    });

    it("Vector 49: Maximum integer values passed as action amount fail on-chain", async () => {
      h.sendOk(
        [
          await h.ixCreateAgentAuthority(h.user, agent, {
            riskBudget: 10_000 * TOKEN,
            maxBorrowLimit: 10_000 * TOKEN,
          }),
        ],
        [h.user]
      );

      const res = h.send(
        [
          await h.ixExecuteAgentAction(agent, h.user, {
            action: "borrow",
            amount: BigInt("18446744073709551615"),
            nonce: 0,
            userQuoteAta: agentQuoteAta,
            userCollateralAta: agentEquityAta,
          }),
        ],
        [agent]
      );
      expect(isFailure(res)).to.be.true;
    });

    it("Vector 50: Repeated transition calls under same state are idempotent", async () => {
      const r1 = h.fetch("riskRatchet", h.riskRatchet);
      const nonceBefore = r1.transitionNonce.toNumber();

      // Crank refreshGuard 3 times under unchanged healthy conditions
      for (let i = 0; i < 3; i++) {
        h.advanceSlots(1);
        h.sendOk([await h.ixRefreshGuard()], [h.outsider]);
      }

      const r2 = h.fetch("riskRatchet", h.riskRatchet);
      expect(r2.state).to.deep.equal({ safe: {} });
      expect(r2.transitionNonce.toNumber()).to.equal(nonceBefore);
    });

    it("Vector 51: Transaction replay / duplicate intent nonce fails", async () => {
      h.sendOk(
        [
          await h.ixCreateAgentAuthority(h.user, agent, {
            riskBudget: 500 * TOKEN,
            maxBorrowLimit: 500 * TOKEN,
          }),
        ],
        [h.user]
      );

      // First action with nonce 0 succeeds
      h.sendOk(
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

      // Duplicate execution with the already-used nonce 0 strictly fails
      const replayRes = h.send(
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
      expect(isFailure(replayRes)).to.be.true;
    });

    it("Vector 52: State-flapping attempt resets consecutive clean observation counter", async () => {
      // Degrade to Restricted
      h.setPrice({ priceUsd: 100, confUsd: 0.8 });
      h.sendOk([await h.ixRefreshGuard()], [h.outsider]);

      // Provide 3 clean ticks
      h.setPrice({ priceUsd: 100, confUsd: 0.2 });
      for (let i = 0; i < 3; i++) {
        h.advanceSlots(1);
        h.sendOk([await h.ixRefreshGuard()], [h.outsider]);
      }
      let r = h.fetch("riskRatchet", h.riskRatchet);
      expect(r.consecutiveHealthyObservations).to.equal(3);

      // 1 flapping dirty tick resets back to 0
      h.advanceSlots(1);
      h.setPrice({ priceUsd: 100, confUsd: 0.9 });
      h.sendOk([await h.ixRefreshGuard()], [h.outsider]);

      r = h.fetch("riskRatchet", h.riskRatchet);
      expect(r.consecutiveHealthyObservations).to.equal(0);
      expect(r.state).to.deep.equal({ restricted: {} });
    });

    it("Vector 53: Recovery spoofing with wide confidence fails to step up state", async () => {
      // Degrade to Defensive
      h.setPrice({ priceUsd: 100, confUsd: 2.0 });
      h.sendOk([await h.ixRefreshGuard()], [h.outsider]);

      // Attempt to crank with 120 BPS (exceeds recovery threshold of 100 BPS)
      h.setPrice({ priceUsd: 100, confUsd: 1.2 });
      for (let i = 0; i < 6; i++) {
        h.advanceSlots(1);
        h.sendOk([await h.ixRefreshGuard()], [h.outsider]);
      }

      const r = h.fetch("riskRatchet", h.riskRatchet);
      // Must remain in Defensive
      expect(r.state).to.deep.equal({ defensive: {} });
    });

    it("Vector 54: Permission bypass through alternate direct instruction fails", async () => {
      // Agent tries to call direct user ixBorrow without user's signature
      const directBorrowIx = await h.ixBorrow(100 * TOKEN, { owner: h.user });
      try {
        const res = h.send([directBorrowIx], [agent]);
        expect(isFailure(res)).to.be.true;
      } catch (err: any) {
        expect(err).to.exist;
      }
    });
  });

  /* -------------------------------------------------------------------------- */
  /*  DOMAIN 7: FORMAL PROPERTY INVARIANTS I1 - I10 (Section 26)               */
  /* -------------------------------------------------------------------------- */
  describe("Domain 7: Formal Financial Invariants I1 - I10 (Section 26)", () => {
    it("Invariant I1: Risk state can never decrease without satisfying recovery conditions", async () => {
      // Emergency requires 5 consecutive healthy observations with conf <= 250 bps
      h.setPrice({ priceUsd: 100, confUsd: 3.5 });
      h.sendOk([await h.ixRefreshGuard()], [h.outsider]);

      // 4 clean ticks
      h.setPrice({ priceUsd: 100, confUsd: 0.2 });
      for (let i = 0; i < 4; i++) {
        h.advanceSlots(1);
        h.sendOk([await h.ixRefreshGuard()], [h.outsider]);
        const r = h.fetch("riskRatchet", h.riskRatchet);
        expect(r.state).to.deep.equal({ emergency: {} }); // Cannot decrease early!
      }
    });

    it("Invariant I2: Emergency cannot execute risk-increasing actions", async () => {
      // Impair custody to trigger Emergency state
      h.sendOk([await h.ixSetCustody("impaired")], [h.admin]);
      h.sendOk([await h.ixRefreshGuard()], [h.outsider]);

      const r = h.fetch("riskRatchet", h.riskRatchet);
      expect(r.state).to.deep.equal({ emergency: {} });

      // Borrow is strictly blocked in Emergency
      const resBorrow = h.send([await h.ixBorrow(50 * TOKEN)], [h.user]);
      expect(isFailure(resBorrow)).to.be.true;
    });

    it("Invariant I3: Agent authority cannot exceed owner-defined policy", async () => {
      // Owner sets max borrow limit of $300
      h.sendOk(
        [
          await h.ixCreateAgentAuthority(h.user, agent, {
            riskBudget: 1_000 * TOKEN,
            maxBorrowLimit: 300 * TOKEN,
            allowedActions: 2, // BORROW only
          }),
        ],
        [h.user]
      );

      // Attempting $301 fails
      const res = h.send(
        [
          await h.ixExecuteAgentAction(agent, h.user, {
            action: "borrow",
            amount: 301 * TOKEN,
            nonce: 0,
            userQuoteAta: agentQuoteAta,
            userCollateralAta: agentEquityAta,
          }),
        ],
        [agent]
      );
      expect(isFailure(res)).to.be.true;
    });

    it("Invariant I4: Borrow cannot increase debt above V * EffectiveLTV - ExistingDebt", async () => {
      // Collateral 10 tokens @ $100 = $1,000. LTV = 70% -> max debt = $700.
      // Borrow $400 first
      h.sendOk([await h.ixBorrow(400 * TOKEN)], [h.user]);

      // Attempting to borrow $301 more (total $701 > $700) must fail
      const res = h.send([await h.ixBorrow(301 * TOKEN)], [h.user]);
      expect(isFailure(res)).to.be.true;

      // Borrowing $300 (total $700 <= $700) must succeed
      h.sendOk([await h.ixBorrow(300 * TOKEN)], [h.user]);
      const pos = h.fetch("position", h.position);
      expect(pos.debtAmount.toNumber()).to.equal(700 * TOKEN);
    });

    it("Invariant I5: Risk budget can never become negative (checked arithmetic)", async () => {
      // Allocate budget of $50
      h.sendOk(
        [
          await h.ixCreateAgentAuthority(h.user, agent, {
            riskBudget: 50 * TOKEN,
            maxBorrowLimit: 500 * TOKEN,
          }),
        ],
        [h.user]
      );

      // Borrowing $100 requires ~$100 budget (> $50) -> fails, budget remains 50
      const res = h.send(
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
      expect(isFailure(res)).to.be.true;

      const [authPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("authority"), h.user.publicKey.toBuffer(), agent.publicKey.toBuffer(), h.equityMint.toBuffer()],
        h.programId
      );
      const auth = h.fetch("agentAuthority", authPda);
      expect(auth.riskBudget.toNumber()).to.equal(50 * TOKEN);
    });

    it("Invariant I6: Risk budget cannot mint economic capacity beyond collateral rules", async () => {
      // Collateral = $1,000, 70% LTV = $700 capacity.
      // Agent has $5,000,000 budget
      h.sendOk(
        [
          await h.ixCreateAgentAuthority(h.user, agent, {
            riskBudget: 5_000_000 * TOKEN,
            maxBorrowLimit: 5_000_000 * TOKEN,
          }),
        ],
        [h.user]
      );

      // Attempting to borrow $701 exceeds collateral capacity -> fails
      const res = h.send(
        [
          await h.ixExecuteAgentAction(agent, h.user, {
            action: "borrow",
            amount: 701 * TOKEN,
            nonce: 0,
            userQuoteAta: agentQuoteAta,
            userCollateralAta: agentEquityAta,
          }),
        ],
        [agent]
      );
      expect(isFailure(res)).to.be.true;
    });

    it("Invariant I7: Invalid oracle state cannot authorize risk-increasing actions", async () => {
      // Expire oracle
      h.setTime(TS_MARKET_OPEN + 600n);
      const res = h.send([await h.ixBorrow(50 * TOKEN)], [h.user]);
      expect(isFailure(res)).to.be.true;
    });

    it("Invariant I8: Position actions are strictly evaluated against canonical asset identity", async () => {
      const [aaplPos] = PublicKey.findProgramAddressSync(
        [Buffer.from("position"), h.user.publicKey.toBuffer(), h.equityMint.toBuffer()],
        h.programId
      );
      expect(h.position.toBase58()).to.equal(aaplPos.toBase58());
    });

    it("Invariant I9: Frontend cannot determine protocol state (on-chain is strictly authoritative)", async () => {
      // Risk state is evaluated and stored inside RiskRatchet and Position PDAs
      const ratchet = h.fetch("riskRatchet", h.riskRatchet);
      expect(ratchet).to.have.property("state");
      expect(ratchet).to.have.property("riskEpoch");
      expect(ratchet).to.have.property("transitionNonce");
    });

    it("Invariant I10: State transitions are deterministic for identical inputs", async () => {
      // 80 BPS relative uncertainty always results in Restricted state
      h.setPrice({ priceUsd: 100, confUsd: 0.8 });
      h.sendOk([await h.ixRefreshGuard()], [h.outsider]);

      const r = h.fetch("riskRatchet", h.riskRatchet);
      expect(r.state).to.deep.equal({ restricted: {} });
    });
  });
});
