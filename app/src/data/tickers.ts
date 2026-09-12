import { LOGOS, NO_MARK, type LogoMark } from "./logos";

/**
 * Tokenized-equity registry for the public landing page.
 *
 * IDENTITY ONLY. There is deliberately no price, no 24h change and no market-cap
 * field on this type. The landing page must never imply live data it does not
 * have; real numbers appear only inside /app, read from chain.
 *
 * Marks come from ./logos, generated from real brand artwork. When a mark is
 * unavailable the asset renders as a typographic lockup rather than an invented
 * logo - see `mark === undefined`.
 *
 * Orbit geometry deliberately does not live here. It belongs to the one component
 * that draws it (components/landing/HeroOrbit.tsx), because the ring radii and the
 * node sizes are a single interdependent set: splitting them across two files is
 * how a layout ends up with nodes that overlap at one breakpoint.
 */
export interface TickerAsset {
  /** Underlying equity symbol, e.g. NVDA. Also the logo key. */
  symbol: string;
  /** Tokenized representation, e.g. NVDAx. */
  token: string;
  /** Short display name. Short on purpose: it has to fit a table cell. */
  name: string;
  /** Sector label used by the section 02 catalogue. */
  sector: "Technology" | "Automotive" | "Entertainment" | "Finance" | "Consumer";
  /** Real brand mark, or undefined when none is available. */
  mark: LogoMark | undefined;
}

interface Seed {
  symbol: string;
  name: string;
  sector: TickerAsset["sector"];
}

const SEEDS: Seed[] = [
  { symbol: "NVDA", name: "NVIDIA", sector: "Technology" },
  { symbol: "AAPL", name: "Apple", sector: "Technology" },
  { symbol: "MSFT", name: "Microsoft", sector: "Technology" },
  { symbol: "AMZN", name: "Amazon", sector: "Consumer" },
  { symbol: "GOOGL", name: "Alphabet", sector: "Technology" },
  { symbol: "META", name: "Meta", sector: "Technology" },
  { symbol: "TSLA", name: "Tesla", sector: "Automotive" },
  { symbol: "NFLX", name: "Netflix", sector: "Entertainment" },
  { symbol: "AMD", name: "AMD", sector: "Technology" },
  { symbol: "INTC", name: "Intel", sector: "Technology" },
  { symbol: "COIN", name: "Coinbase", sector: "Finance" },
  { symbol: "HOOD", name: "Robinhood", sector: "Finance" },
  { symbol: "JPM", name: "JPMorgan", sector: "Finance" },
  { symbol: "V", name: "Visa", sector: "Finance" },
  { symbol: "MA", name: "Mastercard", sector: "Finance" },
  { symbol: "DIS", name: "Disney", sector: "Entertainment" },
  { symbol: "MCD", name: "McDonald's", sector: "Consumer" },
  { symbol: "NKE", name: "Nike", sector: "Consumer" },
  { symbol: "KO", name: "Coca-Cola", sector: "Consumer" },
  { symbol: "PEP", name: "PepsiCo", sector: "Consumer" },
  { symbol: "MU", name: "Micron", sector: "Technology" },
  { symbol: "MRVL", name: "Marvell", sector: "Technology" },
];

export const TICKERS: TickerAsset[] = SEEDS.map((s) => ({
  symbol: s.symbol,
  token: `${s.symbol}x`,
  name: s.name,
  sector: s.sector,
  mark: NO_MARK.includes(s.symbol) ? undefined : LOGOS[s.symbol],
}));

const BY_SYMBOL = new Map(TICKERS.map((t) => [t.symbol, t]));

export function asset(symbol: string): TickerAsset | undefined {
  return BY_SYMBOL.get(symbol);
}

/** Count of assets whose real brand mark is available. */
export const MARKED_COUNT = TICKERS.filter((t) => t.mark).length;

/** Display order for the asset universe: marquee names first, then the rest. */
const FEATURED_ORDER = [
  "NVDA", "AAPL", "MSFT", "AMZN", "GOOGL", "META", "TSLA", "NFLX",
  "COIN", "HOOD", "AMD", "INTC", "JPM", "V", "MA", "DIS",
  "MCD", "NKE", "KO", "PEP", "MU", "MRVL",
];

export function featuredTickers(): TickerAsset[] {
  const ordered = FEATURED_ORDER.map((s) => BY_SYMBOL.get(s)).filter(
    (x): x is TickerAsset => Boolean(x)
  );
  const rest = TICKERS.filter((t) => !FEATURED_ORDER.includes(t.symbol));
  return [...ordered, ...rest];
}
