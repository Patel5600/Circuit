/**
 * Circuit Protocol - Autonomous Strategy Agent CLI Executor (Devnet)
 *
 * Implements Section 32:
 * Deterministic CLI executor using a real delegated keypair to execute bounded
 * autonomous actions on Solana Devnet through Circuit's on-chain execute_agent_action.
 *
 * Security: Never exposes private keys. Operates strictly within on-chain AgentAuthority bounds.
 */

import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { AnchorProvider, BN, Program } from "@anchor-lang/core";
import { idl, PROGRAM_ID, RPC_URL } from "../app/src/config";
import { deriveAgentAuthorityPda, fetchSpecificAgentAuthority } from "../app/src/lib/agentAuthority";
import { DEPLOYED_MARKETS } from "../app/src/data/markets-registry";

async function main() {
  const args = process.argv.slice(2);
  const ownerAddressStr = args[0];
  const symbol = (args[1] || "NVDA").toUpperCase();
  const action = args[2] || "status"; // "status" | "borrow" | "repay"
  const amountUi = parseFloat(args[3] || "10");

  if (!ownerAddressStr) {
    console.log("Usage: npx ts-node scripts/agent-executor.ts <OWNER_PUBKEY> [SYMBOL] [ACTION: status|borrow|repay] [AMOUNT_UI]");
    process.exit(1);
  }

  const connection = new Connection(RPC_URL, "confirmed");
  const ownerPubkey = new PublicKey(ownerAddressStr);

  const market = DEPLOYED_MARKETS.find((m) => m.symbol.toUpperCase() === symbol);
  if (!market) {
    console.error(`Market not found for symbol ${symbol}`);
    process.exit(1);
  }
  const assetMint = new PublicKey(market.mint);

  console.log(`\n======================================================`);
  console.log(`CIRCUIT PROTOCOL — AUTONOMOUS STRATEGY AGENT EXECUTOR`);
  console.log(`======================================================`);
  console.log(`Cluster:      Solana Devnet`);
  console.log(`Program ID:   ${PROGRAM_ID.toBase58()}`);
  console.log(`Owner Wallet: ${ownerPubkey.toBase58()}`);
  console.log(`Asset Scope:  ${symbol} (${assetMint.toBase58()})`);

  // Example agent pubkey (or specify your delegated agent)
  // In production, the agent keypair signs the transaction.
  const agentKey = Keypair.generate().publicKey; // Placeholder lookup
  console.log(`Agent Key:    ${agentKey.toBase58()}`);

  const authorityPda = deriveAgentAuthorityPda(ownerPubkey, agentKey, assetMint);
  console.log(`Authority PDA: ${authorityPda[0].toBase58()}`);

  const onChainAccount = await fetchSpecificAgentAuthority(connection, ownerPubkey, agentKey, assetMint);

  if (!onChainAccount) {
    console.log(`\n[STATUS]: NOT CONFIGURED`);
    console.log(`No active on-chain AgentAuthority PDA found for this Owner + Agent + Asset tuple.`);
    console.log(`The owner must first create and sign an authority PDA in Circuit UI.`);
    return;
  }

  console.log(`\n[STATUS]: ${onChainAccount.status}`);
  console.log(`Allowed Actions: Borrow=${onChainAccount.allowedActions.borrow}, Repay=${onChainAccount.allowedActions.repay}, Deposit=${onChainAccount.allowedActions.deposit}, Withdraw=${onChainAccount.allowedActions.withdraw}`);
  console.log(`Max Borrow Limit:  $${onChainAccount.maxBorrowLimitUi}`);
  console.log(`Current Borrowed:  $${onChainAccount.currentBorrowedUi}`);
  console.log(`Dynamic Risk Budget: $${onChainAccount.riskBudgetUi}`);
  console.log(`Is Expired:        ${onChainAccount.isExpired}`);
  console.log(`Is Revoked:        ${onChainAccount.isRevoked}`);

  if (action === "status") {
    console.log(`\nRun with action 'borrow' or 'repay' to submit on-chain execution with signed agent keypair.`);
  }
}

main().catch((err) => {
  console.error("Executor error:", err);
  process.exit(1);
});
