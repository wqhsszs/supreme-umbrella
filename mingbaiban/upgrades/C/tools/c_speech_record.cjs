/* 真实朗读录音的“驾驶”脚本（由 record_speech.py 启动）
 *
 * 用有界面的 Edge（否则系统没有音频输出），依次生成三张卡：
 *   完整卡 / 缺失卡 / 冲突卡 → 点“读给家人听” → 等读完 → 记录起止时间。
 * 时间戳交给 Python 按 WASAPI 环回录音切片，得到真实的声音证据。
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const URL = process.argv[2] || 'https://mingbaiban-42482.app.workbuddy.host/?sharecode=QCZF2UKNAG';
const OUT = process.argv[3] || path.resolve(__dirname, '..', '_tmp', 'speech-timeline.json');

const CASES = [
  {
    id: 'full',
    text: '【虚构演示样例·非真实社区公告】\n各位居民：\n为帮助老年居民掌握智能手机常用功能，社区服务中心将开展“手机使用指导”活动。\n时间：2026年10月26日9:00—11:00\n地点：社区服务中心二楼活动室\n报名方式：请于2026年10月25日17:00前到社区服务中心一楼服务台报名，名额有限。\n说明：本次活动仅限已报名居民参加，请携带本人手机。'
  },
  {
    id: 'missing',
    text: '【虚构演示样例·非真实社区公告】\n各位居民：\n社区将组织一次健康讲座，欢迎参加。\n时间：10月26日上午9点\n报名方式：请于10月25日前到社区服务台登记。'
  },
  {
    id: 'conflict',
    text: '【虚构演示样例·非真实社区公告】\n各位居民：\n社区将开展“智能手机使用指导”活动。\n时间：2026年10月26日9:00—11:00\n地点：社区服务中心二楼活动室\n报名方式：请于2026年10月25日17:00前到一楼服务台报名。\n注意：报名截止时间以本通知为准，10月24日18:00后不再接受报名。'
  }
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: false,
    args: ['--no-proxy-server', '--autoplay-policy=no-user-gesture-required', '--window-size=1000,760']
  });
  const page = await browser.newPage({ viewport: { width: 1000, height: 720 } });
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForFunction(() => window.__MBB && window.MBBSpeech, null, { timeout: 25000 });

  const out = { url: URL, version: await page.evaluate(() => window.MBB_CONFIG.appVersion), records: [] };

  for (const c of CASES) {
    /* 回到输入页 */
    const onResult = await page.evaluate(() => !document.getElementById('stepResult').hidden);
    if (onResult) {
      await page.click('#btnNewNotice');
      await page.waitForSelector('#stepInput:not([hidden])', { timeout: 10000 });
    }
    await page.fill('#noticeInput', c.text);
    await page.click('#btnAnalyze');
    await page.waitForSelector('#stepResult:not([hidden]), #stepError:not([hidden]), #stepNotNotice:not([hidden])', { timeout: 120000 });

    let tries = 1;
    while (tries < 3 && await page.evaluate(() => !document.getElementById('stepError').hidden)) {
      tries++;
      await page.click('#btnRetry');
      await page.waitForSelector('#stepResult:not([hidden]), #stepError:not([hidden]), #stepNotNotice:not([hidden])', { timeout: 120000 });
    }
    const ok = await page.evaluate(() => window.__MBB.state().hasResult && !document.getElementById('stepResult').hidden);
    if (!ok) {
      out.records.push({ id: c.id, ok: false, note: '卡片未生成（模型校验未过），未录音' });
      continue;
    }
    const text = await page.evaluate(() => window.__MBB.speechText());
    const start = Date.now();
    await page.click('#btnSpeak');
    let spoke = false;
    let last = null;
    for (let i = 0; i < 400; i++) {          /* 最多约 120 秒 */
      last = await page.evaluate(() => window.MBBSpeech.status());
      if (last.speaking) spoke = true;
      if (spoke && !last.speaking) break;
      await sleep(300);
    }
    const end = Date.now();
    await page.evaluate(() => window.MBBSpeech.stop());
    out.records.push({
      id: c.id, ok: true, attempts: tries,
      speechText: text, charCount: text.length,
      startMs: start, endMs: end, seconds: Math.round((end - start) / 100) / 10,
      voice: last && last.voiceName, zhVoiceCount: last && last.zhVoiceCount,
      finished: !!(last && !last.speaking)
    });
    await sleep(1200);
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');
  console.log('timeline written:', OUT);
  await browser.close();
})();
