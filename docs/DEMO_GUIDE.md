# Circuit Protocol - Judge Demo & Evaluation Guide

> **Solana Devnet Program ID:** `Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2`  
> **Network:** Solana Devnet (`https://api.devnet.solana.com`)  
> **Frontend App:** [https://circuit-on-solana.vercel.app](https://circuit-on-solana.vercel.app)

---

## ⏱️ The 2-Minute Judge Walkthrough ("Path to Aha!")

Circuit transforms tokenized equities (e.g. NVDA, AAPL) into programmable collateral on Solana. Unlike traditional protocols with static LTV and retroactive liquidations, Circuit operates a **real-time on-chain Risk Ratchet & Permission Engine**. When market or oracle risk spikes, credit permissions tighten instantly before debt can become toxic.

Follow these 4 quick steps to evaluate the entire protocol in under 2 minutes:

```
[1. View Real Oracle & Vaults] ──> [2. Trigger Confidence Shock] ──> [3. Ask Autonomous Agent] ──> [4. Inspect On-Chain PDAs]
        (/app/borrow)                       (/app/demo)                       (/app/autonomous)                    (/app/verify)
```

---

### Step 1: Real Devnet Collateral & Dynamic Permissions (`/app/borrow`)
1. Navigate to **Borrow** (`/app/borrow`).
2. Select **NVDA** (or AAPL).
3. Connect your Solana Devnet wallet (Phantom, Solflare, or Backpack).
4. Observe the live market indicators:
   - **Pyth Price Update**: Pulled directly from Pyth Network Solana Devnet Receiver (`rec5EKMG...`).
   - **MarketGuard & Session Status**: Observes NYSE trading calendar and oracle freshness.
   - **Circuit Protocol Permission Evaluator**: Notice the **7-attribute proof**:
     `ACTION` | `ASSET` | `RISK` | `POLICY` | `AUTHORITY` | `LIMIT` | `RESULT`
5. Enter a borrow amount. Notice the borrow button evaluates on-chain risk state and capacity before allowing transaction dispatch.

---

### Step 2: Experience the 11-Step Protocol Proof & Risk Ratchet (`/app/demo`)
Navigate to the isolated **Protocol Proof & Stress Sandbox** (`/app/demo`). This interactive harness proves the core thesis without requiring an actual market crash during your evaluation:

| Step # | Proof Stage | Evidence Classification | Description |
|---|---|---|---|
| **Step 1** | Human Collateral Ownership | `VERIFIED BY CODE` | Enforced on-chain by Anchor Position PDA and Vault ATA ownership constraints. |
| **Step 2** | Live Market Observation | `VERIFIED ONCHAIN` | Pyth pull oracle feeds live price and confidence interval on Solana Devnet. |
| **Step 3** | MarketGuard Validation | `VERIFIED BY TEST` | Validates session hours, freshness (<600s), and sanity bounds (13 unit tests). |
| **Step 4** | Risk State Derivation | `VERIFIED BY TEST` | Evaluates confidence ratio (\( \frac{\text{conf}}{\text{price}} \)) & price velocity (112 Rust tests). |
| **Step 5** | Capital Policy Adjustment | `VERIFIED BY TEST` | Dynamically clamps maximum allowable LTV. |
| **Step 6** | Permission State Shift | `VERIFIED BY CODE` | Single evaluate_permission evaluator transitions `BORROW` / `WITHDRAW` to `BLOCKED`. |
| **Step 7** | Manual Action Evaluation | `SIMULATED` | Modeled scenario in demo harness; live execution verified on `/app/borrow`. |
| **Step 8** | Agent Action Alignment | `SIMULATED` | Modeled scenario in demo harness; live execution verified on `/app/autonomous`. |
| **Step 9** | Stress Event Triggered | `SIMULATED` | Injects controlled Pyth confidence shock (e.g. 4.2% uncertainty) or NYSE halt. |
| **Step 10** | Borrow Instantly Blocked | `SIMULATED` | Ratchet snaps to `DEFENSIVE`; simulated policy rejection models on-chain `RiskDefensive` preflight failure. |
| **Step 11** | Staged Monotonic Recovery | `SIMULATED` | Modeled recovery crank in demo harness; underlying 5-epoch recovery rule is `VERIFIED BY TEST`. |

> **Key Takeaway**: Notice that when the ratchet shifts to `DEFENSIVE` or `EMERGENCY`, risk-increasing actions (borrowing, excess collateral withdrawal) are strictly prohibited, but **risk-reducing actions (repaying debt, exiting liquidity) always remain permitted**.

---

### Step 3: Test Autonomous Agent Reasoning & Delegation (`/app/autonomous`)
Navigate to **Autonomous Mode** (`/app/autonomous`).

Circuit features a dedicated AI Agent workspace that communicates with users via an interactive chat interface, but delegates execution through **strictly bounded on-chain permissions**.

#### Deterministic Prompts for Judges to Test:

1. **"What can I do with my position right now?"**
   - *Expected Response*: Agent inspects your active collateral, current debt, Pyth oracle state, and active Risk Ratchet state (`SAFE`, `RESTRICTED`, `DEFENSIVE`). It outputs allowed vs blocked operations according to protocol policy.

2. **"Borrow 200 USDC"** (when market is Safe)
   - *Expected Response*: Agent analyzes available headroom, formats a typed proposal (`CIRCUIT_ACTION_PROPOSAL`), and prompts you to sign via your wallet.

3. **"Borrow another 300 USDC"** (under Defensive or high utilization)
   - *Expected Response*: Agent explains that the risk ratchet prevents new debt under current market conditions. It provides the exact reason code (`RiskDefensive` or limit exceeded) and refuses to propose unsafe transactions.

4. **"Reduce my risk"**
   - *Expected Response*: Agent calculates the debt reduction or collateral addition needed to restore healthy margins and constructs a safe `Repay` or `Deposit` proposal.

5. **"Provide liquidity while the circuit allows it"**
   - *Expected Response*: Agent inspects the Meteora DBC devnet pool. It explains that liquidity exits remain permitted even during defensive states, whereas swap entries are gated by market risk.

> **Execution Truth Note**: In the web UI, agent actions operate in `MODE: INTERACTIVE (Wallet-Signed)`. The browser wallet reviews and signs every transaction. Headless server-side autonomous execution requires the daemon runtime (`scripts/agent-executor.ts`) with a configured `AGENT_SIGNER_SECRET`.

---

### Step 4: Cryptographic & On-Chain Evidence (`/app/verify`)
Navigate to **Verify** (`/app/verify`) to review the live on-chain truth:
- **Judge Quick Verification Bar**: Displays Program ID, Cluster Genesis, Permission Engine status, Oracle Source, and DBC Trading Venue.
- **One-Click On-Chain Evidence Directory**: Direct links to Solana Devnet Explorer for:
  - Protocol Singleton PDA
  - Asset Config PDAs (NVDA, AAPL)
  - MarketGuard PDAs
  - RiskRatchet PDAs
  - Collateral & Liquidity Vault Associated Token Accounts
- **Zero-Mock Verification**: Run `cargo test --lib` and `npm run test:unit` to verify the mathematical invariants.

---

## 🏷️ System Truth & Labeling Hierarchy

Every claim and component in Circuit is strictly categorized:

| Category Label | Definition & Location |
|---|---|
| `ONCHAIN VERIFIED` | Live Solana Anchor program, real PDAs, Pyth price updates, and on-chain token vaults. |
| `CODE VERIFIED` | Canonical TypeScript and Rust math engines verified by test suites. |
| `DEVNET TEST POOL` | Real Meteora DBC bonding curve test pools deployed on Solana Devnet. |
| `SIMULATED SCENARIO` | Controlled Pyth oracle confidence shocks and concentration sandboxes in `/app/demo`. |

Circuit never claims fake mainnet liquidity, fabricated institutional volume, or simulated transactions as real.
