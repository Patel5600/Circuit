import React from 'react';
import { Link } from 'react-router-dom';
import { PageContainer } from '../components/layout/AppShell';
import { Card, Pill, Button, Icon } from '../components/ui';
import { DemoHarnessProvider, useDemoHarness } from '../context/DemoHarnessContext';
import { RiskRatchetTimeline } from '../components/demo/RiskRatchetTimeline';
import { StepRecoveryMeter } from '../components/demo/StepRecoveryMeter';
import { ConcentrationSandbox } from '../components/demo/ConcentrationSandbox';
import { SimulationModal } from '../components/demo/SimulationModal';

const LIFECYCLE_STEPS = [
  {
    step: 1,
    title: "User Deposits AAPLx Collateral",
    actor: "Position Owner",
    collateral: "100 AAPLx ($10,000)",
    debt: "$0.00 USDC",
    ratchet: "SAFE",
    authority: "FULL",
    statusText: "Position established on-chain. Collateral locked in Protocol Vault ATA.",
    tone: "success" as const,
  },
  {
    step: 2,
    title: "User Creates Bounded AgentAuthority PDA",
    actor: "Position Owner",
    collateral: "100 AAPLx ($10,000)",
    debt: "$0.00 USDC",
    ratchet: "SAFE",
    authority: "FULL",
    statusText: "Policy set: Max Borrow = $3,000 | Allowed = [BORROW, REPAY] | Withdraw = DISABLED | Risk Budget = $3,000.",
    tone: "success" as const,
  },
  {
    step: 3,
    title: "Autonomous Strategy Requests BORROW $1,000",
    actor: "Autonomous Strategy",
    collateral: "100 AAPLx ($10,000)",
    debt: "$1,000.00 USDC",
    ratchet: "SAFE",
    authority: "FULL",
    statusText: "✓ ALLOWED: Oracle confidence nominal (20 bps). Protocol verifies LTV < 50% and updates Nonce = 1.",
    tone: "success" as const,
  },
  {
    step: 4,
    title: "Market Stress Breach (SAFE → RESTRICTED)",
    actor: "Pyth Oracle & MarketGuard",
    collateral: "100 AAPLx ($10,000)",
    debt: "$1,000.00 USDC",
    ratchet: "RESTRICTED",
    authority: "LIMITED",
    statusText: "Pyth confidence widens to 80 bps (> 50 bps threshold). Risk Ratchet steps up to RESTRICTED (Epoch = 1).",
    tone: "warning" as const,
  },
  {
    step: 5,
    title: "Strategy Requests Additional BORROW $1,000",
    actor: "Autonomous Strategy",
    collateral: "100 AAPLx ($10,000)",
    debt: "$1,000.00 USDC",
    ratchet: "RESTRICTED",
    authority: "LIMITED",
    statusText: "✕ BLOCKED ON-CHAIN: Protocol rejects with error 0x1787. Current capital policy does not permit additional risk.",
    tone: "danger" as const,
  },
  {
    step: 6,
    title: "Strategy Requests REPAY $500",
    actor: "Autonomous Strategy",
    collateral: "100 AAPLx ($10,000)",
    debt: "$500.00 USDC",
    ratchet: "RESTRICTED",
    authority: "LIMITED",
    statusText: "✓ ALLOWED: Repaying is unconditionally open as a risk-reducing action. Outstanding debt drops to $500. Nonce = 2.",
    tone: "success" as const,
  },
  {
    step: 7,
    title: "Pyth Oracle Recovers (15 bps confidence)",
    actor: "Pyth Oracle",
    collateral: "100 AAPLx ($10,000)",
    debt: "$500.00 USDC",
    ratchet: "RESTRICTED",
    authority: "LIMITED",
    statusText: "Confidence tightens below 30 bps. Monotonic staged recovery crank initiated.",
    tone: "warning" as const,
  },
  {
    step: 8,
    title: "Staged Recovery Crank (1/5 ... 5/5)",
    actor: "Protocol Crank",
    collateral: "100 AAPLx ($10,000)",
    debt: "$500.00 USDC",
    ratchet: "SAFE",
    authority: "FULL",
    statusText: "Hysteresis barrier satisfied after 5 consecutive healthy observations. Risk Ratchet restores: RESTRICTED → SAFE.",
    tone: "success" as const,
  },
  {
    step: 9,
    title: "Agent Permitted Borrowing Restored",
    actor: "Capital Control Plane",
    collateral: "100 AAPLx ($10,000)",
    debt: "$500.00 USDC",
    ratchet: "SAFE",
    authority: "FULL",
    statusText: "Strategy permitted borrowing capacity restored to $2,500 under SAFE market conditions.",
    tone: "success" as const,
  },
];

function AutonomousStrategyLifecycle() {
  const [currentStepIdx, setCurrentStepIdx] = React.useState(0);
  const cur = LIFECYCLE_STEPS[currentStepIdx];

  return (
    <Card
      title={
        <div className="row between g-12 wrap" style={{ alignItems: "center" }}>
          <span>Autonomous Stock Strategy Control: 9-Step Judge Lifecycle</span>
          <div className="row g-6">
            <Pill tone="accent">SECTION 27</Pill>
            <Pill tone={cur.tone} withDot>
              STEP {cur.step}/9: {cur.ratchet}
            </Pill>
          </div>
        </div>
      }
    >
      <div className="stack g-16">
        <p className="t-sm muted" style={{ margin: 0 }}>
          Interactive execution proof of the canonical thesis:{" "}
          <strong>"Agents decide what to do. Circuit decides what capital they are allowed to risk."</strong>
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
              <span className="t-label" style={{ color: "var(--text-3)" }}>
                Step {cur.step} of 9 · {cur.actor}
              </span>
              <h3 style={{ margin: "2px 0 0 0", fontSize: 16, fontWeight: 700 }}>
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
            Step {cur.step} of 9
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
              ) : (
                <Button
                  variant="accent"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => alert('Simulated borrow executed successfully on-chain!')}
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
