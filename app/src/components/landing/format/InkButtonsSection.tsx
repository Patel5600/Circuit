import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

/**
 * InkButtonsSection — format-kit-3 "Ink Buttons"
 * Four micro-interactions:
 *  1. Fill spreads from pointer-enter, retracts to pointer-leave
 *  2. Magnetic round button (pointer: fine only)
 *  3. Underline draws in → exits the other side
 *  4. Toggle squashes when pressed
 */
export const InkButtonsSection: React.FC = () => {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const magRef = useRef<HTMLButtonElement | null>(null);
  const magWrapRef = useRef<HTMLDivElement | null>(null);
  const [checked, setChecked] = useState(false);

  // ── 1. Fill origin: track pointer-enter / pointer-leave position per .ib ──
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const btns = stage.querySelectorAll<HTMLElement>(".ib");
    const handlers: Array<[HTMLElement, string, (e: PointerEvent) => void]> = [];
    btns.forEach(b => {
      const set = (e: PointerEvent) => {
        const r = b.getBoundingClientRect();
        b.style.setProperty("--x", (e.clientX - r.left) + "px");
        b.style.setProperty("--y", (e.clientY - r.top) + "px");
      };
      b.addEventListener("pointerenter", set);
      b.addEventListener("pointerleave", set);
      handlers.push([b, "pointerenter", set], [b, "pointerleave", set]);
    });
    return () => {
      handlers.forEach(([el, evt, fn]) => el.removeEventListener(evt, fn));
    };
  }, []);

  // ── 2. Magnetic button ──
  useEffect(() => {
    const mag = magRef.current;
    const wrap = magWrapRef.current;
    if (!mag || !wrap) return;
    if (!matchMedia("(pointer: fine)").matches) return;

    let x = 0, y = 0, tx = 0, ty = 0, raf = 0;
    const run = () => {
      x += (tx - x) * 0.18;
      y += (ty - y) * 0.18;
      mag.style.transform = `translate(${x.toFixed(2)}px,${y.toFixed(2)}px)`;
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.1 ? requestAnimationFrame(run) : 0;
    };
    const aim = (dx: number, dy: number) => {
      tx = dx; ty = dy;
      if (!raf) raf = requestAnimationFrame(run);
    };
    const onMove = (e: PointerEvent) => {
      const r = wrap.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      Math.hypot(dx, dy) < 110 + r.width / 2 ? aim(dx * 0.35, dy * 0.35) : aim(0, 0);
    };
    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section className="lab lf-lab" aria-label="Ink Buttons Showcase">
      <div className="lab-head lf-lab-head">
        <h2>Ink buttons</h2>
        <p>
          Four micro-interactions. The fill spreads from wherever the pointer entered
          and retracts toward where it left; the round button is magnetic; the underline
          draws in and exits the other side; the switch squashes when pressed.
        </p>
      </div>

      <div className="stage ib-stage" id="ib-stage" ref={stageRef} data-note="Ink buttons">
        <div className="ib-row">

          {/* ── Fill button ── */}
          <div className="ib-cell">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
              <button type="button" className="ib">
                <span className="ib-a">Terminal</span>
                <span className="ib-b" aria-hidden="true">Terminal</span>
              </button>
            </div>
            <small>Fill from cursor entry · retract on exit</small>
          </div>

          {/* ── Magnetic button ── */}
          <div className="ib-cell">
            <div className="mag-wrap" ref={magWrapRef}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
              <button
                ref={magRef}
                type="button"
                className="ib mag"
                aria-label="Magnetic button"
              >
                <span className="ib-a">◎</span>
                <span className="ib-b" aria-hidden="true">◎</span>
              </button>
            </div>
            <small>Magnetic · pulled toward your pointer</small>
          </div>

          {/* ── Underline draw-in ── */}
          <div className="ib-cell">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
              <Link to="/app/markets" className="ul">
                Markets
              </Link>
            </div>
            <small>Underline draws in · exits the other side</small>
          </div>

          {/* ── Squash toggle ── */}
          <div className="ib-cell">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
              <button
                type="button"
                role="switch"
                className="tg"
                aria-checked={checked}
                aria-label="Toggle"
                onClick={() => setChecked(c => !c)}
              >
                <i />
              </button>
            </div>
            <small>Squash on press · spring on release</small>
          </div>

        </div>
      </div>
    </section>
  );
};
