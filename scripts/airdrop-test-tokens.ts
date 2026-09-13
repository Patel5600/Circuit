/**
 * Circuit Protocol — Test Token Airdrop / Faucet Script
 *
 * Mints test collateral equities (NVDAx, AAPLx, MSFTx, AMZNx, etc.) and quote tokens
 * (USDC, WSOL) to any Solana Devnet wallet for instant testing and evaluation.
 *
 * Usage:
 *   npx ts-node scripts/airdrop-test-tokens.ts --to <RECIPIENT_PUBKEY>
 *   npx ts-node scripts/airdrop-test-tokens.ts --to <RECIPIENT_PUBKEY> --asset NVDA --amount 50
 *   npx ts-node scripts/airdrop-test-tokens.ts --to <RECIPIENT_PUBKEY> --quote USDC --amount 10000
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

import {
  CLUSTER,
  RPC_URL,
  connection,
  deployer,
  explorer,
} from "./lib/config";

const DECIMALS = 6;
const TOKEN_UNIT = 10 ** DECIMALS;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function sendBatch(
  conn: Connection,
  payer: Keypair,
  ixs: TransactionInstruction[],
  label: string
): Promise<string> {
  const tx = new Transaction().add(...ixs);
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = payer.publicKey;
  tx.sign(payer);

  const sig = await conn.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  console.log(`  ✓ ${label}: ${explorer("tx", sig)}`);
  return sig;
}

async function main() {
  console.log("=== Circuit Protocol Test Token Faucet ===");
  console.log(`Cluster : ${CLUSTER}`);
  console.log(`RPC     : ${RPC_URL}`);

  const payer = deployer();
  const conn = connection();
  console.log(`Authority: ${payer.publicKey.toBase58()}`);

  const toArg = arg("to");
  const recipient = toArg ? new PublicKey(toArg) : payer.publicKey;
  console.log(`Recipient: ${recipient.toBase58()}\n`);

  const marketsPath = path.resolve(__dirname, "../devnet/markets.json");
  if (!fs.existsSync(marketsPath)) {
    throw new Error("devnet/markets.json not found. Run scripts/deploy-multi-markets.ts first.");
  }

  const marketsData = JSON.parse(fs.readFileSync(marketsPath, "utf8"));
  const markets: any[] = marketsData.markets;
  const quoteMints: Record<string, string> = marketsData.quoteMints;

  const targetAsset = arg("asset")?.toUpperCase();
  const targetQuote = arg("quote")?.toUpperCase();
  const customAmount = arg("amount") ? Number(arg("amount")) : null;

  // 1. MINT QUOTE TOKENS
  console.log("1. Minting Lendable Quote Tokens...");
  for (const [qSymbol, qMintStr] of Object.entries(quoteMints)) {
    if (targetQuote && targetQuote !== qSymbol) continue;
    const qMint = new PublicKey(qMintStr);
    const amount = customAmount ?? (qSymbol === "USDC" ? 10_000 : 25);
    const recipientAta = getAssociatedTokenAddressSync(qMint, recipient);

    const ixs: TransactionInstruction[] = [
      createAssociatedTokenAccountIdempotentInstruction(
        payer.publicKey,
        recipientAta,
        recipient,
        qMint
      ),
      createMintToInstruction(
        qMint,
        recipientAta,
        payer.publicKey,
        BigInt(Math.round(amount * TOKEN_UNIT))
      ),
    ];

    await sendBatch(conn, payer, ixs, `${amount} ${qSymbol} to ${recipient.toBase58().slice(0, 6)}...`);
  }

  // 2. MINT COLLATERAL TOKENS
  console.log("\n2. Minting Tokenized Equity Collateral...");
  const seenMints = new Set<string>();

  for (const m of markets) {
    if (targetAsset && targetAsset !== m.symbol) continue;
    if (seenMints.has(m.mint)) continue;
    seenMints.add(m.mint);

    const cMint = new PublicKey(m.mint);
    const amount = customAmount ?? 100;
    const recipientAta = getAssociatedTokenAddressSync(cMint, recipient);

    const ixs: TransactionInstruction[] = [
      createAssociatedTokenAccountIdempotentInstruction(
        payer.publicKey,
        recipientAta,
        recipient,
        cMint
      ),
      createMintToInstruction(
        cMint,
        recipientAta,
        payer.publicKey,
        BigInt(Math.round(amount * TOKEN_UNIT))
      ),
    ];

    await sendBatch(conn, payer, ixs, `${amount} ${m.tokenSymbol} (${m.name}) to ${recipient.toBase58().slice(0, 6)}...`);
  }

  console.log("\n✓ Airdrop completed successfully!");
  console.log(`Recipient ${recipient.toBase58()} is now ready to deposit collateral and borrow on Solana Devnet.`);
}

main().catch((e) => {
  console.error("\nAirdrop failed:", e?.message ?? e);
  process.exit(1);
});
