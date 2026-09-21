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
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'auto';
  });

  const artifactDir = 'C:\\Users\\Irshad Patel\\.gemini\\antigravity\\brain\\85db9558-6766-4a64-94a0-c640632a595c';

  const stages = [
    { p: 0.05, name: 'circle' },
    { p: 0.28, name: 'rounded' },
    { p: 0.50, name: 'vertical' },
    { p: 0.72, name: 'horizontal' },
    { p: 0.96, name: 'fullframe' },
  ];

  for (const st of stages) {
    await page.evaluate((targetP) => {
      const track = document.querySelector('#sm');
      const pin = document.querySelector('.sm-pin');
      const top = parseFloat(getComputedStyle(pin).top) || 84;
      const scrollable = track.offsetHeight - pin.offsetHeight;
      const docTop = window.scrollY + track.getBoundingClientRect().top;
      window.scrollTo(0, docTop - top + scrollable * targetP);
    }, st.p);
    await new Promise(r => setTimeout(r, 250));

    const smPin = await page.$('.sm-pin');
    if (smPin) {
      const snapPath = `${artifactDir}\\kit2_strict_${st.name}.png`;
      await smPin.screenshot({ path: snapPath });
      console.log('Saved', snapPath);
    }
  }

  // Snapshot the unpin transition to Melting headline
  await page.evaluate(() => {
    const track = document.querySelector('#sm');
    const pin = document.querySelector('.sm-pin');
    const top = parseFloat(getComputedStyle(pin).top) || 84;
    const scrollable = track.offsetHeight - pin.offsetHeight;
    const docTop = window.scrollY + track.getBoundingClientRect().top;
    window.scrollTo(0, docTop - top + scrollable + 200);
  });
  await new Promise(r => setTimeout(r, 250));
  await page.screenshot({ path: `${artifactDir}\\kit2_sm_to_melt_seamless.png` });
  console.log('Saved kit2_sm_to_melt_seamless.png');

  await browser.close();
})();
