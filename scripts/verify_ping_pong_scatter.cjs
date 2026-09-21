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
  await new Promise(r => setTimeout(r, 400));

  // 1. Verify continuous ping-pong motion
  const pos1 = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('#scatter .card'));
    return cards.map(c => ({
      id: c.dataset.id,
      cls: c.className,
      x: c.style.getPropertyValue('--x'),
      y: c.style.getPropertyValue('--y')
    }));
  });

  await new Promise(r => setTimeout(r, 200));

  const pos2 = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('#scatter .card'));
    return cards.map(c => ({
      id: c.dataset.id,
      cls: c.className,
      x: c.style.getPropertyValue('--x'),
      y: c.style.getPropertyValue('--y')
    }));
  });

  const isMoving = pos1.some((p1, idx) => {
    const p2 = pos2[idx];
    return p2 && (p1.x !== p2.x || p1.y !== p2.y);
  });
  console.log('Cards are moving continuously:', isMoving);
  console.log('Sample Card 0 before:', pos1[0], 'after 200ms:', pos2[0]);

  // 2. Click inside canvas to drop mini assets
  const initialCount = pos2.length;
  console.log('Initial card count:', initialCount);

  // Click 5 times at different locations to drop mini assets
  const clickPositions = [
    { x: 300, y: 300 },
    { x: 500, y: 400 },
    { x: 700, y: 350 },
    { x: 900, y: 450 },
    { x: 400, y: 550 }
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
    const miniCards = Array.from(document.querySelectorAll('#scatter .card.k-mini'));
    return {
      total: cards.length,
      miniTotal: miniCards.length,
      miniClasses: miniCards.map(c => c.className),
      miniTitles: miniCards.map(c => {
        const b = c.querySelector('.meta b');
        return b ? b.textContent : c.innerText.slice(0, 20);
      })
    };
  });

  console.log('After clicks evaluation:\n', JSON.stringify(afterClicks, null, 2));

  // Capture screenshot showing multiple bouncing cards and dropped mini assets
  await page.screenshot({
    path: 'C:\\Users\\Irshad Patel\\.gemini\\antigravity\\brain\\85db9558-6766-4a64-94a0-c640632a595c\\scatter_ping_pong_active.png'
  });

  const scatterEl = await page.$('#scatter-lab');
  if (scatterEl) {
    await scatterEl.screenshot({
      path: 'C:\\Users\\Irshad Patel\\.gemini\\antigravity\\brain\\85db9558-6766-4a64-94a0-c640632a595c\\scatter_section_ping_pong.png'
    });
    console.log('Scatter section screenshot saved');
  }

  // 3. Test bounce limit disappearance: simulate boundary bounces
  const bounceTest = await page.evaluate(async () => {
    const scatter = document.querySelector('#scatter');
    // Drop a test card
    const rect = scatter.getBoundingClientRect();
    scatter.dispatchEvent(new MouseEvent('click', {
      clientX: rect.left + 50,
      clientY: rect.top + 50,
      bubbles: true
    }));
    await new Promise(r => setTimeout(r, 1500));
    return {
      activeCardsCount: document.querySelectorAll('#scatter .card').length,
      fadingCardsCount: document.querySelectorAll('#scatter .card.fading').length
    };
  });
  console.log('Bounce test check:', bounceTest);

  await browser.close();
})();
