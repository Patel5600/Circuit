import React, { useEffect, useMemo, useRef } from "react";

interface ColourRevealSectionProps {
  simpleMode?: boolean;
}

/**
 * Deterministic pseudo-random case generator (heLlO, WOrlD style)
 * Generates an alternating/randomized case string with a fixed seed so it
 * never causes hydration mismatches or shifts on re-renders.
 */
function toRandomCase(text: string, seed = 2026): string {
  let s = seed;
  return text
    .split("")
    .map((char) => {
      if (!/[a-zA-Z]/.test(char)) return char;
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s % 2 === 0 ? char.toUpperCase() : char.toLowerCase();
    })
    .join("");
}

export const ColourRevealSection: React.FC<ColourRevealSectionProps> = ({ simpleMode }) => {
  const revealRef = useRef<HTMLDivElement>(null);

  // Paragraphs with deep Circuit technical explanation in randomized case
  const paragraphs = useMemo(() => {
    const raw = [
      "Circuit deploys continuous Dutch auctions for non-recourse debt liquidations, decaying execution prices along smooth deterministic curves to eliminate toxic MEV frontrunning and prevent cascading fire-sales across tokenized stocks.",
      "Autonomous Agents allocate capital strictly within user-signed cryptographic risk envelopes, bounded by programmatic drawdown limits, maximum allowable slippage, and instant one-click authority revocation.",
      "The dynamic Risk Ratchet swiftly compresses collateral LTV from 70% down to 50% during volatility shocks, while dual-bound Pyth oracles ingest sub-second confidence intervals (P ± σ) to enter Safe State and neutralize latency arbitrage across tokenized stocks.",
    ];

    return raw.map((p, i) => toRandomCase(p, 1000 + i * 333));
  }, []);

  useEffect(() => {
    const el = revealRef.current;
    if (!el) return;

    let x = el.clientWidth / 2;
    let y = el.clientHeight / 2;
    let r = 0;
    let tx = x;
    let ty = y;
    let tr = 0;
    let rafId = 0;

    // Set initial CSS vars
    el.style.setProperty("--mx", `${x}px`);
    el.style.setProperty("--my", `${y}px`);
    el.style.setProperty("--rr", "0px");

    const step = () => {
      x += (tx - x) * 0.2;
      y += (ty - y) * 0.2;
      r += (tr - r) * 0.14;
      el.style.setProperty("--mx", `${x}px`);
      el.style.setProperty("--my", `${y}px`);
      el.style.setProperty("--rr", `${r}px`);

      if (Math.abs(tx - x) + Math.abs(ty - y) + Math.abs(tr - r) > 0.3) {
        rafId = requestAnimationFrame(step);
      } else {
        rafId = 0;
      }
    };

    const kick = () => {
      if (!rafId) rafId = requestAnimationFrame(step);
    };

    let boxRect: DOMRect | null = null;
    const updateRect = () => {
      if (el) boxRect = el.getBoundingClientRect();
    };
    updateRect();
    window.addEventListener("resize", updateRect, { passive: true });
    window.addEventListener("scroll", updateRect, { passive: true });

    const onPointerMove = (e: PointerEvent) => {
      if (!boxRect) updateRect();
      const b = boxRect!;
      tx = e.clientX - b.left;
      ty = e.clientY - b.top;
      // Generous circular spotlight radius for reading and reveal
      tr = Math.max(260, Math.min(b.width, b.height) * 0.48);
      kick();
    };

    const onPointerDown = (e: PointerEvent) => {
      updateRect();
      const b = boxRect!;
      tx = e.clientX - b.left;
      ty = e.clientY - b.top;
      tr = Math.max(280, Math.min(b.width, b.height) * 0.54);
      kick();
    };

    const onPointerLeave = () => {
      tr = 0;
      kick();
    };

    el.addEventListener("pointermove", onPointerMove, { passive: true });
    el.addEventListener("pointerdown", onPointerDown, { passive: true });
    el.addEventListener("pointerleave", onPointerLeave, { passive: true });

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointerleave", onPointerLeave);
    };
  }, []);

  return (
    <section className="lab" data-note="Colour reveal">
      <div className="lab-head">
        <h2>Collateral Universe</h2>
        <p>
          {simpleMode
            ? "Move your cursor across the stage to reveal Circuit's deep protocol mechanisms in randomized case."
            : "Continuous Dutch auctions, cryptographic risk envelopes, and asymmetric LTV tapering across tokenized stocks. Move cursor to unveil protocol architecture."}
        </p>
      </div>
      <div className="stage reveal-stage" data-note="Colour reveal stage">
        <div className="reveal" id="reveal" ref={revealRef}>
          {/* Layer 1 (Bottom): Vibrant colorful generative gradients */}
          <div className="art" aria-hidden="true">
            <i className="ink" style={{ "--ox": "8%", "--oy": "-6%" } as React.CSSProperties} />
          </div>

          {/* Layer 2 (Top): Grayscale layer that masks out under cursor to reveal colors */}
          <div className="art gray" aria-hidden="true">
            <i className="ink" style={{ "--ox": "8%", "--oy": "-6%" } as React.CSSProperties} />
          </div>

          {/* Layer 3: Protocol lore in randomized case — revealed strictly within cursor spotlight */}
          <div className="reveal-para-box">
            {paragraphs.map((para, idx) => (
              <p key={idx}>{para}</p>
            ))}
          </div>

          <span className="cap">MOVE CURSOR TO REVEAL PROTOCOL LORE →</span>
        </div>
      </div>
    </section>
  );
};
