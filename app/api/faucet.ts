/**
 * Circuit Protocol - Serverless Devnet Faucet Handler
 *
 * Secure server-side / serverless minting authority.
 * Private key is NEVER delivered to the browser client bundle.
 */

import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
} from "@solana/spl-token";
export interface FaucetAssetInfo {
  symbol: string;
  name: string;
  tokenSymbol: string;
  mint: string;
  decimals: number;
  isNativeSol?: boolean;
  fullAmount: number;
  addressAmount: number;
}

export const FAUCET_ASSETS: FaucetAssetInfo[] = [
  {
    symbol: "SOL",
    name: "Solana Devnet SOL",
    tokenSymbol: "SOL",
    mint: "11111111111111111111111111111111",
    decimals: 9,
    isNativeSol: true,
    fullAmount: 1.0,
    addressAmount: 0.2,
  },
  {
    symbol: "USDC",
    name: "USD Coin (Mock Quote)",
    tokenSymbol: "USDC",
    mint: "23hpSsK3h4na3pwSUf1YzaDF9nzX3t2PppJJf16Qpkxc",
    decimals: 6,
    fullAmount: 10_000,
    addressAmount: 2_000,
  },
  {
    symbol: "WSOL",
    name: "Wrapped SOL (Mock Quote)",
    tokenSymbol: "WSOL",
    mint: "DsjcwkWNxJk5Rvw7dvdJLY3AY5jg9fpnYJvewUaVjxbL",
    decimals: 6,
    fullAmount: 20,
    addressAmount: 4,
  },
  {
    symbol: "NVDA",
    name: "NVIDIA Corporation",
    tokenSymbol: "NVDAx",
    mint: "CARqKy5GTCxz5G1tFiYA96A3Q8jaUE9Vppk7cjGJxRqq",
    decimals: 6,
    fullAmount: 50,
    addressAmount: 10,
  },
  {
    symbol: "AAPL",
    name: "Apple Inc.",
    tokenSymbol: "AAPLx",
    mint: "4zs2vg7MXYms9gwQxA6VYTZCfGy4NVyp1pca8TqdMmnS",
    decimals: 6,
    fullAmount: 50,
    addressAmount: 10,
  },
  {
    symbol: "MSFT",
    name: "Microsoft Corporation",
    tokenSymbol: "MSFTx",
    mint: "gLjzboHgbevzEedufXfWyrgaFk7ePNLBKzRnpGbWpF2",
    decimals: 6,
    fullAmount: 50,
    addressAmount: 10,
  },
  {
    symbol: "AMZN",
    name: "Amazon.com Inc.",
    tokenSymbol: "AMZNx",
    mint: "CuAhF2Y4via5vd85WxuXGS6NEjhQ6moTwpbJmvzX2ZNo",
    decimals: 6,
    fullAmount: 50,
    addressAmount: 10,
  },
  {
    symbol: "GOOGL",
    name: "Alphabet Inc.",
    tokenSymbol: "GOOGLx",
    mint: "8VjvTWpKHJYkMzhNDhVWWJTLx1FPBVfCextL5fDRgq11",
    decimals: 6,
    fullAmount: 50,
    addressAmount: 10,
  },
  {
    symbol: "META",
    name: "Meta Platforms Inc.",
    tokenSymbol: "METAx",
    mint: "9hLNCvmhQqcadie1Bi978z4FVAJADNpruN8SsUEy5dZ3",
    decimals: 6,
    fullAmount: 50,
    addressAmount: 10,
  },
  {
    symbol: "TSLA",
    name: "Tesla Inc.",
    tokenSymbol: "TSLAx",
    mint: "8aN6tJaFz4SfM5Tw3SYVs7sBwi4tYoJcb3tmsYf7159B",
    decimals: 6,
    fullAmount: 50,
    addressAmount: 10,
  },
  {
    symbol: "NFLX",
    name: "Netflix Inc.",
    tokenSymbol: "NFLXx",
    mint: "6QpijMYxF1TFWNqfvDJUzDoX5D1zPnpKV7LacV85BmaQ",
    decimals: 6,
    fullAmount: 50,
    addressAmount: 10,
  },
  {
    symbol: "COIN",
    name: "Coinbase Global Inc.",
    tokenSymbol: "COINx",
    mint: "FTcW7uFQkHfXLQ8TJz38vPTMoD3QruzYjbsN27SjEtiK",
    decimals: 6,
    fullAmount: 50,
    addressAmount: 10,
  },
  {
    symbol: "AMD",
    name: "Advanced Micro Devices",
    tokenSymbol: "AMDx",
    mint: "7KewtMcmKxvw9vMfpuqmPGVr9GNT5v5mgdggBa9gQYEi",
    decimals: 6,
    fullAmount: 50,
    addressAmount: 10,
  },
  {
    symbol: "SPY",
    name: "SPDR S&P 500 ETF Trust",
    tokenSymbol: "SPYx",
    mint: "HGD3ERQrsDXZnrR2EjmKKdoCuw2eBABtfkZgWYxjy2MP",
    decimals: 6,
    fullAmount: 50,
    addressAmount: 10,
  },
];

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
  const mintStr = String(mint).trim();
  const allowedAsset = FAUCET_ASSETS.find(
    (a) =>
      a.mint === mintStr ||
      a.symbol.toUpperCase() === mintStr.toUpperCase() ||
      a.tokenSymbol.toUpperCase() === mintStr.toUpperCase() ||
      (mintStr.toUpperCase() === "GOOGLE" && a.symbol === "GOOGL") ||
      (Boolean(a.isNativeSol) && (mintStr === "11111111111111111111111111111111" || mintStr.toUpperCase() === "SOL" || mintStr.toLowerCase() === "native"))
  );
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

    // Native SOL faucet claim branch
    if (allowedAsset.isNativeSol) {
      const lamports = Math.round(parsedAmount * 1e9);
      let signature = "";

      // 1. Attempt server-side requestAirdrop first
      try {
        signature = await connection.requestAirdrop(recipientPubkey, lamports);
        await connection.confirmTransaction(signature, "confirmed");
      } catch (airdropErr: any) {
        // 2. Fallback to direct transfer from faucet authority reserves
        const authBalance = await connection.getBalance(authority.publicKey);
        const feeMargin = 10_000_000; // preserve 0.01 SOL for rent and gas
        const availableLamports = Math.max(0, authBalance - feeMargin);

        if (availableLamports <= 5000) {
          throw new Error("Faucet SOL reserves temporarily exhausted. Please wait or use faucet.solana.com.");
        }

        const transferLamports = Math.min(lamports, availableLamports);
        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: authority.publicKey,
            toPubkey: recipientPubkey,
            lamports: transferLamports,
          })
        );

        signature = await sendAndConfirmTransaction(connection, tx, [authority], {
          commitment: "confirmed",
        });
      }

      return res.status(200).json({
        success: true,
        signature,
        recipient,
        mint: allowedAsset.mint,
        amount: parsedAmount,
        isNativeSol: true,
      });
    }

    const mintPubkey = new PublicKey(allowedAsset.mint);

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
    let errorDetails = err?.message || "Failed to mint test tokens on Devnet";
    if (typeof err?.getLogs === "function") {
      try {
        const logs = await err.getLogs();
        if (Array.isArray(logs) && logs.length > 0) {
          errorDetails += ` | Logs: [ ${logs.map((l: string) => `"${l}"`).join(", ")} ]`;
        }
      } catch {}
    } else if (err?.logs && Array.isArray(err.logs)) {
      errorDetails += ` | Logs: [ ${err.logs.map((l: string) => `"${l}"`).join(", ")} ]`;
    }
    res.status(500).json({ error: errorDetails });
  }
}
