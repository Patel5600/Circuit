import { Connection, PublicKey } from "@solana/web3.js";

export const DEFAULT_FEED_ID = "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";
export const PYTH_FEED_ID = DEFAULT_FEED_ID;
export const PUSH_ORACLE_ID = new PublicKey("pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT");
export const PYTH_RECEIVER_ID = new PublicKey("rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ");
export const PYTH_PRICE_ACCOUNT: PublicKey | null = new PublicKey("7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE");

/**
 * Client-side Pyth integration.
 *
 * The protocol reads prices from on-chain `PriceUpdateV2` accounts, so the UI
 * reads exactly the same account rather than querying an off-chain API. That
 * means what the user sees is what the program will validate against - no
 * divergence between displayed price and settlement price.
 *
 * The layout and the sponsored-feed derivation here are verified against live
 * devnet accounts (see scripts/check-oracle.ts).
 */

/** Anchor discriminator: sha256("account:PriceUpdateV2")[0..8] */
const DISCRIMINATOR = new Uint8Array([34, 241, 35, 99, 157, 126, 244, 205]);

export interface PriceUpdate {
  feedId: string;
  price: bigint;
  conf: bigint;
  exponent: number;
  publishTime: bigint;
  /** The program requires VerificationLevel::Full. */
  isFull: boolean;
}

export interface OracleSnapshot {
  address: PublicKey;
  update: PriceUpdate;
  /** Seconds between publish time and the supplied reference time. */
  ageSeconds: number;
  /** Confidence as a fraction of price, in basis points. */
  confBps: number;
  /** Price as a float, expo applied. */
  priceUsd: number;
}

function feedIdBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length !== 64) {
    throw new Error(`feed id must be 32 bytes of hex, got ${clean.length} chars`);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(b: Uint8Array): string {
  return Array.from(b)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Derives a sponsored price-feed address.
 * Seeds: little endian u16 shard id, then the 32-byte feed id.
 */
export function derivePriceAccount(feedHex = DEFAULT_FEED_ID, shard = 0): PublicKey {
  const shardBytes = new Uint8Array(2);
  shardBytes[0] = shard & 0xff;
  shardBytes[1] = (shard >> 8) & 0xff;
  return PublicKey.findProgramAddressSync(
    [shardBytes, feedIdBytes(feedHex)],
    PUSH_ORACLE_ID
  )[0];
}

export function decodePriceUpdateV2(data: Uint8Array): PriceUpdate | null {
  if (data.length < 133) return null;
  for (let i = 0; i < 8; i++) {
    if (data[i] !== DISCRIMINATOR[i]) return null;
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let o = 8 + 32; // discriminator + write_authority

  const verificationLevel = data[o];
  // Borsh enum: Partial(0) carries a u8 payload; Full(1) carries nothing.
  o += verificationLevel === 1 ? 1 : 2;

  const feedId = bytesToHex(data.subarray(o, o + 32));
  o += 32;
  const price = view.getBigInt64(o, true);
  o += 8;
  const conf = view.getBigUint64(o, true);
  o += 8;
  const exponent = view.getInt32(o, true);
  o += 4;
  const publishTime = view.getBigInt64(o, true);

  return {
    feedId,
    price,
    conf,
    exponent,
    publishTime,
    isFull: verificationLevel === 1,
  };
}

function toSnapshot(
  address: PublicKey,
  update: PriceUpdate,
  referenceUnixSeconds: number
): OracleSnapshot {
  const abs = update.price < 0n ? -update.price : update.price;
  const confBps =
    abs === 0n ? -1 : Number((update.conf * 10_000n) / abs);
  return {
    address,
    update,
    ageSeconds: referenceUnixSeconds - Number(update.publishTime),
    confBps,
    priceUsd: Number(update.price) * Math.pow(10, update.exponent),
  };
}

export interface CachedOracle {
  snapshot: OracleSnapshot;
  fetchedAt: number;
}

export const oracleCache = new Map<string, CachedOracle>();

/**
 * Pure decoder: translates raw account info into an OracleSnapshot without RPC calls.
 * Caches successfully decoded snapshots for instant zero-roundtrip retrieval.
 */
export function decodeOracleInfo(
  address: PublicKey,
  info: { data: Uint8Array | Buffer; owner?: PublicKey } | null | undefined,
  referenceUnixSeconds: number
): OracleSnapshot | null {
  if (!info) return null;
  if (info.owner && !info.owner.equals(PYTH_RECEIVER_ID)) return null;
  const data = info.data instanceof Uint8Array ? info.data : new Uint8Array(info.data);
  const update = decodePriceUpdateV2(data);
  if (!update) return null;
  const snap = toSnapshot(address, update, referenceUnixSeconds);
  oracleCache.set(address.toBase58(), { snapshot: snap, fetchedAt: Date.now() });
  return snap;
}

/**
 * Loads the freshest usable price account for the configured feed.
 *
 * Scanning shards and choosing the freshest matters: devnet retains stale
 * accounts on higher shards (ages of days and years) alongside a live shard 0,
 * so "first account found" would display a badly wrong price.
 *
 * Fully protected against RPC 429 rate limits: returns the most recent cached
 * price snapshot with an updated age offset if RPC requests are rejected.
 */
export async function fetchOracle(
  conn: Connection,
  referenceUnixSeconds: number,
  feedHex = PYTH_FEED_ID
): Promise<OracleSnapshot | null> {
  const cacheKey =
    PYTH_PRICE_ACCOUNT && feedHex === PYTH_FEED_ID
      ? PYTH_PRICE_ACCOUNT.toBase58()
      : feedHex;

  const getCachedFallback = (): OracleSnapshot | null => {
    const entry = oracleCache.get(cacheKey);
    if (!entry) return null;
    return {
      ...entry.snapshot,
      ageSeconds: referenceUnixSeconds - Number(entry.snapshot.update.publishTime),
    };
  };

  try {
    if (PYTH_PRICE_ACCOUNT && feedHex === PYTH_FEED_ID) {
      const info = await conn.getAccountInfo(PYTH_PRICE_ACCOUNT).catch((err) => {
        console.warn(`[fetchOracle] Rate limited or failed to get price account: ${err?.message || err}`);
        return null;
      });
      if (!info) return getCachedFallback();
      const decoded = decodeOracleInfo(PYTH_PRICE_ACCOUNT, info, referenceUnixSeconds);
      return decoded ?? getCachedFallback();
    }

    const candidates = [0, 1, 2, 3].map((s) => derivePriceAccount(feedHex, s));
    const infos = await conn.getMultipleAccountsInfo(candidates).catch((err) => {
      console.warn(`[fetchOracle] Shard lookup rate limited or failed: ${err?.message || err}`);
      return null;
    });
    const list = infos ?? [];

    let best: OracleSnapshot | null = null;
    for (let i = 0; i < candidates.length; i++) {
      const info = list[i];
      if (!info || !info.owner.equals(PYTH_RECEIVER_ID)) continue;
      const update = decodePriceUpdateV2(new Uint8Array(info.data));
      if (!update || !update.isFull) continue;
      const snap = toSnapshot(candidates[i], update, referenceUnixSeconds);
      if (!best || snap.ageSeconds < best.ageSeconds) best = snap;
    }
    if (best) {
      oracleCache.set(cacheKey, { snapshot: best, fetchedAt: Date.now() });
      return best;
    }
    return getCachedFallback();
  } catch (err) {
    console.warn("[fetchOracle] Unhandled error during oracle fetch:", err);
    return getCachedFallback();
  }
}

export function formatUsd(value: number, digits = 2): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
