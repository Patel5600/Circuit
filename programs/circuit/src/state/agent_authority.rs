use anchor_lang::prelude::*;
use crate::errors::CircuitError;

/// Bitmask flags for delegated actions.
pub const ACTION_DEPOSIT: u8 = 1 << 0;         // 1
pub const ACTION_BORROW: u8 = 1 << 1;          // 2
pub const ACTION_REPAY: u8 = 1 << 2;           // 4
pub const ACTION_WITHDRAW: u8 = 1 << 3;        // 8
pub const ACTION_SWAP: u8 = 1 << 4;            // 16
pub const ACTION_ENTER_LIQUIDITY: u8 = 1 << 5; // 32
pub const ACTION_EXIT_LIQUIDITY: u8 = 1 << 6;  // 64
pub const ACTION_REBALANCE: u8 = 1 << 7;       // 128

/// On-chain state account representing bounded authority delegated to an autonomous strategy.
///
/// Seeds: [b"authority", owner.as_ref(), agent.as_ref(), asset_mint.as_ref()]
///
/// CRITICAL ARCHITECTURAL PRINCIPLE:
/// "The agent does NOT own the user's assets. The agent receives bounded authority
/// to request and execute actions. Circuit decides what capital they are allowed to risk."
#[account]
#[derive(InitSpace)]
pub struct AgentAuthority {
    /// The user / account owner delegating authority
    pub owner: Pubkey,

    /// The autonomous agent / strategy authorized to execute actions
    pub agent: Pubkey,

    /// Canonical tokenized stock mint this authority applies to (AAPL, NVDA, etc.)
    pub asset_mint: Pubkey,

    /// Allowed actions bitmask (DEPOSIT=1, BORROW=2, REPAY=4, WITHDRAW=8, SWAP=16, ENTER_LIQUIDITY=32, EXIT_LIQUIDITY=64, REBALANCE=128)
    pub allowed_actions: u8,

    /// Maximum cumulative borrow limit permitted to this agent
    pub max_borrow_limit: u64,

    /// Maximum cumulative withdrawal limit permitted to this agent
    pub max_withdraw_limit: u64,

    /// Cumulative debt borrowed by this agent against the position
    pub current_borrowed: u64,

    /// Remaining dynamic risk budget (B_t) for risk-increasing actions
    pub risk_budget: u64,

    /// Initial risk budget allocated by owner
    pub initial_risk_budget: u64,

    /// Unix timestamp after which authority is strictly invalid (0 = perpetual until revoked)
    pub expiry_ts: i64,

    /// Monotonically increasing nonce tracking action intents executed by this agent
    pub nonce: u64,

    /// PDA bump seed
    pub bump: u8,
}

impl AgentAuthority {
    pub const SEEDS_PREFIX: &'static [u8] = b"authority";

    /// Verifies whether the specified action flag is granted in the bitmask.
    pub fn is_action_allowed(&self, action_flag: u8) -> bool {
        (self.allowed_actions & action_flag) != 0
    }

    /// Verifies whether authority has expired.
    pub fn is_expired(&self, current_ts: i64) -> bool {
        if self.expiry_ts == 0 {
            false // No expiry set
        } else {
            current_ts > self.expiry_ts
        }
    }

    /// Verifies whether authority is active (not revoked and not expired).
    pub fn is_active(&self, current_ts: i64) -> bool {
        self.allowed_actions != 0 && !self.is_expired(current_ts)
    }

    /// Consumes risk budget for a risk-increasing action.
    /// Invariant: B_t >= C(a), B_{t+1} = B_t - C(a). Budget never becomes negative.
    pub fn consume_risk_budget(&mut self, cost: u64) -> Result<()> {
        require!(self.risk_budget >= cost, CircuitError::InsufficientRiskBudget);
        self.risk_budget = self.risk_budget.saturating_sub(cost);
        Ok(())
    }

    /// Restores risk budget for a risk-reducing action (repay, deposit).
    /// Bounded by initial_risk_budget: cannot mint infinite credit.
    pub fn restore_risk_budget(&mut self, gain: u64) {
        self.risk_budget = self.risk_budget
            .saturating_add(gain)
            .min(self.initial_risk_budget);
    }

    /// Increments the action intent nonce to prevent transaction replay.
    pub fn increment_nonce(&mut self) -> Result<()> {
        self.nonce = self.nonce
            .checked_add(1)
            .ok_or(CircuitError::MathOverflow)?;
        Ok(())
    }
}
