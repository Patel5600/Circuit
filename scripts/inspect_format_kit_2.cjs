const puppeteer = require('c:\\Dev\\Circuit\\app\\node_modules\\puppeteer-core');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const filePath = 'file:///' + path.resolve('assests/format-kit-2.html').replace(/\\/g, '/');
  await page.goto(filePath, { waitUntil: 'networkidle2' });

  // Find scroll position where p = 0.96
  await page.evaluate(() => {
    const track = document.getElementById('sm');
    const pin = document.querySelector('.sm-pin');
    const top = parseFloat(getComputedStyle(pin).top) || 0;
    const trackTop = track.getBoundingClientRect().top + window.scrollY;
    const scrollable = track.offsetHeight - pin.offsetHeight;
    const targetScrollY = trackTop - top + 0.96 * scrollable;
    window.scrollTo(0, targetScrollY);
  });
  await new Promise(r => setTimeout(r, 600));

  const pVal = await page.evaluate(() => {
    const track = document.getElementById('sm');
    const pin = document.querySelector('.sm-pin');
    const top = parseFloat(getComputedStyle(pin).top) || 0;
    const p = (top - track.getBoundingClientRect().top) / (track.offsetHeight - pin.offsetHeight);
    const shape = document.getElementById('sm-shape');
    return {
      p,
      width: shape.style.width,
      height: shape.style.height,
      borderRadius: shape.style.borderRadius,
      innerHTML: shape.innerHTML,
      stageHTML: document.querySelector('.sm-stage').outerHTML
    };
  });

  console.log('pVal:', pVal.p, 'w:', pVal.width, 'h:', pVal.height, 'r:', pVal.borderRadius);

  // Take screenshot of .sm-pin
  const pinEl = await page.$('.sm-pin');
  if (pinEl) {
    await pinEl.screenshot({ path: 'C:\\Users\\Irshad Patel\\.gemini\\antigravity\\brain\\85db9558-6766-4a64-94a0-c640632a595c\\format_kit_2_exact_fullframe.png' });
    console.log('Saved format_kit_2_exact_fullframe.png');
  }

  // Also full page screenshot
  await page.screenshot({ path: 'C:\\Users\\Irshad Patel\\.gemini\\antigravity\\brain\\85db9558-6766-4a64-94a0-c640632a595c\\format_kit_2_exact_page.png' });
  console.log('Saved format_kit_2_exact_page.png');

  await browser.close();
})();
