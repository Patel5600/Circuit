import React from 'react';
import { useDemoHarness } from '../../context/DemoHarnessContext';
import { Card, Pill, Button, Icon } from '../ui';

export function StepRecoveryMeter() {
  const {
    ratchetState,
    consecutiveObservations,
    requiredObservations,
    triggerStepRecovery,
    resetDemo,
  } = useDemoHarness();

  const isRecovering = ratchetState !== 'SAFE';

  return (
    <Card
      title="Evidence-Based Step Recovery (Anti-Flapping Defense)"
      action={
        <Pill tone={isRecovering ? 'warning' : 'success'} withDot>
          {isRecovering ? `${consecutiveObservations}/${requiredObservations} CRANKS` : 'LOCKED IN SAFE'}
        </Pill>
      }
    >
      <p className="t-sm muted" style={{ margin: '0 0 16px 0' }}>
        In financial markets, high-frequency price bounces cause naive protocols to repeatedly flip between Safe and Degraded states.
        Circuit strictly prevents flapping by requiring <strong>{requiredObservations} consecutive healthy observations</strong> at strict hysteresis thresholds before de-escalating one risk tier.
      </p>

      <div style={{ marginBottom: 16 }}>
        <div className="row between g-8" style={{ marginBottom: 8 }}>
          <span className="t-label">Monotonic Crank Progress</span>
          <span className="t-meta">
            {consecutiveObservations} of {requiredObservations} Clean Ticks
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, height: 10 }}>
          {Array.from({ length: requiredObservations }).map((_, idx) => {
            const isFilled = idx < consecutiveObservations;
            return (
              <div
                key={idx}
                style={{
                  flex: 1,
                  borderRadius: 4,
                  background: isFilled ? 'var(--success)' : 'var(--surface-3)',
                  border: isFilled ? '1px solid var(--success)' : '1px solid var(--border)',
                  transition: 'all 250ms ease',
                  boxShadow: isFilled ? '0 0 8px rgba(127, 195, 154, 0.4)' : 'none',
                }}
              />
            );
          })}
        </div>
      </div>

      <div className="row between g-12 wrap" style={{ alignItems: 'center' }}>
        <div className="t-sm muted">
          {isRecovering ? (
            <span>Click crank to simulate an incoming clean Pyth oracle observation.</span>
          ) : (
            <span style={{ color: 'var(--success)' }}>✓ Protocol is in nominal Safe mode. No recovery crank required.</span>
          )}
        </div>
        <div className="row g-8">
          {isRecovering && (
            <Button variant="accent" size="sm" onClick={triggerStepRecovery}>
              <Icon name="spinner" size={14} />
              Crank Clean Tick ({consecutiveObservations + 1}/{requiredObservations})
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={resetDemo}>
            Reset to Safe
          </Button>
        </div>
      </div>
    </Card>
  );
}
