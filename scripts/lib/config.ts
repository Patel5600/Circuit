import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  derivePriceAccount as pythDerivePriceAccount,
  feedIdBytes as pythFeedIdBytes,
  findFreshestPriceAccount,
} from "./pyth";

/**
 * Shared configuration and helpers for the devnet scripts.
 *
 * Reads .env.local (falling back to .env, then process.env) without pulling in
 * a dotenv dependency, so `ts-node scripts/*.ts` works from a clean checkout.
 */

const ROOT = path.resolve(__dirname, "../..");

function loadEnvFile(file: string): void {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) return;
  for (const raw of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Real environment variables win over file values.
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

export function env(key: string, fallback?: string): string {
  const v = process.env[key];
  if (v !== undefined && v !== "") return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`missing required environment variable: ${key}`);
}

export function expandHome(p: string): string {
  return p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p;
}

export function loadKeypair(file: string): Keypair {
  const resolved = expandHome(file);
  if (!fs.existsSync(resolved)) {
    throw new Error(
      `keypair not found at ${resolved}\n` +
        `Create one with:  solana-keygen new -o ${file}`
    );
  }
  const secret = JSON.parse(fs.readFileSync(resolved, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

export const RPC_URL = env("VITE_RPC_URL", "https://api.devnet.solana.com");
export const CLUSTER = env("VITE_CLUSTER", "devnet");

export function connection(): Connection {
  return new Connection(RPC_URL, "confirmed");
}

export function deployer(): Keypair {
  return loadKeypair(env("DEPLOYER_KEYPAIR", "~/.config/solana/id.json"));
}

/** Program ID, taken from the built IDL so it can never drift from the binary. */
export function programId(): PublicKey {
  const idlPath = path.join(ROOT, "target/idl/circuit.json");
  if (!fs.existsSync(idlPath)) {
    throw new Error(
      "target/idl/circuit.json not found. Run `anchor build` first."
    );
  }
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  return new PublicKey(idl.address);
}

export function loadIdl(): any {
  const idlPath = path.join(ROOT, "target/idl/circuit.json");
  return JSON.parse(fs.readFileSync(idlPath, "utf8"));
}

export const PYTH_RECEIVER_ID = new PublicKey(
  env("VITE_PYTH_RECEIVER_PROGRAM", "rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ")
);

export const PYTH_PUSH_ORACLE_ID = new PublicKey(
  env("VITE_PYTH_PUSH_ORACLE", "pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT")
);

/**
 * Staleness bound used by the tooling when judging whether a feed is usable.
 * Kept in step with the `max_oracle_age` that setup-devnet registers.
 */
export const MAX_ORACLE_AGE_HINT = Number(env("SETUP_MAX_ORACLE_AGE", "600"));

/**
 * Default feed is SOL/USD, which Pyth actively sponsors on devnet (verified
 * live). Override with VITE_PYTH_FEED_ID for the asset you actually list.
 */
export const FEED_ID_HEX = env(
  "VITE_PYTH_FEED_ID",
  "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d"
);

export function feedIdBytes(hex = FEED_ID_HEX): Buffer {
  return pythFeedIdBytes(hex);
}

export function derivePriceAccount(feedHex = FEED_ID_HEX, shard = 0): PublicKey {
  return pythDerivePriceAccount(PYTH_PUSH_ORACLE_ID, feedHex, shard);
}

/**
 * Returns a usable PriceUpdateV2 account, preferring an explicit override and
 * otherwise selecting the freshest sponsored shard. Returns null when nothing
 * valid exists so callers can degrade gracefully rather than writing a bad
 * address into the deployment artifact.
 */
export async function resolvePriceAccount(
  conn: Connection,
  feedHex = FEED_ID_HEX
): Promise<{ address: PublicKey; source: string; ageSeconds?: number } | null> {
  const override = process.env.VITE_PYTH_PRICE_ACCOUNT;
  if (override) {
    const address = new PublicKey(override);
    const info = await conn.getAccountInfo(address);
    if (!info) throw new Error(`VITE_PYTH_PRICE_ACCOUNT ${override} not found`);
    if (!info.owner.equals(PYTH_RECEIVER_ID)) {
      throw new Error(
        `VITE_PYTH_PRICE_ACCOUNT ${override} is owned by ${info.owner.toBase58()}, ` +
          `expected the Pyth receiver ${PYTH_RECEIVER_ID.toBase58()}`
      );
    }
    return { address, source: "VITE_PYTH_PRICE_ACCOUNT" };
  }

  const best = await findFreshestPriceAccount(
    conn,
    PYTH_PUSH_ORACLE_ID,
    PYTH_RECEIVER_ID,
    feedHex
  );
  if (!best) return null;
  return {
    address: best.address,
    source: best.source,
    ageSeconds: best.ageSeconds,
  };
}

// -- PDA helpers -----------------------------------------------------------

export function protocolConfigPda(pid = programId()): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("protocol")], pid)[0];
}

export function assetConfigPda(mint: PublicKey, pid = programId()): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("asset"), mint.toBuffer()],
    pid
  )[0];
}

export function marketGuardPda(
  feedHex = FEED_ID_HEX,
  pid = programId()
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("guard"), feedIdBytes(feedHex)],
    pid
  )[0];
}

export function positionPda(
  owner: PublicKey,
  mint: PublicKey,
  pid = programId()
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("position"), owner.toBuffer(), mint.toBuffer()],
    pid
  )[0];
}

// -- Output ----------------------------------------------------------------

export const DEPLOYMENT_FILE = path.join(ROOT, "devnet/deployment.json");

export function writeDeployment(data: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(DEPLOYMENT_FILE), { recursive: true });
  fs.writeFileSync(DEPLOYMENT_FILE, JSON.stringify(data, null, 2) + "\n");
}

export function readDeployment(): Record<string, any> | null {
  if (!fs.existsSync(DEPLOYMENT_FILE)) return null;
  return JSON.parse(fs.readFileSync(DEPLOYMENT_FILE, "utf8"));
}

export function sol(lamports: number | bigint): string {
  return (Number(lamports) / 1_000_000_000).toFixed(4);
}

export function explorer(kind: "tx" | "address", id: string): string {
  return `https://explorer.solana.com/${kind}/${id}?cluster=${CLUSTER}`;
}
