import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { AnchorProvider, BN, Program } from "@anchor-lang/core";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

import { CIRCUIT_TREASURY_KEY, PROGRAM_ID, PYTH_FEED_ID, idl } from "../config";

/**
 * Typed access to the Circuit program: PDA derivation, account reads, and
 * instruction builders.
 *
 * Design note: every value shown in the UI is read from chain. The one thing
 * deliberately *not* trusted is the cached MarketGuard - the program treats it
 * as observability only and re-derives market state inside borrow/withdraw, so
 * the UI presents it as an indicator and never as permission.
 */

export const DECIMALS = 6;
export const TOKEN_UNITS = 10 ** DECIMALS;
export const BPS = 10_000;

// -- bitmask action flags for autonomous agent delegation ------------------
export const ACTION_DEPOSIT = 1 << 0;  // 1
export const ACTION_BORROW = 1 << 1;   // 2
export const ACTION_REPAY = 1 << 2;    // 4
export const ACTION_WITHDRAW = 1 << 3; // 8

// -- enums -----------------------------------------------------------------

export type MarketState = "safe" | "restricted" | "defensive" | "emergency";
export type CustodyState = "healthy" | "delayed" | "impaired";
export type LiquidityState = "deep" | "normal" | "thin" | "critical";
export type PositionState = "healthy" | "liquidatable";

/** Anchor decodes unit enum variants as `{ variantName: {} }`. */
function enumKey<T extends string>(v: any, fallback: T): T {
  if (!v || typeof v !== "object") return fallback;
  const k = Object.keys(v)[0];
  return (k as T) ?? fallback;
}

// -- account shapes --------------------------------------------------------

export interface ProtocolConfigView {
  authority: PublicKey;
  paused: boolean;
  version: number;
  minHealthFactorBps: number;
  liquidationBonusBps: number;
  feeRecipient?: PublicKey;
  borrowFeeBps?: number;
  feeEnabled?: boolean;
}

export interface AssetConfigView {
  mint: PublicKey;
  quoteMint: PublicKey;
  feedIdHex: string;
  baseLtvBps: number;
  liquidationThresholdBps: number;
  liquidationBonusBps: number;
  maxOracleAge: number;
  maxConfBps: number;
  custodyState: CustodyState;
  liquidityState: LiquidityState;
  enabled: boolean;
}

export interface MarketGuardView {
  marketState: MarketState;
  reason: string;
  lastValidPrice: bigint;
  lastValidExpo: number;
  lastPublishTime: bigint;
  lastCheckedSlot: bigint;
}

export interface PositionView {
  owner: PublicKey;
  collateralAmount: bigint;
  debtAmount: bigint;
  lastValidPrice: bigint;
  lastValidExpo: number;
  state: PositionState;
}

export interface AgentAuthorityView {
  owner: PublicKey;
  agent: PublicKey;
  assetMint: PublicKey;
  allowedActions: number;
  maxBorrowLimit: bigint;
  maxWithdrawLimit: bigint;
  currentBorrowed: bigint;
  riskBudget: bigint;
  initialRiskBudget: bigint;
  expiryTs: bigint;
  nonce: bigint;
  bump: number;
}

// -- PDAs ------------------------------------------------------------------

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function feedIdBytes(hex = PYTH_FEED_ID): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export const protocolConfigPda = (): PublicKey =>
  PublicKey.findProgramAddressSync([utf8("protocol")], PROGRAM_ID)[0];

export const assetConfigPda = (mint: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync(
    [utf8("asset"), mint.toBuffer()],
    PROGRAM_ID
  )[0];

export const marketGuardPda = (feedHex = PYTH_FEED_ID): PublicKey =>
  PublicKey.findProgramAddressSync(
    [utf8("guard"), feedIdBytes(feedHex)],
    PROGRAM_ID
  )[0];

export const riskRatchetPda = (feedHex = PYTH_FEED_ID): PublicKey =>
  PublicKey.findProgramAddressSync(
    [utf8("ratchet"), feedIdBytes(feedHex)],
    PROGRAM_ID
  )[0];

export const positionPda = (owner: PublicKey, mint: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync(
    [utf8("position"), owner.toBuffer(), mint.toBuffer()],
    PROGRAM_ID
  )[0];

export const agentAuthorityPda = (
  owner: PublicKey,
  agent: PublicKey,
  mint: PublicKey
): PublicKey =>
  PublicKey.findProgramAddressSync(
    [utf8("authority"), owner.toBuffer(), agent.toBuffer(), mint.toBuffer()],
    PROGRAM_ID
  )[0];

export const vaultFor = (mint: PublicKey): PublicKey =>
  getAssociatedTokenAddressSync(mint, protocolConfigPda(), true);

// -- program factory -------------------------------------------------------

/**
 * Builds a read-only Program. Anchor requires a provider, but no wallet is
 * needed for decoding accounts or building instructions.
 */
export function readOnlyProgram(conn: Connection): Program {
  const stubWallet = {
    publicKey: PublicKey.default,
    signTransaction: async (t: any) => t,
    signAllTransactions: async (t: any) => t,
  };
  const provider = new AnchorProvider(conn, stubWallet as any, {
    commitment: "confirmed",
  });
  return new Program(idl as any, provider);
}

// -- reads -----------------------------------------------------------------

async function decodeMaybe<T>(
  program: Program,
  conn: Connection,
  name: string,
  address: PublicKey,
  map: (raw: any) => T
): Promise<T | null> {
  const info = await conn.getAccountInfo(address);
  if (!info) return null;
  try {
    const raw = program.coder.accounts.decode(name, Buffer.from(info.data));
    return map(raw);
  } catch (e) {
    console.warn(`failed to decode ${name} at ${address.toBase58()}`, e);
    return null;
  }
}

export async function fetchProtocolConfig(
  program: Program,
  conn: Connection
): Promise<ProtocolConfigView | null> {
  return decodeMaybe(program, conn, "protocolConfig", protocolConfigPda(), (r) => ({
    authority: r.authority,
    paused: Boolean(r.paused),
    version: Number(r.version),
    minHealthFactorBps: Number(r.minHealthFactorBps),
    liquidationBonusBps: Number(r.liquidationBonusBps),
    feeRecipient: r.feeRecipient ? new PublicKey(r.feeRecipient) : undefined,
    borrowFeeBps: r.borrowFeeBps ? Number(r.borrowFeeBps) : 25,
    feeEnabled: r.feeEnabled !== undefined ? Boolean(r.feeEnabled) : true,
  }));
}

export async function fetchAssetConfig(
  program: Program,
  conn: Connection,
  mint: PublicKey
): Promise<AssetConfigView | null> {
  return decodeMaybe(program, conn, "assetConfig", assetConfigPda(mint), (r) => ({
    mint: r.mint,
    quoteMint: r.quoteMint,
    feedIdHex: Buffer.from(r.pythFeedId).toString("hex"),
    baseLtvBps: Number(r.baseLtvBps),
    liquidationThresholdBps: Number(r.liquidationThresholdBps),
    liquidationBonusBps: Number(r.liquidationBonusBps),
    maxOracleAge: Number(r.maxOracleAge),
    maxConfBps: Number(r.maxConfBps),
    custodyState: enumKey<CustodyState>(r.custodyState, "healthy"),
    liquidityState: enumKey<LiquidityState>(r.liquidityState, "deep"),
    enabled: Boolean(r.enabled),
  }));
}

export async function fetchMarketGuard(
  program: Program,
  conn: Connection,
  feedHex = PYTH_FEED_ID
): Promise<MarketGuardView | null> {
  return decodeMaybe(program, conn, "marketGuard", marketGuardPda(feedHex), (r) => ({
    marketState: enumKey<MarketState>(r.marketState, "emergency"),
    reason: enumKey(r.reason, "ok"),
    lastValidPrice: BigInt(r.lastValidPrice.toString()),
    lastValidExpo: Number(r.lastValidExpo),
    lastPublishTime: BigInt(r.lastPublishTime.toString()),
    lastCheckedSlot: BigInt(r.lastCheckedSlot.toString()),
  }));
}

export async function fetchPosition(
  program: Program,
  conn: Connection,
  owner: PublicKey,
  mint: PublicKey
): Promise<PositionView | null> {
  return decodeMaybe(program, conn, "position", positionPda(owner, mint), (r) => ({
    owner: r.owner,
    collateralAmount: BigInt(r.collateralAmount.toString()),
    debtAmount: BigInt(r.debtAmount.toString()),
    lastValidPrice: BigInt(r.lastValidPrice.toString()),
    lastValidExpo: Number(r.lastValidExpo),
    state: enumKey<PositionState>(r.state, "healthy"),
  }));
}

export async function fetchTokenAmount(
  conn: Connection,
  address: PublicKey
): Promise<bigint> {
  const info = await conn.getAccountInfo(address);
  if (!info || info.data.length < 72) return 0n;
  const view = new DataView(
    info.data.buffer,
    info.data.byteOffset,
    info.data.byteLength
  );
  return view.getBigUint64(64, true); // SPL token amount
}

export async function fetchAgentAuthority(
  program: Program,
  conn: Connection,
  owner: PublicKey,
  agent: PublicKey,
  mint: PublicKey
): Promise<AgentAuthorityView | null> {
  const pda = agentAuthorityPda(owner, agent, mint);
  const info = await conn.getAccountInfo(pda);
  if (!info || info.data.length < 162) return null;

  try {
    const raw = program.coder.accounts.decode("agentAuthority", Buffer.from(info.data));
    return {
      owner: raw.owner,
      agent: raw.agent,
      assetMint: raw.assetMint,
      allowedActions: Number(raw.allowedActions),
      maxBorrowLimit: BigInt(raw.maxBorrowLimit.toString()),
      maxWithdrawLimit: BigInt(raw.maxWithdrawLimit.toString()),
      currentBorrowed: BigInt(raw.currentBorrowed.toString()),
      riskBudget: BigInt(raw.riskBudget.toString()),
      initialRiskBudget: BigInt(raw.initialRiskBudget.toString()),
      expiryTs: BigInt(raw.expiryTs.toString()),
      nonce: BigInt(raw.nonce.toString()),
      bump: Number(raw.bump),
    };
  } catch {
    const data = info.data;
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    return {
      owner: new PublicKey(data.subarray(8, 40)),
      agent: new PublicKey(data.subarray(40, 72)),
      assetMint: new PublicKey(data.subarray(72, 104)),
      allowedActions: view.getUint8(104),
      maxBorrowLimit: view.getBigUint64(105, true),
      maxWithdrawLimit: view.getBigUint64(113, true),
      currentBorrowed: view.getBigUint64(121, true),
      riskBudget: view.getBigUint64(129, true),
      initialRiskBudget: view.getBigUint64(137, true),
      expiryTs: view.getBigInt64(145, true),
      nonce: view.getBigUint64(153, true),
      bump: view.getUint8(161),
    };
  }
}

// -- risk math (mirrors programs/circuit/src/math/fixed_point.rs) ----------

/**
 * Collateral value in quote-token native units.
 * Mirrors `calculate_collateral_value`, including its round-down behaviour, so
 * the UI never shows a more optimistic number than the program will compute.
 */
export function collateralValue(
  amount: bigint,
  price: bigint,
  expo: number,
  collateralDecimals = DECIMALS,
  quoteDecimals = DECIMALS
): bigint {
  if (price <= 0n) return 0n;
  const raw = amount * price;
  const netExpo = quoteDecimals - collateralDecimals + expo;
  if (netExpo >= 0) return raw * 10n ** BigInt(netExpo);
  return raw / 10n ** BigInt(-netExpo);
}

export function maxBorrow(value: bigint, ltvBps: number): bigint {
  return (value * BigInt(ltvBps)) / BigInt(BPS);
}

/** Health factor in bps. Returns null for "no debt" (infinite). */
export function healthFactorBps(
  value: bigint,
  liqThresholdBps: number,
  debt: bigint
): number | null {
  if (debt === 0n) return null;
  return Number((value * BigInt(liqThresholdBps)) / debt);
}

export const toUi = (native: bigint, decimals = DECIMALS): number =>
  Number(native) / 10 ** decimals;

export const toNative = (ui: number, decimals = DECIMALS): bigint =>
  BigInt(Math.round(ui * 10 ** decimals));

// -- instruction builders --------------------------------------------------

export interface ActionContext {
  program: Program;
  owner: PublicKey;
  equityMint: PublicKey;
  quoteMint: PublicKey;
  priceUpdate: PublicKey;
}

export async function buildDeposit(
  ctx: ActionContext,
  amountNative: bigint
): Promise<TransactionInstruction[]> {
  const userAta = getAssociatedTokenAddressSync(ctx.equityMint, ctx.owner);
  const ix = await ctx.program.methods
    .deposit(new BN(amountNative.toString()))
    .accountsPartial({
      owner: ctx.owner,
      protocolConfig: protocolConfigPda(),
      assetConfig: assetConfigPda(ctx.equityMint),
      mint: ctx.equityMint,
      position: positionPda(ctx.owner, ctx.equityMint),
      userCollateralAta: userAta,
      collateralVault: vaultFor(ctx.equityMint),
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  return [ix];
}

export async function buildBorrow(
  ctx: ActionContext,
  amountNative: bigint
): Promise<TransactionInstruction[]> {
  const userQuoteAta = getAssociatedTokenAddressSync(ctx.quoteMint, ctx.owner);
  const treasuryQuoteAta = getAssociatedTokenAddressSync(ctx.quoteMint, CIRCUIT_TREASURY_KEY);
  const ix = await ctx.program.methods
    .borrow(new BN(amountNative.toString()))
    .accountsPartial({
      owner: ctx.owner,
      protocolConfig: protocolConfigPda(),
      assetConfig: assetConfigPda(ctx.equityMint),
      position: positionPda(ctx.owner, ctx.equityMint),
      priceUpdate: ctx.priceUpdate,
      collateralMint: ctx.equityMint,
      quoteMint: ctx.quoteMint,
      userQuoteAta,
      liquidityVault: vaultFor(ctx.quoteMint),
      treasuryQuoteAta,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();

  // The borrower may not hold the quote mint yet; create the ATA idempotently.
  // We also ensure the protocol treasury quote ATA exists idempotently.
  return [
    createAssociatedTokenAccountIdempotentInstruction(
      ctx.owner,
      userQuoteAta,
      ctx.owner,
      ctx.quoteMint
    ),
    createAssociatedTokenAccountIdempotentInstruction(
      ctx.owner,
      treasuryQuoteAta,
      CIRCUIT_TREASURY_KEY,
      ctx.quoteMint
    ),
    ix,
  ];
}

export async function buildRepay(
  ctx: ActionContext,
  amountNative: bigint
): Promise<TransactionInstruction[]> {
  const ix = await ctx.program.methods
    .repay(new BN(amountNative.toString()))
    .accountsPartial({
      owner: ctx.owner,
      protocolConfig: protocolConfigPda(),
      assetConfig: assetConfigPda(ctx.equityMint),
      position: positionPda(ctx.owner, ctx.equityMint),
      quoteMint: ctx.quoteMint,
      userQuoteAta: getAssociatedTokenAddressSync(ctx.quoteMint, ctx.owner),
      liquidityVault: vaultFor(ctx.quoteMint),
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();
  return [ix];
}

export async function buildWithdraw(
  ctx: ActionContext,
  amountNative: bigint
): Promise<TransactionInstruction[]> {
  const ix = await ctx.program.methods
    .withdraw(new BN(amountNative.toString()))
    .accountsPartial({
      owner: ctx.owner,
      protocolConfig: protocolConfigPda(),
      assetConfig: assetConfigPda(ctx.equityMint),
      position: positionPda(ctx.owner, ctx.equityMint),
      priceUpdate: ctx.priceUpdate,
      collateralMint: ctx.equityMint,
      quoteMint: ctx.quoteMint,
      userCollateralAta: getAssociatedTokenAddressSync(
        ctx.equityMint,
        ctx.owner
      ),
      collateralVault: vaultFor(ctx.equityMint),
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();
  return [ix];
}

/**
 * Admin-only: set the custody state recorded on the asset.
 *
 * MVP semantics: this is an explicit operator input, not a live custody feed.
 * The UI surfaces it only in the verification/demo area and labels it as
 * simulated so it cannot be mistaken for external data.
 */
export async function buildSetCustodyState(
  ctx: ActionContext,
  state: CustodyState
): Promise<TransactionInstruction[]> {
  const ix = await ctx.program.methods
    .setCustodyState({ [state]: {} } as any)
    .accountsPartial({
      authority: ctx.owner,
      protocolConfig: protocolConfigPda(),
      assetConfig: assetConfigPda(ctx.equityMint),
    })
    .instruction();
  return [ix];
}

/** Admin-only: set the liquidity state recorded on the asset. Also simulated. */
export async function buildSetLiquidityState(
  ctx: ActionContext,
  state: LiquidityState
): Promise<TransactionInstruction[]> {
  const ix = await ctx.program.methods
    .setLiquidityState({ [state]: {} } as any)
    .accountsPartial({
      authority: ctx.owner,
      protocolConfig: protocolConfigPda(),
      assetConfig: assetConfigPda(ctx.equityMint),
    })
    .instruction();
  return [ix];
}

export async function buildRefreshGuard(
  ctx: ActionContext
): Promise<TransactionInstruction[]> {
  const ix = await ctx.program.methods
    .refreshGuard()
    .accountsPartial({
      caller: ctx.owner,
      assetConfig: assetConfigPda(ctx.equityMint),
      marketGuard: marketGuardPda(),
      priceUpdate: ctx.priceUpdate,
    })
    .instruction();
  return [ix];
}

export async function buildCreateAgentAuthority(
  ctx: ActionContext,
  agent: PublicKey,
  allowedActions: number,
  maxBorrowLimitNative: bigint,
  maxWithdrawLimitNative: bigint,
  riskBudgetNative: bigint,
  expiryTs: bigint | number
): Promise<TransactionInstruction[]> {
  const pda = agentAuthorityPda(ctx.owner, agent, ctx.equityMint);
  const ix = await ctx.program.methods
    .createAgentAuthority(
      allowedActions,
      new BN(maxBorrowLimitNative.toString()),
      new BN(maxWithdrawLimitNative.toString()),
      new BN(riskBudgetNative.toString()),
      new BN(expiryTs.toString())
    )
    .accountsPartial({
      owner: ctx.owner,
      agent,
      assetMint: ctx.equityMint,
      agentAuthority: pda,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  return [ix];
}

export async function buildUpdateAgentAuthority(
  ctx: ActionContext,
  agent: PublicKey,
  allowedActions: number,
  maxBorrowLimitNative: bigint,
  maxWithdrawLimitNative: bigint,
  riskBudgetNative: bigint,
  expiryTs: bigint | number
): Promise<TransactionInstruction[]> {
  const pda = agentAuthorityPda(ctx.owner, agent, ctx.equityMint);
  const ix = await ctx.program.methods
    .updateAgentAuthority(
      allowedActions,
      new BN(maxBorrowLimitNative.toString()),
      new BN(maxWithdrawLimitNative.toString()),
      new BN(riskBudgetNative.toString()),
      new BN(expiryTs.toString())
    )
    .accountsPartial({
      owner: ctx.owner,
      agent,
      assetMint: ctx.equityMint,
      agentAuthority: pda,
    })
    .instruction();
  return [ix];
}

export async function buildExecuteAgentAction(
  ctx: ActionContext,
  agentWallet: PublicKey,
  action: "deposit" | "borrow" | "repay" | "withdraw",
  amountNative: bigint,
  intentNonce: bigint | number,
  userCollateralAta?: PublicKey,
  userQuoteAta?: PublicKey
): Promise<TransactionInstruction[]> {
  const pda = agentAuthorityPda(ctx.owner, agentWallet, ctx.equityMint);
  const ratchetPda = riskRatchetPda();
  const posPda = positionPda(ctx.owner, ctx.equityMint);
  const uCollateralAta = userCollateralAta ?? getAssociatedTokenAddressSync(ctx.equityMint, ctx.owner);
  const uQuoteAta = userQuoteAta ?? getAssociatedTokenAddressSync(ctx.quoteMint, ctx.owner);

  const ix = await ctx.program.methods
    .executeAgentAction(
      { [action]: {} } as any,
      new BN(amountNative.toString()),
      new BN(intentNonce.toString())
    )
    .accountsPartial({
      agent: agentWallet,
      owner: ctx.owner,
      protocolConfig: protocolConfigPda(),
      assetConfig: assetConfigPda(ctx.equityMint),
      riskRatchet: ratchetPda,
      position: posPda,
      agentAuthority: pda,
      collateralVault: vaultFor(ctx.equityMint),
      liquidityVault: vaultFor(ctx.quoteMint),
      userCollateralAta: uCollateralAta,
      userQuoteAta: uQuoteAta,
      collateralMint: ctx.equityMint,
      quoteMint: ctx.quoteMint,
      priceUpdate: ctx.priceUpdate,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  return [ix];
}

// -- sending ---------------------------------------------------------------

/**
 * Extracts a human-readable reason from a failed transaction.
 * Anchor logs `Error Code: <Variant>` on a `require!` failure, which is far more
 * useful than the raw simulation error.
 */
export function describeError(e: any, errorMap: Map<number, string>): string {
  const logs: string[] = e?.logs ?? e?.transactionLogs ?? [];
  const joined = Array.isArray(logs) ? logs.join("\n") : String(logs);

  const codeMatch = joined.match(/Error Code: (\w+)/);
  if (codeMatch) return humanizeVariant(codeMatch[1]);

  const numMatch = joined.match(/custom program error: 0x([0-9a-fA-F]+)/);
  if (numMatch) {
    const code = parseInt(numMatch[1], 16);
    const name = errorMap.get(code);
    if (name) return humanizeVariant(name);
  }

  const msg = String(e?.message ?? e);
  if (/insufficient (lamports|funds)/i.test(msg)) {
    return "Not enough SOL to pay for the transaction.";
  }
  if (/User rejected|rejected the request/i.test(msg)) {
    return "Transaction rejected in wallet.";
  }
  if (/mutated during signing/i.test(msg)) {
    return "SECURITY ALERT: Transaction bytes were altered before broadcast. Rejected for safety.";
  }
  if (/blockhash expired/i.test(msg)) {
    return "Transaction expired before broadcast. Please sign a fresh transaction.";
  }
  if (/signature verification failed/i.test(msg)) {
    return "Transaction signature invalid. Please re-sign.";
  }
  return msg.split("\n")[0];
}

const VARIANT_MESSAGES: Record<string, string> = {
  ProtocolPaused: "The protocol is paused. Deposit and repay remain available for capital recovery.",
  AssetDisabled: "This asset is disabled for new positions by protocol governance.",
  MarketClosed:
    "The reference market (NYSE) is closed. Borrowing and withdrawing against debt are gated to regular trading hours to prevent gap-risk.",
  MarketRestricted: "Market state is RESTRICTED: additional risk-increasing credit actions are capped to 50% capacity.",
  MarketDefensive: "Market state is DEFENSIVE: all new borrow and leverage actions are blocked pending risk reduction.",
  MarketEmergency: "Market state is EMERGENCY: all borrow and withdrawal actions are strictly blocked on-chain.",
  StaleOracle:
    "Market data is too old to safely execute this action. The Pyth price is older than the configured freshness limit.",
  ConfidenceTooWide:
    "Oracle uncertainty is too high. Pyth confidence interval exceeds the safety threshold.",
  BorrowExceedsCapacity: "That amount exceeds your borrowing capacity. Deposit additional collateral to borrow more.",
  HealthFactorTooLow: "That would push your health factor below the minimum safety threshold (1.00).",
  InsufficientLiquidity: "The protocol vault does not have enough liquidity to fulfill this borrow request.",
  InsufficientCollateral: "Amount must be greater than zero.",
  WithdrawExceedsCollateral: "You cannot withdraw more than you deposited in this collateral position.",
  RepayExceedsDebt: "You cannot repay more than you owe.",
  NotLiquidatable: "This position is not eligible for liquidation because its health factor is above 1.00.",
  InvalidCustodyState: "Custody is impaired, so risk-increasing actions are blocked by protocol guard.",
  InvalidLiquidityState: "Liquidity is degraded, so risk-increasing actions are blocked by protocol guard.",
  InvalidPositionOwner: "You are not the owner of this position.",
  Unauthorized: "Only the protocol authority can perform this administrative operation.",
  InvalidPrice: "The oracle price is not usable for financial calculations.",
  BorrowDisabledByRiskPolicy: "Blocked by your current risk limits. The Risk Ratchet is restricting new credit.",
  WithdrawDisabledByRiskPolicy: "Blocked by your current risk limits. Collateral withdrawal is restricted to protect position solvency.",
  EffectiveLtvExceeded: "Proposed borrow exceeds your available borrowing capacity under current risk limits.",
  AgentAuthorityExpired: "Agent access has expired. Please re-authorize the agent in the Permissions tab.",
  AgentActionNotPermitted: "This action is outside the agent's authorized access scope.",
  AgentBorrowLimitExceeded: "Agent borrow limit reached. The requested amount exceeds the agent's authorized limit.",
  AgentWithdrawLimitExceeded: "Agent withdrawal limit reached. The requested amount exceeds the agent's authorized limit.",
  InsufficientRiskBudget: "Action risk cost exceeds the agent's remaining dynamic risk budget.",
  AgentAuthorityUnauthorized: "Signer does not match the delegated autonomous agent.",
  InvalidAgentOwner: "The strategy's delegating owner does not match position owner.",
  ActionNonceInvalid: "Action intent nonce mismatch or replay detected.",
  InvalidDbcPool: "The selected trading pool does not match this asset.",
  DbcSlippageExceeded: "Trading slippage exceeded the safety limit. Try a smaller amount or adjust slippage.",
};

function humanizeVariant(v: string): string {
  return VARIANT_MESSAGES[v] ?? `Rejected by the program: ${v}`;
}

/** Builds the numeric error code -> variant name map from the IDL. */
export function buildErrorMap(): Map<number, string> {
  const m = new Map<number, string>();
  for (const e of ((idl as any).errors ?? []) as any[]) {
    m.set(Number(e.code), String(e.name));
  }
  return m;
}

/**
 * Mirrors fixed_point.rs calculate_protocol_fee.
 * Floor division: fee = (borrow_amount * fee_bps) / 10_000.
 */
export function calculateProtocolFee(
  borrowAmount: bigint,
  feeBps = 25,
  feeEnabled = true
): { fee: bigint; netDisbursed: bigint } {
  if (!feeEnabled || feeBps === 0 || borrowAmount === 0n) {
    return { fee: 0n, netDisbursed: borrowAmount };
  }
  const fee = (borrowAmount * BigInt(feeBps)) / 10000n;
  const netDisbursed = borrowAmount > fee ? borrowAmount - fee : 0n;
  return { fee, netDisbursed };
}

/**
 * Verifies message integrity between pre-signed and post-signed transactions.
 * Returns true if the message bytes are identical, false if mutated.
 */
export function verifyMessageIntegrity(
  preMessage: Uint8Array,
  postMessage: Uint8Array
): boolean {
  if (preMessage.length !== postMessage.length) return false;
  return preMessage.every((b, i) => b === postMessage[i]);
}

export async function sendInstructions(
  conn: Connection,
  wallet: {
    publicKey: PublicKey;
    signTransaction: (t: Transaction) => Promise<Transaction>;
  },
  ixs: TransactionInstruction[],
  /**
   * Stage callbacks so the UI can report real progress rather than showing one
   * undifferentiated spinner.
   */
  hooks: { onSigned?: () => void; onSent?: () => void } = {}
): Promise<string> {
  const tx = new Transaction().add(...ixs);
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = wallet.publicKey;

  // 1. Freeze intended transaction message bytes before signing
  const preMessage = tx.serializeMessage();

  // 2. Request wallet signature
  const signed = await wallet.signTransaction(tx);

  // 3. Verify message integrity: ensure no extension or proxy altered the payload
  const postMessage = signed.serializeMessage();
  if (!verifyMessageIntegrity(preMessage, postMessage)) {
    throw new Error(
      "SECURITY ALERT: Transaction message was mutated during signing (instructions, fee payer, or accounts modified). Submission rejected."
    );
  }

  // 4. Cryptographic signature check
  if (!signed.verifySignatures()) {
    throw new Error("SECURITY ALERT: Transaction signature verification failed.");
  }

  hooks.onSigned?.();

  // 5. Block stale transactions: check if blockhash expired before broadcast
  const currentBlockHeight = await conn.getBlockHeight("confirmed");
  if (currentBlockHeight > lastValidBlockHeight) {
    throw new Error(
      "Transaction blockhash expired before broadcast. Rebuild and sign a fresh transaction."
    );
  }

  const sig = await conn.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
  });
  hooks.onSent?.();

  await conn.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed"
  );
  return sig;
}

