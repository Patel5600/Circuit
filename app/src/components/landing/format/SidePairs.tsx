import React, { useEffect, useRef, useState } from "react";

interface SidePairsProps {
  simpleMode: boolean;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;

/* ═══════════════════════════════════════════════════════════════════════════
   PAIR 1: CLOCK DIAL + FORMAT MORPH
   ═══════════════════════════════════════════════════════════════════════════ */
export const Pair1ClockAndMorph: React.FC<SidePairsProps> = ({ simpleMode }) => {
  const dialRef = useRef<HTMLDivElement>(null);
  const [dialLive, setDialLive] = useState(true);
  const [dialReadout, setDialReadout] = useState("12:00:00");
  const dotsRef = useRef<{ n: string; angle: number; rad: number; s: number; el: HTMLDivElement }[]>([]);

  useEffect(() => {
    const dial = dialRef.current;
    if (!dial) return;
    dial.querySelectorAll(".lf-clock-dot").forEach(el => el.remove());

    const cfg = [
      { s: 22, rad: 20, angle: 120, n: "Hour", color: "#FFB320", shadow: "rgba(255, 179, 32, 0.7)" },
      { s: 16, rad: 30, angle: 240, n: "Minute", color: "#3D5AFE", shadow: "rgba(61, 90, 254, 0.6)" },
      { s: 12, rad: 38, angle: 330, n: "Second", color: "#EF4444", shadow: "rgba(239, 68, 68, 0.6)" },
    ];

    const paint = (d: { angle: number; rad: number; el: HTMLElement }) => {
      d.el.style.setProperty("--a", `${d.angle}deg`);
      d.el.style.setProperty("--rad", `${d.rad}cqw`);
    };

    const dots = cfg.map((c, i) => {
      const el = document.createElement("div");
      el.className = `lf-clock-dot lf-clock-dot--${c.n.charAt(0).toLowerCase()}`;
      el.dataset.i = String(i);
      el.setAttribute("aria-label", `Dot ${c.n}`);
      el.style.backgroundColor = c.color;
      el.style.boxShadow = `0 0 12px ${c.shadow}`;
      dial.append(el);
      const d = { ...c, el };
      paint(d);
      return d;
    });
    dotsRef.current = dots;

    const raw = (e: PointerEvent, r: DOMRect) =>
      (Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) * 180) / Math.PI;

    let cur: (typeof dots)[0] | null = null;
    let prev = 0;

    const onDown = (e: PointerEvent) => {
      const el = (e.target as HTMLElement).closest(".lf-clock-dot") as HTMLDivElement | null;
      if (!el) return;
      setDialLive(false);
      cur = dots[Number(el.dataset.i)];
      el.setPointerCapture(e.pointerId);
      el.classList.add("is-drag");
      prev = raw(e, dial.getBoundingClientRect());
    };
    const onMove = (e: PointerEvent) => {
      if (!cur) return;
      const r = dial.getBoundingClientRect(),
        a = raw(e, r);
      cur.angle += ((a - prev + 540) % 360) - 180;
      prev = a;
      const dist = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
      cur.rad = clamp((dist / r.width) * 100, 8, 40);
      paint(cur);
    };
    const onUp = () => {
      if (!cur) return;
      cur.el.classList.remove("is-drag");
      cur.angle = Math.round(cur.angle / 30) * 30;
      paint(cur);
      cur = null;
    };

    dial.addEventListener("pointerdown", onDown);
    dial.addEventListener("pointermove", onMove);
    dial.addEventListener("pointerup", onUp);
    dial.addEventListener("pointercancel", onUp);

    return () => {
      dial.removeEventListener("pointerdown", onDown);
      dial.removeEventListener("pointermove", onMove);
      dial.removeEventListener("pointerup", onUp);
      dial.removeEventListener("pointercancel", onUp);
    };
  }, []);

  useEffect(() => {
    if (!dialLive) return;
    const tick = () => {
      const n = new Date();
      const s = n.getSeconds(),
        m = n.getMinutes(),
        h = n.getHours();
      const sDeg = s * 6;
      const mDeg = m * 6 + s * 0.1;
      const hDeg = ((h % 12) + m / 60) * 30;
      const d = dotsRef.current;
      if (d.length >= 3) {
        d[0].angle = hDeg;
        d[0].el.style.setProperty("--a", `${hDeg}deg`);
        d[1].angle = mDeg;
        d[1].el.style.setProperty("--a", `${mDeg}deg`);
        d[2].angle = sDeg;
        d[2].el.style.setProperty("--a", `${sDeg}deg`);
      }
      setDialReadout(n.toLocaleTimeString([], { hour12: false }));
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [dialLive]);

  // Format Morph State
  const [morphFmt, setMorphFmt] = useState<"horizontal" | "vertical" | "rounded" | "circle">("horizontal");

  const MORPH_THEMES = {
    horizontal: {
      bg: "linear-gradient(135deg, #1E2088 0%, #15173F 100%)",
      color: "#FFFFFF",
      border: "1px solid rgba(169, 155, 255, 0.4)",
      shadow: "0 14px 44px rgba(30, 32, 136, 0.35)",
      badgeBg: "rgba(255, 179, 32, 0.2)",
      badgeColor: "#FFB320",
      accent: "#A99BFF",
      desc: "16:10 ratio · Liquidity pool horizontal baseline",
    },
    vertical: {
      bg: "linear-gradient(135deg, #444F24 0%, #212413 100%)",
      color: "#FBFAF6",
      border: "1px solid rgba(255, 179, 32, 0.4)",
      shadow: "0 14px 44px rgba(68, 79, 36, 0.35)",
      badgeBg: "rgba(255, 179, 32, 0.25)",
      badgeColor: "#FFB320",
      accent: "#FFB320",
      desc: "4:5 ratio · Hierarchical risk ratchet stack",
    },
    rounded: {
      bg: "linear-gradient(135deg, #B6BBD9 0%, #A99BFF 100%)",
      color: "#15173F",
      border: "1px solid rgba(61, 90, 254, 0.4)",
      shadow: "0 14px 44px rgba(169, 155, 255, 0.35)",
      badgeBg: "rgba(21, 23, 63, 0.15)",
      badgeColor: "#15173F",
      accent: "#3D5AFE",
      desc: "Square with 48px softened architectural radius",
    },
    circle: {
      bg: "radial-gradient(circle at 35% 35%, #FFB320 0%, #EF4444 55%, #9945FF 100%)",
      color: "#FFFFFF",
      border: "1px solid rgba(255, 255, 255, 0.5)",
      shadow: "0 14px 44px rgba(255, 179, 32, 0.4)",
      badgeBg: "rgba(0, 0, 0, 0.35)",
      badgeColor: "#FFFFFF",
      accent: "#FFB320",
      desc: "Equidistant center · Directional oracle focus",
    },
  };

  const activeTheme = MORPH_THEMES[morphFmt];

  return (
    <section className="lf-lab" data-note="Side-by-Side Pair 1: Clock + Morph">
      <div className="lf-lab-head">
        <h2>Temporal & Structural Formats</h2>
        <p>
          {simpleMode
            ? "Left: Spin the clock dots or watch it tick. Right: Click buttons to reshape the card."
            : "Left: Discrete radial clock dial with hour snapping and live feed. Right: Continuous format morphing."}
        </p>
      </div>

      <div className="lf-pair-grid">
        {/* Left: Clock Dial */}
        <div className="lf-pair-card">
          <div className="lf-stage lf-guides lf-clock-stage">
            <div
              className="lf-clock-dial"
              ref={dialRef}
              style={{
                background: "radial-gradient(circle at center, #FFFFFF 0%, #F5F6FC 70%, #E6EAF8 100%)",
                border: "2px solid rgba(61, 90, 254, 0.3)",
                boxShadow: "0 12px 36px rgba(21, 23, 63, 0.14)",
              }}
            >
              <div className="lf-clock-center">
                <strong style={{ color: "#15173F", fontSize: 26, letterSpacing: "-0.03em" }}>{dialReadout}</strong>
                <small style={{ color: "#3D5AFE", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 4 }}>
                  <span style={{ color: "#10B981", fontSize: 10 }}>●</span> PYTH SUB-SECOND CLOCK
                </small>
              </div>
            </div>
          </div>
          <div className="lf-tools" style={{ display: "flex", gap: 12, marginTop: 14 }}>
            <button
              type="button"
              className="lf-pill"
              aria-pressed={dialLive}
              onClick={() => setDialLive(v => !v)}
            >
              {dialLive ? "Live Clock Mode: ON" : "Manual Spin Mode: ON"}
            </button>
          </div>
        </div>

        {/* Right: Format Morph */}
        <div className="lf-pair-card">
          <div className="lf-stage lf-guides lf-morph-stage">
            <div
              className="lf-morph-box"
              data-f={morphFmt}
              style={{
                background: activeTheme.bg,
                color: activeTheme.color,
                border: activeTheme.border,
                boxShadow: activeTheme.shadow,
              }}
            >
              <div className="lf-ink-wash" />
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <small style={{ fontSize: 10, color: "inherit", opacity: 0.8 }}>(Circuit Protocol)</small>
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "var(--lf-mono)",
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: activeTheme.badgeBg,
                      color: activeTheme.badgeColor,
                      fontWeight: 600,
                    }}
                  >
                    ACTIVE FORMAT
                  </span>
                </div>
                <h3 style={{ margin: "6px 0 0", fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>
                  {morphFmt.toUpperCase()}
                </h3>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: "inherit", opacity: 0.85, zIndex: 2 }}>
                {activeTheme.desc}
              </p>
            </div>
          </div>
          <div className="lf-tools" style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            {(["horizontal", "vertical", "rounded", "circle"] as const).map(fmt => (
              <button
                key={fmt}
                type="button"
                className="lf-pill"
                aria-pressed={morphFmt === fmt}
                onClick={() => setMorphFmt(fmt)}
              >
                {fmt.charAt(0).toUpperCase() + fmt.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   PAIR 2: COLOUR REVEAL + MICRO-TYPE SPEC SHEET
   ═══════════════════════════════════════════════════════════════════════════ */
export const Pair2ColourAndSpec: React.FC<SidePairsProps> = ({ simpleMode }) => {
  const revealRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = revealRef.current;
    if (!el) return;
    let x = el.clientWidth / 2,
      y = el.clientHeight / 2,
      r = 0;
    let tx = x,
      ty = y,
      tr = 0,
      rafId = 0;

    const step = () => {
      x += (tx - x) * 0.2;
      y += (ty - y) * 0.2;
      r += (tr - r) * 0.14;
      el.style.setProperty("--mx", `${x}px`);
      el.style.setProperty("--my", `${y}px`);
      el.style.setProperty("--rr", `${r}px`);
      rafId = Math.abs(tx - x) + Math.abs(ty - y) + Math.abs(tr - r) > 0.3 ? requestAnimationFrame(step) : 0;
    };
    const kick = () => {
      if (!rafId) rafId = requestAnimationFrame(step);
    };

    const onMove = (e: PointerEvent) => {
      const b = el.getBoundingClientRect();
      tx = e.clientX - b.left;
      ty = e.clientY - b.top;
      tr = Math.min(b.width, b.height) * 0.34;
      kick();
    };
    const onLeave = () => {
      tr = 0;
      kick();
    };

    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerleave", onLeave, { passive: true });
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <section className="lf-lab" data-note="Side-by-Side Pair 2: Colour Reveal + Micro Spec">
      <div className="lf-lab-head">
        <h2>Visual & Telemetry Calibration</h2>
        <p>
          {simpleMode
            ? "Left: Hover to shine a light on hidden colors. Right: Hover over small text to magnify technical specs."
            : "Left: Radial mask reveal over layered generative gradients. Right: Architectural micro-typography scale zoom."}
        </p>
      </div>

      <div className="lf-pair-grid">
        {/* Left: Colour Reveal */}
        <div className="lf-pair-card">
          <div className="lf-stage lf-reveal-stage">
            <div className="lf-reveal" ref={revealRef} id="reveal">
              <div className="lf-art" aria-hidden="true">
                <i className="ink" style={{ "--ox": "8%", "--oy": "-6%" } as any} />
              </div>
              <div className="lf-art is-gray" aria-hidden="true">
                <i className="ink" style={{ "--ox": "8%", "--oy": "-6%" } as any} />
              </div>
              <span className="cap">Move your cursor</span>
            </div>
          </div>
        </div>

        {/* Right: Micro-Type Spec Sheet */}
        <div className="lf-pair-card">
          <div className="lf-stage lf-guides lf-spec-stage">
            <div className="lf-spec-sheet" style={{ borderLeft: "4px solid #3D5AFE" }}>
              <h4 style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Protocol Spec Sheet</span>
                <span style={{ fontSize: 9, color: "#10B981", fontWeight: 600 }}>● VERIFIED</span>
              </h4>
              <ul className="lf-spec-list">
                <li className="lf-spec-item">
                  <span>ORACLE LATENCY</span>
                  <span style={{ color: "#10B981" }}>400ms SUB-SECOND (PYTH)</span>
                </li>
                <li className="lf-spec-item">
                  <span>AUTHORITY REGIME</span>
                  <span style={{ color: "#3D5AFE" }}>ANCHOR PDA V2 BINDING</span>
                </li>
                <li className="lf-spec-item">
                  <span>DBC SWAP CURVE</span>
                  <span style={{ color: "#9945FF" }}>METEORA DYNAMIC BONDING</span>
                </li>
                <li className="lf-spec-item">
                  <span>MAX LIQUIDATION RATIO</span>
                  <span style={{ color: "#FFB320" }}>85.00% COLLATERAL CUTOFF</span>
                </li>
                <li className="lf-spec-item">
                  <span>RISK RATCHET STATES</span>
                  <span style={{ color: "#EF4444" }}>SAFE / RESTRICTED / DEFENSIVE</span>
                </li>
                <li className="lf-spec-item">
                  <span>RECOVERY GUARANTEE</span>
                  <span style={{ color: "#10B981" }}>UNCONDITIONAL DEBT REDUCTION</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   PAIR 3: ORACLE DIAL FIELD + INK LAB GENERATIVE POSTER
   ═══════════════════════════════════════════════════════════════════════════ */
export const Pair3DialFieldAndLab: React.FC<SidePairsProps> = ({ simpleMode }) => {
  const dialCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = dialCanvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    let W = 0,
      H = 0,
      dpr = 1,
      cols = 0,
      cell = 0;
    let cells: { c: number; r: number; cx: number; cy: number; a: number }[] = [];
    const px = { x: 0, y: 0, on: false };
    let wave: { x: number; y: number; t: number } | null = null;
    let vis = true,
      rafId = 0;

    const layout = () => {
      dpr = Math.min(devicePixelRatio || 1, 2);
      W = cv.clientWidth;
      H = cv.clientHeight;
      cv.width = W * dpr;
      cv.height = H * dpr;
      cols = Math.ceil(W / (W < 500 ? 54 : 68));
      cell = W / cols;
      const rows = Math.ceil(H / cell);
      const old = cells;
      cells = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          cells.push({ c, r, cx: (c + 0.5) * cell, cy: (r + 0.5) * cell, a: old[r * cols + c]?.a ?? rnd(-3, 3) });
        }
      }
    };
    const ro = new ResizeObserver(layout);
    ro.observe(cv);

    const onMove = (e: PointerEvent) => {
      const b = cv.getBoundingClientRect();
      px.x = e.clientX - b.left;
      px.y = e.clientY - b.top;
      px.on = true;
    };
    const onLeave = () => {
      px.on = false;
    };
    const onDown = (e: PointerEvent) => {
      const b = cv.getBoundingClientRect();
      px.x = e.clientX - b.left;
      px.y = e.clientY - b.top;
      px.on = true;
      wave = { x: px.x, y: px.y, t: performance.now() };
    };

    cv.addEventListener("pointermove", onMove, { passive: true });
    cv.addEventListener("pointerleave", onLeave, { passive: true });
    cv.addEventListener("pointerdown", onDown, { passive: true });

    const frame = (t: number) => {
      if (!vis || !W) {
        rafId = 0;
        return;
      }
      rafId = requestAnimationFrame(frame);
      if (wave && t - wave.t > 3000) wave = null;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const R = cell * 0.42;

      for (const k of cells) {
        const ta = px.on ? Math.atan2(px.x - k.cx, -(px.y - k.cy)) : t * 0.0004 + (k.c + k.r) * 0.35;
        k.a += Math.atan2(Math.sin(ta - k.a), Math.cos(ta - k.a)) * 0.1;
        const dist = Math.hypot(px.x - k.cx, px.y - k.cy);
        const prox = px.on ? Math.exp(-(dist * dist) / (2 * (cell * 2.2) ** 2)) : 0;
        let sc = 1 + prox * 0.14,
          spin = 0;
        if (wave) {
          const d = Math.hypot(k.cx - wave.x, k.cy - wave.y);
          const q = clamp(((t - wave.t) / 1000 - d / 900) / 0.9, 0, 1);
          spin = (1 - (1 - q) ** 3) * TAU;
          sc += Math.sin(q * Math.PI) * 0.18;
        }
        const r2 = R * sc,
          a = k.a + spin;

        // Dial base
        ctx.fillStyle = prox > 0.3 ? "#F5F8FF" : "#FFFFFF";
        ctx.beginPath();
        ctx.arc(k.cx, k.cy, r2, 0, TAU);
        ctx.fill();

        // Outer rim with brand color
        ctx.strokeStyle = prox > 0.4 ? "#3D5AFE" : "#E2E5F0";
        ctx.lineWidth = prox > 0.4 ? 1.5 : 1;
        ctx.beginPath();
        ctx.arc(k.cx, k.cy, r2 * 0.74, 0, TAU);
        ctx.stroke();

        // Needle dot in vibrant Harvest Gold or Cobalt
        ctx.fillStyle = prox > 0.4 ? "#FFB320" : spin !== 0 ? "#14F195" : "#1E2088";
        ctx.beginPath();
        ctx.arc(k.cx + Math.sin(a) * r2 * 0.6, k.cy - Math.cos(a) * r2 * 0.6, r2 * 0.18 * (1 + prox * 0.7), 0, TAU);
        ctx.fill();
      }
    };

    const io = new IntersectionObserver(([e]) => {
      vis = e.isIntersecting;
      if (vis && !rafId) rafId = requestAnimationFrame(frame);
    });
    io.observe(cv);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      ro.disconnect();
      io.disconnect();
      cv.removeEventListener("pointermove", onMove);
      cv.removeEventListener("pointerleave", onLeave);
      cv.removeEventListener("pointerdown", onDown);
    };
  }, []);

  // Ink Lab Controls State
  const [labDensity, setLabDensity] = useState(50);
  const [labScale, setLabScale] = useState(40);
  const [labSoftness, setLabSoftness] = useState(60);
  const [labText, setLabText] = useState("Circuit");
  const [labFmt, setLabFmt] = useState<"vertical" | "horizontal" | "circle" | "arch">("vertical");
  const [palette, setPalette] = useState<"solana" | "royal" | "forest" | "mono">("solana");

  const PALETTES = {
    solana: {
      bg: "linear-gradient(135deg, #9945FF 0%, #14F195 100%)",
      txt: "#FFFFFF",
      glow: "rgba(153, 69, 255, 0.4)",
    },
    royal: {
      bg: "linear-gradient(135deg, #1E2088 0%, #FFB320 100%)",
      txt: "#FFFFFF",
      glow: "rgba(30, 32, 136, 0.4)",
    },
    forest: {
      bg: "linear-gradient(135deg, #444F24 0%, #10B981 100%)",
      txt: "#FBFAF6",
      glow: "rgba(68, 79, 36, 0.4)",
    },
    mono: {
      bg: "linear-gradient(135deg, #15173F 0%, #0E0F2B 100%)",
      txt: "#FFFFFF",
      glow: "rgba(21, 23, 63, 0.4)",
    },
  };

  const curPal = PALETTES[palette];

  return (
    <section className="lf-lab" data-note="Side-by-Side Pair 3: Oracle Dial Field + Ink Lab">
      <div className="lf-lab-head">
        <h2>Oracle Compass & Generative Poster</h2>
        <p>
          {simpleMode
            ? "Left: Dials that point to your cursor. Click to send ripples. Right: Design a poster with sliders."
            : "Left: Matrix of rotating dials orienting toward cursor feed. Right: Parametric poster generator."}
        </p>
      </div>

      <div className="lf-pair-grid">
        {/* Left: Oracle Dial Field */}
        <div className="lf-pair-card">
          <div className="lf-stage lf-dialfield-stage">
            <canvas ref={dialCanvasRef} className="lf-dialfield-canvas" />
          </div>
        </div>

        {/* Right: Generative Ink Lab */}
        <div className="lf-pair-card">
          <div className="lf-stage lf-guides lf-inklab-stage">
            <div
              className="lf-poster"
              data-f={labFmt}
              style={{
                background: curPal.bg,
                boxShadow: `0 8px 32px ${curPal.glow}`,
              }}
            >
              <div
                className="lf-ink-wash"
                style={{
                  opacity: labDensity / 70,
                  transform: `scale(${0.8 + labScale * 0.008})`,
                  filter: `blur(${labSoftness * 0.05}px)`,
                }}
              />
              <div className="lf-poster-txt" style={{ color: curPal.txt }}>
                <small style={{ color: "inherit", opacity: 0.8 }}>(Circuit Protocol)</small>
                <strong style={{ color: "inherit" }}>{labText || "Circuit"}</strong>
              </div>
            </div>

            <div className="lf-inklab-controls">
              <label className="lf-ctl">
                <span>Density: {labDensity}%</span>
                <input
                  type="range"
                  min="10"
                  max="100"
                  value={labDensity}
                  onChange={e => setLabDensity(Number(e.target.value))}
                />
              </label>
              <label className="lf-ctl">
                <span>Scale: {labScale}%</span>
                <input
                  type="range"
                  min="10"
                  max="100"
                  value={labScale}
                  onChange={e => setLabScale(Number(e.target.value))}
                />
              </label>
              <label className="lf-ctl">
                <span>Softness: {labSoftness}%</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={labSoftness}
                  onChange={e => setLabSoftness(Number(e.target.value))}
                />
              </label>
              <label className="lf-ctl">
                <span>Headline:</span>
                <input
                  type="text"
                  maxLength={14}
                  value={labText}
                  onChange={e => setLabText(e.target.value)}
                />
              </label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                {(["solana", "royal", "forest", "mono"] as const).map(p => (
                  <button
                    key={p}
                    type="button"
                    className="lf-pill"
                    style={{ padding: "4px 10px", fontSize: 11 }}
                    aria-pressed={palette === p}
                    onClick={() => setPalette(p)}
                  >
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                {(["vertical", "horizontal", "circle", "arch"] as const).map(f => (
                  <button
                    key={f}
                    type="button"
                    className="lf-pill"
                    style={{ padding: "4px 10px", fontSize: 11 }}
                    aria-pressed={labFmt === f}
                    onClick={() => setLabFmt(f)}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export const SidePairs: React.FC<SidePairsProps> = ({ simpleMode }) => {
  return (
    <>
      <Pair1ClockAndMorph simpleMode={simpleMode} />
      <Pair2ColourAndSpec simpleMode={simpleMode} />
      <Pair3DialFieldAndLab simpleMode={simpleMode} />
    </>
  );
};
