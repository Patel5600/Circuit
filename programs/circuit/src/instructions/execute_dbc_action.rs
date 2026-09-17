use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Mint};
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;
use crate::state::*;
use crate::state::agent_authority::AgentAuthority;
use crate::state::asset_registry::AssetRegistryEntry;
use crate::permissions::actions::CircuitAction;
use crate::errors::CircuitError;
use crate::oracle;
use crate::market;
use crate::math;
use anchor_lang::solana_program::{
    instruction::Instruction,
    program::invoke,
};

/// Verified Meteora Dynamic Bonding Curve Program ID (Mainnet & Devnet)
pub const METEORA_DBC_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
    0xba, 0x51, 0x1a, 0x05, 0x04, 0x82, 0xd0, 0x47, 0x93, 0x48, 0x6e, 0x56, 0x3d, 0x47, 0x4f, 0x86,
    0xa0, 0x1f, 0x5f, 0x8a, 0xec, 0x59, 0xb8, 0x36, 0x50, 0xb8, 0xc1, 0xf6, 0x41, 0xe5, 0x3a, 0x4b,
]); // dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN

/// Verified Meteora DBC Pool Authority PDA
pub const METEORA_DBC_POOL_AUTHORITY: Pubkey = Pubkey::new_from_array([
    0xd9, 0x8f, 0x4b, 0x76, 0x44, 0xeb, 0x59, 0x54, 0x32, 0x98, 0x5c, 0xb0, 0xa5, 0xb3, 0xc1, 0x22,
    0x29, 0x5b, 0x41, 0xf7, 0x13, 0x16, 0x90, 0x98, 0x0a, 0x02, 0xa7, 0xf7, 0xb8, 0x9e, 0x5c, 0xc7,
]); // FhVo3mqL8PW5pH5U2CN4XE33DokiyZnUwuGpH2hmHLuM

/// Executes or authorizes an action on Meteora Dynamic Bonding Curve (DBC)
/// strictly governed by Circuit's canonical Risk Ratchet and Permission Engine.
///
/// CRITICAL ARCHITECTURAL CONSTRAINTS (Sections 13, 14, 15, 18, 19):
/// 1. Meteora DBC is an execution venue, NOT the Risk Engine.
/// 2. Circuit Permission Engine is the SOLE authority.
/// 3. Human and Agent share the exact same canonical risk evaluation path.
/// 4. Asset identity and pool address are verified against on-chain AssetRegistryEntry.
/// 5. Execution is ATOMIC: if permission or risk bounds fail, entire transaction reverts.
pub fn handler<'info>(
    ctx: Context<'info, ExecuteDbcAction<'info>>,
    action_type: u8,
    amount_in: u64,
    min_amount_out: u64,
    intent_nonce: u64,
    dbc_instruction_data: Vec<u8>,
) -> Result<()> {
    require!(amount_in > 0, CircuitError::InsufficientCollateral);
    require!(min_amount_out > 0, CircuitError::DbcSlippageExceeded);

    let clock = Clock::get()?;
    let protocol = &ctx.accounts.protocol_config;
    let asset = &ctx.accounts.asset_config;
    let ratchet = &ctx.accounts.risk_ratchet;
    let registry = &ctx.accounts.asset_registry;

    // -- Step 1: Protocol & Asset State Gates --
    require!(!protocol.paused, CircuitError::ProtocolPaused);
    require!(asset.enabled, CircuitError::AssetDisabled);
    require!(registry.is_active(), CircuitError::AssetDisabled);
    require!(registry.mint == asset.mint, CircuitError::InvalidAsset);
    require!(
        registry.assert_valid_dbc_pool(&ctx.accounts.dbc_pool.key()),
        CircuitError::InvalidDbcPool
    );

    // Verify Meteora DBC program ID matches canonical deployment
    require!(
        ctx.accounts.dbc_program.key() == METEORA_DBC_PROGRAM_ID,
        CircuitError::Unauthorized
    );

    // -- Step 2: Oracle Price & Market Session Validation --
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

    // -- Step 3: Derive Dynamic Risk State & Capital Policy --
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
        false,
        ratchet.risk_epoch,
        clock.unix_timestamp,
    );

    // -- Step 4: Map Action Type to CircuitAction --
    let action = match action_type {
        0 => CircuitAction::Swap,
        1 => CircuitAction::EnterLiquidity,
        2 => CircuitAction::ExitLiquidity,
        3 => CircuitAction::Rebalance,
        _ => return err!(CircuitError::AgentActionNotPermitted),
    };

    // Calculate valuation
    let collateral_value = math::calculate_collateral_value(
        amount_in,
        validated_price.price,
        validated_price.expo,
        ctx.accounts.base_mint.decimals,
        ctx.accounts.quote_mint.decimals,
    )?;

    // -- Step 5: Authority & Permission Engine Gate --
    let is_owner = ctx.accounts.actor.key() == ctx.accounts.owner.key();
    let mut risk_cost = 0u64;

    if is_owner {
        // Sovereign human path: evaluated against protocol policy and capacity
        let perm = crate::permissions::evaluate_permission(
            &ctx.accounts.actor.key(),
            action,
            &asset.mint,
            amount_in,
            &ctx.accounts.owner.key(),
            false,
            collateral_value,
            0,
            &policy,
            None,
            clock.unix_timestamp,
        )?;

        if !perm.allowed {
            emit!(crate::events::DbcActionDenied {
                actor: ctx.accounts.actor.key(),
                owner: ctx.accounts.owner.key(),
                asset_mint: asset.mint,
                dbc_pool: ctx.accounts.dbc_pool.key(),
                action_type,
                amount_in,
                risk_state: effective_risk_state,
                denial_reason: perm.denial_reason,
                timestamp: clock.unix_timestamp,
            });
            match perm.denial_reason {
                crate::state::enums::PermissionDenialReason::RiskEmergency => return err!(CircuitError::RiskEmergency),
                crate::state::enums::PermissionDenialReason::RiskDefensive => return err!(CircuitError::RiskDefensive),
                crate::state::enums::PermissionDenialReason::RiskRestricted => return err!(CircuitError::RiskRestricted),
                _ => return err!(CircuitError::DbcActionBlocked),
            }
        }
    } else {
        // Delegated agent path: requires valid AgentAuthority PDA
        let auth = ctx.accounts.agent_authority.as_mut()
            .ok_or(CircuitError::AgentAuthorityUnauthorized)?;

        require!(auth.agent == ctx.accounts.actor.key(), CircuitError::AgentAuthorityUnauthorized);
        require!(auth.owner == ctx.accounts.owner.key(), CircuitError::InvalidAgentOwner);
        require!(auth.asset_mint == asset.mint, CircuitError::AssetScopeViolation);
        require!(auth.nonce == intent_nonce, CircuitError::ActionNonceInvalid);
        require!(auth.is_active(clock.unix_timestamp), CircuitError::AgentAuthorityExpired);

        let perm = crate::permissions::evaluate_permission(
            &ctx.accounts.actor.key(),
            action,
            &asset.mint,
            amount_in,
            &ctx.accounts.owner.key(),
            false,
            collateral_value,
            0,
            &policy,
            Some(auth),
            clock.unix_timestamp,
        )?;

        if !perm.allowed {
            emit!(crate::events::DbcActionDenied {
                actor: ctx.accounts.actor.key(),
                owner: ctx.accounts.owner.key(),
                asset_mint: asset.mint,
                dbc_pool: ctx.accounts.dbc_pool.key(),
                action_type,
                amount_in,
                risk_state: effective_risk_state,
                denial_reason: perm.denial_reason,
                timestamp: clock.unix_timestamp,
            });
            match perm.denial_reason {
                crate::state::enums::PermissionDenialReason::RiskEmergency => return err!(CircuitError::RiskEmergency),
                crate::state::enums::PermissionDenialReason::RiskDefensive => return err!(CircuitError::RiskDefensive),
                crate::state::enums::PermissionDenialReason::RiskRestricted => return err!(CircuitError::RiskRestricted),
                crate::state::enums::PermissionDenialReason::AgentAuthorityExpired => return err!(CircuitError::AgentAuthorityExpired),
                crate::state::enums::PermissionDenialReason::AgentActionNotPermitted => return err!(CircuitError::AgentActionNotPermitted),
                crate::state::enums::PermissionDenialReason::InsufficientRiskBudget => return err!(CircuitError::InsufficientRiskBudget),
                _ => return err!(CircuitError::DbcActionBlocked),
            }
        }

        // Consume dynamic risk budget for risk-increasing actions
        if action.is_risk_increasing() {
            risk_cost = math::calculate_action_risk_cost(
                crate::state::enums::AgentAction::Borrow,
                amount_in,
                conf_ratio_bps,
                effective_risk_state,
            )?;
            auth.consume_risk_budget(risk_cost)?;
        }

        auth.increment_nonce()?;
    }

    // -- Step 6: Atomic Cross-Program Invocation (CPI) into Meteora DBC --
    if !dbc_instruction_data.is_empty() {
        let mut account_metas = Vec::with_capacity(ctx.remaining_accounts.len() + 4);
        account_metas.push(AccountMeta::new(ctx.accounts.dbc_pool.key(), false));
        account_metas.push(AccountMeta::new(ctx.accounts.user_source_ata.key(), false));
        account_metas.push(AccountMeta::new(ctx.accounts.user_destination_ata.key(), false));
        account_metas.push(AccountMeta::new_readonly(ctx.accounts.actor.key(), true));

        for acc in ctx.remaining_accounts.iter() {
            account_metas.push(if acc.is_writable {
                AccountMeta::new(acc.key(), acc.is_signer)
            } else {
                AccountMeta::new_readonly(acc.key(), acc.is_signer)
            });
        }

        let mut account_infos = Vec::with_capacity(ctx.remaining_accounts.len() + 5);
        account_infos.push(ctx.accounts.dbc_pool.to_account_info());
        account_infos.push(ctx.accounts.user_source_ata.to_account_info());
        account_infos.push(ctx.accounts.user_destination_ata.to_account_info());
        account_infos.push(ctx.accounts.actor.to_account_info());
        account_infos.push(ctx.accounts.dbc_program.to_account_info());
        account_infos.extend_from_slice(ctx.remaining_accounts);

        let ix = Instruction {
            program_id: ctx.accounts.dbc_program.key(),
            accounts: account_metas,
            data: dbc_instruction_data,
        };

        invoke(&ix, &account_infos)?;
    }

    emit!(crate::events::DbcActionExecuted {
        actor: ctx.accounts.actor.key(),
        owner: ctx.accounts.owner.key(),
        asset_mint: asset.mint,
        dbc_pool: ctx.accounts.dbc_pool.key(),
        action_type,
        amount_in,
        min_amount_out,
        risk_state: effective_risk_state,
        risk_cost,
        timestamp: clock.unix_timestamp,
    });

    msg!(
        "DBC Action Executed: action={} amount_in={} min_out={} state={:?}",
        action_type, amount_in, min_amount_out, effective_risk_state
    );

    Ok(())
}

#[derive(Accounts)]
pub struct ExecuteDbcAction<'info> {
    /// The executing signer (either human owner or delegated agent)
    #[account(mut)]
    pub actor: Signer<'info>,

    /// The capital owner delegating authority
    /// CHECK: Validated against actor or agent_authority.owner
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

    /// Authoritative on-chain registry entry binding asset to its Meteora DBC pool
    #[account(
        seeds = [AssetRegistryEntry::SEEDS_PREFIX, asset_config.mint.as_ref()],
        bump = asset_registry.bump,
    )]
    pub asset_registry: Box<Account<'info, AssetRegistryEntry>>,

    /// Optional AgentAuthority PDA (required when actor != owner)
    #[account(
        mut,
        seeds = [
            AgentAuthority::SEEDS_PREFIX,
            owner.key().as_ref(),
            actor.key().as_ref(),
            asset_config.mint.as_ref(),
        ],
        bump = agent_authority.bump,
    )]
    pub agent_authority: Option<Box<Account<'info, AgentAuthority>>>,

    /// Verified Meteora Dynamic Bonding Curve pool account
    /// CHECK: Validated against asset_registry.dbc_pool
    #[account(mut)]
    pub dbc_pool: UncheckedAccount<'info>,

    /// Meteora Dynamic Bonding Curve Program ID
    /// CHECK: Validated against METEORA_DBC_PROGRAM_ID
    pub dbc_program: UncheckedAccount<'info>,

    /// Pyth PriceUpdateV2 oracle account
    pub price_update: Box<Account<'info, PriceUpdateV2>>,

    pub base_mint: Box<Account<'info, Mint>>,
    pub quote_mint: Box<Account<'info, Mint>>,

    /// User's source token account (input to DBC)
    #[account(mut)]
    pub user_source_ata: Box<Account<'info, TokenAccount>>,

    /// User's destination token account (output from DBC)
    #[account(mut)]
    pub user_destination_ata: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
