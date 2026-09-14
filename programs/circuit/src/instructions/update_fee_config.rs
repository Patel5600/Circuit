use anchor_lang::prelude::*;
use crate::state::ProtocolConfig;
use crate::errors::CircuitError;

/// Admin instruction to update the protocol fee configuration.
/// Only the designated protocol authority can call this.
pub fn handler(
    ctx: Context<UpdateFeeConfig>,
    new_fee_recipient: Pubkey,
    new_borrow_fee_bps: u64,
    new_fee_enabled: bool,
) -> Result<()> {
    require!(
        new_borrow_fee_bps <= ProtocolConfig::MAX_BORROW_FEE_BPS,
        CircuitError::FeeBpsExceedsMaximum
    );

    let config = &mut ctx.accounts.protocol_config;
    config.fee_recipient = new_fee_recipient;
    config.borrow_fee_bps = new_borrow_fee_bps;
    config.fee_enabled = new_fee_enabled;

    msg!(
        "Protocol fee config updated by authority {}. Recipient: {}, BPS: {}, Enabled: {}",
        ctx.accounts.authority.key(),
        new_fee_recipient,
        new_borrow_fee_bps,
        new_fee_enabled
    );

    Ok(())
}

#[derive(Accounts)]
pub struct UpdateFeeConfig<'info> {
    /// Protocol admin authority
    #[account(
        constraint = authority.key() == protocol_config.authority @ CircuitError::Unauthorized,
    )]
    pub authority: Signer<'info>,

    /// ProtocolConfig singleton PDA
    #[account(
        mut,
        seeds = [ProtocolConfig::SEEDS],
        bump = protocol_config.bump,
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
}
