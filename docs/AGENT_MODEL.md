# Circuit Protocol: Bounded Agent Execution Model

## 1. Executive Summary & Foundational Invariant

Circuit is **human-first, agent-optional, and protocol-sovereign**.

The fundamental thesis of the protocol is:
> **“Autonomy is optional. Safety is not.”**  
> *“Agents decide what to do. Circuit decides what capital they are allowed to risk.”*

In Circuit, autonomous stock trading strategies (AI agents, automated rebalancers, algorithmic quantitative bots) are treated strictly as an **untrusted, optional execution layer**. 

- The agent **never owns** the user's collateral.
- The agent **cannot configure or escalate** its own permissions.
- The agent **cannot bypass** risk containment policies.
- If every agent crashes, goes offline, or is maliciously compromised, the protocol remains **100% operational** for direct human manual control.

```
HUMAN or AGENT
       ↓
     ACTION
       ↓
CIRCUIT PERMISSION ENGINE
       ↓
   MARKETGUARD
       ↓
   RISK RATCHET
       ↓
 CAPITAL POLICY
       ↓
  CREDIT ENGINE
       ↓
   EXECUTION
```

---

## 2. Actor Taxonomy & Trust Boundaries

| Actor | Authority Scope | Can Own Collateral? | Can Authorize Limits? | Trust Level |
|---|---|---|---|---|
| **Human Owner** | Sovereign, unrestricted over position | Yes (sole owner) | Yes (configures delegation) | High (direct keypair signature) |
| **Autonomous Agent** | Strictly bounded subset of owner authority | **No** (never receives custody) | **No** (cannot modify authority) | **Untrusted** (adversarial / fail-stop) |
| **Protocol Program** | Sole enforcer of credit invariants & safety | Custodian via PDAs | Authoritative arbiter | **Authoritative Control Plane** |

---

## 3. On-Chain Account: `AgentAuthority` PDA

Agent delegation is stored in a dedicated Program Derived Address (PDA):
```rust
seeds = [b"authority", owner.key().as_ref(), agent.key().as_ref(), asset_mint.key().as_ref()]
```

### Account Layout
```rust
#[account]
#[derive(InitSpace)]
pub struct AgentAuthority {
    /// The human wallet delegating authority
    pub owner: Pubkey,

    /// The autonomous agent keypair authorized to sign action intents
    pub agent: Pubkey,

    /// The specific tokenized stock collateral mint (e.g. AAPLx, NVDAx)
    pub asset_mint: Pubkey,

    /// Allowed actions bitmask (DEPOSIT=1, BORROW=2, REPAY=4, WITHDRAW=8)
    pub allowed_actions: u8,

    /// Maximum cumulative debt the agent is permitted to draw
    pub max_borrow_limit: u64,

    /// Maximum cumulative collateral the agent is permitted to withdraw
    pub max_withdraw_limit: u64,

    /// Current active debt originated by this agent
    pub current_borrowed: u64,

    /// Remaining dynamic risk budget (B_t) for risk-increasing actions
    pub risk_budget: u64,

    /// Initial risk budget allocated by owner
    pub initial_risk_budget: u64,

    /// Unix timestamp after which authority is automatically expired (0 = perpetual until revoked)
    pub expiry_ts: i64,

    /// Monotonically increasing intent nonce for replay protection
    pub nonce: u64,

    /// PDA bump seed
    pub bump: u8,
}
```

---

## 4. Delegated Action Bitmask & Dynamic Risk Budget

### 4.1 Action Flags
```rust
pub const ACTION_DEPOSIT: u8  = 1 << 0; // 0b00000001 (1)
pub const ACTION_BORROW: u8   = 1 << 1; // 0b00000010 (2)
pub const ACTION_REPAY: u8    = 1 << 2; // 0b00000100 (4)
pub const ACTION_WITHDRAW: u8 = 1 << 3; // 0b00001000 (8)
```

Owners typically grant `[BORROW, REPAY]` while leaving `WITHDRAW` disabled (`0`), completely eliminating capital flight vectors.

### 4.2 Dynamic Risk Budget ($B_t$)
To prevent high-frequency churn during market turbulence, Circuit implements a dynamic risk budget $B_t$:
- **Risk-Increasing Actions (Borrow)**: Consumes budget by calculated risk cost $C(a)$:
  $$B_{t+1} = B_t - C(a), \quad \text{where } B_t \ge C(a)$$
  $$C(a) = \text{amount} \times \left(1 + \frac{\text{conf\_ratio\_bps}}{100}\right) \times \text{Multiplier}(\text{RiskState})$$
- **Risk-Reducing Actions (Repay, Deposit)**: Replenishes budget up to $B_{\text{initial}}$:
  $$B_{t+1} = \min(B_{\text{initial}}, B_t + \text{amount})$$

---

## 5. Intent Nonces & Replay Protection

Every action executed by an agent requires passing the current `intent_nonce`.
1. The transaction checks:
   ```rust
   require!(auth.nonce == intent_nonce, CircuitError::ActionNonceInvalid);
   ```
2. Upon successful execution, the on-chain program increments `auth.nonce += 1`.
3. Intercepted transactions cannot be re-executed or front-run out of sequence.

---

## 6. Lifecycle: Instant Revocation & Auto-Expiry

1. **Instant Owner Revocation**:
   - The owner can invoke `update_agent_authority(allowed_actions = 0)` at any time.
   - The protocol emits `AgentAuthorityRevoked` and immediately halts any subsequent action from that agent.
2. **Deterministic Auto-Expiry**:
   - The owner sets `expiry_ts = now + duration`.
   - Once the on-chain clock exceeds `expiry_ts`, `auth.is_expired(clock.unix_timestamp)` evaluates to `true`.
   - Any agent transaction is rejected with `CircuitError::AgentAuthorityExpired`.

---

## 7. Fault & Compromise Isolation

| Scenario | Agent State | Impact on Protocol | Impact on Manual Human Operations |
|---|---|---|---|
| **Agent Process Crashes** | Offline | **Zero impact** | 100% operational |
| **Agent Key Compromised** | Malicious | **Bounded by policy** (max borrow cap, zero withdrawal) | Owner can instantly revoke key |
| **Market Volatility Spike** | Attempts borrow | **Blocked on-chain** (`BORROW_DISABLED_BY_RISK_STATE`) | Owner can still deposit or repay |
| **Zero AI Services Online** | No LLMs running | **Zero impact** | Protocol runs natively on Solana |
