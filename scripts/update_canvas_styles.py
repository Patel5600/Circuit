# Script to generate the mathematically exact non-overlapping CSS for FormatInstrument
import os

css_rules = """/* ==========================================================================
   CIRCUIT PROTOCOL INSTRUMENT: EXACT FORMAT ARCHITECTURE & NON-OVERLAPPING GRID
   Direct mathematical reproduction of Format principles with deep Solana fidelity
   Scaled via multi-tier --s engine with MIST (#B6BBD9) Light Mode dominance
   ========================================================================== */

.format-canvas {
  --s: calc(100vw / 1440);
  --color-bg: #222222;
  --color-logo: #2f2f2f;
  --color-plate: #ffffff;
  --color-plate-ink: #000000;
  --color-nav-muted: #939393;
  --color-dial: #ffffff;
  --color-mark: #888888;
  --color-mark-active: #000000;
  --color-hand: #000000;
  --color-dot: #000000;
  --color-note: #e0ddbf;
  --color-note-ink: #000000;
  --layer-bg-logo: 1;
  --layer-ground: 2;
  --layer-content: 3;
  --layer-nav: 20;
  --grid-margin: 20;
  --content-width: 1400;

  /* Default top coordinates for non-overlapping section layout */
  --group-top: calc(2160 * var(--s));
  --deck-top: calc(4860 * var(--s));
  --fan-top: calc(5340 * var(--s));
  --win-top-at: calc(6080 * var(--s));
  --vee-top: calc(6820 * var(--s));
  --gauge-top: calc(7780 * var(--s));
  --poster-top: calc(9880 * var(--s));
  --field-top: calc(11550 * var(--s));
  --footer-top: calc(12120 * var(--s));
  --page-bottom: calc(12500 * var(--s));

  /* Scroll kinematics custom properties */
  --scroll-rot: 0deg;
  --scroll-rot-neg: 0deg;
  --win-turn: 0deg;
  --clock-hand-deg: 0deg;
  --open: 0;
  --carry: 2;
  --gauge-sweep: -90deg;
  --roll-x: 0px;
  --assemble: 0;
  --drift: 0.07;
  --parallax: 70px;

  position: relative;
  width: 100%;
  min-height: var(--page-bottom, calc(12500 * var(--s)));
  background: var(--color-bg);
  font-family: var(--sans);
  color: var(--color-plate-ink);
  overflow-x: hidden;
  text-rendering: geometricPrecision;
  -webkit-font-smoothing: antialiased;
}

/* 4K ULTRA-HD & WIDESCREEN RESOLUTION ENGINE */
@media (min-width: 1920px) {
  .format-canvas {
    --s: calc(100vw / 1680);
  }
}
@media (min-width: 2560px) {
  .format-canvas {
    --s: calc(100vw / 2160);
  }
}
@media (min-width: 3840px) {
  .format-canvas {
    --s: calc(100vw / 2880);
  }
}
@media (max-width: 1200px) {
  .format-canvas {
    --s: calc(100vw / 1200);
  }
}
@media (max-width: 900px) {
  .format-canvas {
    --s: calc(100vw / 900);
  }
}

[data-theme="light"] .format-canvas {
  --color-bg: #B6BBD9; /* MIST atmospheric ground */
  --color-logo: rgba(18, 35, 17, 0.16); /* Monumental watermark behind cards */
  --color-plate: #FFFFFF; /* Luminous Alabaster plate */
  --color-plate-ink: #122311; /* DEEP text */
  --color-nav-muted: #444F24; /* FOREST secondary */
  --color-dial: #FFFFFF;
  --color-mark: #717765; /* TERRAIN markers */
  --color-mark-active: #212413; /* SHADOW active */
  --color-hand: #122311;
  --color-dot: #122311;
  --color-note: #E2E5EE;
  --color-note-ink: #122311;
}

/* AUTHENTIC PCB BUS OVERLAY MATRIX */
.pcb-bus-matrix {
  position: absolute;
  top: 0;
  left: 50%;
  width: calc(var(--content-width) * var(--s));
  height: 100%;
  transform: translateX(-50%);
  pointer-events: none;
  z-index: 2;
  opacity: 0.18;
}

[data-theme="light"] .pcb-bus-matrix {
  opacity: 0.28;
  color: var(--color-mark);
}

/* =========================================================================
   MONUMENTAL WORDMARK (CIRCUIT) SITTING BEHIND CARDS
   ========================================================================= */
.logo-fixed {
  left: calc(var(--grid-margin) * var(--s));
  top: calc(20 * var(--s));
  width: calc(var(--content-width) * var(--s));
  color: var(--color-logo);
  pointer-events: none;
  z-index: var(--layer-bg-logo);
  position: absolute;
  user-select: none;
}

.logo-svg {
  width: 100%;
  height: auto;
  display: block;
}

/* =========================================================================
   ATMOSPHERIC GROUND LAYER (.ground)
   ========================================================================= */
.ground {
  left: calc(-26 * var(--s));
  top: calc(850 * var(--s));
  width: calc(1497 * var(--s));
  height: calc(999 * var(--s));
  isolation: isolate;
  position: absolute;
  z-index: var(--layer-ground);
  overflow: hidden;
  opacity: 0.65;
  pointer-events: none;
}

[data-theme="light"] .ground {
  opacity: 0.45;
  filter: contrast(1.1) grayscale(100%);
}

.ground img {
  left: 0;
  top: calc(var(--parallax) * -1);
  width: 100%;
  height: calc(100% + var(--parallax) * 2);
  object-fit: cover;
  display: block;
  position: absolute;
  transition: transform 0.1s linear;
  will-change: transform;
}

/* =========================================================================
   TOP NAV & TELEMETRY
   ========================================================================= */
.screen {
  z-index: var(--layer-nav);
  width: 100%;
  height: calc(300 * var(--s));
  position: relative;
}

.nav {
  z-index: var(--layer-nav);
  left: calc(var(--grid-margin) * var(--s));
  top: calc(244 * var(--s));
  width: calc(var(--content-width) * var(--s));
  height: calc(29 * var(--s));
  font-size: calc(12 * var(--s));
  color: var(--color-plate-ink);
  position: absolute;
}

.nav__bar,
.nav__box {
  background: var(--color-plate);
  position: absolute;
  border: 1px solid rgba(0, 0, 0, 0.08);
}

.nav__bar {
  width: calc(var(--content-width) * var(--s));
  height: calc(16 * var(--s));
  top: 0;
  left: 0;
}

.nav__box {
  left: calc(696 * var(--s));
  width: calc(353 * var(--s));
  height: calc(29 * var(--s));
  top: 0;
}

.nav p,
.nav button {
  white-space: nowrap;
  margin: 0;
  position: absolute;
}

.nav__credits {
  left: calc(10 * var(--s));
  top: calc(-1.5 * var(--s));
  line-height: calc(18 * var(--s));
  font-family: var(--mono);
}

.nav__season {
  left: calc(704 * var(--s));
  top: calc(2.5 * var(--s));
  line-height: calc(12 * var(--s));
  font-family: var(--mono);
}

.nav__toggle {
  font-family: var(--mono);
  font-size: inherit;
  line-height: calc(18 * var(--s));
  color: inherit;
  cursor: pointer;
  top: calc(-1.5 * var(--s));
  background: 0 0;
  border: 0;
  padding: 0;
}

.nav__toggle--notes {
  right: calc(180 * var(--s));
}

.nav__toggle--daughter {
  right: calc(10 * var(--s));
}

/* =========================================================================
   STICKY BACK-NAV (SLIDES DOWN ON SCROLL UP)
   ========================================================================= */
.back-nav {
  position: fixed;
  top: 0;
  left: 50%;
  transform: translateX(-50%) translateY(-100%);
  width: calc(var(--content-width) * var(--s));
  height: calc(32 * var(--s));
  z-index: 100;
  transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  background: var(--color-plate);
  color: var(--color-plate-ink);
  border: 1px solid rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 calc(16 * var(--s));
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
  font-family: var(--mono);
  font-size: calc(11 * var(--s));
}

.back-nav.is-down {
  transform: translateX(-50%) translateY(0);
}

/* =========================================================================
   01 BLOCK ONE: VERTICAL RATIO & REAL-TIME TICKING COMPASS
   ========================================================================= */
.block-one {
  left: calc(553 * var(--s));
  top: calc(436 * var(--s));
  width: calc(409 * var(--s));
  height: calc(426 * var(--s));
  z-index: var(--layer-content);
  margin: 0;
  position: absolute;
}

.block-one__card {
  width: calc(335 * var(--s));
  height: calc(426 * var(--s));
  background: var(--color-plate);
  color: var(--color-plate-ink);
  position: absolute;
  top: 0;
  left: 0;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
}

.block-one__photo {
  left: 0;
  top: calc(10 * var(--s));
  width: calc(131 * var(--s));
  height: calc(406 * var(--s));
  background: var(--color-plate-ink);
  position: absolute;
  overflow: hidden;
}

.block-one__photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.block-one__card p,
.block-one__card h2 {
  white-space: nowrap;
  margin: 0;
  font-weight: 400;
  position: absolute;
}

.block-one__index {
  left: calc(12 * var(--s));
  top: calc(206 * var(--s));
  font-size: calc(8 * var(--s));
  line-height: calc(12 * var(--s));
  font-family: var(--mono);
  font-weight: 700 !important;
}

.block-one__kicker {
  left: calc(141 * var(--s));
  top: calc(196 * var(--s));
  font-size: calc(8 * var(--s));
  line-height: calc(12 * var(--s));
  color: var(--color-mark);
  font-family: var(--mono);
}

.block-one__title {
  left: calc(141 * var(--s));
  top: calc(204 * var(--s));
  font-size: calc(13 * var(--s));
  line-height: calc(18 * var(--s));
  font-weight: 700 !important;
}

.block-one__no {
  left: calc(220 * var(--s));
  top: calc(var(--top) * var(--s));
  font-size: calc(8 * var(--s));
  line-height: calc(12 * var(--s));
  font-family: var(--mono);
}

.block-one__spec {
  left: calc(251 * var(--s));
  top: calc(var(--top) * var(--s));
  font-size: calc(8 * var(--s));
  white-space: nowrap;
  line-height: 1;
  position: absolute;
  font-family: var(--mono);
}

.block-one__spec span {
  min-height: calc(8 * var(--s));
  display: block;
}

.block-one__round,
.block-one__square {
  left: calc(341 * var(--s));
  width: calc(68 * var(--s));
  height: calc(68 * var(--s));
  contain: paint;
  position: absolute;
}

.block-one__round {
  top: 0;
  background: var(--color-plate);
  border-radius: 50%;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
}

.block-one__round .face {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.face__disc {
  fill: var(--color-plate);
}

.face__ticks path {
  stroke: var(--color-mark);
  stroke-width: 1.5px;
}

.face__ball {
  fill: var(--color-hand);
}

.block-one__square {
  top: calc(70 * var(--s));
  background: var(--color-note);
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
}

.square-telemetry {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  text-align: center;
}

.sq-badge {
  font-family: var(--mono);
  font-size: calc(7 * var(--s));
  font-weight: 700;
  letter-spacing: 0.05em;
  color: var(--color-mark);
}

.sq-val {
  font-family: var(--mono);
  font-size: calc(14 * var(--s));
  font-weight: 800;
  color: var(--color-plate-ink);
}

.sq-status {
  font-family: var(--mono);
  font-size: calc(6.5 * var(--s));
  font-weight: 700;
  color: var(--p-forest, #444F24);
}

/* =========================================================================
   02 BLOCK TWO: HORIZONTAL EQUITIES REEL BUS
   ========================================================================= */
.wide {
  left: calc(198 * var(--s));
  top: calc(868 * var(--s));
  width: calc(1045 * var(--s));
  height: calc(448 * var(--s));
  background: var(--color-plate);
  color: var(--color-plate-ink);
  z-index: var(--layer-content);
  position: absolute;
  box-shadow: 0 6px 30px rgba(0, 0, 0, 0.08);
}

.wide__photo {
  width: calc(355 * var(--s));
  height: calc(448 * var(--s));
  position: absolute;
  top: 0;
  left: 0;
  overflow: hidden;
  background: #181818;
}

.wide__photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.wide p,
.wide h2 {
  white-space: nowrap;
  margin: 0;
  font-weight: 400;
  position: absolute;
}

.wide__index {
  left: calc(367 * var(--s));
  top: calc(221 * var(--s));
  font-size: calc(8 * var(--s));
  line-height: calc(12 * var(--s));
  font-family: var(--mono);
  font-weight: 700 !important;
}

.wide__kicker {
  left: calc(496 * var(--s));
  top: calc(211 * var(--s));
  font-size: calc(8 * var(--s));
  line-height: calc(12 * var(--s));
  color: var(--color-mark);
  font-family: var(--mono);
}

.wide__title {
  left: calc(496 * var(--s));
  top: calc(219 * var(--s));
  font-size: calc(13 * var(--s));
  line-height: calc(18 * var(--s));
  font-weight: 700 !important;
}

.wide__reel {
  left: calc(690 * var(--s));
  width: calc(348 * var(--s));
  height: calc(448 * var(--s));
  position: absolute;
  top: 0;
  overflow: hidden;
}

.wide__reel-in {
  display: flex;
  flex-direction: column;
  animation: reel-scroll 18s linear infinite;
}

.wide__reel-in span {
  font-size: calc(34 * var(--s));
  font-weight: 800;
  letter-spacing: calc(-1 * var(--s));
  line-height: 1.15;
  white-space: nowrap;
  color: var(--color-plate-ink);
}

@keyframes reel-scroll {
  0% { transform: translateY(0); }
  100% { transform: translateY(-50%); }
}

/* =========================================================================
   TAG & SIDE CARDS (NOTCHED CORNERS)
   ========================================================================= */
.tag {
  left: calc(20 * var(--s));
  top: calc(1013 * var(--s));
  width: calc(171 * var(--s));
  height: calc(122 * var(--s));
  background: var(--color-plate);
  color: var(--color-plate-ink);
  isolation: isolate;
  overflow: hidden;
  position: absolute;
  z-index: var(--layer-content);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
}

.tag__cut,
.side__cut {
  left: calc(var(--x) * var(--s));
  top: calc(var(--y) * var(--s));
  width: calc(var(--w) * var(--s));
  height: calc(var(--h) * var(--s));
  position: absolute;
  background: var(--color-bg);
  overflow: hidden;
}

.tag p {
  white-space: nowrap;
  margin: 0;
  font-weight: 400;
  position: absolute;
}

.tag__kicker {
  left: calc(70 * var(--s));
  top: calc(2 * var(--s));
  font-size: calc(8 * var(--s));
  line-height: calc(12 * var(--s));
  font-family: var(--mono);
}

.tag__word {
  left: 50%;
  top: calc(47 * var(--s));
  font-size: calc(42 * var(--s));
  font-weight: 900;
  font-family: var(--mono);
  letter-spacing: calc(-1.35 * var(--s));
  text-align: center;
  line-height: 0.9;
  transform: translate(-50%);
}

.side {
  left: calc(1249 * var(--s));
  top: calc(1013 * var(--s));
  width: calc(171 * var(--s));
  height: calc(122 * var(--s));
  background: var(--color-plate);
  color: var(--color-plate-ink);
  isolation: isolate;
  overflow: hidden;
  position: absolute;
  z-index: var(--layer-content);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
}

.side p {
  white-space: nowrap;
  transform-origin: 50%;
  margin: 0;
  font-weight: 400;
  position: absolute;
}

.side__title,
.side__kicker,
.side__index {
  justify-content: center;
  align-items: center;
  display: flex;
}

.side__title span,
.side__kicker span,
.side__index span {
  line-height: 1;
  transform: rotate(-90deg);
}

.side__title {
  left: calc(31 * var(--s));
  top: calc(30 * var(--s));
  width: calc(18 * var(--s));
  height: calc(55 * var(--s));
  font-size: calc(12 * var(--s));
  font-weight: 700 !important;
}

.side__kicker {
  left: calc(23 * var(--s));
  top: calc(54 * var(--s));
  width: calc(12 * var(--s));
  height: calc(31 * var(--s));
  font-size: calc(8 * var(--s));
  color: var(--color-mark);
  font-family: var(--mono);
}

.side__index {
  left: calc(33 * var(--s));
  top: calc(110 * var(--s));
  width: calc(12 * var(--s));
  height: calc(5 * var(--s));
  font-size: calc(8 * var(--s));
  font-family: var(--mono);
}

/* =========================================================================
   03 CLOCK SECTION: 513px POLAR DIAL (ORACLE FRESHNESS BOUND)
   ========================================================================= */
.clock-section {
  left: 0;
  top: calc(1554 * var(--s));
  width: 100%;
  z-index: var(--layer-content);
  height: calc(513 * var(--s));
  position: absolute;
}

.clock {
  --dial-centre: 256.5;
  --ring-radius: 220.2;
  width: calc(513 * var(--s));
  height: calc(513 * var(--s));
  position: absolute;
  top: 0;
  left: 50%;
  transform: translate(-50%);
}

.clock__bg {
  background: var(--color-dial);
  border-radius: 50%;
  position: absolute;
  inset: 0;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.12);
}

.clock__mark {
  --angle: calc(var(--i) * 30deg);
  left: calc((var(--dial-centre) + var(--ring-radius) * cos(var(--angle))) * var(--s));
  top: calc((var(--dial-centre) + var(--ring-radius) * sin(var(--angle))) * var(--s));
  width: calc(60 * var(--s));
  height: calc(11 * var(--s));
  font-size: calc(11 * var(--s));
  text-align: right;
  white-space: nowrap;
  color: var(--color-mark);
  transform: translate(-50%, -50%) rotate(var(--angle));
  margin: 0;
  line-height: 0.9;
  position: absolute;
  font-family: var(--mono);
  transition: color 0.2s ease;
}

.clock__mark.is-active {
  color: var(--color-mark-active);
  font-weight: 700;
}

.clock__hand {
  left: calc(255 * var(--s));
  top: calc(247 * var(--s));
  width: calc(197 * var(--s));
  height: calc(19 * var(--s));
  transform-origin: 0 50%;
  color: var(--color-hand);
  position: absolute;
  transform: rotate(var(--clock-hand-deg, 0deg));
  transition: transform 0.1s linear;
  will-change: transform;
}

.clock__hand-near,
.clock__hand-far {
  white-space: nowrap;
  line-height: 1.5;
  position: absolute;
  font-family: var(--mono);
}

.clock__hand-near {
  left: 0;
  top: calc(2 * var(--s));
  font-size: calc(8 * var(--s));
}

.clock__hand-far {
  left: calc(165 * var(--s));
  font-size: calc(12 * var(--s));
  top: 0;
  font-weight: 700;
}

.clock__hand-rule {
  left: 0;
  top: calc(18 * var(--s));
  width: calc(196 * var(--s));
  background: currentColor;
  height: 1.5px;
  position: absolute;
}

/* =========================================================================
   04 THE SEVEN SECTION: 7 FOUNDATIONAL DIMENSIONS OF EQUITY COLLATERAL
   ========================================================================= */
.seven {
  left: 0;
  top: var(--group-top, calc(2160 * var(--s)));
  width: 100%;
  height: calc(2646 * var(--s));
  z-index: var(--layer-content);
  position: absolute;
}

/* 4.1 Upright card with turned typography */
.v-card {
  width: 100%;
  height: calc(426 * var(--s));
  top: 0;
  left: 0;
  position: absolute;
}

.v-card__plate {
  left: calc(552 * var(--s));
  width: calc(335 * var(--s));
  height: calc(426 * var(--s));
  background: var(--color-plate);
  color: var(--color-plate-ink);
  position: absolute;
  top: 0;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
  overflow: hidden;
}

.v-card .v-turn {
  position: absolute;
  left: calc(var(--x) * var(--s));
  top: calc(var(--y) * var(--s));
  width: calc(var(--w) * var(--s));
  height: calc(var(--h) * var(--s));
  font-size: calc(var(--size) * var(--s));
  font-family: var(--mono);
  margin: 0;
}

.v-turn span {
  display: block;
  transform: rotate(-90deg);
  transform-origin: 0 0;
}

.v-turn.is-muted {
  color: var(--color-mark);
}

.v-card__no,
.v-card__shout {
  left: calc(560 * var(--s));
  font-size: calc(42 * var(--s));
  letter-spacing: calc(-1.26 * var(--s));
  color: var(--color-plate-ink);
  white-space: nowrap;
  line-height: 0.9;
  position: absolute;
  font-weight: 800;
}

.v-card__no {
  top: calc(172 * var(--s));
}

.v-card__shout {
  top: calc(223 * var(--s));
}

.v-card__shout span {
  min-height: calc(38 * var(--s));
  display: block;
}

/* 4.2 Segmented Chip Tile */
.tile {
  left: calc(20 * var(--s));
  top: calc(432 * var(--s));
  width: calc(158 * var(--s));
  height: calc(158 * var(--s));
  position: absolute;
}

.tile__disc {
  width: 100%;
  height: 100%;
  position: absolute;
  inset: 0;
}

/* 4.3 Concentration Cap Bar */
.bar {
  left: calc(183 * var(--s));
  top: calc(432 * var(--s));
  width: calc(534 * var(--s));
  height: calc(158 * var(--s));
  position: absolute;
}

.bar__plate {
  background: var(--color-plate);
  position: absolute;
  inset: 0;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
}

.bar p,
.bar h2 {
  margin: 0;
  font-weight: 400;
  position: absolute;
  white-space: nowrap;
}

.bar__index {
  left: calc(20 * var(--s));
  top: calc(76 * var(--s));
  font-size: calc(8 * var(--s));
  line-height: calc(12 * var(--s));
  font-family: var(--mono);
  font-weight: 700;
}

.bar__kicker {
  left: calc(163 * var(--s));
  top: calc(66 * var(--s));
  font-size: calc(8 * var(--s));
  line-height: calc(12 * var(--s));
  color: var(--color-mark);
  font-family: var(--mono);
}

.bar__title {
  left: calc(163 * var(--s));
  top: calc(74 * var(--s));
  font-size: calc(12 * var(--s));
  line-height: calc(18 * var(--s));
  font-weight: 700;
}

.bar__body {
  left: calc(163 * var(--s));
  top: calc(101 * var(--s));
  width: calc(359 * var(--s));
  font-size: calc(12 * var(--s));
  color: var(--color-mark);
  line-height: 1.3;
  white-space: normal !important;
}

/* 4.4 Dynamic LTV Pill */
.pill {
  left: calc(724 * var(--s));
  top: calc(432 * var(--s));
  width: calc(696 * var(--s));
  height: calc(158 * var(--s));
  position: absolute;
}

.pill__plate {
  background: var(--color-plate);
  border-radius: calc(79 * var(--s));
  position: absolute;
  inset: 0;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
}

.pill p,
.pill h2 {
  margin: 0;
  font-weight: 400;
  position: absolute;
  white-space: nowrap;
}

.pill__index {
  left: calc(20 * var(--s));
  top: calc(76 * var(--s));
  font-size: calc(8 * var(--s));
  line-height: calc(12 * var(--s));
  font-family: var(--mono);
  font-weight: 700;
}

.pill__kicker {
  left: calc(237 * var(--s));
  top: calc(66 * var(--s));
  font-size: calc(8 * var(--s));
  line-height: calc(12 * var(--s));
  color: var(--color-mark);
  font-family: var(--mono);
}

.pill__title {
  left: calc(237 * var(--s));
  top: calc(74 * var(--s));
  font-size: calc(12 * var(--s));
  line-height: calc(18 * var(--s));
  font-weight: 700;
}

.pill__body {
  left: calc(237 * var(--s));
  top: calc(101 * var(--s));
  width: calc(396 * var(--s));
  font-size: calc(12 * var(--s));
  color: var(--color-mark);
  line-height: 1.3;
  white-space: normal !important;
}

/* 4.5 697px Dual Circular Dials */
.dial {
  --dial-r: 348.5;
  --hour-r: 326;
  left: calc(20 * var(--s));
  top: calc(596 * var(--s));
  width: calc(697 * var(--s));
  height: calc(697 * var(--s));
  color: var(--color-plate-ink);
  position: absolute;
}

.dial__rim {
  width: 100%;
  height: 100%;
  position: absolute;
  inset: 0;
  transition: transform 0.1s linear;
  will-change: transform;
}

.dial__hour {
  --angle: calc((var(--i) - 3) * 30deg);
  left: calc((var(--dial-r) + var(--hour-r) * cos(var(--angle))) * var(--s));
  top: calc((var(--dial-r) + var(--hour-r) * sin(var(--angle))) * var(--s));
  font-size: calc(12 * var(--s));
  white-space: nowrap;
  transform: translate(-50%, -50%) rotate(calc(var(--angle) + 90deg));
  margin: 0;
  line-height: 0.9;
  position: absolute;
  font-family: var(--mono);
}

.dial__kicker,
.dial__title {
  left: calc(348.5 * var(--s));
  white-space: nowrap;
  margin: 0;
  font-weight: 400;
  position: absolute;
  transform: translate(-50%);
}

.dial__kicker {
  top: calc(333 * var(--s));
  font-size: calc(8 * var(--s));
  color: var(--color-mark);
  font-family: var(--mono);
}

.dial__title {
  top: calc(339.6 * var(--s));
  font-size: calc(12 * var(--s));
  font-weight: 700;
}

/* 4.6 Giant Rotating Side A Disc */
.side-a {
  left: calc(723 * var(--s));
  top: calc(596 * var(--s));
  width: calc(697 * var(--s));
  height: calc(697 * var(--s));
  position: absolute;
}

.side-a__ring {
  width: 100%;
  height: 100%;
  position: absolute;
  inset: 0;
  transition: transform 0.1s linear;
  will-change: transform;
}

.side-a__core {
  left: calc(226 * var(--s));
  top: calc(226 * var(--s));
  width: calc(245 * var(--s));
  height: calc(245 * var(--s));
  backdrop-filter: blur(calc(12 * var(--s)));
  box-shadow: 0 0 calc(4 * var(--s)) rgba(0, 0, 0, 0.25);
  background: rgba(209, 209, 209, 0.2);
  border-radius: 50%;
  position: absolute;
  mask-image: radial-gradient(circle closest-side, transparent 16.1%, #000 16.5%);
  transition: transform 0.1s linear;
  will-change: transform;
}

.side-a__spin {
  position: absolute;
  inset: 0;
}

.side-a__shout {
  left: calc(349.5 * var(--s));
  top: calc(59 * var(--s));
  font-size: calc(42 * var(--s));
  letter-spacing: calc(-1.26 * var(--s));
  text-align: center;
  text-transform: uppercase;
  white-space: nowrap;
  color: var(--color-plate-ink);
  line-height: 0.9;
  position: absolute;
  transform: translate(-50%);
  font-weight: 800;
}

.side-a p,
.side-a h2 {
  white-space: nowrap;
  color: var(--color-plate-ink);
  margin: 0;
  font-weight: 400;
  position: absolute;
}

.side-a__index {
  left: calc(34 * var(--s));
  top: calc(346 * var(--s));
  font-size: calc(8 * var(--s));
  font-family: var(--mono);
}

.side-a p.side-a__kicker {
  left: calc(163 * var(--s));
  top: calc(336 * var(--s));
  font-size: calc(8 * var(--s));
  color: var(--color-mark);
  font-family: var(--mono);
}

.side-a__title {
  left: calc(163 * var(--s));
  top: calc(344 * var(--s));
  font-size: calc(12 * var(--s));
  font-weight: 700;
}

/* 4.7 Directional Execution Conduit (.tri) */
.tri {
  left: calc(368 * var(--s));
  top: calc(1299 * var(--s));
  width: calc(704.001 * var(--s));
  height: calc(608.664 * var(--s));
  color: var(--color-plate-ink);
  position: absolute;
}

.tri__outline {
  width: 100%;
  height: 100%;
  position: absolute;
  inset: 0;
}

.tri__conduit-pulse {
  stroke-dasharray: 8 4;
  animation: pulse-down 2s linear infinite;
}

@keyframes pulse-down {
  0% { stroke-dashoffset: 24; }
  100% { stroke-dashoffset: 0; }
}

.tri p,
.tri h2 {
  white-space: nowrap;
  margin: 0;
  font-weight: 400;
  position: absolute;
}

.tri__title {
  left: calc(352 * var(--s));
  top: calc(18 * var(--s));
  font-size: calc(42 * var(--s));
  letter-spacing: calc(-1.26 * var(--s));
  text-transform: uppercase;
  line-height: 0.9;
  transform: translate(-50%);
  font-weight: 800;
}

.tri__lead {
  left: calc(46 * var(--s));
  top: calc(86 * var(--s));
  font-size: calc(12 * var(--s));
  line-height: 1.4;
  font-family: var(--mono);
}

.tri__lead--turned {
  left: calc(342 * var(--s));
  top: calc(101 * var(--s));
  width: calc(18 * var(--s));
  height: calc(428 * var(--s));
  display: flex;
  align-items: center;
  justify-content: center;
}

.tri__lead--turned span {
  transform: rotate(90deg);
  font-family: var(--mono);
  font-size: calc(10 * var(--s));
  font-weight: 700;
  letter-spacing: 0.08em;
}

.tri__index {
  left: calc(349 * var(--s));
  top: calc(582 * var(--s));
  font-size: calc(8 * var(--s));
  font-family: var(--mono);
}

.tri__stud {
  top: calc(24 * var(--s));
  width: calc(33 * var(--s));
  height: calc(33 * var(--s));
  position: absolute;
}

.tri__stud--a {
  left: calc(29 * var(--s));
}

.tri__stud--b {
  left: calc(642 * var(--s));
}

/* 4.8 Isolated Vault Aperture (.special) */
.special {
  left: calc(368 * var(--s));
  top: calc(1914 * var(--s));
  width: calc(705 * var(--s));
  height: calc(327 * var(--s));
  position: absolute;
}

.special__plate {
  width: calc(353 * var(--s));
  height: calc(327 * var(--s));
  background: var(--color-plate);
  position: absolute;
  top: 0;
  left: 0;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
  padding: calc(24 * var(--s));
}

.special__photo {
  width: calc(353 * var(--s));
  height: calc(327 * var(--s));
  position: absolute;
  top: 0;
  right: 0;
  overflow: hidden;
  background: #111;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.special p,
.special h2 {
  white-space: nowrap;
  margin: 0;
  font-weight: 400;
}

.special__index {
  font-size: calc(8 * var(--s));
  line-height: calc(12 * var(--s));
  font-family: var(--mono);
  font-weight: 700;
}

.special__kicker {
  font-size: calc(8 * var(--s));
  color: var(--color-mark);
  font-family: var(--mono);
  margin-top: calc(6 * var(--s));
}

.special__title {
  font-size: calc(16 * var(--s));
  font-weight: 800;
  margin-top: calc(4 * var(--s));
}

.special__spec {
  margin-top: calc(24 * var(--s));
  font-size: calc(9 * var(--s));
  font-family: var(--mono);
  display: flex;
  flex-direction: column;
  gap: calc(4 * var(--s));
  color: var(--color-mark);
}

/* =========================================================================
   05 DECK: TRANSITION DECK CARD
   ========================================================================= */
.deck {
  left: 50%;
  top: var(--deck-top, calc(4860 * var(--s)));
  width: calc(335 * var(--s));
  height: calc(426 * var(--s));
  margin-left: calc(-167.5 * var(--s));
  background: var(--color-plate);
  color: var(--color-plate-ink);
  z-index: var(--layer-content);
  position: absolute;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
}

/* =========================================================================
   06 FAN: RADIAL SOLVENCY DECK (DYNAMIC SCROLL UNFURL)
   ========================================================================= */
.fan {
  left: 50%;
  top: var(--fan-top, calc(5340 * var(--s)));
  width: calc(706 * var(--s));
  height: calc(697 * var(--s));
  margin-left: calc(-353 * var(--s));
  color: var(--color-plate-ink);
  z-index: var(--layer-content);
  position: absolute;
}

.fan__disc,
.fan__rim {
  left: calc(9 * var(--s));
  width: calc(697 * var(--s));
  height: calc(697 * var(--s));
  position: absolute;
  top: 0;
}

.fan__deck {
  left: calc(357.5 * var(--s));
  top: calc(348.5 * var(--s));
  width: 0;
  height: 0;
  position: absolute;
}

.fan__card {
  left: calc(-30.5 * var(--s));
  top: calc(-30.5 * var(--s));
  width: calc(246 * var(--s));
  height: calc(234 * var(--s));
  transform-origin: calc(30.5 * var(--s)) calc(30.5 * var(--s));
  transform: rotate(calc((var(--base) * 35deg) + (var(--carry, 2) * var(--open, 0) * 45deg)));
  transition: transform 0.12s linear;
  will-change: transform;
  position: absolute;
  background: var(--color-plate);
  border: 1px solid rgba(0, 0, 0, 0.12);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.1);
  padding: calc(16 * var(--s));
  border-radius: 4px;
}

.fan-card-inner {
  display: flex;
  flex-direction: column;
  gap: calc(4 * var(--s));
}

.fci-kicker {
  font-family: var(--mono);
  font-size: calc(7.5 * var(--s));
  font-weight: 700;
  color: var(--color-mark);
}

.fci-title {
  font-size: calc(11 * var(--s));
  font-weight: 800;
  color: var(--color-plate-ink);
}

.fci-desc {
  font-family: var(--mono);
  font-size: calc(8 * var(--s));
  line-height: 1.35;
  color: var(--color-mark);
  margin-top: calc(4 * var(--s));
}

.fan__glass {
  left: calc(300 * var(--s));
  top: calc(291 * var(--s));
  width: calc(115 * var(--s));
  height: calc(115 * var(--s));
  backdrop-filter: blur(calc(12 * var(--s)));
  box-shadow: 0 0 calc(4 * var(--s)) rgba(0, 0, 0, 0.25);
  background: rgba(209, 209, 209, 0.2);
  border-radius: 50%;
  position: absolute;
  pointer-events: none;
}

.fan p,
.fan h2 {
  white-space: nowrap;
  margin: 0;
  font-weight: 400;
  position: absolute;
}

.fan__index {
  left: calc(23 * var(--s));
  top: calc(346 * var(--s));
  font-size: calc(8 * var(--s));
  font-family: var(--mono);
}

.fan p.fan__kicker {
  left: calc(661 * var(--s));
  top: calc(336 * var(--s));
  font-size: calc(8 * var(--s));
  color: var(--color-mark);
  font-family: var(--mono);
}

.fan__title {
  left: calc(661 * var(--s));
  top: calc(344 * var(--s));
  font-size: calc(12 * var(--s));
  font-weight: 700;
}

/* =========================================================================
   07 WIN: DUAL ORACLE & AMM WINDOWS (TURNING DISC BEHIND PLATE)
   ========================================================================= */
.win {
  left: 0;
  top: var(--win-top-at, calc(6080 * var(--s)));
  width: 100%;
  height: calc(697 * var(--s));
  color: var(--color-plate-ink);
  z-index: var(--layer-content);
  position: absolute;
  overflow: hidden;
}

.win__plate {
  left: 50%;
  top: calc(124 * var(--s));
  width: calc(1045 * var(--s));
  height: calc(448 * var(--s));
  margin-left: calc(-522.5 * var(--s));
  background: var(--color-plate);
  position: absolute;
  box-shadow: 0 6px 30px rgba(0, 0, 0, 0.08);
}

.win__disc {
  left: 50%;
  top: 50%;
  width: calc(697 * var(--s));
  height: calc(697 * var(--s));
  margin-left: calc(-348.5 * var(--s));
  margin-top: calc(-348.5 * var(--s));
  position: absolute;
  transform: rotate(var(--win-turn, 0deg));
  transition: transform 0.1s linear;
  will-change: transform;
}

.win__face {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: calc(3 * var(--s)) solid var(--color-mark);
  position: absolute;
  top: 0;
  left: 0;
}

.win__arc {
  position: absolute;
  top: 50%;
  left: 50%;
  transform-origin: 0 0;
  transform: rotate(calc(var(--q) * 90deg));
  color: var(--color-plate-ink);
  font-family: var(--mono);
  font-size: calc(9 * var(--s));
}

.win__shot {
  position: absolute;
  top: calc(40 * var(--s));
  width: calc(294 * var(--s));
  height: calc(368 * var(--s));
  background: var(--color-plate-ink);
  color: var(--color-plate);
  z-index: 2;
  overflow: hidden;
  padding: calc(20 * var(--s));
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.win__shot--left {
  left: calc(40 * var(--s));
}

.win__shot--right {
  right: calc(40 * var(--s));
}

/* =========================================================================
   08 VEE: DUAL REPAIR SHIELD & CENTER TRIANGLE
   ========================================================================= */
.vee {
  left: 50%;
  top: var(--vee-top, calc(6820 * var(--s)));
  width: calc(var(--content-width) * var(--s));
  height: calc(840.664 * var(--s));
  margin-left: calc(var(--content-width) / -2 * var(--s));
  z-index: var(--layer-content);
  position: absolute;
}

.vee__card {
  width: calc(697 * var(--s));
  height: calc(226 * var(--s));
  position: absolute;
  top: 0;
  overflow: hidden;
  background: var(--color-plate);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
  padding: calc(24 * var(--s));
}

.vee__card--west {
  left: 0;
}

.vee__card--east {
  right: 0;
}

.vee__title {
  font-size: calc(13 * var(--s));
  font-weight: 700;
  margin: 0 0 calc(8 * var(--s));
  color: var(--color-plate-ink);
}

.vee__body {
  font-size: calc(10 * var(--s));
  line-height: 1.4;
  color: var(--color-mark);
  font-family: var(--mono);
  margin: 0;
}

.vee__plate {
  left: 50%;
  top: calc(240 * var(--s));
  transform: translateX(-50%);
  width: calc(704 * var(--s));
  height: calc(560 * var(--s));
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* =========================================================================
   09 GAUGE: DUAL SWEEPING PROTOCOL SPEEDOMETERS
   ========================================================================= */
.gauge {
  left: 0;
  top: var(--gauge-top, calc(7780 * var(--s)));
  width: 100%;
  height: calc(2050 * var(--s));
  z-index: var(--layer-content);
  color: var(--color-plate-ink);
  position: absolute;
  overflow: hidden;
}

.gauge__dial {
  top: calc(1000 * var(--s));
  width: 0;
  height: 0;
  position: absolute;
}

.gauge__dial--left {
  --face: 0deg;
  --hand: 1;
  left: calc(100 * var(--s));
}

.gauge__dial--right {
  --face: 180deg;
  --hand: -1;
  right: calc(100 * var(--s));
}

.gauge__ring {
  border-style: solid;
  border-radius: 50%;
  position: absolute;
  top: 0;
  left: 0;
  transform: translate(-50%, -50%);
}

.gauge__ring--white {
  width: calc(700 * 2 * var(--s));
  height: calc(700 * 2 * var(--s));
  border-width: calc(10 * var(--s));
  border-color: var(--color-plate);
}

.gauge__ring--black {
  width: calc(445 * 2 * var(--s));
  height: calc(445 * 2 * var(--s));
  border-width: calc(1 * var(--s));
  border-color: var(--color-mark);
}

.gauge__ring--glass {
  width: calc(115 * 2 * var(--s));
  height: calc(115 * 2 * var(--s));
  backdrop-filter: blur(calc(12 * var(--s)));
  background: rgba(209, 209, 209, 0.2);
  border: 0;
}

.gauge__needle {
  width: calc(329 * var(--s));
  height: 2.5px;
  background: var(--p-harvest, #AD8820);
  transform-origin: 0 50%;
  position: absolute;
  top: 0;
  left: 0;
  transition: transform 0.08s linear;
  will-change: transform;
}

.gauge__words {
  position: absolute;
  top: 0;
  left: 0;
}

.gauge__word {
  white-space: nowrap;
  font-family: var(--mono);
  font-size: calc(12 * var(--s));
  color: var(--color-mark);
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
  transition: color 0.2s ease, font-size 0.2s ease;
}

.gauge__word.is-read {
  color: var(--p-forest, #444F24) !important;
  font-weight: 800;
  font-size: calc(14 * var(--s));
}

.gauge__dial--left .gauge__word {
  transform: rotate(calc(var(--a) * 1deg)) translateX(calc(455 * var(--s))) translateY(-50%);
}

.gauge__dial--right .gauge__word {
  transform: rotate(calc(180deg - var(--a) * 1deg)) translateX(calc(455 * var(--s))) rotate(180deg) translateX(-100%) translateY(-50%);
}

.gauge__header {
  left: 50%;
  top: calc(120 * var(--s));
  transform: translateX(-50%);
  text-align: center;
  position: absolute;
}

.gauge__header h2 {
  font-size: calc(36 * var(--s));
  font-weight: 800;
  letter-spacing: calc(-1 * var(--s));
  color: var(--color-plate-ink);
  margin: 0;
}

.gauge__header p {
  font-family: var(--mono);
  font-size: calc(10 * var(--s));
  color: var(--color-mark);
  margin: calc(6 * var(--s)) 0 0;
}

/* =========================================================================
   10 POSTER: PROTOCOL MANIFESTO & ROLLING SPHERE
   ========================================================================= */
.poster {
  left: 50%;
  top: var(--poster-top, calc(9880 * var(--s)));
  width: calc(var(--content-width) * var(--s));
  height: calc(1617 * var(--s));
  margin-left: calc(var(--content-width) / -2 * var(--s));
  z-index: var(--layer-content);
  color: var(--color-plate-ink);
  position: absolute;
}

.poster__say {
  font-size: calc(84 * var(--s));
  letter-spacing: calc(-2.5 * var(--s));
  font-weight: 900;
  line-height: 0.92;
  text-transform: uppercase;
  margin: 0;
  position: relative;
}

.poster-roll-sphere {
  position: absolute;
  top: calc(40 * var(--s));
  left: calc(var(--roll-x, 0px));
  width: calc(180 * var(--s));
  height: calc(180 * var(--s));
  background: var(--color-plate);
  border-radius: 50%;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
  pointer-events: none;
  z-index: 2;
  mix-blend-mode: difference;
  transition: left 0.1s linear;
  will-change: left;
}

.poster__tell {
  font-size: calc(38 * var(--s));
  letter-spacing: calc(-1.2 * var(--s));
  font-weight: 800;
  line-height: 0.9;
  text-transform: uppercase;
  margin: calc(24 * var(--s)) 0 0;
  color: var(--color-mark);
}

.poster__shot {
  left: 0;
  top: calc(400 * var(--s));
  width: calc(690 * var(--s));
  height: calc(834 * var(--s));
  position: absolute;
  overflow: hidden;
  background: var(--color-plate-ink);
  color: var(--color-plate);
  padding: calc(32 * var(--s));
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.15);
}

.poster__spec-rail {
  left: calc(740 * var(--s));
  top: calc(400 * var(--s));
  width: calc(660 * var(--s));
  position: absolute;
  display: flex;
  flex-direction: column;
  gap: calc(20 * var(--s));
}

/* =========================================================================
   11 FIELD: COORDINATE CROSSHAIRS
   ========================================================================= */
.field {
  left: 50%;
  top: var(--field-top, calc(11550 * var(--s)));
  width: calc(var(--content-width) * var(--s));
  height: calc(520 * var(--s));
  margin-left: calc(var(--content-width) / -2 * var(--s));
  z-index: var(--layer-content);
  cursor: crosshair;
  position: absolute;
  border: 1px dashed var(--color-mark);
  background: rgba(255, 255, 255, 0.02);
  overflow: hidden;
}

.field__marks {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.field__rule--v {
  position: absolute;
  top: 0;
  left: 50%;
  width: 100%;
  height: 1px;
  border-top: 1px dashed var(--color-mark);
  transform: rotate(90deg);
  transform-origin: 0 0;
}

.field__rule--h {
  position: absolute;
  top: 50%;
  left: 0;
  width: 100%;
  height: 1px;
  border-top: 1px dashed var(--color-mark);
}

.field__call {
  position: absolute;
  top: calc(50% - 24 * var(--s));
  font-size: calc(38 * var(--s));
  font-weight: 900;
  letter-spacing: calc(-1.3 * var(--s));
  line-height: 0.9;
  margin: 0;
  color: var(--color-plate-ink);
  left: 50%;
  transform: translateX(-50%);
  text-align: center;
  white-space: nowrap;
}

/* =========================================================================
   12 FOOTER: MONUMENTAL WORDMARK & METADATA BAR
   ========================================================================= */
.footer {
  left: 50%;
  top: var(--footer-top, calc(12120 * var(--s)));
  width: calc(var(--content-width) * var(--s));
  margin-left: calc(var(--content-width) / -2 * var(--s));
  position: absolute;
  z-index: var(--layer-content);
  height: calc(273 * var(--s));
}

.footer-wordmark {
  width: 100%;
  color: var(--color-plate-ink);
  margin-bottom: calc(24 * var(--s));
}

.footer-meta-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: calc(16 * var(--s));
  border-top: 1px solid rgba(0, 0, 0, 0.1);
  font-family: var(--mono);
  font-size: calc(11 * var(--s));
  color: var(--color-mark);
}

/* =========================================================================
   13 FLOATING TACTICAL ACTIONS BAR
   ========================================================================= */
.format-floating-actions {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--color-plate);
  border: 1px solid rgba(0, 0, 0, 0.15);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25);
  padding: 8px 12px;
  border-radius: 3px;
}
"""

with open('c:/Dev/Circuit/app/src/styles.css', 'r', encoding='utf-8') as f:
    orig = f.read()

# Find cut point in styles.css
cut_idx = orig.find('.format-canvas {')
if cut_idx != -1:
    new_css = orig[:cut_idx] + css_rules
    with open('c:/Dev/Circuit/app/src/styles.css', 'w', encoding='utf-8') as f:
        f.write(new_css)
    print("Successfully replaced .format-canvas in styles.css!")
else:
    print("Could not find .format-canvas cut index!")
