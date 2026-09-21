import React, { useEffect, useRef } from "react";

interface ClockAndTiltedStackProps {
  simpleMode: boolean;
}

export const ClockAndTiltedStack: React.FC<ClockAndTiltedStackProps> = ({ simpleMode }) => {
  const dialRef = useRef<HTMLDivElement>(null);
  const outRef = useRef<HTMLOutputElement>(null);
  const liveBtnRef = useRef<HTMLButtonElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  // ── 1. CLOCK DIAL (Strictly format-kit.html lines 524–611) ──
  useEffect(() => {
    const dial = dialRef.current;
    const out = outRef.current;
    const liveBtn = liveBtnRef.current;
    if (!dial || !out || !liveBtn) return;

    dial.querySelectorAll(".tick, .dt").forEach(el => el.remove());

    for (let i = 1; i <= 12; i++) {
      const t = document.createElement("span");
      t.className = "tick";
      t.textContent = String(i);
      t.style.setProperty("--a", i * 30 + "deg");
      dial.append(t);
    }

    const cfg = [
      { s: 22, rad: 19, angle: 120, n: "A" },
      { s: 15, rad: 29, angle: 240, n: "B" },
      { s: 10, rad: 38, angle: 330, n: "C" },
    ];
    const paint = (d: { angle: number; rad: number; el: HTMLElement }) => {
      d.el.style.setProperty("--a", d.angle + "deg");
      d.el.style.setProperty("--rad", d.rad + "cqw");
    };
    const hour = (a: number) => ((Math.round(a / 30) % 12) + 12) % 12 || 12;
    const report = () => {
      out.textContent = dots.map(d => `${d.n} → ${hour(d.angle)}`).join("    ");
    };

    const dots = cfg.map((c, i) => {
      const el = document.createElement("div");
      el.className = "dt";
      el.tabIndex = 0;
      el.dataset.i = String(i);
      el.setAttribute("aria-label", `Dot ${c.n}. Arrow keys rotate and move it.`);
      el.style.setProperty("--s", c.s + "px");
      dial.append(el);
      const d = { ...c, el };
      paint(d);
      return d;
    });
    report();

    const raw = (e: PointerEvent, r: DOMRect) =>
      (Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) * 180) / Math.PI;
    let cur: (typeof dots)[0] | null = null;
    let prev = 0;
    let dialRect: DOMRect | null = null;

    const onPointerDown = (e: PointerEvent) => {
      const el = (e.target as HTMLElement).closest(".dt") as HTMLElement | null;
      if (!el) return;
      setLive(false);
      cur = dots[Number(el.dataset.i)];
      el.setPointerCapture(e.pointerId);
      el.classList.add("drag");
      dialRect = dial.getBoundingClientRect();
      prev = raw(e, dialRect);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!cur) return;
      if (!dialRect) dialRect = dial.getBoundingClientRect();
      const r = dialRect;
      const a = raw(e, r);
      cur.angle += ((a - prev + 540) % 360) - 180;
      prev = a;
      const dist = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
      cur.rad = Math.min(40, Math.max(8, (dist / r.width) * 100));
      paint(cur);
    };

    const drop = () => {
      if (!cur) return;
      dialRect = null;
      cur.el.classList.remove("drag");
      cur.angle = Math.round(cur.angle / 30) * 30;
      paint(cur);
      report();
      cur = null;
    };

    dial.addEventListener("pointerdown", onPointerDown);
    dial.addEventListener("pointermove", onPointerMove);
    dial.addEventListener("pointerup", drop);
    dial.addEventListener("pointercancel", drop);

    const onKeyDown = (e: KeyboardEvent) => {
      const el = (e.target as HTMLElement).closest(".dt") as HTMLElement | null;
      if (!el) return;
      const d = dots[Number(el.dataset.i)];
      if (e.key === "ArrowRight") d.angle += 30;
      else if (e.key === "ArrowLeft") d.angle -= 30;
      else if (e.key === "ArrowUp") d.rad = Math.min(40, Math.max(8, d.rad + 2));
      else if (e.key === "ArrowDown") d.rad = Math.min(40, Math.max(8, d.rad - 2));
      else return;
      e.preventDefault();
      setLive(false);
      paint(d);
      report();
    };
    dial.addEventListener("keydown", onKeyDown);

    let timer: any = 0;
    const tick = () => {
      const n = new Date();
      const s = n.getSeconds();
      const m = n.getMinutes() + s / 60;
      const h = (n.getHours() % 12) + m / 60;
      [h * 30, m * 6, s * 6].forEach((t, i) => {
        const d = dots[i];
        d.angle = t + 360 * Math.round((d.angle - t) / 360);
        paint(d);
      });
      out.textContent = n.toLocaleTimeString([], { hour12: false });
    };

    function setLive(on: boolean) {
      clearInterval(timer);
      timer = on ? setInterval(tick, 1000) : 0;
      liveBtn.setAttribute("aria-pressed", String(on));
      if (on) tick();
      else report();
    }

    const onLiveClick = () => setLive(liveBtn.getAttribute("aria-pressed") !== "true");
    liveBtn.addEventListener("click", onLiveClick);

    return () => {
      clearInterval(timer);
      dial.removeEventListener("pointerdown", onPointerDown);
      dial.removeEventListener("pointermove", onPointerMove);
      dial.removeEventListener("pointerup", drop);
      dial.removeEventListener("pointercancel", drop);
      dial.removeEventListener("keydown", onKeyDown);
      liveBtn.removeEventListener("click", onLiveClick);
    };
  }, []);

  // ── 2. TILTED TYPE STACK (Strictly format-kit.html lines 613–638) ──
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const words = [
      // 1. Core Architecture & Protocol Foundation
      "CIRCUIT PROTOCOL",
      "TOKENIZED STOCKS VAULT",
      "NON-RECOURSE DEBT",
      "SOLANA DEVNET EXECUTION",
      "CHECKED RUST ARITHMETIC",
      "ANCHOR PDA AUTHORITY",

      // 2. Liquidity & Borrow Products
      "OVER-COLLATERALIZED BORROWING",
      "INSTANT USDC LIQUIDITY",
      "DYNAMIC BONDING CURVES",
      "METEORA DBC INTEGRATION",
      "CROSS-MARGIN POSITIONING",
      "NON-CUSTODIAL SETTLEMENT",

      // 3. Autonomous Execution & Agent Flow
      "AUTONOMOUS AGENTS",
      "CRYPTOGRAPHIC RISK ENVELOPES",
      "PRE-AUTHORIZED DRAWDOWN LIMITS",
      "ONE-CLICK AUTHORITY REVOCATION",
      "PROGRAMMATIC REBALANCING",
      "PERMISSIONED PDA BOUNDARIES",

      // 4. Telemetry, Oracles & Confidence Bands
      "PYTH PULL ORACLES",
      "SUB-SECOND CONFIDENCE BANDS",
      "DUAL-BOUND PRICE VERIFICATION",
      "ZERO LATENCY ARBITRAGE",
      "REAL-TIME HEALTH METRICS",
      "DYNAMIC VOLATILITY MONITOR",

      // 5. Risk Ratchet & Protocol Solvency
      "DYNAMIC RISK RATCHET",
      "ASYMMETRIC LTV COMPRESSION",
      "NORMAL REGIME 70% LTV",
      "DEFENSIVE REGIME 50% LTV",
      "EMERGENCY SAFE STATE",
      "CAPITAL RECOVERY GUARANTEE",

      // 6. Liquidation & Dutch Auction Settlement
      "CONTINUOUS DUTCH AUCTIONS",
      "DETERMINISTIC PRICE DECAY",
      "ZERO MEV FRONTRUNNING",
      "ORDERLY DEBT CLEARING",
      "FLASH-CRASH RESISTANT",
      "INSTITUTIONAL SOLVENCY ENGINE",
    ];
    const set = words.map(w => `<p>${w}</p>`).join("");
    track.innerHTML = set + set + set;

    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let h = 0,
      y = 0,
      v = 0,
      last = window.scrollY,
      on = false,
      rafId = 0;

    const measure = () => {
      h = track.scrollHeight / 3;
    };
    measure();
    window.addEventListener("resize", measure);

    const onScroll = () => {
      v += (window.scrollY - last) * 0.3;
      last = window.scrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    const observer = new IntersectionObserver(([e]) => {
      on = e.isIntersecting;
    });
    if (track.parentElement) observer.observe(track.parentElement);

    const loop = () => {
      if (on && !still && h) {
        v = Math.min(60, Math.max(-60, v));
        y = (((y + 0.5 + v) % h) + h) % h;
        track.style.transform = `translate3d(0,${-y}px,0) skewY(${Math.min(9, Math.max(-9, v * 0.25))}deg)`;
      }
      v *= 0.92;
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, []);

  return (
    <section className="lab" data-note="Clock dial + Tilted type stack">
      <div className="lab-head">
        <h2>Slot Clock &amp; Execution Stack</h2>
        <p>
          {simpleMode
            ? "Left: Epoch slot synchronization. Right: High-velocity protocol primitives sliding with scroll inertia."
            : "Left: Real-time Solana block time and Pyth oracle update slots. Right: Continuous momentum word loop inside a -8° skewed frame with scroll physics."}
        </p>
      </div>

      <div className="lf-pair-grid">
        {/* Left: Clock Dial */}
        <div className="stage guides" data-note="Clock dial" style={{ height: "min(92vh, 780px)", display: "grid", placeItems: "center" }}>
          <div className="dial-wrap">
            <div className="dial" id="dial" ref={dialRef}>
              <span className="meta">
                (Epoch)<b>Slot Clock</b>
              </span>
            </div>
            <output className="readout" id="dial-out" ref={outRef} />
            <div className="dial-tools">
              <button className="lf-pill dial-live-btn" id="dial-live" ref={liveBtnRef} aria-pressed="false">
                Live Epoch
              </button>
            </div>
          </div>
        </div>

        {/* Right: Tilted Type Stack */}
        <div className="stage guides" data-note="Tilted type stack" style={{ height: "min(92vh, 780px)", display: "grid", placeItems: "center" }}>
          <div className="stack-stage" style={{ padding: 0 }}>
            <div className="stack lf-stack" id="stack">
              <div className="track lf-track" id="track" ref={trackRef} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
