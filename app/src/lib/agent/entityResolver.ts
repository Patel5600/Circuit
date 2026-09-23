/**
 * Circuit Protocol - Authoritative Entity Resolution Engine
 *
 * Resolves user inputs to canonical Circuit assets using the authoritative
 * DEPLOYED_MARKETS and MARKETS_DATA registries.
 *
 * Implements:
 * - Strict input normalization
 * - Alias and company name mapping
 * - Typo-tolerant fuzzy matching (Levenshtein distance)
 * - Three-tier confidence model (HIGH, MEDIUM, LOW)
 */

import { DEPLOYED_MARKETS, DeployedMarket } from "../../data/markets-registry";
import { MARKETS_DATA, MarketMetadata } from "../../data/markets";
import { ResolvedEntity, EntityConfidence } from "./types";

// Common brand and ticker aliases mapped to canonical symbols
const KNOWN_ALIASES: Record<string, string> = {
  nvidia: "NVDA",
  nvid: "NVDA",
  nvda: "NVDA",
  nvdax: "NVDA",
  apple: "AAPL",
  aapl: "AAPL",
  aaplx: "AAPL",
  tesla: "TSLA",
  tsla: "TSLA",
  tslax: "TSLA",
  microsoft: "MSFT",
  msft: "MSFT",
  msftx: "MSFT",
  amazon: "AMZN",
  amzn: "AMZN",
  amznx: "AMZN",
  google: "GOOGL",
  alphabet: "GOOGL",
  googl: "GOOGL",
  goog: "GOOGL",
  googlx: "GOOGL",
  coinbase: "COIN",
  coin: "COIN",
  coinx: "COIN",
  meta: "META",
  facebook: "META",
  metax: "META",
  netflix: "NFLX",
  nflx: "NFLX",
  nflxx: "NFLX",
  amd: "AMD",
  amdx: "AMD",
  spy: "SPY",
  spx: "SPY",
  sp500: "SPY",
  qqq: "QQQ",
  nasdaq: "QQQ",
};

// Known common typos
const TYPO_MAP: Record<string, string> = {
  nvida: "NVDA",
  nvd: "NVDA",
  nvdaaa: "NVDA",
  appl: "AAPL",
  appe: "AAPL",
  micrsoft: "MSFT",
  msoft: "MSFT",
  msf: "MSFT",
  tesal: "TSLA",
  tsal: "TSLA",
  googel: "GOOGL",
  gogl: "GOOGL",
  amazn: "AMZN",
  amzon: "AMZN",
  conbase: "COIN",
};

export const STOP_WORDS = new Set([
  "and", "the", "for", "are", "but", "not", "you", "all", "any", "can",
  "had", "her", "was", "one", "our", "out", "day", "get", "has", "him",
  "his", "how", "man", "new", "now", "old", "see", "two", "way", "who",
  "boy", "did", "its", "let", "put", "say", "she", "too", "use", "ask",
  "buy", "pay", "per", "via", "off", "from", "with", "what", "when", "why",
  "where", "that", "this", "then", "them", "some", "more", "much", "lend",
  "pool", "debt", "risk", "show", "tell", "view", "rate", "cost", "safe",
  "have", "been", "work", "loan", "asset", "assets", "deposit", "borrow",
  "repay", "withdraw", "circuit", "cuircuit"
]);

/**
 * Standard Levenshtein distance for fuzzy matching
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d: number[][] = [];

  for (let i = 0; i <= m; i++) {
    d[i] = [i];
  }
  for (let j = 0; j <= n; j++) {
    d[0][j] = j;
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,      // deletion
        d[i][j - 1] + 1,      // insertion
        d[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return d[m][n];
}

/**
 * Clean & normalize token text
 */
export function normalizeEntityQuery(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^\w\s-]/g, "") // remove punctuation except dash
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract candidate words or phrases that could be an asset ticker
 */
export function extractPotentialAssetTokens(text: string): string[] {
  const normalized = normalizeEntityQuery(text);
  const words = normalized.split(/\s+/).filter(Boolean);
  const candidates: string[] = [];

  // Single words (excluding common stop words)
  for (const w of words) {
    if (STOP_WORDS.has(w)) continue;
    // Strip trailing 'x' if word looks like a tokenized equity e.g. "nvdax" -> "nvda"
    candidates.push(w);
    if (w.endsWith("x") && w.length > 3) {
      candidates.push(w.slice(0, -1));
    }
  }

  // 2-word combinations e.g. "nvidia stock", "apple inc"
  for (let i = 0; i < words.length - 1; i++) {
    if (!STOP_WORDS.has(words[i]) && !STOP_WORDS.has(words[i + 1])) {
      candidates.push(`${words[i]} ${words[i + 1]}`);
    }
  }

  return Array.from(new Set(candidates));
}

/**
 * Resolve a query string to a canonical Circuit DeployedMarket
 */
export function resolveAssetEntity(query: string): ResolvedEntity | null {
  if (!query || typeof query !== "string") return null;

  const normalized = normalizeEntityQuery(query);
  if (!normalized) return null;

  const marketsList = Array.isArray(DEPLOYED_MARKETS) ? DEPLOYED_MARKETS : [];
  const metaList = Array.isArray(MARKETS_DATA) ? MARKETS_DATA : [];

  // 1. Direct symbol / tokenSymbol / alias check (Highest confidence)
  // Check known aliases
  const aliasMatch = KNOWN_ALIASES[normalized];
  if (aliasMatch) {
    const market = marketsList.find(m => m.symbol.toUpperCase() === aliasMatch);
    if (market) {
      const meta = metaList.find(m => m.symbol.toUpperCase() === aliasMatch);
      return {
        market,
        metadata: meta,
        confidence: "HIGH",
        matchedTerm: aliasMatch,
        originalInput: query,
      };
    }
  }

  // Check direct symbol or tokenSymbol in DEPLOYED_MARKETS
  const upperNorm = normalized.toUpperCase();
  const directMarket = marketsList.find(m =>
    m.symbol.toUpperCase() === upperNorm ||
    m.tokenSymbol.toUpperCase() === upperNorm ||
    m.tokenSymbol.toUpperCase() === `${upperNorm}X`
  );
  if (directMarket) {
    const meta = metaList.find(m => m.symbol.toUpperCase() === directMarket.symbol.toUpperCase());
    return {
      market: directMarket,
      metadata: meta,
      confidence: "HIGH",
      matchedTerm: directMarket.symbol,
      originalInput: query,
    };
  }

  // Check company names in MARKETS_DATA or DEPLOYED_MARKETS names
  const nameMarket = metaList.find(m =>
    m.displayName.toLowerCase() === normalized ||
    m.displayName.toLowerCase().startsWith(normalized) ||
    normalized.startsWith(m.displayName.toLowerCase())
  );
  if (nameMarket) {
    const market = marketsList.find(m => m.symbol.toUpperCase() === nameMarket.symbol.toUpperCase());
    if (market) {
      return {
        market,
        metadata: nameMarket,
        confidence: "HIGH",
        matchedTerm: nameMarket.symbol,
        originalInput: query,
      };
    }
  }

  // Check market name in DEPLOYED_MARKETS
  const depNameMarket = marketsList.find(m =>
    (m.name || "").toLowerCase() === normalized ||
    (m.name || "").toLowerCase().startsWith(normalized) ||
    normalized.startsWith((m.name || "").toLowerCase())
  );
  if (depNameMarket) {
    const meta = metaList.find(m => m.symbol.toUpperCase() === depNameMarket.symbol.toUpperCase());
    return {
      market: depNameMarket,
      metadata: meta,
      confidence: "HIGH",
      matchedTerm: depNameMarket.symbol,
      originalInput: query,
    };
  }

  // 2. Known typo map (High confidence)
  const typoMatch = TYPO_MAP[normalized];
  if (typoMatch) {
    const market = marketsList.find(m => m.symbol.toUpperCase() === typoMatch);
    if (market) {
      const meta = metaList.find(m => m.symbol.toUpperCase() === typoMatch);
      return {
        market,
        metadata: meta,
        confidence: "HIGH",
        matchedTerm: typoMatch,
        originalInput: query,
      };
    }
  }

  // 3. Typo-tolerant Fuzzy Search across all deployed markets & aliases (Medium confidence)
  // Common stop words must never be fuzzy matched to tickers (e.g. "and" -> "amd", "can" -> "coin")
  if (STOP_WORDS.has(normalized)) {
    return null;
  }

  let bestDist = Infinity;
  let bestCandidate: DeployedMarket | null = null;
  let bestTerm = "";

  for (const market of marketsList) {
    const sym = market.symbol.toLowerCase();
    const tokenSym = market.tokenSymbol.toLowerCase();
    const name = (market.name || "").toLowerCase();

    const dSym = levenshteinDistance(normalized, sym);
    const dToken = levenshteinDistance(normalized, tokenSym);
    const dName = levenshteinDistance(normalized, name);

    const minD = Math.min(dSym, dToken, dName);
    if (minD < bestDist) {
      bestDist = minD;
      bestCandidate = market;
      bestTerm = market.symbol;
    }
  }

  // Check fuzzy against aliases
  for (const [alias, sym] of Object.entries(KNOWN_ALIASES)) {
    const d = levenshteinDistance(normalized, alias);
    if (d < bestDist) {
      const m = marketsList.find(x => x.symbol.toUpperCase() === sym);
      if (m) {
        bestDist = d;
        bestCandidate = m;
        bestTerm = sym;
      }
    }
  }

  // Evaluate fuzzy match quality
  if (bestCandidate) {
    const meta = metaList.find(m => m.symbol.toUpperCase() === bestCandidate!.symbol.toUpperCase());
    // Single-letter typo on a short ticker (length <= 5)
    if (bestDist === 1) {
      return {
        market: bestCandidate,
        metadata: meta,
        confidence: "HIGH",
        matchedTerm: bestTerm,
        originalInput: query,
      };
    }
    // 2-letter distance on longer names
    if (bestDist === 2 && normalized.length >= 4) {
      return {
        market: bestCandidate,
        metadata: meta,
        confidence: "MEDIUM",
        matchedTerm: bestTerm,
        originalInput: query,
        suggestedAlternative: bestCandidate.tokenSymbol,
      };
    }
  }

  return null;
}

/**
 * Scan a full message to find any mentioned Circuit assets
 */
export function findMentionedAssets(message: string): ResolvedEntity[] {
  const tokens = extractPotentialAssetTokens(message);
  const matches: ResolvedEntity[] = [];
  const seenSymbols = new Set<string>();

  for (const t of tokens) {
    const res = resolveAssetEntity(t);
    if (res && !seenSymbols.has(res.market.symbol)) {
      seenSymbols.add(res.market.symbol);
      matches.push(res);
    }
  }

  return matches;
}

export const KNOWN_EXTERNAL_SYMBOLS: Record<string, { symbol: string; name: string; type: "CRYPTO" | "INDEX" | "COMMODITY" }> = {
  btc: { symbol: "BTC", name: "Bitcoin", type: "CRYPTO" },
  bitcoin: { symbol: "BTC", name: "Bitcoin", type: "CRYPTO" },
  eth: { symbol: "ETH", name: "Ethereum", type: "CRYPTO" },
  ethereum: { symbol: "ETH", name: "Ethereum", type: "CRYPTO" },
  sol: { symbol: "SOL", name: "Solana", type: "CRYPTO" },
  solana: { symbol: "SOL", name: "Solana", type: "CRYPTO" },
};

/**
 * Extract all symbols (both Circuit tokenized equities and external benchmarks like BTC/ETH/SOL)
 * mentioned in a query for multi-asset resolution.
 */
export function extractQueriedSymbols(message: string): string[] {
  const normalized = normalizeEntityQuery(message);
  const words = normalized.split(/\s+/).filter(Boolean);
  const symbols: string[] = [];
  const seen = new Set<string>();

  for (const word of words) {
    const lower = word.toLowerCase();
    if (STOP_WORDS.has(lower)) continue;

    const ext = KNOWN_EXTERNAL_SYMBOLS[lower];
    if (ext && !seen.has(ext.symbol)) {
      seen.add(ext.symbol);
      symbols.push(ext.symbol);
      continue;
    }
    const res = resolveAssetEntity(word);
    if (res && !seen.has(res.market.symbol)) {
      seen.add(res.market.symbol);
      symbols.push(res.market.symbol);
    }
  }

  return symbols;
}
