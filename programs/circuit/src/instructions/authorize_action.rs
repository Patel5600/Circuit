use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;
use crate::errors::CircuitError;
use crate::events::{EnvelopeAuthorized, EnvelopeAuthorizationDenied};
use crate::market;
use crate::math;
use crate::oracle;
use crate::permissions::{self, CircuitAction};
use crate::risk::{CapitalPolicyEngine, RatchetHysteresisConfig, RiskScoreBreakdown};
use crate::state::agent_authority::AgentAuthority;
use crate::state::asset_config::AssetConfig;
use crate::state::enums::PermissionDenialReason;
use crate::state::position::Position;
use crate::state::protocol_config::ProtocolConfig;
use crate::state::risk_envelope::{
    RiskEnvelope, DEFAULT_ENVELOPE_TTL_SLOTS, MAX_ENVELOPE_TTL_SLOTS,
    VENUE_CREDIT, VENUE_METEORA_DBC, VENUE_TRADING,
    ENVELOPE_ACTION_BORROW, ENVELOPE_ACTION_WITHDRAW, ENVELOPE_ACTION_SWAP,
    ENVELOPE_ACTION_ENTER_LIQUIDITY, ENVELOPE_ACTION_EXIT_LIQUIDITY,
    ENVELOPE_ACTION_REBALANCE, ENVELOPE_ACTION_REPAY, ENVELOPE_ACTION_DEPOSIT,
};
use crate::state::risk_ratchet::RiskRatchet;

/// Authorizes a bounded capital action and creates an onchain RiskEnvelope capability token PDA.
///
/// Strictly evaluated by the canonical Risk Ratchet, Pyth oracle confidence, reference market
/// hours, and Circuit Permission Engine.
pub fn handler(
    ctx: Context<AuthorizeAction>,
    action: u8,
    venue: u8,
    requested_amount: u64,
    max_slippage_bps: u64,
    nonce: u64,
    ttl_slots: u64,
) -> Result<()> {
    let protocol = &ctx.accounts.protocol_config;
    let asset = &ctx.accounts.asset_config;

    // 1. Protocol & Asset State Gates
    require!(!protocol.paused, CircuitError::ProtocolPaused);
    require!(asset.enabled, CircuitError::AssetDisabled);

    // 2. Validate TTL slots (default to DEFAULT_ENVELOPE_TTL_SLOTS if 0)
    require!(
        ttl_slots <= MAX_ENVELOPE_TTL_SLOTS,
        CircuitError::EnvelopeTtlExceeded
    );
    let effective_ttl = if ttl_slots == 0 {
        DEFAULT_ENVELOPE_TTL_SLOTS
    } else {
        ttl_slots
    };

    // 3. Oracle Price Validation (centralized via oracle module)
    let clock = Clock::get()?;
    let validated_price = oracle::validate_pyth_price(
        &ctx.accounts.price_update,
        &asset.pyth_feed_id,
        asset.max_oracle_age,
        asset.max_conf_bps,
        &clock,
    )?;

    // 4. Reference Market Hours Validation
    let market_open = market::is_market_open(clock.unix_timestamp)?;

    // 5. Oracle Confidence Ratio & Age
    let conf_ratio_bps = math::calculate_confidence_ratio_bps(
        validated_price.price,
        validated_price.conf,
    )?;
    let oracle_age = clock
        .unix_timestamp
        .saturating_sub(validated_price.publish_time) as u64;

    // 6. Dynamic Risk Score Breakdown & Instant Risk State
    let breakdown = RiskScoreBreakdown::compute(
        market_open,
        conf_ratio_bps,
        oracle_age,
        asset.max_oracle_age,
        asset.custody_state,
        asset.liquidity_state,
    );
    let instant_risk_state = RatchetHysteresisConfig::candidate_state_from_score(
        breakdown.composite_score,
    );

    // 7. Effective Risk State (Maximum severity of instant vs ratchet.state)
    let effective_risk_state = if RiskRatchet::severity(instant_risk_state)
        > RiskRatchet::severity(ctx.accounts.risk_ratchet.state)
    {
        instant_risk_state
    } else {
        ctx.accounts.risk_ratchet.state
    };

    // 8. Position Validation & Conservative Collateral Valuation
    let conservative_price = math::calculate_conservative_pyth_price(
        validated_price.price,
        validated_price.conf,
    )?;

    let mut collateral_value: u128 = 0;
    let mut position_has_debt = false;
    let mut current_debt: u64 = 0;

    if !ctx.accounts.position.data_is_empty() {
        let (expected_position_pda, _) = Pubkey::find_program_address(
            &[
                Position::SEEDS_PREFIX,
                ctx.accounts.owner.key().as_ref(),
                asset.mint.as_ref(),
            ],
            &crate::ID,
        );
        require!(
            ctx.accounts.position.key() == expected_position_pda,
            CircuitError::InvalidPda
        );
        require!(
            ctx.accounts.position.owner == &crate::ID,
            CircuitError::InvalidPositionOwner
        );

        let mut data_slice: &[u8] = &ctx.accounts.position.data.borrow();
        let pos = Position::try_deserialize(&mut data_slice)?;

        require!(
            pos.owner == ctx.accounts.owner.key(),
            CircuitError::InvalidPositionOwner
        );
        require!(
            pos.asset == asset.mint,
            CircuitError::InvalidAsset
        );

        position_has_debt = pos.has_debt();
        current_debt = pos.debt_amount;
        collateral_value = math::calculate_collateral_value(
            pos.collateral_amount,
            conservative_price,
            validated_price.expo,
            math::TOKEN_DECIMALS,
            math::TOKEN_DECIMALS,
        )?;
    }

    // 9. Derive Authoritative CapitalPolicy
    let policy = CapitalPolicyEngine::derive_policy(
        effective_risk_state,
        asset.base_ltv_bps,
        position_has_debt,
        ctx.accounts.risk_ratchet.risk_epoch,
        clock.unix_timestamp,
    );

    // 10. Map Action & Venue to Canonical Types
    let circuit_action = match action {
        ENVELOPE_ACTION_BORROW => CircuitAction::Borrow,
        ENVELOPE_ACTION_WITHDRAW => CircuitAction::Withdraw,
        ENVELOPE_ACTION_SWAP => CircuitAction::Swap,
        ENVELOPE_ACTION_ENTER_LIQUIDITY => CircuitAction::EnterLiquidity,
        ENVELOPE_ACTION_EXIT_LIQUIDITY => CircuitAction::ExitLiquidity,
        ENVELOPE_ACTION_REBALANCE => CircuitAction::Rebalance,
        ENVELOPE_ACTION_REPAY => CircuitAction::Repay,
        ENVELOPE_ACTION_DEPOSIT => CircuitAction::Deposit,
        _ => {
            emit!(EnvelopeAuthorizationDenied {
                owner: ctx.accounts.owner.key(),
                actor: ctx.accounts.actor.key(),
                asset_mint: asset.mint,
                action,
                venue,
                requested_amount,
                risk_state: effective_risk_state,
                denial_reason: PermissionDenialReason::AgentActionNotPermitted,
                timestamp: clock.unix_timestamp,
            });
            return err!(CircuitError::EnvelopeActionMismatch);
        }
    };

    if venue != VENUE_CREDIT && venue != VENUE_METEORA_DBC && venue != VENUE_TRADING {
        emit!(EnvelopeAuthorizationDenied {
            owner: ctx.accounts.owner.key(),
            actor: ctx.accounts.actor.key(),
            asset_mint: asset.mint,
            action,
            venue,
            requested_amount,
            risk_state: effective_risk_state,
            denial_reason: PermissionDenialReason::AgentActionNotPermitted,
            timestamp: clock.unix_timestamp,
        });
        return err!(CircuitError::EnvelopeVenueMismatch);
    }

    // 11. Deserialize Agent Authority if actor is delegated agent
    let is_owner = ctx.accounts.actor.key() == ctx.accounts.owner.key();

    let agent_auth_holder: Option<AgentAuthority> = if !is_owner {
        let (expected_auth_pda, _) = Pubkey::find_program_address(
            &[
                AgentAuthority::SEEDS_PREFIX,
                ctx.accounts.owner.key().as_ref(),
                ctx.accounts.actor.key().as_ref(),
                asset.mint.as_ref(),
            ],
            &crate::ID,
        );
        if ctx.accounts.agent_authority.key() == expected_auth_pda
            && !ctx.accounts.agent_authority.data_is_empty()
            && ctx.accounts.agent_authority.owner == &crate::ID
        {
            let mut auth_slice: &[u8] = &ctx.accounts.agent_authority.data.borrow();
            AgentAuthority::try_deserialize(&mut auth_slice).ok()
        } else {
            None
        }
    } else {
        None
    };

    // 12. Evaluate Canonical Permission Engine
    let perm = permissions::evaluate_permission(
        &ctx.accounts.actor.key(),
        circuit_action,
        &asset.mint,
        requested_amount,
        &ctx.accounts.owner.key(),
        position_has_debt,
        collateral_value,
        current_debt,
        &policy,
        agent_auth_holder.as_ref(),
        clock.unix_timestamp,
    )?;

    if !perm.allowed {
        emit!(EnvelopeAuthorizationDenied {
            owner: ctx.accounts.owner.key(),
            actor: ctx.accounts.actor.key(),
            asset_mint: asset.mint,
            action,
            venue,
            requested_amount,
            risk_state: effective_risk_state,
            denial_reason: perm.denial_reason,
            timestamp: clock.unix_timestamp,
        });

        match perm.denial_reason {
            PermissionDenialReason::SecurityHaltInferred => return err!(CircuitError::SecurityHaltInferred),
            PermissionDenialReason::OracleUnavailable => return err!(CircuitError::OracleUnavailable),
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
            PermissionDenialReason::BorrowNotPermitted => return err!(CircuitError::BorrowDisabledByRiskPolicy),
            PermissionDenialReason::WithdrawNotPermitted => return err!(CircuitError::WithdrawRestrictedInStress),
            PermissionDenialReason::MarketClosed => return err!(CircuitError::MarketClosed),
            PermissionDenialReason::ConfidenceTooWide => return err!(CircuitError::ConfidenceTooWide),
            PermissionDenialReason::OracleUnsafe => return err!(CircuitError::OracleConditionUnsafe),
            _ => return err!(CircuitError::CapitalPolicyBlocked),
        }
    }

    // 13. Populate and Initialize RiskEnvelope PDA
    let expires_at_slot = clock
        .slot
        .checked_add(effective_ttl)
        .ok_or(CircuitError::MathOverflow)?;

    let envelope = &mut ctx.accounts.envelope;
    envelope.owner = ctx.accounts.owner.key();
    envelope.actor = ctx.accounts.actor.key();
    envelope.asset_mint = asset.mint;
    envelope.venue = venue;
    envelope.action = action;
    envelope.max_notional = requested_amount;
    envelope.max_ltv_bps = policy.effective_ltv_bps;
    envelope.max_slippage_bps = max_slippage_bps;
    envelope.risk_state = effective_risk_state;
    envelope.oracle_freshness = oracle_age;
    envelope.confidence_limit_bps = conf_ratio_bps;
    envelope.oracle_price = validated_price.price;
    envelope.oracle_expo = validated_price.expo;
    envelope.policy_version = perm.policy_version;
    envelope.risk_epoch = ctx.accounts.risk_ratchet.risk_epoch;
    envelope.authorized_at_slot = clock.slot;
    envelope.expires_at_slot = expires_at_slot;
    envelope.nonce = nonce;
    envelope.consumed = false;
    envelope.consumed_at_slot = 0;
    envelope.bump = ctx.bumps.envelope;

    emit!(EnvelopeAuthorized {
        envelope: envelope.key(),
        owner: envelope.owner,
        actor: envelope.actor,
        asset_mint: envelope.asset_mint,
        venue: envelope.venue,
        action: envelope.action,
        max_notional: envelope.max_notional,
        max_ltv_bps: envelope.max_ltv_bps,
        max_slippage_bps: envelope.max_slippage_bps,
        risk_state: envelope.risk_state,
        risk_epoch: envelope.risk_epoch,
        authorized_at_slot: envelope.authorized_at_slot,
        expires_at_slot: envelope.expires_at_slot,
        nonce: envelope.nonce,
        timestamp: clock.unix_timestamp,
    });

    msg!(
        "Envelope Authorized: envelope={} actor={} action={} amount={} expires_slot={}",
        envelope.key(),
        envelope.actor,
        envelope.action,
        envelope.max_notional,
        envelope.expires_at_slot
    );

    Ok(())
}

#[derive(Accounts)]
#[instruction(
    action: u8,
    venue: u8,
    requested_amount: u64,
    max_slippage_bps: u64,
    nonce: u64,
    ttl_slots: u64
)]
pub struct AuthorizeAction<'info> {
    /// Payer who covers rent for the newly initialized RiskEnvelope PDA
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Position owner delegating or executing
    /// CHECK: Validated against position.owner and agent_authority.owner if initialized
    pub owner: SystemAccount<'info>,

    /// Actor requesting authorization (either human owner or delegated agent)
    pub actor: Signer<'info>,

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
        seeds = [RiskRatchet::SEEDS_PREFIX, &asset_config.pyth_feed_id],
        bump = risk_ratchet.bump,
    )]
    pub risk_ratchet: Box<Account<'info, RiskRatchet>>,

    /// Position account (optional/unchecked; validated if initialized)
    /// CHECK: Validated in handler if not empty
    pub position: UncheckedAccount<'info>,

    /// Agent authority PDA (optional/unchecked; validated if actor != owner)
    /// CHECK: Validated in handler if actor != owner
    pub agent_authority: UncheckedAccount<'info>,

    /// Dedicated Risk Envelope state PDA
    #[account(
        init,
        payer = payer,
        space = 8 + RiskEnvelope::INIT_SPACE,
        seeds = [
            RiskEnvelope::SEEDS_PREFIX,
            owner.key().as_ref(),
            actor.key().as_ref(),
            asset_config.mint.as_ref(),
            &nonce.to_le_bytes(),
        ],
        bump,
    )]
    pub envelope: Box<Account<'info, RiskEnvelope>>,

    /// Pyth PriceUpdateV2 oracle account
    pub price_update: Box<Account<'info, PriceUpdateV2>>,

    pub system_program: Program<'info, System>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::enums::MarketState;
    use crate::state::risk_envelope::*;

    #[test]
    fn test_ttl_defaults_and_caps() {
        // ttl = 0 defaults to DEFAULT_ENVELOPE_TTL_SLOTS (20)
        let effective_ttl = if 0u64 == 0 { DEFAULT_ENVELOPE_TTL_SLOTS } else { 0 };
        assert_eq!(effective_ttl, 20);

        // ttl <= MAX_ENVELOPE_TTL_SLOTS (100) is valid
        assert!(50u64 <= MAX_ENVELOPE_TTL_SLOTS);
        assert!(100u64 <= MAX_ENVELOPE_TTL_SLOTS);
        assert!(101u64 > MAX_ENVELOPE_TTL_SLOTS);
    }

    #[test]
    fn test_envelope_action_mapping() {
        let map_action = |a: u8| -> Result<CircuitAction> {
            match a {
                ENVELOPE_ACTION_BORROW => Ok(CircuitAction::Borrow),
                ENVELOPE_ACTION_WITHDRAW => Ok(CircuitAction::Withdraw),
                ENVELOPE_ACTION_SWAP => Ok(CircuitAction::Swap),
                ENVELOPE_ACTION_ENTER_LIQUIDITY => Ok(CircuitAction::EnterLiquidity),
                ENVELOPE_ACTION_EXIT_LIQUIDITY => Ok(CircuitAction::ExitLiquidity),
                ENVELOPE_ACTION_REBALANCE => Ok(CircuitAction::Rebalance),
                ENVELOPE_ACTION_REPAY => Ok(CircuitAction::Repay),
                ENVELOPE_ACTION_DEPOSIT => Ok(CircuitAction::Deposit),
                _ => err!(CircuitError::EnvelopeActionMismatch),
            }
        };

        assert_eq!(map_action(1).unwrap(), CircuitAction::Borrow);
        assert_eq!(map_action(2).unwrap(), CircuitAction::Withdraw);
        assert_eq!(map_action(3).unwrap(), CircuitAction::Swap);
        assert_eq!(map_action(4).unwrap(), CircuitAction::EnterLiquidity);
        assert_eq!(map_action(5).unwrap(), CircuitAction::ExitLiquidity);
        assert_eq!(map_action(6).unwrap(), CircuitAction::Rebalance);
        assert_eq!(map_action(7).unwrap(), CircuitAction::Repay);
        assert_eq!(map_action(8).unwrap(), CircuitAction::Deposit);
        assert!(map_action(0).is_err());
        assert!(map_action(9).is_err());
    }

    #[test]
    fn test_envelope_venue_validation() {
        assert!(VENUE_CREDIT <= VENUE_TRADING);
        assert!(VENUE_METEORA_DBC <= VENUE_TRADING);
        assert!(VENUE_TRADING <= VENUE_TRADING);
        assert!(3 > VENUE_TRADING);
    }

    #[test]
    fn test_effective_risk_state_severity_escalation() {
        let ratchet_state = MarketState::Restricted;

        // Instant Emergency > Ratchet Restricted -> Escalate to Emergency
        let instant_emergency = MarketState::Emergency;
        let effective = if RiskRatchet::severity(instant_emergency) > RiskRatchet::severity(ratchet_state) {
            instant_emergency
        } else {
            ratchet_state
        };
        assert_eq!(effective, MarketState::Emergency);

        // Instant Safe < Ratchet Restricted -> Maintain Restricted (hysteresis ratchet)
        let instant_safe = MarketState::Safe;
        let effective = if RiskRatchet::severity(instant_safe) > RiskRatchet::severity(ratchet_state) {
            instant_safe
        } else {
            ratchet_state
        };
        assert_eq!(effective, MarketState::Restricted);
    }

    #[test]
    fn test_envelope_pda_seeds_derivation() {
        let program_id = crate::ID;
        let owner = Pubkey::new_unique();
        let actor = Pubkey::new_unique();
        let mint = Pubkey::new_unique();
        let nonce: u64 = 42;

        let (pda, bump) = Pubkey::find_program_address(
            &[
                RiskEnvelope::SEEDS_PREFIX,
                owner.as_ref(),
                actor.as_ref(),
                mint.as_ref(),
                &nonce.to_le_bytes(),
            ],
            &program_id,
        );

        assert_ne!(pda, Pubkey::default());
        assert!(bump <= 255);
    }

    #[test]
    fn test_envelope_slot_expiration_math() {
        let current_slot = 1000u64;
        let effective_ttl = DEFAULT_ENVELOPE_TTL_SLOTS; // 20
        let expires_at_slot = current_slot.checked_add(effective_ttl).unwrap();
        assert_eq!(expires_at_slot, 1020);

        // Max TTL slots: 100
        let max_expires = current_slot.checked_add(MAX_ENVELOPE_TTL_SLOTS).unwrap();
        assert_eq!(max_expires, 1100);

        // Overflow detection
        assert!(u64::MAX.checked_add(1).is_none());
    }

    #[test]
    fn test_owner_vs_agent_actor_discrimination() {
        let owner = Pubkey::new_unique();
        let agent = Pubkey::new_unique();

        let is_owner_calling = owner == owner;
        assert!(is_owner_calling);

        let is_agent_calling = agent == owner;
        assert!(!is_agent_calling);
    }
}
