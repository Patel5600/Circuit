use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer};
use anchor_spl::associated_token::AssociatedToken;
use crate::state::*;
use crate::errors::CircuitError;

/// Deposits equity tokens as collateral.
/// Creates the Position PDA if it doesn't exist (init_if_needed).
///
/// Allowed when protocol is paused (reduces user risk, no protocol risk).
/// Requires asset to be enabled.
pub fn handler(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    require!(amount > 0, CircuitError::InsufficientCollateral);
    require!(ctx.accounts.asset_config.enabled, CircuitError::AssetDisabled);

    // Transfer equity tokens from user to collateral vault
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.user_collateral_ata.to_account_info(),
                to: ctx.accounts.collateral_vault.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        amount,
    )?;

    // Update position
    let position = &mut ctx.accounts.position;
    if position.owner == Pubkey::default() {
        // First deposit - initialize position fields
        position.owner = ctx.accounts.owner.key();
        position.asset = ctx.accounts.asset_config.mint;
        position.debt_amount = 0;
        position.last_valid_price = 0;
        position.last_valid_expo = 0;
        position.state = PositionState::Healthy;
        position.bump = ctx.bumps.position;
    }

    position.collateral_amount = position.collateral_amount
        .checked_add(amount)
        .ok_or(CircuitError::MathOverflow)?;

    let clock = Clock::get()?;
    emit!(crate::events::DepositEvent {
        owner: ctx.accounts.owner.key(),
        asset: ctx.accounts.asset_config.mint,
        amount,
        total_collateral: position.collateral_amount,
        timestamp: clock.unix_timestamp,
    });

    msg!("Deposited {} tokens. Total collateral: {}", amount, position.collateral_amount);
    Ok(())
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    /// User depositing collateral
    #[account(mut)]
    pub owner: Signer<'info>,

    /// ProtocolConfig - not strictly needed for deposit but validates
    /// the collateral vault authority
    #[account(
        seeds = [ProtocolConfig::SEEDS],
        bump = protocol_config.bump,
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,

    /// AssetConfig - validates the equity mint and enabled status
    #[account(
        seeds = [AssetConfig::SEEDS_PREFIX, asset_config.mint.as_ref()],
        bump = asset_config.bump,
    )]
    pub asset_config: Account<'info, AssetConfig>,

    /// The equity token mint
    #[account(
        constraint = mint.key() == asset_config.mint @ CircuitError::InvalidMint,
    )]
    pub mint: Account<'info, Mint>,

    /// User's Position PDA - created on first deposit
    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + Position::INIT_SPACE,
        seeds = [Position::SEEDS_PREFIX, owner.key().as_ref(), asset_config.mint.as_ref()],
        bump,
    )]
    pub position: Account<'info, Position>,

    /// User's equity token account
    #[account(
        mut,
        token::mint = mint,
        token::authority = owner,
    )]
    pub user_collateral_ata: Account<'info, TokenAccount>,

    /// Protocol collateral vault - ATA of protocol PDA for equity mint
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = protocol_config,
    )]
    pub collateral_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}
