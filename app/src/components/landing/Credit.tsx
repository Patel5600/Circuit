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
      "Tokenized equity enters a program-controlled position account on Solana. Tokens stay in the protocol vault PDA, never on a company balance sheet.",
  },
  {
    n: "02",
    verb: "Verify",
    body:
      "Price, confidence and market-session conditions are validated before risk-sensitive actions. Stale or uncertain feeds halt new leverage.",
  },
  {
    n: "03",
    verb: "Policy",
    body:
      "The on-chain Capital Policy Engine derives effective LTV and permissions from the 4-State Risk Ratchet. Credit is one trading venue governed by the same unified permission system as liquidity and recovery.",
  },
  {
    n: "04",
    verb: "Borrow",
    body:
      "Credit drawdown is authorized only after passing the canonical Permission Engine gate: Deposit → Verify → Risk → Policy → Permission → Borrow. Unsafe borrowing fails directly at the transaction boundary.",
  },
  {
    n: "05",
    verb: "Recover",
    body:
      "Unsafe positions enter deterministic Dutch auction recovery. The protocol auctions the exact minimum collateral needed to restore health.",
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
            Credit, liquidity provision, and recovery are trading venues governed by one
            canonical Permission Engine. Humans and autonomous strategies operate under identical
            risk invariants, ensuring unsafe transactions are rejected directly on Solana.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

export default Credit;
