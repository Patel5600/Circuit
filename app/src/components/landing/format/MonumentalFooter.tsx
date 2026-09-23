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
          AI provides intent. Circuit provides authority. Solana provides enforcement.
        </p>

        {/* Prominent GitHub Repository Action Dock */}
        <div className="lf-footer-actions">
          <a
            href="https://github.com/Patel5600/Circuit"
            target="_blank"
            rel="noreferrer"
            className="lf-footer-github-btn"
            title="View Circuit Protocol source code on GitHub"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            <span style={{ fontWeight: 600, letterSpacing: "-0.01em" }}>GitHub</span>
            <span style={{ opacity: 0.55, fontSize: "12px", fontFamily: "var(--lf-mono, monospace)" }}>Patel5600/Circuit</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
          </a>

          <span className="lf-footer-badge">
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#14F195", boxShadow: "0 0 6px #14F195" }} />
            OPEN SOURCE APACHE-2.0
          </span>
        </div>

        <nav className="lf-footer-links" aria-label="Footer navigation">
          <Link to="/app">Launch Terminal</Link>
          <Link to="/app/markets">Bonding Curves</Link>
          <Link to="/app/borrow">Credit &amp; Borrow</Link>
          <Link to="/app/autonomous">Autonomous Agents</Link>
          <a href="https://github.com/Patel5600/Circuit" target="_blank" rel="noreferrer">
            GitHub Repository ↗
          </a>
          <a href="#hero">Back to Top ↑</a>
        </nav>
      </div>
    </footer>
  );
};
