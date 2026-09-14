import React, { useEffect, useRef } from "react";
import { Link } from "react-router-dom";

import { Nav } from "../components/landing/Nav";
import { HeroPipeline } from "../components/landing/HeroPipeline";
import { AssetUniverse } from "../components/landing/AssetUniverse";
import { PythEvidenceGate } from "../components/landing/PythEvidenceGate";
import { MarketGuardSection } from "../components/landing/MarketGuardSection";
import { RiskRatchetSection } from "../components/landing/RiskRatchetSection";
import { ProgrammableCreditSection } from "../components/landing/ProgrammableCreditSection";
import { LiveProofSection } from "../components/landing/LiveProofSection";
import { WhyCircuitSection } from "../components/landing/WhyCircuitSection";
import { FinalCTA } from "../components/landing/FinalCTA";
import { LandingFooter } from "../components/landing/LandingFooter";
import { Icon } from "../components/ui";
import { CLUSTER_LABEL } from "../env";

/**
 * Public Landing Page for Circuit Protocol.
 * 
 * CORE PRINCIPLE:
 * "CREDIT IS THE LAST STEP, NEVER THE FIRST."
 * 
 * SECTION 01: Hero & Cinematic 5-Stage Architecture Pipeline
 * SECTION 02: The Input (Tokenized Equity)
 * SECTION 03: The Evidence (Pyth Conservative Price: p - conf)
 * SECTION 04: The Guard (MarketGuard Session: NYSE Calendar Decoupled)
 * SECTION 05: The Ratchet (4-State Risk Ratchet Flagship State Machine)
 * SECTION 06: The Consequence (Programmable Credit: Downstream Output)
 * SECTION 07: Live Proof & Failure Path (Pure Live Devnet Telemetry)
 * SECTION 08: Why Circuit ("Risk determines what capital is allowed to do")
 * SECTION 09: Final Call to Action (Explore Circuit / Launch App)
 */

export default function Landing() {
  const hero = useRef<HTMLElement>(null);

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
      {/* Background layer: void, atmospheric depth */}
      <div className="lp__void" aria-hidden="true" />

      <a href="#main" className="lp__skip">
        Skip to content
      </a>

      <Nav />

      <main id="main">
        {/* SECTION 01: HERO & CINEMATIC PIPELINE */}
        <section className="hero hero--cinematic" id="pipeline" ref={hero as any}>
          <div className="hero__inner">
            <div className="hero__copy">
              <p className="hero__eyebrow">
                <span className="dot" aria-hidden="true" />
                Solana Devnet · Programmable Risk Ratchet Primitive
              </p>

              <h1 className="hero__title">
                CREDIT IS THE LAST STEP,
                <br />
                <em>NEVER THE FIRST.</em>
              </h1>

              <p className="hero__lede">
                circuit turns tokenized equities into risk-aware programmable collateral, where market conditions determine what capital is allowed to do.
              </p>

              <div className="hero__cta">
                <a href="#equity" className="btn btn--primary btn--lg">
                  Explore Circuit
                  <Icon name="arrowRight" size={17} />
                </a>
                <Link to="/app" className="btn btn--secondary btn--lg">
                  Launch App
                </Link>
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
                  4-State Ratchet
                </li>
              </ul>
            </div>

            {/* Semantic SVG 5-Stage Architecture Visual Pipeline */}
            <div className="hero__pipeline-container">
              <HeroPipeline />
            </div>
          </div>
        </section>

        {/* SECTION 02: THE INPUT (Tokenized Equity) */}
        <AssetUniverse />

        {/* SECTION 03: THE EVIDENCE (Pyth Conservative Price) */}
        <PythEvidenceGate />

        {/* SECTION 04: THE GUARD (MarketGuard Session) */}
        <MarketGuardSection />

        {/* SECTION 05: THE RATCHET (4-State Risk Ratchet) */}
        <RiskRatchetSection />

        {/* SECTION 06: THE CONSEQUENCE (Programmable Credit) */}
        <ProgrammableCreditSection />

        {/* SECTION 07: LIVE PROOF (Current Devnet System & Failure Path) */}
        <LiveProofSection />

        {/* SECTION 08: WHY CIRCUIT */}
        <WhyCircuitSection />

        {/* SECTION 09: FINAL CTA */}
        <FinalCTA />
      </main>

      <LandingFooter />
    </div>
  );
}
