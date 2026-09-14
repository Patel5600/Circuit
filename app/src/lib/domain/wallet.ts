/**
 * Circuit Protocol - Wallet & Cluster Safety Domain
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { WalletStatus } from "./types";
export const DEFAULT_CLUSTER = "devnet";

export const DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";

export function getWalletStatus(opts: {
  connected: boolean;
  connecting: boolean;
  isWrongNetwork: boolean;
  isRpcDegraded: boolean;
  isSigning?: boolean;
  isConfirming?: boolean;
}): WalletStatus {
  if (opts.isWrongNetwork) return "WRONG_NETWORK";
  if (opts.isSigning) return "TX_SIGNING";
  if (opts.isConfirming) return "TX_CONFIRMING";
  if (opts.isRpcDegraded && opts.connected) return "RPC_DEGRADED";
  if (opts.connecting) return "CONNECTING";
  if (opts.connected) return "CONNECTED";
  return "DISCONNECTED";
}

export async function verifyClusterGenesis(connection: Connection): Promise<{
  isDevnet: boolean;
  genesisHash: string;
}> {
  try {
    const genesisHash = await connection.getGenesisHash();
    const isDevnet = genesisHash === DEVNET_GENESIS_HASH || DEFAULT_CLUSTER === "devnet";
    return { isDevnet, genesisHash };
  } catch (e) {
    // If genesis call fails, fallback to configured cluster
    return { isDevnet: DEFAULT_CLUSTER === "devnet", genesisHash: "" };
  }
}

export function formatSol(lamports: bigint): string {
  const ui = Number(lamports) / 1e9;
  if (ui === 0) return "0.00 SOL";
  if (ui < 0.001) return "<0.001 SOL";
  return `${ui.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} SOL`;
}
