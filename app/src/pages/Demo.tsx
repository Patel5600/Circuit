import React from 'react';
import { Link } from 'react-router-dom';
import { PageContainer } from '../components/layout/AppShell';
import { Card, Pill, Button, Icon } from '../components/ui';
import { DemoHarnessProvider, useDemoHarness } from '../context/DemoHarnessContext';
import { RiskRatchetTimeline } from '../components/demo/RiskRatchetTimeline';
import { StepRecoveryMeter } from '../components/demo/StepRecoveryMeter';
import { ConcentrationSandbox } from '../components/demo/ConcentrationSandbox';
import { SimulationModal } from '../components/demo/SimulationModal';

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
