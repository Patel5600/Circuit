import React from 'react';
import { useDemoHarness } from '../../context/DemoHarnessContext';
import { Pill, Button, Icon } from '../ui';

export function SimulationModal() {
  const { isRevertModalOpen, revertDetails, closeRevertModal } = useDemoHarness();

  if (!isRevertModalOpen || !revertDetails) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(3, 3, 4, 0.85)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={closeRevertModal}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 680,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--r-lg)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div className="row g-10">
            <span style={{ color: 'var(--danger)' }}>
              <Icon name="alert" size={18} />
            </span>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
                On-Chain Preflight Revert Simulation
              </h3>
              <p className="t-meta" style={{ margin: 0 }}>
                Anchor Program Execution Rejected by Circuit Risk Invariant
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeRevertModal}
            className="btn btn--ghost btn--sm"
            style={{ padding: '4px 8px' }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '18px 20px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12,
              marginBottom: 16,
              background: 'var(--surface)',
              padding: 12,
              borderRadius: 'var(--r)',
              border: '1px solid var(--border)',
            }}
          >
            <div>
              <span className="t-meta">PROGRAM ID</span>
              <div className="t-mono" style={{ fontSize: 12, wordBreak: 'break-all' }}>
                {revertDetails.programId}
              </div>
            </div>
            <div>
              <span className="t-meta">INSTRUCTION</span>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {revertDetails.instruction}
              </div>
            </div>
            <div>
              <span className="t-meta">ERROR CODE</span>
              <div className="row g-6" style={{ marginTop: 2 }}>
                <Pill tone="danger">{revertDetails.errorCode}</Pill>
                <span className="t-mono" style={{ fontSize: 12 }}>
                  [0x{revertDetails.errorNumber.toString(16)}] ({revertDetails.errorNumber})
                </span>
              </div>
            </div>
            <div>
              <span className="t-meta">COMPUTE UNITS</span>
              <div className="t-mono" style={{ fontSize: 12 }}>
                {revertDetails.computeUnits.toLocaleString()} / 200,000 CU
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <span className="t-meta">SIMULATED SOLANA RUNTIME LOGS</span>
            <div
              style={{
                marginTop: 6,
                padding: '12px 14px',
                background: '#050506',
                border: '1px solid #1a1a1f',
                borderRadius: 'var(--r)',
                fontFamily: 'var(--mono)',
                fontSize: 11.5,
                lineHeight: 1.55,
                color: '#e2e2e5',
                maxHeight: 220,
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {revertDetails.logs.map((log, i) => {
                const isError = log.includes('failed') || log.includes('AnchorError');
                const isWarn = log.includes('exceeds');
                const color = isError ? 'var(--danger)' : isWarn ? 'var(--warning)' : '#9b9a97';
                return (
                  <div key={i} style={{ color }}>
                    {log}
                  </div>
                );
              })}
            </div>
          </div>

          <p className="t-sm muted" style={{ margin: 0, lineHeight: 1.45 }}>
            <strong>Why this matters to judges:</strong> Circuit does not rely on client-side JS disabled buttons.
            The Anchor smart contract itself independently validates the Pyth confidence interval and market state, guaranteeing that even a direct raw transaction bypassing this UI will revert on-chain.
          </p>
        </div>

        <div
          style={{
            padding: '12px 20px',
            background: 'var(--surface)',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <Button variant="accent" size="sm" onClick={closeRevertModal}>
            Understood — Back to Demo
          </Button>
        </div>
      </div>
    </div>
  );
}
