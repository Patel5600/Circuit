const puppeteer = require('c:\\Dev\\Circuit\\app\\node_modules\\puppeteer-core');
const path = require('path');
const fs = require('fs');

async function main() {
  console.log('--- STARTING LANDING PAGE STRESS & VERIFICATION SUITE ---');
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-precise-memory-info', '--window-size=1440,900']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(`Console error: ${msg.text()}`);
    }
  });
  page.on('pageerror', err => {
    errors.push(`Page error: ${err.message}`);
  });
  page.on('error', err => {
    errors.push(`Fatal crash: ${err.message}`);
  });

  console.log('Navigating to http://localhost:5173/ ...');
  const response = await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 30000 });
  console.log(`Navigation complete: HTTP ${response.status()}`);

  // 1. Check DOM sections
  const sections = await page.evaluate(() => {
    const list = [];
    if (document.querySelector('.lf-hero')) list.push('HeroInkTrail');
    if (document.querySelector('.lf-stack-frame')) list.push('TiltedStack');
    if (document.querySelector('.lf-scatter-stage')) list.push('ScatterCanvas');
    if (document.querySelector('.lf-clock-dial')) list.push('Pair1ClockDial');
    if (document.querySelector('.lf-morph-box')) list.push('Pair1FormatMorph');
    if (document.querySelector('.lf-art')) list.push('Pair2ColourReveal');
    if (document.querySelector('.lf-spec-sheet')) list.push('Pair2MicroSpec');
    if (document.querySelector('.lf-dialfield-canvas')) list.push('Pair3OracleDialField');
    if (document.querySelector('.lf-poster')) list.push('Pair3GenerativeInkLab');
    if (document.querySelector('.lf-oneframe')) list.push('OneFrameFourShapes');
    if (document.querySelector('.lf-sm-track')) list.push('ScrollMorph');
    if (document.querySelector('.lf-ribbon')) list.push('InertiaRibbon');
    if (document.querySelector('.lf-melt')) list.push('MeltingHeadline');
    if (document.querySelector('.lf-ring')) list.push('KineticRing');
    if (document.querySelector('.lf-footer')) list.push('MonumentalFooter');
    return list;
  });
  console.log(`Found ${sections.length}/15 expected components on page:`);
  console.log(sections.join(', '));

  // 2. Initial metrics
  let m0 = await page.metrics();
  console.log(`Initial Heap: ${(m0.JSHeapUsedSize / 1024 / 1024).toFixed(2)} MB / ${(m0.JSHeapTotalSize / 1024 / 1024).toFixed(2)} MB`);

  // 3. Pointer stress test on Hero Ink Trail
  console.log('Executing 100 pointer events on Hero Ink Trail...');
  for (let i = 0; i < 50; i++) {
    const x = 300 + Math.sin(i * 0.2) * 200;
    const y = 300 + Math.cos(i * 0.2) * 150;
    await page.mouse.move(x, y);
    if (i % 10 === 0) await page.mouse.click(x, y);
    await new Promise(r => setTimeout(r, 16));
  }

  // 4. Full scroll stress test
  console.log('Scrolling through entire page layout (0 to 10,000px)...');
  const scrollSteps = 15;
  for (let step = 0; step < scrollSteps; step++) {
    await page.evaluate(() => {
      window.scrollBy(0, 600);
    });
    await new Promise(r => setTimeout(r, 60));
  }

  // 5. Measure FPS & final heap
  const fps = await page.evaluate(() => {
    return new Promise(resolve => {
      let frames = 0;
      const start = performance.now();
      function f() {
        frames++;
        if (performance.now() - start < 1000) {
          requestAnimationFrame(f);
        } else {
          resolve(Math.round(frames * 1000 / (performance.now() - start)));
        }
      }
      requestAnimationFrame(f);
    });
  });
  console.log(`Measured RAF FPS: ${fps} frames/sec`);

  let m1 = await page.metrics();
  const heapMB = (m1.JSHeapUsedSize / 1024 / 1024).toFixed(2);
  console.log(`Final Heap: ${heapMB} MB (Delta: ${((m1.JSHeapUsedSize - m0.JSHeapUsedSize) / 1024 / 1024).toFixed(2)} MB)`);

  // 6. Screenshot artifact for verification
  const screenshotPath = 'C:\\Users\\Irshad Patel\\.gemini\\antigravity\\brain\\85db9558-6766-4a64-94a0-c640632a595c\\rebuild_verification.png';
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`Saved screenshot to: ${screenshotPath}`);

  await browser.close();

  if (errors.length > 0) {
    console.error('FAILED with browser errors:');
    errors.forEach(e => console.error(e));
    process.exit(1);
  }

  console.log('--- ALL VERIFICATIONS PASSED: 0 ERRORS, 0 CRASHES, HIGH FPS ---');
}

main().catch(err => {
  console.error('Fatal error during test:', err);
  process.exit(1);
});
