use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer};
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;
use crate::state::*;
use crate::errors::CircuitError;
use crate::oracle;
use crate::market;
use crate::math;

/// Withdraws collateral from a position.
///
/// Risk-increasing operation - requires full oracle + market validation when debt > 0.
///
/// If debt == 0: allows withdrawal within collateral balance (no oracle needed).
/// If debt > 0: re-validates oracle, session, and health factor.
///
/// BLOCKED when protocol is paused.
pub fn handler(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    require!(amount > 0, CircuitError::InsufficientCollateral);

    let protocol = &ctx.accounts.protocol_config;
    let asset = &ctx.accounts.asset_config;
    let position = &mut ctx.accounts.position;

    // Protocol must not be paused (withdrawal is risk-increasing)
    require!(!protocol.paused, CircuitError::ProtocolPaused);

    // Validate ownership
    require!(position.owner == ctx.accounts.owner.key(), CircuitError::InvalidPositionOwner);
    require!(position.asset == asset.mint, CircuitError::InvalidAsset);

    // Validate sufficient collateral
    require!(amount <= position.collateral_amount, CircuitError::WithdrawExceedsCollateral);

    let remaining_collateral = position.collateral_amount
        .checked_sub(amount)
        .ok_or(CircuitError::MathOverflow)?;

    // If position has debt, we must validate oracle + market + health factor
    if position.has_debt() {
        let clock = Clock::get()?;

        // Re-validate oracle
        let validated_price = oracle::validate_pyth_price(
            &ctx.accounts.price_update,
            &asset.pyth_feed_id,
            asset.max_oracle_age,
            asset.max_conf_bps,
            &clock,
        )?;

        // Re-validate market session
        let market_open = market::is_market_open(clock.unix_timestamp)?;
        require!(market_open, CircuitError::MarketClosed);

        // Check custody and liquidity
        require!(
            asset.custody_state != CustodyState::Impaired &&
            asset.custody_state != CustodyState::Delayed,
            CircuitError::InvalidCustodyState
        );
        require!(
            asset.liquidity_state != LiquidityState::Critical &&
            asset.liquidity_state != LiquidityState::Thin,
            CircuitError::InvalidLiquidityState
        );

        // Calculate remaining collateral value
        let remaining_value = math::calculate_collateral_value(
            remaining_collateral,
            validated_price.price,
            validated_price.expo,
            ctx.accounts.collateral_mint.decimals,
            ctx.accounts.quote_mint.decimals,
        )?;

        // Check health factor with remaining collateral
        let hf = math::calculate_health_factor(
            remaining_value,
            asset.liquidation_threshold_bps,
            position.debt_amount,
        )?;
        require!(hf >= protocol.min_health_factor_bps, CircuitError::HealthFactorTooLow);

        // Update last valid price
        position.last_valid_price = validated_price.price;
        position.last_valid_expo = validated_price.expo;
    }

    // Transfer collateral from vault to user
    let seeds = &[ProtocolConfig::SEEDS, &[protocol.bump]];
    let signer_seeds = &[&seeds[..]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.collateral_vault.to_account_info(),
                to: ctx.accounts.user_collateral_ata.to_account_info(),
                authority: ctx.accounts.protocol_config.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    // Update position
    position.collateral_amount = remaining_collateral;

    let clock = Clock::get()?;
    emit!(crate::events::WithdrawEvent {
        owner: ctx.accounts.owner.key(),
        asset: ctx.accounts.asset_config.mint,
        amount,
        remaining_collateral,
        timestamp: clock.unix_timestamp,
    });

    msg!(
        "Withdrew {} collateral tokens. Remaining: {}",
        amount, position.collateral_amount
    );
    Ok(())
}

/// Accounts are boxed to keep the generated `try_accounts` within the 4KB SBF
/// stack frame. See the note in `liquidate.rs` - layout only, no wire change.
#[derive(Accounts)]
pub struct Withdraw<'info> {
    /// User withdrawing collateral
    #[account(mut)]
    pub owner: Signer<'info>,

    /// ProtocolConfig PDA
    #[account(
        seeds = [ProtocolConfig::SEEDS],
        bump = protocol_config.bump,
    )]
    pub protocol_config: Box<Account<'info, ProtocolConfig>>,

    /// AssetConfig PDA
    #[account(
        seeds = [AssetConfig::SEEDS_PREFIX, asset_config.mint.as_ref()],
        bump = asset_config.bump,
    )]
    pub asset_config: Box<Account<'info, AssetConfig>>,

    /// Position PDA
    #[account(
        mut,
        seeds = [Position::SEEDS_PREFIX, owner.key().as_ref(), asset_config.mint.as_ref()],
        bump = position.bump,
    )]
    pub position: Box<Account<'info, Position>>,

    /// Pyth PriceUpdateV2 - required when debt > 0
    /// When debt == 0, this account is still required to be provided
    /// but is not read (Anchor requires all accounts to be present).
    pub price_update: Box<Account<'info, PriceUpdateV2>>,

    /// Collateral token mint
    #[account(
        constraint = collateral_mint.key() == asset_config.mint @ CircuitError::InvalidMint,
    )]
    pub collateral_mint: Box<Account<'info, Mint>>,

    /// Quote token mint
    #[account(
        constraint = quote_mint.key() == asset_config.quote_mint @ CircuitError::InvalidMint,
    )]
    pub quote_mint: Box<Account<'info, Mint>>,

    /// User's collateral token account (receives withdrawn tokens)
    #[account(
        mut,
        token::mint = collateral_mint,
        token::authority = owner,
    )]
    pub user_collateral_ata: Box<Account<'info, TokenAccount>>,

    /// Protocol collateral vault
    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = protocol_config,
    )]
    pub collateral_vault: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}
