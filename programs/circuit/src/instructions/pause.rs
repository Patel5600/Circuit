use anchor_lang::prelude::*;
use crate::state::ProtocolConfig;
use crate::errors::CircuitError;

/// Pauses the protocol. When paused:
/// - borrow: BLOCKED
/// - withdraw: BLOCKED
/// - deposit: ALLOWED (reduces user risk)
/// - repay: ALLOWED (must not trap funds)
/// - liquidation: ALLOWED (protocol solvency)
///
/// Admin-only.
pub fn handler_pause(ctx: Context<TogglePause>) -> Result<()> {
    let config = &mut ctx.accounts.protocol_config;
    require!(!config.paused, CircuitError::ProtocolPaused); // Already paused
    config.paused = true;
    msg!("Protocol PAUSED by {}", ctx.accounts.authority.key());
    Ok(())
}

/// Unpauses the protocol.
///
/// Admin-only.
pub fn handler_unpause(ctx: Context<TogglePause>) -> Result<()> {
    let config = &mut ctx.accounts.protocol_config;
    config.paused = false;
    msg!("Protocol UNPAUSED by {}", ctx.accounts.authority.key());
    Ok(())
}

#[derive(Accounts)]
pub struct TogglePause<'info> {
    /// Admin authority
    #[account(
        constraint = authority.key() == protocol_config.authority @ CircuitError::Unauthorized,
    )]
    pub authority: Signer<'info>,

    /// ProtocolConfig PDA
    #[account(
        mut,
        seeds = [ProtocolConfig::SEEDS],
        bump = protocol_config.bump,
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
}
