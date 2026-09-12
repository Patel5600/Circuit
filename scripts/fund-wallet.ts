/**
 * Funds a wallet with devnet SOL.
 *
 * The public devnet faucet is aggressively rate limited and caps airdrops at
 * 2 SOL per request, so this script requests in chunks, retries with backoff,
 * and - critically - tells you exactly what to do when the faucet refuses
 * rather than failing with an opaque RPC error.
 *
 * Usage:
 *   npm run fund                       # fund the deployer to the default target
 *   npm run fund -- --target 5         # fund up to 5 SOL
 *   npm run fund -- --address <pubkey> # fund an arbitrary address
 */
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import {
  CLUSTER,
  RPC_URL,
  connection,
  deployer,
  explorer,
  sol,
} from "./lib/config";

const MAX_AIRDROP_SOL = 2; // devnet faucet per-request cap
const DEFAULT_TARGET_SOL = 4;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (CLUSTER === "mainnet-beta") {
    throw new Error("refusing to run against mainnet-beta: there is no faucet");
  }

  const conn = connection();
  const targetSol = Number(arg("target") ?? DEFAULT_TARGET_SOL);
  const addressArg = arg("address");
  const address = addressArg
    ? new PublicKey(addressArg)
    : deployer().publicKey;

  console.log(`cluster : ${CLUSTER}`);
  console.log(`rpc     : ${RPC_URL}`);
  console.log(`wallet  : ${address.toBase58()}`);

  let balance = await conn.getBalance(address);
  console.log(`balance : ${sol(balance)} SOL`);

  const targetLamports = targetSol * LAMPORTS_PER_SOL;
  if (balance >= targetLamports) {
    console.log(`\nAlready at or above the ${targetSol} SOL target. Nothing to do.`);
    return;
  }

  let attempt = 0;
  while (balance < targetLamports && attempt < 6) {
    attempt++;
    const deficitSol = (targetLamports - balance) / LAMPORTS_PER_SOL;
    const requestSol = Math.min(MAX_AIRDROP_SOL, Math.ceil(deficitSol));

    console.log(`\n[${attempt}] requesting ${requestSol} SOL...`);
    try {
      const sig = await conn.requestAirdrop(
        address,
        requestSol * LAMPORTS_PER_SOL
      );
      await conn.confirmTransaction(sig, "confirmed");
      console.log(`    ok  ${explorer("tx", sig)}`);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      console.log(`    failed: ${msg.split("\n")[0]}`);

      if (/429|rate|limit|faucet/i.test(msg)) {
        const backoff = Math.min(30_000, 5_000 * attempt);
        console.log(`    faucet rate limited, waiting ${backoff / 1000}s`);
        await sleep(backoff);
        continue;
      }
      await sleep(2_000);
    }

    balance = await conn.getBalance(address);
    console.log(`    balance now ${sol(balance)} SOL`);
  }

  if (balance < targetLamports) {
    console.log(
      [
        "",
        `Could not reach ${targetSol} SOL via the RPC faucet (currently ${sol(balance)} SOL).`,
        "The public devnet faucet is frequently exhausted. Alternatives:",
        `  1. Web faucet:  https://faucet.solana.com/  (paste ${address.toBase58()})`,
        "  2. CLI:         solana airdrop 2 --url devnet",
        "  3. Wait ~15 minutes and re-run; limits are per-IP and per-address.",
        "",
        "A program deploy needs roughly 2-4 SOL of rent for the program account.",
      ].join("\n")
    );
    process.exitCode = 1;
    return;
  }

  console.log(`\nFunded. Final balance ${sol(balance)} SOL`);
}

main().catch((e) => {
  console.error("\nfund-wallet failed:", e.message ?? e);
  process.exit(1);
});
