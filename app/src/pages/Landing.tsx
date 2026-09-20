import React, { useEffect, useRef } from "react";
import { Link } from "react-router-dom";

import { AssetUniverse } from "../components/landing/AssetUniverse";
import { CircuitFlow } from "../components/landing/CircuitFlow";
import { Credit } from "../components/landing/Credit";
import { FinalCTA } from "../components/landing/FinalCTA";
import { HeroOrbit } from "../components/landing/HeroOrbit";
import { LandingFooter } from "../components/landing/LandingFooter";
import { Nav } from "../components/landing/Nav";
import { SafeState } from "../components/landing/SafeState";
import { AutonomousLayer } from "../components/landing/AutonomousLayer";
import { Storm } from "../components/landing/Storm";
import { Technology } from "../components/landing/Technology";
import { Economics } from "../components/landing/Economics";
import { Icon } from "../components/ui";
import { CLUSTER_LABEL } from "../env";

/**
 * The public landing page.
 *
 * LAYOUT CONTRACT
 * The hero is two regions that never negotiate. The copy is a normal block of
 * fixed width starting at the page gutter, and the orbit is a separate layer
 * masked so it paints nothing across that column - see --veil-clear in
 * styles.css. Because the overlap region is literally unpainted rather than
 * merely behind, the text cannot be obscured and no z-index is load-bearing.
 *
 * ALIGNMENT
 * The hero alone is flush left, which is what makes its asymmetry read. Every
 * section below it uses the normal centred measure.
 *
 * BUNDLE
 * Nothing here is lazy and nothing here is heavy. The hero visual is DOM and CSS,
 * so the page has no WebGL dependency and no 800KB deferred chunk; and nothing on
 * this page imports config.ts, which keeps web3.js and the IDL out too.
 */

export default function Landing() {
  const hero = useRef<HTMLElement>(null);

  // Anchor links must not land underneath the floating header. Read from --nav-h
  // rather than hardcoded, so this cannot drift out of step with the nav's height.
  useEffect(() => {
    const root = document.documentElement;
    const prev = root.style.scrollPaddingTop;
    const navH =
      getComputedStyle(hero.current ?? root).getPropertyValue("--nav-h").trim() ||
      "58px";
    root.style.scrollPaddingTop = `calc(${navH} + 20px)`;
    return () => {
      root.style.scrollPaddingTop = prev;
    };
  }, []);

  return (
    <div className="lp">
      {/* Background layer: void, haze and grain. Fixed, so the atmosphere does
          not scroll away from the content. */}
      <div className="lp__void" aria-hidden="true" />

      <a href="#main" className="lp__skip">
        Skip to content
      </a>

      <Nav />

      <main id="main">
        <section className="hero" ref={hero as any}>
          {/* The visual region. Clipped and feathered on its left edge so the
              mechanism can never reach the copy column. */}
          <div className="hero__visual">
            <HeroOrbit />
          </div>

          <div className="hero__inner">
            <div className="hero__copy">
              <p className="hero__eyebrow">
                <span className="dot" aria-hidden="true" />
                Solana Devnet · Programmable Capital Infrastructure
              </p>

              <h1 className="hero__title">
                Tokenized stocks are assets.
                <br />
                circuit makes them
                <br />
                <em>programmable capital.</em>
              </h1>

              <p className="hero__lede">
                circuit turns verified market conditions into enforceable capital permissions for credit, liquidity and recovery—enabling humans and autonomous agents to execute strictly within mathematical risk boundaries.
              </p>

              <p style={{ margin: "10px 0 0", fontSize: "14px", color: "var(--text-3)", lineHeight: 1.5 }}>
                Market state changes what capital is allowed to do.
              </p>

              <div className="hero__cta">
                <Link to="/app" className="btn btn--primary btn--lg">
                  Launch circuit
                  <Icon name="arrowRight" size={17} />
                </Link>
                <a href="#how" className="btn btn--ghost btn--lg">
                  Explore Mechanism
                </a>
              </div>

              {/* Subtle mechanism cue */}
              <div
                style={{
                  marginTop: "20px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "6px 12px",
                  borderRadius: "4px",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  fontFamily: "var(--mono)",
                  fontSize: "11px",
                  color: "var(--text-2)",
                  letterSpacing: "0.06em",
                }}
              >
                <span>MARKET</span>
                <span style={{ color: "var(--accent)" }}>→</span>
                <span>RISK</span>
                <span style={{ color: "var(--accent)" }}>→</span>
                <span>PERMISSION</span>
                <span style={{ color: "var(--accent)" }}>→</span>
                <span style={{ color: "var(--text)" }}>EXECUTION</span>
              </div>

              <ul className="hero__status">
                <li>
                  <span className="dot" aria-hidden="true" />
                  Deployed on Solana
                </li>
                <li>
                  <span className="dot" aria-hidden="true" />
                  {CLUSTER_LABEL}
                </li>
                <li>
                  <span className="dot" aria-hidden="true" />
                  Autonomous Agent Runtime
                </li>
                <li>
                  <span className="dot" aria-hidden="true" />
                  4-State Ratchet
                </li>
              </ul>
            </div>
          </div>

          <p className="hero__vlabel" aria-hidden="true">
            Market → Risk → Permission → Execution
          </p>
          <p className="hero__scroll" aria-hidden="true">
            Scroll
          </p>
        </section>

        <AssetUniverse />
        <CircuitFlow />
        <Storm />
        <SafeState />
        <AutonomousLayer />
        <Credit />
        <Technology />
        <Economics />
        <FinalCTA />
      </main>

      <LandingFooter />
    </div>
  );
}
