import { PublicKey } from "@solana/web3.js";
import idl from "./idl/circuit.json";
import { CLUSTER, RPC_URL, explorerUrl, readEnv } from "./env";

/**
 * Runtime configuration, driven entirely by Vite env vars so the same build can
 * target any cluster. Populate app/.env.local from the block printed by
 * `npm run setup:devnet`.
 *
 * Anything that needs only a plain string should import ./env instead, which
 * carries no Solana dependency.
 */

const envVar = readEnv;

export { CLUSTER, RPC_URL, explorerUrl };

/** Program ID comes from the bundled IDL so it can never drift from the binary. */
export const PROGRAM_ID = new PublicKey(
  envVar("VITE_PROGRAM_ID", (idl as any).address)
);

export const EQUITY_MINT = maybeKey(
  envVar("VITE_EQUITY_MINT", "CARqKy5GTCxz5G1tFiYA96A3Q8jaUE9Vppk7cjGJxRqq")
);
export const QUOTE_MINT = maybeKey(
  envVar("VITE_QUOTE_MINT", "23hpSsK3h4na3pwSUf1YzaDF9nzX3t2PppJJf16Qpkxc")
);

export const PYTH_FEED_ID = envVar(
  "VITE_PYTH_FEED_ID",
  "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d"
);

/**
 * Pyth Solana Receiver. This is the owner the on-chain program requires on any
 * PriceUpdateV2 account, matching pyth-solana-receiver-sdk v2.0.0 without the
 * `pro-compatible` feature. Verified against live devnet accounts.
 */
export const PYTH_RECEIVER_ID = new PublicKey(
  envVar("VITE_PYTH_RECEIVER_PROGRAM", "rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ")
);

/** Push-oracle program that owns sponsored price feed accounts. */
export const PYTH_PUSH_ORACLE_ID = new PublicKey(
  envVar("VITE_PYTH_PUSH_ORACLE", "pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT")
);

/** Explicit price account override; otherwise derived from the feed id. */
export const PYTH_PRICE_ACCOUNT = maybeKey(
  envVar("VITE_PYTH_PRICE_ACCOUNT", "7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE")
);

export const POLL_INTERVAL_MS = Number(envVar("VITE_POLL_INTERVAL_MS", "10000"));

function maybeKey(v: string): PublicKey | null {
  if (!v) return null;
  try {
    return new PublicKey(v);
  } catch {
    console.warn(`ignoring malformed pubkey in env: "${v}"`);
    return null;
  }
}

/** True when the app has everything it needs to talk to a deployed market. */
export const IS_CONFIGURED = Boolean(EQUITY_MINT && QUOTE_MINT);

/** Human-readable list of what is missing, for the setup banner. */
export function missingConfig(): string[] {
  const missing: string[] = [];
  if (!EQUITY_MINT) missing.push("VITE_EQUITY_MINT");
  if (!QUOTE_MINT) missing.push("VITE_QUOTE_MINT");
  return missing;
}

/** Circuit Protocol Treasury public address on Solana */
export const CIRCUIT_TREASURY_ADDRESS = envVar(
  "VITE_CIRCUIT_TREASURY_ADDRESS",
  "7AALMsZ5MuioSW7BMwBCwTmy9Y1fMJ6MKXAELYyrtb4"
);
export const CIRCUIT_TREASURY_KEY = new PublicKey(CIRCUIT_TREASURY_ADDRESS);

/** Default borrow/origination fee in basis points (25 BPS = 0.25%) */
export const DEFAULT_BORROW_FEE_BPS = 25;
export const MAX_BORROW_FEE_BPS = 1000;

export { idl };
