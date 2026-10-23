// B 轮：真实操作录屏（CDP 屏幕捕获），按旁白分镜分段
// 运行：NODE_PATH=<node_modules> node tools_record.cjs <url> <expectVersion>
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const URL = process.argv[2] || 'https://mingbaiban-42482.app.workbuddy.host/?sharecode=QCZF2UKNAG';
const EXPECT = process.argv[3] || '1.2.0-b1';
const ROOT = path.resolve(__dirname, 'delivery', 'assets', 'recordings');
fs.mkdirSync(ROOT, { recursive: true });

const SAMPLE = '【虚构演示样例·非真实社区公告】\n各位居民：\n为帮助老年居民掌握智能手机常用功能，社区服务中心将开展“手机使用指导”活动。\n时间：2026年10月26日9:00—11:00\n地点：社区服务中心二楼活动室\n报名方式：请于2026年10月25日17:00前到社区服务中心一楼服务台报名，名额有限。\n说明：本次活动仅限已报名居民参加，请携带本人手机。';
const NOPLACE = '社区将于10月29日上午9点组织志愿者清理小区绿化带，欢迎居民报名参加。';
const CONFLICT = '活动定于10月26日上午9点开始。\n活动定于10月26日下午3点开始，请准时参加。';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForFunction((v) => window.MBB_CONFIG && window.MBB_CONFIG.appVersion === v, EXPECT, { timeout: 40000 });

  const cdp = await ctx.newCDPSession(page);
  let phase = null;
  let idx = 0;
  const phases = [];
  const dir = (name) => {
    const d = path.join(ROOT, name);
    fs.mkdirSync(d, { recursive: true });
    return d;
  };

  cdp.on('Page.screencastFrame', async (ev) => {
    if (phase) {
      fs.writeFileSync(path.join(ROOT, phase.name, String(idx).padStart(5, '0') + '.jpg'), Buffer.from(ev.data, 'base64'));
      phase.frames.push({ i: idx, t: ev.metadata.timestamp });
      idx++;
    }
    try { await cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }); } catch (e) {}
  });

  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 82, maxWidth: 780, maxHeight: 1688, everyNthFrame: 1 });

  const TARGET = { 'P1-paste': 13.4, 'P2-result': 13.0, 'P3-evidence': 14.9, 'P4-check': 9.0, 'P5-copy': 10.1, 'P6-missing': 8.0, 'P7-conflict': 8.4 };
  const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
  const want = (n) => ONLY.length === 0 || ONLY.indexOf(n) >= 0;
  async function begin(name) {
    idx = 0;
    phase = { name, frames: [], startWall: Date.now() };
    dir(name);
  }
  // 补足到目标时长：用轻微滚动保持画面有运动，避免长时间定格
  async function padTo(targetSec) {
    let left = targetSec * 1000 - (Date.now() - phase.startWall);
    while (left > 0) {
      const step = Math.min(600, left);
      await page.evaluate((dy) => window.scrollBy({ top: dy, behavior: 'smooth' }), (Math.random() > 0.5 ? 1 : -1) * 24).catch(() => {});
      await sleep(step);
      left = targetSec * 1000 - (Date.now() - phase.startWall);
    }
  }
  async function end() {
    if (phase && TARGET[phase.name]) await padTo(TARGET[phase.name]);
    phase.endWall = Date.now();
    phases.push({ name: phase.name, frames: phase.frames.length, wall: (phase.endWall - phase.startWall) / 1000 });
    phase = null;
    await sleep(150);
  }

  // ---- P1：贴通知 + 点整理（对应 S3）----
  if (want('P1-paste')) { await begin('P1-paste');
  await page.click('#noticeInput');
  await sleep(400);
  await page.type('#noticeInput', SAMPLE, { delay: 26 });   // 逐字输入，看得见在贴
  await sleep(900);
  await page.click('#btnAnalyze');
  await sleep(1200);
  await end(); }

  // ---- P2：出结果 + 滚到时间（对应 S4）----
  if (want('P2-result')) { await begin('P2-result');
  await page.waitForSelector('#stepResult:not([hidden]), #stepError:not([hidden])', { timeout: 120000 });
  await sleep(2200);
  await page.evaluate(() => window.scrollBy({ top: 430, behavior: 'smooth' }));
  await sleep(1400);
  await page.evaluate(() => window.scrollBy({ top: 260, behavior: 'smooth' }));
  await sleep(1200);
  await end(); }

  // ---- P3：展开原文依据、看两处地点（对应 S5）----
  if (want('P3-evidence')) { await begin('P3-evidence');
  await page.evaluate(() => {
    const box = document.getElementById('timesBox');
    if (box) box.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
  await sleep(1500);
  const toggles = await page.$$('#timesBox .evidence-toggle');
  if (toggles[0]) { await toggles[0].click(); await sleep(2600); }
  if (toggles[1]) {
    await page.evaluate(() => window.scrollBy({ top: 210, behavior: 'smooth' }));
    await sleep(1400);
    await toggles[1].click();
    await sleep(2600);
  }
  await sleep(1200);
  await end(); }

  // ---- P4：勾选准备项（对应 S7）----
  if (want('P4-check')) { await begin('P4-check');
  await page.evaluate(() => {
    const b = document.getElementById('prepBox');
    if (b) b.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
  await sleep(1200);
  const cbs = await page.$$('#prepBox input[type=checkbox]');
  if (cbs[0]) { await cbs[0].check(); await sleep(1900); }
  if (cbs[1]) { await cbs[1].check(); await sleep(1700); }
  const acts = await page.$$('#actionBox input[type=checkbox]');
  if (acts[0]) { await acts[0].check(); await sleep(1500); }
  await end(); }

  // ---- P5：复制（对应 S8）----
  if (want('P5-copy')) { await begin('P5-copy');
  await page.evaluate(() => {
    const b = document.getElementById('btnCopy');
    if (b) b.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
  await sleep(1800);
  await page.click('#btnCopy');
  await sleep(3600);
  await page.evaluate(() => window.scrollBy({ top: -120, behavior: 'smooth' }));
  await sleep(1200);
  await end(); }

  // ---- P6：缺地点（对应 S6a）----
  if (want('P6-missing')) { await begin('P6-missing');
  await page.click('#btnNewNotice');
  await sleep(500);
  await page.fill('#noticeInput', NOPLACE);
  await sleep(600);
  await page.click('#btnAnalyze');
  await page.waitForSelector('#stepResult:not([hidden]), #stepError:not([hidden])', { timeout: 120000 });
  await sleep(1500);
  await page.evaluate(() => window.scrollBy({ top: 300, behavior: 'smooth' }));
  await sleep(800);
  await end(); }

  // ---- P7：时间冲突（对应 S6b）----
  if (want('P7-conflict')) { await begin('P7-conflict');
  await page.click('#btnNewNotice');
  await sleep(400);
  await page.fill('#noticeInput', CONFLICT);
  await sleep(500);
  await page.click('#btnAnalyze');
  await page.waitForSelector('#stepResult:not([hidden]), #stepError:not([hidden])', { timeout: 120000 });
  await sleep(2600);
  await end(); }

  await cdp.send('Page.stopScreencast');
  fs.writeFileSync(path.join(ROOT, 'phases.json'), JSON.stringify({ url: URL, version: EXPECT, phases }, null, 2));
  console.log(JSON.stringify(phases, null, 1));
  await browser.close();
})();
