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

  const artifactDir = 'C:\\Users\\Irshad Patel\\.gemini\\antigravity\\brain\\85db9558-6766-4a64-94a0-c640632a595c';

  const stages = [
    { p: 0.05, name: 'circle', title: '(1) Circle' },
    { p: 0.27, name: 'rounded', title: '(2) Rounded' },
    { p: 0.49, name: 'vertical', title: '(3) Vertical' },
    { p: 0.71, name: 'horizontal', title: '(4) Horizontal' },
    { p: 0.94, name: 'fullframe', title: '(5) Full frame' },
  ];

  for (const st of stages) {
    await page.evaluate((targetP) => {
      const track = document.querySelector('.sm-track');
      const pin = document.querySelector('.sm-pin');
      if (track && pin) {
        const pinTop = parseFloat(getComputedStyle(pin).top) || 64;
        const trackDocTop = window.scrollY + track.getBoundingClientRect().top;
        const scrollable = track.offsetHeight - pin.offsetHeight;
        const targetScroll = trackDocTop - pinTop + scrollable * targetP;
        window.scrollTo(0, targetScroll);
        window.dispatchEvent(new Event('scroll'));
      }
    }, st.p);

    await new Promise(r => setTimeout(r, 400));

    const smPin = await page.$('.sm-pin');
    if (smPin) {
      const snapPath = `${artifactDir}\\morph_stage_${st.name}.png`;
      await smPin.screenshot({ path: snapPath });
      console.log(`Saved ${snapPath}`);
    }
  }

  // Also close up of clock dial
  const clockEl = await page.$('.sm-clock-wrap');
  if (clockEl) {
    const snapPath = `${artifactDir}\\morph_clock_dial_closeup.png`;
    await clockEl.screenshot({ path: snapPath });
    console.log(`Saved ${snapPath}`);
  }

  await browser.close();
})();
