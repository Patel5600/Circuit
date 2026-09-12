use anchor_lang::prelude::*;
use crate::errors::CircuitError;

// ==============================================================
// NYSE Reference Market Session Validation
// ==============================================================
//
// WARNING: This is a deterministic MVP calendar for demo purposes.
// It is NOT an authoritative NYSE calendar.
//
// Before mainnet: replace with an audited/authoritative calendar source
// or an on-chain calendar oracle.
//
// The holiday table covers 2025-2026 NYSE observed holidays.
// DST transitions follow US federal rules:
//   - Spring forward: 2nd Sunday of March at 02:00 local
//   - Fall back: 1st Sunday of November at 02:00 local
//
// The calendar dependency is fully isolated behind this module boundary.
// To replace: implement a new `is_market_open()` with the same signature.
// ==============================================================

/// NYSE core regular session: 09:30 to 16:00 Eastern Time
const MARKET_OPEN_HOUR: u32 = 9;
const MARKET_OPEN_MIN: u32 = 30;
const MARKET_CLOSE_HOUR: u32 = 16;
const MARKET_CLOSE_MIN: u32 = 0;

/// UTC offset for US Eastern Standard Time (EST)
const EST_OFFSET: i64 = -5 * 3600;

/// UTC offset for US Eastern Daylight Time (EDT)
const EDT_OFFSET: i64 = -4 * 3600;

/// Seconds per day
const SECS_PER_DAY: i64 = 86400;

/// Check if the reference NYSE market is currently open.
///
/// Returns `true` if the given UTC unix timestamp falls within:
/// - A weekday (Mon-Fri)
/// - Not an observed NYSE holiday
/// - Within 09:30-16:00 Eastern Time
///
/// Returns `false` otherwise.
pub fn is_market_open(unix_timestamp: i64) -> Result<bool> {
    require!(unix_timestamp > 0, CircuitError::InvalidTimestamp);

    // Convert UTC to Eastern Time
    let et_offset = eastern_time_offset(unix_timestamp);
    let et_timestamp = unix_timestamp
        .checked_add(et_offset)
        .ok_or(CircuitError::MathOverflow)?;

    // Extract date components
    let (year, month, day) = timestamp_to_date(et_timestamp);
    let dow = day_of_week(year, month, day);

    // Check weekday (0=Mon .. 6=Sun)
    if dow >= 5 {
        return Ok(false); // Saturday or Sunday
    }

    // Check holidays
    if is_nyse_holiday(year, month, day) {
        return Ok(false);
    }

    // Check early close
    let close_hour = if is_early_close(year, month, day) { 13 } else { MARKET_CLOSE_HOUR };
    let close_min = if is_early_close(year, month, day) { 0 } else { MARKET_CLOSE_MIN };

    // Extract time of day
    let secs_into_day = ((et_timestamp % SECS_PER_DAY) + SECS_PER_DAY) % SECS_PER_DAY;
    let hour = (secs_into_day / 3600) as u32;
    let minute = ((secs_into_day % 3600) / 60) as u32;

    // Check within 09:30 - close
    let after_open = (hour > MARKET_OPEN_HOUR) ||
                     (hour == MARKET_OPEN_HOUR && minute >= MARKET_OPEN_MIN);
    let before_close = (hour < close_hour) ||
                       (hour == close_hour && minute < close_min);

    Ok(after_open && before_close)
}

// --------------------------------------------------------------
// Eastern Time DST Calculation
// --------------------------------------------------------------

/// Determines whether the given UTC timestamp is in EDT or EST.
/// US DST rules: 2nd Sunday of March -> 1st Sunday of November.
fn eastern_time_offset(utc_ts: i64) -> i64 {
    // Get date in UTC
    let (year, month, day) = timestamp_to_date(utc_ts);
    let hour = ((utc_ts % SECS_PER_DAY + SECS_PER_DAY) % SECS_PER_DAY / 3600) as u32;

    if month < 3 || month > 11 {
        return EST_OFFSET; // Jan, Feb, Dec -> EST
    }
    if month > 3 && month < 11 {
        return EDT_OFFSET; // Apr-Oct -> EDT
    }

    if month == 3 {
        // 2nd Sunday of March
        let second_sunday = nth_dow_of_month(year, 3, 6, 2); // 6 = Sunday
        if day < second_sunday {
            return EST_OFFSET;
        }
        if day > second_sunday {
            return EDT_OFFSET;
        }
        // On the day itself: transition at 2:00 AM EST (7:00 AM UTC)
        if hour < 7 { EST_OFFSET } else { EDT_OFFSET }
    } else {
        // month == 11: 1st Sunday of November
        let first_sunday = nth_dow_of_month(year, 11, 6, 1);
        if day < first_sunday {
            return EDT_OFFSET;
        }
        if day > first_sunday {
            return EST_OFFSET;
        }
        // On the day: transition at 2:00 AM EDT (6:00 AM UTC)
        if hour < 6 { EDT_OFFSET } else { EST_OFFSET }
    }
}

// --------------------------------------------------------------
// NYSE Holiday Calendar (2025-2026)
// --------------------------------------------------------------

/// Returns true if the given date is an NYSE observed holiday.
///
/// NOTE: This table covers 2025 and 2026 only.
/// For other years, returns false (conservative: market assumed open).
fn is_nyse_holiday(year: i32, month: u32, day: u32) -> bool {
    match year {
        2025 => matches!((month, day),
            (1, 1)   | // New Year's Day
            (1, 9)   | // National Day of Mourning (Jimmy Carter)
            (1, 20)  | // MLK Day
            (2, 17)  | // Presidents Day
            (4, 18)  | // Good Friday
            (5, 26)  | // Memorial Day
            (6, 19)  | // Juneteenth
            (7, 4)   | // Independence Day
            (9, 1)   | // Labor Day
            (11, 27) | // Thanksgiving
            (12, 25)   // Christmas
        ),
        2026 => matches!((month, day),
            (1, 1)   | // New Year's Day
            (1, 19)  | // MLK Day
            (2, 16)  | // Presidents Day
            (4, 3)   | // Good Friday
            (5, 25)  | // Memorial Day
            (6, 19)  | // Juneteenth
            (7, 3)   | // Independence Day (observed, July 4 is Saturday)
            (9, 7)   | // Labor Day
            (11, 26) | // Thanksgiving
            (12, 25)   // Christmas
        ),
        _ => false, // Unknown year - assume market open (conservative for testing)
    }
}

/// Returns true if the given date is an NYSE early close day (1:00 PM ET).
fn is_early_close(year: i32, month: u32, day: u32) -> bool {
    match year {
        2025 => matches!((month, day),
            (7, 3)   | // Day before Independence Day
            (11, 28) | // Day after Thanksgiving
            (12, 24)   // Christmas Eve
        ),
        2026 => matches!((month, day),
            (11, 27) | // Day after Thanksgiving
            (12, 24)   // Christmas Eve
        ),
        _ => false,
    }
}

// --------------------------------------------------------------
// Date/Time Utility Functions
// --------------------------------------------------------------

/// Converts a unix timestamp to (year, month, day) using civil date calculation.
/// Based on Howard Hinnant's algorithm.
fn timestamp_to_date(ts: i64) -> (i32, u32, u32) {
    let z = (ts / SECS_PER_DAY) + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u32; // day of era [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = (yoe as i64 + era * 400) as i32;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

/// Day of week: 0=Monday, 1=Tuesday, ..., 6=Sunday
/// Uses Tomohiko Sakamoto's algorithm.
fn day_of_week(year: i32, month: u32, day: u32) -> u32 {
    let t = [0i32, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
    let y = if month < 3 { year - 1 } else { year };
    let dow = (y + y / 4 - y / 100 + y / 400 + t[(month - 1) as usize] + day as i32) % 7;
    // Sakamoto returns 0=Sunday, we want 0=Monday
    ((dow + 6) % 7) as u32
}

/// Returns the day-of-month for the Nth occurrence of a day-of-week.
/// dow: 0=Monday .. 6=Sunday
/// n: 1=first, 2=second, etc.
fn nth_dow_of_month(year: i32, month: u32, target_dow: u32, n: u32) -> u32 {
    let first_dow = day_of_week(year, month, 1);
    let offset = (target_dow + 7 - first_dow) % 7;
    1 + offset + 7 * (n - 1)
}


// ==============================================================
// Unit Tests
// ==============================================================

#[cfg(test)]
mod tests {
    use super::*;

    // Helper: create a UTC timestamp for a given ET date/time
    fn et_to_utc(year: i32, month: u32, day: u32, hour: u32, min: u32, is_dst: bool) -> i64 {
        let days = date_to_days(year, month, day);
        let secs = days * SECS_PER_DAY + (hour as i64) * 3600 + (min as i64) * 60;
        if is_dst {
            secs - EDT_OFFSET // Convert ET to UTC (subtract offset which is negative)
        } else {
            secs - EST_OFFSET
        }
    }

    fn date_to_days(year: i32, month: u32, day: u32) -> i64 {
        // Inverse of timestamp_to_date: returns days since epoch
        let y = if month <= 2 { year as i64 - 1 } else { year as i64 };
        let m = if month <= 2 { month + 9 } else { month - 3 };
        let era = if y >= 0 { y } else { y - 399 } / 400;
        let yoe = (y - era * 400) as u32;
        let doy = (153 * m as u32 + 2) / 5 + day - 1;
        let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
        (era * 146097 + doe as i64) - 719468
    }

    #[test]
    fn test_weekday_market_open() {
        // Wednesday Sept 10, 2025, 10:00 AM ET (EDT)
        let ts = et_to_utc(2025, 9, 10, 10, 0, true);
        assert!(is_market_open(ts).unwrap());
    }

    #[test]
    fn test_weekday_before_open() {
        // Wednesday Sept 10, 2025, 9:00 AM ET (before 9:30)
        let ts = et_to_utc(2025, 9, 10, 9, 0, true);
        assert!(!is_market_open(ts).unwrap());
    }

    #[test]
    fn test_weekday_at_open() {
        // Wednesday Sept 10, 2025, 9:30 AM ET
        let ts = et_to_utc(2025, 9, 10, 9, 30, true);
        assert!(is_market_open(ts).unwrap());
    }

    #[test]
    fn test_weekday_at_close() {
        // Wednesday Sept 10, 2025, 4:00 PM ET (market closes AT 4:00, so 4:00 = closed)
        let ts = et_to_utc(2025, 9, 10, 16, 0, true);
        assert!(!is_market_open(ts).unwrap());
    }

    #[test]
    fn test_saturday_closed() {
        // Saturday Sept 13, 2025
        let ts = et_to_utc(2025, 9, 13, 12, 0, true);
        assert!(!is_market_open(ts).unwrap());
    }

    #[test]
    fn test_sunday_closed() {
        // Sunday Sept 14, 2025
        let ts = et_to_utc(2025, 9, 14, 12, 0, true);
        assert!(!is_market_open(ts).unwrap());
    }

    #[test]
    fn test_holiday_closed() {
        // Thursday Nov 27, 2025 - Thanksgiving
        let ts = et_to_utc(2025, 11, 27, 12, 0, false);
        assert!(!is_market_open(ts).unwrap());
    }

    #[test]
    fn test_christmas_closed() {
        // Thursday Dec 25, 2025
        let ts = et_to_utc(2025, 12, 25, 12, 0, false);
        assert!(!is_market_open(ts).unwrap());
    }

    #[test]
    fn test_early_close_before_1pm() {
        // Friday Nov 28, 2025 - Day after Thanksgiving, early close at 1:00 PM
        let ts = et_to_utc(2025, 11, 28, 12, 30, false);
        assert!(is_market_open(ts).unwrap()); // 12:30 PM -> still open
    }

    #[test]
    fn test_early_close_after_1pm() {
        // Friday Nov 28, 2025 - early close
        let ts = et_to_utc(2025, 11, 28, 13, 0, false);
        assert!(!is_market_open(ts).unwrap()); // 1:00 PM -> closed
    }

    #[test]
    fn test_mlk_day_2026() {
        // Monday Jan 19, 2026 - MLK Day
        let ts = et_to_utc(2026, 1, 19, 12, 0, false);
        assert!(!is_market_open(ts).unwrap());
    }

    #[test]
    fn test_normal_day_2026() {
        // Tuesday Jan 20, 2026 - normal trading day
        let ts = et_to_utc(2026, 1, 20, 12, 0, false);
        assert!(is_market_open(ts).unwrap());
    }

    #[test]
    fn test_day_of_week_known_dates() {
        // 2025-01-01 = Wednesday
        assert_eq!(day_of_week(2025, 1, 1), 2);
        // 2025-09-12 = Friday
        assert_eq!(day_of_week(2025, 9, 12), 4);
        // 2025-09-13 = Saturday
        assert_eq!(day_of_week(2025, 9, 13), 5);
        // 2025-09-14 = Sunday
        assert_eq!(day_of_week(2025, 9, 14), 6);
    }

    #[test]
    fn test_invalid_timestamp() {
        assert!(is_market_open(0).is_err());
        assert!(is_market_open(-1).is_err());
    }
}
