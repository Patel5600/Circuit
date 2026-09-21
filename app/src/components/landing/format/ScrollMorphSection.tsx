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
    name: "Dutch Auctions",
    desc: "Circuit deploys continuous Dutch auctions for non-recourse debt liquidations across 150 Solana slots. Execution prices decay smoothly along deterministic curves to eliminate toxic MEV frontrunning and fire-sale insolvencies, auctioning the exact minimum collateral needed to restore health factor to 1.05.",
    shapeType: "circle" as const,
  },
  {
    name: "Autonomous Agents",
    desc: "Autonomous Agents execute capital allocation strictly within user-signed cryptographic risk envelopes bound to Anchor PDA seeds. Programmatically restricted by pre-authorized drawdown limits, maximum allowable slippage, and instant one-click authority revocation.",
    shapeType: "rounded" as const,
  },
  {
    name: "Risk Ratchet",
    desc: "The dynamic Risk Ratchet operates a 4-tier solvency governor across Normal, Caution, Defensive, and Emergency regimes. Volatility shocks swiftly compress collateral LTV from 70% down to 50%, while capital recovery repayments remain unconditionally operational.",
    shapeType: "vertical" as const,
  },
  {
    name: "Pyth Confidence",
    desc: "Dual-bound Pyth pull oracles stream high-frequency price feeds with sub-second confidence intervals (P ± σ). The protocol verifies publication slot freshness and flags oracle manipulation whenever confidence spread exceeds the 200 bps safety tolerance.",
    shapeType: "horizontal" as const,
  },
  {
    name: "Safe State",
    desc: "Safe State activates as an emergency circuit breaker whenever oracle confidence fails, price deviation spikes, or drawdowns breach protocol boundaries. Halts all new debt creation and leverage expansion while preserving liquidations and debt repayments.",
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
    const cap = track.querySelector<HTMLElement>("#sm-cap");
    const items = track.querySelectorAll<HTMLLIElement>("#sm-rail li");
    const stage = track.querySelector<HTMLDivElement>(".sm-stage");

    if (!pin || !shape || !cap || !stage) return;

    // 5 Architectural Formats with responsive geometry (format 5 expands to full frame W x H)
    const KF = [
      { p: 0, w0: 320, h0: 320, r: 160, rot: -6, ts: 1, name: "Dutch Auctions", w: 0, h: 0 },
      { p: 0.22, w0: 540, h0: 180, r: 90, rot: 4, ts: 1, name: "Autonomous Agents", w: 0, h: 0 },
      { p: 0.45, w0: 280, h0: 410, r: 16, rot: -4, ts: 1, name: "Risk Ratchet", w: 0, h: 0 },
      { p: 0.68, w0: 480, h0: 300, r: 16, rot: 2, ts: 1, name: "Pyth Confidence", w: 0, h: 0 },
      { p: 0.92, w0: 0, h0: 0, r: 0, rot: 0, ts: 3, name: "Safe State", w: 0, h: 0 },
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
    let whiteTimeout: number | undefined;

    const measure = () => {
      W = pin.clientWidth;
      H = pin.clientHeight;
      KF.forEach((k, i) => {
        k.w = i === KF.length - 1 ? W : Math.min(k.w0, W * 0.9);
        k.h = i === KF.length - 1 ? H : Math.min(k.h0, H * 0.8);
      });
    };

    const num = track.querySelector<HTMLElement>("#sm-n");

    const updateContent = (idx: number) => {
      const m = MECHANISMS[idx];
      if (!m) return;
      if (cap) cap.textContent = m.name;
      if (num) num.textContent = `(${idx + 1})`;
      shape.dataset.shape = m.shapeType;

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
      // Gentle sinusoidal curve for the expansion into Safe State
      const t = i === 3 ? (0.5 - 0.5 * Math.cos(rawT * Math.PI)) : ease(rawT);
      const L = (k: "w" | "h" | "r" | "rot" | "ts") => a[k] + (b[k] - a[k]) * t;

      shape.style.width = L("w") + "px";
      shape.style.height = L("h") + "px";
      shape.style.borderRadius = L("r") + "px";
      shape.style.setProperty("--rot", L("rot") + "deg");
      shape.style.setProperty("--ts", String(L("ts")));

      // Synchronize dark inversion smoothly with format-kit-2 exact timing
      const kVal = smooth(0.78, 0.95, p);
      shape.style.setProperty("--k", String(kVal));
      shape.style.setProperty("--ox", p * 40 - 20 + "%");
      stage.style.setProperty("--p", String(p));
      stage.style.setProperty("--k", String(kVal));

      const idx = i + (t > 0.5 ? 1 : 0);
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
        <h2>Architectural Formats</h2>
        <p>
          {simpleMode
            ? "Circuit's five core protocol mechanisms: Dutch auctions, autonomous agents, risk ratchet, Pyth confidence, and safe state."
            : "The section pins while one shape travels through five protocol formats: Dutch auctions, autonomous agents, risk ratchet, Pyth confidence, and safe state full frame."}
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
                <small id="sm-n">(1)</small>
                <strong id="sm-cap">Dutch Auctions</strong>
              </div>
            </div>

            <ol className="sm-rail" id="sm-rail" aria-label="Protocol execution formats">
              <li aria-current="true">(1) Dutch Auctions</li>
              <li>(2) Autonomous Agents</li>
              <li>(3) Risk Ratchet</li>
              <li>(4) Pyth Confidence</li>
              <li>(5) Safe State</li>
            </ol>
            <i className="sm-bar" />
          </div>
        </div>
      </div>
    </section>
  );
};
