import React from 'react';
import { useDemoHarness } from '../../context/DemoHarnessContext';
import { Card, Pill, Icon } from '../ui';

export function ConcentrationSandbox() {
  const {
    allocationNvdaPct,
    setAllocationNvdaPct,
    concentrationPenaltyBps,
    effectiveLtvBps,
    marketDropPct,
    setMarketDropPct,
    stressedHfBalanced,
    stressedHfConcentrated,
  } = useDemoHarness();

  const allocationAaplPct = 100 - allocationNvdaPct;

  return (
    <Card
      title="Dynamic Portfolio Risk & Concentration Proof"
      action={<Pill tone="success" withDot>DUAL-COLLATERAL SANDBOX</Pill>}
    >
      <p className="t-sm muted" style={{ margin: '0 0 16px 0' }}>
        Tokenized equities are subject to idiosyncratic single-stock gaps. When single-asset concentration exceeds <strong>40%</strong>,
        Circuit applies a dynamic concentration haircut to Effective LTV, protecting borrowers from sudden liquidation.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 20 }}>
        {/* Allocation Slider */}
        <div
          style={{
            padding: 16,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r)',
          }}
        >
          <div className="row between g-8" style={{ marginBottom: 6 }}>
            <span className="t-label">Asset Allocation</span>
            <span className="t-meta" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {allocationNvdaPct}% NVDA / {allocationAaplPct}% AAPL
            </span>
          </div>
          <input
            type="range"
            min={50}
            max={90}
            step={5}
            value={allocationNvdaPct}
            onChange={(e) => setAllocationNvdaPct(Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--text)' }}
          />
          <div className="row between g-4 t-meta" style={{ marginTop: 4 }}>
            <span>50/50 (Balanced)</span>
            <span>70/30</span>
            <span>90/10 (Concentrated)</span>
          </div>

          <div
            style={{
              marginTop: 14,
              paddingTop: 12,
              borderTop: '1px solid var(--border)',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
            }}
          >
            <div>
              <span className="t-meta">CONCENTRATION PENALTY</span>
              <div style={{ fontSize: 13, fontWeight: 700, color: concentrationPenaltyBps > 0 ? 'var(--warning)' : 'var(--success)' }}>
                {concentrationPenaltyBps > 0 ? `-${(concentrationPenaltyBps / 100).toFixed(1)}% LTV` : '0% (Within 40% Floor)'}
              </div>
            </div>
            <div>
              <span className="t-meta">EFFECTIVE LTV</span>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>
                {((effectiveLtvBps / 10000) * 100).toFixed(1)}%
                <span className="t-meta" style={{ marginLeft: 4, fontWeight: 400 }}>
                  (Base: 70.0%)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Stress-Test Slider */}
        <div
          style={{
            padding: 16,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r)',
          }}
        >
          <div className="row between g-8" style={{ marginBottom: 6 }}>
            <span className="t-label">Market Opening Gap-Down Stress</span>
            <span className="t-meta" style={{ fontVariantNumeric: 'tabular-nums', color: marketDropPct < 0 ? 'var(--danger)' : 'var(--text)' }}>
              {marketDropPct}% NVDA Opening Shock
            </span>
          </div>
          <input
            type="range"
            min={-20}
            max={0}
            step={1}
            value={marketDropPct}
            onChange={(e) => setMarketDropPct(Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--danger)' }}
          />
          <div className="row between g-4 t-meta" style={{ marginTop: 4 }}>
            <span>-20% (Crash)</span>
            <span>-10%</span>
            <span>0% (Nominal)</span>
          </div>

          <div
            style={{
              marginTop: 14,
              paddingTop: 12,
              borderTop: '1px solid var(--border)',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
            }}
          >
            <div>
              <span className="t-meta">50/50 BALANCED HF</span>
              <div style={{ fontSize: 15, fontWeight: 700, color: stressedHfBalanced >= 1.25 ? 'var(--success)' : stressedHfBalanced >= 1.0 ? 'var(--warning)' : 'var(--danger)' }}>
                {stressedHfBalanced.toFixed(2)}
                <span className="t-meta" style={{ marginLeft: 4, fontWeight: 400 }}>
                  {stressedHfBalanced >= 1.0 ? 'Safe' : 'Liquidatable'}
                </span>
              </div>
            </div>
            <div>
              <span className="t-meta">90/10 CONCENTRATED HF</span>
              <div style={{ fontSize: 15, fontWeight: 700, color: stressedHfConcentrated >= 1.25 ? 'var(--success)' : stressedHfConcentrated >= 1.0 ? 'var(--warning)' : 'var(--danger)' }}>
                {stressedHfConcentrated.toFixed(2)}
                <span className="t-meta" style={{ marginLeft: 4, fontWeight: 400 }}>
                  {stressedHfConcentrated >= 1.0 ? 'Safe' : 'Liquidated!'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          padding: '12px 16px',
          background: marketDropPct <= -15 ? 'rgba(207, 139, 139, 0.12)' : 'rgba(127, 195, 154, 0.12)',
          border: '1px solid ' + (marketDropPct <= -15 ? 'var(--danger)' : 'var(--success)'),
          borderRadius: 'var(--r)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <span style={{ color: marketDropPct <= -15 ? 'var(--danger)' : 'var(--success)' }}>
          <Icon name={marketDropPct <= -15 ? 'alert' : 'check'} size={20} />
        </span>
        <div style={{ fontSize: 13, lineHeight: 1.45 }}>
          {marketDropPct <= -15 ? (
            <span>
              <strong>Proof of Resilience:</strong> Under a {marketDropPct}% opening gap-down, the diversified 50/50 portfolio maintains health at HF {stressedHfBalanced.toFixed(2)}, whereas the 90/10 concentrated portfolio suffers severe distress at HF {stressedHfConcentrated.toFixed(2)}. Circuit’s concentration penalty proactively reduces allowable leverage for concentrated borrowers.
            </span>
          ) : (
            <span>
              <strong>Dynamic Solvency Guarantee:</strong> At 90% concentration, Effective LTV is automatically restricted to 52.0% (down from 70.0%), ensuring adequate equity buffer before volatility strikes.
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
