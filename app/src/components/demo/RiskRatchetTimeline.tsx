import React from 'react';
import { RatchetTier, useDemoHarness } from '../../context/DemoHarnessContext';
import { Card, Pill } from '../ui';

const TIERS: { tier: RatchetTier; label: string; desc: string; color: string; bg: string }[] = [
  {
    tier: 'SAFE',
    label: 'Safe',
    desc: 'Conf <= 50 bps | Market open | Custody healthy',
    color: '#7fc39a',
    bg: 'rgba(127, 195, 154, 0.12)',
  },
  {
    tier: 'RESTRICTED',
    label: 'Restricted',
    desc: 'Conf > 50 bps | Session closed | Thin liquidity',
    color: '#cfad74',
    bg: 'rgba(207, 173, 116, 0.12)',
  },
  {
    tier: 'DEFENSIVE',
    label: 'Defensive',
    desc: 'Conf > 150 bps | High volatility',
    color: '#e08c4e',
    bg: 'rgba(224, 140, 78, 0.12)',
  },
  {
    tier: 'EMERGENCY',
    label: 'Emergency',
    desc: 'Conf > 300 bps | Stale/invalid price | Impairment',
    color: '#cf8b8b',
    bg: 'rgba(207, 139, 139, 0.12)',
  },
];

export function RiskRatchetTimeline() {
  const {
    ratchetState,
    guardReason,
    confBps,
    riskEpoch,
    consecutiveObservations,
    requiredObservations,
  } = useDemoHarness();

  return (
    <Card
      title="Protocol Risk Ratchet (4-State Machine)"
      action={
        <div className="row g-8">
          <Pill tone={ratchetState === 'SAFE' ? 'success' : ratchetState === 'RESTRICTED' ? 'warning' : 'danger'} withDot>
            STATE: {ratchetState}
          </Pill>
          <span className="t-meta" style={{ fontVariantNumeric: 'tabular-nums' }}>
            Epoch #{riskEpoch}
          </span>
        </div>
      }
    >
      <p className="t-sm muted" style={{ margin: '0 0 16px 0' }}>
        Circuit does not treat risk as a passive calculation. Volatility breaches trigger asymmetric fast tightening;
        recovery requires {requiredObservations} consecutive clean crank observations (hysteresis) to prevent high-frequency flapping.
      </p>

      {/* 4-State Machine Step Bar */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: 10,
          marginBottom: 16,
        }}
      >
        {TIERS.map((t) => {
          const isActive = ratchetState === t.tier;
          return (
            <div
              key={t.tier}
              style={{
                padding: '12px 14px',
                borderRadius: 'var(--r)',
                background: isActive ? t.bg : 'var(--bg-elevated)',
                border: '1px solid ' + (isActive ? t.color : 'var(--border)'),
                transition: 'all 200ms ease',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {isActive && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 3,
                    background: t.color,
                  }}
                />
              )}
              <div className="row between g-6" style={{ marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: isActive ? t.color : 'var(--text)' }}>
                  {t.label}
                </span>
                {isActive && (
                  <span
                    style={{
                      display: 'inline-block',
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: t.color,
                      boxShadow: '0 0 8px ' + t.color,
                    }}
                  />
                )}
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: 0, lineHeight: 1.4 }}>
                {t.desc}
              </p>
            </div>
          );
        })}
      </div>

      {/* Live Telemetry & Active Gating */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r)',
          padding: '14px 16px',
        }}
      >
        <div className="row between g-12 wrap" style={{ marginBottom: 10 }}>
          <div>
            <span className="t-meta">ACTIVE STATE DIAGNOSTIC</span>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>
              {guardReason}
            </div>
          </div>
          <div className="row g-16 wrap">
            <div>
              <span className="t-meta">PYTH CONFIDENCE</span>
              <div style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: confBps > 150 ? 'var(--danger)' : confBps > 50 ? 'var(--warning)' : 'var(--success)' }}>
                {confBps} bps ({((confBps / 10000) * 100).toFixed(2)}%)
              </div>
            </div>
            <div>
              <span className="t-meta">RECOVERY PROGRESS</span>
              <div style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {consecutiveObservations} / {requiredObservations} Cranks
              </div>
            </div>
          </div>
        </div>

        {/* Permissions Gating Matrix */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: 8,
            borderTop: '1px solid var(--border)',
            paddingTop: 10,
            marginTop: 8,
          }}
        >
          <div>
            <span className="t-meta" style={{ fontSize: 10.5 }}>NEW BORROWING</span>
            <div style={{ fontSize: 12, fontWeight: 600, color: ratchetState === 'SAFE' ? 'var(--success)' : 'var(--danger)' }}>
              {ratchetState === 'SAFE' ? '✓ Permitted' : '✕ Blocked'}
            </div>
          </div>
          <div>
            <span className="t-meta" style={{ fontSize: 10.5 }}>WITHDRAW WITH DEBT</span>
            <div style={{ fontSize: 12, fontWeight: 600, color: ratchetState === 'SAFE' || ratchetState === 'RESTRICTED' ? 'var(--success)' : 'var(--danger)' }}>
              {ratchetState === 'SAFE' || ratchetState === 'RESTRICTED' ? '✓ Allowed (HF > 1.0)' : '✕ Blocked'}
            </div>
          </div>
          <div>
            <span className="t-meta" style={{ fontSize: 10.5 }}>DEBT REPAYMENT</span>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--success)' }}>
              ✓ Always Allowed
            </div>
          </div>
          <div>
            <span className="t-meta" style={{ fontSize: 10.5 }}>DUTCH LIQUIDATION</span>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>
              {ratchetState === 'EMERGENCY' ? 'Emergency Snapshot' : 'Spot + Auction Ramp'}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
