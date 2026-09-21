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

  // Scroll to scroll morph section
  await page.evaluate(() => {
    const el = document.getElementById('sm');
    if (el) el.scrollIntoView();
  });
  await new Promise(r => setTimeout(r, 600));

  for (let i = 0; i < 5; i++) {
    await page.evaluate((idx) => {
      const items = document.querySelectorAll('#sm-rail li');
      if (items && items[idx]) items[idx].click();
    }, i);
    await new Promise(r => setTimeout(r, 1200));

    const info = await page.evaluate(() => {
      const shape = document.getElementById('sm-shape');
      return {
        width: shape.style.width,
        height: shape.style.height,
        borderRadius: shape.style.borderRadius,
        num: document.getElementById('sm-n').textContent,
        cap: document.getElementById('sm-cap').textContent,
        k: shape.style.getPropertyValue('--k')
      };
    });
    console.log(`Format ${i+1}:`, info);
    await page.screenshot({ path: `C:\\Users\\Irshad Patel\\.gemini\\antigravity\\brain\\85db9558-6766-4a64-94a0-c640632a595c\\format_${i+1}_rail.png` });
  }

  await browser.close();
})();
