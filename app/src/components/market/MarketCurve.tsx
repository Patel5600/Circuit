import React, { useId } from "react";

interface MarketCurveProps {
  points: number[];
  width: number;
  height: number;
  isPositive: boolean;
  strokeWidth?: number;
  showArea?: boolean;
  showLastDot?: boolean;
}

/**
 * Builds a smooth cubic Bezier spline SVG path from discrete financial observations.
 * Eliminates straight artificial segments and delivers organic market curvature.
 */
export function buildSmoothSplinePath(
  coords: Array<{ x: number; y: number }>
): string {
  if (coords.length === 0) return "";
  if (coords.length === 1) return `M ${coords[0].x} ${coords[0].y}`;
  if (coords.length === 2) {
    const p0 = coords[0];
    const p1 = coords[1];
    const mx = (p0.x + p1.x) / 2;
    return `M ${p0.x} ${p0.y} C ${mx} ${p0.y}, ${mx} ${p1.y}, ${p1.x} ${p1.y}`;
  }

  let d = `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`;

  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = i > 0 ? coords[i - 1] : coords[i];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = i < coords.length - 2 ? coords[i + 2] : p2;

    // Catmull-Rom to Cubic Bezier conversion with tension = 0.2
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;

    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }

  return d;
}

export function MarketCurve({
  points,
  width,
  height,
  isPositive,
  strokeWidth = 2,
  showArea = true,
  showLastDot = true,
}: MarketCurveProps) {
  const gradientId = useId();

  if (!points || points.length < 2) {
    return (
      <div
        style={{
          width,
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-3)",
          fontSize: 10,
          fontFamily: "var(--mono)",
        }}
      >
        NO HISTORY
      </div>
    );
  }

  const padY = Math.max(3, height * 0.1);
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  const coords = points.map((p, idx) => ({
    x: (idx / (points.length - 1)) * width,
    y: height - ((p - min) / range) * (height - 2 * padY) - padY,
  }));

  const linePath = buildSmoothSplinePath(coords);
  const lastCoord = coords[coords.length - 1];
  const firstCoord = coords[0];

  const strokeColor = isPositive ? "var(--mint, #7fc39a)" : "var(--danger, #cf8b8b)";
  const areaFill = `url(#${gradientId})`;

  const areaPath = `${linePath} L ${width} ${height} L ${firstCoord.x} ${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      style={{ overflow: "visible", display: "block" }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity={0.22} />
          <stop offset="60%" stopColor={strokeColor} stopOpacity={0.06} />
          <stop offset="100%" stopColor={strokeColor} stopOpacity={0.0} />
        </linearGradient>
      </defs>

      {showArea && (
        <path d={areaPath} fill={areaFill} style={{ transition: "fill 0.4s ease" }} />
      )}

      <path
        d={linePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ transition: "stroke 0.4s ease" }}
      />

      {showLastDot && lastCoord && (
        <circle
          cx={lastCoord.x}
          cy={lastCoord.y}
          r={strokeWidth * 1.3}
          fill={strokeColor}
          style={{ filter: `drop-shadow(0 0 4px ${strokeColor})` }}
        />
      )}
    </svg>
  );
}
