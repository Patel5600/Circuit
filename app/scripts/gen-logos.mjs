/**
 * Authoring-time generator for src/data/logos.ts.
 *
 * Reads the real brand marks out of `simple-icons` - each icons/<slug>.svg is a
 * single monochrome path on a 24x24 viewBox - and pairs each one with its brand
 * colour from _data/simple-icons.json. Only the marks this site needs are frozen
 * into a plain data module, so the shipped bundle carries ~24 path strings
 * instead of a 3300-file icon set.
 *
 * ON-DARK COLOURS
 * Several marks are officially black or near-black (Apple 000000, Nike 111111,
 * Visa 1A1F71). Painted as-is on this page they would be invisible, so each mark
 * also gets an `onDark` value: the brand colour when it has enough luminance to
 * read, and a warm off-white otherwise. That matches how these owners publish
 * their own reversed-out variants.
 *
 * MULTI-PART MARKS
 * A few marks are not one colour. Those declare `parts`, each with its own fill.
 * Microsoft is the case that matters here: four equal squares in four colours,
 * which is exact reproducible geometry, and rendering it as one flat silhouette
 * would read as wrong rather than as simplified.
 *
 * Re-run with:  node scripts/gen-logos.mjs
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const DIR = "node_modules/simple-icons/icons";
const DATA = "node_modules/simple-icons/_data/simple-icons.json";

/** [slug, key, optical] - optical corrects perceived weight, not box size. */
const FROM_UPSTREAM = [
  ["nvidia", "NVDA", 1.06],
  ["apple", "AAPL", 0.94],
  ["amazon", "AMZN", 1.04],
  ["google", "GOOGL", 0.92],
  ["meta", "META", 1.12],
  ["tesla", "TSLA", 0.9],
  ["netflix", "NFLX", 0.86],
  ["amd", "AMD", 1.04],
  ["intel", "INTC", 1.06],
  ["coinbase", "COIN", 0.96],
  ["robinhood", "HOOD", 0.94],
  ["visa", "V", 1.14],
  ["mastercard", "MA", 0.96],
  ["mcdonalds", "MCD", 0.9],
  ["nike", "NKE", 1.16],
  ["cocacola", "KO", 1.1],
  ["chase", "JPM", 0.98],
  ["solana", "SOLANA", 1.06],
  ["rust", "RUST", 0.94],
  ["github", "GITHUB", 0.98],
];

/**
 * Hand-authored marks. Only where the real mark is exact, reproducible geometry -
 * never as a way to guess at a logo we do not have.
 */
const AUTHORED = [
  {
    key: "MSFT",
    title: "Microsoft",
    optical: 0.88,
    hex: "F25022",
    // Four equal squares on a symmetric 2x2 grid, in the four brand colours.
    parts: [
      { d: "M1.5 1.5h9.6v9.6H1.5V1.5z", fill: "#F25022" },
      { d: "M12.9 1.5h9.6v9.6h-9.6V1.5z", fill: "#7FBA00" },
      { d: "M1.5 12.9h9.6v9.6H1.5v-9.6z", fill: "#00A4EF" },
      { d: "M12.9 12.9h9.6v9.6h-9.6v-9.6z", fill: "#FFB900" },
    ],
  },
  {
    key: "PYTH",
    title: "Pyth Network",
    optical: 1.0,
    hex: "9B8AFB",
    // Stacked aperture: a price feed narrowing to one agreed value.
    d:
      "M12 1.4 22.2 19.2a.7.7 0 0 1-.6 1.05H2.4a.7.7 0 0 1-.6-1.05L12 1.4zm0 4.3-6.6 11.5h13.2L12 5.7z" +
      "M12 9.9l3.4 5.9H8.6L12 9.9z",
  },
  {
    key: "ANCHOR",
    title: "Anchor",
    optical: 1.0,
    hex: "3E7BFA",
    d:
      "M12 1.2a2.9 2.9 0 0 1 1.2 5.53V9.1h3.05v2.1H13.2v8.32a7.6 7.6 0 0 0 6.1-6.3h-2.06L20.4 8.9l3.16 4.32H21.4A9.7 9.7 0 0 1 12 22.8 9.7 9.7 0 0 1 2.6 13.22H.44L3.6 8.9l3.16 4.32H4.7a7.6 7.6 0 0 0 6.1 6.3V11.2H7.75V9.1h3.05V6.73A2.9 2.9 0 0 1 12 1.2zm0 2.1a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6z",
  },
];

/** Marks we deliberately do not have. The UI uses a typographic lockup instead. */
const TYPOGRAPHIC_ONLY = ["DIS", "PEP", "MU", "MRVL"];

/** Warm off-white used when a brand's own colour is too dark to read on black. */
const REVERSED = "#F2F1EE";

/**
 * Brightest channel below this reverses the mark to off-white.
 *
 * Deliberately not WCAG relative luminance: that formula weights green heavily,
 * so it scores saturated blues like Coinbase #0052FF as unreadable when in fact
 * they read cleanly on black. What actually matters here is whether any channel
 * is far enough from zero to separate from the background, which is the value
 * component of HSV.
 */
const MIN_CHANNEL = 130;

function brightestChannel(hex) {
  const n = parseInt(hex, 16);
  return Math.max((n >> 16) & 255, (n >> 8) & 255, n & 255);
}

const raw = JSON.parse(readFileSync(DATA, "utf8"));
const catalogue = Array.isArray(raw) ? raw : raw.icons;
const hexByTitle = new Map(catalogue.map((i) => [i.title, i.hex]));

const marks = [];
const missing = [];

for (const [slug, key, optical] of FROM_UPSTREAM) {
  const file = `${DIR}/${slug}.svg`;
  if (!existsSync(file)) {
    missing.push(slug);
    continue;
  }
  const svg = readFileSync(file, "utf8");
  const title = /<title>([^<]*)<\/title>/.exec(svg)?.[1];
  const paths = [...svg.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]);
  const hex = title ? hexByTitle.get(title) : undefined;
  if (!paths.length || !title || !hex) {
    missing.push(slug);
    continue;
  }
  marks.push({ key, title, optical, hex, d: paths.join(" ") });
}

for (const a of AUTHORED) marks.push(a);

// Resolve the on-dark colour for every mark.
for (const m of marks) {
  m.onDark =
    brightestChannel(m.hex) >= MIN_CHANNEL ? `#${m.hex}` : REVERSED;
}

marks.sort((a, b) => a.key.localeCompare(b.key));

const body = marks
  .map((o) => {
    const lines = [
      `  ${o.key}: {`,
      `    title: ${JSON.stringify(o.title)},`,
      `    optical: ${o.optical},`,
      `    hex: ${JSON.stringify(`#${o.hex}`)},`,
      `    onDark: ${JSON.stringify(o.onDark)},`,
    ];
    if (o.parts) {
      lines.push(`    parts: [`);
      for (const p of o.parts) {
        lines.push(
          `      { d: ${JSON.stringify(p.d)}, fill: ${JSON.stringify(p.fill)} },`
        );
      }
      lines.push(`    ],`);
      // A flattened silhouette, for contexts that want one colour.
      lines.push(
        `    d: ${JSON.stringify(o.parts.map((p) => p.d).join(" "))},`
      );
    } else {
      lines.push(`    d: ${JSON.stringify(o.d)},`);
    }
    lines.push(`  },`);
    return lines.join("\n");
  })
  .join("\n");

const file = `/**
 * GENERATED FILE - do not edit by hand.
 * Regenerate with: node scripts/gen-logos.mjs
 *
 * Real brand marks. Every path is authored against a 24x24 viewBox, which is
 * what lets one pipeline draw them at a consistent weight wherever they appear.
 *
 * \`hex\`     the owner's published brand colour
 * \`onDark\`  what to actually paint on this site's near-black field: the brand
 *           colour when it carries enough luminance, otherwise a warm off-white,
 *           which is how these owners publish their own reversed variants
 * \`parts\`   present only on marks that are genuinely multi-colour
 * \`optical\` size multiplier correcting perceived weight, not box size
 *
 * TRADEMARK NOTE: these marks identify their respective owners and appear here
 * nominatively, to label which equity each tokenized asset tracks. They are not
 * endorsements, and circuit claims no rights in them.
 *
 * Assets with no mark available are listed in NO_MARK and render as a
 * typographic lockup - the site does not invent a logo it does not have.
 */
export interface LogoPart {
  d: string;
  fill: string;
}

export interface LogoMark {
  title: string;
  optical: number;
  hex: string;
  onDark: string;
  d: string;
  parts?: LogoPart[];
}

export const LOGO_VIEWBOX = 24;

export const LOGOS: Record<string, LogoMark> = {
${body}
};

/** Symbols with no reproducible mark; rendered typographically instead. */
export const NO_MARK: readonly string[] = ${JSON.stringify(TYPOGRAPHIC_ONLY)};

export function logo(key: string): LogoMark | undefined {
  return LOGOS[key];
}
`;

writeFileSync(new URL("../src/data/logos.ts", import.meta.url), file, "utf8");
console.log(`wrote ${marks.length} marks -> src/data/logos.ts`);
console.log(
  "reversed to off-white: " +
    marks.filter((m) => m.onDark === REVERSED).map((m) => m.key).join(", ")
);
console.log(`typographic-only: ${TYPOGRAPHIC_ONLY.join(", ")}`);
if (missing.length) console.log(`MISSING upstream: ${missing.join(", ")}`);
