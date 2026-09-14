import * as path from "path";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { AnchorProvider, BN, Program, Wallet } from "@anchor-lang/core";
import {
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

import idl from "../../target/idl/circuit.json";
import { Svm, SvmResult, isFailure, logsOf, errOf } from "./svm";
import {
  PYTH_RECEIVER_ID,
  PRICE_UPDATE_V2_SIZE,
  encodePriceUpdateV2,
} from "./pyth";

// ---------------------------------------------------------------------------
// Protocol parameters used across the suite
// ---------------------------------------------------------------------------

/**
 * Fixed 32-byte Pyth feed id bound to the registered asset.
 *
 * Any 32 bytes work here: the suite forges its own `PriceUpdateV2` account, so
 * this id never has to correspond to a feed Pyth actually publishes. (It does
 * not exist on devnet - see scripts/check-oracle.ts for choosing a real one.)
 * What matters is only that the account's embedded feed id matches
 * `AssetConfig.pyth_feed_id`, which scenario 10 verifies is enforced.
 */
export const FEED_ID_HEX =
  "64ee2bc923a105553a1a9e5256e54f86641215be11b7d59048a1c97a55c2f826";

/** A different valid feed id, used to prove feed binding is enforced. */
export const WRONG_FEED_ID_HEX =
  "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace";

export const DECIMALS = 6;
export const TOKEN = 10 ** DECIMALS;

export const MIN_HEALTH_FACTOR_BPS = 10_000; // 1.0
export const MAX_ORACLE_AGE = 60; // seconds
export const MAX_CONF_BPS = 100; // 1%
export const BASE_LTV_BPS = 7_000; // 70%
export const LIQ_THRESHOLD_BPS = 8_000; // 80%
export const LIQ_BONUS_BPS = 500; // 5%

/** Price exponent used throughout: $1 == 100_000_000 at expo -8. */
export const EXPO = -8;
export const USD = 100_000_000;

/**
 * Wednesday 2026-09-09 15:00:00Z == 11:00 EDT. Inside the NYSE regular session
 * (09:30-16:00 ET) and not a holiday, so `is_market_open` returns true.
 */
export const TS_MARKET_OPEN = BigInt(Date.UTC(2026, 8, 9, 15, 0, 0) / 1000);

/** Saturday 2026-09-12 15:00:00Z - weekend. */
export const TS_WEEKEND = BigInt(Date.UTC(2026, 8, 12, 15, 0, 0) / 1000);

/** Monday 2026-01-19 15:00:00Z - MLK Day, an observed NYSE holiday. */
export const TS_HOLIDAY = BigInt(Date.UTC(2026, 0, 19, 15, 0, 0) / 1000);

/** Wednesday 2026-09-09 20:30:00Z == 16:30 EDT, after the 16:00 close. */
export const TS_AFTER_CLOSE = BigInt(Date.UTC(2026, 8, 9, 20, 30, 0) / 1000);

const PROGRAM_SO = path.resolve(__dirname, "../../target/deploy/circuit.so");

export interface SetPriceOpts {
  priceUsd?: number;
  price?: bigint;
  confUsd?: number;
  conf?: bigint;
  publishTime?: bigint;
  feedIdHex?: string;
  owner?: PublicKey;
}

export class Harness {
  svm!: Svm;
  program!: Program;
  programId!: PublicKey;

  admin!: Keypair;
  user!: Keypair;
  liquidator!: Keypair;
  outsider!: Keypair;

  equityMint!: PublicKey;
  quoteMint!: PublicKey;

  protocolConfig!: PublicKey;
  assetConfig!: PublicKey;
  marketGuard!: PublicKey;
  position!: PublicKey;
  auction!: PublicKey;
  riskRatchet!: PublicKey;

  collateralVault!: PublicKey;
  liquidityVault!: PublicKey;

  userEquityAta!: PublicKey;
  userQuoteAta!: PublicKey;
  liquidatorEquityAta!: PublicKey;
  liquidatorQuoteAta!: PublicKey;
  outsiderQuoteAta!: PublicKey;
  treasuryPubkey!: PublicKey;
  treasuryQuoteAta!: PublicKey;

  priceUpdate!: PublicKey;

  // -------------------------------------------------------------------------
  // Transactions
  // -------------------------------------------------------------------------

  send(ixs: TransactionInstruction[], signers: Keypair[]): SvmResult {
    const tx = new Transaction();
    tx.recentBlockhash = this.svm.latestBlockhash();
    tx.feePayer = signers[0].publicKey;
    tx.add(...ixs);
    tx.sign(...signers);
    return this.svm.send(tx);
  }

  sendOk(ixs: TransactionInstruction[], signers: Keypair[]): SvmResult {
    const res = this.send(ixs, signers);
    if (isFailure(res)) {
      throw new Error(
        `expected success but got ${errOf(res)}\n${logsOf(res).join("\n")}`
      );
    }
    return res;
  }

  // -------------------------------------------------------------------------
  // Clock and oracle control
  // -------------------------------------------------------------------------

  setTime(unixSeconds: bigint): void {
    this.svm.setClockUnixTimestamp(unixSeconds);
  }

  now(): bigint {
    return this.svm.getClockUnixTimestamp();
  }

  getSlot(): bigint {
    return this.svm.inner.getClock().slot;
  }

  warpToSlot(slot: bigint | number): void {
    this.svm.warpToSlot(BigInt(slot));
  }

  advanceSlots(delta: bigint | number): void {
    const current = this.getSlot();
    this.warpToSlot(current + BigInt(delta));
  }


  /** Create or overwrite the forged Pyth price account. */
  setPrice(opts: SetPriceOpts = {}): void {
    const price = opts.price ?? BigInt(Math.round((opts.priceUsd ?? 100) * USD));
    const conf = opts.conf ?? BigInt(Math.round((opts.confUsd ?? 0.5) * USD));
    const publishTime = opts.publishTime ?? this.now();

    const data = encodePriceUpdateV2({
      feedIdHex: opts.feedIdHex ?? FEED_ID_HEX,
      price,
      conf,
      exponent: EXPO,
      publishTime,
    });

    this.svm.setAccount(this.priceUpdate, {
      data,
      owner: opts.owner ?? PYTH_RECEIVER_ID,
      lamports: this.svm.rent(PRICE_UPDATE_V2_SIZE),
    });
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  /**
   * Anchor 1.x camelCases IDL account names, so the coder registers
   * `protocolConfig` rather than the Rust-side `ProtocolConfig`. Accept either
   * spelling so scenarios can use whichever reads better.
   */
  private static coderName(name: string): string {
    return name.charAt(0).toLowerCase() + name.slice(1);
  }

  fetch<T = any>(name: string, address: PublicKey): T {
    const acc = this.svm.getAccount(address);
    if (!acc) throw new Error(`account not found: ${address.toBase58()}`);
    return this.program.coder.accounts.decode<T>(
      Harness.coderName(name),
      Buffer.from(acc.data)
    );
  }

  maybeFetch<T = any>(name: string, address: PublicKey): T | null {
    const acc = this.svm.getAccount(address);
    if (!acc) return null;
    return this.program.coder.accounts.decode<T>(
      Harness.coderName(name),
      Buffer.from(acc.data)
    );
  }

  /** SPL token account amount (u64 at offset 64). */
  tokenBalance(address: PublicKey): bigint {
    const acc = this.svm.getAccount(address);
    if (!acc) throw new Error(`token account not found: ${address.toBase58()}`);
    return Buffer.from(acc.data).readBigUInt64LE(64);
  }

  // -------------------------------------------------------------------------
  // Instruction builders (thin wrappers so scenarios stay readable)
  // -------------------------------------------------------------------------

  async ixInitializeProtocol(
    authority = this.admin,
    opts: {
      minHealthFactorBps?: number;
      maxOracleAge?: number;
      maxConfBps?: number;
      liquidationBonusBps?: number;
    } = {}
  ): Promise<TransactionInstruction> {
    return this.program.methods
      .initializeProtocol(
        new BN(opts.minHealthFactorBps ?? MIN_HEALTH_FACTOR_BPS),
        new BN(opts.maxOracleAge ?? MAX_ORACLE_AGE),
        new BN(opts.maxConfBps ?? MAX_CONF_BPS),
        new BN(opts.liquidationBonusBps ?? LIQ_BONUS_BPS)
      )
      .accountsPartial({
        authority: authority.publicKey,
        protocolConfig: this.protocolConfig,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  async ixRegisterAsset(
    authority = this.admin,
    opts: {
      feedIdHex?: string;
      baseLtvBps?: number;
      liquidationThresholdBps?: number;
      liquidationBonusBps?: number;
      maxOracleAge?: number;
      maxConfBps?: number;
      marketGuard?: PublicKey;
    } = {}
  ): Promise<TransactionInstruction> {
    const feedIdHex = opts.feedIdHex ?? FEED_ID_HEX;
    return this.program.methods
      .registerAsset(
        Array.from(Buffer.from(feedIdHex, "hex")),
        new BN(opts.baseLtvBps ?? BASE_LTV_BPS),
        new BN(opts.liquidationThresholdBps ?? LIQ_THRESHOLD_BPS),
        new BN(opts.liquidationBonusBps ?? LIQ_BONUS_BPS),
        new BN(opts.maxOracleAge ?? MAX_ORACLE_AGE),
        new BN(opts.maxConfBps ?? MAX_CONF_BPS)
      )
      .accountsPartial({
        authority: authority.publicKey,
        protocolConfig: this.protocolConfig,
        mint: this.equityMint,
        quoteMint: this.quoteMint,
        assetConfig: this.assetConfig,
        marketGuard: opts.marketGuard ?? this.marketGuard,
        collateralVault: this.collateralVault,
        liquidityVault: this.liquidityVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: new PublicKey(
          "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        ),
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  async ixDeposit(amount: number | bigint): Promise<TransactionInstruction> {
    return this.program.methods
      .deposit(new BN(amount.toString()))
      .accountsPartial({
        owner: this.user.publicKey,
        protocolConfig: this.protocolConfig,
        assetConfig: this.assetConfig,
        mint: this.equityMint,
        position: this.position,
        userCollateralAta: this.userEquityAta,
        collateralVault: this.collateralVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: new PublicKey(
          "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        ),
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  async ixBorrow(
    amount: number | bigint,
    opts: {
      owner?: Keypair;
      position?: PublicKey;
      userQuoteAta?: PublicKey;
      treasuryQuoteAta?: PublicKey;
    } = {}
  ): Promise<TransactionInstruction> {
    const owner = opts.owner ?? this.user;
    return this.program.methods
      .borrow(new BN(amount.toString()))
      .accountsPartial({
        owner: owner.publicKey,
        protocolConfig: this.protocolConfig,
        assetConfig: this.assetConfig,
        position: opts.position ?? this.position,
        priceUpdate: this.priceUpdate,
        collateralMint: this.equityMint,
        quoteMint: this.quoteMint,
        userQuoteAta:
          opts.userQuoteAta ??
          getAssociatedTokenAddressSync(this.quoteMint, owner.publicKey),
        treasuryQuoteAta:
          opts.treasuryQuoteAta ??
          this.treasuryQuoteAta,
        liquidityVault: this.liquidityVault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();
  }

  async ixUpdateFeeConfig(
    feeRecipient: PublicKey,
    borrowFeeBps: number | bigint,
    feeEnabled: boolean,
    authority = this.admin
  ): Promise<TransactionInstruction> {
    return this.program.methods
      .updateFeeConfig(feeRecipient, new BN(borrowFeeBps.toString()), feeEnabled)
      .accountsPartial({
        authority: authority.publicKey,
        protocolConfig: this.protocolConfig,
      })
      .instruction();
  }

  async ixRepay(amount: number | bigint): Promise<TransactionInstruction> {
    return this.program.methods
      .repay(new BN(amount.toString()))
      .accountsPartial({
        owner: this.user.publicKey,
        protocolConfig: this.protocolConfig,
        assetConfig: this.assetConfig,
        position: this.position,
        quoteMint: this.quoteMint,
        userQuoteAta: this.userQuoteAta,
        liquidityVault: this.liquidityVault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();
  }

  async ixWithdraw(amount: number | bigint): Promise<TransactionInstruction> {
    return this.program.methods
      .withdraw(new BN(amount.toString()))
      .accountsPartial({
        owner: this.user.publicKey,
        protocolConfig: this.protocolConfig,
        assetConfig: this.assetConfig,
        position: this.position,
        priceUpdate: this.priceUpdate,
        collateralMint: this.equityMint,
        quoteMint: this.quoteMint,
        userCollateralAta: this.userEquityAta,
        collateralVault: this.collateralVault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();
  }

  async ixLiquidate(): Promise<TransactionInstruction> {
    return this.program.methods
      .liquidate()
      .accountsPartial({
        liquidator: this.liquidator.publicKey,
        protocolConfig: this.protocolConfig,
        assetConfig: this.assetConfig,
        position: this.position,
        priceUpdate: this.priceUpdate,
        collateralMint: this.equityMint,
        quoteMint: this.quoteMint,
        liquidatorQuoteAta: this.liquidatorQuoteAta,
        liquidatorCollateralAta: this.liquidatorEquityAta,
        collateralVault: this.collateralVault,
        liquidityVault: this.liquidityVault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();
  }

  async ixStartLiquidationAuction(
    initiator = this.liquidator
  ): Promise<TransactionInstruction> {
    return this.program.methods
      .startLiquidationAuction()
      .accountsPartial({
        initiator: initiator.publicKey,
        protocolConfig: this.protocolConfig,
        assetConfig: this.assetConfig,
        position: this.position,
        priceUpdate: this.priceUpdate,
        collateralMint: this.equityMint,
        quoteMint: this.quoteMint,
        auction: this.auction,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  async ixCancelLiquidationAuction(
    caller = this.user,
    initiator = this.liquidator
  ): Promise<TransactionInstruction> {
    return this.program.methods
      .cancelLiquidationAuction()
      .accountsPartial({
        caller: caller.publicKey,
        protocolConfig: this.protocolConfig,
        assetConfig: this.assetConfig,
        position: this.position,
        priceUpdate: this.priceUpdate,
        collateralMint: this.equityMint,
        quoteMint: this.quoteMint,
        auction: this.auction,
        auctionInitiator: initiator.publicKey,
      })
      .instruction();
  }

  async ixLiquidateAuction(
    requestedRepay: number | bigint = 0,
    liquidator = this.liquidator,
    initiator = this.liquidator
  ): Promise<TransactionInstruction> {
    return this.program.methods
      .liquidateAuction(new BN(requestedRepay.toString()))
      .accountsPartial({
        liquidator: liquidator.publicKey,
        protocolConfig: this.protocolConfig,
        assetConfig: this.assetConfig,
        position: this.position,
        auction: this.auction,
        auctionInitiator: initiator.publicKey,
        priceUpdate: this.priceUpdate,
        collateralMint: this.equityMint,
        quoteMint: this.quoteMint,
        liquidatorQuoteAta: this.liquidatorQuoteAta,
        liquidatorCollateralAta: this.liquidatorEquityAta,
        collateralVault: this.collateralVault,
        liquidityVault: this.liquidityVault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();
  }

  async ixRefreshGuard(caller = this.outsider): Promise<TransactionInstruction> {
    return this.program.methods
      .refreshGuard()
      .accountsPartial({
        caller: caller.publicKey,
        assetConfig: this.assetConfig,
        marketGuard: this.marketGuard,
        riskRatchet: this.riskRatchet,
        priceUpdate: this.priceUpdate,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  async ixPause(authority = this.admin): Promise<TransactionInstruction> {
    return this.program.methods
      .pauseProtocol()
      .accountsPartial({
        authority: authority.publicKey,
        protocolConfig: this.protocolConfig,
      })
      .instruction();
  }

  async ixUnpause(authority = this.admin): Promise<TransactionInstruction> {
    return this.program.methods
      .unpauseProtocol()
      .accountsPartial({
        authority: authority.publicKey,
        protocolConfig: this.protocolConfig,
      })
      .instruction();
  }

  async ixSetCustody(
    state: "healthy" | "delayed" | "impaired",
    authority = this.admin
  ): Promise<TransactionInstruction> {
    return this.program.methods
      .setCustodyState({ [state]: {} } as any)
      .accountsPartial({
        authority: authority.publicKey,
        protocolConfig: this.protocolConfig,
        assetConfig: this.assetConfig,
      })
      .instruction();
  }

  async ixSetLiquidity(
    state: "deep" | "normal" | "thin" | "critical",
    authority = this.admin
  ): Promise<TransactionInstruction> {
    return this.program.methods
      .setLiquidityState({ [state]: {} } as any)
      .accountsPartial({
        authority: authority.publicKey,
        protocolConfig: this.protocolConfig,
        assetConfig: this.assetConfig,
      })
      .instruction();
  }

  // -------------------------------------------------------------------------
  // Composite helpers
  // -------------------------------------------------------------------------

  /** initialize_protocol + register_asset + seed the liquidity vault. */
  async bootstrapProtocol(liquidityUsd = 100_000): Promise<void> {
    this.sendOk([await this.ixInitializeProtocol()], [this.admin]);
    this.sendOk([await this.ixRegisterAsset()], [this.admin]);
    this.sendOk(
      [
        createMintToInstruction(
          this.quoteMint,
          this.liquidityVault,
          this.admin.publicKey,
          BigInt(liquidityUsd * TOKEN)
        ),
      ],
      [this.admin]
    );
  }
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

const ASSOCIATED_TOKEN_PROGRAM = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);

/**
 * Boots an in-process SVM with the circuit program loaded, two 6-decimal mints,
 * funded participants, and a valid Pyth price account.
 *
 * LiteSVM (rather than a validator) is required by this protocol's design, not
 * chosen merely for speed:
 *   1. `setClock` drives `is_market_open()` to both open and closed states.
 *      Against a real cluster the NYSE session gate makes the borrow happy path
 *      untestable outside market hours - the suite would pass or fail depending
 *      on which day it ran.
 *   2. `setAccount` forges `PriceUpdateV2` accounts, the only practical way to
 *      exercise the stale-oracle, wide-confidence, wrong-feed, wrong-owner and
 *      frozen-price branches on demand.
 */
export async function setupHarness(): Promise<Harness> {
  const h = new Harness();

  h.svm = Svm.create();
  h.programId = new PublicKey((idl as any).address);
  h.svm.addProgramFromFile(h.programId, PROGRAM_SO);

  h.admin = Keypair.generate();
  h.user = Keypair.generate();
  h.liquidator = Keypair.generate();
  h.outsider = Keypair.generate();

  for (const kp of [h.admin, h.user, h.liquidator, h.outsider]) {
    h.svm.airdrop(kp.publicKey, 100_000_000_000n);
  }

  // Anchor's Program is used only to encode instructions from the IDL. The
  // Connection is never contacted; everything is submitted through LiteSVM.
  const provider = new AnchorProvider(
    new Connection("http://127.0.0.1:8899", "confirmed"),
    new Wallet(h.admin),
    { commitment: "confirmed" }
  );
  h.program = new Program(idl as any, provider);

  // --- mints -------------------------------------------------------------
  const equityKp = Keypair.generate();
  const quoteKp = Keypair.generate();
  h.equityMint = equityKp.publicKey;
  h.quoteMint = quoteKp.publicKey;

  const mintRent = Number(h.svm.rent(MINT_SIZE));
  const mintIxs = (mint: PublicKey) => [
    SystemProgram.createAccount({
      fromPubkey: h.admin.publicKey,
      newAccountPubkey: mint,
      space: MINT_SIZE,
      lamports: mintRent,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMint2Instruction(mint, DECIMALS, h.admin.publicKey, null),
  ];

  h.sendOk(
    [...mintIxs(h.equityMint), ...mintIxs(h.quoteMint)],
    [h.admin, equityKp, quoteKp]
  );

  // --- token accounts ----------------------------------------------------
  h.userEquityAta = getAssociatedTokenAddressSync(h.equityMint, h.user.publicKey);
  h.userQuoteAta = getAssociatedTokenAddressSync(h.quoteMint, h.user.publicKey);
  h.liquidatorEquityAta = getAssociatedTokenAddressSync(
    h.equityMint,
    h.liquidator.publicKey
  );
  h.liquidatorQuoteAta = getAssociatedTokenAddressSync(
    h.quoteMint,
    h.liquidator.publicKey
  );
  h.outsiderQuoteAta = getAssociatedTokenAddressSync(
    h.quoteMint,
    h.outsider.publicKey
  );
  h.treasuryPubkey = new PublicKey("7AALMsZ5MuioSW7BMwBCwTmy9Y1fMJ6MKXAELYyrtb4");
  h.treasuryQuoteAta = getAssociatedTokenAddressSync(
    h.quoteMint,
    h.treasuryPubkey
  );

  h.sendOk(
    [
      createAssociatedTokenAccountInstruction(
        h.admin.publicKey,
        h.outsiderQuoteAta,
        h.outsider.publicKey,
        h.quoteMint
      ),
      createAssociatedTokenAccountInstruction(
        h.admin.publicKey,
        h.treasuryQuoteAta,
        h.treasuryPubkey,
        h.quoteMint
      ),
      createAssociatedTokenAccountInstruction(
        h.admin.publicKey,
        h.userEquityAta,
        h.user.publicKey,
        h.equityMint
      ),
      createAssociatedTokenAccountInstruction(
        h.admin.publicKey,
        h.userQuoteAta,
        h.user.publicKey,
        h.quoteMint
      ),
      createAssociatedTokenAccountInstruction(
        h.admin.publicKey,
        h.liquidatorEquityAta,
        h.liquidator.publicKey,
        h.equityMint
      ),
      createAssociatedTokenAccountInstruction(
        h.admin.publicKey,
        h.liquidatorQuoteAta,
        h.liquidator.publicKey,
        h.quoteMint
      ),
    ],
    [h.admin]
  );

  h.sendOk(
    [
      createMintToInstruction(
        h.equityMint,
        h.userEquityAta,
        h.admin.publicKey,
        BigInt(1_000 * TOKEN)
      ),
      createMintToInstruction(
        h.quoteMint,
        h.liquidatorQuoteAta,
        h.admin.publicKey,
        BigInt(1_000_000 * TOKEN)
      ),
    ],
    [h.admin]
  );

  // --- PDAs --------------------------------------------------------------
  [h.protocolConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("protocol")],
    h.programId
  );
  [h.assetConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("asset"), h.equityMint.toBuffer()],
    h.programId
  );
  [h.marketGuard] = PublicKey.findProgramAddressSync(
    [Buffer.from("guard"), Buffer.from(FEED_ID_HEX, "hex")],
    h.programId
  );
  [h.position] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("position"),
      h.user.publicKey.toBuffer(),
      h.equityMint.toBuffer(),
    ],
    h.programId
  );
  [h.auction] = PublicKey.findProgramAddressSync(
    [Buffer.from("auction"), h.position.toBuffer()],
    h.programId
  );
  [h.riskRatchet] = PublicKey.findProgramAddressSync(
    [Buffer.from("ratchet"), Buffer.from(FEED_ID_HEX, "hex")],
    h.programId
  );


  h.collateralVault = getAssociatedTokenAddressSync(
    h.equityMint,
    h.protocolConfig,
    true
  );
  h.liquidityVault = getAssociatedTokenAddressSync(
    h.quoteMint,
    h.protocolConfig,
    true
  );

  h.priceUpdate = Keypair.generate().publicKey;

  // Start inside a live NYSE session with a fresh, tight-confidence price.
  h.setTime(TS_MARKET_OPEN);
  h.setPrice({ priceUsd: 100, confUsd: 0.5 });

  return h;
}

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

/** Asserts the transaction failed with a specific Anchor error variant. */
export function expectAnchorError(res: SvmResult, variant: string): void {
  if (!isFailure(res)) {
    throw new Error(
      `expected failure with ${variant} but the transaction succeeded`
    );
  }
  const logs = logsOf(res).join("\n");
  if (!logs.includes(`Error Code: ${variant}`)) {
    throw new Error(
      `expected Anchor error "${variant}" but got ${errOf(res)}\n${logs}`
    );
  }
}

/** Asserts the transaction failed, without pinning the exact reason. */
export function expectFailure(res: SvmResult, what: string): void {
  if (!isFailure(res)) {
    throw new Error(`expected failure (${what}) but the transaction succeeded`);
  }
}

export {
  BN,
  SystemProgram,
  PublicKey,
  Keypair,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM,
  isFailure,
  logsOf,
  errOf,
  createMintToInstruction,
};
