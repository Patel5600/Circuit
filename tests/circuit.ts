import { assert } from "chai";
import { createMintToInstruction } from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";

import {
  setupHarness,
  Harness,
  expectAnchorError,
  expectFailure,
  isFailure,
  logsOf,
  errOf,
  TOKEN,
  BASE_LTV_BPS,
  LIQ_THRESHOLD_BPS,
  LIQ_BONUS_BPS,
  MIN_HEALTH_FACTOR_BPS,
  MAX_ORACLE_AGE,
  MAX_CONF_BPS,
  FEED_ID_HEX,
  WRONG_FEED_ID_HEX,
  TS_MARKET_OPEN,
  TS_WEEKEND,
  TS_HOLIDAY,
  TS_AFTER_CLOSE,
} from "./helpers/harness";

/**
 * Circuit Protocol integration suite - 16 scenarios.
 *
 * Runs against LiteSVM so the NYSE session clock and the Pyth price account are
 * both controllable. See tests/helpers/harness.ts for why that is a hard
 * requirement rather than a convenience.
 *
 * Fixed economics used throughout:
 *   collateral      10 equity tokens (6 decimals)
 *   price           $100 at expo -8          => collateral value $1,000
 *   base LTV        7000 bps (70%)           => borrow capacity   $700
 *   liq threshold   8000 bps (80%)
 *   min health      10000 bps (1.0)
 *   liq bonus       500 bps (5%)
 */

const COLLATERAL = 10 * TOKEN; // 10 tokens
const COLLATERAL_VALUE = 1_000 * TOKEN; // $1,000 at $100/token
const CAPACITY = 700 * TOKEN; // 70% of $1,000

describe("Circuit Protocol", () => {
  // -----------------------------------------------------------------------
  // Scenario 1 - Protocol initialization
  // -----------------------------------------------------------------------
  describe("1. protocol initialization", () => {
    let h: Harness;
    before(async () => {
      h = await setupHarness();
    });

    it("stores the supplied configuration and defaults to unpaused", async () => {
      h.sendOk([await h.ixInitializeProtocol()], [h.admin]);

      const cfg = h.fetch<any>("ProtocolConfig", h.protocolConfig);
      assert.equal(cfg.authority.toBase58(), h.admin.publicKey.toBase58());
      assert.equal(cfg.paused, false);
      assert.equal(cfg.version, 1);
      assert.equal(cfg.minHealthFactorBps.toNumber(), MIN_HEALTH_FACTOR_BPS);
      assert.equal(cfg.defaultMaxOracleAge.toNumber(), MAX_ORACLE_AGE);
      assert.equal(cfg.defaultMaxConfBps.toNumber(), MAX_CONF_BPS);
      assert.equal(cfg.liquidationBonusBps.toNumber(), LIQ_BONUS_BPS);
    });

    it("cannot be initialized twice (PDA already in use)", async () => {
      const res = h.send([await h.ixInitializeProtocol()], [h.admin]);
      expectFailure(res, "re-initializing the protocol singleton");
    });

    it("rejects a zero minimum health factor", async () => {
      const fresh = await setupHarness();
      const res = fresh.send(
        [await fresh.ixInitializeProtocol(fresh.admin, { minHealthFactorBps: 0 })],
        [fresh.admin]
      );
      expectAnchorError(res, "HealthFactorTooLow");
    });

    it("rejects a confidence bound above 100%", async () => {
      const fresh = await setupHarness();
      const res = fresh.send(
        [await fresh.ixInitializeProtocol(fresh.admin, { maxConfBps: 10_001 })],
        [fresh.admin]
      );
      expectAnchorError(res, "ConfidenceTooWide");
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 2 - Asset registration and risk parameter validation
  // -----------------------------------------------------------------------
  describe("2. asset registration", () => {
    let h: Harness;
    beforeEach(async () => {
      h = await setupHarness();
      h.sendOk([await h.ixInitializeProtocol()], [h.admin]);
    });

    it("creates AssetConfig, MarketGuard and both protocol vaults", async () => {
      h.sendOk([await h.ixRegisterAsset()], [h.admin]);

      const asset = h.fetch<any>("AssetConfig", h.assetConfig);
      assert.equal(asset.mint.toBase58(), h.equityMint.toBase58());
      assert.equal(asset.quoteMint.toBase58(), h.quoteMint.toBase58());
      assert.equal(Buffer.from(asset.pythFeedId).toString("hex"), FEED_ID_HEX);
      assert.equal(asset.baseLtvBps.toNumber(), BASE_LTV_BPS);
      assert.equal(asset.liquidationThresholdBps.toNumber(), LIQ_THRESHOLD_BPS);
      assert.equal(asset.enabled, true);
      assert.property(asset.custodyState, "healthy");
      assert.property(asset.liquidityState, "deep");

      // Vaults exist and are empty.
      assert.equal(h.tokenBalance(h.collateralVault), 0n);
      assert.equal(h.tokenBalance(h.liquidityVault), 0n);
    });

    it("opens the MarketGuard in Emergency until the first refresh", async () => {
      h.sendOk([await h.ixRegisterAsset()], [h.admin]);

      const guard = h.fetch<any>("MarketGuard", h.marketGuard);
      assert.property(guard.marketState, "emergency");
      assert.property(guard.reason, "invalidPrice");
      assert.equal(guard.lastValidPrice.toNumber(), 0);
      assert.equal(guard.lastCheckedSlot.toNumber(), 0);
    });

    it("requires the liquidation threshold to exceed base LTV", async () => {
      const res = h.send(
        [
          await h.ixRegisterAsset(h.admin, {
            baseLtvBps: 8_000,
            liquidationThresholdBps: 8_000,
          }),
        ],
        [h.admin]
      );
      expectAnchorError(res, "MathOverflow");
    });

    it("rejects a zero oracle staleness bound", async () => {
      const res = h.send(
        [await h.ixRegisterAsset(h.admin, { maxOracleAge: 0 })],
        [h.admin]
      );
      expectAnchorError(res, "InvalidTimestamp");
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 3 - Admin-only authorization
  // -----------------------------------------------------------------------
  describe("3. admin authorization", () => {
    let h: Harness;
    beforeEach(async () => {
      h = await setupHarness();
      await h.bootstrapProtocol();
    });

    it("rejects register_asset from a non-authority", async () => {
      const fresh = await setupHarness();
      fresh.sendOk([await fresh.ixInitializeProtocol()], [fresh.admin]);
      const res = fresh.send(
        [await fresh.ixRegisterAsset(fresh.outsider)],
        [fresh.outsider]
      );
      expectFailure(res, "non-admin register_asset");
    });

    it("rejects pause from a non-authority", async () => {
      const res = h.send([await h.ixPause(h.outsider)], [h.outsider]);
      expectAnchorError(res, "Unauthorized");
    });

    it("rejects set_custody_state from a non-authority", async () => {
      const res = h.send(
        [await h.ixSetCustody("impaired", h.outsider)],
        [h.outsider]
      );
      expectAnchorError(res, "Unauthorized");
    });

    it("rejects set_liquidity_state from a non-authority", async () => {
      const res = h.send(
        [await h.ixSetLiquidity("critical", h.outsider)],
        [h.outsider]
      );
      expectAnchorError(res, "Unauthorized");
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 4 - Deposit
  // -----------------------------------------------------------------------
  describe("4. deposit", () => {
    let h: Harness;
    beforeEach(async () => {
      h = await setupHarness();
      await h.bootstrapProtocol();
    });

    it("creates the position and moves collateral into the vault", async () => {
      const before = h.tokenBalance(h.userEquityAta);
      h.sendOk([await h.ixDeposit(COLLATERAL)], [h.user]);

      const pos = h.fetch<any>("Position", h.position);
      assert.equal(pos.owner.toBase58(), h.user.publicKey.toBase58());
      assert.equal(pos.asset.toBase58(), h.equityMint.toBase58());
      assert.equal(pos.collateralAmount.toString(), String(COLLATERAL));
      assert.equal(pos.debtAmount.toNumber(), 0);
      assert.property(pos.state, "healthy");

      assert.equal(h.tokenBalance(h.collateralVault), BigInt(COLLATERAL));
      assert.equal(h.tokenBalance(h.userEquityAta), before - BigInt(COLLATERAL));
    });

    it("accumulates across repeated deposits", async () => {
      h.sendOk([await h.ixDeposit(COLLATERAL)], [h.user]);
      h.sendOk([await h.ixDeposit(COLLATERAL)], [h.user]);

      const pos = h.fetch<any>("Position", h.position);
      assert.equal(pos.collateralAmount.toString(), String(2 * COLLATERAL));
    });

    it("rejects a zero-amount deposit", async () => {
      const res = h.send([await h.ixDeposit(0)], [h.user]);
      expectAnchorError(res, "InsufficientCollateral");
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 5 - Borrow happy path
  // -----------------------------------------------------------------------
  describe("5. borrow happy path", () => {
    let h: Harness;
    beforeEach(async () => {
      h = await setupHarness();
      await h.bootstrapProtocol();
      h.sendOk([await h.ixDeposit(COLLATERAL)], [h.user]);
    });

    it("lends against collateral and records an exact health factor", async () => {
      const res = h.sendOk([await h.ixBorrow(500 * TOKEN)], [h.user]);

      // HF = collateral_value * liq_threshold / debt
      //    = 1000 * 0.80 / 500 = 1.6 => 16000 bps
      assert.include(logsOf(res).join("\n"), "HF: 16000 BPS");

      const pos = h.fetch<any>("Position", h.position);
      assert.equal(pos.debtAmount.toString(), String(500 * TOKEN));
      assert.equal(pos.lastValidPrice.toString(), "10000000000");
      assert.equal(pos.lastValidExpo, -8);

      assert.equal(h.tokenBalance(h.userQuoteAta), BigInt(500 * TOKEN));
    });

    it("permits borrowing exactly at LTV capacity", async () => {
      const res = h.sendOk([await h.ixBorrow(CAPACITY)], [h.user]);
      // HF = 1000 * 0.80 / 700 = 1.1428 => 11428 bps
      assert.include(logsOf(res).join("\n"), "HF: 11428 BPS");

      const pos = h.fetch<any>("Position", h.position);
      assert.equal(pos.debtAmount.toString(), String(CAPACITY));
    });

    it("rejects a zero-amount borrow", async () => {
      const res = h.send([await h.ixBorrow(0)], [h.user]);
      expectAnchorError(res, "BorrowExceedsCapacity");
    });

    it("rejects an outsider borrowing against another user's position", async () => {
      // The outsider signs correctly for itself but points the instruction at
      // the victim's position PDA. Because the Position seeds bind to the
      // signing owner, Anchor's seeds constraint must reject this.
      const ix = await h.ixBorrow(1 * TOKEN, {
        owner: h.outsider,
        position: h.position, // victim's position
        userQuoteAta: h.outsiderQuoteAta,
      });
      const res = h.send([ix], [h.outsider]);
      expectFailure(res, "outsider borrowing against another user's position");

      // The victim's position is untouched.
      const pos = h.fetch<any>("Position", h.position);
      assert.equal(pos.debtAmount.toNumber(), 0);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 6 - Borrow capacity limit
  // -----------------------------------------------------------------------
  describe("6. borrow capacity", () => {
    let h: Harness;
    beforeEach(async () => {
      h = await setupHarness();
      await h.bootstrapProtocol();
      h.sendOk([await h.ixDeposit(COLLATERAL)], [h.user]);
    });

    it("rejects one native unit beyond capacity", async () => {
      const res = h.send([await h.ixBorrow(CAPACITY + 1)], [h.user]);
      expectAnchorError(res, "BorrowExceedsCapacity");
    });

    it("enforces capacity cumulatively across borrows", async () => {
      h.sendOk([await h.ixBorrow(400 * TOKEN)], [h.user]);
      // 400 already drawn; 301 more would exceed the 700 capacity.
      const res = h.send([await h.ixBorrow(301 * TOKEN)], [h.user]);
      expectAnchorError(res, "BorrowExceedsCapacity");

      // 300 more lands exactly at capacity.
      h.sendOk([await h.ixBorrow(300 * TOKEN)], [h.user]);
      const pos = h.fetch<any>("Position", h.position);
      assert.equal(pos.debtAmount.toString(), String(CAPACITY));
    });

    it("rejects a borrow the liquidity vault cannot fund", async () => {
      const fresh = await setupHarness();
      // Seed only $10 of lendable liquidity.
      await fresh.bootstrapProtocol(10);
      fresh.sendOk([await fresh.ixDeposit(COLLATERAL)], [fresh.user]);

      const res = fresh.send([await fresh.ixBorrow(100 * TOKEN)], [fresh.user]);
      expectAnchorError(res, "InsufficientLiquidity");
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 7 - Reference market session gate
  // -----------------------------------------------------------------------
  describe("7. reference market session gate", () => {
    let h: Harness;
    beforeEach(async () => {
      h = await setupHarness();
      await h.bootstrapProtocol();
      h.sendOk([await h.ixDeposit(COLLATERAL)], [h.user]);
    });

    it("blocks borrowing at the weekend", async () => {
      h.setTime(TS_WEEKEND);
      h.setPrice({ priceUsd: 100 }); // fresh at the new clock
      const res = h.send([await h.ixBorrow(100 * TOKEN)], [h.user]);
      expectAnchorError(res, "MarketClosed");
    });

    it("blocks borrowing on an observed NYSE holiday", async () => {
      h.setTime(TS_HOLIDAY); // MLK Day 2026-01-19
      h.setPrice({ priceUsd: 100 });
      const res = h.send([await h.ixBorrow(100 * TOKEN)], [h.user]);
      expectAnchorError(res, "MarketClosed");
    });

    it("blocks borrowing after the 16:00 ET close", async () => {
      h.setTime(TS_AFTER_CLOSE); // 16:30 ET on a weekday
      h.setPrice({ priceUsd: 100 });
      const res = h.send([await h.ixBorrow(100 * TOKEN)], [h.user]);
      expectAnchorError(res, "MarketClosed");
    });

    it("allows borrowing during the regular session", async () => {
      h.setTime(TS_MARKET_OPEN);
      h.setPrice({ priceUsd: 100 });
      h.sendOk([await h.ixBorrow(100 * TOKEN)], [h.user]);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 8 - Oracle staleness
  // -----------------------------------------------------------------------
  describe("8. oracle staleness", () => {
    let h: Harness;
    beforeEach(async () => {
      h = await setupHarness();
      await h.bootstrapProtocol();
      h.sendOk([await h.ixDeposit(COLLATERAL)], [h.user]);
    });

    it("rejects a price older than max_oracle_age", async () => {
      h.setPrice({
        priceUsd: 100,
        publishTime: h.now() - BigInt(MAX_ORACLE_AGE + 10),
      });
      const res = h.send([await h.ixBorrow(100 * TOKEN)], [h.user]);
      expectAnchorError(res, "StaleOracle");
    });

    it("accepts a price inside the staleness window", async () => {
      h.setPrice({
        priceUsd: 100,
        publishTime: h.now() - BigInt(MAX_ORACLE_AGE - 5),
      });
      h.sendOk([await h.ixBorrow(100 * TOKEN)], [h.user]);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 9 - Oracle confidence width
  // -----------------------------------------------------------------------
  describe("9. oracle confidence width", () => {
    let h: Harness;
    beforeEach(async () => {
      h = await setupHarness();
      await h.bootstrapProtocol();
      h.sendOk([await h.ixDeposit(COLLATERAL)], [h.user]);
    });

    it("rejects confidence wider than max_conf_bps", async () => {
      // $2 on $100 = 200 bps, above the 100 bps bound.
      h.setPrice({ priceUsd: 100, confUsd: 2 });
      const res = h.send([await h.ixBorrow(100 * TOKEN)], [h.user]);
      expectAnchorError(res, "ConfidenceTooWide");
    });

    it("accepts confidence at the bound", async () => {
      // $1 on $100 = exactly 100 bps.
      h.setPrice({ priceUsd: 100, confUsd: 1 });
      h.sendOk([await h.ixBorrow(100 * TOKEN)], [h.user]);
    });

    it("rejects a non-positive price", async () => {
      h.setPrice({ price: 0n, conf: 0n });
      const res = h.send([await h.ixBorrow(100 * TOKEN)], [h.user]);
      expectFailure(res, "zero oracle price");
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 10 - Oracle identity binding
  // -----------------------------------------------------------------------
  describe("10. oracle identity binding", () => {
    let h: Harness;
    beforeEach(async () => {
      h = await setupHarness();
      await h.bootstrapProtocol();
      h.sendOk([await h.ixDeposit(COLLATERAL)], [h.user]);
    });

    it("rejects a price update for a different feed id", async () => {
      h.setPrice({ priceUsd: 100, feedIdHex: WRONG_FEED_ID_HEX });
      const res = h.send([await h.ixBorrow(100 * TOKEN)], [h.user]);
      expectAnchorError(res, "StaleOracle");
    });

    it("rejects a price account not owned by the Pyth receiver", async () => {
      h.setPrice({ priceUsd: 100, owner: h.programId });
      const res = h.send([await h.ixBorrow(100 * TOKEN)], [h.user]);
      expectFailure(res, "price account with the wrong owner");
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 11 - Custody state gating
  // -----------------------------------------------------------------------
  describe("11. custody state gating", () => {
    let h: Harness;
    beforeEach(async () => {
      h = await setupHarness();
      await h.bootstrapProtocol();
      h.sendOk([await h.ixDeposit(COLLATERAL)], [h.user]);
    });

    it("blocks borrowing when custody is impaired", async () => {
      h.sendOk([await h.ixSetCustody("impaired")], [h.admin]);
      const asset = h.fetch<any>("AssetConfig", h.assetConfig);
      assert.property(asset.custodyState, "impaired");

      const res = h.send([await h.ixBorrow(100 * TOKEN)], [h.user]);
      expectAnchorError(res, "InvalidCustodyState");
    });

    it("still allows borrowing when custody is only delayed", async () => {
      h.sendOk([await h.ixSetCustody("delayed")], [h.admin]);
      h.sendOk([await h.ixBorrow(100 * TOKEN)], [h.user]);
    });

    it("restores borrowing once custody returns to healthy", async () => {
      h.sendOk([await h.ixSetCustody("impaired")], [h.admin]);
      expectAnchorError(
        h.send([await h.ixBorrow(100 * TOKEN)], [h.user]),
        "InvalidCustodyState"
      );

      h.sendOk([await h.ixSetCustody("healthy")], [h.admin]);
      h.sendOk([await h.ixBorrow(100 * TOKEN)], [h.user]);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 12 - Liquidity state gating
  // -----------------------------------------------------------------------
  describe("12. liquidity state gating", () => {
    let h: Harness;
    beforeEach(async () => {
      h = await setupHarness();
      await h.bootstrapProtocol();
      h.sendOk([await h.ixDeposit(COLLATERAL)], [h.user]);
    });

    it("blocks borrowing when liquidity is thin", async () => {
      h.sendOk([await h.ixSetLiquidity("thin")], [h.admin]);
      const res = h.send([await h.ixBorrow(100 * TOKEN)], [h.user]);
      expectAnchorError(res, "InvalidLiquidityState");
    });

    it("blocks borrowing when liquidity is critical", async () => {
      h.sendOk([await h.ixSetLiquidity("critical")], [h.admin]);
      const res = h.send([await h.ixBorrow(100 * TOKEN)], [h.user]);
      expectAnchorError(res, "InvalidLiquidityState");
    });

    it("allows borrowing at normal liquidity", async () => {
      h.sendOk([await h.ixSetLiquidity("normal")], [h.admin]);
      h.sendOk([await h.ixBorrow(100 * TOKEN)], [h.user]);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 13 - Pause semantics
  // -----------------------------------------------------------------------
  describe("13. pause semantics", () => {
    let h: Harness;
    beforeEach(async () => {
      h = await setupHarness();
      await h.bootstrapProtocol();
      h.sendOk([await h.ixDeposit(COLLATERAL)], [h.user]);
      h.sendOk([await h.ixBorrow(500 * TOKEN)], [h.user]);
      h.sendOk([await h.ixPause()], [h.admin]);
    });

    it("marks the protocol paused", () => {
      const cfg = h.fetch<any>("ProtocolConfig", h.protocolConfig);
      assert.equal(cfg.paused, true);
    });

    it("blocks borrowing while paused", async () => {
      const res = h.send([await h.ixBorrow(10 * TOKEN)], [h.user]);
      expectAnchorError(res, "ProtocolPaused");
    });

    it("blocks withdrawing while paused", async () => {
      const res = h.send([await h.ixWithdraw(1 * TOKEN)], [h.user]);
      expectAnchorError(res, "ProtocolPaused");
    });

    it("still allows depositing while paused (risk reducing)", async () => {
      h.sendOk([await h.ixDeposit(1 * TOKEN)], [h.user]);
    });

    it("still allows repaying while paused (must not trap funds)", async () => {
      h.sendOk([await h.ixRepay(100 * TOKEN)], [h.user]);
      const pos = h.fetch<any>("Position", h.position);
      assert.equal(pos.debtAmount.toString(), String(400 * TOKEN));
    });

    it("rejects double pause and restores service on unpause", async () => {
      expectAnchorError(h.send([await h.ixPause()], [h.admin]), "ProtocolPaused");

      h.sendOk([await h.ixUnpause()], [h.admin]);
      h.sendOk([await h.ixBorrow(10 * TOKEN)], [h.user]);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 14 - Repay
  // -----------------------------------------------------------------------
  describe("14. repay", () => {
    let h: Harness;
    beforeEach(async () => {
      h = await setupHarness();
      await h.bootstrapProtocol();
      h.sendOk([await h.ixDeposit(COLLATERAL)], [h.user]);
      h.sendOk([await h.ixBorrow(500 * TOKEN)], [h.user]);
    });

    it("reduces debt and returns tokens to the liquidity vault", async () => {
      const vaultBefore = h.tokenBalance(h.liquidityVault);
      h.sendOk([await h.ixRepay(200 * TOKEN)], [h.user]);

      const pos = h.fetch<any>("Position", h.position);
      assert.equal(pos.debtAmount.toString(), String(300 * TOKEN));
      assert.equal(
        h.tokenBalance(h.liquidityVault),
        vaultBefore + BigInt(200 * TOKEN)
      );
    });

    it("clears the debt entirely", async () => {
      h.sendOk([await h.ixRepay(500 * TOKEN)], [h.user]);
      const pos = h.fetch<any>("Position", h.position);
      assert.equal(pos.debtAmount.toNumber(), 0);
      assert.property(pos.state, "healthy");
    });

    it("rejects repaying more than the outstanding debt", async () => {
      const res = h.send([await h.ixRepay(500 * TOKEN + 1)], [h.user]);
      expectAnchorError(res, "RepayExceedsDebt");
    });

    it("rejects a zero-amount repay", async () => {
      const res = h.send([await h.ixRepay(0)], [h.user]);
      expectAnchorError(res, "BorrowExceedsCapacity");
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 15 - Withdraw
  // -----------------------------------------------------------------------
  describe("15. withdraw", () => {
    let h: Harness;
    beforeEach(async () => {
      h = await setupHarness();
      await h.bootstrapProtocol();
      h.sendOk([await h.ixDeposit(COLLATERAL)], [h.user]);
    });

    it("returns collateral freely when there is no debt", async () => {
      const before = h.tokenBalance(h.userEquityAta);
      h.sendOk([await h.ixWithdraw(COLLATERAL)], [h.user]);

      const pos = h.fetch<any>("Position", h.position);
      assert.equal(pos.collateralAmount.toNumber(), 0);
      assert.equal(h.tokenBalance(h.userEquityAta), before + BigInt(COLLATERAL));
      assert.equal(h.tokenBalance(h.collateralVault), 0n);
    });

    it("rejects withdrawing more collateral than deposited", async () => {
      const res = h.send([await h.ixWithdraw(COLLATERAL + 1)], [h.user]);
      expectAnchorError(res, "WithdrawExceedsCollateral");
    });

    it("enforces the health factor when debt is outstanding", async () => {
      h.sendOk([await h.ixBorrow(500 * TOKEN)], [h.user]);

      // Removing 6 of 10 tokens leaves $400 backing $500 of debt:
      // HF = 400 * 0.80 / 500 = 0.64 => 6400 bps, below the 10000 minimum.
      const res = h.send([await h.ixWithdraw(6 * TOKEN)], [h.user]);
      expectAnchorError(res, "HealthFactorTooLow");
    });

    it("allows a withdrawal that keeps the position healthy", async () => {
      h.sendOk([await h.ixBorrow(500 * TOKEN)], [h.user]);

      // Removing 3 tokens leaves $700 backing $500:
      // HF = 700 * 0.80 / 500 = 1.12 => 11200 bps, above the minimum.
      h.sendOk([await h.ixWithdraw(3 * TOKEN)], [h.user]);
      const pos = h.fetch<any>("Position", h.position);
      assert.equal(pos.collateralAmount.toString(), String(7 * TOKEN));
    });

    it("re-validates the market session when debt is outstanding", async () => {
      h.sendOk([await h.ixBorrow(500 * TOKEN)], [h.user]);
      h.setTime(TS_WEEKEND);
      h.setPrice({ priceUsd: 100 });

      const res = h.send([await h.ixWithdraw(1 * TOKEN)], [h.user]);
      expectAnchorError(res, "MarketClosed");
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 16 - Liquidation
  // -----------------------------------------------------------------------
  describe("16. liquidation", () => {
    let h: Harness;
    beforeEach(async () => {
      h = await setupHarness();
      await h.bootstrapProtocol();
      h.sendOk([await h.ixDeposit(COLLATERAL)], [h.user]);
      h.sendOk([await h.ixBorrow(CAPACITY)], [h.user]); // $700 against $1,000
    });

    it("rejects liquidating a healthy position", async () => {
      const res = h.send([await h.ixLiquidate()], [h.liquidator]);
      expectAnchorError(res, "NotLiquidatable");
    });

    it("rejects liquidating a position with no debt", async () => {
      h.sendOk([await h.ixRepay(CAPACITY)], [h.user]);
      const res = h.send([await h.ixLiquidate()], [h.liquidator]);
      expectAnchorError(res, "NotLiquidatable");
    });

    it("full-clears an unhealthy position and pays the liquidator a bonus", async () => {
      // Price falls to $80: collateral value $800 backing $700 of debt.
      // HF = 800 * 0.80 / 700 = 0.9142 => 9142 bps, below the 10000 minimum.
      h.setPrice({ priceUsd: 80 });

      const liqQuoteBefore = h.tokenBalance(h.liquidatorQuoteAta);
      const liqCollBefore = h.tokenBalance(h.liquidatorEquityAta);

      h.sendOk([await h.ixLiquidate()], [h.liquidator]);

      // debt_with_bonus = 700 * 1.05 = $735; at $80/token that is 9.1875 tokens.
      const expectedSeizure = BigInt(9_187_500);

      const pos = h.fetch<any>("Position", h.position);
      assert.equal(pos.debtAmount.toNumber(), 0, "debt fully cleared");
      assert.equal(
        pos.collateralAmount.toString(),
        String(BigInt(COLLATERAL) - expectedSeizure)
      );

      // Liquidator paid the debt and received the discounted collateral.
      assert.equal(
        h.tokenBalance(h.liquidatorQuoteAta),
        liqQuoteBefore - BigInt(CAPACITY)
      );
      assert.equal(
        h.tokenBalance(h.liquidatorEquityAta),
        liqCollBefore + expectedSeizure
      );
    });

    it("is permitted while the protocol is paused (solvency protection)", async () => {
      h.setPrice({ priceUsd: 80 });
      h.sendOk([await h.ixPause()], [h.admin]);
      h.sendOk([await h.ixLiquidate()], [h.liquidator]);

      const pos = h.fetch<any>("Position", h.position);
      assert.equal(pos.debtAmount.toNumber(), 0);
    });

    it("falls back to the frozen last-valid price when the oracle is unusable", async () => {
      // Current oracle says $80 (which alone would make the position
      // liquidatable) but it is stale, so validation fails and the protocol
      // must fall back to position.last_valid_price ($100 from the borrow).
      h.setPrice({
        priceUsd: 80,
        publishTime: h.now() - BigInt(MAX_ORACLE_AGE + 60),
      });

      const res = h.send([await h.ixLiquidate()], [h.liquidator]);
      const logs = logsOf(res).join("\n");

      assert.include(logs, "EMERGENCY: Using frozen last-valid price");

      // At the frozen $100 the position is healthy (HF 11428), so liquidation
      // is refused. This is the intended conservative outcome: an oracle outage
      // freezes liquidation rather than allowing it at an unverified price.
      expectAnchorError(res, "NotLiquidatable");
    });
  });

  // -----------------------------------------------------------------------
  // MarketGuard observability (refresh_guard)
  //
  // Kept adjacent to the scenarios above because it underpins the protocol's
  // central security claim: the cached guard is observability only and is never
  // the authorization path for borrow or withdraw.
  // -----------------------------------------------------------------------
  describe("17. refresh_guard observability", () => {
    let h: Harness;
    beforeEach(async () => {
      h = await setupHarness();
      await h.bootstrapProtocol();
    });

    it("is permissionless and reports Safe when every input is nominal", async () => {
      h.sendOk([await h.ixRefreshGuard(h.outsider)], [h.outsider]);

      const guard = h.fetch<any>("MarketGuard", h.marketGuard);
      assert.property(guard.marketState, "safe");
      assert.property(guard.reason, "ok");
      assert.equal(guard.lastValidPrice.toString(), "10000000000");
    });

    it("reports Restricted when the reference market is closed", async () => {
      h.setTime(TS_WEEKEND);
      h.setPrice({ priceUsd: 100 });
      h.sendOk([await h.ixRefreshGuard()], [h.outsider]);

      const guard = h.fetch<any>("MarketGuard", h.marketGuard);
      assert.property(guard.marketState, "restricted");
      assert.property(guard.reason, "marketClosed");
    });

    it("reports Emergency on custody impairment and thin-liquidity Restricted", async () => {
      h.sendOk([await h.ixSetCustody("impaired")], [h.admin]);
      h.sendOk([await h.ixRefreshGuard()], [h.outsider]);
      let guard = h.fetch<any>("MarketGuard", h.marketGuard);
      assert.property(guard.marketState, "emergency");
      assert.property(guard.reason, "custodyImpaired");

      h.sendOk([await h.ixSetCustody("healthy")], [h.admin]);
      h.sendOk([await h.ixSetLiquidity("thin")], [h.admin]);
      h.sendOk([await h.ixRefreshGuard()], [h.outsider]);
      guard = h.fetch<any>("MarketGuard", h.marketGuard);
      assert.property(guard.marketState, "restricted");
      assert.property(guard.reason, "liquidityThin");
    });

    it("never overwrites last_valid_price with unusable oracle data", async () => {
      // First refresh records a good price.
      h.sendOk([await h.ixRefreshGuard()], [h.outsider]);
      const good = h.fetch<any>("MarketGuard", h.marketGuard);
      assert.equal(good.lastValidPrice.toString(), "10000000000");

      // Now a stale $1 price arrives. State must degrade, but the stored
      // reference price must not be clobbered.
      h.setPrice({
        priceUsd: 1,
        publishTime: h.now() - BigInt(MAX_ORACLE_AGE + 60),
      });
      h.sendOk([await h.ixRefreshGuard()], [h.outsider]);

      const after = h.fetch<any>("MarketGuard", h.marketGuard);
      assert.property(after.marketState, "emergency");
      assert.property(after.reason, "staleOracle");
      assert.equal(
        after.lastValidPrice.toString(),
        "10000000000",
        "stale data must not overwrite the last valid price"
      );
    });

    it("a Safe cached guard does not authorize borrowing on its own", async () => {
      // Cache Safe during the session.
      h.sendOk([await h.ixRefreshGuard()], [h.outsider]);
      assert.property(
        h.fetch<any>("MarketGuard", h.marketGuard).marketState,
        "safe"
      );

      // Move to the weekend without refreshing: the cache still says Safe.
      h.setTime(TS_WEEKEND);
      h.setPrice({ priceUsd: 100 });
      assert.property(
        h.fetch<any>("MarketGuard", h.marketGuard).marketState,
        "safe"
      );

      // borrow must independently re-derive market state and refuse.
      h.sendOk([await h.ixDeposit(COLLATERAL)], [h.user]);
      const res = h.send([await h.ixBorrow(100 * TOKEN)], [h.user]);
      expectAnchorError(res, "MarketClosed");
    });
  });
});
