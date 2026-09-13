import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Reveal } from "../ui/Reveal";
import { Icon } from "../ui";

/* -------------------------------------------------------------------------- */
/*  Dimensions Data (7 Chapters) — Unified, Monochrome & Gold Palette         */
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
  const [isOpen, setIsOpen] = useState(false);
  const [activeChapterIndex, setActiveChapterIndex] = useState(0);

  const chapter = DIMENSIONS[activeChapterIndex];

  const nextChapter = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (activeChapterIndex < DIMENSIONS.length - 1) {
      setActiveChapterIndex((idx) => idx + 1);
    } else {
      setIsOpen(false);
    }
  };

  const prevChapter = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (activeChapterIndex > 0) {
      setActiveChapterIndex((idx) => idx - 1);
    }
  };

  // Keyboard navigation when book is open
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") {
        setIsOpen(false);
      } else if (e.key === "ArrowRight") {
        if (activeChapterIndex < DIMENSIONS.length - 1) {
          setActiveChapterIndex((idx) => idx + 1);
        } else {
          setIsOpen(false);
        }
      } else if (e.key === "ArrowLeft") {
        if (activeChapterIndex > 0) {
          setActiveChapterIndex((idx) => idx - 1);
        }
      }
    },
    [isOpen, activeChapterIndex]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Lock body scroll when book is open
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
              Click the handbook below to open the specification and explore each chapter.
            </p>
          </div>
        </Reveal>

        {/* ── Center Book Display in Section 07 (Clean, Fully Rendered Closed Book) ── */}
        <Reveal delay={80}>
          <div className="center-book-container">
            <div
              className="book-mockup-closed"
              role="button"
              tabIndex={0}
              aria-label="Click to open the Architectural Codex book"
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
            >
              {/* Full Hardcover Front Cover (No overlapping cuts or half shapes) */}
              <div className="closed-cover-face">
                <div className="closed-spine-ridge" />
                <div className="closed-inner-frame">
                  <div className="closed-top-folio">
                    <span>CIRCUIT PROTOCOL</span>
                    <span>SOLANA DEVNET</span>
                  </div>

                  <div className="closed-center-insignia">
                    <div className="closed-emblem-circle">
                      <Icon name="shield" size={32} />
                    </div>
                    <h4 className="closed-title">
                      ARCHITECTURAL
                      <br />
                      <span>CODEX</span>
                    </h4>
                    <p className="closed-edition">VII CHAPTERS · ON-CHAIN</p>
                  </div>

                  <div className="closed-bottom-callout">
                    <span>CLICK TO OPEN ↗</span>
                  </div>
                </div>

                {/* Silk Ribbon Marker Hanging at the Bottom */}
                <div className="closed-silk-ribbon" />
              </div>

              {/* Realistic Paper Page Thickness on Right & Bottom Edge */}
              <div className="closed-paper-edge-right" />
              <div className="closed-paper-edge-bottom" />
            </div>

            <div style={{ marginTop: 22 }}>
              <p style={{ margin: 0, fontSize: 12, fontFamily: "var(--mono)", color: "var(--text-3)", letterSpacing: "0.06em" }}>
                CLICK TO OPEN CODEX · 7 SPECIFICATION CHAPTERS
              </p>
            </div>
          </div>
        </Reveal>
      </div>

      {/* ── React Portal: Real Two-Page Book Mode View with Center Curve & Light Shadow Curves ── */}
      {isOpen &&
        createPortal(
          <div
            className="book-modal-portal"
            role="dialog"
            aria-modal="true"
            aria-label="Circuit Architectural Codex Two-Page Spread"
            onClick={() => setIsOpen(false)}
          >
            {/* Minimal, Quiet Close Button in Viewport Top-Right (No Header Touch) */}
            <button
              type="button"
              aria-label="Close book"
              className="book-quiet-close-btn"
              onClick={() => setIsOpen(false)}
            >
              ✕ Esc
            </button>

            {/* ── The Real Two-Page Hardcover Book Spread ── */}
            <div
              className="real-two-page-spread"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Hanging Center Silk Ribbon */}
              <div className="spread-center-silk-ribbon" />

              {/* ── LEFT PAGE (Verso) with Center Curve & Light Shadow ── */}
              <div className="spread-page spread-page-left">
                {/* Running Head */}
                <div className="spread-running-head">
                  <span>CIRCUIT ARCHITECTURAL CODEX</span>
                  <span>CHAPTER {chapter.roman}</span>
                </div>

                {/* Background Roman Watermark */}
                <div className="spread-chapter-watermark">{chapter.roman}</div>

                {/* Left Page Body Content */}
                <div className="spread-page-content">
                  <div style={{ marginBottom: 8 }}>
                    <span className="spread-chapter-badge">
                      DIMENSION {chapter.roman} · {chapter.badge}
                    </span>
                  </div>

                  <h3 className="spread-chapter-title">{chapter.title}</h3>
                  <div className="spread-chapter-sub">{chapter.subtitle}</div>

                  {/* Illuminated Tagline Quote */}
                  <div className="spread-tagline-box">
                    “{chapter.tagline}”
                  </div>

                  {/* Mathematical Formula Card */}
                  <div className="spread-formula-card">
                    <span className="spread-formula-label">On-Chain Mathematical Constraint</span>
                    <code>{chapter.formula}</code>
                  </div>
                </div>

                {/* Left Page Footer Nav */}
                <div className="spread-page-footer left-footer">
                  <button
                    type="button"
                    className="spread-turn-btn"
                    disabled={activeChapterIndex === 0}
                    onClick={prevChapter}
                    style={{ opacity: activeChapterIndex === 0 ? 0.35 : 1 }}
                  >
                    ◂ Turn Page (Prev)
                  </button>
                  <span className="spread-page-num">PAGE {activeChapterIndex * 2 + 1}</span>
                </div>
              </div>

              {/* ── CENTER SPINE CREASE GUTTER (Real Curve Depth & Shadow) ── */}
              <div className="spread-spine-crease-gutter">
                <div className="spine-light-shadow-left" />
                <div className="spine-center-stitch-line" />
                <div className="spine-light-shadow-right" />
              </div>

              {/* ── RIGHT PAGE (Recto) with Center Curve & Light Shadow ── */}
              <div className="spread-page spread-page-right">
                {/* Running Head */}
                <div className="spread-running-head">
                  <span>ON-CHAIN SPECIFICATION</span>
                  <span>SOLANA DEVNET</span>
                </div>

                {/* Right Page Body Content */}
                <div className="spread-page-content">
                  {/* Specification 1: The Problem Thesis */}
                  <div className="spread-spec-block">
                    <div className="spread-spec-head">
                      <span className="spread-spec-bullet" />
                      I. The Problem Thesis
                    </div>
                    <p className="spread-spec-text">{chapter.thesis}</p>
                  </div>

                  {/* Specification 2: On-Chain Circuit Mechanism */}
                  <div className="spread-spec-block">
                    <div className="spread-spec-head">
                      <span className="spread-spec-bullet" />
                      II. On-Chain Circuit Mechanism
                    </div>
                    <p className="spread-spec-text">{chapter.mechanism}</p>
                  </div>

                  {/* Specification 3: Solvency & Economic Invariant */}
                  <div className="spread-spec-block" style={{ marginBottom: 0 }}>
                    <div className="spread-spec-head">
                      <span className="spread-spec-bullet" />
                      III. Solvency & Economic Invariant
                    </div>
                    <p className="spread-spec-text">{chapter.whyItMatters}</p>
                  </div>
                </div>

                {/* Right Page Footer Nav */}
                <div className="spread-page-footer right-footer">
                  <span className="spread-page-num">PAGE {activeChapterIndex * 2 + 2}</span>
                  {activeChapterIndex < DIMENSIONS.length - 1 ? (
                    <button
                      type="button"
                      className="spread-turn-btn active-turn-btn"
                      onClick={nextChapter}
                    >
                      Turn Page (Chapter {DIMENSIONS[activeChapterIndex + 1].roman}) ▸
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="spread-turn-btn active-turn-btn"
                      onClick={() => setIsOpen(false)}
                    >
                      Finish Reading ✓
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* ── Under-Book Chapter Navigation Dots ── */}
            <div className="spread-bottom-dots-bar" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="spread-dots-arrow"
                disabled={activeChapterIndex === 0}
                onClick={prevChapter}
                style={{ opacity: activeChapterIndex === 0 ? 0.3 : 1 }}
              >
                ◂
              </button>

              <div className="row g-6" style={{ alignItems: "center" }}>
                {DIMENSIONS.map((d, i) => (
                  <button
                    key={d.id}
                    type="button"
                    title={`Chapter ${d.roman}: ${d.title}`}
                    className={`spread-dot-pill ${activeChapterIndex === i ? "active" : ""}`}
                    onClick={() => setActiveChapterIndex(i)}
                  >
                    {d.roman}
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="spread-dots-arrow"
                disabled={activeChapterIndex === DIMENSIONS.length - 1}
                onClick={nextChapter}
                style={{ opacity: activeChapterIndex === DIMENSIONS.length - 1 ? 0.3 : 1 }}
              >
                ▸
              </button>
            </div>
          </div>,
          document.body
        )}

      {/* ── Precision CSS for Closed Book & Real Two-Page Mode Spread with Center Curve ── */}
      <style>{`
        /* Center Book Container on Main Page */
        .center-book-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 24px 0 36px;
        }

        /* ── The Clean, Pristine Closed Hardcover Book ── */
        .book-mockup-closed {
          width: 250px;
          height: 360px;
          position: relative;
          cursor: pointer;
          perspective: 1200px;
          transition: transform 0.4s cubic-bezier(0.25, 1, 0.5, 1), box-shadow 0.4s ease;
        }
        .book-mockup-closed:hover {
          transform: translateY(-8px) rotateY(-10deg) scale(1.03);
        }
        .book-mockup-closed::before {
          content: '';
          position: absolute;
          bottom: -12px;
          left: 6%;
          width: 88%;
          height: 24px;
          background: rgba(0, 0, 0, 0.6);
          filter: blur(14px);
        }

        /* Closed Cover Face */
        .closed-cover-face {
          width: 100%;
          height: 100%;
          background: linear-gradient(135deg, #151821 0%, #0c0e14 100%);
          border: 1.5px solid rgba(207, 173, 116, 0.45);
          border-radius: 4px 12px 12px 4px;
          box-shadow:
            -8px 0 0 #07090d,
            -14px 0 24px rgba(0,0,0,0.8),
            18px 24px 44px rgba(0,0,0,0.7),
            inset 0 0 30px rgba(0,0,0,0.8);
          padding: 24px 18px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          position: relative;
          overflow: hidden;
          z-index: 5;
        }

        .closed-spine-ridge {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 16px;
          background: linear-gradient(90deg, rgba(0,0,0,0.75) 0%, rgba(255,255,255,0.08) 50%, rgba(0,0,0,0.45) 100%);
          border-right: 1px solid rgba(207, 173, 116, 0.25);
        }

        .closed-inner-frame {
          flex: 1;
          margin-left: 12px;
          border: 1px solid rgba(207, 173, 116, 0.25);
          padding: 20px 14px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          text-align: center;
        }

        .closed-top-folio {
          display: flex;
          justify-content: space-between;
          font-family: var(--mono);
          font-size: 8.5px;
          letter-spacing: 0.18em;
          color: var(--accent);
          opacity: 0.9;
          text-transform: uppercase;
        }

        .closed-emblem-circle {
          width: 54px;
          height: 54px;
          margin: 0 auto 12px;
          border-radius: 50%;
          border: 1.5px solid var(--accent);
          background: rgba(207, 173, 116, 0.1);
          color: var(--accent);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 20px rgba(207, 173, 116, 0.2);
        }

        .closed-title {
          margin: 0;
          font-size: 16px;
          font-weight: 750;
          letter-spacing: 0.08em;
          color: var(--text);
          text-transform: uppercase;
          line-height: 1.25;
        }
        .closed-title span {
          color: var(--accent);
        }

        .closed-edition {
          margin: 8px 0 0;
          font-family: var(--mono);
          font-size: 8.5px;
          color: var(--text-3);
          letter-spacing: 0.08em;
        }

        .closed-bottom-callout {
          font-family: var(--mono);
          font-size: 8.5px;
          color: var(--accent);
          letter-spacing: 0.1em;
          opacity: 0.9;
        }

        /* Ribbon Hanging on Closed Book */
        .closed-silk-ribbon {
          position: absolute;
          bottom: -12px;
          right: 32px;
          width: 14px;
          height: 26px;
          background: var(--accent);
          clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 75%, 0 100%);
          box-shadow: 0 3px 8px rgba(0,0,0,0.6);
        }

        /* Paper Stack Edges for Closed Book */
        .closed-paper-edge-right {
          position: absolute;
          right: -8px;
          top: 6px;
          bottom: 6px;
          width: 8px;
          background: repeating-linear-gradient(180deg, #ded9c7 0px, #ded9c7 1px, #b2ab96 1px, #b2ab96 2px);
          border-radius: 0 3px 3px 0;
          box-shadow: 3px 0 6px rgba(0,0,0,0.5);
          z-index: 2;
        }
        .closed-paper-edge-bottom {
          position: absolute;
          bottom: -7px;
          left: 10px;
          right: -4px;
          height: 7px;
          background: repeating-linear-gradient(90deg, #ded9c7 0px, #ded9c7 1px, #b2ab96 1px, #b2ab96 2px);
          border-radius: 0 0 3px 3px;
          box-shadow: 0 3px 6px rgba(0,0,0,0.5);
          z-index: 2;
        }

        /* ── Portal Modal Overlay ── */
        .book-modal-portal {
          position: fixed;
          inset: 0;
          z-index: 99999;
          background: rgba(6, 8, 12, 0.92);
          backdrop-filter: blur(16px);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 24px 16px;
          animation: portalFade 0.25s ease-out;
        }
        @keyframes portalFade {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        /* Minimal Close Button in Top-Right Corner */
        .book-quiet-close-btn {
          position: fixed;
          top: 24px;
          right: 28px;
          background: rgba(255, 255, 255, 0.06);
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
        .book-quiet-close-btn:hover {
          background: rgba(255, 255, 255, 0.15);
          color: var(--text);
          border-color: var(--accent);
        }

        /* ── REAL TWO-PAGE HARDCOVER SPREAD WITH CENTER CURVE ── */
        .real-two-page-spread {
          width: 920px;
          max-width: 95vw;
          min-height: 560px;
          max-height: 84vh;
          display: flex;
          position: relative;
          background: #090c12;
          border: 2px solid rgba(207, 173, 116, 0.4);
          border-radius: 12px;
          box-shadow:
            0 36px 90px rgba(0, 0, 0, 0.9),
            0 0 40px rgba(207, 173, 116, 0.15),
            inset 0 0 40px rgba(0, 0, 0, 0.85);
          overflow: hidden;
          perspective: 2000px;
          animation: spreadOpenBump 0.35s cubic-bezier(0.25, 1, 0.5, 1);
        }
        @keyframes spreadOpenBump {
          0% {
            opacity: 0;
            transform: scale(0.88) translateY(28px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        /* Silk Ribbon Hanging Down the Center Fold */
        .spread-center-silk-ribbon {
          position: absolute;
          top: 0;
          left: 50%;
          transform: translateX(-50%);
          width: 14px;
          height: 98%;
          background: linear-gradient(180deg, var(--accent) 0%, rgba(207, 173, 116, 0.8) 85%, transparent 100%);
          z-index: 20;
          pointer-events: none;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.7);
          border-radius: 0 0 4px 4px;
        }

        /* ── Common Page Styling ── */
        .spread-page {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          position: relative;
          overflow-y: auto;
          color: var(--text);
        }

        /* ── Left Page (Verso): Center Curve & Shadow Gradients ── */
        .spread-page-left {
          padding: 32px 36px 22px 38px;
          /* Subtle 3D paper curvature gradient on right edge toward gutter */
          background: linear-gradient(90deg, #131720 0%, #11151e 84%, #0b0e14 100%);
          box-shadow: inset -26px 0 34px -10px rgba(0, 0, 0, 0.8);
          border-right: 1px solid rgba(0, 0, 0, 0.6);
        }

        /* ── Right Page (Recto): Center Curve & Shadow Gradients ── */
        .spread-page-right {
          padding: 32px 38px 22px 36px;
          /* Subtle 3D paper curvature gradient on left edge toward gutter */
          background: linear-gradient(270deg, #131720 0%, #11151e 84%, #0b0e14 100%);
          box-shadow: inset 26px 0 34px -10px rgba(0, 0, 0, 0.8);
          border-left: 1px solid rgba(255, 255, 255, 0.04);
        }

        /* ── CENTER SPINE CREASE GUTTER (Real Curve Depth & Shadow) ── */
        .spread-spine-crease-gutter {
          width: 8px;
          position: relative;
          background: #080a0e;
          z-index: 10;
          display: flex;
        }
        .spine-light-shadow-left {
          flex: 1;
          background: linear-gradient(90deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 100%);
        }
        .spine-center-stitch-line {
          width: 1px;
          background: rgba(207, 173, 116, 0.2);
        }
        .spine-light-shadow-right {
          flex: 1;
          background: linear-gradient(270deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 100%);
        }

        /* Running Head on Pages */
        .spread-running-head {
          display: flex;
          justify-content: space-between;
          padding-bottom: 10px;
          margin-bottom: 14px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          font-family: var(--mono);
          font-size: 9.5px;
          color: var(--text-3);
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        /* Watermark Roman Numeral */
        .spread-chapter-watermark {
          position: absolute;
          top: 36px;
          right: 32px;
          font-size: 88px;
          font-weight: 800;
          font-family: serif;
          color: rgba(255, 255, 255, 0.025);
          line-height: 1;
          pointer-events: none;
          user-select: none;
        }

        .spread-page-content {
          flex: 1;
          position: relative;
          z-index: 2;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }

        .spread-chapter-badge {
          font-family: var(--mono);
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.08em;
          color: var(--accent);
          background: rgba(207, 173, 116, 0.1);
          border: 1px solid rgba(207, 173, 116, 0.25);
          padding: 2px 8px;
          border-radius: 4px;
          display: inline-block;
        }

        .spread-chapter-title {
          margin: 0;
          font-size: clamp(1.35rem, 2.4vw, 1.75rem);
          font-weight: 750;
          color: var(--text);
          line-height: 1.25;
        }

        .spread-chapter-sub {
          font-size: 12px;
          font-family: var(--mono);
          color: var(--text-2);
          margin-top: 3px;
          margin-bottom: 14px;
        }

        .spread-tagline-box {
          font-size: 13px;
          line-height: 1.55;
          color: var(--text-2);
          font-style: italic;
          background: rgba(255, 255, 255, 0.025);
          border-left: 3px solid var(--accent);
          padding: 10px 14px;
          margin-bottom: 16px;
          border-radius: 0 6px 6px 0;
        }

        .spread-formula-card {
          background: rgba(6, 8, 12, 0.85);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 10px 14px;
          font-family: var(--mono);
          font-size: 11px;
        }
        .spread-formula-label {
          font-size: 8.5px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-3);
          display: block;
          margin-bottom: 4px;
        }
        .spread-formula-card code {
          color: var(--accent);
          font-weight: 600;
        }

        /* Right Page Specification Blocks */
        .spread-spec-block {
          margin-bottom: 14px;
        }
        .spread-spec-head {
          font-family: var(--mono);
          font-size: 10.5px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text);
          font-weight: 700;
          margin-bottom: 4px;
          display: flex;
          align-items: center;
          gap: 7px;
        }
        .spread-spec-bullet {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--accent);
        }
        .spread-spec-text {
          margin: 0;
          font-size: 12px;
          color: var(--text-2);
          line-height: 1.55;
        }

        /* Page Footer Nav */
        .spread-page-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 12px;
          margin-top: 12px;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
        }
        .spread-page-num {
          font-family: var(--mono);
          font-size: 10.5px;
          color: var(--text-3);
        }

        .spread-turn-btn {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid var(--border);
          border-radius: 6px;
          color: var(--text-2);
          font-size: 11px;
          font-family: var(--mono);
          padding: 4px 10px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .spread-turn-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.12);
          color: var(--text);
          border-color: var(--accent);
        }
        .spread-turn-btn.active-turn-btn {
          background: rgba(207, 173, 116, 0.18);
          border-color: var(--accent);
          color: var(--accent);
          font-weight: 700;
        }

        /* Under-Book Navigation Dots */
        .spread-bottom-dots-bar {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 16px;
          padding: 6px 14px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border);
          border-radius: 20px;
        }
        .spread-dots-arrow {
          background: transparent;
          border: none;
          color: var(--text-2);
          font-size: 14px;
          cursor: pointer;
          padding: 0 4px;
        }
        .spread-dots-arrow:hover:not(:disabled) {
          color: var(--accent);
        }
        .spread-dot-pill {
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
        .spread-dot-pill:hover {
          color: var(--text);
        }
        .spread-dot-pill.active {
          color: var(--accent);
          background: rgba(207, 173, 116, 0.15);
          font-weight: 700;
        }

        /* Mobile Single-Page Fallback (< 768px) */
        @media (max-width: 768px) {
          .real-two-page-spread {
            flex-direction: column;
            max-height: 86vh;
          }
          .spread-spine-crease-gutter {
            display: none;
          }
          .spread-center-silk-ribbon {
            display: none;
          }
          .spread-page-left,
          .spread-page-right {
            padding: 20px;
            box-shadow: none;
          }
        }
      `}</style>
    </section>
  );
}
