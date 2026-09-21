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
        <h2>Tilted Type Stack</h2>
        <p>
          {simpleMode
            ? "Words that slide and wobble when you scroll up and down."
            : "Endless ticker loop inside a -8° tilted frame. Scroll velocity drives inertia and skews typography."}
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
