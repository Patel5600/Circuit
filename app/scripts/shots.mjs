/**
 * Screenshot rig for art-directing the landing page.
 *
 * Renders the page in the installed Chrome via puppeteer-core and writes PNGs to
 * app/.shots/. Used to check the composition against the brief - crop of the
 * wheel, clearance around the headline, node spacing - rather than guessing from
 * the numbers.
 *
 * Run from PowerShell (not WSL): a Windows Chrome's CDP socket is not reachable
 * from a WSL node process.
 *
 *   node scripts/shots.mjs [baseUrl] [--full]
 */
import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const BASE = process.argv.find((a) => a.startsWith("http")) || "http://localhost:5174";
const FULL = process.argv.includes("--full");
const OUT = new URL("../.shots/", import.meta.url);

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

/** [label, width, height] */
const SHOTS = FULL
  ? [
      ["full-1440", 1440, 900],
      ["full-390", 390, 844],
    ]
  : [
      ["hero-1920", 1920, 1080],
      ["hero-1440", 1440, 900],
      ["hero-1280", 1280, 800],
      ["hero-1024", 1024, 768],
      ["hero-768", 768, 1024],
      ["hero-390", 390, 844],
    ];

async function main() {
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

  const executablePath = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!executablePath) throw new Error("no Chrome or Edge found");

  const browser = await puppeteer.launch({
    executablePath,
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-gpu",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--hide-scrollbars",
    ],
  });

  for (const [label, w, h] of SHOTS) {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(() => {
      window.__circuitProbe = true;
    });

    page.on("pageerror", (e) => console.log(`  [pageerror] ${e.message}`));
    page.on("console", (msg) => {
      if (msg.type() === "error" || msg.type() === "warning") {
        console.log(`  [${msg.type()}] ${msg.text().slice(0, 200)}`);
      }
    });

    // The dev server holds an HMR websocket open, so networkidle never fires.
    // The generous timeout is for a cold Vite dev server transforming the module
    // graph across the WSL filesystem boundary, which is slow on the first hit.
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 240000 });
    await page.waitForSelector(".hero__title", { timeout: 120000 });

    // Let the staged intro finish; it runs 3.4s.
    await new Promise((r) => setTimeout(r, 6000));

    if (FULL) {
      await page.evaluate(async () => {
        const height = document.body.scrollHeight;
        for (let y = 0; y < height; y += 420) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 70));
        }
        window.scrollTo(0, 0);
      });
      await new Promise((r) => setTimeout(r, 900));
    }

    const file = fileURLToPath(new URL(`${label}.png`, OUT));
    await page.screenshot({ path: file, fullPage: FULL });

    // Report the geometry the hero's layout contract depends on.
    const m = await page.evaluate(() => {
      const lp = document.querySelector(".lp");
      const copy = document.querySelector(".hero__copy");
      const title = document.querySelector(".hero__title");
      const visual = document.querySelector(".hero__visual");

      // Custom properties come back as their unresolved token stream, so resolve
      // the calc() by letting layout do it on a throwaway element.
      const resolve = (name) => {
        if (!lp) return null;
        const probe = document.createElement("div");
        probe.style.cssText = `position:absolute;visibility:hidden;height:0;width:var(${name})`;
        lp.appendChild(probe);
        const w = probe.getBoundingClientRect().width;
        probe.remove();
        return Math.round(w);
      };

      const vr = visual?.getBoundingClientRect();
      const heroEl = document.querySelector(".hero");
      const innerEl = document.querySelector(".hero__inner");
      const eyebrow = document.querySelector(".hero__eyebrow");
      const top = (el) => (el ? Math.round(el.getBoundingClientRect().top) : null);
      const padTop = (el) =>
        el ? Math.round(parseFloat(getComputedStyle(el).paddingTop)) : null;

      return {
        copyRight: copy ? Math.round(copy.getBoundingClientRect().right) : null,
        titleTop: top(title),
        veilClear: resolve("--veil-clear"),
        navH: resolve("--nav-h"),
        visual: vr ? `${Math.round(vr.x)}+${Math.round(vr.width)}` : "none",
        orbits: document.querySelectorAll(".orbit__node").length,
        uniRings: document.querySelectorAll(".uniorb__ring").length,
        // Where the top gap actually comes from.
        chain:
          `hero(pt=${padTop(heroEl)},top=${top(heroEl)}) ` +
          `inner(pt=${padTop(innerEl)},top=${top(innerEl)}) ` +
          `copy(top=${top(copy)}) eyebrow(top=${top(eyebrow)})`,
      };
    });

    // The veil contract is a desktop concern only: below 1024px the hero is a
    // vertical stack, copy above and orbit below, with a top fade instead.
    const ok =
      w < 1024 || m.copyRight == null || m.veilClear == null
        ? null
        : m.copyRight <= m.veilClear;

    console.log(
      `${label.padEnd(11)} copyRight=${String(m.copyRight).padStart(5)} ` +
        `veilClear=${String(m.veilClear).padStart(5)} ` +
        `${ok === null ? "" : ok ? "CONTRACT ok " : "CONTRACT VIOLATED "}` +
        `nav=${m.navH} visual=${m.visual} heroNodes=${m.orbits}`
    );
    console.log(`            ${m.chain}`);

    await page.close();
  }

  await browser.close();
  console.log(`\nwrote ${SHOTS.length} shot(s) to app/.shots/`);
}

main().catch((e) => {
  console.error("shots failed:", e.message);
  process.exit(1);
});
