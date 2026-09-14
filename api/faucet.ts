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

function getAuthority(): Keypair | null {
  const secretEnv = process.env.FAUCET_AUTHORITY_KEY || process.env.DEPLOYER_KEYPAIR;
  if (!secretEnv) return null;
  try {
    if (secretEnv.startsWith("[")) {
      return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secretEnv)));
    }
    // Fallback: comma-separated
    return Keypair.fromSecretKey(Uint8Array.from(secretEnv.split(",").map((n) => Number(n.trim()))));
  } catch (e) {
    console.error("Failed to parse FAUCET_AUTHORITY_KEY", e);
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

  const authority = getAuthority();
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
