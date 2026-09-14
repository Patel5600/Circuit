import { expect, assert } from "chai";
import { PublicKey, Keypair } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import {
  setupHarness,
  Harness,
  TOKEN,
  expectAnchorError,
  expectFailure,
  isFailure,
} from "./helpers/harness";

describe("Protocol Economics & Treasury Invariant Tests", () => {
  let h: Harness;
  const TREASURY_PUBKEY = new PublicKey("7AALMsZ5MuioSW7BMwBCwTmy9Y1fMJ6MKXAELYyrtb4");

  beforeEach(async () => {
    h = await setupHarness();
    // Bootstrap protocol: initialize, register asset, fund liquidity vault with $100k
    await h.bootstrapProtocol(100_000);
    // User deposits 10 equity tokens (at $100/token = $1,000 collateral)
    h.sendOk([await h.ixDeposit(10 * TOKEN)], [h.user]);
  });

  it("1. Verifies ProtocolConfig initializes with default treasury and 25 bps fee", async () => {
    const config = h.fetch<any>("ProtocolConfig", h.protocolConfig);
    expect(config.feeRecipient.toBase58()).to.equal(TREASURY_PUBKEY.toBase58());
    expect(config.borrowFeeBps.toNumber()).to.equal(25); // 0.25%
    expect(config.feeEnabled).to.be.true;
  });

  it("2. Settles credit execution fee to treasury and disburses net amount to borrower", async () => {
    // Borrow $500 USDC against $1,000 collateral (within 70% base LTV limit)
    // Borrow amount = 500 * 10^6 native units
    // Fee = 500 * 0.0025 = 1.25 USDC (1_250_000 native)
    // Net disbursed to user = 498.75 USDC (498_750_000 native)
    // Debt recorded on position = 500 USDC (500_000_000 native)
    const borrowAmt = 500 * TOKEN;
    const expectedFee = BigInt(Math.floor((500 * TOKEN * 25) / 10_000)); // 1_250_000n
    const expectedNet = BigInt(borrowAmt) - expectedFee; // 498_750_000n

    const userQuoteBefore = h.tokenBalance(h.userQuoteAta);
    const treasuryQuoteBefore = h.tokenBalance(h.treasuryQuoteAta);

    h.sendOk([await h.ixBorrow(borrowAmt)], [h.user]);

    const userQuoteAfter = h.tokenBalance(h.userQuoteAta);
    const treasuryQuoteAfter = h.tokenBalance(h.treasuryQuoteAta);

    // Assert token balances changed by exact calculated amounts
    expect(userQuoteAfter - userQuoteBefore).to.equal(expectedNet);
    expect(treasuryQuoteAfter - treasuryQuoteBefore).to.equal(expectedFee);

    // Position records the gross debt obligation
    const pos = h.fetch<any>("Position", h.position);
    expect(pos.debtAmount.toNumber()).to.equal(borrowAmt);
  });

  it("3. Unsafe action invariant: Blocked borrow generates strictly $0.00 fee", async () => {
    const treasuryQuoteBefore = h.tokenBalance(h.treasuryQuoteAta);

    // Scenario A: Attempt borrow exceeding LTV capacity ($800 borrow against $1000 collateral at 70% max)
    const resOverLtv = h.send([await h.ixBorrow(800 * TOKEN)], [h.user]);
    expect(isFailure(resOverLtv)).to.be.true;
    expectAnchorError(resOverLtv, "BorrowExceedsCapacity");
    expect(h.tokenBalance(h.treasuryQuoteAta)).to.equal(treasuryQuoteBefore);

    // Scenario B: Attempt borrow when market is closed
    h.setTime(1_700_000_000n + 86400n * 6n); // Move clock to weekend
    h.setPrice({ priceUsd: 100 }); // fresh oracle price at new clock
    const resClosed = h.send([await h.ixBorrow(100 * TOKEN)], [h.user]);
    expect(isFailure(resClosed)).to.be.true;
    expectAnchorError(resClosed, "MarketClosed");
    expect(h.tokenBalance(h.treasuryQuoteAta)).to.equal(treasuryQuoteBefore);

    // Scenario C: Attempt borrow when oracle confidence is blown (> 100 bps)
    h.setTime(1_700_000_000n + 3600n * 14n + 1800n); // Normal market hours
    h.setPrice({ priceUsd: 100, confUsd: 5 }); // 5% confidence > max 1%
    const resWideConf = h.send([await h.ixBorrow(100 * TOKEN)], [h.user]);
    expect(isFailure(resWideConf)).to.be.true;
    expectAnchorError(resWideConf, "ConfidenceTooWide");
    expect(h.tokenBalance(h.treasuryQuoteAta)).to.equal(treasuryQuoteBefore);

    // Scenario D: Attempt borrow when protocol is paused
    h.setPrice({ priceUsd: 100, confUsd: 0.1 });
    h.sendOk([await h.ixPause()], [h.admin]);
    const resPaused = h.send([await h.ixBorrow(100 * TOKEN)], [h.user]);
    expect(isFailure(resPaused)).to.be.true;
    expectAnchorError(resPaused, "ProtocolPaused");
    expect(h.tokenBalance(h.treasuryQuoteAta)).to.equal(treasuryQuoteBefore);
  });

  it("4. Zero fee policy when fee_enabled is false or borrow_fee_bps is 0", async () => {
    // Disable fee via admin
    h.sendOk(
      [await h.ixUpdateFeeConfig(TREASURY_PUBKEY, 25, false)],
      [h.admin]
    );

    const userQuoteBefore = h.tokenBalance(h.userQuoteAta);
    const treasuryQuoteBefore = h.tokenBalance(h.treasuryQuoteAta);

    const borrowAmt = 200 * TOKEN;
    h.sendOk([await h.ixBorrow(borrowAmt)], [h.user]);

    const userQuoteAfter = h.tokenBalance(h.userQuoteAta);
    const treasuryQuoteAfter = h.tokenBalance(h.treasuryQuoteAta);

    // Borrower receives 100% of gross borrow with zero deduction
    expect(userQuoteAfter - userQuoteBefore).to.equal(BigInt(borrowAmt));
    expect(treasuryQuoteAfter).to.equal(treasuryQuoteBefore);
  });

  it("5. Rejects fee recipient substitution: Attacker cannot redirect protocol fee", async () => {
    const attacker = Keypair.generate();
    h.svm.airdrop(attacker.publicKey, 1_000_000_000n);
    const attackerQuoteAta = getAssociatedTokenAddressSync(h.quoteMint, attacker.publicKey);
    h.sendOk(
      [
        createAssociatedTokenAccountInstruction(
          h.admin.publicKey,
          attackerQuoteAta,
          attacker.publicKey,
          h.quoteMint
        ),
      ],
      [h.admin]
    );

    // Attempt borrow passing attackerQuoteAta as treasury_quote_ata
    const ix = await h.ixBorrow(100 * TOKEN, {
      treasuryQuoteAta: attackerQuoteAta,
    });

    const res = h.send([ix], [h.user]);
    expect(isFailure(res)).to.be.true;
    expectAnchorError(res, "InvalidFeeRecipient");
  });

  it("6. Admin access control: Non-admin cannot mutate fee configuration", async () => {
    const attacker = Keypair.generate();
    h.svm.airdrop(attacker.publicKey, 1_000_000_000n);

    const res = h.send(
      [await h.ixUpdateFeeConfig(attacker.publicKey, 50, true, attacker)],
      [attacker]
    );
    expect(isFailure(res)).to.be.true;
    expectAnchorError(res, "Unauthorized");
  });

  it("7. Safety cap invariant: Cannot configure borrow fee exceeding 1,000 BPS (10%)", async () => {
    // Attempt to set fee to 1,001 BPS (> 1,000 max)
    const res = h.send(
      [await h.ixUpdateFeeConfig(TREASURY_PUBKEY, 1001, true, h.admin)],
      [h.admin]
    );
    expect(isFailure(res)).to.be.true;
    expectAnchorError(res, "FeeBpsExceedsMaximum");
  });
});
