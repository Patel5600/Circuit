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
  /** Base token mint (the synthetic equity token, e.g. NVDAx) */
  baseMint: string;
  /** Quote token mint (e.g. USDC) */
  quoteMint: string;
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
// Used ONLY at module initialization time — not at runtime from user input.
function deriveDbcPoolAddressFromMints(
  baseMintB58: string,
  quoteMintB58: string
): string {
  try {
    const baseMint = new PublicKey(baseMintB58);
    const quoteMint = new PublicKey(quoteMintB58);
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), baseMint.toBuffer(), quoteMint.toBuffer()],
      METEORA_DBC_PROGRAM_ID
    );
    return pda.toBase58();
  } catch (err) {
    throw new Error(
      `[DbcRegistry] Failed to derive pool address for ${baseMintB58}/${quoteMintB58}: ${err}`
    );
  }
}

// ── Canonical Registry ────────────────────────────────────────────────────────
// Lifecycle "VIRTUAL_POOL" + availability "NOT_CONFIGURED" until Devnet pools are
// created and their addresses verified on-chain.
export const DBC_POOL_REGISTRY: ReadonlyArray<DbcPoolRegistryEntry> = Object.freeze([
  {
    poolAddress: deriveDbcPoolAddressFromMints(
      "CARqKy5GTCxz5G1tFiYA96A3Q8jaUE9Vppk7cjGJxRqq", // NVDAx
      "23hpSsK3h4na3pwSUf1YzaDF9nzX3t2PppJJf16Qpkxc"  // USDC
    ),
    baseMint: "CARqKy5GTCxz5G1tFiYA96A3Q8jaUE9Vppk7cjGJxRqq",
    quoteMint: "23hpSsK3h4na3pwSUf1YzaDF9nzX3t2PppJJf16Qpkxc",
    programId: METEORA_DBC_PROGRAM_ID.toBase58(),
    environment: "devnet",
    lifecycleState: "VIRTUAL_POOL",
    symbol: "NVDA",
    configuredAt: "2026-09-19T00:00:00.000Z",
  },
  {
    poolAddress: deriveDbcPoolAddressFromMints(
      "4zs2vg7MXYms9gwQxA6VYTZCfGy4NVyp1pca8TqdMmnS", // AAPLx
      "23hpSsK3h4na3pwSUf1YzaDF9nzX3t2PppJJf16Qpkxc"  // USDC
    ),
    baseMint: "4zs2vg7MXYms9gwQxA6VYTZCfGy4NVyp1pca8TqdMmnS",
    quoteMint: "23hpSsK3h4na3pwSUf1YzaDF9nzX3t2PppJJf16Qpkxc",
    programId: METEORA_DBC_PROGRAM_ID.toBase58(),
    environment: "devnet",
    lifecycleState: "VIRTUAL_POOL",
    symbol: "AAPL",
    configuredAt: "2026-09-19T00:00:00.000Z",
  },
  {
    poolAddress: deriveDbcPoolAddressFromMints(
      "gLjzboHgbevzEedufXfWyrgaFk7ePNLBKzRnpGbWpF2", // MSFTx
      "23hpSsK3h4na3pwSUf1YzaDF9nzX3t2PppJJf16Qpkxc"  // USDC
    ),
    baseMint: "gLjzboHgbevzEedufXfWyrgaFk7ePNLBKzRnpGbWpF2",
    quoteMint: "23hpSsK3h4na3pwSUf1YzaDF9nzX3t2PppJJf16Qpkxc",
    programId: METEORA_DBC_PROGRAM_ID.toBase58(),
    environment: "devnet",
    lifecycleState: "VIRTUAL_POOL",
    symbol: "MSFT",
    configuredAt: "2026-09-19T00:00:00.000Z",
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
