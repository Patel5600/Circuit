# Circuit Protocol

> Programmable collateral for tokenized equities on Solana.

Circuit verifies market conditions before credit risk increases. It combines verifiable market-state gating, oracle-validated credit, health-factor enforcement, and onchain liquidation — all on Solana.

**⚠️ DEVNET ONLY — This is an MVP demonstration. Not audited. Not production-ready.**

### 📚 Documentation & Hackathon Evaluation
- **[Judge Demo Guide](docs/DEMO_GUIDE.md)** — 2-minute walkthrough, proof steps, and deterministic agent prompts
- **[Judge Verification Guide](docs/VERIFICATION_GUIDE.md)** — Step-by-step cryptographic, CLI, and on-chain verification
- **[Architecture & Math](docs/ARCHITECTURE.md)** — PDAs, state machines, and fixed-point formulas
- **[Security Architecture](docs/SECURITY.md)** — Threat model and defensive guarantees

---

## Problem

Tokenized equities (e.g., NVDAx, AAPLx) exist on Solana but lack credit infrastructure. Traditional lending protocols don't account for:

- **Market hours** — equities trade during NYSE sessions, not 24/7
- **Custody risk** — tokenized equity custody can be delayed or impaired
- **Liquidity risk** — secondary market depth varies significantly
- **Oracle confidence** — price uncertainty affects creditworthiness

Circuit makes these risks explicit and enforceable on-chain.

## Why Solana

- **Sub-second finality** — enables real-time risk state updates
- **Low transaction costs** — makes frequent oracle updates and guard refreshes economical
- **Pyth Network integration** — production-grade oracle infrastructure with confidence intervals
- **SPL token standard** — native support for tokenized equity representations
- **Composable programs** — future integration with DEXs, structured products

## Architecture

```
┌─────────────────────────────────────────────────────┐
│              Frontend (Vite + React 18)              │
│  Oracle Panel • Position Manager • Risk Dashboard   │
└─────────────────┬───────────────────────────────────┘
                  │ RPC / Wallet Adapter
┌─────────────────▼───────────────────────────────────┐
│              Solana (Devnet / Mainnet)               │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │            Circuit Program (Anchor)          │   │
│  │                                              │   │
│  │  ┌────────────┐  ┌─────────────────────┐    │   │
│  │  │   State    │  │   Instructions      │    │   │
│  │  │            │  │                     │    │   │
│  │  │ Protocol   │  │ initialize_protocol │    │   │
│  │  │ AssetConfig│  │ register_asset      │    │   │
│  │  │ MarketGuard│  │ deposit / withdraw  │    │   │
│  │  │ Position   │  │ borrow / repay      │    │   │
│  │  └────────────┘  │ liquidate           │    │   │
│  │                  │ refresh_guard       │    │   │
│  │  ┌────────────┐  │ pause / unpause     │    │   │
│  │  │   Oracle   │  └─────────────────────┘    │   │
│  │  │ validation │                              │   │
│  │  └─────┬──────┘  ┌─────────────────────┐    │   │
│  │        │         │      Math           │    │   │
│  │        ▼         │ health factor       │    │   │
│  │  ┌──────────┐    │ collateral value    │    │   │
│  │  │  Market  │    │ liquidation calc    │    │   │
│  │  │ session  │    └─────────────────────┘    │   │
│  │  └──────────┘                                │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │        Pyth Network (PriceUpdateV2)          │   │
│  │     rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5p    │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

## User Flow

1. **Connect wallet** on Solana Devnet
2. **Browse markets** — see 20+ tokenized equities with live Pyth prices
3. **Deposit** equity tokens as collateral
4. **Borrow** quote tokens (TEST-USDC) at fixed LTV when market is Safe
5. **Monitor** health factor, oracle state, market session in real time
6. **Repay** debt at any time (even when paused)
7. **Withdraw** collateral (requires valid oracle + healthy HF when debt > 0)
8. **Liquidation** — unhealthy positions are liquidated permissionlessly

## Oracle Model

- **Source**: Pyth Network pull oracle (PriceUpdateV2)
- **Validation**: Centralized in `oracle/validation.rs`
- **Checks**: Feed ID match, freshness (max age), confidence width (BPS), positive price, sane timestamp
- **Emergency policy**: When oracle is invalid, liquidation uses `last_valid_price` (frozen snapshot from most recent valid observation)
- **Feed**: configurable per asset. The devnet demo defaults to SOL/USD (`0xef0d8b6f...`) because tokenized-equity feeds are generally not sponsored on devnet. Verify any feed with `npm run check:oracle` before registering it.

## Risk Model

| Condition | Market State | Borrow | Withdraw (with debt) |
|-----------|-------------|--------|---------------------|
| All nominal | Safe | ✅ | ✅ (HF check) |
| Market closed | Restricted | ❌ | ❌ |
| Thin liquidity | Restricted | ❌ | ❌ |
| Stale oracle | Emergency | ❌ | ❌ |
| Wide confidence | Emergency | ❌ | ❌ |
| Impaired custody | Emergency | ❌ | ❌ |
| Critical liquidity | Emergency | ❌ | ❌ |

**Core invariant**: Unsafe market state ⇒ risk-increasing instruction fails on-chain.

**MVP credit policy**: Fixed `base_ltv_bps` when Safe. No dynamic LTV. No volatility scoring.

## Liquidation Model

- **Type**: Full liquidation only (MVP)
- **Trigger**: Health factor < `min_health_factor_bps` (default 10000 = 1.0)
- **Bonus**: Configurable per asset (default 500 BPS = 5%)
- **Price source**: Current valid Pyth price, or `last_valid_price` if oracle is invalid
- **Permissionless**: Any account can liquidate eligible positions

## Security Boundaries

See [SECURITY.md](docs/SECURITY.md) and [THREAT_MODEL.md](docs/THREAT_MODEL.md).

Key boundaries:
- All PDA derivations are canonical and validated by Anchor constraints
- Oracle data flows through a single validation function
- Admin cannot forge prices, bypass PDA checks, or ignore health factor
- Cached MarketGuard state is observability only — not sole authorization
- Checked arithmetic everywhere — no floating point on-chain
- No `unwrap()` or `expect()` on attacker-controlled paths

## Build, Test, Deploy

The Solana toolchain runs under WSL. The helper scripts set `PATH` and
`BPF_OUT_DIR` for you, so these work from a PowerShell prompt at the repo root.

```bash
# Build the program (and generate the IDL + TS types)
wsl bash scripts/build.sh anchor

# Rust unit tests: fixed-point math + NYSE session calendar
wsl bash scripts/build.sh test

# TypeScript integration suite: 16 scenarios on LiteSVM
wsl bash scripts/test.sh

# Type-check the scripts and tests
npm run typecheck
```

Deploy and bootstrap:

```bash
npm run fund              # top up the deployer from the devnet faucet
npm run check:oracle      # confirm the Pyth feed is usable on this cluster
wsl bash -c "cd /mnt/c/Dev/Circuit && anchor deploy --provider.cluster devnet"
npm run setup:devnet      # initialize, register the asset, seed liquidity
```

`setup:devnet` is idempotent and writes `devnet/deployment.json` plus the
`VITE_*` block for `app/.env.local`.

Frontend:

```bash
cd app && npm install && npm run dev
```

See [DEPLOYMENT.md](docs/DEPLOYMENT.md) for full instructions.

## Testing

| Suite | Command | Coverage |
|-------|---------|----------|
| Rust unit | `wsl bash scripts/build.sh test` | 37 tests: fixed-point math, health factor, liquidation sizing, NYSE calendar and DST |
| Integration | `wsl bash scripts/test.sh` | 64 tests across 16 scenarios: full lifecycle plus every rejection path |

The integration suite runs on **LiteSVM** rather than a validator, and that is a
requirement rather than a preference. `borrow` is gated on an open NYSE session,
so the happy path is untestable against a live cluster outside market hours; and
the stale-oracle, wide-confidence, wrong-feed and frozen-price branches need
price accounts a real cluster will not produce on demand. LiteSVM's `setClock`
and `setAccount` make all of it deterministic.

## Release Verification Matrix

| Layer | Authority / Source | Execution Type | Status | Evidence |
|---|---|---|---|---|
| **Lending & Collateral Core** | Anchor Program (`Cq4Lvd6...`) | Solana Devnet On-Chain | Live / Verified | Program ID, PDAs & Vault ATAs |
| **Oracle Pricing** | Pyth Network Receiver | Pull Oracle (PriceUpdateV2) | Live / Verified | `rec5EKMG...` on Solana Devnet |
| **MarketGuard & Calendar** | Deterministic NYSE Engine | On-Chain / Client Evaluator | Live / Verified | 37 Rust unit tests passing |
| **Risk Ratchet Engine** | Monotonic Staged Recovery | Dynamic Hysteresis State Machine | Live / Verified | 16-scenario invariant suite passing |
| **Permission Engine** | Canonical 7-Attribute Evaluator | Gated Pre-Execution Check | Live / Verified | `PermissionPreviewCard` + Anchor gates |
| **Autonomous Agent** | Interactive Bounded Delegation | Client-Validated Proposals | Live / Verified | `MODE: INTERACTIVE (Wallet-Signed)` |
| **Trading Venue (DBC)** | Meteora Dynamic Bonding Curve | Devnet Curve Test Pools | Live / Verified | Program `dbcij3LW...` on Devnet |
| **Stress Simulation Harness** | `/app/demo` Isolated Sandbox | Client Controlled Scenario | Isolated / Verified | Visual & architectural isolation |

## 15 Protocol Security Invariants

| # | Invariant | Description | Verification Surface |
|---|---|---|---|
| 1 | **Canonical PDA Derivation** | State accounts can only be derived from immutable protocol seeds. | Anchor constraints on all instruction contexts |
| 2 | **Centralized Oracle Gate** | All price updates pass through a single validation bottleneck. | `oracle/validation.rs::validate_price_update` |
| 3 | **Unified Risk Engine** | Single source of truth for risk across chain and UI. | `risk/engine.rs` & `app/src/lib/risk-engine` |
| 4 | **Monotonic Staged Recovery** | Recovery requires consecutive healthy epochs; no skipping tiers. | Monotonic step-down hysteresis in `RiskRatchet` |
| 5 | **Unified Permission Engine** | All financial actions pass through the canonical evaluator. | `permissions/evaluator.rs::evaluate_permission` |
| 6 | **Conservative Collateral Valuation** | Collateral priced at lower bound: \( p_{\text{conservative}} = \max(0, p - \text{conf}) \). | Rust unit tests in `math/fixed_point.rs` |
| 7 | **Concentration Penalty** | Multi-asset collateral receives LTV haircuts when \( C_{\text{max}} > 40\% \). | Mathematical formulas in `fixed_point.rs` |
| 8 | **Risk-Increasing Gate** | Borrowing & unhedged withdrawal blocked in Defensive/Emergency. | Instruction handlers return `RiskDefensive`/`RiskEmergency` |
| 9 | **Risk-Reducing Exemption** | Repay and collateral additions are always permitted, even in Emergency. | Evaluator explicitly exempts debt reduction |
| 10 | **Trading Venue Isolation** | Meteora DBC is an execution venue, not the protocol risk authority. | Validates program ID against `dbcij3LW...` |
| 11 | **Emergency Liquidity Exit** | LP positions can always be withdrawn during defensive regimes. | `execute_dbc_action.rs` permits `ExitLiquidity` |
| 12 | **Bounded Agent Delegation** | Agents cannot exceed owner limits or execute unauthorized operations. | `AgentAuthority` PDA enforced on-chain |
| 13 | **Idempotent Automation** | Automation tasks follow strict FSM; never mark success before confirmation. | State machine in `api/automation/_engine.ts` |
| 14 | **Checked Arithmetic Safety** | Zero floating-point math on-chain; all operations checked u128. | Arithmetic invariant test suite passing |
| 15 | **Harness State Isolation** | Simulation sandbox state never contaminates production routes. | `DemoHarnessContext` isolation audit |

## Known Limitations

> These are honest statements about what the MVP does and does not do.

- **Custody and liquidity states are simulated** — admin-controlled inputs, not live oracles
- **Fixed safe-state LTV** — no dynamic LTV adjustment based on market conditions
- **Full liquidation only** — no partial liquidation
- **No historical volatility** — confidence width is an oracle uncertainty signal only
- **Demo NYSE calendar** — covers 2025-2026 holidays, not authoritative
- **Emergency liquidation is inert, not merely conservative.** When the oracle is
  unusable, liquidation falls back to `position.last_valid_price`. That value is
  only ever written by `borrow` and `withdraw`, both of which enforce
  `HF >= min_health_factor_bps` at that price for that debt — and debt cannot grow
  afterwards without also refreshing the price. So recomputing the health factor
  from the frozen price always yields a healthy result and liquidation is refused
  with `NotLiquidatable`. In practice an oracle outage **freezes liquidation
  entirely** rather than permitting it at a stale valuation. That is safe for
  borrowers and avoids unfair liquidations, but it means the protocol cannot shed
  risk during a prolonged outage. Covered by scenario 16 in `tests/circuit.ts`.
- **Devnet oracle bound is loose** — `max_oracle_age` is 600s on devnet because
  sponsored feeds are only pushed every few minutes. Tighten substantially for
  production.
- **Single-sig admin** — no multisig or governance
- **Test tokens are not real securities** — TEST-EQUITY and TEST-USDC have no real value
- **Devnet deployment is not production-safe** — see [MAINNET_READINESS.md](docs/MAINNET_READINESS.md)

## Roadmap

1. **Audit** — professional security audit of all on-chain code
2. **Dynamic LTV** — adjust LTV based on market conditions (volatility, liquidity depth)
3. **Partial liquidation** — proportional liquidation for better UX
4. **Multiple assets** — support portfolio of tokenized equities
5. **Governance** — on-chain parameter governance with multisig
6. **Mainnet deployment** — production oracle config, real USDC, authoritative calendar
7. **Insurance fund** — protocol reserve for bad debt absorption
8. **Cross-margin** — portfolio-level risk assessment

## Toolchain

| Component | Version |
|-----------|---------|
| Anchor CLI | 1.2.0 |
| Solana CLI (Agave) | 3.1.10 |
| Rust | 1.98.1 |
| Node.js | 24.13.0 |
| anchor-lang | 1.2.0 |
| pyth-solana-receiver-sdk | 2.0.0 |
| Pyth Receiver Program | rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ |

## License

MIT
