const puppeteer = require('c:\\Dev\\Circuit\\app\\node_modules\\puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--window-size=1440,900']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });

  // Scroll into view of the section
  await page.evaluate(() => {
    const el = document.querySelector('[data-note="Clock dial + Tilted type stack"]');
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
  });
  await new Promise(r => setTimeout(r, 600));

  const el = await page.$('[data-note="Clock dial + Tilted type stack"]');
  if (el) {
    await el.screenshot({
      path: 'C:\\Users\\Irshad Patel\\.gemini\\antigravity\\brain\\85db9558-6766-4a64-94a0-c640632a595c\\clock_and_stack_fixed.png'
    });
    console.log('Clock and stack element captured');
  }

  // Also capture full viewport when looking at this section
  await page.screenshot({
    path: 'C:\\Users\\Irshad Patel\\.gemini\\antigravity\\brain\\85db9558-6766-4a64-94a0-c640632a595c\\clock_viewport_fixed.png'
  });

  await browser.close();
})();
