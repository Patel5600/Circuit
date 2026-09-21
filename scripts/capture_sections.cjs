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

  // 1. Ribbon
  const ribbon = await page.$('.lf-ribbon-stage');
  if (ribbon) {
    await ribbon.screenshot({ path: 'C:\\Users\\Irshad Patel\\.gemini\\antigravity\\brain\\85db9558-6766-4a64-94a0-c640632a595c\\ribbon_element.png' });
    console.log('Ribbon element captured');
  }

  // 2. Pair 2 (Colour Reveal & Micro Spec)
  const pair2 = await page.$('[data-note*="Pair 2"]');
  if (pair2) {
    await pair2.screenshot({ path: 'C:\\Users\\Irshad Patel\\.gemini\\antigravity\\brain\\85db9558-6766-4a64-94a0-c640632a595c\\pair2_element.png' });
    console.log('Pair 2 element captured');
  }

  // 3. Pair 3 (Oracle Dial Field & Generative Ink Lab)
  const pair3 = await page.$('[data-note*="Pair 3"]');
  if (pair3) {
    await pair3.screenshot({ path: 'C:\\Users\\Irshad Patel\\.gemini\\antigravity\\brain\\85db9558-6766-4a64-94a0-c640632a595c\\pair3_element.png' });
    console.log('Pair 3 element captured');
  }

  // 4. Kinetic Ring
  const ring = await page.$('.lf-ring-stage');
  if (ring) {
    await ring.screenshot({ path: 'C:\\Users\\Irshad Patel\\.gemini\\antigravity\\brain\\85db9558-6766-4a64-94a0-c640632a595c\\ring_element.png' });
    console.log('Ring element captured');
  }

  // 5. Melting Headline
  const melt = await page.$('.lf-melt-stage');
  if (melt) {
    await melt.screenshot({ path: 'C:\\Users\\Irshad Patel\\.gemini\\antigravity\\brain\\85db9558-6766-4a64-94a0-c640632a595c\\melt_element.png' });
    console.log('Melt element captured');
  }

  await browser.close();
  console.log('All elements captured.');
})();
