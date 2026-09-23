use anchor_lang::prelude::*;
use crate::errors::CircuitError;
use crate::events::EnvelopeClosed;
use crate::state::risk_envelope::RiskEnvelope;

/// Closes an expired or consumed RiskEnvelope account and refunds rent to the owner.
///
/// Permissionless crank: any caller may close the account once it has been consumed
/// or its expiration slot has passed. Rent lamports are reclaimed back to the owner.
pub fn handler(ctx: Context<CloseEnvelope>) -> Result<()> {
    let envelope = &ctx.accounts.envelope;
    let clock = Clock::get()?;

    // Must satisfy: envelope.consumed == true OR clock.slot > envelope.expires_at_slot
    require!(
        envelope.consumed || clock.slot > envelope.expires_at_slot,
        CircuitError::EnvelopeStillActive
    );

    // Verify envelope.owner == owner.key()
    require!(
        envelope.owner == ctx.accounts.owner.key(),
        CircuitError::InvalidPositionOwner
    );

    // Emit event
    emit!(EnvelopeClosed {
        envelope: envelope.key(),
        closed_by: ctx.accounts.closer.key(),
        refund_to: ctx.accounts.owner.key(),
        slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });

    // Anchor close = owner reclaims lamports back to owner upon handler completion
    Ok(())
}

#[derive(Accounts)]
pub struct CloseEnvelope<'info> {
    /// Permissionless closer
    pub closer: Signer<'info>,

    /// The position owner receiving the rent refund
    #[account(mut)]
    pub owner: SystemAccount<'info>,

    /// The RiskEnvelope account to close
    #[account(
        mut,
        close = owner,
    )]
    pub envelope: Box<Account<'info, RiskEnvelope>>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::enums::MarketState;

    fn sample_envelope(consumed: bool, expires_at_slot: u64) -> RiskEnvelope {
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
            expires_at_slot,
            nonce: 1,
            consumed,
            consumed_at_slot: if consumed { 110 } else { 0 },
            bump: 254,
        }
    }

    #[test]
    fn test_close_envelope_eligibility() {
        let current_slot = 115;

        // Active and unexpired -> Cannot close
        let active = sample_envelope(false, 120);
        assert!(!(active.consumed || current_slot > active.expires_at_slot));

        // Consumed and unexpired -> Can close
        let consumed = sample_envelope(true, 120);
        assert!(consumed.consumed || current_slot > consumed.expires_at_slot);

        // Unconsumed and expired -> Can close
        let expired = sample_envelope(false, 110);
        assert!(expired.consumed || current_slot > expired.expires_at_slot);

        // Consumed and expired -> Can close
        let consumed_and_expired = sample_envelope(true, 110);
        assert!(consumed_and_expired.consumed || current_slot > consumed_and_expired.expires_at_slot);
    }
}
