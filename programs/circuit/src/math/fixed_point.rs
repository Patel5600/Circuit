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

/// Default Dutch auction duration in slots (150 slots ~ 60s at 400ms/slot)
pub const DEFAULT_AUCTION_DURATION_SLOTS: u64 = 150;

/// Floor bonus at start of Dutch auction (200 BPS = 2.00%)
pub const DUTCH_AUCTION_MIN_BONUS_BPS: u64 = 200;

/// Cap bonus at end of Dutch auction (1500 BPS = 15.00%)
pub const DUTCH_AUCTION_MAX_BONUS_BPS: u64 = 1_500;

/// Default close factor: 50% max debt repaid in a single partial liquidation
pub const DEFAULT_CLOSE_FACTOR_BPS: u64 = 5_000;

/// Dust debt threshold: positions with <= 100 USDC ($100) allow 100% full liquidation
pub const DUST_DEBT_THRESHOLD: u64 = 100_000_000;

/// Maximum allowable protocol borrow fee in BPS (1000 BPS = 10.00%)
pub const MAX_BORROW_FEE_BPS: u64 = 1_000;

/// Default protocol borrow fee in BPS (25 BPS = 0.25%)
pub const DEFAULT_BORROW_FEE_BPS: u64 = 25;


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
// Dynamic Severity-Scaled Liquidation Bonus
// --------------------------------------------------------------

/// Calculates the dynamic severity-scaled liquidation bonus in BPS.
///
/// Formula:
///   shortfall = min_health_factor_bps.saturating_sub(hf_bps)
///   additional_bonus = (shortfall * slope_bps) / BPS_SCALE
///   bonus = min(max_bonus_bps, min_bonus_bps + additional_bonus)
///
/// Guaranteed Properties:
/// - Strictly bounded: min_bonus_bps <= result <= max_bonus_bps
/// - Zero arithmetic overflow/underflow via u128 intermediates
/// - Monotonic: as HF decreases, bonus increases up to max_bonus_bps
pub fn calculate_dynamic_liquidation_bonus(
    hf_bps: u64,
    min_health_factor_bps: u64,
    min_bonus_bps: u64,
    max_bonus_bps: u64,
    slope_bps: u64,
) -> Result<u64> {
    require!(min_bonus_bps <= max_bonus_bps, CircuitError::MathOverflow);
    require!(min_health_factor_bps > 0, CircuitError::HealthFactorTooLow);

    // If HF >= min_health_factor_bps, position is healthy -> return floor bonus
    if hf_bps >= min_health_factor_bps {
        return Ok(min_bonus_bps);
    }

    // Shortfall: strictly > 0 and <= min_health_factor_bps
    let shortfall = min_health_factor_bps
        .checked_sub(hf_bps)
        .ok_or(CircuitError::MathOverflow)?;

    // additional_bonus = shortfall * slope_bps / 10_000
    // Using u128 intermediate ensures zero overflow
    let additional_bonus = (shortfall as u128)
        .checked_mul(slope_bps as u128)
        .ok_or(CircuitError::MathOverflow)?
        / BPS_SCALE_U128;

    let raw_bonus = (min_bonus_bps as u128)
        .checked_add(additional_bonus)
        .ok_or(CircuitError::MathOverflow)?;

    let max_cap = max_bonus_bps as u128;
    let clamped_bonus = raw_bonus.min(max_cap);

    Ok(clamped_bonus as u64)
}

// --------------------------------------------------------------
// Time-Ramped Dutch Auction Liquidation Bonus
// --------------------------------------------------------------

/// Calculates the time-ramped Dutch auction liquidation bonus in BPS.
///
/// In Tier 2, when a position becomes unhealthy, a continuous Dutch auction opens.
/// The discount starts at `min_bonus_bps` (e.g. 200 BPS = 2.0%) at elapsed_slots = 0,
/// protecting borrower equity against transient dips.
/// Over `auction_duration_slots` (e.g. 150 slots ~60s), the discount ramps linearly
/// up to `max_bonus_bps` (e.g. 1500 BPS = 15.0%).
///
/// Formula:
///   if elapsed_slots >= auction_duration_slots {
///       max_bonus_bps
///   } else {
///       min_bonus_bps + elapsed_slots * (max_bonus_bps - min_bonus_bps) / auction_duration_slots
///   }
///
/// Guaranteed Properties:
/// - Strictly bounded: min_bonus_bps <= result <= max_bonus_bps
/// - Zero arithmetic overflow via u128 intermediates
/// - Monotonically non-decreasing with elapsed slots
pub fn calculate_dutch_auction_bonus(
    elapsed_slots: u64,
    auction_duration_slots: u64,
    min_bonus_bps: u64,
    max_bonus_bps: u64,
) -> Result<u64> {
    require!(min_bonus_bps <= max_bonus_bps, CircuitError::MathOverflow);
    require!(auction_duration_slots > 0, CircuitError::MathOverflow);

    if elapsed_slots >= auction_duration_slots {
        return Ok(max_bonus_bps);
    }

    let bonus_range = (max_bonus_bps - min_bonus_bps) as u128;
    let ramp = (elapsed_slots as u128)
        .checked_mul(bonus_range)
        .ok_or(CircuitError::MathOverflow)?
        / (auction_duration_slots as u128);

    let bonus = (min_bonus_bps as u128)
        .checked_add(ramp)
        .ok_or(CircuitError::MathOverflow)?;

    Ok(bonus.min(max_bonus_bps as u128) as u64)
}

// --------------------------------------------------------------
// Deterministic Dutch Auction Price Calculation
// --------------------------------------------------------------

/// Calculates the deterministic linear Dutch auction price at elapsed time/slots:
///   P(t) = P_start - min(t - t_0, T) / T * (P_start - P_floor)
///
/// Guaranteed Properties:
/// - Strictly bounded: floor_price <= P(t) <= start_price
/// - Monotonically non-increasing: dP/dt <= 0
/// - Boundary conditions: at t = 0 -> P_start; at t >= T -> floor_price
/// - Checked integer arithmetic: no floating point math
pub fn calculate_dutch_auction_price(
    start_price: i64,
    floor_price: i64,
    elapsed_slots: u64,
    duration_slots: u64,
) -> Result<i64> {
    require!(start_price > 0, CircuitError::InvalidPrice);
    require!(floor_price > 0 && floor_price <= start_price, CircuitError::AuctionPriceOutOfBounds);
    require!(duration_slots > 0, CircuitError::MathOverflow);

    if elapsed_slots >= duration_slots {
        return Ok(floor_price);
    }

    let price_range = (start_price - floor_price) as u128;
    let price_drop = (elapsed_slots as u128)
        .checked_mul(price_range)
        .ok_or(CircuitError::MathOverflow)?
        / (duration_slots as u128);

    let current_price = (start_price as u128)
        .checked_sub(price_drop)
        .ok_or(CircuitError::MathOverflow)? as i64;

    Ok(current_price.clamp(floor_price, start_price))
}

/// Helper to compute exact collateral tokens q* required for minimum restoration debt d*:
///   q* = calculate_liquidation_collateral(d*, price, expo, bonus_bps, coll_decimals, quote_decimals)
pub fn calculate_minimum_restoration_tokens(
    min_restoration_debt: u64,
    price: i64,
    expo: i32,
    bonus_bps: u64,
    collateral_decimals: u8,
    quote_decimals: u8,
) -> Result<u64> {
    calculate_liquidation_collateral(
        min_restoration_debt,
        price,
        expo,
        bonus_bps,
        collateral_decimals,
        quote_decimals,
    )
}

// --------------------------------------------------------------
// Partial Liquidation (Close Factor) Calculation
// --------------------------------------------------------------

/// Calculates the allowable debt repayment under the partial close factor rule.
///
/// Under Tier 2:
/// - Positions with total debt <= `dust_threshold` (e.g. $100) allow 100% full liquidation
///   to prevent unliquidatable bad debt fragments.
/// - Positions above `dust_threshold` allow up to `close_factor_bps` (e.g. 5000 BPS = 50%)
///   of the total outstanding debt.
/// - If `requested_repay` is 0 or exceeds `max_allowed`, `max_allowed` is returned.
/// - Otherwise, `requested_repay` is returned.
pub fn calculate_close_factor_debt(
    total_debt: u64,
    requested_repay: u64,
    close_factor_bps: u64,
    dust_threshold: u64,
) -> Result<u64> {
    require!(total_debt > 0, CircuitError::NotLiquidatable);
    require!(close_factor_bps <= BPS_SCALE, CircuitError::MathOverflow);

    let max_allowed = if total_debt <= dust_threshold {
        total_debt
    } else {
        let max = (total_debt as u128)
            .checked_mul(close_factor_bps as u128)
            .ok_or(CircuitError::MathOverflow)?
            / BPS_SCALE_U128;
        max as u64
    };

    let actual_repay = if requested_repay == 0 || requested_repay > max_allowed {
        max_allowed
    } else {
        requested_repay
    };


    require!(actual_repay > 0, CircuitError::MathOverflow);
    Ok(actual_repay)
}

// --------------------------------------------------------------
// Minimum-Restoration Liquidation Calculation
// --------------------------------------------------------------

/// Default target health factor for restoration (10500 BPS = 1.05)
pub const DEFAULT_TARGET_HEALTH_FACTOR_BPS: u64 = 10_500;

/// Minimum partial liquidation repayment amount in quote units ($10)
pub const MIN_PARTIAL_LIQUIDATION_DEBT: u64 = 10_000_000;

/// Calculates the exact minimum debt repayment required to restore an unhealthy position
/// to the configured target health factor condition.
///
/// Mathematical derivation:
///   HF' = (V' * tau) / (D' * 10_000) >= h_target
///   Where:
///     V' = V - (d * beta) / 10_000
///     D' = D - d
///     beta = 10_000 + bonus_bps
///     tau = liquidation_threshold_bps
///     h_target = target_health_factor_bps
///
/// Solving for minimum d*:
///   (V * 10_000 - d * beta) * tau >= (D - d) * 10_000 * h_target
///   d * (10_000 * h_target - beta * tau) >= D * 10_000 * h_target - V * 10_000 * tau
///   d* = ceil( (D * 10_000 * h_target - V * 10_000 * tau) / (10_000 * h_target - beta * tau) )
///
/// Boundary & Safety Invariants:
/// - Uses checked u128 arithmetic throughout to guarantee zero overflow.
/// - If current total debt <= dust_threshold ($100), allows 100% full liquidation.
/// - If remaining debt (total_debt - d*) <= dust_threshold, liquidates 100% to prevent unserviceable dust.
/// - If denominator <= 0 or position is deeply insolvent (d* >= total_debt), caps at total_debt.
pub fn calculate_minimum_restoration_debt(
    total_debt: u64,
    collateral_value: u128,
    liquidation_threshold_bps: u64,
    target_health_factor_bps: u64,
    bonus_bps: u64,
    dust_threshold: u64,
) -> Result<u64> {
    require!(total_debt > 0, CircuitError::NotLiquidatable);
    require!(target_health_factor_bps > 0, CircuitError::HealthFactorTooLow);

    // Dust positions allow 100% liquidation
    if total_debt <= dust_threshold {
        return Ok(total_debt);
    }

    let debt_u128 = total_debt as u128;
    let target_hf_u128 = target_health_factor_bps as u128;
    let tau_u128 = liquidation_threshold_bps as u128;
    let beta_u128 = BPS_SCALE_U128
        .checked_add(bonus_bps as u128)
        .ok_or(CircuitError::MathOverflow)?;

    // Term 1: D * 10_000 * h_target
    let d_target = debt_u128
        .checked_mul(BPS_SCALE_U128)
        .ok_or(CircuitError::MathOverflow)?
        .checked_mul(target_hf_u128)
        .ok_or(CircuitError::MathOverflow)?;

    // Term 2: V * 10_000 * tau
    let v_tau = collateral_value
        .checked_mul(BPS_SCALE_U128)
        .ok_or(CircuitError::MathOverflow)?
        .checked_mul(tau_u128)
        .ok_or(CircuitError::MathOverflow)?;

    // If collateral risk-adjusted value already meets or exceeds target, no liquidation debt needed
    if v_tau >= d_target {
        return Ok(0);
    }

    // Numerator: D * 10_000 * h_target - V * 10_000 * tau
    let numerator = d_target
        .checked_sub(v_tau)
        .ok_or(CircuitError::MathOverflow)?;

    // Denominator: 10_000 * h_target - beta * tau
    let denom_left = BPS_SCALE_U128
        .checked_mul(target_hf_u128)
        .ok_or(CircuitError::MathOverflow)?;
    let denom_right = beta_u128
        .checked_mul(tau_u128)
        .ok_or(CircuitError::MathOverflow)?;

    if denom_left <= denom_right {
        // Severe discount / high liquidation threshold implies cannot restore partially -> full liquidation
        return Ok(total_debt);
    }

    let denominator = denom_left
        .checked_sub(denom_right)
        .ok_or(CircuitError::MathOverflow)?;

    // Ceil division: (numerator + denominator - 1) / denominator
    let min_d = numerator
        .checked_add(denominator - 1)
        .ok_or(CircuitError::MathOverflow)?
        / denominator;

    // Cap at total debt
    let capped_d = min_d.min(debt_u128);

    // If remaining debt is below dust threshold, clear entire debt
    let remaining_debt = debt_u128.saturating_sub(capped_d);
    if remaining_debt <= (dust_threshold as u128) {
        return Ok(total_debt);
    }

    Ok(capped_d as u64)
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
// Conservative Pyth Price Calculation
// --------------------------------------------------------------

/// Calculates the conservative price from a Pyth price and confidence interval.
///
/// Official Pyth Network guidance for lending protocols states that when evaluating
/// collateral, protocols should use the conservative lower bound:
///   p_conservative = max(0, price - conf)
///
/// This ensures that during periods of market volatility or publisher disagreement
/// (wide confidence intervals), collateral is not overvalued, protecting the protocol
/// against underwater loans.
pub fn calculate_conservative_pyth_price(price: i64, conf: u64) -> Result<i64> {
    require!(price > 0, CircuitError::InvalidPrice);
    let conf_i64 = i64::try_from(conf).map_err(|_| CircuitError::MathOverflow)?;
    let conservative = price.saturating_sub(conf_i64);
    require!(conservative > 0, CircuitError::InvalidPrice);
    Ok(conservative)
}

// --------------------------------------------------------------
// Oracle Confidence Ratio Calculation
// --------------------------------------------------------------

/// Computes the relative confidence ratio in basis points:
///   ratio_bps = (conf * 10_000) / price
///
/// Used by the Risk Ratchet state machine to classify volatility:
/// - <= 50 BPS: Nominal (Safe)
/// - > 50 BPS: Widening (Restricted)
/// - > 150 BPS: Severe (Defensive)
/// - > 300 BPS: Critical (Emergency)
pub fn calculate_confidence_ratio_bps(price: i64, conf: u64) -> Result<u64> {
    require!(price > 0, CircuitError::InvalidPrice);
    let conf_u128 = conf as u128;
    let price_u128 = price as u128;
    let ratio = conf_u128
        .checked_mul(BPS_SCALE_U128)
        .ok_or(CircuitError::MathOverflow)?
        / price_u128;
    Ok(ratio.min(u64::MAX as u128) as u64)
}

// --------------------------------------------------------------
// Multi-Asset Concentration Penalty Math
// --------------------------------------------------------------

/// Calculates the concentration penalty in BPS for concentrated portfolios.
///
/// When a single collateral asset's weight exceeds `threshold_bps` (e.g. 4000 BPS = 40%),
/// Circuit applies a progressive concentration penalty to prevent single-asset crash vulnerability.
///
/// Formula:
///   if concentration_bps <= threshold_bps {
///       0
///   } else {
///       excess = concentration_bps - threshold_bps
///       penalty = excess * slope_bps / 10_000
///   }
///
/// Example:
///   threshold = 4000 BPS (40%)
///   slope = 3600 BPS (0.36)
///   At 90% concentration (9000 BPS):
///     excess = 5000 BPS
///     penalty = 5000 * 3600 / 10000 = 1800 BPS (18.00%)
///     Effective LTV drops from 70% to 52%!
///   At 50/50 balanced (5000 BPS):
///     excess = 1000 BPS
///     penalty = 1000 * 3600 / 10000 = 360 BPS (3.60%)
///     Effective LTV is 66.4%
pub fn calculate_concentration_penalty(
    concentration_bps: u64,
    threshold_bps: u64,
    slope_bps: u64,
) -> Result<u64> {
    if concentration_bps <= threshold_bps {
        return Ok(0);
    }
    let excess = concentration_bps
        .checked_sub(threshold_bps)
        .ok_or(CircuitError::MathOverflow)?;
    let penalty = (excess as u128)
        .checked_mul(slope_bps as u128)
        .ok_or(CircuitError::MathOverflow)?
        / BPS_SCALE_U128;
    Ok(penalty.min(BPS_SCALE_U128) as u64)
}

/// Calculates the Effective LTV in BPS after applying concentration haircut.
///
/// Effective LTV = max(min_ltv_floor, base_ltv - concentration_penalty)
pub fn calculate_effective_ltv_with_concentration(
    base_ltv_bps: u64,
    concentration_bps: u64,
    threshold_bps: u64,
    slope_bps: u64,
    min_ltv_floor_bps: u64,
) -> Result<u64> {
    let penalty = calculate_concentration_penalty(concentration_bps, threshold_bps, slope_bps)?;
    let reduced_ltv = base_ltv_bps.saturating_sub(penalty);
    Ok(reduced_ltv.max(min_ltv_floor_bps))
}

// --------------------------------------------------------------
// Protocol Fee (Credit Execution / Origination) Calculation
// --------------------------------------------------------------

/// Calculates the protocol origination fee and net disbursed amount.
///
/// Formula:
///   fee_amount = (borrow_amount * fee_bps) / BPS_SCALE
///   net_amount = borrow_amount - fee_amount
///
/// Properties:
/// - Deterministic floor rounding (favors borrower, prevents fractional micro-token inflation)
/// - Zero arithmetic overflow via u128 intermediate
/// - If fee_enabled is false or fee_bps is 0: returns (0, borrow_amount)
pub fn calculate_protocol_fee(
    borrow_amount: u64,
    fee_bps: u64,
    fee_enabled: bool,
) -> Result<(u64, u64)> {
    if !fee_enabled || fee_bps == 0 {
        return Ok((0, borrow_amount));
    }

    require!(fee_bps <= MAX_BORROW_FEE_BPS, CircuitError::FeeBpsExceedsMaximum);

    let fee = (borrow_amount as u128)
        .checked_mul(fee_bps as u128)
        .ok_or(CircuitError::MathOverflow)?
        / BPS_SCALE_U128;

    let fee_u64 = fee as u64;
    let net_amount = borrow_amount
        .checked_sub(fee_u64)
        .ok_or(CircuitError::MathOverflow)?;

    Ok((fee_u64, net_amount))
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
    // -- Liquidation Collateral: net_expo >= 0 branch (uncovered until now) --
    //
    // net_expo = quote_decimals + expo - collateral_decimals
    // net_expo >= 0  →  price * scale is the denominator (ceiling-rounding branch)
    // net_expo <  0  →  numerator * scale / price (the previously-tested branch)
    //
    // The net_expo >= 0 branch fires when expo is large enough relative to the
    // decimal mismatch that the scale factor lives in the denominator, not the
    // numerator. Concretely: expo=-2, quote_decimals=6, col_decimals=8 → net=-4 (<0),
    // but expo=+2, quote_decimals=6, col_decimals=6 → net=+2 (>= 0).

    #[test]
    fn test_liquidation_collateral_net_expo_zero() {
        // net_expo = 0: quote_decimals(6) + expo(-6) - col_decimals(6) = -6 + 6 - 6 = -6? No.
        // Construct a case where net_expo == 0 exactly:
        //   quote_decimals = 6, expo = -2, col_decimals = 4
        //   net_expo = 6 + (-2) - 4 = 0
        //
        // price = 100 at expo=-2 means raw price = 10_000 (i.e., $100.00)
        // debt  = 500_0000 (= $50 in 6-dec USDC)
        // bonus = 1000 BPS = 10%
        // debt_with_bonus = 500_0000 * 11000 / 10000 = 5_500_000 (= $55)
        //
        // net_expo = 0 → denominator = price * pow10(0) = 10_000 * 1 = 10_000
        // collateral = ceil(5_500_000 / 10_000) = 550  (in 4-dec token units = 0.0550)
        let col = calculate_liquidation_collateral(
            5_000_000,    // $50 debt (6 dec USDC)
            10_000,       // $100 price (expo=-2, so 10_000 raw = $100.00)
            -2,           // expo
            1000,         // 10% bonus
            4,            // collateral_decimals = 4
            6,            // quote_decimals = 6
        ).unwrap();
        // debt_with_bonus = 5_000_000 * 11_000 / 10_000 = 5_500_000
        // denominator = 10_000 * pow10(0) = 10_000
        // collateral  = ceil(5_500_000 / 10_000) = 550
        assert_eq!(col, 550);
    }

    #[test]
    fn test_liquidation_collateral_net_expo_positive() {
        // net_expo = +2: quote_decimals(8) + expo(-2) - col_decimals(4) = +2
        // price = 50_000 at expo=-2 → $500.00
        // debt  = 500_000_000 ($5 in 8-dec quote)
        // bonus = 500 BPS = 5%
        // debt_with_bonus = 500_000_000 * 10_500 / 10_000 = 525_000_000
        // denominator = 50_000 * pow10(2) = 50_000 * 100 = 5_000_000
        // collateral = ceil(525_000_000 / 5_000_000) = ceil(105) = 105 (exact)
        let col = calculate_liquidation_collateral(
            500_000_000,  // $5 debt (8-dec quote)
            50_000,       // $500 price (expo=-2, raw 50_000)
            -2,           // expo
            500,          // 5% bonus
            4,            // collateral_decimals = 4
            8,            // quote_decimals = 8  → net_expo = 8-2-4 = +2
        ).unwrap();
        assert_eq!(col, 105);
    }

    #[test]
    fn test_liquidation_collateral_net_expo_positive_ceiling() {
        // Same setup as above but debt_with_bonus is NOT evenly divisible by denominator.
        // This explicitly tests the ceiling-rounding `+= denominator - 1` step.
        // debt = 500_000_003 → debt_with_bonus = 525_000_003 (not divisible by 5_000_000)
        // floor would be 105, ceil should be 106
        let col = calculate_liquidation_collateral(
            500_000_003,  // debt slightly above $5
            50_000,       // $500 price
            -2,
            500,          // 5% bonus
            4,            // col_decimals
            8,            // quote_decimals  → net_expo = +2
        ).unwrap();
        // debt_with_bonus = 500_000_003 * 10_500 / 10_000 = 525_000_003 (integer)
        // denominator = 5_000_000
        // ceil(525_000_003 / 5_000_000) = ceil(105.0000006) = 106
        assert_eq!(col, 106);
    }

    // -- Dynamic Liquidation Bonus Tests --

    #[test]
    fn test_dynamic_bonus_healthy_returns_min() {
        // HF >= 10000 (healthy or at boundary) -> returns min_bonus (500)
        let bonus_at_threshold = calculate_dynamic_liquidation_bonus(10_000, 10_000, 500, 1500, 1000).unwrap();
        assert_eq!(bonus_at_threshold, 500);

        let bonus_healthy = calculate_dynamic_liquidation_bonus(12_000, 10_000, 500, 1500, 1000).unwrap();
        assert_eq!(bonus_healthy, 500);
    }

    #[test]
    fn test_dynamic_bonus_slight_shortfall() {
        // HF = 9900 (shortfall = 100 BPS = 1%)
        // slope = 1000 BPS (0.10x) -> additional = 100 * 1000 / 10000 = 10 BPS
        // bonus = 500 + 10 = 510 BPS
        let bonus = calculate_dynamic_liquidation_bonus(9_900, 10_000, 500, 1500, 1000).unwrap();
        assert_eq!(bonus, 510);
    }

    #[test]
    fn test_dynamic_bonus_moderate_shortfall() {
        // HF = 8000 (shortfall = 2000 BPS = 20%)
        // slope = 1000 BPS -> additional = 2000 * 1000 / 10000 = 200 BPS
        // bonus = 500 + 200 = 700 BPS
        let bonus = calculate_dynamic_liquidation_bonus(8_000, 10_000, 500, 1500, 1000).unwrap();
        assert_eq!(bonus, 700);
    }

    #[test]
    fn test_dynamic_bonus_saturation_cap() {
        // HF = 0 (shortfall = 10000 BPS)
        // slope = 2000 BPS (0.20x) -> raw addition = 10000 * 2000 / 10000 = 2000 BPS
        // raw bonus = 500 + 2000 = 2500 BPS -> clamped to max_bonus 1500 BPS
        let bonus = calculate_dynamic_liquidation_bonus(0, 10_000, 500, 1500, 2000).unwrap();
        assert_eq!(bonus, 1500);
    }

    #[test]
    fn test_dynamic_bonus_zero_slope_fallback() {
        // slope = 0 -> bonus remains fixed at min_bonus regardless of severity
        let bonus = calculate_dynamic_liquidation_bonus(5_000, 10_000, 500, 1500, 0).unwrap();
        assert_eq!(bonus, 500);
    }

    #[test]
    fn test_dynamic_bonus_invalid_params_rejected() {
        // min_bonus > max_bonus
        let err1 = calculate_dynamic_liquidation_bonus(8_000, 10_000, 2000, 1500, 1000);
        assert!(err1.is_err());

        // min_health_factor = 0
        let err2 = calculate_dynamic_liquidation_bonus(0, 0, 500, 1500, 1000);
        assert!(err2.is_err());
    }

    #[test]
    fn test_dynamic_bonus_large_values_no_panic() {
        // Extreme values: max u64 inputs should not panic or overflow
        let bonus = calculate_dynamic_liquidation_bonus(0, u64::MAX, 500, 1500, 1000).unwrap();
        assert_eq!(bonus, 1500);
    }

    #[test]
    fn test_dynamic_bonus_collateral_seizure_integration() {
        // Compare collateral seized under mild vs severe distress
        // Setup: $500 debt, price $100 (10B, expo -8), 6 decimals
        // 1. Mild distress: HF = 9500 -> bonus = 500 + 50 = 550 BPS (5.5%)
        //    debt_with_bonus = 500 * 1.055 = $527.50 -> 5.275 tokens = 5_275_000
        let bonus_mild = calculate_dynamic_liquidation_bonus(9_500, 10_000, 500, 1500, 1000).unwrap();
        assert_eq!(bonus_mild, 550);
        let col_mild = calculate_liquidation_collateral(500_000_000, 10_000_000_000, -8, bonus_mild, 6, 6).unwrap();
        assert_eq!(col_mild, 5_275_000);

        // 2. Severe crash: HF = 5000 -> bonus = 500 + 500 = 1000 BPS (10.0%)
        //    debt_with_bonus = 500 * 1.10 = $550.00 -> 5.500 tokens = 5_500_000
        let bonus_severe = calculate_dynamic_liquidation_bonus(5_000, 10_000, 500, 1500, 1000).unwrap();
        assert_eq!(bonus_severe, 1000);
        let col_severe = calculate_liquidation_collateral(500_000_000, 10_000_000_000, -8, bonus_severe, 6, 6).unwrap();
        assert_eq!(col_severe, 5_500_000);
        assert!(col_severe > col_mild);
    }

    // -- Tier 2 Dutch Auction Unit Tests --

    #[test]
    fn test_dutch_auction_bonus_slot_zero() {
        // At elapsed_slots = 0, bonus is exact min_bonus_bps (200 BPS = 2.0%)
        let bonus = calculate_dutch_auction_bonus(0, 150, 200, 1500).unwrap();
        assert_eq!(bonus, 200);
    }

    #[test]
    fn test_dutch_auction_bonus_midpoint() {
        // At elapsed_slots = 75 (halfway of 150), bonus = 200 + (75 * 1300 / 150) = 200 + 650 = 850 BPS (8.5%)
        let bonus = calculate_dutch_auction_bonus(75, 150, 200, 1500).unwrap();
        assert_eq!(bonus, 850);
    }

    #[test]
    fn test_dutch_auction_bonus_saturation() {
        // At elapsed_slots == duration (150) -> max_bonus_bps (1500)
        let bonus_at_end = calculate_dutch_auction_bonus(150, 150, 200, 1500).unwrap();
        assert_eq!(bonus_at_end, 1500);

        // At elapsed_slots > duration (e.g. 500) -> stays clamped at max_bonus_bps (1500)
        let bonus_past_end = calculate_dutch_auction_bonus(500, 150, 200, 1500).unwrap();
        assert_eq!(bonus_past_end, 1500);
    }

    #[test]
    fn test_dutch_auction_bonus_monotonicity() {
        // Ensure strictly non-decreasing ramp across entire auction duration
        let mut prev = 0u64;
        for slot in 0..=150 {
            let b = calculate_dutch_auction_bonus(slot, 150, 200, 1500).unwrap();
            assert!(b >= prev);
            assert!(b >= 200 && b <= 1500);
            prev = b;
        }
    }

    #[test]
    fn test_dutch_auction_invalid_params() {
        // min > max
        assert!(calculate_dutch_auction_bonus(10, 150, 1600, 1500).is_err());
        // duration == 0
        assert!(calculate_dutch_auction_bonus(10, 0, 200, 1500).is_err());
    }

    // -- Tier 2 Close Factor Unit Tests --

    #[test]
    fn test_close_factor_normal_debt_capped() {
        // Debt: $1,000 (1_000_000_000), close factor: 50% (5000 BPS), dust: $100
        let total_debt = 1_000_000_000;
        let dust = 100_000_000;
        let close_factor = 5_000;

        // Requested 0 (default max) -> 50% = $500
        let repay_default = calculate_close_factor_debt(total_debt, 0, close_factor, dust).unwrap();
        assert_eq!(repay_default, 500_000_000);

        // Requested $800 (> $500 max allowed) -> clamped to $500
        let repay_clamped = calculate_close_factor_debt(total_debt, 800_000_000, close_factor, dust).unwrap();
        assert_eq!(repay_clamped, 500_000_000);

        // Requested $300 (<= $500 max allowed) -> approved as $300
        let repay_partial = calculate_close_factor_debt(total_debt, 300_000_000, close_factor, dust).unwrap();
        assert_eq!(repay_partial, 300_000_000);
    }

    #[test]
    fn test_close_factor_dust_debt_allows_full() {
        // Debt: $50 (50_000_000) <= $100 dust threshold -> permits 100% full liquidation
        let total_debt = 50_000_000;
        let dust = 100_000_000;
        let close_factor = 5_000;

        let repay_dust = calculate_close_factor_debt(total_debt, 0, close_factor, dust).unwrap();
        assert_eq!(repay_dust, 50_000_000);
    }

    // -- Conservative Pyth Pricing & Concentration Unit Tests --

    #[test]
    fn test_conservative_pyth_price() {
        // Price: $140.00 (14_000_000_000), conf: $2.00 (200_000_000)
        let price = 14_000_000_000i64;
        let conf = 200_000_000u64;
        let conservative = calculate_conservative_pyth_price(price, conf).unwrap();
        assert_eq!(conservative, 13_800_000_000i64); // $138.00

        // Zero confidence -> conservative price == reported price
        let zero_conf = calculate_conservative_pyth_price(price, 0).unwrap();
        assert_eq!(zero_conf, price);

        // Conf >= price -> error (invalid price)
        assert!(calculate_conservative_pyth_price(price, 15_000_000_000u64).is_err());
    }

    #[test]
    fn test_confidence_ratio_bps() {
        // Price: $100.00 (10_000_000_000), conf: $0.50 (50_000_000) -> 50 BPS (0.50%)
        let ratio = calculate_confidence_ratio_bps(10_000_000_000, 50_000_000).unwrap();
        assert_eq!(ratio, 50);

        // Price: $140.00, conf: 285 BPS (approx 2.85%)
        // conf = 140 * 285 / 10000 = 3.99 -> 399_000_000
        let ratio2 = calculate_confidence_ratio_bps(14_000_000_000, 399_000_000).unwrap();
        assert_eq!(ratio2, 285);
    }

    #[test]
    fn test_concentration_penalty_and_effective_ltv() {
        // Base LTV: 7000 BPS (70.0%), Threshold: 4000 BPS (40.0%), Slope: 3600 BPS (0.36)
        let base_ltv = 7_000;
        let threshold = 4_000;
        let slope = 3_600;
        let floor = 3_000;

        // 1. Under or at threshold (30% or 40% concentration) -> 0 penalty, full 70% LTV
        let penalty_low = calculate_concentration_penalty(3_000, threshold, slope).unwrap();
        assert_eq!(penalty_low, 0);
        let ltv_low = calculate_effective_ltv_with_concentration(base_ltv, 3_000, threshold, slope, floor).unwrap();
        assert_eq!(ltv_low, 7_000);

        // 2. 50/50 Balanced Portfolio (50% = 5000 BPS)
        // excess = 1000 BPS, penalty = 1000 * 3600 / 10000 = 360 BPS (3.60%)
        // Effective LTV = 7000 - 360 = 6640 BPS (66.4%)
        let penalty_50 = calculate_concentration_penalty(5_000, threshold, slope).unwrap();
        assert_eq!(penalty_50, 360);
        let ltv_50 = calculate_effective_ltv_with_concentration(base_ltv, 5_000, threshold, slope, floor).unwrap();
        assert_eq!(ltv_50, 6_640);

        // 3. 90/10 Concentrated Portfolio (90% = 9000 BPS)
        // excess = 5000 BPS, penalty = 5000 * 3600 / 10000 = 1800 BPS (18.00%)
        // Effective LTV = 7000 - 1800 = 5200 BPS (52.00%)! Exactly matching user spec!
        let penalty_90 = calculate_concentration_penalty(9_000, threshold, slope).unwrap();
        assert_eq!(penalty_90, 1_800);
        let ltv_90 = calculate_effective_ltv_with_concentration(base_ltv, 9_000, threshold, slope, floor).unwrap();
        assert_eq!(ltv_90, 5_200);
    }

    // -- Protocol Fee (Origination) Tests --

    #[test]
    fn test_protocol_fee_default_rate() {
        // $1,000 borrow (1_000_000_000 native USDC) at 25 BPS (0.25%)
        // fee = 1000 * 0.0025 = $2.50 (2_500_000 native)
        // net = 1000 - 2.50 = $997.50 (997_500_000 native)
        let (fee, net) = calculate_protocol_fee(1_000_000_000, 25, true).unwrap();
        assert_eq!(fee, 2_500_000);
        assert_eq!(net, 997_500_000);
        assert_eq!(fee + net, 1_000_000_000);
    }

    #[test]
    fn test_protocol_fee_disabled() {
        let (fee, net) = calculate_protocol_fee(1_000_000_000, 25, false).unwrap();
        assert_eq!(fee, 0);
        assert_eq!(net, 1_000_000_000);
    }

    #[test]
    fn test_protocol_fee_zero_bps() {
        let (fee, net) = calculate_protocol_fee(1_000_000_000, 0, true).unwrap();
        assert_eq!(fee, 0);
        assert_eq!(net, 1_000_000_000);
    }

    #[test]
    fn test_protocol_fee_maximum_allowed_cap() {
        // 1000 BPS = 10.00%
        let (fee, net) = calculate_protocol_fee(1_000_000_000, 1_000, true).unwrap();
        assert_eq!(fee, 100_000_000); // $100
        assert_eq!(net, 900_000_000); // $900
    }

    #[test]
    fn test_protocol_fee_exceeds_maximum_errors() {
        // 1001 BPS > MAX_BORROW_FEE_BPS (1000)
        let result = calculate_protocol_fee(1_000_000_000, 1_001, true);
        assert!(result.is_err());
    }

    #[test]
    fn test_protocol_fee_floor_rounding() {
        // 100 native units at 25 BPS -> 100 * 25 / 10_000 = 0.25 -> 0 native units fee
        let (fee, net) = calculate_protocol_fee(100, 25, true).unwrap();
        assert_eq!(fee, 0);
        assert_eq!(net, 100);
    }

    #[test]
    fn test_protocol_fee_large_volume_no_overflow() {
        // 100 million USDC ($100M = 100_000_000_000_000 native)
        let borrow_amt = 100_000_000_000_000u64;
        let (fee, net) = calculate_protocol_fee(borrow_amt, 25, true).unwrap();
        assert_eq!(fee, 250_000_000_000); // $250,000
        assert_eq!(net, 99_750_000_000_000); // $99,750,000
        assert_eq!(fee + net, borrow_amt);
    }

    // -- Minimum-Restoration Liquidation Tests --

    #[test]
    fn test_minimum_restoration_exact_math() {
        // Collateral: 10 NVDA at $80 = $800 value (800_000_000 native)
        // Debt: $700 (700_000_000 native)
        // Threshold: 8000 BPS (80%), Bonus: 500 BPS (5%)
        // Target HF: 10500 BPS (1.05)
        // Dust threshold: $100 (100_000_000 native)
        let total_debt = 700_000_000;
        let collateral_value = 800_000_000;
        let threshold = 8_000;
        let target_hf = 10_500;
        let bonus = 500;
        let dust = 100_000_000;

        let min_debt = calculate_minimum_restoration_debt(
            total_debt,
            collateral_value,
            threshold,
            target_hf,
            bonus,
            dust,
        ).unwrap();

        // Mathematical d* = ceil(9,500,000,000 / 21,000,000) = 452_380_953 native ($452.38)
        assert_eq!(min_debt, 452_380_953);

        // Verify that after repaying min_debt and seizing collateral with 5% bonus:
        // Remaining debt:
        let new_debt = total_debt - min_debt;
        // Collateral value seized: min_debt * (10_000 + 500) / 10_000
        let seized_val = (min_debt as u128) * 10_500 / 10_000;
        let new_collateral_val = collateral_value - seized_val;
        // Resulting HF: (new_collateral_val * 8_000) / (new_debt * 10_000)
        let resulting_hf = calculate_health_factor(new_collateral_val, threshold, new_debt).unwrap();

        // Resulting HF must be >= target_hf (10500)
        assert!(resulting_hf >= target_hf, "Resulting HF {} must be >= target {}", resulting_hf, target_hf);
    }

    #[test]
    fn test_minimum_restoration_dust_debt_triggers_full() {
        // Debt: $80 <= $100 dust threshold -> 100% full liquidation
        let min_debt = calculate_minimum_restoration_debt(
            80_000_000,
            100_000_000,
            8_000,
            10_500,
            500,
            100_000_000,
        ).unwrap();
        assert_eq!(min_debt, 80_000_000);
    }

    #[test]
    fn test_minimum_restoration_dust_residual_triggers_full() {
        // Debt: $500. Suppose calculated d* is $450.
        // Remaining debt would be $50 <= $100 dust threshold.
        // Engine must liquidate full $500 to prevent leaving unserviceable dust!
        let total_debt = 500_000_000;
        let collateral_value = 520_000_000;
        let min_debt = calculate_minimum_restoration_debt(
            total_debt,
            collateral_value,
            8_000,
            10_500,
            500,
            100_000_000,
        ).unwrap();
        assert_eq!(min_debt, total_debt);
    }

    #[test]
    fn test_minimum_restoration_deeply_underwater_returns_full() {
        // Position has $1,000 debt but only $200 collateral value
        let min_debt = calculate_minimum_restoration_debt(
            1_000_000_000,
            200_000_000,
            8_000,
            10_500,
            500,
            100_000_000,
        ).unwrap();
        assert_eq!(min_debt, 1_000_000_000);
    }

    #[test]
    fn test_minimum_restoration_healthy_returns_zero() {
        // Position has $1,000 collateral value and only $500 debt (HF = 1.6 > 1.05)
        let min_debt = calculate_minimum_restoration_debt(
            500_000_000,
            1_000_000_000,
            8_000,
            10_500,
            500,
            100_000_000,
        ).unwrap();
        assert_eq!(min_debt, 0);
    }

    #[test]
    fn test_dutch_auction_price_properties() {
        // Reference: $100 -> start $95, floor $80 over 150 slots
        let start_price = 95_0000_0000i64; // $95
        let floor_price = 80_0000_0000i64; // $80
        let duration = 150u64;

        // 1. Boundary at t = 0
        let p0 = calculate_dutch_auction_price(start_price, floor_price, 0, duration).unwrap();
        assert_eq!(p0, start_price, "P(0) must equal start_price");

        // 2. Boundary at t = T
        let pt = calculate_dutch_auction_price(start_price, floor_price, duration, duration).unwrap();
        assert_eq!(pt, floor_price, "P(T) must equal floor_price");

        // 3. Boundary at t > T (saturation/expiry)
        let p_past = calculate_dutch_auction_price(start_price, floor_price, duration + 500, duration).unwrap();
        assert_eq!(p_past, floor_price, "P(t > T) must equal floor_price");

        // 4. Midpoint price at t = T / 2
        let p_mid = calculate_dutch_auction_price(start_price, floor_price, 75, duration).unwrap();
        let expected_mid = 87_5000_0000i64; // $87.50
        assert_eq!(p_mid, expected_mid, "P(T/2) must equal exact linear midpoint");

        // 5. Monotonic non-increasing property: P(t) <= P(t-1) for all t in [1..T]
        let mut prev_p = start_price;
        for t in 1..=duration {
            let p_curr = calculate_dutch_auction_price(start_price, floor_price, t, duration).unwrap();
            assert!(
                p_curr <= prev_p,
                "Price at slot {} ({}) must be <= price at slot {} ({})",
                t, p_curr, t - 1, prev_p
            );
            assert!(
                p_curr >= floor_price && p_curr <= start_price,
                "Price at slot {} ({}) must be bounded within [{}, {}]",
                t, p_curr, floor_price, start_price
            );
            prev_p = p_curr;
        }
    }

    #[test]
    fn test_minimum_restoration_optimality_property() {
        // Given an unhealthy position:
        // Debt D = $700.00 (700_000_000 quote units)
        // Collateral V = $800.00 (800_000_000 quote units)
        // Liq Threshold tau = 8000 BPS (80%)
        // Target HF h* = 10500 BPS (1.05)
        // Bonus beta = 10500 BPS (5% bonus, beta = 1.05)
        // Current HF: (800 * 0.80) / 700 = 0.914285 (< 1.05 -> unhealthy)
        let total_debt = 700_000_000u64;
        let collateral_val = 800_000_000u128;
        let tau = 8_000u64;
        let target_hf = 10_500u64;
        let bonus = 500u64;
        let dust = 100_000_000u64;

        let d_star = calculate_minimum_restoration_debt(
            total_debt,
            collateral_val,
            tau,
            target_hf,
            bonus,
            dust,
        ).unwrap();

        // 1. Prove safe(d*) == true
        let remaining_debt = total_debt - d_star;
        let seized_val = (d_star as u128) * (10_000 + bonus as u128) / 10_000;
        let remaining_coll = collateral_val - seized_val;
        let hf_at_d_star = calculate_health_factor(remaining_coll, tau, remaining_debt).unwrap();
        assert!(
            hf_at_d_star >= target_hf,
            "Health factor at d* ({}) must satisfy target HF ({})",
            hf_at_d_star, target_hf
        );

        // Verify exact unrounded condition at d*: (V - d* * beta) * tau >= (D - d*) * target_hf
        let lhs_d_star = remaining_coll * (tau as u128);
        let rhs_d_star = (remaining_debt as u128) * (target_hf as u128);
        assert!(lhs_d_star >= rhs_d_star, "At d*, exact coverage must be satisfied");

        // 2. Prove for any d < d* (e.g. d* - 10_000 or $0.01 shortfall), safe(d) == false
        let shortfall_d = d_star.saturating_sub(100_000); // $0.10 under-repayment
        if shortfall_d > 0 {
            let under_rem_debt = total_debt - shortfall_d;
            let under_seized = (shortfall_d as u128) * (10_000 + bonus as u128) / 10_000;
            let under_rem_coll = collateral_val - under_seized;
            let hf_under = calculate_health_factor(under_rem_coll, tau, under_rem_debt).unwrap();
            assert!(
                hf_under < target_hf,
                "Health factor at shortfall d ({}) MUST be strictly below target HF ({})",
                hf_under, target_hf
            );
        }
    }
}

