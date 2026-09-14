import React, { useState } from "react";
import { Link } from "react-router-dom";

export interface PipelineStage {
  id: string;
  num: string;
  title: string;
  shortState: string;
  subtitle: string;
  details: string[];
  x: number;
  y: number;
  w: number;
  h: number;
}

const STAGES: PipelineStage[] = [
  {
    id: "equity",
    num: "01",
    title: "Tokenized Equity",
    shortState: "12 MARKETS",
    subtitle: "Real regulated SPL tokenized stock collateral",
    details: ["NVDAx, AAPLx, MSFTx, TSLAx", "Collateral vs Discovery assets", "1:1 Custody backing"],
    x: 80,
    y: 85,
    w: 160,
    h: 88,
  },
  {
    id: "oracle",
    num: "02",
    title: "Pyth Conservative Price",
    shortState: "p - conf",
    subtitle: "Confidence-bounded valuation gate",
    details: ["PriceUpdateV2 validation", "Conservative floor: p - conf", "Staleness bound <= 600s"],
    x: 275,
    y: 135,
    w: 175,
    h: 88,
  },
  {
    id: "guard",
    num: "03",
    title: "MarketGuard Session",
    shortState: "NYSE ALIGNED",
    subtitle: "Deterministic session & market decouple",
    details: ["Underlying: Regular/Post/Closed", "Onchain: 24/7 Tradeable", "Borrow gated on close"],
    x: 485,
    y: 175,
    w: 175,
    h: 88,
  },
  {
    id: "ratchet",
    num: "04",
    title: "4-State Risk Ratchet",
    shortState: "ENGINE (SAFE)",
    subtitle: "Asymmetric tightening · Monotonic recovery",
    details: [
      "SAFE → RESTRICTED → DEFENSIVE → EMERGENCY",
      "Fast instant tightening on breach",
      "5 consecutive clean observations to recover",
      "EMERGENCY → SAFE jump prohibited",
    ],
    x: 695,
    y: 205,
    w: 205,
    h: 110,
  },
  {
    id: "credit",
    num: "05",
    title: "Programmable Credit",
    shortState: "DOWNSTREAM",
    subtitle: "Credit is the output, never the input",
    details: [
      "Permission: BORROW ALLOWED",
      "Dynamic Effective LTV",
      "Last valid price liquidation",
    ],
    x: 935,
    y: 335,
    w: 175,
    h: 90,
  },
];

export function HeroPipeline() {
  const [selectedStage, setSelectedStage] = useState<string>("ratchet");
  const [scenario, setScenario] = useState<"SAFE" | "STRESS">("SAFE");

  const activeStage = STAGES.find((s) => s.id === selectedStage) ?? STAGES[3];
  const isStress = scenario === "STRESS";

  // Dynamic state strings based on scenario
  const ratchetState = isStress ? "RESTRICTED" : "SAFE";
  const ratchetColor = isStress ? "#cfad74" : "#7fc39a";
  const creditPermission = isStress ? "BORROW BLOCKED" : "BORROW ALLOWED";
  const creditColor = isStress ? "#cf8b8b" : "#7fc39a";

  return (
    <div className="hero-pipeline-wrap" style={{ width: "100%", position: "relative" }}>
      {/* Interactive Scenario Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
          marginBottom: "12px",
          padding: "8px 16px",
          background: "rgba(18, 18, 22, 0.75)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r)",
          backdropFilter: "blur(10px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: ratchetColor,
              boxShadow: `0 0 8px ${ratchetColor}88`,
            }}
          />
          <span style={{ fontSize: "11px", fontFamily: "var(--mono)", color: "var(--text-3)", letterSpacing: "0.08em" }}>
            ARCHITECTURE PIPELINE TELEMETRY
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "12px", color: "var(--text-2)" }}>Simulate Pipeline:</span>
          <button
            type="button"
            onClick={() => setScenario("SAFE")}
            style={{
              padding: "4px 10px",
              borderRadius: "4px",
              fontSize: "11px",
              fontFamily: "var(--mono)",
              background: !isStress ? "rgba(127, 195, 154, 0.15)" : "transparent",
              color: !isStress ? "#7fc39a" : "var(--text-3)",
              border: `1px solid ${!isStress ? "#7fc39a" : "var(--border)"}`,
              cursor: "pointer",
            }}
          >
            Normal (SAFE)
          </button>
          <button
            type="button"
            onClick={() => setScenario("STRESS")}
            style={{
              padding: "4px 10px",
              borderRadius: "4px",
              fontSize: "11px",
              fontFamily: "var(--mono)",
              background: isStress ? "rgba(207, 173, 116, 0.15)" : "transparent",
              color: isStress ? "#cfad74" : "var(--text-3)",
              border: `1px solid ${isStress ? "#cfad74" : "var(--border)"}`,
              cursor: "pointer",
            }}
          >
            Confidence Breach (RESTRICTED)
          </button>
        </div>
      </div>

      {/* Semantic SVG Canvas */}
      <div
        style={{
          width: "100%",
          background: "radial-gradient(ellipse at 60% 40%, rgba(20, 22, 28, 0.6) 0%, rgba(6, 6, 8, 0.95) 100%)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)",
          overflow: "hidden",
          boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
        }}
      >
        <svg
          viewBox="0 0 1140 450"
          style={{ width: "100%", height: "auto", display: "block" }}
          role="img"
          aria-label="Circuit 5-Stage Risk Architecture Pipeline: Tokenized Equity -> Pyth Conservative Price -> MarketGuard Session -> 4-State Risk Ratchet -> Programmable Credit"
        >
          <defs>
            {/* Grid Pattern */}
            <pattern id="hpGrid" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="1" />
            </pattern>

            {/* Gradients */}
            <linearGradient id="traceGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.15)" />
              <stop offset="60%" stopColor={ratchetColor} stopOpacity="0.8" />
              <stop offset="100%" stopColor={creditColor} stopOpacity="0.8" />
            </linearGradient>

            <linearGradient id="ratchetGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(26, 28, 36, 0.95)" />
              <stop offset="100%" stopColor="rgba(14, 16, 22, 0.95)" />
            </linearGradient>

            {/* Filter for subtle glow */}
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Background Grid */}
          <rect width="1140" height="450" fill="url(#hpGrid)" />

          {/* Depth Contour Lines */}
          <path
            d="M 50 150 C 300 180, 600 240, 1100 400"
            fill="none"
            stroke="rgba(255, 255, 255, 0.03)"
            strokeWidth="2"
            strokeDasharray="4 6"
          />
          <path
            d="M 50 250 C 350 280, 700 320, 1100 440"
            fill="none"
            stroke="rgba(255, 255, 255, 0.02)"
            strokeWidth="1.5"
          />

          {/* Connecting Causal Paths */}
          {/* Edge 01 -> 02 */}
          <path
            d="M 160 173 C 160 210, 275 160, 275 179"
            fill="none"
            stroke="rgba(255, 255, 255, 0.2)"
            strokeWidth="2"
          />
          {/* Edge 02 -> 03 */}
          <path
            d="M 362 223 C 362 260, 485 200, 485 219"
            fill="none"
            stroke="rgba(255, 255, 255, 0.2)"
            strokeWidth="2"
          />
          {/* Edge 03 -> 04 */}
          <path
            d="M 572 263 C 572 290, 695 240, 695 260"
            fill="none"
            stroke={ratchetColor}
            strokeWidth={isStress ? "2.5" : "2"}
            opacity={0.85}
          />
          {/* Edge 04 -> 05 (Credit downstream) */}
          <path
            d="M 797 315 C 797 380, 935 340, 935 380"
            fill="none"
            stroke={creditColor}
            strokeWidth="2"
            strokeDasharray={isStress ? "5 4" : undefined}
            opacity={0.7}
          />

          {/* Animated Pulse along the path */}
          <circle r="4" fill="#ffffff" filter="url(#glow)">
            <animateMotion
              path="M 160 173 C 160 210, 275 160, 275 179 M 362 223 C 362 260, 485 200, 485 219 M 572 263 C 572 290, 695 240, 695 260 M 797 315 C 797 380, 935 340, 935 380"
              dur="4s"
              repeatCount="indefinite"
            />
          </circle>

          {/* ------------------------------------------------------------- */}
          {/* NODE 01: TOKENIZED EQUITY                                      */}
          {/* ------------------------------------------------------------- */}
          <g
            transform="translate(80, 85)"
            onClick={() => setSelectedStage("equity")}
            style={{ cursor: "pointer" }}
          >
            <rect
              width="160"
              height="88"
              rx="8"
              fill="rgba(18, 20, 26, 0.85)"
              stroke={selectedStage === "equity" ? "var(--accent)" : "var(--border)"}
              strokeWidth={selectedStage === "equity" ? 2 : 1}
            />
            {/* Stage Tag */}
            <rect x="12" y="12" width="24" height="18" rx="3" fill="rgba(255,255,255,0.06)" />
            <text x="24" y="25" textAnchor="middle" fontSize="10" fontFamily="var(--mono)" fill="var(--text-3)" fontWeight="700">
              01
            </text>
            <text x="44" y="25" fontSize="11" fontFamily="var(--mono)" fill="var(--text-2)" fontWeight="600" letterSpacing="0.05em">
              TOKENIZED EQUITY
            </text>

            <text x="14" y="52" fontSize="13" fontWeight="700" fill="var(--text)">
              SPL Collateral
            </text>
            <text x="14" y="68" fontSize="10.5" fill="var(--text-3)">
              12 Live Markets
            </text>

            <rect x="98" y="44" width="50" height="20" rx="3" fill="rgba(127, 195, 154, 0.1)" stroke="rgba(127, 195, 154, 0.3)" />
            <text x="123" y="58" textAnchor="middle" fontSize="9.5" fontFamily="var(--mono)" fill="#7fc39a">
              VALID
            </text>
          </g>

          {/* ------------------------------------------------------------- */}
          {/* NODE 02: PYTH CONSERVATIVE PRICE                              */}
          {/* ------------------------------------------------------------- */}
          <g
            transform="translate(275, 135)"
            onClick={() => setSelectedStage("oracle")}
            style={{ cursor: "pointer" }}
          >
            <rect
              width="175"
              height="88"
              rx="8"
              fill="rgba(18, 20, 26, 0.85)"
              stroke={selectedStage === "oracle" ? "var(--accent)" : "var(--border)"}
              strokeWidth={selectedStage === "oracle" ? 2 : 1}
            />
            <rect x="12" y="12" width="24" height="18" rx="3" fill="rgba(255,255,255,0.06)" />
            <text x="24" y="25" textAnchor="middle" fontSize="10" fontFamily="var(--mono)" fill="var(--text-3)" fontWeight="700">
              02
            </text>
            <text x="44" y="25" fontSize="11" fontFamily="var(--mono)" fill="var(--text-2)" fontWeight="600" letterSpacing="0.05em">
              PYTH ORACLE
            </text>

            <text x="14" y="52" fontSize="13" fontWeight="700" fill="var(--text)">
              Conservative Price
            </text>
            <text x="14" y="68" fontSize="10.5" fontFamily="var(--mono)" fill="var(--text-3)">
              {isStress ? "Conf: 62 bps (>50)" : "p - conf (±0.01)"}
            </text>

            <rect x="108" y="44" width="55" height="20" rx="3" fill={isStress ? "rgba(207, 173, 116, 0.12)" : "rgba(127, 195, 154, 0.1)"} stroke={isStress ? "#cfad74" : "rgba(127, 195, 154, 0.3)"} />
            <text x="135" y="58" textAnchor="middle" fontSize="9" fontFamily="var(--mono)" fill={isStress ? "#cfad74" : "#7fc39a"}>
              {isStress ? "WIDE CONF" : "FRESH 4s"}
            </text>
          </g>

          {/* ------------------------------------------------------------- */}
          {/* NODE 03: MARKETGUARD SESSION                                  */}
          {/* ------------------------------------------------------------- */}
          <g
            transform="translate(485, 175)"
            onClick={() => setSelectedStage("guard")}
            style={{ cursor: "pointer" }}
          >
            <rect
              width="175"
              height="88"
              rx="8"
              fill="rgba(18, 20, 26, 0.85)"
              stroke={selectedStage === "guard" ? "var(--accent)" : "var(--border)"}
              strokeWidth={selectedStage === "guard" ? 2 : 1}
            />
            <rect x="12" y="12" width="24" height="18" rx="3" fill="rgba(255,255,255,0.06)" />
            <text x="24" y="25" textAnchor="middle" fontSize="10" fontFamily="var(--mono)" fill="var(--text-3)" fontWeight="700">
              03
            </text>
            <text x="44" y="25" fontSize="11" fontFamily="var(--mono)" fill="var(--text-2)" fontWeight="600" letterSpacing="0.05em">
              MARKETGUARD
            </text>

            <text x="14" y="52" fontSize="13" fontWeight="700" fill="var(--text)">
              Session Policy
            </text>
            <text x="14" y="68" fontSize="10.5" fill="var(--text-3)">
              NYSE Decoupled
            </text>

            <rect x="108" y="44" width="55" height="20" rx="3" fill="rgba(139, 123, 196, 0.12)" stroke="rgba(139, 123, 196, 0.35)" />
            <text x="135" y="58" textAnchor="middle" fontSize="9" fontFamily="var(--mono)" fill="#8b7bc4">
              ACTIVE
            </text>
          </g>

          {/* ------------------------------------------------------------- */}
          {/* NODE 04: 4-STATE RISK RATCHET (DOMINANT FLAGSHIP NODE)        */}
          {/* ------------------------------------------------------------- */}
          <g
            transform="translate(695, 205)"
            onClick={() => setSelectedStage("ratchet")}
            style={{ cursor: "pointer" }}
          >
            {/* Outer Glow Halo */}
            <rect
              x="-6"
              y="-6"
              width="217"
              height="122"
              rx="12"
              fill="none"
              stroke={ratchetColor}
              strokeWidth="1.5"
              opacity="0.4"
            />
            {/* Main Card */}
            <rect
              width="205"
              height="110"
              rx="10"
              fill="url(#ratchetGrad)"
              stroke={selectedStage === "ratchet" ? "var(--accent)" : ratchetColor}
              strokeWidth={selectedStage === "ratchet" ? 2.5 : 1.75}
            />

            <rect x="14" y="12" width="26" height="18" rx="3" fill={`${ratchetColor}22`} />
            <text x="27" y="25" textAnchor="middle" fontSize="10.5" fontFamily="var(--mono)" fill={ratchetColor} fontWeight="700">
              04
            </text>
            <text x="48" y="25" fontSize="11" fontFamily="var(--mono)" fill={ratchetColor} fontWeight="700" letterSpacing="0.08em">
              RISK RATCHET ENGINE
            </text>

            <text x="14" y="54" fontSize="15" fontWeight="750" fill="var(--text)">
              {ratchetState}
            </text>
            <text x="14" y="70" fontSize="10.5" fill="var(--text-2)">
              {isStress ? "Tightened: Confidence breach" : "Hysteresis: 5-step recovery"}
            </text>

            {/* 4 State Indicators */}
            <g transform="translate(14, 82)">
              <rect x="0" y="0" width="38" height="16" rx="2" fill={!isStress ? "#7fc39a" : "rgba(255,255,255,0.06)"} />
              <text x="19" y="11" textAnchor="middle" fontSize="8" fontFamily="var(--mono)" fill={!isStress ? "#000" : "var(--text-3)"} fontWeight="700">
                SAFE
              </text>

              <rect x="42" y="0" width="46" height="16" rx="2" fill={isStress ? "#cfad74" : "rgba(255,255,255,0.06)"} />
              <text x="65" y="11" textAnchor="middle" fontSize="8" fontFamily="var(--mono)" fill={isStress ? "#000" : "var(--text-3)"} fontWeight="700">
                RESTR.
              </text>

              <rect x="92" y="0" width="42" height="16" rx="2" fill="rgba(255,255,255,0.06)" />
              <text x="113" y="11" textAnchor="middle" fontSize="8" fontFamily="var(--mono)" fill="var(--text-3)" fontWeight="700">
                DEF.
              </text>

              <rect x="138" y="0" width="40" height="16" rx="2" fill="rgba(255,255,255,0.06)" />
              <text x="158" y="11" textAnchor="middle" fontSize="8" fontFamily="var(--mono)" fill="var(--text-3)" fontWeight="700">
                EMERG.
              </text>
            </g>
          </g>

          {/* ------------------------------------------------------------- */}
          {/* NODE 05: PROGRAMMABLE CREDIT (DOWNSTREAM & QUIETER)           */}
          {/* ------------------------------------------------------------- */}
          <g
            transform="translate(935, 335)"
            onClick={() => setSelectedStage("credit")}
            style={{ cursor: "pointer", opacity: 0.9 }}
          >
            <rect
              width="175"
              height="90"
              rx="8"
              fill="rgba(12, 12, 16, 0.9)"
              stroke={selectedStage === "credit" ? "var(--accent)" : creditColor}
              strokeWidth={selectedStage === "credit" ? 2 : 1.25}
            />
            <rect x="12" y="12" width="24" height="18" rx="3" fill="rgba(255,255,255,0.06)" />
            <text x="24" y="25" textAnchor="middle" fontSize="10" fontFamily="var(--mono)" fill="var(--text-3)" fontWeight="700">
              05
            </text>
            <text x="44" y="25" fontSize="10" fontFamily="var(--mono)" fill="var(--text-3)" fontWeight="600" letterSpacing="0.05em">
              DOWNSTREAM CREDIT
            </text>

            <text x="14" y="52" fontSize="13" fontWeight="700" fill={creditColor}>
              {creditPermission}
            </text>
            <text x="14" y="68" fontSize="10" fill="var(--text-3)">
              {isStress ? "Policy: Borrow rejected" : "Dynamic Effective LTV"}
            </text>
          </g>
        </svg>
      </div>

      {/* Stage Detail Drawer */}
      <div
        style={{
          marginTop: "12px",
          padding: "16px 20px",
          background: "rgba(14, 14, 18, 0.8)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r)",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
        }}
      >
        <div style={{ maxWidth: "600px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
            <span
              style={{
                fontSize: "11px",
                fontFamily: "var(--mono)",
                padding: "2px 6px",
                borderRadius: "3px",
                background: "rgba(255,255,255,0.08)",
                color: "var(--text-2)",
              }}
            >
              STAGE {activeStage.num}
            </span>
            <h4 style={{ margin: 0, fontSize: "15px", color: "var(--text)" }}>{activeStage.title}</h4>
            <span style={{ fontSize: "12px", color: "var(--text-3)" }}>— {activeStage.subtitle}</span>
          </div>
          <p style={{ margin: 0, fontSize: "12.5px", color: "var(--text-2)", lineHeight: 1.5 }}>
            {activeStage.details.join(" · ")}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <a href={`#${activeStage.id}`} className="btn btn--ghost btn--sm">
            Read Section {activeStage.num}
          </a>
          <Link to="/app" className="btn btn--primary btn--sm">
            Launch App
          </Link>
        </div>
      </div>
    </div>
  );
}

export default HeroPipeline;
