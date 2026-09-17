import React from 'react';
import { Link } from 'react-router-dom';
import { PageContainer } from '../components/layout/AppShell';
import { Card, Pill, Button, Icon } from '../components/ui';
import { DemoHarnessProvider, useDemoHarness } from '../context/DemoHarnessContext';
import { RiskRatchetTimeline } from '../components/demo/RiskRatchetTimeline';
import { StepRecoveryMeter } from '../components/demo/StepRecoveryMeter';
import { ConcentrationSandbox } from '../components/demo/ConcentrationSandbox';
import { SimulationModal } from '../components/demo/SimulationModal';

export interface LifecycleStep {
  step: number;
  concept: string;
  title: string;
  actor: string;
  collateral: string;
  debt: string;
  ratchet: "SAFE" | "RESTRICTED" | "DEFENSIVE" | "EMERGENCY";
  authority: string;
  statusText: string;
  tone: "success" | "warning" | "danger";
  environment: "REAL DEVNET" | "SIMULATED SCENARIO";
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
    statusText: "Position established on-chain by direct wallet signer. Collateral locked in protocol vault ATA. Human retains root sovereignty; zero agents exist or required.",
    tone: "success",
    environment: "REAL DEVNET",
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
    statusText: "Pyth price account continuously reports price $100.00 and confidence interval ±$0.18 (18 bps). Conservative valuation uses lower bound: p_conservative = p - conf.",
    tone: "success",
    environment: "REAL DEVNET",
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
    statusText: "MarketGuard PDA validates reference NYSE session (Regular Hours), Pyth feed ID binding, confidence interval threshold (<150 bps), and clock freshness (<60s).",
    tone: "success",
    environment: "REAL DEVNET",
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
    environment: "REAL DEVNET",
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
    statusText: "Under SAFE state, Capital Policy derives: 100% borrow capacity unlocked (70% base LTV, 80% liquidation threshold, full $7,000 credit ceiling).",
    tone: "success",
    environment: "REAL DEVNET",
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
    statusText: "evaluate_permission confirms: borrow = ALLOWED, withdraw = ALLOWED, deposit = ALLOWED, repay = ALLOWED. Both human and agent share this identical evaluator.",
    tone: "success",
    environment: "REAL DEVNET",
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
    statusText: "✓ ALLOWED: Manual borrow of $1,000 USDC passes on-chain evaluation. Protocol verifies LTV (10% < 70% max) and Health Factor (7.00 > 1.00 minimum).",
    tone: "success",
    environment: "REAL DEVNET",
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
    statusText: "✓ ALLOWED: Strategy calls execute_agent_action for $500 borrow. Evaluator checks owner authority delegation, risk budget, and LTV. Total debt = $1,500.",
    tone: "success",
    environment: "REAL DEVNET",
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
    environment: "SIMULATED SCENARIO",
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
    statusText: "✕ BLOCKED ON-CHAIN: Both Agent and Human borrow attempts are rejected before CPI. Error: BORROW_DISABLED_BY_RISK_STATE (0x1787). Circuit bounds all actors equally.",
    tone: "danger",
    environment: "SIMULATED SCENARIO",
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
    statusText: "✓ ALWAYS ALLOWED: Repayment of $500 reduces risk. Deleveraging and liquidity exits are unconditionally open across all risk states. Solvency defended.",
    tone: "success",
    environment: "REAL DEVNET",
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
            <Pill tone={cur.environment === "REAL DEVNET" ? "success" : "warning"} withDot>
              {cur.environment}
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
                <Pill tone={cur.environment === "REAL DEVNET" ? "success" : "warning"}>
                  {cur.environment}
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
