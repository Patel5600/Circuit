import { useCallback, useEffect, useState } from "react";
import { ConfirmedSignatureInfo } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import { EQUITY_MINT } from "../config";
import { DECIMALS, positionPda } from "../lib/protocol";

/**
 * Real activity history.
 *
 * Derived from actual signatures touching the user's Position PDA, with the
 * action and amount recovered from the program's own log lines. Nothing here is
 * synthesised: if a transaction cannot be classified it is reported as
 * "Position update" rather than guessed at.
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
  return { kind: "other", amount: null, unit: null, actor, reasonCode };
}

export const ACTIVITY_DECIMALS = DECIMALS;

export function useActivity(limit = 25) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!publicKey || !EQUITY_MINT) {
        setItems(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const position = positionPda(publicKey, EQUITY_MINT);

        let sigs: ConfirmedSignatureInfo[] = [];
        try {
          sigs = await connection.getSignaturesForAddress(position, { limit });
        } catch {
          // A position that has never existed has no signature history.
          sigs = [];
        }

        if (sigs.length === 0) {
          if (!cancelled) setItems([]);
          return;
        }

        // Batch the detail fetch; public RPC rate limits punish per-signature calls.
        const parsed = await connection.getParsedTransactions(
          sigs.map((s) => s.signature),
          { maxSupportedTransactionVersion: 0 }
        );

        const out: ActivityItem[] = sigs.map((s, i) => {
          const tx = parsed[i];
          const logs = tx?.meta?.logMessages ?? null;
          const { kind, amount, unit, actor, reasonCode } = classify(logs);
          const success = !s.err && !tx?.meta?.err;
          return {
            signature: s.signature,
            kind,
            amount,
            unit,
            blockTime: s.blockTime ?? tx?.blockTime ?? null,
            success,
            actor,
            reasonCode: success ? "ALLOWED" : reasonCode,
          };
        });

        if (!cancelled) setItems(out);
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
