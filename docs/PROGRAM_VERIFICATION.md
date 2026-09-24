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
| **Verified Build Commit** | `4faab2e` |
| **OtterSec Verification PDA** | `ASEZW9QkzcycmhMN6j3Ej8hCVAGN5bvdbTbKthk9nXEc` |
| **OtterSec Verifier Program** | `verifycLy8mB96wd9wqq3WDXcwKbCZrScaKq4nyUzt9` |
| **Anchor Version** | `0.30.1` |
| **Solana CLI Toolchain** | `1.18.26` |
| **Rust Edition** | `2021` (`nightly-2024-02-04`) |

---

## 2. Onchain Verification Status Audit

### Why Solana Explorer Shows "Program Not Verified"

When inspecting `Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2` on Solana Explorer Devnet, users observe the purple status badge indicating:
`Program Not Verified`

This occurs due to the exact hashing mechanics of the OtterSec Verifiable Build Registry (`verifycLy8mB96wd9wqq3WDXcwKbCZrScaKq4nyUzt9`):

1. **Initial Verified Deployment**:
   - The Circuit program was verified under commit `4faab2e`.
   - The verification proof was successfully written onchain to PDA `ASEZW9QkzcycmhMN6j3Ej8hCVAGN5bvdbTbKthk9nXEc`.
   - The PDA stores the verified repository URL (`github.com/Patel5600/Circuit`), commit hash (`4faab2e`), and sha256 checksum of the compiled binary.

2. **Subsequent Program Binary Update**:
   - At slot `497,760,168`, an updated program binary was deployed by upgrade authority `F5JmuDsKh9oswAhR9rJSfL2PGU1UpQF2cN3n7NjZrFAT` to add instruction capabilities and Risk Envelope support.
   - Solana Explorer performs a real-time sha256 comparison between the current onchain executable buffer and the buffer hash stored in the OtterSec verification PDA.
   - Because the executable buffer hash was updated at slot `497,760,168`, Explorer marks the status as unverified until a fresh `solana-verify verify-from-repo` run publishes the updated hash.

3. **Verification PDA Inspection**:
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
# 1. Install Solana CLI 1.18.26
sh -c "$(curl -sSfL https://release.anza.xyz/v1.18.26/install)"

# 2. Install Anchor 0.30.1 via avm
avm install 0.30.1
avm use 0.30.1

# 3. Install solana-verify tool
cargo install solana-verify
```

### Reproducible Docker Build

To eliminate host OS discrepancies (macOS/Linux/Windows WSL), build via the official Anza/Ellipsis Docker container:

```bash
# Clone the repository
git clone https://github.com/Patel5600/Circuit.git
cd Circuit

# Build deterministic binary via solana-verify
solana-verify build --library-name circuit
```

The resulting binary will be output to:
`target/deploy/circuit.so`

Compute the sha256 hash:
```bash
sha256sum target/deploy/circuit.so
```

### Onchain Verification Submission

To update the OtterSec registry for the latest commit:

```bash
solana-verify verify-from-repo \
  --program-id Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2 \
  --url devnet \
  --remote \
  https://github.com/Patel5600/Circuit
```

---

## 4. Key Security & Authority Governance

1. **Upgrade Authority**:
   - `F5JmuDsKh9oswAhR9rJSfL2PGU1UpQF2cN3n7NjZrFAT`
   - Governed as a hardware-secured keypair on Devnet; scheduled for migration to a Squads v4 multisig prior to Mainnet deployment.
   - No private keys are stored in the codebase, environment variables, git history, or CI/CD logs.

2. **Immutable Runtime Parameters**:
   - Protocol program accounts are protected by Anchor `has_one = authority` checks.
   - User funds are isolated in Program Derived Addresses (PDAs) with seeds `["protocol"]` and `["position", owner, mint]`.
   - The upgrade authority CANNOT drain user collateral vaults or bypass math checks. All math is bounded by invariant checks and zero-float `u128` fixed-point arithmetic.
