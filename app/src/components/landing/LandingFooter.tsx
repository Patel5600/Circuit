import React from "react";
import { Link } from "react-router-dom";

import { CircuitWordmark } from "../brand/CircuitLogo";
import { CLUSTER_LABEL, PROGRAM_ID_STRING, explorerUrl } from "../../env";

/**
 * Minimal footer.
 *
 * Uses PROGRAM_ID_STRING from env.ts rather than the parsed key from config.ts,
 * which is what keeps web3.js and the IDL out of the landing bundle entirely.
 */

const COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Markets", href: "#markets" },
      { label: "The Circuit", href: "#how" },
      { label: "Credit", href: "#product" },
      { label: "Technology", href: "#technology" },
      { label: "Economics", href: "#economics" },
    ],
  },
];

export function LandingFooter() {
  return (
    <footer className="foot">
      <div className="sec__inner foot__inner">
        <div className="foot__brand">
          <CircuitWordmark size={24} />
          <p className="foot__tag">
            Credit infrastructure for tokenized equities on Solana.
          </p>
        </div>

        <nav className="foot__cols" aria-label="Footer">
          {COLUMNS.map((c) => (
            <div key={c.title} className="foot__col">
              <h2 className="foot__col__title">{c.title}</h2>
              <ul>
                {c.links.map((l) => (
                  <li key={l.label}>
                    <a href={l.href}>{l.label}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="foot__col">
            <h2 className="foot__col__title">Verify</h2>
            <ul>
              <li>
                <Link to="/verify">Verification</Link>
              </li>
              <li>
                <a
                  href={explorerUrl("address", PROGRAM_ID_STRING)}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Explorer
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  GitHub
                </a>
              </li>
            </ul>
          </div>

          <div className="foot__col">
            <h2 className="foot__col__title">Learn</h2>
            <ul>
              <li>
                <Link to="/learn">Documentation</Link>
              </li>
              <li>
                <Link to="/app">Launch app</Link>
              </li>
            </ul>
          </div>
        </nav>
      </div>

      <div className="sec__inner foot__base">
        <p className="foot__net">
          <span className="dot" aria-hidden="true" />
          Solana {CLUSTER_LABEL}
        </p>
        <p className="foot__note">
          Unaudited software on a test network. Nothing here is an offer, a quote
          or investment advice. Company marks identify the equity each tokenized
          asset tracks and imply no endorsement.
        </p>
      </div>
    </footer>
  );
}

export default LandingFooter;
