# Circuit Protocol

<div align="center">

> **Circuit is a realtime programmable capital-permission layer for tokenized equities on Solana. It converts verified market conditions into enforceable rules for credit, liquidity, autonomous execution, and recovery, so capital authority adapts as conditions change.**

[![Solana Devnet](https://img.shields.io/badge/Solana-Devnet%20Live-14F195?style=for-the-badge&logo=solana&logoColor=000)](https://explorer.solana.com/address/Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2?cluster=devnet)
[![Anchor Version](https://img.shields.io/badge/Anchor-v1.2.0-blueviolet?style=for-the-badge&logo=anchor)](https://www.anchor-lang.com/)
[![Rust](https://img.shields.io/badge/Rust-1.98.1-orange?style=for-the-badge&logo=rust)](https://www.rust-lang.org/)
[![Pyth Network](https://img.shields.io/badge/Pyth-PriceUpdateV2-purple?style=for-the-badge&logo=pyth)](https://pyth.network/)
[![Meteora DBC](https://img.shields.io/badge/Meteora-DBC%20Curve-cyan?style=for-the-badge)](https://meteora.ag/)
[![Security Invariants](https://img.shields.io/badge/Security_Invariants-15%2F15_Passing-success?style=for-the-badge)](docs/SECURITY.md)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

</div>

---

### Live Protocol Telemetry Widget

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CIRCUIT PROTOCOL TELEMETRY • SOLANA DEVNET                                 │
├──────────────────────────────┬──────────────────────────────┬───────────────┤
│  NETWORK                     │  PROGRAM ID                  │  STATUS       │
│  Solana Devnet (1.18+)       │  Cq4Lvd6Kgr3a...XGiTs2       │  NOMINAL      │
├──────────────────────────────┼──────────────────────────────┼───────────────┤
│  ORACLE SOURCE               │  FEED VALIDATION             │  BASE LTV     │
│  Pyth Network Pull Oracle    │  P_eff = max(0, P - Conf)    │  70.0% Base   │
├──────────────────────────────┼──────────────────────────────┼───────────────┤
│  TRADING & LIQUIDITY         │  RECOVERY ENGINE             │  AUTOMATION   │
│  Meteora Dynamic Curve (DBC) │  Monotonic Risk Ratchet (L3) │  PDA-Bounded  │
└──────────────────────────────┴──────────────────────────────┴───────────────┘
```

---

### Documentation & Hackathon Evaluation

| Guide | Description | Target Audience |
|---|---|---|
| **[Judge Demo Guide](docs/DEMO_GUIDE.md)** | 2-minute walkthrough, proof steps, and deterministic agent prompts | Hackathon Evaluators |
| **[Judge Verification Guide](docs/VERIFICATION_GUIDE.md)** | Step-by-step cryptographic, CLI, and on-chain verification commands | Auditors & Technical Judges |
| **[Architecture & Math](docs/ARCHITECTURE.md)** | Canonical PDAs, state machines, and fixed-point mathematical formulas | Protocol Engineers |
| **[Security Architecture](docs/SECURITY.md)** | Threat model, formal guarantees, and defensive state boundaries | Security Researchers |
| **[Autonomous Capital Control](docs/AUTONOMOUS_CAPITAL_CONTROL.md)** | Programmatic limits, PDA delegation, and revocation lifecycle | AI & DeFi Integrators |
| **[Risk Ratchet Specification](docs/RISK_RATCHET.md)** | Monotonic staged recovery, hysteresis thresholds, and epoch rules | Risk Quants |

---

## The Principle

> Tokenized assets make capital programmable.  
> Circuit makes programmable capital governable.  
>  
> Humans define authority. Agents operate within it. Market conditions continuously change what authority permits. Circuit enforces the boundary. Solana records the result.

---

## The Problem

Tokenized equities make assets programmable, but programmable capital needs programmable boundaries: who may act, what may they do, how much may they control, and does that authority remain valid as state changes? An AI agent may reason about an action, but reasoning must never become financial authority.

---

## The Circuit

```
Market → Observation → Risk → Capital Policy → Permission → Execution → Solana
```

Each supported equity has a canonical configuration for token identity, oracle feed, session rules, and risk parameters.

```
                  ┌─────────────────────────────────────────┐
                  │             USER / CLIENT               │
                  │        Circuit Terminal Interface       │
                  └────────────────────┬────────────────────┘
                                       │ Wallet Signed
                    ┌──────────────────┴──────────────────┐
                    ▼                                     ▼
       ┌───────────────────────────┐         ┌───────────────────────────┐
       │   MANUAL USER BORROW/LEND │         │   AUTONOMOUS RISK AGENT   │
       │   Interactive Transaction │         │   Bounded PDA Delegation  │
       └─────────────┬─────────────┘         └─────────────┬─────────────┘
                     │                                     │
                     └──────────────────┬──────────────────┘
                                        │ RPC Instruction
                                        ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                         CIRCUIT ANCHOR PROGRAM                              │
 │                 Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2                │
 │                                                                             │
 │  ┌────────────────────────┐ ┌────────────────────────┐ ┌─────────────────┐  │
 │  │      MarketGuard       │ │    OracleValidator     │ │   RiskRatchet   │  │
 │  │ NYSE Session Calendar  │ │ Pyth PriceUpdateV2     │ │ Monotonic L0-L3 │  │
 │  │ Off-market Gating      │ │ P_eff = max(0, P-Conf) │ │ Hysteresis FSM  │  │
 │  └───────────┬────────────┘ └───────────┬────────────┘ └────────┬────────┘  │
 │              │                          │                       │           │
 │              └──────────────────────────┼───────────────────────┘           │
 │                                         ▼                                   │
 │                       ┌──────────────────────────────────┐                  │
 │                       │   Permission & Health Evaluator  │                  │
 │                       │   7-Attribute Safety Matrix      │                  │
 │                       └─────────────────┬────────────────┘                  │
 └─────────────────────────────────────────┼───────────────────────────────────┘
                                           │ CPI Calls
                     ┌─────────────────────┴─────────────────────┐
                     ▼                                           ▼
      ┌─────────────────────────────┐             ┌─────────────────────────────┐
      │        PYTH NETWORK         │             │     METEORA TRADING DBC     │
      │  rec5EKMGg6MxZYaMdyBfgwp4   │             │  dbcij3LWacW1ZqjTqT5899nL2  │
      │  Confidence Band Oracles    │             │  Dynamic Bonding Curve Pool │
      └─────────────────────────────┘             └─────────────────────────────┘
```

---

## MarketGuard

Before risk-sensitive actions, Circuit validates Pyth price, confidence, publish time, feed identity, and market-session conditions. Stale, uncertain, invalid, or unusable observations cannot authorize additional risk.

Tokenized equity markets (NVDAx, AAPLx, TSLAx) close when traditional stock exchanges close. Allowing unhedged borrows while underlying equity custody is frozen invites toxic arbitrage and oracle gaps. Circuit natively verifies equity market hours:
- **Open Session**: Full borrow, collateral substitution, and rebalancing enabled.
- **Closed / Pre / Post Market**: Risk-increasing borrows are mathematically gated on-chain, eliminating weekend flash-loan exploits.

---

## Risk Ratchet

```
SAFE → RESTRICTED → DEFENSIVE → EMERGENCY
```

As conditions deteriorate, risk-increasing authority contracts first. Borrowing, withdrawals, and new exposure can become constrained or blocked, while repayment, deposits, and supported recovery remain available according to policy. Recovery is staged.

- **SAFE (Nominal L0)**: Normal operations, 70% Base LTV.
- **RESTRICTED / DEFENSIVE (L1/L2)**: Elevated volatility, borrow capped at reduced LTV, debt additions restricted, unhedged withdrawals gated.
- **EMERGENCY (L3)**: Protocol circuit breaker active. Zero new debt. Only risk-reducing repayments allowed.
- **Monotonic Staged Recovery**: Recovery requires consecutive healthy epochs—the protocol cannot jump straight from Emergency to Nominal in a single tick.

---

## Capital Policy + Credit

Risk becomes concrete limits: effective LTV, borrow capacity, exposure ceilings, risk budget, and action-specific limits. Circuit values collateral from validated oracle prices and evaluates debt, LTV, liquidity, authority, and policy before credit is available. Credit is the last step, never the first.

Circuit integrates Pyth Network's `PriceUpdateV2` pull oracle architecture with conservative localized validation:
$$\text{Effective Price} = \max\Big(0, P - \text{Confidence Interval}\Big)$$
- If Pyth reports $\$100.00 \pm \$1.50$, Circuit values collateral at $\$98.50$ for borrow capacity calculations.
- Prevents oracle poisoning, wide-spread spoofing, and stale feed manipulation.

---

## Permission Engine

One canonical permission layer governs humans and agents. Effective authority combines owner authority, delegated agent authority, asset/action scope, position state, risk state, policy limits, expiry, and execution constraints. Frontend previews are informational; permission is re-evaluated at execution, with the Solana program authoritative.

---

## Autonomous Agents

Humans operate directly; agents can observe, analyze, plan, monitor, schedule, and execute supported actions inside explicit boundaries. Agent authority is limited by asset, action, amount, risk budget, expiry, and revocation. AI reasoning is untrusted and cannot bypass Circuit.

Circuit Agent provides Lite and Pro modes, resource-governed agentic usage, background workflows, watches, schedules, and autonomous management. Agent credits are compute entitlement only, separate from SOL, collateral, debt, and trading capital.

- **PDA Boundary Envelopes**: Agents operate under strict on-chain `AgentAuthority` PDAs.
- **Pre-Authorized Drawdown Limits**: Agents can never draw more capital than explicitly authorized by the user.
- **Instant Revocation**: Users retain master authority to revoke agent delegation in a single atomic transaction.

---

## Realtime Control Plane

Circuit is an operational system, not a static explainer. Market, oracle, position, debt, risk, permission, agent, transaction, and liquidity state are continuously refreshed. The interface distinguishes LIVE, STALE, SYNCING, DISCONNECTED, and UNAVAILABLE.

---

## Recovery + Dutch Auction

When a position becomes unsafe, Circuit can enforce deterministic recovery. Where configured, partial liquidation and Dutch auction recovery can sell only the collateral required to restore the active safety policy:

```
UNHEALTHY → RECOVERY CALCULATION → AUCTION → COLLATERAL REDUCTION → RESTORED SAFETY
```

---

## Meteora DBC

Meteora Dynamic Bonding Curves provide an execution/liquidity surface governed by Circuit permissions. DBC actions are evaluated against current market state, risk, capital policy, authority, exposure limits, and pool state before execution. Circuit can observe pool/configuration, reserves, curve state, migration progress, and execution state, with supported operations routed through the permission boundary. DBC can progress from virtual-curve trading toward DAMM graduation.

- Trading venue isolation: execution occurs on Meteora while risk remains governed by Circuit.
- Fair launch and orderly liquidation auctions with deterministic price decay and zero MEV frontrunning.

---

## Human + Agent Parity

Manual and autonomous operations use the same permission boundary; neither gets a hidden bypass.

---

## Auditability

Important actions can be traced across market observation, oracle state, risk state, policy, authority, permission, and transaction outcome.

---

## Security

Frontend, AI/model, API, and RPC responses are untrusted. Validated oracle data is an input; wallet signatures represent owner authority; the Circuit program is the authorization layer; Solana is final state. The architecture addresses stale oracle data, authority escalation, scope violations, replay/expiry, transaction races, and bypass attempts.

---

## Protocol Economics

Circuit can charge configurable fees on successful protocol execution; blocked unsafe actions generate no fee. Recovery primarily protects solvency. Devnet economic values have no real monetary value.

---

## Technical Foundation

Solana smart contracts in Rust/Anchor, Pyth, realtime state, autonomous-agent workflows, Circuit risk/permission primitives, credit and recovery logic, and Meteora DBC.

---

## Status

Solana Devnet MVP/protocol prototype.

---

## 15 Protocol Security Invariants

All 15 security invariants are enforced by Anchor program constraints, Rust checked arithmetic, and audited unit tests:

| # | Invariant | Description | Verification Surface |
|:---:|---|---|---|
| `01` | **Canonical PDA Derivation** | State accounts derive strictly from immutable protocol seeds. | `seeds = [...]` in Anchor instruction contexts |
| `02` | **Centralized Oracle Gate** | All prices pass through a single centralized validation bottleneck. | `oracle/validation.rs::validate_price_update` |
| `03` | **Unified Risk Engine** | Single mathematical source of truth across chain, SDK, and frontend. | `risk/engine.rs` & `app/src/lib/risk-engine` |
| `04` | **Monotonic Staged Recovery** | Recovery requires consecutive healthy epochs; no skipping tiers. | Monotonic step-down hysteresis in `RiskRatchet` |
| `05` | **Unified Permission Engine** | All financial actions pass through canonical 7-attribute evaluator. | `permissions/evaluator.rs::evaluate_permission` |
| `06` | **Conservative Valuation** | Collateral priced at lower bound: \( P_{\text{eff}} = \max(0, P - \text{conf}) \). | Unit tests in `math/fixed_point.rs` |
| `07` | **Concentration Penalty** | Multi-asset collateral receives LTV haircuts when \( C_{\text{max}} > 40\% \). | Mathematical formulas in `fixed_point.rs` |
| `08` | **Risk-Increasing Gate** | Borrowing & unhedged withdrawal blocked in Defensive/Emergency. | Instruction handlers return `RiskDefensive`/`RiskEmergency` |
| `09` | **Risk-Reducing Exemption** | Repay and collateral additions are always permitted, even in Emergency. | Evaluator explicitly exempts debt reduction |
| `10` | **Trading Venue Isolation** | Meteora DBC is an execution venue, not the protocol risk authority. | Validates program ID against `dbcij3LW...` |
| `11` | **Emergency Liquidity Exit** | LP positions can always be withdrawn during defensive regimes. | `execute_dbc_action.rs` permits `ExitLiquidity` |
| `12` | **Bounded Agent Delegation** | Agents cannot exceed owner limits or execute unauthorized operations. | `AgentAuthority` PDA enforced on-chain |
| `13` | **Idempotent Automation** | Automation tasks follow strict FSM; never mark success before confirmation. | State machine in `api/automation/_engine.ts` |
| `14` | **Checked Arithmetic Safety** | Zero floating-point math on-chain; all operations checked `u128`. | Arithmetic invariant test suite passing |
| `15` | **Harness State Isolation** | Simulation sandbox state never contaminates production routes. | `DemoHarnessContext` isolation audit |

---

## Devnet Deployment Matrix

| Parameter / Account | Devnet Address / Identifier | Type |
|---|---|---|
| **Program ID** | `Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2` | Anchor Program |
| **Protocol Authority** | `F5JmuDsKh9oswAhR9rJSfL2PGU1UpQF2cN3n7NjZrFAT` | Signer Authority |
| **Protocol Config PDA** | `3LsZqeX8FHnZRv2nm5jYemPa27HwSQAeddivvmR3mMo2` | PDA (`["protocol"]`) |
| **Asset Config PDA** | `6t8y6uVyVErLYojBsFLzT6f9MaC7HK6E3ZSqxiPi5buY` | PDA (`["asset", mint]`) |
| **Market Guard PDA** | `DizJguRRNvHsjztrCpoqrjd39GCQLoYWMwERQvPnpYkW` | PDA (`["guard", mint]`) |
| **Collateral Vault ATA** | `648UXSZRrkdKTjyxnyV7hvvBX3hchSoYPyoMGqrmazn2` | Token Account (SPL) |
| **Liquidity Vault ATA** | `BA2FW1ZtEFqDxEsnyHTowLsS5qaVpHj94jM5VJ5RULeU` | Token Account (SPL) |
| **Equity Mint (TEST-NVDA)** | `CARqKy5GTCxz5G1tFiYA96A3Q8jaUE9Vppk7cjGJxRqq` | SPL Mint (6 Decimals) |
| **Quote Mint (TEST-USDC)** | `23hpSsK3h4na3pwSUf1YzaDF9nzX3t2PppJJf16Qpkxc` | SPL Mint (6 Decimals) |
| **Pyth Price Feed (SOL/USD)** | `ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d` | Pyth Pull Feed |
| **Pyth Price Account** | `7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE` | On-chain Feed Storage |

---

## Quickstart & Verification

### Prerequisites
- Node.js `v20+` or `v24+`
- Rust `1.79+` & Cargo
- Solana CLI `1.18+` (or Agave `v2+`)
- Anchor CLI `0.30+` / `1.2.0`

### 1. Clone & Install
```bash
git clone https://github.com/Patel5600/Circuit.git
cd Circuit
npm install
cd app && npm install && cd ..
```

### 2. Run Comprehensive Invariant Tests
```bash
# Rust unit tests: Fixed-point math, NYSE calendar, and conservative pricing
wsl bash scripts/build.sh test

# TypeScript integration tests on LiteSVM (16 scenarios, 64 assertions)
wsl bash scripts/test.sh

# Frontend type safety verification
cd app && npm run typecheck
```

### 3. Launch Development Server
```bash
cd app
npm run dev
# Open http://localhost:5173 to access the Circuit Terminal & Landing Page
```

---

## Toolchain

```
┌──────────────────────────────┬──────────────────────────────┐
│ Anchor Framework             │ v1.2.0                       │
│ Solana CLI (Agave)           │ v3.1.10                      │
│ Rust Compiler                │ 1.98.1                       │
│ Node.js                      │ v24.13.0                     │
│ Pyth Solana Receiver SDK     │ v2.0.0                       │
│ Meteora DBC SDK              │ v1.5.12                      │
│ React & Vite                 │ React 18.3.1 • Vite 5.4.2    │
└──────────────────────────────┴──────────────────────────────┘
```

---

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for details.
