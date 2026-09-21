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

  // Scroll to scatter canvas
  await page.evaluate(() => {
    const el = document.querySelector('#scatter-lab');
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
  });
  await new Promise(r => setTimeout(r, 600));

  // 1. Check initial cards
  const initialCards = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('#scatter .card'));
    return cards.map(c => ({
      id: c.dataset.id,
      type: c.dataset.type,
      cls: c.className,
      rect: {
        w: c.offsetWidth,
        h: c.offsetHeight
      },
      title: c.querySelector('.real-card-meta b') ? c.querySelector('.real-card-meta b').textContent : ''
    }));
  });

  console.log('Initial cards count:', initialCards.length);
  console.log('Initial cards details:\n', JSON.stringify(initialCards, null, 2));

  // 2. Verify motion
  const posA = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('#scatter .card')).map(c => ({
      id: c.dataset.id,
      x: c.style.getPropertyValue('--x'),
      y: c.style.getPropertyValue('--y')
    }));
  });

  await new Promise(r => setTimeout(r, 250));

  const posB = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('#scatter .card')).map(c => ({
      id: c.dataset.id,
      x: c.style.getPropertyValue('--x'),
      y: c.style.getPropertyValue('--y')
    }));
  });

  const moving = posA.some((p1, idx) => {
    const p2 = posB[idx];
    return p2 && (p1.x !== p2.x || p1.y !== p2.y);
  });
  console.log('Are cards moving continuously (ping-pong):', moving);

  // 3. Drop more cards by clicking
  const clickPositions = [
    { x: 350, y: 250 },
    { x: 650, y: 350 },
    { x: 950, y: 300 }
  ];

  for (const pos of clickPositions) {
    await page.evaluate((p) => {
      const scatter = document.querySelector('#scatter');
      if (scatter) {
        const rect = scatter.getBoundingClientRect();
        scatter.dispatchEvent(new MouseEvent('click', {
          clientX: rect.left + p.x,
          clientY: rect.top + p.y,
          bubbles: true
        }));
      }
    }, pos);
    await new Promise(r => setTimeout(r, 100));
  }

  const afterClicks = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('#scatter .card'));
    return {
      total: cards.length,
      types: cards.map(c => c.dataset.type),
      titles: cards.map(c => c.querySelector('.real-card-meta b')?.textContent || '')
    };
  });
  console.log('After clicks evaluation:\n', JSON.stringify(afterClicks, null, 2));

  // Capture screenshot of live ping-pong cards
  const scatterEl = await page.$('#scatter-lab');
  if (scatterEl) {
    await scatterEl.screenshot({
      path: 'C:\\Users\\Irshad Patel\\.gemini\\antigravity\\brain\\85db9558-6766-4a64-94a0-c640632a595c\\real_components_scatter_ping_pong.png'
    });
    console.log('Real components scatter screenshot saved');
  }

  await browser.close();
})();
