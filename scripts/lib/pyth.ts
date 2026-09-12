import { Connection, PublicKey } from "@solana/web3.js";

/**
 * Pyth PriceUpdateV2 decoding and sponsored-feed address derivation.
 *
 * Verified against live devnet accounts: the derivation below resolves to real
 * sponsored feeds owned by the receiver program, and the layout decodes their
 * prices correctly.
 */

/** Anchor discriminator: sha256("account:PriceUpdateV2")[0..8] */
export const PRICE_UPDATE_V2_DISCRIMINATOR = Buffer.from([
  34, 241, 35, 99, 157, 126, 244, 205,
]);

/**
 * On-chain allocated size. Anchor sizes the account for the largest
 * `VerificationLevel` variant (`Partial { u8 }`, 2 bytes), so a `Full` update
 * uses 133 bytes and leaves one trailing byte unused. Borsh ignores the
 * trailing byte on read.
 */
export const PRICE_UPDATE_V2_SIZE = 134;

export interface PriceUpdate {
  feedId: string;
  price: bigint;
  conf: bigint;
  exponent: number;
  publishTime: bigint;
  prevPublishTime: bigint;
  /** 1 == Full, 0 == Partial. The program requires Full. */
  verificationLevel: number;
  isFull: boolean;
}

export function decodePriceUpdateV2(data: Buffer): PriceUpdate | null {
  if (data.length < 133) return null;
  if (!data.subarray(0, 8).equals(PRICE_UPDATE_V2_DISCRIMINATOR)) return null;

  let o = 8 + 32; // discriminator + write_authority
  const verificationLevel = data.readUInt8(o);
  // Borsh enum: Partial(0) carries a u8 payload, Full(1) carries nothing.
  o += verificationLevel === 1 ? 1 : 2;

  const feedId = data.subarray(o, o + 32).toString("hex");
  o += 32;
  const price = data.readBigInt64LE(o);
  o += 8;
  const conf = data.readBigUInt64LE(o);
  o += 8;
  const exponent = data.readInt32LE(o);
  o += 4;
  const publishTime = data.readBigInt64LE(o);
  o += 8;
  const prevPublishTime = data.readBigInt64LE(o);

  return {
    feedId,
    price,
    conf,
    exponent,
    publishTime,
    prevPublishTime,
    verificationLevel,
    isFull: verificationLevel === 1,
  };
}

export function feedIdBytes(hex: string): Buffer {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const buf = Buffer.from(clean, "hex");
  if (buf.length !== 32) {
    throw new Error(`feed id must be 32 bytes, got ${buf.length} from "${hex}"`);
  }
  return buf;
}

/**
 * Derives a Pyth sponsored price-feed address.
 * Seeds: little endian u16 shard id, then the 32-byte feed id.
 */
export function derivePriceAccount(
  pushOracleId: PublicKey,
  feedHex: string,
  shard = 0
): PublicKey {
  const shardBytes = Buffer.alloc(2);
  shardBytes.writeUInt16LE(shard, 0);
  return PublicKey.findProgramAddressSync(
    [shardBytes, feedIdBytes(feedHex)],
    pushOracleId
  )[0];
}

export interface ResolvedPrice {
  address: PublicKey;
  shard: number;
  update: PriceUpdate;
  ageSeconds: number;
  source: string;
}

/**
 * Finds the freshest usable PriceUpdateV2 account for a feed.
 *
 * Scanning shards and picking the freshest matters in practice: devnet retains
 * stale accounts on higher shards (observed ages of days and years) alongside a
 * live shard 0, so "first account found" is not good enough.
 */
export async function findFreshestPriceAccount(
  conn: Connection,
  pushOracleId: PublicKey,
  receiverId: PublicKey,
  feedHex: string,
  shards: number[] = [0, 1, 2, 3]
): Promise<ResolvedPrice | null> {
  const nowSec = Math.floor(Date.now() / 1000);
  let best: ResolvedPrice | null = null;

  for (const shard of shards) {
    const address = derivePriceAccount(pushOracleId, feedHex, shard);
    const info = await conn.getAccountInfo(address);
    if (!info || !info.owner.equals(receiverId)) continue;

    const update = decodePriceUpdateV2(Buffer.from(info.data));
    if (!update || !update.isFull) continue;

    const ageSeconds = nowSec - Number(update.publishTime);
    if (!best || ageSeconds < best.ageSeconds) {
      best = {
        address,
        shard,
        update,
        ageSeconds,
        source: `sponsored feed shard ${shard}`,
      };
    }
  }

  return best;
}

export function formatPrice(price: bigint, exponent: number): string {
  const digits = Math.min(8, Math.max(0, -exponent));
  return (Number(price) * Math.pow(10, exponent)).toFixed(digits);
}

export function confBps(price: bigint, conf: bigint): bigint {
  const abs = price < 0n ? -price : price;
  if (abs === 0n) return -1n;
  return (conf * 10_000n) / abs;
}
