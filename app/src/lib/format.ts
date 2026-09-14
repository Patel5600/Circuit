/** Presentation helpers. These format values; they never compute risk. */

export function shortenAddress(address: string, head = 4, tail = 4): string {
  if (!address) return "";
  return address.length <= head + tail + 3
    ? address
    : `${address.slice(0, head)}...${address.slice(-tail)}`;
}

export function formatMoney(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "0.00";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatCurrency(value: number, digits = 2): string {
  return `$${formatMoney(value, digits)}`;
}

/** Compact currency for headline figures: $12.4K, $1.2M. */
export function formatMoneyCompact(value: number): string {
  if (!Number.isFinite(value)) return "$0";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${formatMoney(value)}`;
}

export function formatTokens(value: number, digits = 4): string {
  if (!Number.isFinite(value)) return "0";
  // Whole amounts read better without trailing zeros.
  if (Number.isInteger(value)) return value.toLocaleString("en-US");
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  });
}

/** Health factor as a user-facing string. Never shows an infinity glyph. */
export function formatHealthFactor(hfBps: number | null): string {
  if (hfBps === null) return "No debt";
  return (hfBps / 10_000).toFixed(2);
}

export function formatPercent(bps: number, digits = 0): string {
  return `${(bps / 100).toFixed(digits)}%`;
}

export function formatAge(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "unknown";
  if (seconds < 60) return `${Math.round(seconds)}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

export function formatRelativeTime(unixSeconds: number | null): string {
  if (!unixSeconds) return "unknown";
  return formatAge(Math.floor(Date.now() / 1000) - unixSeconds);
}

export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 5) return "Good evening";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
