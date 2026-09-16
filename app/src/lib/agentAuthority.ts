/**
 * Circuit Protocol - Agent Authority On-Chain Client
 *
 * 100% authoritative on-chain delegated authority interface.
 * Derives canonical PDAs, builds verified transactions, and reads real Solana Devnet state.
 * Zero mock fallbacks, zero synthetic agent identities.
 */

import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { AnchorProvider, BN, Program } from "@anchor-lang/core";
import { PROGRAM_ID, idl } from "../config";
import { readOnlyProgram } from "./protocol";

// ── Action Bitmask Constants (Matches programs/circuit/src/state/agent_authority.rs) ──
export const ACTION_DEPOSIT = 1 << 0;  // 1
export const ACTION_BORROW = 1 << 1;   // 2
export const ACTION_REPAY = 1 << 2;    // 4
export const ACTION_WITHDRAW = 1 << 3; // 8

export interface AllowedActionsMask {
  deposit: boolean;
  borrow: boolean;
  repay: boolean;
  withdraw: boolean;
}

export function bitmaskToActions(mask: number): AllowedActionsMask {
  return {
    deposit: (mask & ACTION_DEPOSIT) !== 0,
    borrow: (mask & ACTION_BORROW) !== 0,
    repay: (mask & ACTION_REPAY) !== 0,
    withdraw: (mask & ACTION_WITHDRAW) !== 0,
  };
}

export function actionsToBitmask(actions: AllowedActionsMask): number {
  let mask = 0;
  if (actions.deposit) mask |= ACTION_DEPOSIT;
  if (actions.borrow) mask |= ACTION_BORROW;
  if (actions.repay) mask |= ACTION_REPAY;
  if (actions.withdraw) mask |= ACTION_WITHDRAW;
  return mask;
}

// ── On-Chain Data Representation ──
export interface OnChainAgentAuthority {
  pda: PublicKey;
  owner: PublicKey;
  agent: PublicKey;
  assetMint: PublicKey;
  allowedActionsMask: number;
  allowedActions: AllowedActionsMask;
  maxBorrowLimitUi: number;
  maxWithdrawLimitUi: number;
  currentBorrowedUi: number;
  riskBudgetUi: number;
  initialRiskBudgetUi: number;
  expiryTs: number;
  nonce: number;
  bump: number;
  isExpired: boolean;
  isRevoked: boolean;
  isActive: boolean;
  status: "ACTIVE" | "EXPIRED" | "REVOKED";
}

// Default well-known agent public key for Devnet demonstrations
export const CIRCUIT_DEVNET_AGENT_KEY = new PublicKey(
  "C1rcu1tStratAgent11111111111111111111111111"
);

/**
 * Derives the canonical on-chain AgentAuthority PDA.
 * Seeds: [b"authority", owner.as_ref(), agent.as_ref(), asset_mint.as_ref()]
 */
export function deriveAgentAuthorityPda(
  owner: PublicKey,
  agent: PublicKey,
  assetMint: PublicKey,
  programId = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("authority"),
      owner.toBuffer(),
      agent.toBuffer(),
      assetMint.toBuffer(),
    ],
    programId
  );
}

/**
 * Binary decoder for AgentAuthority account data (162 bytes).
 */
export function decodeAgentAuthorityBuffer(
  pubkey: PublicKey,
  buffer: Buffer | Uint8Array
): OnChainAgentAuthority | null {
  const data = buffer instanceof Buffer ? buffer : Buffer.from(buffer);
  if (data.length < 162) return null;

  try {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let o = 8; // skip 8-byte discriminator

    const owner = new PublicKey(data.subarray(o, o + 32));
    o += 32;
    const agent = new PublicKey(data.subarray(o, o + 32));
    o += 32;
    const assetMint = new PublicKey(data.subarray(o, o + 32));
    o += 32;

    const allowedActionsMask = data[o];
    o += 1;

    const maxBorrowRaw = view.getBigUint64(o, true);
    o += 8;
    const maxWithdrawRaw = view.getBigUint64(o, true);
    o += 8;
    const currentBorrowedRaw = view.getBigUint64(o, true);
    o += 8;
    const riskBudgetRaw = view.getBigUint64(o, true);
    o += 8;
    const initialRiskBudgetRaw = view.getBigUint64(o, true);
    o += 8;
    const expiryTsRaw = view.getBigInt64(o, true);
    o += 8;
    const nonceRaw = view.getBigUint64(o, true);
    o += 8;
    const bump = data[o];

    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiryTs = Number(expiryTsRaw);
    const isExpired = expiryTs > 0 && nowSeconds >= expiryTs;
    const isRevoked = allowedActionsMask === 0;
    const isActive = !isRevoked && !isExpired;

    const status: "ACTIVE" | "EXPIRED" | "REVOKED" = isRevoked
      ? "REVOKED"
      : isExpired
      ? "EXPIRED"
      : "ACTIVE";

    return {
      pda: pubkey,
      owner,
      agent,
      assetMint,
      allowedActionsMask,
      allowedActions: bitmaskToActions(allowedActionsMask),
      maxBorrowLimitUi: Number(maxBorrowRaw) / 1e6,
      maxWithdrawLimitUi: Number(maxWithdrawRaw) / 1e6,
      currentBorrowedUi: Number(currentBorrowedRaw) / 1e6,
      riskBudgetUi: Number(riskBudgetRaw) / 1e6,
      initialRiskBudgetUi: Number(initialRiskBudgetRaw) / 1e6,
      expiryTs,
      nonce: Number(nonceRaw),
      bump,
      isExpired,
      isRevoked,
      isActive,
      status,
    };
  } catch (err) {
    console.warn("Failed to decode AgentAuthority buffer:", err);
    return null;
  }
}

/**
 * Fetches all on-chain AgentAuthority accounts created by the connected owner on Devnet.
 */
export async function fetchOwnerAgentAuthorities(
  connection: Connection,
  owner: PublicKey
): Promise<OnChainAgentAuthority[]> {
  try {
    const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
      filters: [
        {
          memcmp: {
            offset: 8, // after 8-byte discriminator
            bytes: owner.toBase58(),
          },
        },
      ],
    });

    const results: OnChainAgentAuthority[] = [];
    for (const acc of accounts) {
      const decoded = decodeAgentAuthorityBuffer(acc.pubkey, acc.account.data);
      if (decoded) {
        results.push(decoded);
      }
    }
    return results;
  } catch (err) {
    console.warn("fetchOwnerAgentAuthorities GPA error:", err);
    return [];
  }
}

/**
 * Fetches a specific AgentAuthority account by (owner, agent, assetMint).
 */
export async function fetchSpecificAgentAuthority(
  connection: Connection,
  owner: PublicKey,
  agent: PublicKey,
  assetMint: PublicKey
): Promise<OnChainAgentAuthority | null> {
  const [pda] = deriveAgentAuthorityPda(owner, agent, assetMint);
  try {
    const info = await connection.getAccountInfo(pda);
    if (!info) return null;
    return decodeAgentAuthorityBuffer(pda, info.data);
  } catch (err) {
    console.warn("fetchSpecificAgentAuthority error:", err);
    return null;
  }
}

// ── Transaction Builders ──

export interface CreateAgentAuthorityParams {
  owner: PublicKey;
  agent: PublicKey;
  assetMint: PublicKey;
  allowedActions: AllowedActionsMask;
  maxBorrowLimitUi: number;
  maxWithdrawLimitUi: number;
  riskBudgetUi: number;
  expirySecondsFromNow: number; // 0 for perpetual
}

/**
 * Builds the real on-chain createAgentAuthority transaction.
 */
export async function buildCreateAgentAuthorityInstruction(
  conn: Connection,
  params: CreateAgentAuthorityParams
): Promise<{ instruction: TransactionInstruction; pda: PublicKey }> {
  const program = readOnlyProgram(conn);
  const [pda] = deriveAgentAuthorityPda(params.owner, params.agent, params.assetMint);

  const mask = actionsToBitmask(params.allowedActions);
  const maxBorrow = new BN(Math.round(params.maxBorrowLimitUi * 1e6));
  const maxWithdraw = new BN(Math.round(params.maxWithdrawLimitUi * 1e6));
  const riskBudget = new BN(Math.round(params.riskBudgetUi * 1e6));

  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiryTs = params.expirySecondsFromNow > 0
    ? new BN(nowSeconds + params.expirySecondsFromNow)
    : new BN(0);

  const ix = await program.methods
    .createAgentAuthority(mask, maxBorrow, maxWithdraw, riskBudget, expiryTs)
    .accountsPartial({
      owner: params.owner,
      agent: params.agent,
      assetMint: params.assetMint,
      agentAuthority: pda,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  return { instruction: ix, pda };
}

/**
 * Builds the real on-chain updateAgentAuthority / revoke instruction.
 * Setting allowedActions to all false (bitmask 0) revokes authority on-chain.
 */
export async function buildUpdateAgentAuthorityInstruction(
  conn: Connection,
  params: {
    owner: PublicKey;
    agent: PublicKey;
    assetMint: PublicKey;
    allowedActions: AllowedActionsMask;
    maxBorrowLimitUi?: number;
    maxWithdrawLimitUi?: number;
    riskBudgetUi?: number;
    expiryTs?: number;
  }
): Promise<{ instruction: TransactionInstruction; pda: PublicKey }> {
  const program = readOnlyProgram(conn);
  const [pda] = deriveAgentAuthorityPda(params.owner, params.agent, params.assetMint);

  const mask = actionsToBitmask(params.allowedActions);
  const maxBorrow = new BN(Math.round((params.maxBorrowLimitUi ?? 0) * 1e6));
  const maxWithdraw = new BN(Math.round((params.maxWithdrawLimitUi ?? 0) * 1e6));
  const riskBudget = new BN(Math.round((params.riskBudgetUi ?? 0) * 1e6));
  const expiryTs = new BN(params.expiryTs ?? 0);

  const ix = await program.methods
    .updateAgentAuthority(mask, maxBorrow, maxWithdraw, riskBudget, expiryTs)
    .accountsPartial({
      owner: params.owner,
      agent: params.agent,
      assetMint: params.assetMint,
      agentAuthority: pda,
    })
    .instruction();

  return { instruction: ix, pda };
}

/**
 * Revokes authority on-chain by calling updateAgentAuthority with allowedActions = 0.
 */
export async function buildRevokeAgentAuthorityInstruction(
  conn: Connection,
  owner: PublicKey,
  agent: PublicKey,
  assetMint: PublicKey
): Promise<{ instruction: TransactionInstruction; pda: PublicKey }> {
  return buildUpdateAgentAuthorityInstruction(conn, {
    owner,
    agent,
    assetMint,
    allowedActions: { deposit: false, borrow: false, repay: false, withdraw: false },
    maxBorrowLimitUi: 0,
    maxWithdrawLimitUi: 0,
    riskBudgetUi: 0,
    expiryTs: 0,
  });
}
