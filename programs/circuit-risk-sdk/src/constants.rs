use anchor_lang::prelude::{pubkey, Pubkey};

/// Canonical Program ID for Circuit Protocol
pub const CIRCUIT_PROGRAM_ID: Pubkey = pubkey!("Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2");

// ── Venue Identifiers ──────────────────────────────────────────────
pub const VENUE_CREDIT: u8 = 0;
pub const VENUE_METEORA_DBC: u8 = 1;
pub const VENUE_TRADING: u8 = 2;

// ── Action Identifiers ─────────────────────────────────────────────
pub const ENVELOPE_ACTION_BORROW: u8 = 1;
pub const ENVELOPE_ACTION_WITHDRAW: u8 = 2;
pub const ENVELOPE_ACTION_SWAP: u8 = 3;
pub const ENVELOPE_ACTION_ENTER_LIQUIDITY: u8 = 4;
pub const ENVELOPE_ACTION_EXIT_LIQUIDITY: u8 = 5;
pub const ENVELOPE_ACTION_REBALANCE: u8 = 6;
pub const ENVELOPE_ACTION_REPAY: u8 = 7;
pub const ENVELOPE_ACTION_DEPOSIT: u8 = 8;

// ── PDA Seed Prefixes ──────────────────────────────────────────────
pub const ENVELOPE_SEEDS_PREFIX: &[u8] = b"envelope";

// ── Slot TTL Constants ─────────────────────────────────────────────
pub const DEFAULT_ENVELOPE_TTL_SLOTS: u64 = 20;
pub const MAX_ENVELOPE_TTL_SLOTS: u64 = 100;

// ── Risk State Constants ───────────────────────────────────────────
pub const RISK_STATE_SAFE: u8 = 0;
pub const RISK_STATE_RESTRICTED: u8 = 1;
pub const RISK_STATE_DEFENSIVE: u8 = 2;
pub const RISK_STATE_EMERGENCY: u8 = 3;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_constants() {
        assert_eq!(
            CIRCUIT_PROGRAM_ID.to_string(),
            "Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2"
        );

        assert_eq!(VENUE_CREDIT, 0);
        assert_eq!(VENUE_METEORA_DBC, 1);
        assert_eq!(VENUE_TRADING, 2);

        assert_eq!(ENVELOPE_ACTION_BORROW, 1);
        assert_eq!(ENVELOPE_ACTION_WITHDRAW, 2);
        assert_eq!(ENVELOPE_ACTION_SWAP, 3);
        assert_eq!(ENVELOPE_ACTION_ENTER_LIQUIDITY, 4);
        assert_eq!(ENVELOPE_ACTION_EXIT_LIQUIDITY, 5);
        assert_eq!(ENVELOPE_ACTION_REBALANCE, 6);
        assert_eq!(ENVELOPE_ACTION_REPAY, 7);
        assert_eq!(ENVELOPE_ACTION_DEPOSIT, 8);

        assert_eq!(ENVELOPE_SEEDS_PREFIX, b"envelope");
        assert_eq!(DEFAULT_ENVELOPE_TTL_SLOTS, 20);
        assert_eq!(MAX_ENVELOPE_TTL_SLOTS, 100);

        assert_eq!(RISK_STATE_SAFE, 0);
        assert_eq!(RISK_STATE_RESTRICTED, 1);
        assert_eq!(RISK_STATE_DEFENSIVE, 2);
        assert_eq!(RISK_STATE_EMERGENCY, 3);
    }
}

