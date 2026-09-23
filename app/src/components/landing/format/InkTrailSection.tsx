import React, { useEffect, useRef } from "react";

interface InkTrailSectionProps {
  simpleMode?: boolean;
  isHero?: boolean;
}

export const InkTrailSection: React.FC<InkTrailSectionProps> = ({ simpleMode, isHero = false }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const box = boxRef.current;
    const cv = canvasRef.current;
    if (!box || !cv) return;

    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const TAU = Math.PI * 2;

    let W = 0,
      H = 0;
    const size = () => {
      W = cv.width = box.clientWidth;
      H = cv.height = box.clientHeight;
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(box);

    const pts: Array<{ x: number; y: number; r: number; k: number }> = [];
    let hx = W / 2,
      hy = H / 2,
      tx = hx,
      ty = hy,
      lx = hx,
      ly = hy,
      active = false,
      vis = false,
      rafId = 0;

    const onPointerMove = (e: PointerEvent) => {
      const b = box.getBoundingClientRect();
      tx = e.clientX - b.left;
      ty = e.clientY - b.top;
      active = true;
    };

    const onPointerLeave = () => {
      active = false;
    };

    const onPointerDown = (e: PointerEvent) => {
      const b = box.getBoundingClientRect();
      pts.push({ x: e.clientX - b.left, y: e.clientY - b.top, r: 84, k: 0.988 });
    };

    box.addEventListener("pointermove", onPointerMove, { passive: true });
    box.addEventListener("pointerleave", onPointerLeave, { passive: true });
    box.addEventListener("pointerdown", onPointerDown, { passive: true });

    const io = new IntersectionObserver(([entry]) => {
      vis = entry.isIntersecting;
    });
    io.observe(box);

    const loop = (t: number) => {
      rafId = requestAnimationFrame(loop);
      if (!vis) return;

      if (!active) {
        // idle: Lissajous wander
        tx = still ? W / 2 : W / 2 + Math.sin(t * 0.0009) * W * 0.32;
        ty = still ? H / 2 : H / 2 + Math.sin(t * 0.0013 + 1) * H * 0.28;
      }
      hx += (tx - hx) * 0.16;
      hy += (ty - hy) * 0.16;

      const steps = Math.ceil(Math.hypot(hx - lx, hy - ly) / 7);
      for (let i = 1; i <= steps; i++) {
        pts.push({
          x: lx + ((hx - lx) * i) / steps,
          y: ly + ((hy - ly) * i) / steps,
          r: rnd(18, 28) * (active ? 1 : 0.8),
          k: (active ? 0.984 : 0.976) + Math.random() * 0.008,
        });
      }
      lx = hx;
      ly = hy;
      if (pts.length > 1800) pts.splice(0, pts.length - 1800);

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#000000";
      for (let i = pts.length - 1; i >= 0; i--) {
        const p = pts[i];
        p.r *= p.k;
        if (p.r < 0.45) {
          pts.splice(i, 1);
          continue;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, TAU);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(hx, hy, active ? 20 : 14, 0, TAU);
      ctx.fill();
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      io.disconnect();
      box.removeEventListener("pointermove", onPointerMove);
      box.removeEventListener("pointerleave", onPointerLeave);
      box.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);

  if (isHero) {
    return (
      <section
        className="stage goo-stage goo-stage--hero"
        id="hero"
        ref={boxRef}
        data-note="Hero: Ink trail"
      >
        <div className="goo">
          <canvas id="goo" ref={canvasRef} />
        </div>
        <div className="goo-txt goo-txt--hero">
          <span className="goo-hero-tag">ONCHAIN CAPITAL PERMISSIONS</span>
          <h1 className="goo-hero-title">
            CIRCUIT
          </h1>
          <p className="goo-hero-def" style={{ fontWeight: 600, fontSize: "clamp(15px, 1.4vw, 20px)", margin: "0 0 6px 0" }}>
            Programmable capital permissions for tokenized equities.
          </p>
          <p className="goo-hero-def" style={{ marginTop: 0 }}>
            Circuit converts live market conditions into enforceable onchain permissions for tokenized equities, credit protocols, liquidity venues, and autonomous agents.
          </p>
          <span className="goo-hero-tag" style={{ opacity: 0.85, marginTop: "6px" }}>
            Market → Risk → Permission → Execution
          </span>
          <span className="goo-hero-tag" style={{ opacity: 0.7, fontSize: "clamp(9px, 0.85vw, 11px)" }}>
            SOLANA · PYTH · TOKENIZED EQUITIES · METEORA DBC · AUTONOMOUS EXECUTION
          </span>
        </div>
      </section>
    );
  }

  return (
    <section className="lab" data-note="Ink trail">
      <div className="lab-head">
        <h2>Capital Authorization</h2>
        <p>
          Circuit converts changing market conditions into enforceable capital permissions for tokenized equities and autonomous execution.
        </p>
      </div>
      <div className="stage goo-stage" id="goo-stage" ref={boxRef} data-note="Ink trail stage">
        <div className="goo">
          <canvas id="goo" ref={canvasRef} />
        </div>
        <p className="goo-txt">
          Circuit<br />Kernel
        </p>
      </div>
    </section>
  );
};
