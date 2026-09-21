import React, { useEffect, useRef } from "react";
import { Link } from "react-router-dom";

interface HeroInkTrailProps {
  simpleMode: boolean;
  liveSlot: number;
}

const TAU = Math.PI * 2;

export const HeroInkTrail: React.FC<HeroInkTrailProps> = ({ simpleMode, liveSlot }) => {
  const stageRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const box = stageRef.current;
    const cv = canvasRef.current;
    if (!box || !cv) return;

    const ctx = cv.getContext("2d", { alpha: false });
    if (!ctx) return;

    let W = 640, H = 360;
    const size = () => {
      const bw = box.clientWidth || 640;
      const bh = box.clientHeight || 360;
      W = Math.min(640, Math.max(320, Math.round(bw * 0.4)));
      H = Math.min(360, Math.max(200, Math.round(bh * 0.4)));
      cv.width = W;
      cv.height = H;
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(box);

    // Pre-allocated particle pool — ZERO allocations per frame
    const POOL_SIZE = 50;
    const pool = Array.from({ length: POOL_SIZE }, () => ({ x: 0, y: 0, r: 0, k: 0, alive: false }));
    let poolHead = 0;

    const spawnPoint = (x: number, y: number, r: number, k: number) => {
      const p = pool[poolHead];
      poolHead = (poolHead + 1) % POOL_SIZE;
      p.x = x; p.y = y; p.r = r; p.k = k; p.alive = true;
    };

    let hx = W / 2, hy = H / 2, tx = hx, ty = hy, lx = hx, ly = hy;
    let active = false, vis = false, rafId = 0;

    const onMove = (e: PointerEvent) => {
      const b = box.getBoundingClientRect();
      if (!b.width || !b.height) return;
      tx = ((e.clientX - b.left) / b.width) * W;
      ty = ((e.clientY - b.top) / b.height) * H;
      active = true;
    };
    const onLeave = () => { active = false; };
    const onDown = (e: PointerEvent) => {
      const b = box.getBoundingClientRect();
      if (!b.width || !b.height) return;
      const cx = ((e.clientX - b.left) / b.width) * W;
      const cy = ((e.clientY - b.top) / b.height) * H;
      spawnPoint(cx, cy, 36, 0.965);
    };

    box.addEventListener("pointermove", onMove, { passive: true });
    box.addEventListener("pointerleave", onLeave, { passive: true });
    box.addEventListener("pointerdown", onDown, { passive: true });

    const loop = (t: number) => {
      if (!vis || !W) {
        rafId = 0;
        return; // Fully sleep when off-screen
      }
      rafId = requestAnimationFrame(loop);

      if (!active) {
        tx = W / 2 + Math.sin(t * 0.0008) * W * 0.32;
        ty = H / 2 + Math.sin(t * 0.0011 + 1) * H * 0.28;
      }
      hx += (tx - hx) * 0.16;
      hy += (ty - hy) * 0.16;

      const dist = Math.hypot(hx - lx, hy - ly);
      const steps = Math.min(Math.ceil(dist / 12), 3);
      for (let i = 1; i <= steps; i++) {
        spawnPoint(
          lx + ((hx - lx) * i) / steps,
          ly + ((hy - ly) * i) / steps,
          (12 + Math.random() * 8) * (active ? 1 : 0.8),
          0.95 + Math.random() * 0.015
        );
      }
      lx = hx; ly = hy;

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#000000";

      for (let i = 0; i < POOL_SIZE; i++) {
        const p = pool[i];
        if (!p.alive) continue;
        p.r *= p.k;
        if (p.r < 0.8) { p.alive = false; continue; }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, TAU);
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(hx, hy, active ? 14 : 9, 0, TAU);
      ctx.fill();
    };

    const io = new IntersectionObserver(([e]) => {
      vis = e.isIntersecting;
      if (vis && !rafId) rafId = requestAnimationFrame(loop);
    });
    io.observe(box);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      ro.disconnect();
      io.disconnect();
      box.removeEventListener("pointermove", onMove);
      box.removeEventListener("pointerleave", onLeave);
      box.removeEventListener("pointerdown", onDown);
    };
  }, []);

  return (
    <section className="lf-hero" ref={stageRef} id="hero" data-note="Ink trail hero">
      <div className="lf-hero__canvas-wrap">
        <canvas ref={canvasRef} className="lf-hero__canvas" />
      </div>
      <div className="lf-hero__txt">
        <small>(Circuit)</small>
        <h1>Capital<br />Governs<br />Risk</h1>
        <p>
          {simpleMode
            ? "Every dollar is tracked by automated safety rules. No one can steal or lose your collateral."
            : "Pyth sub-second pull feeds · Anchor PDA authority · Meteora dynamic bonding curve · 4-state ratchet"}
        </p>
        <div className="lf-hero__cta">
          <Link to="/app" className="lf-pill lf-pill--fill" data-snap="">Launch Terminal</Link>
          <a href="#one-frame" className="lf-pill" data-snap="">Explore Risk States ↓</a>
        </div>
      </div>
      <div className="lf-hero__slot">
        <span>Devnet Slot</span>
        <strong>{liveSlot.toLocaleString()}</strong>
      </div>
    </section>
  );
};
