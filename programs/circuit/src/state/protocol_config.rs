use anchor_lang::prelude::*;

/// Global protocol configuration - singleton PDA.
///
/// Seeds: ["protocol"]
///
/// Controls pause state, health factor minimums, oracle defaults,
/// and liquidation parameters. Only the designated authority can modify.
#[account]
#[derive(InitSpace)]
pub struct ProtocolConfig {
    /// Admin authority that can modify protocol parameters
    pub authority: Pubkey,

    /// When true, risk-increasing operations (borrow, withdraw) are blocked.
    /// Deposit, repay, and liquidation remain available.
    pub paused: bool,

    /// Protocol version for future upgrade tracking
    pub version: u16,

    /// Minimum health factor in BPS (10000 = 1.0).
    /// Positions below this threshold become liquidatable.
    pub min_health_factor_bps: u64,

    /// Default maximum oracle age in seconds.
    /// Used when AssetConfig doesn't override.
    pub default_max_oracle_age: u64,

    /// Default maximum confidence width in BPS.
    /// conf * BPS_SCALE / price must be <= this value.
    pub default_max_conf_bps: u64,

    /// Global liquidation bonus in BPS.
    /// Liquidators receive this % bonus on seized collateral.
    pub liquidation_bonus_bps: u64,

    /// Treasury recipient that receives protocol fees
    pub fee_recipient: Pubkey,

    /// Protocol origination / credit execution fee in BPS (e.g., 25 = 0.25%)
    pub borrow_fee_bps: u64,

    /// Whether protocol fee collection is currently active
    pub fee_enabled: bool,

    /// PDA bump seed
    pub bump: u8,
}

impl ProtocolConfig {
    pub const SEEDS: &'static [u8] = b"protocol";

    /// Canonical Circuit Treasury public address
    pub const DEFAULT_TREASURY_PUBKEY: Pubkey = pubkey!("7AALMsZ5MuioSW7BMwBCwTmy9Y1fMJ6MKXAELYyrtb4");

    /// Safety cap: maximum allowable borrow fee in BPS (1000 BPS = 10.00%)
    pub const MAX_BORROW_FEE_BPS: u64 = 1_000;

    /// Default borrow origination fee in BPS (25 BPS = 0.25%)
    pub const DEFAULT_BORROW_FEE_BPS: u64 = 25;
}
