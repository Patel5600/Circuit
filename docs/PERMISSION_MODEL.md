# Circuit Protocol: Canonical Permission Model

## 1. Unified Authority Intersection Formula

Circuit treats all credit operations through a rigorous, mathematical permission calculus. Neither humans nor agents can bypass protocol risk containment.

$$A_{\text{effective}}(t) = A_{\text{owner}} \cap A_{\text{agent}} \cap A_{\text{risk}}(t) \cap A_{\text{position}}(t)$$

Where:
- **$A_{\text{owner}}$**: Sovereign rights of the collateral owner (deposit, borrow within capacity, repay, withdraw).
- **$A_{\text{agent}}$**: Delegated authority envelope (bitmask permissions, borrow cap, withdrawal cap, risk budget $B_t$, expiry timestamp). In **Manual Mode**, $A_{\text{agent}}$ is omitted or unbounded.
- **$A_{\text{risk}}(t)$**: Dynamic permissions permitted under instantaneous market state derived by MarketGuard and the Risk Ratchet ($\text{Safe} \succ \text{Restricted} \succ \text{Defensive} \succ \text{Emergency}$).
- **$A_{\text{position}}(t)$**: Financial invariant bounds enforced on the position:
  - Collateral haircut: $V_t = \text{Collateral} \times (P_t - \text{Conf}_t)$
  - Max Borrow Capacity: $D_{\text{max}} = V_t \times \text{EffectiveLTV}_t$
  - Health Factor Invariant: $\text{HF} = \frac{V_t \times \text{LiquidationThreshold}}{D_t} \ge 1.00$

---

## 2. Dual Execution Modes

Circuit provides two execution modes accessible via the UI and canonical evaluator:

| Mode | Actor | Authority Evaluated | Agent Dependency | Primary Use Case |
|---|---|---|---|---|
| **MANUAL** | `HUMAN` | $A_{\text{owner}} \cap A_{\text{risk}}(t) \cap A_{\text{position}}(t)$ | **Zero** (no agent needed or queried) | Direct, sovereign wallet borrow/repay/deposit/withdraw |
| **AUTONOMOUS** | `AGENT` | $A_{\text{owner}} \cap A_{\text{agent}} \cap A_{\text{risk}}(t) \cap A_{\text{position}}(t)$ | Bounded agent delegation PDA | Delegated AI quantitative strategies & automated hedge logic |

---

## 3. Evaluation Pipeline Stages

Every action flows sequentially through 6 deterministic stages:

```
[1. Protocol Status]
    ├── Protocol Paused? -> Reject (PROTOCOL_PAUSED)
    └── Asset Disabled?  -> Reject (ASSET_DISABLED)

[2. MarketGuard Validation]
    ├── Oracle Age > Max Age? -> Reject (STALE_ORACLE)
    ├── Conf / Price > Max BPS? -> Reject (CONFIDENCE_TOO_WIDE)
    └── NYSE Market Closed?      -> Reject (MARKET_CLOSED)

[3. Risk Ratchet & Capital Policy]
    ├── Emergency State? -> Reject all risk-increasing actions (RISK_STATE_RESTRICTED)
    ├── Defensive State? -> Reject all risk-increasing actions (BORROW_DISABLED)
    └── Restricted State? -> Borrow disabled if holding debt (BORROW_DISABLED)

[4. Actor-Specific Envelope]
    ├── Actor == "HUMAN": Full owner authority pass-through
    └── Actor == "AGENT":
        ├── Action in Bitmask? -> Reject if not (AGENT_UNAUTHORIZED)
        ├── Current TS > Expiry? -> Reject (AGENT_EXPIRED)
        ├── Projected > Borrow Limit? -> Reject (BORROW_LIMIT_EXCEEDED)
        └── Action Cost > Risk Budget? -> Reject (RISK_BUDGET_EXCEEDED)

[5. Credit & Collateral Valuation]
    ├── Conservative Valuation: V = Collateral * (Price - Conf)
    ├── Max Borrow: Cap = V * EffectiveLTV
    └── New Debt > Cap? -> Reject (LTV_EXCEEDED)

[6. Solvency & Health Factor Invariant]
    ├── Post-Action Health Factor < 1.00? -> Reject (HEALTH_FACTOR_TOO_LOW)
    └── Post-Action Collateral == 0 & Debt > 0? -> Reject (INSUFFICIENT_COLLATERAL)
```

---

## 4. Deterministic Reason Code Dictionary

| Reason Code | Machine Identifier | Severity | Trigger Condition |
|---|---|---|---|
| `ALLOWED` | `ALLOWED` | Info | Action complies with all protocol invariants and policy limits. |
| `STALE_ORACLE` | `STALE_ORACLE` | Critical | Pyth price publication timestamp exceeds `max_oracle_age` (60s). |
| `CONFIDENCE_TOO_WIDE` | `CONFIDENCE_TOO_WIDE` | Warning | Pyth confidence interval ratio exceeds maximum allowable threshold. |
| `MARKET_CLOSED` | `MARKET_CLOSED` | Warning | Current timestamp falls outside regular NYSE market trading hours. |
| `RISK_STATE_RESTRICTED` | `RISK_STATE_RESTRICTED` | Critical | Protocol Risk Ratchet is in `DEFENSIVE` or `EMERGENCY` state. |
| `BORROW_DISABLED` | `BORROW_DISABLED` | Warning | Capital Policy disables new debt origination under current conditions. |
| `WITHDRAW_DISABLED` | `WITHDRAW_DISABLED` | Warning | Capital Policy or delegated agent limits prohibit collateral withdrawal. |
| `AGENT_UNAUTHORIZED` | `AGENT_UNAUTHORIZED` | Danger | Requested action is not set in the agent's delegated permission bitmask. |
| `AGENT_EXPIRED` | `AGENT_EXPIRED` | Danger | Current timestamp exceeds `expiry_ts` configured on the `AgentAuthority` PDA. |
| `BORROW_LIMIT_EXCEEDED` | `BORROW_LIMIT_EXCEEDED` | Danger | Requested borrow would exceed `max_borrow_limit` authorized by the owner. |
| `LTV_EXCEEDED` | `LTV_EXCEEDED` | Danger | Requested borrow exceeds the position's dynamic Effective LTV capacity. |
| `INSUFFICIENT_COLLATERAL` | `INSUFFICIENT_COLLATERAL` | Danger | Position collateral is zero or insufficient to support requested leverage. |
| `HEALTH_FACTOR_TOO_LOW` | `HEALTH_FACTOR_TOO_LOW` | Danger | Resulting position health factor would fall below `min_health_factor_bps`. |
| `RISK_BUDGET_EXCEEDED` | `RISK_BUDGET_EXCEEDED` | Warning | Action risk cost exceeds agent's available dynamic risk budget ($B_t$). |
| `POSITION_NOT_FOUND` | `POSITION_NOT_FOUND` | Info | No open position account exists for the target wallet and collateral asset. |
| `INVALID_ASSET` | `INVALID_ASSET` | Critical | Token mint does not match registered asset or agent authority delegation. |
| `INVALID_AUTHORITY` | `INVALID_AUTHORITY` | Critical | Transaction signer does not match position owner or authorized agent key. |
| `PROTOCOL_PAUSED` | `PROTOCOL_PAUSED` | Critical | Protocol global emergency pause has been engaged by admin multisig. |
| `ASSET_DISABLED` | `ASSET_DISABLED` | Critical | Asset trading has been suspended by governance parameter. |
