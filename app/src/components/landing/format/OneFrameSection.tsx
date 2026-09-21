import React, { useEffect, useRef, useState } from "react";

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const TAU = Math.PI * 2;

const N = 64;
const angles = Array.from({ length: N }, (_, k) => -Math.PI / 2 + (TAU * k) / N);
const rectPts: [number, number][] = angles.map(a => {
  const c = Math.cos(a), s = Math.sin(a);
  const t = Math.min(0.5 / Math.max(Math.abs(c), 1e-9), 0.5 / Math.max(Math.abs(s), 1e-9));
  return [50 + 100 * t * c, 50 + 100 * t * s];
});
const circPts: [number, number][] = angles.map(a => [50 + 50 * Math.cos(a), 50 + 50 * Math.sin(a)]);
const TRI: [number, number][] = [[50, 0], [100, 100], [0, 100]];
const triPts: [number, number][] = angles.map(a => {
  const c = Math.cos(a), s = Math.sin(a);
  let best = Infinity;
  for (let e = 0; e < 3; e++) {
    const P = TRI[e], Q = TRI[(e + 1) % 3];
    const ex = Q[0] - P[0], ey = Q[1] - P[1];
    const bx = P[0] - 50, by = P[1] - 50;
    const det = -c * ey + ex * s;
    if (Math.abs(det) < 1e-12) continue;
    const t = (-bx * ey + ex * by) / det;
    const u = (c * by - bx * s) / det;
    if (t > 0 && u >= -1e-9 && u <= 1 + 1e-9 && t < best) best = t;
  }
  return [50 + best * c, 50 + best * s];
});
const SHAPES = [rectPts, circPts, triPts];

const FORMATS = [
  {
    label: "Vertical",
    state: "SAFE (L0)",
    ratio: "4 : 5",
    shape: 0,
    notesLeft: [
      "A tall frame pulls the eye up and down. Build with stems, columns, and stacked type.",
      "Narrow formats compress space. Keep the message to one column of attention."
    ],
    notesRight: [
      "Where it lives: phone screens, posters, book covers, story-style video.",
      "Centered, it feels steady. Push weight to one side and it starts to tip."
    ]
  },
  {
    label: "Horizontal",
    state: "RESTRICTED (L1)",
    ratio: "16 : 10",
    shape: 0,
    notesLeft: [
      "A wide frame lets the eye travel. Horizons and baselines do the structural work.",
      "There is room to leave empty. One strong element plus generous space reads as calm."
    ],
    notesRight: [
      "Where it lives: desktop layouts, slides, film titles, banners.",
      "Wide frames split well. A narrow strip beside a broad block still feels like one piece."
    ]
  },
  {
    label: "Circle",
    state: "DEFENSIVE (L2)",
    ratio: "1 : 1",
    shape: 1,
    notesLeft: [
      "No corners, no top, no bottom. Everything points to the middle.",
      "Think in radius and diameter. Rings, orbits, and rotation come naturally."
    ],
    notesRight: [
      "Where it lives: avatars, badges, coins, dials, loaders.",
      "Text on a curve slows the reader down. Use it once, on purpose."
    ]
  },
  {
    label: "Triangle",
    state: "EMERGENCY (L3)",
    ratio: "1.12 : 1",
    shape: 2,
    notesLeft: [
      "A point at the top pulls the eye skyward; a point at the base creates tension and instability.",
      "Diagonals create energy. Strong geometric corners command deliberate focus."
    ],
    notesRight: [
      "Where it lives: warnings, yields, directional indicators, architectural trusses.",
      "Triangles demand balance. Symmetry brings authority, asymmetry brings velocity."
    ]
  }
];

interface OneFrameSectionProps {
  simpleMode?: boolean;
}

export const OneFrameSection: React.FC<OneFrameSectionProps> = ({ simpleMode }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const frameElRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let queued = false;
    let currentIdx = 0;

    const render = () => {
      const rect = root.getBoundingClientRect();
      const h = root.offsetHeight - window.innerHeight;
      if (h <= 0) return;
      const progress = clamp(-rect.top / h, 0, 1);
      const t = progress * 3;
      const i = Math.min(Math.floor(t), 2);
      const f = t - i;
      const k = smooth(0.3, 0.7, f);
      const A = FORMATS[i], B = FORMATS[Math.min(i + 1, 3)];
      const pa = SHAPES[A.shape], pb = SHAPES[B.shape];

      let d = "";
      for (let n = 0; n < N; n++) {
        const x = lerp(pa[n][0], pb[n][0], k);
        const y = lerp(pa[n][1], pb[n][1], k);
        d += (n ? "," : "") + x.toFixed(2) + "% " + y.toFixed(2) + "%";
      }

      if (frameElRef.current) {
        frameElRef.current.style.clipPath = `polygon(${d})`;
      }

      const active = Math.min(Math.floor(t + 0.5), 3);
      if (active !== currentIdx) {
        currentIdx = active;
        setActiveIdx(active);
      }
    };

    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        render();
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    render();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const jumpTo = (idx: number) => {
    const root = rootRef.current;
    if (!root) return;
    const top = root.offsetTop + (idx / 3) * (root.offsetHeight - window.innerHeight);
    window.scrollTo({ top, behavior: "smooth" });
  };

  return (
    <section className="lf-oneframe" ref={rootRef} id="one-frame" data-note="One frame four shapes">
      <div className="lf-oneframe-sticky">
        {/* Header Indicator */}
        <div className="lf-of-header">
          <span className="lf-of-state">{FORMATS[activeIdx].state}</span>
          <span className="lf-of-ratio">{FORMATS[activeIdx].ratio}</span>
        </div>

        {/* Morphing Frame */}
        <div className="lf-of-wrap">
          <div className="lf-of-frame" ref={frameElRef} aria-label={`Frame in ${FORMATS[activeIdx].label} format`}>
            {/* Layer 0: Vertical */}
            <svg className="lf-of-layer" viewBox="0 0 80 100" preserveAspectRatio="xMidYMid slice" style={{ opacity: activeIdx === 0 ? 1 : 0 }}>
              <rect width="80" height="100" fill="#DCDFE8" />
              <rect x="6" y="0" width="8" height="70" fill="#1E2088" />
              <rect x="18" y="30" width="14" height="70" fill="#FFB320" />
              <rect x="36" y="0" width="5" height="100" fill="#FBFAF6" />
              <rect x="45" y="40" width="11" height="60" fill="#1E2088" />
              <rect x="60" y="0" width="13" height="58" fill="#FFB320" />
            </svg>
            {/* Layer 1: Horizontal */}
            <svg className="lf-of-layer" viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice" style={{ opacity: activeIdx === 1 ? 1 : 0 }}>
              <rect width="160" height="62" fill="#DCDFE8" />
              <circle cx="112" cy="62" r="24" fill="#FFB320" />
              <rect y="62" width="160" height="38" fill="#1E2088" />
              <rect y="70" width="160" height="3.2" fill="#A99BFF" />
              <rect y="78" width="160" height="2.2" fill="#FFB320" />
            </svg>
            {/* Layer 2: Circle */}
            <svg className="lf-of-layer" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" style={{ opacity: activeIdx === 2 ? 1 : 0 }}>
              <rect width="100" height="100" fill="#FBFAF6" />
              <circle cx="50" cy="50" r="50" fill="#1E2088" />
              <circle cx="50" cy="50" r="41" fill="#A99BFF" />
              <circle cx="50" cy="50" r="31" fill="#FBFAF6" />
              <circle cx="50" cy="50" r="21" fill="#FFB320" />
              <circle cx="50" cy="50" r="9" fill="#1E2088" />
            </svg>
            {/* Layer 3: Triangle */}
            <svg className="lf-of-layer" viewBox="0 0 112 100" preserveAspectRatio="xMidYMid slice" style={{ opacity: activeIdx === 3 ? 1 : 0 }}>
              <rect width="112" height="100" fill="#FBFAF6" />
              <polygon points="56,0 112,100 0,100" fill="#1E2088" />
              <polygon points="56,18.8 96.3,90.8 15.7,90.8" fill="#A99BFF" />
              <polygon points="56,37.6 80.6,81.6 31.4,81.6" fill="#FBFAF6" />
              <polygon points="56,53.8 67.2,73.8 44.8,73.8" fill="#FFB320" />
            </svg>
          </div>
        </div>

        {/* Eye Tracks: Left Margin Notes */}
        <div className="lf-of-notes lf-of-notes--left">
          {FORMATS.map((fmt, i) => (
            <div key={i} className="lf-of-note-item" style={{ opacity: activeIdx === i ? 1 : 0 }}>
              {fmt.notesLeft.map((note, j) => (
                <p key={j}>{note}</p>
              ))}
            </div>
          ))}
        </div>

        {/* Eye Tracks: Right Margin Notes */}
        <div className="lf-of-notes lf-of-notes--right">
          {FORMATS.map((fmt, i) => (
            <div key={i} className="lf-of-note-item" style={{ opacity: activeIdx === i ? 1 : 0 }}>
              {fmt.notesRight.map((note, j) => (
                <p key={j}>{note}</p>
              ))}
            </div>
          ))}
        </div>

        {/* Navigation Buttons */}
        <nav className="lf-of-nav" aria-label="Format Selector">
          {FORMATS.map((fmt, i) => (
            <button
              key={fmt.label}
              type="button"
              className="lf-of-nav-btn"
              aria-current={activeIdx === i ? "true" : "false"}
              onClick={() => jumpTo(i)}
            >
              {fmt.label}
            </button>
          ))}
        </nav>
      </div>
    </section>
  );
};
