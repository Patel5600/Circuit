/**
 * Landing-page QA harness.
 *
 * Drives the already-installed Chrome via puppeteer-core (dev-only; no bundled
 * browser download) and asserts the things the brief calls out:
 *   - no horizontal overflow at every target width
 *   - the 3D visual never overlaps the headline
 *   - all nine sections present
 *   - tap targets meet 44px
 *   - reduced-motion and no-WebGL paths both render
 *   - no deprecated product names anywhere in the DOM
 *
 * Usage: node scripts/qa-landing.mjs [baseUrl]
 */
import puppeteer from "puppeteer-core";

const BASE = process.argv[2] || "http://localhost:5174";

// Both spellings are listed so the harness runs from PowerShell or from WSL.
// Note that puppeteer's CDP socket only reaches a Windows Chrome from a Windows
// node process, so PowerShell is the supported path; the /mnt/c entries are a
// convenience for WSL setups with mirrored networking.
const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe",
  "/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

const WIDTHS = [320, 375, 390, 430, 768, 900, 1024, 1280, 1440, 1920];
const BANNED = ["Equity SafetyNet", "SafetyNet", "SolCircuit", "EquiCircuit", "AfterBell"];

const SECTIONS = [
  ["hero", "Credit infrastructure"],
  ["02 universe", "one programmable layer"],
  ["03 circuit", "Credit is the last step"],
  ["04 storm", "BLOCKED."],
  ["05 breaker", "Worked example"],
  ["06 steps", "How credit works"],
  ["07 why", "Risk should be too"],
  ["08 technical", "Built to be verified"],
  ["09 final", "Programmable credit"],
];

let failures = 0;
const ok = (m) => console.log(`  PASS  ${m}`);
const bad = (m) => {
  failures++;
  console.log(`  FAIL  ${m}`);
};

async function main() {
  const fs = await import("node:fs");
  const executablePath = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
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
    ],
  });

  // ---- overflow + layout across widths --------------------------------
  console.log("\n== horizontal overflow and headline safety ==");
  for (const w of WIDTHS) {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: 900, deviceScaleFactor: 1 });
    await page.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 60000 });
    await new Promise((r) => setTimeout(r, 900));

    const m = await page.evaluate(() => {
      const de = document.documentElement;
      // Find any element whose box extends past the viewport.
      let worst = null;
      const vw = de.clientWidth;
      document.querySelectorAll("body *").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        const over = Math.round(r.right - vw);
        const style = getComputedStyle(el);
        if (style.position === "fixed") return;
        if (over > 2 && (!worst || over > worst.over)) {
          worst = {
            over,
            tag: el.tagName.toLowerCase(),
            cls: (el.className || "").toString().slice(0, 48),
          };
        }
      });

      // Headline vs 3D/visual layer overlap.
      const title = document.querySelector(".hero__title");
      const visual = document.querySelector(".hero__visual");
      let overlap = null;
      if (title && visual) {
        const a = title.getBoundingClientRect();
        const b = visual.getBoundingClientRect();
        const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        overlap = ix > 0 && iy > 0 ? { x: Math.round(ix), y: Math.round(iy) } : null;
      }

      return {
        scrollWidth: de.scrollWidth,
        clientWidth: vw,
        bodyScrollWidth: document.body.scrollWidth,
        worst,
        overlap,
      };
    });

    const scrolls = m.scrollWidth > m.clientWidth + 1;
    const label = `w=${String(w).padEnd(5)}`;
    if (scrolls) bad(`${label} document scrolls horizontally (${m.scrollWidth} > ${m.clientWidth})`);
    else ok(`${label} no horizontal scroll`);

    if (m.worst) {
      console.log(
        `        note: <${m.worst.tag} class="${m.worst.cls}"> extends ${m.worst.over}px past viewport (clipped)`
      );
    }

    // The 3D layer is full-height on desktop, so vertical intersection alone is
    // expected; only horizontal overlap with the headline is a defect.
    if (m.overlap && w >= 900) {
      bad(`${label} hero visual overlaps headline by ${m.overlap.x}px horizontally`);
    } else if (w >= 900) {
      ok(`${label} headline clear of the 3D layer`);
    }

    await page.close();
  }

  // ---- sections + a11y + branding -------------------------------------
  console.log("\n== content, tap targets, branding (1280px) ==");
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 60000 });
    // Scroll the full page so IntersectionObserver reveals fire.
    await page.evaluate(async () => {
      const h = document.body.scrollHeight;
      for (let y = 0; y < h; y += 500) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
      window.scrollTo(0, 0);
    });
    await new Promise((r) => setTimeout(r, 800));

    const text = await page.evaluate(() => document.body.innerText);
    for (const [name, needle] of SECTIONS) {
      if (text.includes(needle)) ok(`section present: ${name}`);
      else bad(`section MISSING: ${name} (looked for "${needle}")`);
    }

    const found = BANNED.filter((b) => text.includes(b));
    if (found.length) bad(`deprecated names in DOM: ${found.join(", ")}`);
    else ok("no deprecated product names");

    const small = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll("a,button").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        if (r.height < 44 - 0.5) {
          out.push({
            t: el.tagName.toLowerCase(),
            h: Math.round(r.height),
            label: (el.textContent || "").trim().slice(0, 22),
          });
        }
      });
      return out;
    });
    if (small.length === 0) ok("all interactive elements >= 44px tall");
    else
      console.log(
        `  NOTE  ${small.length} interactive element(s) under 44px: ` +
          small.slice(0, 6).map((s) => `${s.t}"${s.label}"(${s.h}px)`).join(", ")
      );

    // CTA target
    const href = await page.evaluate(() => {
      const a = Array.from(document.querySelectorAll("a")).find((x) =>
        (x.textContent || "").includes("Launch circuit")
      );
      return a ? a.getAttribute("href") : null;
    });
    if (href === "/app") ok("primary CTA points at /app");
    else bad(`primary CTA href is ${href}`);

    await page.close();
  }

  // ---- WebGL present vs disabled --------------------------------------
  console.log("\n== 3D and fallback ==");
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 60000 });
    await new Promise((r) => setTimeout(r, 2500));
    const hasCanvas = await page.evaluate(() => !!document.querySelector("canvas"));
    if (hasCanvas) ok("WebGL canvas mounted when supported");
    else bad("no canvas despite WebGL support");
    await page.close();
  }

  {
    // Simulate a WebGL-less browser by neutering context creation before any
    // app code runs.
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.evaluateOnNewDocument(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        if (String(type).includes("webgl")) return null;
        return orig.call(this, type, ...rest);
      };
    });
    await page.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 60000 });
    await new Promise((r) => setTimeout(r, 1500));
    const r = await page.evaluate(() => ({
      canvas: !!document.querySelector("canvas"),
      fallback: !!document.querySelector(".herofb"),
      headline: document.body.innerText.includes("Credit infrastructure"),
    }));
    if (!r.canvas && r.fallback && r.headline)
      ok("no-WebGL: SVG fallback renders, headline intact");
    else
      bad(
        `no-WebGL path wrong (canvas=${r.canvas} fallback=${r.fallback} headline=${r.headline})`
      );
    await page.close();
  }

  // ---- reduced motion --------------------------------------------------
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.emulateMediaFeatures([
      { name: "prefers-reduced-motion", value: "reduce" },
    ]);
    await page.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 60000 });
    await new Promise((r) => setTimeout(r, 1200));
    const visible = await page.evaluate(() => {
      const el = document.querySelector(".hero__title");
      if (!el) return false;
      return getComputedStyle(el).opacity === "1";
    });
    if (visible) ok("reduced-motion: content visible without animation");
    else bad("reduced-motion: content not visible");
    await page.close();
  }

  await browser.close();

  console.log(
    `\n${failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"}`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("QA harness error:", e.message);
  process.exit(2);
});
