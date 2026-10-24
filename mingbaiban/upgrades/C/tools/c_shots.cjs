/* C 轮真实界面截图（真实模型流程）
 * 输出到 delivery/assets/screenshots/，供说明书/封面使用。
 */
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const URL = process.argv[2] || 'https://mingbaiban-42482.app.workbuddy.host/?sharecode=QCZF2UKNAG';
const EXPECT = process.argv[3] || '1.3.0-c7';
const OUT = path.resolve(__dirname, '..', 'delivery', 'assets', 'screenshots');
const SAMPLES = path.resolve(__dirname, '..', 'delivery', 'assets', 'ocr-samples');
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  for (let i = 0; i < 5; i++) {
    try {
      await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForFunction((v) => window.__MBB && window.MBB_CONFIG.appVersion === v, EXPECT, { timeout: 20000 });
      break;
    } catch (e) { console.log('retry', i + 1); await sleep(3000); }
  }

  async function shot(name) {
    await page.screenshot({ path: path.join(OUT, name) });
    console.log('shot', name);
  }

  /* 1 首页 */
  await sleep(400);
  await shot('c-01-home-390.png');

  /* 2 上传预览 */
  await page.click('#tabImage');
  await page.setInputFiles('#imageInput', path.join(SAMPLES, 'ocr-01-clear.jpg'));
  await page.waitForSelector('#imagePreviewCard:not([hidden])', { timeout: 20000 });
  await sleep(500);
  await shot('c-02-upload-390.png');

  /* 3 核对（真实 OCR） */
  await page.click('#btnOcr');
  await page.waitForSelector('#ocrReview:not([hidden]), #ocrError:not([hidden])', { timeout: 120000 });
  await sleep(600);
  await page.evaluate(() => document.getElementById('ocrText').scrollIntoView({ block: 'center' }));
  await sleep(300);
  await shot('c-03-review-390.png');

  /* 4 已勾选 */
  await page.check('#chkReviewed');
  await sleep(300);
  await shot('c-04-reviewed-390.png');

  /* 5 结果页（真实卡片） */
  await page.click('#btnConfirmOcr');
  await page.waitForSelector('#stepResult:not([hidden]), #stepError:not([hidden]), #stepNotNotice:not([hidden])', { timeout: 120000 });
  let tries = 1;
  while (tries < 3 && await page.evaluate(() => !document.getElementById('stepError').hidden)) {
    tries++;
    await page.click('#btnRetry');
    await page.waitForSelector('#stepResult:not([hidden]), #stepError:not([hidden]), #stepNotNotice:not([hidden])', { timeout: 120000 });
  }
  if (!await page.evaluate(() => !document.getElementById('stepResult').hidden)) throw new Error('卡片未生成');
  await sleep(400);
  await shot('c-05-result-390.png');

  /* 6 原文依据展开 */
  const tg = await page.$('#timesBox .evidence-toggle');
  if (tg) { await tg.scrollIntoViewIfNeeded(); await tg.click(); await sleep(400); }
  await shot('c-06-evidence-390.png');

  /* 7 朗读进行中 */
  await page.evaluate(() => document.getElementById('speechCard').scrollIntoView({ block: 'center' }));
  await sleep(300);
  await page.evaluate(() => document.getElementById('btnSpeak').click());
  await sleep(2500);
  await shot('c-07-speech-390.png');
  await page.evaluate(() => document.getElementById('btnStopSpeak').click());
  await sleep(300);

  /* 8 缺失卡 */
  await page.click('#btnNewNotice');
  await page.waitForSelector('#stepInput:not([hidden])');
  await page.click('#tabImage');
  await page.setInputFiles('#imageInput', path.join(SAMPLES, 'ocr-02-no-year-no-place.jpg'));
  await page.waitForSelector('#imagePreviewCard:not([hidden])');
  await page.click('#btnOcr');
  await page.waitForSelector('#ocrReview:not([hidden]), #ocrError:not([hidden])', { timeout: 120000 });
  await page.check('#chkReviewed');
  await page.click('#btnConfirmOcr');
  await page.waitForSelector('#stepResult:not([hidden]), #stepError:not([hidden]), #stepNotNotice:not([hidden])', { timeout: 120000 });
  tries = 1;
  while (tries < 3 && await page.evaluate(() => !document.getElementById('stepError').hidden)) {
    tries++;
    await page.click('#btnRetry');
    await page.waitForSelector('#stepResult:not([hidden]), #stepError:not([hidden]), #stepNotNotice:not([hidden])', { timeout: 120000 });
  }
  await page.evaluate(() => document.getElementById('timesBox').scrollIntoView({ block: 'center' }));
  await sleep(300);
  await shot('c-08-missing-390.png');

  /* 9 冲突卡 */
  await page.click('#btnNewNotice');
  await page.waitForSelector('#stepInput:not([hidden])');
  await page.click('#tabImage');
  await page.setInputFiles('#imageInput', path.join(SAMPLES, 'ocr-03-date-conflict.jpg'));
  await page.waitForSelector('#imagePreviewCard:not([hidden])');
  await page.click('#btnOcr');
  await page.waitForSelector('#ocrReview:not([hidden]), #ocrError:not([hidden])', { timeout: 120000 });
  await page.check('#chkReviewed');
  await page.click('#btnConfirmOcr');
  await page.waitForSelector('#stepResult:not([hidden]), #stepError:not([hidden]), #stepNotNotice:not([hidden])', { timeout: 120000 });
  tries = 1;
  while (tries < 3 && await page.evaluate(() => !document.getElementById('stepError').hidden)) {
    tries++;
    await page.click('#btnRetry');
    await page.waitForSelector('#stepResult:not([hidden]), #stepError:not([hidden]), #stepNotNotice:not([hidden])', { timeout: 120000 });
  }
  await page.evaluate(() => window.scrollTo({ top: 0 }));
  await sleep(300);
  await shot('c-09-conflict-390.png');

  /* 10 关于页 */
  await page.goto(URL.replace(/\/\?.*$/, '/about.html'), { waitUntil: 'domcontentloaded' });
  await sleep(500);
  await shot('c-10-about-390.png');

  /* 11 桌面 1280 */
  const d = await ctx.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1.5 });
  await d.goto(URL, { waitUntil: 'domcontentloaded' });
  await d.waitForFunction((v) => window.__MBB && window.MBB_CONFIG.appVersion === v, EXPECT, { timeout: 20000 });
  await sleep(400);
  await d.screenshot({ path: path.join(OUT, 'c-home-1280.png') });
  console.log('shot c-home-1280.png');

  /* 12 封面用 UI 局部（核对双栏） */
  const review = await page.$('#ocrReview');
  if (review) {
    await page.click('#tabImage');
    await page.setInputFiles('#imageInput', path.join(SAMPLES, 'ocr-01-clear.jpg'));
    await page.waitForSelector('#imagePreviewCard:not([hidden])');
    await page.click('#btnOcr');
    await page.waitForSelector('#ocrReview:not([hidden])', { timeout: 120000 });
  }
  const el = await page.$('.review-grid');
  if (el) {
    await el.screenshot({ path: path.join(OUT, 'c-cover-ui-crop.png') });
    console.log('shot c-cover-ui-crop.png');
  }

  await browser.close();
  console.log('all shots done');
})();
