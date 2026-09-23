import React, { useEffect, useRef } from "react";

interface TiltedStackProps {
  simpleMode: boolean;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export const TiltedStack: React.FC<TiltedStackProps> = ({ simpleMode }) => {
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const words = [
      "CIRCUIT RISK KERNEL",
      "MARKET STATE VECTOR",
      "PYTH ORACLE VALIDATION",
      "RISK RATCHET",
      "DYNAMIC CAPITAL POLICY",
      "POSITION-AWARE PERMISSIONS",
      "RISK ENVELOPES",
      "BOUNDED AGENT AUTHORITY",
      "EXPIRING AUTHORIZATION",
      "SINGLE-USE CAPABILITIES",
      "RISK EPOCH VALIDATION",
      "CPI-VERIFIABLE PERMISSIONS",
      "CREDIT EXECUTION",
      "METEORA DBC EXECUTION",
      "ONCHAIN POLICY",
      "ONCHAIN DECISION STATE",
      "REAL-TIME PROTOCOL STATE",
      "SOLANA DEVNET",
      "RUST / ANCHOR",
      "OPEN SOURCE",
    ];
    const set = words.map(w => `<p>${w}</p>`).join("");
    track.innerHTML = set + set + set;

    let h = 0, y = 0, v = 0, last = window.scrollY, on = false, rafId = 0;
    const measure = () => { h = track.scrollHeight / 3; };
    measure();
    window.addEventListener("resize", measure);

    const onScroll = () => {
      v += (window.scrollY - last) * 0.25;
      last = window.scrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    const loop = () => {
      if (!on) { rafId = 0; return; }
      rafId = requestAnimationFrame(loop);
      if (h) {
        v = clamp(v, -50, 50);
        y = ((y + 0.5 + v) % h + h) % h;
        track.style.transform = `translate3d(0,${-y}px,0) skewY(${clamp(v * 0.2, -8, 8)}deg)`;
      }
      v *= 0.92;
    };

    const io = new IntersectionObserver(([e]) => {
      on = e.isIntersecting;
      if (on && !rafId) rafId = requestAnimationFrame(loop);
    });
    if (track.parentElement) io.observe(track.parentElement);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", onScroll);
      io.disconnect();
    };
  }, []);

  return (
    <section className="lf-lab" data-note="Tilted type stack">
      <div className="lf-lab-head">
        <h2>Capital is conditional.</h2>
        <p>
          Capital authority is not a permanent boolean. Effective permission depends on market state + position state + capital policy + actor authority + action limits. As conditions change, the permitted capital boundary changes with them.
        </p>
      </div>
      <div className="lf-stage lf-stack-stage">
        <div className="lf-stack-frame">
          <div className="lf-stack-track" ref={trackRef} />
        </div>
      </div>
    </section>
  );
};
