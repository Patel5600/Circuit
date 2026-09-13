# Circuit Protocol: Mainnet Readiness Checklist

This document tracks the technical, operational, risk, and legal milestones required before deploying the Circuit Protocol (`Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2`) to Solana Mainnet-Beta.

Every item is marked with its readiness state, a description of the current MVP implementation, and the target requirements for production.

---

## 1. Governance, Security & Keys

### [ ] 1. Independent Security Audits
- **Current MVP**: Internal testing and static analysis only; no external third-party audit completed.
- **Production Requirement**: Complete at least two independent tier-1 smart contract security audits (e.g., OtterSec, Neodyme, or Kudelski Security). All critical, high, and medium findings must be resolved and verified with published audit reports.

### [ ] 2. Final Program Key Management
- **Current MVP**: Program keypair generated locally (`circuit-keypair.json`) and stored on filesystem.
- **Production Requirement**: Generate program address using a dedicated hardware security module (HSM) or multi-party ceremony. Securely archive or destroy the private key once the program buffer is written.

### [ ] 3. Multisig Protocol Authority
- **Current MVP**: Single-signature keypair stored in [`ProtocolConfig.authority`](file:///c:/Dev/Circuit/programs/circuit/src/state/protocol_config.rs#L13).
- **Production Requirement**: Transfer `ProtocolConfig.authority` to a production Squads v4 multisig (minimum 4-of-7 quorum) composed of core team members, institutional risk partners, and independent keyholders.

### [ ] 4. Program Upgrade Authority Strategy
- **Current MVP**: Deployer wallet directly retains BPF upgrade authority.
- **Production Requirement**: Transfer BPF upgrade authority to a dedicated governance multisig with an onchain timelock (minimum 48-hour delay) to allow users and liquidity providers to exit if an adverse upgrade is proposed.

### [ ] 5. Immutable / Final Upgrade Decision Roadmap
- **Current MVP**: Mutable program upgradeable at will by deployer key.
- **Production Requirement**: Establish a documented milestone roadmap for freezing the program binary (setting upgrade authority to `None`), achieving permanent immutability once the codebase is battle-tested.

### [ ] 6. Multisig Dedicated Pause Authority
- **Current MVP**: Full admin key controls pause/unpause via [`pause_protocol`](file:///c:/Dev/Circuit/programs/circuit/src/instructions/pause.rs#L13) and [`unpause_protocol`](file:///c:/Dev/Circuit/programs/circuit/src/instructions/pause.rs#L24).
- **Production Requirement**: Separate emergency pause authority from general administrative governance. Deploy a low-threshold emergency sub-multisig (e.g., 2-of-4) or automated circuit breaker bot that can pause immediately, while unpausing requires the full 4-of-7 governance quorum.

---

## 2. Oracles & Traditional Market Synchronization

### [ ] 7. Production Oracle Configuration
- **Current MVP**: Pyth Solana Receiver (`rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ`) with standard public Hermes RPC endpoints. This is the same receiver program on devnet and mainnet; it is the ID declared by `pyth-solana-receiver-sdk` v2.0.0 without the `pro-compatible` feature, which is how this program builds.
- **Production Requirement**: Deploy dedicated, redundant Hermes instances with private RPC endpoints. Configure fallback oracle sources (e.g., Chainlink / Switchboard) to prevent single-oracle liveness failure.

### [ ] 7a. Tighten the Oracle Staleness Bound
- **Current MVP**: `max_oracle_age` is registered as **600 seconds** on devnet. Devnet sponsored feeds are pushed only every few minutes (measured publish ages of 198s–291s for SOL/USD), so a mainnet-style 30–60s bound makes `borrow` fail almost every time on that cluster.
- **Production Requirement**: Reduce to 30–60s on mainnet, where Pyth pushes continuously. The devnet value is a demo accommodation that materially widens the window for acting on a stale price, and it must not ship to production. Controlled by `SETUP_MAX_ORACLE_AGE`.

### [ ] 7b. Emergency Liquidation Path Is Currently Inert
- **Current MVP**: When oracle validation fails, [`liquidate`](file:///c:/Dev/Circuit/programs/circuit/src/instructions/liquidate.rs) falls back to `position.last_valid_price`. That field is only ever written by `borrow` and `withdraw`, both of which enforce `HF >= min_health_factor_bps` at that exact price for that exact debt, and debt cannot subsequently grow without also refreshing the price. Recomputing the health factor from the frozen price therefore always yields a healthy result, and liquidation is refused with `NotLiquidatable`. An oracle outage **freezes liquidation entirely** rather than allowing it at a stale valuation. Verified by scenario 16 in `tests/circuit.ts`.
- **Risk**: The behaviour is safe for borrowers and prevents unfair liquidations at unverified prices, but the protocol cannot shed risk during a prolonged outage. Bad debt can accumulate with no remedy while the oracle is down.
- **Production Requirement**: Decide the intended policy explicitly. Options include a separate emergency-liquidation threshold applied to the frozen price, a governance-gated manual liquidation path, a time-decay haircut applied to the frozen price as the outage lengthens, or accepting the freeze and sizing an insurance fund to cover it. Whichever is chosen, the current behaviour should be documented as intentional rather than left as an emergent property.

### [ ] 8. Authoritative Exchange Calendar Engine
- **Current MVP**: Deterministic 2025–2026 NYSE holiday lookup table and civil date calculation in [`programs/circuit/src/market/session.rs`](file:///c:/Dev/Circuit/programs/circuit/src/market/session.rs).
- **Production Requirement**: Replace or supplement the static calendar with an authoritative onchain calendar feed or signed oracle attestation capable of dynamically updating for unscheduled exchange closures (e.g., national days of mourning, weather halts, or emergency market halts).

### [ ] 9. Custody Proof / Oracle Source
- **Current MVP**: Simulated admin-controlled enum [`CustodyState`](file:///c:/Dev/Circuit/programs/circuit/src/state/enums.rs#L28) set via [`set_custody_state`](file:///c:/Dev/Circuit/programs/circuit/src/instructions/set_custody_state.rs#L11).
- **Production Requirement**: Integrate real-time automated proof-of-reserve attestations or signed custodian health feeds (e.g., via Chainlink PoR or custodian API oracles) that verify 1:1 backing of tokenized shares by underlying SEC-registered equities.

### [ ] 10. Secondary Market Liquidity Oracle
- **Current MVP**: Simulated admin-controlled enum [`LiquidityState`](file:///c:/Dev/Circuit/programs/circuit/src/state/enums.rs#L48) set via [`set_liquidity_state`](file:///c:/Dev/Circuit/programs/circuit/src/instructions/set_liquidity_state.rs#L11).
- **Production Requirement**: Connect onchain order book depth (Phoenix, OpenBook v2) or AMM pool liquidity metrics to dynamically gauge liquidation depth and trigger `Restricted` or `Emergency` state when depth evaporates.

---

## 3. Assets, Vaults & Liquidity

### [ ] 11. Production Tokenized Equity Mint Integration
- **Current MVP**: Standard SPL token created by developer (`TEST-NVDAx`).
- **Production Requirement**: Integrate with regulated institutional tokenized equity issuers (e.g., Backed Finance, Dinari, or Ondo) ensuring compliance with Token-2022 transfer hooks, KYC/whitelist constraints, and freeze authority policies.

### [ ] 12. Canonical Quote Token (Real USDC)
- **Current MVP**: Mock SPL token representing USDC (`TEST-USDC`).
- **Production Requirement**: Bind `AssetConfig.quote_mint` to Circle's canonical Solana USDC mint (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`).

### [ ] 13. Institutional Liquidity Provisioning Mechanism
- **Current MVP**: Direct token transfer into `liquidity_vault` by deployer wallet.
- **Production Requirement**: Implement an audited interest-bearing liquidity pool (e.g., cTokens / share tokens) allowing passive LPs to deposit USDC, earn floating borrow APR, and withdraw based on utilization.

### [ ] 14. Dedicated Protocol Insurance Fund
- **Current MVP**: No insurance fund; insolvency or bad debt is absorbed by vault liquidity.
- **Production Requirement**: Create an isolated, dedicated insurance reserve funded by protocol fees to cover bad debt in extreme gap events where liquidation seized collateral falls short of owed debt.

---

## 4. Risk Engineering & Economics

### [ ] 15. Risk Parameter Governance & Formal Risk Framework
- **Current MVP**: Hardcoded parameters in test scripts (LTV: 70%, Liquidation Threshold: 80%, Bonus: 5%).
- **Production Requirement**: Establish a quantitative risk model (Gauntlet, Chaos Labs) evaluating daily trading volume, market depth, beta to S&P 500, and off-hours gap probabilities to parameterize asset tiers.

### [ ] 16. Dynamic LTV & Volatility Adjustments
- **Current MVP**: Fixed static `base_ltv_bps` configured per asset at registration.
- **Production Requirement**: Implement dynamic LTV calculation that scales down allowed leverage when realized volatility spikes or when the collateral asset experiences earnings announcements.

### [ ] 17. Historical Realized Volatility Engine
- **Current MVP**: Volatility is not calculated; only Pyth spot confidence width is checked.
- **Production Requirement**: Integrate historical realized volatility tracking (onchain TWAP volatility or signed volatility oracle) to dynamically expand margin requirements ahead of turbulent trading sessions.

### [x] 18. Dynamic Liquidation Bonus & Dutch Auction Roadmap
- **Current MVP (Tier 1 Implemented)**: Dynamic severity-scaled liquidation bonus (`calculate_dynamic_liquidation_bonus`) scaling from base floor (`asset.effective_liquidation_bonus`, 500 BPS) up to 1,500 BPS based on health factor shortfall.
- **Production Requirement (Tier 2)**: Deploy time-ramped Dutch auction liquidation mechanism (`mark_liquidatable` crank + slot-based discount ramp) to eliminate MEV bot latency races, along with partial liquidation (close factor 20%–50%) to prevent borrower over-penalization during flash market dips.

### [ ] 19. Exhaustive Liquidation Stress Tests
- **Current MVP**: Single-position liquidation test scenarios in unit tests.
- **Production Requirement**: Execute agent-based stress testing simulating market opening flash crashes (-20% to -40% gap down), high network congestion, and simultaneous liquidator auction contention.

### [ ] 20. Comprehensive Economic & Solvency Simulations
- **Current MVP**: Static fixed-point math tests in [`math/fixed_point.rs`](file:///c:/Dev/Circuit/programs/circuit/src/math/fixed_point.rs).
- **Production Requirement**: Run Monte Carlo simulations covering 10,000+ stochastic price trajectories across multi-year trading regimes to verify protocol solvency at 99.9th percentile stress.

### [ ] 21. Multi-Asset Cross-Testing & Portfolio Margining
- **Current MVP**: Single asset pair tested (`NVDA` / `USDC`).
- **Production Requirement**: Test concurrent operation of 10+ equity mints with varying decimals, volatility profiles, and shared liquidity vault dynamics.

---

## 5. Operations, Infrastructure & Compliance

### [ ] 22. Rate Limiting & Borrow Caps
- **Current MVP**: Uncapped borrowing up to total vault balance.
- **Production Requirement**: Enforce per-block, per-hour, and global borrow caps per asset to limit maximum systemic loss during unanticipated zero-day vulnerabilities.

### [ ] 23. Continuous 24/7 Monitoring & Alerting
- **Current MVP**: Onchain program logs via `msg!()`.
- **Production Requirement**: Deploy an offchain monitoring stack (e.g., Datadog, Grafana, custom indexing bots) tracking vault health, health factor distributions, oracle latency, and Pyth confidence intervals with PagerDuty integration.

### [ ] 24. Formal Incident Response Plan
- **Current MVP**: Ad-hoc admin pause CLI command.
- **Production Requirement**: Documented standard operating procedures (SOP) detailing step-by-step emergency escalation paths: pause triggers, communication channels, bug bounty triage, and white-hat recovery mechanisms.

### [ ] 25. Program Reproducible Build Verification
- **Current MVP**: Local compilation via Anchor CLI.
- **Production Requirement**: Build using verified verifiable Docker containers (`anchor build --verifiable`) and publish image digest to ensure byte-for-byte binary reproducibility on Solana FM and Solana Explorer.

### [ ] 26. Verified IDL Publication
- **Current MVP**: IDL generated in `target/idl/circuit.json`.
- **Production Requirement**: Publish and verify the Anchor IDL onchain via `anchor idl init` so block explorers, indexers, and client SDKs can automatically deserialize protocol state.

### [ ] 27. Legal & Regulatory Review
- **Current MVP**: Developer test code.
- **Production Requirement**: Secure formal legal opinions regarding collateral classification, securities regulation (SEC, MiCA), tokenized equity handling, and jurisdictional availability of borrowing services.

### [ ] 28. Bug Bounty Program
- **Current MVP**: None.
- **Production Requirement**: Launch a public bug bounty program on Immunefi with competitive tier-based bounties (up to $500,000 for critical solvency vulnerabilities).

---

## Mainnet Launch Gating Checklist

Before setting the mainnet deployment flag, all 28 requirements must be signed off by their respective domain owners:

- [ ] **Security Lead**: Audits, key ceremonies, reproducible build, and bug bounty.
- [ ] **Risk Lead**: Economic simulations, LTV models, stress tests, and insurance fund sizing.
- [ ] **Engineering Lead**: Oracle redundancies, monitoring bots, multisig setup, and IDL verification.
- [ ] **Legal Counsel**: Regulatory clearance and issuer terms compliance.
