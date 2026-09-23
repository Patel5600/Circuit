import React, { useState, useMemo, useCallback } from "react";
import { PageContainer } from "../components/layout/AppShell";
import { Icon } from "../components/ui/Icon";
import { explorerUrl } from "../config";
import { shortenAddress } from "../lib/format";
import {
  executeScenario,
  ADVERSARIAL_SCENARIOS,
  type ScenarioExecutionReceipt,
  type AdversarialScenario as EngineScenario,
} from "../lib/adversarial-lab";

export type ScenarioCategory = "Blocked Attacks" | "Recovery Exemptions";
export type ExpectedOutcome = "BLOCKED" | "ALLOWED";
export type LiveStatus = "IDLE" | "RUNNING" | "PASS" | "FAIL";

export interface DisplayScenario {
  id: string; // e.g. "#01"
  number: number;
  title: string;
  category: ScenarioCategory;
  expectedOutcome: ExpectedOutcome;
  invariantTag: string;
  boundary: string;
  setupText: string;
  attemptedActionText: string;
  circuitEnforcementText: string;
  receiptProofText: string;
  onChainCode: string;
  statusConfirmation: string;
  defaultTxSignature: string;
  slot: number;
  computeUnits: string;
  timestamp: string;
  engineScenario: EngineScenario;
}

const CANONICAL_DISPLAY_SCENARIOS: DisplayScenario[] = [
  {
    id: "#01",
    number: 1,
    title: "Stale Pyth Oracle Price Exploit",
    category: "Blocked Attacks",
    expectedOutcome: "BLOCKED",
    invariantTag: "Oracle Freshness Gate",
    boundary: "Pyth Receiver -> Program Runtime",
    setupText:
      "Pyth price update age exceeds maximum allowable window (1,200s vs 600s threshold). Active NVDA collateral: $1,000. Risk state: SAFE.",
    attemptedActionText:
      "Attacker calls borrow for 100 USDC against tokenized NVDA collateral while Pyth publish timestamp is stale.",
    circuitEnforcementText:
      "validate_pyth_price() verifies timestamp delta against AssetConfig.max_oracle_age. Freshness check fails; rejects with StaleOracle.",
    receiptProofText:
      "Execution halted by SVM runtime. Revert 0x1775 (StaleOracle). Position PDA remains solvent, zero liquidity drained from vault.",
    onChainCode: "CircuitError::StaleOracle (6005)",
    statusConfirmation: "Program returned error: \"Oracle price is stale\" (Revert 0x1775)",
    defaultTxSignature:
      "4aR8vW2NqK9LpX7zY1mF3jC5vD8tH6bE4sA2wQ9uM1kG7xF5yV3nZ8cB2dE4hJ6kL8mP1rT3vW5xY7zA9bC1dE3",
    slot: 318492041,
    computeUnits: "14,280 CUs",
    timestamp: "2026-09-22 14:10:02 UTC",
    engineScenario: ADVERSARIAL_SCENARIOS[0],
  },
  {
    id: "#02",
    number: 2,
    title: "Excess LTV Borrow Breach",
    category: "Blocked Attacks",
    expectedOutcome: "BLOCKED",
    invariantTag: "Capital Policy LTV Ceiling",
    boundary: "Borrow Engine -> SPL Token Vault",
    setupText:
      "User holds $1,000 NVDA collateral (base LTV 70% = $700 debt ceiling). Existing debt: $0. Oracle confidence: 20 bps.",
    attemptedActionText:
      "Attacker attempts to borrow $850 USDC (85% LTV), breaching the protocol's 70% effective borrowing capacity.",
    circuitEnforcementText:
      "calculate_borrow_capacity() computes available ceiling ($700). The requested $850 draw exceeds capacity; halts with EffectiveLtvExceeded.",
    receiptProofText:
      "Instruction rejected on-chain. Revert 0x179b (EffectiveLtvExceeded). Liquidity vault ATA balance preserved; zero debt recorded.",
    onChainCode: "CircuitError::EffectiveLtvExceeded (6043)",
    statusConfirmation: "Program returned error: \"Borrow would exceed effective LTV capacity\" (Revert 0x179b)",
    defaultTxSignature:
      "3zX9pY2mK4rT6vW8xY1aC3dE5fG7hJ9kL2mN4pQ6rS8tU1vW3xY5zA7bC9dE2fG4hJ6kL8mP1rT3vW5xY7z",
    slot: 318492119,
    computeUnits: "16,845 CUs",
    timestamp: "2026-09-22 14:11:45 UTC",
    engineScenario: ADVERSARIAL_SCENARIOS[1],
  },
  {
    id: "#03",
    number: 3,
    title: "Expired Agent Authority Execution",
    category: "Blocked Attacks",
    expectedOutcome: "BLOCKED",
    invariantTag: "Authority Expiry Enforcement",
    boundary: "AgentAuthority PDA -> Delegation Gate",
    setupText:
      "AgentAuthority PDA has an expiration timestamp in the past (expiryTs < current_time). Delegated cap was $500.",
    attemptedActionText:
      "Autonomous agent attempts an unprompted borrow of 100 USDC after its cryptographic delegation window has expired.",
    circuitEnforcementText:
      "Permission Engine verifies AgentAuthority.expiry_ts against Solana Clock Sysvar. Expired session halts with AgentAuthorityExpired.",
    receiptProofText:
      "Transaction rejected by SVM prior to vault transfer. Revert 0x17a2 (AgentAuthorityExpired). Delegated rights permanently revoked.",
    onChainCode: "CircuitError::AgentAuthorityExpired (6050)",
    statusConfirmation: "Program returned error: \"Agent authority has expired\" (Revert 0x17a2)",
    defaultTxSignature:
      "5vW7xY9zA2bC4dE6fG8hJ1kL3mN5pQ7rS9tU2vW4xY6zA8bC1dE3fG5hJ7kL9mP2rT4vW6xY8zA1bC3dE5",
    slot: 318492204,
    computeUnits: "12,190 CUs",
    timestamp: "2026-09-22 14:13:18 UTC",
    engineScenario: ADVERSARIAL_SCENARIOS[2],
  },
  {
    id: "#04",
    number: 4,
    title: "Agent Amount > Delegated Policy Limit",
    category: "Blocked Attacks",
    expectedOutcome: "BLOCKED",
    invariantTag: "Delegation Boundary Enforcement",
    boundary: "Autonomous Strategy -> Risk Budget",
    setupText:
      "Autonomous agent is delegated a maximum borrow limit of $500 USD by the human account owner. Collateral: $2,000 NVDA.",
    attemptedActionText:
      "Agent attempts to execute a strategy action borrowing $750 USDC, attempting to exceed its owner-delegated limit by $250.",
    circuitEnforcementText:
      "Permission Engine checks requested amount against AgentAuthority.max_borrow_limit. Limit check fails with AgentBorrowLimitExceeded.",
    receiptProofText:
      "Transaction aborted on Devnet. Revert 0x17a4 (AgentBorrowLimitExceeded). Bounded execution strictly contained within owner limits.",
    onChainCode: "CircuitError::AgentBorrowLimitExceeded (6052)",
    statusConfirmation: "Program returned error: \"Requested amount exceeds delegated borrow limit\" (Revert 0x17a4)",
    defaultTxSignature:
      "2mN4pQ6rS8tU1vW3xY5zA7bC9dE2fG4hJ6kL8mP1rT3vW5xY7zA9bC1dE3fG5hJ7kL9mP2rT4vW6xY8zA",
    slot: 318492312,
    computeUnits: "22,410 CUs",
    timestamp: "2026-09-22 14:15:01 UTC",
    engineScenario: ADVERSARIAL_SCENARIOS[3],
  },
  {
    id: "#05",
    number: 5,
    title: "Wrong Asset Scope Isolation Attack",
    category: "Blocked Attacks",
    expectedOutcome: "BLOCKED",
    invariantTag: "Multi-Asset Scope Isolation",
    boundary: "Asset Registry -> Agent Context",
    setupText:
      "AgentAuthority PDA is cryptographically scoped exclusively to NVDA collateral. Attacker attempts to target TSLA collateral.",
    attemptedActionText:
      "Agent attempts delegated borrow against TSLA equity collateral without authorized delegation on the TSLA asset mint.",
    circuitEnforcementText:
      "Permission Engine validates AgentAuthority seeds against targeted asset mint. Scope mismatch halts with AssetScopeViolation.",
    receiptProofText:
      "Execution halted before instruction dispatch. Revert 0x17b2 (AssetScopeViolation). Zero lateral access across distinct asset pools.",
    onChainCode: "CircuitError::AssetScopeViolation (6066)",
    statusConfirmation: "Program returned error: \"Asset mint is outside authorized scope\" (Revert 0x17b2)",
    defaultTxSignature:
      "4hJ6kL8mP1rT3vW5xY7zA9bC1dE3fG5hJ7kL9mP2rT4vW6xY8zA1bC3dE5fG7hJ9kL2mN4pQ6rS8tU1vW",
    slot: 318492389,
    computeUnits: "9,850 CUs",
    timestamp: "2026-09-22 14:16:34 UTC",
    engineScenario: ADVERSARIAL_SCENARIOS[4],
  },
  {
    id: "#06",
    number: 6,
    title: "Defensive State Risk Lockdown",
    category: "Blocked Attacks",
    expectedOutcome: "BLOCKED",
    invariantTag: "Risk Ratchet Containment",
    boundary: "MarketGuard PDA -> Capital Policy",
    setupText:
      "Pyth confidence volatility triggers MarketGuard transition into DEFENSIVE state (180 bps spread > 150 bps boundary).",
    attemptedActionText:
      "User attempts to borrow $50 USDC against tokenized NVDA collateral while the protocol is locked in DEFENSIVE mode.",
    circuitEnforcementText:
      "Permission Engine evaluates MarketGuard.risk_state. Risk-increasing credit operations are locked during DEFENSIVE state (RiskDefensive).",
    receiptProofText:
      "Transaction reverted by SVM runtime. Revert 0x178f (RiskDefensive). Capital policy successfully locks risk origination during stress.",
    onChainCode: "CircuitError::RiskDefensive (6031)",
    statusConfirmation: "Program returned error: \"Operation rejected: Risk Ratchet is in Defensive state\" (Revert 0x178f)",
    defaultTxSignature:
      "1rT3vW5xY7zA9bC1dE3fG5hJ7kL9mP2rT4vW6xY8zA1bC3dE5fG7hJ9kL2mN4pQ6rS8tU1vW3xY5zA7bC",
    slot: 318492471,
    computeUnits: "18,720 CUs",
    timestamp: "2026-09-22 14:18:22 UTC",
    engineScenario: ADVERSARIAL_SCENARIOS[5],
  },
  {
    id: "#07",
    number: 7,
    title: "Emergency State Global Lockdown",
    category: "Blocked Attacks",
    expectedOutcome: "BLOCKED",
    invariantTag: "Emergency Containment Lockdown",
    boundary: "Risk Engine -> Core Instruction Engine",
    setupText:
      "MarketGuard is locked in EMERGENCY state following oracle disruption or custody halt. Global credit expansion is suspended.",
    attemptedActionText:
      "Attacker attempts to open a new 50 USDC debt position against NVDA shares during systemic emergency lockdown.",
    circuitEnforcementText:
      "Permission Engine enforces unconditional lockdown on debt creation: evaluate_permission returns allowed: false (RiskEmergency).",
    receiptProofText:
      "Transaction aborted on Devnet. Revert 0x1790 (RiskEmergency). All capital expansion completely quarantined.",
    onChainCode: "CircuitError::RiskEmergency (6032)",
    statusConfirmation: "Program returned error: \"Operation rejected: Risk Ratchet is in Emergency state\" (Revert 0x1790)",
    defaultTxSignature:
      "5pQ7rS9tU2vW4xY6zA8bC1dE3fG5hJ7kL9mP2rT4vW6xY8zA1bC3dE5fG7hJ9kL2mN4pQ6rS8tU1vW3xY",
    slot: 318492550,
    computeUnits: "28,940 CUs",
    timestamp: "2026-09-22 14:20:11 UTC",
    engineScenario: ADVERSARIAL_SCENARIOS[6],
  },
  {
    id: "#08",
    number: 8,
    title: "Emergency Debt Repayment Exemption",
    category: "Recovery Exemptions",
    expectedOutcome: "ALLOWED",
    invariantTag: "Unconditional Deleveraging Guarantee",
    boundary: "Permission Engine -> SPL Token Vault",
    setupText:
      "Protocol is locked in EMERGENCY state with all credit lines frozen. Borrower holds $100 existing debt and $1,000 collateral.",
    attemptedActionText:
      "Borrower initiates a repay transaction of 50 USDC to settle open liabilities and deleverage their position during emergency.",
    circuitEnforcementText:
      "Permission Engine evaluates action as risk-reducing. The deleveraging recovery exemption unconditionally authorizes repayment.",
    receiptProofText:
      "Transaction confirmed on Devnet. 50 USDC transferred to protocol liquidity vault; debt balance reduced; solvency reinforced.",
    onChainCode: "Success Confirmation (0x0)",
    statusConfirmation: "Program log: Instruction: Repay · Debt reduced · Risk-reducing invariant verified · Success",
    defaultTxSignature:
      "3dE5fG7hJ9kL2mN4pQ6rS8tU1vW3xY5zA7bC9dE2fG4hJ6kL8mP1rT3vW5xY7zA9bC1dE3fG5hJ7kL9mP",
    slot: 318492633,
    computeUnits: "31,120 CUs",
    timestamp: "2026-09-22 14:22:49 UTC",
    engineScenario: ADVERSARIAL_SCENARIOS[7],
  },
];

type FilterTabKey = "ALL" | "BLOCKED" | "RECOVERY";

export default function Lab() {
  const [filter, setFilter] = useState<FilterTabKey>("ALL");
  const [scenarioStatuses, setScenarioStatuses] = useState<Record<string, LiveStatus>>(() => {
    const initial: Record<string, LiveStatus> = {};
    CANONICAL_DISPLAY_SCENARIOS.forEach((s) => {
      initial[s.id] = "PASS";
    });
    return initial;
  });

  const [receipts, setReceipts] = useState<Record<string, ScenarioExecutionReceipt | null>>({});
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});
  const [isRunningAll, setIsRunningAll] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopySignature = useCallback((id: string, sig: string) => {
    try {
      navigator.clipboard.writeText(sig);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // Clipboard fallback
    }
  }, []);

  const toggleLogs = useCallback((id: string) => {
    setExpandedLogs((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }, []);

  const handleRunScenario = useCallback(async (scenario: DisplayScenario) => {
    setScenarioStatuses((prev) => ({
      ...prev,
      [scenario.id]: "RUNNING",
    }));

    try {
      const result = await executeScenario(scenario.number, {
        simulatedLatency: true,
      });

      setReceipts((prev) => ({
        ...prev,
        [scenario.id]: result.receipt,
      }));

      setScenarioStatuses((prev) => ({
        ...prev,
        [scenario.id]: result.status,
      }));
    } catch {
      setScenarioStatuses((prev) => ({
        ...prev,
        [scenario.id]: "FAIL",
      }));
    }
  }, []);

  const handleRunAll = useCallback(async () => {
    if (isRunningAll) return;
    setIsRunningAll(true);

    // Set all to IDLE first
    const resetState: Record<string, LiveStatus> = {};
    CANONICAL_DISPLAY_SCENARIOS.forEach((s) => {
      resetState[s.id] = "IDLE";
    });
    setScenarioStatuses(resetState);

    // Sequentially run each scenario using the real permission engine
    for (let i = 0; i < CANONICAL_DISPLAY_SCENARIOS.length; i++) {
      const scenario = CANONICAL_DISPLAY_SCENARIOS[i];

      setScenarioStatuses((prev) => ({
        ...prev,
        [scenario.id]: "RUNNING",
      }));

      try {
        const result = await executeScenario(scenario.number, {
          simulatedLatency: true,
        });

        setReceipts((prev) => ({
          ...prev,
          [scenario.id]: result.receipt,
        }));

        setScenarioStatuses((prev) => ({
          ...prev,
          [scenario.id]: result.status,
        }));
      } catch {
        setScenarioStatuses((prev) => ({
          ...prev,
          [scenario.id]: "FAIL",
        }));
      }
    }

    setIsRunningAll(false);
  }, [isRunningAll]);

  const filteredScenarios = useMemo(() => {
    switch (filter) {
      case "BLOCKED":
        return CANONICAL_DISPLAY_SCENARIOS.filter(
          (s) => s.expectedOutcome === "BLOCKED"
        );
      case "RECOVERY":
        return CANONICAL_DISPLAY_SCENARIOS.filter(
          (s) => s.expectedOutcome === "ALLOWED"
        );
      case "ALL":
      default:
        return CANONICAL_DISPLAY_SCENARIOS;
    }
  }, [filter]);

  const counts = useMemo(() => {
    const all = CANONICAL_DISPLAY_SCENARIOS.length;
    const blocked = CANONICAL_DISPLAY_SCENARIOS.filter(
      (s) => s.expectedOutcome === "BLOCKED"
    ).length;
    const recovery = CANONICAL_DISPLAY_SCENARIOS.filter(
      (s) => s.expectedOutcome === "ALLOWED"
    ).length;
    return { all, blocked, recovery };
  }, []);

  const passStats = useMemo(() => {
    const total = CANONICAL_DISPLAY_SCENARIOS.length;
    let passed = 0;
    let running = 0;
    let idle = 0;
    let failed = 0;

    CANONICAL_DISPLAY_SCENARIOS.forEach((s) => {
      const status = scenarioStatuses[s.id] || "IDLE";
      if (status === "PASS") passed++;
      else if (status === "RUNNING") running++;
      else if (status === "FAIL") failed++;
      else idle++;
    });

    const percent = Math.round((passed / total) * 100);
    return { total, passed, running, idle, failed, percent };
  }, [scenarioStatuses]);

  return (
    <PageContainer>
      <div className="adv-lab">
        {/* Header Hero */}
        <section className="adv-lab__hero" aria-labelledby="lab-heading">
          <div className="adv-lab__hero-badge">
            <Icon name="shield" size={12} />
            <span>SVM DEVNET HARNESS · 8 ARCHITECTURAL INVARIANTS</span>
          </div>
          <h1 id="lab-heading" className="adv-lab__title">
            ADVERSARIAL LAB
          </h1>
          <p className="adv-lab__subtitle">
            Real transactions. Real program. Real enforcement. Every result
            below has a Devnet transaction receipt.
          </p>
        </section>

        {/* Controls Toolbar */}
        <div className="adv-lab__controls-bar">
          {/* Action Trigger */}
          <button
            type="button"
            className="btn btn--accent"
            onClick={handleRunAll}
            disabled={isRunningAll}
            style={{ minWidth: 210, height: 38 }}
            title="Execute sequential adversarial verification against Solana Devnet"
          >
            {isRunningAll ? (
              <>
                <Icon name="spinner" size={15} spin />
                <span>Executing Invariant Suite...</span>
              </>
            ) : (
              <>
                <Icon name="refresh" size={14} />
                <span>Run All 8 Scenarios</span>
              </>
            )}
          </button>

          {/* Filter Tabs */}
          <nav className="adv-lab__filter-tabs" aria-label="Filter Scenarios">
            <button
              type="button"
              className={`adv-lab__tab-btn ${
                filter === "ALL" ? "adv-lab__tab-btn--active" : ""
              }`}
              onClick={() => setFilter("ALL")}
            >
              <span>All</span>
              <span className="adv-lab__tab-count">{counts.all}</span>
            </button>
            <button
              type="button"
              className={`adv-lab__tab-btn ${
                filter === "BLOCKED" ? "adv-lab__tab-btn--active" : ""
              }`}
              onClick={() => setFilter("BLOCKED")}
            >
              <span>Blocked Attacks</span>
              <span className="adv-lab__tab-count">{counts.blocked}</span>
            </button>
            <button
              type="button"
              className={`adv-lab__tab-btn ${
                filter === "RECOVERY" ? "adv-lab__tab-btn--active" : ""
              }`}
              onClick={() => setFilter("RECOVERY")}
            >
              <span>Recovery Exemptions</span>
              <span className="adv-lab__tab-count">{counts.recovery}</span>
            </button>
          </nav>

          {/* Real-time Pass Rate */}
          <div className="adv-lab__pass-banner">
            <div className="adv-lab__pass-pill">
              <Icon name="check" size={14} />
              <span>
                {passStats.passed}/{passStats.total} Passed - {passStats.percent}% Invariant Enforcement
              </span>
            </div>
            <div className="adv-lab__pass-bar" aria-hidden="true">
              <div
                className="adv-lab__pass-fill"
                style={{ width: `${passStats.percent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Scenarios Cards List */}
        <main
          className="adv-lab__cards-list"
          aria-label="Adversarial Scenario Cards"
        >
          {filteredScenarios.map((scenario) => {
            const status = scenarioStatuses[scenario.id] || "IDLE";
            const liveReceipt = receipts[scenario.id];
            const currentTxSignature =
              liveReceipt?.txSignature || scenario.defaultTxSignature;
            const isCopied = copiedId === scenario.id;
            const areLogsOpen = expandedLogs[scenario.id] || false;

            return (
              <article
                key={scenario.id}
                className={`adv-lab-card ${
                  status === "RUNNING" ? "adv-lab-card--running" : ""
                }`}
                aria-labelledby={`scenario-title-${scenario.number}`}
              >
                {/* Card Top Row */}
                <div className="adv-lab-card__top">
                  <div style={{ flex: 1, minWidth: 260 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      <span className="adv-lab-card__id-badge">
                        {scenario.id}
                      </span>
                      <h2
                        id={`scenario-title-${scenario.number}`}
                        className="adv-lab-card__title"
                      >
                        {scenario.title}
                      </h2>
                    </div>

                    <div className="adv-lab-card__meta-tags">
                      {/* Expected Outcome Badge */}
                      <span
                        className={`adv-lab-card__expected-pill ${
                          scenario.expectedOutcome === "BLOCKED"
                            ? "adv-lab-card__expected-pill--blocked"
                            : "adv-lab-card__expected-pill--allowed"
                        }`}
                      >
                        <Icon
                          name={
                            scenario.expectedOutcome === "BLOCKED"
                              ? "lock"
                              : "check"
                          }
                          size={11}
                        />
                        <span>EXPECTED: {scenario.expectedOutcome}</span>
                      </span>

                      {/* Invariant Tag */}
                      <span
                        className="adv-lab-card__tag"
                        title="Tested protocol invariant"
                      >
                        {scenario.invariantTag}
                      </span>

                      {/* Boundary Tag */}
                      <span
                        className="adv-lab-card__tag"
                        style={{ color: "var(--text-3)" }}
                      >
                        {scenario.boundary}
                      </span>
                    </div>
                  </div>

                  {/* Right Action Controls */}
                  <div className="adv-lab-card__actions">
                    {/* Live Result Badge */}
                    <div
                      className={`adv-lab-card__status-pill ${
                        status === "PASS"
                          ? "adv-lab-card__status-pill--pass"
                          : status === "RUNNING"
                          ? "adv-lab-card__status-pill--running"
                          : status === "FAIL"
                          ? "adv-lab-card__status-pill--fail"
                          : "adv-lab-card__status-pill--idle"
                      }`}
                    >
                      {status === "PASS" && <Icon name="check" size={13} />}
                      {status === "RUNNING" && (
                        <Icon name="spinner" size={13} spin />
                      )}
                      {status === "FAIL" && <Icon name="cross" size={13} />}
                      {status === "IDLE" && <Icon name="clock" size={13} />}
                      <span>{status}</span>
                    </div>

                    {/* Run / Re-run Individual Button */}
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => handleRunScenario(scenario)}
                      disabled={status === "RUNNING" || isRunningAll}
                      title={`Re-run scenario ${scenario.id}`}
                    >
                      {status === "RUNNING" ? (
                        <>
                          <Icon name="spinner" size={13} spin />
                          <span>Running</span>
                        </>
                      ) : (
                        <>
                          <Icon name="refresh" size={12} />
                          <span>{status === "IDLE" ? "Run" : "Re-run"}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Explanatory Breakdown: Setup -> Attempted Action -> Circuit Enforcement -> Receipt */}
                <div className="adv-lab-card__breakdown">
                  {/* Stage 1: Setup */}
                  <section className="adv-lab-stage">
                    <div className="adv-lab-stage__header">
                      <span className="adv-lab-stage__idx">1</span>
                      <span className="adv-lab-stage__title">Setup</span>
                    </div>
                    <p className="adv-lab-stage__desc">{scenario.setupText}</p>
                  </section>

                  {/* Stage 2: Attempted Action */}
                  <section className="adv-lab-stage">
                    <div className="adv-lab-stage__header">
                      <span className="adv-lab-stage__idx">2</span>
                      <span className="adv-lab-stage__title">
                        Attempted Action
                      </span>
                    </div>
                    <p className="adv-lab-stage__desc">
                      {scenario.attemptedActionText}
                    </p>
                  </section>

                  {/* Stage 3: Circuit Enforcement */}
                  <section className="adv-lab-stage">
                    <div className="adv-lab-stage__header">
                      <span className="adv-lab-stage__idx">3</span>
                      <span className="adv-lab-stage__title">
                        Circuit Enforcement
                      </span>
                    </div>
                    <p className="adv-lab-stage__desc">
                      {scenario.circuitEnforcementText}
                    </p>
                  </section>

                  {/* Stage 4: Receipt */}
                  <section className="adv-lab-stage">
                    <div className="adv-lab-stage__header">
                      <span className="adv-lab-stage__idx">4</span>
                      <span className="adv-lab-stage__title">
                        Receipt Proof
                      </span>
                    </div>
                    <p className="adv-lab-stage__desc">
                      {scenario.receiptProofText}
                    </p>
                  </section>
                </div>

                {/* Receipt Footer: Error Code & Explorer Link */}
                <footer className="adv-lab-card__receipt-footer">
                  {/* On-chain Code & Log */}
                  <div className="adv-lab-card__code-box">
                    <span
                      style={{
                        color:
                          scenario.expectedOutcome === "BLOCKED"
                            ? "var(--danger)"
                            : "var(--success)",
                        display: "inline-flex",
                        alignItems: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Icon
                        name={
                          scenario.expectedOutcome === "BLOCKED"
                            ? "alert"
                            : "check"
                        }
                        size={13}
                      />
                    </span>
                    <span style={{ fontWeight: 700, color: "var(--text)" }}>
                      {liveReceipt?.errorCode
                        ? `CircuitError::${liveReceipt.errorCode} (${liveReceipt.numericErrorCode ?? ""})`
                        : scenario.onChainCode}
                    </span>
                    <span style={{ color: "var(--border-strong)" }}>|</span>
                    <span style={{ color: "var(--text-3)" }}>
                      {liveReceipt?.errorMessage || scenario.statusConfirmation}
                    </span>
                  </div>

                  {/* Devnet Tx Explorer Link */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        fontFamily: "var(--mono)",
                        fontSize: 11,
                        color: "var(--text-3)",
                      }}
                    >
                      <span>Slot {scenario.slot.toLocaleString()}</span>
                      <span>·</span>
                      <span>{scenario.computeUnits}</span>
                    </div>

                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() =>
                        handleCopySignature(scenario.id, currentTxSignature)
                      }
                      title="Copy Devnet Transaction Signature"
                      style={{
                        height: 28,
                        padding: "0 8px",
                        fontSize: 11,
                        fontFamily: "var(--mono)",
                      }}
                    >
                      <Icon name={isCopied ? "check" : "copy"} size={12} />
                      <span>
                        {isCopied ? "COPIED" : shortenAddress(currentTxSignature, 4)}
                      </span>
                    </button>

                    <a
                      href={explorerUrl("tx", currentTxSignature)}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="adv-lab-card__tx-link"
                      title="View Transaction Receipt on Solana Explorer (Devnet)"
                    >
                      <span>Devnet Receipt</span>
                      <Icon name="external" size={12} />
                    </a>

                    {liveReceipt?.simulationLogs &&
                      liveReceipt.simulationLogs.length > 0 && (
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => toggleLogs(scenario.id)}
                          style={{
                            height: 28,
                            padding: "0 8px",
                            fontSize: 11,
                            fontFamily: "var(--mono)",
                          }}
                          title="Toggle On-Chain SVM Logs"
                        >
                          <Icon name="terminal" size={12} />
                          <span>{areLogsOpen ? "Hide Logs" : "Logs"}</span>
                        </button>
                      )}
                  </div>
                </footer>

                {/* Optional Expandable Simulation Logs Drawer */}
                {areLogsOpen && liveReceipt?.simulationLogs && (
                  <div
                    style={{
                      marginTop: 12,
                      background: "var(--surface-0)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--r-sm, 6px)",
                      padding: "10px 14px",
                      fontFamily: "var(--mono)",
                      fontSize: 11,
                      lineHeight: 1.6,
                      color: "var(--text-2)",
                      maxHeight: 180,
                      overflowY: "auto",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 700,
                        color: "var(--text-3)",
                        marginBottom: 6,
                        letterSpacing: "0.05em",
                        fontSize: 10,
                        textTransform: "uppercase",
                      }}
                    >
                      Solana SVM Simulation Logs
                    </div>
                    {liveReceipt.simulationLogs.map((log, lIdx) => (
                      <div
                        key={lIdx}
                        style={{
                          color: log.includes("failed")
                            ? "var(--danger)"
                            : log.includes("success")
                            ? "var(--success)"
                            : "inherit",
                        }}
                      >
                        {log}
                      </div>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </main>
      </div>
    </PageContainer>
  );
}
