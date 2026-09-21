import puppeteer from 'puppeteer-core';

async function run() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-precise-memory-info']
  });

  const page = await browser.newPage();
  page.on('console', msg => console.log(`[BROWSER CONSOLE] ${msg.type()}: ${msg.text()}`));
  page.on('pageerror', err => console.log(`[BROWSER ERROR] ${err.toString()}`));
  page.on('error', err => console.log(`[PAGE CRASH] ${err.toString()}`));

  console.log('Navigating to http://localhost:5173/ ...');
  try {
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 30000 });
    console.log('Page loaded.');
  } catch (e) {
    console.error('Failed to load page:', e.message);
  }

  for (let i = 0; i < 10; i++) {
    const metrics = await page.metrics();
    console.log(`Step ${i}: JSHeapUsed = ${(metrics.JSHeapUsedSize / 1024 / 1024).toFixed(2)} MB / ${(metrics.JSHeapTotalSize / 1024 / 1024).toFixed(2)} MB, Nodes = ${metrics.Nodes}, Layouts = ${metrics.LayoutCount}`);
    await page.evaluate((step) => {
      window.scrollBy(0, 500);
      // simulate mouse move
      const ev = new MouseEvent('pointermove', { clientX: 200 + step * 20, clientY: 200 + step * 20 });
      window.dispatchEvent(ev);
    }, i);
    await new Promise(r => setTimeout(r, 1000));
  }

  await browser.close();
  console.log('Diagnosis complete.');
}

run().catch(console.error);
