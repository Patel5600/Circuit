use anchor_lang::prelude::*;
use crate::state::enums::MarketState;

/// Execution venue identifiers for Risk Envelopes
pub const VENUE_CREDIT: u8 = 0;
pub const VENUE_METEORA_DBC: u8 = 1;
pub const VENUE_TRADING: u8 = 2;

/// Envelope Action identifiers
pub const ENVELOPE_ACTION_BORROW: u8 = 1;
pub const ENVELOPE_ACTION_WITHDRAW: u8 = 2;
pub const ENVELOPE_ACTION_SWAP: u8 = 3;
pub const ENVELOPE_ACTION_ENTER_LIQUIDITY: u8 = 4;
pub const ENVELOPE_ACTION_EXIT_LIQUIDITY: u8 = 5;
pub const ENVELOPE_ACTION_REBALANCE: u8 = 6;
pub const ENVELOPE_ACTION_REPAY: u8 = 7;
pub const ENVELOPE_ACTION_DEPOSIT: u8 = 8;

/// Default and maximum slot TTL for short-lived envelopes
pub const DEFAULT_ENVELOPE_TTL_SLOTS: u64 = 20; // ~8 seconds on Solana
pub const MAX_ENVELOPE_TTL_SLOTS: u64 = 100;     // ~40 seconds maximum

/// Dedicated Risk Envelope state PDA.
///
/// An onchain, short-lived capability token that represents bounded authority:
/// "This actor may perform this exact type of capital action, against this asset/venue,
/// up to this amount, under these market conditions, until this slot."
///
/// Seeds: [b"envelope", owner.as_ref(), actor.as_ref(), asset_mint.as_ref(), &nonce.to_le_bytes()]
#[account]
#[derive(InitSpace)]
pub struct RiskEnvelope {
    /// The collateral position owner delegating or executing
    pub owner: Pubkey,

    /// The authorized actor (human wallet or delegated agent)
    pub actor: Pubkey,

    /// The asset / market mint (e.g. NVDA, AAPL)
    pub asset_mint: Pubkey,

    /// Execution venue (0 = Credit / Lending, 1 = Meteora DBC, 2 = Trading)
    pub venue: u8,

    /// Authorized action type (1 = Borrow, 2 = Withdraw, 3 = Swap, etc.)
    pub action: u8,

    /// Maximum authorized notional amount (in token/quote base units)
    pub max_notional: u64,

    /// Maximum authorized LTV in basis points (e.g. 5000 = 50%)
    pub max_ltv_bps: u64,

    /// Maximum slippage in basis points (for DEX/DBC venues)
    pub max_slippage_bps: u64,

    /// Market risk state at time of authorization
    pub risk_state: MarketState,

    /// Oracle freshness at time of authorization (seconds age)
    pub oracle_freshness: u64,

    /// Confidence limit / observed confidence in basis points
    pub confidence_limit_bps: u64,

    /// Validated oracle price snapshot at authorization
    pub oracle_price: i64,

    /// Validated oracle exponent at authorization
    pub oracle_expo: i32,

    /// Authoritative capital policy version evaluated
    pub policy_version: u16,

    /// Monotonic risk epoch at creation (stale envelope rejection if market shifts)
    pub risk_epoch: u64,

    /// Slot at which this envelope was authorized
    pub authorized_at_slot: u64,

    /// Slot at which this envelope strictly expires
    pub expires_at_slot: u64,

    /// Unique nonce for replay protection and PDA uniqueness
    pub nonce: u64,

    /// Single-use consumption flag (set to true upon execution)
    pub consumed: bool,

    /// Slot at which envelope was consumed (0 if active)
    pub consumed_at_slot: u64,

    /// PDA bump
    pub bump: u8,
}

impl RiskEnvelope {
    pub const SEEDS_PREFIX: &'static [u8] = b"envelope";

    /// Checks whether the envelope is expired relative to current slot
    pub fn is_expired(&self, current_slot: u64) -> bool {
        current_slot > self.expires_at_slot
    }

    /// Checks whether the envelope is valid for execution
    pub fn is_valid_for_execution(
        &self,
        current_slot: u64,
        current_risk_epoch: u64,
        action: u8,
        venue: u8,
        amount: u64,
    ) -> bool {
        !self.consumed
            && !self.is_expired(current_slot)
            && self.risk_epoch == current_risk_epoch
            && self.action == action
            && self.venue == venue
            && amount <= self.max_notional
    }
}
