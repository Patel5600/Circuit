/**
 * Circuit Protocol — DBC Curve Visualizer
 *
 * Interactive Canvas visualization of the Meteora DBC bonding curve.
 * Curve is oracle-price-derived and clearly labelled as illustrative.
 * Risk state drives visible execution boundary — actual restriction enforced on-chain.
 *
 * DATA HONESTY:
 * - No TVL, volume, or liquidity numbers are fabricated.
 * - Curve shape is based on oracle price from Pyth (if available) — labelled as such.
 * - Risk boundary moves based on real Circuit risk state.
 */
import React, { useEffect, useRef, useMemo } from "react";
import { DbcPoolState } from "../../context/DbcContext";

type RiskState = "SAFE" | "RESTRICTED" | "DEFENSIVE" | "EMERGENCY";

interface DbcCurveVisualizerProps {
  poolState: DbcPoolState | null;
  riskState: RiskState;
  oraclePrice: number | null;
  symbol: string;
  width?: number;
  height?: number;
}

const RISK_COLORS: Record<RiskState, { zone: string; text: string; label: string }> = {
  SAFE: { zone: "rgba(34,197,94,0.10)", text: "#22c55e", label: "SAFE — Full curve accessible" },
  RESTRICTED: { zone: "rgba(234,179,8,0.10)", text: "#eab308", label: "RESTRICTED — 50% volume cap" },
  DEFENSIVE: { zone: "rgba(249,115,22,0.10)", text: "#f97316", label: "DEFENSIVE — Entry blocked" },
  EMERGENCY: { zone: "rgba(239,68,68,0.10)", text: "#ef4444", label: "EMERGENCY — Exit only" },
};

export function DbcCurveVisualizer({
  poolState: _poolState,
  riskState,
  oraclePrice,
  symbol,
  width = 400,
  height = 200,
}: DbcCurveVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);
  const frameRef = useRef(0);

  const riskColors = RISK_COLORS[riskState];

  // Derive curve parameters from oracle price
  const curveParams = useMemo(() => {
    if (!oraclePrice || oraclePrice <= 0) return null;
    const basePrice = oraclePrice;
    const points: { x: number; y: number }[] = [];
    const steps = 80;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps; // 0 = genesis, 1 = graduation
      const price = basePrice * (1 + 3 * Math.pow(t, 1.5));
      points.push({ x: t, y: price });
    }
    return { points, basePrice };
  }, [oraclePrice]);

  // Compute boundary based on risk state
  const getBoundaryX = (rs: RiskState): number => {
    switch (rs) {
      case "SAFE": return 1.0;
      case "RESTRICTED": return 0.5;
      case "DEFENSIVE": return 0.0;
      case "EMERGENCY": return 0.0;
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const pad = { top: 20, right: 20, bottom: 30, left: 50 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    const draw = (frame: number) => {
      ctx.clearRect(0, 0, width, height);

      // Background
      ctx.fillStyle = "#0c0c0d";
      ctx.fillRect(0, 0, width, height);

      if (!curveParams) {
        ctx.fillStyle = "#52525b";
        ctx.font = "12px monospace";
        ctx.textAlign = "center";
        ctx.fillText("Curve data unavailable", width / 2, height / 2);
        ctx.fillText("Oracle price required", width / 2, height / 2 + 18);
        return;
      }

      const { points, basePrice } = curveParams;
      const maxPrice = points[points.length - 1].y;
      const minPrice = basePrice * 0.9;

      const toScreenX = (t: number) => pad.left + t * plotW;
      const toScreenY = (price: number) =>
        pad.top + plotH - ((price - minPrice) / (maxPrice - minPrice)) * plotH;

      // Risk zone overlay
      const boundaryX = getBoundaryX(riskState);
      if (boundaryX < 1.0) {
        ctx.fillStyle = riskColors.zone;
        const zoneStartX = toScreenX(boundaryX);
        ctx.fillRect(zoneStartX, pad.top, toScreenX(1.0) - zoneStartX, plotH);
      } else {
        ctx.fillStyle = riskColors.zone;
        ctx.fillRect(pad.left, pad.top, plotW, plotH);
      }

      // Curve path
      ctx.beginPath();
      ctx.strokeStyle = "#818cf8";
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      let first = true;
      for (const pt of points) {
        const sx = toScreenX(pt.x);
        const sy = toScreenY(pt.y);
        if (first) {
          ctx.moveTo(sx, sy);
          first = false;
        } else {
          ctx.lineTo(sx, sy);
        }
      }
      ctx.stroke();

      // Current price marker
      const currentY = toScreenY(basePrice);
      ctx.beginPath();
      ctx.arc(toScreenX(0), currentY, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#818cf8";
      ctx.fill();

      // Risk boundary line
      if (boundaryX > 0 && boundaryX < 1.0) {
        const bx = toScreenX(boundaryX);
        ctx.beginPath();
        ctx.strokeStyle = riskColors.text;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.moveTo(bx, pad.top);
        ctx.lineTo(bx, pad.top + plotH);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = riskColors.text;
        ctx.font = "9px monospace";
        ctx.textAlign = "center";
        ctx.fillText("CIRCUIT LIMIT", bx, pad.top - 6);
      }

      // Animated flow arrow
      const animT = (Math.sin(frame * 0.04) + 1) / 2;

      if (riskState === "SAFE" || riskState === "RESTRICTED") {
        const maxArrowT = boundaryX === 1.0 ? 0.85 : boundaryX * 0.85;
        const arrowX = toScreenX(animT * maxArrowT);
        const arrowY = toScreenY(basePrice * (1 + 3 * Math.pow(animT * maxArrowT, 1.5)));
        drawArrow(ctx, arrowX - 12, arrowY, arrowX, arrowY, riskColors.text + "aa");
      } else {
        const arrowX = toScreenX((1 - animT) * 0.15);
        const arrowY = toScreenY(basePrice);
        drawArrow(ctx, arrowX + 12, arrowY, arrowX, arrowY, riskColors.text + "aa");
      }

      // Axes
      ctx.strokeStyle = "#3f3f46";
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(pad.left, pad.top);
      ctx.lineTo(pad.left, pad.top + plotH);
      ctx.lineTo(pad.left + plotW, pad.top + plotH);
      ctx.stroke();

      // Axis labels
      ctx.fillStyle = "#71717a";
      ctx.font = "10px monospace";
      ctx.textAlign = "left";
      ctx.fillText("Price", 4, pad.top + plotH / 2);
      ctx.textAlign = "center";
      ctx.fillText("Supply →", pad.left + plotW / 2, height - 4);

      // Oracle label
      ctx.fillStyle = "#52525b";
      ctx.font = "9px monospace";
      ctx.textAlign = "right";
      ctx.fillText("Illustrative · Price from Pyth", width - 4, height - 4);
    };

    const animate = () => {
      frameRef.current++;
      draw(frameRef.current);
      animRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animRef.current !== null) cancelAnimationFrame(animRef.current);
    };
  }, [curveParams, riskState, riskColors, width, height]);

  return (
    <div className="dbc-curve-visualizer" style={{ position: "relative" }}>
      <canvas
        ref={canvasRef}
        style={{ width, height, borderRadius: 8, display: "block" }}
      />
      <div
        style={{
          position: "absolute",
          top: 8,
          left: 8,
          fontSize: 10,
          fontFamily: "var(--font-mono, monospace)",
          color: riskColors.text,
          fontWeight: 600,
          letterSpacing: "0.06em",
        }}
      >
        {symbol} CURVE · {riskColors.label}
      </div>
    </div>
  );
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  const angle = Math.atan2(dy, dx);
  const headLen = 6;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - headLen * Math.cos(angle - Math.PI / 6),
    y2 - headLen * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    x2 - headLen * Math.cos(angle + Math.PI / 6),
    y2 - headLen * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
