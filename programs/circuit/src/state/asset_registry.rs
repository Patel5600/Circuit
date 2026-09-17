use anchor_lang::prelude::*;

/// Authoritative on-chain registry entry binding a tokenized stock collateral asset
/// to its Pyth price feed, quote mint, and verified Meteora Dynamic Bonding Curve (DBC) pool.
///
/// Seeds: [b"registry", mint.as_ref()]
///
/// CRITICAL SECURITY INVARIANT (Section 18 & 19):
/// "Before interacting with a DBC pool verify: expected pool account, expected base mint,
/// expected quote mint, expected DBC program, pool status, migration status, asset registry mapping.
/// Never trust: pool symbol, pool name, frontend label, or user-supplied metadata as authorization."
#[account]
#[derive(InitSpace)]
pub struct AssetRegistryEntry {
    /// Canonical tokenized stock mint (e.g. NVDA, AAPL)
    pub mint: Pubkey,

    /// Canonical quote mint (e.g. USDC)
    pub quote_mint: Pubkey,

    /// Bound Pyth price feed ID (32 bytes)
    pub oracle_feed: [u8; 32],

    /// Bound verified Meteora Dynamic Bonding Curve (DBC) pool PDA
    pub dbc_pool: Pubkey,

    /// Market status: 0 = Active, 1 = Suspended, 2 = Migrated
    pub market_status: u8,

    /// Policy version
    pub policy_version: u16,

    /// PDA bump seed
    pub bump: u8,
}

impl AssetRegistryEntry {
    pub const SEEDS_PREFIX: &'static [u8] = b"registry";

    pub const STATUS_ACTIVE: u8 = 0;
    pub const STATUS_SUSPENDED: u8 = 1;
    pub const STATUS_MIGRATED: u8 = 2;

    pub fn is_active(&self) -> bool {
        self.market_status == Self::STATUS_ACTIVE
    }

    /// Validates that the provided pool matches this asset's registered DBC pool
    pub fn assert_valid_dbc_pool(&self, pool: &Pubkey) -> bool {
        &self.dbc_pool == pool
    }
}
