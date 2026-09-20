import React from "react";
import { Link } from "react-router-dom";

import { CircuitWordmark } from "../brand/CircuitLogo";
import { Icon } from "../ui";
import { CLUSTER_LABEL, PROGRAM_ID_STRING, explorerUrl } from "../../env";
import { useTheme } from "../../context/ThemeContext";

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
  const { theme, toggle } = useTheme();

  return (
    <footer className="foot">
      <div className="sec__inner foot__inner">
        <div className="foot__brand">
          <CircuitWordmark size={24} />
          <p className="foot__tag">
            Programmable capital infrastructure for tokenized equities on Solana.
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
                  href="https://github.com/Patel5600/Circuit"
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

      <div className="sec__inner foot__base" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
        <p className="foot__net">
          <span className="dot" aria-hidden="true" />
          Solana {CLUSTER_LABEL}
        </p>
        <button
          type="button"
          onClick={toggle}
          className="theme-toggle"
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          aria-label={`Current mode: ${theme}. Click to switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          <span className="theme-toggle__icon" aria-hidden="true">
            <Icon name={theme === "dark" ? "sun" : "moon"} size={14} />
          </span>
          <span className="theme-toggle__label">
            {theme === "dark" ? "LIGHT MODE" : "DARK MODE"}
          </span>
        </button>
        <p className="foot__note" style={{ width: "100%", margin: "8px 0 0" }}>
          Unaudited software on a test network. Nothing here is an offer, a quote
          or investment advice. Company marks identify the equity each tokenized
          asset tracks and imply no endorsement.
        </p>
      </div>
    </footer>
  );
}

export default LandingFooter;
