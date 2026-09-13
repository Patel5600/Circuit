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
    label: "Tokenized equity",
    detail: "An SPL token representing a share, held in regulated custody rather than synthetic debt.",
    beat: "Custody",
  },
  {
    key: "oracle",
    label: "Pyth Conservative Price",
    detail: "PriceUpdateV2 evaluated at confidence lower bound (p - conf). Rejects widening uncertainty.",
    beat: "Value",
  },
  {
    key: "market",
    label: "MarketGuard Session",
    detail: "Deterministic on-chain NYSE calendar account gating borrowing across market closes.",
    beat: "Session",
  },
  {
    key: "risk",
    label: "4-State Risk Ratchet",
    detail: "Safe, Restricted, Defensive, Emergency: instant tightening with monotonic 5-step hysteresis recovery.",
    beat: "Ratchet",
  },
  {
    key: "credit",
    label: "Programmable Credit",
    detail: "Transforms market risk directly into on-chain permissions, dynamic LTV, and scaled liquidations.",
    beat: "Permission",
  },
];

/** Serpentine trace with chamfered corners, in a 240-wide band. */
const TRACE =
  "M120 10 L120 96 L120 104 L58 166 L58 264 L58 272 L120 334 L120 432 " +
  "L120 440 L182 502 L182 600 L182 608 L120 670 L120 770";

/** Where the trace passes each stage. */
const STOPS: [number, number][] = [
  [120, 10],
  [58, 215],
  [120, 334],
  [182, 555],
  [120, 770],
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
              <svg viewBox="0 0 240 780" preserveAspectRatio="xMidYMid meet">
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
