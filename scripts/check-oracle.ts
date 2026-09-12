/**
 * Verifies Pyth oracle wiring against the live cluster before you rely on it.
 *
 * For the configured feed and a set of reference feeds, reports which sponsored
 * shards exist, whether the owner matches the receiver program the circuit
 * program requires, and the decoded price / confidence / staleness.
 *
 * This exists because a wrong feed id, wrong receiver program, or a stale shard
 * surfaces as an opaque failure deep inside Anchor deserialization.
 *
 * Usage: npx ts-node scripts/check-oracle.ts
 */
import {
  CLUSTER,
  FEED_ID_HEX,
  MAX_ORACLE_AGE_HINT,
  PYTH_PUSH_ORACLE_ID,
  PYTH_RECEIVER_ID,
  RPC_URL,
  connection,
  derivePriceAccount,
} from "./lib/config";
import { confBps, decodePriceUpdateV2, formatPrice } from "./lib/pyth";

/** Reference feeds, used to validate the PDA derivation itself. */
const REFERENCE_FEEDS: Record<string, string> = {
  "SOL/USD": "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
  "BTC/USD": "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  "ETH/USD": "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
};

async function probe(label: string, feedHex: string): Promise<boolean> {
  const conn = connection();
  console.log(`\n${label}`);
  console.log(`  feed id : ${feedHex}`);

  const nowSec = Math.floor(Date.now() / 1000);
  let anyUsable = false;

  for (const shard of [0, 1, 2, 3]) {
    const address = derivePriceAccount(feedHex, shard);
    const info = await conn.getAccountInfo(address);
    if (!info) continue;

    const ownerOk = info.owner.equals(PYTH_RECEIVER_ID);
    const d = decodePriceUpdateV2(Buffer.from(info.data));
    const age = d ? nowSec - Number(d.publishTime) : Infinity;
    const fresh = age <= MAX_ORACLE_AGE_HINT;
    const usable = ownerOk && !!d && d.isFull && fresh;
    if (usable) anyUsable = true;

    console.log(
      `  shard ${shard}: ${address.toBase58()}  ${usable ? "[USABLE]" : "[unusable]"}`
    );
    console.log(
      `    owner : ${info.owner.toBase58()} ${ownerOk ? "ok" : "MISMATCH"}`
    );
    console.log(`    size  : ${info.data.length} bytes`);

    if (!d) {
      console.log("    decode: failed (unexpected discriminator or layout)");
      continue;
    }

    console.log(
      `    price : ${formatPrice(d.price, d.exponent)} (raw ${d.price}, expo ${d.exponent})`
    );
    console.log(`    conf  : ${d.conf} (${confBps(d.price, d.conf)} bps of price)`);
    console.log(
      `    age   : ${age}s ${fresh ? "" : `(exceeds the ${MAX_ORACLE_AGE_HINT}s bound)`}`
    );
    console.log(
      `    level : ${d.isFull ? "Full" : "Partial  <-- program requires Full"}`
    );
    if (d.feedId !== feedHex) {
      console.log(`    NOTE  : embedded feed id differs: ${d.feedId}`);
    }
  }

  if (!anyUsable) {
    console.log("  no usable (owned + Full + fresh) account found at shards 0-3");
  }
  return anyUsable;
}

async function main() {
  console.log("Pyth oracle wiring check");
  console.log(`cluster        : ${CLUSTER}`);
  console.log(`rpc            : ${RPC_URL}`);
  console.log(`receiver prog  : ${PYTH_RECEIVER_ID.toBase58()}`);
  console.log(`push oracle    : ${PYTH_PUSH_ORACLE_ID.toBase58()}`);
  console.log(`staleness bound: ${MAX_ORACLE_AGE_HINT}s`);

  const ok = await probe("CONFIGURED FEED (VITE_PYTH_FEED_ID)", FEED_ID_HEX);

  console.log("\n--- reference feeds (validate the PDA derivation) ---");
  for (const [name, id] of Object.entries(REFERENCE_FEEDS)) {
    await probe(name, id);
  }

  if (!ok) {
    console.log(
      [
        "",
        "The configured feed has no usable price account on this cluster.",
        "borrow, withdraw-with-debt, liquidate and refresh_guard will all fail.",
        "Set VITE_PYTH_FEED_ID to a feed listed as usable above.",
      ].join("\n")
    );
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("\ncheck-oracle failed:", e.message ?? e);
  process.exit(1);
});
