/* 只重录 P6（朗读段）：含点击前诊断，确保控制键真的出现 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const URL = 'https://mingbaiban-42482.app.workbuddy.host/?sharecode=QCZF2UKNAG&cb=c7p6';
const ROOT = path.resolve(__dirname, '..', 'delivery', 'assets', 'recordings');
const OUT = path.join(ROOT, 'P6-speech');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: false,
    args: ['--no-proxy-server', '--autoplay-policy=no-user-gesture-required', '--window-size=1000,780'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.MBB_CONFIG && window.MBB_CONFIG.appVersion === '1.3.0-c7', null, { timeout: 25000 });
  await page.click('.btn-sample[data-sample="0"]');
  await page.click('#btnAnalyze');
  await page.waitForSelector('#stepResult:not([hidden])', { timeout: 90000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => document.getElementById('speechCard').scrollIntoView({ block: 'center' }));
  await sleep(900);

  const cdp = await ctx.newCDPSession(page);
  let idx = 0;
  cdp.on('Page.screencastFrame', async (ev) => {
    fs.writeFileSync(path.join(OUT, String(idx).padStart(5, '0') + '.jpg'), Buffer.from(ev.data, 'base64'));
    idx++;
    try { await cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }); } catch (e) {}
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 82, maxWidth: 780, maxHeight: 1690, everyNthFrame: 1 });

  const startWall = Date.now();
  for (let i = 0; i < 32; i++) { await sleep(500); }   // ≈16s 旁白
  const pre = await page.evaluate(() => ({
    supported: window.MBBSpeech.supported(),
    disabled: document.getElementById('btnSpeak').disabled,
    zh: window.MBBSpeech.zhVoices().length
  }));
  console.log('PRE', JSON.stringify(pre));
  const speakStart = Date.now();
  await page.click('#btnSpeak');
  await sleep(1500);
  const after = await page.evaluate(() => ({ status: window.MBBSpeech.status(),
    controls: !document.getElementById('speechControls').hidden,
    btnHidden: document.getElementById('btnSpeak').hidden,
    err: document.getElementById('speechError').textContent }));
  console.log('AFTER', JSON.stringify(after));
  await sleep(16500);
  const speakEnd = Date.now();
  await page.evaluate(() => { const b = document.getElementById('btnStopSpeak'); if (b) b.click(); });
  await sleep(800);
  await cdp.send('Page.stopScreencast').catch(() => {});
  fs.writeFileSync(path.join(ROOT, 'p6.json'), JSON.stringify({
    wall: (speakEnd - startWall) / 1000, frames: idx, speakStart, speakEnd, pre, after
  }, null, 2));
  console.log('P6 done frames', idx, 'wall', ((speakEnd - startWall) / 1000).toFixed(1));
  await browser.close();
})();
