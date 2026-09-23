use anchor_lang::prelude::*;

/// All protocol error codes. Each variant maps to a unique numeric code
/// that clients can match on for deterministic error handling.
#[error_code]
pub enum CircuitError {
    /// Protocol is globally paused by admin
    #[msg("Protocol is paused")]
    ProtocolPaused,

    /// Asset has been disabled by admin
    #[msg("Asset is disabled")]
    AssetDisabled,

    /// AssetConfig PDA does not match expected derivation
    #[msg("Invalid asset configuration")]
    InvalidAsset,

    /// Supplied oracle account is not a valid PriceUpdateV2
    #[msg("Invalid oracle account")]
    InvalidOracle,

    /// Oracle feed ID does not match AssetConfig.pyth_feed_id
    #[msg("Oracle feed ID mismatch")]
    InvalidFeed,

    /// Oracle price is older than max_oracle_age
    #[msg("Oracle price is stale")]
    StaleOracle,

    /// Oracle confidence interval exceeds max_conf_bps
    #[msg("Oracle confidence interval too wide")]
    ConfidenceTooWide,

    /// Reference market (NYSE) is currently closed
    #[msg("Reference market is closed")]
    MarketClosed,

    /// Market state is Restricted - risk-increasing ops blocked
    #[msg("Market state is restricted")]
    MarketRestricted,

    /// Market state is Emergency - risk-increasing ops blocked
    #[msg("Market state is emergency")]
    MarketEmergency,

    /// User does not have enough collateral deposited
    #[msg("Insufficient collateral")]
    InsufficientCollateral,

    /// Requested borrow exceeds LTV-based capacity
    #[msg("Borrow exceeds capacity")]
    BorrowExceedsCapacity,

    /// Resulting health factor would be below minimum threshold
    #[msg("Health factor too low")]
    HealthFactorTooLow,

    /// Position is not eligible for liquidation (HF >= minimum)
    #[msg("Position is not liquidatable")]
    NotLiquidatable,

    /// Signer does not match position owner
    #[msg("Invalid position owner")]
    InvalidPositionOwner,

    /// Custody state indicates impaired custody
    #[msg("Invalid custody state")]
    InvalidCustodyState,

    /// Liquidity state indicates critical/thin liquidity
    #[msg("Invalid liquidity state")]
    InvalidLiquidityState,

    /// Arithmetic overflow in checked math
    #[msg("Math overflow")]
    MathOverflow,

    /// Token mint does not match expected mint
    #[msg("Invalid mint")]
    InvalidMint,

    /// Token account validation failed
    #[msg("Invalid token account")]
    InvalidTokenAccount,

    /// Signer is not the authorized admin
    #[msg("Unauthorized")]
    Unauthorized,

    /// PDA derivation does not match expected address
    #[msg("Invalid PDA")]
    InvalidPda,

    /// Timestamp is invalid or nonsensical
    #[msg("Invalid timestamp")]
    InvalidTimestamp,

    /// Oracle price is zero or negative where positive required
    #[msg("Invalid price")]
    InvalidPrice,

    /// Protocol liquidity vault has insufficient balance
    #[msg("Insufficient liquidity")]
    InsufficientLiquidity,

    /// Repay amount exceeds outstanding debt
    #[msg("Repay exceeds debt")]
    RepayExceedsDebt,

    /// Withdraw amount exceeds collateral balance
    #[msg("Withdraw exceeds collateral")]
    WithdrawExceedsCollateral,

    /// Liquidation auction is already active for this position
    #[msg("Liquidation auction already active")]
    AuctionAlreadyActive,

    /// Liquidation auction is not active for this position
    #[msg("Liquidation auction not active")]
    AuctionNotActive,

    /// Position is still underwater; cannot cancel active auction
    #[msg("Position is still unhealthy, cannot cancel auction")]
    AuctionStillActive,

    /// Risk Ratchet is in Restricted state
    #[msg("Operation rejected: Risk Ratchet is in Restricted state")]
    RiskRestricted,

    /// Risk Ratchet is in Defensive state
    #[msg("Operation rejected: Risk Ratchet is in Defensive state")]
    RiskDefensive,

    /// Risk Ratchet is in Emergency state
    #[msg("Operation rejected: Risk Ratchet is in Emergency state")]
    RiskEmergency,

    /// Collateral withdrawal with active debt is prohibited during defensive or emergency risk states
    #[msg("Collateral withdrawal with active debt is prohibited during defensive or emergency risk states")]
    WithdrawRestrictedInStress,

    /// Oracle confidence interval is invalid or exceeds allowable threshold
    #[msg("Oracle confidence interval is invalid or exceeds allowable threshold")]
    InvalidConfidenceInterval,

    /// Illegal risk ratchet recovery transition attempted
    #[msg("Illegal risk ratchet recovery transition attempted")]
    IllegalStateTransition,

    /// Fee recipient account does not match configured treasury
    #[msg("Fee recipient account does not match configured protocol treasury")]
    InvalidFeeRecipient,

    /// Borrow fee BPS exceeds maximum allowable limit
    #[msg("Borrow fee BPS exceeds maximum allowable limit")]
    FeeBpsExceedsMaximum,

    /// Invalid protocol fee token account
    #[msg("Invalid protocol fee token account")]
    InvalidFeeAccount,

    /// Liquidation repayment amount is insufficient to restore target health factor
    #[msg("Liquidation repayment amount is insufficient to restore target health factor")]
    InsufficientLiquidationAmount,

    /// Operation rejected by authoritative Capital Policy
    #[msg("Operation rejected by authoritative Capital Policy")]
    CapitalPolicyBlocked,

    /// Borrowing is disabled by current on-chain capital policy
    #[msg("Borrowing is disabled by current on-chain capital policy")]
    BorrowDisabledByRiskPolicy,

    /// Withdrawal is disabled by current on-chain capital policy
    #[msg("Withdrawal is disabled by current on-chain capital policy")]
    WithdrawDisabledByRiskPolicy,

    /// Proposed operation exceeds effective LTV capacity
    #[msg("Proposed operation exceeds effective LTV capacity")]
    EffectiveLtvExceeded,

    /// Attempted an invalid risk state transition
    #[msg("Attempted an invalid risk state transition")]
    InvalidRiskTransition,

    /// Risk epoch mismatch
    #[msg("Risk epoch mismatch")]
    RiskEpochMismatch,

    /// Oracle condition is unsafe
    #[msg("Oracle condition is unsafe")]
    OracleConditionUnsafe,

    /// Resulting position would become unsafe
    #[msg("Resulting position would become unsafe")]
    PositionWouldBecomeUnsafe,

    /// Liquidation auction has expired
    #[msg("Liquidation auction has expired")]
    AuctionExpired,

    /// Calculated auction price is out of bounds
    #[msg("Calculated auction price is out of bounds")]
    AuctionPriceOutOfBounds,

    /// Agent delegation authority has expired
    #[msg("Agent authority has expired")]
    AgentAuthorityExpired,

    /// Action flag is not granted in the agent's delegation bitmask
    #[msg("Agent is not authorized to execute this action")]
    AgentActionNotPermitted,

    /// Borrow exceeds agent authority policy limit
    #[msg("Requested borrow exceeds agent authority policy limit")]
    AgentBorrowLimitExceeded,

    /// Withdrawal exceeds agent authority policy limit
    #[msg("Requested withdrawal exceeds agent authority policy limit")]
    AgentWithdrawLimitExceeded,

    /// Action risk cost exceeds remaining dynamic risk budget
    #[msg("Action risk cost exceeds agent remaining risk budget")]
    InsufficientRiskBudget,

    /// Signer does not match delegated agent authority
    #[msg("Signer does not match delegated agent authority")]
    AgentAuthorityUnauthorized,

    /// Agent authority owner does not match position owner
    #[msg("Agent authority owner does not match position owner")]
    InvalidAgentOwner,

    /// Action intent nonce mismatch or replay detected
    #[msg("Action intent nonce mismatch or replay detected")]
    ActionNonceInvalid,

    /// Risk observation data is stale or older than allowable window
    #[msg("Risk observation data is stale")]
    RiskDataStale,

    /// Risk calculation received invalid or unnormalizable price/confidence data
    #[msg("Risk calculation data is invalid")]
    RiskDataInvalid,

    /// Pyth oracle confidence interval exceeds allowable risk band
    #[msg("Oracle confidence interval is too wide for credit operations")]
    OracleConfidenceTooWide,

    /// Risk state transition was rejected by the state machine
    #[msg("Risk state transition was denied by state machine rules")]
    RiskStateTransitionDenied,

    /// Transition rejected because cooldown duration has not yet elapsed
    #[msg("Transition rejected: cooldown duration is currently active")]
    CooldownActive,

    /// Insufficient clean observations or metrics to qualify for staged recovery
    #[msg("Staged recovery conditions have not been satisfied")]
    RecoveryConditionsNotMet,

    /// Financial action blocked by authoritative on-chain risk policy
    #[msg("Action blocked by on-chain risk policy")]
    ActionBlockedByRisk,

    /// Requested action amount exceeds permitted limit under current risk state
    #[msg("Action amount exceeds allowable limit")]
    ActionLimitExceeded,

    /// Asset mint does not match authorized scope
    #[msg("Asset mint is outside authorized scope")]
    AssetScopeViolation,

    /// Evaluated policy version does not match active protocol configuration
    #[msg("Policy version mismatch")]
    PolicyVersionMismatch,

    /// Target DBC pool does not match the registered pool for this asset
    #[msg("DBC pool address does not match asset registry")]
    InvalidDbcPool,

    /// DBC swap slippage exceeded minimum amount out
    #[msg("DBC swap slippage exceeded: minimum amount out not met")]
    DbcSlippageExceeded,

    /// DBC action not allowed under current risk policy
    #[msg("DBC action blocked by risk policy")]
    DbcActionBlocked,

    /// Risk envelope has expired
    #[msg("Risk envelope has expired")]
    EnvelopeExpired,

    /// Risk envelope has already been consumed
    #[msg("Risk envelope has already been consumed")]
    EnvelopeAlreadyConsumed,

    /// Risk epoch has changed since envelope was authorized
    #[msg("Risk epoch has changed since envelope was authorized")]
    EnvelopeEpochMismatch,

    /// Envelope action does not match requested operation
    #[msg("Envelope action does not match requested operation")]
    EnvelopeActionMismatch,

    /// Envelope venue does not match requested venue
    #[msg("Envelope venue does not match requested venue")]
    EnvelopeVenueMismatch,

    /// Requested amount exceeds envelope authorization
    #[msg("Requested amount exceeds envelope authorization")]
    EnvelopeAmountExceeded,

    /// Requested TTL exceeds maximum allowable slots
    #[msg("Requested TTL exceeds maximum allowed")]
    EnvelopeTtlExceeded,

    /// Envelope is not expired and has not been consumed; cannot be closed
    #[msg("Envelope is still active and cannot be closed")]
    EnvelopeStillActive,

    /// Signer does not match envelope authorized actor
    #[msg("Signer does not match envelope authorized actor")]
    InvalidEnvelopeActor,

    /// Risk envelope account PDA is invalid or corrupted
    #[msg("Risk envelope account PDA is invalid or corrupted")]
    InvalidEnvelopePda,

    /// Envelope owner does not match position owner
    #[msg("Envelope owner does not match position owner")]
    InvalidEnvelopeOwner,

    /// Security is in an inferred halt state (feed stale during expected active trading session)
    #[msg("Security-level halt inferred: feed is stale during expected active trading session")]
    SecurityHaltInferred,

    /// Oracle service unavailable across multiple feeds
    #[msg("Oracle service unavailable: multiple feeds failing or degraded")]
    OracleUnavailable,
}


