import React, { useState, useEffect, useCallback } from "react";
import { Reveal } from "../ui/Reveal";
import { Pill, Icon } from "../ui";

/* -------------------------------------------------------------------------- */
/*  Dimensions Data (7 Chapters)                                              */
/* -------------------------------------------------------------------------- */

export interface DimensionChapter {
  id: string;
  number: string;
  roman: string;
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
    roman: "I",
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
    roman: "II",
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
    roman: "III",
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
    roman: "IV",
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
    roman: "V",
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
    roman: "VI",
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
    roman: "VII",
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
  const [activeChapterIndex, setActiveChapterIndex] = useState(0);
  const [flipDirection, setFlipDirection] = useState<"next" | "prev" | null>(null);

  const chapter = DIMENSIONS[activeChapterIndex];

  const goToChapter = (index: number) => {
    if (index === activeChapterIndex) return;
    setFlipDirection(index > activeChapterIndex ? "next" : "prev");
    setActiveChapterIndex(index);
  };

  const nextChapter = () => {
    if (activeChapterIndex < DIMENSIONS.length - 1) {
      goToChapter(activeChapterIndex + 1);
    }
  };

  const prevChapter = () => {
    if (activeChapterIndex > 0) {
      goToChapter(activeChapterIndex - 1);
    }
  };

  // Keyboard navigation when book is open
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") {
        setIsOpen(false);
      } else if (e.key === "ArrowRight") {
        nextChapter();
      } else if (e.key === "ArrowLeft") {
        prevChapter();
      }
    },
    [isOpen, activeChapterIndex]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Lock body scroll when book modal is open
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

  // Clear flip animation flag after transition
  useEffect(() => {
    if (flipDirection) {
      const timer = setTimeout(() => setFlipDirection(null), 500);
      return () => clearTimeout(timer);
    }
  }, [flipDirection, activeChapterIndex]);

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
              Click the book below to open the real 3D Architectural Codex and explore each chapter.
            </p>
          </div>
        </Reveal>

        {/* ── Compact Closed Book Showcase on the Page ── */}
        <Reveal delay={80}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 36,
              alignItems: "center",
              background: "var(--surface-1, rgba(16, 20, 28, 0.6))",
              border: "1px solid var(--border)",
              borderRadius: 16,
              padding: "36px 32px",
              boxShadow: "0 20px 48px rgba(0, 0, 0, 0.4)",
            }}
          >
            {/* Left: The Small Realistic Hardcover Book */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div
                role="button"
                tabIndex={0}
                aria-label="Open the Circuit Architectural Codex"
                onClick={() => {
                  setActiveChapterIndex(0);
                  setIsOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setActiveChapterIndex(0);
                    setIsOpen(true);
                  }
                }}
                className="real-book-closed"
              >
                {/* Book Front Cover */}
                <div className="real-book-cover">
                  {/* Leather Spine Foil Edge */}
                  <div className="real-book-spine-line" />

                  {/* Header Foil */}
                  <div style={{ borderBottom: "1px solid rgba(207, 173, 116, 0.3)", paddingBottom: 8 }}>
                    <span className="gold-folio">CIRCUIT PROTOCOL</span>
                    <span className="gold-sub-folio">SOLANA ARCHITECTURE</span>
                  </div>

                  {/* Center Gilded Emblem & Title */}
                  <div style={{ textAlign: "center", margin: "auto 0" }}>
                    <div className="gold-emblem">
                      <Icon name="shield" size={22} />
                    </div>
                    <div className="gold-title">
                      ARCHITECTURAL
                      <br />
                      <span>CODEX</span>
                    </div>
                    <div className="gold-chapters-meta">VII CHAPTERS · ON-CHAIN</div>
                  </div>

                  {/* Hanging Silk Ribbon */}
                  <div className="silk-ribbon" />

                  {/* Book Footer */}
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 9, fontFamily: "var(--mono)", color: "var(--accent)" }}>
                      CLICK TO OPEN ↗
                    </span>
                    <span style={{ fontSize: 8, fontFamily: "var(--mono)", color: "var(--text-3)" }}>
                      HARDCOVER
                    </span>
                  </div>
                </div>

                {/* 3D Paper Page Edges (Right & Bottom) */}
                <div className="real-book-pages-right" />
                <div className="real-book-pages-bottom" />
              </div>

              <div style={{ marginTop: 18, textAlign: "center" }}>
                <button
                  type="button"
                  className="btn btn--accent btn--sm"
                  onClick={() => {
                    setActiveChapterIndex(0);
                    setIsOpen(true);
                  }}
                  style={{
                    boxShadow: "0 0 20px rgba(207, 173, 116, 0.25)",
                    fontWeight: 650,
                  }}
                >
                  <Icon name="verify" size={14} />
                  Open Real Book (7 Chapters)
                </button>
              </div>
            </div>

            {/* Right: Chapter Directory Preview */}
            <div>
              <div className="row between g-8" style={{ marginBottom: 14, alignItems: "center" }}>
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    color: "var(--text-3)",
                  }}
                >
                  Table of Contents · 7 Architectural Dimensions
                </span>
                <Pill tone="accent" withDot>
                  OPEN TO READ
                </Pill>
              </div>

              <div style={{ display: "grid", gap: 7 }}>
                {DIMENSIONS.map((dim, idx) => (
                  <div
                    key={dim.id}
                    onClick={() => {
                      setActiveChapterIndex(idx);
                      setIsOpen(true);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setActiveChapterIndex(idx);
                        setIsOpen(true);
                      }
                    }}
                    className="chapter-item-row"
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span
                        style={{
                          fontFamily: "var(--mono)",
                          fontSize: 11,
                          fontWeight: 700,
                          color: dim.accentColor,
                          width: 24,
                        }}
                      >
                        {dim.roman}.
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
                          fontSize: 10,
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

      {/* ── Realistic 3D Open Book Modal (Bumps on Screen) ── */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Real 3D Open Book - Architectural Codex"
          className="book-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsOpen(false);
          }}
        >
          {/* Main Book Casing & Perspective Container */}
          <div className="open-book-perspective-wrapper">
            {/* Top Navigation & Close Header */}
            <div className="open-book-topbar">
              <div className="row g-10" style={{ alignItems: "center" }}>
                <span
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 6,
                    background: "rgba(207, 173, 116, 0.15)",
                    color: "var(--accent)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name="shield" size={15} />
                </span>
                <div>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--accent)", letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 700 }}>
                    THE CIRCUIT ARCHITECTURAL CODEX
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-3)", marginLeft: 8 }}>
                    Chapter {chapter.roman} of VII · One Dimension per Page
                  </span>
                </div>
              </div>

              <div className="row g-10" style={{ alignItems: "center" }}>
                <Pill tone="accent">
                  CHAPTER {chapter.number} / 07
                </Pill>
                <button
                  type="button"
                  aria-label="Close book"
                  className="btn btn--ghost btn--sm"
                  style={{ padding: "4px 10px", fontSize: 12 }}
                  onClick={() => setIsOpen(false)}
                >
                  ✕ Close Book (Esc)
                </button>
              </div>
            </div>

            {/* The Real 3D Open Hardcover Volume */}
            <div className="open-book-hardcover-casing">
              {/* Silk ribbon hanging down the center fold */}
              <div className="center-silk-ribbon" />

              {/* ── Left Page (Verso) ── */}
              <div className={`open-book-page left-page ${flipDirection === "prev" ? "flip-page-anim-left" : ""}`}>
                {/* Folio running head */}
                <div className="page-running-head">
                  <span>CIRCUIT ARCHITECTURAL CODEX</span>
                  <span>CHAPTER {chapter.roman}</span>
                </div>

                {/* Chapter Roman Watermark */}
                <div className="chapter-watermark">{chapter.roman}</div>

                {/* Left Page Body */}
                <div className="page-inner-content">
                  <div style={{ marginBottom: 12 }}>
                    <span className="chapter-pill-tag" style={{ color: chapter.accentColor, borderColor: `${chapter.accentColor}44` }}>
                      DIMENSION {chapter.number} · {chapter.badge}
                    </span>
                  </div>

                  <h3 className="chapter-headline">{chapter.title}</h3>
                  <div className="chapter-sub-headline">{chapter.subtitle}</div>

                  {/* Illuminated Tagline Quote Box */}
                  <div className="chapter-tagline-quote" style={{ borderLeftColor: chapter.accentColor }}>
                    “{chapter.tagline}”
                  </div>

                  {/* Mathematical Formula / Spec Box */}
                  {chapter.formula && (
                    <div className="chapter-formula-card">
                      <span className="formula-label">On-Chain Mathematical Constraint</span>
                      <code style={{ color: chapter.accentColor }}>{chapter.formula}</code>
                    </div>
                  )}
                </div>

                {/* Left Page Number Footer */}
                <div className="page-footer-nav left-footer">
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    disabled={activeChapterIndex === 0}
                    onClick={prevChapter}
                    style={{ opacity: activeChapterIndex === 0 ? 0.35 : 1, padding: "3px 8px", fontSize: 11 }}
                  >
                    ◂ Turn Page (Prev Chapter)
                  </button>
                  <span className="page-number-text">PAGE {activeChapterIndex * 2 + 1}</span>
                </div>
              </div>

              {/* Center Book Spine Crease & Shadow Gutter */}
              <div className="book-spine-crease-gutter" />

              {/* ── Right Page (Recto) ── */}
              <div className={`open-book-page right-page ${flipDirection === "next" ? "flip-page-anim-right" : ""}`}>
                {/* Folio running head */}
                <div className="page-running-head">
                  <span>ON-CHAIN CIRCUIT SPECIFICATION</span>
                  <span>SOLANA DEVNET</span>
                </div>

                {/* Right Page Content */}
                <div className="page-inner-content">
                  {/* Thesis Section */}
                  <div className="spec-section-block">
                    <div className="spec-section-title">
                      <span className="spec-step-dot" style={{ background: chapter.accentColor }} />
                      I. The Problem Thesis
                    </div>
                    <p className="spec-section-body">{chapter.thesis}</p>
                  </div>

                  {/* Mechanism Section */}
                  <div className="spec-section-block">
                    <div className="spec-section-title">
                      <span className="spec-step-dot" style={{ background: chapter.accentColor }} />
                      II. On-Chain Circuit Mechanism
                    </div>
                    <p className="spec-section-body">{chapter.mechanism}</p>
                  </div>

                  {/* Why It Matters Section */}
                  <div className="spec-section-block">
                    <div className="spec-section-title">
                      <span className="spec-step-dot" style={{ background: chapter.accentColor }} />
                      III. Solvency & Economic Invariant
                    </div>
                    <p className="spec-section-body">{chapter.whyItMatters}</p>
                  </div>
                </div>

                {/* Right Page Number Footer & Next Action */}
                <div className="page-footer-nav right-footer">
                  <span className="page-number-text">PAGE {activeChapterIndex * 2 + 2}</span>
                  {activeChapterIndex < DIMENSIONS.length - 1 ? (
                    <button
                      type="button"
                      className="btn btn--accent btn--sm"
                      onClick={nextChapter}
                      style={{ padding: "3px 10px", fontSize: 11 }}
                    >
                      Turn Page (Chapter {DIMENSIONS[activeChapterIndex + 1].roman}) ▸
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--accent btn--sm"
                      onClick={() => setIsOpen(false)}
                      style={{ padding: "3px 10px", fontSize: 11 }}
                    >
                      Close Codex ✓
                    </button>
                  )}
                </div>
              </div>

              {/* ── Gilded Bookmark Tabs on the Right Edge ── */}
              <div className="book-edge-tabs">
                {DIMENSIONS.map((d, idx) => {
                  const isActive = idx === activeChapterIndex;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      aria-label={`Jump to Chapter ${d.roman}: ${d.title}`}
                      onClick={() => goToChapter(idx)}
                      className={`book-edge-tab ${isActive ? "active-tab" : ""}`}
                      style={{
                        borderLeftColor: isActive ? d.accentColor : "transparent",
                        background: isActive ? "rgba(207, 173, 116, 0.22)" : "rgba(20, 24, 32, 0.9)",
                        color: isActive ? "var(--text)" : "var(--text-3)",
                      }}
                    >
                      <span className="tab-roman">{d.roman}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bottom Keyboard Hint */}
            <div className="open-book-bottom-hint">
              <span>Tip: Use ← and → arrow keys on your keyboard to turn pages smoothly, or press Esc to close.</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Real 3D Book Styles & Smooth Keyframe Animations ── */}
      <style>{`
        /* Closed Book 3D Container */
        .real-book-closed {
          width: 200px;
          height: 275px;
          position: relative;
          cursor: pointer;
          perspective: 1200px;
          transform-style: preserve-3d;
          transition: transform 0.4s cubic-bezier(0.25, 1, 0.5, 1), box-shadow 0.4s ease;
        }
        .real-book-closed:hover {
          transform: translateY(-10px) rotateY(-12deg) rotateX(4deg) scale(1.04);
        }

        /* Closed Book Cover Styling */
        .real-book-cover {
          width: 100%;
          height: 100%;
          background: linear-gradient(135deg, #181d28 0%, #0d1017 100%);
          border: 1.5px solid rgba(207, 173, 116, 0.4);
          border-radius: 4px 12px 12px 4px;
          box-shadow:
            -8px 0 0 #080a0e,
            -12px 0 20px rgba(0,0,0,0.7),
            14px 20px 36px rgba(0,0,0,0.6),
            inset 0 0 30px rgba(0,0,0,0.8);
          padding: 22px 18px;
          display: flex;
          flex-direction: column;
          justifyContent: space-between;
          position: relative;
          overflow: hidden;
        }

        /* Leather Spine Line */
        .real-book-spine-line {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 16px;
          background: linear-gradient(90deg, rgba(0,0,0,0.7) 0%, rgba(255,255,255,0.1) 45%, rgba(0,0,0,0.5) 100%);
          border-right: 1px solid rgba(207, 173, 116, 0.25);
        }

        /* Foil Typography */
        .gold-folio {
          font-family: var(--mono);
          font-size: 9.5px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--accent);
          display: block;
          font-weight: 700;
        }
        .gold-sub-folio {
          font-family: var(--mono);
          font-size: 8px;
          letter-spacing: 0.12em;
          color: var(--text-3);
        }
        .gold-emblem {
          width: 44px;
          height: 44px;
          margin: 0 auto 10px;
          border-radius: 50%;
          border: 1.5px solid var(--accent);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--accent);
          background: rgba(207, 173, 116, 0.1);
          box-shadow: 0 0 16px rgba(207, 173, 116, 0.15);
        }
        .gold-title {
          font-size: 14.5px;
          font-weight: 750;
          letter-spacing: 0.08em;
          color: var(--text);
          text-transform: uppercase;
          line-height: 1.25;
        }
        .gold-title span {
          color: var(--accent);
        }
        .gold-chapters-meta {
          font-size: 9px;
          color: var(--text-3);
          font-family: var(--mono);
          margin-top: 6px;
          letter-spacing: 0.05em;
        }

        /* Silk Hanging Ribbon */
        .silk-ribbon {
          position: absolute;
          bottom: -12px;
          right: 32px;
          width: 14px;
          height: 26px;
          background: var(--accent);
          clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 78%, 0 100%);
          box-shadow: 0 3px 8px rgba(0,0,0,0.6);
        }

        /* 3D Paper Page Stack Edges */
        .real-book-pages-right {
          position: absolute;
          right: -8px;
          top: 6px;
          bottom: 6px;
          width: 8px;
          background: repeating-linear-gradient(180deg, #ded9c7 0px, #ded9c7 1px, #b2ab96 1px, #b2ab96 2px);
          border-radius: 0 3px 3px 0;
          box-shadow: 3px 0 6px rgba(0,0,0,0.5);
        }
        .real-book-pages-bottom {
          position: absolute;
          bottom: -7px;
          left: 10px;
          right: -4px;
          height: 7px;
          background: repeating-linear-gradient(90deg, #ded9c7 0px, #ded9c7 1px, #b2ab96 1px, #b2ab96 2px);
          border-radius: 0 0 3px 3px;
          box-shadow: 0 3px 6px rgba(0,0,0,0.5);
        }

        /* Table of Contents Row */
        .chapter-item-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--border);
          cursor: pointer;
          transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
        }
        .chapter-item-row:hover {
          background: rgba(207, 173, 116, 0.08);
          border-color: var(--accent);
          transform: translateX(4px);
        }

        /* Modal Backdrop */
        .book-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 10000;
          background: rgba(4, 6, 10, 0.88);
          backdrop-filter: blur(14px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          animation: bookModalFade 0.25s ease-out;
        }

        /* Perspective Wrapper */
        .open-book-perspective-wrapper {
          width: 100%;
          max-width: 980px;
          display: flex;
          flex-direction: column;
          align-items: center;
          perspective: 2000px;
          animation: bookOpenBump 0.4s cubic-bezier(0.25, 1, 0.5, 1);
        }

        /* Top Bar */
        .open-book-topbar {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 18px;
          margin-bottom: 8px;
          background: rgba(14, 18, 25, 0.85);
          border: 1px solid var(--border);
          border-radius: 10px;
        }

        /* Realistic Hardcover Book Casing (Two-Page Spread) */
        .open-book-hardcover-casing {
          width: 100%;
          display: flex;
          position: relative;
          background: #090c12;
          border: 2px solid rgba(207, 173, 116, 0.45);
          border-radius: 12px;
          box-shadow:
            0 32px 80px rgba(0, 0, 0, 0.9),
            0 0 40px rgba(207, 173, 116, 0.15),
            inset 0 0 50px rgba(0, 0, 0, 0.9);
          min-height: 520px;
          max-height: 82vh;
          overflow: hidden;
        }

        /* Center Silk Ribbon Marker */
        .center-silk-ribbon {
          position: absolute;
          top: 0;
          left: 50%;
          transform: translateX(-50%);
          width: 16px;
          height: 98%;
          background: linear-gradient(180deg, var(--accent) 0%, rgba(207, 173, 116, 0.85) 85%, transparent 100%);
          z-index: 10;
          pointer-events: none;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6);
          border-radius: 0 0 4px 4px;
        }

        /* Individual Book Page */
        .open-book-page {
          flex: 1;
          padding: 28px 34px 20px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          position: relative;
          overflow-y: auto;
          background: linear-gradient(180deg, #131720 0%, #0e1118 100%);
          transform-style: preserve-3d;
          transition: transform 0.4s ease, opacity 0.4s ease;
        }

        /* Left Page Styling & Shadow Fold on Right Edge */
        .left-page {
          border-right: 1px solid rgba(0, 0, 0, 0.5);
          box-shadow: inset -20px 0 30px rgba(0, 0, 0, 0.5);
        }

        /* Right Page Styling & Shadow Fold on Left Edge */
        .right-page {
          border-left: 1px solid rgba(255, 255, 255, 0.04);
          box-shadow: inset 20px 0 30px rgba(0, 0, 0, 0.5);
        }

        /* Center Book Spine Crease */
        .book-spine-crease-gutter {
          width: 8px;
          background: linear-gradient(90deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.8) 100%);
          z-index: 5;
        }

        /* Running Head */
        .page-running-head {
          display: flex;
          justify-content: space-between;
          padding-bottom: 10px;
          margin-bottom: 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          font-family: var(--mono);
          font-size: 9.5px;
          letter-spacing: 0.12em;
          color: var(--text-3);
          text-transform: uppercase;
        }

        /* Watermark Roman Numeral */
        .chapter-watermark {
          position: absolute;
          top: 30px;
          right: 30px;
          font-size: 80px;
          font-weight: 800;
          font-family: serif;
          color: rgba(255, 255, 255, 0.025);
          line-height: 1;
          pointer-events: none;
          user-select: none;
        }

        .page-inner-content {
          flex: 1;
          position: relative;
          z-index: 2;
        }

        .chapter-pill-tag {
          font-family: var(--mono);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          padding: 2px 8px;
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid;
          display: inline-block;
        }

        .chapter-headline {
          font-size: clamp(1.35rem, 2.6vw, 1.8rem);
          font-weight: 700;
          color: var(--text);
          margin: 0 0 6px 0;
          line-height: 1.22;
        }

        .chapter-sub-headline {
          font-size: 13.5px;
          font-family: var(--mono);
          color: var(--accent);
          margin-bottom: 16px;
        }

        .chapter-tagline-quote {
          font-size: 14.5px;
          line-height: 1.55;
          color: var(--text);
          background: rgba(255, 255, 255, 0.025);
          border-left: 3.5px solid;
          padding: 12px 16px;
          border-radius: 0 8px 8px 0;
          margin-bottom: 20px;
          font-style: italic;
        }

        .chapter-formula-card {
          background: rgba(8, 11, 16, 0.85);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 12px 16px;
          font-family: var(--mono);
          font-size: 12px;
        }
        .formula-label {
          font-size: 9.5px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-3);
          display: block;
          margin-bottom: 4px;
        }

        /* Right Page Sections */
        .spec-section-block {
          margin-bottom: 18px;
        }
        .spec-section-title {
          font-family: var(--mono);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text);
          font-weight: 700;
          margin-bottom: 5px;
          display: flex;
          align-items: center;
          gap: 7px;
        }
        .spec-step-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
        }
        .spec-section-body {
          margin: 0;
          font-size: 13.5px;
          color: var(--text-2);
          line-height: 1.58;
        }

        /* Page Footer Nav */
        .page-footer-nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 14px;
          margin-top: 14px;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
        }
        .page-number-text {
          font-family: var(--mono);
          font-size: 11px;
          color: var(--text-3);
        }

        /* Gilded Edge Index Tabs */
        .book-edge-tabs {
          position: absolute;
          right: 0;
          top: 40px;
          bottom: 40px;
          width: 32px;
          display: flex;
          flex-direction: column;
          justifyContent: space-around;
          z-index: 15;
          pointer-events: auto;
        }
        .book-edge-tab {
          width: 100%;
          height: 38px;
          border: none;
          border-left: 3px solid transparent;
          border-radius: 4px 0 0 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
          padding: 0;
        }
        .book-edge-tab:hover {
          width: 36px;
          margin-left: -4px;
        }
        .tab-roman {
          font-family: var(--mono);
          font-size: 10px;
          font-weight: 750;
        }

        .open-book-bottom-hint {
          margin-top: 8px;
          font-size: 11px;
          font-family: var(--mono);
          color: var(--text-3);
          text-align: center;
        }

        /* 3D Animations */
        @keyframes bookModalFade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes bookOpenBump {
          0% {
            opacity: 0;
            transform: scale(0.85) translateY(40px) rotateX(12deg);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0) rotateX(0deg);
          }
        }

        .flip-page-anim-right {
          animation: pageFlipRight 0.45s cubic-bezier(0.25, 1, 0.5, 1);
        }
        .flip-page-anim-left {
          animation: pageFlipLeft 0.45s cubic-bezier(0.25, 1, 0.5, 1);
        }

        @keyframes pageFlipRight {
          0% {
            opacity: 0.4;
            transform: rotateY(-18deg);
          }
          100% {
            opacity: 1;
            transform: rotateY(0deg);
          }
        }
        @keyframes pageFlipLeft {
          0% {
            opacity: 0.4;
            transform: rotateY(18deg);
          }
          100% {
            opacity: 1;
            transform: rotateY(0deg);
          }
        }

        /* Responsive Breakpoint for Mobile Single-Page Stack */
        @media (max-width: 768px) {
          .open-book-hardcover-casing {
            flex-direction: column;
            max-height: 85vh;
          }
          .book-spine-crease-gutter {
            display: none;
          }
          .center-silk-ribbon {
            display: none;
          }
          .book-edge-tabs {
            display: none;
          }
        }
      `}</style>
    </section>
  );
}
