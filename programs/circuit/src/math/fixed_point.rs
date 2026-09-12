use anchor_lang::prelude::*;
use crate::errors::CircuitError;

// --------------------------------------------------------------
// Constants
// --------------------------------------------------------------

/// Basis points scale: 10000 = 100%
pub const BPS_SCALE: u64 = 10_000;

/// BPS scale as u128 for intermediate calculations
pub const BPS_SCALE_U128: u128 = 10_000;

/// Health factor representing "infinite" (no debt)
pub const HF_INFINITE: u64 = u64::MAX;

/// Token decimals for the equity and quote tokens (6 for USDC-like)
pub const TOKEN_DECIMALS: u8 = 6;

/// Scale factor for token amounts (10^6)
pub const TOKEN_SCALE: u128 = 1_000_000;

// --------------------------------------------------------------
// Collateral Value Calculation
// --------------------------------------------------------------

/// Calculates the value of collateral in quote-token units.
///
/// Returns: collateral_value scaled to quote token decimals (e.g., USDC 6 decimals)
///
/// Formula:
///   value = amount * price * 10^(quote_decimals + expo) / 10^(collateral_decimals)
///
/// Uses u128 intermediate to prevent overflow with large positions.
///
/// # Arguments
/// * `amount` - Collateral token amount in native units
/// * `price` - Oracle price (Pyth format: integer * 10^expo)
/// * `expo` - Oracle price exponent (typically negative, e.g., -8)
/// * `collateral_decimals` - Decimal places of the collateral token
/// * `quote_decimals` - Decimal places of the quote token
pub fn calculate_collateral_value(
    amount: u64,
    price: i64,
    expo: i32,
    collateral_decimals: u8,
    quote_decimals: u8,
) -> Result<u128> {
    require!(price > 0, CircuitError::InvalidPrice);

    let amount_u128 = amount as u128;
    let price_u128 = price as u128;

    // value_raw = amount * price (in units of collateral_decimals + |expo| decimals)
    let value_raw = amount_u128
        .checked_mul(price_u128)
        .ok_or(CircuitError::MathOverflow)?;

    // We need to normalize to quote_decimals.
    // The raw value has (collateral_decimals + |expo|) decimal places.
    // We want quote_decimals decimal places.
    //
    // net_adjustment = quote_decimals - collateral_decimals + expo
    // if positive: multiply by 10^net_adjustment
    // if negative: divide by 10^|net_adjustment|
    let net_expo: i32 = (quote_decimals as i32) - (collateral_decimals as i32) + expo;

    let value = if net_expo >= 0 {
        let scale = pow10(net_expo as u32)?;
        value_raw
            .checked_mul(scale)
            .ok_or(CircuitError::MathOverflow)?
    } else {
        let scale = pow10((-net_expo) as u32)?;
        // Round down (conservative for borrower)
        value_raw / scale
    };

    Ok(value)
}

// --------------------------------------------------------------
// Maximum Borrow Calculation
// --------------------------------------------------------------

/// Calculates the maximum amount that can be borrowed against collateral.
///
/// max_borrow = collateral_value * ltv_bps / BPS_SCALE
///
/// Returns: maximum borrow amount in quote token native units
pub fn calculate_max_borrow(
    collateral_value: u128,
    ltv_bps: u64,
) -> Result<u128> {
    let max = collateral_value
        .checked_mul(ltv_bps as u128)
        .ok_or(CircuitError::MathOverflow)?
        / BPS_SCALE_U128;

    Ok(max)
}

// --------------------------------------------------------------
// Health Factor Calculation
// --------------------------------------------------------------

/// Calculates the health factor for a position.
///
/// HF = (collateral_value * liquidation_threshold_bps) / (debt * BPS_SCALE)
///
/// Returns HF in BPS: 10000 = 1.0, 15000 = 1.5, etc.
///
/// Special case: if debt == 0, returns HF_INFINITE (u64::MAX).
///
/// # Arguments
/// * `collateral_value` - Value of collateral in quote token units (u128)
/// * `liquidation_threshold_bps` - Liquidation threshold in BPS (e.g., 8000 = 80%)
/// * `debt` - Outstanding debt in quote token native units
pub fn calculate_health_factor(
    collateral_value: u128,
    liquidation_threshold_bps: u64,
    debt: u64,
) -> Result<u64> {
    if debt == 0 {
        return Ok(HF_INFINITE);
    }

    // numerator = collateral_value * liquidation_threshold_bps
    let numerator = collateral_value
        .checked_mul(liquidation_threshold_bps as u128)
        .ok_or(CircuitError::MathOverflow)?;

    // denominator = debt * BPS_SCALE
    let denominator = (debt as u128)
        .checked_mul(BPS_SCALE_U128)
        .ok_or(CircuitError::MathOverflow)?;

    // HF in BPS = numerator * BPS_SCALE / denominator
    // = (collateral_value * liq_threshold) / debt  (both in BPS)
    let hf = numerator
        .checked_mul(BPS_SCALE_U128)
        .ok_or(CircuitError::MathOverflow)?
        / denominator;

    // Cap at u64::MAX (extremely healthy positions)
    let hf_u64 = if hf > u64::MAX as u128 {
        HF_INFINITE
    } else {
        hf as u64
    };

    Ok(hf_u64)
}

// --------------------------------------------------------------
// Liquidation Collateral Calculation
// --------------------------------------------------------------

/// Calculates the collateral to seize during liquidation.
///
/// For full liquidation (MVP):
///   collateral_to_seize = (debt * (BPS_SCALE + bonus_bps)) / price_in_quote_per_collateral
///
/// Where price_in_quote_per_collateral = price * 10^(quote_decimals + expo) / 10^(collateral_decimals)
///
/// # Arguments
/// * `debt` - Full debt to repay (quote token native units)
/// * `price` - Oracle price (Pyth integer format)
/// * `expo` - Oracle price exponent
/// * `bonus_bps` - Liquidation bonus in BPS (e.g., 500 = 5%)
/// * `collateral_decimals` - Decimal places of collateral token
/// * `quote_decimals` - Decimal places of quote token
pub fn calculate_liquidation_collateral(
    debt: u64,
    price: i64,
    expo: i32,
    bonus_bps: u64,
    collateral_decimals: u8,
    quote_decimals: u8,
) -> Result<u64> {
    require!(price > 0, CircuitError::InvalidPrice);

    let debt_u128 = debt as u128;
    let price_u128 = price as u128;

    // debt_with_bonus = debt * (BPS_SCALE + bonus_bps) / BPS_SCALE
    let debt_with_bonus = debt_u128
        .checked_mul((BPS_SCALE + bonus_bps) as u128)
        .ok_or(CircuitError::MathOverflow)?
        / BPS_SCALE_U128;

    // Convert debt (in quote units) to collateral units using price
    // collateral = debt_with_bonus * 10^collateral_decimals / (price * 10^(quote_decimals + expo))
    let net_expo: i32 = (quote_decimals as i32) + expo - (collateral_decimals as i32);

    let collateral = if net_expo >= 0 {
        let scale = pow10(net_expo as u32)?;
        let denominator = price_u128
            .checked_mul(scale)
            .ok_or(CircuitError::MathOverflow)?;
        // Round up (more collateral seized = conservative for protocol)
        (debt_with_bonus
            .checked_add(denominator - 1)
            .ok_or(CircuitError::MathOverflow)?)
            / denominator
    } else {
        let scale = pow10((-net_expo) as u32)?;
        debt_with_bonus
            .checked_mul(scale)
            .ok_or(CircuitError::MathOverflow)?
            / price_u128
    };

    // Ensure fits in u64
    require!(collateral <= u64::MAX as u128, CircuitError::MathOverflow);

    Ok(collateral as u64)
}

// --------------------------------------------------------------
// Confidence Width Check
// --------------------------------------------------------------

/// Validates that oracle confidence is within acceptable bounds.
///
/// Returns true if: conf * BPS_SCALE / |price| <= max_conf_bps
///
/// This is an oracle uncertainty signal, not a volatility measure.
pub fn is_confidence_acceptable(
    price: i64,
    conf: u64,
    max_conf_bps: u64,
) -> Result<bool> {
    require!(price != 0, CircuitError::InvalidPrice);

    let abs_price = (price.unsigned_abs()) as u128;
    let conf_u128 = conf as u128;

    // conf_ratio_bps = conf * BPS_SCALE / |price|
    let conf_ratio_bps = conf_u128
        .checked_mul(BPS_SCALE_U128)
        .ok_or(CircuitError::MathOverflow)?
        / abs_price;

    Ok(conf_ratio_bps <= max_conf_bps as u128)
}

// --------------------------------------------------------------
// Helper: Power of 10
// --------------------------------------------------------------

/// Returns 10^n as u128. Errors on overflow for very large exponents.
fn pow10(n: u32) -> Result<u128> {
    // u128 can hold up to 10^38
    if n > 38 {
        return Err(error!(CircuitError::MathOverflow));
    }
    Ok(10u128.pow(n))
}


// ==============================================================
// Unit Tests
// ==============================================================

#[cfg(test)]
mod tests {
    use super::*;

    const DECIMALS_6: u8 = 6;

    // -- Collateral Value --

    #[test]
    fn test_collateral_value_normal() {
        // 10 tokens (10 * 10^6 native) at price $100 (100 * 10^8, expo = -8)
        // Expected: 10 * 100 = $1000 -> 1000 * 10^6 = 1_000_000_000 native USDC
        let val = calculate_collateral_value(
            10_000_000, // 10 tokens at 6 decimals
            10_000_000_000, // $100 at expo -8
            -8,
            DECIMALS_6,
            DECIMALS_6,
        ).unwrap();
        assert_eq!(val, 1_000_000_000); // $1000 in 6-decimal units
    }

    #[test]
    fn test_collateral_value_fractional_price() {
        // 1 token at $0.50 (50_000_000, expo = -8)
        let val = calculate_collateral_value(
            1_000_000,    // 1 token
            50_000_000,   // $0.50
            -8,
            DECIMALS_6,
            DECIMALS_6,
        ).unwrap();
        assert_eq!(val, 500_000); // $0.50 in 6-decimal units
    }

    #[test]
    fn test_collateral_value_zero_amount() {
        let val = calculate_collateral_value(0, 10_000_000_000, -8, DECIMALS_6, DECIMALS_6).unwrap();
        assert_eq!(val, 0);
    }

    #[test]
    fn test_collateral_value_negative_price_fails() {
        let result = calculate_collateral_value(1_000_000, -100, -8, DECIMALS_6, DECIMALS_6);
        assert!(result.is_err());
    }

    #[test]
    fn test_collateral_value_zero_price_fails() {
        let result = calculate_collateral_value(1_000_000, 0, -8, DECIMALS_6, DECIMALS_6);
        assert!(result.is_err());
    }

    #[test]
    fn test_collateral_value_large_amount() {
        // 1 billion tokens at $1000 - should not overflow u128
        let val = calculate_collateral_value(
            1_000_000_000_000_000, // 1B tokens at 6 decimals
            100_000_000_000,       // $1000 at expo -8
            -8,
            DECIMALS_6,
            DECIMALS_6,
        ).unwrap();
        assert_eq!(val, 1_000_000_000_000_000_000); // $1T
    }

    // -- Max Borrow --

    #[test]
    fn test_max_borrow_70pct() {
        // $1000 collateral, 70% LTV -> $700 max borrow
        let max = calculate_max_borrow(1_000_000_000, 7000).unwrap();
        assert_eq!(max, 700_000_000);
    }

    #[test]
    fn test_max_borrow_zero_collateral() {
        let max = calculate_max_borrow(0, 7000).unwrap();
        assert_eq!(max, 0);
    }

    #[test]
    fn test_max_borrow_zero_ltv() {
        let max = calculate_max_borrow(1_000_000_000, 0).unwrap();
        assert_eq!(max, 0);
    }

    // -- Health Factor --

    #[test]
    fn test_health_factor_zero_debt() {
        let hf = calculate_health_factor(1_000_000_000, 8000, 0).unwrap();
        assert_eq!(hf, HF_INFINITE);
    }

    #[test]
    fn test_health_factor_normal() {
        // $1000 collateral, 80% liquidation threshold, $500 debt
        // HF = (1000 * 0.80) / 500 = 1.6 -> 16000 BPS
        let hf = calculate_health_factor(1_000_000_000, 8000, 500_000_000).unwrap();
        assert_eq!(hf, 16000);
    }

    #[test]
    fn test_health_factor_at_threshold() {
        // $1000 collateral, 80% threshold, $800 debt
        // HF = (1000 * 0.80) / 800 = 1.0 -> 10000 BPS
        let hf = calculate_health_factor(1_000_000_000, 8000, 800_000_000).unwrap();
        assert_eq!(hf, 10000);
    }

    #[test]
    fn test_health_factor_below_threshold() {
        // $1000 collateral, 80% threshold, $900 debt
        // HF = (1000 * 0.80) / 900 ~ 0.888 -> 8888 BPS
        let hf = calculate_health_factor(1_000_000_000, 8000, 900_000_000).unwrap();
        assert_eq!(hf, 8888);
    }

    #[test]
    fn test_health_factor_max_borrow() {
        // $1000 collateral, 80% threshold, $700 debt (70% LTV borrow)
        // HF = (1000 * 0.80) / 700 ~ 1.142 -> 11428 BPS
        let hf = calculate_health_factor(1_000_000_000, 8000, 700_000_000).unwrap();
        assert_eq!(hf, 11428);
    }

    #[test]
    fn test_health_factor_one_unit_over_max() {
        // HF is reported in BPS, so it is truncated to integer basis points.
        // Borrowing 1 native unit beyond capacity must never *improve* health,
        // but it is too small to move the BPS-resolution result.
        let hf_at_max = calculate_health_factor(1_000_000_000, 8000, 700_000_000).unwrap();
        let hf_over = calculate_health_factor(1_000_000_000, 8000, 700_000_001).unwrap();
        assert!(hf_over <= hf_at_max);
        assert_eq!(hf_over, hf_at_max, "1 unit is below BPS resolution");

        // Once the extra debt is large enough to cross a basis point, HF must
        // strictly decrease. 8e12 / 700_035_003 = 11427.99..., so it floors to
        // 11427 versus 11428 at capacity.
        let hf_well_over = calculate_health_factor(1_000_000_000, 8000, 700_035_003).unwrap();
        assert!(hf_well_over < hf_at_max);
    }

    #[test]
    fn test_health_factor_large_values() {
        // $1T collateral, $500B debt - large but valid.
        // Both are native 6-decimal amounts: $1T = 1e12 * 1e6 = 1e18,
        // $500B = 5e11 * 1e6 = 5e17. The collateral/debt ratio is 2, matching
        // test_health_factor_normal, so HF must also be 16000 BPS.
        let hf = calculate_health_factor(
            1_000_000_000_000_000_000, // $1T
            8000,
            500_000_000_000_000_000, // $500B
        ).unwrap();
        assert_eq!(hf, 16000); // Same ratio as smaller test
    }

    // -- Liquidation Collateral --

    #[test]
    fn test_liquidation_collateral_full() {
        // $500 debt, price $100, 5% bonus
        // debt_with_bonus = 500 * 1.05 = $525
        // collateral = $525 / $100 = 5.25 tokens = 5_250_000 native
        let col = calculate_liquidation_collateral(
            500_000_000,       // $500 debt
            10_000_000_000,    // $100 price
            -8,
            500,               // 5% bonus
            DECIMALS_6,
            DECIMALS_6,
        ).unwrap();
        assert_eq!(col, 5_250_000); // 5.25 tokens
    }

    #[test]
    fn test_liquidation_collateral_no_bonus() {
        let col = calculate_liquidation_collateral(
            500_000_000,
            10_000_000_000,
            -8,
            0,
            DECIMALS_6,
            DECIMALS_6,
        ).unwrap();
        assert_eq!(col, 5_000_000); // 5 tokens exactly
    }

    // -- Confidence Width --

    #[test]
    fn test_confidence_acceptable() {
        // price = $100 (10B at expo -8), conf = $0.50 (50_000_000)
        // ratio = 0.5 / 100 = 0.5% = 50 BPS
        // max_conf_bps = 100 (1%) -> acceptable
        let ok = is_confidence_acceptable(10_000_000_000, 50_000_000, 100).unwrap();
        assert!(ok);
    }

    #[test]
    fn test_confidence_too_wide() {
        // price = $100, conf = $2 (200_000_000)
        // ratio = 2 / 100 = 2% = 200 BPS
        // max_conf_bps = 100 (1%) -> NOT acceptable
        let ok = is_confidence_acceptable(10_000_000_000, 200_000_000, 100).unwrap();
        assert!(!ok);
    }

    #[test]
    fn test_confidence_zero_price_fails() {
        let result = is_confidence_acceptable(0, 50_000_000, 100);
        assert!(result.is_err());
    }

    // -- pow10 --

    #[test]
    fn test_pow10_basic() {
        assert_eq!(pow10(0).unwrap(), 1);
        assert_eq!(pow10(1).unwrap(), 10);
        assert_eq!(pow10(6).unwrap(), 1_000_000);
        assert_eq!(pow10(18).unwrap(), 1_000_000_000_000_000_000);
    }

    #[test]
    fn test_pow10_overflow() {
        assert!(pow10(39).is_err());
    }
}
