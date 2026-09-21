import React from "react";
import { Link } from "react-router-dom";

interface MonumentalFooterProps {
  liveSlot: number;
}

export const MonumentalFooter: React.FC<MonumentalFooterProps> = ({ liveSlot }) => {
  return (
    <footer className="lf-footer">
      <div className="lf-footer-wm" aria-label="CIRCUIT wordmark">
        <svg viewBox="0 0 1200 240" fill="none" xmlns="http://www.w3.org/2000/svg" role="img">
          <text
            x="50%"
            y="76%"
            textAnchor="middle"
            fill="currentColor"
            fontSize="210"
            fontWeight="700"
            letterSpacing="-0.06em"
            fontFamily="inherit"
          >
            CIRCUIT
          </text>
        </svg>
      </div>

      <div className="lf-footer-meta">
        <p>
          CIRCUIT PROTOCOL // AUTONOMOUS INVARIANT RISK ENGINE // SOLANA DEVNET SLOT: {liveSlot > 0 ? liveSlot : 324189004}
        </p>
        <p>
          Deterministic bounded-loss capital allocation. Non-custodial programmatic vault architecture.
        </p>
        <nav className="lf-footer-links" aria-label="Footer navigation">
          <Link to="/app">Launch Terminal</Link>
          <Link to="/app/markets">Bonding Curves</Link>
          <Link to="/app/borrow">Credit &amp; Borrow</Link>
          <Link to="/app/autonomous">Autonomous Agents</Link>
          <a href="https://github.com/Patel5600/Circuit" target="_blank" rel="noreferrer">
            GitHub Repository
          </a>
          <a href="#hero">Back to Top ↑</a>
        </nav>
      </div>
    </footer>
  );
};
