use std::result::Result as StdResult;
use anchor_lang::prelude::*;
use ::thiserror::Error;
use crate::constants::*;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum SdkError {
    #[error("Invalid venue identifier: {0}")]
    InvalidVenue(u8),
    #[error("Invalid action identifier: {0}")]
    InvalidAction(u8),
    #[error("Invalid risk state identifier: {0}")]
    InvalidRiskState(u8),
}

/// Execution venue identifiers for Risk Envelopes
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[borsh(use_discriminant = true)]
#[repr(u8)]
pub enum CircuitVenue {
    Credit = VENUE_CREDIT,
    MeteoraDbc = VENUE_METEORA_DBC,
    Trading = VENUE_TRADING,
}

impl CircuitVenue {
    pub const fn to_u8(self) -> u8 {
        self as u8
    }
}

impl From<CircuitVenue> for u8 {
    fn from(venue: CircuitVenue) -> Self {
        venue as u8
    }
}

impl TryFrom<u8> for CircuitVenue {
    type Error = SdkError;

    fn try_from(val: u8) -> StdResult<Self, Self::Error> {
        match val {
            VENUE_CREDIT => Ok(CircuitVenue::Credit),
            VENUE_METEORA_DBC => Ok(CircuitVenue::MeteoraDbc),
            VENUE_TRADING => Ok(CircuitVenue::Trading),
            other => Err(SdkError::InvalidVenue(other)),
        }
    }
}

/// Canonical on-chain action types across credit, recovery, and liquidity execution venues.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[borsh(use_discriminant = true)]
#[repr(u8)]
pub enum CircuitAction {
    Borrow = ENVELOPE_ACTION_BORROW,
    Withdraw = ENVELOPE_ACTION_WITHDRAW,
    Swap = ENVELOPE_ACTION_SWAP,
    EnterLiquidity = ENVELOPE_ACTION_ENTER_LIQUIDITY,
    ExitLiquidity = ENVELOPE_ACTION_EXIT_LIQUIDITY,
    Rebalance = ENVELOPE_ACTION_REBALANCE,
    Repay = ENVELOPE_ACTION_REPAY,
    Deposit = ENVELOPE_ACTION_DEPOSIT,
}

impl CircuitAction {
    pub const fn to_u8(self) -> u8 {
        self as u8
    }

    /// Whether this action is risk-reducing (always permitted even in stress/emergency).
    pub fn is_risk_reducing(&self) -> bool {
        matches!(
            self,
            CircuitAction::Deposit | CircuitAction::Repay | CircuitAction::ExitLiquidity
        )
    }

    /// Whether this action increases credit or exposure risk.
    pub fn is_risk_increasing(&self) -> bool {
        matches!(
            self,
            CircuitAction::Borrow
                | CircuitAction::Withdraw
                | CircuitAction::EnterLiquidity
                | CircuitAction::Swap
        )
    }
}

impl From<CircuitAction> for u8 {
    fn from(action: CircuitAction) -> Self {
        action as u8
    }
}

impl TryFrom<u8> for CircuitAction {
    type Error = SdkError;

    fn try_from(val: u8) -> StdResult<Self, Self::Error> {
        match val {
            ENVELOPE_ACTION_BORROW => Ok(CircuitAction::Borrow),
            ENVELOPE_ACTION_WITHDRAW => Ok(CircuitAction::Withdraw),
            ENVELOPE_ACTION_SWAP => Ok(CircuitAction::Swap),
            ENVELOPE_ACTION_ENTER_LIQUIDITY => Ok(CircuitAction::EnterLiquidity),
            ENVELOPE_ACTION_EXIT_LIQUIDITY => Ok(CircuitAction::ExitLiquidity),
            ENVELOPE_ACTION_REBALANCE => Ok(CircuitAction::Rebalance),
            ENVELOPE_ACTION_REPAY => Ok(CircuitAction::Repay),
            ENVELOPE_ACTION_DEPOSIT => Ok(CircuitAction::Deposit),
            other => Err(SdkError::InvalidAction(other)),
        }
    }
}

/// Market risk state
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[borsh(use_discriminant = true)]
#[repr(u8)]
pub enum RiskState {
    Safe = RISK_STATE_SAFE,
    Restricted = RISK_STATE_RESTRICTED,
    Defensive = RISK_STATE_DEFENSIVE,
    Emergency = RISK_STATE_EMERGENCY,
}

impl RiskState {
    pub const fn to_u8(self) -> u8 {
        self as u8
    }
}

impl From<RiskState> for u8 {
    fn from(state: RiskState) -> Self {
        state as u8
    }
}

impl TryFrom<u8> for RiskState {
    type Error = SdkError;

    fn try_from(val: u8) -> StdResult<Self, Self::Error> {
        match val {
            RISK_STATE_SAFE => Ok(RiskState::Safe),
            RISK_STATE_RESTRICTED => Ok(RiskState::Restricted),
            RISK_STATE_DEFENSIVE => Ok(RiskState::Defensive),
            RISK_STATE_EMERGENCY => Ok(RiskState::Emergency),
            other => Err(SdkError::InvalidRiskState(other)),
        }
    }
}

/// Dedicated Risk Envelope state matching the on-chain layout of Circuit Protocol.
///
/// An onchain, short-lived capability token that represents bounded authority:
/// "This actor may perform this exact type of capital action, against this asset/venue,
/// up to this amount, under these market conditions, until this slot."
///
/// Seeds: [b"envelope", owner.as_ref(), actor.as_ref(), asset_mint.as_ref(), &nonce.to_le_bytes()]
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct RiskEnvelope {
    /// The collateral position owner delegating or executing
    pub owner: Pubkey,

    /// The authorized actor (human wallet or delegated agent)
    pub actor: Pubkey,

    /// The asset / market mint (e.g. NVDA, AAPL)
    pub asset_mint: Pubkey,

    /// Execution venue (0 = Credit / Lending, 1 = Meteora DBC, 2 = Trading)
    pub venue: u8,

    /// Authorized action type (1 = Borrow, 2 = Withdraw, 3 = Swap, etc.)
    pub action: u8,

    /// Maximum authorized notional amount (in token/quote base units)
    pub max_notional: u64,

    /// Maximum authorized LTV in basis points (e.g. 5000 = 50%)
    pub max_ltv_bps: u64,

    /// Maximum slippage in basis points (for DEX/DBC venues)
    pub max_slippage_bps: u64,

    /// Market risk state at time of authorization (0=Safe, 1=Restricted, 2=Defensive, 3=Emergency)
    pub risk_state: u8,

    /// Oracle freshness at time of authorization (seconds age)
    pub oracle_freshness: u64,

    /// Confidence limit / observed confidence in basis points
    pub confidence_limit_bps: u64,

    /// Validated oracle price snapshot at authorization
    pub oracle_price: i64,

    /// Validated oracle exponent at authorization
    pub oracle_expo: i32,

    /// Authoritative capital policy version evaluated
    pub policy_version: u16,

    /// Monotonic risk epoch at creation (stale envelope rejection if market shifts)
    pub risk_epoch: u64,

    /// Slot at which this envelope was authorized
    pub authorized_at_slot: u64,

    /// Slot at which this envelope strictly expires
    pub expires_at_slot: u64,

    /// Unique nonce for replay protection and PDA uniqueness
    pub nonce: u64,

    /// Single-use consumption flag (set to true upon execution)
    pub consumed: bool,

    /// Slot at which envelope was consumed (0 if active)
    pub consumed_at_slot: u64,

    /// PDA bump
    pub bump: u8,
}

impl RiskEnvelope {
    pub const DISCRIMINATOR: [u8; 8] = [51, 97, 24, 200, 134, 168, 42, 85];
    pub const SEEDS_PREFIX: &'static [u8] = ENVELOPE_SEEDS_PREFIX;

    /// Derives the PDA address and bump seed for a given owner, actor, asset mint, and nonce.
    pub fn find_pda(
        owner: &Pubkey,
        actor: &Pubkey,
        asset_mint: &Pubkey,
        nonce: u64,
    ) -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[
                Self::SEEDS_PREFIX,
                owner.as_ref(),
                actor.as_ref(),
                asset_mint.as_ref(),
                &nonce.to_le_bytes(),
            ],
            &CIRCUIT_PROGRAM_ID,
        )
    }

    /// Checks whether the envelope is expired relative to current slot
    pub fn is_expired(&self, current_slot: u64) -> bool {
        current_slot > self.expires_at_slot
    }

    /// Checks whether the envelope is valid for execution
    pub fn is_valid_for_execution(
        &self,
        current_slot: u64,
        current_risk_epoch: u64,
        action: u8,
        venue: u8,
        amount: u64,
    ) -> bool {
        !self.consumed
            && !self.is_expired(current_slot)
            && self.risk_epoch == current_risk_epoch
            && self.action == action
            && self.venue == venue
            && amount <= self.max_notional
    }
}

impl anchor_lang::Discriminator for RiskEnvelope {
    const DISCRIMINATOR: &'static [u8] = &[51, 97, 24, 200, 134, 168, 42, 85];
}

impl anchor_lang::Owner for RiskEnvelope {
    fn owner() -> Pubkey {
        CIRCUIT_PROGRAM_ID
    }
}

impl anchor_lang::AccountDeserialize for RiskEnvelope {
    fn try_deserialize(buf: &mut &[u8]) -> anchor_lang::Result<Self> {
        if buf.len() < 8 {
            return Err(anchor_lang::error::ErrorCode::AccountDidNotDeserialize.into());
        }
        let given_disc = &buf[..8];
        if Self::DISCRIMINATOR != given_disc {
            return Err(anchor_lang::error::ErrorCode::AccountDiscriminatorMismatch.into());
        }
        Self::try_deserialize_unchecked(buf)
    }

    fn try_deserialize_unchecked(buf: &mut &[u8]) -> anchor_lang::Result<Self> {
        let mut data = &buf[8..];
        AnchorDeserialize::deserialize(&mut data)
            .map_err(|_| anchor_lang::error::ErrorCode::AccountDidNotDeserialize.into())
    }
}

impl anchor_lang::AccountSerialize for RiskEnvelope {
    fn try_serialize<W: std::io::Write>(&self, writer: &mut W) -> anchor_lang::Result<()> {
        writer
            .write_all(&Self::DISCRIMINATOR)
            .map_err(|_| anchor_lang::error::ErrorCode::AccountDidNotSerialize)?;
        AnchorSerialize::serialize(self, writer)
            .map_err(|_| anchor_lang::error::ErrorCode::AccountDidNotSerialize)?;
        Ok(())
    }
}

/// Request payload for authorizing a scoped RiskEnvelope capability token.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
pub struct RiskRequest {
    /// Authorized action type (e.g. 1=Borrow, 2=Withdraw, 3=Swap, etc.)
    pub action: u8,

    /// Execution venue (0=Credit, 1=Meteora DBC, 2=Trading)
    pub venue: u8,

    /// Maximum authorized notional amount (in base units)
    pub requested_amount: u64,

    /// Maximum slippage in basis points (for DEX/DBC venues)
    pub max_slippage_bps: u64,

    /// Unique nonce for replay protection and PDA derivation
    pub nonce: u64,

    /// Slot time-to-live (0 defaults to DEFAULT_ENVELOPE_TTL_SLOTS onchain)
    pub ttl_slots: u64,
}

impl RiskRequest {
    pub const fn new(
        action: u8,
        venue: u8,
        requested_amount: u64,
        max_slippage_bps: u64,
        nonce: u64,
        ttl_slots: u64,
    ) -> Self {
        Self {
            action,
            venue,
            requested_amount,
            max_slippage_bps,
            nonce,
            ttl_slots,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::AccountDeserialize;
    use anchor_lang::AccountSerialize;

    #[test]
    fn test_venue_conversions() {
        assert_eq!(CircuitVenue::Credit.to_u8(), VENUE_CREDIT);
        assert_eq!(CircuitVenue::MeteoraDbc.to_u8(), VENUE_METEORA_DBC);
        assert_eq!(CircuitVenue::Trading.to_u8(), VENUE_TRADING);

        assert_eq!(u8::from(CircuitVenue::Credit), 0);
        assert_eq!(u8::from(CircuitVenue::MeteoraDbc), 1);
        assert_eq!(u8::from(CircuitVenue::Trading), 2);

        assert_eq!(CircuitVenue::try_from(0).unwrap(), CircuitVenue::Credit);
        assert_eq!(CircuitVenue::try_from(1).unwrap(), CircuitVenue::MeteoraDbc);
        assert_eq!(CircuitVenue::try_from(2).unwrap(), CircuitVenue::Trading);
        assert!(CircuitVenue::try_from(3).is_err());
    }

    #[test]
    fn test_action_conversions() {
        let actions = [
            (ENVELOPE_ACTION_BORROW, CircuitAction::Borrow),
            (ENVELOPE_ACTION_WITHDRAW, CircuitAction::Withdraw),
            (ENVELOPE_ACTION_SWAP, CircuitAction::Swap),
            (ENVELOPE_ACTION_ENTER_LIQUIDITY, CircuitAction::EnterLiquidity),
            (ENVELOPE_ACTION_EXIT_LIQUIDITY, CircuitAction::ExitLiquidity),
            (ENVELOPE_ACTION_REBALANCE, CircuitAction::Rebalance),
            (ENVELOPE_ACTION_REPAY, CircuitAction::Repay),
            (ENVELOPE_ACTION_DEPOSIT, CircuitAction::Deposit),
        ];

        for (val, action) in actions {
            assert_eq!(action.to_u8(), val);
            assert_eq!(u8::from(action), val);
            assert_eq!(CircuitAction::try_from(val).unwrap(), action);
        }

        assert!(CircuitAction::try_from(0).is_err());
        assert!(CircuitAction::try_from(9).is_err());
    }

    #[test]
    fn test_action_risk_properties() {
        assert!(CircuitAction::Deposit.is_risk_reducing());
        assert!(CircuitAction::Repay.is_risk_reducing());
        assert!(CircuitAction::ExitLiquidity.is_risk_reducing());
        assert!(!CircuitAction::Borrow.is_risk_reducing());

        assert!(CircuitAction::Borrow.is_risk_increasing());
        assert!(CircuitAction::Withdraw.is_risk_increasing());
        assert!(CircuitAction::EnterLiquidity.is_risk_increasing());
        assert!(CircuitAction::Swap.is_risk_increasing());
        assert!(!CircuitAction::Deposit.is_risk_increasing());
    }

    #[test]
    fn test_risk_state_conversions() {
        assert_eq!(RiskState::Safe.to_u8(), 0);
        assert_eq!(RiskState::Restricted.to_u8(), 1);
        assert_eq!(RiskState::Defensive.to_u8(), 2);
        assert_eq!(RiskState::Emergency.to_u8(), 3);

        assert_eq!(RiskState::try_from(0).unwrap(), RiskState::Safe);
        assert_eq!(RiskState::try_from(1).unwrap(), RiskState::Restricted);
        assert_eq!(RiskState::try_from(2).unwrap(), RiskState::Defensive);
        assert_eq!(RiskState::try_from(3).unwrap(), RiskState::Emergency);
        assert!(RiskState::try_from(4).is_err());
    }

    #[test]
    fn test_risk_envelope_layout_and_size() {
        let envelope = RiskEnvelope {
            owner: Pubkey::new_unique(),
            actor: Pubkey::new_unique(),
            asset_mint: Pubkey::new_unique(),
            venue: VENUE_CREDIT,
            action: ENVELOPE_ACTION_BORROW,
            max_notional: 1_000_000_000,
            max_ltv_bps: 5_000,
            max_slippage_bps: 50,
            risk_state: RISK_STATE_SAFE,
            oracle_freshness: 5,
            confidence_limit_bps: 100,
            oracle_price: 150_000_000,
            oracle_expo: -6,
            policy_version: 1,
            risk_epoch: 42,
            authorized_at_slot: 100,
            expires_at_slot: 120,
            nonce: 999,
            consumed: false,
            consumed_at_slot: 0,
            bump: 254,
        };

        let mut raw_data = Vec::new();
        envelope.try_serialize(&mut raw_data).unwrap();

        // 8 bytes discriminator + 195 bytes payload = 203 bytes
        assert_eq!(raw_data.len(), 203);
        assert_eq!(&raw_data[..8], &RiskEnvelope::DISCRIMINATOR);

        let mut slice = &raw_data[..];
        let deserialized = RiskEnvelope::try_deserialize(&mut slice).unwrap();
        assert_eq!(envelope, deserialized);
    }

    #[test]
    fn test_risk_envelope_pda_derivation() {
        let owner = Pubkey::new_unique();
        let actor = Pubkey::new_unique();
        let mint = Pubkey::new_unique();
        let nonce = 12345u64;

        let (pda, bump) = RiskEnvelope::find_pda(&owner, &actor, &mint, nonce);
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
    fn test_risk_envelope_execution_checks() {
        let envelope = RiskEnvelope {
            owner: Pubkey::new_unique(),
            actor: Pubkey::new_unique(),
            asset_mint: Pubkey::new_unique(),
            venue: VENUE_CREDIT,
            action: ENVELOPE_ACTION_BORROW,
            max_notional: 500,
            max_ltv_bps: 5_000,
            max_slippage_bps: 0,
            risk_state: RISK_STATE_SAFE,
            oracle_freshness: 1,
            confidence_limit_bps: 50,
            oracle_price: 100,
            oracle_expo: -2,
            policy_version: 1,
            risk_epoch: 10,
            authorized_at_slot: 100,
            expires_at_slot: 120,
            nonce: 1,
            consumed: false,
            consumed_at_slot: 0,
            bump: 255,
        };

        // Valid execution
        assert!(envelope.is_valid_for_execution(110, 10, ENVELOPE_ACTION_BORROW, VENUE_CREDIT, 400));
        assert!(envelope.is_valid_for_execution(120, 10, ENVELOPE_ACTION_BORROW, VENUE_CREDIT, 500));

        // Expired
        assert!(!envelope.is_valid_for_execution(121, 10, ENVELOPE_ACTION_BORROW, VENUE_CREDIT, 400));
        assert!(envelope.is_expired(121));

        // Epoch shifted
        assert!(!envelope.is_valid_for_execution(110, 11, ENVELOPE_ACTION_BORROW, VENUE_CREDIT, 400));

        // Action mismatch
        assert!(!envelope.is_valid_for_execution(110, 10, ENVELOPE_ACTION_WITHDRAW, VENUE_CREDIT, 400));

        // Venue mismatch
        assert!(!envelope.is_valid_for_execution(110, 10, ENVELOPE_ACTION_BORROW, VENUE_TRADING, 400));

        // Amount exceeded
        assert!(!envelope.is_valid_for_execution(110, 10, ENVELOPE_ACTION_BORROW, VENUE_CREDIT, 501));
    }

    #[test]
    fn test_risk_request_instantiation() {
        let req = RiskRequest::new(
            ENVELOPE_ACTION_BORROW,
            VENUE_CREDIT,
            1_000_000,
            100,
            777,
            DEFAULT_ENVELOPE_TTL_SLOTS,
        );

        assert_eq!(req.action, ENVELOPE_ACTION_BORROW);
        assert_eq!(req.venue, VENUE_CREDIT);
        assert_eq!(req.requested_amount, 1_000_000);
        assert_eq!(req.max_slippage_bps, 100);
        assert_eq!(req.nonce, 777);
        assert_eq!(req.ttl_slots, 20);
    }
}

