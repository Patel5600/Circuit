# Circuit Protocol - Judge Verification & Audit Guide

> Comprehensive cryptographic, deterministic, and on-chain verification guide for hackathon judges and protocol auditors.

---

## 🔍 Protocol Overview & Core Identifiers

| Parameter | Identifier / Value |
|---|---|
| **Program ID** | `Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2` |
| **Cluster** | Solana Devnet (`https://api.devnet.solana.com`) |
| **Pyth Receiver Program** | `rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ` |
| **Meteora DBC Program** | `dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN` |
| **Default Price Feed** | SOL/USD (`0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d`) |

---

## 🛠️ Step 1: Independent Local Build & Test Verification

You can verify all Rust math, Anchor state constraints, TypeScript automation engines, and frontend type safety independently:

### 1. Run Rust Unit Tests (Math, Session, Ratchet)
```bash
cargo test --lib
```
*Expected Output*: **37+ unit tests passing**, covering:
- Fixed-point u128 math and BPS scaling
- NYSE session deterministic calendar and holiday handling
- Health factor formula: \( \text{HF} = \frac{\text{collateral\_value} \times \text{liquidation\_threshold\_bps}}{\text{debt} \times \text{BPS\_SCALE}} \)
- Conservative Pyth pricing: \( p_{\text{conservative}} = \max(0, p - \text{conf}) \)
- Monotonic risk ratchet hysteresis and consecutive healthy epoch requirements

### 2. Run TypeScript Unit & Invariant Test Suite
```bash
npm run test:unit
```
*Expected Output*: **All tests passing**, verifying:
- Decimal safety (6-decimal quote vs 9-decimal equity precision handling)
- Faucet safety and rate limiting
- 5-stage pipeline narrative transitions
- Network isolation and wallet safety
- Automation engine lifecycle states (`CHECKING_PERMISSION` -> `EXECUTING` -> `CONFIRMING`)

### 3. Run Root & Frontend Typechecks
```bash
npm run typecheck
npm --prefix app run typecheck
```
*Expected Output*: **0 errors** across both root and client applications.

### 4. Verify Frontend Production Build
```bash
npm --prefix app run build
```
*Expected Output*: Clean Vite production build with zero bundle warnings or broken dependencies.

---

## 🔐 Step 2: Canonical PDA Derivations

Every state account in Circuit is cryptographically pinned via canonical Program Derived Address (PDA) derivations. No user or admin can inject spoofed accounts.

```typescript
// 1. Protocol Singleton Config
const [protocolConfig] = PublicKey.findProgramAddressSync(
  [Buffer.from("protocol")],
  PROGRAM_ID
);

// 2. Asset Config (per tokenized equity mint)
const [assetConfig] = PublicKey.findProgramAddressSync(
  [Buffer.from("asset"), assetMint.toBuffer()],
  PROGRAM_ID
);

// 3. MarketGuard (per Pyth feed)
const [marketGuard] = PublicKey.findProgramAddressSync(
  [Buffer.from("guard"), feedIdBuffer],
  PROGRAM_ID
);

// 4. Risk Ratchet (per Pyth feed)
const [riskRatchet] = PublicKey.findProgramAddressSync(
  [Buffer.from("ratchet"), feedIdBuffer],
  PROGRAM_ID
);

// 5. User Position (per owner, per asset)
const [position] = PublicKey.findProgramAddressSync(
  [Buffer.from("position"), owner.toBuffer(), assetMint.toBuffer()],
  PROGRAM_ID
);

// 6. Agent Authority (per owner, agent, and asset)
const [agentAuthority] = PublicKey.findProgramAddressSync(
  [Buffer.from("authority"), owner.toBuffer(), agent.toBuffer(), assetMint.toBuffer()],
  PROGRAM_ID
);

// 7. Asset Registry Entry (per asset mint)
const [assetRegistry] = PublicKey.findProgramAddressSync(
  [Buffer.from("registry"), assetMint.toBuffer()],
  PROGRAM_ID
);

// 7. Collateral Vault (Associated Token Account owned by Protocol Config PDA)
const collateralVault = getAssociatedTokenAddressSync(
  assetMint,
  protocolConfig,
  true // allowOwnerOffCurve = true
);

// 8. Liquidity Vault (Associated Token Account owned by Protocol Config PDA)
const liquidityVault = getAssociatedTokenAddressSync(
  quoteMint,
  protocolConfig,
  true
);
```

---

## 🌐 Step 3: Live Solana Devnet Explorer Links

Inspect live deployed accounts directly on the Solana Explorer (Devnet):

| Account | Seeds / Description | Devnet Explorer Link |
|---|---|---|
| **Circuit Program** | Deployed executable Anchor binary | [View on Explorer](https://explorer.solana.com/address/Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2?cluster=devnet) |
| **Pyth Receiver** | Pyth pull oracle receiver program | [View on Explorer](https://explorer.solana.com/address/rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ?cluster=devnet) |
| **Meteora DBC** | Dynamic Bonding Curve trading venue | [View on Explorer](https://explorer.solana.com/address/dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN?cluster=devnet) |
| **Protocol Config** | `["protocol"]` PDA | [Verify on /app/verify](https://circuit-on-solana.vercel.app/app/verify) |
| **MarketGuard** | `["guard", feed_id]` PDA | [Verify on /app/verify](https://circuit-on-solana.vercel.app/app/verify) |

---

## 🛡️ Step 4: Verification of 15 Protocol Security Invariants

| # | Security Invariant | Guarantee | Verification Method |
|---|---|---|---|
| **1** | Canonical PDA Derivation | No spoofed or substituted accounts can be supplied to instructions. | Anchor seed constraints `seeds = [...]` on all account contexts. |
| **2** | Centralized Oracle Validation | All Pyth price updates flow through a single strict gatekeeper. | `oracle/validation.rs::validate_price_update` checks feed ID, age, and confidence. |
| **3** | Single Canonical Risk Engine | MarketGuard and Risk Ratchet define a unified risk state. | `risk/engine.rs::derive_risk_state` evaluated identically on client and chain. |
| **4** | Monotonic Staged Recovery | Stress recovery requires consecutive healthy epochs; no skipping tiers. | `RiskRatchet::record_observation` requires 5 healthy epochs before stepping down. |
| **5** | Single Canonical Permission Engine | All operations pass through the permission evaluator. | `permissions/evaluator.rs::evaluate_permission` gates borrow, withdraw, and agent acts. |
| **6** | Conservative Collateral Sizing | Collateral valued using lower confidence bound: \( p_{\text{conservative}} = \max(0, p - \text{conf}) \). | Tested in `math/fixed_point.rs` unit tests and Anchor instructions. |
| **7** | Concentration Penalty Enforcement | Multi-asset collateral incurs LTV haircuts when \( C_{\text{max}} > 40\% \). | Formula enforced in `math/fixed_point.rs::apply_concentration_penalty`. |
| **8** | Risk-Increasing Action Gate | `BORROW` & unhedged `WITHDRAW` strictly blocked when `DEFENSIVE` or `EMERGENCY`. | Anchor instruction handlers return `RiskDefensive` / `RiskEmergency`. |
| **9** | Risk-Reducing Exemption | Debt `REPAY` and `DEPOSIT` are always permitted, even in `EMERGENCY`. | Permission evaluator sets `allowed = true` for recovery paths. |
| **10** | Meteora DBC Trading Venue Boundary | DBC pool is an execution venue, not a risk authority. | Program ID validated against `dbcij3LW...`; swaps blocked in stress. |
| **11** | Emergency Liquidity Exit Guarantee | LP withdrawals from DBC remain permitted during defensive regimes. | `execute_dbc_action.rs` explicitly allows `ExitLiquidity` for risk reduction. |
| **12** | Bounded Agent Delegation | Agent cannot exceed owner-delegated borrow/withdraw caps or spend unauthorized assets. | On-chain `AgentAuthority` PDA validated in `execute_agent_action.rs`. |
| **13** | Idempotent Automation Lifecycle | Automation engine never reports success prior to on-chain confirmation. | Strict finite state machine in `api/automation/_engine.ts`. |
| **14** | Arithmetic Safety & Overflow Prevention | All arithmetic uses checked `u128` operations with zero float conversions. | Checked math throughout `math/fixed_point.rs`; no panics on user paths. |
| **15** | Architectural State Isolation | Simulation sandbox in `/app/demo` never leaks into production routes. | `DemoHarnessContext` strictly scoped to `/app/demo` components. |
