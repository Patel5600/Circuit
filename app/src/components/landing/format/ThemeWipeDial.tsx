import React, { useCallback, useEffect, useState } from "react";

/**
 * ThemeWipeDial — format-kit-3 "Theme Wipe" adapted for landing header.
 *
 * A small circular dial that triggers a full-screen circle-wipe transition
 * between light and dark themes. Sized to fit inside the lf-bar header row.
 * Works with the app's existing [data-theme] attribute on <html>.
 *
 * Visual: a small dot orbits the inner ring of the dial (180° arc per click).
 */
export const ThemeWipeDial: React.FC = () => {
  const [isDark, setIsDark] = useState(() => {
    if (typeof document === "undefined") return false;
    const stored = document.documentElement.dataset.theme;
    if (stored) return stored === "dark";
    return matchMedia("(prefers-color-scheme: dark)").matches;
  });

  // Sync state when data-theme changes externally (e.g. AppShell toggle)
  useEffect(() => {
    const obs = new MutationObserver(() => {
      const t = document.documentElement.dataset.theme;
      if (t) setIsDark(t === "dark");
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const btn = e.currentTarget;
    const r = btn.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const next = isDark ? "light" : "dark";

    const apply = () => {
      document.documentElement.dataset.theme = next;
      // Also sync class-based dark mode for the app shell
      document.documentElement.classList.toggle("dark", next === "dark");
      setIsDark(next === "dark");
    };

    // Skip animation if reduced motion
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      apply();
      return;
    }

    // View Transitions API (Chrome 111+)
    if ((document as any).startViewTransition) {
      const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      const clip = [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`];
      (document as any).startViewTransition(apply).ready.then(() => {
        document.documentElement.animate(
          { clipPath: next === "dark" ? clip : [clip[1], clip[0]] },
          { duration: 800, easing: "cubic-bezier(.7,0,.2,1)", pseudoElement: "::view-transition-new(root)" }
        );
      });
      return;
    }

    // Overlay fallback
    const ov = document.createElement("div");
    ov.className = "lf-wipe";
    ov.style.cssText = `--x:${x}px;--y:${y}px;background:${next === "dark" ? "#0C0E17" : "#CAD0E4"}`;
    document.body.append(ov);
    requestAnimationFrame(() => requestAnimationFrame(() => ov.classList.add("go")));
    ov.addEventListener("transitionend", () => {
      apply();
      ov.classList.add("fade");
      setTimeout(() => ov.remove(), 450);
    }, { once: true });
  }, [isDark]);

  return (
    <button
      type="button"
      className="lf-theme-dial"
      aria-pressed={isDark}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={handleClick}
      title={isDark ? "Light mode" : "Dark mode"}
    >
      <i />
    </button>
  );
};
