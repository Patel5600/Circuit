use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;
use crate::errors::CircuitError;
use crate::math;

// --------------------------------------------------------------
// Validated Price - strongly-typed oracle output
// --------------------------------------------------------------

/// Output of successful oracle validation. All consumers of oracle
/// data MUST obtain it through this type - no direct Pyth reads allowed.
#[derive(Debug, Clone, Copy)]
pub struct ValidatedPrice {
    /// Price in Pyth integer format (e.g., 10_000_000_000 for $100 at expo -8)
    pub price: i64,
    /// Confidence interval in same units as price
    pub conf: u64,
    /// Price exponent (e.g., -8)
    pub expo: i32,
    /// Unix timestamp when this price was published
    pub publish_time: i64,
}

// --------------------------------------------------------------
// Core Validation Function
// --------------------------------------------------------------

/// Validates a Pyth PriceUpdateV2 account against the expected feed and
/// configured freshness/confidence requirements.
///
/// This is THE SINGLE FUNCTION that reads Pyth data for the protocol.
/// All oracle assumptions are centralized here.
///
/// # Checks performed:
/// 1. Account is a valid PriceUpdateV2 (enforced by Anchor deserialization)
/// 2. Feed ID matches expected_feed_id
/// 3. Price is fresh (not older than max_age seconds)
/// 4. Confidence interval is within max_conf_bps
/// 5. Price is positive and non-zero
///
/// # Arguments
/// * `price_update` - Deserialized PriceUpdateV2 account
/// * `expected_feed_id` - The feed ID from AssetConfig.pyth_feed_id
/// * `max_age` - Maximum acceptable age in seconds
/// * `max_conf_bps` - Maximum confidence width in BPS
/// * `clock` - Solana clock sysvar
pub fn validate_pyth_price(
    price_update: &PriceUpdateV2,
    expected_feed_id: &[u8; 32],
    max_age: u64,
    max_conf_bps: u64,
    clock: &Clock,
) -> Result<ValidatedPrice> {
    // Step 1: Get price with freshness check.
    // get_price_no_older_than verifies:
    //   - The feed_id matches
    //   - The price is not older than max_age relative to clock
    // It returns an error if stale or feed_id mismatch.
    let price_data = price_update
        .get_price_no_older_than(clock, max_age, expected_feed_id)
        .map_err(|_| error!(CircuitError::StaleOracle))?;

    // Step 2: Validate price is positive and non-zero
    require!(price_data.price > 0, CircuitError::InvalidPrice);

    // Step 3: Validate confidence width
    let conf_ok = math::is_confidence_acceptable(
        price_data.price,
        price_data.conf,
        max_conf_bps,
    )?;
    require!(conf_ok, CircuitError::ConfidenceTooWide);

    // Step 4: Validate publish_time is sane (not in the future by more than a minute)
    let max_future = clock.unix_timestamp.checked_add(60)
        .ok_or(CircuitError::MathOverflow)?;
    require!(price_data.publish_time <= max_future, CircuitError::InvalidTimestamp);

    Ok(ValidatedPrice {
        price: price_data.price,
        conf: price_data.conf,
        expo: price_data.exponent,
        publish_time: price_data.publish_time,
    })
}

/// Attempts oracle validation, returning None if validation fails.
/// Used by liquidation to decide whether to use current or last-valid price.
pub fn try_validate_pyth_price(
    price_update: &PriceUpdateV2,
    expected_feed_id: &[u8; 32],
    max_age: u64,
    max_conf_bps: u64,
    clock: &Clock,
) -> Option<ValidatedPrice> {
    validate_pyth_price(price_update, expected_feed_id, max_age, max_conf_bps, clock).ok()
}
