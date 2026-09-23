use anchor_lang::prelude::Pubkey;
use anchor_lang::solana_program::program_error::ProgramError;
use ::thiserror::Error;

/// Dedicated error enum for the Circuit Risk SDK verification helper and CPI client.
#[derive(Error, Debug, PartialEq, Eq, Clone, Copy)]
pub enum RiskSdkError {
    #[error("Risk envelope has expired: current slot {current_slot} > expires at {expires_at}")]
    EnvelopeExpired { current_slot: u64, expires_at: u64 },

    #[error("Risk envelope has already been consumed")]
    EnvelopeAlreadyConsumed,

    #[error("Risk epoch mismatch: expected {expected}, found {found}")]
    EpochMismatch { expected: u64, found: u64 },

    #[error("Action mismatch: expected {expected}, found {found}")]
    ActionMismatch { expected: u8, found: u8 },

    #[error("Venue mismatch: expected {expected}, found {found}")]
    VenueMismatch { expected: u8, found: u8 },

    #[error("Amount exceeded: max authorized {max}, requested {requested}")]
    AmountExceeded { max: u64, requested: u64 },

    #[error("Actor mismatch: expected {expected}, found {found}")]
    ActorMismatch { expected: Pubkey, found: Pubkey },

    #[error("Invalid RiskEnvelope PDA address")]
    InvalidPda,

    #[error("Failed to deserialize RiskEnvelope account data")]
    DeserializationFailed,
}

impl RiskSdkError {
    /// Returns the canonical on-chain error code matching Circuit Protocol error definitions.
    pub const fn error_code(&self) -> u32 {
        match self {
            Self::EnvelopeExpired { .. } => 6071,
            Self::EnvelopeAlreadyConsumed => 6072,
            Self::EpochMismatch { .. } => 6073,
            Self::ActionMismatch { .. } => 6074,
            Self::VenueMismatch { .. } => 6075,
            Self::AmountExceeded { .. } => 6076,
            Self::ActorMismatch { .. } => 6079,
            Self::InvalidPda => 6080,
            Self::DeserializationFailed => 6081,
        }
    }
}

impl From<RiskSdkError> for ProgramError {
    fn from(err: RiskSdkError) -> Self {
        ProgramError::Custom(err.error_code())
    }
}

impl From<RiskSdkError> for anchor_lang::error::Error {
    fn from(err: RiskSdkError) -> Self {
        anchor_lang::error::Error::from(ProgramError::from(err))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_display_formatting() {
        let err = RiskSdkError::EnvelopeExpired {
            current_slot: 125,
            expires_at: 120,
        };
        assert_eq!(
            err.to_string(),
            "Risk envelope has expired: current slot 125 > expires at 120"
        );

        let err = RiskSdkError::EpochMismatch {
            expected: 42,
            found: 40,
        };
        assert_eq!(
            err.to_string(),
            "Risk epoch mismatch: expected 42, found 40"
        );

        let err = RiskSdkError::ActionMismatch {
            expected: 1,
            found: 2,
        };
        assert_eq!(err.to_string(), "Action mismatch: expected 1, found 2");

        let err = RiskSdkError::VenueMismatch {
            expected: 0,
            found: 1,
        };
        assert_eq!(err.to_string(), "Venue mismatch: expected 0, found 1");

        let err = RiskSdkError::AmountExceeded {
            max: 1_000,
            requested: 1_500,
        };
        assert_eq!(
            err.to_string(),
            "Amount exceeded: max authorized 1000, requested 1500"
        );

        let actor1 = Pubkey::new_unique();
        let actor2 = Pubkey::new_unique();
        let err = RiskSdkError::ActorMismatch {
            expected: actor1,
            found: actor2,
        };
        assert_eq!(
            err.to_string(),
            format!("Actor mismatch: expected {}, found {}", actor1, actor2)
        );

        assert_eq!(
            RiskSdkError::EnvelopeAlreadyConsumed.to_string(),
            "Risk envelope has already been consumed"
        );
        assert_eq!(
            RiskSdkError::InvalidPda.to_string(),
            "Invalid RiskEnvelope PDA address"
        );
        assert_eq!(
            RiskSdkError::DeserializationFailed.to_string(),
            "Failed to deserialize RiskEnvelope account data"
        );
    }

    #[test]
    fn test_error_code_mapping() {
        assert_eq!(
            RiskSdkError::EnvelopeExpired {
                current_slot: 10,
                expires_at: 5
            }
            .error_code(),
            6071
        );
        assert_eq!(RiskSdkError::EnvelopeAlreadyConsumed.error_code(), 6072);
        assert_eq!(
            RiskSdkError::EpochMismatch {
                expected: 1,
                found: 2
            }
            .error_code(),
            6073
        );
        assert_eq!(
            RiskSdkError::ActionMismatch {
                expected: 1,
                found: 2
            }
            .error_code(),
            6074
        );
        assert_eq!(
            RiskSdkError::VenueMismatch {
                expected: 0,
                found: 1
            }
            .error_code(),
            6075
        );
        assert_eq!(
            RiskSdkError::AmountExceeded {
                max: 100,
                requested: 200
            }
            .error_code(),
            6076
        );
        assert_eq!(
            RiskSdkError::ActorMismatch {
                expected: Pubkey::default(),
                found: Pubkey::default()
            }
            .error_code(),
            6079
        );
        assert_eq!(RiskSdkError::InvalidPda.error_code(), 6080);
        assert_eq!(RiskSdkError::DeserializationFailed.error_code(), 6081);
    }

    #[test]
    fn test_program_error_conversion() {
        let err = RiskSdkError::EnvelopeAlreadyConsumed;
        let pe: ProgramError = err.into();
        assert_eq!(pe, ProgramError::Custom(6072));
    }
}
