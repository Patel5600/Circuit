/**
 * Circuit Protocol - Canonical Derived State Engine & Decision Kernel
 *
 * Single, authoritative financial and risk evaluation layer.
 * All UI components, agents, and transactions MUST consume derived state from this engine.
 * Never calculate financial limits, LTV, or permission boundaries independently in UI components.
 */

import {
  DerivedFinancialState,
  MarketStateDomains,
  CircuitRiskState,
  ReferenceMarketState,
  OnchainMarketState,
  OracleState,
  PermissionVerdict,
} from "./types";
import { normalizedStore } from "./normalized-store";
import { isNyseMarketOpen } from "../session";
import { AssetRegistry, normalizeAssetId } from "../assets/registry";
import { CANONICAL_POLICY_VERSION } from "../permission-engine";

export class DerivedStateEngine {
  private static _instance: DerivedStateEngine | null = null;

  public static getInstance(): DerivedStateEngine {
    if (!DerivedStateEngine._instance) {
      DerivedStateEngine._instance = new DerivedStateEngine();
    }
    return DerivedStateEngine._instance;
  }

  /**
   * Derive the 5 decoupled market state domains for an asset.
   */
  public deriveMarketDomains(
    symbolOrMint: string,
    now: number = Date.now()
  ): MarketStateDomains {
    const config = AssetRegistry.get(symbolOrMint);
    const mint = config?.tokenMint ?? symbolOrMint;
    const marketSlice = normalizedStore.getMarket(mint).value;
    const protocolSlice = normalizedStore.getProtocol().value;

    // 1. Reference Market State (NYSE regular hours: 09:30 - 16:00 ET Mon-Fri)
    const nyse = isNyseMarketOpen();
    const referenceMarketState: ReferenceMarketState = nyse.isOpen ? "OPEN" : "CLOSED";

    // 2. Onchain Market State (Solana Devnet / Circuit program is 24/7)
    const onchainMarketState: OnchainMarketState = protocolSlice.paused
      ? "CLOSED"
      : "OPEN";

    // 3. Oracle State (Pyth freshness check)
    let oracleState: OracleState = "UNAVAILABLE";
    if (marketSlice.price !== null && marketSlice.oracleAgeSeconds !== null) {
      if (marketSlice.oracleAgeSeconds <= 60) {
        oracleState = "FRESH";
      } else if (marketSlice.oracleAgeSeconds <= 600) {
        oracleState = "STALE";
      } else {
        oracleState = "INVALID";
      }
    }

    // 4. Circuit Risk State (Risk Ratchet)
    let circuitRiskState: CircuitRiskState = "SAFE";
    const confBps = marketSlice.oracleConfBps ?? 15;

    if (protocolSlice.paused) {
      circuitRiskState = "EMERGENCY";
    } else if (oracleState === "INVALID" || oracleState === "UNAVAILABLE") {
      circuitRiskState = "DEFENSIVE";
    } else if (confBps > 150) {
      circuitRiskState = "DEFENSIVE";
    } else if (!nyse.isOpen || confBps > 50) {
      circuitRiskState = "RESTRICTED";
    } else {
      circuitRiskState = "SAFE";
    }

    // 5. Default Permission State for Borrowing
    let permissionState: PermissionVerdict = "ALLOW";
    if (protocolSlice.paused || circuitRiskState === "EMERGENCY" || circuitRiskState === "DEFENSIVE") {
      permissionState = "BLOCK";
    } else if (!nyse.isOpen || circuitRiskState === "RESTRICTED") {
      permissionState = "RESTRICT";
    }

    return {
      referenceMarketState,
      onchainMarketState,
      oracleState,
      circuitRiskState,
      permissionState,
    };
  }

  /**
   * Derive complete financial calculations for an asset position.
   */
  public deriveFinancialState(
    symbolOrMint: string,
    action: "deposit" | "borrow" | "repay" | "withdraw" = "borrow",
    requestedAmountUsd: number = 0,
    actorType: "HUMAN" | "AGENT" = "HUMAN"
  ): DerivedFinancialState {
    const config = AssetRegistry.get(symbolOrMint);
    const mint = config?.tokenMint ?? symbolOrMint;
    const symbol = config?.symbol ?? normalizeAssetId(symbolOrMint);

    const mkt = normalizedStore.getMarket(mint).value;
    const pos = normalizedStore.getPosition(mint).value;
    const proto = normalizedStore.getProtocol().value;

    const domains = this.deriveMarketDomains(mint);

    // Collateral & Debt
    const price = mkt.price ?? pos.lastValidPrice ?? 0;
    const collateralValueUsd =
      pos.collateralValueUsd > 0
        ? pos.collateralValueUsd
        : pos.collateralAmountUi * price;
    const debtUsd = pos.debtAmountUi;

    const nominalLtvBps = config?.riskConfig?.baseLtvBps ?? 7000;
    const nominalLtvPct = nominalLtvBps / 100;

    // Current LTV
    const currentLtvPct =
      collateralValueUsd > 0 ? (debtUsd / collateralValueUsd) * 100 : 0;

    // Health factor
    const liqThreshBps = config?.riskConfig?.liqThresholdBps ?? 8000;
    const healthFactor =
      debtUsd > 0 ? (collateralValueUsd * (liqThreshBps / 10000)) / debtUsd : null;

    // Theoretical Borrow Capacity (collateral * nominal limit)
    const theoreticalBorrowCapacityUsd =
      collateralValueUsd * (nominalLtvPct / 100);

    // Executable Borrow Capacity:
    // When market is closed, or protocol is paused, or risk is DEFENSIVE/EMERGENCY:
    // Executable capacity is strictly $0.00!
    const isSessionPermitted = domains.referenceMarketState === "OPEN";
    const isRiskPermitted =
      domains.circuitRiskState === "SAFE" ||
      domains.circuitRiskState === "RESTRICTED";
    const isPolicyPermitted = !proto.paused && isRiskPermitted && isSessionPermitted;

    const effectiveLtvPct = isPolicyPermitted
      ? domains.circuitRiskState === "RESTRICTED"
        ? Math.max(0, nominalLtvPct - 10)
        : nominalLtvPct
      : 0;

    const maxExecutableByLtv =
      collateralValueUsd * (effectiveLtvPct / 100) - debtUsd;
    const availableProtocolLiquidity = proto.vaultLiquidityUsd > 0 ? proto.vaultLiquidityUsd : 500000;

    const executableBorrowCapacityUsd = isPolicyPermitted
      ? Math.max(0, Math.min(maxExecutableByLtv, availableProtocolLiquidity))
      : 0;

    const remainingCapacityUsd = Math.max(
      0,
      theoreticalBorrowCapacityUsd - debtUsd
    );

    // Determine deterministic permission verdict and reason
    let verdict: PermissionVerdict = "ALLOW";
    let reason = "Permitted under active risk policy and capital limits.";
    let borrowAllowed = true;
    let withdrawAllowed = true;
    const repayAllowed = true; // Repay is unconditionally allowed
    const depositAllowed = true; // Deposit is unconditionally allowed

    if (action === "borrow") {
      if (collateralValueUsd <= 0) {
        verdict = "BLOCK";
        reason = `Deposit ${symbol} collateral to activate borrowing power.`;
        borrowAllowed = false;
      } else if (proto.paused) {
        verdict = "BLOCK";
        reason = "Protocol capital policy is paused by governance.";
        borrowAllowed = false;
      } else if (!isSessionPermitted) {
        verdict = "BLOCK";
        reason =
          "Reference equity market (NYSE) is closed. Credit origination opens at regular session (9:30 AM ET).";
        borrowAllowed = false;
      } else if (domains.circuitRiskState === "DEFENSIVE") {
        verdict = "BLOCK";
        reason =
          "Risk ratchet in DEFENSIVE state. Elevated volatility exceeds safety threshold.";
        borrowAllowed = false;
      } else if (domains.circuitRiskState === "EMERGENCY") {
        verdict = "BLOCK";
        reason = "Emergency protocol lockdown in effect. Solvency preservation active.";
        borrowAllowed = false;
      } else if (domains.oracleState === "STALE" || domains.oracleState === "INVALID") {
        verdict = "BLOCK";
        reason = `Oracle price is ${domains.oracleState.toLowerCase()}. Fresh price feed required for credit creation.`;
        borrowAllowed = false;
      } else if (requestedAmountUsd > executableBorrowCapacityUsd) {
        verdict = "BLOCK";
        reason = `Requested amount ($${requestedAmountUsd.toFixed(2)}) exceeds executable borrow capacity ($${executableBorrowCapacityUsd.toFixed(2)}).`;
        borrowAllowed = false;
      } else if (domains.circuitRiskState === "RESTRICTED") {
        verdict = "RESTRICT";
        reason =
          "Risk ratchet in RESTRICTED state. Borrowing capacity constrained by volatility margin.";
      }
    } else if (action === "withdraw") {
      if (collateralValueUsd <= 0) {
        verdict = "BLOCK";
        reason = "No collateral to withdraw.";
        withdrawAllowed = false;
      } else if (debtUsd > 0 && (domains.circuitRiskState === "DEFENSIVE" || domains.circuitRiskState === "EMERGENCY")) {
        verdict = "BLOCK";
        reason =
          "Collateral withdrawal locked during defensive risk containment while holding outstanding debt.";
        withdrawAllowed = false;
      }
    }

    return {
      mint,
      symbol,
      collateralValueUsd,
      debtUsd,
      currentLtvPct,
      nominalLtvPct,
      effectiveLtvPct,
      theoreticalBorrowCapacityUsd,
      executableBorrowCapacityUsd,
      remainingCapacityUsd,
      healthFactor,
      riskState: domains.circuitRiskState,
      riskBudgetPct: Math.max(0, 100 - currentLtvPct),
      permission: {
        verdict,
        reason,
        borrowAllowed,
        repayAllowed,
        depositAllowed,
        withdrawAllowed,
      },
      domains,
      calculatedAtTs: Date.now(),
    };
  }

  /**
   * Section 24: Canonical Inspectable Decision Object
   */
  public generateDecisionProof(
    symbolOrMint: string,
    action: "DEPOSIT" | "BORROW" | "REPAY" | "WITHDRAW" = "BORROW",
    amountUsd: number = 1060,
    actor: "HUMAN" | "AGENT" = "HUMAN"
  ) {
    const act = action.toLowerCase() as "deposit" | "borrow" | "repay" | "withdraw";
    const state = this.deriveFinancialState(symbolOrMint, act, amountUsd, actor);
    const mkt = normalizedStore.getMarket(state.mint).value;

    return {
      action,
      asset: state.symbol,
      collateral: state.collateralValueUsd,
      debt: state.debtUsd,
      referenceMarket: state.domains.referenceMarketState,
      onchainMarket: state.domains.onchainMarketState,
      oracle: state.domains.oracleState,
      oracleAge: mkt.oracleAgeSeconds ?? 0,
      oracleConfBps: mkt.oracleConfBps ?? 0,
      risk: state.riskState,
      policy: normalizedStore.getProtocol().value.paused
        ? "PAUSED"
        : state.permission.borrowAllowed
        ? "ACTIVE"
        : "RESTRICTED",
      authority: actor === "HUMAN" ? "HUMAN · WALLET DIRECT" : "AUTONOMOUS · DELEGATED AGENT",
      nominalLtv: `${state.nominalLtvPct.toFixed(0)}%`,
      effectiveLtv: `${state.effectiveLtvPct.toFixed(0)}%`,
      theoreticalCapacity: state.theoreticalBorrowCapacityUsd,
      executableCapacity: state.executableBorrowCapacityUsd,
      decision: state.permission.verdict,
      reason: state.permission.reason,
      policyVersion: CANONICAL_POLICY_VERSION,
      timestamp: Date.now(),
    };
  }
}

export const derivedStateEngine = DerivedStateEngine.getInstance();
