import { Connection, PublicKey, Signer, Transaction, TransactionInstruction } from "@solana/web3.js";
import {
  CircuitVenueAdapter,
  VenueCapabilities,
  VenueQuoteParams,
  VenueQuote,
  VenueActionParams,
  VenueSimulationResult,
} from "./types";
import { ActionContext } from "../protocol";

export const KAMINO_LEND_MAINNET_PROGRAM_ID = new PublicKey("KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD");

export class KaminoAdapter implements CircuitVenueAdapter {
  id = "kamino" as const;
  name = "Kamino Lend";
  category = "CREDIT_LENDING" as const;
  programId = KAMINO_LEND_MAINNET_PROGRAM_ID;

  getCapabilities(): VenueCapabilities {
    return {
      supportsBorrow: true,
      supportsRepay: true,
      supportsDeposit: true,
      supportsWithdraw: true,
      supportsSwap: false,
      supportsLiquidityProvision: true,
      deploymentStatus: "UNSUPPORTED_ON_DEVNET",
      statusReason: "Kamino Lend tokenized equity pools are currently Mainnet-only. No live tokenized stock markets are provisioned on Devnet.",
    };
  }

  async getSupportedAssets(): Promise<string[]> {
    // Unsupported on Devnet
    return [];
  }

  async getLiquidity(_assetMint: string): Promise<bigint> {
    return 0n;
  }

  async quoteAction(params: VenueQuoteParams): Promise<VenueQuote> {
    return {
      venueId: this.id,
      action: params.action,
      inAmount: params.amountNative,
      expectedOutAmount: 0n,
      minOutAmount: 0n,
      feeNative: 0n,
      priceImpactBps: 0,
      isAvailable: false,
      unavailableReason: "Kamino Lend is unsupported on Devnet for tokenized equities. Route through Circuit Native Credit instead.",
    };
  }

  async buildAction(_ctx: ActionContext, _params: VenueActionParams): Promise<TransactionInstruction[]> {
    throw new Error("Kamino Lend execution is unsupported on Devnet. Use Circuit Native Credit.");
  }

  async simulateAction(_connection: Connection, _tx: Transaction): Promise<VenueSimulationResult> {
    return {
      success: false,
      computeUnitsConsumed: 0,
      logs: [],
      error: "Kamino Lend program KLend2... has no active tokenized equity reserve on Devnet.",
    };
  }

  async submitAction(_connection: Connection, _tx: Transaction, _signers?: Signer[]): Promise<string> {
    throw new Error("Cannot submit Kamino Lend action on Devnet.");
  }

  async confirmAction(_connection: Connection, _signature: string): Promise<boolean> {
    return false;
  }
}
