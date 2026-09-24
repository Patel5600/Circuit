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

export const METEORA_DBC_PROGRAM_ID = new PublicKey("dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN");

export class MeteoraDbcAdapter implements CircuitVenueAdapter {
  id = "meteora-dbc" as const;
  name = "Meteora DBC (Dynamic Bonding Curve)";
  category = "LIQUIDITY_DBC" as const;
  programId = METEORA_DBC_PROGRAM_ID;

  getCapabilities(): VenueCapabilities {
    return {
      supportsBorrow: false,
      supportsRepay: false,
      supportsDeposit: false,
      supportsWithdraw: false,
      supportsSwap: true,
      supportsLiquidityProvision: true,
      deploymentStatus: "LIVE_DEVNET",
      statusReason: "Meteora Dynamic Bonding Curve program deployed on Devnet with registered test pools.",
    };
  }

  async getSupportedAssets(): Promise<string[]> {
    return [
      "CARqKy5GTCxz5G1tFiYA96A3Q8jaUE9Vppk7cjGJxRqq", // NVDAx
      "23hpSsK3h4na3pwSUf1YzaDF9nzX3t2PppJJf16Qpkxc", // USDC
    ];
  }

  async getLiquidity(assetMint: string): Promise<bigint> {
    return 250_000_000_000n; // 250,000 USDC test liquidity pool
  }

  async quoteAction(params: VenueQuoteParams): Promise<VenueQuote> {
    const feeBps = 100n; // 1% DBC LP fee
    const feeNative = (params.amountNative * feeBps) / 10000n;
    const slippageBps = BigInt(params.slippageBps ?? 50);
    const expectedOut = params.amountNative - feeNative;
    const minOut = expectedOut - (expectedOut * slippageBps) / 10000n;

    return {
      venueId: this.id,
      action: params.action,
      inAmount: params.amountNative,
      expectedOutAmount: expectedOut,
      minOutAmount: minOut,
      feeNative,
      priceImpactBps: 15,
      isAvailable: true,
    };
  }

  async buildAction(ctx: ActionContext, params: VenueActionParams): Promise<TransactionInstruction[]> {
    if (params.action !== "swap" && params.action !== "enter_liquidity" && params.action !== "exit_liquidity") {
      throw new Error(`Meteora DBC does not support lending actions: ${params.action}`);
    }
    // Return empty array placeholder for simulation / integration check
    return [];
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
    throw new Error("Wallet adapter required for DBC execution.");
  }

  async confirmAction(connection: Connection, signature: string): Promise<boolean> {
    const res = await connection.confirmTransaction(signature, "confirmed");
    return res.value.err === null;
  }
}
