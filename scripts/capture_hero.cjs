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
  await page.waitForFunction(() => !document.getElementById('pre') || document.getElementById('pre').hidden || document.getElementById('pre').classList.contains('out'));
  await new Promise(r => setTimeout(r, 600));

  await page.screenshot({ path: 'C:\\Users\\Irshad Patel\\.gemini\\antigravity\\brain\\85db9558-6766-4a64-94a0-c640632a595c\\hero_current_view.png' });
  console.log('Saved hero_current_view.png');

  await browser.close();
})();
