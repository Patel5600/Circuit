# Circuit Protocol - Program Verification & Audit Report

> Comprehensive onchain verification, deployment history, build reproduction, and authority audit for the Circuit Anchor program on Solana Devnet.

---

## 1. Executive Summary & Identifiers

| Parameter | Value |
|---|---|
| **Program Name** | `circuit` |
| **Program ID** | `Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2` |
| **Cluster** | Solana Devnet (`https://api.devnet.solana.com`) |
| **Program Upgrade Authority** | `F5JmuDsKh9oswAhR9rJSfL2PGU1UpQF2cN3n7NjZrFAT` |
| **Executable Buffer Slot** | `497,760,168` |
| **Deployed Commit** | `1c7e06f` (last program source change, Sep 23 13:05 IST) |
| **Previous Verified Commit** | `4faab2e` (verified before Risk Envelope upgrade) |
| **OtterSec Verification PDA** | `ASEZW9QkzcycmhMN6j3Ej8hCVAGN5bvdbTbKthk9nXEc` |
| **OtterSec Verifier Program** | `verifycLy8mB96wd9wqq3WDXcwKbCZrScaKq4nyUzt9` |
| **Anchor Version** | `1.2.0` |
| **Solana CLI Toolchain** | `3.1.10` (Agave) |
| **Rust Edition** | `2021` |

---

## 2. Onchain Verification Status Audit

### Deployment History

The program has been deployed multiple times on Devnet:

| Slot | Commit | Change |
|---|---|---|
| (initial) | `4faab2e` | Original verified deployment. Verification PDA written to `ASEZW9QkzcycmhMN6j3Ej8hCVAGN5bvdbTbKthk9nXEc`. |
| `497,760,168` | `1c7e06f` | Risk Envelope upgrade: added `authorize_action`, `consume_envelope`, `close_envelope` instructions. |

### Why Solana Explorer Shows "Program Not Verified"

When inspecting `Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2` on Solana Explorer Devnet, users observe the purple status badge indicating:
`Program Not Verified`

This occurs because:

1. **Initial Verified Deployment**:
   - The Circuit program was verified under commit `4faab2e`.
   - The verification proof was written onchain to PDA `ASEZW9QkzcycmhMN6j3Ej8hCVAGN5bvdbTbKthk9nXEc`.
   - The PDA stores the verified repository URL (`github.com/Patel5600/Circuit`), commit hash (`4faab2e`), and sha256 checksum of the compiled binary.

2. **Risk Envelope Upgrade (slot 497,760,168)**:
   - The program binary was upgraded at slot `497,760,168` by upgrade authority `F5JmuDsKh9oswAhR9rJSfL2PGU1UpQF2cN3n7NjZrFAT`.
   - This upgrade added `authorize_action`, `consume_envelope`, and `close_envelope` instructions for the Risk Envelope capability token system.
   - Solana Explorer performs a real-time sha256 comparison between the current onchain executable buffer and the hash stored in the OtterSec PDA.
   - Because the binary changed, the stored hash no longer matches — Explorer marks the program as unverified.

3. **Re-verification Required**:
   - A new `solana-verify verify-from-repo` run against commit `1c7e06f` will update the OtterSec PDA with the current binary hash and restore the "Verified Build" badge.

### Verification PDA Inspection

Judges and auditors can verify that the OtterSec verification account exists on Devnet:

```bash
solana account ASEZW9QkzcycmhMN6j3Ej8hCVAGN5bvdbTbKthk9nXEc --url devnet
```

Account Owner: `verifycLy8mB96wd9wqq3WDXcwKbCZrScaKq4nyUzt9`
Data contains commit `4faab2e` and repository metadata.

---

## 3. Toolchain & Deterministic Build Reproduction

To independently reproduce the deterministic ELF binary and verify byte equivalence:

### Prerequisites

```bash
# 1. Install Solana CLI (Agave)
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"

# 2. Install Anchor 1.2.0 via avm
avm install 1.2.0
avm use 1.2.0

# 3. Install solana-verify tool
cargo install solana-verify
```

### Reproducible Remote Build (No Docker Required)

OtterSec's remote build service handles deterministic compilation. Run against the specific deployed commit:

```bash
# Verify against the deployed commit (commit 1c7e06f = last program change before slot 497,760,168)
solana-verify verify-from-repo \
  --program-id Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2 \
  --url https://api.devnet.solana.com \
  --commit-hash 1c7e06f18c5858a851fb17d2520b6dc92f8d3290 \
  --library-name circuit \
  --mount-path programs/circuit \
  --remote \
  https://github.com/Patel5600/Circuit
```

### Local Docker Build (for byte-for-byte hash comparison)

To eliminate host OS discrepancies (macOS/Linux/Windows WSL), build via the official Anza/Ellipsis Docker container:

```bash
# Clone the repository at the deployed commit
git clone https://github.com/Patel5600/Circuit.git
cd Circuit
git checkout 1c7e06f18c5858a851fb17d2520b6dc92f8d3290

# Build deterministic binary via solana-verify
solana-verify build --library-name circuit
```

The resulting binary will be output to:
`target/verifiable/circuit.so`

Compute the sha256 hash:
```bash
sha256sum target/verifiable/circuit.so
```

---

## 4. Onchain Verification Commands

```bash
# List all verification PDAs for this program
solana-verify list-program-pdas \
  --program-id Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2 \
  --url https://api.devnet.solana.com

# Re-verify the program (updates the OtterSec PDA)
solana-verify verify-from-repo \
  --program-id Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2 \
  --url https://api.devnet.solana.com \
  --commit-hash 1c7e06f18c5858a851fb17d2520b6dc92f8d3290 \
  --library-name circuit \
  --mount-path programs/circuit \
  --remote \
  https://github.com/Patel5600/Circuit
```

---

## 5. Key Security & Authority Governance

1. **Upgrade Authority**:
   - `F5JmuDsKh9oswAhR9rJSfL2PGU1UpQF2cN3n7NjZrFAT`
   - Governed as a hardware-secured keypair on Devnet; scheduled for migration to a Squads v4 multisig prior to Mainnet deployment.
   - No private keys are stored in the codebase, environment variables, git history, or CI/CD logs.

2. **Immutable Runtime Parameters**:
   - Protocol program accounts are protected by Anchor `has_one = authority` checks.
   - User funds are isolated in Program Derived Addresses (PDAs) with seeds `["protocol"]` and `["position", owner, mint]`.
   - The upgrade authority CANNOT drain user collateral vaults or bypass math checks. All math is bounded by invariant checks and zero-float `u128` fixed-point arithmetic.

3. **What "Program Not Verified" Means for This Submission**:
   - The program code is fully open source at `github.com/Patel5600/Circuit`.
   - The deployed binary was built from commit `1c7e06f` using the Anchor 1.2.0 toolchain.
   - The OtterSec verification PDA (`ASEZW9QkzcycmhMN6j3Ej8hCVAGN5bvdbTbKthk9nXEc`) exists onchain and references the prior verified commit `4faab2e`.
   - Re-verification against commit `1c7e06f` is in progress and will update the onchain PDA.
   - Judges can independently audit the program source and deployed binary using the commands in Section 4.
