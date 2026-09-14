use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer};
use crate::state::*;
use crate::errors::CircuitError;

/// Repays outstanding quote token debt.
///
/// Always allowed (even when paused) - repay reduces risk and must not trap funds.
/// Rejects if amount > existing debt (MVP policy: no over-repayment).
pub fn handler(ctx: Context<Repay>, amount: u64) -> Result<()> {
    require!(amount > 0, CircuitError::BorrowExceedsCapacity);

    let position = &mut ctx.accounts.position;

    // Validate position ownership
    require!(position.owner == ctx.accounts.owner.key(), CircuitError::InvalidPositionOwner);

    // MVP policy: reject if amount exceeds debt (no over-repayment)
    require!(amount <= position.debt_amount, CircuitError::RepayExceedsDebt);

    // Transfer quote tokens from user to liquidity vault
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.user_quote_ata.to_account_info(),
                to: ctx.accounts.liquidity_vault.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        amount,
    )?;

    // Update position - guaranteed no underflow due to require check above
    position.debt_amount = position.debt_amount
        .checked_sub(amount)
        .ok_or(CircuitError::MathOverflow)?;

    // Update position state
    if position.debt_amount == 0 {
        position.state = PositionState::Healthy;
    }

    let clock = Clock::get()?;
    emit!(crate::events::RepayEvent {
        owner: ctx.accounts.owner.key(),
        asset: ctx.accounts.asset_config.mint,
        quote_mint: ctx.accounts.quote_mint.key(),
        amount,
        remaining_debt: position.debt_amount,
        timestamp: clock.unix_timestamp,
    });

    msg!("Repaid {} quote tokens. Remaining debt: {}", amount, position.debt_amount);
    Ok(())
}

#[derive(Accounts)]
pub struct Repay<'info> {
    /// User repaying debt
    #[account(mut)]
    pub owner: Signer<'info>,

    /// ProtocolConfig - needed for vault authority validation
    #[account(
        seeds = [ProtocolConfig::SEEDS],
        bump = protocol_config.bump,
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,

    /// AssetConfig - validates the asset
    #[account(
        seeds = [AssetConfig::SEEDS_PREFIX, asset_config.mint.as_ref()],
        bump = asset_config.bump,
    )]
    pub asset_config: Account<'info, AssetConfig>,

    /// Position PDA
    #[account(
        mut,
        seeds = [Position::SEEDS_PREFIX, owner.key().as_ref(), asset_config.mint.as_ref()],
        bump = position.bump,
    )]
    pub position: Account<'info, Position>,

    /// Quote token mint
    #[account(
        constraint = quote_mint.key() == asset_config.quote_mint @ CircuitError::InvalidMint,
    )]
    pub quote_mint: Account<'info, Mint>,

    /// User's quote token account (source of repayment)
    #[account(
        mut,
        token::mint = quote_mint,
        token::authority = owner,
    )]
    pub user_quote_ata: Account<'info, TokenAccount>,

    /// Protocol liquidity vault (receives repayment)
    #[account(
        mut,
        associated_token::mint = quote_mint,
        associated_token::authority = protocol_config,
    )]
    pub liquidity_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}
