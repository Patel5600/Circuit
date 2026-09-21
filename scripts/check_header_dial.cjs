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

  const info = await page.evaluate(() => {
    const bar = document.querySelector('.lf-bar');
    const barR = document.querySelector('.lf-bar-r');
    const dialLive = document.querySelector('#dial-live');
    const dial = document.querySelector('#dial');
    const stack = document.querySelector('.stack');
    const track = document.querySelector('#track');

    const getR = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, left: r.left, bottom: r.bottom, right: r.right };
    };

    return {
      bar: getR(bar),
      barR: getR(barR),
      barRChildren: barR ? Array.from(barR.children).map(c => ({
        tag: c.tagName,
        text: c.innerText,
        rect: getR(c),
        pos: window.getComputedStyle(c).position,
        left: window.getComputedStyle(c).left,
        top: window.getComputedStyle(c).top,
        width: window.getComputedStyle(c).width,
        classes: c.className
      })) : [],
      dial: getR(dial),
      dialLive: dialLive ? {
        rect: getR(dialLive),
        pos: window.getComputedStyle(dialLive).position,
        left: window.getComputedStyle(dialLive).left,
        top: window.getComputedStyle(dialLive).top,
        classes: dialLive.className
      } : null,
      stack: getR(stack),
      track: getR(track)
    };
  });

  console.log('DOM Info:\n', JSON.stringify(info, null, 2));

  // Screenshot header
  await page.screenshot({ path: 'C:\\Users\\Irshad Patel\\.gemini\\antigravity\\brain\\85db9558-6766-4a64-94a0-c640632a595c\\header_debug.png' });

  // Scroll to clock dial
  await page.evaluate(() => {
    const d = document.querySelector('#dial');
    if (d) d.scrollIntoView({ block: 'center' });
  });
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: 'C:\\Users\\Irshad Patel\\.gemini\\antigravity\\brain\\85db9558-6766-4a64-94a0-c640632a595c\\clock_debug.png' });

  await browser.close();
})();
