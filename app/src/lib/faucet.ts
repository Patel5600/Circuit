import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
} from "@solana/spl-token";
import { RPC_URL } from "../config";
import marketsData from "../data/markets.json";

/**
 * Devnet Faucet Keypair & Mint Authority for Circuit Protocol testnet assets.
 * Authority address: F5JmuDsKh9oswAhR9rJSfL2PGU1UpQF2cN3n7NjZrFAT
 */
const FAUCET_KEYPAIR_BYTES = Uint8Array.from([
  184, 0, 156, 19, 64, 79, 32, 44, 114, 144, 87, 50, 135, 57, 173, 156,
  225, 188, 148, 105, 153, 63, 190, 89, 204, 76, 205, 160, 21, 44, 208, 119,
  209, 30, 9, 153, 59, 205, 199, 232, 53, 46, 211, 86, 216, 26, 22, 52,
  52, 167, 15, 98, 14, 33, 84, 170, 65, 77, 130, 192, 254, 200, 105, 68,
]);

export interface FaucetAsset {
  symbol: string;
  name: string;
  tokenSymbol: string;
  mint: string;
  decimals: number;
  isNativeSol?: boolean;
  fullAmount: number;     // 100% connected limit
  addressAmount: number;  // 20% unconnected address limit
  description: string;
  category: "equity" | "quote" | "native";
}

export const FAUCET_ASSETS: FaucetAsset[] = [
  // Native SOL
  {
    symbol: "SOL",
    name: "Solana Devnet SOL",
    tokenSymbol: "SOL",
    mint: "11111111111111111111111111111111",
    decimals: 9,
    isNativeSol: true,
    fullAmount: 1.0,
    addressAmount: 0.2,
    description: "Gas token for paying network fees on Solana Devnet.",
    category: "native",
  },
  // Quotes
  {
    symbol: "USDC",
    name: "USD Coin (Mock Quote)",
    tokenSymbol: "USDC",
    mint: marketsData.quoteMints.USDC,
    decimals: 6,
    fullAmount: 10_000,
    addressAmount: 2_000,
    description: "Primary debt quote currency used to borrow against stock collateral.",
    category: "quote",
  },
  {
    symbol: "WSOL",
    name: "Wrapped SOL (Mock Quote)",
    tokenSymbol: "WSOL",
    mint: marketsData.quoteMints.WSOL,
    decimals: 6,
    fullAmount: 20,
    addressAmount: 4,
    description: "Alternate borrow currency for the NVDA-SOL credit market.",
    category: "quote",
  },
  // 11 Tokenized Equity Collateral Mints
  {
    symbol: "NVDA",
    name: "NVIDIA Corporation",
    tokenSymbol: "NVDAx",
    mint: "CARqKy5GTCxz5G1tFiYA96A3Q8jaUE9Vppk7cjGJxRqq",
    decimals: 6,
    fullAmount: 50,
    addressAmount: 10,
    description: "AI hardware market leader. 70% Base LTV on Circuit.",
    category: "equity",
  },
  {
    symbol: "AAPL",
    name: "Apple Inc.",
    tokenSymbol: "AAPLx",
    mint: "4zs2vg7MXYms9gwQxA6VYTZCfGy4NVyp1pca8TqdMmnS",
    decimals: 6,
    fullAmount: 50,
    addressAmount: 10,
    description: "Consumer tech & silicon leader. 70% Base LTV on Circuit.",
    category: "equity",
  },
  {
    symbol: "MSFT",
    name: "Microsoft Corporation",
    tokenSymbol: "MSFTx",
    mint: "gLjzboHgbevzEedufXfWyrgaFk7ePNLBKzRnpGbWpF2",
    decimals: 6,
    fullAmount: 50,
    addressAmount: 10,
    description: "Enterprise software & cloud infrastructure. 70% Base LTV.",
    category: "equity",
  },
  {
    symbol: "AMZN",
    name: "Amazon.com Inc.",
    tokenSymbol: "AMZNx",
    mint: "CuAhF2Y4via5vd85WxuXGS6NEjhQ6moTwpbJmvzX2ZNo",
    decimals: 6,
    fullAmount: 50,
    addressAmount: 10,
    description: "Global e-commerce & AWS cloud compute. 65% Base LTV.",
    category: "equity",
  },
  {
    symbol: "GOOGL",
    name: "Alphabet Inc.",
    tokenSymbol: "GOOGLx",
    mint: "8VjvTWpKHJYkMzhNDhVWWJTLx1FPBVfCextL5fDRgq11",
    decimals: 6,
    fullAmount: 50,
    addressAmount: 10,
    description: "Search, cloud, and AI research conglomerate. 70% Base LTV.",
    category: "equity",
  },
  {
    symbol: "META",
    name: "Meta Platforms Inc.",
    tokenSymbol: "METAx",
    mint: "9hLNCvmhQqcadie1Bi978z4FVAJADNpruN8SsUEy5dZ3",
    decimals: 6,
    fullAmount: 50,
    addressAmount: 10,
    description: "Social networking, VR, and open-weight AI. 65% Base LTV.",
    category: "equity",
  },
  {
    symbol: "TSLA",
    name: "Tesla Inc.",
    tokenSymbol: "TSLAx",
    mint: "8aN6tJaFz4SfM5Tw3SYVs7sBwi4tYoJcb3tmsYf7159B",
    decimals: 6,
    fullAmount: 50,
    addressAmount: 10,
    description: "Electric mobility, energy storage, and robotics. 60% Base LTV.",
    category: "equity",
  },
  {
    symbol: "NFLX",
    name: "Netflix Inc.",
    tokenSymbol: "NFLXx",
    mint: "6QpijMYxF1TFWNqfvDJUzDoX5D1zPnpKV7LacV85BmaQ",
    decimals: 6,
    fullAmount: 50,
    addressAmount: 10,
    description: "Global entertainment & digital streaming network. 65% Base LTV.",
    category: "equity",
  },
  {
    symbol: "COIN",
    name: "Coinbase Global",
    tokenSymbol: "COINx",
    mint: "FTcW7uFQkHfXLQ8TJz38vPTMoD3QruzYjbsN27SjEtiK",
    decimals: 6,
    fullAmount: 50,
    addressAmount: 10,
    description: "Regulated digital asset infrastructure and custody. 60% Base LTV.",
    category: "equity",
  },
  {
    symbol: "AMD",
    name: "Advanced Micro Devices",
    tokenSymbol: "AMDx",
    mint: "7KewtMcmKxvw9vMfpuqmPGVr9GNT5v5mgdggBa9gQYEi",
    decimals: 6,
    fullAmount: 50,
    addressAmount: 10,
    description: "High-performance datacenter compute & GPUs. 65% Base LTV.",
    category: "equity",
  },
  {
    symbol: "SPY",
    name: "SPDR S&P 500 ETF Trust",
    tokenSymbol: "SPYx",
    mint: "HGD3ERQrsDXZnrR2EjmKKdoCuw2eBABtfkZgWYxjy2MP",
    decimals: 6,
    fullAmount: 20,
    addressAmount: 4,
    description: "Index benchmark representing 500 top US equities. 75% Base LTV.",
    category: "equity",
  },
];

export interface ClaimResult {
  signature: string;
  asset: string;
  amount: number;
  recipient: string;
  timestamp: number;
  explorerUrl: string;
}

const STORAGE_PREFIX = "circuit_faucet_claim_";
export const COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours per asset

export function formatCooldown(ms: number): string {
  if (ms <= 0) return "";
  const totalMins = Math.ceil(ms / (60 * 1000));
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}

export function sanitizeFaucetError(err: any): string {
  if (!err) return "Transaction failed. Please retry.";
  const str = typeof err === "string" ? err : err?.message ?? String(err);
  const logs = Array.isArray(err?.logs) ? err.logs.join(" ") : "";
  const full = (str + " " + logs).toLowerCase();

  if (full.includes("insufficient lamports") || full.includes("custom program error: 0x1")) {
    return "Faucet fee reserves are currently low. Please retry shortly.";
  }
  if (full.includes("rate limit") || full.includes("429") || full.includes("too many requests")) {
    return "Solana Devnet RPC is rate-limited. Please wait 15 seconds and retry.";
  }
  if (full.includes("blockhash not found") || full.includes("timeout") || full.includes("timed out")) {
    return "Devnet transaction timed out. Please click Claim again.";
  }
  if (full.includes("invalid solana address") || full.includes("bad public key")) {
    return "Please enter a valid 32-44 character Solana address.";
  }
  if (full.includes("cooldown active")) {
    return str;
  }
  if (full.includes("airdrop to") && full.includes("failed")) {
    return "Official Solana Devnet airdrop faucet is rate-limited. Please retry shortly.";
  }

  // Clean raw simulation strings to 1 concise sentence
  const clean = str.split("\n")[0].split(". Logs:")[0].replace("SendTransactionError: ", "").replace("Transaction simulation failed: ", "").trim();
  if (clean.length > 80) {
    return "Devnet transaction simulation failed. Please retry shortly.";
  }
  return clean || "Transaction failed on Devnet. Please retry.";
}

export function getCooldownRemaining(recipient: string, symbol: string): number {
  try {
    const key = `${STORAGE_PREFIX}${recipient}_${symbol}`;
    const raw = localStorage.getItem(key);
    if (!raw) return 0;
    const lastClaim = Number(raw);
    const elapsed = Date.now() - lastClaim;
    if (elapsed < COOLDOWN_MS) {
      return COOLDOWN_MS - elapsed;
    }
    return 0;
  } catch {
    return 0;
  }
}

export function recordClaim(recipient: string, symbol: string): void {
  try {
    const key = `${STORAGE_PREFIX}${recipient}_${symbol}`;
    localStorage.setItem(key, String(Date.now()));
  } catch {
    // Ignore storage issues
  }
}

/**
 * Mint on-chain tokens directly on Solana Devnet.
 * Creates the user's Associated Token Account if needed and mints the tokens.
 */
export async function claimFaucetAsset(
  recipientAddress: string,
  asset: FaucetAsset,
  isConnectedWallet: boolean
): Promise<ClaimResult> {
  const connection = new Connection(RPC_URL, "confirmed");

  let recipientPubkey: PublicKey;
  try {
    recipientPubkey = new PublicKey(recipientAddress);
  } catch {
    throw new Error(`Invalid Solana address: "${recipientAddress}"`);
  }

  // Check cooldown
  const remaining = getCooldownRemaining(recipientAddress, asset.symbol);
  if (remaining > 0) {
    throw new Error(
      `Cooldown active for ${asset.tokenSymbol}. Available in ${formatCooldown(remaining)}.`
    );
  }

  const amount = isConnectedWallet ? asset.fullAmount : asset.addressAmount;
  const authority = Keypair.fromSecretKey(FAUCET_KEYPAIR_BYTES);

  let signature = "";

  if (asset.isNativeSol) {
    // Handle Devnet SOL
    try {
      // 1. First attempt native devnet requestAirdrop
      const lamports = Math.round(amount * 1e9);
      signature = await connection.requestAirdrop(recipientPubkey, lamports);
      await connection.confirmTransaction(signature, "confirmed");
    } catch (airdropErr) {
      // 2. Fallback: transfer from faucet authority keypair if authority has enough SOL
      try {
        const authBalance = await connection.getBalance(authority.publicKey);
        const sendLamports = Math.min(
          Math.round(amount * 1e9),
          Math.max(0, authBalance - 10_000_000) // preserve 0.01 SOL for gas
        );
        if (sendLamports <= 0) {
          throw new Error("Devnet validator faucet rate-limited and authority balance is low.");
        }
        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: authority.publicKey,
            toPubkey: recipientPubkey,
            lamports: sendLamports,
          })
        );
        signature = await sendAndConfirmTransaction(connection, tx, [authority]);
      } catch (fallbackErr: any) {
        throw new Error(sanitizeFaucetError(fallbackErr || airdropErr));
      }
    }
  } else {
    // Handle SPL Tokens (11 equities + USDC + WSOL)
    const mintPubkey = new PublicKey(asset.mint);
    const recipientAta = getAssociatedTokenAddressSync(mintPubkey, recipientPubkey);
    const rawAmount = BigInt(Math.round(amount * 10 ** asset.decimals));

    const tx = new Transaction();

    try {
      // Check if recipient ATA exists to save rent
      const ataInfo = await connection.getAccountInfo(recipientAta);
      if (!ataInfo) {
        tx.add(
          createAssociatedTokenAccountIdempotentInstruction(
            authority.publicKey,
            recipientAta,
            recipientPubkey,
            mintPubkey
          )
        );
      }

      tx.add(
        createMintToInstruction(
          mintPubkey,
          recipientAta,
          authority.publicKey,
          rawAmount
        )
      );

      signature = await sendAndConfirmTransaction(connection, tx, [authority], {
        commitment: "confirmed",
        preflightCommitment: "confirmed",
      });
    } catch (err: any) {
      throw new Error(sanitizeFaucetError(err));
    }
  }

  // Record successful claim timestamp
  recordClaim(recipientAddress, asset.symbol);

  const explorerUrl = `https://explorer.solana.com/tx/${signature}?cluster=devnet`;

  return {
    signature,
    asset: asset.tokenSymbol,
    amount,
    recipient: recipientAddress,
    timestamp: Date.now(),
    explorerUrl,
  };
}

/**
 * Claim the "Full Starter Pack" (NVDAx + AAPLx + USDC + SOL)
 */
export async function claimStarterPack(
  recipientAddress: string,
  isConnectedWallet: boolean,
  onProgress?: (status: string) => void
): Promise<ClaimResult[]> {
  const starterSymbols = ["NVDA", "AAPL", "USDC", "SOL"];
  const results: ClaimResult[] = [];

  for (const sym of starterSymbols) {
    const asset = FAUCET_ASSETS.find((a) => a.symbol === sym);
    if (!asset) continue;

    const remaining = getCooldownRemaining(recipientAddress, sym);
    if (remaining > 0) {
      continue; // Skip if on cooldown
    }

    onProgress?.(`Minting ${asset.tokenSymbol}...`);
    try {
      const res = await claimFaucetAsset(recipientAddress, asset, isConnectedWallet);
      results.push(res);
    } catch (err) {
      console.warn(`Failed minting ${sym} in starter pack:`, err);
    }
  }

  return results;
}

/**
 * Query on-chain balances for a given recipient address across all faucet assets.
 */
export async function queryOnChainBalances(
  recipientAddress: string
): Promise<Record<string, number>> {
  const balances: Record<string, number> = {};
  try {
    const recipientPubkey = new PublicKey(recipientAddress);
    const connection = new Connection(RPC_URL, "confirmed");

    // SOL balance
    const lamports = await connection.getBalance(recipientPubkey);
    balances["SOL"] = lamports / 1e9;

    // SPL token balances
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      recipientPubkey,
      { programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") }
    );

    for (const { account } of tokenAccounts.value) {
      const parsed = account.data.parsed?.info;
      if (!parsed) continue;
      const mint = parsed.mint;
      const uiAmount = parsed.tokenAmount?.uiAmount ?? 0;

      const matchingAsset = FAUCET_ASSETS.find((a) => a.mint === mint);
      if (matchingAsset) {
        balances[matchingAsset.symbol] = uiAmount;
      }
    }
  } catch (err) {
    console.warn("Error querying on-chain balances:", err);
  }
  return balances;
}
