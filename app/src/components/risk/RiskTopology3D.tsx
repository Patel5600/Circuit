import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "../../context/ThemeContext";

interface RiskTopologyProps {
  collateralPriceUsd: number;
  collateralAmountUi: number;
  currentDebtUsd: number;
  liquidationThresholdBps: number;
  maxBorrowUsd: number;
  tokenSymbol: string;
  quoteSymbol?: string;
  compact?: boolean;
}

interface Point3D {
  x: number; // Price shock normalized [-0.5, 0.2]
  y: number; // Health factor [0, 3]
  z: number; // Debt ratio [0, 1]
}

export function RiskTopology3D({
  collateralPriceUsd,
  collateralAmountUi,
  currentDebtUsd,
  liquidationThresholdBps,
  maxBorrowUsd,
  tokenSymbol,
  quoteSymbol = "USDC",
  compact = false,
}: RiskTopologyProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();

  // Rotation angles in radians
  const [angles, setAngles] = useState({ x: 0.52, y: -0.65 });
  const isDragging = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const [hoveredPoint, setHoveredPoint] = useState<{
    shockPct: number;
    priceUsd: number;
    debtUsd: number;
    hf: number;
    state: "SAFE" | "RESTRICTED" | "DEFENSIVE" | "LIQUIDATION";
  } | null>(null);

  const ltvRatio = liquidationThresholdBps / 10000;
  const currentCollateralVal = collateralPriceUsd * collateralAmountUi;
  const maxBorrow = maxBorrowUsd > 0 ? maxBorrowUsd : Math.max(currentCollateralVal * 0.8, 1000);

  // Compute HF for a given shock and debt
  const calculateHf = useCallback(
    (priceShock: number, debtVal: number) => {
      const shockedPrice = Math.max(0.01, collateralPriceUsd * (1 + priceShock));
      const shockedCollateralVal = shockedPrice * collateralAmountUi;
      const borrowing = Math.max(1, debtVal);
      if (shockedCollateralVal <= 0) return 0;
      return (shockedCollateralVal * ltvRatio) / borrowing;
    },
    [collateralPriceUsd, collateralAmountUi, ltvRatio]
  );

  // 3D to 2D projection
  const project = useCallback(
    (
      x: number,
      y: number,
      z: number,
      angleX: number,
      angleY: number,
      cx: number,
      cy: number,
      scaleX: number,
      scaleY: number,
      scaleZ: number
    ) => {
      // Scale coordinates into centered 3D box
      const sx = x * scaleX;
      const sy = y * scaleY;
      const sz = z * scaleZ;

      // Rotate around Y
      const cosY = Math.cos(angleY);
      const sinY = Math.sin(angleY);
      const x1 = sx * cosY + sz * sinY;
      const z1 = -sx * sinY + sz * cosY;

      // Rotate around X
      const cosX = Math.cos(angleX);
      const sinX = Math.sin(angleX);
      const y2 = sy * cosX - z1 * sinX;
      const z2 = sy * sinX + z1 * cosX;

      return {
        px: cx + x1,
        py: cy - y2,
        depth: z2,
      };
    },
    []
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const isLight = theme === "light";
    const cx = width * 0.5;
    const cy = height * 0.52;

    const scaleFactor = compact ? Math.min(width, height) * 0.42 : Math.min(width, height) * 0.48;
    const scaleX = scaleFactor * 1.4;
    const scaleY = scaleFactor * 0.55;
    const scaleZ = scaleFactor * 1.4;

    // Palette Colors
    const gridColor = isLight ? "rgba(21, 23, 63, 0.12)" : "rgba(236, 234, 247, 0.14)";
    const axisColor = isLight ? "rgba(21, 23, 63, 0.35)" : "rgba(236, 234, 247, 0.35)";
    const textColor = isLight ? "#15173F" : "#ECEAF7";
    const textMuted = isLight ? "rgba(70, 74, 120, 0.70)" : "#A9ABD6";
    const accentColor = isLight ? "#3D5AFE" : "#8FA2FF";
    const safeColor = isLight ? "#059669" : "#10B981";
    const liqColor = isLight ? "rgba(220, 38, 38, 0.30)" : "rgba(239, 68, 68, 0.35)";
    const liqLineColor = isLight ? "#DC2626" : "#EF4444";

    // Surface bounds
    const shockMin = -0.5; // -50% shock
    const shockMax = 0.2;  // +20% shock
    const debtMin = 0.05;
    const debtMax = 1.0;   // 100% capacity

    const gridStepsX = 14;
    const gridStepsZ = 12;

    // --- 1. Draw Liquidation Datum Plane (HF = 1.0) ---
    const liqY = (1.0 - 1.5); // Center HF=1.0 in normalized Y [-1.5, 1.5]
    const pLiq00 = project(-0.5, liqY, -0.5, angles.x, angles.y, cx, cy, scaleX, scaleY, scaleZ);
    const pLiq10 = project(0.5, liqY, -0.5, angles.x, angles.y, cx, cy, scaleX, scaleY, scaleZ);
    const pLiq11 = project(0.5, liqY, 0.5, angles.x, angles.y, cx, cy, scaleX, scaleY, scaleZ);
    const pLiq01 = project(-0.5, liqY, 0.5, angles.x, angles.y, cx, cy, scaleX, scaleY, scaleZ);

    ctx.beginPath();
    ctx.moveTo(pLiq00.px, pLiq00.py);
    ctx.lineTo(pLiq10.px, pLiq10.py);
    ctx.lineTo(pLiq11.px, pLiq11.py);
    ctx.lineTo(pLiq01.px, pLiq01.py);
    ctx.closePath();
    ctx.fillStyle = liqColor;
    ctx.fill();
    ctx.strokeStyle = liqLineColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Datum Label: HF = 1.0 (Liquidation Cliff)
    ctx.font = "10px var(--mono, monospace)";
    ctx.fillStyle = liqLineColor;
    ctx.fillText("DATUM: LIQUIDATION BOUNDARY (HF = 1.0)", pLiq00.px + 4, pLiq00.py - 4);

    // --- 2. Calculate and Render Parametric Surface Grid ---
    const points: { px: number; py: number; hf: number }[][] = [];

    for (let i = 0; i <= gridStepsX; i++) {
      const row: { px: number; py: number; hf: number }[] = [];
      const tX = i / gridStepsX;
      const shock = shockMin + tX * (shockMax - shockMin);
      const normX = tX - 0.5; // [-0.5, 0.5]

      for (let j = 0; j <= gridStepsZ; j++) {
        const tZ = j / gridStepsZ;
        const debtVal = (debtMin + tZ * (debtMax - debtMin)) * maxBorrow;
        const normZ = tZ - 0.5; // [-0.5, 0.5]

        const hf = calculateHf(shock, debtVal);
        // Clamp and normalize HF for Y display: [0, 3] -> [-1.5, 1.5]
        const clampedHf = Math.min(3.0, Math.max(0, hf));
        const normY = clampedHf - 1.5;

        const projected = project(normX, normY, normZ, angles.x, angles.y, cx, cy, scaleX, scaleY, scaleZ);
        row.push({ px: projected.px, py: projected.py, hf });
      }
      points.push(row);
    }

    // Draw Surface Wireframe Iso-lines (along Z)
    ctx.lineWidth = 0.85;
    for (let i = 0; i <= gridStepsX; i++) {
      ctx.beginPath();
      for (let j = 0; j <= gridStepsZ; j++) {
        const pt = points[i][j];
        if (j === 0) ctx.moveTo(pt.px, pt.py);
        else ctx.lineTo(pt.px, pt.py);
      }
      // Gradient line based on shock
      ctx.strokeStyle = i < gridStepsX * 0.4 ? (isLight ? "rgba(158, 42, 43, 0.45)" : "rgba(235, 87, 87, 0.40)") : gridColor;
      ctx.stroke();
    }

    // Draw Surface Wireframe Iso-lines (along X)
    for (let j = 0; j <= gridStepsZ; j++) {
      ctx.beginPath();
      for (let i = 0; i <= gridStepsX; i++) {
        const pt = points[i][j];
        if (i === 0) ctx.moveTo(pt.px, pt.py);
        else ctx.lineTo(pt.px, pt.py);
      }
      ctx.strokeStyle = gridColor;
      ctx.stroke();
    }

    // --- 3. Draw Coordinate Axes & Millimeter Ticks ---
    const origin = project(-0.5, -1.5, -0.5, angles.x, angles.y, cx, cy, scaleX, scaleY, scaleZ);
    const xEnd = project(0.5, -1.5, -0.5, angles.x, angles.y, cx, cy, scaleX, scaleY, scaleZ);
    const yEnd = project(-0.5, 1.5, -0.5, angles.x, angles.y, cx, cy, scaleX, scaleY, scaleZ);
    const zEnd = project(-0.5, -1.5, 0.5, angles.x, angles.y, cx, cy, scaleX, scaleY, scaleZ);

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = axisColor;

    // X Axis (Price Shock)
    ctx.beginPath();
    ctx.moveTo(origin.px, origin.py);
    ctx.lineTo(xEnd.px, xEnd.py);
    ctx.stroke();

    // Y Axis (Health Factor)
    ctx.beginPath();
    ctx.moveTo(origin.px, origin.py);
    ctx.lineTo(yEnd.px, yEnd.py);
    ctx.stroke();

    // Z Axis (Debt Utilization)
    ctx.beginPath();
    ctx.moveTo(origin.px, origin.py);
    ctx.lineTo(zEnd.px, zEnd.py);
    ctx.stroke();

    // Axis Labels with ISO Ticks
    ctx.font = "10px var(--mono, monospace)";
    ctx.fillStyle = textMuted;
    ctx.fillText("COLLATERAL VOLATILITY SHOCK (X: -50% → +20%)", xEnd.px - 60, xEnd.py + 16);
    ctx.fillText("HEALTH FACTOR (Y: 0.0 → 3.0+)", yEnd.px - 20, yEnd.py - 10);
    ctx.fillText(`BORROW DEBT (Z: $0 → $${(maxBorrow / 1000).toFixed(0)}k)`, zEnd.px - 40, zEnd.py + 18);

    // --- 4. Plot Current Position Point (If collateral deposited) ---
    if (currentCollateralVal > 0) {
      const curDebt = Math.max(1, currentDebtUsd);
      const curHf = calculateHf(0, curDebt);
      const curNormX = (0 - shockMin) / (shockMax - shockMin) - 0.5; // shock = 0%
      const curNormZ = Math.min(1, curDebt / maxBorrow) - 0.5;
      const curNormY = Math.min(3.0, curHf) - 1.5;

      const curPos = project(curNormX, curNormY, curNormZ, angles.x, angles.y, cx, cy, scaleX, scaleY, scaleZ);
      const floorPos = project(curNormX, -1.5, curNormZ, angles.x, angles.y, cx, cy, scaleX, scaleY, scaleZ);

      // Orthogonal drop-line to floor
      ctx.beginPath();
      ctx.moveTo(curPos.px, curPos.py);
      ctx.lineTo(floorPos.px, floorPos.py);
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([2, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Floor anchor footprint
      ctx.beginPath();
      ctx.arc(floorPos.px, floorPos.py, 3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(173, 136, 32, 0.4)";
      ctx.fill();

      // Position Node Halo
      ctx.beginPath();
      ctx.arc(curPos.px, curPos.py, 7, 0, Math.PI * 2);
      ctx.fillStyle = isLight ? "rgba(173, 136, 32, 0.20)" : "rgba(173, 136, 32, 0.35)";
      ctx.fill();
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Position Node Core
      ctx.beginPath();
      ctx.arc(curPos.px, curPos.py, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = isLight ? "#15173F" : "#FFFFFF";
      ctx.fill();

      // Position Text Readout Callout
      ctx.font = "bold 10.5px var(--mono, monospace)";
      ctx.fillStyle = textColor;
      const labelText = `CURRENT STATE: HF ${curHf > 10 ? ">10.0" : curHf.toFixed(2)}`;
      ctx.fillText(labelText, curPos.px + 10, curPos.py - 6);

      ctx.font = "9.5px var(--mono, monospace)";
      ctx.fillStyle = curHf >= 1.3 ? safeColor : curHf >= 1.0 ? accentColor : liqLineColor;
      ctx.fillText(
        `DEBT: $${currentDebtUsd.toLocaleString()} ${quoteSymbol} · SHOCK TOLERANCE: ${((1 - 1 / Math.max(1, curHf)) * 100).toFixed(1)}%`,
        curPos.px + 10,
        curPos.py + 8
      );
    }
  }, [
    theme,
    compact,
    angles,
    collateralPriceUsd,
    collateralAmountUi,
    currentDebtUsd,
    maxBorrow,
    quoteSymbol,
    calculateHf,
    project,
  ]);

  // Handle Resize & DPI Scaling
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = (compact ? 240 : 340) * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${compact ? 240 : 340}px`;

      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(dpr, dpr);
      draw();
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [draw, compact]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Pointer Dragging for 3D Camera Orbit
  const handlePointerDown = (e: React.PointerEvent) => {
    isDragging.current = true;
    lastMousePos.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) {
      // Calculate hover coordinates
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const relX = (e.clientX - rect.left) / rect.width;
      const relY = (e.clientY - rect.top) / rect.height;

      // Approximate parameter mapping from cursor position
      const shockPct = Number((-0.5 + relX * 0.7).toFixed(2));
      const debtUsd = Math.round(relY * maxBorrow);
      const hf = calculateHf(shockPct, debtUsd);

      let state: "SAFE" | "RESTRICTED" | "DEFENSIVE" | "LIQUIDATION" = "SAFE";
      if (hf < 1.0) state = "LIQUIDATION";
      else if (hf < 1.15) state = "DEFENSIVE";
      else if (hf < 1.35) state = "RESTRICTED";

      setHoveredPoint({
        shockPct,
        priceUsd: collateralPriceUsd * (1 + shockPct),
        debtUsd,
        hf: Number(hf.toFixed(2)),
        state,
      });
      return;
    }

    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;

    lastMousePos.current = { x: e.clientX, y: e.clientY };

    setAngles((prev) => ({
      x: Math.max(0.15, Math.min(1.2, prev.x + dy * 0.006)),
      y: prev.y + dx * 0.006,
    }));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDragging.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  };

  const resetCamera = () => {
    setAngles({ x: 0.52, y: -0.65 });
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r, 12px)",
        padding: "16px 20px 12px",
        overflow: "hidden",
      }}
    >
      {/* CAD Header Bar */}
      <div className="row between g-12" style={{ alignItems: "center", marginBottom: 8 }}>
        <div className="row g-8" style={{ alignItems: "center" }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "var(--accent)",
              display: "inline-block",
            }}
          />
          <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-1)" }}>
            3D RISK TOPOLOGY · PARAMETRIC CAD MODEL ({tokenSymbol})
          </span>
          <span className="mono" style={{ fontSize: 10, color: "var(--text-3)" }}>
            [ISO AXONOMETRIC]
          </span>
        </div>

        <div className="row g-6" style={{ alignItems: "center" }}>
          <button
            type="button"
            onClick={resetCamera}
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: "2px 8px",
              fontSize: 10,
              fontFamily: "var(--mono)",
              color: "var(--text-2)",
              cursor: "pointer",
            }}
            title="Reset orthographic camera to default isometric view"
          >
            RESET CAM
          </button>
        </div>
      </div>

      {/* Main 3D Canvas */}
      <div style={{ position: "relative", cursor: "grab" }}>
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={() => setHoveredPoint(null)}
          style={{
            display: "block",
            width: "100%",
            height: compact ? 240 : 340,
            touchAction: "none",
          }}
        />

        {/* Orbit Hint Watermark */}
        <div
          style={{
            position: "absolute",
            bottom: 8,
            right: 12,
            fontSize: 9.5,
            fontFamily: "var(--mono)",
            color: "var(--text-3)",
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          DRAG TO ORBIT · HOVER TO PROBE COORDINATES
        </div>
      </div>

      {/* Interactive Raycast Coordinate Probe Readout */}
      <div
        style={{
          marginTop: 8,
          padding: "8px 12px",
          background: "var(--surface-3)",
          borderRadius: 6,
          border: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
          fontSize: 11,
          fontFamily: "var(--mono)",
        }}
      >
        <div className="row g-12 wrap" style={{ alignItems: "center" }}>
          <span>
            <span style={{ color: "var(--text-3)" }}>PROBE SHOCK: </span>
            <strong style={{ color: "var(--text-1)" }}>
              {hoveredPoint ? `${(hoveredPoint.shockPct * 100).toFixed(0)}%` : "0% (NOMINAL)"}
            </strong>
          </span>
          <span>
            <span style={{ color: "var(--text-3)" }}>PRICE: </span>
            <strong style={{ color: "var(--text-1)" }}>
              ${hoveredPoint ? hoveredPoint.priceUsd.toFixed(2) : collateralPriceUsd.toFixed(2)}
            </strong>
          </span>
          <span>
            <span style={{ color: "var(--text-3)" }}>BORROW: </span>
            <strong style={{ color: "var(--text-1)" }}>
              ${hoveredPoint ? hoveredPoint.debtUsd.toLocaleString() : currentDebtUsd.toLocaleString()} {quoteSymbol}
            </strong>
          </span>
        </div>

        <div className="row g-8" style={{ alignItems: "center" }}>
          <span>
            <span style={{ color: "var(--text-3)" }}>PROJECTED HF: </span>
            <strong
              style={{
                color:
                  (hoveredPoint?.hf ?? 2) >= 1.3
                    ? "var(--success)"
                    : (hoveredPoint?.hf ?? 2) >= 1.0
                    ? "var(--warning)"
                    : "var(--danger)",
              }}
            >
              {hoveredPoint ? hoveredPoint.hf.toFixed(2) : "NOMINAL"}
            </strong>
          </span>
          <span
            style={{
              padding: "2px 6px",
              borderRadius: 4,
              fontSize: 9.5,
              fontWeight: 700,
              background:
                (hoveredPoint?.state ?? "SAFE") === "SAFE"
                  ? "var(--success-dim)"
                  : (hoveredPoint?.state ?? "SAFE") === "RESTRICTED"
                  ? "var(--warning-dim)"
                  : "var(--danger-dim)",
              color:
                (hoveredPoint?.state ?? "SAFE") === "SAFE"
                  ? "var(--success)"
                  : (hoveredPoint?.state ?? "SAFE") === "RESTRICTED"
                  ? "var(--warning)"
                  : "var(--danger)",
            }}
          >
            {hoveredPoint?.state ?? "SAFE"}
          </span>
        </div>
      </div>
    </div>
  );
}
