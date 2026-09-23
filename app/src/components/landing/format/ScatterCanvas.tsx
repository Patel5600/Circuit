import React, { useEffect, useRef } from "react";

interface ScatterCanvasProps {
  simpleMode: boolean;
}

interface PhysicsCard {
  id: number;
  typeKey: string;
  el: HTMLElement & { _x?: number; _y?: number };
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  r: number;
  vr: number;
  bounces: number;
  fading: boolean;
  dragging: boolean;
  cleanup?: () => void;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export const ScatterCanvas: React.FC<ScatterCanvasProps> = ({ simpleMode }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const shuffleBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const shuffleBtn = shuffleBtnRef.current;
    if (!root) return;

    root.innerHTML = "";

    let nextId = 1;
    let maxZ = 30;
    const cards: PhysicsCard[] = [];

    // ── THE 10 REAL WORKING COMPONENTS DEFINITIONS ──
    const COMPONENT_TYPES = [
      // 1. Draw with ink
      {
        key: "draw",
        className: "card-draw",
        w: 280,
        h: 190,
        create: (container: HTMLElement) => {
          container.innerHTML = `
            <div class="face">
              <div class="real-card-head">
                <div class="real-card-meta">
                  (Capability)<b>RiskEnvelope</b>
                  <span class="real-card-sub">Single-use Authorization</span>
                </div>
                <span class="real-card-tag">Authorize</span>
              </div>
              <div class="real-stage">
                <canvas width="252" height="110" style="border-radius:4px;background:#f4f4f0;"></canvas>
              </div>
              <div style="font-size:7px;opacity:0.5;font-family:var(--lf-mono);">Action & Venue PDA · Slot TTL</div>
            </div>
          `;
          const cvs = container.querySelector("canvas") as HTMLCanvasElement | null;
          if (!cvs) return undefined;
          const ctx = cvs.getContext("2d");
          if (!ctx) return undefined;

          let t = Math.random() * 100;
          let active = true;
          let drops: Array<{ x: number; y: number; r: number; alpha: number }> = [];

          const anim = () => {
            if (!active) return;
            t += 0.035;
            ctx.fillStyle = "rgba(244, 244, 240, 0.25)";
            ctx.fillRect(0, 0, cvs.width, cvs.height);

            // Autonomous undulating metaballs
            const cx1 = cvs.width * 0.5 + Math.sin(t * 1.2) * (cvs.width * 0.35);
            const cy1 = cvs.height * 0.5 + Math.cos(t * 1.5) * (cvs.height * 0.3);
            const cx2 = cvs.width * 0.5 + Math.cos(t * 0.9) * (cvs.width * 0.3);
            const cy2 = cvs.height * 0.5 + Math.sin(t * 1.1) * (cvs.height * 0.28);

            drops.push({ x: cx1, y: cy1, r: rnd(7, 16), alpha: 0.9 });
            if (drops.length > 28) drops.shift();

            ctx.fillStyle = "#000000";
            drops.forEach(d => {
              d.alpha *= 0.96;
              ctx.beginPath();
              ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
              ctx.fill();
            });

            ctx.beginPath();
            ctx.arc(cx1, cy1, 14, 0, Math.PI * 2);
            ctx.arc(cx2, cy2, 11, 0, Math.PI * 2);
            ctx.fill();

            requestAnimationFrame(anim);
          };
          anim();
          return () => {
            active = false;
          };
        },
      },

      // 2. Dial Field
      {
        key: "dial",
        className: "card-dial",
        w: 260,
        h: 210,
        create: (container: HTMLElement) => {
          let dialsHtml = "";
          for (let i = 0; i < 9; i++) {
            dialsHtml += `
              <div class="dial-mini-item">
                <div class="dial-mini-hand" style="transform: rotate(${i * 40}deg);"></div>
                <div class="dial-mini-dot" style="top:15%;transform:rotate(${i * 40}deg);"></div>
              </div>
            `;
          }
          container.innerHTML = `
            <div class="face">
              <div class="real-card-head">
                <div class="real-card-meta">
                  (Observation)<b>Market State</b>
                  <span class="real-card-sub">Pyth Price & Confidence</span>
                </div>
                <span class="real-card-tag">02 Observe</span>
              </div>
              <div class="real-stage">
                <div class="dial-grid-mini">${dialsHtml}</div>
              </div>
              <div style="font-size:7px;opacity:0.5;font-family:var(--lf-mono);text-align:right;">Validated Telemetry</div>
            </div>
          `;

          const hands = Array.from(container.querySelectorAll(".dial-mini-hand")) as HTMLElement[];
          let deg = 0;
          const timer = setInterval(() => {
            deg = (deg + 12) % 360;
            hands.forEach((h, idx) => {
              h.style.transform = `rotate(${deg + idx * 35}deg)`;
            });
          }, 80);

          return () => clearInterval(timer);
        },
      },

      // 3. Colour reveal
      {
        key: "colour",
        className: "card-colour",
        w: 280,
        h: 180,
        create: (container: HTMLElement) => {
          container.innerHTML = `
            <div class="face">
              <div class="real-card-head">
                <div class="real-card-meta">
                  (Pipeline)<b>The Risk Kernel</b>
                  <span class="real-card-sub">Deterministic Policy Gating</span>
                </div>
                <span class="real-card-tag">03 Pipeline</span>
              </div>
              <div class="real-stage">
                <div class="colour-stage-mini">
                  <div class="colour-art-mini"></div>
                  <div class="colour-mask-mini"></div>
                </div>
              </div>
              <div style="font-size:7px;opacity:0.5;font-family:var(--lf-mono);">Market → Risk → Permission</div>
            </div>
          `;

          const mask = container.querySelector(".colour-mask-mini") as HTMLElement | null;
          let t = 0;
          let active = true;

          const anim = () => {
            if (!active || !mask) return;
            t += 0.03;
            const mx = 50 + Math.sin(t * 1.3) * 30;
            const my = 50 + Math.cos(t * 1.1) * 25;
            const rad = 32 + Math.sin(t * 2) * 16;
            mask.style.setProperty("--mx", `${mx.toFixed(1)}%`);
            mask.style.setProperty("--my", `${my.toFixed(1)}%`);
            mask.style.setProperty("--rad", `${rad.toFixed(1)}px`);
            requestAnimationFrame(anim);
          };
          anim();
          return () => {
            active = false;
          };
        },
      },

      // 4. Inertia ribbon
      {
        key: "ribbon",
        className: "card-ribbon",
        w: 310,
        h: 180,
        create: (container: HTMLElement) => {
          const shapes = ["Credit", "Agents", "Meteora", "Envelope", "Pyth", "Ratchet", "Solana", "Policy"];
          const itemsHtml = shapes
            .map(
              (s, i) => `
            <div class="ribbon-item-mini ${i % 2 === 0 ? "light" : ""}">
              <span>0${i + 1}</span>
              <strong>${s}</strong>
            </div>
          `
            )
            .join("");

          container.innerHTML = `
            <div class="face" style="background:#111;color:#fff;">
              <div class="real-card-head">
                <div class="real-card-meta">
                  <span style="color:#aaa;">(Surfaces)</span><b style="color:#fff;">Execution Surfaces</b>
                  <span class="real-card-sub" style="color:#888;">Credit · Agents · Meteora DBC</span>
                </div>
                <span class="real-card-tag" style="border-color:rgba(255,255,255,0.4);">04 Surfaces</span>
              </div>
              <div class="real-stage" style="justify-content:flex-start;overflow:hidden;">
                <div class="ribbon-track-mini">${itemsHtml}${itemsHtml}</div>
              </div>
              <div style="font-size:7px;opacity:0.5;font-family:var(--lf-mono);color:#aaa;">Modular execution · Enforced authority</div>
            </div>
          `;

          const track = container.querySelector(".ribbon-track-mini") as HTMLElement | null;
          let x = 0;
          let active = true;

          const anim = () => {
            if (!active || !track) return;
            x = (x - 0.7) % 432;
            track.style.transform = `translate3d(${x}px, 0, 0)`;
            requestAnimationFrame(anim);
          };
          anim();
          return () => {
            active = false;
          };
        },
      },

      // 5. Scroll morph
      {
        key: "morph",
        className: "card-morph",
        w: 260,
        h: 200,
        create: (container: HTMLElement) => {
          container.innerHTML = `
            <div class="face">
              <div class="real-card-head">
                <div class="real-card-meta">
                  (Stages)<b>5-Stage Pipeline</b>
                  <span class="real-card-sub" id="morph-label">Observe</span>
                </div>
                <span class="real-card-tag">5 Stages</span>
              </div>
              <div class="real-stage">
                <div class="morph-shape-mini" style="width:84px;height:74px;border-radius:50%;">
                  <strong>Observe</strong>
                </div>
              </div>
              <div style="font-size:7px;opacity:0.5;font-family:var(--lf-mono);">Market observation to enforced action</div>
            </div>
          `;

          const shape = container.querySelector(".morph-shape-mini") as HTMLElement | null;
          const label = container.querySelector("#morph-label") as HTMLElement | null;
          const stages = [
            { name: "Observe", w: "84px", h: "74px", rad: "50%" },
            { name: "Evaluate", w: "135px", h: "65px", rad: "32px" },
            { name: "Authorize", w: "75px", h: "115px", rad: "4px" },
            { name: "Execute", w: "145px", h: "75px", rad: "4px" },
            { name: "Recover", w: "210px", h: "115px", rad: "0px" },
          ];

          let idx = 0;
          const timer = setInterval(() => {
            idx = (idx + 1) % stages.length;
            const st = stages[idx];
            if (shape) {
              shape.style.width = st.w;
              shape.style.height = st.h;
              shape.style.borderRadius = st.rad;
              shape.innerHTML = `<strong>${st.name}</strong>`;
            }
            if (label) label.textContent = st.name;
          }, 1400);

          return () => clearInterval(timer);
        },
      },

      // 6. Melting headline
      {
        key: "melt",
        className: "card-melt",
        w: 290,
        h: 180,
        create: (container: HTMLElement) => {
          container.innerHTML = `
            <div class="face" style="background:#000;color:#fff;">
              <div class="real-card-head">
                <div class="real-card-meta">
                  <span style="color:#aaa;">(Authority)</span><b style="color:#fff;">Bounded Agents</b>
                  <span class="real-card-sub" style="color:#888;">Intent → Circuit → Solana</span>
                </div>
                <span class="real-card-tag" style="border-color:rgba(255,255,255,0.4);">06 Bounded</span>
              </div>
              <div class="real-stage">
                <div class="melt-stage-mini">
                  <div class="melt-headline-mini">Bounded</div>
                </div>
              </div>
              <div style="font-size:7px;opacity:0.5;font-family:var(--lf-mono);color:#aaa;">Agents propose · Solana enforces</div>
            </div>
          `;
          return undefined;
        },
      },

      // 7. Kinetic ring
      {
        key: "ring",
        className: "card-ring",
        w: 260,
        h: 210,
        create: (container: HTMLElement) => {
          container.innerHTML = `
            <div class="face">
              <div class="real-card-head">
                <div class="real-card-meta">
                  (Verification)<b>Continuous Verification</b>
                  <span class="real-card-sub">Epoch Synchronization</span>
                </div>
                <span class="real-card-tag">07 Verify</span>
              </div>
              <div class="real-stage">
                <svg class="ring-svg-mini" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <path id="mini-p1-${nextId}" d="M 60,60 m -44,0 a 44,44 0 1,1 88,0 a 44,44 0 1,1 -88,0" />
                    <path id="mini-p2-${nextId}" d="M 60,60 m -26,0 a 26,26 0 1,1 52,0 a 26,26 0 1,1 -52,0" />
                  </defs>
                  <circle cx="60" cy="60" r="44" fill="none" stroke="currentColor" stroke-dasharray="2 3" opacity="0.25" />
                  <circle cx="60" cy="60" r="26" fill="none" stroke="currentColor" stroke-dasharray="2 3" opacity="0.25" />
                  <g class="ring-g-mini-1">
                    <text font-size="6.5" font-family="var(--lf-font)" font-weight="600" fill="currentColor">
                      <textPath href="#mini-p1-${nextId}">CIRCUIT · RISK KERNEL · SOLANA ·</textPath>
                    </text>
                  </g>
                  <g class="ring-g-mini-2">
                    <text font-size="5.5" font-family="var(--lf-font)" font-weight="500" fill="currentColor">
                      <textPath href="#mini-p2-${nextId}">SAFE · RESTRICTED · DEFENSIVE · EMERGENCY ·</textPath>
                    </text>
                  </g>
                </svg>
              </div>
              <div style="font-size:7px;opacity:0.5;font-family:var(--lf-mono);">Counter-rotating orbital paths</div>
            </div>
          `;
          return undefined;
        },
      },

      // 8. Format cursor
      {
        key: "cursor",
        className: "card-cursor",
        w: 280,
        h: 180,
        create: (container: HTMLElement) => {
          container.innerHTML = `
            <div class="face">
              <div class="real-card-head">
                <div class="real-card-meta">
                  (Evaluator)<b>Permission Evaluator</b>
                  <span class="real-card-sub">State & Limit Gating</span>
                </div>
                <span class="real-card-tag">08 Gate</span>
              </div>
              <div class="real-stage">
                <div class="cursor-stage-mini">
                  <div class="cursor-dot-mini" style="left:50%;top:50%;"></div>
                  <div style="position:absolute;left:14px;top:14px;font-size:16px;font-weight:700;color:#000;">Gated / Boundary</div>
                </div>
              </div>
              <div style="font-size:7px;opacity:0.5;font-family:var(--lf-mono);">Mix-blend difference tracking</div>
            </div>
          `;

          const stage = container.querySelector(".cursor-stage-mini") as HTMLElement | null;
          const dot = container.querySelector(".cursor-dot-mini") as HTMLElement | null;
          if (!stage || !dot) return undefined;

          let tracking = false;
          let t = 0;
          let active = true;

          const onMove = (e: MouseEvent) => {
            tracking = true;
            const r = stage.getBoundingClientRect();
            dot.style.left = `${e.clientX - r.left}px`;
            dot.style.top = `${e.clientY - r.top}px`;
          };
          const onLeave = () => {
            tracking = false;
          };

          stage.addEventListener("mousemove", onMove);
          stage.addEventListener("mouseleave", onLeave);

          const anim = () => {
            if (!active) return;
            if (!tracking) {
              t += 0.04;
              const w = stage.clientWidth || 240;
              const h = stage.clientHeight || 90;
              dot.style.left = `${w * 0.5 + Math.sin(t * 1.5) * (w * 0.35)}px`;
              dot.style.top = `${h * 0.5 + Math.cos(t * 1.2) * (h * 0.3)}px`;
            }
            requestAnimationFrame(anim);
          };
          anim();

          return () => {
            active = false;
            stage.removeEventListener("mousemove", onMove);
            stage.removeEventListener("mouseleave", onLeave);
          };
        },
      },

      // 9. Ink lab
      {
        key: "lab",
        className: "card-lab",
        w: 280,
        h: 190,
        create: (container: HTMLElement) => {
          container.innerHTML = `
            <div class="face" style="background:#000;color:#fff;">
              <div class="real-card-head">
                <div class="real-card-meta">
                  <span style="color:#aaa;">(Policy)</span><b style="color:#fff;">Risk Ratchet</b>
                  <span class="real-card-sub" style="color:#888;">Asymmetric Policy Taper</span>
                </div>
                <span class="real-card-tag" style="border-color:rgba(255,255,255,0.4);">09 Ratchet</span>
              </div>
              <div class="real-stage">
                <div class="lab-stage-mini">
                  <div class="lab-noise-mini"></div>
                  <span style="position:relative;z-index:2;font-size:20px;font-weight:700;letter-spacing:-0.03em;">Policy</span>
                </div>
              </div>
              <div style="font-size:7px;opacity:0.5;font-family:var(--lf-mono);color:#aaa;">Fractal turbulence frequency</div>
            </div>
          `;
          return undefined;
        },
      },

      // 10. Monumental footer
      {
        key: "footer",
        className: "card-footer",
        w: 310,
        h: 180,
        create: (container: HTMLElement) => {
          container.innerHTML = `
            <div class="face" style="background:#0c0e17;color:#eceaf7;">
              <div class="real-card-head">
                <div class="real-card-meta">
                  <span style="color:#888;">(Enforcement)</span><b style="color:#fff;">Solana Devnet</b>
                  <span class="real-card-sub" style="color:#aaa;">Devnet Slot Ticker</span>
                </div>
                <span class="real-card-tag" style="border-color:rgba(255,255,255,0.3);color:#8fa2ff;">10 Solana</span>
              </div>
              <div class="real-stage">
                <div class="footer-stage-mini">
                  <div class="footer-wm-mini">CIRCUIT</div>
                  <div class="footer-slot-mini" id="mini-footer-slot">[DEVNET SLOT: 324189000]</div>
                </div>
              </div>
              <div style="font-size:7px;opacity:0.5;font-family:var(--lf-mono);color:#888;">Anchor onchain execution</div>
            </div>
          `;

          const slotEl = container.querySelector("#mini-footer-slot") as HTMLElement | null;
          let currentSlot = 324189010;
          const timer = setInterval(() => {
            currentSlot++;
            if (slotEl) slotEl.textContent = `[DEVNET SLOT: ${currentSlot}]`;
          }, 400);

          return () => clearInterval(timer);
        },
      },
    ];

    // Helper to add a card to physics simulation
    const addCard = (
      typeKey: string,
      initX: number,
      initY: number,
      vx: number,
      vy: number,
      r = 0,
      vr = 0
    ) => {
      const comp = COMPONENT_TYPES.find(c => c.key === typeKey) || COMPONENT_TYPES[0];
      const el = document.createElement("article") as HTMLElement & { _x?: number; _y?: number };
      const id = nextId++;
      el.className = `card real-card ${comp.className}`;
      el.tabIndex = 0;
      el.dataset.id = String(id);
      el.dataset.type = comp.key;
      el.style.zIndex = String(++maxZ);
      el.style.setProperty("--x", `${initX}px`);
      el.style.setProperty("--y", `${initY}px`);
      el.style.setProperty("--r0", `${r}deg`);
      el.setAttribute("aria-label", `${comp.key} live component card. Ping-pong bouncing. Click canvas to drop more.`);

      const cleanup = comp.create(el);
      root.append(el);

      const pCard: PhysicsCard = {
        id,
        typeKey: comp.key,
        el,
        x: initX,
        y: initY,
        vx,
        vy,
        w: comp.w,
        h: comp.h,
        r,
        vr,
        bounces: 0,
        fading: false,
        dragging: false,
        cleanup,
      };
      cards.push(pCard);
      return pCard;
    };

    let boundsW = root.clientWidth || 1400;
    let boundsH = root.clientHeight || 700;

    // ── INITIAL SEED: ALL 10 REAL WORKING COMPONENTS ──
    const seedAll10Components = () => {
      cards.forEach(c => {
        c.cleanup?.();
        c.el.remove();
      });
      cards.length = 0;

      const cw = boundsW;
      const ch = boundsH;

      // Spread initial 10 cards across the canvas space
      const gridCols = 5;
      const gridRows = 2;

      COMPONENT_TYPES.forEach((comp, idx) => {
        const col = idx % gridCols;
        const row = Math.floor(idx / gridCols);

        const slotW = cw / gridCols;
        const slotH = ch / gridRows;

        const x = clamp(col * slotW + rnd(10, Math.max(12, slotW - comp.w - 10)), 0, Math.max(0, cw - comp.w));
        const y = clamp(row * slotH + rnd(10, Math.max(12, slotH - comp.h - 10)), 0, Math.max(0, ch - comp.h));

        // Lively ping-pong velocity
        const angle = rnd(0, Math.PI * 2);
        const speed = rnd(1.8, 3.2);
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        const r = rnd(-8, 8);
        const vr = rnd(-0.35, 0.35);
        addCard(comp.key, x, y, vx, vy, r, vr);
      });
    };

    // ── MAINTAIN MINIMUM 3 CARDS AT ALL TIMES (CANVAS NEVER EMPTY) ──
    const ensureMinimumCards = (minCount = 3) => {
      const activeCards = cards.filter(c => !c.fading && c.el && c.el.isConnected);
      if (activeCards.length < minCount) {
        const needed = minCount - activeCards.length;
        const cw = boundsW;
        const ch = boundsH;

        for (let i = 0; i < needed; i++) {
          const comp = COMPONENT_TYPES[Math.floor(Math.random() * COMPONENT_TYPES.length)];
          const maxX = Math.max(20, cw - comp.w - 20);
          const maxY = Math.max(20, ch - comp.h - 20);
          const sectorX = (i % 3) / 3;
          const sectorY = Math.floor(i / 3) / 2;
          const x = clamp(sectorX * maxX + rnd(20, Math.max(30, maxX / 3)), 20, maxX);
          const y = clamp(sectorY * maxY + rnd(20, Math.max(30, maxY / 2)), 20, maxY);

          const angle = rnd(0, Math.PI * 2);
          const speed = rnd(2.0, 3.5);
          const vx = Math.cos(angle) * speed;
          const vy = Math.sin(angle) * speed;
          const r = rnd(-10, 10);
          const vr = rnd(-0.35, 0.35);

          addCard(comp.key, x, y, vx, vy, r, vr);
        }
      }
    };

    seedAll10Components();
    ensureMinimumCards(3);

    // ── CANVAS CLICK: DROP EXACTLY ONE SINGLE REAL COMPONENT (NO LIMIT) ──
    const onCanvasClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest(".card")) return;

      const rect = root.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      // Exactly ONE single card added per click
      const comp = COMPONENT_TYPES[Math.floor(Math.random() * COMPONENT_TYPES.length)];
      const initX = clamp(clickX - comp.w / 2, 0, Math.max(0, boundsW - comp.w));
      const initY = clamp(clickY - comp.h / 2, 0, Math.max(0, boundsH - comp.h));

      const angle = rnd(0, Math.PI * 2);
      const speed = rnd(2.2, 3.8);
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const r = rnd(-8, 8);
      const vr = rnd(-0.4, 0.4);

      addCard(comp.key, initX, initY, vx, vy, r, vr);
    };
    root.addEventListener("click", onCanvasClick);

    // ── DRAG & THROW PHYSICS ──
    let activeDrag: {
      card: PhysicsCard;
      dx: number;
      dy: number;
      lastX: number;
      lastY: number;
      lastTime: number;
      vx: number;
      vy: number;
    } | null = null;

    const onPointerDown = (e: PointerEvent) => {
      const cardEl = (e.target as HTMLElement).closest(".card") as HTMLElement | null;
      if (!cardEl || !cardEl.dataset.id) return;
      const card = cards.find(c => c.id === Number(cardEl.dataset.id));
      if (!card || card.fading) return;

      cardEl.setPointerCapture(e.pointerId);
      card.dragging = true;
      cardEl.classList.remove("anim");
      cardEl.classList.add("drag");
      cardEl.style.zIndex = String(++maxZ);

      activeDrag = {
        card,
        dx: e.clientX - card.x,
        dy: e.clientY - card.y,
        lastX: e.clientX,
        lastY: e.clientY,
        lastTime: performance.now(),
        vx: 0,
        vy: 0,
      };
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!activeDrag) return;
      const { card, dx, dy } = activeDrag;
      const now = performance.now();
      const dt = Math.max(1, now - activeDrag.lastTime);

      activeDrag.vx = ((e.clientX - activeDrag.lastX) / dt) * 16;
      activeDrag.vy = ((e.clientY - activeDrag.lastY) / dt) * 16;
      activeDrag.lastX = e.clientX;
      activeDrag.lastY = e.clientY;
      activeDrag.lastTime = now;

      card.x = clamp(e.clientX - dx, 0, Math.max(0, boundsW - card.w));
      card.y = clamp(e.clientY - dy, 0, Math.max(0, boundsH - card.h));
      card.el.style.transform = `translate3d(${card.x.toFixed(1)}px, ${card.y.toFixed(1)}px, 0)`;
      card.el.style.setProperty("--x", `${card.x.toFixed(1)}px`);
      card.el.style.setProperty("--y", `${card.y.toFixed(1)}px`);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!activeDrag) return;
      const { card } = activeDrag;
      card.el.classList.remove("drag");
      card.dragging = false;

      // Inherit flick velocity
      card.vx = clamp(activeDrag.vx, -5.5, 5.5);
      card.vy = clamp(activeDrag.vy, -5.5, 5.5);
      if (Math.hypot(card.vx, card.vy) < 1.4) {
        const a = rnd(0, Math.PI * 2);
        card.vx = Math.cos(a) * 2.2;
        card.vy = Math.sin(a) * 2.2;
      }
      activeDrag = null;
    };

    root.addEventListener("pointerdown", onPointerDown, { passive: true });
    root.addEventListener("pointermove", onPointerMove, { passive: true });
    root.addEventListener("pointerup", onPointerUp, { passive: true });
    root.addEventListener("pointercancel", onPointerUp, { passive: true });

    // ── OBSERVERS FOR SEAMLESS 60/120FPS RESPONSIVENESS & OFF-SCREEN SLEEP ──
    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          boundsW = width;
          boundsH = height;
          cards.forEach(c => {
            c.x = clamp(c.x, 0, Math.max(0, boundsW - c.w));
            c.y = clamp(c.y, 0, Math.max(0, boundsH - c.h));
          });
        }
      }
    });
    resizeObserver.observe(root);

    let isVisible = false;
    let lastTime = performance.now();

    const intersectObserver = new IntersectionObserver(
      ([entry]) => {
        const wasVisible = isVisible;
        isVisible = entry.isIntersecting;
        if (!wasVisible && isVisible) {
          lastTime = performance.now();
        }
      },
      { threshold: 0.05 }
    );
    intersectObserver.observe(root);

    // ── CONTINUOUS PING-PONG BALL PHYSICS LOOP (FRAME-RATE INDEPENDENT) ──
    let rafId = 0;
    const physicsLoop = (now: number) => {
      rafId = requestAnimationFrame(physicsLoop);
      if (!isVisible) return;

      const elapsed = now - lastTime;
      lastTime = now;
      // Normalize dt to 60fps standard (16.667ms per frame)
      const dt = Math.min(2.0, Math.max(0.1, elapsed / 16.667));

      for (let i = 0; i < cards.length; i++) {
        const c = cards[i];
        if (!c.el || !c.el.isConnected) {
          cards.splice(i, 1);
          i--;
          continue;
        }
        if (c.fading || c.dragging) continue;

        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.r += c.vr * dt;

        let hit = false;

        // Left wall
        if (c.x <= 0) {
          c.x = 0;
          if (c.vx < 0) {
            c.vx = Math.abs(c.vx) * rnd(0.96, 1.05) + rnd(-0.25, 0.25);
            c.vy += rnd(-0.35, 0.35);
            c.vr = rnd(-0.5, 0.5);
            hit = true;
          }
        }
        // Right wall
        else if (c.x + c.w >= boundsW) {
          c.x = Math.max(0, boundsW - c.w);
          if (c.vx > 0) {
            c.vx = -Math.abs(c.vx) * rnd(0.96, 1.05) + rnd(-0.25, 0.25);
            c.vy += rnd(-0.35, 0.35);
            c.vr = rnd(-0.5, 0.5);
            hit = true;
          }
        }

        // Top wall
        if (c.y <= 0) {
          c.y = 0;
          if (c.vy < 0) {
            c.vy = Math.abs(c.vy) * rnd(0.96, 1.05) + rnd(-0.25, 0.25);
            c.vx += rnd(-0.35, 0.35);
            c.vr = rnd(-0.5, 0.5);
            hit = true;
          }
        }
        // Bottom wall
        else if (c.y + c.h >= boundsH) {
          c.y = Math.max(0, boundsH - c.h);
          if (c.vy > 0) {
            c.vy = -Math.abs(c.vy) * rnd(0.96, 1.05) + rnd(-0.25, 0.25);
            c.vx += rnd(-0.35, 0.35);
            c.vr = rnd(-0.5, 0.5);
            hit = true;
          }
        }

        // Clamp speed to lively ping-pong velocity range
        const speed = Math.hypot(c.vx, c.vy);
        if (speed < 1.4) {
          const a = Math.atan2(c.vy, c.vx) || rnd(0, Math.PI * 2);
          c.vx = Math.cos(a) * 1.8;
          c.vy = Math.sin(a) * 1.8;
        } else if (speed > 4.5) {
          c.vx = (c.vx / speed) * 4.2;
          c.vy = (c.vy / speed) * 4.2;
        }

        if (hit) {
          c.bounces++;
          // Fade out and purge after 7+ impacts
          if (c.bounces >= 7 && !c.fading) {
            c.fading = true;
            c.el.classList.add("fading");
            ensureMinimumCards(3);
            const toRemoveId = c.id;
            setTimeout(() => {
              c.cleanup?.();
              c.el.remove();
              const idx = cards.findIndex(item => item.id === toRemoveId);
              if (idx !== -1) cards.splice(idx, 1);
              ensureMinimumCards(3);
            }, 400);
          }
        }

        c.el._x = c.x;
        c.el._y = c.y;
        c.el.style.transform = `translate3d(${c.x.toFixed(1)}px, ${c.y.toFixed(1)}px, 0)`;
        c.el.style.setProperty("--x", `${c.x.toFixed(1)}px`);
        c.el.style.setProperty("--y", `${c.y.toFixed(1)}px`);
        c.el.style.setProperty("--r0", `${c.r.toFixed(1)}deg`);
      }

      if (cards.length < 3) {
        ensureMinimumCards(3);
      }
    };
    rafId = requestAnimationFrame(physicsLoop);

    // Re-scatter resets the 10 real components
    const onShuffle = () => {
      seedAll10Components();
      ensureMinimumCards(3);
    };
    shuffleBtn?.addEventListener("click", onShuffle);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      intersectObserver.disconnect();
      cards.forEach(c => c.cleanup?.());
      root.removeEventListener("click", onCanvasClick);
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerup", onPointerUp);
      root.removeEventListener("pointercancel", onPointerUp);
      shuffleBtn?.removeEventListener("click", onShuffle);
    };
  }, []);

  return (
    <section className="lab" id="scatter-lab" data-note="Scatter canvas">
      <div className="lab-head">
        <h2>Risk does not merely signal. It gates.</h2>
        <p>
          A risk state becomes meaningful when it changes what the protocol can execute. SAFE: Normal permitted activity under current policy. RESTRICTED: Exposure and action limits tighten. DEFENSIVE: Risk-increasing actions are blocked or materially constrained according to policy. EMERGENCY: Recovery and permitted exit actions remain available while new risk is restricted.
        </p>
      </div>
      <div
        className="stage guides"
        data-note="Scatter canvas"
        style={{ height: "min(92vh, 780px)", position: "relative", cursor: "pointer" }}
      >
        <div className="scatter" id="scatter" ref={rootRef} />
      </div>
      <div className="tools" style={{ display: "flex", gap: 12, marginTop: 14 }}>
        <button className="lf-pill" id="scatter-shuffle" ref={shuffleBtnRef}>
          Re-scatter Instruments
        </button>
      </div>
    </section>
  );
};
