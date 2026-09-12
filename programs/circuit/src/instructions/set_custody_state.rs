use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::CircuitError;

/// Sets the custody state for an asset.
///
/// MVP: This is an explicit admin-controlled simulation input.
/// NOT derived from a live custody oracle.
///
/// Admin-only.
pub fn handler(ctx: Context<SetCustodyState>, new_state: CustodyState) -> Result<()> {
    let asset_config = &mut ctx.accounts.asset_config;
    let old_state = asset_config.custody_state;
    asset_config.custody_state = new_state;

    msg!(
        "Custody state changed: {:?} -> {:?} for mint {}",
        old_state, new_state, asset_config.mint
    );
    Ok(())
}

#[derive(Accounts)]
pub struct SetCustodyState<'info> {
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
