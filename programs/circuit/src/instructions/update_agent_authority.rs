use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use crate::state::agent_authority::AgentAuthority;
use crate::events::{AgentAuthorityUpdated, AgentAuthorityRevoked};

pub fn handler(
    ctx: Context<UpdateAgentAuthority>,
    allowed_actions: u8,
    max_borrow_limit: u64,
    max_withdraw_limit: u64,
    risk_budget: u64,
    expiry_ts: i64,
) -> Result<()> {
    let auth = &mut ctx.accounts.agent_authority;
    let clock = Clock::get()?;

    auth.allowed_actions = allowed_actions;
    auth.max_borrow_limit = max_borrow_limit;
    auth.max_withdraw_limit = max_withdraw_limit;
    auth.risk_budget = risk_budget;
    auth.initial_risk_budget = risk_budget;
    auth.expiry_ts = expiry_ts;

    if allowed_actions == 0 {
        emit!(AgentAuthorityRevoked {
            owner: auth.owner,
            agent: auth.agent,
            asset_mint: auth.asset_mint,
            timestamp: clock.unix_timestamp,
        });
        msg!("AgentAuthority revoked for agent={}", auth.agent);
    } else {
        emit!(AgentAuthorityUpdated {
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
        msg!("AgentAuthority updated: actions={:#010b} budget={}", allowed_actions, risk_budget);
    }

    Ok(())
}

#[derive(Accounts)]
pub struct UpdateAgentAuthority<'info> {
    /// Only the delegating owner can update authority parameters
    #[account(mut)]
    pub owner: Signer<'info>,

    /// The agent whose authority is being modified
    pub agent: SystemAccount<'info>,

    /// The tokenized stock collateral mint
    pub asset_mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [
            AgentAuthority::SEEDS_PREFIX,
            owner.key().as_ref(),
            agent.key().as_ref(),
            asset_mint.key().as_ref(),
        ],
        bump = agent_authority.bump,
        has_one = owner,
        has_one = agent,
        has_one = asset_mint,
    )]
    pub agent_authority: Account<'info, AgentAuthority>,
}
