import React from "react";

/**
 * Inline SVG icon set.
 *
 * Deliberately hand-rolled rather than pulling in an icon library: the app needs
 * roughly twenty glyphs, and a dependency would add weight for no benefit.
 * Every icon inherits `currentColor` and is `aria-hidden` - meaning is always
 * carried by adjacent text, never by the glyph alone.
 */

export type IconName =
  | "dashboard"
  | "markets"
  | "position"
  | "activity"
  | "borrow"
  | "learn"
  | "verify"
  | "check"
  | "alert"
  | "cross"
  | "info"
  | "clock"
  | "lock"
  | "shield"
  | "copy"
  | "external"
  | "chevron"
  | "chevronDown"
  | "arrowRight"
  | "arrowDown"
  | "wallet"
  | "deposit"
  | "withdraw"
  | "repay"
  | "spinner"
  | "menu"
  | "close"
  | "layers"
  | "gauge"
  | "refresh"
  | "faucet";

const PATHS: Record<IconName, React.ReactNode> = {
  refresh: (
    <>
      <path d="M21 2v6h-6" />
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M3 22v-6h6" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    </>
  ),
  faucet: (
    <>
      <path d="M4 10h11a3 3 0 0 1 3 3v2H4v-5Z" />
      <path d="M7 10V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4" />
      <path d="M15 15v3.5a1.5 1.5 0 0 1-3 0V15" />
      <circle cx="13.5" cy="21.5" r="0.75" />
    </>
  ),
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  markets: (
    <>
      <path d="M3 20h18" />
      <path d="M6 16v-5" />
      <path d="M11 16V6" />
      <path d="M16 16v-8" />
      <path d="M21 16v-3" />
    </>
  ),
  position: (
    <>
      <path d="M4 6.5C4 5.1 6.7 4 10 4s6 1.1 6 2.5" />
      <path d="M4 6.5v11C4 18.9 6.7 20 10 20s6-1.1 6-2.5v-11" />
      <path d="M4 12c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5" />
      <circle cx="18" cy="17" r="3.2" />
    </>
  ),
  activity: (
    <>
      <path d="M3 12h4l2.5-6 3.5 12 2.5-6H21" />
    </>
  ),
  borrow: (
    <>
      <path d="M12 3v18" />
      <path d="M17 7.5C17 5.6 14.8 4.5 12 4.5S7 5.6 7 7.5s2.2 2.6 5 3.2 5 1.3 5 3.3-2.2 3-5 3-5-1.1-5-3" />
    </>
  ),
  learn: (
    <>
      <path d="M3 6.5 12 3l9 3.5L12 10 3 6.5Z" />
      <path d="M21 10.5v5" />
      <path d="M6.5 8.6v5.6c0 1.6 2.5 2.8 5.5 2.8s5.5-1.2 5.5-2.8V8.6" />
    </>
  ),
  verify: (
    <>
      <path d="M12 3l7.5 3v5.5c0 4.4-3.1 8.1-7.5 9.5-4.4-1.4-7.5-5.1-7.5-9.5V6L12 3Z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  alert: (
    <>
      <path d="M12 9v5" />
      <path d="M12 17.2v.1" />
      <path d="M10.3 3.9 2.6 17.4A1.9 1.9 0 0 0 4.3 20.3h15.4a1.9 1.9 0 0 0 1.7-2.9L13.7 3.9a1.9 1.9 0 0 0-3.4 0Z" />
    </>
  ),
  cross: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15 9-6 6M9 9l6 6" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <path d="M12 7.7v.1" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3.2 2" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.2" />
      <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
    </>
  ),
  shield: (
    <path d="M12 3l7.5 3v5.5c0 4.4-3.1 8.1-7.5 9.5-4.4-1.4-7.5-5.1-7.5-9.5V6L12 3Z" />
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15 5.5A1.5 1.5 0 0 0 13.5 4H6a2 2 0 0 0-2 2v7.5A1.5 1.5 0 0 0 5.5 15" />
    </>
  ),
  external: (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4l-8.5 8.5" />
      <path d="M18 14.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.5" />
    </>
  ),
  chevron: <path d="m9 5 7 7-7 7" />,
  chevronDown: <path d="m5 9 7 7 7-7" />,
  arrowRight: (
    <>
      <path d="M4 12h15" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
  arrowDown: (
    <>
      <path d="M12 4v15" />
      <path d="m6 13 6 6 6-6" />
    </>
  ),
  wallet: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M3 10.5h18" />
      <path d="M16.5 15h1.5" />
    </>
  ),
  deposit: (
    <>
      <path d="M12 16V4" />
      <path d="m6 10 6-6 6 6" />
      <path d="M4 20h16" />
    </>
  ),
  withdraw: (
    <>
      <path d="M12 4v12" />
      <path d="m6 10 6 6 6-6" />
      <path d="M4 20h16" />
    </>
  ),
  repay: (
    <>
      <path d="M20 11a8 8 0 1 0-2.5 5.8" />
      <path d="M20 5v6h-6" />
    </>
  ),
  spinner: (
    <>
      <path d="M12 3v4" opacity="1" />
      <path d="M12 17v4" opacity="0.35" />
      <path d="M5 12H1" opacity="0.55" />
      <path d="M23 12h-4" opacity="0.8" />
      <path d="m7.05 7.05-2.8-2.8" opacity="0.7" />
      <path d="m19.75 19.75-2.8-2.8" opacity="0.45" />
      <path d="m7.05 16.95-2.8 2.8" opacity="0.6" />
      <path d="m19.75 4.25-2.8 2.8" opacity="0.9" />
    </>
  ),
  menu: (
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  layers: (
    <>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 13 9 5 9-5" />
    </>
  ),
  gauge: (
    <>
      <path d="M4 18a9 9 0 1 1 16 0" />
      <path d="m12 14 4-4" />
      <circle cx="12" cy="14" r="1.4" />
    </>
  ),
};

export function Icon({
  name,
  size = 18,
  strokeWidth = 1.7,
  className,
  spin = false,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  spin?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
      style={
        spin
          ? { animation: "spin 900ms linear infinite", display: "block" }
          : undefined
      }
    >
      {PATHS[name]}
    </svg>
  );
}

/** Keyframes for the spinner live here so no global CSS import is required. */
export function IconKeyframes() {
  return (
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  );
}
