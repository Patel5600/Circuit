/**
 * Circuit Protocol - Risk Envelope Instruction Builders & PDA Derivation
 *
 * Dedicated capability token interface for short-lived, bounded risk execution.
 * Derives canonical PDAs and builds strict onchain instructions for:
 * - authorizeAction: authorizes a scoped action capability and mints a short-lived RiskEnvelope PDA
 * - consumeEnvelope: consumes an authorized RiskEnvelope capability token
 * - closeEnvelope: closes an expired or consumed RiskEnvelope account and refunds rent to owner
 */

import {
  Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { BN, Program } from "@anchor-lang/core";
import { PROGRAM_ID, PYTH_FEED_ID } from "../config";

// ── Execution Venue Identifiers ─────────────────────────────────────────────
export const VENUE_CREDIT = 0;
export const VENUE_METEORA_DBC = 1;
export const VENUE_TRADING = 2;

export const VENUE_LABELS: Record<number, string> = {
  [VENUE_CREDIT]: "Credit",
  [VENUE_METEORA_DBC]: "Meteora DBC",
  [VENUE_TRADING]: "Trading",
};

export function getVenueLabel(venue: number): string {
  return VENUE_LABELS[venue] ?? `Unknown Venue (${venue})`;
}

// ── Envelope Action Identifiers ─────────────────────────────────────────────
export const ENVELOPE_ACTION_BORROW = 1;
export const ENVELOPE_ACTION_WITHDRAW = 2;
export const ENVELOPE_ACTION_SWAP = 3;
export const ENVELOPE_ACTION_ENTER_LIQUIDITY = 4;
export const ENVELOPE_ACTION_EXIT_LIQUIDITY = 5;
export const ENVELOPE_ACTION_REBALANCE = 6;
export const ENVELOPE_ACTION_REPAY = 7;
export const ENVELOPE_ACTION_DEPOSIT = 8;

export const ACTION_LABELS: Record<number, string> = {
  [ENVELOPE_ACTION_BORROW]: "Borrow",
  [ENVELOPE_ACTION_WITHDRAW]: "Withdraw",
  [ENVELOPE_ACTION_SWAP]: "Swap",
  [ENVELOPE_ACTION_ENTER_LIQUIDITY]: "Enter Liquidity",
  [ENVELOPE_ACTION_EXIT_LIQUIDITY]: "Exit Liquidity",
  [ENVELOPE_ACTION_REBALANCE]: "Rebalance",
  [ENVELOPE_ACTION_REPAY]: "Repay",
  [ENVELOPE_ACTION_DEPOSIT]: "Deposit",
};

export const ENVELOPE_ACTION_LABELS = ACTION_LABELS;

export function getActionLabel(action: number): string {
  return ACTION_LABELS[action] ?? `Unknown Action (${action})`;
}

// ── Slot TTL Constants ──────────────────────────────────────────────────────
export const DEFAULT_ENVELOPE_TTL_SLOTS = 20; // ~8 seconds on Solana
export const MAX_ENVELOPE_TTL_SLOTS = 100;     // ~40 seconds maximum

// ── Discriminator & Account Sizes ───────────────────────────────────────────
export const RISK_ENVELOPE_DISCRIMINATOR = new Uint8Array([
  51, 97, 24, 200, 134, 168, 42, 85,
]);
export const RISK_ENVELOPE_DISCRIMINATOR_BASE58 = "9bSifPe6Yct";
export const RISK_ENVELOPE_DATA_SIZE = 195;
export const RISK_ENVELOPE_ACCOUNT_SIZE = 8 + RISK_ENVELOPE_DATA_SIZE; // 203

// ── PDA Derivations ─────────────────────────────────────────────────────────

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

/**
 * Converts a 64-bit integer nonce into 8-byte little-endian Uint8Array.
 * Matches Rust's `&nonce.to_le_bytes()`.
 */
export function nonceToLeBytes(nonce: bigint | BN | number): Uint8Array {
  const n = BigInt(nonce.toString());
  const buf = new Uint8Array(8);
  const view = new DataView(buf.buffer);
  view.setBigUint64(0, n, true);
  return buf;
}

export const u64LeBytes = nonceToLeBytes;

export const protocolConfigPda = (programId: PublicKey = PROGRAM_ID): PublicKey =>
  PublicKey.findProgramAddressSync([utf8("protocol")], programId)[0];
export const deriveProtocolConfigPda = protocolConfigPda;

export const assetConfigPda = (
  mint: PublicKey,
  programId: PublicKey = PROGRAM_ID
): PublicKey =>
  PublicKey.findProgramAddressSync([utf8("asset"), mint.toBuffer()], programId)[0];
export const deriveAssetConfigPda = assetConfigPda;

export const riskRatchetPda = (
  feedHex: string = PYTH_FEED_ID,
  programId: PublicKey = PROGRAM_ID
): PublicKey =>
  PublicKey.findProgramAddressSync([utf8("ratchet"), feedIdBytes(feedHex)], programId)[0];
export const deriveRiskRatchetPda = riskRatchetPda;

export const positionPda = (
  owner: PublicKey,
  mint: PublicKey,
  programId: PublicKey = PROGRAM_ID
): PublicKey =>
  PublicKey.findProgramAddressSync(
    [utf8("position"), owner.toBuffer(), mint.toBuffer()],
    programId
  )[0];
export const derivePositionPda = positionPda;

export const agentAuthorityPda = (
  owner: PublicKey,
  agent: PublicKey,
  mint: PublicKey,
  programId: PublicKey = PROGRAM_ID
): PublicKey =>
  PublicKey.findProgramAddressSync(
    [utf8("authority"), owner.toBuffer(), agent.toBuffer(), mint.toBuffer()],
    programId
  )[0];
export const deriveAgentAuthorityPda = agentAuthorityPda;

/**
 * Derives the canonical RiskEnvelope PDA address.
 * Seeds: [b"envelope", owner.as_ref(), actor.as_ref(), asset_mint.as_ref(), &nonce.to_le_bytes()]
 */
export const riskEnvelopePda = (
  owner: PublicKey,
  actor: PublicKey,
  assetMint: PublicKey,
  nonce: bigint | BN | number,
  programId: PublicKey = PROGRAM_ID
): PublicKey => {
  return PublicKey.findProgramAddressSync(
    [
      utf8("envelope"),
      owner.toBuffer(),
      actor.toBuffer(),
      assetMint.toBuffer(),
      nonceToLeBytes(nonce),
    ],
    programId
  )[0];
};

/**
 * Derives the canonical RiskEnvelope PDA address and bump seed.
 */
export const findRiskEnvelopePda = (
  owner: PublicKey,
  actor: PublicKey,
  assetMint: PublicKey,
  nonce: bigint | BN | number,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] => {
  return PublicKey.findProgramAddressSync(
    [
      utf8("envelope"),
      owner.toBuffer(),
      actor.toBuffer(),
      assetMint.toBuffer(),
      nonceToLeBytes(nonce),
    ],
    programId
  );
};

export const findEnvelopePda = riskEnvelopePda;

// ── Onchain Account Representation & Readers ────────────────────────────────

export type EnvelopeMarketState = "safe" | "restricted" | "defensive" | "emergency";

export interface RiskEnvelopeView {
  address?: PublicKey;
  publicKey?: PublicKey;
  owner: PublicKey;
  actor: PublicKey;
  assetMint: PublicKey;
  venue: number;
  venueLabel?: string;
  action: number;
  actionLabel?: string;
  maxNotional: bigint;
  maxLtvBps: number | bigint;
  maxSlippageBps: number | bigint;
  riskState: EnvelopeMarketState;
  oracleFreshness: bigint;
  confidenceLimitBps: bigint | number;
  oraclePrice: bigint;
  oracleExpo: number;
  policyVersion: number;
  riskEpoch: bigint;
  authorizedAtSlot: bigint;
  expiresAtSlot: bigint;
  nonce: bigint;
  consumed: boolean;
  consumedAtSlot: bigint;
  bump: number;
}

export type EnvelopeView = RiskEnvelopeView;

export function decodeRiskEnvelopeBuffer(
  buf: Buffer | Uint8Array,
  address?: PublicKey
): RiskEnvelopeView & { address: PublicKey; venueLabel: string; actionLabel: string } {
  const data = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  const offset = data.length >= RISK_ENVELOPE_ACCOUNT_SIZE ? 8 : 0;
  const view = new DataView(data.buffer, data.byteOffset + offset, data.byteLength - offset);

  const owner = new PublicKey(data.subarray(offset + 0, offset + 32));
  const actor = new PublicKey(data.subarray(offset + 32, offset + 64));
  const assetMint = new PublicKey(data.subarray(offset + 64, offset + 96));
  const venue = view.getUint8(96);
  const action = view.getUint8(97);
  const maxNotional = view.getBigUint64(98, true);
  const maxLtvBps = Number(view.getBigUint64(106, true));
  const maxSlippageBps = Number(view.getBigUint64(114, true));

  const stateByte = view.getUint8(122);
  const stateMap: Record<number, EnvelopeMarketState> = {
    0: "safe",
    1: "restricted",
    2: "defensive",
    3: "emergency",
  };
  const riskState = stateMap[stateByte] ?? "emergency";

  const oracleFreshness = view.getBigUint64(123, true);
  const confidenceLimitBps = view.getBigUint64(131, true);
  const oraclePrice = view.getBigInt64(139, true);
  const oracleExpo = view.getInt32(147, true);
  const policyVersion = view.getUint16(151, true);
  const riskEpoch = view.getBigUint64(153, true);
  const authorizedAtSlot = view.getBigUint64(161, true);
  const expiresAtSlot = view.getBigUint64(169, true);
  const nonce = view.getBigUint64(177, true);
  const consumed = view.getUint8(185) !== 0;
  const consumedAtSlot = view.getBigUint64(186, true);
  const bump = view.getUint8(194);

  const resolvedAddress = address ?? riskEnvelopePda(owner, actor, assetMint, nonce);

  return {
    address: resolvedAddress,
    publicKey: resolvedAddress,
    owner,
    actor,
    assetMint,
    venue,
    venueLabel: getVenueLabel(venue),
    action,
    actionLabel: getActionLabel(action),
    maxNotional,
    maxLtvBps,
    maxSlippageBps,
    riskState,
    oracleFreshness,
    confidenceLimitBps,
    oraclePrice,
    oracleExpo,
    policyVersion,
    riskEpoch,
    authorizedAtSlot,
    expiresAtSlot,
    nonce,
    consumed,
    consumedAtSlot,
    bump,
  };
}

export function decodeRiskEnvelope(
  input: any,
  address?: PublicKey
): RiskEnvelopeView & { address: PublicKey; venueLabel: string; actionLabel: string } {
  if (
    Buffer.isBuffer(input) ||
    input instanceof Uint8Array ||
    (input && (input.data || input.buffer))
  ) {
    const raw = input.data ? input.data : input;
    return decodeRiskEnvelopeBuffer(raw, address);
  }

  const owner: PublicKey = input.owner;
  const actor: PublicKey = input.actor;
  const assetMint: PublicKey = input.assetMint ?? input.asset_mint;
  const venue: number = Number(input.venue);
  const action: number = Number(input.action);
  const maxNotional: bigint = BigInt((input.maxNotional ?? input.max_notional ?? 0).toString());
  const maxLtvBps: number = Number(input.maxLtvBps ?? input.max_ltv_bps ?? 0);
  const maxSlippageBps: number = Number(input.maxSlippageBps ?? input.max_slippage_bps ?? 0);
  let riskState: EnvelopeMarketState = "emergency";
  if (typeof input.riskState === "string") {
    riskState = input.riskState.toLowerCase() as EnvelopeMarketState;
  } else if (typeof input.risk_state === "string") {
    riskState = input.risk_state.toLowerCase() as EnvelopeMarketState;
  } else if (input.riskState && typeof input.riskState === "object") {
    riskState = (Object.keys(input.riskState)[0]?.toLowerCase() ?? "emergency") as EnvelopeMarketState;
  } else if (input.risk_state && typeof input.risk_state === "object") {
    riskState = (Object.keys(input.risk_state)[0]?.toLowerCase() ?? "emergency") as EnvelopeMarketState;
  }

  const oracleFreshness: bigint = BigInt((input.oracleFreshness ?? input.oracle_freshness ?? 0).toString());
  const confidenceLimitBps: bigint = BigInt(
    (input.confidenceLimitBps ?? input.confidence_limit_bps ?? 0).toString()
  );
  const oraclePrice: bigint = BigInt((input.oraclePrice ?? input.oracle_price ?? 0).toString());
  const oracleExpo: number = Number(input.oracleExpo ?? input.oracle_expo ?? 0);
  const policyVersion: number = Number(input.policyVersion ?? input.policy_version ?? 0);
  const riskEpoch: bigint = BigInt((input.riskEpoch ?? input.risk_epoch ?? 0).toString());
  const authorizedAtSlot: bigint = BigInt((input.authorizedAtSlot ?? input.authorized_at_slot ?? 0).toString());
  const expiresAtSlot: bigint = BigInt((input.expiresAtSlot ?? input.expires_at_slot ?? 0).toString());
  const nonce: bigint = BigInt((input.nonce ?? 0).toString());
  const consumed: boolean = Boolean(input.consumed);
  const consumedAtSlot: bigint = BigInt((input.consumedAtSlot ?? input.consumed_at_slot ?? 0).toString());
  const bump: number = Number(input.bump ?? 0);

  const resolvedAddress = address ?? riskEnvelopePda(owner, actor, assetMint, nonce);

  return {
    address: resolvedAddress,
    publicKey: resolvedAddress,
    owner,
    actor,
    assetMint,
    venue,
    venueLabel: getVenueLabel(venue),
    action,
    actionLabel: getActionLabel(action),
    maxNotional,
    maxLtvBps,
    maxSlippageBps,
    riskState,
    oracleFreshness,
    confidenceLimitBps,
    oraclePrice,
    oracleExpo,
    policyVersion,
    riskEpoch,
    authorizedAtSlot,
    expiresAtSlot,
    nonce,
    consumed,
    consumedAtSlot,
    bump,
  };
}

function decodeAccountData<T>(
  program: Program,
  name: string,
  info: { data: Uint8Array | Buffer } | null | undefined,
  map: (raw: any) => T
): T | null {
  if (!info) return null;
  try {
    const buf = Buffer.isBuffer(info.data) ? info.data : Buffer.from(info.data);
    const raw = program.coder.accounts.decode(name, buf);
    return map(raw);
  } catch (e) {
    console.warn(`failed to decode ${name}`, e);
    return null;
  }
}

export function decodeRiskEnvelopeView(
  program: Program,
  info: { data: Uint8Array | Buffer } | null | undefined
): RiskEnvelopeView | null;
export function decodeRiskEnvelopeView(
  program: Program,
  pubkey: PublicKey,
  info: { data: Uint8Array | Buffer } | null | undefined
): RiskEnvelopeView | null;
export function decodeRiskEnvelopeView(
  program: Program,
  arg2: PublicKey | { data: Uint8Array | Buffer } | null | undefined,
  arg3?: { data: Uint8Array | Buffer } | null | undefined
): RiskEnvelopeView | null {
  const isPubkey = arg2 instanceof PublicKey;
  const pubkey: PublicKey | undefined = isPubkey ? arg2 : undefined;
  const info = isPubkey ? arg3 : arg2;
  if (!info || !info.data) return null;

  try {
    return decodeRiskEnvelope(info.data, pubkey);
  } catch {
    return decodeAccountData(program, "RiskEnvelope", info, (r) => {
      const owner = r.owner;
      const actor = r.actor;
      const assetMint = r.assetMint ?? r.asset_mint;
      const nonce = BigInt(r.nonce.toString());
      const resolvedAddress = pubkey ?? riskEnvelopePda(owner, actor, assetMint, nonce);
      const venue = Number(r.venue);
      const action = Number(r.action);
      return {
        address: resolvedAddress,
        publicKey: resolvedAddress,
        owner,
        actor,
        assetMint,
        venue,
        venueLabel: getVenueLabel(venue),
        action,
        actionLabel: getActionLabel(action),
        maxNotional: BigInt((r.maxNotional ?? r.max_notional).toString()),
        maxLtvBps: Number(r.maxLtvBps ?? r.max_ltv_bps),
        maxSlippageBps: Number(r.maxSlippageBps ?? r.max_slippage_bps),
        riskState: (typeof r.riskState === "string"
          ? r.riskState.toLowerCase()
          : typeof r.risk_state === "string"
          ? r.risk_state.toLowerCase()
          : (Object.keys(r.riskState ?? r.risk_state ?? {})[0] ?? "emergency").toLowerCase()) as EnvelopeMarketState,
        oracleFreshness: BigInt((r.oracleFreshness ?? r.oracle_freshness).toString()),
        confidenceLimitBps: BigInt((r.confidenceLimitBps ?? r.confidence_limit_bps).toString()),
        oraclePrice: BigInt((r.oraclePrice ?? r.oracle_price).toString()),
        oracleExpo: Number(r.oracleExpo ?? r.oracle_expo),
        policyVersion: Number(r.policyVersion ?? r.policy_version),
        riskEpoch: BigInt((r.riskEpoch ?? r.risk_epoch).toString()),
        authorizedAtSlot: BigInt((r.authorizedAtSlot ?? r.authorized_at_slot).toString()),
        expiresAtSlot: BigInt((r.expiresAtSlot ?? r.expires_at_slot).toString()),
        nonce,
        consumed: Boolean(r.consumed),
        consumedAtSlot: BigInt((r.consumedAtSlot ?? r.consumed_at_slot).toString()),
        bump: Number(r.bump),
      };
    });
  }
}

export const decodeEnvelopeView = decodeRiskEnvelopeView;

export async function fetchRiskEnvelope(
  program: Program,
  conn: Connection,
  address: PublicKey
): Promise<RiskEnvelopeView | null> {
  if (!conn || !program || !address) return null;
  try {
    const info = await conn.getAccountInfo(address).catch((err) => {
      console.warn(`failed to fetch risk envelope at ${address.toBase58()}:`, err?.message || err);
      return null;
    });
    return decodeRiskEnvelopeView(program, address, info);
  } catch (e) {
    console.warn(`failed to decode risk envelope at ${address.toBase58()}`, e);
    return null;
  }
}

// ── Lifecycle & Status Helpers ──────────────────────────────────────────────

function toBigIntSlot(val: bigint | number | undefined | null): bigint {
  if (val === null || val === undefined) return 0n;
  if (typeof val === "bigint") return val;
  if (typeof val === "number") {
    if (!Number.isFinite(val) || isNaN(val) || val < 0) return 0n;
    return BigInt(Math.floor(val));
  }
  return 0n;
}

/**
 * Checks whether an envelope has strictly expired relative to the current slot.
 *
 * In Circuit Protocol, an envelope is expired if `currentSlot > expiresAtSlot`.
 * Returns true if envelope is null/undefined or its slot TTL has passed.
 */
export function isEnvelopeExpired(
  envelope: EnvelopeView | null | undefined,
  currentSlot: bigint | number
): boolean {
  if (!envelope || envelope.expiresAtSlot === undefined || envelope.expiresAtSlot === null) {
    return true;
  }
  const slot = toBigIntSlot(currentSlot);
  const expiresAt = toBigIntSlot(envelope.expiresAtSlot);
  return slot > expiresAt;
}

/**
 * Checks whether an envelope is currently active and valid for consumption.
 *
 * An envelope is active if it is not consumed and has not expired.
 */
export function isEnvelopeActive(
  envelope: EnvelopeView | null | undefined,
  currentSlot: bigint | number
): boolean {
  if (!envelope || Boolean(envelope.consumed)) return false;
  return !isEnvelopeExpired(envelope, currentSlot);
}

/**
 * Returns the number of slots remaining before the envelope strictly expires.
 *
 * Returns 0 if the envelope is null/undefined, consumed, or expired.
 */
export function getEnvelopeRemainingSlots(
  envelope: EnvelopeView | null | undefined,
  currentSlot: bigint | number
): number {
  if (!envelope || Boolean(envelope.consumed)) return 0;
  const slot = toBigIntSlot(currentSlot);
  const expiresAt = toBigIntSlot(envelope.expiresAtSlot);
  if (slot >= expiresAt) return 0;
  const remaining = Number(expiresAt - slot);
  return remaining > 0 ? remaining : 0;
}

export interface EnvelopeValidityStatus {
  status: "active" | "consumed" | "expired";
  label: string;
  color: string;
}

/**
 * Determines the lifecycle validity status, badge label, and UI color for an envelope.
 */
export function getEnvelopeValidityStatus(
  envelope: EnvelopeView | null | undefined,
  currentSlot: bigint | number
): EnvelopeValidityStatus {
  if (!envelope) {
    return {
      status: "expired",
      label: "Expired",
      color: "var(--danger)",
    };
  }

  if (Boolean(envelope.consumed)) {
    return {
      status: "consumed",
      label: "Consumed",
      color: "var(--text-2)",
    };
  }

  if (isEnvelopeExpired(envelope, currentSlot)) {
    return {
      status: "expired",
      label: "Expired",
      color: "var(--danger)",
    };
  }

  return {
    status: "active",
    label: "Active",
    color: "var(--success)",
  };
}

/**
 * Formats the maximum authorized notional amount of an envelope into a human-readable token amount string.
 *
 * Defaults to DECIMALS = 6. Trims trailing zero fractions while preserving significant figures.
 */
export function formatEnvelopeAmount(
  envelope: EnvelopeView | null | undefined,
  decimals: number = 6
): string {
  if (!envelope || envelope.maxNotional === undefined || envelope.maxNotional === null) {
    return "0";
  }

  let raw: bigint;
  try {
    raw = typeof envelope.maxNotional === "bigint"
      ? envelope.maxNotional
      : BigInt(String(envelope.maxNotional));
  } catch {
    return "0";
  }

  const dec = Math.max(0, Math.floor(decimals ?? 6));
  if (dec === 0) {
    return raw.toLocaleString("en-US");
  }

  const factor = 10n ** BigInt(dec);
  const isNegative = raw < 0n;
  const absRaw = isNegative ? -raw : raw;
  const whole = absRaw / factor;
  const fraction = absRaw % factor;

  const wholeStr = whole.toLocaleString("en-US");
  if (fraction === 0n) {
    return `${isNegative ? "-" : ""}${wholeStr}`;
  }

  const fracStr = fraction.toString().padStart(dec, "0").replace(/0+$/, "");
  return `${isNegative ? "-" : ""}${wholeStr}.${fracStr}`;
}

/**
 * Formats the envelope's maximum authorized LTV from basis points into a percentage string.
 *
 * E.g. 5000 bps -> "50%", 6550 bps -> "65.5%".
 */
export function formatEnvelopeLtv(
  envelope: EnvelopeView | null | undefined
): string {
  if (!envelope || envelope.maxLtvBps === undefined || envelope.maxLtvBps === null) {
    return "0%";
  }

  const bps = Number(envelope.maxLtvBps);
  if (!Number.isFinite(bps) || bps <= 0) {
    return "0%";
  }

  const pct = bps / 100;
  if (bps % 100 === 0) {
    return `${pct}%`;
  }

  return `${pct.toFixed(2).replace(/\.?0+$/, "")}%`;
}

/**
 * Fetches and decodes a single RiskEnvelope account by its PDA address.
 */
export async function fetchEnvelope(
  connection: Connection,
  program: Program,
  envelopePda: PublicKey
): Promise<EnvelopeView | null>;
export async function fetchEnvelope(
  program: Program,
  conn: Connection,
  address: PublicKey
): Promise<EnvelopeView | null>;
export async function fetchEnvelope(
  arg1: Connection | Program,
  arg2: Program | Connection,
  arg3: PublicKey
): Promise<EnvelopeView | null> {
  if (!arg1 || !arg2 || !arg3) return null;
  if (arg1 instanceof Connection || (arg1 && "getAccountInfo" in (arg1 as any))) {
    const conn = arg1 as Connection;
    const prog = arg2 as Program;
    return fetchRiskEnvelope(prog, conn, arg3);
  } else {
    const prog = arg1 as Program;
    const conn = arg2 as Connection;
    return fetchRiskEnvelope(prog, conn, arg3);
  }
}

/**
 * Fetches all RiskEnvelope accounts owned by the specified position owner.
 *
 * Uses memcmp filter on the 8-byte discriminator and owner pubkey at offset 8,
 * falling back to account size (203 bytes) + owner filter if the RPC provider restricts memcmp.
 */
export async function fetchAllEnvelopesForOwner(
  connection: Connection,
  program: Program,
  owner: PublicKey
): Promise<EnvelopeView[]> {
  if (!connection || !program || !owner) return [];
  const programId = program.programId ?? PROGRAM_ID;

  try {
    let accounts: readonly { pubkey: PublicKey; account: { data: Buffer | Uint8Array } }[] = [];

    try {
      accounts = await connection.getProgramAccounts(programId, {
        filters: [
          {
            memcmp: {
              offset: 0,
              bytes: RISK_ENVELOPE_DISCRIMINATOR_BASE58,
            },
          },
          {
            memcmp: {
              offset: 8,
              bytes: owner.toBase58(),
            },
          },
        ],
      });
    } catch (rpcErr) {
      console.warn("Memcmp discriminator filter failed, attempting size fallback:", rpcErr);
      try {
        accounts = await connection.getProgramAccounts(programId, {
          filters: [
            {
              dataSize: RISK_ENVELOPE_ACCOUNT_SIZE,
            },
            {
              memcmp: {
                offset: 8,
                bytes: owner.toBase58(),
              },
            },
          ],
        });
      } catch (fallbackErr) {
        console.warn("Fallback getProgramAccounts failed:", fallbackErr);
        return [];
      }
    }

    const envelopes: EnvelopeView[] = [];
    for (const acc of accounts) {
      try {
        const decoded = decodeRiskEnvelopeView(program, acc.pubkey, acc.account);
        if (decoded) {
          envelopes.push(decoded);
        }
      } catch (decodeErr) {
        console.warn(`failed to decode envelope at ${acc.pubkey.toBase58()}:`, decodeErr);
      }
    }

    // Sort by authorizedAtSlot descending (most recently authorized first)
    envelopes.sort((a, b) => {
      const aSlot = typeof a.authorizedAtSlot === "bigint" ? a.authorizedAtSlot : BigInt(a.authorizedAtSlot ?? 0);
      const bSlot = typeof b.authorizedAtSlot === "bigint" ? b.authorizedAtSlot : BigInt(b.authorizedAtSlot ?? 0);
      if (bSlot !== aSlot) {
        return bSlot > aSlot ? 1 : -1;
      }
      const aExp = typeof a.expiresAtSlot === "bigint" ? a.expiresAtSlot : BigInt(a.expiresAtSlot ?? 0);
      const bExp = typeof b.expiresAtSlot === "bigint" ? b.expiresAtSlot : BigInt(b.expiresAtSlot ?? 0);
      return bExp > aExp ? 1 : -1;
    });

    return envelopes;
  } catch (err) {
    console.warn(`failed to fetch all envelopes for owner ${owner.toBase58()}:`, err);
    return [];
  }
}

// ── Instruction Builders ────────────────────────────────────────────────────

export interface BuildAuthorizeActionParams {
  payer: PublicKey;
  owner: PublicKey;
  actor: PublicKey;
  assetMint: PublicKey;
  priceUpdate: PublicKey;
  action: number;
  venue: number;
  requestedAmount: bigint | BN | number;
  maxSlippageBps?: number;
  nonce: bigint | BN | number;
  ttlSlots?: number;
  position?: PublicKey;
  agentAuthority?: PublicKey;
  feedHex?: string;
}

/**
 * Builds an instruction to authorize a scoped action capability and mint a short-lived RiskEnvelope PDA.
 *
 * Evaluated strictly onchain by the canonical Risk Ratchet, Pyth oracle confidence,
 * reference market hours, and Circuit Permission Engine.
 */
export async function buildAuthorizeActionInstruction(
  program: Program,
  params: BuildAuthorizeActionParams
): Promise<TransactionInstruction> {
  const programId = program?.programId ?? PROGRAM_ID;
  const protocolConfig = protocolConfigPda(programId);
  const assetConfig = assetConfigPda(params.assetMint, programId);
  const riskRatchet = riskRatchetPda(params.feedHex ?? PYTH_FEED_ID, programId);
  const envelope = riskEnvelopePda(
    params.owner,
    params.actor,
    params.assetMint,
    params.nonce,
    programId
  );
  const position =
    params.position ?? positionPda(params.owner, params.assetMint, programId);
  const agentAuthority =
    params.agentAuthority ??
    agentAuthorityPda(params.owner, params.actor, params.assetMint, programId);

  return await (program.methods as any)
    .authorizeAction(
      params.action,
      params.venue,
      new BN(params.requestedAmount as any),
      new BN((params.maxSlippageBps ?? 0) as any),
      new BN(params.nonce as any),
      new BN((params.ttlSlots ?? 20) as any)
    )
    .accountsStrict({
      payer: params.payer,
      owner: params.owner,
      actor: params.actor,
      protocolConfig,
      assetConfig,
      riskRatchet,
      position,
      agentAuthority,
      envelope,
      priceUpdate: params.priceUpdate,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

export interface BuildConsumeEnvelopeParams {
  actor: PublicKey;
  envelope: PublicKey;
  feedHex?: string;
  action: number;
  venue: number;
  amount: bigint | BN | number;
}

/**
 * Builds an instruction to consume an authorized RiskEnvelope capability token.
 *
 * Verifies on-chain actor authorization, single-use consumption state, slot expiration,
 * live risk epoch consistency, action, venue, and notional limit.
 */
export async function buildConsumeEnvelopeInstruction(
  program: Program,
  params: BuildConsumeEnvelopeParams
): Promise<TransactionInstruction> {
  const programId = program?.programId ?? PROGRAM_ID;
  const riskRatchet = riskRatchetPda(params.feedHex ?? PYTH_FEED_ID, programId);

  return await (program.methods as any)
    .consumeEnvelope(
      params.action,
      params.venue,
      new BN(params.amount as any)
    )
    .accountsStrict({
      actor: params.actor,
      envelope: params.envelope,
      riskRatchet,
    })
    .instruction();
}

export interface BuildCloseEnvelopeParams {
  closer: PublicKey;
  owner: PublicKey;
  envelope: PublicKey;
}

/**
 * Builds an instruction to close an expired or consumed RiskEnvelope account and reclaim rent back to owner.
 *
 * Permissionless crank: any caller may close the account once it has been consumed
 * or its expiration slot has passed. Rent lamports are reclaimed back to the owner.
 */
export async function buildCloseEnvelopeInstruction(
  program: Program,
  params: BuildCloseEnvelopeParams
): Promise<TransactionInstruction> {
  return await (program.methods as any)
    .closeEnvelope()
    .accountsStrict({
      closer: params.closer,
      owner: params.owner,
      envelope: params.envelope,
    })
    .instruction();
}
