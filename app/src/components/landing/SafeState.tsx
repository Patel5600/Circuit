import React, { useRef } from "react";

import { usePinnedSteps } from "../../hooks/useMotion";

/**
 * Section 05 - the safe state.
 *
 * Scroll-pinned, five steps: the three checks clear one per scroll, the circuit
 * closes, and only then do the figures resolve.
 *
 * The numbers are a labelled worked example. There is no wallet on the landing
 * page and therefore no position to read, so presenting them as a balance would
 * be a fabrication. They are arithmetic on a round number at this asset's stated
 * 70% loan-to-value and 80% liquidation threshold, and the caption says exactly
 * that rather than burying it.
 */

const CHECKS = [
  {
    key: "oracle",
    label: "Pyth Oracle",
    value: "Fresh, validated within staleness bound",
  },
  {
    key: "confidence",
    label: "Confidence Interval",
    value: "Uncertainty within tolerance bound",
  },
  {
    key: "market",
    label: "MarketGuard Session",
    value: "Venue in regular session",
  },
  {
    key: "policy",
    label: "Capital Policy",
    value: "Safe state: full credit permissions active",
  },
];

const FIGURES = [
  {
    key: "collateral",
    label: "Collateral Value",
    value: "$10,000",
    note: "Deposited tokenized equity, valued at verified oracle price",
  },
  {
    key: "ltv",
    label: "Effective LTV",
    value: "70.0%",
    note: "Derived from active on-chain Capital Policy",
  },
  {
    key: "power",
    label: "Borrow Capacity",
    value: "$7,000",
    note: "Collateral Value × Effective LTV − Debt ($0)",
  },
  {
    key: "health",
    label: "Health factor",
    value: "1.42",
    note: "80% liquidation threshold against full 70% utilisation",
  },
];

const STEPS = CHECKS.length + 2;

export function SafeState() {
  const section = useRef<HTMLElement>(null);
  const { index } = usePinnedSteps(section as React.RefObject<HTMLElement>, STEPS);

  const safe = index >= CHECKS.length;
  const figures = index >= CHECKS.length + 1;

  const scrollToStep = (stepIndex: number) => {
    if (!section.current) return;
    const rect = section.current.getBoundingClientRect();
    const currentScroll = window.scrollY;
    const sectionTop = currentScroll + rect.top;
    const travel = Math.max(1, rect.height - window.innerHeight);
    const targetY = sectionTop + (stepIndex / (STEPS - 1)) * travel * 0.88;
    window.scrollTo({ top: targetY, behavior: "smooth" });
  };

  return (
    <section
      className={`sec pin safe${safe ? " is-safe" : ""}${figures ? " is-out" : ""}`}
      ref={section as any}
      style={{ ["--steps" as string]: STEPS }}
    >
      <div className="pin__stage">
        <div className="sec__inner">
          <p className="sec__index">
            <span className="sec__index__n">05</span>
            <span className="sec__index__t">Safe state</span>
          </p>
          <h2 className="sec__title">
            Every input agrees.
            <br />
            <em>The circuit closes.</em>
          </h2>
          <p
            style={{
              marginTop: "8px",
              fontFamily: "var(--mono)",
              fontSize: "12px",
              letterSpacing: "0.04em",
              color: "var(--accent)",
            }}
          >
            Verified market inputs + Current risk state + Capital policy = Available credit
          </p>

          <div className="safe__body">
            <div>
              <ul className="safe__checks">
                {CHECKS.map((c, i) => (
                  <li
                    key={c.key}
                    className={
                      "safe__check" +
                      (i === index ? " is-active" : "") +
                      (i <= index ? " is-on" : "")
                    }
                    onClick={() => scrollToStep(i)}
                    title={`Jump to check: ${c.label}`}
                  >
                    <span className="flow__rail" aria-hidden="true">
                      <span className="flow__rail__fill" />
                    </span>
                    <span className="safe__check__mark" aria-hidden="true">
                      <svg viewBox="0 0 24 24" width="15" height="15">
                        <path
                          d="M4.5 12.6l4.8 4.8L19.6 7"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <span className="safe__check__label">{c.label}</span>
                    <span className="safe__check__value">{c.value}</span>
                    <span className="safe__check__state">
                      {i <= index ? "Pass" : "Checking"}
                    </span>
                  </li>
                ))}
              </ul>

              <p className="safe__word" aria-live="polite">
                Safe
              </p>
            </div>

            <div className="safe__out">
              <div
                style={{
                  marginBottom: "14px",
                  fontSize: "11px",
                  fontFamily: "var(--mono)",
                  color: "var(--accent)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                ✦ Illustrative Arithmetic · Not Live Position ✦
              </div>
              <dl className="safe__figures">
                {FIGURES.map((f) => (
                  <div key={f.key} className="safe__figure">
                    <dt>{f.label}</dt>
                    <dd>{f.value}</dd>
                    <p>{f.note}</p>
                  </div>
                ))}
              </dl>
              <p className="safe__caption">
                Worked example. Illustrative arithmetic under configured capital policy parameters,
                not a live position and not a quote. Real figures appear in the app, read from chain
                against your own wallet.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default SafeState;
