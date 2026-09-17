/**
 * Circuit Protocol — Server-Side Execution Engine
 *
 * Deterministic condition evaluation + Circuit permission check + transaction.
 * Used by both /api/automation/tick (Cron) and /api/automation/execute (manual).
 *
 * Pipeline:
 *   OBSERVE → EVALUATE CONDITION → PERMISSION CHECK → EXECUTE → CONFIRM → RECORD
 */

import { Connection, PublicKey, Keypair, Transaction, TransactionInstruction, SystemProgram } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { createHash } from "crypto";
import bs58 from "bs58";
import type { AutomationTask, TaskResult, WatchCondition, ExecutionOutcome } from "../../app/src/lib/automation/types";

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey(process.env.CIRCUIT_PROGRAM_ID ?? "Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2");
const QUOTE_MINT = new PublicKey(process.env.QUOTE_MINT ?? "23hpSsK3h4na3pwSUf1YzaDF9nzX3t2PppJJf16Qpkxc");
const PYTH_API = "https://hermes.pyth.network/v2/updates/price/latest";

export const MARKETS_INFO = [
  { symbol: "NVDA", mint: "CARqKy5GTCxz5G1tFiYA96A3Q8jaUE9Vppk7cjGJxRqq", feed: "0x64ee2bc923a105553a1a9e5256e54f86641215be11b7d59048a1c97a55c2f826" },
  { symbol: "AAPL", mint: "62cWkF95f74iVj95mR6qPqE564r1mNqZp8iW2E5Lp4Z1", feed: "0x49f6b65cb1de6b10eaf75e73efdb05ae4531804368eb1e26aa75199651bf12f4" },
  { symbol: "MSFT", mint: "gLjzboHgbevzEedufXfWyrgaFk7ePNLBKzRnpGbWpF2", feed: "0x76b2512fb44fa70c40875e5b6f3c5825ddb130e5519dbba15c44cf6423984be1" },
  { symbol: "GOOGL", mint: "8VjvTWpKHJYkMzhNDhVWWJTLx1FPBVfCextL5fDRgq11", feed: "0x5109b828a2a095ff748cf6ed420f13511eb915ea01128e44ebf9a65fbcc2efea" },
];

// ── Devnet State Reader ────────────────────────────────────────────────────

export interface PortfolioState {
  healthFactor: number | null;
  collateralUsd: number;
  debtUsd: number;
  borrowCapacityUsd: number;
  riskState: string;
  oracleFreshnessMs: number;
  ltvBps: number;
  positionsCount: number;
}

export async function fetchPortfolioState(ownerAddress: string): Promise<PortfolioState> {
  const conn = new Connection(RPC_URL, "confirmed");
  let ownerKey: PublicKey;
  try {
    ownerKey = new PublicKey(ownerAddress);
  } catch {
    throw new Error(`Invalid owner public key: ${ownerAddress}`);
  }

  // 1. Derive Position PDAs for all monitored equity markets
  const positionPdas = MARKETS_INFO.map(m => {
    const mintKey = new PublicKey(m.mint);
    return PublicKey.findProgramAddressSync(
      [Buffer.from("position"), ownerKey.toBuffer(), mintKey.toBuffer()],
      PROGRAM_ID
    )[0];
  });

  // 2. Fetch all Position accounts in a single batch RPC request
  let posAccounts: Array<{ pubkey: PublicKey; account: any }> = [];
  try {
    const rawAccs = await conn.getMultipleAccountsInfo(positionPdas, "confirmed");
    posAccounts = positionPdas.map((pk, i) => ({ pubkey: pk, account: rawAccs[i] }));
  } catch (e) {
    console.warn("Devnet position accounts fetch warning:", e);
  }

  // 3. Fetch real Pyth oracle prices from Hermes
  const feedIds = MARKETS_INFO.map(m => m.feed);
  const prices: Record<string, { price: number; conf: number; publishTime: number }> = {};
  let minPublishTime = 0;

  try {
    const url = `${PYTH_API}?ids[]=${feedIds.join("&ids[]=")}`;
    const resp = await fetch(url);
    if (resp.ok) {
      const data = await resp.json() as { parsed?: Array<{ id: string; price: { price: string; conf: string; expo: number; publish_time: number } }> };
      for (const p of data.parsed ?? []) {
        const id = p.id.startsWith("0x") ? p.id : `0x${p.id}`;
        const pr = parseFloat(p.price.price) * Math.pow(10, p.price.expo);
        const cf = parseFloat(p.price.conf) * Math.pow(10, p.price.expo);
        prices[id] = { price: pr, conf: cf, publishTime: p.price.publish_time };
        if (!minPublishTime || p.price.publish_time < minPublishTime) {
          minPublishTime = p.price.publish_time;
        }
      }
    }
  } catch (e) {
    console.warn("Pyth Hermes oracle fetch warning:", e);
  }

  // 4. Decode real onchain positions (102-byte layout)
  let totalCollateralUsd = 0;
  let totalDebtUsd = 0;
  let activePositionsCount = 0;

  for (let i = 0; i < MARKETS_INFO.length; i++) {
    const m = MARKETS_INFO[i];
    const acc = posAccounts[i]?.account;
    if (acc && acc.data && acc.data.length >= 102) {
      const buf: Buffer = acc.data;
      const colUnits = Number(buf.readBigUInt64LE(72)) / 1e6; // 6 decimals
      const debtUnits = Number(buf.readBigUInt64LE(80)) / 1e6; // USDC 6 decimals
      const lastPriceRaw = Number(buf.readBigInt64LE(88));
      const lastExpo = buf.readInt32LE(96);
      const snapshotPrice = lastPriceRaw > 0 ? lastPriceRaw * Math.pow(10, lastExpo) : 0;
      const currentPrice = prices[m.feed]?.price || snapshotPrice || 100;

      if (colUnits > 0 || debtUnits > 0) {
        totalCollateralUsd += colUnits * currentPrice;
        totalDebtUsd += debtUnits;
        activePositionsCount++;
      }
    }
  }

  // 5. Read RiskRatchet PDA for primary feed
  let onchainRiskState = "SAFE";
  try {
    const primaryFeedHex = MARKETS_INFO[0].feed.replace(/^0x/, "");
    const feedBytes = Buffer.from(primaryFeedHex, "hex");
    const [ratchetPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("ratchet"), feedBytes],
      PROGRAM_ID
    );
    const ratchetAcc = await conn.getAccountInfo(ratchetPda, "confirmed");
    if (ratchetAcc && ratchetAcc.data && ratchetAcc.data.length >= 41) {
      const stateByte = ratchetAcc.data[40]; // MarketState enum: 0=Safe, 1=Restricted, 2=Defensive, 3=Emergency
      if (stateByte === 1) onchainRiskState = "RESTRICTED";
      else if (stateByte === 2) onchainRiskState = "DEFENSIVE";
      else if (stateByte === 3) onchainRiskState = "EMERGENCY";
    }
  } catch {
    /* fallback to safe/evaluated */
  }

  const nowSec = Date.now() / 1000;
  const oracleFreshnessMs = minPublishTime > 0 ? Math.max(0, (nowSec - minPublishTime) * 1000) : 1500;

  // Derive risk state with oracle staleness if not explicitly emergency onchain
  let effectiveRiskState = onchainRiskState;
  if (effectiveRiskState === "SAFE") {
    if (oracleFreshnessMs > 120_000) effectiveRiskState = "DEFENSIVE";
    else if (oracleFreshnessMs > 60_000) effectiveRiskState = "RESTRICTED";
  }

  // Calculate Health Factor & LTV
  const healthFactor = totalDebtUsd > 0
    ? (totalCollateralUsd * 0.80) / totalDebtUsd
    : (totalCollateralUsd > 0 ? 999 : null);

  const ltvBps = totalCollateralUsd > 0
    ? Math.round((totalDebtUsd / totalCollateralUsd) * 10000)
    : 0;

  const borrowCapacityUsd = Math.max(0, totalCollateralUsd * 0.70 - totalDebtUsd);

  return {
    healthFactor,
    collateralUsd: totalCollateralUsd,
    debtUsd: totalDebtUsd,
    borrowCapacityUsd,
    riskState: effectiveRiskState,
    oracleFreshnessMs,
    ltvBps,
    positionsCount: activePositionsCount,
  };
}

// ── Condition Evaluator ────────────────────────────────────────────────────

export function evaluateCondition(
  cond: WatchCondition,
  state: PortfolioState
): { met: boolean; actualValue: number | string } {
  let actual: number | string = 0;

  switch (cond.field) {
    case "health_factor":        actual = state.healthFactor ?? 999; break;
    case "risk_state":           actual = state.riskState; break;
    case "borrow_capacity_usd":  actual = state.borrowCapacityUsd; break;
    case "collateral_usd":       actual = state.collateralUsd; break;
    case "debt_usd":             actual = state.debtUsd; break;
    case "oracle_staleness_ms":  actual = state.oracleFreshnessMs; break;
    case "ltv_bps":              actual = state.ltvBps; break;
    case "authority_expiry_ts":  actual = Date.now() / 1000; break;
    default: actual = 0;
  }

  const threshold = cond.threshold;
  let met = false;

  if (typeof actual === "string" || typeof threshold === "string") {
    switch (cond.operator) {
      case "eq":  met = String(actual) === String(threshold); break;
      case "neq": met = String(actual) !== String(threshold); break;
      default:    met = false;
    }
  } else {
    const a = actual as number;
    const b = Number(threshold);
    switch (cond.operator) {
      case "lt":  met = a < b;  break;
      case "lte": met = a <= b; break;
      case "gt":  met = a > b;  break;
      case "gte": met = a >= b; break;
      case "eq":  met = Math.abs(a - b) < 0.0001; break;
      case "neq": met = Math.abs(a - b) >= 0.0001; break;
    }
  }

  return { met, actualValue: actual };
}

// ── Permission Check ───────────────────────────────────────────────────────

export function checkAutomationPermission(
  task: AutomationTask,
  state: PortfolioState
): { allowed: boolean; reasonCode: string } {
  // OBSERVE/ANALYZE/REPORT/WATCH never require authority
  if (["OBSERVE", "ANALYZE", "REPORT", "WATCH"].includes(task.type)) {
    return { allowed: true, reasonCode: "ALLOWED" };
  }

  // Global Risk Ratchet Gates
  if (state.riskState === "EMERGENCY") {
    if (["BORROW", "WITHDRAW"].includes(task.type)) {
      return { allowed: false, reasonCode: "RISK_STATE_RESTRICTED" };
    }
  }
  if (state.riskState === "DEFENSIVE") {
    if (task.type === "BORROW") {
      return { allowed: false, reasonCode: "BORROW_DISABLED_BY_RISK_STATE" };
    }
    if (task.type === "WITHDRAW" && state.debtUsd > 0) {
      return { allowed: false, reasonCode: "WITHDRAW_BLOCKED_WITH_DEBT" };
    }
  }
  if (state.riskState === "RESTRICTED") {
    if (task.type === "BORROW") {
      return { allowed: false, reasonCode: "BORROW_DISABLED_BY_RISK_STATE" };
    }
  }

  // Hard limits
  if (task.executionsToday >= task.maxExecutionsPerDay) {
    return { allowed: false, reasonCode: "DAILY_LIMIT_EXCEEDED" };
  }

  if (task.consecutiveFailures >= task.maxConsecutiveFailures) {
    return { allowed: false, reasonCode: "CONSECUTIVE_FAILURES_EXCEEDED" };
  }

  // Policy amount bounds
  if (task.policy) {
    if (task.policy.maxAmountPerActionUsd <= 0) {
      return { allowed: false, reasonCode: "POLICY_AMOUNT_ZERO" };
    }
    if (task.policy.riskAdaptive && state.riskState !== "SAFE" && task.type === "BORROW") {
      return { allowed: false, reasonCode: "RISK_ADAPTIVE_STOP" };
    }
  }

  return { allowed: true, reasonCode: "ALLOWED" };
}

// ── Transaction Executor ───────────────────────────────────────────────────

async function executeAgentTransaction(
  task: AutomationTask,
  state: PortfolioState,
  executionId: string
): Promise<{ txSignature: string | null; error: string | null }> {
  // Read tasks don't emit transactions
  if (["OBSERVE", "ANALYZE", "REPORT", "WATCH"].includes(task.type)) {
    return { txSignature: null, error: null };
  }

  const signerSecret = process.env.AGENT_SIGNER_SECRET;
  if (!signerSecret) {
    return { txSignature: null, error: "AGENT_SIGNER_NOT_CONFIGURED" };
  }

  try {
    const signerKeypair = Keypair.fromSecretKey(bs58.decode(signerSecret));
    const conn = new Connection(RPC_URL, "confirmed");
    const ownerPubkey = new PublicKey(task.owner);
    const market = MARKETS_INFO[0];
    const assetMint = new PublicKey(market.mint);
    const feedBytes = Buffer.from(market.feed.replace(/^0x/, ""), "hex");

    // Compute execute_agent_action discriminator
    const disc = createHash("sha256").update("global:execute_agent_action").digest().subarray(0, 8);

    // Action enum byte: 0=Deposit, 1=Borrow, 2=Repay, 3=Withdraw
    let actionByte = 2; // default Repay
    if (task.type === "BORROW") actionByte = 1;
    else if (task.type === "DEPOSIT") actionByte = 0;
    else if (task.type === "WITHDRAW") actionByte = 3;

    const amountUsd = task.policy?.maxAmountPerActionUsd ?? 10;
    const amountNative = BigInt(Math.round(amountUsd * 1e6));

    // PDA derivations
    const [protocolConfig] = PublicKey.findProgramAddressSync([Buffer.from("protocol")], PROGRAM_ID);
    const [assetConfig] = PublicKey.findProgramAddressSync([Buffer.from("asset"), assetMint.toBuffer()], PROGRAM_ID);
    const [riskRatchet] = PublicKey.findProgramAddressSync([Buffer.from("ratchet"), feedBytes], PROGRAM_ID);
    const [marketGuard] = PublicKey.findProgramAddressSync([Buffer.from("guard"), feedBytes], PROGRAM_ID);
    const [position] = PublicKey.findProgramAddressSync([Buffer.from("position"), ownerPubkey.toBuffer(), assetMint.toBuffer()], PROGRAM_ID);
    const [agentAuthority] = PublicKey.findProgramAddressSync([Buffer.from("authority"), ownerPubkey.toBuffer(), signerKeypair.publicKey.toBuffer(), assetMint.toBuffer()], PROGRAM_ID);

    // Associated Token Accounts
    const collateralVault = getAssociatedTokenAddressSync(assetMint, protocolConfig, true);
    const liquidityVault = getAssociatedTokenAddressSync(QUOTE_MINT, protocolConfig, true);
    const userCollateralAta = getAssociatedTokenAddressSync(assetMint, ownerPubkey, true);
    const userQuoteAta = getAssociatedTokenAddressSync(QUOTE_MINT, ownerPubkey, true);

    // Read current nonce from agent authority if available
    let intentNonce = 0n;
    try {
      const authAcc = await conn.getAccountInfo(agentAuthority, "confirmed");
      if (authAcc && authAcc.data && authAcc.data.length >= 88) {
        intentNonce = authAcc.data.readBigUInt64LE(80);
      }
    } catch { /* use default 0n */ }

    // Pack instruction data: 8 bytes discriminator + 1 byte action + 8 bytes amount + 8 bytes nonce
    const ixData = Buffer.alloc(8 + 1 + 8 + 8);
    disc.copy(ixData, 0);
    ixData.writeUInt8(actionByte, 8);
    ixData.writeBigUInt64LE(amountNative, 9);
    ixData.writeBigUInt64LE(intentNonce, 17);

    // Dummy/configured price update account
    const priceUpdate = new PublicKey(process.env.PYTH_PRICE_ACCOUNT ?? "7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE");

    const ix = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: signerKeypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: ownerPubkey, isSigner: false, isWritable: false },
        { pubkey: protocolConfig, isSigner: false, isWritable: false },
        { pubkey: assetConfig, isSigner: false, isWritable: false },
        { pubkey: riskRatchet, isSigner: false, isWritable: true },
        { pubkey: marketGuard, isSigner: false, isWritable: true },
        { pubkey: position, isSigner: false, isWritable: true },
        { pubkey: agentAuthority, isSigner: false, isWritable: true },
        { pubkey: priceUpdate, isSigner: false, isWritable: false },
        { pubkey: collateralVault, isSigner: false, isWritable: true },
        { pubkey: liquidityVault, isSigner: false, isWritable: true },
        { pubkey: userCollateralAta, isSigner: false, isWritable: true },
        { pubkey: userQuoteAta, isSigner: false, isWritable: true },
        { pubkey: assetMint, isSigner: false, isWritable: false },
        { pubkey: QUOTE_MINT, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: ixData,
    });

    const tx = new Transaction().add(ix);
    tx.feePayer = signerKeypair.publicKey;
    const { blockhash } = await conn.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.sign(signerKeypair);

    const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
    await conn.confirmTransaction(sig, "confirmed");

    return { txSignature: sig, error: null };
  } catch (err: any) {
    return { txSignature: null, error: err?.message || String(err) };
  }
}

// ── Main Pipeline ──────────────────────────────────────────────────────────

export async function runTaskPipeline(task: AutomationTask): Promise<TaskResult> {
  const startMs = Date.now();
  const executionId = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  // Check expiry
  if (task.expiresAt && Date.now() > task.expiresAt) {
    return {
      taskId: task.id,
      executionId,
      outcome: "FAILED" as ExecutionOutcome,
      reasonCode: "TASK_EXPIRED",
      conditionMet: false,
      timestamp: Date.now(),
      durationMs: Date.now() - startMs,
    };
  }

  // 1. OBSERVE — read real Devnet state
  let state: PortfolioState;
  try {
    state = await fetchPortfolioState(task.owner);
  } catch (err: any) {
    return {
      taskId: task.id,
      executionId,
      outcome: "FAILED" as ExecutionOutcome,
      reasonCode: `RPC_ERROR: ${err?.message ?? "Read failed"}`,
      conditionMet: false,
      timestamp: Date.now(),
      durationMs: Date.now() - startMs,
    };
  }

  // 2. OBSERVE-only tasks: record and return
  if (task.type === "OBSERVE" || task.type === "ANALYZE" || task.type === "REPORT") {
    return {
      taskId: task.id,
      executionId,
      outcome: "OBSERVED" as ExecutionOutcome,
      reasonCode: "ALLOWED",
      conditionMet: false,
      stateAfter: {
        healthFactor: state.healthFactor ?? "N/A",
        riskState: state.riskState,
        collateralUsd: state.collateralUsd,
        debtUsd: state.debtUsd,
      },
      timestamp: Date.now(),
      durationMs: Date.now() - startMs,
    };
  }

  // 3. EVALUATE condition
  let conditionMet = true;
  let actualValue: number | string = 0;
  if (task.condition) {
    const evalResult = evaluateCondition(task.condition, state);
    conditionMet = evalResult.met;
    actualValue = evalResult.actualValue;
  }

  if (!conditionMet) {
    return {
      taskId: task.id,
      executionId,
      outcome: "CONDITION_NOT_MET" as ExecutionOutcome,
      reasonCode: "CONDITION_NOT_MET",
      conditionValue: actualValue,
      conditionMet: false,
      stateAfter: {
        riskState: state.riskState,
        healthFactor: state.healthFactor ?? "N/A",
        collateralUsd: state.collateralUsd,
        debtUsd: state.debtUsd,
      },
      timestamp: Date.now(),
      durationMs: Date.now() - startMs,
    };
  }

  // 4. CIRCUIT PERMISSION CHECK
  const { allowed, reasonCode } = checkAutomationPermission(task, state);
  if (!allowed) {
    return {
      taskId: task.id,
      executionId,
      outcome: "PERMISSION_DENIED" as ExecutionOutcome,
      reasonCode,
      conditionValue: actualValue,
      conditionMet: true,
      actionProposed: task.type,
      stateAfter: {
        riskState: state.riskState,
        healthFactor: state.healthFactor ?? "N/A",
      },
      timestamp: Date.now(),
      durationMs: Date.now() - startMs,
    };
  }

  // 5. EXECUTE TRANSACTION
  const amount = task.policy?.maxAmountPerActionUsd ?? 0;
  const { txSignature, error } = await executeAgentTransaction(task, state, executionId);

  if (error === "AGENT_SIGNER_NOT_CONFIGURED") {
    return {
      taskId: task.id,
      executionId,
      outcome: "BLOCKED_NO_SIGNER" as ExecutionOutcome,
      reasonCode: "AGENT_SIGNER_NOT_CONFIGURED",
      conditionValue: actualValue,
      conditionMet: true,
      actionProposed: `${task.type} $${amount.toFixed(2)}`,
      stateAfter: {
        riskState: state.riskState,
        healthFactor: state.healthFactor ?? "N/A",
      },
      timestamp: Date.now(),
      durationMs: Date.now() - startMs,
    };
  }

  if (error) {
    return {
      taskId: task.id,
      executionId,
      outcome: "FAILED" as ExecutionOutcome,
      reasonCode: error,
      conditionValue: actualValue,
      conditionMet: true,
      actionProposed: `${task.type} $${amount.toFixed(2)}`,
      stateAfter: {
        riskState: state.riskState,
        healthFactor: state.healthFactor ?? "N/A",
      },
      timestamp: Date.now(),
      durationMs: Date.now() - startMs,
    };
  }

  return {
    taskId: task.id,
    executionId,
    outcome: txSignature ? "CONFIRMED" : "SUBMITTED",
    reasonCode: "ALLOWED",
    conditionValue: actualValue,
    conditionMet: true,
    actionProposed: `${task.type} $${amount.toFixed(2)}`,
    txSignature: txSignature ?? undefined,
    txStatus: txSignature ? "CONFIRMED" : "SUBMITTED",
    stateAfter: {
      riskState: state.riskState,
      healthFactor: state.healthFactor ?? "N/A",
    },
    timestamp: Date.now(),
    durationMs: Date.now() - startMs,
  };
}
