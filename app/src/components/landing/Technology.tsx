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
                {mark ? <Mark mark={mark} size={64} tone="brand" /> : null}
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
                  >
                    <span className="flow__rail" aria-hidden="true">
                      <span className="flow__rail__fill" />
                    </span>
                    <span className="tech__item__mark">
                      {m ? <Mark mark={m} size={22} tone={i === index ? "brand" : "mono"} /> : null}
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
              marginTop: "44px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "16px",
              paddingTop: "24px",
              borderTop: "1px solid var(--border)",
            }}
          >
            <div
              style={{
                padding: "18px",
                borderRadius: "4px",
                background: "rgba(255, 255, 255, 0.02)",
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <span style={{ fontSize: "11px", fontFamily: "var(--mono)", color: "var(--text-3)", letterSpacing: "0.08em" }}>
                  CLIENT (FRONTEND)
                </span>
                <span style={{ fontSize: "11px", fontFamily: "var(--mono)", color: "var(--text-3)" }}>
                  ≠ Authority
                </span>
              </div>
              <ul style={{ margin: 0, paddingLeft: "16px", fontSize: "12px", color: "var(--text-2)", lineHeight: 1.7 }}>
                <li>Displays state & estimates borrowing power</li>
                <li>Prepares transaction instructions</li>
                <li>Cannot override on-chain risk gates</li>
              </ul>
            </div>

            <div
              style={{
                padding: "18px",
                borderRadius: "4px",
                background: "rgba(207, 173, 116, 0.04)",
                border: "1px solid rgba(207, 173, 116, 0.25)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <span style={{ fontSize: "11px", fontFamily: "var(--mono)", color: "var(--accent)", letterSpacing: "0.08em" }}>
                  PROGRAM (SOLANA SBF)
                </span>
                <span style={{ fontSize: "11px", fontFamily: "var(--mono)", color: "var(--accent)", fontWeight: 600 }}>
                  = Authority
                </span>
              </div>
              <ul style={{ margin: 0, paddingLeft: "16px", fontSize: "12px", color: "var(--text-1)", lineHeight: 1.7 }}>
                <li>Validates accounts, signer PDAs & vaults</li>
                <li>Evaluates oracle price freshness & uncertainty</li>
                <li>Derives Capital Policy & enforces Effective LTV</li>
                <li>Settles bounded Dutch recovery auctions</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Technology;
