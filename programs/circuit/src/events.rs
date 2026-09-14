use anchor_lang::prelude::*;
use crate::state::enums::{MarketState, GuardReason};

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
