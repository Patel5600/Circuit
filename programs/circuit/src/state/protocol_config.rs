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

    /// PDA bump seed
    pub bump: u8,
}

impl ProtocolConfig {
    pub const SEEDS: &'static [u8] = b"protocol";
}
