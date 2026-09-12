import React from "react";

/**
 * The circuit mark: an open "C" arc terminated by a node, reading as both a
 * letter C and a circuit trace with a contact point. Pure geometry, no raster
 * assets and no emoji.
 */
export function CircuitLogo({
  size = 26,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <rect width="32" height="32" rx="7.5" fill="var(--surface-2)" />
      <rect
        x="0.5"
        y="0.5"
        width="31"
        height="31"
        rx="7"
        fill="none"
        stroke="var(--border-strong)"
      />
      <path
        d="M22.4 11.1a7.2 7.2 0 1 0 0 9.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="23.1" cy="16" r="2.15" fill="var(--accent)" />
    </svg>
  );
}

/**
 * Wordmark. The product name is always lowercase "circuit".
 */
export function CircuitWordmark({
  size = 26,
  showTagline = false,
}: {
  size?: number;
  showTagline?: boolean;
}) {
  return (
    <span className="row g-10" style={{ color: "var(--text)" }}>
      <CircuitLogo size={size} />
      <span className="stack" style={{ lineHeight: 1.1 }}>
        <span
          style={{
            fontSize: size * 0.66,
            fontWeight: 650,
            letterSpacing: "-0.02em",
          }}
        >
          circuit
        </span>
        {showTagline && (
          <span
            style={{
              fontSize: 10,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--text-3)",
              fontWeight: 600,
            }}
          >
            Tokenized equity credit
          </span>
        )}
      </span>
    </span>
  );
}
