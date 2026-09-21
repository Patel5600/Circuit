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
  await page.goto('file:///' + path.resolve('assests/format-kit-2.html').replace(/\\/g, '/'), { waitUntil: 'networkidle2' });

  await page.evaluate(() => {
    window.scrollTo(0, 5800);
    window.dispatchEvent(new Event('scroll'));
  });
  await new Promise(r => setTimeout(r, 600));

  const res = await page.evaluate(() => {
    const track = document.getElementById('sm');
    const pin = document.querySelector('.sm-pin');
    const shape = document.getElementById('sm-shape');
    const top = parseFloat(getComputedStyle(pin).top) || 0;
    const p = (top - track.getBoundingClientRect().top) / (track.offsetHeight - pin.offsetHeight);
    return {
      p,
      w: shape.style.width,
      h: shape.style.height,
      r: shape.style.borderRadius,
      rot: shape.style.getPropertyValue('--rot'),
      k: shape.style.getPropertyValue('--k'),
      ts: shape.style.getPropertyValue('--ts'),
      num: document.getElementById('sm-n').textContent,
      cap: document.getElementById('sm-cap').textContent,
      shapeHTML: shape.outerHTML
    };
  });
  console.log('Result at 5080:', res);

  const pinEl = await page.$('.sm-pin');
  if (pinEl) {
    await pinEl.screenshot({ path: 'C:\\Users\\Irshad Patel\\.gemini\\antigravity\\brain\\85db9558-6766-4a64-94a0-c640632a595c\\kit2_scroll_morph_exact_5080.png' });
  }
  await page.screenshot({ path: 'C:\\Users\\Irshad Patel\\.gemini\\antigravity\\brain\\85db9558-6766-4a64-94a0-c640632a595c\\kit2_page_exact_5080.png' });
  console.log('Saved screenshots');

  await browser.close();
})();
