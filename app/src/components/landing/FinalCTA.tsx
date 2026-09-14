import React from "react";
import { Link } from "react-router-dom";

import { CLUSTER_LABEL } from "../../env";
import { LOGO_VIEWBOX } from "../../data/logos";
import { asset } from "../../data/tickers";
import { Icon } from "../ui";
import { Reveal } from "../ui/Reveal";

/**
 * Section 09 - The Final Call to Action
 * 
 * Reinforces the core principle: "CREDIT IS THE LAST STEP, NEVER THE FIRST."
 * Primary CTA: EXPLORE CIRCUIT
 * Secondary CTA: LAUNCH APP
 */

const VB_W = 1200;
const VB_H = 560;
const CX = VB_W / 2;
const CY = 760;

const RINGS = [300, 424, 540];

const MIRRORED: { ring: number; offset: number; symbol: string; pair: string }[] = [
  { ring: 0, offset: 15, symbol: "AAPL", pair: "NVDA" },
  { ring: 1, offset: 13, symbol: "MSFT", pair: "AMZN" },
  { ring: 1, offset: 39, symbol: "TSLA", pair: "META" },
  { ring: 2, offset: 27, symbol: "GOOGL", pair: "NFLX" },
  { ring: 2, offset: 52, symbol: "JPM", pair: "COIN" },
];

const RING_DIM = [0.9, 0.6, 0.36];
const CHIP_R = [27, 23, 20];

function pt(deg: number, r: number) {
  const a = (deg * Math.PI) / 180;
  return { x: CX + Math.cos(a) * r, y: CY - Math.sin(a) * r };
}

const PLACED = MIRRORED.flatMap((m) => [
  { key: `${m.symbol}-l`, symbol: m.symbol, ring: m.ring, deg: 90 + m.offset },
  { key: `${m.pair}-r`, symbol: m.pair, ring: m.ring, deg: 90 - m.offset },
]);

export function FinalCTA() {
  return (
    <section className="sec final" id="cta">
      <div className="final__art" aria-hidden="true">
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMax slice"
        >
          <defs>
            <radialGradient id="finPool" cx="50%" cy="100%" r="72%">
              <stop offset="0%" stopColor="#8b7bc4" stopOpacity="0.1" />
              <stop offset="58%" stopColor="#6f6690" stopOpacity="0.035" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="finFade" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
              <stop offset="62%" stopColor="#ffffff" stopOpacity="0.42" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0" />
            </linearGradient>
            <mask id="finMask">
              <rect width={VB_W} height={VB_H} fill="url(#finFade)" />
            </mask>
          </defs>

          <rect width={VB_W} height={VB_H} fill="url(#finPool)" />

          <g mask="url(#finMask)">
            <g fill="none" stroke="#ffffff">
              {RINGS.map((r, i) => (
                <circle
                  key={r}
                  cx={CX}
                  cy={CY}
                  r={r}
                  strokeOpacity={0.13 - i * 0.032}
                />
              ))}
            </g>

            {PLACED.map((p) => {
              const a = asset(p.symbol);
              if (!a?.mark) return null;
              const { x, y } = pt(p.deg, RINGS[p.ring]);
              const chip = CHIP_R[p.ring];
              const box = chip * 1.1;
              const s = (box / LOGO_VIEWBOX) * a.mark.optical;
              const drawn = box * a.mark.optical;
              return (
                <g key={p.key} opacity={RING_DIM[p.ring]}>
                  <circle cx={x} cy={y} r={chip} fill="#0a0a0c" fillOpacity="0.82" />
                  <circle
                    cx={x}
                    cy={y}
                    r={chip}
                    fill="none"
                    stroke="#ffffff"
                    strokeOpacity="0.12"
                  />
                  <g
                    transform={
                      `translate(${x - box / 2 + (box - drawn) / 2} ` +
                      `${y - box / 2 + (box - drawn) / 2}) scale(${s})`
                    }
                  >
                    <path d={a.mark.d} fill="#ffffff" fillOpacity="0.86" />
                  </g>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <div className="sec__inner">
        <Reveal className="final__plate">
          <p className="final__index">
            <span className="final__index__n">09</span>
            <span className="final__index__t">Conclusion</span>
          </p>

          <h2 className="final__statement">
            Credit is the last step.
            <br />
            <em>Never the first.</em>
          </h2>

          <p className="final__sub">
            Circuit turns tokenized equities into risk-aware programmable collateral, where market conditions determine what capital is allowed to do.
          </p>

          <div className="final__cta">
            <a href="#pipeline" className="btn btn--primary btn--lg">
              Explore Circuit
              <Icon name="arrowRight" size={17} />
            </a>
            <Link to="/app" className="btn btn--secondary btn--lg">
              Launch App
            </Link>
          </div>

          <p className="final__meta">
            <span className="dot" aria-hidden="true" />
            Deployed on Solana
            <span className="final__meta__sep" aria-hidden="true" />
            <span className="dot" aria-hidden="true" />
            {CLUSTER_LABEL}
            <span className="final__meta__sep" aria-hidden="true" />
            <span className="dot" aria-hidden="true" />
            4-State Ratchet Primitive
          </p>
        </Reveal>
      </div>
    </section>
  );
}

export default FinalCTA;
