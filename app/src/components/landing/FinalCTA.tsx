import React from "react";
import { Link } from "react-router-dom";

import { CLUSTER_LABEL } from "../../env";
import { LOGO_VIEWBOX } from "../../data/logos";
import { asset } from "../../data/tickers";
import { Icon } from "../ui";
import { Reveal } from "../ui/Reveal";

/**
 * Section 08 - the close.
 *
 * A single centred plate. Everything sits on one axis: the arc's centre, the
 * statement, the buttons and the meta line all share the same x, and the arc's
 * marks are placed in mirrored pairs about vertical so the dome is symmetric by
 * construction rather than by eye.
 *
 * The artwork is the hero's mechanism seen head-on and at rest: no rotation, no
 * colour, no crop. The hero opens with a fragment of the system; this closes with
 * the whole of it, quiet.
 *
 * Positions are computed rather than hand-written so the symmetry cannot drift when
 * a mark is added or removed - see MIRRORED below.
 */

const VB_W = 1200;
const VB_H = 560;
/** Arc centre. On the vertical axis, below the frame, so only the dome shows. */
const CX = VB_W / 2;
const CY = 760;

const RINGS = [300, 424, 540];

/**
 * Marks as mirrored pairs, given by their offset in degrees from vertical. The
 * renderer emits each at 90 - offset and 90 + offset, so the dome is symmetric
 * whatever is in this list.
 */
const MIRRORED: { ring: number; offset: number; symbol: string; pair: string }[] = [
  { ring: 0, offset: 15, symbol: "AAPL", pair: "NVDA" },
  { ring: 1, offset: 13, symbol: "MSFT", pair: "AMZN" },
  { ring: 1, offset: 39, symbol: "TSLA", pair: "META" },
  { ring: 2, offset: 27, symbol: "GOOGL", pair: "NFLX" },
  { ring: 2, offset: 52, symbol: "JPM", pair: "COIN" },
];

/** Opacity per ring: the dome falls away as it widens. */
const RING_DIM = [0.9, 0.6, 0.36];
const CHIP_R = [27, 23, 20];

function pt(deg: number, r: number) {
  const a = (deg * Math.PI) / 180;
  return { x: CX + Math.cos(a) * r, y: CY - Math.sin(a) * r };
}

interface Placed {
  key: string;
  symbol: string;
  ring: number;
  deg: number;
}

const PLACED: Placed[] = MIRRORED.flatMap((m) => [
  { key: `${m.symbol}-l`, symbol: m.symbol, ring: m.ring, deg: 90 + m.offset },
  { key: `${m.pair}-r`, symbol: m.pair, ring: m.ring, deg: 90 - m.offset },
]);

export function FinalCTA() {
  return (
    <section className="sec final">
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
            {/* Fades the dome out toward the top, so it never fights the type. */}
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
            <span className="final__index__n">08</span>
            <span className="final__index__t">Start</span>
          </p>

          <h2 className="final__statement">
            Your equities.
            <br />
            Your collateral.
            <br />
            <em>Programmable credit.</em>
          </h2>

          <p className="final__sub">
            Deposit tokenized equity, let the protocol verify the price and the
            market, and borrow against what it confirms.
          </p>

          <div className="final__cta">
            <Link to="/app" className="btn btn--primary btn--lg">
              Launch circuit
              <Icon name="arrowRight" size={17} />
            </Link>
            <a href="#how" className="btn btn--ghost btn--lg">
              Explore how it works
            </a>
          </div>

          <p className="final__meta">
            <span className="dot" aria-hidden="true" />
            Built on Solana
            <span className="final__meta__sep" aria-hidden="true" />
            <span className="dot" aria-hidden="true" />
            {CLUSTER_LABEL}
          </p>
        </Reveal>
      </div>
    </section>
  );
}

export default FinalCTA;
