# Circuit Protocol

<div align="center">

> **Programmable Collateral & Autonomous Risk Engine for Tokenized Equities on Solana.**

[![Solana Devnet](https://img.shields.io/badge/Solana-Devnet%20Live-14F195?style=for-the-badge&logo=solana&logoColor=000)](https://explorer.solana.com/address/Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2?cluster=devnet)
[![Anchor Version](https://img.shields.io/badge/Anchor-v1.2.0-blueviolet?style=for-the-badge&logo=anchor)](https://www.anchor-lang.com/)
[![Rust](https://img.shields.io/badge/Rust-1.98.1-orange?style=for-the-badge&logo=rust)](https://www.rust-lang.org/)
[![Pyth Network](https://img.shields.io/badge/Pyth-PriceUpdateV2-purple?style=for-the-badge&logo=pyth)](https://pyth.network/)
[![Meteora DBC](https://img.shields.io/badge/Meteora-DBC%20Curve-cyan?style=for-the-badge)](https://meteora.ag/)
[![Security Invariants](https://img.shields.io/badge/Security_Invariants-15%2F15_Passing-success?style=for-the-badge)](docs/SECURITY.md)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

</div>

---

### 📊 Live Protocol Telemetry Widget

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CIRCUIT PROTOCOL TELEMETRY • SOLANA DEVNET                                 │
├──────────────────────────────┬──────────────────────────────┬───────────────┤
│  NETWORK                     │  PROGRAM ID                  │  STATUS       │
│  Solana Devnet (1.18+)       │  Cq4Lvd6Kgr3a...XGiTs2       │  ● NOMINAL    │
├──────────────────────────────┼──────────────────────────────┼───────────────┤
│  ORACLE SOURCE               │  FEED VALIDATION             │  BASE LTV     │
│  Pyth Network Pull Oracle    │  P_eff = max(0, P - Conf)    │  70.0% Base   │
├──────────────────────────────┼──────────────────────────────┼───────────────┤
│  TRADING & LIQUIDITY         │  RECOVERY ENGINE             │  AUTOMATION   │
│  Meteora Dynamic Curve (DBC) │  Monotonic Risk Ratchet (L3) │  PDA-Bounded  │
└──────────────────────────────┴──────────────────────────────┴───────────────┘
```

---

### 📚 Documentation & Hackathon Evaluation

| Guide | Description | Target Audience |
|---|---|---|
| **[Judge Demo Guide](docs/DEMO_GUIDE.md)** | 2-minute walkthrough, proof steps, and deterministic agent prompts | Hackathon Evaluators |
| **[Judge Verification Guide](docs/VERIFICATION_GUIDE.md)** | Step-by-step cryptographic, CLI, and on-chain verification commands | Auditors & Technical Judges |
| **[Architecture & Math](docs/ARCHITECTURE.md)** | Canonical PDAs, state machines, and fixed-point mathematical formulas | Protocol Engineers |
| **[Security Architecture](docs/SECURITY.md)** | Threat model, formal guarantees, and defensive state boundaries | Security Researchers |
| **[Autonomous Capital Control](docs/AUTONOMOUS_CAPITAL_CONTROL.md)** | Programmatic limits, PDA delegation, and revocation lifecycle | AI & DeFi Integrators |
| **[Risk Ratchet Specification](docs/RISK_RATCHET.md)** | Monotonic staged recovery, hysteresis thresholds, and epoch rules | Risk Quants |

---

## 🏛️ What is Circuit?

Circuit is institutional credit infrastructure designed specifically for tokenized real-world assets (RWAs) and equities on Solana. 

Traditional DeFi lending protocols assume collateral trades continuously 24/7/365 with constant liquidity. Real equities do not. Circuit brings verifiable financial reality on-chain by coupling oracle confidence bands, NYSE session calendars, autonomous AI risk sentinels, and Meteora Dynamic Bonding Curves into a single deterministic credit engine.

```
                  ┌─────────────────────────────────────────┐
                  │             USER / CLIENT               │
                  │   Format 2.0 Precision Instruments UI   │
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

## ⚡ Core Protocol Pillars

### 1. 🕒 Verifiable NYSE Market State Gating
Tokenized equity markets (NVDAx, AAPLx, TSLAx) close when traditional stock exchanges close. Allowing unhedged borrows while underlying equity custody is frozen invites toxic arbitrage and oracle gaps. Circuit natively verifies equity market hours:
- **Open Session**: Full borrow, collateral substitution, and rebalancing enabled.
- **Closed / Pre / Post Market**: Risk-increasing borrows are mathematically gated on-chain, eliminating weekend flash-loan exploits.

### 2. 🛡️ Autonomous Risk Ratchet Hysteresis
Instead of binary liquidations that trigger cascade sell-offs, Circuit uses a monotonic 4-regime finite state machine:
- **Nominal (L0)**: Normal operations, 70% Base LTV.
- **Defensive (L1)**: Elevated volatility, borrow capped at 50% LTV, debt additions restricted.
- **Stale (L2)**: Oracle delay or liquidity dry-up, zero borrows, partial collateral withdrawals gated.
- **Emergency (L3)**: Protocol circuit breaker active. Zero new debt. Only risk-reducing repayments allowed.
- **Monotonic Staged Recovery**: Recovery requires consecutive healthy epochs—the protocol cannot jump straight from Emergency to Nominal in a single tick.

### 3. 🎯 Conservative Pyth Pull Oracle Validation
Circuit integrates Pyth Network's `PriceUpdateV2` pull oracle architecture with strict localized validation:
$$\text{Effective Price} = \max\Big(0, P - \text{Confidence Interval}\Big)$$
- If Pyth reports $\$100.00 \pm \$1.50$, Circuit values collateral at $\$98.50$ for borrow capacity calculations.
- Prevents oracle poisoning, wide-spread spoofing, and stale feed manipulation.

### 4. 🌊 Trading Venue Isolation & Meteora DBC
Meteora Dynamic Bonding Curves (DBC) serve as the primary on-chain fair launch and secondary liquidity venue:
- Isolated from credit risk calculations.
- Allows programmatic collateral acquisition and orderly liquidation auctions with deterministic price decay and zero MEV frontrunning.

### 5. 🤖 Bounded Autonomous AI Agents
Circuit features native autonomous agents capable of rebalancing portfolios, managing collateral ratios, and defending health factors:
- **PDA Boundary Envelopes**: Agents operate under strict on-chain `AgentAuthority` PDAs.
- **Pre-Authorized Drawdown Limits**: Agents can never draw more capital than explicitly authorized by the user.
- **Instant Revocation**: Users retain master authority to revoke agent delegation in a single atomic transaction.

---

## 🎨 Interactive Precision Instruments (Format 2.0 Engine)

Circuit's landing interface is engineered as an interactive design system running at 60fps without lag:

| Instrument | Component | Mechanical Behavior |
|---|---|---|
| **01 Metaball Ink Trail** | `HeroInkTrail.tsx` | 60fps fluid displacement canvas responding to mouse velocity vectors |
| **02 24-Dial Field** | `DialFieldHero.tsx` | 24 dynamic rotating SVG dials tracking cursor angle and distance |
| **03 Colour Reveal** | `ColourRevealSection.tsx` | Multi-layer RGB gradient mask revealing high-contrast typographic layouts |
| **04 Inertia Ribbon** | `InertiaRibbonSection.tsx` | Continuous draggable momentum strip with elastic wrap physics |
| **05 Scroll Morph** | `ScrollMorphSection.tsx` | 5-stage pinned morph: Horizontal ➔ Card ➔ Arch ➔ Circle ➔ Safe State Full-Frame |
| **06 Dynamic Risk Matrix** | `ManifestoAndRing.tsx` | Counter-rotating concentric typographic rings listing protocol invariants |
| **07 Adaptive Instruments** | `ManifestoAndRing.tsx` | Magnetic cursor morphing into words, cards, badges, pills, and Pyth triangle |
| **08 Slot Clock & Stack** | `ClockAndTiltedStack.tsx` | Real-time Solana block slot clock paired with -8° skewed velocity word loop |

---

## 🔒 15 Protocol Security Invariants

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

## 🗺️ Devnet Deployment Matrix

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

## 🚀 Quickstart & Verification

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
# Open http://localhost:5173 to access the Format 2.0 Terminal & Landing Page
```

---

## 🛠️ Toolchain

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

## ⚖️ License

Distributed under the MIT License. See [LICENSE](LICENSE) for details.
