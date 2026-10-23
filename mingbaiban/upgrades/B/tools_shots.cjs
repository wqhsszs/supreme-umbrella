// A 轮：抓取新版各状态真实截图（用于前后对照与验收记录）
// 运行：NODE_PATH=<node_modules> node upgrades/A/tools/a_shots.cjs <url>
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const URL = process.argv[2] || 'https://mingbaiban-42482.app.workbuddy.host/?sharecode=QCZF2UKNAG';
const OUT = path.resolve(__dirname, '..', 'delivery', 'assets', 'screenshots');
const EXPECT = process.argv[3] || '';
fs.mkdirSync(OUT, { recursive: true });

const SAMPLE1 = '【虚构演示样例·非真实社区公告】\n各位居民：\n为帮助老年居民掌握智能手机常用功能，社区服务中心将开展“手机使用指导”活动。\n时间：2026年10月26日9:00—11:00\n地点：社区服务中心二楼活动室\n报名方式：请于2026年10月25日17:00前到社区服务中心一楼服务台报名，名额有限。\n说明：本次活动仅限已报名居民参加，请携带本人手机。';
const NO_PLACE = '社区将于10月29日上午9点组织志愿者清理小区绿化带，欢迎居民报名参加。';
const CONFLICT = '活动定于10月26日上午9点开始。\n活动定于10月26日下午3点开始，请准时参加。';
const CHAT = '今天天气不错，我们下午去打球吧，顺便一起吃个饭。';

async function ready(page, url) {
  for (let i = 0; i < 4; i++) {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    try {
      await page.waitForFunction(
        (v) => window.MBB_CONFIG && window.__MBB && (!v || window.MBB_CONFIG.appVersion === v),
        EXPECT, { timeout: 15000 }
      );
      return;
    } catch (e) { await page.waitForTimeout(3000); }
  }
  throw new Error('页面未就绪');
}

async function toInput(page) {
  const onInput = await page.evaluate(() => !document.getElementById('stepInput').hidden);
  if (onInput) return;
  for (const id of ['#btnNewNotice', '#btnBackHome2', '#btnBackHome', '#btnCancel', '#btnReset']) {
    const el = await page.$(id);
    if (el && await el.isVisible()) { await el.click().catch(() => {}); break; }
  }
  await page.waitForFunction(() => !document.getElementById('stepInput').hidden, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(200);
}

async function analyze(page, text) {
  for (let a = 1; a <= 3; a++) {
    await toInput(page);
    await page.fill('#noticeInput', text);
    await page.click('#btnAnalyze');
    await page.waitForSelector('#stepResult:not([hidden]), #stepError:not([hidden]), #stepNotNotice:not([hidden])', { timeout: 120000 });
    const ok = await page.evaluate(() => !document.getElementById('stepResult').hidden);
    if (ok) return true;
  }
  return false;
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  // 手机 390：主流程
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ready(p, URL);
  await p.screenshot({ path: path.join(OUT, 'b-01-home-390.png') });

  await p.fill('#noticeInput', SAMPLE1);
  await p.click('#btnAnalyze');
  await p.waitForTimeout(1200);
  await p.screenshot({ path: path.join(OUT, 'b-02-loading-390.png') });
  await p.waitForSelector('#stepResult:not([hidden]), #stepError:not([hidden])', { timeout: 120000 });
  if (await p.evaluate(() => !document.getElementById('stepResult').hidden)) {
    await p.waitForTimeout(400);
    await p.screenshot({ path: path.join(OUT, 'b-03-result-top-390.png') });
    await p.screenshot({ path: path.join(OUT, 'b-03-result-full-390.png'), fullPage: true });

    // 展开原文依据
    const t = await p.$('.evidence-toggle');
    if (t) { await t.scrollIntoViewIfNeeded(); await t.click(); await p.waitForTimeout(400); await p.screenshot({ path: path.join(OUT, 'b-04-evidence-390.png') }); }

    // 勾选准备项 + 复制
    const cb = await p.$('input[data-prep]');
    if (cb) { await cb.check(); await cb.scrollIntoViewIfNeeded(); await p.waitForTimeout(300); await p.screenshot({ path: path.join(OUT, 'b-05-checked-390.png') }); }
    await p.click('#btnCopy');
    await p.waitForTimeout(500);
    await p.screenshot({ path: path.join(OUT, 'b-06-copy-390.png') });
  }

  // 缺地点
  if (await analyze(p, NO_PLACE)) {
    await p.waitForTimeout(400);
    await p.screenshot({ path: path.join(OUT, 'b-07-missing-390.png') });
    const q = await p.$('#questionCard');
    if (q) { await q.scrollIntoViewIfNeeded(); await p.waitForTimeout(300); await p.screenshot({ path: path.join(OUT, 'b-08-questions-390.png') }); }
  }

  // 冲突
  if (await analyze(p, CONFLICT)) {
    await p.waitForTimeout(400);
    await p.screenshot({ path: path.join(OUT, 'b-09-conflict-390.png') });
  }

  // 非通知
  if (await analyze(p, CHAT)) { await p.waitForTimeout(300); await p.screenshot({ path: path.join(OUT, 'b-10-not-notice-390.png') }); }

  // 失败页（模拟服务不可用）
  await p.evaluate(() => {
    window.__real = window.MBBLLM.status;
    window.MBBLLM.status = () => ({ ready: false, reason: '模拟演示：配额用尽' });
  });
  await toInput(p);
  await p.fill('#noticeInput', SAMPLE1);
  await p.click('#btnAnalyze');
  await p.waitForTimeout(600);
  await p.screenshot({ path: path.join(OUT, 'b-11-error-390.png') });
  await p.evaluate(() => { window.MBBLLM.status = window.__real; });
  await p.close();

  // 平板 768 与桌面 1280
  for (const [w, h] of [[768, 1024], [1280, 900]]) {
    const q = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    await ready(q, URL);
    await q.screenshot({ path: path.join(OUT, `b-12-home-${w}.png`) });
    if (await analyze(q, SAMPLE1)) {
      await q.waitForTimeout(400);
      await q.screenshot({ path: path.join(OUT, `b-13-result-${w}.png`) });
    }
    await q.close();
  }

  // 关于页
  const a = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await a.goto(URL.replace(/index\.html.*$/, 'about.html'), { waitUntil: 'networkidle', timeout: 60000 });
  await a.waitForTimeout(500);
  await a.screenshot({ path: path.join(OUT, 'b-14-about-390.png') });
  await a.close();

  await browser.close();
  fs.readdirSync(OUT).filter((f) => f.endsWith('.png')).forEach((f) => {
    console.log(f, Math.round(fs.statSync(path.join(OUT, f)).size / 1024) + 'KB');
  });
})();
