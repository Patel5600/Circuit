import React from "react";
import { getAssetMark, cleanSymbol, LOGO_VIEWBOX } from "../../data/logos";

export interface AssetLogoProps {
  symbol: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  fallbackText?: boolean;
}

/**
 * Institutional Asset Logo Component.
 *
 * Renders authentic, pixel-accurate vector brand marks for all supported tokenized equities.
 * Strictly avoids generic placeholder icons, raster assets, emojis, or network image fetches.
 * Applies optical size correction centered on the canonical 24x24 coordinate box.
 */
export function AssetLogo({
  symbol,
  size = 24,
  className,
  style,
  fallbackText = false,
}: AssetLogoProps) {
  const norm = cleanSymbol(symbol);
  const mark = getAssetMark(norm);

  if (!mark) {
    if (fallbackText) {
      return (
        <span
          className={className}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: size,
            height: size,
            borderRadius: Math.max(4, Math.floor(size * 0.2)),
            background: "var(--surface-2, #181b24)",
            border: "1px solid var(--border, #262b3a)",
            fontFamily: "var(--mono)",
            fontSize: Math.max(9, Math.floor(size * 0.38)),
            fontWeight: 700,
            color: "var(--text)",
            userSelect: "none",
            ...style,
          }}
        >
          {norm.slice(0, 3)}
        </span>
      );
    }

    return (
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${LOGO_VIEWBOX} ${LOGO_VIEWBOX}`}
        className={className}
        style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0, ...style }}
        aria-label={norm}
      >
        <rect
          width="24"
          height="24"
          rx="5"
          fill="var(--surface-2, #181b24)"
          stroke="var(--border, #262b3a)"
          strokeWidth="1"
        />
        <text
          x="12"
          y="15.5"
          textAnchor="middle"
          fill="var(--text, #f2f1ee)"
          fontSize="9"
          fontFamily="var(--mono)"
          fontWeight="700"
        >
          {norm.slice(0, 3)}
        </text>
      </svg>
    );
  }

  const optical = mark.optical || 1;
  const cx = LOGO_VIEWBOX / 2;
  const cy = LOGO_VIEWBOX / 2;
  const transform = optical !== 1
    ? `translate(${cx * (1 - optical)}, ${cy * (1 - optical)}) scale(${optical})`
    : undefined;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${LOGO_VIEWBOX} ${LOGO_VIEWBOX}`}
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0, ...style }}
      aria-label={mark.title || norm}
      role="img"
    >
      <g transform={transform}>
        {mark.parts && mark.parts.length > 0 ? (
          mark.parts.map((p, idx) => (
            <path key={idx} d={p.d} fill={p.fill} />
          ))
        ) : (
          <path d={mark.d} fill={mark.onDark || mark.hex} />
        )}
      </g>
    </svg>
  );
}
