const puppeteer = require('c:\\Dev\\Circuit\\app\\node_modules\\puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('http://localhost:5173/?theme=light', { waitUntil: 'networkidle2' });

  // Scroll to Inertia Ribbon
  await page.evaluate(() => {
    const el = document.querySelector('.ribbon, .lf-ribbon');
    if (el) el.scrollIntoView({ block: 'center' });
  });
  await new Promise(r => setTimeout(r, 600));

  const ribbonEl = await page.$('.ribbon, .lf-ribbon');
  if (ribbonEl) {
    const snapPath = 'C:\\Users\\Irshad Patel\\.gemini\\antigravity\\brain\\85db9558-6766-4a64-94a0-c640632a595c\\ribbon_colored_verified.png';
    await ribbonEl.screenshot({ path: snapPath });
    console.log('Saved ribbon_colored_verified.png');
  }

  // Also screenshot Scroll Morph at p = 0.5 (Vertical)
  await page.evaluate(() => {
    const track = document.querySelector('.sm-track');
    const pin = document.querySelector('.sm-pin');
    if (track && pin) {
      const top = track.offsetTop + (track.offsetHeight - pin.offsetHeight) * 0.45;
      window.scrollTo(0, top);
    }
  });
  await new Promise(r => setTimeout(r, 500));
  const smPin = await page.$('.sm-pin');
  if (smPin) {
    await smPin.screenshot({ path: 'C:\\Users\\Irshad Patel\\.gemini\\antigravity\\brain\\85db9558-6766-4a64-94a0-c640632a595c\\sm_morph_cycle_verified.png' });
    console.log('Saved sm_morph_cycle_verified.png');
  }

  await browser.close();
})();
