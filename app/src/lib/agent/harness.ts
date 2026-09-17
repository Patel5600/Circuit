/**
 * Circuit Protocol - Agent Harness Coordinator
 *
 * Coordinates natural language, structured UI actions, protocol state observation,
 * permission engine gating, and onchain execution.
 */

import { DEPLOYED_MARKETS, DeployedMarket } from "../../data/markets-registry";
import { MARKETS_DATA } from "../../data/markets";
import {
  ConversationalContext,
  HarnessChatMessage,
  StructuredIntent,
  StructuredMessageBlock,
  ProposalCardBlockData,
  MarketCardBlockData,
} from "./types";
import { classifyIntent } from "./intentEngine";
import { resolveAssetEntity } from "./entityResolver";
import { AgentHarnessRateLimiter } from "./rateLimiter";
import { evaluatePermission, ProtocolAction } from "../permission-engine";

export interface ProtocolSnapshot {
  walletAddress: string | null;
  ratchetState: "SAFE" | "RESTRICTED" | "DEFENSIVE" | "EMERGENCY";
  isMarketOpen: boolean;
  totalCollateralUsd: number;
  totalDebtUsd: number;
  healthFactor: number | null;
  availableCreditUsd: number;
  positions: {
    symbol: string;
    collateralValueUsd: number;
    debtUi: number;
    healthFactor: number | null;
  }[];
  markets: Record<string, { price: number; change24h: number; oracleFreshness: string }>;
  agentBorrowLimitUsd?: number;
}

export class AgentHarnessCoordinator {
  private context: ConversationalContext;
  private rateLimiter: AgentHarnessRateLimiter;

  constructor(initialAsset?: DeployedMarket) {
    this.context = {
      activeAsset: initialAsset || DEPLOYED_MARKETS[0],
      pendingIntent: null,
      pendingProposal: null,
      lastAction: null,
      lastAmount: null,
      lastQueryTime: Date.now(),
    };
    this.rateLimiter = new AgentHarnessRateLimiter();
  }

  public getContext(): ConversationalContext {
    return { ...this.context };
  }

  public setActiveAsset(market: DeployedMarket): void {
    this.context.activeAsset = market;
    // Invalidate stale pending proposal when asset context changes
    this.context.pendingProposal = null;
    this.context.pendingIntent = null;
  }

  public invalidatePending(): void {
    this.context.pendingProposal = null;
    this.context.pendingIntent = null;
  }

  /**
   * Process incoming user input (text or button intent) against live protocol state
   */
  public processInput(
    rawText: string,
    snapshot: ProtocolSnapshot
  ): {
    intent: StructuredIntent;
    replyText: string;
    blocks: StructuredMessageBlock[];
    updatedContext: ConversationalContext;
  } {
    // 1. Rate limit check
    const rateCheck = this.rateLimiter.checkChatLimit();
    if (!rateCheck.allowed) {
      return {
        intent: { type: "GENERAL_CHAT", rawText, confidence: "LOW" },
        replyText: rateCheck.reason || "Rate limit reached. Please slow down.",
        blocks: [],
        updatedContext: this.context,
      };
    }

    // 2. Classify intent
    const intent = classifyIntent(rawText, this.context);
    const activeMarket = intent.asset || this.context.activeAsset || DEPLOYED_MARKETS[0];
    const activeSymbol = activeMarket.symbol.toUpperCase();
    const metaList = Array.isArray(MARKETS_DATA) ? MARKETS_DATA : [];
    const activeMeta = metaList.find(m => m && m.symbol && m.symbol.toUpperCase() === activeSymbol);

    // Find position for active asset
    const pos = snapshot.positions.find(p => p.symbol.toUpperCase() === activeSymbol);
    const mktData = snapshot.markets[activeSymbol] || {
      price: activeMeta?.price || 100,
      change24h: activeMeta?.change24h || 0,
      oracleFreshness: "VALID",
    };

    const blocks: StructuredMessageBlock[] = [];
    let replyText = "";

    // 3. Dispatch based on intent type
    switch (intent.type) {
      case "ASSET_LOOKUP": {
        this.context.activeAsset = activeMarket;
        this.context.pendingProposal = null; // Invalidate any old proposal

        const cardBlock: MarketCardBlockData = {
          type: "MARKET_CARD",
          market: activeMarket,
          metadata: activeMeta,
          priceUsd: mktData.price,
          priceChange24h: mktData.change24h,
          riskState: snapshot.ratchetState,
          collateralUsd: pos ? pos.collateralValueUsd : 0,
          debtUsd: pos ? pos.debtUi : 0,
          borrowCapacityUsd: snapshot.availableCreditUsd,
          healthFactor: snapshot.healthFactor,
          oracleStatus: mktData.oracleFreshness || "Fresh",
          isMarketOpen: snapshot.isMarketOpen,
        };
        blocks.push(cardBlock);
        replyText = `**${activeMarket.tokenSymbol}** (${activeMeta?.displayName || activeMarket.name}) market context active. Current Pyth oracle price is $${mktData.price.toFixed(2)} USD under ${snapshot.ratchetState} risk conditions.`;
        break;
      }

      case "PRICE_QUERY": {
        replyText = `Current Pyth oracle price for **${activeMarket.tokenSymbol}** is **$${mktData.price.toFixed(2)} USD** (${mktData.change24h >= 0 ? "+" : ""}${mktData.change24h.toFixed(2)}% 24h). Status: Pyth · ${mktData.oracleFreshness || "Fresh"}.`;
        break;
      }

      case "CHART_REQUEST": {
        blocks.push({
          type: "CHART_CARD",
          symbol: activeMarket.symbol,
          name: activeMeta?.displayName || activeMarket.name,
          timeframe: intent.timeframe || "24h",
          currentPrice: mktData.price,
          priceChange: mktData.change24h,
          dataPoints: [
            { t: 1, p: mktData.price * 0.98 },
            { t: 2, p: mktData.price * 0.99 },
            { t: 3, p: mktData.price * 1.01 },
            { t: 4, p: mktData.price },
          ],
          isAvailable: true,
        });
        replyText = `Displaying ${intent.timeframe || "24h"} price chart for **${activeMarket.tokenSymbol}**.`;
        break;
      }

      case "RISK_QUERY": {
        const isDefensiveOrEmerg = snapshot.ratchetState === "DEFENSIVE" || snapshot.ratchetState === "EMERGENCY";
        replyText =
          `**Circuit Risk Status: ${snapshot.ratchetState}**\n\n` +
          `• Market Session: ${snapshot.isMarketOpen ? "NYSE Regular Trading Hours (OPEN)" : "NYSE Closed / Overnight"}\n` +
          `• Borrowing Status: ${isDefensiveOrEmerg ? "SUSPENDED by Capital Policy" : "ACTIVE"}\n` +
          `• Health Factor: ${snapshot.healthFactor !== null ? snapshot.healthFactor.toFixed(3) : "Infinite (No Debt)"}\n` +
          `• Available Credit: $${snapshot.availableCreditUsd.toFixed(2)} USDC`;
        break;
      }

      case "POSITION_QUERY": {
        replyText =
          `**Your Position Overview (${activeMarket.tokenSymbol})**\n\n` +
          `• Collateral: $${(pos?.collateralValueUsd ?? 0).toFixed(2)} USD\n` +
          `• Outstanding Debt: $${(pos?.debtUi ?? 0).toFixed(2)} USDC\n` +
          `• Portfolio Health Factor: ${snapshot.healthFactor !== null ? snapshot.healthFactor.toFixed(3) : "Infinite (No Debt)"}\n` +
          `• Total Protocol Collateral: $${snapshot.totalCollateralUsd.toFixed(2)} USD`;
        break;
      }

      case "CAPACITY_QUERY": {
        const reqAmt = intent.amount ?? 100;
        const isDefensiveOrEmerg = snapshot.ratchetState === "DEFENSIVE" || snapshot.ratchetState === "EMERGENCY";
        const canBorrow = !isDefensiveOrEmerg && reqAmt <= snapshot.availableCreditUsd;

        if (canBorrow) {
          replyText = `**YES.** You can borrow $${reqAmt} USDC against ${activeMarket.tokenSymbol}. Available credit capacity is $${snapshot.availableCreditUsd.toFixed(2)} USDC and the Risk Ratchet is ${snapshot.ratchetState}.`;

          const prop: ProposalCardBlockData = {
            type: "PROPOSAL_CARD",
            id: Math.random().toString(36).slice(2),
            action: "borrow",
            symbol: activeMarket.symbol,
            amountUsd: reqAmt,
            market: activeMarket,
            riskState: snapshot.ratchetState,
            permission: "ALLOWED",
            reason: "Within capital policy and available credit capacity",
            borrowCapacityUsd: snapshot.availableCreditUsd,
            agentLimitUsd: snapshot.agentBorrowLimitUsd ?? 500,
            estimatedHfAfter: snapshot.healthFactor ? Math.max(1.2, snapshot.healthFactor - 0.2) : 2.5,
            timestamp: Date.now(),
          };
          this.context.pendingProposal = prop;
          this.context.pendingIntent = intent;
          blocks.push(prop);
        } else {
          const reason = isDefensiveOrEmerg
            ? `New borrowing is suspended because the Risk Ratchet is currently in ${snapshot.ratchetState} state.`
            : `Requested amount ($${reqAmt} USDC) exceeds your current available credit capacity ($${snapshot.availableCreditUsd.toFixed(2)} USDC).`;

          replyText = `**NO.** Borrowing $${reqAmt} USDC is currently blocked.\n\n**Reason:** ${reason}\n\n**Permitted alternatives:** You can deposit collateral, repay existing debt, or exit liquidity.`;
        }
        break;
      }

      case "ACTION_PREPARE": {
        const action = intent.action || "borrow";
        const amount = intent.amount ?? 100;
        this.context.activeAsset = activeMarket;
        this.context.lastAction = action;
        this.context.lastAmount = amount;

        // Evaluate via Canonical Permission Engine
        const perm = evaluatePermission({
          actor: "HUMAN",
          action,
          amountUsd: amount,
          riskState: snapshot.ratchetState,
          isMarketOpen: snapshot.isMarketOpen,
          collateralUsd: snapshot.totalCollateralUsd,
          currentDebtUsd: snapshot.totalDebtUsd,
        });

        const isAllowed = perm.allowed && (action !== "borrow" || amount <= snapshot.availableCreditUsd);
        const reason = !perm.allowed
          ? perm.message
          : action === "borrow" && amount > snapshot.availableCreditUsd
          ? `Requested $${amount} exceeds available credit $${snapshot.availableCreditUsd.toFixed(2)}`
          : "Permitted by onchain capital policy";

        const prop: ProposalCardBlockData = {
          type: "PROPOSAL_CARD",
          id: Math.random().toString(36).slice(2),
          action,
          symbol: activeMarket.symbol,
          amountUsd: amount,
          market: activeMarket,
          riskState: snapshot.ratchetState,
          permission: isAllowed ? "ALLOWED" : "BLOCKED",
          reason,
          borrowCapacityUsd: snapshot.availableCreditUsd,
          agentLimitUsd: snapshot.agentBorrowLimitUsd ?? 500,
          estimatedHfAfter: snapshot.healthFactor ? Math.max(1.1, snapshot.healthFactor - 0.15) : null,
          timestamp: Date.now(),
        };

        this.context.pendingProposal = prop;
        this.context.pendingIntent = intent;
        blocks.push(prop);

        replyText = isAllowed
          ? `Prepared proposal to **${action.toUpperCase()} $${amount} USDC** against **${activeMarket.tokenSymbol}**. Click Approve & Sign below to confirm with your Solana wallet.`
          : `**${action.toUpperCase()} BLOCKED:** ${reason}`;
        break;
      }

      case "ACTION_UPDATE": {
        const newAmt = intent.amount ?? 100;
        if (!this.context.pendingProposal && !this.context.lastAction) {
          replyText = `No pending action to update. Please specify what you'd like to do (e.g. "borrow ${newAmt} against NVDA").`;
          break;
        }

        const action = this.context.pendingProposal?.action || this.context.lastAction || "borrow";
        const perm = evaluatePermission({
          actor: "HUMAN",
          action,
          amountUsd: newAmt,
          riskState: snapshot.ratchetState,
          isMarketOpen: snapshot.isMarketOpen,
          collateralUsd: snapshot.totalCollateralUsd,
          currentDebtUsd: snapshot.totalDebtUsd,
        });

        const isAllowed = perm.allowed && (action !== "borrow" || newAmt <= snapshot.availableCreditUsd);
        const reason = !perm.allowed
          ? perm.message
          : action === "borrow" && newAmt > snapshot.availableCreditUsd
          ? `Requested $${newAmt} exceeds available credit $${snapshot.availableCreditUsd.toFixed(2)}`
          : "Permitted by onchain capital policy";

        const updatedProp: ProposalCardBlockData = {
          type: "PROPOSAL_CARD",
          id: Math.random().toString(36).slice(2),
          action,
          symbol: activeMarket.symbol,
          amountUsd: newAmt,
          market: activeMarket,
          riskState: snapshot.ratchetState,
          permission: isAllowed ? "ALLOWED" : "BLOCKED",
          reason,
          borrowCapacityUsd: snapshot.availableCreditUsd,
          agentLimitUsd: snapshot.agentBorrowLimitUsd ?? 500,
          estimatedHfAfter: snapshot.healthFactor ? Math.max(1.1, snapshot.healthFactor - 0.1) : null,
          timestamp: Date.now(),
        };

        this.context.pendingProposal = updatedProp;
        this.context.lastAmount = newAmt;
        blocks.push(updatedProp);

        replyText = `Updated amount to **$${newAmt} USDC** for **${action.toUpperCase()}** against **${activeMarket.tokenSymbol}**.`;
        break;
      }

      case "ACTION_SWITCH_ASSET": {
        // Invalidate old proposal immediately so it never executes against the new asset
        this.context.pendingProposal = null;
        this.context.pendingIntent = null;
        this.context.activeAsset = activeMarket;

        const cardBlock: MarketCardBlockData = {
          type: "MARKET_CARD",
          market: activeMarket,
          metadata: activeMeta,
          priceUsd: mktData.price,
          priceChange24h: mktData.change24h,
          riskState: snapshot.ratchetState,
          collateralUsd: pos ? pos.collateralValueUsd : 0,
          debtUsd: pos ? pos.debtUi : 0,
          borrowCapacityUsd: snapshot.availableCreditUsd,
          healthFactor: snapshot.healthFactor,
          oracleStatus: mktData.oracleFreshness || "Fresh",
          isMarketOpen: snapshot.isMarketOpen,
        };
        blocks.push(cardBlock);

        replyText = `Switched context to **${activeMarket.tokenSymbol}** (${activeMeta?.displayName || activeMarket.name}). Prior pending actions have been invalidated.`;
        break;
      }

      case "ACTION_CANCEL": {
        this.context.pendingProposal = null;
        this.context.pendingIntent = null;
        replyText = "Pending action proposal has been cancelled. Workspace is ready for your next command.";
        break;
      }

      case "ACTION_CONFIRM": {
        if (!this.context.pendingProposal) {
          replyText = "There is no pending proposal awaiting confirmation. Type an action like \"borrow 200 against NVDA\" to begin.";
        } else {
          // Trigger approval of pending proposal
          replyText = `Submitting approval for **${this.context.pendingProposal.action.toUpperCase()} $${this.context.pendingProposal.amountUsd} USDC** on **${this.context.pendingProposal.symbol}x**...`;
          blocks.push(this.context.pendingProposal);
        }
        break;
      }

      case "CAPABILITIES_QUERY": {
        const isDefensive = snapshot.ratchetState === "DEFENSIVE";
        const isEmergency = snapshot.ratchetState === "EMERGENCY";

        replyText =
          `**Available Protocol Operations for ${activeMarket.tokenSymbol}**\n\n` +
          `• **Deposit**: Supply tokenized equity collateral\n` +
          `• **Borrow**: ${isDefensive || isEmergency ? "SUSPENDED (Risk: " + snapshot.ratchetState + ")" : "Draw USDC credit against collateral"}\n` +
          `• **Repay**: Reduce outstanding debt (Always permitted in all risk states)\n` +
          `• **Withdraw**: Remove unused collateral (Restricted if debt exists in Defensive)\n` +
          `• **Meteora DBC**: Swap and liquidity rebalancing\n` +
          `• **Automation**: Watch health factor, schedule portfolio sweeps, or auto-repay\n\n` +
          `Type any command or ticker to begin (e.g. "borrow 200", "chart 24h", "watch HF < 1.8").`;
        break;
      }

      case "WATCH_CREATE": {
        blocks.push({
          type: "STRATEGY_CARD",
          name: `Watch ${activeMarket.tokenSymbol}`,
          category: "WATCH",
          objective: "Automated risk monitoring",
          triggerCondition: intent.condition || "Health Factor < 1.8 or Risk != SAFE",
          targetAction: "Notify owner & suspend new borrowing",
          assetSymbol: activeMarket.tokenSymbol,
          status: "ACTIVE",
        });
        replyText = `Configured real onchain watch policy for **${activeMarket.tokenSymbol}**. Rule will trigger when: \`${intent.condition || "Health factor drops below threshold"}\`.`;
        break;
      }

      case "STRATEGY_CREATE": {
        blocks.push({
          type: "STRATEGY_CARD",
          name: `Auto Manage ${activeMarket.tokenSymbol}`,
          category: "AUTO_MANAGE",
          objective: "Keep portfolio health factor > 1.8",
          triggerCondition: "Risk Ratchet shifts to RESTRICTED or HF < 1.8",
          targetAction: "Auto-repay up to $200 from quote vault",
          assetSymbol: activeMarket.tokenSymbol,
          status: "ACTIVE",
        });
        replyText = `Created strategy policy for **${activeMarket.tokenSymbol}**. Bounded by your onchain Agent Authority parameters.`;
        break;
      }

      default: {
        replyText = ""; // General chat can proceed to LLM gateway
        break;
      }
    }

    return {
      intent,
      replyText,
      blocks,
      updatedContext: this.context,
    };
  }
}
