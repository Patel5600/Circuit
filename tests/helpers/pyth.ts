import { PublicKey } from "@solana/web3.js";

/**
 * Pyth Solana Receiver program ID.
 *
 * This is the value `pyth-solana-receiver-sdk` v2.0.0 declares when the
 * `pro-compatible` feature is OFF (our build does not enable it). The circuit
 * program uses `Account<'info, PriceUpdateV2>`, so Anchor enforces that any
 * supplied price account is owned by exactly this program. Forged test
 * accounts must therefore use this owner or deserialization fails before any
 * protocol logic runs.
 */
export const PYTH_RECEIVER_ID = new PublicKey(
  "rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ"
);

/**
 * Anchor account discriminator for `PriceUpdateV2`.
 * sha256("account:PriceUpdateV2")[0..8]
 */
export const PRICE_UPDATE_V2_DISCRIMINATOR = Buffer.from([
  34, 241, 35, 99, 157, 126, 244, 205,
]);

/**
 * Allocated size of a real PriceUpdateV2 account.
 *
 * Anchor sizes the account for the largest `VerificationLevel` variant
 * (`Partial { u8 }`, 2 bytes), so a `Full` update serializes into 133 bytes and
 * leaves one trailing byte unused. Live devnet accounts are 134 bytes, verified
 * with `npx ts-node scripts/check-oracle.ts`, so fixtures match that exactly.
 * Borsh ignores the trailing byte on read.
 */
export const PRICE_UPDATE_V2_SIZE = 134;

/** Bytes actually written by a Full-variant update. */
const PRICE_UPDATE_V2_USED = 133;

/**
 * VerificationLevel is a Borsh enum. `get_price_no_older_than` demands
 * `VerificationLevel::Full`, which is variant index 1 and carries no payload.
 * (`Partial` is index 0 and carries a u8, making it one byte longer.)
 */
const VERIFICATION_LEVEL_FULL = 1;

export interface PriceUpdateParams {
  /** 32-byte Pyth feed ID, hex encoded (no 0x prefix). */
  feedIdHex: string;
  /** Price in Pyth integer format, e.g. 100 USD at expo -8 is 10_000_000_000. */
  price: bigint;
  /** Confidence interval, same units as price. */
  conf: bigint;
  /** Price exponent, typically negative (e.g. -8). */
  exponent: number;
  /** Unix seconds this price was published. */
  publishTime: bigint;
  /** Slot the update was posted at. Not validated by the protocol. */
  postedSlot?: bigint;
  /** Write authority recorded on the account. Not validated by the protocol. */
  writeAuthority?: PublicKey;
}

export function feedIdToBytes(feedIdHex: string): Buffer {
  const clean = feedIdHex.startsWith("0x") ? feedIdHex.slice(2) : feedIdHex;
  const buf = Buffer.from(clean, "hex");
  if (buf.length !== 32) {
    throw new Error(
      `feed id must be 32 bytes, got ${buf.length} from "${feedIdHex}"`
    );
  }
  return buf;
}

/**
 * Serializes a `PriceUpdateV2` account exactly as the on-chain program will
 * Borsh-deserialize it.
 *
 * Layout (little endian, no padding - Borsh, not repr(C)):
 *   [0..8)    discriminator
 *   [8..40)   write_authority           : Pubkey
 *   [40..41)  verification_level        : enum variant index
 *   [41..73)  price_message.feed_id     : [u8; 32]
 *   [73..81)  price_message.price       : i64
 *   [81..89)  price_message.conf        : u64
 *   [89..93)  price_message.exponent    : i32
 *   [93..101) price_message.publish_time: i64
 *   [101..109) price_message.prev_publish_time : i64
 *   [109..117) price_message.ema_price   : i64
 *   [117..125) price_message.ema_conf    : u64
 *   [125..133) posted_slot               : u64
 */
export function encodePriceUpdateV2(params: PriceUpdateParams): Buffer {
  const {
    feedIdHex,
    price,
    conf,
    exponent,
    publishTime,
    postedSlot = 1n,
    writeAuthority = PublicKey.default,
  } = params;

  const buf = Buffer.alloc(PRICE_UPDATE_V2_SIZE);
  let o = 0;

  PRICE_UPDATE_V2_DISCRIMINATOR.copy(buf, o);
  o += 8;

  writeAuthority.toBuffer().copy(buf, o);
  o += 32;

  buf.writeUInt8(VERIFICATION_LEVEL_FULL, o);
  o += 1;

  feedIdToBytes(feedIdHex).copy(buf, o);
  o += 32;

  buf.writeBigInt64LE(price, o);
  o += 8;

  buf.writeBigUInt64LE(conf, o);
  o += 8;

  buf.writeInt32LE(exponent, o);
  o += 4;

  buf.writeBigInt64LE(publishTime, o);
  o += 8;

  // prev_publish_time: keep strictly before publish_time so the update is a
  // well-formed unique observation for its instant.
  buf.writeBigInt64LE(publishTime - 1n, o);
  o += 8;

  // ema_price / ema_conf mirror the spot values; the protocol never reads them.
  buf.writeBigInt64LE(price, o);
  o += 8;
  buf.writeBigUInt64LE(conf, o);
  o += 8;

  buf.writeBigUInt64LE(postedSlot, o);
  o += 8;

  if (o !== PRICE_UPDATE_V2_USED) {
    throw new Error(`encoded ${o} bytes, expected ${PRICE_UPDATE_V2_USED}`);
  }
  return buf;
}
