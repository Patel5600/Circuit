use anchor_lang::prelude::*;
use crate::state::enums::{CustodyState, LiquidityState};

pub const BPS_SCALE: u32 = 10_000;

/// Structured component breakdown of the dynamic risk score.
/// All scores are strictly bounded integers in basis points: [0, 10_000].
/// Zero floating-point arithmetic.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace, Default)]
pub struct RiskScoreBreakdown {
    /// Market condition score: session status, trading validity (0..10_000)
    pub market_score: u32,
    /// Oracle risk score: confidence interval ratio and freshness (0..10_000)
    pub oracle_score: u32,
    /// Capital condition score: custody and liquidity states (0..10_000)
    pub capital_score: u32,
    /// Unified composite risk score (0..10_000)
    pub composite_score: u32,
}

impl RiskScoreBreakdown {
    /// Deterministically calculate the component scores and composite score.
    pub fn compute(
        market_open: bool,
        conf_ratio_bps: u64,
        oracle_age: u64,
        max_oracle_age: u64,
        custody_state: CustodyState,
        liquidity_state: LiquidityState,
    ) -> Self {
        // 1. Oracle Score
        let oracle_conf_score = if conf_ratio_bps > 300 {
            10_000 // Extreme uncertainty -> maximum penalty
        } else if conf_ratio_bps > 150 {
            // Scale linearly between 6_000 and 10_000
            6_000 + (((conf_ratio_bps - 150) as u32 * 4_000) / 150)
        } else if conf_ratio_bps > 50 {
            // Scale linearly between 3_500 and 6_000
            3_500 + (((conf_ratio_bps - 50) as u32 * 2_500) / 100)
        } else {
            // Scale linearly between 0 and 3_500
            ((conf_ratio_bps as u32) * 3_500) / 50
        };

        let oracle_age_score = if max_oracle_age > 0 {
            let age_ratio = (oracle_age.min(max_oracle_age) as u32 * BPS_SCALE) / max_oracle_age as u32;
            if oracle_age > max_oracle_age {
                10_000
            } else {
                age_ratio / 2 // Up to 5_000 penalty for age approaching limit
            }
        } else {
            0
        };

        let oracle_score = oracle_conf_score.max(oracle_age_score).min(BPS_SCALE);

        // 2. Market Score (NYSE reference market calendar)
        let market_score = if !market_open {
            3_500 // When reference market is closed, base score starts at Restricted boundary
        } else {
            0 // Nominal during active trading hours
        };

        // 3. Capital Score (custody + liquidity)
        let custody_score = match custody_state {
            CustodyState::Healthy => 0,
            CustodyState::Delayed => 4_000,
            CustodyState::Impaired => 10_000,
        };

        let liquidity_score = match liquidity_state {
            LiquidityState::Deep => 0,
            LiquidityState::Normal => 500,
            LiquidityState::Thin => 4_000,
            LiquidityState::Critical => 10_000,
        };

        let capital_score = custody_score.max(liquidity_score).min(BPS_SCALE);

        // 4. Deterministic Composite Aggregation
        // If any catastrophic condition is present (Impaired custody, Critical liquidity, or conf > 300),
        // composite immediately clamps to Emergency severity (10_000).
        let composite_score = if custody_state == CustodyState::Impaired
            || liquidity_state == LiquidityState::Critical
            || conf_ratio_bps > 300
            || oracle_age > max_oracle_age
        {
            10_000
        } else {
            // Take the dominant risk factor as the primary driver, plus fractional contribution
            let max_component = oracle_score.max(market_score).max(capital_score);
            let sum_others = (oracle_score + market_score + capital_score).saturating_sub(max_component);
            // Dominant component (80% weight) + other components (up to 20% weight)
            let composite = ((max_component as u64 * 8_000) + (sum_others as u64 * 1_000)) / BPS_SCALE as u64;
            (composite as u32).max(max_component).min(BPS_SCALE)
        };

        Self {
            market_score,
            oracle_score,
            capital_score,
            composite_score,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_nominal_conditions_produce_low_score() {
        let b = RiskScoreBreakdown::compute(
            true,  // market open
            20,    // 0.20% conf ratio (tight)
            5,     // 5s old
            60,    // max 60s
            CustodyState::Healthy,
            LiquidityState::Deep,
        );
        assert!(b.composite_score <= 2_500, "Nominal conditions must be within Safe bound, got {}", b.composite_score);
        assert_eq!(b.market_score, 0);
        assert_eq!(b.capital_score, 0);
    }

    #[test]
    fn test_market_closed_triggers_restricted_score() {
        let b = RiskScoreBreakdown::compute(
            false, // market closed
            20,    // 0.20% conf
            5,
            60,
            CustodyState::Healthy,
            LiquidityState::Deep,
        );
        assert!(b.composite_score >= 3_500, "Market closed must produce >= 3,500, got {}", b.composite_score);
        assert_eq!(b.market_score, 3_500);
    }

    #[test]
    fn test_impaired_custody_clamps_to_max_emergency() {
        let b = RiskScoreBreakdown::compute(
            true,
            10,
            5,
            60,
            CustodyState::Impaired,
            LiquidityState::Deep,
        );
        assert_eq!(b.composite_score, 10_000);
        assert_eq!(b.capital_score, 10_000);
    }

    #[test]
    fn test_stale_oracle_clamps_to_max_emergency() {
        let b = RiskScoreBreakdown::compute(
            true,
            10,
            75, // 75s > max 60s
            60,
            CustodyState::Healthy,
            LiquidityState::Deep,
        );
        assert_eq!(b.composite_score, 10_000);
    }

    #[test]
    fn test_wide_confidence_scales_to_defensive_and_emergency() {
        let def = RiskScoreBreakdown::compute(
            true,
            200, // 2.0% conf > 150 bps
            5,
            60,
            CustodyState::Healthy,
            LiquidityState::Deep,
        );
        assert!(def.composite_score >= 6_000, "200 bps conf must produce Defensive score >= 6_000, got {}", def.composite_score);

        let emg = RiskScoreBreakdown::compute(
            true,
            350, // 3.5% conf > 300 bps
            5,
            60,
            CustodyState::Healthy,
            LiquidityState::Deep,
        );
        assert_eq!(emg.composite_score, 10_000);
    }
}
