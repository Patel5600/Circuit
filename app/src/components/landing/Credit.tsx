import React from "react";

import { Reveal } from "../ui/Reveal";

/**
 * Section 06 - the product, in three moves.
 *
 * Deliberately spare. Three lines of type, three sentences, one hairline rule
 * between them. No card grid: the earlier sections have already carried the
 * visual load, and this one exists to be read.
 */

const MOVES = [
  {
    n: "01",
    verb: "Deposit",
    body:
      "Move tokenized equity into a position account you control. The tokens stay in a program vault, not on a balance sheet.",
  },
  {
    n: "02",
    verb: "Verify",
    body:
      "Before anything else happens, the price is checked for age and confidence and the venue is checked for session state.",
  },
  {
    n: "03",
    verb: "Borrow",
    body:
      "Draw stable liquidity against the verified value, up to the loan-to-value ceiling configured for that asset.",
  },
];

export function Credit() {
  return (
    <section className="sec credit" id="product">
      <div className="sec__inner">
        <Reveal>
          <p className="sec__index">
            <span className="sec__index__n">06</span>
            <span className="sec__index__t">Credit</span>
          </p>
          <h2 className="sec__title">
            How credit works
            <br />
            <em>on circuit.</em>
          </h2>
        </Reveal>

        <ol className="credit__moves">
          {MOVES.map((m, i) => (
            <Reveal key={m.n} as="li" className="credit__move" delay={i * 90}>
              <span className="credit__move__n">{m.n}</span>
              <h3 className="credit__move__verb">{m.verb}</h3>
              <p className="credit__move__body">{m.body}</p>
            </Reveal>
          ))}
        </ol>

        <Reveal>
          <p className="credit__foot">
            Repaying and withdrawing run the same checks in reverse. Positions
            that fall below their liquidation threshold can be closed by anyone,
            which is what keeps the pool solvent without an operator.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

export default Credit;
