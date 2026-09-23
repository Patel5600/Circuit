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
    concept: "Delegation of bounded authority",
    title: "2. Bounded Authority Delegated",
    actor: "Human -> AgentAuthority PDA",
    collateral: "100 AAPLx ($10,000)",
    debt: "$0.00 USDC",
    ratchet: "SAFE",
    authority: "DELEGATED",
    statusText: "create_agent_authority establishes on-chain PDA seeds [authority, owner, agent, mint]. Enforces action bitmask (Borrow/Repay only), max borrow limit ($2,000), dynamic risk budget ($500), and slot TTL.",
    tone: "success",
    evidence: "VERIFIED ONCHAIN",
  },
  {
    step: 3,
    concept: "Market data is observed",
    title: "3. Live Market Data Observed",
    actor: "Pyth Hermes & On-Chain Feed",
    collateral: "100 AAPLx ($10,000)",
    debt: "$0.00 USDC",
    ratchet: "SAFE",
    authority: "OBSERVING",
    statusText: "Pyth price account continuously reports price ($100.00) and confidence interval (±$0.30). Conservative valuation uses lower bound: p_conservative = max(0, p - conf) = $99.70.",
    tone: "success",
    evidence: "VERIFIED ONCHAIN",
  },
  {
    step: 4,
    concept: "MarketGuard validates input",
    title: "4. MarketGuard Validates Session & Freshness",
    actor: "MarketGuard Circuit Breaker",
    collateral: "100 AAPLx ($10,000)",
    debt: "$0.00 USDC",
    ratchet: "SAFE",
    authority: "OBSERVING",
    statusText: "MarketGuard validates NYSE regular trading session hours, Pyth feed ID cryptographic binding, confidence ratio threshold (30 bps < 150 bps cap), and clock freshness (<60s). Halt state is OpenNormal.",
    tone: "success",
    evidence: "VERIFIED BY TEST",
  },
  {
    step: 5,
    concept: "Risk state is derived",
    title: "5. Risk Ratchet Derives Risk State",
    actor: "Risk Ratchet Engine",
    collateral: "100 AAPLx ($10,000)",
    debt: "$0.00 USDC",
    ratchet: "SAFE",
    authority: "NOMINAL",
    statusText: "Dynamic Risk Ratchet combines confidence ratio, price velocity, and custody state. Composite score 12 derives candidate state SAFE. Monotonic 4-state machine protects capital.",
    tone: "success",
    evidence: "VERIFIED BY TEST",
  },
  {
    step: 6,
    concept: "Capital policy changes",
    title: "6. Authoritative Capital Policy Generated",
    actor: "Capital Control Plane",
    collateral: "100 AAPLx ($10,000)",
    debt: "$0.00 USDC",
    ratchet: "SAFE",
    authority: "ACTIVE",
    statusText: "Under SAFE regime, Capital Policy derives 100% borrow capacity (70% base LTV, 80% liquidation threshold, full $2,000 credit ceiling). Policy version 1 pinned to Risk Epoch 0.",
    tone: "success",
    evidence: "VERIFIED BY TEST",
  },
  {
    step: 7,
    concept: "Autonomous strategy plans action",
    title: "7. Autonomous Strategy Plans Action",
    actor: "Autonomous Agent Strategy",
    collateral: "100 AAPLx ($10,000)",
    debt: "$0.00 USDC",
    ratchet: "SAFE",
    authority: "PLANNING",
    statusText: "Agent evaluates yield opportunities via formulate_strategy and proposes $500 USDC borrow against AAPLx collateral. Verifies proposed debt is within delegated authority limit ($2,000).",
    tone: "success",
    evidence: "SIMULATED",
  },
  {
    step: 8,
    concept: "Circuit Risk Kernel evaluates permission",
    title: "8. Circuit Risk Kernel Evaluates Permission",
    actor: "Circuit Permission Engine",
    collateral: "100 AAPLx ($10,000)",
    debt: "$0.00 USDC",
    ratchet: "SAFE",
    authority: "EVALUATING",
    statusText: "authorize_action instruction passes proposal to evaluate_permission. Confirms: action permitted by bitmask, amount ($500) <= borrow limit ($2,000), resulting LTV (5% <= 70%), health factor (14.0 > 1.05). Permitted = TRUE.",
    tone: "success",
    evidence: "VERIFIED ONCHAIN",
  },
  {
    step: 9,
    concept: "RiskEnvelope PDA minted",
    title: "9. RiskEnvelope Capability Token Minted",
    actor: "Solana Circuit Program",
    collateral: "100 AAPLx ($10,000)",
    debt: "$0.00 USDC",
    ratchet: "SAFE",
    authority: "ENVELOPE_CREATED",
    statusText: "Circuit mints short-lived RiskEnvelope PDA seeds [envelope, owner, agent, mint, nonce]. Encodes max_notional=$500, venue=CREDIT, action=BORROW, risk_epoch=0, expires_at_slot=current+20. Single-use capability token is live.",
    tone: "success",
    evidence: "VERIFIED ONCHAIN",
  },
  {
    step: 10,
    concept: "Authorized autonomous execution",
    title: "10. Authorized Autonomous Execution",
    actor: "Autonomous Agent Signer",
    collateral: "100 AAPLx ($10,000)",
    debt: "$500.00 USDC",
    ratchet: "SAFE",
    authority: "EXECUTING",
    statusText: "Agent signs execute_agent_action, passing the RiskEnvelope PDA in remaining_accounts. Single atomic Solana transaction bundle combines authorization check and credit disbursement.",
    tone: "success",
    evidence: "VERIFIED ONCHAIN",
  },
  {
    step: 11,
    concept: "Envelope verified & consumed onchain",
    title: "11. Envelope Verified & Consumed Onchain",
    actor: "Solana Circuit Runtime",
    collateral: "100 AAPLx ($10,000)",
    debt: "$500.00 USDC",
    ratchet: "SAFE",
    authority: "COMPLETED",
    statusText: "execute_agent_action validates envelope: actor matches, venue matches, amount matches, slot <= expires_at, epoch matches. Envelope consumed=true, consumed_at_slot=clock.slot. 500 USDC transferred to borrower.",
    tone: "success",
    evidence: "VERIFIED ONCHAIN",
  },
  {
    step: 12,
    concept: "Market shock occurs",
    title: "12. Market Shock: Pyth Feed Stales Out",
    actor: "Pyth Oracle Simulation",
    collateral: "100 AAPLx ($10,000)",
    debt: "$500.00 USDC",
    ratchet: "SAFE",
    authority: "CONSTRAINED",
    statusText: "Simulated market event: Reference equity trading halted on primary exchange; Pyth feed publish timestamp halts while Solana clock advances past max_oracle_age (>60s). Feed staleness detected.",
    tone: "warning",
    evidence: "SIMULATED",
  },
  {
    step: 13,
    concept: "MarketGuard triggers inferred halt",
    title: "13. MarketGuard Triggers Inferred Security Halt",
    actor: "MarketGuard Kernel",
    collateral: "100 AAPLx ($10,000)",
    debt: "$500.00 USDC",
    ratchet: "DEFENSIVE",
    authority: "HALTED",
    statusText: "MarketGuard detects feed staleness during active market hours: automatically clamps HaltState = HaltedInferred, MarketState = Defensive, Reason = SecurityHaltInferred. All new stocks default to this halt state.",
    tone: "danger",
    evidence: "VERIFIED ONCHAIN",
  },
  {
    step: 14,
    concept: "Risk Ratchet steps up & epoch increments",
    title: "14. Risk Ratchet Steps Up & Epoch Advances",
    actor: "Risk Ratchet Engine",
    collateral: "100 AAPLx ($10,000)",
    debt: "$500.00 USDC",
    ratchet: "DEFENSIVE",
    authority: "EPOCH_INCREMENTED",
    statusText: "Ratchet hysteresis detects defensive conditions. Monotonic ratchet advances Risk State from SAFE to DEFENSIVE. Crucially, Risk Epoch advances from 0 to 1.",
    tone: "danger",
    evidence: "VERIFIED ONCHAIN",
  },
  {
    step: 15,
    concept: "Prior RiskEnvelopes invalidated",
    title: "15. Prior RiskEnvelopes Instantly Invalidated",
    actor: "Solana Circuit Program",
    collateral: "100 AAPLx ($10,000)",
    debt: "$500.00 USDC",
    ratchet: "DEFENSIVE",
    authority: "INVALIDATED",
    statusText: "Any unconsumed RiskEnvelope authorized in Epoch 0 is now structurally invalid. Onchain verification rejects execution with CircuitError::EnvelopeEpochMismatch (expected Epoch 1, found Epoch 0).",
    tone: "danger",
    evidence: "VERIFIED BY CODE",
  },
  {
    step: 16,
    concept: "Risk-increasing actions strictly blocked",
    title: "16. Risk-Increasing Actions Blocked",
    actor: "Circuit Permission Engine",
    collateral: "100 AAPLx ($10,000)",
    debt: "$500.00 USDC",
    ratchet: "DEFENSIVE",
    authority: "BLOCKED",
    statusText: "Agent attempts new $200 borrow: authorize_action and execute_agent_action reject request on-chain with SECURITY_HALT_INFERRED / RiskDefensive (0x1787). Agent cannot bypass protocol risk bounds.",
    tone: "danger",
    evidence: "VERIFIED ONCHAIN",
  },
  {
    step: 17,
    concept: "Recovery actions unconditionally open",
    title: "17. Capital Recovery Unconditionally Open",
    actor: "Circuit Permission Engine",
    collateral: "100 AAPLx ($10,000)",
    debt: "$500.00 USDC",
    ratchet: "DEFENSIVE",
    authority: "RECOVERY_OPEN",
    statusText: "Even in DEFENSIVE or HALTED state, capital recovery (repay, deposit, exit_liquidity) remains unconditionally permitted by Capital Policy. Solvency preservation is sacred and never blocked.",
    tone: "success",
    evidence: "VERIFIED ONCHAIN",
  },
  {
    step: 18,
    concept: "Autonomous recovery & authority boundary proof",
    title: "18. Autonomous Recovery & Authority Boundary Proof",
    actor: "Autonomous Agent Strategy",
    collateral: "100 AAPLx ($10,000)",
    debt: "$250.00 USDC",
    ratchet: "DEFENSIVE",
    authority: "RECOVERED",
    statusText: "Agent adapts to halt: executes repay($250) to de-risk position, cutting debt in half and doubling health factor to 28.0. Proof complete: 'The agent can decide what to attempt. It cannot decide what it is allowed to execute. Circuit is the authority boundary.'",
    tone: "success",
    evidence: "VERIFIED ONCHAIN",
  },
];

function AutonomousStrategyLifecycle() {
  const [currentStepIdx, setCurrentStepIdx] = React.useState(0);
  const cur = LIFECYCLE_STEPS[currentStepIdx];

  return (
    <Card
      title={
        <div className="row between g-12 wrap" style={{ alignItems: "center" }}>
          <span>Deterministic Protocol Integrity: {LIFECYCLE_STEPS.length}-Step Proof</span>
          <div className="row g-6">
            <Pill tone={cur.evidence === "VERIFIED ONCHAIN" ? "success" : cur.evidence === "SIMULATED" ? "warning" : "neutral"} withDot>
              {cur.evidence}
            </Pill>
            <Pill tone={cur.tone}>
              STEP {cur.step}/{LIFECYCLE_STEPS.length}: {cur.ratchet}
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
                  Step {cur.step} of {LIFECYCLE_STEPS.length} · {cur.actor}
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
