import React, { useState, useEffect, useCallback } from "react";
import { Reveal } from "../ui/Reveal";
import { Pill, Icon } from "../ui";

/* -------------------------------------------------------------------------- */
/*  Dimensions Data                                                           */
/* -------------------------------------------------------------------------- */

export interface DimensionChapter {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  tagline: string;
  badge: string;
  thesis: string;
  mechanism: string;
  whyItMatters: string;
  formula?: string;
  accentColor: string;
}

const DIMENSIONS: DimensionChapter[] = [
  {
    id: "custody",
    number: "01",
    title: "Qualified Collateral Custody",
    subtitle: "Real Asset Backing vs Synthetic Debt",
    tagline: "Tokenized equities are legally enforceable shares held in regulated custody, not synthetic contracts.",
    badge: "1:1 Custody Isolation",
    thesis:
      "Unlike crypto-native tokens that exist solely in protocol pools, tokenized equities represent beneficial ownership of registered securities stored with licensed broker-dealers and custodians.",
    mechanism:
      "Collateral tokens (SPL) are deposited into program-derived vaults owned exclusively by the protocol config PDA. Corporate actions, proxy splits, and dividend distributions remain isolated without protocol rehypothecation.",
    whyItMatters:
      "Eliminates counterparty rehypothecation risk and guarantees that every dollar of collateral on Solana is backed by physical securities in depository trust.",
    formula: "Collateral Value = Deposited Tokens × Verified Qualified Price",
    accentColor: "#7fc39a",
  },
  {
    id: "oracle",
    number: "02",
    title: "Conservative Pyth Valuation",
    subtitle: "Lower-Bound Confidence Interval Pricing",
    tagline: "Point estimates fail when spreads explode. Circuit evaluates collateral strictly at the confidence lower bound.",
    badge: "p - conf Lower Bound",
    thesis:
      "During market opens, earnings prints, and macro announcements, the bid-ask spread of equities widens drastically. Taking the oracle mid-price ignores uncertainty and overvalues collateral right before liquidations.",
    mechanism:
      "The protocol reads Pyth Network PriceUpdateV2 accounts on-chain and enforces conservative pricing: p_conservative = max(0, p - conf). If the confidence ratio (conf / p) exceeds asset thresholds (50 bps / 150 bps), borrow gates trigger immediately.",
    whyItMatters:
      "Prevents flash-crash overborrowing and immunizes the liquidity pool from transient publisher disagreement.",
    formula: "p_conservative = max(0, price - confidence)",
    accentColor: "#cfad74",
  },
  {
    id: "session",
    number: "03",
    title: "Deterministic NYSE Session Guard",
    subtitle: "Market Calendar Aware Credit",
    tagline: "Equities do not trade 24/7. Credit generation must halt when underlying venues close.",
    badge: "On-Chain MarketGuard",
    thesis:
      "Traditional DeFi assumes 24/7 continuous liquidity. In contrast, US equity markets close at 16:00 ET and remain closed on weekends and holidays, leaving portfolios exposed to multi-day gap-down risk on breaking news.",
    mechanism:
      "Circuit implements an on-chain deterministic NYSE calendar inside MarketGuard PDA. Clock timestamps are evaluated for regular sessions (09:30–16:00 ET), weekends, and exchange holidays. Off-hours borrowing is blocked automatically on-chain.",
    whyItMatters:
      "Stops borrowers from draining USDC vaults during weekend news events before physical equity exchanges open.",
    formula: "Session Gate: RegularSession ? Safe : Restricted",
    accentColor: "#58a6ff",
  },
  {
    id: "ratchet",
    number: "04",
    title: "4-State Risk Ratchet",
    subtitle: "Asymmetric Fast-Tightening State Machine",
    tagline: "Binary risk states create liquidation cascades. Circuit introduces a 4-tier gradual defensive posture.",
    badge: "4-State Machine",
    thesis:
      "Binary systems (solvent vs liquidatable) wait until debt exceeds threshold, causing sudden liquidations. Circuit proactively constrains new leverage as soon as stress metrics degrade.",
    mechanism:
      "A dedicated on-chain RiskRatchet PDA tracks states: Safe → Restricted → Defensive → Emergency. Any breach of confidence bounds (> 50, > 150, > 300 bps) or custody impairment instantly ratchets state downward in the same slot.",
    whyItMatters:
      "Limits downside exposure early by restricting new borrowing while keeping repayment paths 100% open.",
    formula: "State Transition: Tightening occurs instantly (slot t = t_stress)",
    accentColor: "#e08c4e",
  },
  {
    id: "hysteresis",
    number: "05",
    title: "Monotonic Hysteresis Recovery",
    subtitle: "Evidence-Based Monotonic Upgrades",
    tagline: "A single clean tick does not mean calm has returned. Recovery requires consecutive verified proofs.",
    badge: "5 Clean Ticks Hysteresis",
    thesis:
      "Markets often experience false bounces. If borrowing permissions re-enable on a single favorable tick, borrowers can re-lever during the eye of the storm (flapping hazard).",
    mechanism:
      "The protocol enforces strict monotonic recovery with deadbands. Direct Emergency → Safe transitions are mathematically prohibited. Upgrading each tier requires N (e.g. 5) consecutive verified clean observations via permissionless cranks.",
    whyItMatters:
      "Guarantees that credit capacity only returns after durable market stabilization has been proven on-chain.",
    formula: "Recovery Condition: consecutive_observations ≥ 5 ∧ conf_ratio ≤ deadband",
    accentColor: "#bc8cff",
  },
  {
    id: "concentration",
    number: "06",
    title: "Multi-Asset Concentration Penalty",
    subtitle: "Dynamic Leverage Throttling",
    tagline: "Single-stock concentration carries idiosyncratic crash risk. Circuit scales allowable LTV with diversification.",
    badge: "C_max > 40% Penalty",
    thesis:
      "A borrower pledging 90% in a single semiconductor stock carries vastly higher drawdown risk than one holding a diversified basket of indices and mega-caps, yet standard protocols grant them identical LTV.",
    mechanism:
      "Circuit calculates single-asset portfolio concentration: C_max = max(w_i). When C_max exceeds 40%, an on-chain penalty scales down allowable borrowing: Effective LTV = max(30%, Base LTV - Penalty), reducing leverage from 70% to 52%.",
    whyItMatters:
      "Protects senior lending vaults from single-company gap-downs, earnings misses, or corporate fraud.",
    formula: "Penalty (bps) = (C_max - 40%) × slope_bps",
    accentColor: "#79c0ff",
  },
  {
    id: "liquidation",
    number: "07",
    title: "Severity-Scaled Liquidation Game Theory",
    subtitle: "Dutch Auction vs Latency Arms Races",
    tagline: "Flat bonuses create MEV bot races. Continuous severity-scaled discounts eliminate fixed-prize wars.",
    badge: "Dynamic Shortfall Slope",
    thesis:
      "Flat liquidation bonuses (e.g. fixed 5%) incentivize bot wars to front-run minor under-collateralizations, while under-incentivizing deep under-water positions during extreme volatility.",
    mechanism:
      "Circuit implements severity-scaled liquidation with Dutch auction ramps: bonus = min(max_cap, base_bonus + shortfall × slope). Healthier positions (HF ~ 0.99) carry lower discounts, while severe distress unlocks higher incentives to guarantee solvency.",
    whyItMatters:
      "Protects borrower equity from excessive penalty extraction while guaranteeing liquidators show up when risk is highest.",
    formula: "Bonus = min(MaxCap, Floor + (1.0 - HF) × Slope)",
    accentColor: "#f0883e",
  },
];

/* -------------------------------------------------------------------------- */
/*  Main Component                                                            */
/* -------------------------------------------------------------------------- */

export function FaultLineMatrix() {
  const [isOpen, setIsOpen] = useState(false);
  const [activePage, setActivePage] = useState(0);

  const currentChapter = DIMENSIONS[activePage];

  // Keyboard navigation when book modal is open
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") {
        setIsOpen(false);
      } else if (e.key === "ArrowRight") {
        setActivePage((p) => (p < DIMENSIONS.length - 1 ? p + 1 : p));
      } else if (e.key === "ArrowLeft") {
        setActivePage((p) => (p > 0 ? p - 1 : p));
      }
    },
    [isOpen]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const openAt = (idx: number) => {
    setActivePage(idx);
    setIsOpen(true);
  };

  return (
    <section className="sec" id="dimensions" style={{ position: "relative", zIndex: 1 }}>
      <div className="sec__inner">
        <Reveal>
          <p className="sec__index">
            <span className="sec__index__n">07</span>
            <span className="sec__index__t">Architectural Dimensions</span>
          </p>
          <div style={{ marginBottom: 36 }}>
            <h2 className="sec__title">
              The Seven Dimensions of
              <br />
              <em>Equity Collateral.</em>
            </h2>
            <p className="t-base muted" style={{ maxWidth: 680, margin: "14px 0 0 0", fontSize: 16, lineHeight: 1.55 }}>
              Tokenized equities require fundamentally different primitives than crypto-native assets.
              Click the handbook below to open the interactive codex detailing each architectural layer.
            </p>
          </div>
        </Reveal>

        {/* ── Compact Interactive Book Preview + Chapter Index ── */}
        <Reveal delay={80}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 32,
              alignItems: "center",
              background: "var(--surface-1, rgba(16, 20, 28, 0.6))",
              border: "1px solid var(--border)",
              borderRadius: 16,
              padding: "36px 32px",
              boxShadow: "0 20px 48px rgba(0, 0, 0, 0.4)",
            }}
          >
            {/* Left: The Small Tactile 3D Book */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div
                role="button"
                tabIndex={0}
                aria-label="Open Architectural Codex"
                onClick={() => openAt(0)}
                onKeyDown={(e) => e.key === "Enter" && openAt(0)}
                className="codex-book-trigger"
                style={{
                  width: 190,
                  height: 260,
                  position: "relative",
                  cursor: "pointer",
                  perspective: 1000,
                  transition: "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease",
                }}
              >
                {/* Book Cover Hardback */}
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    background: "linear-gradient(135deg, #151a24 0%, #0d1117 100%)",
                    border: "1px solid rgba(207, 173, 116, 0.35)",
                    borderRadius: "4px 10px 10px 4px",
                    boxShadow:
                      "-6px 0 0 #090c10, -10px 0 16px rgba(0,0,0,0.6), 12px 16px 32px rgba(0,0,0,0.5), inset 0 0 20px rgba(0,0,0,0.6)",
                    padding: "20px 16px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  {/* Left Spine Texture */}
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: 14,
                      background: "linear-gradient(90deg, rgba(0,0,0,0.6) 0%, rgba(255,255,255,0.08) 50%, rgba(0,0,0,0.4) 100%)",
                      borderRight: "1px solid rgba(207, 173, 116, 0.2)",
                    }}
                  />

                  {/* Gold Foil Header Border */}
                  <div
                    style={{
                      borderBottom: "1px solid rgba(207, 173, 116, 0.3)",
                      paddingBottom: 8,
                      marginLeft: 8,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 9,
                        letterSpacing: "0.18em",
                        textTransform: "uppercase",
                        color: "var(--accent)",
                        opacity: 0.9,
                        display: "block",
                      }}
                    >
                      CIRCUIT PROTOCOL
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 8,
                        letterSpacing: "0.12em",
                        color: "var(--text-3)",
                      }}
                    >
                      SPECIFICATION 01
                    </span>
                  </div>

                  {/* Center Emblem & Title */}
                  <div style={{ marginLeft: 8, textAlign: "center", margin: "auto 0" }}>
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        margin: "0 auto 10px",
                        borderRadius: "50%",
                        border: "1.5px solid var(--accent)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--accent)",
                        background: "rgba(207, 173, 116, 0.08)",
                      }}
                    >
                      <Icon name="shield" size={20} />
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        color: "var(--text)",
                        textTransform: "uppercase",
                        lineHeight: 1.2,
                      }}
                    >
                      Architectural
                      <br />
                      <span style={{ color: "var(--accent)" }}>Codex</span>
                    </div>
                    <div
                      style={{
                        fontSize: 9,
                        color: "var(--text-3)",
                        fontFamily: "var(--mono)",
                        marginTop: 4,
                      }}
                    >
                      7 Core Dimensions
                    </div>
                  </div>

                  {/* Ribbon bookmark sticking out */}
                  <div
                    style={{
                      position: "absolute",
                      bottom: -10,
                      right: 28,
                      width: 14,
                      height: 22,
                      background: "var(--accent)",
                      clipPath: "polygon(0 0, 100% 0, 100% 100%, 50% 75%, 0 100%)",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.5)",
                    }}
                  />

                  {/* Bottom Footer */}
                  <div style={{ marginLeft: 8, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 6 }}>
                    <span style={{ fontSize: 9, fontFamily: "var(--mono)", color: "var(--accent)", opacity: 0.8 }}>
                      CLICK TO OPEN ↗
                    </span>
                  </div>
                </div>

                {/* Simulated Paper Edge Stack on Right */}
                <div
                  style={{
                    position: "absolute",
                    right: -7,
                    top: 5,
                    bottom: 5,
                    width: 7,
                    background: "repeating-linear-gradient(180deg, #d8d3c5 0px, #d8d3c5 1px, #b5af9f 1px, #b5af9f 2px)",
                    borderRadius: "0 3px 3px 0",
                    boxShadow: "2px 0 4px rgba(0,0,0,0.4)",
                  }}
                />
              </div>

              <div style={{ marginTop: 16, textAlign: "center" }}>
                <button
                  type="button"
                  className="btn btn--accent btn--sm"
                  onClick={() => openAt(0)}
                  style={{
                    boxShadow: "0 0 16px rgba(207, 173, 116, 0.2)",
                    fontWeight: 650,
                  }}
                >
                  <Icon name="verify" size={14} />
                  Open Architectural Codex (7 Pages)
                </button>
              </div>
            </div>

            {/* Right: Quick Chapter Directory */}
            <div>
              <div className="row between g-8" style={{ marginBottom: 16, alignItems: "center" }}>
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    color: "var(--text-3)",
                  }}
                >
                  Codex Directory · Select Any Chapter
                </span>
                <Pill tone="accent" withDot>
                  7 DIMENSIONS
                </Pill>
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                {DIMENSIONS.map((dim, idx) => (
                  <div
                    key={dim.id}
                    onClick={() => openAt(idx)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && openAt(idx)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      borderRadius: 8,
                      background: "rgba(255, 255, 255, 0.02)",
                      border: "1px solid var(--border)",
                      cursor: "pointer",
                      transition: "background 0.2s ease, border-color 0.2s ease, transform 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(207, 173, 116, 0.06)";
                      e.currentTarget.style.borderColor = "var(--accent)";
                      e.currentTarget.style.transform = "translateX(4px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(255, 255, 255, 0.02)";
                      e.currentTarget.style.borderColor = "var(--border)";
                      e.currentTarget.style.transform = "translateX(0)";
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span
                        style={{
                          fontFamily: "var(--mono)",
                          fontSize: 11,
                          fontWeight: 700,
                          color: dim.accentColor,
                          width: 22,
                        }}
                      >
                        {dim.number}
                      </span>
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)" }}>
                          {dim.title}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>
                          {dim.subtitle}
                        </div>
                      </div>
                    </div>

                    <div className="row g-8" style={{ alignItems: "center" }}>
                      <span
                        style={{
                          fontSize: 10.5,
                          fontFamily: "var(--mono)",
                          color: dim.accentColor,
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: `${dim.accentColor}14`,
                        }}
                      >
                        {dim.badge}
                      </span>
                      <Icon name="arrowRight" size={13} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </div>

      {/* ── Bump-On-Screen Expanded Book Modal ── */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Architectural Codex Handbook"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            background: "rgba(5, 7, 11, 0.85)",
            backdropFilter: "blur(12px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px 16px",
            animation: "fadeIn 0.2s ease-out",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsOpen(false);
          }}
        >
          {/* Expanded Open Codex Reader */}
          <div
            className="codex-bump-modal"
            style={{
              width: "100%",
              maxWidth: 820,
              maxHeight: "92vh",
              background: "linear-gradient(180deg, #161b26 0%, #0e121a 100%)",
              border: "1px solid rgba(207, 173, 116, 0.4)",
              borderRadius: 16,
              boxShadow:
                "0 24px 72px rgba(0, 0, 0, 0.8), 0 0 32px rgba(207, 173, 116, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              position: "relative",
              animation: "bumpScale 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)",
            }}
          >
            {/* Modal Header Bar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 24px",
                borderBottom: "1px solid var(--border)",
                background: "rgba(10, 13, 18, 0.6)",
              }}
            >
              <div className="row g-10" style={{ alignItems: "center" }}>
                <span
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    background: "rgba(207, 173, 116, 0.15)",
                    color: "var(--accent)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name="shield" size={14} />
                </span>
                <div>
                  <span
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 10,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "var(--accent)",
                      fontWeight: 650,
                      display: "block",
                    }}
                  >
                    THE CIRCUIT ARCHITECTURAL CODEX
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-3)" }}>
                    Dimension {activePage + 1} of {DIMENSIONS.length} · One Dimension per Page
                  </span>
                </div>
              </div>

              <div className="row g-10" style={{ alignItems: "center" }}>
                <Pill tone="accent">
                  CHAPTER {currentChapter.number} / 07
                </Pill>
                <button
                  type="button"
                  aria-label="Close codex"
                  className="btn btn--ghost btn--sm"
                  style={{ padding: "4px 8px", fontSize: 12 }}
                  onClick={() => setIsOpen(false)}
                >
                  ✕ Close (Esc)
                </button>
              </div>
            </div>

            {/* Quick Chapter Selector Dots / Pills */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "10px 24px",
                background: "rgba(255, 255, 255, 0.015)",
                borderBottom: "1px solid var(--border)",
                overflowX: "auto",
              }}
            >
              {DIMENSIONS.map((d, i) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setActivePage(i)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 6,
                    border: i === activePage ? "1px solid var(--accent)" : "1px solid transparent",
                    background: i === activePage ? "rgba(207, 173, 116, 0.12)" : "transparent",
                    color: i === activePage ? "var(--text)" : "var(--text-3)",
                    fontSize: 11,
                    fontFamily: "var(--mono)",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: i === activePage ? d.accentColor : "var(--border)",
                    }}
                  />
                  <span>{d.number}</span>
                  <span style={{ display: i === activePage ? "inline" : "none" }}>{d.title.split(" ")[0]}</span>
                </button>
              ))}
            </div>

            {/* Modal Body: The Active Dimension Page */}
            <div
              style={{
                padding: "32px 36px",
                overflowY: "auto",
                flex: 1,
              }}
            >
              {/* Page Number & Badge */}
              <div className="row between g-12" style={{ marginBottom: 12, alignItems: "center" }}>
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    color: currentChapter.accentColor,
                  }}
                >
                  DIMENSION {currentChapter.number}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: "var(--mono)",
                    padding: "3px 8px",
                    borderRadius: 4,
                    background: `${currentChapter.accentColor}18`,
                    color: currentChapter.accentColor,
                    border: `1px solid ${currentChapter.accentColor}44`,
                  }}
                >
                  {currentChapter.badge}
                </span>
              </div>

              {/* Title & Tagline */}
              <h3
                style={{
                  fontSize: "clamp(1.4rem, 3vw, 1.85rem)",
                  fontWeight: 650,
                  color: "var(--text)",
                  margin: "0 0 6px 0",
                  lineHeight: 1.2,
                }}
              >
                {currentChapter.title}
              </h3>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: "var(--accent)",
                  marginBottom: 16,
                  fontFamily: "var(--mono)",
                }}
              >
                {currentChapter.subtitle}
              </div>

              <div
                style={{
                  fontSize: 15,
                  lineHeight: 1.55,
                  color: "var(--text)",
                  background: "rgba(255, 255, 255, 0.03)",
                  borderLeft: `3px solid ${currentChapter.accentColor}`,
                  padding: "12px 16px",
                  borderRadius: "0 8px 8px 0",
                  marginBottom: 24,
                  fontStyle: "italic",
                }}
              >
                “{currentChapter.tagline}”
              </div>

              {/* 3 Detail Blocks */}
              <div style={{ display: "grid", gap: 18 }}>
                {/* Thesis */}
                <div>
                  <h4
                    style={{
                      fontSize: 11,
                      fontFamily: "var(--mono)",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "var(--text-3)",
                      margin: "0 0 6px 0",
                    }}
                  >
                    The Problem Thesis
                  </h4>
                  <p style={{ margin: 0, fontSize: 14, color: "var(--text-2)", lineHeight: 1.6 }}>
                    {currentChapter.thesis}
                  </p>
                </div>

                {/* On-Chain Mechanism */}
                <div>
                  <h4
                    style={{
                      fontSize: 11,
                      fontFamily: "var(--mono)",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "var(--text-3)",
                      margin: "0 0 6px 0",
                    }}
                  >
                    On-Chain Circuit Primitive
                  </h4>
                  <p style={{ margin: 0, fontSize: 14, color: "var(--text-2)", lineHeight: 1.6 }}>
                    {currentChapter.mechanism}
                  </p>
                </div>

                {/* Mathematical Specification Formula */}
                {currentChapter.formula && (
                  <div
                    style={{
                      background: "rgba(10, 13, 18, 0.8)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: "12px 16px",
                      fontFamily: "var(--mono)",
                      fontSize: 12.5,
                      color: currentChapter.accentColor,
                    }}
                  >
                    <span style={{ fontSize: 10, textTransform: "uppercase", color: "var(--text-3)", display: "block", marginBottom: 4 }}>
                      On-Chain Constraint Specification
                    </span>
                    <code>{currentChapter.formula}</code>
                  </div>
                )}

                {/* Why It Matters */}
                <div>
                  <h4
                    style={{
                      fontSize: 11,
                      fontFamily: "var(--mono)",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "var(--text-3)",
                      margin: "0 0 6px 0",
                    }}
                  >
                    Why This Changes Everything
                  </h4>
                  <p style={{ margin: 0, fontSize: 14, color: "var(--text-2)", lineHeight: 1.6 }}>
                    {currentChapter.whyItMatters}
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Navigation Footer */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 24px",
                borderTop: "1px solid var(--border)",
                background: "rgba(10, 13, 18, 0.8)",
              }}
            >
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                disabled={activePage === 0}
                onClick={() => setActivePage((p) => Math.max(0, p - 1))}
                style={{ opacity: activePage === 0 ? 0.4 : 1 }}
              >
                ← Previous Page
              </button>

              <span style={{ fontSize: 12, fontFamily: "var(--mono)", color: "var(--text-3)" }}>
                Use ← / → keys to flip pages
              </span>

              {activePage < DIMENSIONS.length - 1 ? (
                <button
                  type="button"
                  className="btn btn--accent btn--sm"
                  onClick={() => setActivePage((p) => Math.min(DIMENSIONS.length - 1, p + 1))}
                >
                  Next Page: {DIMENSIONS[activePage + 1].title.split(" ")[0]} →
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn--accent btn--sm"
                  onClick={() => setIsOpen(false)}
                >
                  Finish Reading ✓
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Global styling for the 3D book hover and bump animation */}
      <style>{`
        .codex-book-trigger:hover {
          transform: translateY(-8px) rotateY(-8deg) scale(1.03);
          box-shadow: 0 24px 48px rgba(0,0,0,0.6);
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes bumpScale {
          0% {
            opacity: 0;
            transform: scale(0.88) translateY(24px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </section>
  );
}
