import React from 'react';
import { Link } from 'react-router-dom';
import { PageContainer } from '../components/layout/AppShell';
import { Card, Pill, Button, Icon } from '../components/ui';
import { DemoHarnessProvider, useDemoHarness } from '../context/DemoHarnessContext';
import { RiskRatchetTimeline } from '../components/demo/RiskRatchetTimeline';
import { StepRecoveryMeter } from '../components/demo/StepRecoveryMeter';
import { ConcentrationSandbox } from '../components/demo/ConcentrationSandbox';
import { SimulationModal } from '../components/demo/SimulationModal';

export type EvidenceClassification =
  | "VERIFIED ONCHAIN"
  | "VERIFIED BY CODE"
  | "VERIFIED BY TEST"
  | "DEVNET TEST"
  | "SIMULATED"
  | "ILLUSTRATIVE";

export interface LifecycleStep {
  step: number;
  concept: string;
  title: string;
  actor: string;
  collateral: string;
  debt: string;
  ratchet: string;
  authority: string;
  statusText: string;
  tone: "success" | "warning" | "danger";
  evidence: EvidenceClassification;
}

const LIFECYCLE_STEPS: LifecycleStep[] = [
  {
    step: 1,
    concept: "Human owns the asset",
    title: "1. Human Owns Collateral Asset",
    actor: "Human Owner",
    collateral: "100 AAPLx ($10,000)",
    debt: "$0.00 USDC",
    ratchet: "SAFE",
    authority: "SOVEREIGN",
    statusText: "Position established on-chain by direct wallet signer. Collateral locked in protocol vault ATA. Human retains root sovereignty; zero agents required.",
    tone: "success",
    evidence: "VERIFIED BY CODE",
  },
  {
    step: 2,
    concept: "Market data is observed",
    title: "2. Market Data Is Observed",
    actor: "Pyth Hermes & On-Chain Feed",
    collateral: "100 AAPLx ($10,000)",
    debt: "$0.00 USDC",
    ratchet: "SAFE",
    authority: "SOVEREIGN",
    statusText: "Pyth price account continuously reports price and confidence interval. Conservative valuation uses lower bound: p_conservative = max(0, p - conf).",
    tone: "success",
    evidence: "VERIFIED ONCHAIN",
  },
  {
    step: 3,
    concept: "MarketGuard validates input",
    title: "3. MarketGuard Validates Input",
    actor: "MarketGuard Circuit Breaker",
    collateral: "100 AAPLx ($10,000)",
    debt: "$0.00 USDC",
    ratchet: "SAFE",
    authority: "OBSERVING",
    statusText: "MarketGuard checks reference NYSE session (Regular Hours), Pyth feed ID binding, confidence ratio threshold, and clock freshness (<600s).",
    tone: "success",
    evidence: "VERIFIED BY TEST",
  },
  {
    step: 4,
    concept: "Risk state is derived",
    title: "4. Risk State Is Derived",
    actor: "Risk Ratchet Engine",
    collateral: "100 AAPLx ($10,000)",
    debt: "$0.00 USDC",
    ratchet: "SAFE",
    authority: "NOMINAL",
    statusText: "Dynamic Risk Ratchet combines confidence ratio, velocity, and session state. Nominal conditions derive SAFE state. Monotonic 4-state machine protects capital.",
    tone: "success",
    evidence: "VERIFIED BY TEST",
  },
  {
    step: 5,
    concept: "Capital policy changes",
    title: "5. Capital Policy Updates",
    actor: "Capital Control Plane",
    collateral: "100 AAPLx ($10,000)",
    debt: "$0.00 USDC",
    ratchet: "SAFE",
    authority: "ACTIVE",
    statusText: "Under SAFE state, Capital Policy derives 100% borrow capacity (70% base LTV, 80% liquidation threshold, full credit ceiling).",
    tone: "success",
    evidence: "VERIFIED BY TEST",
  },
  {
    step: 6,
    concept: "Permission changes",
    title: "6. Permission Engine Updates",
    actor: "Permission Evaluator PDA",
    collateral: "100 AAPLx ($10,000)",
    debt: "$0.00 USDC",
    ratchet: "SAFE",
    authority: "ACTIVE",
    statusText: "Single evaluate_permission function confirms: borrow = ALLOWED, withdraw = ALLOWED, deposit = ALLOWED, repay = ALLOWED. Both human and agent share this identical evaluator.",
    tone: "success",
    evidence: "VERIFIED BY CODE",
  },
  {
    step: 7,
    concept: "Manual action is evaluated",
    title: "7. Manual Action Is Evaluated",
    actor: "Human Owner",
    collateral: "100 AAPLx ($10,000)",
    debt: "$1,000.00 USDC",
    ratchet: "SAFE",
    authority: "SOVEREIGN",
    statusText: "✓ ALLOWED: Modeled manual borrow of $1,000 USDC evaluated against protocol policy. Verifies LTV (10% < 70% max) and Health Factor (7.00 > 1.00 minimum). Live execution on /app/borrow.",
    tone: "success",
    evidence: "SIMULATED",
  },
  {
    step: 8,
    concept: "Agent action evaluated through same path",
    title: "8. Agent Evaluated Through Same Path",
    actor: "Autonomous Strategy",
    collateral: "100 AAPLx ($10,000)",
    debt: "$1,500.00 USDC",
    ratchet: "SAFE",
    authority: "BOUNDED",
    statusText: "✓ ALLOWED: Modeled strategy borrow of $500 evaluated through execute_agent_action. Checks owner authority delegation, risk budget, and LTV. Live execution on /app/autonomous.",
    tone: "success",
    evidence: "SIMULATED",
  },
  {
    step: 9,
    concept: "Risk increases",
    title: "9. Risk Increases (Pyth Shock)",
    actor: "Pyth Oracle Simulation",
    collateral: "100 AAPLx ($10,000)",
    debt: "$1,500.00 USDC",
    ratchet: "DEFENSIVE",
    authority: "CONSTRAINED",
    statusText: "Simulated stress event: Pyth confidence interval widens past 150 bps. MarketGuard triggers instant tightening: Risk Ratchet steps up to DEFENSIVE (Epoch = 1).",
    tone: "warning",
    evidence: "SIMULATED",
  },
  {
    step: 10,
    concept: "Risk-increasing action becomes blocked",
    title: "10. Risk-Increasing Action Blocked",
    actor: "Protocol Gate (Human & Agent)",
    collateral: "100 AAPLx ($10,000)",
    debt: "$1,500.00 USDC",
    ratchet: "DEFENSIVE",
    authority: "BLOCKED",
    statusText: "✕ SIMULATED POLICY REJECTION: Both Agent and Human borrow attempts are rejected by the Risk Ratchet state. Simulation predicts on-chain revert BORROW_DISABLED_BY_RISK_STATE (0x1787).",
    tone: "danger",
    evidence: "SIMULATED",
  },
  {
    step: 11,
    concept: "Recovery-safe behavior remains permitted",
    title: "11. Recovery Actions Remain Permitted",
    actor: "Human Owner",
    collateral: "100 AAPLx ($10,000)",
    debt: "$1,000.00 USDC",
    ratchet: "DEFENSIVE",
    authority: "SOVEREIGN",
    statusText: "✓ ALWAYS ALLOWED: Repayment reduces risk. Deleveraging and liquidity exits are unconditionally open across all risk states. Anti-flapping recovery requires 5 clean ticks.",
    tone: "success",
    evidence: "SIMULATED",
  },
];

function AutonomousStrategyLifecycle() {
  const [currentStepIdx, setCurrentStepIdx] = React.useState(0);
  const cur = LIFECYCLE_STEPS[currentStepIdx];

  return (
    <Card
      title={
        <div className="row between g-12 wrap" style={{ alignItems: "center" }}>
          <span>Deterministic Protocol Integrity: 11-Step Proof</span>
          <div className="row g-6">
            <Pill tone={cur.evidence === "VERIFIED ONCHAIN" ? "success" : cur.evidence === "SIMULATED" ? "warning" : "neutral"} withDot>
              {cur.evidence}
            </Pill>
            <Pill tone={cur.tone}>
              STEP {cur.step}/11: {cur.ratchet}
            </Pill>
          </div>
        </div>
      }
    >
      <div className="stack g-16">
        <p className="t-sm muted" style={{ margin: 0 }}>
          Interactive proof of Circuit&apos;s core thesis:{" "}
          <strong>&ldquo;Market conditions derive risk. Risk derives policy. Policy derives permissions. The same permissions govern humans and agents.&rdquo;</strong>
        </p>

        {/* Step Indicator Bar */}
        <div className="chips wrap" style={{ margin: "4px 0" }}>
          {LIFECYCLE_STEPS.map((s, idx) => (
            <button
              key={s.step}
              type="button"
              className={`chip ${idx === currentStepIdx ? "chip--active" : ""}`}
              onClick={() => setCurrentStepIdx(idx)}
              style={{ fontSize: 11, padding: "3px 10px", height: 26 }}
            >
              Step {s.step}
            </button>
          ))}
        </div>

        {/* Step Detail Card */}
        <div
          style={{
            padding: 16,
            background: "var(--surface-2)",
            borderRadius: "var(--r)",
            border: `1px solid ${
              cur.tone === "success"
                ? "rgba(127, 195, 154, 0.4)"
                : cur.tone === "warning"
                ? "rgba(207, 173, 116, 0.4)"
                : "rgba(207, 139, 139, 0.4)"
            }`,
          }}
          className="stack g-12"
        >
          <div className="row between g-12 wrap" style={{ alignItems: "center" }}>
            <div>
              <div className="row g-8" style={{ alignItems: "center" }}>
                <span className="t-label" style={{ color: "var(--text-3)" }}>
                  Step {cur.step} of 11 · {cur.actor}
                </span>
                <Pill tone={cur.evidence === "VERIFIED ONCHAIN" ? "success" : cur.evidence === "SIMULATED" ? "warning" : "neutral"}>
                  {cur.evidence}
                </Pill>
              </div>
              <h3 style={{ margin: "4px 0 0 0", fontSize: 16, fontWeight: 700 }}>
                {cur.title}
              </h3>
            </div>
            <Pill tone={cur.tone}>{cur.authority} AUTHORITY</Pill>
          </div>

          <div
            style={{
              padding: "10px 12px",
              background: "rgba(0, 0, 0, 0.25)",
              borderRadius: "var(--r-sm)",
              fontSize: 13,
              color: "var(--text)",
              lineHeight: 1.5,
            }}
          >
            {cur.statusText}
          </div>

          <div className="grid grid--2 g-10" style={{ marginTop: 4 }}>
            <div className="drow">
              <span className="drow__k">Collateral Position</span>
              <span className="drow__v mono">{cur.collateral}</span>
            </div>
            <div className="drow">
              <span className="drow__k">Outstanding Debt</span>
              <span className="drow__v mono">{cur.debt}</span>
            </div>
            <div className="drow">
              <span className="drow__k">Risk Ratchet State</span>
              <span className="drow__v">
                <Pill tone={cur.tone} withDot>
                  {cur.ratchet}
                </Pill>
              </span>
            </div>
            <div className="drow">
              <span className="drow__k">Effective Authority</span>
              <span className="drow__v">
                <Pill tone={cur.tone}>{cur.authority}</Pill>
              </span>
            </div>
          </div>
        </div>

        {/* Step Navigation */}
        <div className="row between g-10" style={{ alignItems: "center" }}>
          <Button
            variant="secondary"
            size="sm"
            disabled={currentStepIdx === 0}
            onClick={() => setCurrentStepIdx((i) => Math.max(0, i - 1))}
          >
            &larr; Previous Step
          </Button>

          <span className="mono" style={{ fontSize: 12, color: "var(--text-3)" }}>
            Step {cur.step} of {LIFECYCLE_STEPS.length}
          </span>

          <Button
            variant="accent"
            size="sm"
            disabled={currentStepIdx === LIFECYCLE_STEPS.length - 1}
            onClick={() => setCurrentStepIdx((i) => Math.min(LIFECYCLE_STEPS.length - 1, i + 1))}
          >
            Next Step &rarr;
          </Button>
        </div>
      </div>
    </Card>
  );
}

function RiskEnvelopePipeline() {
  return (
    <Card title="Risk Envelope Pipeline — Authorize → Consume → Close">
      <div className="stack g-24">
        {/* Pipeline Flow */}
        <div>
          <span className="t-meta" style={{ display: 'block', marginBottom: 12 }}>PIPELINE FLOW</span>
          <div className="row g-8 wrap" style={{ alignItems: 'center' }}>
            {[
              { title: 'Pyth Oracle', label: 'Market Data' },
              { title: 'Risk Kernel', label: 'State Derivation' },
              { title: 'Risk Envelope', label: 'Capability Token' },
              { title: 'Permission Engine', label: '7-Attribute Gate' },
              { title: 'Execution Venue', label: 'Solana TX' }
            ].map((stage, idx, arr) => (
              <React.Fragment key={stage.title}>
                <div style={{
                  padding: '12px 16px',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4
                }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{stage.title}</span>
                  <span className="t-meta" style={{ fontSize: 10 }}>{stage.label}</span>
                </div>
                {idx < arr.length - 1 && (
                  <span style={{ color: 'var(--text-3)' }}>
                    <Icon name="arrowRight" size={16} />
                  </span>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Envelope Lifecycle */}
        <div>
          <span className="t-meta" style={{ display: 'block', marginBottom: 12 }}>ENVELOPE LIFECYCLE</span>
          <div className="grid grid--3 g-12">
            {[
              { name: 'Authorize', desc: 'authorize_action creates a short-lived RiskEnvelope PDA. Contains: action, venue, max_amount, risk_state, oracle_snapshot, TTL.', icon: 'shield' as const },
              { name: 'Consume', desc: 'consume_envelope verifies epoch, expiry, action/venue match, and marks consumed=true. Single use only.', icon: 'check' as const },
              { name: 'Close', desc: 'close_envelope reclaims rent after expiry or consumption. Permissionless cleanup.', icon: 'cross' as const }
            ].map(phase => (
              <div key={phase.name} style={{
                padding: 16,
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8
              }}>
                <div className="row g-8" style={{ alignItems: 'center' }}>
                  <Icon name={phase.icon} size={16} />
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{phase.name}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
                  {phase.desc}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Key Properties */}
        <div>
          <span className="t-meta" style={{ display: 'block', marginBottom: 12 }}>KEY PROPERTIES</span>
          <div className="grid grid--2 g-10">
            {[
              { k: 'TTL', v: '20 slots (~8 seconds)' },
              { k: 'Replay Protection', v: 'Unique nonce per envelope PDA' },
              { k: 'Epoch Binding', v: 'Invalidated if risk_epoch changes' },
              { k: 'Single Use', v: 'consumed flag prevents reuse' },
              { k: 'CPI Verifiable', v: 'Downstream programs verify via circuit-risk-sdk' },
              { k: 'Rent Refund', v: 'Owner reclaims SOL after expiry' }
            ].map(prop => (
              <div key={prop.k} className="drow">
                <span className="drow__k">{prop.k}</span>
                <span className="drow__v">{prop.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function DemoView() {
  const {
    nvdaCollateral,
    nvdaPriceUsd,
    borrowDebtUsd,
    effectiveHf,
    ratchetState,
    guardReason,
    triggerConfidenceShock,
    triggerMarketClose,
    triggerCustodyImpairment,
    resetDemo,
    openRevertModal,
  } = useDemoHarness();

  const isBorrowBlocked = ratchetState !== 'SAFE';
  const [borrowSuccess, setBorrowSuccess] = React.useState(false);

  return (
    <PageContainer>
      <div className="stack g-24" style={{ maxWidth: 1080, margin: '0 auto', paddingBottom: 60 }}>
        {/* Judge Header */}
        <div className="row between g-12 wrap" style={{ alignItems: 'center' }}>
          <div>
            <div className="row g-8" style={{ marginBottom: 6 }}>
              <Pill tone="accent">60-SECOND JUDGE PROOF</Pill>
              <Pill tone="success" withDot>DEVNET READY</Pill>
            </div>
            <h1 className="t-display" style={{ margin: 0 }}>
              Circuit Interactive Risk Demo
            </h1>
            <p className="t-sm muted" style={{ margin: '4px 0 0 0' }}>
              Experience how Circuit turns Pyth oracle uncertainty and exchange session risk into real-time on-chain credit permissions.
            </p>
          </div>
          <div className="row g-8">
            <Link to="/app/markets" className="btn btn--secondary btn--sm">
              <Icon name="activity" size={14} />
              12 Live Markets
            </Link>
            <Link to="/app/verify" className="btn btn--secondary btn--sm">
              <Icon name="verify" size={14} />
              Verify Bytecode
            </Link>
          </div>
        </div>

        {/* The Central Proof */}
        <div className="stack g-16" style={{ marginTop: 8, marginBottom: 8 }}>
          <div className="row g-8 wrap">
            <Pill tone="accent">THE CENTRAL PROOF</Pill>
            <Pill tone="neutral">SAME COLLATERAL · SAME INSTRUCTION · DIFFERENT MARKET STATE</Pill>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
            {/* Panel 1 */}
            <Card title="Panel 1: SAFE — Borrow Authorized">
              <div className="stack g-12">
                <div className="grid grid--2 g-10">
                  <div className="drow"><span className="drow__k">Asset</span><span className="drow__v mono">NVDA</span></div>
                  <div className="drow"><span className="drow__k">Market</span><span className="drow__v mono">OPEN</span></div>
                  <div className="drow"><span className="drow__k">Oracle</span><span className="drow__v mono">FRESH</span></div>
                  <div className="drow"><span className="drow__k">Confidence</span><span className="drow__v mono">0.08%</span></div>
                  <div className="drow"><span className="drow__k">Risk State</span><span className="drow__v">SAFE</span></div>
                </div>
                <div style={{ padding: 12, borderRadius: 'var(--r)', background: 'rgba(127, 195, 154, 0.12)', border: '1px solid rgba(127, 195, 154, 0.4)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--success)', marginBottom: 4 }}>
                    BORROW $40 USDC &rarr; CIRCUIT RISK KERNEL &rarr; AUTHORIZED &rarr; Envelope Created
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-2)' }}>
                    Risk Envelope PDA created. TTL: 20 slots (~8s). Action: Borrow. Venue: Credit.
                  </div>
                </div>
                <div>
                  <Pill tone="success">PERMITTED</Pill>
                </div>
              </div>
            </Card>

            {/* Panel 2 */}
            <Card title="Panel 2: DEFENSIVE — Borrow Rejected">
              <div className="stack g-12">
                <div className="grid grid--2 g-10">
                  <div className="drow"><span className="drow__k">Asset</span><span className="drow__v mono">NVDA</span></div>
                  <div className="drow"><span className="drow__k">Market</span><span className="drow__v mono">VOLATILE</span></div>
                  <div className="drow"><span className="drow__k">Oracle</span><span className="drow__v mono">DEGRADED</span></div>
                  <div className="drow"><span className="drow__k">Confidence</span><span className="drow__v mono">2.85%</span></div>
                  <div className="drow"><span className="drow__k">Risk State</span><span className="drow__v">DEFENSIVE</span></div>
                </div>
                <div style={{ padding: 12, borderRadius: 'var(--r)', background: 'rgba(207, 139, 139, 0.12)', border: '1px solid rgba(207, 139, 139, 0.4)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--danger)', marginBottom: 4 }}>
                    BORROW $40 USDC &rarr; CIRCUIT RISK KERNEL &rarr; REJECTED (DEFENSIVE_RISK_POLICY)
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-2)' }}>
                    Same actor. Same collateral. Same amount. Different market state &rarr; different authority.
                  </div>
                </div>
                <div>
                  <Pill tone="danger">BLOCKED</Pill>
                </div>
              </div>
            </Card>

            {/* Panel 3 */}
            <Card title="Panel 3: Recovery — Repay Allowed">
              <div className="stack g-12">
                <div className="grid grid--2 g-10">
                  <div className="drow"><span className="drow__k">Asset</span><span className="drow__v mono">NVDA</span></div>
                  <div className="drow"><span className="drow__k">Market</span><span className="drow__v mono">VOLATILE</span></div>
                  <div className="drow"><span className="drow__k">Oracle</span><span className="drow__v mono">DEGRADED</span></div>
                  <div className="drow"><span className="drow__k">Confidence</span><span className="drow__v mono">2.85%</span></div>
                  <div className="drow"><span className="drow__k">Risk State</span><span className="drow__v">DEFENSIVE</span></div>
                </div>
                <div style={{ padding: 12, borderRadius: 'var(--r)', background: 'rgba(127, 195, 154, 0.12)', border: '1px solid rgba(127, 195, 154, 0.4)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--success)', marginBottom: 4 }}>
                    REPAY $10 USDC &rarr; CIRCUIT RISK KERNEL &rarr; ALLOWED (RISK_REDUCING_EXEMPTION)
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-2)' }}>
                    Same defensive market state. Repayment reduces risk &rarr; always permitted. This is the asymmetric enforcement thesis.
                  </div>
                </div>
                <div>
                  <Pill tone="success">RISK-REDUCING EXEMPTION</Pill>
                </div>
              </div>
            </Card>

            {/* Panel 4 */}
            <Card title="Panel 4: MarketGuard — Per-Security Inferred Halt">
              <div className="stack g-12">
                <div className="grid grid--2 g-10">
                  <div className="drow"><span className="drow__k">Target Asset</span><span className="drow__v mono">AAPL</span></div>
                  <div className="drow"><span className="drow__k">Reference Session</span><span className="drow__v mono">OPEN (Regular)</span></div>
                  <div className="drow"><span className="drow__k">Feed Staleness</span><span className="drow__v mono" style={{ color: 'var(--danger)' }}>650s (Stale)</span></div>
                  <div className="drow"><span className="drow__k">Global Oracle</span><span className="drow__v mono" style={{ color: 'var(--mint, #79c2a4)' }}>HEALTHY</span></div>
                  <div className="drow"><span className="drow__k">MarketGuard</span><span className="drow__v"><Pill tone="danger">HALTED INFERRED</Pill></span></div>
                  <div className="drow"><span className="drow__k">Risk Epoch</span><span className="drow__v mono">Epoch 2 (Invalidated prior)</span></div>
                </div>
                <div style={{ padding: 12, borderRadius: 'var(--r)', background: 'rgba(207, 139, 139, 0.12)', border: '1px solid rgba(207, 139, 139, 0.4)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--danger)', marginBottom: 4 }}>
                    BORROW AAPL &rarr; BLOCKED (CircuitError::SecurityHaltInferred)
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.4 }}>
                    Feed stale during expected session; Circuit has inferred a security-level halt condition. Prior RiskEnvelope invalidated. Unrelated securities (NVDA, MSFT) remain OPEN NORMAL.
                  </div>
                </div>
                <div className="row g-6 wrap">
                  <Pill tone="danger">SECURITY HALT INFERRED</Pill>
                  <Pill tone="success">MSFT UNAFFECTED</Pill>
                  <Pill tone="neutral">REPAY PERMITTED</Pill>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Preloaded Position & Live Borrow Control */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          <Card title="Simulated Judge Position (NVIDIA Corporation)">
            <div className="stack g-12">
              <div className="row between g-8">
                <span className="t-meta">COLLATERAL DEPOSITED</span>
                <span style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {nvdaCollateral.toFixed(2)} NVDA (${(nvdaCollateral * nvdaPriceUsd).toFixed(2)})
                </span>
              </div>
              <div className="row between g-8">
                <span className="t-meta">OUTSTANDING DEBT</span>
                <span style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  ${borrowDebtUsd.toFixed(2)} USDC
                </span>
              </div>
              <div className="row between g-8" style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                <span className="t-meta">CURRENT HEALTH FACTOR</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: effectiveHf >= 1.25 ? 'var(--success)' : 'var(--danger)' }}>
                  {effectiveHf.toFixed(2)}
                  <span className="t-meta" style={{ marginLeft: 6, fontWeight: 400 }}>
                    (Safe above 1.00)
                  </span>
                </span>
              </div>
            </div>
          </Card>

          <Card
            title="Credit Origination Permission Gate"
            action={
              <Pill tone={isBorrowBlocked ? 'warning' : 'success'}>
                {isBorrowBlocked ? 'BORROW BLOCKED' : 'BORROW ALLOWED'}
              </Pill>
            }
          >
            <div className="stack g-12">
              <div>
                <span className="t-meta">BORROW AMOUNT</span>
                <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>
                  $100.00 USDC
                </div>
              </div>

              {isBorrowBlocked ? (
                <div
                  style={{
                    padding: 12,
                    borderRadius: 'var(--r)',
                    background: 'rgba(207, 173, 116, 0.1)',
                    border: '1px solid var(--warning)',
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--warning)', marginBottom: 4 }}>
                    Blocked by Circuit Risk Ratchet
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-2)' }}>
                    {guardReason}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--success)' }}>
                  ✓ All oracle, session, and custody invariants pass. Transaction will execute cleanly.
                </div>
              )}

              {isBorrowBlocked ? (
                <Button
                  variant="danger"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => openRevertModal()}
                >
                  <Icon name="alert" size={15} />
                  Simulate On-Chain Revert (0x1774)
                </Button>
              ) : borrowSuccess ? (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: 'var(--r)',
                    background: 'rgba(121, 194, 164, 0.12)',
                    border: '1px solid rgba(121, 194, 164, 0.4)',
                    color: 'var(--mint, #79c2a4)',
                    fontSize: 13,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <Icon name="check" size={14} />
                  Simulated borrow executed. Risk Ratchet: {ratchetState}.
                  <button
                    type="button"
                    style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', opacity: 0.7, fontSize: 11 }}
                    onClick={() => setBorrowSuccess(false)}
                  >
                    Dismiss
                  </button>
                </div>
              ) : (
                <Button
                  variant="accent"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => { setBorrowSuccess(true); }}
                >
                  Borrow 100.00 USDC
                </Button>
              )}
            </div>
          </Card>
        </div>

        {/* Shock Triggers Bar */}
        <Card title="Interactive Risk Shock Triggers (Test the Ratchet)">
          <p className="t-sm muted" style={{ margin: '0 0 14px 0' }}>
            Click any trigger below to simulate extreme real-world equity market conditions and observe Circuit’s deterministic defense:
          </p>
          <div className="row g-10 wrap">
            <Button variant="secondary" size="sm" onClick={triggerConfidenceShock}>
              ⚠️ Pyth Confidence Spike (285 bps)
            </Button>
            <Button variant="secondary" size="sm" onClick={triggerMarketClose}>
              🌙 NYSE Session Close
            </Button>
            <Button variant="secondary" size="sm" onClick={triggerCustodyImpairment}>
              💥 Custody Impairment
            </Button>
            <Button variant="ghost" size="sm" onClick={resetDemo}>
              🔄 Reset to Safe
            </Button>
          </div>
        </Card>

        {/* 9-Step Autonomous Strategy Judge Flow (Section 27) */}
        <AutonomousStrategyLifecycle />

        {/* Risk Envelope Pipeline Visualization */}
        <RiskEnvelopePipeline />

        {/* 4-State Machine Timeline */}
        <RiskRatchetTimeline />

        {/* Step Recovery Meter */}
        <StepRecoveryMeter />

        {/* Dual-Collateral Concentration Sandbox */}
        <ConcentrationSandbox />

        {/* Revert Modal */}
        <SimulationModal />
      </div>
    </PageContainer>
  );
}

export default function Demo() {
  return (
    <DemoHarnessProvider>
      <DemoView />
    </DemoHarnessProvider>
  );
}
