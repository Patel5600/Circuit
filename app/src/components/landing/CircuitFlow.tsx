import React, { useRef } from "react";

import { usePinnedSteps } from "../../hooks/useMotion";

/**
 * Section 03 - how the circuit works.
 *
 * Scroll-pinned. The section is five viewports tall and its stage sticks, so each
 * scroll advances exactly one stage: the trace grows one segment, the rail beside
 * that stage fills, and the previous stage settles back rather than disappearing.
 * The sequence is the content here, which is why it is paced by scroll rather than
 * revealed all at once.
 *
 * The trace is a single <path> with pathLength="1", so the dash maths is
 * `1 - var(--p)` and needs no getTotalLength() measurement or resize handling.
 */

const STAGES = [
  {
    key: "equity",
    label: "Tokenized Equity",
    detail:
      "Tokenized equity enters circuit as programmable collateral. The position is represented on Solana and governed by protocol rules rather than a frontend balance.",
    beat: "Collateral",
    formula: "Non-Custodial: Repay & Deposit unconditionally open",
  },
  {
    key: "oracle",
    label: "Pyth Price + Confidence",
    detail:
      "Pyth supplies the market observation. circuit validates price freshness and oracle uncertainty before allowing risk-sensitive actions.",
    beat: "Oracle",
    formula: "Conservative bound: p_conservative = max(0, p - conf)",
  },
  {
    key: "market",
    label: "MarketGuard Session",
    detail:
      "Checks whether the observation is usable under market-session policy (Price + Confidence + Session). Distinguishes underlying venue session state from on-chain token availability.",
    beat: "Session",
    formula: "Usability: Fresh ∧ ConfWithinBound ∧ SessionActive",
  },
  {
    key: "ratchet",
    label: "4-State Risk Ratchet",
    detail:
      "Converts market conditions into deterministic protocol states: Safe → Restricted → Defensive → Emergency. Recovery is staged with monotonic hysteresis to prevent abrupt re-enabling.",
    beat: "Ratchet",
    formula: "Recovery Invariant: Emergency ↛ Safe (Staged 5-Epoch Crank)",
  },
  {
    key: "policy",
    label: "Capital Policy Engine",
    detail:
      "Market state becomes an on-chain capital policy. The protocol derives what a position is allowed to do from risk state. Unsafe capital actions fail on-chain.",
    beat: "Policy",
    formula: "Defensive/Emergency: Borrow & Withdraw BLOCKED on-chain",
  },
  {
    key: "credit",
    label: "Programmable Credit",
    detail:
      "Credit is the last step, never the first. Borrow capacity = Collateral Value × Effective LTV − Existing Debt. The frontend estimates power; the program verifies the transaction itself.",
    beat: "Credit",
    formula: "LTV = Debt / Collateral Value (Enforced at tx boundary)",
  },
  {
    key: "recovery",
    label: "Dutch Auction Recovery",
    detail:
      "Unsafe positions recover through bounded collateral auctions. The protocol auctions the exact minimum collateral necessary to restore the position according to policy.",
    beat: "Recovery",
    formula: "P(t) = P_start - [(t - t0)/T] * (P_start - P_floor)",
  },
];

/** Serpentine trace with chamfered corners, expanded for 7 stages across 1040px. */
const TRACE =
  "M120 10 L120 80 L58 142 L58 200 L120 262 L120 420 " +
  "L182 482 L182 540 L120 602 L120 760 L58 822 L58 880 " +
  "L120 942 L120 1025";

/** Where the trace passes each of the 7 stages. */
const STOPS: [number, number][] = [
  [120, 10],
  [58, 175],
  [120, 345],
  [182, 515],
  [120, 685],
  [58, 855],
  [120, 1025],
];

export function CircuitFlow() {
  const section = useRef<HTMLElement>(null);
  const { index } = usePinnedSteps(
    section as React.RefObject<HTMLElement>,
    STAGES.length
  );

  const active = STAGES[index] ?? STAGES[0];

  return (
    <section
      className="sec pin flow"
      id="how"
      ref={section as any}
      style={{ ["--steps" as string]: STAGES.length }}
    >
      <div className="pin__stage">
        <div className="sec__inner flow__inner">
          <header className="flow__head">
            <p className="sec__index">
              <span className="sec__index__n">03</span>
              <span className="sec__index__t">The circuit</span>
            </p>
            <h2 className="sec__title">
              Credit is the last step,
              <br />
              <em>never the first.</em>
            </h2>
          </header>

          <div className="flow__grid">
            <div className="flow__trace" aria-hidden="true">
              <svg viewBox="0 0 240 1040" preserveAspectRatio="xMidYMid meet">
                <path
                  className="flow__wire"
                  d={TRACE}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinejoin="round"
                />
                <path
                  className="flow__charge"
                  d={TRACE}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="1.75"
                  strokeLinejoin="round"
                  pathLength={1}
                />
                {STOPS.map(([x, y], i) => (
                  <g key={STAGES[i].key} transform={`translate(${x} ${y})`}>
                    <circle r="17" className={`flow__pad${i <= index ? " is-on" : ""}`} />
                    <circle r="4.5" className={`flow__dot${i <= index ? " is-on" : ""}`} />
                  </g>
                ))}
              </svg>
            </div>

            <ol className="flow__stages">
              {STAGES.map((s, i) => (
                <li
                  key={s.key}
                  className={
                    "flow__stage" +
                    (i === index ? " is-active" : "") +
                    (i < index ? " is-done" : "")
                  }
                  aria-current={i === index ? "step" : undefined}
                >
                  {/* The rail fills across the active step only, which is the
                      readable signal that scrolling is advancing a sequence. */}
                  <span className="flow__rail" aria-hidden="true">
                    <span className="flow__rail__fill" />
                  </span>
                  <span className="flow__stage__n">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="flow__stage__label">{s.label}</span>
                  <span className="flow__stage__detail">{s.detail}</span>
                  {s.formula && (
                    <code
                      style={{
                        display: "inline-block",
                        marginTop: "8px",
                        fontSize: "11px",
                        fontFamily: "var(--mono)",
                        color: i === index ? "var(--accent)" : "var(--text-3)",
                        background: i === index ? "rgba(207, 173, 116, 0.08)" : "rgba(255, 255, 255, 0.02)",
                        padding: "3px 8px",
                        borderRadius: "4px",
                        border: "1px solid",
                        borderColor: i === index ? "rgba(207, 173, 116, 0.3)" : "rgba(255, 255, 255, 0.06)",
                        transition: "all 0.3s ease",
                      }}
                    >
                      {s.formula}
                    </code>
                  )}
                </li>
              ))}
            </ol>

            <p className="flow__beat" aria-live="polite">
              <span className="flow__beat__word">{active.beat}</span>
              <span className="flow__beat__count">
                {String(index + 1).padStart(2, "0")} / {String(STAGES.length).padStart(2, "0")}
              </span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default CircuitFlow;
