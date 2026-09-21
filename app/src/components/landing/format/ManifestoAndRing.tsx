import React, { useEffect, useRef } from "react";
import { Link } from "react-router-dom";

interface ManifestoAndRingProps {
  simpleMode: boolean;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export const ManifestoAndRing: React.FC<ManifestoAndRingProps> = ({ simpleMode }) => {
  // ── 1. Melting Headline Refs
  const meltStageRef = useRef<HTMLDivElement>(null);
  const meltHeadingRef = useRef<HTMLHeadingElement>(null);
  const turbRef = useRef<SVGFETurbulenceElement>(null);
  const dispRef = useRef<SVGFEDisplacementMapElement>(null);

  // ── 2. Kinetic Ring Refs
  const ringSvgRef = useRef<SVGSVGElement>(null);
  const ring1Ref = useRef<SVGGElement>(null);
  const ring2Ref = useRef<SVGGElement>(null);
  const handRef = useRef<SVGGElement>(null);
  const tp1Ref = useRef<SVGTextPathElement>(null);
  const tp2Ref = useRef<SVGTextPathElement>(null);

  // ── 3. Format Cursor Refs
  const curStageRef = useRef<HTMLDivElement>(null);
  const fcurRef = useRef<HTMLElement>(null);

  // ── Melting Headline Effect ──
  useEffect(() => {
    const st = meltStageRef.current;
    const h = meltHeadingRef.current;
    const t = turbRef.current;
    const d = dispRef.current;
    if (!st || !h || !t || !d) return;

    let s = 0;
    let target = 0;
    let vis = false;
    let time = 0;
    let rafId = 0;

    let headingRect: DOMRect | null = null;
    const updateHeadingRect = () => {
      if (h) headingRect = h.getBoundingClientRect();
    };
    updateHeadingRect();
    window.addEventListener("resize", updateHeadingRect, { passive: true });
    window.addEventListener("scroll", updateHeadingRect, { passive: true });

    const onMove = (e: PointerEvent) => {
      if (!headingRect) updateHeadingRect();
      const b = headingRect!;
      const dist = Math.hypot(e.clientX - (b.left + b.width / 2), e.clientY - (b.top + b.height / 2));
      const maxDim = Math.max(b.width, b.height);
      target = clamp(1 - dist / (maxDim * 0.85), 0, 1) * 65;
    };

    const onLeave = () => {
      target = 0;
    };

    st.addEventListener("pointermove", onMove, { passive: true });
    st.addEventListener("pointerleave", onLeave, { passive: true });

    const observer = new IntersectionObserver(([entry]) => {
      vis = entry.isIntersecting;
      if (vis) {
        updateHeadingRect();
        h.style.filter = "url(#circuit-melt-f)";
      } else {
        h.style.filter = "none";
      }
    });
    observer.observe(st);

    const loop = () => {
      rafId = requestAnimationFrame(loop);
      if (!vis) return;

      s += (target - s) * 0.06;
      if (s < 0.02 && target === 0) s = 0;

      time += 0.008;
      d.setAttribute("scale", s.toFixed(1));
      t.setAttribute(
        "baseFrequency",
        `0.012 ${(0.028 + Math.sin(time) * 0.002).toFixed(4)}`
      );
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      st.removeEventListener("pointermove", onMove);
      st.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("resize", updateHeadingRect);
      window.removeEventListener("scroll", updateHeadingRect);
      observer.disconnect();
      cancelAnimationFrame(rafId);
    };
  }, []);

  // ── Kinetic Ring Effect ──
  useEffect(() => {
    const svg = ringSvgRef.current;
    const g1 = ring1Ref.current;
    const g2 = ring2Ref.current;
    const hand = handRef.current;
    const tp1 = tp1Ref.current;
    const tp2 = tp2Ref.current;
    if (!svg || !g1 || !g2 || !hand || !tp1 || !tp2) return;

    const SEP = "\u2003\u2003";
    const TAU = Math.PI * 2;

    const fit = (tp: SVGTextPathElement, r: number, unit: string) => {
      const text = tp.parentNode as SVGTextElement;
      if (!text) return;
      text.setAttribute("letter-spacing", "0");
      tp.textContent = unit;
      try {
        const circ = TAU * r;
        const textLen = tp.getComputedTextLength();
        if (textLen > 0) {
          const n = Math.max(1, Math.round(circ / textLen));
          tp.textContent = unit.repeat(n);
          const fullLen = tp.getComputedTextLength();
          text.setAttribute("letter-spacing", ((circ - fullLen) / (tp.textContent.length || 1)).toFixed(3));
        }
      } catch {}
    };

    const run = () => {
      fit(tp1, 326, ["Dutch Auctions", "Risk Ratchet", "Pyth Oracles", "Meteora DBC"].join(SEP) + SEP);
      fit(tp2, 252, ["Tokenized Stocks", "Autonomous Agents", "Safe State"].join(SEP) + SEP);
    };

    run();
    if ((document as any).fonts?.ready) {
      (document as any).fonts.ready.then(run);
    }

    let a1 = 0;
    let a2 = 0;
    let sp = 1;
    let tsp = 1;
    let v = 0;
    let lastScroll = window.scrollY;
    let vis = false;
    let rafId = 0;

    const onScroll = () => {
      v += (window.scrollY - lastScroll) * 0.15;
      lastScroll = window.scrollY;
    };

    const onEnter = () => {
      tsp = 0.12;
    };
    const onLeave = () => {
      tsp = 1;
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    svg.addEventListener("pointerenter", onEnter);
    svg.addEventListener("pointerleave", onLeave);

    const observer = new IntersectionObserver(([entry]) => {
      vis = entry.isIntersecting;
    });
    observer.observe(svg);

    const loop = () => {
      rafId = requestAnimationFrame(loop);
      v *= 0.9;
      if (!vis) return;

      v = clamp(v, -40, 40);
      sp += (tsp - sp) * 0.06;
      a1 += (0.12 + v * 0.4) * sp;
      a2 -= (0.17 + v * 0.5) * sp;

      g1.setAttribute("transform", `rotate(${a1.toFixed(2)} 400 400)`);
      g2.setAttribute("transform", `rotate(${a2.toFixed(2)} 400 400)`);
      hand.setAttribute("transform", `rotate(${(window.scrollY * 0.2).toFixed(2)} 400 400)`);
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("scroll", onScroll);
      svg.removeEventListener("pointerenter", onEnter);
      svg.removeEventListener("pointerleave", onLeave);
      observer.disconnect();
      cancelAnimationFrame(rafId);
    };
  }, []);

  // ── Format Cursor Effect ──
  useEffect(() => {
    const st = curStageRef.current;
    const c = fcurRef.current;
    if (!st || !c || !window.matchMedia("(pointer: fine)").matches) return;

    const S = { x: 0, y: 0, w: 14, h: 14, r: 7 };
    const T = { ...S };
    let rafId = 0;
    let inside = false;
    let isTriangle = false;

    const step = () => {
      let moving = false;
      for (const k of Object.keys(S) as (keyof typeof S)[]) {
        S[k] += (T[k] - S[k]) * 0.24;
        if (Math.abs(T[k] - S[k]) > 0.3) moving = true;
      }
      c.style.transform = `translate3d(${Math.round(S.x)}px,${Math.round(S.y)}px,0)`;
      c.style.width = `${Math.round(S.w)}px`;
      c.style.height = `${Math.round(S.h)}px`;
      if (isTriangle) {
        c.style.borderRadius = "0px";
        c.style.clipPath = "url(#circuit-cur-tri-clip)";
      } else {
        c.style.borderRadius = `${Math.round(S.r)}px`;
        c.style.clipPath = "none";
      }

      rafId = inside || moving ? requestAnimationFrame(step) : 0;
    };

    const kick = () => {
      if (!rafId) rafId = requestAnimationFrame(step);
    };

    const onMove = (e: PointerEvent) => {
      const b = st.getBoundingClientRect();
      const px = e.clientX - b.left;
      const py = e.clientY - b.top;

      if (!inside) {
        inside = true;
        c.style.opacity = "1";
        Object.assign(S, { x: px - 7, y: py - 7, w: 14, h: 14, r: 7 });
      }

      const targetEl = (e.target as HTMLElement)?.closest("[data-snap]") as HTMLElement | null;
      if (targetEl) {
        const triTarget = targetEl.classList.contains("lf-cur-triangle") || !!targetEl.closest(".lf-cur-triangle");
        isTriangle = triTarget;
        const r = targetEl.getBoundingClientRect();
        const pad = 8;
        const w = r.width + pad * 2;
        const h = r.height + pad * 2;
        const cx = r.left - b.left + r.width / 2;
        const cy = r.top - b.top + r.height / 2;
        const radStr = window.getComputedStyle(targetEl).borderTopLeftRadius;
        const br =
          (radStr.endsWith("%")
            ? (Math.min(r.width, r.height) * parseFloat(radStr)) / 100
            : parseFloat(radStr) || 0) + pad;

        Object.assign(T, {
          w,
          h,
          x: cx + (px - cx) * 0.12 - w / 2,
          y: cy + (py - cy) * 0.12 - h / 2,
          r: triTarget ? 0 : Math.min(br, w / 2, h / 2),
        });
      } else {
        isTriangle = false;
        Object.assign(T, { w: 14, h: 14, r: 7, x: px - 7, y: py - 7 });
      }
      kick();
    };

    const onLeave = () => {
      inside = false;
      isTriangle = false;
      c.style.opacity = "0";
      c.style.clipPath = "none";
    };

    st.addEventListener("pointermove", onMove);
    st.addEventListener("pointerleave", onLeave);

    return () => {
      st.removeEventListener("pointermove", onMove);
      st.removeEventListener("pointerleave", onLeave);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <>
      {/* Standalone SVG Filter for Melting Headline & Triangle Cursor Clip */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
        <filter id="circuit-melt-f" x="-10%" y="-20%" width="120%" height="240%" colorInterpolationFilters="sRGB">
          <feTurbulence ref={turbRef} type="fractalNoise" baseFrequency="0.012 0.03" numOctaves={2} seed={3} result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 .5  0 .7 0 0 .05  0 0 0 0 0  0 0 0 0 1" result="n2" />
          <feDisplacementMap ref={dispRef} in="SourceGraphic" in2="n2" scale="0" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <clipPath id="circuit-cur-tri-clip" clipPathUnits="objectBoundingBox">
          <path d="M 0.5 0.03 C 0.53 0.03, 0.56 0.06, 0.58 0.10 L 0.98 0.91 C 1.00 0.95, 0.98 0.99, 0.93 0.99 L 0.07 0.99 C 0.02 0.99, 0.00 0.95, 0.02 0.91 L 0.42 0.10 C 0.44 0.06, 0.47 0.03, 0.5 0.03 Z" />
        </clipPath>
      </svg>

      {/* ── MELTING HEADLINE ── */}
      <section className="lab" data-note="Melting headline">
        <div className="lab-head">
          <h2>Credit Governance</h2>
          <p>
            Liquidity expands programmatically where capital parameters are bounded and verifiable on-chain.
          </p>
        </div>
        <div className="lf-stage lf-melt-stage" ref={meltStageRef}>
          <div style={{ position: "relative", zIndex: 2, padding: "0 20px" }}>
            <h3 className="lf-melt" ref={meltHeadingRef}>
              Capital governs<br />risk
            </h3>
          </div>
          <span className="lf-melt-hint">Bring pointer close to distort</span>
        </div>
      </section>

      {/* ── KINETIC RING ── */}
      <section className="lab" data-note="Kinetic Ring">
        <div className="lab-head">
          <h2>Dynamic Risk Matrix</h2>
          <p>
            Counter-rotating on-chain primitives and asset pairs: Dutch auction curves, risk ratchets, and Pyth price confidence bands.
          </p>
        </div>
        <div className="lf-stage lf-guides lf-ring-stage">
          <svg
            className="lf-ring"
            ref={ringSvgRef}
            viewBox="0 0 800 800"
            role="img"
            aria-label="Two rotating rings listing protocol primitives around a central dial"
          >
            <defs>
              <path id="rp1" d="M74,400 a326,326 0 1,1 652,0 a326,326 0 1,1 -652,0" />
              <path id="rp2" d="M148,400 a252,252 0 1,1 504,0 a252,252 0 1,1 -504,0" />
            </defs>
            <circle cx="400" cy="400" r="304" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeDasharray="2 8" />
            <circle cx="400" cy="400" r="228" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeDasharray="2 8" />
            <g ref={ring1Ref}>
              <text fontSize="48">
                <textPath href="#rp1" ref={tp1Ref} />
              </text>
            </g>
            <g ref={ring2Ref}>
              <text fontSize="34">
                <textPath href="#rp2" ref={tp2Ref} />
              </text>
            </g>
            <circle cx="400" cy="400" r="196" fill="#ffffff" />
            <circle cx="400" cy="400" r="150" fill="none" stroke="#e2e2de" />
            <text x="400" y="386" textAnchor="middle" fontSize="12" fill="#999995" style={{ fill: "#999995" }}>
              (Protocol Invariant)
            </text>
            <text x="400" y="430" textAnchor="middle" fontSize="46" style={{ fill: "#000000", letterSpacing: "-1.5px", fontWeight: 700 }}>
              CIRCUIT
            </text>
            <g ref={handRef}>
              <circle cx="400" cy="250" r="14" fill="#000000" />
            </g>
          </svg>
        </div>
      </section>

      {/* ── FORMAT CURSOR ── */}
      <section className="lab" data-note="Format Cursor">
        <div className="lab-head">
          <h2>Adaptive Instruments</h2>
          <p>
            Interactive protocol surfaces. Hover across terminal links, liquidation mechanisms, and risk parameters.
          </p>
        </div>
        <div className="lf-stage lf-cur-stage" ref={curStageRef}>
          <div className="lf-cur-grid">
            <ul className="lf-cur-menu">
              <li>
                <button type="button" data-snap>
                  <Link to="/app" style={{ color: "inherit", textDecoration: "none" }}>Launch Terminal</Link>
                </button>
              </li>
              <li>
                <button type="button" data-snap>
                  <Link to="/app/markets" style={{ color: "inherit", textDecoration: "none" }}>Bonding Curves</Link>
                </button>
              </li>
              <li>
                <button type="button" data-snap>
                  <Link to="/app" style={{ color: "inherit", textDecoration: "none" }}>Vault Analytics</Link>
                </button>
              </li>
              <li>
                <button type="button" data-snap>
                  <a href="https://github.com/Patel5600/Circuit" target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "none" }}>Source Code</a>
                </button>
              </li>
            </ul>
            <div className="lf-cur-side">
              <button type="button" className="lf-cur-triangle" data-snap aria-label="Pyth Oracle">
                <svg className="lf-cur-tri-border" viewBox="0 0 116 104" preserveAspectRatio="none" aria-hidden="true">
                  <polygon points="58,3 113,101 3,101" fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                </svg>
                <div className="lf-cur-tri-inner">
                  <svg viewBox="0 0 24 24" className="lf-cur-tri-icon" width="20" height="20" fill="currentColor" aria-hidden="true">
                    <path d="M12 1.4 22.2 19.2a.7.7 0 0 1-.6 1.05H2.4a.7.7 0 0 1-.6-1.05L12 1.4zm0 4.3-6.6 11.5h13.2L12 5.7zM12 9.9l3.4 5.9H8.6L12 9.9z" />
                  </svg>
                  <span className="lf-cur-tri-name">Pyth</span>
                </div>
              </button>
              <button type="button" className="lf-cur-card" data-snap>
                (Protocol) Dutch Auction
              </button>
              <button type="button" className="lf-cur-badge" data-snap>
                Agents
              </button>
              <button type="button" className="lf-cur-pill" data-snap>
                Risk Ratchet
              </button>
            </div>
          </div>
          <i className="lf-fcur" ref={fcurRef as any} />
        </div>
      </section>
    </>
  );
};
