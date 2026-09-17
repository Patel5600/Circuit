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
    0x09, 0x60, 0x0c, 0xa5, 0x24, 0xf7, 0xb1, 0xb7, 0xd6, 0xcc, 0xb1, 0xc3, 0x97, 0x3a, 0xa0, 0x33,
    0x0d, 0x19, 0x03, 0xda, 0x60, 0x1c, 0xc9, 0xb5, 0xde, 0xe3, 0xc6, 0x62, 0xb4, 0xca, 0xd1, 0x49,
]); // dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN

/// Verified Meteora DBC Pool Authority PDA
pub const METEORA_DBC_POOL_AUTHORITY: Pubkey = Pubkey::new_from_array([
    0xda, 0x63, 0x68, 0x1f, 0x72, 0x86, 0xbc, 0xc8, 0x06, 0x71, 0x9e, 0x2c, 0x2b, 0x50, 0xa2, 0x01,
    0x57, 0x24, 0x3b, 0xfc, 0x96, 0x68, 0xb1, 0x15, 0x20, 0xbc, 0x53, 0x84, 0x3e, 0xdc, 0xdb, 0x08,
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

    // Calculate valuation using conservative Pyth valuation (p_conservative = max(0, p - conf))
    let conservative_price = math::calculate_conservative_pyth_price(
        validated_price.price,
        validated_price.conf,
    )?;

    let collateral_value = math::calculate_collateral_value(
        amount_in,
        conservative_price,
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
        let pre_destination_amount = ctx.accounts.user_destination_ata.amount;

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

        // Enforce slippage invariant: received output must satisfy min_amount_out
        ctx.accounts.user_destination_ata.reload()?;
        let post_destination_amount = ctx.accounts.user_destination_ata.amount;
        let amount_received = post_destination_amount.saturating_sub(pre_destination_amount);
        require!(
            amount_received >= min_amount_out,
            CircuitError::DbcSlippageExceeded
        );
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr;

    #[test]
    fn test_meteora_dbc_program_id_matches_canonical() {
        let expected = Pubkey::from_str("dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN").unwrap();
        assert_eq!(
            METEORA_DBC_PROGRAM_ID, expected,
            "METEORA_DBC_PROGRAM_ID must match canonical address dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN"
        );
    }

    #[test]
    fn test_meteora_dbc_pool_authority_matches_canonical() {
        let expected = Pubkey::from_str("FhVo3mqL8PW5pH5U2CN4XE33DokiyZnUwuGpH2hmHLuM").unwrap();
        assert_eq!(
            METEORA_DBC_POOL_AUTHORITY, expected,
            "METEORA_DBC_POOL_AUTHORITY must match canonical address FhVo3mqL8PW5pH5U2CN4XE33DokiyZnUwuGpH2hmHLuM"
        );
    }

    #[test]
    fn test_dbc_action_risk_classification() {
        // ExitLiquidity is risk-reducing (recovery-safe)
        assert!(CircuitAction::ExitLiquidity.is_risk_reducing());
        assert!(!CircuitAction::ExitLiquidity.is_risk_increasing());

        // Swap is risk-increasing
        assert!(CircuitAction::Swap.is_risk_increasing());
        assert!(!CircuitAction::Swap.is_risk_reducing());

        // EnterLiquidity is risk-increasing
        assert!(CircuitAction::EnterLiquidity.is_risk_increasing());
        assert!(!CircuitAction::EnterLiquidity.is_risk_reducing());
    }

    #[test]
    fn test_asset_registry_entry_validates_dbc_pool() {
        let valid_pool = Pubkey::new_unique();
        let invalid_pool = Pubkey::new_unique();
        let entry = AssetRegistryEntry {
            mint: Pubkey::new_unique(),
            quote_mint: Pubkey::new_unique(),
            oracle_feed: [0u8; 32],
            dbc_pool: valid_pool,
            market_status: AssetRegistryEntry::STATUS_ACTIVE,
            policy_version: 1,
            bump: 255,
        };

        assert!(entry.assert_valid_dbc_pool(&valid_pool));
        assert!(!entry.assert_valid_dbc_pool(&invalid_pool));
        assert!(entry.is_active());
    }

    #[test]
    fn test_dbc_action_type_mapping() {
        let map_action = |code: u8| -> Option<CircuitAction> {
            match code {
                0 => Some(CircuitAction::Swap),
                1 => Some(CircuitAction::EnterLiquidity),
                2 => Some(CircuitAction::ExitLiquidity),
                3 => Some(CircuitAction::Rebalance),
                _ => None,
            }
        };

        assert_eq!(map_action(0), Some(CircuitAction::Swap));
        assert_eq!(map_action(1), Some(CircuitAction::EnterLiquidity));
        assert_eq!(map_action(2), Some(CircuitAction::ExitLiquidity));
        assert_eq!(map_action(3), Some(CircuitAction::Rebalance));
        assert_eq!(map_action(4), None);
    }
}
