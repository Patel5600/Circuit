//! Circuit Risk SDK
//!
//! Official CPI SDK for the Circuit Protocol Risk Kernel and Risk Envelope on Solana.
//!
//! Provides downstream protocols (lending pools, AMMs, orderbooks, and vaults) with:
//! - Canonical onchain state definitions (`RiskEnvelope`, `RiskRequest`)
//! - PDA derivation helpers (`derive_envelope_pda`)
//! - Verification helpers (`verify_envelope`, `verify_envelope_pda`)
//! - CPI instruction builders and invokers (`authorize`, `consume`, `close`)
//! - Machine-readable error handling (`RiskSdkError`)

pub mod constants;
pub mod cpi;
pub mod errors;
pub mod types;
pub mod verify;

#[cfg(feature = "idl-build")]
use anchor_lang::prelude::*;

#[cfg(feature = "idl-build")]
anchor_lang::declare_id!("Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2");

#[cfg(feature = "idl-build")]
#[anchor_lang::program]
pub mod circuit_risk_sdk {
    use super::*;
}

// ── Re-exports ─────────────────────────────────────────────────────────────

pub use constants::{
    CIRCUIT_PROGRAM_ID, DEFAULT_ENVELOPE_TTL_SLOTS, ENVELOPE_ACTION_BORROW,
    ENVELOPE_ACTION_DEPOSIT, ENVELOPE_ACTION_ENTER_LIQUIDITY, ENVELOPE_ACTION_EXIT_LIQUIDITY,
    ENVELOPE_ACTION_REBALANCE, ENVELOPE_ACTION_REPAY, ENVELOPE_ACTION_SWAP,
    ENVELOPE_ACTION_WITHDRAW, ENVELOPE_SEEDS_PREFIX, MAX_ENVELOPE_TTL_SLOTS, RISK_STATE_DEFENSIVE,
    RISK_STATE_EMERGENCY, RISK_STATE_RESTRICTED, RISK_STATE_SAFE, VENUE_CREDIT, VENUE_METEORA_DBC,
    VENUE_TRADING,
};

pub use types::{CircuitAction, CircuitVenue, RiskEnvelope, RiskRequest, RiskState};

pub use cpi::{
    authorize, build_authorize_instruction, build_authorize_instruction_with_program,
    build_close_instruction, build_close_instruction_with_program, build_consume_instruction,
    build_consume_instruction_with_program, close, close_signed, consume, consume_signed,
    Authorize, AuthorizeAccounts, Close, CloseAccounts, Consume, ConsumeAccounts,
    AUTHORIZE_ACTION_DISCRIMINATOR, CLOSE_ENVELOPE_DISCRIMINATOR, CONSUME_ENVELOPE_DISCRIMINATOR,
};

pub use verify::{
    derive_envelope_pda, derive_envelope_pda_with_program_id, verify_envelope,
    verify_envelope_account, verify_envelope_bytes, verify_envelope_pda,
};

pub use errors::RiskSdkError;

#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::prelude::{AccountDeserialize, AccountSerialize, Pubkey};

    /// Self-contained FIPS 180-4 compliant SHA-256 implementation to verify Anchor preimages
    fn sha256(input: &[u8]) -> [u8; 32] {
        let mut h: [u32; 8] = [
            0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
            0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
        ];
        let k: [u32; 64] = [
            0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
            0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
            0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
            0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
            0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
            0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
            0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
            0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
        ];

        let bit_len = (input.len() as u64) * 8;
        let mut msg = input.to_vec();
        msg.push(0x80);
        while (msg.len() + 8) % 64 != 0 {
            msg.push(0);
        }
        msg.extend_from_slice(&bit_len.to_be_bytes());

        for chunk in msg.chunks(64) {
            let mut w = [0u32; 64];
            for i in 0..16 {
                w[i] = u32::from_be_bytes([
                    chunk[4 * i],
                    chunk[4 * i + 1],
                    chunk[4 * i + 2],
                    chunk[4 * i + 3],
                ]);
            }
            for i in 16..64 {
                let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
                let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
                w[i] = w[i - 16].wrapping_add(s0).wrapping_add(w[i - 7]).wrapping_add(s1);
            }

            let mut a = h[0];
            let mut b = h[1];
            let mut c = h[2];
            let mut d = h[3];
            let mut e = h[4];
            let mut f = h[5];
            let mut g = h[6];
            let mut h_val = h[7];

            for i in 0..64 {
                let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
                let ch = (e & f) ^ ((!e) & g);
                let temp1 = h_val
                    .wrapping_add(s1)
                    .wrapping_add(ch)
                    .wrapping_add(k[i])
                    .wrapping_add(w[i]);
                let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
                let maj = (a & b) ^ (a & c) ^ (b & c);
                let temp2 = s0.wrapping_add(maj);

                h_val = g;
                g = f;
                f = e;
                e = d.wrapping_add(temp1);
                d = c;
                c = b;
                b = a;
                a = temp1.wrapping_add(temp2);
            }

            h[0] = h[0].wrapping_add(a);
            h[1] = h[1].wrapping_add(b);
            h[2] = h[2].wrapping_add(c);
            h[3] = h[3].wrapping_add(d);
            h[4] = h[4].wrapping_add(e);
            h[5] = h[5].wrapping_add(f);
            h[6] = h[6].wrapping_add(g);
            h[7] = h[7].wrapping_add(h_val);
        }

        let mut out = [0u8; 32];
        for i in 0..8 {
            out[4 * i..4 * i + 4].copy_from_slice(&h[i].to_be_bytes());
        }
        out
    }

    fn sample_envelope() -> RiskEnvelope {
        RiskEnvelope {
            owner: Pubkey::new_unique(),
            actor: Pubkey::new_unique(),
            asset_mint: Pubkey::new_unique(),
            venue: VENUE_CREDIT,
            action: ENVELOPE_ACTION_BORROW,
            max_notional: 1_000_000_000,
            max_ltv_bps: 6500,
            max_slippage_bps: 100,
            risk_state: RISK_STATE_SAFE,
            oracle_freshness: 10,
            confidence_limit_bps: 50,
            oracle_price: 150_000_000,
            oracle_expo: -6,
            policy_version: 1,
            risk_epoch: 42,
            authorized_at_slot: 1_000,
            expires_at_slot: 1_020,
            nonce: 777,
            consumed: false,
            consumed_at_slot: 0,
            bump: 254,
        }
    }

    // ── Test Suite 1: PDA Derivation ───────────────────────────────────────

    #[test]
    fn test_sdk_pda_derivation_canonical() {
        let owner = Pubkey::new_unique();
        let actor = Pubkey::new_unique();
        let asset_mint = Pubkey::new_unique();
        let nonce = 12345u64;

        let (derived_pda, bump) = derive_envelope_pda(&owner, &actor, &asset_mint, nonce);

        let (expected_pda, expected_bump) = Pubkey::find_program_address(
            &[
                ENVELOPE_SEEDS_PREFIX,
                owner.as_ref(),
                actor.as_ref(),
                asset_mint.as_ref(),
                &nonce.to_le_bytes(),
            ],
            &CIRCUIT_PROGRAM_ID,
        );

        assert_eq!(derived_pda, expected_pda);
        assert_eq!(bump, expected_bump);

        // verify_envelope_pda validation
        let res = verify_envelope_pda(&derived_pda, &owner, &actor, &asset_mint, nonce);
        assert_eq!(res, Ok(bump));

        // Invalid/tampered PDA returns InvalidPda
        let wrong_pda = Pubkey::new_unique();
        let err_res = verify_envelope_pda(&wrong_pda, &owner, &actor, &asset_mint, nonce);
        assert_eq!(err_res, Err(RiskSdkError::InvalidPda));
    }

    #[test]
    fn test_sdk_pda_derivation_uniqueness_across_nonces() {
        let owner = Pubkey::new_unique();
        let actor = Pubkey::new_unique();
        let asset_mint = Pubkey::new_unique();

        let (pda_nonce_0, bump_0) = derive_envelope_pda(&owner, &actor, &asset_mint, 0);
        let (pda_nonce_1, bump_1) = derive_envelope_pda(&owner, &actor, &asset_mint, 1);
        let (pda_nonce_max, bump_max) = derive_envelope_pda(&owner, &actor, &asset_mint, u64::MAX);

        assert_ne!(pda_nonce_0, pda_nonce_1);
        assert_ne!(pda_nonce_1, pda_nonce_max);
        assert_ne!(pda_nonce_0, pda_nonce_max);

        assert!(bump_0 > 0);
        assert!(bump_1 > 0);
        assert!(bump_max > 0);
    }

    // ── Test Suite 2: Serialization & Deserialization ──────────────────────

    #[test]
    fn test_envelope_serialization_and_deserialization_byte_layout() {
        let envelope = sample_envelope();

        // Serialize via Anchor AccountSerialize
        let mut buffer = Vec::new();
        envelope
            .try_serialize(&mut buffer)
            .expect("Serialization must succeed");

        // Exactly 8 (discriminator) + 195 (fields) = 203 bytes
        assert_eq!(
            buffer.len(),
            203,
            "Serialized RiskEnvelope length must match canonical onchain layout of 203 bytes (8 discriminator + 195 payload)"
        );

        // Verify the 8-byte discriminator matches [51, 97, 24, 200, 134, 168, 42, 85]
        assert_eq!(&buffer[..8], &RiskEnvelope::DISCRIMINATOR);

        // Verify deserialization via Anchor AccountDeserialize
        let mut slice = &buffer[..];
        let deserialized = RiskEnvelope::try_deserialize(&mut slice)
            .expect("Deserialization must succeed");

        assert_eq!(envelope, deserialized);
        assert_eq!(deserialized.owner, envelope.owner);
        assert_eq!(deserialized.actor, envelope.actor);
        assert_eq!(deserialized.asset_mint, envelope.asset_mint);
        assert_eq!(deserialized.venue, VENUE_CREDIT);
        assert_eq!(deserialized.action, ENVELOPE_ACTION_BORROW);
        assert_eq!(deserialized.max_notional, 1_000_000_000);
        assert_eq!(deserialized.max_ltv_bps, 6500);
        assert_eq!(deserialized.max_slippage_bps, 100);
        assert_eq!(deserialized.risk_state, RISK_STATE_SAFE);
        assert_eq!(deserialized.oracle_freshness, 10);
        assert_eq!(deserialized.confidence_limit_bps, 50);
        assert_eq!(deserialized.oracle_price, 150_000_000);
        assert_eq!(deserialized.oracle_expo, -6);
        assert_eq!(deserialized.policy_version, 1);
        assert_eq!(deserialized.risk_epoch, 42);
        assert_eq!(deserialized.authorized_at_slot, 1_000);
        assert_eq!(deserialized.expires_at_slot, 1_020);
        assert_eq!(deserialized.nonce, 777);
        assert_eq!(deserialized.consumed, false);
        assert_eq!(deserialized.consumed_at_slot, 0);
        assert_eq!(deserialized.bump, 254);
    }

    #[test]
    fn test_envelope_deserialization_corrupt_discriminator_rejection() {
        let envelope = sample_envelope();
        let mut buffer = Vec::new();
        envelope.try_serialize(&mut buffer).unwrap();

        // Corrupt first byte of discriminator
        buffer[0] ^= 0xff;

        let mut slice = &buffer[..];
        let res = RiskEnvelope::try_deserialize(&mut slice);
        assert!(res.is_err(), "Corrupted discriminator must fail deserialization");
    }

    #[test]
    fn test_envelope_deserialization_truncated_buffer_rejection() {
        let envelope = sample_envelope();
        let mut buffer = Vec::new();
        envelope.try_serialize(&mut buffer).unwrap();

        // Truncate buffer to 100 bytes
        let truncated = &buffer[..100];
        let mut slice = truncated;
        let res = RiskEnvelope::try_deserialize(&mut slice);
        assert!(res.is_err(), "Truncated buffer must fail deserialization");
    }

    // ── Test Suite 3: Envelope Verification ────────────────────────────────

    #[test]
    fn test_verify_envelope_valid_parameters() {
        let envelope = sample_envelope();
        let current_slot = 1_010;
        let current_risk_epoch = 42;
        let requested_amount = 500_000_000;

        let res = verify_envelope(
            &envelope,
            current_slot,
            current_risk_epoch,
            ENVELOPE_ACTION_BORROW,
            VENUE_CREDIT,
            requested_amount,
            &envelope.actor,
        );

        assert_eq!(res, Ok(()));
    }

    #[test]
    fn test_verify_envelope_exact_boundaries() {
        let envelope = sample_envelope();

        // Boundary: exact expiry slot
        assert_eq!(
            verify_envelope(
                &envelope,
                envelope.expires_at_slot,
                envelope.risk_epoch,
                envelope.action,
                envelope.venue,
                envelope.max_notional,
                &envelope.actor,
            ),
            Ok(())
        );

        // Boundary: exact max notional
        assert_eq!(
            verify_envelope(
                &envelope,
                1_005,
                envelope.risk_epoch,
                envelope.action,
                envelope.venue,
                envelope.max_notional,
                &envelope.actor,
            ),
            Ok(())
        );
    }

    #[test]
    fn test_verify_envelope_expired_rejection() {
        let envelope = sample_envelope();
        let current_slot = envelope.expires_at_slot + 1;

        let res = verify_envelope(
            &envelope,
            current_slot,
            envelope.risk_epoch,
            envelope.action,
            envelope.venue,
            500_000_000,
            &envelope.actor,
        );

        assert_eq!(
            res,
            Err(RiskSdkError::EnvelopeExpired {
                current_slot,
                expires_at: envelope.expires_at_slot,
            })
        );
    }

    #[test]
    fn test_verify_envelope_consumed_rejection() {
        let mut envelope = sample_envelope();
        envelope.consumed = true;
        envelope.consumed_at_slot = 1_005;

        let res = verify_envelope(
            &envelope,
            1_010,
            envelope.risk_epoch,
            envelope.action,
            envelope.venue,
            500_000_000,
            &envelope.actor,
        );

        assert_eq!(res, Err(RiskSdkError::EnvelopeAlreadyConsumed));
    }

    #[test]
    fn test_verify_envelope_epoch_mismatch_rejection() {
        let envelope = sample_envelope();
        let shifted_epoch = envelope.risk_epoch + 1;

        let res = verify_envelope(
            &envelope,
            1_010,
            shifted_epoch,
            envelope.action,
            envelope.venue,
            500_000_000,
            &envelope.actor,
        );

        assert_eq!(
            res,
            Err(RiskSdkError::EpochMismatch {
                expected: shifted_epoch,
                found: envelope.risk_epoch,
            })
        );
    }

    #[test]
    fn test_verify_envelope_action_mismatch_rejection() {
        let envelope = sample_envelope(); // action = BORROW (1)
        let unexpected_action = ENVELOPE_ACTION_WITHDRAW; // 2

        let res = verify_envelope(
            &envelope,
            1_010,
            envelope.risk_epoch,
            unexpected_action,
            envelope.venue,
            500_000_000,
            &envelope.actor,
        );

        assert_eq!(
            res,
            Err(RiskSdkError::ActionMismatch {
                expected: unexpected_action,
                found: envelope.action,
            })
        );
    }

    #[test]
    fn test_verify_envelope_venue_mismatch_rejection() {
        let envelope = sample_envelope(); // venue = CREDIT (0)
        let unexpected_venue = VENUE_METEORA_DBC; // 1

        let res = verify_envelope(
            &envelope,
            1_010,
            envelope.risk_epoch,
            envelope.action,
            unexpected_venue,
            500_000_000,
            &envelope.actor,
        );

        assert_eq!(
            res,
            Err(RiskSdkError::VenueMismatch {
                expected: unexpected_venue,
                found: envelope.venue,
            })
        );
    }

    #[test]
    fn test_verify_envelope_amount_exceeded_rejection() {
        let envelope = sample_envelope(); // max_notional = 1_000_000_000
        let requested_amount = 1_000_000_001;

        let res = verify_envelope(
            &envelope,
            1_010,
            envelope.risk_epoch,
            envelope.action,
            envelope.venue,
            requested_amount,
            &envelope.actor,
        );

        assert_eq!(
            res,
            Err(RiskSdkError::AmountExceeded {
                max: envelope.max_notional,
                requested: requested_amount,
            })
        );
    }

    #[test]
    fn test_verify_envelope_actor_mismatch_rejection() {
        let envelope = sample_envelope();
        let imposter_actor = Pubkey::new_unique();

        let res = verify_envelope(
            &envelope,
            1_010,
            envelope.risk_epoch,
            envelope.action,
            envelope.venue,
            500_000_000,
            &imposter_actor,
        );

        assert_eq!(
            res,
            Err(RiskSdkError::ActorMismatch {
                expected: imposter_actor,
                found: envelope.actor,
            })
        );
    }

    // ── Test Suite 4: Anchor sha256 Instruction Discriminators ─────────────

    #[test]
    fn test_instruction_discriminators_match_anchor_sha256_preimages() {
        // Anchor instruction discriminator format: sha256("global:<name>")[..8]

        let auth_hash = sha256(b"global:authorize_action");
        assert_eq!(
            &auth_hash[..8],
            &AUTHORIZE_ACTION_DISCRIMINATOR,
            "authorize_action discriminator must match sha256('global:authorize_action')[..8]"
        );
        assert_eq!(
            AUTHORIZE_ACTION_DISCRIMINATOR,
            [11, 87, 202, 95, 221, 45, 38, 210]
        );

        let consume_hash = sha256(b"global:consume_envelope");
        assert_eq!(
            &consume_hash[..8],
            &CONSUME_ENVELOPE_DISCRIMINATOR,
            "consume_envelope discriminator must match sha256('global:consume_envelope')[..8]"
        );
        assert_eq!(
            CONSUME_ENVELOPE_DISCRIMINATOR,
            [178, 151, 217, 31, 60, 195, 207, 194]
        );

        let close_hash = sha256(b"global:close_envelope");
        assert_eq!(
            &close_hash[..8],
            &CLOSE_ENVELOPE_DISCRIMINATOR,
            "close_envelope discriminator must match sha256('global:close_envelope')[..8]"
        );
        assert_eq!(
            CLOSE_ENVELOPE_DISCRIMINATOR,
            [140, 198, 50, 187, 85, 89, 13, 23]
        );
    }

    #[test]
    fn test_account_discriminator_matches_anchor_sha256_preimage() {
        // Anchor account discriminator format: sha256("account:<name>")[..8]

        let account_hash = sha256(b"account:RiskEnvelope");
        assert_eq!(
            &account_hash[..8],
            &RiskEnvelope::DISCRIMINATOR,
            "RiskEnvelope account discriminator must match sha256('account:RiskEnvelope')[..8]"
        );
        assert_eq!(
            RiskEnvelope::DISCRIMINATOR,
            [51, 97, 24, 200, 134, 168, 42, 85]
        );
    }
}
