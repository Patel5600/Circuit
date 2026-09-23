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

    // ── THE 5 CIRCUIT PIPELINE COMPONENT CARDS ──
    const COMPONENT_TYPES = [
      // CARD 1: MARKET STATE (Pyth)
      {
        key: "market-state",
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
                  (Pyth)<b>MARKET STATE</b>
                  <span class="real-card-sub">Price · Confidence · Freshness</span>
                </div>
                <span class="real-card-tag">Market State</span>
              </div>
              <div class="real-stage">
                <div class="dial-grid-mini">${dialsHtml}</div>
              </div>
              <div style="font-size:7px;opacity:0.5;font-family:var(--lf-mono);text-align:right;">Pyth · Price · Confidence · Freshness</div>
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

      // CARD 2: RISK KERNEL (Risk Ratchet)
      {
        key: "risk-kernel",
        className: "card-ring",
        w: 260,
        h: 210,
        create: (container: HTMLElement) => {
          container.innerHTML = `
            <div class="face">
              <div class="real-card-head">
                <div class="real-card-meta">
                  (Risk Ratchet)<b>RISK KERNEL</b>
                  <span class="real-card-sub">SAFE → RESTRICTED → DEFENSIVE → EMERGENCY</span>
                </div>
                <span class="real-card-tag">Risk Kernel</span>
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
              <div style="font-size:7px;opacity:0.5;font-family:var(--lf-mono);">SAFE → RESTRICTED → DEFENSIVE → EMERGENCY</div>
            </div>
          `;
          return undefined;
        },
      },

      // CARD 3: CAPITAL POLICY (Dynamic Limits)
      {
        key: "capital-policy",
        className: "card-colour",
        w: 280,
        h: 180,
        create: (container: HTMLElement) => {
          container.innerHTML = `
            <div class="face">
              <div class="real-card-head">
                <div class="real-card-meta">
                  (Dynamic Limits)<b>CAPITAL POLICY</b>
                  <span class="real-card-sub">LTV · Exposure · Action Gates</span>
                </div>
                <span class="real-card-tag">Capital Policy</span>
              </div>
              <div class="real-stage">
                <div class="colour-stage-mini">
                  <div class="colour-art-mini"></div>
                  <div class="colour-mask-mini"></div>
                </div>
              </div>
              <div style="font-size:7px;opacity:0.5;font-family:var(--lf-mono);">LTV · Exposure · Action Gates</div>
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

      // CARD 4: PERMISSION (RiskEnvelope)
      {
        key: "permission",
        className: "card-draw",
        w: 280,
        h: 190,
        create: (container: HTMLElement) => {
          container.innerHTML = `
            <div class="face">
              <div class="real-card-head">
                <div class="real-card-meta">
                  (RiskEnvelope)<b>PERMISSION</b>
                  <span class="real-card-sub">Action · Venue · Amount · Expiry</span>
                </div>
                <span class="real-card-tag">Permission</span>
              </div>
              <div class="real-stage">
                <canvas width="252" height="110" style="border-radius:4px;background:#f4f4f0;"></canvas>
              </div>
              <div style="font-size:7px;opacity:0.5;font-family:var(--lf-mono);">Action · Venue · Amount · Expiry</div>
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

      // CARD 5: EXECUTION (Authorization Check)
      {
        key: "execution",
        className: "card-morph",
        w: 260,
        h: 200,
        create: (container: HTMLElement) => {
          container.innerHTML = `
            <div class="face">
              <div class="real-card-head">
                <div class="real-card-meta">
                  (Authorization Check)<b>EXECUTION</b>
                  <span class="real-card-sub" id="morph-label">ALLOW / BLOCK / RECOVER</span>
                </div>
                <span class="real-card-tag">Execution</span>
              </div>
              <div class="real-stage">
                <div class="morph-shape-mini" style="width:130px;height:65px;border-radius:32px;">
                  <strong>ALLOW</strong>
                </div>
              </div>
              <div style="font-size:7px;opacity:0.5;font-family:var(--lf-mono);">ALLOW / BLOCK / RECOVER</div>
            </div>
          `;

          const shape = container.querySelector(".morph-shape-mini") as HTMLElement | null;
          const label = container.querySelector("#morph-label") as HTMLElement | null;
          const stages = [
            { name: "ALLOW", w: "130px", h: "65px", rad: "32px" },
            { name: "BLOCK", w: "90px", h: "80px", rad: "4px" },
            { name: "RECOVER", w: "155px", h: "70px", rad: "16px" },
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
            if (label) label.textContent = `${st.name} · Authorization Check`;
          }, 1400);

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

    // ── INITIAL SEED: THE 5 PIPELINE COMPONENTS ──
    const seedAll10Components = () => {
      cards.forEach(c => {
        c.cleanup?.();
        c.el.remove();
      });
      cards.length = 0;

      const cw = boundsW;
      const ch = boundsH;

      // Spread initial 5 pipeline cards across the canvas space
      const gridCols = 5;

      COMPONENT_TYPES.forEach((comp, idx) => {
        const col = idx % gridCols;
        const slotW = cw / gridCols;

        const x = clamp(col * slotW + rnd(10, Math.max(12, slotW - comp.w - 10)), 0, Math.max(0, cw - comp.w));
        const y = clamp(rnd(25, Math.max(30, ch - comp.h - 35)), 25, Math.max(25, ch - comp.h - 25));

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
          Circuit turns live market and position conditions into enforceable capital permissions.
          <br /><br />
          SAFE permits normal activity.
          <br />
          RESTRICTED tightens exposure.
          <br />
          DEFENSIVE blocks risk-increasing actions.
          <br />
          EMERGENCY preserves permitted recovery and exit.
          <br /><br />
          The result is not a frontend warning. It is protocol state.
        </p>
      </div>
      <div
        className="stage guides"
        data-note="Scatter canvas"
        style={{ height: "min(92vh, 780px)", position: "relative", cursor: "pointer" }}
      >
        <div className="scatter" id="scatter" ref={rootRef} />
        <span className="hint">A changing risk state changes the capital boundary.</span>
      </div>
      <div className="tools" style={{ display: "flex", gap: 12, marginTop: 14, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
        <button className="lf-pill" id="scatter-shuffle" ref={shuffleBtnRef}>
          Re-scatter Instruments
        </button>
        <span style={{ fontFamily: "var(--lf-mono)", fontSize: 11, letterSpacing: "0.04em", opacity: 0.7 }}>
          MARKET STATE → POLICY → PERMISSION → EXECUTION
        </span>
      </div>
    </section>
  );
};
