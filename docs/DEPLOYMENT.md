# Circuit Protocol: Deployment & Operations Guide

This guide provides complete, step-by-step deployment instructions for the Circuit Protocol program (`Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2`) on both localnet and Solana devnet.

All terminal operations are executed via **Windows Subsystem for Linux (WSL2)** using the pre-configured environment and PATH variables.

---

## 1. System & Toolchain Prerequisites

Ensure your WSL environment matches the audited toolchain versions:

| Component | Target Version | Verification Command |
| :--- | :--- | :--- |
| **Rust Toolchain** | `1.98.1` | `rustc --version` |
| **Solana CLI** | `3.1.10` (Agave) | `solana --version` |
| **Anchor CLI** | `1.2.0` | `anchor --version` |
| **Node.js** | `>= 18.0.0` | `node -v` |
| **Pyth Receiver SDK** | `2.0.0` | Verified via `Cargo.lock` |

### WSL Environment Helper Script
To standardize shell environments across execution contexts, use the root environment string:
```bash
export PATH="/usr/bin:/usr/sbin:/usr/local/bin:/home/SPARROW/.avm/bin:/home/SPARROW/.cargo/bin:/home/SPARROW/.local/share/solana/install/active_release/bin:$PATH"
```

All commands in this guide can be executed directly from Windows PowerShell using the WSL wrapper syntax:
```powershell
wsl bash -c "export PATH='/usr/bin:/usr/sbin:/usr/local/bin:/home/SPARROW/.avm/bin:/home/SPARROW/.cargo/bin:/home/SPARROW/.local/share/solana/install/active_release/bin:$PATH' && cd /mnt/c/Dev/Circuit && <COMMAND>"
```

---

## 2. Configuration & Key Management

### 2.1 Deployer Keypair Setup
Ensure your Solana CLI is configured with a valid keypair:
```bash
# Check keypair location and public key
wsl bash -c "export PATH='/usr/bin:/usr/sbin:/usr/local/bin:/home/SPARROW/.avm/bin:/home/SPARROW/.cargo/bin:/home/SPARROW/.local/share/solana/install/active_release/bin:$PATH' && solana address"
```

To create a dedicated deployment keypair if none exists:
```bash
wsl bash -c "export PATH='/usr/bin:/usr/sbin:/usr/local/bin:/home/SPARROW/.avm/bin:/home/SPARROW/.cargo/bin:/home/SPARROW/.local/share/solana/install/active_release/bin:$PATH' && solana-keygen new --outfile ~/.config/solana/circuit-deployer.json --no-bip39-passphrase"
```

### 2.2 Program ID Alignment
The program ID is declared across three configuration locations:
1. Rust Source: [`programs/circuit/src/lib.rs`](file:///c:/Dev/Circuit/programs/circuit/src/lib.rs#L14)
   ```rust
   declare_id!("Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2");
   ```
2. Anchor Config: [`Anchor.toml`](file:///c:/Dev/Circuit/Anchor.toml#L12)
   ```toml
   [programs.localnet]
   circuit = "Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2"

   [programs.devnet]
   circuit = "Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2"
   ```
3. Program Keypair:
   Ensure `target/deploy/circuit-keypair.json` matches this public key:
   ```bash
   wsl bash -c "export PATH='/usr/bin:/usr/sbin:/usr/local/bin:/home/SPARROW/.avm/bin:/home/SPARROW/.cargo/bin:/home/SPARROW/.local/share/solana/install/active_release/bin:$PATH' && solana-keygen pubkey /mnt/c/Dev/Circuit/target/deploy/circuit-keypair.json"
   ```

---

## 3. Compilation & Testing

### 3.1 Unit Testing (Pure Rust)
Run the isolated unit tests covering math invariants and the NYSE calendar:
```bash
wsl bash -c "export PATH='/usr/bin:/usr/sbin:/usr/local/bin:/home/SPARROW/.avm/bin:/home/SPARROW/.cargo/bin:/home/SPARROW/.local/share/solana/install/active_release/bin:$PATH' && cd /mnt/c/Dev/Circuit/programs/circuit && cargo test"
```

### 3.2 Program Build
Compile the onchain BPF bytecode and generate the updated IDL:
```bash
wsl bash -c "export PATH='/usr/bin:/usr/sbin:/usr/local/bin:/home/SPARROW/.avm/bin:/home/SPARROW/.cargo/bin:/home/SPARROW/.local/share/solana/install/active_release/bin:$PATH' && cd /mnt/c/Dev/Circuit && anchor build"
```

The compiled artifact will be located at:
`/mnt/c/Dev/Circuit/target/deploy/circuit.so`

---

## 4. Localnet Deployment & Testing

The test suite does **not** use `anchor test` or a local validator. It runs
in-process on LiteSVM:

```bash
# Rust unit tests (math + NYSE session calendar)
wsl bash scripts/build.sh test

# TypeScript integration suite (16 scenarios)
wsl bash scripts/test.sh
```

> **Why not a validator?** Two of this protocol's gates cannot be exercised
> against a live cluster. `borrow` requires an open NYSE session, so the happy
> path is untestable outside market hours — the suite would pass or fail
> depending on the day it ran. And the stale-oracle, wide-confidence, wrong-feed
> and frozen-price branches require price accounts that a real cluster will not
> produce on demand. LiteSVM's `setClock` and `setAccount` make all of these
> deterministic. See `tests/helpers/harness.ts`.
>
> LiteSVM ships no native Windows binding, so the suite runs under WSL.

If you do want a local validator for manual poking, clone the Pyth receiver:
```bash
wsl bash -c "export PATH='/usr/bin:/usr/sbin:/usr/local/bin:/home/SPARROW/.avm/bin:/home/SPARROW/.cargo/bin:/home/SPARROW/.local/share/solana/install/active_release/bin:$PATH' && solana-test-validator --url https://api.devnet.solana.com --clone rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ --reset"
```
Note that a cloned price account is frozen at its clone time and goes stale
immediately, so `borrow` will still fail against it.

---

## 5. Solana Devnet Deployment

### Step 5.1: Configure Solana CLI for Devnet
```bash
wsl bash -c "export PATH='/usr/bin:/usr/sbin:/usr/local/bin:/home/SPARROW/.avm/bin:/home/SPARROW/.cargo/bin:/home/SPARROW/.local/share/solana/install/active_release/bin:$PATH' && solana config set --url https://api.devnet.solana.com"
```

### Step 5.2: Verify Deployer Balance & Airdrop
Deploying the contract bytecode (~380 KB) requires approximately 2.8–3.5 SOL for rent exemption and transaction fees.
```bash
wsl bash -c "export PATH='/usr/bin:/usr/sbin:/usr/local/bin:/home/SPARROW/.avm/bin:/home/SPARROW/.cargo/bin:/home/SPARROW/.local/share/solana/install/active_release/bin:$PATH' && solana balance"
```
If additional SOL is required:
```bash
wsl bash -c "export PATH='/usr/bin:/usr/sbin:/usr/local/bin:/home/SPARROW/.avm/bin:/home/SPARROW/.cargo/bin:/home/SPARROW/.local/share/solana/install/active_release/bin:$PATH' && solana airdrop 2"
```

### Step 5.3: Deploy Program
Deploy the compiled binary to Solana devnet:
```bash
wsl bash -c "export PATH='/usr/bin:/usr/sbin:/usr/local/bin:/home/SPARROW/.avm/bin:/home/SPARROW/.cargo/bin:/home/SPARROW/.local/share/solana/install/active_release/bin:$PATH' && cd /mnt/c/Dev/Circuit && anchor deploy --provider.cluster devnet"
```

---

## 6. Post-Deployment Protocol Initialization

### The short path

Everything in this section is automated by one idempotent script. It is safe to
re-run; each step is skipped if it has already been applied.

```bash
npm run setup:devnet
```

It performs, in order: preflight (balance + program executable), `initialize_protocol`,
creation of the two 6-decimal test mints, `register_asset`, seeding of the liquidity
vault, minting test collateral to the deployer, oracle resolution plus a
`refresh_guard` call, and finally writes `devnet/deployment.json` and prints the
`VITE_*` block for `app/.env.local`.

Before running it, confirm the oracle is actually usable on this cluster:

```bash
npm run check:oracle
```

The remainder of this section documents what the script does, for auditing or
manual operation.

### Step 6.1: Initialize Protocol Singleton (`initialize_protocol`)
Initializes [`ProtocolConfig`](file:///c:/Dev/Circuit/programs/circuit/src/state/protocol_config.rs#L11) at seeds `[b"protocol"]`.

**Parameters used by `setup-devnet.ts`:**
- `min_health_factor_bps`: `10000` ($1.0\times$)
- `default_max_oracle_age`: `600` seconds on devnet (see note below)
- `default_max_conf_bps`: `200` (2.00% max confidence width)
- `liquidation_bonus_bps`: `500` (5.00% liquidator bonus)

> **Oracle staleness on devnet.** Pyth sponsored feeds on devnet are pushed only
> every few minutes (measured publish ages of 198s–291s for SOL/USD), so a
> mainnet-style bound of 30–60s causes `borrow` to fail almost every time. The
> devnet default is therefore `600`. This is a demo accommodation that materially
> widens the stale-price window and must be tightened for production. Override
> with `SETUP_MAX_ORACLE_AGE`.

### Step 6.2: Create Test Tokens (Devnet Testing)
Create test SPL tokens representing tokenized equity (`NVDAx_TEST`) and quote debt (`USDC_TEST`):
```bash
# 1. Create Equity Collateral Mint (6 decimals)
wsl bash -c "export PATH='/usr/bin:/usr/sbin:/usr/local/bin:/home/SPARROW/.avm/bin:/home/SPARROW/.cargo/bin:/home/SPARROW/.local/share/solana/install/active_release/bin:$PATH' && spl-token create-token --decimals 6"

# 2. Create Quote Currency Mint (USDC, 6 decimals)
wsl bash -c "export PATH='/usr/bin:/usr/sbin:/usr/local/bin:/home/SPARROW/.avm/bin:/home/SPARROW/.cargo/bin:/home/SPARROW/.local/share/solana/install/active_release/bin:$PATH' && spl-token create-token --decimals 6"
```

### Step 6.3: Register Asset & Create Vaults (`register_asset`)
Registers the equity token with Circuit, creating [`AssetConfig`](file:///c:/Dev/Circuit/programs/circuit/src/state/asset_config.rs#L12), [`MarketGuard`](file:///c:/Dev/Circuit/programs/circuit/src/state/market_guard.rs#L16), the Collateral Vault ATA, and the Liquidity Vault ATA.

**Parameters used by `setup-devnet.ts`:**
- `pyth_feed_id`: `0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d` (SOL/USD)
- `base_ltv_bps`: `7000` (70.00% max borrow LTV)
- `liquidation_threshold_bps`: `8000` (80.00% liquidation threshold)
- `liquidation_bonus_bps`: `500` (5.00% bonus)
- `max_oracle_age`: `600` seconds on devnet
- `max_conf_bps`: `200` (2.00%)

> **Why not an equity feed?** Tokenized-equity feeds are generally not sponsored
> on devnet, so registering one yields an `AssetConfig` whose price account does
> not exist and every risk-increasing instruction fails. `npm run check:oracle`
> reports which feeds are actually `USABLE` (owner matches the receiver,
> `VerificationLevel::Full`, and within the staleness bound). Set
> `VITE_PYTH_FEED_ID` to a usable feed before registering.
>
> Note also that `register_asset` requires `liquidation_threshold_bps > base_ltv_bps`;
> equal values are rejected with `MathOverflow`.

### Step 6.4: Mint Test Tokens & Fund Protocol Liquidity Vault
Borrowers draw quote tokens from the protocol's `liquidity_vault`, so it must hold
a balance or every `borrow` fails with `InsufficientLiquidity`.

`setup-devnet.ts` mints directly to the vault ATA (it is an ATA of the
`ProtocolConfig` PDA, so a plain `spl-token transfer` to an unrelated owner will
not work). Amounts come from `SETUP_LIQUIDITY` and `SETUP_COLLATERAL`.

To do it by hand:
```bash
# Mint quote tokens straight into the protocol liquidity vault ATA
wsl bash -c "export PATH='/usr/bin:/usr/sbin:/usr/local/bin:/home/SPARROW/.avm/bin:/home/SPARROW/.cargo/bin:/home/SPARROW/.local/share/solana/install/active_release/bin:$PATH' && spl-token mint <QUOTE_MINT> 100000 <LIQUIDITY_VAULT_ATA>"
```

---

## 7. Verification & Post-Deploy Health Checks

Run these verification commands to ensure all accounts and PDAs are correctly initialized:

### 7.1 Verify Protocol Program Deployment
```bash
wsl bash -c "export PATH='/usr/bin:/usr/sbin:/usr/local/bin:/home/SPARROW/.avm/bin:/home/SPARROW/.cargo/bin:/home/SPARROW/.local/share/solana/install/active_release/bin:$PATH' && solana program show Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2"
```

### 7.2 Inspect ProtocolConfig PDA
Derive the PDA and inspect account data:
```bash
# ProtocolConfig PDA has seeds = [b"protocol"]
wsl bash -c "export PATH='/usr/bin:/usr/sbin:/usr/local/bin:/home/SPARROW/.avm/bin:/home/SPARROW/.cargo/bin:/home/SPARROW/.local/share/solana/install/active_release/bin:$PATH' && solana account <PROTOCOL_CONFIG_PDA>"
```

### 7.3 Verify Vault Balances & Authorities
```bash
# Check Collateral Vault ATA
wsl bash -c "export PATH='/usr/bin:/usr/sbin:/usr/local/bin:/home/SPARROW/.avm/bin:/home/SPARROW/.cargo/bin:/home/SPARROW/.local/share/solana/install/active_release/bin:$PATH' && spl-token account-info <COLLATERAL_VAULT_ATA>"

# Check Liquidity Vault ATA
wsl bash -c "export PATH='/usr/bin:/usr/sbin:/usr/local/bin:/home/SPARROW/.avm/bin:/home/SPARROW/.cargo/bin:/home/SPARROW/.local/share/solana/install/active_release/bin:$PATH' && spl-token account-info <LIQUIDITY_VAULT_ATA>"
```
Ensure the `owner` field on both token accounts matches the `ProtocolConfig` PDA address.

### 7.4 Verify Oracle Feed Connectivity

```bash
npm run check:oracle
```

This reports, for the configured feed and several reference feeds, which
sponsored shards exist, whether the owner matches the receiver program, the
decoded price, the confidence in basis points, the publish age, and the
verification level. A feed is only marked `USABLE` when it is owned by the
receiver, is `VerificationLevel::Full`, and is inside the staleness bound.

Then confirm the on-chain path end to end with a permissionless
[`refresh_guard`](file:///c:/Dev/Circuit/programs/circuit/src/instructions/refresh_guard.rs#L24)
call, which `setup-devnet.ts` performs automatically and whose resulting
`MarketGuard` state it prints.

Expect `restricted (marketClosed)` rather than `safe` whenever you run this
outside NYSE hours — that is correct behaviour, not a failure.
