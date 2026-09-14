use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer};
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;
use crate::state::*;
use crate::errors::CircuitError;
use crate::oracle;
use crate::market;
use crate::math;

/// Borrows quote tokens against deposited collateral.
///
/// This is the most heavily validated instruction in the protocol.
/// It independently validates ALL security conditions - it does NOT
/// rely on cached MarketGuard state as sole authorization.
///
/// BLOCKED when: protocol paused, asset disabled, market not Safe.
pub fn handler(ctx: Context<Borrow>, amount: u64) -> Result<()> {
    require!(amount > 0, CircuitError::BorrowExceedsCapacity);

    let protocol = &ctx.accounts.protocol_config;
    let asset = &ctx.accounts.asset_config;
    let position = &mut ctx.accounts.position;
    let clock = Clock::get()?;

    // -- Step 1-2: Validate protocol state --
    require!(!protocol.paused, CircuitError::ProtocolPaused);
    require!(asset.enabled, CircuitError::AssetDisabled);

    // -- Step 3-4: Validate position ownership --
    require!(position.owner == ctx.accounts.owner.key(), CircuitError::InvalidPositionOwner);
    require!(position.asset == asset.mint, CircuitError::InvalidAsset);

    // -- Step 5-8: Oracle validation (centralized) --
    let validated_price = oracle::validate_pyth_price(
        &ctx.accounts.price_update,
        &asset.pyth_feed_id,
        asset.max_oracle_age,
        asset.max_conf_bps,
        &clock,
    )?;

    // -- Step 9: Validate reference market session --
    let market_open = market::is_market_open(clock.unix_timestamp)?;
    require!(market_open, CircuitError::MarketClosed);

    // -- Step 10: Derive market state independently --
    // Check custody and liquidity conditions
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

    // All conditions met -> MarketState is Safe
    // (We derived this independently, not from cached MarketGuard)

    // -- Step 11: Calculate collateral value --
    let collateral_value = math::calculate_collateral_value(
        position.collateral_amount,
        validated_price.price,
        validated_price.expo,
        ctx.accounts.collateral_mint.decimals,
        ctx.accounts.quote_mint.decimals,
    )?;

    // -- Step 12: Apply fixed base LTV (MVP: no dynamic adjustment) --
    let max_borrow = math::calculate_max_borrow(collateral_value, asset.base_ltv_bps)?;

    // -- Step 13: Check capacity --
    let new_debt = (position.debt_amount as u128)
        .checked_add(amount as u128)
        .ok_or(CircuitError::MathOverflow)?;
    require!(new_debt <= max_borrow, CircuitError::BorrowExceedsCapacity);

    // -- Step 14: Calculate and check health factor --
    let hf = math::calculate_health_factor(
        collateral_value,
        asset.liquidation_threshold_bps,
        new_debt as u64,
    )?;
    require!(hf >= protocol.min_health_factor_bps, CircuitError::HealthFactorTooLow);

    // -- Step 15: Check vault has sufficient liquidity --
    require!(
        ctx.accounts.liquidity_vault.amount >= amount,
        CircuitError::InsufficientLiquidity
    );

    // -- Step 16: Transfer quote tokens from vault to borrower --
    let seeds = &[ProtocolConfig::SEEDS, &[protocol.bump]];
    let signer_seeds = &[&seeds[..]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.liquidity_vault.to_account_info(),
                to: ctx.accounts.user_quote_ata.to_account_info(),
                authority: ctx.accounts.protocol_config.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    // -- Step 17: Update position --
    position.debt_amount = new_debt as u64;
    position.last_valid_price = validated_price.price;
    position.last_valid_expo = validated_price.expo;

    emit!(crate::events::BorrowEvent {
        owner: ctx.accounts.owner.key(),
        asset: ctx.accounts.asset_config.mint,
        quote_mint: ctx.accounts.quote_mint.key(),
        amount,
        new_debt: position.debt_amount,
        health_factor_bps: hf,
        timestamp: clock.unix_timestamp,
    });

    msg!(
        "Borrowed {} quote tokens. Total debt: {}. HF: {} BPS",
        amount, position.debt_amount, hf
    );
    Ok(())
}

/// Accounts are boxed to keep the generated `try_accounts` within the 4KB SBF
/// stack frame. See the note in `liquidate.rs` - layout only, no wire change.
#[derive(Accounts)]
pub struct Borrow<'info> {
    /// Borrower - must be the position owner
    #[account(mut)]
    pub owner: Signer<'info>,

    /// ProtocolConfig PDA
    #[account(
        seeds = [ProtocolConfig::SEEDS],
        bump = protocol_config.bump,
    )]
    pub protocol_config: Box<Account<'info, ProtocolConfig>>,

    /// AssetConfig PDA - validates mint, feed ID, and risk parameters
    #[account(
        seeds = [AssetConfig::SEEDS_PREFIX, asset_config.mint.as_ref()],
        bump = asset_config.bump,
    )]
    pub asset_config: Box<Account<'info, AssetConfig>>,

    /// Position PDA - must already exist (created during deposit)
    #[account(
        mut,
        seeds = [Position::SEEDS_PREFIX, owner.key().as_ref(), asset_config.mint.as_ref()],
        bump = position.bump,
    )]
    pub position: Box<Account<'info, Position>>,

    /// Pyth PriceUpdateV2 account - validated by oracle module
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

    /// User's quote token account (receives borrowed tokens)
    #[account(
        mut,
        token::mint = quote_mint,
        token::authority = owner,
    )]
    pub user_quote_ata: Box<Account<'info, TokenAccount>>,

    /// Protocol liquidity vault (source of borrowed tokens)
    #[account(
        mut,
        associated_token::mint = quote_mint,
        associated_token::authority = protocol_config,
    )]
    pub liquidity_vault: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}
