import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { InkTrailSection } from "./InkTrailSection";
import { DialFieldHero } from "./DialFieldHero";
import { ColourRevealSection } from "./ColourRevealSection";
import { InertiaRibbonSection } from "./InertiaRibbonSection";
import { ScrollMorphSection } from "./ScrollMorphSection";
import { ManifestoAndRing } from "./ManifestoAndRing";
import { ClockAndTiltedStack } from "./ClockAndTiltedStack";
import { ScatterCanvas } from "./ScatterCanvas";
import { MonumentalFooter } from "./MonumentalFooter";
import { GlobalMenuOverlay } from "./GlobalMenuOverlay";
import { ThemeWipeDial } from "./ThemeWipeDial";

export const LandingFormat: React.FC = () => {
  const [liveSlot, setLiveSlot] = useState(324189004);
  const [menuOpen, setMenuOpen] = useState(false);
  const [originPos, setOriginPos] = useState({ x: 0, y: 0 });
  const menuBtnRef = useRef<HTMLButtonElement | null>(null);

  const simpleMode = false;

  // Gentle local slot ticker (1 tick per 400ms typical Solana block time) without hitting RPC
  useEffect(() => {
    const timer = setInterval(() => {
      setLiveSlot(s => s + 1);
    }, 400);
    return () => clearInterval(timer);
  }, []);

  const handleOpenMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (menuBtnRef.current) {
      const b = menuBtnRef.current.getBoundingClientRect();
      setOriginPos({ x: b.left + b.width / 2, y: b.top + b.height / 2 });
    } else {
      setOriginPos({ x: e.clientX, y: e.clientY });
    }
    setMenuOpen(true);
  };

  return (
    <div className="lf-root">
      {/* ── SHARED PROCEDURAL SVG FILTERS (Keep once per page) ── */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
        {/* Procedural black ink turbulence filter */}
        <filter id="ink-b" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.008 0.014" numOctaves="3" seed="4" />
          <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 14 -7.2" />
        </filter>

        {/* Procedural white ink turbulence filter */}
        <filter id="ink-w" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.008 0.014" numOctaves="3" seed="9" />
          <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 14 -7.2" />
        </filter>

        {/* Vertical-only downward drip displacement filter for melting headline */}
        <filter id="melt-f" x="-10%" y="-20%" width="120%" height="240%" colorInterpolationFilters="sRGB">
          <feTurbulence id="melt-t" type="fractalNoise" baseFrequency="0.012 0.03" numOctaves="2" seed="3" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 .5  0 .7 0 0 .05  0 0 0 0 0  0 0 0 0 1" result="n2" />
          <feDisplacementMap id="melt-d" in="SourceGraphic" in2="n2" scale="0" xChannelSelector="R" yChannelSelector="G" />
        </filter>

        {/* Dynamic generative filter */}
        <filter id="lab-f" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence id="lab-t" type="fractalNoise" baseFrequency="0.016 0.028" numOctaves="3" seed="11" />
          <feColorMatrix id="lab-m" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 14 -7.2" />
        </filter>
      </svg>

      {/* ── STICKY TOP BAR ── */}
      <header className="lf-bar" role="banner">
        <div className="lf-bar-l">
          <Link to="/" className="lf-bar-brand">
            CIRCUIT
          </Link>
        </div>

        <div className="lf-bar-r">
          <ThemeWipeDial />
          <button
            ref={menuBtnRef}
            type="button"
            className="lf-pill lf-pill-btn lf-bar-menu-btn"
            id="menu-open"
            aria-expanded={menuOpen}
            aria-controls="menu-ov"
            onClick={handleOpenMenu}
            title="Open navigation menu"
          >
            Menu
          </button>
          <Link to="/app" className="lf-pill lf-pill--fill lf-bar-cta lf-pill-btn">
            <span className="lf-pill-full">Launch Terminal →</span>
            <span className="lf-pill-short">Terminal →</span>
          </Link>
        </div>
      </header>

      {/* ── GLOBAL FULLSCREEN MENU OVERLAY (format-kit-3) ── */}
      <GlobalMenuOverlay
        isOpen={menuOpen}
        onClose={() => {
          setMenuOpen(false);
          menuBtnRef.current?.focus({ preventScroll: true });
        }}
        origin={originPos}
        liveSlot={liveSlot}
      />

      <main>
        {/* ── 01 HERO: DRAW WITH INK (METABALL CANVAS) ── */}
        <InkTrailSection isHero={true} simpleMode={simpleMode} />

        {/* ── 02 SECTION AFTER HERO: DIAL FIELD ('BALLS') ── */}
        <DialFieldHero simpleMode={simpleMode} />

        {/* ── 03 COLOUR REVEAL: VIBRANT RGB GRADIENTS + PROCEDURAL INK ── */}
        <ColourRevealSection simpleMode={simpleMode} />

        {/* ── 04 INERTIA RIBBON: MOMENTUM STRIP ── */}
        <InertiaRibbonSection simpleMode={simpleMode} />

        {/* ── 05 SCROLL MORPH: 5-FORMAT PINNED RAIL ── */}
        <ScrollMorphSection simpleMode={simpleMode} />

        {/* ── 06 MELTING HEADLINE + KINETIC RING + FORMAT CURSOR ── */}
        <ManifestoAndRing simpleMode={simpleMode} />

        {/* ── 08 CLOCK DIAL + TILTED TYPE STACK (SIDE BY SIDE) ── */}
        <ClockAndTiltedStack simpleMode={simpleMode} />

        {/* ── 09 SCATTER CANVAS: DRAGGABLE ASSET FORMATS ── */}
        <ScatterCanvas simpleMode={simpleMode} />
      </main>

      {/* ── 10 MONUMENTAL FOOTER ── */}
      <MonumentalFooter liveSlot={liveSlot} />
    </div>
  );
};
