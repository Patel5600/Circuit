#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod market;
pub mod math;
pub mod oracle;
pub mod state;

use instructions::*;
use state::*;

// Program ID - updated after first `anchor build`
declare_id!("Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2");

/// Circuit Protocol - Programmable collateral for tokenized equities on Solana.
///
/// Combines verifiable market-state gating, oracle-validated credit,
/// health-factor enforcement, and onchain liquidation.
///
/// See ARCHITECTURE.md and SECURITY.md for full documentation.
#[program]
pub mod circuit {
    use super::*;

    // -- Admin Instructions --

    /// Initialize the global protocol configuration.
    /// Can only be called once (PDA prevents re-init).
    pub fn initialize_protocol(
        ctx: Context<InitializeProtocol>,
        min_health_factor_bps: u64,
        default_max_oracle_age: u64,
        default_max_conf_bps: u64,
        liquidation_bonus_bps: u64,
    ) -> Result<()> {
        instructions::initialize_protocol::handler(
            ctx,
            min_health_factor_bps,
            default_max_oracle_age,
            default_max_conf_bps,
            liquidation_bonus_bps,
        )
    }

    /// Register a new equity token as collateral.
    /// Creates AssetConfig, MarketGuard, and vault accounts.
    pub fn register_asset(
        ctx: Context<RegisterAsset>,
        pyth_feed_id: [u8; 32],
        base_ltv_bps: u64,
        liquidation_threshold_bps: u64,
        liquidation_bonus_bps: u64,
        max_oracle_age: u64,
        max_conf_bps: u64,
    ) -> Result<()> {
        instructions::register_asset::handler(
            ctx,
            pyth_feed_id,
            base_ltv_bps,
            liquidation_threshold_bps,
            liquidation_bonus_bps,
            max_oracle_age,
            max_conf_bps,
        )
    }

    /// Set custody state (admin-controlled MVP simulation input).
    pub fn set_custody_state(
        ctx: Context<SetCustodyState>,
        new_state: CustodyState,
    ) -> Result<()> {
        instructions::set_custody_state::handler(ctx, new_state)
    }

    /// Set liquidity state (admin-controlled MVP simulation input).
    pub fn set_liquidity_state(
        ctx: Context<SetLiquidityState>,
        new_state: LiquidityState,
    ) -> Result<()> {
        instructions::set_liquidity_state::handler(ctx, new_state)
    }

    /// Pause the protocol (borrow/withdraw blocked).
    pub fn pause_protocol(ctx: Context<TogglePause>) -> Result<()> {
        instructions::pause::handler_pause(ctx)
    }

    /// Unpause the protocol.
    pub fn unpause_protocol(ctx: Context<TogglePause>) -> Result<()> {
        instructions::pause::handler_unpause(ctx)
    }

    // -- Permissionless Observability --

    /// Refresh the cached MarketGuard state.
    /// Permissionless. Does NOT serve as sole authorization for borrow/withdraw.
    pub fn refresh_guard(ctx: Context<RefreshGuard>) -> Result<()> {
        instructions::refresh_guard::handler(ctx)
    }

    // -- User Position Management --

    /// Deposit equity tokens as collateral.
    /// Creates position on first deposit. Allowed when paused.
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        instructions::deposit::handler(ctx, amount)
    }

    /// Borrow quote tokens against collateral.
    /// Full oracle + market + health factor validation.
    /// Blocked when paused or market unsafe.
    pub fn borrow(ctx: Context<Borrow>, amount: u64) -> Result<()> {
        instructions::borrow::handler(ctx, amount)
    }

    /// Repay outstanding debt.
    /// Always allowed (even when paused).
    pub fn repay(ctx: Context<Repay>, amount: u64) -> Result<()> {
        instructions::repay::handler(ctx, amount)
    }

    /// Withdraw collateral.
    /// Risk-increasing - requires oracle + health factor validation when debt > 0.
    /// Blocked when paused.
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        instructions::withdraw::handler(ctx, amount)
    }

    // -- Liquidation --

    /// Liquidate an unhealthy position (full liquidation, MVP).
    /// Uses emergency price policy when current oracle is invalid.
    /// Permissionless. Allowed when paused.
    pub fn liquidate(ctx: Context<Liquidate>) -> Result<()> {
        instructions::liquidate::handler(ctx)
    }
}
