/* 备用截图：不调用模型。
 * 用真实界面 + 注入引擎/固定已校验数据渲染各状态（数据来源在材料里注明）。
 * 仅当模型通道长时间不可用时作为说明书配图的替代。 */
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const BASE = 'http://127.0.0.1:8124/';
const OUT = path.resolve(__dirname, '..', 'delivery', 'assets', 'screenshots');
const SAMPLE = path.resolve(__dirname, '..', 'delivery', 'assets', 'ocr-samples', 'ocr-01-clear.jpg');
fs.mkdirSync(OUT, { recursive: true });

const OCR_TEXT = '关于开展“手机使用指导”活动的通知\n\n各位居民：\n为帮助老年居民掌握智能手机常用功能，社区服务中心将开展“手机使用指导”活动。\n时间：2026年10月26日9:00—11:00\n地点：社区服务中心二楼活动室\n报名方式：请于2026年10月25日17:00前到社区服务中心一楼服务台报名，名额有限。\n说明：本次活动仅限已报名居民参加，请携带本人手机。';

const FULL = {
  document_status: 'notice', document_status_reason: '社区关于开展手机使用指导活动的通知',
  summary: '社区开展手机使用指导活动，需提前到一楼服务台报名，仅限已报名居民参加。',
  audience: { value: '社区老年居民', status: 'stated', evidence: ['为帮助老年居民'] },
  times: [
    { purpose: '报名截止', value: '2026年10月25日17:00前', status: 'stated', evidence: ['请于2026年10月25日17:00前'], place: { value: '社区服务中心一楼服务台', status: 'stated', evidence: ['一楼服务台报名'] } },
    { purpose: '活动开始', value: '2026年10月26日9:00—11:00', status: 'stated', evidence: ['2026年10月26日9:00—11:00'], place: { value: '社区服务中心二楼活动室', status: 'stated', evidence: ['二楼活动室'] } }
  ],
  location: { value: '社区服务中心', status: 'stated', evidence: ['社区服务中心'] },
  preparation: [{ value: '本人手机', status: 'stated', evidence: ['请携带本人手机'] }],
  actions: [{ type: 'required', value: '在2026年10月25日17:00前到一楼服务台报名', evidence: ['17:00前到社区服务中心一楼服务台报名'] }],
  questions: ['名额还剩多少，现在报名还有没有位置？'],
  warnings: ['本次活动仅限已报名居民参加，请携带本人手机。']
};

const MISSING = {
  document_status: 'notice', document_status_reason: '社区健康讲座通知',
  summary: '社区组织一次健康讲座，需要提前到服务台登记。',
  audience: { value: null, status: 'missing', evidence: [] },
  times: [{ purpose: '活动开始', value: '10月26日上午9点', status: 'stated', evidence: ['10月26日上午9点'], place: { value: null, status: 'missing', evidence: [] } }],
  location: { value: null, status: 'missing', evidence: [] },
  preparation: [], actions: [{ type: 'required', value: '10月25日前到社区服务台登记', evidence: ['10月25日前到社区服务台登记'] }],
  questions: ['活动地点在哪里？'], warnings: []
};

const CONFLICT = {
  document_status: 'notice', document_status_reason: '社区关于开展智能手机使用指导活动的通知',
  summary: '社区开展智能手机使用指导活动，报名截止时间前后不一致。',
  audience: { value: '社区居民', status: 'stated', evidence: ['各位居民'] },
  times: [
    { purpose: '报名截止', value: '2026年10月25日17:00前，另处写10月24日18:00后不再接受报名', status: 'conflict', evidence: ['2026年10月25日17:00前到一楼服务台报名', '10月24日18:00后不再接受报名'], place: { value: '一楼服务台', status: 'stated', evidence: ['一楼服务台'] } },
    { purpose: '活动开始', value: '2026年10月26日9:00—11:00', status: 'stated', evidence: ['10月26日9:00—11:00'], place: { value: '二楼活动室', status: 'stated', evidence: ['二楼活动室'] } }
  ],
  location: { value: '社区服务中心', status: 'stated', evidence: ['社区服务中心'] },
  preparation: [], actions: [], questions: ['报名截止到底是25日17:00还是24日18:00？'], warnings: ['两处报名截止时间不一致。']
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__MBB && window.MBBOCR && window.MBBSpeech, null, { timeout: 20000 });

  /* 上传预览 */
  await page.click('#tabImage');
  await page.setInputFiles('#imageInput', SAMPLE);
  await page.waitForSelector('#imagePreviewCard:not([hidden])', { timeout: 15000 });
  await sleep(400);
  await page.screenshot({ path: path.join(OUT, 'c-02-upload-390.png') });

  /* 核对（真实 UI + 真实 OCR 文本） */
  await page.evaluate((t) => window.__MBB._showReview(t), OCR_TEXT);
  await sleep(300);
  await page.evaluate(() => document.getElementById('ocrText').scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: path.join(OUT, 'c-03-review-390.png') });

  /* 已勾选 */
  await page.check('#chkReviewed');
  await sleep(200);
  await page.evaluate(() => document.getElementById('chkReviewed').scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: path.join(OUT, 'c-04-reviewed-390.png') });

  /* 结果页（固定已校验数据） */
  await page.evaluate((d) => window.__MBB._renderFixture(d, 'image'), FULL);
  await sleep(300);
  await page.screenshot({ path: path.join(OUT, 'c-05-result-390.png') });

  /* 原文依据展开 */
  const tg = await page.$('#timesBox .evidence-toggle');
  if (tg) { await tg.scrollIntoViewIfNeeded(); await tg.click(); await sleep(300); }
  await page.screenshot({ path: path.join(OUT, 'c-06-evidence-390.png') });

  /* 朗读进行中（注入引擎让控制键出现） */
  await page.evaluate(() => {
    const f = {
      getVoices() { const a = window.speechSynthesis.getVoices() || []; const zh = a.filter((v) => /^zh|cmn/i.test(v.lang || '')); return zh.length ? zh : a.slice(0, 1); },
      speak(u) { this.last = u; setTimeout(() => { if (u.onstart) u.onstart(); }, 30); },
      cancel() {}, pause() {}, resume() {}, speaking: false
    };
    window.MBBSpeech._setEngine(f);
    document.getElementById('btnSpeak').click();
  });
  await sleep(1200);
  await page.evaluate(() => document.getElementById('speechCard').scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: path.join(OUT, 'c-07-speech-390.png') });
  await page.evaluate(() => { window.MBBSpeech.stop(); window.MBBSpeech._setEngine(null); });

  /* 缺失卡 */
  await page.evaluate((d) => window.__MBB._renderFixture(d, 'text'), MISSING);
  await sleep(300);
  await page.evaluate(() => document.getElementById('timesBox').scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: path.join(OUT, 'c-08-missing-390.png') });

  /* 冲突卡 */
  await page.evaluate((d) => window.__MBB._renderFixture(d, 'text'), CONFLICT);
  await sleep(300);
  await page.evaluate(() => window.scrollTo({ top: 0 }));
  await page.screenshot({ path: path.join(OUT, 'c-09-conflict-390.png') });

  /* 封面 UI 局部 */
  await page.click('#btnNewNotice');
  await page.waitForSelector('#stepInput:not([hidden])');
  await page.click('#tabImage');
  await page.setInputFiles('#imageInput', SAMPLE);
  await page.waitForSelector('#imagePreviewCard:not([hidden])');
  await page.evaluate((t) => window.__MBB._showReview(t), OCR_TEXT);
  const el = await page.$('.review-grid');
  if (el) { await el.screenshot({ path: path.join(OUT, 'c-cover-ui-crop.png') }); }

  /* 关于页 */
  await page.goto(BASE + 'about.html', { waitUntil: 'domcontentloaded' });
  await sleep(400);
  await page.screenshot({ path: path.join(OUT, 'c-10-about-390.png') });

  await browser.close();
  console.log('fallback shots done');
})();
