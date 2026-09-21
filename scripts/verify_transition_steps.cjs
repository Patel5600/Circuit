const puppeteer = require('c:\\Dev\\Circuit\\app\\node_modules\\puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });

  const pValues = [0.68, 0.74, 0.80, 0.86, 0.92];
  for (const targetP of pValues) {
    const info = await page.evaluate((p) => {
      const track = document.getElementById('sm');
      const pin = document.querySelector('.sm-pin');
      const shape = document.getElementById('sm-shape');
      if (track && pin && shape) {
        const top = parseFloat(getComputedStyle(pin).top) || 0;
        const trackTop = track.getBoundingClientRect().top + window.scrollY;
        const maxScroll = track.offsetHeight - pin.offsetHeight;
        const targetScrollY = trackTop - top + p * maxScroll;
        window.scrollTo(0, targetScrollY);
        window.dispatchEvent(new Event('scroll'));
        return {
          p,
          width: shape.style.width,
          height: shape.style.height,
          borderRadius: shape.style.borderRadius,
          rot: shape.style.getPropertyValue('--rot'),
          k: shape.style.getPropertyValue('--k')
        };
      }
      return null;
    }, targetP);

    await new Promise(r => setTimeout(r, 400));
    console.log(`p=${targetP}:`, JSON.stringify(info));
    await page.screenshot({ path: `C:\\Users\\Irshad Patel\\.gemini\\antigravity\\brain\\85db9558-6766-4a64-94a0-c640632a595c\\trans_step_${Math.round(targetP * 100)}.png` });
  }

  await browser.close();
})();
