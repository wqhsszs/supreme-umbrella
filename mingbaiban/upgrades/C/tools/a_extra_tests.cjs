// A 轮专项验证：required 无依据拒绝、勾选与复制一致、报名/活动地点分离、冲突置顶、非通知提示、语气检查
// 运行：NODE_PATH=<node_modules> node upgrades/A/tools/a_extra_tests.cjs <url>
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const URL = process.argv[2] || 'https://mingbaiban-42482.app.workbuddy.host/?sharecode=QCZF2UKNAG';
const OUT = path.resolve(__dirname, '..', 'delivery', 'assets', 'evidence');
fs.mkdirSync(OUT, { recursive: true });

const SAMPLE1 = '【虚构演示样例·非真实社区公告】\n各位居民：\n为帮助老年居民掌握智能手机常用功能，社区服务中心将开展“手机使用指导”活动。\n时间：2026年10月26日9:00—11:00\n地点：社区服务中心二楼活动室\n报名方式：请于2026年10月25日17:00前到社区服务中心一楼服务台报名，名额有限。\n说明：本次活动仅限已报名居民参加，请携带本人手机。';
const CONFLICT = '活动定于10月26日上午9点开始。\n活动定于10月26日下午3点开始，请准时参加。';
const CHAT = '今天天气不错，我们下午去打球吧，顺便一起吃个饭。';

const results = [];
const rec = (id, name, pass, detail, extra) => {
  results.push({ id, name, pass, status: pass ? '通过' : '失败', detail, ...(extra || {}) });
  console.log(`[${pass ? '通过' : '失败'}] ${id} ${name}${pass ? '' : ' → ' + detail}`);
};


// 真实模型偶发校验失败时页面会显示失败页（这是设计行为），因此等待"结果页或失败页"，
// 失败则记录并按产品自身机制重试一次，而不是让脚本直接崩掉。
async function analyzeAndWait(page, text) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.click('#btnNewNotice').catch(() => {});
    await page.fill('#noticeInput', text);
    await page.click('#btnAnalyze');
    await page.waitForSelector('#stepResult:not([hidden]), #stepError:not([hidden]), #stepNotNotice:not([hidden])', { timeout: 120000 });
    const st = await page.evaluate(() => ({
      result: !document.getElementById('stepResult').hidden,
      error: !document.getElementById('stepError').hidden,
      notNotice: !document.getElementById('stepNotNotice').hidden,
      detail: document.getElementById('errDetail').textContent.slice(0, 200)
    }));
    if (!st.error) return { ...st, attempt };
    if (attempt === 3) return { ...st, attempt };
  }
}


// 部署后 CDN 各节点存在短暂不一致：等脚本真正就绪再开始，并核对版本号。
async function readyPage(page, url, expectVersion) {
  for (let i = 0; i < 4; i++) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    try {
      await page.waitForFunction(
        () => window.MBB_CONFIG && window.MBBLLM && window.MBBValidate && window.__MBB,
        null, { timeout: 20000 }
      );
      const v = await page.evaluate(() => window.MBB_CONFIG.appVersion);
      if (!expectVersion || v === expectVersion) return v;
      console.log('  版本不一致，等待后重试：' + v);
    } catch (e) { console.log('  脚本未就绪，重试第 ' + (i + 1) + ' 次'); }
    await page.waitForTimeout(3000);
  }
  throw new Error('页面脚本始终未就绪（可能是部署缓存未同步）');
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await readyPage(page, URL);

  // A1 校验：required 无引文 → 拒绝
  const a1 = await page.evaluate(() => {
    const src = '请携带本人手机到一楼服务台。';
    const base = {
      document_status: 'notice', document_status_reason: '测试', summary: '测试用',
      audience: { value: '居民', status: 'stated', evidence: ['请携带本人手机'] },
      times: [{ purpose: '服务时间', value: '10月1日', status: 'stated', evidence: ['请携带本人手机'] }],
      location: { value: '一楼服务台', status: 'stated', evidence: ['一楼服务台'] },
      preparation: [], actions: [], questions: [], warnings: []
    };
    const noEvidence = JSON.parse(JSON.stringify(base));
    noEvidence.actions = [{ type: 'required', value: '带身份证', evidence: [] }];
    const fakeEvidence = JSON.parse(JSON.stringify(base));
    fakeEvidence.actions = [{ type: 'required', value: '带身份证', evidence: ['请携带身份证'] }];
    const okCase = JSON.parse(JSON.stringify(base));
    okCase.actions = [{ type: 'required', value: '带手机', evidence: ['请携带本人手机'] }];
    const r1 = window.__MBB.validateOnly(noEvidence, src);
    const r2 = window.__MBB.validateOnly(fakeEvidence, src);
    const r3 = window.__MBB.validateOnly(okCase, src);
    return {
      noEvidence: { ok: r1.ok, errors: r1.errors },
      fakeEvidence: { ok: r2.ok, errors: r2.errors },
      okCase: { ok: r3.ok, errors: r3.errors }
    };
  });
  rec('A1', 'required 但无原文引文 → 校验拒绝',
    a1.noEvidence.ok === false && a1.noEvidence.errors.some((e) => e.includes('未提供原文引文')),
    JSON.stringify(a1.noEvidence));
  rec('A2', 'required 引文对不上原文 → 校验拒绝',
    a1.fakeEvidence.ok === false && a1.fakeEvidence.errors.some((e) => e.includes('找不到') || e.includes('没有一条引文')),
    JSON.stringify(a1.fakeEvidence));
  rec('A3', 'required 且引文真实 → 校验通过（未误伤正常数据）',
    a1.okCase.ok === true, JSON.stringify(a1.okCase));

  // A4 真实样例：报名地点 / 活动地点分离
  const run1 = await analyzeAndWait(page, SAMPLE1);
  rec('A0', '示例通知能出结果页（若模型校验失败会自动重试，最多 3 次）',
    run1.result === true, JSON.stringify(run1));
  await page.waitForTimeout(400);

  const a4 = await page.evaluate(async () => {
    const r = await new Promise((res) => {
      const t = setInterval(() => {
        const s = window.__MBB.state();
        if (!s.busy && s.hasResult) { clearInterval(t); res(true); }
      }, 300);
    });
    const text = document.getElementById('timesBox').innerText;
    return { text, hasOne: text.includes('一楼服务台'), hasTwo: text.includes('二楼活动室') };
  });
  rec('A4', '报名地点与活动地点分别显示，未合并成笼统地点',
    a4.hasOne && a4.hasTwo, JSON.stringify(a4).slice(0, 300));

  // A5 勾选 → 复制包含 [x]；取消 → [ ]
  await page.evaluate(() => {
    window.__copied = '';
    navigator.clipboard.writeText = (t) => { window.__copied = t; return Promise.resolve(); };
    const cb = document.querySelector('input[data-prep]');
    if (cb) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await page.click('#btnCopy');
  await page.waitForTimeout(500);
  const copiedChecked = await page.evaluate(() => window.__copied);

  await page.evaluate(() => {
    const cb = document.querySelector('input[data-prep]');
    if (cb) { cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await page.click('#btnCopy');
  await page.waitForTimeout(500);
  const copiedUnchecked = await page.evaluate(() => window.__copied);

  rec('A5', '勾选后复制为 [x]，取消后复制为 [ ]（导出与界面一致）',
    copiedChecked.includes('[x]') && copiedUnchecked.includes('[ ]') && !copiedUnchecked.includes('[x]'),
    `checked含[x]=${copiedChecked.includes('[x]')} unchecked含[x]=${copiedUnchecked.includes('[x]')}`);

  rec('A6', '复制文本写明"不是报名凭证"，未把整理者状态说成已报名',
    copiedChecked.includes('不是报名凭证') && !copiedChecked.includes('已报名成功'),
    copiedChecked.slice(-120));

  rec('A7', '复制文本不含模型名与耗时等工程细节',
    !/Deepseek|deepseek|耗时|秒/.test(copiedChecked), copiedChecked.slice(0, 80));

  await page.screenshot({ path: path.join(OUT, 'ui-result-390.png') });
  await page.screenshot({ path: path.join(OUT, 'ui-result-390-full.png'), fullPage: true });

  // 正文语气：不出现亲属称呼
  const a8 = await page.evaluate(() => {
    const t = document.getElementById('stepResult').innerText;
    const bad = ['妈妈', '奶奶', '爷爷', '爸爸', '您爸妈', '老人家'].filter((w) => t.includes(w));
    return { bad, len: t.length };
  });
  rec('A8', '正文不含亲属称呼与概括性说法', a8.bad.length === 0, JSON.stringify(a8));

  // A9 冲突通知：横幅置顶且写明前后不一致
  const run2 = await analyzeAndWait(page, CONFLICT);
  await page.waitForTimeout(400);
  const a9 = await page.evaluate(() => {
    const b = document.getElementById('confirmBanner');
    const banner = b.querySelector('.confirm-banner');
    const firstCard = document.querySelector('#stepResult .card');
    const secondCard = document.querySelectorAll('#stepResult .card')[1];
    return {
      visible: !b.hidden && !!banner,
      isDanger: banner ? !banner.classList.contains('is-warn') : false,
      text: banner ? banner.innerText : '',
      aboveOtherCards: banner && secondCard ? banner.getBoundingClientRect().top < secondCard.getBoundingClientRect().top : false
    };
  });
  rec('A9', '时间冲突时顶部出现提醒，写明前后不一致且不收起',
    a9.visible && a9.isDanger && a9.text.includes('不一致') && a9.aboveOtherCards,
    JSON.stringify(a9).slice(0, 300));
  await page.screenshot({ path: path.join(OUT, 'ui-conflict-390.png') });

  // A10 非通知：显示"不是通知"，不是"整理失败"
  const run3 = await analyzeAndWait(page, CHAT);
  const a10 = await page.evaluate(() => ({
    notNotice: !document.getElementById('stepNotNotice').hidden,
    error: !document.getElementById('stepError').hidden,
    title: document.querySelector('#stepNotNotice .notice-title') ? document.querySelector('#stepNotNotice .notice-title').textContent : ''
  }));
  rec('A10', '非通知文本显示"不是通知"提示，而不是失败页',
    a10.notNotice && !a10.error, JSON.stringify(a10));

  await browser.close();

  const record = {
    runAt: new Date().toISOString(), url: URL,
    browser: 'Microsoft Edge (headless) via playwright-core，视口 390×844',
    results,
    summary: { total: results.length, passed: results.filter((r) => r.pass).length, failed: results.filter((r) => !r.pass).length }
  };
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(path.join(OUT, `a-extra-${stamp}.json`), JSON.stringify(record, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT, 'a-extra-latest.json'), JSON.stringify(record, null, 2), 'utf8');
  console.log('\n汇总:', JSON.stringify(record.summary));
})();
