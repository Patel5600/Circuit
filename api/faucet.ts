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
import { FAUCET_ASSETS } from "../app/src/lib/faucet";

const RPC_URL = process.env.VITE_RPC_URL || "https://api.devnet.solana.com";

// In-memory rate limiting: recipient address -> timestamp
const recipientRateLimits = new Map<string, number>();
const RECIPIENT_COOLDOWN_MS = 15_000; // 15 seconds cooldown per address

function setCorsHeaders(req: any, res: any) {
  const origin = req.headers?.origin;
  if (origin && typeof origin === "string") {
    if (
      /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
      /^https:\/\/.*\.vercel\.app$/.test(origin) ||
      /^https:\/\/circuit\.trade$/.test(origin)
    ) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

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
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }

  const { recipient, mint, amount, decimals = 6 } = req.body || {};

  if (!recipient || !mint || amount === undefined || amount === null) {
    res.status(400).json({ error: "Missing required parameters: recipient, mint, amount" });
    return;
  }

  // 1. Recipient PublicKey validation
  let recipientPubkey: PublicKey;
  try {
    recipientPubkey = new PublicKey(recipient);
  } catch {
    return res.status(400).json({ error: "Invalid recipient Solana public key." });
  }

  // 2. Canonical Mint Whitelist Verification
  const allowedAsset = FAUCET_ASSETS.find((a) => a.mint === mint && !a.isNativeSol);
  if (!allowedAsset) {
    return res.status(400).json({
      error: "Unauthorized mint address. Mint must be a registered Circuit Devnet asset.",
    });
  }

  // 3. Amount validation and hard upper-bound quota enforcement
  const parsedAmount = Number(amount);
  if (!isFinite(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: "Amount must be a positive finite number." });
  }
  if (parsedAmount > allowedAsset.fullAmount) {
    return res.status(400).json({
      error: `Requested amount exceeds maximum allowance for ${allowedAsset.symbol} (max: ${allowedAsset.fullAmount}).`,
    });
  }

  // 4. Rate-limiting & abuse prevention
  const now = Date.now();
  const lastClaim = recipientRateLimits.get(recipientPubkey.toBase58()) || 0;
  if (now - lastClaim < RECIPIENT_COOLDOWN_MS) {
    return res.status(429).json({
      error: `Faucet cooldown active. Please wait ${Math.ceil((RECIPIENT_COOLDOWN_MS - (now - lastClaim)) / 1000)}s before requesting again.`,
    });
  }
  recipientRateLimits.set(recipientPubkey.toBase58(), now);

  const authority = getFaucetAuthority();
  if (!authority) {
    res.status(503).json({
      error: "Devnet Faucet authority is offline or not configured in environment.",
    });
    return;
  }

  try {
    const connection = new Connection(RPC_URL, "confirmed");
    const mintPubkey = new PublicKey(mint);

    const recipientAta = getAssociatedTokenAddressSync(mintPubkey, recipientPubkey, true);
    const tokenDecimals = allowedAsset.decimals ?? decimals ?? 6;
    const rawAmount = BigInt(Math.round(parsedAmount * 10 ** tokenDecimals));

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
      amount: parsedAmount,
    });
  } catch (err: any) {
    console.error("Faucet minting error:", err);
    res.status(500).json({ error: err?.message || "Failed to mint test tokens on Devnet" });
  }
}
