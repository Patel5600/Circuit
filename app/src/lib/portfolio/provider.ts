/**
 * Circuit Protocol - Portfolio Data Provider Architecture
 * 
 * Formal abstraction separating authoritative live Devnet data sources
 * from educational and simulated sandbox environments.
 */

import { PublicKey } from "@solana/web3.js";
import { LogoMark } from "../../data/logos";

export interface DecodedPositionDirect {
  owner: PublicKey;
  assetMint: string;
  collateralAmount: bigint;
  debtAmount: bigint;
  lastValidPrice: bigint;
  lastValidExpo: number;
  state: "healthy" | "liquidatable";
}

/**
 * Direct byte decoder for on-chain Position struct (102 bytes)
 * Rust layout:
 * 0..8: Discriminator
 * 8..40: owner (Pubkey)
 * 40..72: asset (Pubkey)
 * 72..80: collateral_amount (u64 LE)
 * 80..88: debt_amount (u64 LE)
 * 88..96: last_valid_price (i64 LE)
 * 96..100: last_valid_expo (i32 LE)
 * 100..101: state (u8: 0 = Healthy, 1 = Liquidatable)
 * 101..102: bump (u8)
 */
export function decodePositionDirect(data: Uint8Array | Buffer): DecodedPositionDirect | null {
  if (data.length < 102) return null;
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const owner = new PublicKey(buf.subarray(8, 40));
  const asset = new PublicKey(buf.subarray(40, 72));
  const collateralAmount = buf.readBigUInt64LE(72);
  const debtAmount = buf.readBigUInt64LE(80);
  const lastValidPrice = buf.readBigInt64LE(88);
  const lastValidExpo = buf.readInt32LE(96);
  const stateByte = buf.readUInt8(100);
  const state = stateByte === 1 ? "liquidatable" : "healthy";

  return {
    owner,
    assetMint: asset.toBase58(),
    collateralAmount,
    debtAmount,
    lastValidPrice,
    lastValidExpo,
    state,
  };
}

export interface PositionIdentity {
  wallet: string;
  assetMint: string;
  collateralAccount: string;
  marketSymbol: string;
}

export interface Position {
  identity: PositionIdentity;
  symbol: string;
  name: string;
  mint: string;
  collateralRaw: bigint;
  collateralUi: number;
  debtRaw: bigint;
  debtUi: number;
  priceUsd: number;
  confidenceUsd: number;
  confBps: number;
  maxConfBps: number;
  conservativePriceUsd: number;
  collateralValueUsd: number;
  conservativeValueUsd: number;
  weightPct: number;
  baseLtvBps: number;
  liqThresholdBps: number;
  oracleHealthy: boolean;
  marketOpen: boolean;
  lastUpdateSlot?: number;
  publishTime?: number;
  mark?: LogoMark;
  change24hPercent?: number | null;
  riskContributionUsd: number;
  explanation: string;
}

export interface PortfolioSnapshot {
  isSimulated: boolean;
  providerType: "LIVE_DEVNET" | "SIMULATION";
  walletAddress: string | null;
  positions: Position[];
  totalCollateralUsd: number;
  conservativeCollateralUsd: number;
  totalDebtUsd: number;
  weightedBaseLtvBps: number;
  effectiveLtvBps: number;
  borrowCapacityUsd: number;
  healthFactorBps: number | null;
  maxWeightPct: number;
  dominantAssetSymbol: string;
  concentrationPenaltyBps: number;
  oraclePenaltyBps: number;
  totalHaircutBps: number;
  riskState: "SAFE" | "RESTRICTED" | "DEFENSIVE" | "EMERGENCY";
  hardOverride: boolean;
  hardOverrideReason?: string;
  borrowAllowed: boolean;
  withdrawAllowed: boolean;
  repayAllowed: boolean;
  liquidationActive: boolean;
  lastSyncTimestamp: number;
}

export interface PortfolioDataProvider {
  readonly isSimulated: boolean;
  getSnapshot(): PortfolioSnapshot;
  getPositions(): Position[];
  subscribe(callback: (snapshot: PortfolioSnapshot) => void): () => void;
  refresh(): Promise<void>;
}
