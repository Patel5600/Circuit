use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use crate::state::agent_authority::AgentAuthority;
use crate::events::AgentAuthorityCreated;
use crate::errors::CircuitError;

pub fn handler(
    ctx: Context<CreateAgentAuthority>,
    allowed_actions: u8,
    max_borrow_limit: u64,
    max_withdraw_limit: u64,
    risk_budget: u64,
    expiry_ts: i64,
) -> Result<()> {
    let clock = Clock::get()?;
    require!(expiry_ts > clock.unix_timestamp, CircuitError::AgentAuthorityExpired);
    require!(allowed_actions > 0, CircuitError::AgentActionNotPermitted);

    let auth = &mut ctx.accounts.agent_authority;

    auth.owner = ctx.accounts.owner.key();
    auth.agent = ctx.accounts.agent.key();
    auth.asset_mint = ctx.accounts.asset_mint.key();
    auth.allowed_actions = allowed_actions;
    auth.max_borrow_limit = max_borrow_limit;
    auth.max_withdraw_limit = max_withdraw_limit;
    auth.current_borrowed = 0;
    auth.risk_budget = risk_budget;
    auth.initial_risk_budget = risk_budget;
    auth.expiry_ts = expiry_ts;
    auth.nonce = 0;
    auth.bump = ctx.bumps.agent_authority;

    emit!(AgentAuthorityCreated {
        owner: auth.owner,
        agent: auth.agent,
        asset_mint: auth.asset_mint,
        allowed_actions,
        max_borrow_limit,
        max_withdraw_limit,
        risk_budget,
        expiry_ts,
        timestamp: clock.unix_timestamp,
    });

    msg!(
        "AgentAuthority created: owner={} agent={} asset={} actions={:#010b} budget={}",
        auth.owner,
        auth.agent,
        auth.asset_mint,
        allowed_actions,
        risk_budget
    );

    Ok(())
}

#[derive(Accounts)]
pub struct CreateAgentAuthority<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    /// The autonomous agent / strategy being delegated authority
    pub agent: SystemAccount<'info>,

    /// The tokenized stock collateral mint this authority governs
    pub asset_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = owner,
        space = 8 + AgentAuthority::INIT_SPACE,
        seeds = [
            AgentAuthority::SEEDS_PREFIX,
            owner.key().as_ref(),
            agent.key().as_ref(),
            asset_mint.key().as_ref(),
        ],
        bump,
    )]
    pub agent_authority: Account<'info, AgentAuthority>,

    pub system_program: Program<'info, System>,
}
