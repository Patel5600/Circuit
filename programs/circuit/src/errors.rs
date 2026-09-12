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
}
