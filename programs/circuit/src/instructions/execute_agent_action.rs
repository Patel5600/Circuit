use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer};
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;
use crate::state::*;
use crate::state::agent_authority::{
    AgentAuthority, ACTION_DEPOSIT, ACTION_BORROW, ACTION_REPAY, ACTION_WITHDRAW,
};
use crate::errors::CircuitError;
use crate::oracle;
use crate::market;
use crate::math;

/// Executes an authorized action delegated to an autonomous strategy.
///
/// CRITICAL ARCHITECTURAL CONSTRAINTS:
/// 1. Protocol is authoritative: all permissions and risk budgets are strictly checked onchain.
/// 2. The agent does NOT own the user's collateral.
/// 3. Nonce enforces replay protection.
/// 4. Risk budget B_t is consumed by risk-increasing actions and replenished by risk-reducing actions.
/// 5. Hard financial invariants (LTV capacity, Health Factor) can NEVER be bypassed.
pub fn handler(
    ctx: Context<ExecuteAgentAction>,
    action: AgentAction,
    amount: u64,
    intent_nonce: u64,
) -> Result<()> {
    require!(amount > 0, CircuitError::InsufficientCollateral);

    let clock = Clock::get()?;
    let protocol = &ctx.accounts.protocol_config;
    let asset = &ctx.accounts.asset_config;
    let ratchet = &ctx.accounts.risk_ratchet;
    let position = &mut ctx.accounts.position;
    let auth = &mut ctx.accounts.agent_authority;

    // -- Step 1: Replay Protection & Delegation Checks --
    require!(auth.nonce == intent_nonce, CircuitError::ActionNonceInvalid);
    require!(!auth.is_expired(clock.unix_timestamp), CircuitError::AgentAuthorityExpired);
    require!(auth.owner == ctx.accounts.owner.key(), CircuitError::InvalidAgentOwner);
    require!(auth.agent == ctx.accounts.agent.key(), CircuitError::AgentAuthorityUnauthorized);
    require!(auth.asset_mint == asset.mint, CircuitError::InvalidAsset);
    require!(position.owner == auth.owner, CircuitError::InvalidPositionOwner);
    require!(position.asset == asset.mint, CircuitError::InvalidAsset);

    // -- Step 2: Protocol Status --
    if action == AgentAction::Borrow || action == AgentAction::Withdraw {
        require!(!protocol.paused, CircuitError::ProtocolPaused);
    }
    require!(asset.enabled, CircuitError::AssetDisabled);

    // -- Step 3: Action Bitmask Authorization --
    let action_flag = match action {
        AgentAction::Deposit => ACTION_DEPOSIT,
        AgentAction::Borrow => ACTION_BORROW,
        AgentAction::Repay => ACTION_REPAY,
        AgentAction::Withdraw => ACTION_WITHDRAW,
    };
    require!(auth.is_action_allowed(action_flag), CircuitError::AgentActionNotPermitted);

    // -- Step 4: Oracle Price & Market Session Validation --
    let validated_price = oracle::validate_pyth_price(
        &ctx.accounts.price_update,
        &asset.pyth_feed_id,
        asset.max_oracle_age,
        asset.max_conf_bps,
        &clock,
    )?;

    let market_open = market::is_market_open(clock.unix_timestamp)?;
    let conf_ratio_bps = math::calculate_confidence_ratio_bps(validated_price.price, validated_price.conf)?;

    let oracle_age = clock.unix_timestamp.saturating_sub(validated_price.publish_time) as u64;

    // -- Step 5: Derive Real-Time Risk State & Authoritative Capital Policy --
    let breakdown = crate::risk::RiskScoreBreakdown::compute(
        market_open,
        conf_ratio_bps,
        oracle_age,
        asset.max_oracle_age,
        asset.custody_state,
        asset.liquidity_state,
    );
    let instant_risk_state = crate::risk::RatchetHysteresisConfig::candidate_state_from_score(breakdown.composite_score);

    let effective_risk_state = if RiskRatchet::severity(instant_risk_state) > RiskRatchet::severity(ratchet.state) {
        instant_risk_state
    } else {
        ratchet.state
    };

    let policy = crate::risk::CapitalPolicyEngine::derive_policy(
        effective_risk_state,
        asset.base_ltv_bps,
        position.has_debt(),
        ratchet.risk_epoch,
        clock.unix_timestamp,
    );

    // Collateral valuation
    let collateral_value = math::calculate_collateral_value(
        position.collateral_amount,
        validated_price.price,
        validated_price.expo,
        ctx.accounts.collateral_mint.decimals,
        ctx.accounts.quote_mint.decimals,
    )?;

    // -- Step 6: Evaluate Canonical Permission Engine (Agent Delegated Path) --
    let perm = crate::permissions::evaluate_permission(
        &ctx.accounts.agent.key(),
        action.into(),
        &asset.mint,
        amount,
        &position.owner,
        position.has_debt(),
        collateral_value,
        position.debt_amount,
        &policy,
        Some(auth),
        clock.unix_timestamp,
    )?;

    if !perm.allowed {
        emit!(crate::events::ActionDenied {
            position: position.key(),
            action,
            amount,
            risk_state: effective_risk_state,
            denial_reason: perm.denial_reason,
            epoch: ratchet.risk_epoch,
            timestamp: clock.unix_timestamp,
        });

        match perm.denial_reason {
            PermissionDenialReason::RiskEmergency => return err!(CircuitError::RiskEmergency),
            PermissionDenialReason::RiskDefensive => return err!(CircuitError::RiskDefensive),
            PermissionDenialReason::RiskRestricted => return err!(CircuitError::RiskRestricted),
            PermissionDenialReason::AgentAuthorityExpired => return err!(CircuitError::AgentAuthorityExpired),
            PermissionDenialReason::AgentActionNotPermitted => return err!(CircuitError::AgentActionNotPermitted),
            PermissionDenialReason::AgentBorrowLimitExceeded => return err!(CircuitError::AgentBorrowLimitExceeded),
            PermissionDenialReason::AgentWithdrawLimitExceeded => return err!(CircuitError::AgentWithdrawLimitExceeded),
            PermissionDenialReason::EffectiveLtvExceeded => return err!(CircuitError::BorrowExceedsCapacity),
            PermissionDenialReason::InsufficientRiskBudget => return err!(CircuitError::InsufficientRiskBudget),
            PermissionDenialReason::AssetDisabled => return err!(CircuitError::AssetScopeViolation),
            _ => return err!(CircuitError::CapitalPolicyBlocked),
        }
    }

    // -- Step 7: Action Risk Cost & Budget Evaluation --
    let old_budget = auth.risk_budget;
    let seeds = &[ProtocolConfig::SEEDS, &[protocol.bump]];
    let signer_seeds = &[&seeds[..]];

    match action {
        AgentAction::Borrow => {
            // Compute risk cost C(a)
            let risk_cost = math::calculate_action_risk_cost(
                action,
                amount,
                conf_ratio_bps,
                effective_risk_state,
            )?;
            auth.consume_risk_budget(risk_cost)?;
            auth.current_borrowed = auth.current_borrowed.checked_add(amount).ok_or(CircuitError::MathOverflow)?;

            // Apply effective LTV cap
            let max_borrow = CapitalPolicy::calculate_borrow_capacity(collateral_value as u64, policy.effective_ltv_bps) as u128;
            let new_debt = (position.debt_amount as u128)
                .checked_add(amount as u128)
                .ok_or(CircuitError::MathOverflow)?;

            if new_debt > max_borrow {
                emit!(crate::events::ActionDenied {
                    position: position.key(),
                    action,
                    amount,
                    risk_state: effective_risk_state,
                    denial_reason: PermissionDenialReason::EffectiveLtvExceeded,
                    epoch: ratchet.risk_epoch,
                    timestamp: clock.unix_timestamp,
                });
                return err!(CircuitError::BorrowExceedsCapacity);
            }

            // Health factor constraint
            let hf = math::calculate_health_factor(
                collateral_value,
                asset.liquidation_threshold_bps,
                new_debt as u64,
            )?;
            require!(hf >= protocol.min_health_factor_bps, CircuitError::HealthFactorTooLow);

            // Check liquidity vault
            require!(ctx.accounts.liquidity_vault.amount >= amount, CircuitError::InsufficientLiquidity);

            // Disburse quote tokens
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

            position.debt_amount = new_debt as u64;

            emit!(crate::events::ActionAllowed {
                position: position.key(),
                action,
                amount,
                risk_cost,
                remaining_budget: auth.risk_budget,
                risk_state: effective_risk_state,
                timestamp: clock.unix_timestamp,
            });
        }

        AgentAction::Withdraw => {
            // Check capital policy
            if !policy.withdraw_allowed && position.has_debt() {
                emit!(crate::events::ActionDenied {
                    position: position.key(),
                    action,
                    amount,
                    risk_state: effective_risk_state,
                    denial_reason: PermissionDenialReason::WithdrawNotPermitted,
                    epoch: ratchet.risk_epoch,
                    timestamp: clock.unix_timestamp,
                });
                return err!(CircuitError::WithdrawRestrictedInStress);
            }

            require!(amount <= auth.max_withdraw_limit, CircuitError::AgentWithdrawLimitExceeded);
            require!(amount <= position.collateral_amount, CircuitError::WithdrawExceedsCollateral);

            // Calculate withdrawn value in quote terms for risk cost
            let withdrawn_val = math::calculate_collateral_value(
                amount,
                validated_price.price,
                validated_price.expo,
                ctx.accounts.collateral_mint.decimals,
                ctx.accounts.quote_mint.decimals,
            )?;

            let risk_cost = math::calculate_action_risk_cost(
                action,
                withdrawn_val as u64,
                conf_ratio_bps,
                effective_risk_state,
            )?;
            auth.consume_risk_budget(risk_cost)?;

            // If outstanding debt exists, ensure position remains healthy and under effective LTV
            let remaining_collateral = position.collateral_amount - amount;
            if position.has_debt() {
                let remaining_val = math::calculate_collateral_value(
                    remaining_collateral,
                    validated_price.price,
                    validated_price.expo,
                    ctx.accounts.collateral_mint.decimals,
                    ctx.accounts.quote_mint.decimals,
                )?;

                let max_borrow = CapitalPolicy::calculate_borrow_capacity(remaining_val as u64, policy.effective_ltv_bps);
                require!(position.debt_amount <= max_borrow, CircuitError::EffectiveLtvExceeded);

                let hf = math::calculate_health_factor(
                    remaining_val,
                    asset.liquidation_threshold_bps,
                    position.debt_amount,
                )?;
                require!(hf >= protocol.min_health_factor_bps, CircuitError::HealthFactorTooLow);
            }

            // Transfer collateral from vault
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

            position.collateral_amount = remaining_collateral;

            emit!(crate::events::ActionAllowed {
                position: position.key(),
                action,
                amount,
                risk_cost,
                remaining_budget: auth.risk_budget,
                risk_state: effective_risk_state,
                timestamp: clock.unix_timestamp,
            });
        }

        AgentAction::Repay => {
            let actual_repay = amount.min(position.debt_amount);
            require!(actual_repay > 0, CircuitError::RepayExceedsDebt);

            // Transfer quote tokens from agent to liquidity vault
            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.key(),
                    Transfer {
                        from: ctx.accounts.user_quote_ata.to_account_info(),
                        to: ctx.accounts.liquidity_vault.to_account_info(),
                        authority: ctx.accounts.agent.to_account_info(),
                    },
                ),
                actual_repay,
            )?;

            position.debt_amount = position.debt_amount.saturating_sub(actual_repay);
            auth.current_borrowed = auth.current_borrowed.saturating_sub(actual_repay);
            auth.restore_risk_budget(actual_repay);

            emit!(crate::events::ActionAllowed {
                position: position.key(),
                action,
                amount: actual_repay,
                risk_cost: 0,
                remaining_budget: auth.risk_budget,
                risk_state: effective_risk_state,
                timestamp: clock.unix_timestamp,
            });
        }

        AgentAction::Deposit => {
            // Transfer collateral tokens from agent to collateral vault
            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.key(),
                    Transfer {
                        from: ctx.accounts.user_collateral_ata.to_account_info(),
                        to: ctx.accounts.collateral_vault.to_account_info(),
                        authority: ctx.accounts.agent.to_account_info(),
                    },
                ),
                amount,
            )?;

            position.collateral_amount = position.collateral_amount
                .checked_add(amount)
                .ok_or(CircuitError::MathOverflow)?;

            // Replenish risk budget proportional to added borrowing capacity
            let deposit_val = math::calculate_collateral_value(
                amount,
                validated_price.price,
                validated_price.expo,
                ctx.accounts.collateral_mint.decimals,
                ctx.accounts.quote_mint.decimals,
            )?;
            let budget_gain = ((deposit_val as u128) * (asset.base_ltv_bps as u128) / 10_000) as u64;
            auth.restore_risk_budget(budget_gain);

            emit!(crate::events::ActionAllowed {
                position: position.key(),
                action,
                amount,
                risk_cost: 0,
                remaining_budget: auth.risk_budget,
                risk_state: effective_risk_state,
                timestamp: clock.unix_timestamp,
            });
        }
    }

    // Step 7: Increment nonce and emit budget change if altered
    auth.increment_nonce()?;

    if auth.risk_budget != old_budget {
        emit!(crate::events::RiskBudgetChanged {
            authority: auth.key(),
            old_budget,
            new_budget: auth.risk_budget,
            action,
            timestamp: clock.unix_timestamp,
        });
    }

    Ok(())
}

#[derive(Accounts)]
pub struct ExecuteAgentAction<'info> {
    /// The autonomous agent signer executing this action
    #[account(mut)]
    pub agent: Signer<'info>,

    /// The position owner who delegated authority
    /// CHECK: Validated against position.owner and agent_authority.owner
    pub owner: SystemAccount<'info>,

    #[account(
        seeds = [ProtocolConfig::SEEDS],
        bump = protocol_config.bump,
    )]
    pub protocol_config: Box<Account<'info, ProtocolConfig>>,

    #[account(
        seeds = [AssetConfig::SEEDS_PREFIX, asset_config.mint.as_ref()],
        bump = asset_config.bump,
    )]
    pub asset_config: Box<Account<'info, AssetConfig>>,

    #[account(
        mut,
        seeds = [RiskRatchet::SEEDS_PREFIX, &asset_config.pyth_feed_id],
        bump = risk_ratchet.bump,
    )]
    pub risk_ratchet: Box<Account<'info, RiskRatchet>>,

    #[account(
        mut,
        seeds = [Position::SEEDS_PREFIX, owner.key().as_ref(), asset_config.mint.as_ref()],
        bump = position.bump,
    )]
    pub position: Box<Account<'info, Position>>,

    #[account(
        mut,
        seeds = [
            AgentAuthority::SEEDS_PREFIX,
            owner.key().as_ref(),
            agent.key().as_ref(),
            asset_config.mint.as_ref(),
        ],
        bump = agent_authority.bump,
        has_one = owner,
        has_one = agent,
    )]
    pub agent_authority: Box<Account<'info, AgentAuthority>>,

    /// Protocol collateral vault ATA
    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = protocol_config,
    )]
    pub collateral_vault: Box<Account<'info, TokenAccount>>,

    /// Protocol liquidity vault ATA
    #[account(
        mut,
        associated_token::mint = quote_mint,
        associated_token::authority = protocol_config,
    )]
    pub liquidity_vault: Box<Account<'info, TokenAccount>>,

    /// User / agent token account for collateral
    #[account(
        mut,
        token::mint = collateral_mint,
    )]
    pub user_collateral_ata: Box<Account<'info, TokenAccount>>,

    /// User / agent token account for quote currency
    #[account(
        mut,
        token::mint = quote_mint,
    )]
    pub user_quote_ata: Box<Account<'info, TokenAccount>>,

    pub collateral_mint: Box<Account<'info, Mint>>,
    pub quote_mint: Box<Account<'info, Mint>>,

    /// Pyth PriceUpdateV2 account
    pub price_update: Box<Account<'info, PriceUpdateV2>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

