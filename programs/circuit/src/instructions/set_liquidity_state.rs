use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::CircuitError;

/// Sets the liquidity state for an asset.
///
/// MVP: This is an explicit admin-controlled simulation input.
/// NOT derived from a live liquidity oracle/DEX depth feed.
///
/// Admin-only.
pub fn handler(ctx: Context<SetLiquidityState>, new_state: LiquidityState) -> Result<()> {
    let asset_config = &mut ctx.accounts.asset_config;
    let old_state = asset_config.liquidity_state;
    asset_config.liquidity_state = new_state;

    msg!(
        "Liquidity state changed: {:?} -> {:?} for mint {}",
        old_state, new_state, asset_config.mint
    );
    Ok(())
}

#[derive(Accounts)]
pub struct SetLiquidityState<'info> {
    /// Admin authority
    #[account(
        constraint = authority.key() == protocol_config.authority @ CircuitError::Unauthorized,
    )]
    pub authority: Signer<'info>,

    /// ProtocolConfig - validates admin
    #[account(
        seeds = [ProtocolConfig::SEEDS],
        bump = protocol_config.bump,
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,

    /// AssetConfig to update
    #[account(
        mut,
        seeds = [AssetConfig::SEEDS_PREFIX, asset_config.mint.as_ref()],
        bump = asset_config.bump,
    )]
    pub asset_config: Account<'info, AssetConfig>,
}
