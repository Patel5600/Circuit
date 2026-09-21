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

  // Scroll down to ScrollMorphSection
  await page.evaluate(() => {
    const el = document.getElementById('sm');
    if (el) el.scrollIntoView();
  });
  await new Promise(r => setTimeout(r, 600));

  // Click on Safe State in rail
  await page.evaluate(() => {
    const items = document.querySelectorAll('#sm-rail li');
    if (items && items[4]) {
      items[4].click();
    }
  });
  await new Promise(r => setTimeout(r, 1200));

  // Also verify shape dimensions
  const dims = await page.evaluate(() => {
    const shape = document.getElementById('sm-shape');
    const pin = document.querySelector('.sm-pin');
    const bShape = shape ? shape.getBoundingClientRect() : null;
    const bPin = pin ? pin.getBoundingClientRect() : null;
    const style = shape ? {
      width: shape.style.width,
      height: shape.style.height,
      borderRadius: shape.style.borderRadius,
      rot: shape.style.getPropertyValue('--rot'),
      k: shape.style.getPropertyValue('--k'),
    } : null;
    return { bShape, bPin, style };
  });
  console.log('Shape dimensions:', JSON.stringify(dims, null, 2));

  await page.screenshot({ path: 'C:\\Users\\Irshad Patel\\.gemini\\antigravity\\brain\\85db9558-6766-4a64-94a0-c640632a595c\\safestate_fullframe_verified.png' });
  console.log('Saved safestate_fullframe_verified.png');

  await browser.close();
})();
