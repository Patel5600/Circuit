import React from "react";

import { LOGO_VIEWBOX, type LogoMark } from "../../data/logos";
import type { TickerAsset } from "../../data/tickers";
import { useTheme } from "../../context/ThemeContext";

/**
 * Renders a brand mark as SVG.
 *
 * One source of geometry (data/logos.ts) and one centred optical scale, so a mark
 * is the same weight wherever it appears.
 *
 * Two tones:
 *   mono  - inherits currentColor. Used in dense lists, where 22 brand colours
 *           in a column would read as noise rather than as a catalogue.
 *   brand - the owner's colour, or its reversed variant when the published colour
 *           is too dark to separate from this page's near-black. Multi-colour
 *           marks (Microsoft) paint each part with its own fill.
 */

export type MarkTone = "mono" | "brand";

export function Mark({
  mark,
  size = 24,
  tone = "mono",
  className,
  title,
}: {
  mark: LogoMark;
  size?: number;
  tone?: MarkTone;
  className?: string;
  /** Supply only when the mark is the sole carrier of meaning. */
  title?: string;
}) {
  const s = mark.optical;
  const offset = (LOGO_VIEWBOX * (1 - s)) / 2;
  const labelled = Boolean(title);
  const { theme } = useTheme();

  return (
    <svg
      className={className}
      viewBox={`0 0 ${LOGO_VIEWBOX} ${LOGO_VIEWBOX}`}
      width={size}
      height={size}
      role={labelled ? "img" : undefined}
      aria-label={labelled ? title : undefined}
      aria-hidden={labelled ? undefined : true}
      focusable="false"
    >
      <g transform={`translate(${offset} ${offset}) scale(${s})`}>
        {tone === "brand" && mark.parts
          ? mark.parts.map((p) => <path key={p.d} d={p.d} fill={p.fill} />)
          : (
            <path
              d={mark.d}
              fill={tone === "brand" ? (theme === "light" ? (mark.hex || mark.onDark) : mark.onDark) : "currentColor"}
            />
          )}
      </g>
    </svg>
  );
}

/**
 * An asset's mark, or a typographic lockup when no mark is available.
 *
 * The fallback is deliberately not a letter in a circle: it is the symbol set
 * tight under a hairline rule, which reads as a treatment rather than as a
 * missing asset.
 */
export function BrandMark({
  asset,
  size = 24,
  tone = "mono",
}: {
  asset: TickerAsset;
  size?: number;
  tone?: MarkTone;
}) {
  if (!asset.mark) {
    return (
      <span className="brandmark brandmark--type" style={{ width: size }}>
        {asset.symbol}
      </span>
    );
  }
  return (
    <Mark
      mark={asset.mark}
      size={size}
      tone={tone}
      className="brandmark"
      title={`${asset.name} (${asset.token})`}
    />
  );
}
