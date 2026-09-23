/**
 * Circuit Protocol — CLI Faucet Claim Tool
 *
 * Claims testnet assets (SOL, USDC, WSOL, NVDAx, AAPLx, etc.) from the Circuit
 * Devnet Faucet endpoint.
 *
 * Usage:
 *   npm run faucet
 *   npm run faucet -- --to <ADDRESS>
 *   npm run faucet -- --to <ADDRESS> --asset SOL --amount 1
 *   npm run faucet -- --to <ADDRESS> --asset NVDA --amount 50
 *   npm run faucet -- --to <ADDRESS> --asset USDC --amount 10000
 *   npm run faucet -- --to <ADDRESS> --starter-pack
 */

import { PublicKey } from "@solana/web3.js";
import { deployer, explorer } from "./lib/config";
import { FAUCET_ASSETS } from "../api/faucet";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const hasFlag = (name: string) => process.argv.includes(`--${name}`);

const FAUCET_API = process.env.CIRCUIT_FAUCET_URL || "https://circuit-on-solana.vercel.app/api/faucet";

async function claimOne(recipient: string, assetSymbol: string, amountOverride?: number) {
  const asset = FAUCET_ASSETS.find(
    (a) =>
      a.symbol.toUpperCase() === assetSymbol.toUpperCase() ||
      a.tokenSymbol.toUpperCase() === assetSymbol.toUpperCase()
  );
  if (!asset) {
    throw new Error(
      `Unknown faucet asset: ${assetSymbol}. Supported: ${FAUCET_ASSETS.map((a) => a.tokenSymbol).join(", ")}`
    );
  }

  const amount = amountOverride ?? asset.fullAmount;
  console.log(`Claiming ${amount} ${asset.tokenSymbol} for ${recipient}...`);

  const res = await fetch(FAUCET_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient,
      mint: asset.mint,
      amount,
      decimals: asset.decimals,
    }),
  });

  const data = (await res.json()) as any;
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || `Failed to claim ${asset.tokenSymbol} from faucet`);
  }

  console.log(`  ✓ Claimed ${amount} ${asset.tokenSymbol}: ${explorer("tx", data.signature)}`);
  return data;
}

async function main() {
  console.log("=== Circuit Protocol Devnet Faucet Claim ===");
  const toArg = arg("to") || arg("address");
  const recipient = toArg ? new PublicKey(toArg).toBase58() : deployer().publicKey.toBase58();
  console.log(`Recipient : ${recipient}`);
  console.log(`Endpoint  : ${FAUCET_API}\n`);

  const assetArg = arg("asset") || arg("symbol");
  const amountArg = arg("amount") ? Number(arg("amount")) : undefined;
  const isStarter = hasFlag("starter-pack") || (!assetArg && !amountArg);

  if (isStarter) {
    console.log("Claiming Starter Pack (NVDAx, AAPLx, USDC, SOL)...");
    const starter = ["NVDA", "AAPL", "USDC", "SOL"];
    for (const sym of starter) {
      try {
        await claimOne(recipient, sym);
      } catch (err: any) {
        console.error(`  ✕ ${sym} claim failed:`, err?.message || err);
      }
    }
  } else if (assetArg) {
    await claimOne(recipient, assetArg, amountArg);
  }

  console.log("\nDone!");
}

main().catch((e) => {
  console.error("\nFaucet claim error:", e?.message ?? e);
  process.exit(1);
});
