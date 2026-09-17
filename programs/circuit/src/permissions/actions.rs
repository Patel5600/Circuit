use anchor_lang::prelude::*;
use crate::state::enums::AgentAction;

/// Canonical on-chain action types across credit, recovery, and liquidity execution venues.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum CircuitAction {
    // ── Credit Execution Venue ──
    Deposit,
    Borrow,
    Repay,
    Withdraw,
    Liquidate,

    // ── Meteora DBC / Liquidity Execution Venue ──
    EnterLiquidity,
    ExitLiquidity,
    Swap,
    Rebalance,
}

impl From<AgentAction> for CircuitAction {
    fn from(action: AgentAction) -> Self {
        match action {
            AgentAction::Deposit => CircuitAction::Deposit,
            AgentAction::Borrow => CircuitAction::Borrow,
            AgentAction::Repay => CircuitAction::Repay,
            AgentAction::Withdraw => CircuitAction::Withdraw,
        }
    }
}

impl CircuitAction {
    /// Whether this action is risk-reducing (always permitted even in stress/emergency).
    pub fn is_risk_reducing(&self) -> bool {
        matches!(self, CircuitAction::Deposit | CircuitAction::Repay | CircuitAction::Liquidate | CircuitAction::ExitLiquidity)
    }

    /// Whether this action increases credit or exposure risk.
    pub fn is_risk_increasing(&self) -> bool {
        matches!(self, CircuitAction::Borrow | CircuitAction::Withdraw | CircuitAction::EnterLiquidity | CircuitAction::Swap)
    }
}
