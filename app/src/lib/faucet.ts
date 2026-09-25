import {
  Connection,
  PublicKey,
} from "@solana/web3.js";
import { RPC_URL } from "../env";
import marketsData from "../data/markets.json";

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
    description: "Cloud & enterprise software powerhouse. 70% Base LTV.",
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
    description: "E-commerce & AWS cloud infrastructure. 70% Base LTV.",
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
    description: "Search, Android & cloud innovation. 70% Base LTV.",
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
    description: "Global social networks & open-source AI. 70% Base LTV.",
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
    description: "Electric mobility & autonomy pioneer. 70% Base LTV.",
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
    description: "Global entertainment & streaming leader. 70% Base LTV.",
    category: "equity",
  },
  {
    symbol: "COIN",
    name: "Coinbase Global Inc.",
    tokenSymbol: "COINx",
    mint: "FTcW7uFQkHfXLQ8TJz38vPTMoD3QruzYjbsN27SjEtiK",
    decimals: 6,
    fullAmount: 50,
    addressAmount: 10,
    description: "Digital asset exchange & custody infrastructure. 70% Base LTV.",
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
    description: "High-performance compute & graphics silicon. 70% Base LTV.",
    category: "equity",
  },
  {
    symbol: "SPY",
    name: "SPDR S&P 500 ETF Trust",
    tokenSymbol: "SPYx",
    mint: "HGD3ERQrsDXZnrR2EjmKKdoCuw2eBABtfkZgWYxjy2MP",
    decimals: 6,
    fullAmount: 50,
    addressAmount: 10,
    description: "Benchmark US equity index fund. 75% Base LTV.",
    category: "equity",
  },
];

// 1 hour cooldown per asset per recipient
export const FAUCET_COOLDOWN_MS = 60 * 60 * 1000;
export const COOLDOWN_MS = FAUCET_COOLDOWN_MS;

// In-flight claim lock to guarantee client idempotency
const inFlightClaims: Set<string> = new Set();

function getStorageKey(walletAddress: string, symbol: string): string {
  return `circuit_faucet_${walletAddress}_${symbol}`;
}

export function getCooldownRemaining(walletAddress: string, symbol: string): number {
  if (typeof globalThis === "undefined" || !(globalThis as any).window || !walletAddress) return 0;
  try {
    const raw = (globalThis as any).localStorage?.getItem(getStorageKey(walletAddress, symbol));
    if (!raw) return 0;
    const lastClaim = parseInt(raw, 10);
    if (isNaN(lastClaim)) return 0;
    const elapsed = Date.now() - lastClaim;
    return Math.max(0, FAUCET_COOLDOWN_MS - elapsed);
  } catch {
    return 0;
  }
}

export function recordClaim(walletAddress: string, symbol: string): void {
  if (typeof globalThis === "undefined" || !(globalThis as any).window || !walletAddress) return;
  try {
    (globalThis as any).localStorage?.setItem(getStorageKey(walletAddress, symbol), String(Date.now()));
  } catch {}
}

export function formatCooldown(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remMinutes = minutes % 60;
    return `${hours}h ${remMinutes}m`;
  }
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

export function sanitizeFaucetError(err: any): string {
  const msg = String(err?.message || err || "Unknown faucet error");
  if (msg.includes("429") || msg.includes("rate limit") || msg.includes("limit reached") || msg.includes("airdrop request limit")) {
    return "Devnet rate limit reached on Solana public RPC (faucet airdrop limit). Use https://faucet.solana.com/ for Devnet SOL, or claim Circuit tokenized equities (NVDAx, AAPLx, USDC) below which mint via protocol authority.";
  }
  if (msg.includes("insufficient lamports")) {
    return "Faucet authority has insufficient Devnet SOL for rent/fees.";
  }
  return msg;
}

export interface ClaimResult {
  signature: string;
  amount: number;
  symbol: string;
  asset: string;
  recipient: string;
  isNativeSol: boolean;
  timestamp: number;
  explorerUrl: string;
}

/**
 * Claim testnet assets on Solana Devnet.
 * Fully secured: no private keys in frontend bundle.
 */
export async function claimFaucetAsset(
  recipientAddress: string,
  asset: FaucetAsset,
  isConnectedWallet: boolean
): Promise<ClaimResult> {
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

  // Client-side idempotency lock
  const idempotencyKey = `${recipientAddress}:${asset.mint}`;
  if (inFlightClaims.has(idempotencyKey)) {
    throw new Error(`A claim for ${asset.tokenSymbol} is already in progress. Please wait.`);
  }

  inFlightClaims.add(idempotencyKey);

  const amount = isConnectedWallet ? asset.fullAmount : asset.addressAmount;
  let signature = "";

  try {
    // Both SPL tokens and native SOL are claimed via the secure serverless /api/faucet endpoint
    let res: Response | null = null;
    let faucetError: string | null = null;

    try {
      res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: recipientAddress,
          mint: asset.mint,
          amount,
          decimals: asset.decimals,
        }),
      });

      const data = (await res.json()) as any;
      if (!res.ok || !data.success) {
        faucetError = data?.error || `Failed to claim ${asset.tokenSymbol} from Devnet faucet`;
      } else {
        signature = data.signature;
      }
    } catch (netErr: any) {
      faucetError = netErr?.message || "Failed to reach /api/faucet";
    }

    // If /api/faucet did not provide a signature and asset is native SOL, try direct RPC fallback
    if (!signature && asset.isNativeSol) {
      try {
        const connection = new Connection(RPC_URL, "confirmed");
        const lamports = Math.round(amount * 1e9);
        signature = await connection.requestAirdrop(recipientPubkey, lamports);
        await connection.confirmTransaction(signature, "confirmed");
      } catch (airdropErr: any) {
        const msg = String(airdropErr?.message || airdropErr);
        if (msg.includes("429") || msg.includes("rate limit") || msg.includes("limit reached")) {
          throw new Error(
            faucetError ||
            "Devnet rate limit reached on Solana public RPC. Please retry in a few seconds or fund via faucet.solana.com."
          );
        }
        throw new Error(faucetError || airdropErr?.message || "Devnet SOL airdrop request failed");
      }
    } else if (!signature && faucetError) {
      throw new Error(faucetError);
    }

    // Record claim only on verified success
    recordClaim(recipientAddress, asset.symbol);

    const explorerUrl = `https://explorer.solana.com/tx/${signature}?cluster=devnet`;

    return {
      signature,
      amount,
      symbol: asset.tokenSymbol,
      asset: asset.tokenSymbol,
      recipient: recipientAddress,
      isNativeSol: Boolean(asset.isNativeSol),
      timestamp: Date.now(),
      explorerUrl,
    };
  } finally {
    inFlightClaims.delete(idempotencyKey);
  }
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

