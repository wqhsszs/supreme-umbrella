/* C 轮真实操作录屏（有界面 Edge + CDP 抓帧）
 *
 * 为什么要“有界面”：朗读那一段要录到系统真实播放的声音，
 * headless 浏览器没有音频输出，录不到。
 *
 * 分镜与旁白一一对应；朗读段会额外记录 speakStart / speakEnd，
 * 供合成时从环回录音里精确裁出产品朗读的原声。
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const URL = process.argv[2] || 'https://mingbaiban-42482.app.workbuddy.host/?sharecode=QCZF2UKNAG';
const EXPECT = process.argv[3] || '1.3.0-c7';
const ROOT = path.resolve(__dirname, 'delivery', 'assets', 'recordings');
const SAMPLES = path.resolve(__dirname, 'delivery', 'assets', 'ocr-samples');
fs.mkdirSync(ROOT, { recursive: true });

const timing = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'delivery', 'assets', 'audio', 'narration-timing.json'), 'utf8'));
const S = {};
timing.segments.forEach((x) => { S[x.id] = x.seconds; });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({
    channel: 'msedge', headless: false,
    args: ['--no-proxy-server', '--autoplay-policy=no-user-gesture-required', '--window-size=1000,780']
  });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction((v) => window.MBB_CONFIG && window.MBB_CONFIG.appVersion === v, EXPECT, { timeout: 40000 });
  await page.waitForFunction(() => window.__MBB && window.MBBOCR && window.MBBSpeech, null, { timeout: 20000 });

  const cdp = await ctx.newCDPSession(page);
  let phase = null, idx = 0;
  const phases = [];
  global.__PHASES__ = phases;
  const dir = (name) => { const d = path.join(ROOT, name); fs.mkdirSync(d, { recursive: true }); return d; };

  cdp.on('Page.screencastFrame', async (ev) => {
    if (phase) {
      fs.writeFileSync(path.join(ROOT, phase.name, String(idx).padStart(5, '0') + '.jpg'), Buffer.from(ev.data, 'base64'));
      phase.frames.push({ i: idx, t: ev.metadata.timestamp });
      idx++;
    }
    try { await cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }); } catch (e) {}
  });

  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 82, maxWidth: 780, maxHeight: 1690, everyNthFrame: 1 });

  async function begin(name) {
    idx = 0;
    phase = { name, frames: [], startWall: Date.now() };
    dir(name);
  }
  async function padTo(targetSec) {
    let left = targetSec * 1000 - (Date.now() - phase.startWall);
    while (left > 0) {
      const step = Math.min(500, left);
      await page.evaluate((dy) => window.scrollBy({ top: dy, behavior: 'smooth' }), (Math.random() > 0.5 ? 1 : -1) * 18).catch(() => {});
      await sleep(step);
      left = targetSec * 1000 - (Date.now() - phase.startWall);
    }
  }
  async function end(extra) {
    phase.endWall = Date.now();
    phases.push(Object.assign({ name: phase.name, frames: phase.frames.length, wall: (phase.endWall - phase.startWall) / 1000 }, extra || {}));
    phase = null;
    await sleep(120);
  }

  async function waitResult() {
    await page.waitForSelector('#stepResult:not([hidden]), #stepError:not([hidden]), #stepNotNotice:not([hidden])', { timeout: 120000 });
    let tries = 1;
    while (tries < 3 && await page.evaluate(() => !document.getElementById('stepError').hidden)) {
      tries++;
      await page.click('#btnRetry');
      await page.waitForSelector('#stepResult:not([hidden]), #stepError:not([hidden]), #stepNotNotice:not([hidden])', { timeout: 120000 });
    }
  }

  async function uploadAndOcr(file) {
    await page.click('#tabImage');
    await page.setInputFiles('#imageInput', path.join(SAMPLES, file));
    await page.waitForSelector('#imagePreviewCard:not([hidden])', { timeout: 20000 });
    await sleep(900);
    await page.click('#btnOcr');
    await page.waitForSelector('#ocrReview:not([hidden]), #ocrError:not([hidden])', { timeout: 120000 });
    await sleep(700);
  }

  async function toHome() {
    const st = await page.evaluate(() => ({
      result: !document.getElementById('stepResult').hidden,
      input: !document.getElementById('stepInput').hidden,
      error: !document.getElementById('stepError').hidden,
      notNotice: !document.getElementById('stepNotNotice').hidden
    }));
    if (st.input) return;
    if (st.result) await page.click('#btnNewNotice');
    else if (st.notNotice) await page.click('#btnBackHome2');
    else if (st.error) await page.click('#btnBackHome');
    else await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#stepInput:not([hidden])', { timeout: 15000 });
  }

  /* ---- P1 首页 ---- */
  await begin('P1-home');
  await padTo(S.S1);
  await end();

  /* ---- P2 上传截图 ---- */
  await begin('P2-upload');
  await uploadAndOcrPreviewOnly();
  await padTo(S.S2);
  await end();

  async function uploadAndOcrPreviewOnly() {
    await page.click('#tabImage');
    await page.setInputFiles('#imageInput', path.join(SAMPLES, 'ocr-01-clear.jpg'));
    await page.waitForSelector('#imagePreviewCard:not([hidden])', { timeout: 20000 });
    await sleep(800);
    await page.evaluate(() => window.scrollBy({ top: 120, behavior: 'smooth' }));
    await sleep(1400);
  }

  /* ---- P3 取字 + 核对界面 ---- */
  await begin('P3-ocr');
  await page.click('#btnOcr');
  await page.waitForSelector('#ocrReview:not([hidden]), #ocrError:not([hidden])', { timeout: 120000 });
  await sleep(1200);
  await page.evaluate(() => document.getElementById('ocrText').scrollIntoView({ block: 'center', behavior: 'smooth' }));
  await sleep(900);
  await padTo(S.S3);
  await end();

  /* ---- P4 勾选已核对 + 整理 ---- */
  await begin('P4-review');
  await page.evaluate(() => document.getElementById('chkReviewed').scrollIntoView({ block: 'center', behavior: 'smooth' }));
  await sleep(700);
  await page.check('#chkReviewed');
  await sleep(1000);
  await page.click('#btnConfirmOcr');
  await waitResult();
  await sleep(600);
  await padTo(S.S4);
  await end();

  /* ---- P5 卡片：两个时间、两处地点、原文依据 ---- */
  await begin('P5-result');
  await page.evaluate(() => document.getElementById('timesBox').scrollIntoView({ block: 'center', behavior: 'smooth' }));
  await sleep(1600);
  const tg = await page.$('#timesBox .evidence-toggle');
  if (tg) { await tg.click(); await sleep(2200); }
  await page.evaluate(() => window.scrollBy({ top: 240, behavior: 'smooth' }));
  await sleep(1800);
  await padTo(S.S5 + S.S6);
  await end();

  /* ---- P6 真实朗读（录制原声）---- */
  await begin('P6-speech');
  await page.evaluate(() => document.getElementById('speechCard').scrollIntoView({ block: 'center', behavior: 'smooth' }));
  await sleep(900);
  await padTo(S.S7);
  const speakStart = Date.now();
  await page.evaluate(() => document.getElementById('btnSpeak').click());
  await sleep(18000);
  const speakEnd = Date.now();
  await page.evaluate(() => document.getElementById('btnStopSpeak').click());
  await sleep(800);
  await end({ speakStart, speakEnd });

  /* ---- P7 复制 ---- */
  await begin('P7-copy');
  await page.evaluate(() => document.getElementById('btnCopy').scrollIntoView({ block: 'center', behavior: 'smooth' }));
  await sleep(600);
  await page.click('#btnCopy');
  await sleep(1800);
  await padTo(S.S8);
  await end();

  /* ---- P8 缺失：通知未说明 ---- */
  await begin('P8-missing');
  await toHome();
  await uploadAndOcr('ocr-02-no-year-no-place.jpg');
  await page.check('#chkReviewed');
  await sleep(500);
  await page.click('#btnConfirmOcr');
  await waitResult();
  await page.evaluate(() => document.getElementById('timesBox').scrollIntoView({ block: 'center', behavior: 'smooth' }));
  await sleep(1200);
  await padTo(S.S9a);
  await end();

  /* ---- P9 冲突：置顶提醒 ---- */
  await begin('P9-conflict');
  await toHome();
  await uploadAndOcr('ocr-03-date-conflict.jpg');
  await page.check('#chkReviewed');
  await sleep(500);
  await page.click('#btnConfirmOcr');
  await waitResult();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await sleep(1400);
  await padTo(S.S9b);
  await end();

  /* ---- P10 回到首页插画 ---- */
  await begin('P10-end');
  await toHome();
  await page.evaluate(() => document.querySelector('.hero-art').scrollIntoView({ block: 'center', behavior: 'smooth' }));
  await sleep(1200);
  await padTo(S.S10);
  await end();

  await cdp.send('Page.stopScreencast').catch(() => {});
  fs.writeFileSync(path.join(ROOT, 'phases.json'), JSON.stringify({ url: URL, version: EXPECT, phases }, null, 2));
  console.log(phases.map((p) => `${p.name} ${p.wall.toFixed(1)}s ${p.frames}f`).join('\n'));
  await browser.close();
})().catch((e) => {
  console.error('RECORDER ERROR', e && e.message);
  try {
    const ROOT2 = require('path').resolve(__dirname, 'delivery', 'assets', 'recordings');
    if (global.__PHASES__) {
      require('fs').writeFileSync(require('path').join(ROOT2, 'phases.json'),
        JSON.stringify({ url: URL, version: EXPECT, phases: global.__PHASES__, error: String(e && e.message) }, null, 2));
    }
  } catch (e2) {}
  process.exit(3);
});
