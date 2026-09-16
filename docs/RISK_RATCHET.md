# Circuit Protocol — Risk-Adaptive Capital Authority & Risk Ratchet

> *"Agents decide what to do. circuit decides what capital they are allowed to risk."*

---

## 1. Executive Summary & Product Thesis

Autonomous financial agents and algorithmic stock strategies require programmatic execution speed, but granting external agents unconstrained custody or unbounded borrowing rights introduces catastrophic insolvency risks.

Traditional DeFi lending protocols rely on static parameters: fixed Loan-To-Value (LTV) limits, fixed liquidation thresholds, and zero awareness of external exchange hours, custody integrity, or real-time oracle uncertainty. In tokenized equity markets (e.g., tokenized AAPL, NVDA, GOOGL), this creates systemic failure modes:
1. **Off-hours oracle jumps**: When equities market close on Friday and reopen Monday with weekend gaps.
2. **Oracle confidence blowouts**: Wide Pyth confidence intervals during market open auction volatility or illiquidity.
3. **Agent runaway loops**: Rogue or compromised AI agents borrowing up to margin limits during deteriorating market conditions.

**Circuit Protocol** solves this by separating **strategy discretion** from **risk authority**:
- **Autonomous Agents** decide *what* actions to take (e.g., rebalance collateral, execute directional leveraged longs, hedge delta).
- **Circuit's On-Chain Program** enforces *what capital they are allowed to risk*, dynamically scaling permissions and risk costs according to deterministic on-chain risk states.

---

## 2. Core Mathematical Formalism

All financial calculations inside Circuit Protocol are evaluated using checked integer fixed-point arithmetic (`u128` intermediates, zero floating-point operations).

### 2.1 Oracle Relative Uncertainty ($u_t$)

Pyth PriceUpdateV2 accounts provide a price $p_t$ and an uncertainty confidence interval $\pm \text{conf}_t$. We define relative uncertainty $u_t$ normalized into basis points ($1\text{ bps} = 0.01\%$):

$$u_t = \left( \frac{\text{conf}_t}{p_t} \right) \times 10{,}000$$

If $p_t \le 0$, the oracle update is rejected as malformed (`InvalidOraclePrice`).

### 2.2 Conservative Collateral Valuation ($p^{\text{cons}}_t$)

To prevent toxic liquidations and bad debt driven by price uncertainty, Circuit values collateral assets using the lower confidence bound:

$$p^{\text{cons}}_t = p_t - \text{conf}_t$$

For debt obligations (USDC), valuation uses the nominal quote value.

### 2.3 Multi-Asset Concentration Penalty

When a position or portfolio utilizes multiple collateral assets, concentration risk is evaluated by calculating maximum weight $C_{\max} = \max_i(w_i)$. If $C_{\max} > 40\%$, an effective LTV discount is applied:

$$\text{Penalty}_{\text{bps}} = \min\left(2000, \left(C_{\max} - 4000\right) \times 0.5\right)$$
$$\text{LTV}_{\text{eff}} = \text{base\_ltv} \times \frac{10{,}000 - \text{Penalty}_{\text{bps}}}{10{,}000}$$

### 2.4 Health Factor ($\text{HF}$)

A position's solvency is parameterized in basis points where $10{,}000 = 1.00\text{x}$:

$$\text{HF} = \frac{\sum_i \left( \text{collateral}_i \times p_i^{\text{cons}} \times \text{LT}_i \right)}{\text{debt} \times 10{,}000}$$

Where:
- $\text{LT}_i$ is the liquidation threshold of asset $i$ (e.g., 8,000 bps = 80%).
- If $\text{debt} = 0$, $\text{HF} = \infty$.
- Liquidation eligibility triggers whenever $\text{HF} < 10{,}000$.

---

## 3. Deterministic 4-State Machine & Hysteresis

The protocol maintains a deterministic state machine parameterized across four canonical market states:

$$\mathcal{S}_t \in \{\text{SAFE}, \text{RESTRICTED}, \text{DEFENSIVE}, \text{EMERGENCY}\}$$

```
                ┌─────────────────────────────────────────────────────────┐
                │                       EMERGENCY                         │
                └──────────────┬───────────────────────────▲──────────────┘
                               │ (5 Clean Obs:             │ (u > 300 bps OR
                               │  u < 250 bps)             │  Custody Impaired)
                               ▼                           │
                ┌──────────────────────────────┐           │
                │                  DEFENSIVE   ├───────────┤
                └──────────────┬───────────────┘           │
                               │ (5 Clean Obs:             │ (u > 150 bps)
                               │  u < 100 bps)             │
                               ▼                           │
                ┌──────────────────────────────┐           │
                │                 RESTRICTED   ├───────────┤
                └──────────────┬───────────────┘           │
                               │ (5 Clean Obs:             │ (u > 50 bps OR
                               │  u < 30 bps)              │  NYSE Closed)
                               ▼                           │
                ┌──────────────────────────────┴───────────┘
                │                        SAFE
                └─────────────────────────────────────────────────────────┘
```

### 3.1 Asymmetric Fast Degradation (Instant Tightening)

When market risk escalates, the state transitions instantly to the most restrictive applicable level within the same transaction:

| Trigger Condition | Target State | Immediate Effect |
| :--- | :--- | :--- |
| $u_t > 50\text{ bps}$ OR NYSE Session Closed | **RESTRICTED** | New borrowing capped; risk cost $2\times$ |
| $u_t > 150\text{ bps}$ | **DEFENSIVE** | All new borrowing blocked; withdrawals with debt blocked; risk cost $4\times$ |
| $u_t > 300\text{ bps}$ OR Custody Impaired | **EMERGENCY** | All risk-increasing actions blocked; risk cost $\infty$; repayments and deposits open |

### 3.2 Monotonic Hysteresis Recovery (Anti-Flapping)

To prevent oscillatory state switching (chatter) during volatile market regimes, recovery operates under strict **asymmetric hysteresis**:
1. **Lower Thresholds ($T^{up} < T^{down}$)**:
   - Recovery from `Restricted` $\to$ `Safe` requires $u_t < 30\text{ bps}$ (vs downgrade trigger at $50\text{ bps}$).
   - Recovery from `Defensive` $\to$ `Restricted` requires $u_t < 100\text{ bps}$ (vs downgrade trigger at $150\text{ bps}$).
   - Recovery from `Emergency` $\to$ `Defensive` requires $u_t < 250\text{ bps}$ (vs downgrade trigger at $300\text{ bps}$).
2. **Consecutive Observation Requirement ($N = 5$)**:
   - A single clean price tick is insufficient to step up.
   - The protocol requires $N = 5$ consecutive healthy observations before stepping up one state.
   - Any dirty tick encountered resets `consecutive_healthy_observations` to 0.
3. **No Skip-Step Recovery Invariant**:
   - Direct jumps such as $\text{EMERGENCY} \to \text{SAFE}$ are mathematically impossible and rejected by `is_legal_transition`. Recovery must step sequentially through intermediate states.
4. **Transition Sequencing**:
   - Every state transition monotonically increments `transition_nonce: u64` and updates `last_transition_ts: i64`, providing replay protection across cranks and keepers.

---

## 4. Capital Policy & Permission Matrix

The protocol enforces authoritative capital permissions on every transaction:

| Action | SAFE | RESTRICTED | DEFENSIVE | EMERGENCY | Protocol Rationale |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Deposit Collateral** | ✅ Allowed | ✅ Allowed | ✅ Allowed | ✅ Allowed | **Risk-Reducing Invariant**: Collateral deposits always reduce LTV and improve health. |
| **Repay Debt** | ✅ Allowed | ✅ Allowed | ✅ Allowed | ✅ Allowed | **Anti-Hostage Invariant**: Users & agents can always de-lever and retire liabilities. |
| **Borrow Debt** | ✅ Allowed | ⚠️ Capped (2x Cost) | ❌ Blocked (`RiskDefensive`) | ❌ Blocked (`RiskEmergency`) | Prevents balance-sheet expansion during market turbulence. |
| **Withdraw Collateral** | ✅ Allowed (if HF ok) | ✅ Allowed (if HF ok) | ❌ Blocked if Debt > 0 | ❌ Blocked if Debt > 0 | Prevents collateral flight when positions are at risk. |
| **Liquidate** | ❌ (if HF >= 1) | ❌ (if HF >= 1) | ✅ (if HF < 1) | ✅ (if HF < 1) | Solvency preservation takes precedence over pause/emergency. |

---

## 5. Bounded Agent Authority Delegation

Users can delegate operational authority to autonomous strategies via the on-chain `AgentAuthority` PDA:

$$\text{PDA Seeds} = [\texttt{"authority"}, \text{owner}, \text{agent}, \text{asset\_mint}]$$

### 5.1 Account Schema

```rust
pub struct AgentAuthority {
    pub owner: Pubkey,
    pub agent: Pubkey,
    pub asset_mint: Pubkey,
    pub allowed_actions: u8,
    pub max_borrow_limit: u64,
    pub max_withdraw_limit: u64,
    pub current_borrowed: u64,
    pub risk_budget: u64,
    pub initial_risk_budget: u64,
    pub expiry_ts: i64,
    pub nonce: u64,
    pub bump: u8,
}
```

### 5.2 Action Bitmask

Permissions are configured via bitwise flags:
- `ACTION_DEPOSIT = 1 << 0` ($0\text{x}01$)
- `ACTION_BORROW = 1 << 1` ($0\text{x}02$)
- `ACTION_REPAY = 1 << 2` ($0\text{x}04$)
- `ACTION_WITHDRAW = 1 << 3` ($0\text{x}08$)

### 5.3 Action Risk Cost & Dynamic Risk Budget ($B_t$)

Every agent action incurs a risk cost $C(a, x_t)$ evaluated dynamically against the remaining budget $B_t$:

$$C_{\text{borrow}}(a, x_t) = \text{amount} \times \left( \frac{10{,}000 + u_{\text{bps}}}{10{,}000} \right) \times M(\mathcal{S})$$

Where $M(\mathcal{S})$ is the market state multiplier:
- $M(\text{SAFE}) = 1$
- $M(\text{RESTRICTED}) = 2$
- $M(\text{DEFENSIVE}) = 4$
- $M(\text{EMERGENCY}) = \infty$ (action blocked)

Budget is deducted on execution:
$$B_{t+1} = B_t - C(a, x_t) \quad (\text{requires } B_t \ge C(a, x_t))$$

Risk-reducing actions (repayments and deposits) restore the risk budget up to the initial ceiling $B_0$:
$$B_{t+1} = \min\left(B_0, B_t + \text{amount}\right)$$

### 5.4 Replay Protection & Expiry

- Every action intent requires an explicit `intent_nonce`. Execution fails if `intent_nonce != authority.nonce`.
- If `Clock::get()?.unix_timestamp > authority.expiry_ts` (and `expiry_ts > 0`), the authority is considered expired and all actions are rejected (`AgentAuthorityExpired`).

---

## 6. Adversarial Audit & Verification Results

The Risk-Adaptive Permission Layer has undergone comprehensive adversarial testing under LiteSVM across 6 security domains (54 vectors):

1. **Domain 1: Risk Ratchet State Machine & Deterministic Hysteresis (Vectors 1–13)**:
   - Verified that SAFE remains SAFE under nominal conditions.
   - Verified fast degradation upon uncertainty spikes or session close.
   - Verified strict sequential recovery: `EMERGENCY` $\to$ `DEFENSIVE` $\to$ `RESTRICTED` $\to$ `SAFE` requiring 5 consecutive clean ticks.
   - Verified that a single dirty observation resets the recovery counter.
   - Verified transition nonce incrementing and timestamp monotonicity.
2. **Domain 2: Oracle Uncertainty & Bounds (Vectors 14–19)**:
   - Verified rejection of stale prices, wrong feed IDs, unauthorized account owners, and wide confidence intervals.
   - Verified strict rejection of borrowing outside NYSE regular trading hours.
3. **Domain 3: Credit Enforcement & Hard Invariants (Vectors 20–28)**:
   - Verified that borrowing is strictly blocked in Defensive and Emergency states.
   - Verified that deposits and repayments remain 100% available in all states.
   - Verified hard LTV mathematical caps.
   - Verified that risk budget cannot synthesize synthetic collateral or bypass protocol invariants.
4. **Domain 4: Agent Authority Delegation Constraints (Vectors 29–36)**:
   - Verified that unauthorized signers are strictly rejected.
   - Verified enforcement of policy borrow caps ($400 cap vs $500 attempt).
   - Verified that agents cannot modify owner policies (`update_agent_authority` requires owner signature).
   - Verified that expired authority or replayed nonces fail.
5. **Domain 5: Multi-Asset Position Isolation (Vectors 37–40)**:
   - Verified that AAPL positions and NVDA positions operate under distinct PDAs and isolated vault balances.
6. **Domain 6: Hostile Adversarial Attacks (Vectors 41–54)**:
   - Verified rejection of zero-price or negative-price oracle updates.
   - Verified arithmetic overflow protection on `u64::MAX` values.
   - Verified that risk budget depletion halts agent activity until collateral is restored.

---

## 7. Instruction Reference

### `create_agent_authority`
- **Signer**: Collateral Owner
- **Accounts**: `[owner, agent, asset_mint, agent_authority_pda, system_program]`
- **Args**: `allowed_actions: u8`, `max_borrow_limit: u64`, `max_withdraw_limit: u64`, `initial_risk_budget: u64`, `expiry_ts: i64`

### `update_agent_authority`
- **Signer**: Collateral Owner (Strictly enforced; agent signature rejected)
- **Accounts**: `[owner, agent_authority_pda]`
- **Args**: `allowed_actions: u8`, `max_borrow_limit: u64`, `max_withdraw_limit: u64`, `risk_budget: u64`, `expiry_ts: i64`, `revoke: bool`

### `execute_agent_action`
- **Signer**: Delegated Agent
- **Accounts**: `[agent, owner, agent_authority_pda, position_pda, asset_config_pda, protocol_config_pda, market_guard_pda, risk_ratchet_pda, pyth_price_update, ...token accounts]`
- **Args**: `action: AgentAction`, `amount: u64`, `nonce: u64`
