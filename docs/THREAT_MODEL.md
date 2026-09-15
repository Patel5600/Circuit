# Circuit Protocol: Threat Model & Attack Vector Analysis

This document provides a comprehensive threat model for the Circuit Protocol (`Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2`). It analyzes 20 distinct attack vectors across system boundaries, detailing attack mechanics, trust assumptions, onchain mitigations, and residual risks.

---

## Threat Matrix Summary

| ID | Attack Vector | Boundary | Severity | Mitigation Status |
| :---: | :--- | :--- | :---: | :---: |
| **V01** | Oracle Price Spoofing / Fake Feed | Pyth Receiver $\rightarrow$ Program | Critical | **Mitigated** |
| **V02** | Oracle Price Staleness / Time Lag | Pyth Receiver $\rightarrow$ Clock Sysvar | High | **Mitigated** |
| **V03** | Wide Oracle Confidence Exploitation | Pyth Receiver $\rightarrow$ Math Engine | High | **Mitigated** |
| **V04** | Adversarial Oracle Update Selection | Mempool / RPC $\rightarrow$ Program | High | **Mitigated** |
| **V05** | Account Substitution (Arbitrary Input) | Client $\rightarrow$ Anchor Runtime | Critical | **Mitigated** |
| **V06** | PDA Spoofing & Seed Collisions | Client $\rightarrow$ PDA Derivation | Critical | **Mitigated** |
| **V07** | Signer Substitution & Impersonation | Transaction Signers $\rightarrow$ Program | Critical | **Mitigated** |
| **V08** | Arithmetic Overflow & Underflow | Math Engine $\rightarrow$ State Engine | Critical | **Mitigated** |
| **V09** | Precision Loss & Rounding Exploits | Math Engine $\rightarrow$ Vault Transfers | Medium | **Mitigated** |
| **V10** | Unauthorized Protocol Configuration | Admin Boundary $\rightarrow$ Protocol State | Critical | **Mitigated** |
| **V11** | Premature Liquidation Manipulation | Liquidator $\rightarrow$ Borrower Position | High | **Mitigated** |
| **V12** | Frozen Reference Price Economic Divergence | Oracle Disruptions $\rightarrow$ Liquidator | High | **Partially Mitigated (MVP Design)** |
| **V13** | Market Calendar Logic & DST Desync | Traditional Calendar $\rightarrow$ Solana Time | Medium | **Mitigated (MVP Calendar)** |
| **V14** | Admin Pause Abuse & Fund Hostage | Admin Boundary $\rightarrow$ Protocol Invariants | High | **Mitigated** |
| **V15** | Vault Insolvency via Liquidity Depletion | Borrow Engine $\rightarrow$ SPL Token Vault | High | **Mitigated** |
| **V16** | Token Mint Substitution (Fake Collateral) | Client $\rightarrow$ SPL Token Program | Critical | **Mitigated** |
| **V17** | Token Account / Vault Authority Spoofing | Client $\rightarrow$ SPL Token Program | Critical | **Mitigated** |
| **V18** | Replay & Reentrancy State Manipulation | Solana Runtime $\rightarrow$ Program Context | Medium | **Mitigated** |
| **V19** | Cached MarketGuard Observability Hijacking | Keeper / Cranker $\rightarrow$ User Engine | High | **Mitigated** |
| **V20** | Dust Deposit & Account Spam Griefing | Client $\rightarrow$ Solana Rent Engine | Low | **Mitigated** |
| **V21** | Liquidation Griefing & Under-Restoration | Liquidator $\rightarrow$ Borrower Position | High | **Mitigated** |
| **V22** | Dutch Auction Frontrunning & Decay Exploitation | MEV Searcher $\rightarrow$ Auction PDA | High | **Mitigated** |
| **V23** | Capital Policy Bypass via Direct Instruction Calls | Caller $\rightarrow$ Core Instruction Engine | Critical | **Mitigated** |
| **V24** | Rounding Direction & Precision Exploitation | Math Engine $\rightarrow$ Liquidation Settlement | Medium | **Mitigated** |

---

## Detailed Attack Vector Analysis

### Vector 01: Oracle Price Spoofing / Fake Feed
- **Attack Description**: An attacker deploys a malicious mock Pyth account containing an artificially inflated price for tokenized equities (e.g., reporting NVDA at $1,000,000) and passes it to [`borrow`](file:///c:/Dev/Circuit/programs/circuit/src/instructions/borrow.rs#L18) to drain the quote token liquidity vault.
- **Trust Boundary**: Pyth Receiver Program (`rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ`) $\rightarrow$ Circuit Program.
- **Mitigation Implemented**:
  1. [`borrow.rs`](file:///c:/Dev/Circuit/programs/circuit/src/instructions/borrow.rs#L149) types `price_update` strictly as `Account<'info, PriceUpdateV2>`, enforcing deserialization against the Pyth Receiver program ID.
  2. [`validate_pyth_price`](file:///c:/Dev/Circuit/programs/circuit/src/oracle/validation.rs#L47) requires that the feed ID inside the verified account strictly equals `AssetConfig.pyth_feed_id`.
  3. Rejects with [`CircuitError::InvalidFeed`](file:///c:/Dev/Circuit/programs/circuit/src/errors.rs#L25) on mismatch.
- **Remaining Risk**: A compromise of Pyth Network's authoritative publisher quorum or the Pyth Solana Receiver program key would impact price integrity.

---

### Vector 02: Oracle Price Staleness / Time Lag
- **Attack Description**: An attacker presents a valid historical Pyth price update that was recorded hours or days prior when the underlying equity was trading significantly higher, borrowing against obsolete valuations after a steep stock decline.
- **Trust Boundary**: Pyth Receiver $\rightarrow$ Solana Cluster Clock Sysvar.
- **Mitigation Implemented**:
  1. [`validate_pyth_price`](file:///c:/Dev/Circuit/programs/circuit/src/oracle/validation.rs#L59) invokes Pyth SDK's `get_price_no_older_than(clock, max_age, expected_feed_id)`.
  2. Enforces that `clock.unix_timestamp - price_data.publish_time <= max_age` (configurable per asset in `AssetConfig.max_oracle_age`).
  3. Reverts with [`CircuitError::StaleOracle`](file:///c:/Dev/Circuit/programs/circuit/src/errors.rs#L29) if the price timestamp exceeds the freshness window.
- **Remaining Risk**: If Solana cluster clock drifts significantly from real UTC time during network congestion, the freshness window may stretch or compress slightly relative to wall-clock time.

---

### Vector 03: Wide Oracle Confidence Exploitation
- **Attack Description**: During extreme market opening auctions or corporate earnings releases, Pyth's confidence interval ($\pm \sigma$) widens dramatically due to exchange quotation dispersion. An attacker attempts to borrow against the mid-market price while actual market bids are far lower.
- **Trust Boundary**: Pyth Receiver $\rightarrow$ Math Engine.
- **Mitigation Implemented**:
  1. In [`fixed_point.rs`](file:///c:/Dev/Circuit/programs/circuit/src/math/fixed_point.rs#L230), [`is_confidence_acceptable`](file:///c:/Dev/Circuit/programs/circuit/src/math/fixed_point.rs#L230) computes the ratio $\frac{\text{conf} \times 10000}{\text{price}}$.
  2. If the ratio exceeds `AssetConfig.max_conf_bps`, [`validate_pyth_price`](file:///c:/Dev/Circuit/programs/circuit/src/oracle/validation.rs#L72) rejects the price with [`CircuitError::ConfidenceTooWide`](file:///c:/Dev/Circuit/programs/circuit/src/errors.rs#L33).
- **Remaining Risk**: If `max_conf_bps` is configured too loosely by governance, excessive uncertainty could be accepted.

---

### Vector 04: Adversarial Oracle Update Selection
- **Attack Description**: An attacker or MEV searcher bundles multiple Pyth price updates into an atomic transaction or selectively posts a favorable price from a private Hermes cache to execute an undercollateralized borrow right before posting the real, lower price.
- **Trust Boundary**: Offchain Hermes API $\rightarrow$ Onchain Transaction Execution.
- **Mitigation Implemented**:
  1. Freshness window `max_oracle_age` is configured tightly (e.g., 30–60 seconds on mainnet, where Pyth pushes continuously). **Note:** devnet sponsored feeds are only pushed every few minutes (observed publish ages of 198s–291s for SOL/USD), so the devnet demo registers 600s. A mainnet-style bound makes borrowing fail almost always on devnet, and the loose devnet value materially widens this attack window — it is a demo accommodation, not a recommended production setting.
  2. Borrow capacity is restricted by conservative `base_ltv_bps` (e.g., 70% or lower), providing a 30% margin buffer against intra-minute ticks.
  3. Market session gating ensures borrowing is only active when NYSE continuous order book trading is open and deep.
- **Remaining Risk**: High-frequency intra-block MEV can still exploit price discrepancies within the `max_oracle_age` window if volatility exceeds the remaining LTV buffer.

---

### Vector 05: Account Substitution (Arbitrary Input)
- **Attack Description**: An attacker calls [`borrow`](file:///c:/Dev/Circuit/programs/circuit/src/instructions/borrow.rs#L18) or [`withdraw`](file:///c:/Dev/Circuit/programs/circuit/src/instructions/withdraw.rs#L19) passing their own Position PDA but substituting a victim's `AssetConfig` or an unrelated user's collateral vault to withdraw unauthorized collateral.
- **Trust Boundary**: Untrusted Transaction Account Keys $\rightarrow$ Anchor Account Deserialization.
- **Mitigation Implemented**:
  1. All account contexts enforce relational Anchor constraints:
     - `position.asset == asset_config.mint`
     - `collateral_mint.key() == asset_config.mint`
     - `quote_mint.key() == asset_config.quote_mint`
     - `collateral_vault.authority == protocol_config.key()`
  2. Violations immediately halt execution with [`CircuitError::InvalidAsset`](file:///c:/Dev/Circuit/programs/circuit/src/errors.rs#L17) or [`CircuitError::InvalidMint`](file:///c:/Dev/Circuit/programs/circuit/src/errors.rs#L81).
- **Remaining Risk**: None within program logic; Anchor guarantees account discriminator and key constraints prior to handler execution.

---

### Vector 06: PDA Spoofing & Seed Collisions
- **Attack Description**: An attacker crafts a rogue program or creates a standard keypair account whose address matches expected seeds or collides with a protocol PDA.
- **Trust Boundary**: Solana Runtime Account Ownership $\rightarrow$ Circuit Program.
- **Mitigation Implemented**:
  1. Anchor validates PDA addresses using `find_program_address` with the circuit program ID.
  2. All state structs derive with explicit canonical prefixes:
     - `ProtocolConfig`: `[b"protocol"]`
     - `AssetConfig`: `[b"asset", mint.as_ref()]`
     - `MarketGuard`: `[b"guard", pyth_feed_id.as_ref()]`
     - `Position`: `[b"position", owner.as_ref(), mint.as_ref()]`
  3. Anchor verifies that account owner equals the executing program ID (`Circuit`).
- **Remaining Risk**: SHA-256 collision across 32-byte seeds (cryptographically negligible).

---

### Vector 07: Signer Substitution & Impersonation
- **Attack Description**: An attacker passes a victim borrower's `Position` PDA into [`borrow`](file:///c:/Dev/Circuit/programs/circuit/src/instructions/borrow.rs#L18) or [`withdraw`](file:///c:/Dev/Circuit/programs/circuit/src/instructions/withdraw.rs#L19), signing the transaction with an attacker keypair to withdraw the victim's deposited equity collateral.
- **Trust Boundary**: Transaction Signature Verification $\rightarrow$ Position Ownership Invariant.
- **Mitigation Implemented**:
  1. Anchor marks `owner: Signer<'info>` in the account contexts.
  2. Handlers enforce strict equality:
     ```rust
     require!(position.owner == ctx.accounts.owner.key(), CircuitError::InvalidPositionOwner);
     ```
  3. PDA seeds for `Position` include `owner.key().as_ref()`, making it impossible to address another user's position using the attacker's signer.
- **Remaining Risk**: Compromise of the user's private key offchain.

---

### Vector 08: Arithmetic Overflow & Underflow
- **Attack Description**: An attacker deposits extreme token quantities (e.g., $2^{64}-1$) to trigger integer overflow during multiplication with Pyth price and decimals, wrapping the calculated collateral value to zero or a massive positive number to bypass health factor requirements.
- **Trust Boundary**: User Data Input $\rightarrow$ Math Calculation Routines.
- **Mitigation Implemented**:
  1. In [`fixed_point.rs`](file:///c:/Dev/Circuit/programs/circuit/src/math/fixed_point.rs#L51-L57), all multiplication inputs are upcast to `u128`.
  2. Explicit checked operations (`checked_mul`, `checked_add`, `checked_sub`) are used everywhere.
  3. Math overflows return explicit errors (`CircuitError::MathOverflow`) and halt the transaction.
- **Remaining Risk**: None; Rust checked math semantics prevent wrapping under all compilation profiles.

---

### Vector 09: Precision Loss & Rounding Exploits
- **Attack Description**: An attacker executes repeated micro-deposits, micro-borrows, or micro-liquidations to exploit integer truncation, slowly extracting dust fractions of tokens from the protocol vaults.
- **Trust Boundary**: Math Truncation $\rightarrow$ Token Vault Balance.
- **Mitigation Implemented**:
  1. Conservative rounding rules protect the protocol:
     - Collateral valuation rounds DOWN (`floor`), penalizing borrower capacity.
     - Maximum borrow capacity rounds DOWN (`floor`).
     - Liquidation collateral seizure rounds UP (`ceil`), ensuring debt is fully covered and liquidators are properly incentivized.
  2. Repayment rejects amounts greater than existing debt (`amount <= position.debt_amount`).
- **Remaining Risk**: Minimal sub-atomic dust accumulation (fractions of $10^{-6}$ cents).

---

### Vector 10: Unauthorized Protocol Configuration
- **Attack Description**: A malicious user invokes [`initialize_protocol`](file:///c:/Dev/Circuit/programs/circuit/src/instructions/initialize_protocol.rs#L9), [`register_asset`](file:///c:/Dev/Circuit/programs/circuit/src/instructions/register_asset.rs#L11), or [`pause_protocol`](file:///c:/Dev/Circuit/programs/circuit/src/instructions/pause.rs#L13) to hijack protocol authority or manipulate risk parameters.
- **Trust Boundary**: Admin Signature $\rightarrow$ System Control Logic.
- **Mitigation Implemented**:
  1. `initialize_protocol` uses `init` constraint on `ProtocolConfig` PDA; can only succeed once in program lifetime.
  2. Administrative instructions require:
     ```rust
     #[account(
         constraint = authority.key() == protocol_config.authority @ CircuitError::Unauthorized
     )]
     pub authority: Signer<'info>,
     ```
- **Remaining Risk**: In the MVP, authority resides in a single admin private key. If this key is leaked or compromised, unauthorized administrative updates are possible.

---

### Vector 11: Premature Liquidation Manipulation
- **Attack Description**: A predatory liquidator attempts to liquidate a healthy user position by passing a fake or manipulated oracle price, attempting to seize the user's collateral along with the 5% liquidation bonus.
- **Trust Boundary**: Liquidator $\rightarrow$ Borrower Equity Position.
- **Mitigation Implemented**:
  1. In [`liquidate.rs`](file:///c:/Dev/Circuit/programs/circuit/src/instructions/liquidate.rs#L74), the protocol independently recalculates the position health factor using verified oracle or frozen reference data:
     ```rust
     require!(hf < protocol.min_health_factor_bps, CircuitError::NotLiquidatable);
     ```
  2. A healthy position ($HF \ge \text{min\_health\_factor\_bps}$) unconditionally aborts with [`CircuitError::NotLiquidatable`](file:///c:/Dev/Circuit/programs/circuit/src/errors.rs#L61).
- **Remaining Risk**: Legitimate flash market crashes can cause health factors to legitimately drop below 1.0, triggering valid liquidation.

---

### Vector 12: Frozen Reference Price Economic Divergence
- **Attack Description**: During an extended weekend or oracle outage where an equity drops 50% offchain, the onchain protocol uses `last_valid_price` (pre-drop price). Liquidators could seize collateral at an outdated higher price valuation, resulting in economic losses for liquidators or lingering bad debt for the protocol.
- **Trust Boundary**: Emergency Reference Price Snapshot $\rightarrow$ Liquidator Market Execution.
- **Mitigation Implemented**:
  1. Permissionless liquidation ensures that liquidators make an autonomous economic decision whether to execute at the reference price.
  2. Liquidator must pay 100% of the debt to the liquidity vault regardless of collateral seized.
  3. The protocol liquidity vault receives full debt repayment in quote tokens, preserving vault solvency.
- **Remaining Risk**: If the real offchain equity value is lower than the debt value, liquidators will choose not to liquidate at the frozen price, leading to bad debt until oracle recovery.

---

### Vector 13: Market Calendar Logic & DST Desync
- **Attack Description**: An attacker borrows against equities during off-market hours by exploiting daylight saving time (DST) transition bugs or unlisted holidays in the deterministic calendar.
- **Trust Boundary**: Solana Unix Timestamp $\rightarrow$ NYSE Market Hours Engine.
- **Mitigation Implemented**:
  1. [`session.rs`](file:///c:/Dev/Circuit/programs/circuit/src/market/session.rs#L93) implements full US DST transition logic (2nd Sunday of March to 1st Sunday of November).
  2. Pre-calculated observed holiday table for 2025–2026 including early closes at 13:00 ET.
  3. Borrow and withdraw require `market::is_market_open(clock.unix_timestamp) == true`.
- **Remaining Risk**: Years beyond 2026 default to open weekdays in the MVP, and unexpected ad-hoc market holidays (e.g., weather emergencies or political mourning days not listed in code) require manual admin pause.

---

### Vector 14: Admin Pause Abuse & Fund Hostage
- **Attack Description**: A compromised or malicious admin calls [`pause_protocol`](file:///c:/Dev/Circuit/programs/circuit/src/instructions/pause.rs#L13) to extort users and freeze funds permanently inside protocol vaults.
- **Trust Boundary**: Protocol Administrator $\rightarrow$ User Capital Liquidity.
- **Mitigation Implemented**:
  1. [`repay`](file:///c:/Dev/Circuit/programs/circuit/src/instructions/repay.rs#L11) does NOT check the pause flag. Users can always eliminate their debt.
  2. [`liquidate`](file:///c:/Dev/Circuit/programs/circuit/src/instructions/liquidate.rs#L26) is permitted while paused, preventing systemic insolvency.
  3. [`deposit`](file:///c:/Dev/Circuit/programs/circuit/src/instructions/deposit.rs#L12) remains open, allowing users to increase margin safety.
  4. The admin has no instruction to seize or withdraw user funds from vaults directly.
- **Remaining Risk**: Collateral withdrawals for users with debt remain paused, locking user equity tokens until unpaused or debt is repaid.

---

### Vector 15: Vault Insolvency via Liquidity Depletion
- **Attack Description**: A borrower attempts to borrow more quote tokens than exist in the protocol liquidity vault, inducing runtime errors or leaving the protocol in an inconsistent accounting state.
- **Trust Boundary**: Borrow Engine $\rightarrow$ SPL Token Vault Balance.
- **Mitigation Implemented**:
  1. In [`borrow.rs`](file:///c:/Dev/Circuit/programs/circuit/src/instructions/borrow.rs#L86-L89):
     ```rust
     require!(ctx.accounts.liquidity_vault.amount >= amount, CircuitError::InsufficientLiquidity);
     ```
  2. If vault liquidity is depleted, new borrows fail cleanly with [`CircuitError::InsufficientLiquidity`](file:///c:/Dev/Circuit/programs/circuit/src/errors.rs#L105).
- **Remaining Risk**: Protocol debt liquidity relies on external liquidity providers or initial protocol funding.

---

### Vector 16: Token Mint Substitution (Fake Collateral)
- **Attack Description**: An attacker creates a worthless SPL token with 6 decimals, names it "NVDAx", and passes it as collateral to borrow real USDC.
- **Trust Boundary**: SPL Token Program $\rightarrow$ Asset Registry.
- **Mitigation Implemented**:
  1. In [`deposit.rs`](file:///c:/Dev/Circuit/programs/circuit/src/instructions/deposit.rs#L73) and [`borrow.rs`](file:///c:/Dev/Circuit/programs/circuit/src/instructions/borrow.rs#L153):
     ```rust
     constraint = collateral_mint.key() == asset_config.mint @ CircuitError::InvalidMint
     ```
  2. `AssetConfig` is derived strictly from `[b"asset", mint.key()]` and can only be initialized by the protocol authority.
- **Remaining Risk**: Admin registering an incorrect mint keypair during asset onboarding.

---

### Vector 17: Token Account / Vault Authority Spoofing
- **Attack Description**: An attacker attempts to execute a CPI transfer from the protocol vault by passing an arbitrary account or spoofing the vault's authority seeds.
- **Trust Boundary**: Program CPI $\rightarrow$ SPL Token Program.
- **Mitigation Implemented**:
  1. Vaults are initialized as Associated Token Accounts of the `ProtocolConfig` PDA.
  2. Transfers from the vault use canonical signer seeds:
     ```rust
     let seeds = &[ProtocolConfig::SEEDS, &[protocol.bump]];
     let signer_seeds = &[&seeds[..]];
     ```
  3. Solana's runtime prevents any external caller from signing for the `ProtocolConfig` PDA.
- **Remaining Risk**: None; enforced at the Solana kernel runtime level.

---

### Vector 18: Replay & Reentrancy State Manipulation
- **Attack Description**: An attacker leverages cross-program invocations to re-enter Circuit instructions during intermediate token balance updates before debt state is committed.
- **Trust Boundary**: Solana Transaction Execution Model.
- **Mitigation Implemented**:
  1. Solana uses an optimistic single-threaded per-account locking model. Accounts are locked for write during transaction execution, preventing reentrancy on the same accounts.
  2. All token transfers to/from vaults use the official SPL Token program, which contains no user-defined callbacks or hooks.
  3. Position state is modified atomically within the same transaction instruction handler.
- **Remaining Risk**: Complex transaction compositions involving multiple flash-lending protocols must ensure proper sequencing.

---

### Vector 19: Cached MarketGuard Observability Hijacking
- **Attack Description**: An attacker notices that `MarketGuard` was refreshed when the market was `Safe`. They wait until after market close (or an oracle failure) and attempt to borrow, relying on the cached `Safe` state in `MarketGuard`.
- **Trust Boundary**: Permissionless Crank $\rightarrow$ Core Credit Logic.
- **Mitigation Implemented**:
  1. [`MarketGuard`](file:///c:/Dev/Circuit/programs/circuit/src/state/market_guard.rs#L16) is strictly an observability PDA.
  2. [`borrow`](file:///c:/Dev/Circuit/programs/circuit/src/instructions/borrow.rs) and [`withdraw`](file:///c:/Dev/Circuit/programs/circuit/src/instructions/withdraw.rs) do NOT take or read `MarketGuard`.
  3. All oracle, session, and health factor checks are computed live within the borrower's transaction context.
- **Remaining Risk**: UI applications displaying cached `MarketGuard` data may display a stale status if offchain crankers fail to call `refresh_guard` frequently.

---

### Vector 20: Dust Deposit & Account Spam Griefing
- **Attack Description**: An attacker floods the protocol with millions of tiny 1-lamport / 1-token deposits across synthetic keypairs, attempting to bloat validator state or exhaust protocol data limits.
- **Trust Boundary**: Solana Rent Exemption & Account Allocation.
- **Mitigation Implemented**:
  1. [`deposit.rs`](file:///c:/Dev/Circuit/programs/circuit/src/instructions/deposit.rs#L13) requires `amount > 0`.
  2. Each position requires rent exemption in SOL (~0.0016 SOL per `Position` PDA), paid entirely by the user (`payer = owner`).
  3. Spamming creates a net-negative economic cost for the attacker with zero protocol degradation.
- **Remaining Risk**: Minor chain-wide ledger bloat if attacker is willing to burn substantial SOL rent capital.

---

### Vector 21: Liquidation Griefing & Under-Restoration
- **Attack Description**: An adversarial liquidator observes an unhealthy position and repeatedly repays a microscopic fraction of debt (e.g., 1 unit or dust amount). Each call claims the liquidation discount bonus and extracts borrower collateral without lifting the position back to a safe health factor ($\text{HF} \ge 1.05$), griefing the borrower and generating parasitic liquidator profit while leaving the protocol at systemic default risk.
- **Trust Boundary**: Liquidator $\rightarrow$ Borrower Position PDA.
- **Mitigation Implemented**:
  1. [`calculate_min_restoration_debt`](file:///c:/Dev/Circuit/programs/circuit/src/math/fixed_point.rs) mathematically solves for the exact minimum debt repayment $d^*$ needed to restore the position to $\text{HF}^* \ge 1.05$:
     $$d^* = \left\lceil \frac{D \cdot 10,000 \cdot h^* - V \cdot 10,000 \cdot \tau}{10,000 \cdot h^* - \beta \cdot \tau} \right\rceil$$
  2. [`liquidate_auction.rs`](file:///c:/Dev/Circuit/programs/circuit/src/instructions/liquidate_auction.rs) enforces `repay_amount >= min_restoration_debt`. Any repayment less than $d^*$ reverts with [`CircuitError::InsufficientLiquidationAmount`](file:///c:/Dev/Circuit/programs/circuit/src/errors.rs).
  3. If remaining debt $D - d^*$ falls below the dust threshold (\$100 / 100,000,000 units), full 100% liquidation is enforced ($d^* = D$) to eliminate insolvent tail risk.
- **Remaining Risk**: Extreme market gap down where position collateral value drops faster than liquidator execution can restore it (mitigated by Dutch auction dynamic discount incentives and liquidator keeper competition).
- **Test Coverage**: Tested in `tests/circuit.ts` Scenario 20.

---

### Vector 22: Dutch Auction Frontrunning & Decay Exploitation
- **Attack Description**: An MEV searcher or malicious liquidator attempts to exploit the dynamic Dutch auction mechanism by: (1) frontrunning other liquidators at high discount, (2) waiting maliciously until the discount reaches extreme levels to maximize collateral seizure at the borrower's expense, (3) creating duplicate concurrent auctions on the same position, or (4) executing double settlements on an already resolved auction.
- **Trust Boundary**: Liquidator / MEV Searcher $\rightarrow$ `LiquidationAuction` PDA.
- **Mitigation Implemented**:
  1. Clamped Linear Discount Ramp: Bonus begins at a conservative floor (`min_bonus_bps` = 200 bps / 2.0%) and linearly ramps over 150 slots to `max_bonus_bps` (1500 bps / 15.0%). The discount is strictly capped at 15.0%, preventing infinite price erosion.
  2. Canonical PDA Uniqueness: The `LiquidationAuction` PDA is uniquely seeded by `[b"auction", position.key().as_ref()]`. Duplicate attempts to initialize fail at the Solana runtime account allocation level.
  3. Atomic Closure & Single Settlement: Upon full repayment or restoration of health, the auction account is closed via Anchor's `close = initiator`, burning the account data and returning rent to the initiator. Replay or double settlement reverts with account-not-found.
- **Remaining Risk**: MEV priority fee competition among liquidators on mainnet.
- **Test Coverage**: Tested in `tests/circuit.ts` Scenarios 18 & 21.

---

### Vector 23: Capital Policy Bypass via Direct Instruction Calls
- **Attack Description**: An attacker bypasses frontend validation and calls [`borrow`](file:///c:/Dev/Circuit/programs/circuit/src/instructions/borrow.rs) or [`withdraw`](file:///c:/Dev/Circuit/programs/circuit/src/instructions/withdraw.rs) directly via RPC when the protocol is in `Restricted`, `Defensive`, or `Emergency` state (e.g. during off-market hours or during an oracle confidence anomaly), attempting to extract liquidity when risk policy forbids it.
- **Trust Boundary**: Untrusted Caller / Transaction $\rightarrow$ Circuit Core State Engine.
- **Mitigation Implemented**:
  1. Authoritative On-Chain Derivation: Permissions are never passed by the caller or accepted from off-chain inputs. Every instruction handler derives the `CapitalPolicy` dynamically from live on-chain invariants (`CapitalPolicy::from_risk_state(...)`).
  2. In `borrow.rs`: If `!policy.borrow_allowed`, execution immediately halts with `CircuitError::CapitalPolicyBlocked` or `CircuitError::InvalidCustodyState`.
  3. In `withdraw.rs`: If debt exists and `!policy.withdraw_allowed`, execution immediately halts with `CircuitError::CapitalPolicyBlocked`.
  4. Non-Custodial Anti-Hostage Invariant: Even in `Emergency`, `repay` and `deposit` are unconditionally permitted to allow borrowers to protect and recover their positions.
- **Remaining Risk**: None; permission checking is hardcoded and enforced strictly on-chain prior to any state mutation.
- **Test Coverage**: Tested in `tests/circuit.ts` Scenario 19.

---

### Vector 24: Rounding Direction & Precision Exploitation
- **Attack Description**: An attacker crafts fractional token amounts or manipulates integer division truncation to pay less debt than required or claim slightly more collateral than earned during liquidation.
- **Trust Boundary**: Math Engine $\rightarrow$ SPL Token Decimal Conversion.
- **Mitigation Implemented**:
  1. All mathematical operations use checked 128-bit integer arithmetic (`u128`) without floating point.
  2. Debt restoration thresholds use ceiling division (`div_ceil`) to ensure the protocol never undercharges debt repayment.
  3. Health factor and valuation calculations maintain consistent decimal scaling (`BPS_SCALE = 10,000`, `USD_SCALE = 10^8`, token decimals = 6).
- **Remaining Risk**: Microscopic sub-token-unit rounding remnants (dust < 1 micro-token).
- **Test Coverage**: Tested in `fixed_point.rs` unit tests and `tests/circuit.ts` Scenario 20.
