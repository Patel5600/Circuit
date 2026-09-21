# Script to write the complete, non-overlapping, authentic FormatInstrument.tsx
import os

jsx_content = '''import React, { useState, useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { useConnection } from "@solana/wallet-adapter-react";
import { useCircuitDomain } from "../../lib/domain/context";
import { useMarketData } from "../../context/MarketDataContext";
import { useDbcContext } from "../../context/DbcContext";
import { useTheme } from "../../context/ThemeContext";
import { MARKETS_DATA } from "../../data/markets";
import { getDetailedMarketSession } from "../../lib/market-data/stream";
import { CLUSTER_LABEL, PROGRAM_ID_STRING } from "../../env";
import { Icon } from "../ui/Icon";

type RiskState = "SAFE" | "RESTRICTED" | "DEFENSIVE" | "EMERGENCY";

export function FormatInstrument() {
  const { connection } = useConnection();
  const domain = useCircuitDomain();
  const marketData = useMarketData();
  const dbc = useDbcContext();
  const { theme, toggle } = useTheme();

  // Root container ref for scroll progress and dynamic layout calculations
  const containerRef = useRef<HTMLDivElement>(null);

  // Mode toggles
  const [notesMode, setNotesMode] = useState<boolean>(false);
  const [simMode, setSimMode] = useState<boolean>(false);
  const [ratchetState, setRatchetState] = useState<RiskState>("SAFE");

  // Real-time clock state for the ticking SVG Compass Face
  const [time, setTime] = useState<Date>(new Date());
  const [liveSlot, setLiveSlot] = useState<number>(328492810);

  // Scroll kinematics engine state
  const [scrollY, setScrollY] = useState<number>(0);
  const [showBackNav, setShowBackNav] = useState<boolean>(false);
  const [fanOpen, setFanOpen] = useState<number>(0);
  const [gaugeSweep, setGaugeSweep] = useState<number>(-90);
  const [activeGaugeWord, setActiveGaugeWord] = useState<number>(0);
  const [winTurn, setWinTurn] = useState<number>(0);
  const [clockHandDeg, setClockHandDeg] = useState<number>(0);
  const [clockActiveHour, setClockActiveHour] = useState<number>(1);
  const [rollX, setRollX] = useState<number>(0);
  const [parallaxY, setParallaxY] = useState<number>(0);

  // Previous scroll position for scroll direction detection
  const lastScrollY = useRef<number>(0);

  // Update clock every second
  useEffect(() => {
    const iv = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

  // Poll real slot from Solana connection or increment realistically
  useEffect(() => {
    let mounted = true;
    const fetchSlot = async () => {
      try {
        if (connection) {
          const s = await connection.getSlot("processed");
          if (mounted && s > 0) setLiveSlot(s);
        }
      } catch {
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

  // Dynamic layout calculations: mathematically chain each section top to eliminate overlap
  useEffect(() => {
    const updateLayout = () => {
      const u = window.innerWidth / 1440;
      const groupTop = 2160 * u;
      const sevenHeight = 2646 * u;
      const deckTop = groupTop + sevenHeight + 40 * u;
      const deckHeight = 426 * u;
      const fanTop = deckTop + deckHeight + 40 * u;
      const fanHeight = 697 * u;
      const winTop = fanTop + fanHeight + 40 * u;
      const winHeight = 697 * u;
      const veeTop = winTop + winHeight + 40 * u;
      const veeHeight = 841 * u;
      const gaugeTop = veeTop + veeHeight + 60 * u;
      const gaugeHeight = 2050 * u;
      const posterTop = gaugeTop + gaugeHeight + 40 * u;
      const posterHeight = 1617 * u;
      const fieldTop = posterTop + posterHeight + 60 * u;
      const fieldHeight = 520 * u;
      const footerTop = fieldTop + fieldHeight + 60 * u;
      const pageBottom = footerTop + 273 * u + 120 * u;

      const root = containerRef.current;
      if (root) {
        root.style.setProperty("--group-top", `${groupTop}px`);
        root.style.setProperty("--deck-top", `${deckTop}px`);
        root.style.setProperty("--fan-top", `${fanTop}px`);
        root.style.setProperty("--win-top-at", `${winTop}px`);
        root.style.setProperty("--vee-top", `${veeTop}px`);
        root.style.setProperty("--gauge-top", `${gaugeTop}px`);
        root.style.setProperty("--poster-top", `${posterTop}px`);
        root.style.setProperty("--field-top", `${fieldTop}px`);
        root.style.setProperty("--footer-top", `${footerTop}px`);
        root.style.setProperty("--page-bottom", `${pageBottom}px`);
      }
    };

    updateLayout();
    window.addEventListener("resize", updateLayout);
    return () => window.removeEventListener("resize", updateLayout);
  }, []);

  // Comprehensive, hardware-accelerated scroll kinematics listener
  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const sy = window.scrollY || document.documentElement.scrollTop;
          setScrollY(sy);

          // 1. Sticky back-nav slide down when scrolling upward
          if (sy > 400 && sy < lastScrollY.current - 2) {
            setShowBackNav(true);
          } else if (sy > lastScrollY.current + 2 || sy <= 400) {
            setShowBackNav(false);
          }
          lastScrollY.current = sy;

          // 2. Continuous rotations
          setWinTurn((sy * 0.12) % 360);
          const chDeg = (sy * 0.16) % 360;
          setClockHandDeg(chDeg);
          const hr = (Math.floor(((chDeg + 15) % 360) / 30) + 1);
          setClockActiveHour(hr > 12 ? 1 : hr);

          // 3. Parallax for ground
          setParallaxY((sy * 0.08) % 140);

          if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const totalH = rect.height || 12500;
            const progress = Math.min(Math.max(-rect.top / (totalH - window.innerHeight), 0), 1);

            // 4. Dynamic Fan Deck unfurl (around 38% to 50% scroll)
            const fanP = Math.min(Math.max((progress - 0.38) / 0.12, 0), 1);
            setFanOpen((fanP - 0.5) * 2); // -1.0 to +1.0

            // 5. Dual Speedometer Gauge Needle sweep (-90deg to +90deg around 55% to 75% scroll)
            const gaugeP = Math.min(Math.max((progress - 0.55) / 0.18, 0), 1);
            const sweep = -90 + gaugeP * 180;
            setGaugeSweep(sweep);
            setActiveGaugeWord(Math.min(Math.floor(gaugeP * 6), 5));

            // 6. Rolling sphere across poster (around 74% to 88% scroll)
            const rollP = Math.min(Math.max((progress - 0.74) / 0.14, 0), 1);
            setRollX(rollP * 780);
          }

          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const outerDialRot = useMemo(() => (scrollY * 0.08) % 360, [scrollY]);
  const innerCoreRot = useMemo(() => -(scrollY * 0.14) % 360, [scrollY]);

  // Active risk ratchet cycle
  const cycleRatchet = () => {
    setSimMode(true);
    setRatchetState((prev) => {
      if (prev === "SAFE") return "RESTRICTED";
      if (prev === "RESTRICTED") return "DEFENSIVE";
      if (prev === "DEFENSIVE") return "EMERGENCY";
      return "SAFE";
    });
  };

  const effectiveRatchet = simMode ? ratchetState : "SAFE";

  return (
    <div
      ref={containerRef}
      className={`format-canvas ${notesMode ? "is-notes" : ""} ${simMode ? "is-sim" : ""}`}
      id="format-root"
      style={{
        "--open": fanOpen,
        "--scroll-rot": `${outerDialRot}deg`,
        "--scroll-rot-neg": `${innerCoreRot}deg`,
        "--win-turn": `${winTurn}deg`,
        "--clock-hand-deg": `${clockHandDeg}deg`,
        "--gauge-sweep": `${gaugeSweep}deg`,
        "--roll-x": `${rollX}px`,
        "--parallax": `${parallaxY}px`,
      } as any}
    >
      {/* =========================================================================
          STICKY BACK-NAV (DROPS DOWN ON SCROLL UP)
          ========================================================================= */}
      <nav className={`back-nav ${showBackNav ? "is-down" : ""}`} aria-hidden={!showBackNav}>
        <span>Circuit Protocol · Solana Devnet · Program {PROGRAM_ID_STRING.slice(0, 4)}...{PROGRAM_ID_STRING.slice(-4)} · Slot {liveSlot.toLocaleString()}</span>
        <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
          <button type="button" onClick={() => setNotesMode(!notesMode)} style={{ cursor: "pointer", fontWeight: 700 }}>
            {notesMode ? "Hide Invariants" : "Protocol Invariants"}
          </button>
          <button type="button" onClick={cycleRatchet} style={{ cursor: "pointer", fontWeight: 700 }}>
            {simMode ? `Ratchet: ${effectiveRatchet}` : "Simulate Ratchet"}
          </button>
          <Link to="/app" className="btn btn--primary btn--sm" style={{ padding: "4px 10px", fontSize: "10px" }}>
            Launch Terminal
          </Link>
        </div>
      </nav>

      {/* =========================================================================
          AUTHENTIC CIRCUIT PCB BUS MATRIX (Vector Traces & Fiducials)
          ========================================================================= */}
      <svg className="pcb-bus-matrix" viewBox="0 0 1440 9850" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <line x1="20" y1="0" x2="20" y2="9850" stroke="currentColor" strokeWidth="1" strokeDasharray="6 6" />
        <line x1="1420" y1="0" x2="1420" y2="9850" stroke="currentColor" strokeWidth="1" strokeDasharray="6 6" />
        <line x1="720" y1="0" x2="720" y2="9850" stroke="currentColor" strokeWidth="0.75" strokeDasharray="3 9" />
        <g transform="translate(40, 260)">
          <circle cx="0" cy="0" r="8" stroke="currentColor" strokeWidth="1" />
          <line x1="-12" y1="0" x2="12" y2="0" stroke="currentColor" strokeWidth="1" />
          <line x1="0" y1="-12" x2="0" y2="12" stroke="currentColor" strokeWidth="1" />
          <text x="14" y="4" fill="currentColor" fontFamily="var(--mono)" fontSize="7" letterSpacing="0.08em">FID·01A</text>
        </g>
        <g transform="translate(1400, 260)">
          <circle cx="0" cy="0" r="8" stroke="currentColor" strokeWidth="1" />
          <line x1="-12" y1="0" x2="12" y2="0" stroke="currentColor" strokeWidth="1" />
          <line x1="0" y1="-12" x2="0" y2="12" stroke="currentColor" strokeWidth="1" />
          <text x="-52" y="4" fill="currentColor" fontFamily="var(--mono)" fontSize="7" letterSpacing="0.08em">FID·01B</text>
        </g>
      </svg>

      {/* =========================================================================
          MONUMENTAL WORDMARK (CIRCUIT) SITTING BEHIND CARDS
          ========================================================================= */}
      <div className="logo-fixed" aria-label="CIRCUIT PROTOCOL KERNEL">
        <svg className="logo-svg" viewBox="0 0 1401 215" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="CIRCUIT">
          <g className="logo-letter" data-letter="C">
            <path d="M0 46.1383V167.947L46.1383 214.085H190V167.947H68V46.1383H190V0H46.1383L0 46.1383Z" fill="currentColor" />
          </g>
          <g className="logo-letter" data-letter="I">
            <path d="M216 0H284V214.085H216V0Z" fill="currentColor" />
          </g>
          <g className="logo-letter" data-letter="R">
            <path d="M310 0V214.167H374V0H310Z" fill="currentColor" />
            <path d="M374 0V134.488H482V54.4824L428 0H374Z" fill="currentColor" />
            <path d="M374 143.569V214.658H482L412 143.569H374Z" fill="currentColor" />
          </g>
          <g className="logo-letter" data-letter="C">
            <path d="M508 46.1383V167.947L554.138 214.085H698V167.947H576V46.1383H698V0H554.138L508 46.1383Z" fill="currentColor" />
          </g>
          <g className="logo-letter" data-letter="U">
            <path d="M724 0V167.947L770.138 214.085H862L908 167.947V0H840V167.947H792V0H724Z" fill="currentColor" />
          </g>
          <g className="logo-letter" data-letter="I">
            <path d="M934 0H1002V214.085H934V0Z" fill="currentColor" />
          </g>
          <g className="logo-letter" data-letter="T">
            <path d="M1028 0H1200V46.1383H1148V214.167H1080V46.1383H1028V0Z" fill="currentColor" />
          </g>
          <g className="logo-letter" data-letter="KERNEL">
            <rect x="1228" y="0" width="173" height="46" fill="currentColor" />
            <rect x="1228" y="168" width="173" height="46" fill="currentColor" />
            <circle cx="1314.5" cy="107" r="32" fill="currentColor" />
            <circle cx="1314.5" cy="107" r="14" fill="var(--color-bg)" />
          </g>
        </svg>
      </div>

      {/* =========================================================================
          ATMOSPHERIC GROUND LAYER (.ground)
          ========================================================================= */}
      <div className="ground" aria-hidden="true">
        <img src="/assets/flower.webp" alt="Atmospheric topography ground" />
      </div>

      {/* =========================================================================
          TOP NAV & TELEMETRY
          ========================================================================= */}
      <div className="screen">
        <nav className="nav">
          <span className="nav__bar" aria-hidden="true"></span>
          <span className="nav__box" aria-hidden="true"></span>

          <p className="nav__credits">
            <span className="line">
              <span className="line__in">
                Circuit Protocol Kernel · Solana Devnet · Tokenized Equity Credit
              </span>
            </span>
          </p>

          <p className="nav__season">
            <span className="line">
              <span className="line__in">
                Devnet Slot {liveSlot.toLocaleString()} · Pyth Pull Oracles · Meteora DBC
              </span>
            </span>
          </p>

          <button
            type="button"
            className="nav__toggle nav__toggle--notes"
            onClick={() => setNotesMode(!notesMode)}
            aria-pressed={notesMode}
          >
            <span className="line">
              <span className="line__in">
                <span className="u">{notesMode ? "Hide Invariants" : "Protocol Invariants"}</span>
              </span>
            </span>
          </button>

          <button
            type="button"
            className="nav__toggle nav__toggle--daughter"
            onClick={cycleRatchet}
            aria-pressed={simMode}
          >
            <span className="line">
              <span className="line__in">
                <span className="u">
                  {simMode ? `Ratchet: ${effectiveRatchet}` : "Simulate Ratchet (L0–L3)"}
                </span>
              </span>
            </span>
          </button>
        </nav>
      </div>

      {/* =========================================================================
          BLOCK ONE: 01 COMPRESSION CHAMBER & TICKING COMPASS
          ========================================================================= */}
      <article className="block-one" id="block-one">
        <div className="block-one__card">
          <div className="block-one__photo">
            <img src="/assets/vertical-card.webp" alt="Circuit compression architecture" />
          </div>

          <p className="block-one__index">01</p>
          <p className="block-one__kicker">(System Architecture)</p>
          <h2 className="block-one__title">Compression</h2>

          <p className="block-one__no" style={{ "--top": 206 } as any}>1.1</p>
          <div className="block-one__spec" style={{ "--top": 208 } as any}>
            <span>Usage</span>
            <span>Isolated Collateral</span>
            <span>Pyth Sub-second Pull</span>
            <span>Meteora DBC Swap</span>
          </div>

          <p className="block-one__no" style={{ "--top": 266 } as any}>1.2</p>
          <div className="block-one__spec" style={{ "--top": 268 } as any}>
            <span>Geometry</span>
            <span>Anchor PDA Seed</span>
            <span>Conservative Spread</span>
            <span>Dynamic LTV Limit</span>
          </div>

          <p className="block-one__no" style={{ "--top": 326 } as any}>1.3</p>
          <div className="block-one__spec" style={{ "--top": 328 } as any}>
            <span>Invariants</span>
            <span>D* Restitution</span>
            <span>Zero Replay Nonce</span>
            <span>Atomic Liquidation</span>
          </div>
        </div>

        {/* The Live Ticking Compass Face */}
        <div className="block-one__round" aria-label="Solana Devnet Telemetry Dial">
          <svg className="face" viewBox="0 0 68 68" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle className="face__disc" cx="34" cy="34" r="33.5" />
            <g className="face__ticks">
              {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => (
                <line
                  key={deg}
                  x1="34"
                  y1="2"
                  x2="34"
                  y2="6"
                  transform={`rotate(${deg} 34 34)`}
                />
              ))}
            </g>
            <circle
              className="face__ball"
              cx={34 + 22 * Math.cos(((time.getSeconds() * 6 - 90) * Math.PI) / 180)}
              cy={34 + 22 * Math.sin(((time.getSeconds() * 6 - 90) * Math.PI) / 180)}
              r="3.5"
            />
          </svg>
        </div>

        {/* Live Slot Badge Square */}
        <div className="block-one__square">
          <div className="square-telemetry">
            <span className="sq-badge">SLOT</span>
            <span className="sq-val">{liveSlot.toString().slice(-4)}</span>
            <span className="sq-status">SYNCED</span>
          </div>
        </div>
      </article>

      {/* =========================================================================
          BLOCK TWO: 02 CONTINUOUS EQUITIES BUS REEL (.wide)
          ========================================================================= */}
      <article className="wide" id="wide-bus">
        <div className="wide__photo">
          <img src="/assets/screens.webp" alt="Tokenized Equities Market Depth" />
        </div>

        <p className="wide__index">02</p>
        <p className="wide__kicker">(Market Stream)</p>
        <h2 className="wide__title">Equities Bus</h2>

        <div className="wide__reel" aria-hidden="true">
          <div className="wide__reel-in">
            <span>NVDAx $128.45 (+2.4%)</span>
            <span>AAPLx $224.10 (+0.8%)</span>
            <span>TSLAx $248.80 (-1.2%)</span>
            <span>MSFTx $432.60 (+1.1%)</span>
            <span>GOOGLx $179.20 (+0.5%)</span>
            <span>AMZNx $186.50 (+1.4%)</span>
            <span>NVDAx $128.45 (+2.4%)</span>
            <span>AAPLx $224.10 (+0.8%)</span>
            <span>TSLAx $248.80 (-1.2%)</span>
            <span>MSFTx $432.60 (+1.1%)</span>
          </div>
        </div>
      </article>

      {/* =========================================================================
          TAG & SIDE CARDS (NOTCHED PDA SPECIFICATIONS)
          ========================================================================= */}
      <div className="tag" id="tag-card">
        <span className="tag__cut" style={{ "--x": 0, "--y": 0, "--w": 28, "--h": 28 } as any} />
        <span className="tag__cut" style={{ "--x": 143, "--y": 94, "--w": 28, "--h": 28 } as any} />
        <p className="tag__kicker">(Auth)</p>
        <p className="tag__word">PDA:AUTH</p>
      </div>

      <div className="side" id="side-card">
        <span className="side__cut" style={{ "--x": 0, "--y": 94, "--w": 28, "--h": 28 } as any} />
        <span className="side__cut" style={{ "--x": 143, "--y": 0, "--w": 28, "--h": 28 } as any} />
        <p className="side__index"><span>02</span></p>
        <p className="side__kicker"><span>(Spec)</span></p>
        <p className="side__title"><span>INVARIANTS</span></p>
      </div>

      {/* =========================================================================
          03 CLOCK SECTION: 513px POLAR ORACLE FRESHNESS DIAL
          ========================================================================= */}
      <section className="clock-section" id="oracle-clock">
        <div className="clock">
          <div className="clock__bg" />
          {[
            { hr: 1, label: "00s Fresh" },
            { hr: 2, label: "05s Pyth" },
            { hr: 3, label: "10s NYSE" },
            { hr: 4, label: "15s Pull" },
            { hr: 5, label: "20s Conf" },
            { hr: 6, label: "25s EMA" },
            { hr: 7, label: "30s Stale" },
            { hr: 8, label: "35s Buffer" },
            { hr: 9, label: "40s Halt" },
            { hr: 10, label: "45s Circuit" },
            { hr: 11, label: "50s Ratchet" },
            { hr: 12, label: "60s Close" },
          ].map((item) => (
            <p
              key={item.hr}
              className={`clock__mark ${clockActiveHour === item.hr ? "is-active" : ""}`}
              style={{ "--i": item.hr } as any}
            >
              {item.label}
            </p>
          ))}

          {/* Sweeping Radial Clock Hand */}
          <div className="clock__hand">
            <span className="clock__hand-near">BOUND</span>
            <span className="clock__hand-far">30s</span>
            <span className="clock__hand-rule" />
          </div>
        </div>
      </section>

      {/* =========================================================================
          04 THE SEVEN SECTION: 7 FOUNDATIONAL DIMENSIONS OF EQUITY COLLATERAL
          ========================================================================= */}
      <div className="seven" id="seven-dimensions">
        {/* 4.1 Upright card with turned typography */}
        <article className="v-card">
          <div className="v-card__plate">
            <img src="/assets/vertical-card.webp" alt="Collateral Dimensions" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.15 }} />
          </div>

          <p className="v-turn" style={{ "--x": 758, "--y": 13, "--w": 12, "--h": 9, "--size": 8 } as any}><span>1.1</span></p>
          <div className="v-turn" style={{ "--x": 728, "--y": 44, "--w": 40, "--h": 56, "--size": 8 } as any}>
            <span><span>Usage</span><span>Isolated Collateral</span><span>PDA Escrow</span><span>Meteora DBC</span></span>
          </div>

          <p className="v-turn is-muted" style={{ "--x": 704, "--y": 13, "--w": 12, "--h": 10, "--size": 8 } as any}><span>1.2</span></p>
          <div className="v-turn is-muted" style={{ "--x": 674, "--y": 44, "--w": 40, "--h": 58, "--size": 8 } as any}>
            <span><span>Geometry</span><span>Anchor PDA Seed</span><span>Linear Curves</span><span>Bounded Risk</span></span>
          </div>

          <p className="v-turn is-muted" style={{ "--x": 649, "--y": 13, "--w": 12, "--h": 10, "--size": 8 } as any}><span>1.3</span></p>
          <div className="v-turn is-muted" style={{ "--x": 619, "--y": 44, "--w": 40, "--h": 50, "--size": 8 } as any}>
            <span><span>Perception</span><span>Zero Bad Debt</span><span>Atomic CPI</span><span>Strict Health</span></span>
          </div>

          <p className="v-turn is-muted" style={{ "--x": 595, "--y": 13, "--w": 12, "--h": 10, "--size": 8 } as any}><span>1.4</span></p>
          <div className="v-turn is-muted" style={{ "--x": 565, "--y": 44, "--w": 40, "--h": 56, "--size": 8 } as any}>
            <span><span>Balance</span><span>Autonomous CPI</span><span>Invariant D*</span><span>4-State Ratchet</span></span>
          </div>

          <p className="v-turn" style={{ "--x": 855, "--y": 43, "--w": 18, "--h": 40, "--size": 12 } as any}><span>Collateral</span></p>
          <p className="v-turn is-muted" style={{ "--x": 869, "--y": 43, "--w": 12, "--h": 31, "--size": 8 } as any}><span>(Circuit)</span></p>
          <p className="v-turn" style={{ "--x": 859, "--y": 13, "--w": 12, "--h": 4, "--size": 8 } as any}><span>1</span></p>

          <p className="v-card__no">1.1</p>
          <div className="v-card__shout">
            <span>Usage</span>
            <span>Tokenized Equity</span>
            <span>Non-Custodial</span>
            <span>Isolated Escrow</span>
          </div>
        </article>

        {/* 4.2 Segmented Chip Tile (5 markets + 1 pool) */}
        <div className="tile">
          <svg className="tile__disc" viewBox="0 0 158 158" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="79" cy="79" r="78" fill="var(--color-plate)" stroke="var(--color-mark)" strokeWidth="1" />
            <rect x="35" y="42" width="14" height="42" rx="2" fill="var(--color-plate-ink)" />
            <rect x="53" y="42" width="14" height="42" rx="2" fill="var(--color-plate-ink)" />
            <rect x="71" y="42" width="14" height="42" rx="2" fill="var(--color-plate-ink)" />
            <rect x="89" y="42" width="14" height="42" rx="2" fill="var(--color-plate-ink)" />
            <rect x="107" y="42" width="14" height="42" rx="2" fill="var(--color-plate-ink)" />
            <path d="M35 90 H121 V104 H49 L35 90 Z" fill="var(--color-plate-ink)" />
          </svg>
        </div>

        {/* 4.3 Concentration Cap Bar */}
        <article className="bar">
          <div className="bar__plate" />
          <p className="bar__index">02</p>
          <p className="bar__kicker">(Policy Ceiling)</p>
          <h2 className="bar__title">Concentration Cap</h2>
          <p className="bar__body">
            Single-asset debt pool utilization is strictly capped at 35% to eliminate contagion risk across tokenized US equities.
          </p>
        </article>

        {/* 4.4 Dynamic LTV Pill */}
        <article className="pill">
          <div className="pill__plate" />
          <p className="pill__index">2.1</p>
          <p className="pill__kicker">(Risk Boundary)</p>
          <h2 className="pill__title">Dynamic LTV Limits</h2>
          <p className="pill__body">
            75% Initial Borrow LTV, 82% Liquidation Trigger, 88% Emergency Closeout with conservative confidence spreads.
          </p>
        </article>

        {/* 4.5 Dual 697px Circular Dials */}
        <section className="dial">
          <div className="dial__rim" style={{ transform: `rotate(${outerDialRot}deg)` }}>
            {[
              { i: 1, label: "1.00x" },
              { i: 2, label: "1.25x" },
              { i: 3, label: "1.50x" },
              { i: 4, label: "1.75x" },
              { i: 5, label: "2.00x" },
              { i: 6, label: "2.25x" },
              { i: 7, label: "2.50x" },
              { i: 8, label: "2.75x" },
              { i: 9, label: "3.00x" },
              { i: 10, label: "3.25x" },
              { i: 11, label: "3.50x" },
              { i: 12, label: "4.00x" },
            ].map((m) => (
              <p key={m.i} className="dial__hour" style={{ "--i": m.i } as any}>
                {m.label}
              </p>
            ))}
          </div>
          <p className="dial__kicker">(Solana Invariant)</p>
          <h2 className="dial__title">Leverage Boundary</h2>
        </section>

        {/* 4.6 Giant Rotating Side A Disc */}
        <section className="side-a">
          <div className="side-a__ring" style={{ transform: `rotate(${innerCoreRot}deg)` }}>
            <svg viewBox="0 0 697 697" width="100%" height="100%">
              <circle cx="348.5" cy="348.5" r="347" fill="var(--color-plate)" stroke="rgba(0,0,0,0.15)" strokeWidth="2" />
              <path
                id="textPath-side-a"
                d="M 348.5, 348.5 m -300, 0 a 300,300 0 1,1 600,0 a 300,300 0 1,1 -600,0"
                fill="none"
              />
              <text fill="var(--color-plate-ink)" fontSize="18" fontWeight="800" letterSpacing="4">
                <textPath href="#textPath-side-a">
                  CIRCUIT PROTOCOL KERNEL · ZERO BAD DEBT · PYTH PULL ORACLES · METEORA DYNAMIC BONDING CURVES ·
                </textPath>
              </text>
            </svg>
          </div>
          <div className="side-a__core">
            <div className="side-a__spin" />
          </div>
          <p className="side-a__index">03</p>
          <p className="side-a__kicker">(Execution Core)</p>
          <h2 className="side-a__title">Deterministic Invariants</h2>
        </section>

        {/* 4.7 Directional Execution Conduit (.tri) */}
        <section className="tri">
          <svg className="tri__outline" viewBox="0 0 704 609" fill="none" xmlns="http://www.w3.org/2000/svg">
            <polygon
              points="20,20 684,20 352,580"
              fill="var(--color-plate)"
              stroke="rgba(0,0,0,0.12)"
              strokeWidth="2"
            />
            <line
              x1="352"
              y1="20"
              x2="352"
              y2="580"
              stroke="var(--p-forest, #444F24)"
              strokeWidth="2"
              className="tri__conduit-pulse"
            />
          </svg>
          <span className="tri__stud tri__stud--a">
            <svg viewBox="0 0 33 33"><circle cx="16.5" cy="16.5" r="14" fill="#000" /></svg>
          </span>
          <span className="tri__stud tri__stud--b">
            <svg viewBox="0 0 33 33"><circle cx="16.5" cy="16.5" r="14" fill="#000" /></svg>
          </span>
          <h2 className="tri__title">DIRECTIONAL LIQUIDATION</h2>
          <p className="tri__lead">
            Meteora Dynamic Bonding Curves absorb collateral slippage with zero order-book dependence.
          </p>
          <div className="tri__lead--turned">
            <span>AUTOMATED SWAP INVARIANT ATOMIC DEBT REPAYMENT MINIMUM RESTORATION DEBT D*</span>
          </div>
          <p className="tri__index">04</p>
        </section>

        {/* 4.8 Isolated Vault Aperture (.special) */}
        <article className="special">
          <div className="special__plate">
            <p className="special__index">05</p>
            <p className="special__kicker">(Isolated Escrow)</p>
            <h2 className="special__title">Cold Storage Vault PDA</h2>
            <div className="special__spec">
              <span>Seeds: [b"vault", mint.key()]</span>
              <span>Program Authority: {PROGRAM_ID_STRING.slice(0, 8)}...</span>
              <span>Replay Nonce: Zero Cross-Contamination</span>
            </div>
          </div>
          <div className="special__photo">
            <span style={{ fontFamily: "var(--mono)", fontSize: "10px", color: "#10b981", fontWeight: 700 }}>
              ESCROW PDA VERIFIED
            </span>
            <span style={{ fontFamily: "var(--mono)", fontSize: "13px", fontWeight: 800, marginTop: "4px" }}>
              NVDAx · 100% ISOLATED
            </span>
          </div>
        </article>
      </div>

      {/* =========================================================================
          05 TRANSITION DECK CARD (.deck)
          ========================================================================= */}
      <section className="deck">
        <div style={{ padding: "32px", display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontFamily: "var(--mono)", fontSize: "9px", color: "var(--color-mark)", fontWeight: 700 }}>
              06 // MULTI-ASSET REGISTRY
            </span>
            <h3 style={{ fontSize: "16px", fontWeight: 800, margin: "8px 0 0" }}>
              5 Active Equities Markets
            </h3>
            <p style={{ fontFamily: "var(--mono)", fontSize: "10px", color: "var(--color-mark)", marginTop: "8px", lineHeight: 1.4 }}>
              NVDAx, AAPLx, TSLAx, MSFTx, and GOOGLx tokenized equities supported on Solana devnet.
            </p>
          </div>
          <div style={{ borderTop: "1px solid rgba(0,0,0,0.1)", paddingTop: "12px", display: "flex", justifyContent: "space-between", fontFamily: "var(--mono)", fontSize: "10px" }}>
            <span>ORACLE: PYTH PULL</span>
            <span style={{ color: "#10b981", fontWeight: 700 }}>ACTIVE</span>
          </div>
        </div>
      </section>

      {/* =========================================================================
          06 FAN: RADIAL SOLVENCY DECK (DYNAMIC SCROLL UNFURL)
          ========================================================================= */}
      <section className="fan" id="solvency-fan">
        <div className="fan__disc">
          <svg viewBox="0 0 697 697" width="100%" height="100%">
            <circle cx="348.5" cy="348.5" r="346" fill="var(--color-plate)" stroke="rgba(0,0,0,0.1)" strokeWidth="2" />
          </svg>
        </div>

        <div className="fan__deck">
          {[
            {
              base: 0,
              num: "01",
              title: "State Observation",
              desc: "Pyth pull oracle transmits latest confidence interval and publish time.",
            },
            {
              base: 1,
              num: "02",
              title: "Health Derivation",
              desc: "Health Factor evaluates underwater threshold: Hf = (Collateral × LTV) / Debt.",
            },
            {
              base: 2,
              num: "03",
              title: "D* Debt Calculation",
              desc: "Restoration formula calculates exact minimum debt repayment required.",
            },
            {
              base: 3,
              num: "04",
              title: "Meteora DBC Route",
              desc: "Dynamic bonding curve executes swap without orderbook slippage.",
            },
            {
              base: 4,
              num: "05",
              title: "Atomic Invariant",
              desc: "CPI execution confirms health factor restoration: Hf' >= 1.05.",
            },
            {
              base: 5,
              num: "06",
              title: "Solvency Restored",
              desc: "Vault escrow unlocks, penalty settles, position resumes normal state.",
            },
          ].map((card, i) => (
            <div key={card.num} className="fan__card" style={{ "--base": card.base } as any}>
              <div className="fan-card-inner">
                <span className="fci-kicker">STAGE {card.num}</span>
                <h4 className="fci-title">{card.title}</h4>
                <p className="fci-desc">{card.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="fan__glass" />
        <p className="fan__index">07</p>
        <p className="fan__kicker">(Solvency Palette)</p>
        <h2 className="fan__title">D* Restitution</h2>
      </section>

      {/* =========================================================================
          07 WIN: DUAL ORACLE & AMM WINDOWS (TURNING DISC BEHIND PLATE)
          ========================================================================= */}
      <section className="win" id="windows-section">
        <div className="win__plate">
          <div className="win__disc">
            <span className="win__face" />
            <span className="win__arc" style={{ "--q": 0 } as any}><i>(Oracle)</i> <b>PYTH PULL</b></span>
            <span className="win__arc" style={{ "--q": 1 } as any}><i>(Liquidity)</i> <b>METEORA DBC</b></span>
            <span className="win__arc" style={{ "--q": 2 } as any}><i>(Ratchet)</i> <b>4-STATE ENGINE</b></span>
            <span className="win__arc" style={{ "--q": 3 } as any}><i>(Solana)</i> <b>ANCHOR CPI</b></span>
          </div>

          {/* Left Window: Pyth Pull Telemetry */}
          <div className="win__shot win__shot--left">
            <span style={{ fontFamily: "var(--mono)", fontSize: "9px", color: "var(--color-mark)" }}>
              01 // ORACLE WINDOW
            </span>
            <div>
              <div style={{ fontSize: "28px", fontWeight: 900, letterSpacing: "-1px", lineHeight: 1 }}>
                $128.45
              </div>
              <span style={{ fontFamily: "var(--mono)", fontSize: "10px", color: "#10b981", fontWeight: 700 }}>
                PYTH CONF: ±$0.12 (9 bps)
              </span>
            </div>
            <p style={{ margin: 0, fontFamily: "var(--mono)", fontSize: "9px", opacity: 0.7, lineHeight: 1.4 }}>
              Sub-second pull feeds verified atomically on-chain with conservative confidence discounting.
            </p>
          </div>

          {/* Right Window: Meteora DBC AMM Reserves */}
          <div className="win__shot win__shot--right">
            <span style={{ fontFamily: "var(--mono)", fontSize: "9px", color: "var(--color-mark)" }}>
              02 // AMM WINDOW
            </span>
            <div>
              <div style={{ fontSize: "28px", fontWeight: 900, letterSpacing: "-1px", lineHeight: 1 }}>
                2,480,120
              </div>
              <span style={{ fontFamily: "var(--mono)", fontSize: "10px", color: "#60a5fa", fontWeight: 700 }}>
                VIRTUAL DBC RESERVES (USDC)
              </span>
            </div>
            <p style={{ margin: 0, fontFamily: "var(--mono)", fontSize: "9px", opacity: 0.7, lineHeight: 1.4 }}>
              Dynamic bonding curves provide instant deterministic liquidity without order-book depth.
            </p>
          </div>
        </div>
      </section>

      {/* =========================================================================
          08 VEE: DUAL REPAIR SHIELD & CENTER TRIANGLE
          ========================================================================= */}
      <section className="vee" id="repair-shield">
        <div className="vee__card vee__card--west">
          <h3 className="vee__title">Liquidator Arbitrage Buffer</h3>
          <p className="vee__body">
            300 bps incentive window guarantees liquidators execute timely debt restoration before bad debt accrues.
          </p>
        </div>

        <div className="vee__card vee__card--east">
          <h3 className="vee__title">Protocol Circuit Breaker</h3>
          <p className="vee__body">
            Automatic state transition to DEFENSIVE regime halts new borrow authority while keeping capital recovery unconditionally open.
          </p>
        </div>

        <div className="vee__plate">
          <svg viewBox="0 0 704 560" width="100%" height="100%" fill="none">
            <polygon points="20,20 684,20 352,540" fill="var(--color-plate)" stroke="rgba(0,0,0,0.1)" strokeWidth="2" />
            <text x="352" y="180" fill="var(--color-plate-ink)" fontSize="24" fontWeight="800" textAnchor="middle">
              INVARIANT SHIELD
            </text>
            <text x="352" y="210" fill="var(--color-mark)" fontSize="12" fontFamily="var(--mono)" textAnchor="middle">
              Hf >= 1.05 POST-LIQUIDATION
            </text>
          </svg>
        </div>
      </section>

      {/* =========================================================================
          09 GAUGE: DUAL SWEEPING PROTOCOL SPEEDOMETERS
          ========================================================================= */}
      <section className="gauge" id="speedometers">
        <div className="gauge__header">
          <h2>SOLVENCY SENSITIVITY MATRIX</h2>
          <p>Real-Time Dynamic Needle Sweep Across Leverage & Pool Utilization</p>
        </div>

        {/* Left Gauge: Health Factor & Leverage */}
        <div className="gauge__dial gauge__dial--left">
          <span className="gauge__ring gauge__ring--white" />
          <span className="gauge__ring gauge__ring--black" />
          <span className="gauge__ring gauge__ring--glass" />
          <div className="gauge__words">
            {[
              { a: -75, label: "1.00x Solvency" },
              { a: -45, label: "1.50x Normal" },
              { a: -15, label: "2.00x Moderate" },
              { a: 15, label: "2.50x Warning" },
              { a: 45, label: "3.00x Critical" },
              { a: 75, label: "4.00x Liquidation" },
            ].map((w, idx) => (
              <span
                key={w.label}
                className={`gauge__word ${activeGaugeWord === idx ? "is-read" : ""}`}
                style={{ "--a": w.a } as any}
              >
                {w.label}
              </span>
            ))}
          </div>
          <div className="gauge__needle" style={{ transform: `rotate(${gaugeSweep}deg)` }} />
        </div>

        {/* Right Gauge: Pool Utilization */}
        <div className="gauge__dial gauge__dial--right">
          <span className="gauge__ring gauge__ring--white" />
          <span className="gauge__ring gauge__ring--black" />
          <span className="gauge__ring gauge__ring--glass" />
          <div className="gauge__words">
            {[
              { a: -75, label: "0% Idle" },
              { a: -45, label: "20% Active" },
              { a: -15, label: "35% Cap Target" },
              { a: 15, label: "50% Heavy" },
              { a: 45, label: "75% Throttle" },
              { a: 75, label: "90% Freeze" },
            ].map((w, idx) => (
              <span
                key={w.label}
                className={`gauge__word ${activeGaugeWord === idx ? "is-read" : ""}`}
                style={{ "--a": w.a } as any}
              >
                {w.label}
              </span>
            ))}
          </div>
          <div className="gauge__needle" style={{ transform: `rotate(${180 - gaugeSweep}deg)` }} />
        </div>
      </section>

      {/* =========================================================================
          10 POSTER: PROTOCOL MANIFESTO & ROLLING SPHERE
          ========================================================================= */}
      <section className="poster" id="protocol-manifesto">
        <h2 className="poster__say">
          <div>CAPITAL GOVERNS RISK.</div>
          <div>INVARIANTS AS AUTHORITY.</div>
          <div>CODE OVER DISCRETION.</div>
          <div>(0)</div>
        </h2>

        {/* The Solid Rolling Sphere that translates horizontally on scroll */}
        <div className="poster-roll-sphere" />

        <div className="poster__shot">
          <img src="/assets/flower.webp" alt="Protocol Manifesto Nature" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>

        <div className="poster__spec-rail">
          <div style={{ background: "var(--color-plate)", padding: "24px", color: "var(--color-plate-ink)", boxShadow: "0 4px 14px rgba(0,0,0,0.06)" }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: "9px", color: "var(--color-mark)", fontWeight: 700 }}>
              RULE 01 // CONSERVATIVE CONFIDENCE DISCOUNT
            </span>
            <h4 style={{ fontSize: "16px", fontWeight: 800, margin: "6px 0" }}>
              p = max(0, price - conf)
            </h4>
            <p style={{ margin: 0, fontSize: "11px", color: "var(--color-mark)", lineHeight: 1.45, fontFamily: "var(--mono)" }}>
              Circuit unconditionally penalizes oracle uncertainty by subtracting the confidence spread from the price before computing borrow capacity.
            </p>
          </div>

          <div style={{ background: "var(--color-plate)", padding: "24px", color: "var(--color-plate-ink)", boxShadow: "0 4px 14px rgba(0,0,0,0.06)" }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: "9px", color: "var(--color-mark)", fontWeight: 700 }}>
              RULE 02 // DETERMINISTIC RESTITUTION
            </span>
            <h4 style={{ fontSize: "16px", fontWeight: 800, margin: "6px 0" }}>
              D* = (L - p · C) / (1 - p · β / α)
            </h4>
            <p style={{ margin: 0, fontSize: "11px", color: "var(--color-mark)", lineHeight: 1.45, fontFamily: "var(--mono)" }}>
              The exact mathematical minimum debt repayment required to restore an underwater position to Hf = 1.05, enforced atomically on-chain.
            </p>
          </div>
        </div>
      </section>

      {/* =========================================================================
          11 FIELD: INVARIANT COORDINATE FIELD (.field)
          ========================================================================= */}
      <section className="field" id="coordinate-field">
        <div className="field__marks" aria-hidden="true">
          <span className="field__rule--v" />
          <span className="field__rule--h" />
        </div>
        <p className="field__call">
          RISK DETERMINES CAPITAL AUTHORITY.
        </p>
      </section>

      {/* =========================================================================
          12 FOOTER: MONUMENTAL WORDMARK & METADATA BAR
          ========================================================================= */}
      <footer className="footer">
        <svg className="footer-wordmark" viewBox="0 0 1401 215" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="CIRCUIT">
          <g className="logo-letter" data-letter="C">
            <path d="M0 46.1383V167.947L46.1383 214.085H190V167.947H68V46.1383H190V0H46.1383L0 46.1383Z" fill="currentColor" />
          </g>
          <g className="logo-letter" data-letter="I">
            <path d="M216 0H284V214.085H216V0Z" fill="currentColor" />
          </g>
          <g className="logo-letter" data-letter="R">
            <path d="M310 0V214.167H374V0H310Z" fill="currentColor" />
            <path d="M374 0V134.488H482V54.4824L428 0H374Z" fill="currentColor" />
            <path d="M374 143.569V214.658H482L412 143.569H374Z" fill="currentColor" />
          </g>
          <g className="logo-letter" data-letter="C">
            <path d="M508 46.1383V167.947L554.138 214.085H698V167.947H576V46.1383H698V0H554.138L508 46.1383Z" fill="currentColor" />
          </g>
          <g className="logo-letter" data-letter="U">
            <path d="M724 0V167.947L770.138 214.085H862L908 167.947V0H840V167.947H792V0H724Z" fill="currentColor" />
          </g>
          <g className="logo-letter" data-letter="I">
            <path d="M934 0H1002V214.085H934V0Z" fill="currentColor" />
          </g>
          <g className="logo-letter" data-letter="T">
            <path d="M1028 0H1200V46.1383H1148V214.167H1080V46.1383H1028V0Z" fill="currentColor" />
          </g>
        </svg>

        <div className="footer-meta-bar">
          <div>
            <span>© 2026 Circuit Protocol · Solana Devnet Program {PROGRAM_ID_STRING.slice(0, 6)}... · All Invariants Enforced On-Chain</span>
          </div>
          <div style={{ display: "flex", gap: "20px" }}>
            <Link to="/app" className="u">App Terminal</Link>
            <Link to="/app/markets" className="u">Markets</Link>
            <Link to="/app/borrow" className="u">Borrow</Link>
            <Link to="/app/dashboard" className="u">Dashboard</Link>
          </div>
        </div>
      </footer>

      {/* Floating Tactical Actions Bar */}
      <div className="format-floating-actions">
        <Link to="/app" className="btn btn--primary btn--sm">
          Terminal <Icon name="arrowRight" size={14} />
        </Link>
        <button
          type="button"
          className="theme-toggle"
          onClick={toggle}
          title={`Switch to ${theme === "dark" ? "light (MIST)" : "dark"} mode`}
        >
          <span className="theme-toggle__icon">
            <Icon name={theme === "dark" ? "sun" : "moon"} size={14} />
          </span>
          <span className="theme-toggle__label">
            {theme === "dark" ? "MIST" : "DARK"}
          </span>
        </button>
      </div>
    </div>
  );
}
'''

with open('c:/Dev/Circuit/app/src/components/landing/FormatInstrument.tsx', 'w', encoding='utf-8') as f:
    f.write(jsx_content)

print("Successfully wrote updated FormatInstrument.tsx!")
