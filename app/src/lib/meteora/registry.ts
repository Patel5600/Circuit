/**
 * Circuit Protocol — Meteora DBC Pool Registry
 *
 * CANONICAL SOURCE OF TRUTH for all DBC pool addresses used by Circuit.
 *
 * SECURITY INVARIANTS:
 * 1. All pool addresses in this registry are the ONLY valid addresses for DBC actions.
 * 2. No user input, agent output, or RPC response may introduce a pool address not in this registry.
 * 3. All pool programId fields MUST equal METEORA_DBC_PROGRAM_ID at validation time.
 * 4. Pools not in this registry must return "DBC_POOL_NOT_REGISTERED" permission code.
 *
 * Pool addresses are derived deterministically via PDA seeds:
 *   [b"pool", baseMint.toBuffer(), quoteMint.toBuffer()] against METEORA_DBC_PROGRAM_ID
 *
 * Until real Devnet pools are created and verified, lifecycle state is "VIRTUAL_POOL"
 * and availability is "NOT_CONFIGURED". Circuit does not pretend DBC pools exist
 * when they have not been on-chain verified.
 */

import { PublicKey } from "@solana/web3.js";
import { METEORA_DBC_PROGRAM_ID } from "./dbc";

// ── Pool Lifecycle State Machine ──────────────────────────────────────────────
export type DbcPoolLifecycle =
  | "VIRTUAL_POOL"       // Pool initialized but not yet active (price discovery phase)
  | "ACTIVE_TRADING"     // Pool is live with active liquidity
  | "THRESHOLD_REACHED"  // Graduation threshold hit; migration pending
  | "GRADUATION"         // Migrating to DAMM v2
  | "DAMM_V2"            // Pool has graduated to full AMM
  | "UNKNOWN";           // Cannot determine lifecycle from on-chain state

// ── Pool Registry Entry ───────────────────────────────────────────────────────
export interface DbcPoolRegistryEntry {
  /** Canonical pool address (PDA) on Solana */
  poolAddress: string;
  /** Authoritative pool config PDA */
  configAddress: string;
  /** Base token mint */
  baseMint: string;
  /** Quote token mint */
  quoteMint: string;
  /** Base token decimals */
  baseDecimals: number;
  /** Quote token decimals */
  quoteDecimals: number;
  /** Must equal METEORA_DBC_PROGRAM_ID at validation time */
  programId: string;
  /** Network environment */
  environment: "devnet" | "mainnet";
  /** Current lifecycle state — read from on-chain if possible, else "UNKNOWN" */
  lifecycleState: DbcPoolLifecycle;
  /** Market symbol this pool corresponds to (e.g. "NVDA") */
  symbol: string;
  /** ISO timestamp when this entry was last manually verified */
  configuredAt: string;
}

// ── PDA Derivation Helper ─────────────────────────────────────────────────────
// Uses official Meteora DBC PDA seed specification:
// [b"pool", config.toBuffer(), max(quote, base), min(quote, base)]
export function deriveDbcPoolAddressFromConfig(
  quoteMintB58: string,
  baseMintB58: string,
  configB58: string
): string {
  try {
    const quoteMint = new PublicKey(quoteMintB58);
    const baseMint = new PublicKey(baseMintB58);
    const config = new PublicKey(configB58);
    const isQuoteBigger = quoteMint.toBuffer().compare(new Uint8Array(baseMint.toBuffer())) > 0;
    const [pda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("pool"),
        config.toBuffer(),
        isQuoteBigger ? quoteMint.toBuffer() : baseMint.toBuffer(),
        isQuoteBigger ? baseMint.toBuffer() : quoteMint.toBuffer(),
      ],
      METEORA_DBC_PROGRAM_ID
    );
    return pda.toBase58();
  } catch (err) {
    throw new Error(
      `[DbcRegistry] Failed to derive pool address for ${baseMintB58}/${quoteMintB58} with config ${configB58}: ${err}`
    );
  }
}

// ── Canonical Registry ────────────────────────────────────────────────────────
// Verified on-chain on Solana Devnet (Program: dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN)
export const DBC_POOL_REGISTRY: ReadonlyArray<DbcPoolRegistryEntry> = Object.freeze([
  {
    poolAddress: "DoB7NjeFMy8fW4Ah6QktZAeT4fBLnBebkhVKDxWphW3j",
    configAddress: "18BLLVHnmv39ykATnxicYFkv4p1emHrpKh2mS1XiuYz",
    baseMint: "5S61p3XQVTTcWhxweWFVn7XfMh352PMn3N7KwnBhE6aG",
    quoteMint: "So11111111111111111111111111111111111111112",
    baseDecimals: 9,
    quoteDecimals: 9,
    programId: METEORA_DBC_PROGRAM_ID.toBase58(),
    environment: "devnet",
    lifecycleState: "ACTIVE_TRADING",
    symbol: "NVDA",
    configuredAt: "2026-09-21T15:25:00.000Z",
  },
  {
    poolAddress: "2DW3bpqT6QMpM7vKbYDKJM8wrJsXhw9eQPRd1WZJjfdM",
    configAddress: "18EqcYefWc2czMGEVRbfEs1URCAuAUmQu9jW3fWehd5",
    baseMint: "BYDjS68F4f7eXdFtZmAPKKgTDqUGyjAbakVpaE47tGuM",
    quoteMint: "So11111111111111111111111111111111111111112",
    baseDecimals: 9,
    quoteDecimals: 9,
    programId: METEORA_DBC_PROGRAM_ID.toBase58(),
    environment: "devnet",
    lifecycleState: "VIRTUAL_POOL",
    symbol: "AAPL",
    configuredAt: "2026-09-21T15:25:00.000Z",
  },
  {
    poolAddress: "2jXET9NNt3Zoc6vafZm5UutbFTxHs2rTKTVzP4FmuK5R",
    configAddress: "19KSS5xVFiW6C3JqRiGa6JGmMbNEoU6jS4stmsJuScF",
    baseMint: "3qGtEupUfckWHcTHjKUaRwEkXz4qJKWcz1PZ3ShVp9Tz",
    quoteMint: "So11111111111111111111111111111111111111112",
    baseDecimals: 6,
    quoteDecimals: 9,
    programId: METEORA_DBC_PROGRAM_ID.toBase58(),
    environment: "devnet",
    lifecycleState: "VIRTUAL_POOL",
    symbol: "MSFT",
    configuredAt: "2026-09-21T15:25:00.000Z",
  },
]) as ReadonlyArray<DbcPoolRegistryEntry>;

// ── Registry Index ────────────────────────────────────────────────────────────
/** Look up a registry entry by market symbol (e.g. "NVDA") */
export function getPoolBySymbol(symbol: string): DbcPoolRegistryEntry | null {
  return DBC_POOL_REGISTRY.find((e) => e.symbol === symbol) ?? null;
}

/** Look up a registry entry by pool address (base58) */
export function getPoolByAddress(poolAddress: string): DbcPoolRegistryEntry | null {
  return DBC_POOL_REGISTRY.find((e) => e.poolAddress === poolAddress) ?? null;
}

/** Returns all symbols that have a registered DBC pool */
export function getRegisteredDbcSymbols(): string[] {
  return DBC_POOL_REGISTRY.map((e) => e.symbol);
}

// ── Validation ────────────────────────────────────────────────────────────────
/**
 * Validates a registry entry against canonical constants.
 * - programId must equal METEORA_DBC_PROGRAM_ID
 * - poolAddress must be non-empty
 * - baseMint and quoteMint must not be equal
 */
export function validatePoolRegistryEntry(entry: DbcPoolRegistryEntry): {
  valid: boolean;
  reason?: string;
} {
  const canonicalProgramId = METEORA_DBC_PROGRAM_ID.toBase58();
  if (entry.programId !== canonicalProgramId) {
    return {
      valid: false,
      reason: `programId mismatch: got ${entry.programId}, expected ${canonicalProgramId}`,
    };
  }
  if (entry.baseMint === entry.quoteMint) {
    return { valid: false, reason: "baseMint and quoteMint must be different" };
  }
  if (!entry.poolAddress || entry.poolAddress.length < 32) {
    return { valid: false, reason: "invalid poolAddress" };
  }
  if (!entry.symbol || entry.symbol.length === 0) {
    return { valid: false, reason: "symbol is required" };
  }
  return { valid: true };
}

/** Validate all registry entries at module load. Throws on invariant violation. */
function assertRegistryValid(): void {
  for (const entry of DBC_POOL_REGISTRY) {
    const result = validatePoolRegistryEntry(entry);
    if (!result.valid) {
      throw new Error(
        `[DbcRegistry] Invalid pool registry entry for ${entry.symbol}: ${result.reason}`
      );
    }
  }
}

// Validate at module load time
assertRegistryValid();
