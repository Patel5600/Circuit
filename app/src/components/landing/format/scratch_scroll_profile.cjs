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

  const trackMetrics = await page.evaluate(() => {
    const track = document.querySelector('.lf-sm-track') || document.querySelector('#sm');
    const pin = document.querySelector('.lf-sm-pin') || document.querySelector('.sm-pin');
    const melt = document.querySelector('.lf-melt-stage') || document.querySelector('#melt-stage');
    return {
      trackHeight: track ? track.offsetHeight : 0,
      trackTop: track ? track.offsetTop : 0,
      pinHeight: pin ? pin.offsetHeight : 0,
      meltTop: melt ? melt.offsetTop : 0,
      gap: melt && track ? (melt.offsetTop - (track.offsetTop + track.offsetHeight)) : 0
    };
  });
  console.log('Track & Melt metrics:', trackMetrics);

  // Now simulate scrolling from before track to after track
  const startY = trackMetrics.trackTop - 200;
  const endY = trackMetrics.trackTop + trackMetrics.trackHeight + 400;
  console.log(`Simulating scroll from ${startY} to ${endY} in steps of 200px...`);

  for (let y = startY; y <= endY; y += 200) {
    await page.evaluate(sy => window.scrollTo(0, sy), y);
    await new Promise(r => setTimeout(r, 40));
    const step = await page.evaluate(() => {
      const track = document.querySelector('.lf-sm-track') || document.querySelector('#sm');
      const pin = document.querySelector('.lf-sm-pin') || document.querySelector('.sm-pin');
      const shape = document.querySelector('.lf-sm-shape') || document.querySelector('#sm-shape');
      const cap = document.querySelector('.lf-sm-txt strong') || document.querySelector('#sm-cap');
      const bar = document.querySelector('.sm-bar');
      const rect = track.getBoundingClientRect();
      const top = parseFloat(getComputedStyle(pin).top) || 0;
      const scrollable = track.offsetHeight - pin.offsetHeight;
      const p = Math.min(1, Math.max(0, (top - rect.top) / scrollable));
      return {
        scrollY: window.scrollY,
        rectTop: rect.top,
        p: p.toFixed(3),
        name: cap ? cap.innerText : '',
        shapeWidth: shape ? shape.style.width : '',
        shapeHeight: shape ? shape.style.height : '',
        shapeRadius: shape ? shape.style.borderRadius : '',
        pinSticky: getComputedStyle(pin).position
      };
    });
    console.log(`ScrollY ${step.scrollY}: p=${step.p}, name=${step.name}, w=${step.shapeWidth}, h=${step.shapeHeight}, r=${step.shapeRadius}`);
  }

  await browser.close();
})();
