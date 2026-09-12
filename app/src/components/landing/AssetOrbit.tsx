import React, { useMemo } from "react";

import { asset } from "../../data/tickers";
import { BrandMark } from "../ui/BrandMark";

/**
 * Section 02's diagram: the whole asset universe as three counter-rotating rings.
 *
 * Where the hero shows a cropped fragment of the system, this shows all of it -
 * one closed figure, every catalogued asset on it. Rings alternate direction
 * (out, in, out) so the figure reads as a mechanism with moving parts rather than
 * as one object turning; adjacent rings drifting against each other is what makes
 * the layering legible without drawing a single depth cue.
 *
 * Marks are white here, not brand-coloured. Twenty-two brand palettes in one
 * closed circle reads as confetti; the hero already carries the colour, and this
 * section's job is to show scale.
 *
 * Same rigid-assembly trick as the hero: one animation per ring, and an
 * equal-and-opposite animation on each node so every logo stays upright. Reversed
 * rings reverse both, which keeps the cancellation exact.
 */

interface Ring {
  /** Orbit radius as a fraction of the box. */
  radius: number;
  /** Node diameter as a fraction of the box. */
  node: number;
  /** true spins anticlockwise. Alternated per ring. */
  reverse: boolean;
  /** Revolution period. */
  spin: string;
  /** Opacity. Outer rings sit back. */
  dim: number;
  /** Static angular offset in degrees. */
  phase: number;
  symbols: string[];
}

/**
 * Radii and node sizes are one interdependent set, so they live together.
 * Clearances at these values, as fractions of the box:
 *   within ring   0.038 / 0.118 / 0.248
 *   between rings 0.024 / 0.032
 * All positive, and fixed for all time because each ring is rigid.
 */
const RINGS: Ring[] = [
  {
    radius: 0.14,
    node: 0.088,
    reverse: false,
    spin: "150s",
    dim: 1,
    phase: 0,
    symbols: ["NVDA", "AAPL", "MSFT", "AMZN", "GOOGL", "META", "TSLA"],
  },
  {
    radius: 0.245,
    node: 0.074,
    reverse: true,
    spin: "190s",
    dim: 0.7,
    phase: 22,
    symbols: ["NFLX", "COIN", "HOOD", "AMD", "INTC", "JPM", "V", "MA"],
  },
  {
    radius: 0.345,
    node: 0.062,
    reverse: false,
    spin: "240s",
    dim: 0.46,
    phase: 12,
    // The four assets with no available mark sit furthest out, where a
    // typographic lockup reads as depth rather than as something missing.
    symbols: ["MCD", "NKE", "KO", "DIS", "PEP", "MU", "MRVL"],
  },
];

export function AssetOrbit() {
  const rings = useMemo(
    () =>
      RINGS.map((ring) => ({
        ring,
        nodes: ring.symbols
          .map((symbol, i) => {
            const a = asset(symbol);
            if (!a) return null;
            return {
              key: symbol,
              a,
              angle: ring.phase + (360 / ring.symbols.length) * i,
            };
          })
          .filter((x): x is NonNullable<typeof x> => Boolean(x)),
      })),
    []
  );

  return (
    <div className="uniorb" aria-hidden="true">
      {rings.map(({ ring, nodes }) => (
        <div
          key={ring.radius}
          className={`uniorb__ring${ring.reverse ? " uniorb__ring--rev" : ""}`}
          style={{
            ["--spin" as string]: ring.spin,
            ["--dim" as string]: ring.dim,
          }}
        >
          {/* The path each ring travels. Hairline: enough to group the nodes,
              not enough to become the subject. */}
          <span
            className="uniorb__path"
            style={{ ["--r" as string]: ring.radius }}
          />

          {nodes.map((n) => (
            <div
              key={n.key}
              className="uniorb__arm"
              style={{
                ["--a" as string]: `${n.angle}deg`,
                ["--r" as string]: ring.radius,
              }}
            >
              <div
                className="uniorb__node"
                style={{ ["--d" as string]: ring.node }}
              >
                <BrandMark asset={n.a} size={22} tone="mono" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default AssetOrbit;
