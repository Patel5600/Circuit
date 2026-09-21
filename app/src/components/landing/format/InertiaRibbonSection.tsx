import React, { useEffect, useRef } from "react";

interface InertiaRibbonSectionProps {
  simpleMode?: boolean;
}

export const InertiaRibbonSection: React.FC<InertiaRibbonSectionProps> = ({ simpleMode = false }) => {
  const ribbonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ribbonRef.current;
    if (!el) return;

    // Clear any previous cards if re-mounted
    el.innerHTML = "";

    const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const STEP = 310;
    const CW = 280;
    const ITEMS: Array<[string, string, number, string]> = [
      ["Dutch Auction", "140px 140px 0 0", 0, "Liquidation"],
      ["Agents", "999px", 1, "Execution"],
      ["Risk Ratchet", "0", 0, "LTV Taper"],
      ["Pyth Oracles", "0 0 140px 140px", 1, "P ± σ Pricing"],
      ["Meteora DBC", "50%", 0, "Curve Depth"],
      ["Safe State", "140px 0 140px 0", 1, "Circuit Breaker"],
      ["12 Equities", "0 140px 0 0", 0, "Collateral"],
      ["70% Max LTV", "28px", 1, "Credit Line"],
    ];

    const total = STEP * ITEMS.length;
    const cards = ITEMS.map(([name, radius, dark, meta]) => {
      const c = document.createElement("article");
      c.className = "rc" + (dark ? " k" : "");
      c.style.borderRadius = radius;
      c.innerHTML = `<i class="ink${dark ? " w" : ""}" style="--ox:${rnd(-15, 15) | 0}%;--oy:${rnd(-15, 15) | 0}%"></i><small>(${meta})</small><strong>${name}</strong>`;
      el.append(c);
      return c;
    });

    let x = 0,
      v = -0.4,
      drag = false,
      lastX = 0,
      vis = false,
      rafId = 0;

    const onPointerDown = (e: PointerEvent) => {
      drag = true;
      lastX = e.clientX;
      v = 0;
      el.setPointerCapture(e.pointerId);
      el.classList.add("drag");
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!drag) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      x += dx;
      v = v * 0.6 + dx * 0.4;
    };

    const up = () => {
      drag = false;
      el.classList.remove("drag");
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        v += 14;
        e.preventDefault();
      }
      if (e.key === "ArrowLeft") {
        v -= 14;
        e.preventDefault();
      }
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("keydown", onKeyDown);

    const observer = new IntersectionObserver(([entry]) => {
      vis = entry.isIntersecting;
    });
    observer.observe(el);

    let elWidth = el.clientWidth || 1200;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          elWidth = entry.contentRect.width;
        }
      }
    });
    ro.observe(el);

    const loop = () => {
      rafId = requestAnimationFrame(loop);
      if (!vis) return;
      if (drag) {
        v *= 0.9; // holding still cancels a stale fling
      } else {
        x += v;
        v += ((still ? 0 : -0.4) - v) * 0.03; // coast, then settle to idle drift
      }
      const W = elWidth,
        mid = W / 2;
      cards.forEach((c, i) => {
        const pos = (((i * STEP + x) % total) + total) % total - STEP;
        const off = clamp((pos + CW / 2 - mid) / mid, -1, 1);
        const y = Math.sin(pos / 260) * 26;
        const rot = clamp(v * 0.7, -16, 16) + Math.cos(pos / 260) * 5;
        const s = 1 - Math.abs(off) * 0.1;
        c.style.transform = `translate3d(${pos}px,${y}px,0) rotate(${rot}deg) scale(${s})`;
        c.style.zIndex = `${Math.round(s * 100)}`;
      });
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      observer.disconnect();
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <section className="lab">
      <div className="lab-head">
        <h2>Execution Primitives</h2>
        <p>
          Continuous momentum across Circuit's on-chain architecture: Dutch auctions, autonomous execution agents, and dynamic risk ratchets. Drag horizontally to inspect protocol primitives.
        </p>
      </div>
      <div className="stage guides" data-note="Inertia ribbon">
        <div
          className="ribbon"
          id="ribbon"
          ref={ribbonRef}
          tabIndex={0}
          aria-label="Draggable ribbon of format cards. Drag, or use the left and right arrow keys."
        />
        <span className="hint">Drag, or use the arrow keys</span>
      </div>
    </section>
  );
};
