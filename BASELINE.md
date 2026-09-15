# Circuit Protocol — Baseline Freeze (Phase 1)

**Timestamp**: 2026-09-15  
**Git Commit**: `eeb5d6c4f3b4ca3a118ca503d99d89ff72d44f3e` (`hotfix`)  
**Repository Branch**: `publish` / `main`  
**Solana Cluster**: Solana Devnet (`https://api.devnet.solana.com`)  

---

## 1. On-Chain Identity & Deployment Configuration

- **Program ID**: `Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2`
- **Anchor Framework**: `1.2.0`
- **Solana Toolchain**: `3.1.10` / Rust `1.96.0`
- **Pyth Receiver SDK**: `pyth-solana-receiver-sdk 2.0.0`
- **Pyth Receiver Program**: `rec5EKMGg6MxZYaMdyBfgwp4d5rCZzfKMi14Kbjghbh`
- **Canonical Treasury**: `7AALMsZ5MuioSW7BMwBCwTmy9Y1fMJ6MKXAELYyrtb4`
- **Protocol Authority**: `F5JmuDsKh9oswAhR9rJSfL2PGU1UpQF2cN3n7NjZrFAT`

### Deployed Devnet PDAs & Vaults (`devnet/deployment.json`)

| Entity | Address | Derivation Seeds |
| :--- | :--- | :--- |
| **ProtocolConfig** | `3LsZqeX8FHnZRv2nm5jYemPa27HwSQAeddivvmR3mMo2` | `["protocol"]` |
| **AssetConfig (NVDA)** | `6t8y6uVyVErLYojBsFLzT6f9MaC7HK6E3ZSqxiPi5buY` | `["asset", equity_mint]` |
| **MarketGuard (NVDA)** | `DizJguRRNvHsjztrCpoqrjd39GCQLoYWMwERQvPnpYkW` | `["guard", pyth_feed_id]` |
| **Collateral Vault (NVDA)** | `648UXSZRrkdKTjyxnyV7hvvBX3hchSoYPyoMGqrmazn2` | ATA(`protocol_config`, `equity_mint`) |
| **Liquidity Vault (USDC)** | `BA2FW1ZtEFqDxEsnyHTowLsS5qaVpHj94jM5VJ5RULeU` | ATA(`protocol_config`, `quote_mint`) |
| **Equity Mint (NVDA)** | `CARqKy5GTCxz5G1tFiYA96A3Q8jaUE9Vppk7cjGJxRqq` | Decimals: 6 |
| **Quote Mint (USDC)** | `23hpSsK3h4na3pwSUf1YzaDF9nzX3t2PppJJf16Qpkxc` | Decimals: 6 |
| **Deployer Position** | `787f2ezwbxfTyaDFyyhh1FnwCvGAhUXEMUxDcCaKQuYB` | `["position", deployer, equity_mint]` |
| **Pyth Price Feed (NVDA)**| `0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d` | Feed ID |
| **Pyth Price Account** | `7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE` | Derived PriceUpdateV2 |

---

## 2. Test Verification Baseline

### Exact Test Counts
1. **Mocha Test Suites (`tests/**/*.test.ts`)**: **117 passing (2s), 0 failures**
   - Live Onchain Equity Market Terminal Tests: 13 passing
   - Multi-Asset Portfolio Risk Intelligence Tests: 7 passing
   - On-Chain Activity Pattern Engine Tests: 5 passing
   - Circuit Pipeline Architecture & Narrative Invariants: 11 passing
   - Protocol Hardening & Risk Ratchet Invariant Tests: 17 passing
   - Circuit Risk Engine Unit Tests: 16 passing
   - Wallet State Machine & Network Safety Tests: 7 passing
   - Faucet Limits, Decimal Safety, Economics: 41 passing
2. **LiteSVM Protocol Scenarios (`tests/circuit.ts`)**: **73 passing (9s), 0 failures**
   - 1. Protocol initialization (4 tests)
   - 2. Asset registration (4 tests)
   - 3. Admin authorization (4 tests)
   - 4. Deposit (3 tests)
   - 5. Borrow happy path (4 tests)
   - 6. Borrow capacity (3 tests)
   - 7. Reference market session gate (4 tests)
   - 8. Oracle staleness (2 tests)
   - 9. Oracle confidence width (3 tests)
   - 10. Oracle identity binding (2 tests)
   - 11. Custody state gating (3 tests)
   - 12. Liquidity state gating (3 tests)
   - 13. Pause semantics (6 tests)
   - 14. Repay (4 tests)
   - 15. Withdraw (5 tests)
   - 16. Liquidation (6 tests)
   - 17. Refresh guard observability (5 tests)
   - 18. Tier 2 Dutch Auction & Partial Liquidation (8 tests)

**Total Test Count**: **117 Unit/Integration Tests + 73 LiteSVM On-Chain Scenarios**.

---

## 3. Current Account Structures

1. `ProtocolConfig`:
   - `authority: Pubkey`
   - `paused: bool`
   - `version: u16`
   - `min_health_factor_bps: u64` (10,000 = 1.0)
   - `default_max_oracle_age: u64`
   - `default_max_conf_bps: u64`
   - `liquidation_bonus_bps: u64`
   - `fee_recipient: Pubkey`
   - `borrow_fee_bps: u64`
   - `fee_enabled: bool`
   - `bump: u8`

2. `AssetConfig`:
   - `authority: Pubkey`
   - `mint: Pubkey`
   - `pyth_feed_id: [u8; 32]`
   - `base_ltv_bps: u64`
   - `liquidation_threshold_bps: u64`
   - `liquidation_bonus_bps: u64`
   - `max_oracle_age: u64`
   - `max_conf_bps: u64`
   - `custody_state: CustodyState`
   - `liquidity_state: LiquidityState`
   - `enabled: bool`
   - `quote_mint: Pubkey`
   - `bump: u8`

3. `MarketGuard`:
   - `feed_id: [u8; 32]`
   - `last_valid_price: i64`
   - `last_valid_expo: i32`
   - `last_publish_time: i64`
   - `market_state: MarketState`
   - `reason: GuardReason`
   - `last_checked_slot: u64`
   - `bump: u8`

4. `Position`:
   - `owner: Pubkey`
   - `asset: Pubkey`
   - `collateral_amount: u64`
   - `debt_amount: u64`
   - `last_valid_price: i64`
   - `last_valid_expo: i32`
   - `state: PositionState`
   - `bump: u8`

5. `RiskRatchet`:
   - `feed_id: [u8; 32]`
   - `state: MarketState`
   - `reason: GuardReason`
   - `risk_epoch: u64`
   - `consecutive_healthy_observations: u32`
   - `last_stress_slot: u64`
   - `last_updated_slot: u64`
   - `bump: u8`

6. `LiquidationAuction`:
   - `position: Pubkey`
   - `start_slot: u64`
   - `start_price: i64`
   - `start_expo: i32`
   - `initial_debt: u64`
   - `initiator: Pubkey`
   - `bump: u8`

---

## 4. Current Instruction List

| Instruction | Signer | Mutates | Description |
| :--- | :--- | :--- | :--- |
| `initialize_protocol` | Admin | `ProtocolConfig` | Initializes singleton config |
| `register_asset` | Admin | `AssetConfig`, `MarketGuard`, Vaults | Registers equity mint & Pyth feed |
| `set_custody_state` | Admin | `AssetConfig` | Sets custody simulation state |
| `set_liquidity_state`| Admin | `AssetConfig` | Sets liquidity simulation state |
| `pause_protocol` | Admin | `ProtocolConfig` | Sets `paused = true` |
| `unpause_protocol` | Admin | `ProtocolConfig` | Sets `paused = false` |
| `update_fee_config` | Admin | `ProtocolConfig` | Updates fee recipient & BPS |
| `refresh_guard` | Permissionless | `MarketGuard`, `RiskRatchet` | Refreshes cached market state |
| `deposit` | User | `Position`, Vault | Deposits equity collateral |
| `borrow` | User | `Position`, Vaults, Treasury | Borrows quote tokens (all gates checked) |
| `repay` | User | `Position`, Vault | Repays borrowed debt |
| `withdraw` | User | `Position`, Vault | Withdraws equity collateral |
| `liquidate` | Liquidator | `Position`, Vaults | Full liquidation of unhealthy position |
| `start_liquidation_auction` | Permissionless | `LiquidationAuction` | Starts Dutch auction if HF < 1.0 |
| `cancel_liquidation_auction`| Permissionless | `LiquidationAuction` | Cancels auction if restored to healthy |
| `liquidate_auction` | Liquidator | `Position`, `LiquidationAuction`, Vaults | Dutch auction liquidation with close factor |

---

## 5. Verified Security Invariants & Known Limitations

### Verified Invariants
- **Borrow Gate**: Borrowing is blocked if oracle stale, confidence > max, market closed, custody delayed/impaired, liquidity thin/critical, or protocol paused.
- **Emergency Price**: When current oracle is unusable, liquidation evaluates at `last_valid_price` without throwing `StaleOracle`.
- **Hysteresis**: Recovery requires 5 consecutive healthy observations; no direct `Emergency -> Safe` jumps.
- **Treasury Settlement**: Fees are routed directly to `7AALMsZ5MuioSW7BMwBCwTmy9Y1fMJ6MKXAELYyrtb4` during borrow origination.

### Current MVP Limitations
1. **CapitalPolicy On-Chain State**: Permissions currently derived in instruction handlers rather than stored/emitted as an explicit `CapitalPolicy` account or typed struct.
2. **Partial Liquidation Restoration**: `liquidate_auction` uses a fixed 50% close factor rather than computing the exact minimum debt repayment required to restore health to the target condition.
3. **Fixed LTV**: Base LTV is fixed per asset (70%), dynamic portfolio concentration scoring is intentionally stubbed/separated as designed.
