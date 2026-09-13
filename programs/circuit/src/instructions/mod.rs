// Each instruction module exposes a `handler` function. The glob re-exports
// below are required so that Anchor's generated `__client_accounts_*` modules
// resolve at the crate root, which means the several `handler` symbols collide
// in the value namespace. Handlers are always called through their fully
// qualified module path (e.g. `instructions::borrow::handler`), so the
// ambiguity is harmless and is silenced here rather than crate-wide.
#![allow(ambiguous_glob_reexports)]

pub mod initialize_protocol;
pub mod register_asset;
pub mod set_custody_state;
pub mod set_liquidity_state;
pub mod refresh_guard;
pub mod deposit;
pub mod borrow;
pub mod repay;
pub mod withdraw;
pub mod liquidate;
pub mod start_liquidation_auction;
pub mod cancel_liquidation_auction;
pub mod liquidate_auction;
pub mod pause;

pub use initialize_protocol::*;
pub use register_asset::*;
pub use set_custody_state::*;
pub use set_liquidity_state::*;
pub use refresh_guard::*;
pub use deposit::*;
pub use borrow::*;
pub use repay::*;
pub use withdraw::*;
pub use liquidate::*;
pub use start_liquidation_auction::*;
pub use cancel_liquidation_auction::*;
pub use liquidate_auction::*;
pub use pause::*;

