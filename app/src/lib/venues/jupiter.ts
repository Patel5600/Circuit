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

export const JUPITER_V6_PROGRAM_ID = new PublicKey("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");

export class JupiterAdapter implements CircuitVenueAdapter {
  id = "jupiter" as const;
  name = "Jupiter Lend & Swap";
  category = "DEX_LIQUIDITY" as const;
  programId = JUPITER_V6_PROGRAM_ID;

  getCapabilities(): VenueCapabilities {
    return {
      supportsBorrow: true,
      supportsRepay: true,
      supportsDeposit: true,
      supportsWithdraw: true,
      supportsSwap: true,
      supportsLiquidityProvision: false,
      deploymentStatus: "UNSUPPORTED_ON_DEVNET",
      statusReason: "Jupiter tokenized stock liquidity pools and Jupiter Lend money markets are Mainnet-only. No live devnet deployment exists for tokenized equities.",
    };
  }

  async getSupportedAssets(): Promise<string[]> {
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
      unavailableReason: "Jupiter routing for tokenized stock collateral is unsupported on Devnet. Route through Circuit Native Credit or Meteora DBC.",
    };
  }

  async buildAction(_ctx: ActionContext, _params: VenueActionParams): Promise<TransactionInstruction[]> {
    throw new Error("Jupiter Lend execution is unsupported on Devnet. Use Circuit Native Credit.");
  }

  async simulateAction(_connection: Connection, _tx: Transaction): Promise<VenueSimulationResult> {
    return {
      success: false,
      computeUnitsConsumed: 0,
      logs: [],
      error: "Jupiter program JUP6... has no tokenized equity liquidity pools on Devnet.",
    };
  }

  async submitAction(_connection: Connection, _tx: Transaction, _signers?: Signer[]): Promise<string> {
    throw new Error("Cannot submit Jupiter action on Devnet.");
  }

  async confirmAction(_connection: Connection, _signature: string): Promise<boolean> {
    return false;
  }
}
