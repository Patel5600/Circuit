use anchor_lang::prelude::*;
use crate::state::enums::{MarketState, GuardReason, AgentAction, PermissionDenialReason};

/// Emitted when a user deposits tokenized equities into collateral vault.
#[event]
pub struct DepositEvent {
    pub owner: Pubkey,
    pub asset: Pubkey,
    pub amount: u64,
    pub total_collateral: u64,
    pub timestamp: i64,
}

/// Emitted when a user withdraws collateral from their position.
#[event]
pub struct WithdrawEvent {
    pub owner: Pubkey,
    pub asset: Pubkey,
    pub amount: u64,
    pub remaining_collateral: u64,
    pub timestamp: i64,
}

/// Emitted when a user borrows quote currency against deposited collateral.
#[event]
pub struct BorrowEvent {
    pub owner: Pubkey,
    pub asset: Pubkey,
    pub quote_mint: Pubkey,
    pub amount: u64,
    pub new_debt: u64,
    pub health_factor_bps: u64,
    pub timestamp: i64,
}

/// Emitted when debt is repaid for a position.
#[event]
pub struct RepayEvent {
    pub owner: Pubkey,
    pub asset: Pubkey,
    pub quote_mint: Pubkey,
    pub amount: u64,
    pub remaining_debt: u64,
    pub timestamp: i64,
}

/// Emitted when an unhealthy position is liquidated.
#[event]
pub struct LiquidateEvent {
    pub liquidator: Pubkey,
    pub owner: Pubkey,
    pub asset: Pubkey,
    pub debt_repaid: u64,
    pub collateral_seized: u64,
    pub bonus_bps: u64,
    pub timestamp: i64,
}

/// Emitted when the 4-state Risk Ratchet transitions to a new state.
#[event]
pub struct RiskStateChanged {
    pub feed_id: [u8; 32],
    pub risk_epoch: u64,
    pub previous_state: MarketState,
    pub new_state: MarketState,
    pub reason: GuardReason,
    pub timestamp: i64,
}

/// Emitted when a healthy crank observation contributes to monotonic recovery.
#[event]
pub struct RecoveryObserved {
    pub feed_id: [u8; 32],
    pub risk_epoch: u64,
    pub current_state: MarketState,
    pub consecutive_observations: u32,
    pub required_observations: u32,
    pub timestamp: i64,
}

/// Emitted when a protocol origination fee is settled directly to Circuit Treasury.
#[event]
pub struct ProtocolFeeCollected {
    pub payer: Pubkey,
    pub fee_amount: u64,
    pub fee_asset: Pubkey,
    pub treasury: Pubkey,
    pub source_action: String,
    pub position: Pubkey,
    pub timestamp: i64,
    pub protocol_version: u16,
}

/// Emitted upon successful execution of an authorized borrow with risk metrics.
#[event]
pub struct BorrowExecuted {
    pub user: Pubkey,
    pub asset: Pubkey,
    pub quote_mint: Pubkey,
    pub collateral_value: u64,
    pub borrow_amount: u64,
    pub fee_amount: u64,
    pub resulting_ltv_bps: u64,
    pub resulting_health_factor_bps: u64,
    pub risk_state: MarketState,
    pub timestamp: i64,
}

/// Emitted when capital policy permissions or effective LTV are updated.
#[event]
pub struct CapitalPolicyUpdated {
    pub risk_state: MarketState,
    pub effective_ltv: u64,
    pub borrow_allowed: bool,
    pub withdraw_allowed: bool,
    pub repay_allowed: bool,
    pub deposit_allowed: bool,
    pub liquidation_allowed: bool,
    pub risk_epoch: u64,
    pub timestamp: i64,
}

/// Emitted when a borrow operation is evaluated and authorized by capital policy.
#[event]
pub struct BorrowAllowed {
    pub position: Pubkey,
    pub amount: u64,
    pub resulting_ltv: u64,
    pub risk_state: MarketState,
}

/// Emitted when a borrow operation is blocked by on-chain capital policy.
#[event]
pub struct BorrowBlocked {
    pub position: Pubkey,
    pub requested_amount: u64,
    pub current_ltv: u64,
    pub effective_ltv: u64,
    pub risk_state: MarketState,
    pub reason: String,
}

/// Emitted when a recovery Dutch auction is initiated.
#[event]
pub struct AuctionCreated {
    pub auction: Pubkey,
    pub position: Pubkey,
    pub collateral_amount: u64,
    pub reference_price: i64,
    pub start_price: i64,
    pub floor_price: i64,
    pub start_time: i64,
    pub end_time: i64,
    pub risk_state: MarketState,
}

/// Emitted when a recovery Dutch auction is settled atomically.
#[event]
pub struct AuctionSettled {
    pub auction: Pubkey,
    pub buyer: Pubkey,
    pub collateral_amount: u64,
    pub settlement_price: i64,
    pub debt_repaid: u64,
    pub fee: u64,
    pub timestamp: i64,
}

/// Emitted when bounded authority is delegated to an autonomous agent.
#[event]
pub struct AgentAuthorityCreated {
    pub owner: Pubkey,
    pub agent: Pubkey,
    pub asset_mint: Pubkey,
    pub allowed_actions: u8,
    pub max_borrow_limit: u64,
    pub max_withdraw_limit: u64,
    pub risk_budget: u64,
    pub expiry_ts: i64,
    pub timestamp: i64,
}

/// Emitted when delegated agent authority parameters are modified by the owner.
#[event]
pub struct AgentAuthorityUpdated {
    pub owner: Pubkey,
    pub agent: Pubkey,
    pub asset_mint: Pubkey,
    pub allowed_actions: u8,
    pub max_borrow_limit: u64,
    pub max_withdraw_limit: u64,
    pub risk_budget: u64,
    pub expiry_ts: i64,
    pub timestamp: i64,
}

/// Emitted when delegated agent authority is revoked.
#[event]
pub struct AgentAuthorityRevoked {
    pub owner: Pubkey,
    pub agent: Pubkey,
    pub asset_mint: Pubkey,
    pub timestamp: i64,
}

/// Emitted when an action passes protocol permission evaluation.
#[event]
pub struct ActionAllowed {
    pub position: Pubkey,
    pub action: AgentAction,
    pub amount: u64,
    pub risk_cost: u64,
    pub remaining_budget: u64,
    pub risk_state: MarketState,
    pub timestamp: i64,
}

/// Emitted when an action is rejected by protocol permission evaluation.
#[event]
pub struct ActionDenied {
    pub position: Pubkey,
    pub action: AgentAction,
    pub amount: u64,
    pub risk_state: MarketState,
    pub denial_reason: PermissionDenialReason,
    pub epoch: u64,
    pub timestamp: i64,
}

/// Emitted when an agent's dynamic risk budget changes.
#[event]
pub struct RiskBudgetChanged {
    pub authority: Pubkey,
    pub old_budget: u64,
    pub new_budget: u64,
    pub action: AgentAction,
    pub timestamp: i64,
}

/// Emitted upon verified on-chain execution of a Meteora DBC operation through Circuit.
#[event]
pub struct DbcActionExecuted {
    pub actor: Pubkey,
    pub owner: Pubkey,
    pub asset_mint: Pubkey,
    pub dbc_pool: Pubkey,
    pub action_type: u8, // 0=Swap, 1=EnterLiquidity, 2=ExitLiquidity, 3=Rebalance
    pub amount_in: u64,
    pub min_amount_out: u64,
    pub risk_state: MarketState,
    pub risk_cost: u64,
    pub timestamp: i64,
}

/// Emitted when a Meteora DBC operation is denied by Circuit Permission Engine.
#[event]
pub struct DbcActionDenied {
    pub actor: Pubkey,
    pub owner: Pubkey,
    pub asset_mint: Pubkey,
    pub dbc_pool: Pubkey,
    pub action_type: u8,
    pub amount_in: u64,
    pub risk_state: MarketState,
    pub denial_reason: PermissionDenialReason,
    pub timestamp: i64,
}

/// Emitted when a RiskEnvelope capability token is authorized and minted on-chain.
#[event]
pub struct EnvelopeAuthorized {
    pub envelope: Pubkey,
    pub owner: Pubkey,
    pub actor: Pubkey,
    pub asset_mint: Pubkey,
    pub venue: u8,
    pub action: u8,
    pub max_notional: u64,
    pub max_ltv_bps: u64,
    pub max_slippage_bps: u64,
    pub risk_state: MarketState,
    pub risk_epoch: u64,
    pub authorized_at_slot: u64,
    pub expires_at_slot: u64,
    pub nonce: u64,
    pub timestamp: i64,
}

/// Emitted when a RiskEnvelope capability token is consumed by an authorized operation.
#[event]
pub struct EnvelopeConsumed {
    pub envelope: Pubkey,
    pub actor: Pubkey,
    pub action: u8,
    pub venue: u8,
    pub amount: u64,
    pub consumed_at_slot: u64,
    pub timestamp: i64,
}

/// Emitted when an expired or consumed RiskEnvelope account is closed.
#[event]
pub struct EnvelopeClosed {
    pub envelope: Pubkey,
    pub closed_by: Pubkey,
    pub refund_to: Pubkey,
    pub slot: u64,
    pub timestamp: i64,
}

/// Emitted when an authorization request for a RiskEnvelope is denied by the Risk Kernel.
#[event]
pub struct EnvelopeAuthorizationDenied {
    pub owner: Pubkey,
    pub actor: Pubkey,
    pub asset_mint: Pubkey,
    pub action: u8,
    pub venue: u8,
    pub requested_amount: u64,
    pub risk_state: MarketState,
    pub denial_reason: PermissionDenialReason,
    pub timestamp: i64,
}



