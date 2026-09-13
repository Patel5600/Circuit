import React, { useState, useEffect, useCallback } from "react";
import { Reveal } from "../ui/Reveal";
import { Pill, Icon } from "../ui";

/* -------------------------------------------------------------------------- */
/*  Dimensions Data (7 Chapters)                                              */
/* -------------------------------------------------------------------------- */

export interface DimensionChapter {
  id: string;
  number: number;
  roman: string;
  title: string;
  subtitle: string;
  badge: string;
  tagline: string;
  thesis: string;
  mechanism: string;
  formula: string;
  whyItMatters: string;
  accentColor: string;
}

const DIMENSIONS: DimensionChapter[] = [
  {
    id: "custody",
    number: 1,
    roman: "I",
    title: "Qualified Collateral Custody",
    subtitle: "Real Asset Backing vs Synthetic Rehypothecation",
    badge: "1:1 Custody Isolation",
    tagline: "Tokenized equities are legally enforceable shares held in regulated custody, not synthetic contracts.",
    thesis:
      "Unlike crypto-native tokens that exist solely in protocol pools, tokenized equities represent beneficial ownership of registered securities stored with licensed broker-dealers and custodians.",
    mechanism:
      "Collateral tokens (SPL) are deposited into program-derived vaults owned exclusively by the protocol config PDA. Corporate actions, proxy splits, and dividend distributions remain isolated without protocol rehypothecation.",
    formula: "Collateral Value = Deposited Tokens × Verified Qualified Price",
    whyItMatters:
      "Eliminates counterparty rehypothecation risk and guarantees that every dollar of collateral on Solana is backed by physical securities in depository trust.",
    accentColor: "#7fc39a",
  },
  {
    id: "oracle",
    number: 2,
    roman: "II",
    title: "Conservative Pyth Valuation",
    subtitle: "Lower-Bound Confidence Interval Pricing",
    badge: "p - conf Lower Bound",
    tagline: "Point estimates fail when spreads explode. Circuit evaluates collateral strictly at the confidence lower bound.",
    thesis:
      "During market opens, earnings prints, and macro announcements, the bid-ask spread of equities widens drastically. Taking the oracle mid-price ignores uncertainty and overvalues collateral right before liquidations.",
    mechanism:
      "The protocol reads Pyth Network PriceUpdateV2 accounts on-chain and enforces conservative pricing: p_conservative = max(0, p - conf). If the confidence ratio (conf / p) exceeds asset thresholds (50 bps / 150 bps), borrow gates trigger immediately.",
    formula: "p_conservative = max(0, price - confidence)",
    whyItMatters:
      "Prevents flash-crash overborrowing and immunizes the liquidity pool from transient publisher disagreement.",
    accentColor: "#cfad74",
  },
  {
    id: "session",
    number: 3,
    roman: "III",
    title: "Deterministic NYSE Session Guard",
    subtitle: "Market Calendar Aware Credit",
    badge: "On-Chain MarketGuard",
    tagline: "Equities do not trade 24/7. Credit generation must halt when underlying venues close.",
    thesis:
      "Traditional DeFi assumes 24/7 continuous liquidity. In contrast, US equity markets close at 16:00 ET and remain closed on weekends and holidays, leaving portfolios exposed to multi-day gap-down risk on breaking news.",
    mechanism:
      "Circuit implements an on-chain deterministic NYSE calendar inside MarketGuard PDA. Clock timestamps are evaluated for regular sessions (09:30–16:00 ET), weekends, and exchange holidays. Off-hours borrowing is blocked automatically on-chain.",
    formula: "Session Gate: RegularSession ? Safe : Restricted",
    whyItMatters:
      "Stops borrowers from draining USDC vaults during weekend news events before physical equity exchanges open.",
    accentColor: "#58a6ff",
  },
  {
    id: "ratchet",
    number: 4,
    roman: "IV",
    title: "4-State Risk Ratchet",
    subtitle: "Asymmetric Fast-Tightening State Machine",
    badge: "4-State Machine",
    tagline: "Binary risk states create liquidation cascades. Circuit introduces a 4-tier gradual defensive posture.",
    thesis:
      "Binary systems (solvent vs liquidatable) wait until debt exceeds threshold, causing sudden liquidations. Circuit proactively constrains new leverage as soon as stress metrics degrade.",
    mechanism:
      "A dedicated on-chain RiskRatchet PDA tracks states: Safe → Restricted → Defensive → Emergency. Any breach of confidence bounds (> 50, > 150, > 300 bps) or custody impairment instantly ratchets state downward in the same slot.",
    formula: "State Transition: Tightening occurs instantly (slot t = t_stress)",
    whyItMatters:
      "Limits downside exposure early by restricting new borrowing while keeping repayment paths 100% open.",
    accentColor: "#e08c4e",
  },
  {
    id: "hysteresis",
    number: 5,
    roman: "V",
    title: "Monotonic Hysteresis Recovery",
    subtitle: "Evidence-Based Monotonic Upgrades",
    badge: "5 Clean Ticks Hysteresis",
    tagline: "A single clean tick does not mean calm has returned. Recovery requires consecutive verified proofs.",
    thesis:
      "Markets often experience false bounces. If borrowing permissions re-enable on a single favorable tick, borrowers can re-lever during the eye of the storm (flapping hazard).",
    mechanism:
      "The protocol enforces strict monotonic recovery with deadbands. Direct Emergency → Safe transitions are mathematically prohibited. Upgrading each tier requires N (e.g. 5) consecutive verified clean observations via permissionless cranks.",
    formula: "Recovery Condition: consecutive_observations ≥ 5 ∧ conf_ratio ≤ deadband",
    whyItMatters:
      "Guarantees that credit capacity only returns after durable market stabilization has been proven on-chain.",
    accentColor: "#bc8cff",
  },
  {
    id: "concentration",
    number: 6,
    roman: "VI",
    title: "Multi-Asset Concentration Penalty",
    subtitle: "Dynamic Leverage Throttling",
    badge: "C_max > 40% Penalty",
    tagline: "Single-stock concentration carries idiosyncratic crash risk. Circuit scales allowable LTV with diversification.",
    thesis:
      "A borrower pledging 90% in a single semiconductor stock carries vastly higher drawdown risk than one holding a diversified basket of indices and mega-caps, yet standard protocols grant them identical LTV.",
    mechanism:
      "Circuit calculates single-asset portfolio concentration: C_max = max(w_i). When C_max exceeds 40%, an on-chain penalty scales down allowable borrowing: Effective LTV = max(30%, Base LTV - Penalty), reducing leverage from 70% to 52%.",
    formula: "Penalty (bps) = (C_max - 40%) × slope_bps",
    whyItMatters:
      "Protects senior lending vaults from single-company gap-downs, earnings misses, or corporate fraud.",
    accentColor: "#79c0ff",
  },
  {
    id: "liquidation",
    number: 7,
    roman: "VII",
    title: "Severity-Scaled Liquidation Game Theory",
    subtitle: "Dutch Auction vs Latency Arms Races",
    badge: "Dynamic Shortfall Slope",
    tagline: "Flat bonuses create MEV bot races. Continuous severity-scaled discounts eliminate fixed-prize wars.",
    thesis:
      "Flat liquidation bonuses (e.g. fixed 5%) incentivize bot wars to front-run minor under-collateralizations, while under-incentivizing deep under-water positions during extreme volatility.",
    mechanism:
      "Circuit implements severity-scaled liquidation with Dutch auction ramps: bonus = min(max_cap, base_bonus + shortfall × slope). Healthier positions (HF ~ 0.99) carry lower discounts, while severe distress unlocks higher incentives to guarantee solvency.",
    formula: "Bonus = min(MaxCap, Floor + (1.0 - HF) × Slope)",
    whyItMatters:
      "Protects borrower equity from excessive penalty extraction while guaranteeing liquidators show up when risk is highest.",
    accentColor: "#f0883e",
  },
];

/* -------------------------------------------------------------------------- */
/*  Main Component                                                            */
/* -------------------------------------------------------------------------- */

export function FaultLineMatrix() {
  const [isExpanded, setIsExpanded] = useState(false);
  // pageIndex: 0 = closed (cover on top), 1 = page 1 open, 2 = page 2 open, etc.
  const [pageIndex, setPageIndex] = useState(0);

  // Close and reset book
  const resetBook = useCallback(() => {
    setIsExpanded(false);
    setTimeout(() => {
      setPageIndex(0);
    }, 400);
  }, []);

  // Open book and expand
  const expandBook = (targetPage = 1) => {
    setIsExpanded(true);
    // Allow small delay for expansion to start, then flip cover to target page
    setTimeout(() => {
      setPageIndex(targetPage);
    }, 280);
  };

  // Flip forward (next page)
  const flipNext = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!isExpanded) {
      expandBook(1);
      return;
    }
    if (pageIndex <= DIMENSIONS.length) {
      setPageIndex((p) => p + 1);
    }
  };

  // Flip backward (previous page)
  const flipPrev = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (pageIndex > 1) {
      setPageIndex((p) => p - 1);
    } else if (pageIndex === 1) {
      // Close cover
      setPageIndex(0);
    }
  };

  // Handle click on the book
  const handleBookClick = () => {
    if (!isExpanded) {
      expandBook(1);
    } else {
      if (pageIndex < DIMENSIONS.length) {
        setPageIndex((p) => p + 1);
      } else {
        resetBook();
      }
    }
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isExpanded) return;
      if (e.key === "Escape") {
        resetBook();
      } else if (e.key === "ArrowRight") {
        if (pageIndex <= DIMENSIONS.length) setPageIndex((p) => Math.min(DIMENSIONS.length, p + 1));
      } else if (e.key === "ArrowLeft") {
        if (pageIndex > 1) setPageIndex((p) => p - 1);
        else if (pageIndex === 1) setPageIndex(0);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isExpanded, pageIndex, resetBook]);

  // Lock body scroll when book is expanded
  useEffect(() => {
    if (isExpanded) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isExpanded]);

  const activeChapter = DIMENSIONS[Math.max(0, Math.min(DIMENSIONS.length - 1, (pageIndex > 0 ? pageIndex - 1 : 0)))];

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
              Click the book below to open the specification handbook and flip through the chapters.
            </p>
          </div>
        </Reveal>

        {/* ── Section 07 Container: Form / Chapter Index on Left, 3D Book on Right ── */}
        <Reveal delay={80}>
          <div className="dimensions-workshop-grid">
            {/* Left Side: Chapter Index / Specification Sheet */}
            <div className="workshop-form-container">
              <div className="row between g-8" style={{ marginBottom: 16, alignItems: "center" }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: "0.04em", color: "var(--text)" }}>
                  Specification Sheet
                </h3>
                <Pill tone="accent" withDot>7 DIMENSIONS</Pill>
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                {DIMENSIONS.map((dim, idx) => (
                  <div
                    key={dim.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => expandBook(idx + 1)}
                    onKeyDown={(e) => e.key === "Enter" && expandBook(idx + 1)}
                    className="spec-chapter-row"
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

              <div style={{ marginTop: 20 }}>
                <button
                  type="button"
                  className="btn btn--accent btn--md"
                  onClick={() => expandBook(1)}
                  style={{ width: "100%", justifyContent: "center", fontWeight: 650 }}
                >
                  <Icon name="verify" size={15} />
                  Open Architectural Codex (Page 1)
                </button>
              </div>
            </div>

            {/* Right Side: The Interactive 3D Book Mockup */}
            <div className="workshop-book-stage">
              <div
                className={`book-mockup ${isExpanded ? "expanded" : ""}`}
                id="interactive-book"
                onClick={handleBookClick}
              >
                {/* ── Book Front Cover ── */}
                <div className={`book-cover ${pageIndex > 0 ? "flipped" : ""}`}>
                  {/* Left Spine Fold Line */}
                  <div className="cover-spine-crease" />

                  <div className="cover-inner-border">
                    <div className="cover-top-folio">
                      <span>CIRCUIT PROTOCOL</span>
                      <span>SOLANA DEVNET</span>
                    </div>

                    <div className="cover-center-badge">
                      <div className="cover-emblem-circle">
                        <Icon name="shield" size={26} />
                      </div>
                      <h4 className="cover-title-text">
                        ARCHITECTURAL
                        <br />
                        <span>CODEX</span>
                      </h4>
                      <p className="cover-edition-text">VII CHAPTERS · ON-CHAIN</p>
                    </div>

                    <div className="cover-bottom-hint">
                      <span>CLICK TO OPEN ↗</span>
                    </div>
                  </div>
                </div>

                {/* ── Chapter Pages (1 to 7) ── */}
                {DIMENSIONS.map((dim, idx) => {
                  const pageNum = idx + 1;
                  const isFlipped = pageIndex > pageNum;
                  // zIndex decreases with page number so earlier pages sit on top
                  const zIndex = 9 - idx;

                  return (
                    <div
                      key={dim.id}
                      className={`book-page page-${pageNum} ${isFlipped ? "flipped" : ""}`}
                      style={{ zIndex }}
                    >
                      {/* Left Spine Crease Shadow */}
                      <div className="page-spine-shadow" />

                      {/* Header Running Folio */}
                      <div className="page-header-row">
                        <span className="page-folio-label">CIRCUIT CODEX</span>
                        <span className="page-folio-chapter">CHAPTER {dim.roman}</span>
                        <span className="page-number">{pageNum} / 7</span>
                      </div>

                      {/* Chapter Body */}
                      <div className="page-content-flow">
                        <div className="page-chapter-tag" style={{ color: dim.accentColor }}>
                          DIMENSION {dim.roman} · {dim.badge}
                        </div>

                        <h4 className="page-chapter-title">{dim.title}</h4>
                        <div className="page-chapter-subtitle">{dim.subtitle}</div>

                        <div className="page-tagline-quote" style={{ borderLeftColor: dim.accentColor }}>
                          “{dim.tagline}”
                        </div>

                        {/* Detail Sections */}
                        <div className="page-spec-section">
                          <span className="page-spec-title">The Problem Thesis</span>
                          <p className="page-spec-text">{dim.thesis}</p>
                        </div>

                        <div className="page-spec-section">
                          <span className="page-spec-title">On-Chain Circuit Primitive</span>
                          <p className="page-spec-text">{dim.mechanism}</p>
                        </div>

                        {/* Formula Badge */}
                        <div className="page-formula-box">
                          <span className="formula-tag">ON-CHAIN CONSTRAINT</span>
                          <code style={{ color: dim.accentColor }}>{dim.formula}</code>
                        </div>
                      </div>

                      {/* Page Footer Navigation */}
                      <div className="page-bottom-nav">
                        <span className="page-hint-text">
                          {pageNum < 7 ? "Click page to flip next ▸" : "Click page to close ✓"}
                        </span>
                        <span className="page-footer-num">PAGE {pageNum}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Reveal>
      </div>

      {/* ── Overlay Backdrop (Blurs & Dims Screen when Expanded) ── */}
      <div
        className={`book-overlay-backdrop ${isExpanded ? "active" : ""}`}
        onClick={resetBook}
      >
        {/* Floating Top Nav Toolbar during Expanded Mode */}
        {isExpanded && (
          <div
            className="book-expanded-toolbar"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="row g-10" style={{ alignItems: "center" }}>
              <span className="toolbar-emblem">
                <Icon name="shield" size={16} />
              </span>
              <div>
                <span className="toolbar-title">THE CIRCUIT CODEX</span>
                <span className="toolbar-sub">
                  {pageIndex === 0
                    ? "Cover View · Click to open"
                    : `Chapter ${activeChapter.roman}: ${activeChapter.title}`}
                </span>
              </div>
            </div>

            {/* Chapter Dots Navigator */}
            <div className="toolbar-chapter-dots">
              {DIMENSIONS.map((d, i) => (
                <button
                  key={d.id}
                  type="button"
                  title={`Chapter ${d.roman}: ${d.title}`}
                  className={`toolbar-dot-btn ${pageIndex === i + 1 ? "active" : ""}`}
                  onClick={() => setPageIndex(i + 1)}
                >
                  {d.roman}
                </button>
              ))}
            </div>

            <div className="row g-8" style={{ alignItems: "center" }}>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                disabled={pageIndex <= 1}
                onClick={flipPrev}
                style={{ opacity: pageIndex <= 1 ? 0.4 : 1, padding: "3px 8px", fontSize: 11 }}
              >
                ◂ Prev
              </button>

              <button
                type="button"
                className="btn btn--secondary btn--sm"
                disabled={pageIndex >= 7}
                onClick={flipNext}
                style={{ opacity: pageIndex >= 7 ? 0.4 : 1, padding: "3px 8px", fontSize: 11 }}
              >
                Next ▸
              </button>

              <button
                type="button"
                className="btn btn--accent btn--sm"
                onClick={resetBook}
                style={{ padding: "3px 10px", fontSize: 11 }}
              >
                ✕ Close (Esc)
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Precise CSS matching Shade Book Mechanics + High-End Circuit Styling ── */}
      <style>{`
        /* Workshop Layout Grid */
        .dimensions-workshop-grid {
          display: grid;
          grid-template-columns: 1.2fr 0.8fr;
          gap: 40px;
          align-items: center;
          background: var(--surface-1, rgba(16, 20, 28, 0.6));
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 36px 32px;
          box-shadow: 0 20px 48px rgba(0, 0, 0, 0.4);
        }
        @media (max-width: 900px) {
          .dimensions-workshop-grid {
            grid-template-columns: 1fr;
          }
        }

        .workshop-form-container {
          display: flex;
          flex-direction: column;
        }

        .spec-chapter-row {
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
        .spec-chapter-row:hover {
          background: rgba(207, 173, 116, 0.08);
          border-color: var(--accent);
          transform: translateX(4px);
        }

        .workshop-book-stage {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 380px;
          position: relative;
        }

        /* ── Overlay Backdrop ── */
        .book-overlay-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(8, 10, 15, 0);
          backdrop-filter: blur(0px);
          z-index: 9990;
          pointer-events: none;
          transition: all 0.8s cubic-bezier(0.64, 0, 0.32, 1);
        }
        .book-overlay-backdrop.active {
          background: rgba(8, 10, 15, 0.85);
          backdrop-filter: blur(10px);
          pointer-events: auto;
        }

        /* Floating Toolbar */
        .book-expanded-toolbar {
          position: fixed;
          top: 24px;
          left: 50%;
          transform: translateX(-50%);
          width: 90%;
          max-width: 820px;
          background: rgba(18, 22, 30, 0.9);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 10px 18px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.7);
          z-index: 10000;
        }
        .toolbar-emblem {
          width: 28px;
          height: 28px;
          border-radius: 6px;
          background: rgba(207, 173, 116, 0.15);
          color: var(--accent);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .toolbar-title {
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--accent);
          font-weight: 700;
          display: block;
        }
        .toolbar-sub {
          font-size: 11px;
          color: var(--text-3);
        }
        .toolbar-chapter-dots {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .toolbar-dot-btn {
          width: 26px;
          height: 26px;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: rgba(255, 255, 255, 0.03);
          color: var(--text-3);
          font-family: var(--mono);
          font-size: 10.5px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .toolbar-dot-btn:hover {
          border-color: var(--accent);
          color: var(--text);
        }
        .toolbar-dot-btn.active {
          border-color: var(--accent);
          background: rgba(207, 173, 116, 0.2);
          color: var(--accent);
        }

        /* ── The Book Mockup Container ── */
        .book-mockup {
          width: 220px;
          height: 320px;
          position: relative;
          background-color: transparent;
          perspective: 1500px;
          transform-style: preserve-3d;
          transition: all 0.8s cubic-bezier(0.64, 0, 0.32, 1);
          cursor: pointer;
          z-index: 10;
        }

        /* Shadow for closed book */
        .book-mockup::before {
          content: '';
          position: absolute;
          bottom: -10px;
          left: 5%;
          width: 90%;
          height: 24px;
          background: rgba(0, 0, 0, 0.4);
          filter: blur(12px);
          transform: translateZ(-10px);
          transition: opacity 0.5s;
        }

        /* Hover effect only when NOT expanded */
        .book-mockup:not(.expanded):hover {
          transform: rotateY(-10deg) scale(1.03) translateY(-6px);
        }

        /* ── BUMP ON SCREEN: Expanded State ── */
        .book-mockup.expanded {
          position: fixed;
          top: 52%;
          left: 50%;
          transform: translate(-50%, -50%) scale(1.55);
          z-index: 9995;
        }
        @media (max-width: 600px) {
          .book-mockup.expanded {
            transform: translate(-50%, -50%) scale(1.2);
          }
        }

        .book-mockup.expanded::before {
          opacity: 0;
        }

        /* Common sizing for cover and pages */
        .book-cover,
        .book-page {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          border-radius: 3px 8px 8px 3px;
          transform-origin: left center;
          transition: transform 0.8s cubic-bezier(0.64, 0, 0.32, 1);
          backface-visibility: hidden;
          box-shadow: inset 6px 0 14px rgba(0, 0, 0, 0.35);
          user-select: none;
        }

        /* ── The Book Cover ── */
        .book-cover {
          background: linear-gradient(135deg, #181d28 0%, #0e1118 100%);
          border: 1.5px solid rgba(207, 173, 116, 0.4);
          z-index: 10;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .cover-spine-crease {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 14px;
          background: linear-gradient(90deg, rgba(0,0,0,0.65) 0%, rgba(255,255,255,0.08) 50%, rgba(0,0,0,0.4) 100%);
          border-right: 1px solid rgba(207, 173, 116, 0.2);
        }
        .cover-inner-border {
          flex: 1;
          margin: 12px 12px 12px 20px;
          border: 1px solid rgba(207, 173, 116, 0.25);
          padding: 16px 14px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          text-align: center;
        }
        .cover-top-folio {
          display: flex;
          justify-content: space-between;
          font-family: var(--mono);
          font-size: 7.5px;
          letter-spacing: 0.16em;
          color: var(--accent);
          opacity: 0.85;
          text-transform: uppercase;
        }
        .cover-emblem-circle {
          width: 46px;
          height: 46px;
          margin: 0 auto 10px;
          border-radius: 50%;
          border: 1.5px solid var(--accent);
          background: rgba(207, 173, 116, 0.12);
          color: var(--accent);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 16px rgba(207, 173, 116, 0.2);
        }
        .cover-title-text {
          margin: 0;
          font-size: 13.5px;
          font-weight: 750;
          letter-spacing: 0.06em;
          color: var(--text);
          text-transform: uppercase;
          line-height: 1.25;
        }
        .cover-title-text span {
          color: var(--accent);
        }
        .cover-edition-text {
          margin: 6px 0 0;
          font-family: var(--mono);
          font-size: 8px;
          color: var(--text-3);
          letter-spacing: 0.08em;
        }
        .cover-bottom-hint {
          font-family: var(--mono);
          font-size: 8px;
          color: var(--accent);
          letter-spacing: 0.1em;
          opacity: 0.9;
        }

        /* ── Individual Book Pages ── */
        .book-page {
          background: #12161f;
          border: 1px solid rgba(255, 255, 255, 0.08);
          padding: 16px 16px 14px 22px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          color: var(--text);
          overflow: hidden;
        }
        .page-spine-shadow {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 16px;
          background: linear-gradient(90deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 100%);
          pointer-events: none;
        }
        .page-header-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 6px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          font-family: var(--mono);
          font-size: 7.5px;
          color: var(--text-3);
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .page-number {
          font-weight: 700;
          color: var(--accent);
        }
        .page-content-flow {
          flex: 1;
          padding: 8px 0;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .page-chapter-tag {
          font-family: var(--mono);
          font-size: 8px;
          font-weight: 700;
          letter-spacing: 0.08em;
          margin-bottom: 4px;
        }
        .page-chapter-title {
          margin: 0;
          font-size: 11px;
          font-weight: 750;
          color: var(--text);
          line-height: 1.25;
        }
        .page-chapter-subtitle {
          font-size: 8.5px;
          color: var(--accent);
          font-family: var(--mono);
          margin-top: 2px;
          margin-bottom: 6px;
        }
        .page-tagline-quote {
          font-size: 8.5px;
          line-height: 1.35;
          color: var(--text-2);
          font-style: italic;
          background: rgba(255, 255, 255, 0.02);
          border-left: 2px solid;
          padding: 4px 6px;
          margin-bottom: 6px;
          border-radius: 0 4px 4px 0;
        }
        .page-spec-section {
          margin-bottom: 6px;
        }
        .page-spec-title {
          font-family: var(--mono);
          font-size: 7px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-3);
          display: block;
          margin-bottom: 2px;
        }
        .page-spec-text {
          margin: 0;
          font-size: 8px;
          color: var(--text-2);
          line-height: 1.35;
        }
        .page-formula-box {
          background: rgba(8, 10, 14, 0.8);
          border: 1px solid var(--border);
          border-radius: 4px;
          padding: 4px 6px;
          font-family: var(--mono);
          font-size: 7.5px;
        }
        .formula-tag {
          font-size: 6px;
          letter-spacing: 0.08em;
          color: var(--text-3);
          display: block;
          margin-bottom: 1px;
        }
        .page-bottom-nav {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 6px;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          font-family: var(--mono);
          font-size: 7px;
          color: var(--text-3);
        }
        .page-hint-text {
          color: var(--accent);
          opacity: 0.85;
        }

        /* ── Flipped State (0.8s smooth cubic-bezier physics) ── */
        .book-page.flipped,
        .book-cover.flipped {
          transform: rotateY(-150deg);
        }
      `}</style>
    </section>
  );
}
