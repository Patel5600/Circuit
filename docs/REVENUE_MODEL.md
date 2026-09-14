# Circuit Protocol · Economic Engine & Revenue Model

> **Positioning**: Programmable credit infrastructure for tokenized equities on Solana.  
> **Core Thesis**: *"Credit is the last step, never the first."*  
> **Primary Business Thesis**: *"Safe credit creates protocol revenue. Liquidation is risk control, not a business model."*

---

## 1. Executive Summary

Traditional DeFi lending protocols (e.g., Aave, Compound) derive significant revenue from liquidation penalties (5% to 15%) and elevated borrowing spreads during periods of market distress. Their economic model produces perverse incentives: protocols maximize fees when users are liquidated during volatile market crashes.

**Circuit inverts this paradigm.**

Circuit treats risk control as an uncompromising gate. When reference markets (such as the NYSE) close, when Pyth oracle confidence intervals widen beyond safety thresholds, or when the 4-State Risk Ratchet transitions into Defensive or Emergency states:

1. **Credit is instantly blocked on-chain.**
2. **Borrow operations reject with zero state mutations.**
3. **Protocol revenue generated is strictly $0.00.**

Circuit generates revenue **exclusively on safe, verified, risk-cleared credit executions**. Borrower solvency is aligned with protocol revenue: Circuit profits only when borrowers execute within safe boundaries.

---

## 2. On-Chain Financial Authority (Rust / Anchor)

In Circuit, the frontend is strictly an observer and client. All fee arithmetic, account ownership constraints, and token transfers are executed and enforced directly inside the smart contract bytecode.

### 2.1 Protocol Configuration (`ProtocolConfig`)

The global singleton `ProtocolConfig` stores the protocol-wide economic parameters:

```rust
// programs/circuit/src/state/protocol_config.rs
pub struct ProtocolConfig {
    pub authority: Pubkey,
    pub paused: bool,
    pub version: u8,
    pub min_health_factor_bps: u64,
    pub liquidation_bonus_bps: u64,
    pub fee_recipient: Pubkey,   // Canonical Circuit Treasury
    pub borrow_fee_bps: u64,     // Default: 25 BPS (0.25%)
    pub fee_enabled: bool,       // Protocol fee switch
}
```

- **Default Treasury**: `7AALMsZ5MuioSW7BMwBCwTmy9Y1fMJ6MKXAELYyrtb4`
- **Default Borrow Fee**: `25 BPS` (0.25%)
- **Hard Maximum Cap**: `1,000 BPS` (10.00%) enforced in `update_fee_config.rs`

### 2.2 Deterministic Floor Arithmetic

The protocol calculates origination fees using checked 128-bit fixed-point math with deterministic floor rounding (`round down`), guaranteeing that the protocol never overcharges the borrower or suffers precision drift:

```rust
// programs/circuit/src/math/fixed_point.rs
pub fn calculate_protocol_fee(
    borrow_amount: u64,
    fee_bps: u64,
    fee_enabled: bool,
) -> Result<u64> {
    if !fee_enabled || fee_bps == 0 || borrow_amount == 0 {
        return Ok(0);
    }
    require!(fee_bps <= MAX_BORROW_FEE_BPS, CircuitError::FeeBpsExceedsMaximum);

    let fee = (borrow_amount as u128)
        .checked_mul(fee_bps as u128)
        .ok_or(CircuitError::MathOverflow)?
        .checked_div(BPS_SCALE as u128)
        .ok_or(CircuitError::MathOverflow)?;

    Ok(fee as u64)
}
```

### 2.3 Account Binding & Anti-Redirection Constraints

To guarantee that fee tokens cannot be redirected to unauthorized addresses, `borrow.rs` enforces canonical Anchor ownership validation:

```rust
// programs/circuit/src/instructions/borrow.rs
#[account(
    mut,
    constraint = treasury_quote_ata.owner == protocol_config.fee_recipient 
        @ CircuitError::InvalidFeeRecipient
)]
pub treasury_quote_ata: Box<Account<'info, TokenAccount>>,
```

If an attacker attempts to supply their own token account as `treasury_quote_ata`, transaction execution halts immediately with `CircuitError::InvalidFeeRecipient` (`6025`).

### 2.4 Token Flow on Borrow Execution

When a borrower draws `$10,000 USDC` against tokenized stock collateral:

1. **Risk Clearance**: Collateral value, Pyth confidence interval, NYSE calendar session, and 4-State Risk Ratchet evaluate to `SAFE`.
2. **Gross Obligation Recorded**: Position records `$10,000.00` outstanding debt.
3. **Fee Deduction**: `calculate_protocol_fee(10_000_000_000, 25, true)` yields `25_000_000` (`$25.00 USDC`).
4. **Treasury Transfer**: `$25.00 USDC` transfers from `liquidity_vault` directly to `treasury_quote_ata`.
5. **Net Disbursement**: `$9,975.00 USDC` transfers from `liquidity_vault` directly to `user_quote_ata`.
6. **Event Emission**: `ProtocolFeeCollected` and `BorrowExecuted` log on Solana.

---

## 3. The Three Strategic Revenue Pillars

```
+-------------------------------------------------------------------------+
|                        CIRCUIT ECONOMIC ENGINE                          |
+-------------------------------------------------------------------------+
|                                                                         |
|  PILLAR 01: CREDIT EXECUTION (LIVE ON DEVNET)                           |
|  - 25 BPS origination fee on safe borrows                               |
|  - 100% on-chain settlement directly to Circuit Treasury                |
|  - $0.00 fee generated during distress, halts, or closed market         |
|                                                                         |
|  PILLAR 02: RISK INFRASTRUCTURE (ARCHITECTURE READY / PLANNED)          |
|  - Enterprise licensing for MarketGuard session feeds                   |
|  - Programmatic Risk Ratchet telemetry API for institutional Solana DeFi|
|  - Real-time NYSE calendar oracle oracle hooks                          |
|                                                                         |
|  PILLAR 03: CIRCUIT NETWORK (LONG-TERM VISION)                          |
|  - Multi-collateral cross-margining clearing network for all RWAs       |
|  - Protocol insurance reserve funded by protocol fee yield              |
|  - Automated liquidity rebalancing across equity/USDC pairs             |
+-------------------------------------------------------------------------+
```

### Pillar 1: Credit Execution Fee (Live)
- **Rate**: 25 BPS (0.25% flat origination fee).
- **Triggers**: Borrow instruction execution.
- **Incentive Alignment**: The protocol earns only when risk systems approve capital deployment.

### Pillar 2: Risk Infrastructure Licensing (Planned)
- Institutional credit desks and Solana protocols integrate Circuit's `MarketGuard` NYSE session validation and Pyth confidence ratchets to protect secondary lending pools, paying micro-fees per risk evaluation.

### Pillar 3: Circuit Clearing Network (Long-Term)
- A cross-margining layer for all tokenized equities (e.g. Ondo, Backed, Securitize) settling loans on Solana with automated insurance backstops.

---

## 4. Zero Liquidation Exploitation Policy

In traditional lending, the protocol takes a 10% to 50% cut of the liquidation penalty. This creates a financial incentive for the protocol to allow aggressive borrowing and celebrate liquidations.

In Circuit:
- **Protocol Liquidation Take**: `0 BPS` (`$0.00`).
- **Dynamic Liquidation Bonus**: 100% of the dynamic liquidation bonus (500 BPS floor + severity-scaled bonus up to 1,500 BPS) is paid **directly to liquidators** to clear bad debt immediately and protect vault solvency.
- **Circuit Never Exploits Borrower Losses**: Liquidation exists exclusively to return borrowed capital to the liquidity vault, not as a profit engine.

---

## 5. Circuit Treasury & Key Management

### 5.1 Treasury Address

- **Public Key**: `7AALMsZ5MuioSW7BMwBCwTmy9Y1fMJ6MKXAELYyrtb4`
- **Solana Explorer**: [View Account](https://explorer.solana.com/address/7AALMsZ5MuioSW7BMwBCwTmy9Y1fMJ6MKXAELYyrtb4?cluster=devnet)
- **Associated Token Accounts**: Derived per quote mint (e.g. USDC, WSOL).

### 5.2 Key Management Architecture

| Phase | Authority Structure | Execution Model | Timelock |
| :--- | :--- | :--- | :--- |
| **Devnet / MVP** | Single-Sig Keypair (`7AALMs...rtb4`) | Direct Anchor instructions | Immediate |
| **Stage 1 (Audit / Mainnet Beta)** | Squads v4 Multisig (3-of-5) | Multisig Proposal & Approval | 24 Hours |
| **Stage 2 (Scale)** | Squads v4 + Timelock Guard | Automated timelock with emergency veto | 48 Hours |

---

## 6. Verification and Invariant Testing

The economic model is validated by an automated test suite comprising 80+ integration and invariant checks:

```bash
# Run the complete integration and economic suite
wsl -u SPARROW bash -l -c 'cd /mnt/c/Dev/Circuit && npx mocha -r ts-node/register tests/circuit.ts tests/economics.test.ts'
```

Key invariants proven:
1. `ProtocolConfig` initializes with default treasury and 25 BPS fee.
2. Borrow instruction settles 25 BPS to treasury and disburses exact net amount.
3. Blocked borrows (over-capacity, closed session, wide confidence, protocol paused) produce strictly `$0.00` fee.
4. Zero fee policy functions when fee is disabled or set to 0.
5. Unauthorized fee recipient substitution fails with `InvalidFeeRecipient`.
6. Non-admin cannot mutate fee configuration (`Unauthorized`).
7. Fee configuration cannot exceed 1,000 BPS (`FeeBpsExceedsMaximum`).
