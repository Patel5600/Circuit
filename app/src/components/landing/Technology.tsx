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
    line: "Execution and settlement. Sub-second finality is what makes checking a price on every single action practical rather than aspirational.",
  },
  {
    key: "PYTH",
    name: "Pyth",
    role: "Price",
    line: "Price feeds read on chain as PriceUpdateV2 accounts, carrying publisher confidence alongside the value so the program can judge quality, not just magnitude.",
  },
  {
    key: "RUST",
    name: "Rust",
    role: "Program",
    line: "The program is Rust with checked arithmetic throughout. There is no unchecked cast anywhere in the risk path.",
  },
  {
    key: "ANCHOR",
    name: "Anchor",
    role: "Accounts",
    line: "Account validation and PDA derivation are declared rather than described, so the constraints are part of the type and not part of the prose.",
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
        </div>
      </div>
    </section>
  );
}

export default Technology;
