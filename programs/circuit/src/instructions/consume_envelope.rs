use anchor_lang::prelude::*;
use crate::errors::CircuitError;
use crate::events::EnvelopeConsumed;
use crate::state::risk_envelope::RiskEnvelope;
use crate::state::risk_ratchet::RiskRatchet;

/// Consumes an authorized RiskEnvelope capability token for execution.
///
/// Verifies actor authorization, single-use consumption state, slot expiration,
/// live risk epoch consistency, action, venue, and notional limit.
pub fn handler(
    ctx: Context<ConsumeEnvelope>,
    action: u8,
    venue: u8,
    amount: u64,
) -> Result<()> {
    let envelope = &mut ctx.accounts.envelope;
    let clock = Clock::get()?;

    // Verify actor matches the envelope's authorized actor
    require!(
        ctx.accounts.actor.key() == envelope.actor,
        CircuitError::InvalidEnvelopeActor
    );

    // Verify envelope has not already been consumed
    require!(
        !envelope.consumed,
        CircuitError::EnvelopeAlreadyConsumed
    );

    // Verify envelope has not expired relative to current slot
    require!(
        clock.slot <= envelope.expires_at_slot,
        CircuitError::EnvelopeExpired
    );

    // Verify live risk epoch matches authorization epoch (rejects stale envelopes across market shifts)
    require!(
        envelope.risk_epoch == ctx.accounts.risk_ratchet.risk_epoch,
        CircuitError::EnvelopeEpochMismatch
    );

    // Verify requested action matches authorized action
    require!(
        envelope.action == action,
        CircuitError::EnvelopeActionMismatch
    );

    // Verify requested venue matches authorized venue
    require!(
        envelope.venue == venue,
        CircuitError::EnvelopeVenueMismatch
    );

    // Verify requested amount does not exceed maximum authorized notional
    require!(
        amount <= envelope.max_notional,
        CircuitError::EnvelopeAmountExceeded
    );

    // Mark envelope as consumed
    envelope.consumed = true;
    envelope.consumed_at_slot = clock.slot;

    // Emit event
    emit!(EnvelopeConsumed {
        envelope: envelope.key(),
        actor: ctx.accounts.actor.key(),
        action,
        venue,
        amount,
        consumed_at_slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct ConsumeEnvelope<'info> {
    /// The authorized actor executing the operation
    pub actor: Signer<'info>,

    /// The RiskEnvelope capability token being consumed
    #[account(mut)]
    pub envelope: Box<Account<'info, RiskEnvelope>>,

    /// The live RiskRatchet PDA for live risk epoch verification
    pub risk_ratchet: Box<Account<'info, RiskRatchet>>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::enums::MarketState;

    fn sample_envelope() -> RiskEnvelope {
        RiskEnvelope {
            owner: Pubkey::new_unique(),
            actor: Pubkey::new_unique(),
            asset_mint: Pubkey::new_unique(),
            venue: 1,
            action: 3,
            max_notional: 1_000_000,
            max_ltv_bps: 5000,
            max_slippage_bps: 100,
            risk_state: MarketState::Safe,
            oracle_freshness: 5,
            confidence_limit_bps: 50,
            oracle_price: 150_000_000,
            oracle_expo: -6,
            policy_version: 1,
            risk_epoch: 42,
            authorized_at_slot: 100,
            expires_at_slot: 120,
            nonce: 1,
            consumed: false,
            consumed_at_slot: 0,
            bump: 254,
        }
    }

    #[test]
    fn test_envelope_validation_logic() {
        let env = sample_envelope();
        // Valid execution
        assert!(env.is_valid_for_execution(110, 42, 3, 1, 500_000));
        assert!(env.is_valid_for_execution(120, 42, 3, 1, 1_000_000));

        // Expired
        assert!(!env.is_valid_for_execution(121, 42, 3, 1, 500_000));
        assert!(env.is_expired(121));
        assert!(!env.is_expired(120));

        // Risk epoch mismatch
        assert!(!env.is_valid_for_execution(110, 43, 3, 1, 500_000));

        // Action mismatch
        assert!(!env.is_valid_for_execution(110, 42, 1, 1, 500_000));

        // Venue mismatch
        assert!(!env.is_valid_for_execution(110, 42, 3, 0, 500_000));

        // Amount exceeded
        assert!(!env.is_valid_for_execution(110, 42, 3, 1, 1_000_001));
    }

    #[test]
    fn test_consumed_envelope_invalidation() {
        let mut env = sample_envelope();
        env.consumed = true;
        env.consumed_at_slot = 115;
        assert!(!env.is_valid_for_execution(115, 42, 3, 1, 100));
    }
}
