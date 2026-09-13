/**
 * Plain environment values, with no Solana or IDL imports.
 *
 * Kept separate from config.ts on purpose: config.ts pulls in `PublicKey` and
 * the program IDL, which together account for most of the vendor bundle. The
 * landing page only needs a cluster name, so it imports this module instead and
 * avoids loading web3.js entirely.
 */

function read(key: string, fallback = ""): string {
  const v = (import.meta as any).env?.[key];
  return v === undefined || v === "" ? fallback : String(v);
}

export const CLUSTER = read("VITE_CLUSTER", "devnet");
export const RPC_URL = read("VITE_RPC_URL", "https://api.devnet.solana.com");

/**
 * Program address as a plain string.
 *
 * Kept here as well as in config.ts so purely presentational surfaces (the
 * landing footer's explorer link) can reference it without importing
 * `PublicKey` and the IDL, which together are the largest chunk in the build.
 * config.ts remains the source of truth for the parsed key used on-chain.
 */
export const PROGRAM_ID_STRING = read(
  "VITE_PROGRAM_ID",
  "Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2"
);

export const CLUSTER_LABEL =
  CLUSTER === "mainnet-beta"
    ? "Mainnet"
    : CLUSTER.charAt(0).toUpperCase() + CLUSTER.slice(1);

/**
 * Whether this build actually points at a registered market.
 *
 * The landing page uses this to decide what it is allowed to claim. With no mint
 * configured there is no live asset, and the copy has to say so rather than
 * quoting a number that happens to read well. Same reason there are no prices
 * anywhere on the page: the build cannot substantiate them.
 */
export const EQUITY_MINT_STRING = read(
  "VITE_EQUITY_MINT",
  "CARqKy5GTCxz5G1tFiYA96A3Q8jaUE9Vppk7cjGJxRqq"
);
export const QUOTE_MINT_STRING = read(
  "VITE_QUOTE_MINT",
  "23hpSsK3h4na3pwSUf1YzaDF9nzX3t2PppJJf16Qpkxc"
);

export const HAS_LIVE_MARKET = Boolean(
  EQUITY_MINT_STRING && QUOTE_MINT_STRING
);

/** Count of tokenized equities registered on chain in this build: 0 or 1. */
export const LIVE_MARKET_COUNT = HAS_LIVE_MARKET ? 1 : 0;

export function explorerUrl(kind: "tx" | "address", id: string): string {
  return `https://explorer.solana.com/${kind}/${id}?cluster=${CLUSTER}`;
}

export { read as readEnv };
