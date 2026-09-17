import React, { useRef } from "react";

import { LOGOS } from "../../data/logos";
import { usePinnedSteps } from "../../hooks/useMotion";
import { Mark } from "../ui/BrandMark";

/**
 * Section 07 - technical credibility.
 *
 * Scroll-pinned, one dependency per scroll. Four items with one sentence each,
 * stepped rather than dumped, so the section reads at the same pace as the ones
 * around it instead of collapsing into a logo wall.
 *
 * Marks are brand-coloured here because there are only four of them and each is
 * doing identification work. The 22-asset catalogue in section 02 stays
 * monochrome, where colour would read as noise.
 */

const STACK = [
  {
    key: "SOLANA",
    name: "Solana",
    role: "Settlement",
    line: "Execution and settlement. Sub-second finality is what makes checking a price and deriving capital policy on every single action practical rather than aspirational.",
  },
  {
    key: "PYTH",
    name: "Pyth",
    role: "Price",
    line: "Price feeds read on-chain as PriceUpdateV2 accounts, carrying publisher confidence alongside the value so the program can evaluate oracle uncertainty, not just price.",
  },
  {
    key: "METEORA",
    name: "Meteora",
    role: "Liquidity",
    line: "Dynamic Bonding Curves provide continuous secondary liquidity for tokenized equity assets, governed atomically through Circuit's on-chain permission boundary and risk ratchet.",
  },
  {
    key: "RUST",
    name: "Rust",
    role: "Program",
    line: "The program is Rust with checked arithmetic throughout. Evaluates Capital Policy, enforces Effective LTV, and settles Dutch auctions with zero floating-point math.",
  },
  {
    key: "ANCHOR",
    name: "Anchor",
    role: "Accounts",
    line: "Account validation and PDA derivation are declared in types, guaranteeing strict non-custodial isolation and canonical signer authority.",
  },
];

export function Technology() {
  const section = useRef<HTMLElement>(null);
  const { index } = usePinnedSteps(
    section as React.RefObject<HTMLElement>,
    STACK.length
  );

  const active = STACK[index] ?? STACK[0];
  const mark = LOGOS[active.key];

  const scrollToStep = (stepIndex: number) => {
    if (!section.current) return;
    const rect = section.current.getBoundingClientRect();
    const currentScroll = window.scrollY;
    const sectionTop = currentScroll + rect.top;
    const travel = Math.max(1, rect.height - window.innerHeight);
    const targetY = sectionTop + (stepIndex / (STACK.length - 1)) * travel * 0.88;
    window.scrollTo({ top: targetY, behavior: "smooth" });
  };

  return (
    <section
      className="sec pin tech"
      id="technology"
      ref={section as any}
      style={{ ["--steps" as string]: STACK.length }}
    >
      <div className="pin__stage">
        <div className="sec__inner">
          <p className="sec__index">
            <span className="sec__index__n">07</span>
            <span className="sec__index__t">Technology</span>
          </p>
          <h2 className="sec__title">
            Built to be verified,
            <br />
            <em>not to be trusted.</em>
          </h2>

          <div className="tech__body">
            {/* The active dependency, held large. */}
            <div className="tech__focus" aria-live="polite">
              <span className="tech__focus__mark" key={active.key}>
                {mark ? <Mark mark={mark} size={48} tone="brand" /> : null}
              </span>
              <p className="tech__focus__role">{active.role}</p>
              <h3 className="tech__focus__name">{active.name}</h3>
              <p className="tech__focus__line">{active.line}</p>
            </div>

            {/* The full list, with the active row raised. */}
            <ol className="tech__list">
              {STACK.map((s, i) => {
                const m = LOGOS[s.key];
                return (
                  <li
                    key={s.key}
                    className={
                      "tech__item" +
                      (i === index ? " is-active" : "") +
                      (i < index ? " is-done" : "")
                    }
                    aria-current={i === index ? "step" : undefined}
                    onClick={() => scrollToStep(i)}
                    title={`Jump to technology: ${s.name}`}
                  >
                    <span className="flow__rail" aria-hidden="true">
                      <span className="flow__rail__fill" />
                    </span>
                    <span className="tech__item__mark">
                      {m ? <Mark mark={m} size={20} tone={i === index ? "brand" : "mono"} /> : null}
                    </span>
                    <span className="tech__item__name">{s.name}</span>
                    <span className="tech__item__role">{s.role}</span>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* Authority Boundary Matrix */}
          <div
            style={{
              marginTop: "16px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: "10px",
              paddingTop: "12px",
              borderTop: "1px solid var(--border)",
            }}
          >
            <div
              style={{
                padding: "8px 12px",
                borderRadius: "4px",
                background: "rgba(255, 255, 255, 0.02)",
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <span style={{ fontSize: "10.5px", fontFamily: "var(--mono)", color: "var(--text-3)", letterSpacing: "0.08em", fontWeight: 650 }}>
                  CLIENT (FRONTEND)
                </span>
                <span style={{ fontSize: "10.5px", fontFamily: "var(--mono)", color: "var(--text-3)" }}>
                  ≠ Authority
                </span>
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-2)", lineHeight: 1.45 }}>
                Displays state & prepares tx · Cannot override on-chain risk gates
              </div>
            </div>

            <div
              style={{
                padding: "8px 12px",
                borderRadius: "4px",
                background: "rgba(207, 173, 116, 0.04)",
                border: "1px solid rgba(207, 173, 116, 0.25)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <span style={{ fontSize: "10.5px", fontFamily: "var(--mono)", color: "var(--accent)", letterSpacing: "0.08em", fontWeight: 650 }}>
                  PROGRAM (SOLANA SBF)
                </span>
                <span style={{ fontSize: "10.5px", fontFamily: "var(--mono)", color: "var(--accent)", fontWeight: 700 }}>
                  = Authority
                </span>
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-1)", lineHeight: 1.45 }}>
                Dynamic Risk Engine · Canonical Permission Engine · Agent Authority PDA · Meteora DBC Atomic CPI
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Technology;
