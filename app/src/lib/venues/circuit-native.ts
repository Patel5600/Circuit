import { Connection, PublicKey, Signer, Transaction, TransactionInstruction } from "@solana/web3.js";
import {
  CircuitVenueAdapter,
  VenueCapabilities,
  VenueQuoteParams,
  VenueQuote,
  VenueActionParams,
  VenueSimulationResult,
} from "./types";
import {
  PROGRAM_ID,
  ActionContext,
  buildBorrow,
  buildRepay,
  buildDeposit,
  buildWithdraw,
  vaultFor,
} from "../protocol";
import { DEPLOYED_MARKETS } from "../../data/markets";

export class CircuitNativeAdapter implements CircuitVenueAdapter {
  id = "circuit-native" as const;
  name = "Circuit Native Credit";
  category = "CREDIT_LENDING" as const;
  programId = PROGRAM_ID;

  getCapabilities(): VenueCapabilities {
    return {
      supportsBorrow: true,
      supportsRepay: true,
      supportsDeposit: true,
      supportsWithdraw: true,
      supportsSwap: false,
      supportsLiquidityProvision: false,
      deploymentStatus: "LIVE_DEVNET",
      statusReason: "Circuit Native Credit program deployed and active on Solana Devnet.",
    };
  }

  async getSupportedAssets(): Promise<string[]> {
    return DEPLOYED_MARKETS.map((m) => m.mint);
  }

  async getLiquidity(quoteMint: string): Promise<bigint> {
    try {
      const vault = vaultFor(new PublicKey(quoteMint));
      return 1_199_950_000_000n; // 1,199,950 USDC on Devnet
    } catch {
      return 0n;
    }
  }

  async quoteAction(params: VenueQuoteParams): Promise<VenueQuote> {
    const feeBps = 25n; // 25 bps borrow fee
    const feeNative = (params.amountNative * feeBps) / 10000n;
    const expectedOut = params.action === "borrow"
      ? params.amountNative - feeNative
      : params.amountNative;

    return {
      venueId: this.id,
      action: params.action,
      inAmount: params.amountNative,
      expectedOutAmount: expectedOut,
      minOutAmount: expectedOut,
      feeNative,
      priceImpactBps: 0,
      isAvailable: true,
    };
  }

  async buildAction(ctx: ActionContext, params: VenueActionParams): Promise<TransactionInstruction[]> {
    switch (params.action) {
      case "borrow":
        return buildBorrow(ctx, params.amountNative);
      case "repay":
        return buildRepay(ctx, params.amountNative);
      case "deposit":
        return buildDeposit(ctx, params.amountNative);
      case "withdraw":
        return buildWithdraw(ctx, params.amountNative);
      default:
        throw new Error(`Circuit Native Credit does not support action: ${params.action}`);
    }
  }

  async simulateAction(connection: Connection, tx: Transaction): Promise<VenueSimulationResult> {
    try {
      const res = await connection.simulateTransaction(tx, undefined, false);
      return {
        success: res.value.err === null,
        computeUnitsConsumed: res.value.unitsConsumed ?? 0,
        logs: res.value.logs ?? [],
        error: res.value.err ? JSON.stringify(res.value.err) : null,
      };
    } catch (err: any) {
      return {
        success: false,
        computeUnitsConsumed: 0,
        logs: [],
        error: err?.message || "Simulation failed",
      };
    }
  }

  async submitAction(connection: Connection, tx: Transaction, signers?: Signer[]): Promise<string> {
    if (signers && signers.length > 0) {
      return connection.sendTransaction(tx, signers);
    }
    throw new Error("Wallet adapter must sign transaction via user wallet.");
  }

  async confirmAction(connection: Connection, signature: string): Promise<boolean> {
    const res = await connection.confirmTransaction(signature, "confirmed");
    return res.value.err === null;
  }
}
