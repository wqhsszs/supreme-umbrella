const { chromium } = require('playwright-core');
const BASE = 'C:/Users/翁启航/WorkBuddy/2026-10-23-11-57-14/mingbaiban/upgrades/B/delivery';
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await p.goto('file:///' + BASE + '/sources/cover.html', { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  await p.screenshot({ path: BASE + '/07_明白办_视频封面.png' });
  console.log('cover ok');
  await b.close();
})();
