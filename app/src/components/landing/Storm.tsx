import React, { useRef } from "react";

import { usePinnedSteps } from "../../hooks/useMotion";

/**
 * Section 04 - the storm.
 *
 * Scroll-pinned, four steps: each failure condition arrives on its own scroll,
 * then the circuit opens and the verdict lands.
 *
 * The environment stays black throughout. Refusal is carried by a broken trace,
 * by the word BLOCKED and by the error identifier the program actually returns -
 * not by turning the page red. The danger token appears only as a hairline on the
 * fault glyphs, and never as the sole signal.
 */

const FAULTS = [
  {
    key: "stale",
    label: "Oracle stale",
    detail: "The newest price update is older than the max oracle age bound.",
    code: "StaleOracle",
  },
  {
    key: "confidence",
    label: "Confidence too wide",
    detail: "Oracle uncertainty interval exceeds the asset threshold (e.g. > 50 bps).",
    code: "ConfidenceTooWide",
  },
  {
    key: "closed",
    label: "Market session closed",
    detail: "The underlying equity venue is not in regular session; off-hours borrowing gated.",
    code: "MarketClosed",
  },
  {
    key: "policy",
    label: "Capital policy violation",
    detail: "Operation rejected: active risk ratchet state blocks new risk-increasing leverage.",
    code: "CapitalPolicyBlocked",
  },
];

const STEPS = FAULTS.length + 1;

export function Storm() {
  const section = useRef<HTMLElement>(null);
  const { index } = usePinnedSteps(section as React.RefObject<HTMLElement>, STEPS);

  const blocked = index >= FAULTS.length;

  return (
    <section
      className={`sec pin storm${blocked ? " is-blocked" : ""}`}
      id="risk"
      ref={section as any}
      style={{ ["--steps" as string]: STEPS }}
    >
      <div className="pin__stage">
        <div className="sec__inner">
          <p className="sec__index">
            <span className="sec__index__n">04</span>
            <span className="sec__index__t">Refusal</span>
          </p>
          <h2 className="sec__title">
            When the inputs stop agreeing,
            <br />
            <em>the transaction stops.</em>
          </h2>

          <div className="storm__body">
            <ol className="storm__faults">
              {FAULTS.map((f, i) => (
                <li
                  key={f.key}
                  className={
                    "storm__fault" +
                    (i === index ? " is-active" : "") +
                    (i <= index ? " is-on" : "")
                  }
                >
                  <span className="flow__rail" aria-hidden="true">
                    <span className="flow__rail__fill" />
                  </span>
                  <span className="storm__fault__mark" aria-hidden="true">
                    {/* A shape, not just a colour, so the state survives
                        greyscale and colour-blind viewing. */}
                    <svg viewBox="0 0 24 24" width="16" height="16">
                      <path
                        d="M12 3.2 22.2 20.4H1.8L12 3.2Z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                      />
                      <path
                        d="M12 9.4v4.6"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      />
                      <circle cx="12" cy="16.8" r="0.95" fill="currentColor" />
                    </svg>
                  </span>
                  <span className="storm__fault__label">{f.label}</span>
                  <span className="storm__fault__detail">{f.detail}</span>
                  <code className="storm__fault__code">{f.code}</code>
                </li>
              ))}
            </ol>

            <div className="storm__side">
              {/* The break: a trace that stops short of its terminal. */}
              <div className="storm__break" aria-hidden="true">
                <svg viewBox="0 0 320 120" preserveAspectRatio="xMidYMid meet">
                  <path d="M4 60H120" stroke="currentColor" strokeWidth="1.25" fill="none" />
                  <path
                    d="M200 60H316"
                    stroke="currentColor"
                    strokeWidth="1.25"
                    strokeOpacity="0.3"
                    fill="none"
                  />
                  <g className="storm__gap">
                    <path d="M120 60h14" stroke="currentColor" strokeWidth="1.25" />
                    <path
                      d="M186 60h14"
                      stroke="currentColor"
                      strokeWidth="1.25"
                      strokeOpacity="0.3"
                    />
                    <path
                      d="M138 44v32M182 44v32"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                    />
                  </g>
                </svg>
              </div>

              <div className="storm__verdict" aria-live="polite">
                <p className="storm__verdict__kicker">Risk-increasing action</p>
                <p className="storm__verdict__word">Blocked on-chain.</p>
                <p className="storm__verdict__note">
                  This is not a warning banner. The program refuses the state-changing instruction.
                  Borrowing and withdrawing are refused while any input is unusable or capital policy restricts risk.
                  Repaying and depositing remain unconditionally open because both reduce risk.
                </p>
                <div
                  style={{
                    marginTop: "16px",
                    padding: "10px 14px",
                    borderRadius: "4px",
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid var(--border)",
                    fontFamily: "var(--mono)",
                    fontSize: "11px",
                    lineHeight: 1.6,
                    color: "var(--text-2)",
                  }}
                >
                  <div style={{ color: "var(--text-3)", marginBottom: "4px", fontSize: "10px", letterSpacing: "0.08em" }}>
                    PIPELINE ENFORCEMENT
                  </div>
                  <div>MARKET INPUT → GUARD → POLICY → TRANSACTION</div>
                  <div style={{ color: "var(--accent)", marginTop: "4px" }}>
                    Borrow request + Unsafe state = TRANSACTION REJECTED
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Storm;
