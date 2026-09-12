import React, { useMemo } from "react";

import { asset } from "../../data/tickers";
import { Mark } from "../ui/BrandMark";

/**
 * The hero visual: tokenized equities orbiting a point off the right edge of the
 * frame, turning slowly and continuously.
 *
 * WHY IT IS NOT WEBGL
 * This was three.js and @react-three/fiber, which is 836KB of JavaScript to draw
 * what is geometrically a set of icons on concentric circles. As DOM and CSS it is
 * a few hundred bytes, needs no lazy chunk, and paints with the first frame
 * instead of after a deferred bundle parses.
 *
 * HOW IT SPINS
 * One animation turns the whole arm assembly; an equal-and-opposite animation on
 * each node keeps its logo upright. Both are linear and share a duration, so the
 * rotations cancel exactly. Nothing here reads scroll position and nothing reads
 * the pointer - the rotation is constant, so the composition never lurches when
 * the page moves or the cursor does.
 *
 * WHY THE CENTRE IS OFF-SCREEN
 * The assembly is wider than the viewport and its centre sits near the right edge,
 * so roughly half the circle is in frame and the rest continues past it.
 *
 * DEPTH
 * There are no orbit lines to imply distance, so depth is carried entirely by the
 * nodes: each ring outward is smaller, dimmer, less saturated and darker. That is
 * what the `dim`, `sat` and `bright` values below are for - a back-ring logo is a
 * muted version of its own brand colour rather than a smaller copy of the front.
 *
 * Logos only. No company names, no tickers, no prices; the catalogue in section 02
 * carries the names as selectable text.
 */

interface Ring {
  /** Orbit radius as a fraction of the assembly box. */
  radius: number;
  /** Node diameter as a fraction of the assembly box. */
  node: number;
  /** Opacity, saturation and brightness. Together these are the depth cue. */
  dim: number;
  sat: number;
  bright: number;
  /** Static angular offset in degrees, so rings do not line up spoke for spoke. */
  phase: number;
  symbols: string[];
}

/**
 * Even angular spacing is what makes overlap impossible rather than unlikely: the
 * gap between two nodes on a ring is a constant 360/count, and the gap between
 * rings is the constant difference of their radii. The assembly is rigid - every
 * ring shares one animation - so neither figure can change at runtime.
 *
 * Radii are spaced 0.125 of the box apart, which clears the largest pair of
 * half-nodes (0.052 + 0.042) with room over.
 */
const RINGS: Ring[] = [
  {
    radius: 0.22,
    node: 0.104,
    dim: 1,
    sat: 1,
    bright: 1,
    phase: 14,
    symbols: ["NVDA", "AAPL", "MSFT", "TSLA", "AMZN", "META"],
  },
  {
    radius: 0.345,
    node: 0.084,
    dim: 0.74,
    sat: 0.78,
    bright: 0.82,
    phase: 30,
    symbols: ["GOOGL", "NFLX", "COIN", "HOOD", "AMD", "INTC", "JPM"],
  },
  {
    radius: 0.47,
    node: 0.068,
    dim: 0.56,
    sat: 0.52,
    bright: 0.7,
    phase: 8,
    symbols: ["V", "MA", "MCD", "NKE", "KO", "DIS", "PEP", "MU", "MRVL"],
  },
];

export function HeroOrbit() {
  const arms = useMemo(
    () =>
      RINGS.flatMap((ring, ri) =>
        ring.symbols.map((symbol, i) => {
          const a = asset(symbol);
          if (!a?.mark) return null;
          return {
            key: `${ri}:${symbol}`,
            mark: a.mark,
            angle: ring.phase + (360 / ring.symbols.length) * i,
            ring,
          };
        })
      ).filter((x): x is NonNullable<typeof x> => Boolean(x)),
    []
  );

  return (
    <div className="orbit" aria-hidden="true">
      <div className="orbit__spin">
        {arms.map((arm) => (
          <div
            key={arm.key}
            className="orbit__arm"
            style={{
              ["--a" as string]: `${arm.angle}deg`,
              ["--r" as string]: arm.ring.radius,
            }}
          >
            <div
              className="orbit__node"
              style={{
                ["--d" as string]: arm.ring.node,
                ["--dim" as string]: arm.ring.dim,
                ["--sat" as string]: arm.ring.sat,
                ["--bright" as string]: arm.ring.bright,
              }}
            >
              <Mark mark={arm.mark} size={24} tone="brand" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default HeroOrbit;
