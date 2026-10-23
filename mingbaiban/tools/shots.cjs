// 抓取真实界面截图（用于产品说明书与演示视频）
// 运行：NODE_PATH=<workspace>/node_modules node tools/shots.cjs [url]
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'tests', 'shots');
const URL = process.argv[2] || 'https://mingbaiban-42482.app.workbuddy.host/?sharecode=QCZF2UKNAG';

const SAMPLE1 = '【虚构演示样例·非真实社区公告】\n各位居民：\n为帮助老年居民掌握智能手机常用功能，社区服务中心将开展“手机使用指导”活动。\n时间：2026年10月26日9:00—11:00\n地点：社区服务中心二楼活动室\n报名方式：请于2026年10月25日17:00前到社区服务中心一楼服务台报名，名额有限。\n说明：本次活动仅限已报名居民参加，请携带本人手机。';

const B1 = '社区将于10月29日上午9点组织志愿者清理小区绿化带，欢迎居民报名参加。';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await sleep(500);
  await page.screenshot({ path: path.join(OUT, 'shot-01-home.png') });

  // 输入长通知（模拟长辈把微信群里的通知贴进来）
  await page.click('#noticeInput');
  await page.type('#noticeInput', SAMPLE1, { delay: 4 });
  await sleep(300);
  await page.screenshot({ path: path.join(OUT, 'shot-02-filled.png') });

  // 点击后立刻截加载态
  await page.click('#btnAnalyze');
  await sleep(900);
  await page.screenshot({ path: path.join(OUT, 'shot-03-loading.png') });

  await page.waitForSelector('#stepResult:not([hidden])', { timeout: 90000 });
  await sleep(600);
  await page.screenshot({ path: path.join(OUT, 'shot-04-result-top.png') });

  // 全页截图（说明书用）
  await page.screenshot({ path: path.join(OUT, 'shot-05-result-full.png'), fullPage: true });

  // 展开原文依据
  const toggle = await page.$('.evidence-toggle');
  if (toggle) {
    await toggle.scrollIntoViewIfNeeded();
    await toggle.click();
    await sleep(400);
    await page.screenshot({ path: path.join(OUT, 'shot-06-evidence.png') });
  }

  // 勾选准备事项
  const boxes = await page.$$('input[type=checkbox]');
  if (boxes.length) {
    await boxes[0].check();
    if (boxes[1]) await boxes[1].check();
    await boxes[0].scrollIntoViewIfNeeded();
    await sleep(300);
    await page.screenshot({ path: path.join(OUT, 'shot-07-checked.png') });
  }

  // 复制
  await page.click('#btnCopy');
  await sleep(500);
  await page.screenshot({ path: path.join(OUT, 'shot-08-copy.png') });

  // 缺失信息场景（B1：没写集合地点、没写报名方式）
  await page.click('#btnNewNotice');
  await page.fill('#noticeInput', B1);
  await page.click('#btnAnalyze');
  await page.waitForSelector('#stepResult:not([hidden])', { timeout: 90000 });
  await sleep(500);
  await page.screenshot({ path: path.join(OUT, 'shot-09-missing-top.png') });
  // 滚到"还要问清楚"
  const q = await page.$('#questionCard');
  if (q) { await q.scrollIntoViewIfNeeded(); await sleep(300); }
  await page.screenshot({ path: path.join(OUT, 'shot-10-questions.png') });

  // 服务不可用时的失败说明（不伪造答案）
  await page.evaluate(() => {
    const real = window.MBBLLM.status;
    window.MBBLLM.status = () => ({ ready: false, reason: '模拟演示：配额用尽' });
    document.getElementById('btnRetry').click();
    window.MBBLLM.status = real;
  });
  await sleep(600);
  await page.screenshot({ path: path.join(OUT, 'shot-11-error.png') });

  // 桌面端
  const page2 = await browser.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 });
  await page2.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await sleep(400);
  await page2.screenshot({ path: path.join(OUT, 'shot-12-desktop.png') });
  await page2.fill('#noticeInput', SAMPLE1);
  await page2.click('#btnAnalyze');
  await page2.waitForSelector('#stepResult:not([hidden])', { timeout: 90000 });
  await sleep(600);
  await page2.screenshot({ path: path.join(OUT, 'shot-13-desktop-result.png') });

  // 关于页
  const page3 = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page3.goto(URL.replace(/index\.html.*$/, 'about.html'), { waitUntil: 'networkidle', timeout: 60000 });
  await sleep(400);
  await page3.screenshot({ path: path.join(OUT, 'shot-14-about.png') });

  await browser.close();
  console.log('截图完成：' + OUT);
  fs.readdirSync(OUT).filter((f) => f.endsWith('.png')).forEach((f) => {
    const s = fs.statSync(path.join(OUT, f)).size;
    console.log('  ' + f + '  ' + (s / 1024).toFixed(0) + ' KB');
  });
})();
