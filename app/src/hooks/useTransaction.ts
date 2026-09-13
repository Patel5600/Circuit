import { useCallback, useMemo, useState } from "react";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import { EQUITY_MINT, QUOTE_MINT } from "../config";
import { DeployedMarket } from "../data/markets";
import { useMarket } from "../context/MarketContext";
import {
  ActionContext,
  buildErrorMap,
  describeError,
  readOnlyProgram,
  sendInstructions,
} from "../lib/protocol";

/**
 * Transaction lifecycle.
 *
 * The user is never left looking at a disabled button: every stage has its own
 * label, and failures are translated into plain language by `describeError`
 * rather than surfacing raw RPC or Anchor output.
 */
export type TxPhase =
  | "idle"
  | "preparing"
  | "awaiting-wallet"
  | "submitting"
  | "confirming"
  | "success"
  | "error";

export interface TxState {
  phase: TxPhase;
  /** Short label suitable for a button or modal heading. */
  label: string;
  signature: string | null;
  error: string | null;
  /** Human summary of what succeeded, e.g. "50.00 USDC borrowed". */
  summary: string | null;
}

const IDLE: TxState = {
  phase: "idle",
  label: "",
  signature: null,
  error: null,
  summary: null,
};

const PHASE_LABEL: Record<TxPhase, string> = {
  idle: "",
  preparing: "Preparing transaction",
  "awaiting-wallet": "Waiting for wallet confirmation",
  submitting: "Sending to Solana",
  confirming: "Confirming on Solana",
  success: "Done",
  error: "Could not complete",
};

export function useTransaction(overrideMarket?: DeployedMarket) {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const marketCtx = useMarket();
  const activeMarket = overrideMarket ?? marketCtx?.selectedMarket ?? null;

  const [state, setState] = useState<TxState>(IDLE);
  const errorMap = useMemo(() => buildErrorMap(), []);

  const reset = useCallback(() => setState(IDLE), []);

  const defaultEquityMint = useMemo(() => {
    return activeMarket ? new PublicKey(activeMarket.mint) : EQUITY_MINT;
  }, [activeMarket]);

  const defaultQuoteMint = useMemo(() => {
    return activeMarket ? new PublicKey(activeMarket.quoteMint) : QUOTE_MINT;
  }, [activeMarket]);

  const ready = Boolean(
    publicKey && signTransaction && defaultEquityMint && defaultQuoteMint
  );

  const run = useCallback(
    async (opts: {
      /** Verb used in status copy, e.g. "Borrow". */
      verb: string;
      /** Human summary shown on success. */
      summary: string;
      priceUpdate: ActionContext["priceUpdate"];
      equityMint?: PublicKey;
      quoteMint?: PublicKey;
      build: (ctx: ActionContext) => Promise<TransactionInstruction[]>;
      onSuccess?: () => void;
    }): Promise<boolean> => {
      const eqMint = opts.equityMint ?? defaultEquityMint;
      const qtMint = opts.quoteMint ?? defaultQuoteMint;

      if (!publicKey || !signTransaction || !eqMint || !qtMint) {
        setState({
          phase: "error",
          label: PHASE_LABEL.error,
          signature: null,
          summary: null,
          error: "Connect a wallet to continue.",
        });
        return false;
      }

      const set = (phase: TxPhase, extra: Partial<TxState> = {}) =>
        setState((s) => ({ ...s, phase, label: PHASE_LABEL[phase], ...extra }));

      try {
        set("preparing", { error: null, signature: null, summary: null });

        const ctx: ActionContext = {
          program: readOnlyProgram(connection),
          owner: publicKey,
          equityMint: eqMint,
          quoteMint: qtMint,
          priceUpdate: opts.priceUpdate,
        };
        const ixs = await opts.build(ctx);

        // Wallet approval and submission are distinct stages for the user even
        // though the helper performs them together.
        set("awaiting-wallet");
        const signature = await sendInstructions(
          connection,
          { publicKey, signTransaction },
          ixs,
          {
            onSigned: () => set("submitting"),
            onSent: () => set("confirming"),
          }
        );

        set("success", { signature, summary: opts.summary });
        opts.onSuccess?.();
        return true;
      } catch (e: any) {
        set("error", { error: describeError(e, errorMap) });
        return false;
      }
    },
    [connection, publicKey, signTransaction, errorMap, defaultEquityMint, defaultQuoteMint]
  );

  const busy =
    state.phase === "preparing" ||
    state.phase === "awaiting-wallet" ||
    state.phase === "submitting" ||
    state.phase === "confirming";

  return { state, run, reset, busy, ready };
}
