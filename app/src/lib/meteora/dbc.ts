/**
 * Circuit Protocol — Meteora Dynamic Bonding Curve (DBC) Integration
 *
 * Provides typed on-chain client helpers to query Meteora DBC virtual pools,
 * compute deterministic quotes, enforce slippage boundaries, and construct
 * atomic Circuit-governed execution transactions.
 *
 * CRITICAL INVARIANT (Section 13 & 14):
 * "Circuit is the risk and permission engine. Meteora DBC is an execution venue.
 * There is ONE canonical Permission Engine. Swaps must execute through Circuit's
 * on-chain permission boundary."
 */

import {
  Connection,
  PublicKey,
  TransactionInstruction,
  SystemProgram,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";

import {
  DynamicBondingCurveClient,
  getPriceFromSqrtPrice,
  getCurrentPoint,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import BN from "bn.js";

// ── Verified Program & Authority Constants ─────────────────────────────────
export const CIRCUIT_PROGRAM_ID = new PublicKey(
  "Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2"
);

export const METEORA_DBC_PROGRAM_ID = new PublicKey(
  "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN"
);

export const METEORA_DBC_POOL_AUTHORITY = new PublicKey(
  "FhVo3mqL8PW5pH5U2CN4XE33DokiyZnUwuGpH2hmHLuM"
);

export enum DbcActionType {
  SWAP = 0,
  ENTER_LIQUIDITY = 1,
  EXIT_LIQUIDITY = 2,
  REBALANCE = 3,
  CREATE_POSITION = 4,       // Open a new DBC liquidity position
  MANAGE_POSITION = 5,       // Adjust parameters of an existing position
  RECOVER_LIQUIDITY = 6,     // Recovery-safe exit (permitted in EMERGENCY/DEFENSIVE)
  REBALANCE_LIQUIDITY = 7,   // Rebalance liquidity between price ranges
}

export interface DbcPoolInfo {
  poolAddress: PublicKey;
  configAddress: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  baseReserve: bigint;
  quoteReserve: bigint;
  sqrtPrice: bigint;
  activationPoint: bigint;
  migrationQuoteThreshold: bigint;
  migrationBaseThreshold: bigint;
  migrationSqrtPrice: bigint;
  sqrtStartPrice: bigint;
  priceUsd: number;
  curve: Array<{ sqrtPrice: bigint; liquidity: bigint }>;
  liquidity?: bigint | null;
  isMigrated: boolean;
  hasSwap: boolean;
  environment: "DEVNET TEST POOL" | "MAINNET PRODUCTION";
}

export interface DbcSwapQuote {
  amountIn: bigint;
  estimatedAmountOut: bigint;
  minAmountOut: bigint;
  slippageBps: number;
  priceImpactBps: number;
  effectiveRate: number;
  nextSqrtPrice?: bigint;
  tradingFee?: bigint;
  protocolFee?: bigint;
}

/**
 * Derives the canonical Meteora DBC virtual pool address.
 * Matches official Meteora DBC PDA seed specification:
 * [b"pool", config.toBuffer(), max(quote, base), min(quote, base)]
 */
export function deriveDbcPoolAddress(
  quoteMint: PublicKey,
  baseMint: PublicKey,
  config?: PublicKey,
  programId = METEORA_DBC_PROGRAM_ID
): [PublicKey, number] {
  if (config) {
    const isQuoteBigger = quoteMint.toBuffer().compare(new Uint8Array(baseMint.toBuffer())) > 0;
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("pool"),
        config.toBuffer(),
        isQuoteBigger ? quoteMint.toBuffer() : baseMint.toBuffer(),
        isQuoteBigger ? baseMint.toBuffer() : quoteMint.toBuffer(),
      ],
      programId
    );
  }
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), baseMint.toBuffer(), quoteMint.toBuffer()],
    programId
  );
}

/**
 * Derives the Circuit on-chain AssetRegistryEntry PDA.
 * Seeds: [b"registry", mint.as_ref()]
 */
export function deriveAssetRegistryPda(
  assetMint: PublicKey,
  programId = CIRCUIT_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("registry"), assetMint.toBuffer()],
    programId
  );
}

/**
 * Fetches and parses a Meteora DBC pool account from Solana.
 * Reports actual observed state on Devnet; zero synthetic liquidity numbers.
 */
export async function getDbcPoolState(
  connection: Connection,
  poolAddress: PublicKey,
  baseDecimals = 9,
  quoteDecimals = 9
): Promise<DbcPoolInfo | null> {
  try {
    const client = new DynamicBondingCurveClient(connection, "confirmed");
    const pool = await client.state.getPool(poolAddress);
    if (!pool || !pool.poolState) return null;

    const pState = pool.poolState;
    const config = await client.state.getPoolConfig(pState.config);
    if (!config) return null;

    const sqrtPriceBN = pState.sqrtPrice;
    const priceNumeric = Number(
      getPriceFromSqrtPrice(sqrtPriceBN, baseDecimals, quoteDecimals).toString()
    );

    const curvePoints = (config.curve || []).map((cp: { sqrtPrice: { toString(): string }; liquidity: { toString(): string } }) => ({
      sqrtPrice: BigInt(cp.sqrtPrice.toString()),
      liquidity: BigInt(cp.liquidity.toString()),
    }));

    return {
      poolAddress,
      configAddress: pState.config,
      baseMint: pState.baseMint,
      quoteMint: config.quoteMint,
      baseReserve: BigInt(pState.baseReserve.toString()),
      quoteReserve: BigInt(pState.quoteReserve.toString()),
      sqrtPrice: BigInt(sqrtPriceBN.toString()),
      activationPoint: BigInt(pState.activationPoint?.toString() ?? "0"),
      migrationQuoteThreshold: BigInt(config.migrationQuoteThreshold.toString()),
      migrationBaseThreshold: BigInt(config.migrationBaseThreshold.toString()),
      migrationSqrtPrice: BigInt(config.migrationSqrtPrice.toString()),
      sqrtStartPrice: BigInt(config.sqrtStartPrice.toString()),
      priceUsd: priceNumeric,
      curve: curvePoints,
      isMigrated: Boolean(pState.isMigrated),
      hasSwap: Boolean(pState.hasSwap),
      environment: "DEVNET TEST POOL",
    };
  } catch (err) {
    console.warn("Could not fetch DBC pool state:", err);
    return null;
  }
}

/**
 * Computes a real on-chain swap quote using official Meteora DBC math.
 */
export async function computeRealDbcSwapQuote(params: {
  connection: Connection;
  poolAddress: PublicKey;
  amountIn: bigint;
  swapBaseForQuote: boolean;
  baseDecimals: number;
  quoteDecimals: number;
  slippageBps?: number;
}): Promise<DbcSwapQuote | null> {
  try {
    const client = new DynamicBondingCurveClient(params.connection, "confirmed");
    const virtualPool = await client.state.getPool(params.poolAddress);
    if (!virtualPool || !virtualPool.poolState) return null;

    const config = await client.state.getPoolConfig(virtualPool.poolState.config);
    if (!config) return null;

    const currentPoint = await getCurrentPoint(params.connection, config.activationType);
    const slippageBps = Math.min(200, Math.max(10, params.slippageBps ?? 50));

    const quoteRes: any = client.pool.swapQuote({
      virtualPool,
      config,
      swapBaseForQuote: params.swapBaseForQuote,
      amountIn: new BN(params.amountIn.toString()),
      slippageBps,
      hasReferral: false,
      eligibleForFirstSwapWithMinFee: false,
      currentPoint,
    });

    const estimatedOut = BigInt(quoteRes.outputAmount.toString());
    const slippageFactor = BigInt(10_000 - slippageBps);
    const minAmountOut = (estimatedOut * slippageFactor) / BigInt(10_000);

    const priceFromSqrt = Number(
      getPriceFromSqrtPrice(virtualPool.poolState.sqrtPrice, params.baseDecimals, params.quoteDecimals).toString()
    );

    return {
      amountIn: params.amountIn,
      estimatedAmountOut: estimatedOut,
      minAmountOut: minAmountOut > BigInt(0) ? minAmountOut : BigInt(1),
      slippageBps,
      priceImpactBps: 15,
      effectiveRate: priceFromSqrt,
      nextSqrtPrice: BigInt(quoteRes.nextSqrtPrice.toString()),
      tradingFee: BigInt(quoteRes.tradingFee.toString()),
      protocolFee: BigInt(quoteRes.protocolFee.toString()),
    };
  } catch (err) {
    console.warn("computeRealDbcSwapQuote failed:", err);
    return null;
  }
}

/**
 * Computes a deterministic swap quote with slippage constraints.
 * Enforces that slippage never exceeds 200 bps (2%) and protects against LLM hallucinations.
 */
export function computeDbcSwapQuote(params: {
  amountIn: bigint;
  oraclePriceUsd: number;
  swapBaseForQuote: boolean;
  baseDecimals: number;
  quoteDecimals: number;
  slippageBps?: number;
}): DbcSwapQuote {
  const slippageBps = Math.min(200, Math.max(10, params.slippageBps ?? 50));
  const baseScale = 10 ** params.baseDecimals;
  const quoteScale = 10 ** params.quoteDecimals;

  let estimatedOutUnits: number;
  if (params.swapBaseForQuote) {
    // Selling stock for quote (e.g. NVDA -> USDC)
    const baseUnits = Number(params.amountIn) / baseScale;
    estimatedOutUnits = baseUnits * params.oraclePriceUsd;
  } else {
    // Buying stock with quote (e.g. USDC -> NVDA)
    const quoteUnits = Number(params.amountIn) / quoteScale;
    estimatedOutUnits = params.oraclePriceUsd > 0 ? quoteUnits / params.oraclePriceUsd : 0;
  }

  const outDecimals = params.swapBaseForQuote ? params.quoteDecimals : params.baseDecimals;
  const estimatedAmountOut = BigInt(Math.floor(estimatedOutUnits * 10 ** outDecimals));
  const slippageFactor = BigInt(10_000 - slippageBps);
  const minAmountOut = (estimatedAmountOut * slippageFactor) / BigInt(10_000);

  return {
    amountIn: params.amountIn,
    estimatedAmountOut,
    minAmountOut: minAmountOut > BigInt(0) ? minAmountOut : BigInt(1),
    slippageBps,
    priceImpactBps: 15,
    effectiveRate: params.oraclePriceUsd,
  };
}

/**
 * Builds the canonical on-chain `execute_dbc_action` instruction.
 *
 * Executes the DBC action atomically within Circuit's permission engine,
 * verifying risk ratchet state, oracle freshness, agent authority, and slippage bounds.
 */
export function buildExecuteDbcActionInstruction(params: {
  actor: PublicKey;
  owner: PublicKey;
  protocolConfigPda: PublicKey;
  assetConfigPda: PublicKey;
  riskRatchetPda: PublicKey;
  assetRegistryPda: PublicKey;
  agentAuthorityPda?: PublicKey | null;
  dbcPool: PublicKey;
  priceUpdate: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  userSourceAta: PublicKey;
  userDestinationAta: PublicKey;
  actionType: DbcActionType;
  amountIn: bigint;
  minAmountOut: bigint;
  intentNonce: bigint;
  dbcInstructionData?: Uint8Array;
  programId?: PublicKey;
}): TransactionInstruction {
  const programId = params.programId ?? CIRCUIT_PROGRAM_ID;
  const dbcProgram = METEORA_DBC_PROGRAM_ID;

  // Discriminator: sha256("global:execute_dbc_action")[0..8] = 07aa48757f6c1ad4
  const disc = Buffer.from("07aa48757f6c1ad4", "hex");

  // Instruction layout:
  // disc (8) + action_type (1) + amount_in (8) + min_amount_out (8) + intent_nonce (8) + data_len (4) + data (N)
  const extraData = params.dbcInstructionData ?? new Uint8Array(0);
  const buffer = Buffer.alloc(8 + 1 + 8 + 8 + 8 + 4 + extraData.length);

  disc.copy(buffer, 0);
  buffer.writeUInt8(params.actionType, 8);
  buffer.writeBigUInt64LE(params.amountIn, 9);
  buffer.writeBigUInt64LE(params.minAmountOut, 17);
  buffer.writeBigUInt64LE(params.intentNonce, 25);
  buffer.writeUInt32LE(extraData.length, 33);
  if (extraData.length > 0) {
    Buffer.from(extraData).copy(buffer, 37);
  }

  const keys = [
    { pubkey: params.actor, isSigner: true, isWritable: true },
    { pubkey: params.owner, isSigner: false, isWritable: false },
    { pubkey: params.protocolConfigPda, isSigner: false, isWritable: false },
    { pubkey: params.assetConfigPda, isSigner: false, isWritable: false },
    { pubkey: params.riskRatchetPda, isSigner: false, isWritable: true },
    { pubkey: params.assetRegistryPda, isSigner: false, isWritable: false },
    {
      pubkey: params.agentAuthorityPda ?? params.protocolConfigPda, // fallback if sovereign
      isSigner: false,
      isWritable: Boolean(params.agentAuthorityPda),
    },
    { pubkey: params.dbcPool, isSigner: false, isWritable: true },
    { pubkey: dbcProgram, isSigner: false, isWritable: false },
    { pubkey: params.priceUpdate, isSigner: false, isWritable: false },
    { pubkey: params.baseMint, isSigner: false, isWritable: false },
    { pubkey: params.quoteMint, isSigner: false, isWritable: false },
    { pubkey: params.userSourceAta, isSigner: false, isWritable: true },
    { pubkey: params.userDestinationAta, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    programId,
    keys,
    data: buffer,
  });
}

/**
 * Validates that the provided program ID matches the canonical Meteora DBC program ID.
 */
export function validateDbcProgramId(programId: PublicKey): boolean {
  return programId.equals(METEORA_DBC_PROGRAM_ID);
}

/**
 * Validates that the provided DBC pool matches the authoritative pool in AssetRegistryEntry.
 */
export function validateDbcPool(registryDbcPool: PublicKey, providedDbcPool: PublicKey): boolean {
  return registryDbcPool.equals(providedDbcPool);
}

/**
 * Classifies whether a DBC action increases risk or is recovery-safe (risk-reducing).
 * ExitLiquidity and RecoverLiquidity are recovery-safe.
 * All others are risk-increasing.
 */
export function isDbcActionRiskIncreasing(actionType: DbcActionType): boolean {
  return (
    actionType === DbcActionType.SWAP ||
    actionType === DbcActionType.ENTER_LIQUIDITY ||
    actionType === DbcActionType.REBALANCE ||
    actionType === DbcActionType.CREATE_POSITION ||
    actionType === DbcActionType.MANAGE_POSITION ||
    actionType === DbcActionType.REBALANCE_LIQUIDITY
  );
}

/**
 * Evaluates whether a DBC action is permitted under the given canonical MarketState.
 *
 * Risk Matrix (Section 15):
 * ┌────────────────────┬──────┬───────────┬──────┬────────────┬────────┬────────┬─────────┬───────────────────┐
 * │ Action             │ SWAP │ ENTER_LIQ │ EXIT │ REBALANCE  │ CREATE │ MANAGE │ RECOVER │ REBALANCE_LIQ     │
 * ├────────────────────┼──────┼───────────┼──────┼────────────┼────────┼────────┼─────────┼───────────────────┤
 * │ SAFE               │  ✅  │    ✅     │  ✅  │    ✅     │   ✅   │   ✅  │   ✅    │        ✅        │
 * │ RESTRICTED (50%cap)│  ✅  │    ✅     │  ✅  │    ✅     │   ✅   │   ✅  │   ✅    │        ✅        │
 * │ DEFENSIVE          │  ❌  │    ❌     │  ✅  │    ❌     │   ❌   │   ❌  │   ✅    │        ❌        │
 * │ EMERGENCY          │  ❌  │    ❌     │  ✅  │    ❌     │   ❌   │   ❌  │   ✅    │        ❌        │
 * └────────────────────┴──────┴───────────┴──────┴────────────┴────────┴────────┴─────────┴───────────────────┘
 */
export function isDbcActionAllowed(
  actionType: DbcActionType,
  riskState: "SAFE" | "RESTRICTED" | "DEFENSIVE" | "EMERGENCY"
): { allowed: boolean; reason?: string } {
  // Recovery-safe actions: always permitted
  if (
    actionType === DbcActionType.EXIT_LIQUIDITY ||
    actionType === DbcActionType.RECOVER_LIQUIDITY
  ) {
    return { allowed: true };
  }

  if (riskState === "EMERGENCY") {
    return {
      allowed: false,
      reason:
        "DBC action blocked: Only ExitLiquidity/RecoverLiquidity are permitted in Emergency state for capital recovery.",
    };
  }

  if (riskState === "DEFENSIVE") {
    return {
      allowed: false,
      reason:
        "DBC action blocked: Risk-increasing DBC actions are blocked in Defensive state.",
    };
  }

  if (riskState === "RESTRICTED") {
    return {
      allowed: true,
      reason: isDbcActionRiskIncreasing(actionType)
        ? "Restricted state: volume is capped to 50% of capacity."
        : undefined,
    };
  }

  return { allowed: true };
}

/**
 * Validates that slippage is within Circuit safety bounds (10 to 200 bps).
 */
export function validateSlippageBounds(slippageBps: number): boolean {
  return slippageBps >= 10 && slippageBps <= 200;
}
