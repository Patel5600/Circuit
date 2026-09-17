use anchor_lang::prelude::*;

/// Classification of risk rate of change.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace, Default)]
pub enum RiskVelocityTrend {
    #[default]
    Stable,
    Improving,
    Deteriorating,
    RapidDeterioration,
}

/// Threshold in basis points per second for rapid deterioration
pub const RAPID_DETERIORATION_BPS_PER_SEC: i32 = 50;

/// Compute the rate of risk deterioration per second (signed i32 in bps/sec).
/// Defends against zero elapsed time, negative time jumps, and arithmetic overflow.
pub fn calculate_risk_velocity(
    current_score: u32,
    previous_score: u32,
    elapsed_seconds: i64,
) -> (i32, RiskVelocityTrend) {
    if elapsed_seconds <= 0 {
        return (0, RiskVelocityTrend::Stable);
    }

    let delta_score = (current_score as i64) - (previous_score as i64);
    let velocity_i64 = delta_score / elapsed_seconds;

    let velocity_clamped = if velocity_i64 > (i32::MAX as i64) {
        i32::MAX
    } else if velocity_i64 < (i32::MIN as i64) {
        i32::MIN
    } else {
        velocity_i64 as i32
    };

    let trend = if velocity_clamped > RAPID_DETERIORATION_BPS_PER_SEC {
        RiskVelocityTrend::RapidDeterioration
    } else if velocity_clamped > 5 {
        RiskVelocityTrend::Deteriorating
    } else if velocity_clamped < -5 {
        RiskVelocityTrend::Improving
    } else {
        RiskVelocityTrend::Stable
    };

    (velocity_clamped, trend)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_zero_elapsed_time_returns_zero_and_stable() {
        let (v, t) = calculate_risk_velocity(5_000, 2_000, 0);
        assert_eq!(v, 0);
        assert_eq!(t, RiskVelocityTrend::Stable);
    }

    #[test]
    fn test_negative_elapsed_time_returns_zero_and_stable() {
        let (v, t) = calculate_risk_velocity(5_000, 2_000, -10);
        assert_eq!(v, 0);
        assert_eq!(t, RiskVelocityTrend::Stable);
    }

    #[test]
    fn test_rapid_deterioration_detection() {
        // Score jumped +3,000 in 10 seconds = +300 bps/sec > 50 bps/sec
        let (v, t) = calculate_risk_velocity(5_000, 2_000, 10);
        assert_eq!(v, 300);
        assert_eq!(t, RiskVelocityTrend::RapidDeterioration);
    }

    #[test]
    fn test_improving_trend_detection() {
        // Score dropped -2,000 in 100 seconds = -20 bps/sec
        let (v, t) = calculate_risk_velocity(3_000, 5_000, 100);
        assert_eq!(v, -20);
        assert_eq!(t, RiskVelocityTrend::Improving);
    }

    #[test]
    fn test_stable_velocity() {
        let (v, t) = calculate_risk_velocity(2_010, 2_000, 10);
        assert_eq!(v, 1);
        assert_eq!(t, RiskVelocityTrend::Stable);
    }
}
