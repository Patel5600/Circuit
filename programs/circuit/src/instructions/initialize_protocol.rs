use anchor_lang::prelude::*;
use crate::state::ProtocolConfig;
use crate::errors::CircuitError;

/// Initializes the global ProtocolConfig singleton PDA.
/// Can only be called once (PDA init prevents re-initialization).
///
/// Admin-only. The caller becomes the protocol authority.
pub fn handler(
    ctx: Context<InitializeProtocol>,
    min_health_factor_bps: u64,
    default_max_oracle_age: u64,
    default_max_conf_bps: u64,
    liquidation_bonus_bps: u64,
) -> Result<()> {
    // Validate parameters
    require!(min_health_factor_bps > 0, CircuitError::HealthFactorTooLow);
    require!(default_max_oracle_age > 0, CircuitError::InvalidTimestamp);
    require!(default_max_conf_bps > 0 && default_max_conf_bps <= 10_000, CircuitError::ConfidenceTooWide);
    require!(liquidation_bonus_bps <= 5_000, CircuitError::MathOverflow); // Max 50% bonus

    let config = &mut ctx.accounts.protocol_config;
    config.authority = ctx.accounts.authority.key();
    config.paused = false;
    config.version = 1;
    config.min_health_factor_bps = min_health_factor_bps;
    config.default_max_oracle_age = default_max_oracle_age;
    config.default_max_conf_bps = default_max_conf_bps;
    config.liquidation_bonus_bps = liquidation_bonus_bps;
    config.fee_recipient = ProtocolConfig::DEFAULT_TREASURY_PUBKEY;
    config.borrow_fee_bps = ProtocolConfig::DEFAULT_BORROW_FEE_BPS;
    config.fee_enabled = true;
    config.bump = ctx.bumps.protocol_config;

    msg!("Protocol initialized. Authority: {}", config.authority);
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeProtocol<'info> {
    /// Admin authority - becomes the protocol authority
    #[account(mut)]
    pub authority: Signer<'info>,

    /// ProtocolConfig PDA - singleton, seeds = ["protocol"]
    #[account(
        init,
        payer = authority,
        space = 8 + ProtocolConfig::INIT_SPACE,
        seeds = [ProtocolConfig::SEEDS],
        bump,
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,

    pub system_program: Program<'info, System>,
}
