import React, { useEffect, useRef } from "react";

interface DialFieldHeroProps {
  simpleMode?: boolean;
}

export const DialFieldHero: React.FC<DialFieldHeroProps> = ({ simpleMode }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    const sec = sectionRef.current;
    if (!cv || !sec) return;

    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const TAU = Math.PI * 2;

    let W = 0,
      H = 0,
      dpr = 1,
      cols = 0,
      rows = 0,
      cell = 0,
      cells: Array<{ c: number; r: number; cx: number; cy: number; a: number }> = [];

    const px = { x: 0, y: 0, on: false };
    let wave: { x: number; y: number; t: number } | null = null;
    let vis = true;
    let rafId = 0;

    const layout = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = cv.clientWidth;
      H = cv.clientHeight;
      cv.width = W * dpr;
      cv.height = H * dpr;
      cols = Math.ceil(W / (W < 700 ? 64 : 96));
      cell = W / cols;
      rows = Math.ceil(H / cell);
      const old = cells;
      cells = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          cells.push({
            c,
            r,
            cx: (c + 0.5) * cell,
            cy: (r + 0.5) * cell,
            a: old[r * cols + c]?.a ?? rnd(-3, 3),
          });
        }
      }
    };

    const ro = new ResizeObserver(layout);
    ro.observe(cv);
    layout();

    const onPointerMove = (e: PointerEvent) => {
      const b = cv.getBoundingClientRect();
      px.x = e.clientX - b.left;
      px.y = e.clientY - b.top;
      px.on = true;
    };

    const onPointerLeave = () => {
      px.on = false;
    };

    const onPointerDown = (e: PointerEvent) => {
      const b = cv.getBoundingClientRect();
      px.x = e.clientX - b.left;
      px.y = e.clientY - b.top;
      px.on = true;
      wave = { x: px.x, y: px.y, t: performance.now() };
    };

    cv.addEventListener("pointermove", onPointerMove, { passive: true });
    cv.addEventListener("pointerleave", onPointerLeave, { passive: true });
    cv.addEventListener("pointerdown", onPointerDown, { passive: true });

    const io = new IntersectionObserver(([entry]) => {
      vis = entry.isIntersecting;
    });
    io.observe(cv);

    const frame = (t: number) => {
      rafId = requestAnimationFrame(frame);
      if (!vis || !W) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      if (wave && t - wave.t > 3200) wave = null;
      const R = cell * 0.42;

      for (const k of cells) {
        // target angle: toward cursor, else a slow diagonal wave
        const ta = px.on
          ? Math.atan2(px.x - k.cx, -(px.y - k.cy))
          : (still ? 0 : t * 0.0004) + (k.c + k.r) * 0.35;
        k.a += Math.atan2(Math.sin(ta - k.a), Math.cos(ta - k.a)) * 0.1; // shortest-way easing

        const dist = Math.hypot(px.x - k.cx, px.y - k.cy);
        const prox = px.on ? Math.exp(-(dist * dist) / (2 * (cell * 2.2) ** 2)) : 0;
        let sc = 1 + prox * 0.14;
        let spin = 0;

        if (wave) {
          const d = Math.hypot(k.cx - wave.x, k.cy - wave.y);
          const q = clamp(((t - wave.t) / 1000 - d / 900) / 0.9, 0, 1);
          if (!still) spin = (1 - (1 - q) ** 3) * TAU; // full turn; 360° looks identical to 0°, so no reset jump
          sc += Math.sin(q * Math.PI) * 0.18;
        }

        const r = R * sc;
        const a = k.a + spin;

        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(k.cx, k.cy, r, 0, TAU);
        ctx.fill();

        ctx.strokeStyle = "#e2e2de";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(k.cx, k.cy, r * 0.74, 0, TAU);
        ctx.stroke();

        ctx.fillStyle = "#000000";
        ctx.beginPath();
        ctx.arc(
          k.cx + Math.sin(a) * r * 0.6,
          k.cy - Math.cos(a) * r * 0.6,
          r * 0.16 * (1 + prox * 0.7),
          0,
          TAU
        );
        ctx.fill();
      }
    };

    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      io.disconnect();
      cv.removeEventListener("pointermove", onPointerMove);
      cv.removeEventListener("pointerleave", onPointerLeave);
      cv.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);

  return (
    <section className="hero2" id="dial-hero" ref={sectionRef} data-note="Dial field (Full screen)">
      <canvas ref={canvasRef} id="dials" aria-hidden="true" />
      <div className="hero2-txt">
        <small style={{ textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.85 }}>
          Circuit evaluates live market and position conditions before capital moves
        </small>
        <h1>
          Market state<br />becomes permission.
        </h1>
        <div style={{ maxWidth: "680px", marginTop: "14px", fontSize: "clamp(12px, 1.1vw, 15px)", lineHeight: 1.5, opacity: 0.9 }}>
          <p style={{ margin: "0 0 6px 0" }}>
            Inputs include: validated oracle state · price freshness · oracle confidence · market session state · collateral value · debt · position LTV · actor authority · action limits · risk state · policy constraints.
          </p>
          <p style={{ margin: 0, fontWeight: 500 }}>
            The result is not merely a risk signal. It is an enforceable capital boundary.
          </p>
        </div>
      </div>
    </section>
  );
};
