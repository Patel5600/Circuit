/**
 * Circuit Protocol - Serverless Devnet Faucet Handler
 *
 * Secure server-side / serverless minting authority.
 * Private key is NEVER delivered to the browser client bundle.
 */

import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
} from "@solana/spl-token";

const RPC_URL = process.env.VITE_RPC_URL || "https://api.devnet.solana.com";

/**
 * Resolves the faucet signing authority from FAUCET_AUTHORITY_KEY.
 * Dedicated single-purpose faucet authority.
 */
export function getFaucetAuthority(overrideSecret?: string): Keypair | null {
  const secretEnv = overrideSecret !== undefined ? overrideSecret : process.env.FAUCET_AUTHORITY_KEY;
  if (!secretEnv || typeof secretEnv !== "string" || !secretEnv.trim()) {
    return null;
  }

  try {
    const trimmed = secretEnv.trim();
    let bytes: number[];
    if (trimmed.startsWith("[")) {
      bytes = JSON.parse(trimmed);
    } else {
      bytes = trimmed.split(",").map((n) => Number(n.trim()));
    }

    if (!Array.isArray(bytes) || bytes.length !== 64 || bytes.some((b) => isNaN(b) || b < 0 || b > 255)) {
      console.error("FAUCET_AUTHORITY_KEY must be a valid 64-byte secret key array");
      return null;
    }

    return Keypair.fromSecretKey(Uint8Array.from(bytes));
  } catch {
    console.error("Failed to parse FAUCET_AUTHORITY_KEY");
    return null;
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }

  const { recipient, mint, amount, decimals = 6 } = req.body || {};

  if (!recipient || !mint || !amount) {
    res.status(400).json({ error: "Missing required parameters: recipient, mint, amount" });
    return;
  }

  const authority = getFaucetAuthority();
  if (!authority) {
    res.status(503).json({
      error: "Devnet Faucet authority is offline or not configured in environment.",
    });
    return;
  }

  try {
    const connection = new Connection(RPC_URL, "confirmed");
    const recipientPubkey = new PublicKey(recipient);
    const mintPubkey = new PublicKey(mint);

    const recipientAta = getAssociatedTokenAddressSync(mintPubkey, recipientPubkey, true);
    const rawAmount = BigInt(Math.round(Number(amount) * 10 ** decimals));

    const tx = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(
        authority.publicKey,
        recipientAta,
        recipientPubkey,
        mintPubkey
      ),
      createMintToInstruction(
        mintPubkey,
        recipientAta,
        authority.publicKey,
        rawAmount
      )
    );

    const signature = await sendAndConfirmTransaction(connection, tx, [authority], {
      commitment: "confirmed",
    });

    res.status(200).json({
      success: true,
      signature,
      recipient,
      mint,
      amount,
    });
  } catch (err: any) {
    console.error("Faucet minting error:", err);
    res.status(500).json({ error: err?.message || "Failed to mint test tokens on Devnet" });
  }
}
