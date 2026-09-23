/**
 * Circuit Protocol - Agent Harness Types
 *
 * Defines the core types for conversational protocol execution:
 * intents, entity resolution, structured blocks, and rate limiting.
 */

import { DeployedMarket, MarketMetadata } from "../../data/markets";
import { PermissionResult, ProtocolAction, RiskRatchetState } from "../permission-engine";

export type EntityConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface ResolvedEntity {
  market: DeployedMarket;
  metadata?: MarketMetadata;
  confidence: EntityConfidence;
  matchedTerm: string;
  originalInput: string;
  suggestedAlternative?: string;
}

export type IntentType =
  | "EXPLANATION_MODE"    // "how does Circuit work?", "how do I borrow?", "how does deposit work?", "how to get lend"
  | "PORTFOLIO_QUERY"     // "portfolio?", "my balance", "show portfolio"
  | "MARKET_QUERY"        // "what is the current price of btc and nvda", "market status"
  | "POLICY_QUERY"        // "what is the policy?", "risk policy"
  | "STATUS_QUERY"        // "status", "health of circuit"
  | "ASSET_LOOKUP"        // "nvda", "show nvda"
  | "PRICE_QUERY"         // "price?", "what is the price"
  | "CHART_REQUEST"       // "chart", "chart 24h", "chart 7d"
  | "RISK_QUERY"          // "risk?", "what is my risk"
  | "POSITION_QUERY"      // "position?", "my balance", "how much collateral"
  | "CAPACITY_QUERY"      // "can I borrow 300?", "how much can I borrow"
  | "ACTION_PREPARE"      // "borrow 200", "deposit 50", "repay 100", "withdraw 10"
  | "ACTION_UPDATE"       // "make it 150", "actually 100" (updates amount on pending intent)
  | "ACTION_SWITCH_ASSET" // "actually make it GOOGL", "switch to AAPL" (invalidates pending intent)
  | "ACTION_CONFIRM"      // "do it", "yes", "confirm", "approve"
  | "ACTION_CANCEL"       // "cancel", "stop", "never mind", "don't do it"
  | "CAPABILITIES_QUERY"  // "what can I do here?", "help", "available actions"
  | "WATCH_CREATE"        // "watch health factor < 1.8", "watch nvda", "stop borrowing if risk restricted"
  | "STRATEGY_CREATE"     // "manage nvda automatically", "keep HF > 1.8 with auto repay"
  | "MULTI_INTENT"        // "check nvda and tell me if I can borrow 200"
  | "DBC_POOL_QUERY"      // "show pool state for nvda", "what is the nvda pool status"
  | "DBC_LIQUIDITY_PLAN"  // "provide liquidity to nvda pool within $100"
  | "DBC_EXIT_PLAN"       // "exit nvda liquidity position", "recover liquidity"
  | "DBC_STRATEGY_CREATE" // "keep dbc exposure below 10% of risk budget"
  | "GENERAL_CHAT";       // general questions routed to AI gateway

export interface StructuredIntent {
  type: IntentType;
  rawText: string;
  action?: ProtocolAction;
  asset?: DeployedMarket | null;
  amount?: number;
  timeframe?: "24h" | "7d";
  secondaryAsset?: DeployedMarket;
  condition?: string;
  subIntents?: StructuredIntent[];
  confidence: EntityConfidence;
  explanationTopics?: string[];
  requestedSymbols?: string[];
}

export type MessageBlockType =
  | "MARKET_CARD"
  | "CHART_CARD"
  | "PROPOSAL_CARD"
  | "PERMISSION_CARD"
  | "TRANSACTION_CARD"
  | "STRATEGY_CARD"
  | "CLARIFICATION_CARD";

export interface MarketCardBlockData {
  type: "MARKET_CARD";
  market: DeployedMarket;
  metadata?: MarketMetadata;
  priceUsd: number | null;
  priceChange24h: number | null;
  riskState: RiskRatchetState;
  collateralUsd: number | null;
  debtUsd: number | null;
  borrowCapacityUsd: number | null;
  healthFactor: number | null;
  oracleStatus: string;
  isMarketOpen: boolean;
  dbcAvailable?: boolean;
}

export interface ChartCardBlockData {
  type: "CHART_CARD";
  symbol: string;
  name: string;
  timeframe: "24h" | "7d";
  currentPrice: number | null;
  priceChange: number | null;
  dataPoints: { t: number; p: number }[];
  isAvailable: boolean;
  reason?: string;
}

export type AgentLifecycleState =
  | "IDLE"
  | "OBSERVING"
  | "ANALYZING"
  | "PLANNING"
  | "AWAITING_APPROVAL"
  | "CHECKING_PERMISSION"
  | "ENVELOPE_CREATED"
  | "EXECUTING"
  | "CONFIRMING"
  | "COMPLETED"
  | "BLOCKED"
  | "USER_REJECTED"
  | "TX_FAILED"
  | "PAUSED"
  | "EXPIRED"
  | "REVOKED"
  | "READY"
  | "FAILED"
  | "WATCHING"
  | "SCHEDULED"
  | "OFFLINE";

export interface ProposalCardBlockData {
  type: "PROPOSAL_CARD";
  id: string;
  action: ProtocolAction;
  symbol: string;
  amountUsd: number;
  market: DeployedMarket;
  riskState: RiskRatchetState;
  permission: "ALLOWED" | "BLOCKED" | "CAPPED";
  reason: string;
  borrowCapacityUsd: number;
  agentLimitUsd: number;
  estimatedHfAfter: number | null;
  timestamp: number;
  stale?: boolean;
  riskEnvelopePda?: string;
  envelopeCreated?: boolean;
  envelopeExpiresAtSlot?: number;
}

export interface PermissionCardBlockData {
  type: "PERMISSION_CARD";
  action: ProtocolAction;
  symbol: string;
  amountUsd: number;
  riskState: RiskRatchetState;
  policy: string;
  authority: string;
  limit: string;
  result: "ALLOWED" | "BLOCKED" | "CAPPED";
  reason: string;
  riskEnvelopePda?: string;
}

export interface TransactionCardBlockData {
  type: "TRANSACTION_CARD";
  state: "CHECKING" | "AUTHORIZED" | "ENVELOPE_CREATED" | "SIGNING" | "SUBMITTED" | "CONFIRMING" | "CONFIRMED" | "FAILED";
  action: ProtocolAction;
  symbol: string;
  amountUsd: number;
  txSignature?: string;
  explorerUrl?: string;
  error?: string;
  confirmedAt?: number;
  riskEnvelopePda?: string;
}

export interface StrategyCardBlockData {
  type: "STRATEGY_CARD";
  name: string;
  category: "WATCH" | "STRATEGY" | "AUTO_MANAGE";
  objective: string;
  triggerCondition: string;
  targetAction: string;
  assetSymbol: string;
  status: "ACTIVE" | "PAUSED";
}

export interface ClarificationBlockData {
  type: "CLARIFICATION_CARD";
  prompt: string;
  options: { label: string; actionText: string; description?: string }[];
}

/** DBC strategy constraint block shown in agent conversation */
export interface DbcStrategyConstraintBlock {
  type: "DBC_STRATEGY_CARD";
  /** DBC action being proposed */
  action: DbcActionType;
  /** Market symbol (canonical — never from free-form input) */
  symbol: string;
  /** Canonical pool address from DBC_POOL_REGISTRY */
  poolAddress: string;
  /** Maximum amount for this strategy execution in USD */
  maxAmountUsd: number;
  /** Maximum slippage in bps (10–200) */
  maxSlippageBps: number;
  /** Risk states in which this strategy is allowed to execute */
  riskStatesAllowed: RiskRatchetState[];
  /** Whether manual approval is required before execution */
  requiresApproval: boolean;
  /** Unix timestamp (seconds) when this constraint expires */
  expiry: number;
  /** Permission engine result */
  permissionResult?: {
    allowed: boolean;
    reasonCode: string;
    message: string;
  };
}

import { DbcActionType } from "../meteora/dbc";

export type StructuredMessageBlock =
  | MarketCardBlockData
  | ChartCardBlockData
  | ProposalCardBlockData
  | PermissionCardBlockData
  | TransactionCardBlockData
  | StrategyCardBlockData
  | ClarificationBlockData
  | DbcStrategyConstraintBlock;

export interface HarnessChatMessage {
  id: string;
  role: "user" | "agent" | "system";
  content: string;
  timestamp: number;
  streaming?: boolean;
  intent?: StructuredIntent;
  blocks?: StructuredMessageBlock[];
}

export interface ConversationalContext {
  activeAsset: DeployedMarket | null;
  pendingIntent: StructuredIntent | null;
  pendingProposal: ProposalCardBlockData | null;
  lastAction: ProtocolAction | null;
  lastAmount: number | null;
  lastQueryTime: number;
}
