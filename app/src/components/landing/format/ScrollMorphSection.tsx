import React, { useEffect, useRef } from "react";

interface ScrollMorphSectionProps {
  simpleMode?: boolean;
}

interface MechanismInfo {
  name: string;
  desc: string;
  shapeType: "circle" | "rounded" | "vertical" | "horizontal" | "full";
}

/**
 * Deterministic pseudo-random case generator (heLlO, WOrlD style)
 * Matches Collateral Universe casing generator.
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

const RAW_MECHANISMS = [
  {
    name: "OBSERVE",
    desc: "Validate the current market and oracle conditions.",
    shapeType: "circle" as const,
  },
  {
    name: "EVALUATE",
    desc: "Compute the applicable risk state and capital policy.",
    shapeType: "rounded" as const,
  },
  {
    name: "AUTHORIZE",
    desc: "Evaluate the requested action against authority, position, market, and policy constraints.",
    shapeType: "vertical" as const,
  },
  {
    name: "EXECUTE",
    desc: "Allow the authorized execution path to consume the applicable permission.",
    shapeType: "horizontal" as const,
  },
  {
    name: "RECOVER",
    desc: "As risk tightens, risk-increasing actions contract while permitted recovery and exit actions remain available.",
    shapeType: "full" as const,
  },
];

const MECHANISMS: MechanismInfo[] = RAW_MECHANISMS.map((m, i) => ({
  ...m,
  // Randomized case paragraph format just like Collateral Universe
  desc: toRandomCase(m.desc, 1000 + i * 333),
}));

export const ScrollMorphSection: React.FC<ScrollMorphSectionProps> = ({ simpleMode }) => {
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const pin = track.querySelector<HTMLDivElement>(".sm-pin");
    const shape = track.querySelector<HTMLDivElement>("#sm-shape");
    const stageWords = track.querySelectorAll<HTMLElement>(".sm-stage-word");
    const items = track.querySelectorAll<HTMLLIElement>("#sm-rail li");
    const stage = track.querySelector<HTMLDivElement>(".sm-stage");

    if (!pin || !shape || !stage) return;

    // 5 Architectural Formats with responsive geometry (format 5 expands to full frame W x H)
    const KF = [
      { p: 0, w0: 320, h0: 320, r: 160, rot: 0, ts: 1, name: "OBSERVE", w: 0, h: 0 },
      { p: 0.22, w0: 540, h0: 180, r: 90, rot: 0, ts: 1, name: "EVALUATE", w: 0, h: 0 },
      { p: 0.45, w0: 280, h0: 410, r: 16, rot: 0, ts: 1, name: "AUTHORIZE", w: 0, h: 0 },
      { p: 0.68, w0: 480, h0: 300, r: 16, rot: 0, ts: 1, name: "EXECUTE", w: 0, h: 0 },
      { p: 0.92, w0: 0, h0: 0, r: 0, rot: 0, ts: 1.15, name: "RECOVER", w: 0, h: 0 },
    ];

    const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
    const smooth = (a: number, b: number, x: number) => {
      const t = clamp((x - a) / (b - a), 0, 1);
      return t * t * (3 - 2 * t);
    };

    let W = 0;
    let H = 0;
    let shown = 0;

    const measure = () => {
      W = pin.clientWidth;
      H = pin.clientHeight;
      KF.forEach((k, i) => {
        k.w = i === KF.length - 1 ? W : Math.min(k.w0, W * 0.9);
        k.h = i === KF.length - 1 ? H : Math.min(k.h0, H * 0.8);
      });
    };

    const updateContent = (idx: number) => {
      const m = MECHANISMS[idx];
      if (!m) return;
      shape.dataset.shape = m.shapeType;

      stageWords.forEach((w, n) => {
        if (n === idx) {
          w.classList.add("is-active");
        } else {
          w.classList.remove("is-active");
        }
      });

      items.forEach((li, n) => {
        if (n === idx) {
          li.setAttribute("aria-current", "true");
        } else {
          li.removeAttribute("aria-current");
        }
      });
    };

    const update = () => {
      const top = parseFloat(getComputedStyle(pin).top) || 0;
      const p = clamp((top - track.getBoundingClientRect().top) / (track.offsetHeight - pin.offsetHeight), 0, 1);

      let i = 0;
      while (i < KF.length - 2 && p >= KF[i + 1].p) i++;
      const a = KF[i];
      const b = KF[i + 1];
      const rawT = clamp((p - a.p) / (b.p - a.p), 0, 1);
      // Continuous smooth hermite/cosine interpolation between Permission Engine and Enforcement
      const t = i === 3 ? (1 - Math.cos(rawT * Math.PI)) * 0.5 : ease(rawT);
      const L = (k: "w" | "h" | "r" | "rot" | "ts") => a[k] + (b[k] - a[k]) * t;

      shape.style.width = L("w") + "px";
      shape.style.height = L("h") + "px";
      shape.style.borderRadius = L("r") + "px";
      shape.style.setProperty("--rot", L("rot") + "deg");
      shape.style.setProperty("--ts", String(L("ts")));

      // Seamlessly synchronize dark inversion across the entire expansion window [0.68..0.92]
      const kVal = smooth(0.68, 0.92, p);
      shape.style.setProperty("--k", String(kVal));
      shape.style.setProperty("--ox", p * 40 - 20 + "%");
      stage.style.setProperty("--p", String(p));
      stage.style.setProperty("--k", String(kVal));

      const idx = i + (t > 0.55 ? 1 : 0);
      if (idx !== shown) {
        shown = idx;
        updateContent(idx);
      }
    };

    let queued = 0;
    const schedule = () => {
      if (!queued) {
        queued = requestAnimationFrame(() => {
          queued = 0;
          update();
        });
      }
    };

    const handleRailClick = (idx: number) => {
      // Smooth scroll to keyframe position relative to track top
      const top = parseFloat(getComputedStyle(pin).top) || 0;
      const trackTop = track.getBoundingClientRect().top + window.scrollY;
      const maxScroll = track.offsetHeight - pin.offsetHeight;
      const targetScrollY = trackTop - top + KF[idx].p * maxScroll;
      window.scrollTo({ top: targetScrollY, behavior: "smooth" });
    };

    items.forEach((li, idx) => {
      li.addEventListener("click", () => handleRailClick(idx));
    });

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", () => {
      measure();
      schedule();
    });

    measure();
    updateContent(0);
    update();

    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", measure);
      items.forEach((li, idx) => {
        li.removeEventListener("click", () => handleRailClick(idx));
      });
      if (queued) cancelAnimationFrame(queued);
    };
  }, []);

  return (
    <section className="lab" data-note="Scroll morph">
      <div className="lab-head">
        <h2>From market observation to enforced action.</h2>
        <p>
          {simpleMode
            ? "The five protocol stages: Observe, Evaluate, Authorize, Execute, and Recover."
            : "The section pins while one shape travels through the five protocol stages: Observe, Evaluate, Authorize, Execute, and Recover full frame."}
        </p>
      </div>
      <div className="sm-track" id="sm" ref={trackRef}>
        <div className="sm-pin">
          <div className="stage guides sm-stage" data-note="Scroll morph">
            <div
              className="sm-shape"
              id="sm-shape"
              data-shape="circle"
              aria-label="Circuit protocol mechanism shape"
            >
              <i className="ink" />
              <i className="sm-black" />
              <i className="ink w sm-w" />
              <div className="sm-txt">
                {MECHANISMS.map((m, i) => (
                  <strong
                    key={m.name}
                    className={`sm-stage-word ${i === 0 ? "is-active" : ""}`}
                    data-stage={i}
                  >
                    {m.name}
                  </strong>
                ))}
              </div>
            </div>

            <ol className="sm-rail" id="sm-rail" aria-label="Protocol execution formats">
              <li aria-current="true">OBSERVE</li>
              <li>EVALUATE</li>
              <li>AUTHORIZE</li>
              <li>EXECUTE</li>
              <li>RECOVER</li>
            </ol>
            <i className="sm-bar" />
          </div>
        </div>
      </div>
    </section>
  );
};
