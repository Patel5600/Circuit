import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Reveal } from "../ui/Reveal";
import { Icon } from "../ui";

/* -------------------------------------------------------------------------- */
/*  Dimensions Data (7 Chapters) — Unified, Refined Palette                   */
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
  },
];

/* -------------------------------------------------------------------------- */
/*  Main Component                                                            */
/* -------------------------------------------------------------------------- */

export function FaultLineMatrix() {
  const [isExpanded, setIsExpanded] = useState(false);
  // pageIndex: 0 = closed cover, 1 = Chapter 1 open, 2 = Chapter 2 open, ..., 7 = Chapter 7
  const [pageIndex, setPageIndex] = useState(0);

  // Close and reset book
  const resetBook = useCallback(() => {
    setIsExpanded(false);
    setTimeout(() => {
      setPageIndex(0);
    }, 350);
  }, []);

  // Open book and expand
  const expandBook = (targetPage = 1) => {
    setIsExpanded(true);
    setTimeout(() => {
      setPageIndex(targetPage);
    }, 200);
  };

  // Flip forward (next page)
  const flipNext = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (pageIndex < DIMENSIONS.length) {
      setPageIndex((p) => p + 1);
    } else {
      resetBook();
    }
  };

  // Flip backward (previous page)
  const flipPrev = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (pageIndex > 1) {
      setPageIndex((p) => p - 1);
    } else if (pageIndex === 1) {
      setPageIndex(0);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isExpanded) return;
      if (e.key === "Escape") {
        resetBook();
      } else if (e.key === "ArrowRight") {
        if (pageIndex < DIMENSIONS.length) setPageIndex((p) => p + 1);
        else resetBook();
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
      <div className="sec__inner" style={{ textAlign: "center" }}>
        <Reveal>
          <p className="sec__index" style={{ justifyContent: "center" }}>
            <span className="sec__index__n">07</span>
            <span className="sec__index__t">Architectural Dimensions</span>
          </p>
          <div style={{ marginBottom: 44 }}>
            <h2 className="sec__title">
              The Seven Dimensions of
              <br />
              <em>Equity Collateral.</em>
            </h2>
            <p className="t-base muted" style={{ maxWidth: 640, margin: "14px auto 0", fontSize: 16, lineHeight: 1.55 }}>
              Tokenized equities require fundamentally different primitives than crypto-native assets.
              Click the handbook below to open the specification and flip through the chapters.
            </p>
          </div>
        </Reveal>

        {/* ── Center Book Display in Section 07 (No Left Specification Sheet) ── */}
        <Reveal delay={80}>
          <div className="center-book-container">
            <div
              className="book-mockup in-situ-center"
              role="button"
              tabIndex={0}
              aria-label="Click to open the Architectural Codex book"
              onClick={() => expandBook(1)}
              onKeyDown={(e) => e.key === "Enter" && expandBook(1)}
            >
              {/* Book Cover */}
              <div className="book-cover in-situ-cover">
                <div className="cover-spine-crease" />
                <div className="cover-inner-border">
                  <div className="cover-top-folio">
                    <span>CIRCUIT PROTOCOL</span>
                    <span>SOLANA DEVNET</span>
                  </div>

                  <div className="cover-center-badge">
                    <div className="cover-emblem-circle">
                      <Icon name="shield" size={30} />
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

              {/* Edge Stack Depth */}
              <div className="book-page page-depth-3" />
              <div className="book-page page-depth-2" />
              <div className="book-page page-depth-1" />
            </div>

            <div style={{ marginTop: 22 }}>
              <p style={{ margin: 0, fontSize: 12, fontFamily: "var(--mono)", color: "var(--text-3)", letterSpacing: "0.06em" }}>
                CLICK TO OPEN CODEX · 7 SPECIFICATION CHAPTERS
              </p>
            </div>
          </div>
        </Reveal>
      </div>

      {/* ── React Portal: Pure Centered Book Overlay without Header Collision or Clutter ── */}
      {isExpanded &&
        createPortal(
          <div
            className="book-portal-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Circuit Architectural Codex Reader"
            onClick={resetBook}
          >
            {/* Minimal, Quiet Close Button (Safely Positioned) */}
            <button
              type="button"
              aria-label="Close book"
              className="book-minimal-close-btn"
              onClick={resetBook}
            >
              ✕ Esc
            </button>

            {/* Enlarged Centered 3D Book */}
            <div
              className="book-expanded-stage"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="book-mockup enlarged-book"
                onClick={flipNext}
                role="button"
                tabIndex={0}
                aria-label="Click book to turn page"
              >
                {/* ── Book Front Cover ── */}
                <div className={`book-cover ${pageIndex > 0 ? "flipped" : ""}`}>
                  <div className="cover-spine-crease" />
                  <div className="cover-inner-border">
                    <div className="cover-top-folio">
                      <span>CIRCUIT PROTOCOL</span>
                      <span>SOLANA DEVNET</span>
                    </div>

                    <div className="cover-center-badge">
                      <div className="cover-emblem-circle" style={{ width: 64, height: 64 }}>
                        <Icon name="shield" size={36} />
                      </div>
                      <h4 className="cover-title-text" style={{ fontSize: 20 }}>
                        ARCHITECTURAL
                        <br />
                        <span>CODEX</span>
                      </h4>
                      <p className="cover-edition-text" style={{ fontSize: 10 }}>VII CHAPTERS · ON-CHAIN SPECIFICATION</p>
                    </div>

                    <div className="cover-bottom-hint">
                      <span>CLICK TO TURN PAGE ▸</span>
                    </div>
                  </div>
                </div>

                {/* ── 7 Chapter Pages Stacked Underneath (Monochrome / Reduced Colorfulness) ── */}
                {DIMENSIONS.map((dim, idx) => {
                  const pageNum = idx + 1;
                  const isFlipped = pageIndex > pageNum;
                  const zIndex = 9 - idx;

                  return (
                    <div
                      key={dim.id}
                      className={`book-page page-${pageNum} ${isFlipped ? "flipped" : ""}`}
                      style={{ zIndex }}
                    >
                      <div className="page-spine-shadow" />

                      {/* Clean Folio Header */}
                      <div className="page-header-row">
                        <span className="page-folio-label">CIRCUIT SPECIFICATION</span>
                        <span className="page-folio-chapter">CHAPTER {dim.roman}</span>
                        <span className="page-number">{pageNum} / 7</span>
                      </div>

                      {/* Content Flow */}
                      <div className="page-content-flow">
                        <div>
                          <div className="page-chapter-tag">
                            DIMENSION {dim.roman} · {dim.badge}
                          </div>

                          <h4 className="page-chapter-title">{dim.title}</h4>
                          <div className="page-chapter-subtitle">{dim.subtitle}</div>

                          <div className="page-tagline-quote">
                            “{dim.tagline}”
                          </div>
                        </div>

                        {/* Specification Blocks */}
                        <div className="page-spec-section">
                          <span className="page-spec-title">The Problem Thesis</span>
                          <p className="page-spec-text">{dim.thesis}</p>
                        </div>

                        <div className="page-spec-section">
                          <span className="page-spec-title">On-Chain Circuit Primitive</span>
                          <p className="page-spec-text">{dim.mechanism}</p>
                        </div>

                        {/* Mathematical Formula Constraint */}
                        <div className="page-formula-box">
                          <span className="formula-tag">ON-CHAIN CONSTRAINT SPECIFICATION</span>
                          <code>{dim.formula}</code>
                        </div>

                        <div className="page-spec-section" style={{ marginBottom: 0 }}>
                          <span className="page-spec-title">Why This Changes Everything</span>
                          <p className="page-spec-text">{dim.whyItMatters}</p>
                        </div>
                      </div>

                      {/* Bottom Page Footer Nav */}
                      <div className="page-bottom-nav">
                        <div className="row g-8" style={{ alignItems: "center" }}>
                          {pageNum > 1 && (
                            <button
                              type="button"
                              className="page-turn-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                flipPrev();
                              }}
                            >
                              ◂ Prev
                            </button>
                          )}
                          <span className="page-hint-text">
                            {pageNum < 7 ? "Click page to flip next ▸" : "Click page to finish ✓"}
                          </span>
                        </div>
                        <span className="page-footer-num">PAGE {pageNum}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Minimal Under-Book Chapter Navigation Dots */}
            <div className="book-bottom-dots-bar" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="book-bottom-nav-arrow"
                disabled={pageIndex <= 1}
                onClick={flipPrev}
                style={{ opacity: pageIndex <= 1 ? 0.3 : 1 }}
              >
                ◂
              </button>

              <div className="row g-6" style={{ alignItems: "center" }}>
                {DIMENSIONS.map((d, i) => (
                  <button
                    key={d.id}
                    type="button"
                    title={`Chapter ${d.roman}: ${d.title}`}
                    className={`book-bottom-dot ${pageIndex === i + 1 ? "active" : ""}`}
                    onClick={() => setPageIndex(i + 1)}
                  >
                    {d.roman}
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="book-bottom-nav-arrow"
                disabled={pageIndex >= 7}
                onClick={flipNext}
                style={{ opacity: pageIndex >= 7 ? 0.3 : 1 }}
              >
                ▸
              </button>
            </div>
          </div>,
          document.body
        )}

      {/* ── Clean, Monochrome, High-Scale Styles ── */}
      <style>{`
        /* Center Book Stage on Page */
        .center-book-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 24px 0 36px;
        }

        /* ── Base In-Situ Book (Centered in Section 07) ── */
        .book-mockup.in-situ-center {
          width: 250px;
          height: 360px;
          position: relative;
          background-color: transparent;
          perspective: 1500px;
          transform-style: preserve-3d;
          transition: transform 0.4s cubic-bezier(0.25, 1, 0.5, 1), box-shadow 0.4s ease;
          cursor: pointer;
        }
        .book-mockup.in-situ-center:hover {
          transform: rotateY(-10deg) scale(1.03) translateY(-8px);
        }
        .book-mockup.in-situ-center::before {
          content: '';
          position: absolute;
          bottom: -12px;
          left: 6%;
          width: 88%;
          height: 26px;
          background: rgba(0, 0, 0, 0.55);
          filter: blur(14px);
          transform: translateZ(-10px);
        }

        /* ── Portal Overlay (Mounted Directly to document.body) ── */
        .book-portal-overlay {
          position: fixed;
          inset: 0;
          z-index: 99999;
          background: rgba(6, 8, 12, 0.9);
          backdrop-filter: blur(14px);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 30px 16px 20px;
          overflow: hidden;
          animation: portalFadeIn 0.25s ease-out;
        }
        @keyframes portalFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        /* Minimal Close Button at Top-Right of Viewport */
        .book-minimal-close-btn {
          position: fixed;
          top: 24px;
          right: 28px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 8px;
          color: var(--text-2);
          font-family: var(--mono);
          font-size: 12px;
          padding: 6px 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          z-index: 100000;
        }
        .book-minimal-close-btn:hover {
          background: rgba(255, 255, 255, 0.12);
          color: var(--text);
          border-color: var(--accent);
        }

        /* ── Centered Enlarged Book Stage in Modal ── */
        .book-expanded-stage {
          display: flex;
          justify-content: center;
          align-items: center;
          perspective: 2000px;
          margin: auto 0;
          animation: bookStageBump 0.35s cubic-bezier(0.25, 1, 0.5, 1);
        }
        @keyframes bookStageBump {
          0% {
            opacity: 0;
            transform: scale(0.85) translateY(24px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        /* Enlarged Book Dimensions (Larger for crystal-clear reading) */
        .book-mockup.enlarged-book {
          width: 440px;
          height: 620px;
          position: relative;
          background-color: transparent;
          perspective: 2000px;
          transform-style: preserve-3d;
          cursor: pointer;
        }
        @media (max-width: 600px) {
          .book-mockup.enlarged-book {
            width: 320px;
            height: 490px;
          }
        }
        @media (min-width: 1400px) {
          .book-mockup.enlarged-book {
            width: 480px;
            height: 670px;
          }
        }

        /* Common Sizing for Cover and Pages */
        .book-cover,
        .book-page {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          border-radius: 4px 12px 12px 4px;
          transform-origin: left center;
          transition: transform 0.8s cubic-bezier(0.64, 0, 0.32, 1);
          backface-visibility: hidden;
          box-shadow: inset 6px 0 18px rgba(0, 0, 0, 0.5);
          user-select: none;
        }

        /* ── The Book Cover (Monochrome & Gilded Leather) ── */
        .book-cover {
          background: linear-gradient(135deg, #151821 0%, #0c0e14 100%);
          border: 1.5px solid rgba(207, 173, 116, 0.4);
          z-index: 10;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow:
            -8px 0 0 #07090d,
            -14px 0 24px rgba(0,0,0,0.8),
            18px 24px 44px rgba(0,0,0,0.7),
            inset 0 0 32px rgba(0,0,0,0.85);
        }
        .cover-spine-crease {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 18px;
          background: linear-gradient(90deg, rgba(0,0,0,0.7) 0%, rgba(255,255,255,0.08) 50%, rgba(0,0,0,0.4) 100%);
          border-right: 1px solid rgba(207, 173, 116, 0.25);
        }
        .cover-inner-border {
          flex: 1;
          margin: 16px 16px 16px 24px;
          border: 1px solid rgba(207, 173, 116, 0.25);
          padding: 24px 18px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          text-align: center;
        }
        .cover-top-folio {
          display: flex;
          justify-content: space-between;
          font-family: var(--mono);
          font-size: 8.5px;
          letter-spacing: 0.18em;
          color: var(--accent);
          opacity: 0.85;
          text-transform: uppercase;
        }
        .cover-emblem-circle {
          width: 56px;
          height: 56px;
          margin: 0 auto 14px;
          border-radius: 50%;
          border: 1.5px solid var(--accent);
          background: rgba(207, 173, 116, 0.1);
          color: var(--accent);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 24px rgba(207, 173, 116, 0.2);
        }
        .cover-title-text {
          margin: 0;
          font-size: 16px;
          font-weight: 750;
          letter-spacing: 0.08em;
          color: var(--text);
          text-transform: uppercase;
          line-height: 1.25;
        }
        .cover-title-text span {
          color: var(--accent);
        }
        .cover-edition-text {
          margin: 8px 0 0;
          font-family: var(--mono);
          font-size: 8.5px;
          color: var(--text-3);
          letter-spacing: 0.08em;
        }
        .cover-bottom-hint {
          font-family: var(--mono);
          font-size: 8.5px;
          color: var(--accent);
          letter-spacing: 0.1em;
          opacity: 0.9;
        }

        /* ── Individual Book Pages (Monochrome & Subdued Palette) ── */
        .book-page {
          background: #10131b;
          border: 1px solid rgba(255, 255, 255, 0.08);
          padding: 28px 28px 22px 34px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          color: var(--text);
          overflow: hidden;
          box-shadow:
            0 20px 48px rgba(0, 0, 0, 0.7),
            inset 8px 0 20px rgba(0, 0, 0, 0.45);
        }
        .page-spine-shadow {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 20px;
          background: linear-gradient(90deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 100%);
          pointer-events: none;
        }
        .page-header-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 10px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          font-family: var(--mono);
          font-size: 9.5px;
          color: var(--text-3);
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .page-number {
          font-weight: 700;
          color: var(--accent);
          font-size: 10.5px;
        }
        .page-content-flow {
          flex: 1;
          padding: 14px 0;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .page-chapter-tag {
          font-family: var(--mono);
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.08em;
          color: var(--accent);
          margin-bottom: 6px;
        }
        .page-chapter-title {
          margin: 0;
          font-size: 18px;
          font-weight: 750;
          color: var(--text);
          line-height: 1.25;
        }
        .page-chapter-subtitle {
          font-size: 11.5px;
          color: var(--text-2);
          font-family: var(--mono);
          margin-top: 3px;
          margin-bottom: 12px;
        }
        .page-tagline-quote {
          font-size: 12px;
          line-height: 1.5;
          color: var(--text-2);
          font-style: italic;
          background: rgba(255, 255, 255, 0.025);
          border-left: 2.5px solid var(--accent);
          padding: 8px 12px;
          margin-bottom: 12px;
          border-radius: 0 6px 6px 0;
        }
        .page-spec-section {
          margin-bottom: 10px;
        }
        .page-spec-title {
          font-family: var(--mono);
          font-size: 9.5px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-3);
          display: block;
          margin-bottom: 3px;
        }
        .page-spec-text {
          margin: 0;
          font-size: 11.5px;
          color: var(--text-2);
          line-height: 1.5;
        }
        .page-formula-box {
          background: rgba(6, 8, 12, 0.85);
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 8px 12px;
          font-family: var(--mono);
          font-size: 11px;
          margin-bottom: 10px;
        }
        .page-formula-box code {
          color: var(--accent);
          font-weight: 600;
        }
        .formula-tag {
          font-size: 8px;
          letter-spacing: 0.08em;
          color: var(--text-3);
          display: block;
          margin-bottom: 3px;
        }
        .page-bottom-nav {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 10px;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          font-family: var(--mono);
          font-size: 9.5px;
          color: var(--text-3);
        }
        .page-hint-text {
          color: var(--accent);
          opacity: 0.9;
        }
        .page-turn-btn {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid var(--border);
          border-radius: 4px;
          color: var(--text-2);
          font-size: 9px;
          font-family: var(--mono);
          padding: 2px 6px;
          cursor: pointer;
        }
        .page-turn-btn:hover {
          color: var(--text);
          border-color: var(--accent);
        }

        /* ── Flipped State (0.8s smooth cubic-bezier physics) ── */
        .book-page.flipped,
        .book-cover.flipped {
          transform: rotateY(-150deg);
        }

        /* In-situ depth decoration pages */
        .page-depth-1 {
          z-index: 3;
          background: #0f131a;
          transform: rotateY(-2deg) translateZ(-4px);
        }
        .page-depth-2 {
          z-index: 2;
          background: #0d1016;
          transform: rotateY(-4deg) translateZ(-8px);
        }
        .page-depth-3 {
          z-index: 1;
          background: #0a0d12;
          transform: rotateY(-6deg) translateZ(-12px);
        }

        /* Bottom Minimal Dots Bar */
        .book-bottom-dots-bar {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 16px;
          padding: 6px 14px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border);
          border-radius: 20px;
        }
        .book-bottom-nav-arrow {
          background: transparent;
          border: none;
          color: var(--text-2);
          font-size: 14px;
          cursor: pointer;
          padding: 0 4px;
        }
        .book-bottom-nav-arrow:hover:not(:disabled) {
          color: var(--accent);
        }
        .book-bottom-dot {
          background: transparent;
          border: none;
          color: var(--text-3);
          font-family: var(--mono);
          font-size: 11px;
          cursor: pointer;
          padding: 2px 6px;
          border-radius: 4px;
          transition: all 0.2s ease;
        }
        .book-bottom-dot:hover {
          color: var(--text);
        }
        .book-bottom-dot.active {
          color: var(--accent);
          background: rgba(207, 173, 116, 0.15);
          font-weight: 700;
        }
      `}</style>
    </section>
  );
}
