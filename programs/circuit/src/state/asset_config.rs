use anchor_lang::prelude::*;
use super::enums::{CustodyState, LiquidityState};

/// Per-asset configuration - one PDA per supported token mint.
///
/// Seeds: ["asset", mint.key()]
///
/// Stores oracle feed binding, risk parameters, and admin-controlled
/// custody/liquidity simulation state.
#[account]
#[derive(InitSpace)]
pub struct AssetConfig {
    /// Admin authority for this asset's configuration
    pub authority: Pubkey,

    /// The SPL token mint this configuration governs (equity token)
    pub mint: Pubkey,

    /// Pyth price feed identifier (32 bytes).
    /// The on-chain program validates that any PriceUpdateV2 account
    /// matches this exact feed ID before accepting the price.
    pub pyth_feed_id: [u8; 32],

    /// Base loan-to-value ratio in BPS (e.g., 7000 = 70%).
    /// Applied only when MarketState == Safe.
    /// MVP: fixed, no dynamic adjustment.
    pub base_ltv_bps: u64,

    /// Liquidation threshold in BPS (e.g., 8000 = 80%).
    /// When collateral_value * threshold < debt, position is liquidatable.
    pub liquidation_threshold_bps: u64,

    /// Per-asset liquidation bonus in BPS (e.g., 500 = 5%).
    /// Overrides global if non-zero; falls back to ProtocolConfig otherwise.
    pub liquidation_bonus_bps: u64,

    /// Maximum oracle age in seconds for this specific asset.
    /// Overrides ProtocolConfig.default_max_oracle_age.
    pub max_oracle_age: u64,

    /// Maximum confidence width in BPS for this specific asset.
    /// conf * BPS_SCALE / price must be <= this value.
    pub max_conf_bps: u64,

    /// Admin-controlled custody simulation state.
    /// MVP: explicitly set by admin, NOT from a live oracle.
    /// Impaired custody triggers Emergency market state.
    pub custody_state: CustodyState,

    /// Admin-controlled liquidity simulation state.
    /// MVP: explicitly set by admin, NOT from a live oracle.
    /// Critical/Thin liquidity triggers Emergency/Restricted market state.
    pub liquidity_state: LiquidityState,

    /// Whether this asset is enabled for protocol operations.
    /// Disabled assets block deposit/borrow but allow repay/withdraw.
    pub enabled: bool,

    /// The quote token mint (e.g., USDC) used for borrowing against this asset
    pub quote_mint: Pubkey,

    /// PDA bump seed
    pub bump: u8,
}

impl AssetConfig {
    pub const SEEDS_PREFIX: &'static [u8] = b"asset";

    /// Returns the liquidation bonus, falling back to the protocol default
    pub fn effective_liquidation_bonus(&self, protocol: &super::protocol_config::ProtocolConfig) -> u64 {
        if self.liquidation_bonus_bps > 0 {
            self.liquidation_bonus_bps
        } else {
            protocol.liquidation_bonus_bps
        }
    }
}
