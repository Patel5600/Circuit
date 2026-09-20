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

interface FlowStage {
  key: string;
  label: string;
  beat: string;
  detail: string;
  stateHighlight?: string;
  actionsList?: string;
  equations?: boolean;
  postDetail?: string;
}

const STAGES: FlowStage[] = [
  {
    key: "equity",
    label: "Tokenized Equity",
    beat: "Collateral",
    detail:
      "A stock-backed position enters circuit as programmable capital with a canonical asset identity, verified depository backing, and defined ownership.",
  },
  {
    key: "observation",
    label: "Market Observation",
    beat: "Observation",
    detail:
      "Pyth supplies price, confidence, and freshness. circuit validates the observation directly on-chain rather than trusting a client or cached value.",
  },
  {
    key: "marketguard",
    label: "MarketGuard",
    beat: "MarketGuard",
    detail:
      "Oracle validity and market-session conditions become one protocol-level market state. Unsafe or unusable observations cannot authorize additional risk.",
  },
  {
    key: "ratchet",
    label: "Risk Ratchet",
    beat: "Ratchet",
    detail:
      "Market conditions become a deterministic capital state:",
    stateHighlight: "SAFE → RESTRICTED → DEFENSIVE → EMERGENCY",
    postDetail:
      "Recovery is staged monotonically in the opposite direction. Risk is no longer a number displayed to the user. It becomes protocol state.",
  },
  {
    key: "authority",
    label: "Capital Authority",
    beat: "Authority",
    detail:
      "The current risk state determines what capital is allowed to do. Humans decide delegation; autonomous strategies operate only within bounded authority.",
    actionsList: "Borrow. Withdraw. Repay. Deposit. Liquidity.",
    postDetail:
      "Each action is evaluated at the intersection of owner policy, agent authority, active risk state, and on-chain constraints.",
  },
  {
    key: "credit",
    label: "Programmable Credit",
    beat: "Credit",
    detail:
      "Only after those conditions pass does credit or liquidity execution become available.",
    equations: true,
    postDetail:
      "Execution is therefore an output of the system, not the starting point.",
  },
  {
    key: "recovery",
    label: "Recovery",
    beat: "Recovery",
    detail:
      "When conditions deteriorate, risk-increasing authority contracts first. Repayment, deposits, and recovery actions remain available according to policy. Permissions recover gradually through the ratchet.",
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

  const scrollToStep = (stepIndex: number) => {
    if (!section.current) return;
    const rect = section.current.getBoundingClientRect();
    const currentScroll = window.scrollY;
    const sectionTop = currentScroll + rect.top;
    const travel = Math.max(1, rect.height - window.innerHeight);
    const targetY = sectionTop + (stepIndex / (STAGES.length - 1)) * travel * 0.88;
    window.scrollTo({ top: targetY, behavior: "smooth" });
  };

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
            <p
              className="flow__head__desc"
              style={{
                marginTop: "8px",
                color: "var(--text-2)",
                maxWidth: "620px",
                fontSize: "14px",
                lineHeight: "1.5",
                letterSpacing: "-0.01em",
              }}
            >
              Tokenized equity becomes programmable capital only after the protocol understands the market it is operating in.
            </p>
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
                  onClick={() => scrollToStep(i)}
                  title={`Jump to step ${i + 1}: ${s.label}`}
                >
                  <span className="flow__rail" aria-hidden="true">
                    <span className="flow__rail__fill" />
                  </span>
                  <span className="flow__stage__n">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="flow__stage__label">{s.label}</span>
                  <div className="flow__stage__detail">
                    <div>{s.detail}</div>

                    {s.stateHighlight && (
                      <div
                        style={{
                          margin: "6px 0",
                          padding: "4px 8px",
                          background: "var(--surface-2)",
                          border: "1px solid var(--border)",
                          borderRadius: "4px",
                          fontFamily: "var(--mono)",
                          fontSize: "10.5px",
                          fontWeight: 700,
                          letterSpacing: "0.03em",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          flexWrap: "wrap",
                        }}
                      >
                        <span style={{ color: "var(--success, #34d399)" }}>SAFE</span>
                        <span style={{ color: "var(--text-3)" }}>→</span>
                        <span style={{ color: "var(--warning, #fbbf24)" }}>RESTRICTED</span>
                        <span style={{ color: "var(--text-3)" }}>→</span>
                        <span style={{ color: "var(--warning, #f59e0b)" }}>DEFENSIVE</span>
                        <span style={{ color: "var(--text-3)" }}>→</span>
                        <span style={{ color: "var(--danger, #f87171)" }}>EMERGENCY</span>
                      </div>
                    )}

                    {s.actionsList && (
                      <div
                        style={{
                          margin: "6px 0",
                          display: "flex",
                          gap: "6px",
                          flexWrap: "wrap",
                        }}
                      >
                        {["Borrow", "Withdraw", "Repay", "Deposit"].map((act) => (
                          <span
                            key={act}
                            style={{
                              padding: "1px 7px",
                              background: "var(--surface-2)",
                              border: "1px solid var(--border)",
                              borderRadius: "4px",
                              fontSize: "10.5px",
                              fontFamily: "var(--mono)",
                              fontWeight: 600,
                              color: "var(--text)",
                            }}
                          >
                            {act}
                          </span>
                        ))}
                      </div>
                    )}

                    {s.equations && (
                      <div
                        style={{
                          margin: "6px 0",
                          padding: "6px 10px",
                          background: "var(--accent-dim)",
                          border: "1px solid var(--border-strong)",
                          borderRadius: "4px",
                          fontFamily: "var(--mono)",
                          fontSize: "10.5px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ color: "var(--accent, #cfad74)", fontWeight: 700 }}>LTV</span>
                          <span>= Debt / Collateral Value</span>
                        </div>
                        <div>
                          <span style={{ color: "var(--accent, #cfad74)", fontWeight: 700 }}>Borrowable</span>
                          <span> = max(0, Collateral × EffectiveLTV − Debt)</span>
                        </div>
                      </div>
                    )}

                    {s.postDetail && (
                      <div style={{ marginTop: "4px", fontSize: "12px", color: "var(--text-3)" }}>
                        {s.postDetail}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>

            <div className="flow__beat" aria-live="polite">
              <span className="flow__beat__word">{active.beat}</span>
              <span className="flow__beat__count">
                {String(index + 1).padStart(2, "0")} / {String(STAGES.length).padStart(2, "0")}
              </span>

              {/* The Invariant */}
              <div
                style={{
                  marginTop: "14px",
                  padding: "12px 14px",
                  background: "var(--surface-2, #0d0f15)",
                  border: "1px solid var(--border, #1a1d26)",
                  borderRadius: "var(--r, 8px)",
                  borderLeft: "3px solid var(--accent, #cfad74)",
                }}
              >
                <div
                  style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--text-3)",
                    marginBottom: "8px",
                  }}
                >
                  The invariant
                </div>
                <blockquote
                  style={{
                    margin: 0,
                    padding: 0,
                    fontSize: "11.5px",
                    lineHeight: "1.55",
                    color: "var(--text)",
                    border: "none",
                  }}
                >
                  <p style={{ margin: 0 }}>
                    <strong>Market state determines risk.</strong><br />
                    <strong>Risk determines authority.</strong><br />
                    <strong>Authority determines permission.</strong><br />
                    <strong>Permission determines credit.</strong>
                  </p>
                </blockquote>
                <div
                  style={{
                    marginTop: "10px",
                    paddingTop: "8px",
                    borderTop: "1px solid var(--border, #1a1d26)",
                    fontSize: "11px",
                    color: "var(--accent, #cfad74)",
                    fontWeight: 600,
                  }}
                >
                  Credit is the last step, <em>never the first.</em>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default CircuitFlow;
