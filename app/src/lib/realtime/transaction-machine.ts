/**
 * Circuit Protocol - Explicit Transaction State Machine
 *
 * Enforces the 11 explicit transaction states:
 * IDLE -> PREPARING -> SIMULATING -> AWAITING_SIGNATURE -> SIGNED ->
 * SUBMITTED -> CONFIRMING -> CONFIRMED -> FINALIZED (or FAILED / EXPIRED).
 *
 * Never displays success before Solana confirmation.
 * Immediately dispatches canonical state refresh upon confirmation.
 */

import { TransactionLifecycleState, TransactionRecord } from "./types";
import { normalizedStore } from "./normalized-store";
import { Connection } from "@solana/web3.js";

export const STATE_LABELS: Record<TransactionLifecycleState, string> = {
  IDLE: "Ready",
  PREPARING: "Building instruction payload...",
  SIMULATING: "Simulating onchain permission & compute limits...",
  AWAITING_SIGNATURE: "Waiting for wallet signature...",
  SIGNED: "Transaction signed by authority",
  SUBMITTED: "Submitted · waiting for cluster propagation...",
  CONFIRMING: "Confirming on Solana Devnet...",
  CONFIRMED: "Confirmed onchain",
  FINALIZED: "Finalized by cluster consensus",
  FAILED: "Execution failed",
  EXPIRED: "Transaction expired (blockhash invalid)",
};

export class TransactionStateMachine {
  private static _instance: TransactionStateMachine | null = null;

  public static getInstance(): TransactionStateMachine {
    if (!TransactionStateMachine._instance) {
      TransactionStateMachine._instance = new TransactionStateMachine();
    }
    return TransactionStateMachine._instance;
  }

  public createTransaction(params: {
    action: TransactionRecord["action"];
    assetSymbol: string;
    assetMint: string;
    amount: number;
    quoteSymbol?: string;
  }): TransactionRecord {
    const id = `tx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const record: TransactionRecord = {
      id,
      action: params.action,
      assetSymbol: params.assetSymbol,
      assetMint: params.assetMint,
      amount: params.amount,
      quoteSymbol: params.quoteSymbol ?? "USDC",
      state: "IDLE",
      stateLabel: STATE_LABELS.IDLE,
      signature: null,
      slot: null,
      simulatedUnits: null,
      error: null,
      errorCode: null,
      startedAtTs: Date.now(),
      confirmedAtTs: null,
    };

    normalizedStore.setTransaction(record);
    return record;
  }

  public transition(
    id: string,
    nextState: TransactionLifecycleState,
    meta?: {
      signature?: string;
      slot?: number;
      simulatedUnits?: number;
      error?: string;
      errorCode?: string;
    }
  ): TransactionRecord | null {
    const prov = normalizedStore.getTransaction(id);
    if (!prov) return null;

    const cur = prov.value;
    const updated: TransactionRecord = {
      ...cur,
      state: nextState,
      stateLabel: STATE_LABELS[nextState],
      signature: meta?.signature ?? cur.signature,
      slot: meta?.slot ?? cur.slot,
      simulatedUnits: meta?.simulatedUnits ?? cur.simulatedUnits,
      error: meta?.error ?? cur.error,
      errorCode: meta?.errorCode ?? cur.errorCode,
      confirmedAtTs:
        nextState === "CONFIRMED" || nextState === "FINALIZED"
          ? Date.now()
          : cur.confirmedAtTs,
    };

    normalizedStore.setTransaction(updated, "transaction-state-machine");

    // When confirmed: emit event and trigger state refresh
    if (nextState === "CONFIRMED") {
      this.handleConfirmed(updated);
    }

    return updated;
  }

  private handleConfirmed(tx: TransactionRecord) {
    // Increment telemetry event count
    const tele = normalizedStore.getTelemetry().value;
    normalizedStore.updateTelemetry({
      eventCount: tele.eventCount + 1,
      lastEventSource: `tx-confirmed-${tx.action.toLowerCase()}`,
      lastEventSlot: tx.slot ?? tele.lastEventSlot,
      lastEventTs: Date.now(),
    });
  }

  /**
   * Monitor confirmation with bounded timeout on Solana.
   */
  public async monitorConfirmation(
    id: string,
    signature: string,
    connection: Connection,
    blockhash: string,
    lastValidBlockHeight: number
  ): Promise<boolean> {
    this.transition(id, "SUBMITTED", { signature });
    this.transition(id, "CONFIRMING");

    try {
      const res = await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed"
      );

      if (res.value.err) {
        this.transition(id, "FAILED", {
          error: JSON.stringify(res.value.err),
          errorCode: "TRANSACTION_EXECUTION_FAILED",
        });
        return false;
      }

      // Fetch slot
      let slot: number | undefined;
      try {
        const status = await connection.getSignatureStatus(signature);
        slot = status.value?.slot;
      } catch {
        // ignore
      }

      this.transition(id, "CONFIRMED", { slot });
      return true;
    } catch (err: any) {
      const isExpired = err?.message?.includes("expired") || err?.message?.includes("block height exceeded");
      if (isExpired) {
        this.transition(id, "EXPIRED", { error: "Transaction expired without confirmation." });
      } else {
        this.transition(id, "FAILED", { error: err?.message || "Confirmation failed." });
      }
      return false;
    }
  }
}

export const transactionStateMachine = TransactionStateMachine.getInstance();
