# Circuit Protocol - Program Verification & Audit Report

> Comprehensive onchain verification, deployment history, binary hash audit, and authority governance for the Circuit Anchor program on Solana Devnet.

---

## 1. Executive Summary & Identifiers

| Parameter | Value |
|---|---|
| **Program Name** | `circuit` |
| **Program ID** | `Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2` |
| **Cluster** | Solana Devnet (`https://api.devnet.solana.com`) |
| **Program Upgrade Authority** | `F5JmuDsKh9oswAhR9rJSfL2PGU1UpQF2cN3n7NjZrFAT` |
| **Deployed Slot** | `497,760,168` |
| **Slot Block Timestamp** | `2026-09-13T14:36:34Z` (20:06:34 IST) |
| **On-chain Program Hash** | `a1245675a622ee9ae7997e1b215dcfc371bcb6a2f15634f24f5ab81192da2e39` |
| **OtterSec Verification PDA** | `ASEZW9QkzcycmhMN6j3Ej8hCVAGN5bvdbTbKthk9nXEc` |
| **PDA Signer** | `F5JmuDsKh9oswAhR9rJSfL2PGU1UpQF2cN3n7NjZrFAT` (Upgrade Authority) |
| **PDA Update Tx Signature** | `3HANDsBFhEnVR2hsyBCZDn8s1Aqwzv7P5At8FDGyhtUB6DgssTiJrAKdqptXdhP4xXtgeaWnS79h5nZJnsnduuhj` |
| **Verifier Program ID** | `verifycLy8mB96wd9wqq3WDXcwKbCZrScaKq4nyUzt9` (OtterSec) |
| **Verification Tool** | `solana-verify v0.5.2` |
| **Anchor Framework** | `1.2.0` |
| **Rust / Solana Toolchain** | Agave `3.1.10` / `platform-tools v1.52` |

---

## 2. Onchain Verification Status & Forensic Audit

### Why Solana Explorer Shows "Program Not Verified" on Devnet

When inspecting `Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2` on Solana Explorer Devnet, the purple badge indicates `Program Not Verified`. 

Here is the exact technical explanation:

1. **OtterSec Remote Verifier is Mainnet-Only**:
   When submitting verification jobs to OtterSec's automated remote worker service via `solana-verify remote submit-job`, the API returns:
   ```
   Error: Remote verification service only supports mainnet. You're currently connected to a different network.
   ```
   OtterSec's automated build infrastructure only processes programs deployed to `mainnet-beta`. It does not execute automated compilation workers for Devnet.

2. **Onchain PDA vs Explorer Badge**:
   Solana Explorer's badge relies on the OtterSec central API indexer. Because OtterSec does not run the remote worker on Devnet, Explorer displays `Program Not Verified` by default for Devnet programs.

3. **Authentic Verification PDA is Live On-Chain**:
   The verification record is stored in the official OtterSec verification PDA on Solana Devnet:
   - **PDA Address**: `ASEZW9QkzcycmhMN6j3Ej8hCVAGN5bvdbTbKthk9nXEc`
   - **Owner**: `verifycLy8mB96wd9wqq3WDXcwKbCZrScaKq4nyUzt9` (OtterSec Verifier Program)
   - **Signer**: `F5JmuDsKh9oswAhR9rJSfL2PGU1UpQF2cN3n7NjZrFAT` (Confirmed Program Upgrade Authority)
   - **Git URL**: `https://github.com/Patel5600/Circuit`
   - **Commit**: `1c7e06f18c5858a851fb17d2520b6dc92f8d3290`
   - **Deployed Slot**: `497,760,168`
   - **Args**: `["--mount-path", "programs/circuit", "--library-name", "circuit"]`

Judges and auditors can verify this record directly onchain in seconds:
```bash
solana-verify get-program-pda \
  --program-id Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2 \
  --signer F5JmuDsKh9oswAhR9rJSfL2PGU1UpQF2cN3n7NjZrFAT \
  --url https://api.devnet.solana.com
```

---

## 3. Binary Hash Verification & Reproduction

Judges can independently verify the deployed binary hash directly from Solana Devnet:

### Step 1: Dump On-Chain Program
```bash
solana program dump Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2 /tmp/circuit_deployed.so --url https://api.devnet.solana.com
```

### Step 2: Compute Executable Hash via `solana-verify`
```bash
solana-verify get-executable-hash /tmp/circuit_deployed.so
```
**Expected Output**:
```
a1245675a622ee9ae7997e1b215dcfc371bcb6a2f15634f24f5ab81192da2e39
```

### Step 3: Query Program Hash from RPC
```bash
solana-verify get-program-hash Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2 --url https://api.devnet.solana.com
```
**Expected Output**:
```
a1245675a622ee9ae7997e1b215dcfc371bcb6a2f15634f24f5ab81192da2e39
```
The executable hash and onchain program hash match byte-for-byte.

---

## 4. Onchain PDA Verification Commands

To query all verification PDAs for Circuit:
```bash
solana-verify list-program-pdas \
  --program-id Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2 \
  --url https://api.devnet.solana.com
```

Output:
```
----------------------------------------------------------------
Address: ASEZW9QkzcycmhMN6j3Ej8hCVAGN5bvdbTbKthk9nXEc
----------------------------------------------------------------
Program Id: Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2
Signer: F5JmuDsKh9oswAhR9rJSfL2PGU1UpQF2cN3n7NjZrFAT
Git Url: https://github.com/Patel5600/Circuit
Commit: 1c7e06f18c5858a851fb17d2520b6dc92f8d3290
Deployed Slot: 497760168
Args: ["--mount-path", "programs/circuit", "--library-name", "circuit"]
Version: 0.5.2
```

---

## 5. Security & Authority Governance

1. **Upgrade Authority**:
   - Authority address: `F5JmuDsKh9oswAhR9rJSfL2PGU1UpQF2cN3n7NjZrFAT`
   - Governed as a dedicated deployer keypair on Devnet; scheduled for migration to a Squads v4 multisig prior to Mainnet deployment.
   - Zero private keys in git or CI/CD logs.

2. **Immutable Runtime Guarantees**:
   - All protocol vaults and user positions are Program Derived Addresses (PDAs) with seeds `["protocol"]` and `["position", owner, mint]`.
   - The upgrade authority CANNOT arbitrarily withdraw collateral or alter user balances.
   - All math is executed with zero floating point, using checked `u128` fixed-point arithmetic (`WAD = 10^18`).
   - 16 formal protocol invariants prevent undercollateralized borrows, stale oracle exploitation, unauthorized withdrawals, and capability token replay.
