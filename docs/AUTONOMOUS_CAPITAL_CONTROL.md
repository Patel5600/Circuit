# Autonomous Capital Control: Risk-Adaptive Strategy Authority

> **Core Architectural Principle**:  
> *"Agents decide what to do. Circuit decides what capital they are allowed to risk."*

---

## 1. Problem & Executive Thesis

Autonomous financial strategies—such as delta-neutral hedging bots, algorithmic momentum strategies, and automated liquidity managers—require programmatic execution speed. However, granting external agents unconstrained custody or unbounded credit limits exposes depositors to catastrophic insolvency risks:

1. **Agent Runaway Loops**: A misconfigured, latency-compromised, or hacked strategy can continuously draw leverage, piling bad debt into positions during rapid market sell-offs.
2. **Off-Hours Oracle & Market Disconnects**: Traditional equities trade during set exchange hours (e.g., NYSE 09:30–16:00 EST). During market closures, halts, or weekend gaps, static LTV lending protocols blindly accept stale or synthetic prices.
3. **Oracle Confidence Blowouts**: High-volatility market opens or liquidity shocks widen Pyth confidence intervals ($\pm \text{conf}$). Standard protocols ignore confidence intervals, treating uncertain prices as absolute truth.
4. **The Custody Dilemma**: Handing collateral directly to agent keys invites rug-pulls, while manual owner execution destroys the speed benefits of algorithmic execution.

**Circuit Protocol** introduces **Stateful Autonomous Capital Control**:
The collateral owner deposits tokenized equity (e.g., AAPLx, NVDAx) into Circuit's non-custodial vault and creates a cryptographically bounded `AgentAuthority` policy on-chain. The autonomous agent is granted permission to propose and execute actions, but **every transaction is evaluated against Circuit's authoritative on-chain risk control plane**.

```
                ┌──────────────────────────────────────────────────┐
                │               COLLATERAL OWNER                   │
                │        (Defines Policy Limits on-chain)          │
                └────────────────────────┬─────────────────────────┘
                                         │ Delegated Authority PDA
                                         ▼
                ┌──────────────────────────────────────────────────┐
                │          AUTONOMOUS STRATEGY AGENT               │
                │    (Proposes: Borrow, Repay, Deposit, Withdraw)   │
                └────────────────────────┬─────────────────────────┘
                                         │ Action Intent (Signed by Agent)
                                         ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               CIRCUIT PROTOCOL CONTROL PLANE                            │
│                                                                                        │
│  [1. MarketGuard]             [2. Risk Ratchet]             [3. Capital Policy]         │
│   • Pyth Price & Conf Ratio    • SAFE                        • Effective LTV            │
│   • NYSE Session Validity      • RESTRICTED                  • Max Debt Capacity        │
│   • Custody & Liquidity Checks • DEFENSIVE                   • Action Risk Multiplier   │
│                                • EMERGENCY                   • Dynamic Risk Budget      │
│                                                                                        │
│  [4. Permission Evaluation Engine]                                                     │
│   • Check Action Bitmask: Is action authorized by Owner?                              │
│   • Check Intent Nonce: Replay protection (Monotonic Increment)                       │
│   • Check Expiry Timestamp: Authority still valid?                                     │
│   • Check State Permissions: Is action legal in current Risk Ratchet state?           │
│   • Check Action Risk Cost: Does C(action) <= Remaining Budget?                       │
│   • Check Solvency Invariant: Will resulting Health Factor >= 10,000 (1.00x)?          │
└────────────────────────────────────────┬───────────────────────────────────────────────┘
                                         │ Authorized Mutation
                                         ▼
                ┌──────────────────────────────────────────────────┐
                │           ON-CHAIN POSITION & SETTLEMENT         │
                │    (Vault Transfers, Debt Accounting, Events)    │
                └──────────────────────────────────────────────────┘
```

---

## 2. On-Chain Account State Schema

### 2.1 The `AgentAuthority` PDA

Delegation is established through a dedicated Program Derived Address (PDA):

$$\text{Seeds} = [\texttt{"authority"},\; \text{owner},\; \text{agent},\; \text{asset\_mint}]$$

```rust
#[account]
#[derive(Default)]
pub struct AgentAuthority {
    pub owner: Pubkey,               // 32: Collateral owner who established delegation
    pub agent: Pubkey,               // 32: Designated strategy key authorized to execute
    pub asset_mint: Pubkey,          // 32: Canonical tokenized equity mint (e.g., AAPLx)
    pub allowed_actions: u8,         //  1: Bitmask of permitted operations
    pub max_borrow_limit: u64,       //  8: Maximum cumulative debt agent can incur
    pub max_withdraw_limit: u64,     //  8: Maximum collateral agent can withdraw
    pub current_borrowed: u64,       //  8: Real-time debt attributed to this agent
    pub risk_budget: u64,            //  8: Current remaining dynamic risk budget (B_t)
    pub initial_risk_budget: u64,    //  8: Initial risk budget ceiling (B_0)
    pub expiry_ts: i64,              //  8: Unix timestamp after which authority expires
    pub nonce: u64,                  //  8: Monotonic intent nonce for replay prevention
    pub bump: u8,                    //  1: Canonical PDA bump
}
```

### 2.2 Action Bitmask Specification

Permissions are encoded as bitwise flags in `allowed_actions`:

| Bit | Flag Constant | Value | Description |
| :--- | :--- | :--- | :--- |
| Bit 0 | `ACTION_DEPOSIT` | `1 << 0` ($0\text{x}01$) | Agent can deposit collateral to enhance position health |
| Bit 1 | `ACTION_BORROW` | `1 << 1` ($0\text{x}02$) | Agent can draw liquidity against position collateral |
| Bit 2 | `ACTION_REPAY` | `1 << 2` ($0\text{x}04$) | Agent can repay outstanding debt to de-lever |
| Bit 3 | `ACTION_WITHDRAW` | `1 << 3` ($0\text{x}08$) | Agent can withdraw collateral up to `max_withdraw_limit` |

---

## 3. The 4-State Deterministic Risk Ratchet

The protocol evaluates real-time market risk through four canonical states:

$$\mathcal{S}_t \in \{\text{SAFE},\; \text{RESTRICTED},\; \text{DEFENSIVE},\; \text{EMERGENCY}\}$$

### 3.1 Fast Downgrades (Asymmetric Immediate Tightening)

Upon encountering any risk trigger, Circuit instantly transitions to the strictest matching state in the active transaction:

```
Uncertainty > 50 bps  OR  NYSE Closed  ──►  RESTRICTED  (Borrow capped, 2x budget cost)
Uncertainty > 150 bps                  ──►  DEFENSIVE   (Borrow blocked, withdraw with debt blocked)
Uncertainty > 300 bps OR Custody Alert ──►  EMERGENCY   (All risk-increasing actions blocked)
```

### 3.2 Monotonic Hysteresis Recovery (Anti-Flapping)

Recovery requires conditions significantly cleaner than the downgrade triggers, accompanied by multi-tick persistence:

1. **Asymmetric Deadband Thresholds ($T^{up} < T^{down}$)**:
   - `Restricted` $\to$ `Safe`: Relative uncertainty $u_t < 30\text{ bps}$ (vs downgrade at $50\text{ bps}$).
   - `Defensive` $\to$ `Restricted`: Relative uncertainty $u_t < 100\text{ bps}$ (vs downgrade at $150\text{ bps}$).
   - `Emergency` $\to$ `Defensive`: Relative uncertainty $u_t < 250\text{ bps}$ (vs downgrade at $300\text{ bps}$).
2. **Consecutive Clean Tick Persistence ($N = 5$)**:
   - The protocol requires 5 consecutive healthy observations (`consecutive_healthy_observations == 5`) before stepping up one level.
   - Any single volatile or dirty observation instantly resets the counter to 0.
3. **Strict Sequential Stepping**:
   - Transitions directly from `EMERGENCY` to `SAFE` are strictly forbidden on-chain. Recovery must traverse `EMERGENCY` $\to$ `DEFENSIVE` $\to$ `RESTRICTED` $\to$ `SAFE`.

---

## 4. Capital Policy & Dynamic Risk Budget ($B_t$)

### 4.1 State-Dependent Action Risk Cost

Every agent action incurs a risk cost $C(a, x_t)$ evaluated dynamically against the remaining budget $B_t$:

$$C_{\text{borrow}}(a, x_t) = \text{amount} \times \left( \frac{10{,}000 + u_{\text{bps}}}{10{,}000} \right) \times M(\mathcal{S})$$

Where state multiplier $M(\mathcal{S})$ scales with market stress:
- $M(\text{SAFE}) = 1.0\times$
- $M(\text{RESTRICTED}) = 2.0\times$
- $M(\text{DEFENSIVE}) = 4.0\times$
- $M(\text{EMERGENCY}) = \infty$ (action unconditionally rejected)

### 4.2 Budget Consumption and Restoration

- **Execution**: The budget is reduced by $C(a, x_t)$. If $B_t < C(a, x_t)$, the transaction fails with `RiskBudgetExhausted`.
- **Restoration**: Risk-reducing actions (debt repayments and collateral deposits) restore the risk budget:
  $$B_{t+1} = \min\left(B_0,\; B_t + \text{amount}\right)$$

---

## 5. Protocol Invariants

Circuit enforces 10 fundamental financial invariants:

- **I1 (Hysteresis Invariant)**: Risk state can never decrease without satisfying recovery thresholds and $N=5$ consecutive clean ticks.
- **I2 (Emergency Invariant)**: In `EMERGENCY` state, no risk-increasing actions (borrowing, withdrawing collateral while debt exists) can execute.
- **I3 (Owner Policy Primacy)**: Agent authority can never exceed owner-defined limits (`max_borrow_limit`, `allowed_actions`, `expiry_ts`).
- **I4 (Solvency Capacity Bound)**: Borrowing can never increase debt beyond:
  $$\text{Capacity} = \text{CollateralValue}_{\text{cons}} \times \text{EffectiveLTV} - \text{ExistingDebt}$$
- **I5 (Non-Negative Budget)**: Risk budget subtraction uses checked integer math and can never underflow.
- **I6 (No Synthetic Credit)**: An agent with an arbitrarily large risk budget cannot borrow beyond the position's physical collateral capacity.
- **I7 (Oracle Integrity Bound)**: Stale or unverified oracle feeds unconditionally block risk-increasing actions.
- **I8 (Canonical Position Isolation)**: Position and authority PDAs are strictly bound to canonical mint and owner pubkeys. No cross-asset state contamination.
- **I9 (Protocol Authority Invariant)**: Frontend clients and agent software are strictly non-authoritative. All permissions are evaluated on-chain.
- **I10 (Transition Determinism)**: Identical market inputs produce identical on-chain state transitions.

---

## 6. Verification and Test Suite Summary

The Autonomous Capital Control implementation is verified under LiteSVM across:
- **8-Step Complete Lifecycle Demo** (`tests/autonomous-demo.ts`):
  Deposit $\to$ Authorize $\to$ Borrow in Safe $\to$ Confidence Shock $\to$ Rejection on-chain $\to$ Repayment $\to$ 5-Tick Hysteresis Recovery $\to$ Restored Borrowing.
- **64 Adversarial Test Vectors & Formal Invariants** (`tests/adversarial-risk-authority.test.ts`):
  Covering state transitions, oracle uncertainty, credit limits, signer impersonation, replay attacks, state-flapping, and property-based invariants I1–I10.
- **78 On-chain Rust Unit Tests** (`cargo test`):
  Covering fixed-point math, conservative Pyth confidence bounds, concentration penalties, and permission evaluator matrices.
