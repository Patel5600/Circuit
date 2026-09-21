import React, { useEffect, useRef } from "react";

interface FormatCursorSectionProps {
  simpleMode?: boolean;
}

export const FormatCursorSection: React.FC<FormatCursorSectionProps> = ({ simpleMode }) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const st = stageRef.current;
    const c = cursorRef.current;
    if (!st || !c) return;

    if (!window.matchMedia("(pointer: fine)").matches) return;

    const S = { x: 0, y: 0, w: 14, h: 14, r: 7 };
    const T = { ...S };
    let raf = 0;
    let inside = false;

    const step = () => {
      let moving = false;
      for (const k in S) {
        const key = k as keyof typeof S;
        S[key] += (T[key] - S[key]) * 0.24;
        if (Math.abs(T[key] - S[key]) > 0.3) moving = true;
      }
      c.style.transform = `translate3d(${S.x}px,${S.y}px,0)`;
      c.style.width = `${S.w}px`;
      c.style.height = `${S.h}px`;
      c.style.borderRadius = `${S.r}px`;
      raf = inside || moving ? requestAnimationFrame(step) : 0;
    };

    const kick = () => {
      if (!raf) raf = requestAnimationFrame(step);
    };

    const onPointerMove = (e: PointerEvent) => {
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
        const r = targetEl.getBoundingClientRect();
        const pad = 8;
        const w = r.width + pad * 2;
        const h = r.height + pad * 2;
        const cx = r.left - b.left + r.width / 2;
        const cy = r.top - b.top + r.height / 2;
        const rad = window.getComputedStyle(targetEl).borderTopLeftRadius;
        const br =
          (rad.endsWith("%")
            ? (Math.min(r.width, r.height) * parseFloat(rad)) / 100
            : parseFloat(rad) || 0) + pad;

        Object.assign(T, {
          w,
          h,
          x: cx + (px - cx) * 0.12 - w / 2,
          y: cy + (py - cy) * 0.12 - h / 2,
          r: Math.min(br, w / 2, h / 2),
        });
      } else {
        Object.assign(T, { w: 14, h: 14, r: 7, x: px - 7, y: py - 7 });
      }
      kick();
    };

    const onPointerLeave = () => {
      inside = false;
      c.style.opacity = "0";
    };

    st.addEventListener("pointermove", onPointerMove, { passive: true });
    st.addEventListener("pointerleave", onPointerLeave, { passive: true });

    return () => {
      if (raf) cancelAnimationFrame(raf);
      st.removeEventListener("pointermove", onPointerMove);
      st.removeEventListener("pointerleave", onPointerLeave);
    };
  }, []);

  return (
    <section className="lab" data-note="Format cursor">
      <div className="lab-head">
        <h2>Format cursor</h2>
        <p>
          {simpleMode
            ? "A shape-shifting pointer. Hover over any button or card and watch the pointer morph to match its silhouette."
            : "A cursor that becomes the shape of whatever it touches: word, card, circle or pill. Position, size and corner radius are eased separately, and the shape leans slightly toward the pointer."}
        </p>
      </div>
      <div className="stage cur-stage" id="cur" ref={stageRef} data-note="Format cursor stage">
        <div className="cur-grid">
          <ul className="cur-menu">
            <li>
              <button type="button" data-snap>Desktop</button>
            </li>
            <li>
              <button type="button" data-snap>Business cards</button>
            </li>
            <li>
              <button type="button" data-snap>Editorial</button>
            </li>
            <li>
              <button type="button" data-snap>Advert</button>
            </li>
          </ul>
          <div className="cur-side">
            <button type="button" className="cur-triangle" data-snap aria-label="Pyth Oracle">
              <svg className="cur-tri-border" viewBox="0 0 116 104" preserveAspectRatio="none" aria-hidden="true">
                <polygon points="58,3 113,101 3,101" fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              </svg>
              <div className="cur-tri-inner">
                <svg viewBox="0 0 24 24" className="cur-tri-icon" width="20" height="20" fill="currentColor" aria-hidden="true">
                  <path d="M12 1.4 22.2 19.2a.7.7 0 0 1-.6 1.05H2.4a.7.7 0 0 1-.6-1.05L12 1.4zm0 4.3-6.6 11.5h13.2L12 5.7zM12 9.9l3.4 5.9H8.6L12 9.9z" />
                </svg>
                <span className="cur-tri-name">Pyth</span>
              </div>
            </button>
            <button type="button" className="cur-card" data-snap>
              (Format) Vertical
            </button>
            <button type="button" className="cur-badge" data-snap>
              Circle
            </button>
            <button type="button" className="cur-pill" data-snap>
              Rounded
            </button>
          </div>
        </div>
        <i className="fcur" id="fcur" ref={cursorRef} />
      </div>
    </section>
  );
};
