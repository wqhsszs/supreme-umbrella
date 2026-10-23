const { chromium } = require('playwright-core');
const BASE = 'C:/Users/翁启航/WorkBuddy/2026-10-23-11-57-14/mingbaiban/upgrades/B/delivery';
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const jobs = [
    ['sources/flow-public.html', '11_公众版四步图.png', 1400, 700],
    ['sources/flow-tech.html', '11_技术实现图.png', 1500, 700]
  ];
  for (const [src, out, w, h] of jobs) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    await p.goto('file:///' + BASE + '/' + src, { waitUntil: 'networkidle' });
    await p.waitForTimeout(500);
    await p.screenshot({ path: BASE + '/' + out });
    console.log(out, 'ok');
    await p.close();
  }
  await b.close();
})();
