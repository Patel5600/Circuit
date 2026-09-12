import { useEffect, useRef, useState } from "react";

/**
 * Scroll choreography for the landing page.
 *
 * Two rules run through this file:
 *
 * 1. Continuous values never go through React state. Anything that changes every
 *    frame is written to a CSS custom property on the element so the browser
 *    interpolates it, and the component tree does not re-render. Only discrete
 *    values - which step is active - become state.
 *
 * 2. Sampling is capped at 30Hz. Scroll-linked layout reads are the expensive
 *    part, and halving them is invisible in the result: every visual that depends
 *    on them is a CSS transition or transform, interpolated by the compositor
 *    independently of how often we sample.
 *
 * There is deliberately no pointer-parallax or scroll-parallax hook here. The
 * hero's orbit turns at a constant rate and reacts to neither, because tying a
 * large slow object to scroll position or cursor makes it lurch whenever either
 * moves, which reads as jitter rather than as depth.
 */

/** Sampling ceiling. 30Hz is plenty for scroll-linked work. */
const SAMPLE_MS = 1000 / 30;

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * Run `sample` on scroll and resize, coalesced into one rAF and rate-limited to
 * SAMPLE_MS. Returns a teardown.
 */
function trackScroll(sample: () => void): () => void {
  let frame = 0;
  let last = 0;
  let alive = true;

  const run = (now: number) => {
    frame = 0;
    if (!alive) return;
    if (now - last < SAMPLE_MS) {
      // Too soon. Re-arm rather than drop the update, so the resting position
      // after a fling is always sampled.
      frame = requestAnimationFrame(run);
      return;
    }
    last = now;
    sample();
  };

  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(run);
  };

  sample();
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);

  return () => {
    alive = false;
    if (frame) cancelAnimationFrame(frame);
    window.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", schedule);
  };
}

export interface PinnedSteps {
  /** Index of the active step, 0-based. */
  index: number;
  /** Overall progress through the pinned run, by ref. */
  progress: React.MutableRefObject<number>;
}

/**
 * Drives a sticky-pinned section as a sequence of discrete steps.
 *
 * The section is taller than the viewport and holds a `position: sticky` stage.
 * While that stage is pinned, scrolling advances through `count` steps one at a
 * time - which is what makes the sequence read as deliberate rather than as a set
 * of things that happened to fade in near each other.
 *
 * Progress is measured against the pinned travel, the section's height minus the
 * stage's height, so it reaches 1 exactly as the stage unpins with no dead zone at
 * either end.
 *
 * Publishes three CSS custom properties on the section:
 *   --p      0..1 across the whole run, for continuous artwork like the trace
 *   --step   0..1 within the active step, for the per-step fill rails
 *   --index  the active index as a plain number
 *
 * Only `index` is React state, so scrolling through a five-step section costs five
 * renders rather than one per frame.
 */
export function usePinnedSteps(
  ref: React.RefObject<HTMLElement>,
  count: number
): PinnedSteps {
  const [index, setIndex] = useState(0);
  const progress = useRef(0);

  useEffect(() => {
    if (count < 1) return;

    return trackScroll(() => {
      const el = ref.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // Distance the section scrolls while its stage stays pinned.
      const travel = Math.max(1, rect.height - vh);
      const p = clamp01(-rect.top / travel);
      progress.current = p;

      // Land the final step slightly before the end, so it is legible for a beat
      // before the section releases.
      const raw = clamp01(p / 0.88) * count;
      const active = Math.min(count - 1, Math.floor(raw));
      const within = clamp01(raw - active);

      el.style.setProperty("--p", p.toFixed(4));
      el.style.setProperty("--step", within.toFixed(4));
      el.style.setProperty("--index", String(active));

      setIndex((prev) => (prev === active ? prev : active));
    });
  }, [ref, count]);

  return { index, progress };
}
