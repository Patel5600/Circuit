import { Connection, PublicKey, Signer, Transaction, TransactionInstruction } from "@solana/web3.js";
import { ActionContext } from "../protocol";

export type VenueId = "circuit-native" | "meteora-dbc" | "kamino" | "jupiter";

export type VenueCategory = "CREDIT_LENDING" | "LIQUIDITY_DBC" | "DEX_LIQUIDITY";

export type VenueDeploymentStatus = "LIVE_DEVNET" | "UNSUPPORTED_ON_DEVNET" | "MAINNET_ONLY" | "UNAVAILABLE";

export interface VenueCapabilities {
  supportsBorrow: boolean;
  supportsRepay: boolean;
  supportsDeposit: boolean;
  supportsWithdraw: boolean;
  supportsSwap: boolean;
  supportsLiquidityProvision: boolean;
  deploymentStatus: VenueDeploymentStatus;
  statusReason: string;
}

export interface VenueQuoteParams {
  action: "borrow" | "repay" | "deposit" | "withdraw" | "swap" | "enter_liquidity" | "exit_liquidity";
  assetMint: string;
  quoteMint: string;
  amountNative: bigint;
  slippageBps?: number;
}

export interface VenueQuote {
  venueId: VenueId;
  action: string;
  inAmount: bigint;
  expectedOutAmount: bigint;
  minOutAmount: bigint;
  feeNative: bigint;
  priceImpactBps: number;
  isAvailable: boolean;
  unavailableReason?: string;
}

export interface VenueActionParams {
  action: "borrow" | "repay" | "deposit" | "withdraw" | "swap" | "enter_liquidity" | "exit_liquidity";
  assetMint: string;
  quoteMint: string;
  amountNative: bigint;
  minAmountOutNative?: bigint;
  slippageBps?: number;
}

export interface VenueSimulationResult {
  success: boolean;
  computeUnitsConsumed: number;
  logs: string[];
  error: string | null;
}

export interface CircuitVenueAdapter {
  id: VenueId;
  name: string;
  category: VenueCategory;
  programId: PublicKey | null;

  getCapabilities(): VenueCapabilities;
  getSupportedAssets(): Promise<string[]>;
  getLiquidity(assetMint: string): Promise<bigint>;
  quoteAction(params: VenueQuoteParams): Promise<VenueQuote>;
  buildAction(ctx: ActionContext, params: VenueActionParams): Promise<TransactionInstruction[]>;
  simulateAction(connection: Connection, tx: Transaction): Promise<VenueSimulationResult>;
  submitAction(connection: Connection, tx: Transaction, signers?: Signer[]): Promise<string>;
  confirmAction(connection: Connection, signature: string): Promise<boolean>;
}
