import { useCallback, useEffect, useState } from "react";
import { ConfirmedSignatureInfo, PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import { EQUITY_MINT, PROGRAM_ID } from "../config";
import { DECIMALS, positionPda } from "../lib/protocol";
import { AssetRegistry } from "../lib/assets/registry";
import { normalizedStore } from "../lib/realtime/normalized-store";

/**
 * Real activity history.
 *
 * Derived from actual signatures touching the user's Position PDAs and wallet,
 * with the action and amount recovered from the program's own log lines and
 * real-time normalized store. Zero synthetic data.
 */

export type ActivityKind =
  | "deposit"
  | "borrow"
  | "repay"
  | "withdraw"
  | "liquidation"
  | "other";

export interface ActivityItem {
  signature: string;
  kind: ActivityKind;
  /** Native token units, when the log exposed an amount. */
  amount: bigint | null;
  /** Which asset the amount refers to. */
  unit: "collateral" | "quote" | null;
  blockTime: number | null;
  success: boolean;
  actor: "HUMAN" | "AGENT";
  reasonCode: string;
  assetSymbol?: string;
}

/**
 * Log patterns emitted by the program. Keeping these in one place makes the
 * coupling to `msg!` strings explicit and easy to update.
 *   deposit.rs   -> "Deposited {} tokens. Total collateral: {}"
 *   borrow.rs    -> "Borrowed {} quote tokens. Total debt: {}. HF: {} BPS"
 *   repay.rs     -> "Repaid {} quote tokens. Remaining debt: {}"
 *   withdraw.rs  -> "Withdrew {} collateral tokens. Remaining: {}"
 *   liquidate.rs -> "LIQUIDATED. Debt repaid: {}. ..."
 */
const PATTERNS: {
  kind: ActivityKind;
  re: RegExp;
  unit: "collateral" | "quote";
}[] = [
  { kind: "deposit", re: /Deposited (\d+) tokens/, unit: "collateral" },
  { kind: "borrow", re: /Borrowed (\d+) quote tokens/, unit: "quote" },
  { kind: "repay", re: /Repaid (\d+) quote tokens/, unit: "quote" },
  { kind: "withdraw", re: /Withdrew (\d+) collateral tokens/, unit: "collateral" },
  { kind: "liquidation", re: /LIQUIDATED\. Debt repaid: (\d+)/, unit: "quote" },
];

function classify(logs: string[] | null): {
  kind: ActivityKind;
  amount: bigint | null;
  unit: "collateral" | "quote" | null;
  actor: "HUMAN" | "AGENT";
  reasonCode: string;
} {
  if (!logs) return { kind: "other", amount: null, unit: null, actor: "HUMAN", reasonCode: "ALLOWED" };
  const joined = logs.join("\n");
  const isAgent =
    joined.includes("execute_agent_action") ||
    joined.includes("ActionAllowed") ||
    joined.includes("ActionDenied") ||
    joined.includes("AgentAuthority");
  const actor = isAgent ? "AGENT" : "HUMAN";

  let reasonCode = "ALLOWED";
  if (joined.includes("BorrowDisabledByRiskPolicy") || joined.includes("BorrowBlocked")) {
    reasonCode = "BORROW_DISABLED_BY_RISK_STATE";
  } else if (joined.includes("AgentBorrowLimitExceeded")) {
    reasonCode = "AGENT_BORROW_LIMIT_EXCEEDED";
  } else if (joined.includes("AgentActionNotPermitted") || joined.includes("AgentAuthorityUnauthorized")) {
    reasonCode = "AGENT_UNAUTHORIZED";
  } else if (joined.includes("AgentAuthorityExpired")) {
    reasonCode = "AGENT_EXPIRED";
  } else if (joined.includes("StalePrice") || joined.includes("OracleStale")) {
    reasonCode = "STALE_ORACLE";
  } else if (joined.includes("ConfidenceTooWide")) {
    reasonCode = "CONFIDENCE_TOO_WIDE";
  } else if (joined.includes("MarketClosed")) {
    reasonCode = "MARKET_CLOSED";
  } else if (joined.includes("BorrowExceedsCapacity") || joined.includes("EffectiveLtvExceeded")) {
    reasonCode = "LTV_EXCEEDED";
  } else if (joined.includes("HealthFactorTooLow")) {
    reasonCode = "HEALTH_FACTOR_TOO_LOW";
  } else if (joined.includes("InsufficientCollateral")) {
    reasonCode = "INSUFFICIENT_COLLATERAL";
  } else if (joined.includes("ActionRiskCostExceedsBudget")) {
    reasonCode = "RISK_BUDGET_EXCEEDED";
  }

  for (const p of PATTERNS) {
    const m = joined.match(p.re);
    if (m) {
      return { kind: p.kind, amount: BigInt(m[1]), unit: p.unit, actor, reasonCode };
    }
  }

  // Instruction-based fallback if formatted numbers were not in standard msg! logs
  if (joined.includes("Instruction: Deposit")) {
    return { kind: "deposit", amount: null, unit: "collateral", actor, reasonCode };
  }
  if (joined.includes("Instruction: Withdraw")) {
    return { kind: "withdraw", amount: null, unit: "collateral", actor, reasonCode };
  }
  if (joined.includes("Instruction: Borrow")) {
    return { kind: "borrow", amount: null, unit: "quote", actor, reasonCode };
  }
  if (joined.includes("Instruction: Repay")) {
    return { kind: "repay", amount: null, unit: "quote", actor, reasonCode };
  }
  if (joined.includes("Instruction: Liquidate")) {
    return { kind: "liquidation", amount: null, unit: "quote", actor, reasonCode };
  }

  return { kind: "other", amount: null, unit: null, actor, reasonCode };
}

export const ACTIVITY_DECIMALS = DECIMALS;

export function useActivity(limit = 35) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  // Subscribe to normalized realtime store so confirmed user actions show up instantly
  useEffect(() => {
    const unsub = normalizedStore.subscribeTransactions(() => {
      setNonce((n) => n + 1);
    });
    return unsub;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!publicKey) {
        setItems(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const allAssets = AssetRegistry.list();
        const targets: { address: PublicKey; assetSymbol?: string }[] = [];

        // 1. Wallet public key
        targets.push({ address: publicKey });

        // 2. Position PDAs across all canonical market assets
        for (const asset of allAssets) {
          try {
            if (asset.tokenMint) {
              const mintKey = new PublicKey(asset.tokenMint);
              const pda = positionPda(publicKey, mintKey);
              targets.push({ address: pda, assetSymbol: asset.tokenSymbol || asset.symbol });
            }
          } catch {
            // Ignore malformed keys
          }
        }

        // Add default equity mint if not already included
        if (EQUITY_MINT && !targets.some((t) => t.address.equals(positionPda(publicKey, EQUITY_MINT!)))) {
          targets.push({ address: positionPda(publicKey, EQUITY_MINT), assetSymbol: "NVDAx" });
        }

        // Fetch signatures for all target addresses in parallel
        const sigResults = await Promise.allSettled(
          targets.map(async (t) => {
            try {
              const sigs = await connection.getSignaturesForAddress(t.address, { limit: 15 });
              return sigs.map((s) => ({ sig: s, targetAsset: t.assetSymbol }));
            } catch {
              return [];
            }
          })
        );

        const sigMap = new Map<string, { sig: ConfirmedSignatureInfo; targetAsset?: string }>();
        for (const res of sigResults) {
          if (res.status === "fulfilled") {
            for (const item of res.value) {
              if (!sigMap.has(item.sig.signature)) {
                sigMap.set(item.sig.signature, item);
              } else if (!sigMap.get(item.sig.signature)!.targetAsset && item.targetAsset) {
                sigMap.get(item.sig.signature)!.targetAsset = item.targetAsset;
              }
            }
          }
        }

        const sortedSigs = Array.from(sigMap.values())
          .sort((a, b) => (b.sig.blockTime ?? 0) - (a.sig.blockTime ?? 0))
          .slice(0, limit);

        const parsed = sortedSigs.length > 0
          ? await connection.getParsedTransactions(
              sortedSigs.map((s) => s.sig.signature),
              { maxSupportedTransactionVersion: 0 }
            )
          : [];

        const onChainItems: ActivityItem[] = [];

        for (let i = 0; i < sortedSigs.length; i++) {
          const { sig: s, targetAsset } = sortedSigs[i];
          const tx = parsed[i];
          const logs = tx?.meta?.logMessages ?? null;

          const programIdStr = PROGRAM_ID.toBase58();
          const touchesCircuit = logs
            ? logs.some((l) => l.includes(programIdStr) || l.includes("Instruction: Deposit") || l.includes("Instruction: Withdraw") || l.includes("Instruction: Borrow") || l.includes("Instruction: Repay"))
            : Boolean(targetAsset);

          // If from general wallet query and didn't touch Circuit, ignore unrelated Solana txs
          if (!targetAsset && !touchesCircuit) {
            continue;
          }

          const { kind, amount, unit, actor, reasonCode } = classify(logs);
          const success = !s.err && !tx?.meta?.err;

          let assetSymbol = targetAsset;
          if (!assetSymbol && tx?.transaction?.message?.accountKeys) {
            const keys = tx.transaction.message.accountKeys.map((k) =>
              typeof k === "string" ? k : k.pubkey.toBase58()
            );
            const matched = allAssets.find((a) => keys.includes(a.tokenMint));
            if (matched) {
              assetSymbol = matched.tokenSymbol || matched.symbol;
            }
          }

          onChainItems.push({
            signature: s.signature,
            kind,
            amount,
            unit,
            blockTime: s.blockTime ?? tx?.blockTime ?? null,
            success,
            actor,
            reasonCode: success ? "ALLOWED" : reasonCode,
            assetSymbol: assetSymbol || "NVDAx",
          });
        }

        // Merge live confirmed/pending transactions from client store
        const liveTxs = normalizedStore.getAllTransactions();
        const existingSigs = new Set(onChainItems.map((it) => it.signature));

        for (const prov of liveTxs) {
          const txRec = prov.value;
          if (txRec.signature && !existingSigs.has(txRec.signature)) {
            const kind: ActivityKind =
              txRec.action === "DEPOSIT"
                ? "deposit"
                : txRec.action === "BORROW"
                ? "borrow"
                : txRec.action === "REPAY"
                ? "repay"
                : txRec.action === "WITHDRAW"
                ? "withdraw"
                : "other";

            const isQuote = txRec.action === "BORROW" || txRec.action === "REPAY";
            const amountBigInt = BigInt(Math.round(txRec.amount * 1_000_000));
            const success = txRec.state === "CONFIRMED" || txRec.state === "FINALIZED";

            onChainItems.unshift({
              signature: txRec.signature,
              kind,
              amount: amountBigInt,
              unit: isQuote ? "quote" : "collateral",
              blockTime: Math.floor((txRec.confirmedAtTs ?? txRec.startedAtTs) / 1000),
              success,
              actor: "HUMAN",
              reasonCode: success ? "ALLOWED" : (txRec.errorCode || "CONFIRMED"),
              assetSymbol: txRec.assetSymbol || "NVDAx",
            });
            existingSigs.add(txRec.signature);
          }
        }

        if (!cancelled) setItems(onChainItems);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [connection, publicKey, limit, nonce]);

  return { items, loading, error, refresh };
}
