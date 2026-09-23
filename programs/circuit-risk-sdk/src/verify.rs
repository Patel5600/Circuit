use anchor_lang::prelude::{AccountDeserialize, AccountInfo, Pubkey};
use crate::constants::{CIRCUIT_PROGRAM_ID, ENVELOPE_SEEDS_PREFIX};
use crate::errors::RiskSdkError;
use crate::types::RiskEnvelope;

/// Derives the canonical RiskEnvelope PDA address and bump seed for a given
/// position owner, authorized actor, asset mint, and replay nonce against Circuit Protocol.
pub fn derive_envelope_pda(
    owner: &Pubkey,
    actor: &Pubkey,
    asset_mint: &Pubkey,
    nonce: u64,
) -> (Pubkey, u8) {
    derive_envelope_pda_with_program_id(owner, actor, asset_mint, nonce, &CIRCUIT_PROGRAM_ID)
}

/// Derives the canonical RiskEnvelope PDA address and bump seed against an explicit program ID.
pub fn derive_envelope_pda_with_program_id(
    owner: &Pubkey,
    actor: &Pubkey,
    asset_mint: &Pubkey,
    nonce: u64,
    program_id: &Pubkey,
) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            ENVELOPE_SEEDS_PREFIX,
            owner.as_ref(),
            actor.as_ref(),
            asset_mint.as_ref(),
            &nonce.to_le_bytes(),
        ],
        program_id,
    )
}

/// Verifies that a given public key strictly matches the derived RiskEnvelope PDA.
pub fn verify_envelope_pda(
    envelope_address: &Pubkey,
    owner: &Pubkey,
    actor: &Pubkey,
    asset_mint: &Pubkey,
    nonce: u64,
) -> Result<u8, RiskSdkError> {
    let (expected_pda, bump) = derive_envelope_pda(owner, actor, asset_mint, nonce);
    if envelope_address != &expected_pda {
        return Err(RiskSdkError::InvalidPda);
    }
    Ok(bump)
}

/// Standalone verification function that downstream protocols (e.g. lending pools, DEXes,
/// yield aggregators) can invoke in their instruction logic to verify a `RiskEnvelope` account.
///
/// Strictly enforces:
/// - `!envelope.consumed`: Envelope has not already been executed
/// - `current_slot <= envelope.expires_at_slot`: Envelope has not expired
/// - `current_risk_epoch == envelope.risk_epoch`: Risk epoch is fresh (rejects stale authorizations across risk transitions)
/// - `expected_action == envelope.action`: Authorized action matches requested operation
/// - `expected_venue == envelope.venue`: Authorized venue matches target venue
/// - `requested_amount <= envelope.max_notional`: Requested capital does not exceed bounded authorization
/// - `expected_actor == envelope.actor`: Signer/actor matches authorized capability recipient
pub fn verify_envelope(
    envelope: &RiskEnvelope,
    current_slot: u64,
    current_risk_epoch: u64,
    expected_action: u8,
    expected_venue: u8,
    requested_amount: u64,
    expected_actor: &Pubkey,
) -> Result<(), RiskSdkError> {
    // 1. Single-use consumption check
    if envelope.consumed {
        return Err(RiskSdkError::EnvelopeAlreadyConsumed);
    }

    // 2. Slot TTL expiration check
    if current_slot > envelope.expires_at_slot {
        return Err(RiskSdkError::EnvelopeExpired {
            current_slot,
            expires_at: envelope.expires_at_slot,
        });
    }

    // 3. Monotonic risk epoch consistency check
    if current_risk_epoch != envelope.risk_epoch {
        return Err(RiskSdkError::EpochMismatch {
            expected: current_risk_epoch,
            found: envelope.risk_epoch,
        });
    }

    // 4. Action matching check
    if expected_action != envelope.action {
        return Err(RiskSdkError::ActionMismatch {
            expected: expected_action,
            found: envelope.action,
        });
    }

    // 5. Venue matching check
    if expected_venue != envelope.venue {
        return Err(RiskSdkError::VenueMismatch {
            expected: expected_venue,
            found: envelope.venue,
        });
    }

    // 6. Max notional capital bound check
    if requested_amount > envelope.max_notional {
        return Err(RiskSdkError::AmountExceeded {
            max: envelope.max_notional,
            requested: requested_amount,
        });
    }

    // 7. Actor authorization check
    if expected_actor != &envelope.actor {
        return Err(RiskSdkError::ActorMismatch {
            expected: *expected_actor,
            found: envelope.actor,
        });
    }

    Ok(())
}

/// Verifies and deserializes a `RiskEnvelope` from raw account bytes, executing all parameter checks.
pub fn verify_envelope_bytes(
    data: &[u8],
    current_slot: u64,
    current_risk_epoch: u64,
    expected_action: u8,
    expected_venue: u8,
    requested_amount: u64,
    expected_actor: &Pubkey,
) -> Result<RiskEnvelope, RiskSdkError> {
    let mut slice = data;
    let envelope = RiskEnvelope::try_deserialize(&mut slice)
        .map_err(|_| RiskSdkError::DeserializationFailed)?;

    verify_envelope(
        &envelope,
        current_slot,
        current_risk_epoch,
        expected_action,
        expected_venue,
        requested_amount,
        expected_actor,
    )?;

    Ok(envelope)
}

/// Verifies and deserializes a `RiskEnvelope` from an `AccountInfo` reference, verifying ownership and parameters.
pub fn verify_envelope_account(
    account_info: &AccountInfo,
    current_slot: u64,
    current_risk_epoch: u64,
    expected_action: u8,
    expected_venue: u8,
    requested_amount: u64,
    expected_actor: &Pubkey,
) -> Result<RiskEnvelope, RiskSdkError> {
    if account_info.owner != &CIRCUIT_PROGRAM_ID {
        return Err(RiskSdkError::InvalidPda);
    }

    let data = account_info
        .try_borrow_data()
        .map_err(|_| RiskSdkError::DeserializationFailed)?;

    verify_envelope_bytes(
        &data,
        current_slot,
        current_risk_epoch,
        expected_action,
        expected_venue,
        requested_amount,
        expected_actor,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::AccountSerialize;

    fn sample_valid_envelope(actor: Pubkey) -> RiskEnvelope {
        RiskEnvelope {
            owner: Pubkey::new_unique(),
            actor,
            asset_mint: Pubkey::new_unique(),
            venue: 1, // Meteora DBC
            action: 3, // Swap
            max_notional: 1_000_000,
            max_ltv_bps: 5000,
            max_slippage_bps: 100,
            risk_state: 0, // Safe
            oracle_freshness: 5,
            confidence_limit_bps: 50,
            oracle_price: 150_000_000,
            oracle_expo: -6,
            policy_version: 1,
            risk_epoch: 42,
            authorized_at_slot: 100,
            expires_at_slot: 120,
            nonce: 7,
            consumed: false,
            consumed_at_slot: 0,
            bump: 254,
        }
    }

    #[test]
    fn test_derive_envelope_pda() {
        let owner = Pubkey::new_unique();
        let actor = Pubkey::new_unique();
        let mint = Pubkey::new_unique();
        let nonce = 12345u64;

        let (pda, bump) = derive_envelope_pda(&owner, &actor, &mint, nonce);
        let (expected_pda, expected_bump) = Pubkey::find_program_address(
            &[
                b"envelope",
                owner.as_ref(),
                actor.as_ref(),
                mint.as_ref(),
                &nonce.to_le_bytes(),
            ],
            &CIRCUIT_PROGRAM_ID,
        );

        assert_eq!(pda, expected_pda);
        assert_eq!(bump, expected_bump);
    }

    #[test]
    fn test_verify_envelope_pda_success_and_failure() {
        let owner = Pubkey::new_unique();
        let actor = Pubkey::new_unique();
        let mint = Pubkey::new_unique();
        let nonce = 999u64;

        let (pda, bump) = derive_envelope_pda(&owner, &actor, &mint, nonce);
        let res = verify_envelope_pda(&pda, &owner, &actor, &mint, nonce);
        assert_eq!(res.unwrap(), bump);

        let wrong_pda = Pubkey::new_unique();
        let err = verify_envelope_pda(&wrong_pda, &owner, &actor, &mint, nonce);
        assert_eq!(err.unwrap_err(), RiskSdkError::InvalidPda);
    }

    #[test]
    fn test_verify_envelope_success() {
        let actor = Pubkey::new_unique();
        let env = sample_valid_envelope(actor);

        let res = verify_envelope(&env, 110, 42, 3, 1, 500_000, &actor);
        assert!(res.is_ok());

        // Boundary slot exactly equal to expires_at_slot is valid
        let res_boundary_slot = verify_envelope(&env, 120, 42, 3, 1, 500_000, &actor);
        assert!(res_boundary_slot.is_ok());

        // Boundary amount exactly equal to max_notional is valid
        let res_boundary_amt = verify_envelope(&env, 110, 42, 3, 1, 1_000_000, &actor);
        assert!(res_boundary_amt.is_ok());
    }

    #[test]
    fn test_verify_envelope_consumed_rejection() {
        let actor = Pubkey::new_unique();
        let mut env = sample_valid_envelope(actor);
        env.consumed = true;

        let err = verify_envelope(&env, 110, 42, 3, 1, 500_000, &actor).unwrap_err();
        assert_eq!(err, RiskSdkError::EnvelopeAlreadyConsumed);
    }

    #[test]
    fn test_verify_envelope_expired_rejection() {
        let actor = Pubkey::new_unique();
        let env = sample_valid_envelope(actor);

        let err = verify_envelope(&env, 121, 42, 3, 1, 500_000, &actor).unwrap_err();
        assert_eq!(
            err,
            RiskSdkError::EnvelopeExpired {
                current_slot: 121,
                expires_at: 120
            }
        );
    }

    #[test]
    fn test_verify_envelope_epoch_mismatch_rejection() {
        let actor = Pubkey::new_unique();
        let env = sample_valid_envelope(actor);

        let err = verify_envelope(&env, 110, 43, 3, 1, 500_000, &actor).unwrap_err();
        assert_eq!(
            err,
            RiskSdkError::EpochMismatch {
                expected: 43,
                found: 42
            }
        );
    }

    #[test]
    fn test_verify_envelope_action_mismatch_rejection() {
        let actor = Pubkey::new_unique();
        let env = sample_valid_envelope(actor);

        let err = verify_envelope(&env, 110, 42, 1, 1, 500_000, &actor).unwrap_err();
        assert_eq!(
            err,
            RiskSdkError::ActionMismatch {
                expected: 1,
                found: 3
            }
        );
    }

    #[test]
    fn test_verify_envelope_venue_mismatch_rejection() {
        let actor = Pubkey::new_unique();
        let env = sample_valid_envelope(actor);

        let err = verify_envelope(&env, 110, 42, 3, 0, 500_000, &actor).unwrap_err();
        assert_eq!(
            err,
            RiskSdkError::VenueMismatch {
                expected: 0,
                found: 1
            }
        );
    }

    #[test]
    fn test_verify_envelope_amount_exceeded_rejection() {
        let actor = Pubkey::new_unique();
        let env = sample_valid_envelope(actor);

        let err = verify_envelope(&env, 110, 42, 3, 1, 1_000_001, &actor).unwrap_err();
        assert_eq!(
            err,
            RiskSdkError::AmountExceeded {
                max: 1_000_000,
                requested: 1_000_001
            }
        );
    }

    #[test]
    fn test_verify_envelope_actor_mismatch_rejection() {
        let authorized_actor = Pubkey::new_unique();
        let impostor_actor = Pubkey::new_unique();
        let env = sample_valid_envelope(authorized_actor);

        let err = verify_envelope(&env, 110, 42, 3, 1, 500_000, &impostor_actor).unwrap_err();
        assert_eq!(
            err,
            RiskSdkError::ActorMismatch {
                expected: impostor_actor,
                found: authorized_actor
            }
        );
    }

    #[test]
    fn test_verify_envelope_bytes_serialization_roundtrip() {
        let actor = Pubkey::new_unique();
        let env = sample_valid_envelope(actor);

        let mut buffer = Vec::new();
        env.try_serialize(&mut buffer).unwrap();

        let verified = verify_envelope_bytes(&buffer, 110, 42, 3, 1, 500_000, &actor).unwrap();
        assert_eq!(verified, env);

        // Deserialization failure on truncated buffer
        let truncated = &buffer[..10];
        let err = verify_envelope_bytes(truncated, 110, 42, 3, 1, 500_000, &actor).unwrap_err();
        assert_eq!(err, RiskSdkError::DeserializationFailed);
    }
}
