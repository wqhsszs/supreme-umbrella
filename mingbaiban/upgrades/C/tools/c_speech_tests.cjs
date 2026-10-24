/* C 轮朗读测试
 *
 * 分三层：
 *   1) 文本层：只做等价发音改写（9:00 → 9点），数值/年份/用途不变；
 *      缺失、冲突、待确认必须读出来；不读 JSON、按钮名、网址。
 *   2) 状态层：用注入的假引擎验证 播放/暂停/继续/停止、单实例、换卡终止。
 *   3) 真实层：检查这台机器实际能拿到中文音色、能接受合成请求（不伪造声音）。
 *
 * 运行：NODE_PATH=<workspace>/node_modules node tools/c_speech_tests.cjs [url]
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'delivery', 'assets', 'evidence');
const URL = process.argv[2] || 'https://mingbaiban-42482.app.workbuddy.host/?sharecode=QCZF2UKNAG';
const EXPECT_VERSION = '1.3.0-c7';
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');

const results = [];
function rec(id, name, pass, detail) {
  results.push({ id, name, pass: !!pass, detail: detail == null ? '' : String(detail) });
  console.log((pass ? 'PASS' : 'FAIL'), id, name, pass ? '' : ('| ' + String(detail).slice(0, 400)));
}

const FULL = {
  document_status: 'notice',
  summary: '社区开展手机使用指导活动，需提前到一楼服务台报名，仅限已报名居民参加。',
  audience: { value: '社区老年居民', status: 'stated', evidence: ['为帮助老年居民'] },
  times: [
    { purpose: '报名截止', value: '2026年10月25日17:00前', status: 'stated', evidence: ['请于2026年10月25日17:00前'],
      place: { value: '社区服务中心一楼服务台', status: 'stated', evidence: ['一楼服务台报名'] } },
    { purpose: '活动开始', value: '2026年10月26日9:00—11:00', status: 'stated', evidence: ['2026年10月26日9:00—11:00'],
      place: { value: '社区服务中心二楼活动室', status: 'stated', evidence: ['二楼活动室'] } }
  ],
  location: { value: '社区服务中心', status: 'stated', evidence: ['社区服务中心'] },
  preparation: [{ value: '本人手机', status: 'stated', evidence: ['请携带本人手机'] }],
  actions: [{ type: 'required', value: '在2026年10月25日17:00前到一楼服务台报名', evidence: ['17:00前到社区服务中心一楼服务台报名'] }],
  questions: ['名额还剩多少，现在报名还有没有位置？'],
  warnings: ['本次活动仅限已报名居民参加，请携带本人手机。']
};

const MISSING = {
  document_status: 'notice', summary: '社区组织健康讲座。',
  audience: { value: null, status: 'missing', evidence: [] },
  times: [{ purpose: '活动开始', value: '10月26日上午9点', status: 'stated', evidence: ['10月26日上午9点'],
            place: { value: null, status: 'missing', evidence: [] } }],
  location: { value: null, status: 'missing', evidence: [] },
  preparation: [], actions: [{ type: 'required', value: '10月25日前到社区服务台登记', evidence: ['10月25日前到社区服务台登记'] }],
  questions: ['活动地点在哪里？'], warnings: []
};

const CONFLICT = {
  document_status: 'notice', summary: '社区开展智能手机使用指导活动，报名截止时间前后不一致。',
  audience: { value: '社区居民', status: 'stated', evidence: ['各位居民'] },
  times: [
    { purpose: '报名截止', value: '2026年10月25日17:00前，另处写10月24日18:00后不再接受报名', status: 'conflict',
      evidence: ['2026年10月25日17:00前到一楼服务台报名', '10月24日18:00后不再接受报名'],
      place: { value: '一楼服务台', status: 'stated', evidence: ['一楼服务台'] } },
    { purpose: '活动开始', value: '2026年10月26日9:00—11:00', status: 'stated', evidence: ['10月26日9:00—11:00'],
      place: { value: '二楼活动室', status: 'stated', evidence: ['二楼活动室'] } }
  ],
  location: { value: '社区服务中心', status: 'stated', evidence: ['社区服务中心'] },
  preparation: [], actions: [], questions: ['报名截止到底是25日17:00还是24日18:00？'],
  warnings: ['两处报名截止时间不一致。']
};

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  let loaded = false;
  for (let i = 0; i < 5 && !loaded; i++) {
    try {
      await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForFunction(() => window.__MBB && window.MBBSpeech, null, { timeout: 15000 });
      const v = await page.evaluate(() => window.MBB_CONFIG.appVersion);
      if (v !== EXPECT_VERSION) throw new Error('版本不一致：' + v);
      loaded = true;
    } catch (e) {
      console.log('  [load retry ' + (i + 1) + '] ' + String(e.message).slice(0, 70));
      await page.waitForTimeout(3000);
    }
  }
  if (!loaded) throw new Error('页面始终未就绪');

  /* ---------- 1. 发音等价改写 ---------- */
  const sp = await page.evaluate(() => ({
    a: window.MBBSpeech.speakable('2026年10月25日17:00前'),
    b: window.MBBSpeech.speakable('2026年10月26日9:00—11:00'),
    c: window.MBBSpeech.speakable('9:30 开始，11:05 结束'),
    d: window.MBBSpeech.speakable('地点：社区服务中心二楼活动室')
  }));
  rec('C2-01', '时间只做等价改写：17:00→17点、9:00—11:00→9点到11点，年份不变',
    sp.a.includes('17点') && sp.a.includes('2026年10月25日') && sp.b.includes('9点到11点') && sp.b.includes('2026年10月26日'),
    JSON.stringify(sp));
  rec('C2-02', '非整点保留分钟：9:30→9点30分', sp.c.includes('9点30分') && sp.c.includes('11点5分'), sp.c);

  /* ---------- 2. 文本内容 ---------- */
  const texts = await page.evaluate(({ FULL, MISSING, CONFLICT }) => ({
    full: window.MBBSpeech.buildText(FULL, { prepChecked: {}, actChecked: {} }),
    fullChecked: window.MBBSpeech.buildText(FULL, { prepChecked: { 0: true }, actChecked: { 0: true } }),
    missing: window.MBBSpeech.buildText(MISSING, {}),
    conflict: window.MBBSpeech.buildText(CONFLICT, {})
  }), { FULL, MISSING, CONFLICT });

  const f = texts.full;
  rec('C2-03', '完整卡片：报名与活动分开读，两处地点分别读',
    f.includes('报名截止') && f.includes('活动开始') && f.includes('一楼服务台') && f.includes('二楼活动室'),
    f.slice(0, 220));
  rec('C2-04', '完整卡片：数字与限制不丢（25日17点、26日9点到11点、仅限）',
    f.includes('2026年10月25日17点') && f.includes('2026年10月26日9点到11点') && /仅限/.test(f),
    f.slice(0, 260));
  rec('C2-05', '勾选会被读成“整理者勾选”，并明确不等于已报名',
    texts.fullChecked.includes('整理者已经勾选 1 项') && /不代表已经报名/.test(texts.fullChecked),
    texts.fullChecked.match(/整理者已经勾选[^。]*。/g));

  const m = texts.missing;
  rec('C2-06', '缺失卡片：明确的“通知未说明”会被读出来，且不重复',
    (m.match(/通知未说明/g) || []).length >= 2 && !/通知未说明，通知未说明/.test(m),
    m.slice(0, 220));
  rec('C2-07', '缺失卡片：不补年份（无 2026/2027）', !/2026|2027/.test(m), m.slice(0, 160));

  const c = texts.conflict;
  rec('C2-08', '冲突卡片：开头就读“先注意”，并说明要问清以哪个为准',
    /先注意/.test(c) && /前后不一致/.test(c) && /哪个为准/.test(c),
    c.slice(0, 200));

  const all = [texts.full, texts.missing, texts.conflict, texts.fullChecked].join('\n');
  rec('C2-09', '朗读文本不含 JSON、按钮名、网址或“已报名成功”',
    !/[{}"]/.test(all) && !/https?:\/\//.test(all) && !/复制行动卡|对照通知原文/.test(all) && !/已经报名成功|已帮您报名/.test(all),
    'lengths=' + all.length);

  /* ---------- 3. 假引擎：状态机 ---------- */
  const fake = await page.evaluate(() => {
    const f = {
      speakCount: 0, concurrent: 0, maxConcurrent: 0, cancelled: 0,
      paused: false, speaking: false, last: null,
      getVoices() {
        /* 必须返回真实的 SpeechSynthesisVoice 对象：
           给 utterance.voice 赋普通对象会被浏览器拒绝。 */
        const all = (window.speechSynthesis.getVoices() || []);
        const zh = all.filter((v) => /^zh|cmn/i.test(v.lang || ''));
        return zh.length ? zh : all.slice(0, 1);
      },
      speak(u) {
        f.speakCount++; f.concurrent++; f.maxConcurrent = Math.max(f.maxConcurrent, f.concurrent);
        f.last = u; f.speaking = true;
        setTimeout(() => { if (u.onstart) u.onstart(); }, 20);
      },
      cancel() { f.cancelled++; f.concurrent = 0; f.speaking = false; f.paused = false; },
      pause() { f.paused = true; },
      resume() { f.paused = false; }
    };
    window.MBBSpeech._setEngine(f);
    window.__fake = f;
    return { supported: window.MBBSpeech.supported() };
  });

  /* 生成一张真实卡片，用于点击朗读按钮 */
  await page.click('.btn-sample[data-sample="0"]');
  await page.click('#btnAnalyze');
  await page.waitForSelector('#stepResult:not([hidden]), #stepError:not([hidden])', { timeout: 120000 });
  const hasCard = await page.evaluate(() => window.__MBB.state().hasResult);
  rec('C2-10', '准备：文字链路仍能生成卡片', hasCard, String(hasCard));

  if (hasCard) {
    await page.evaluate(() => document.getElementById('btnSpeak').click());
    await page.waitForTimeout(300);
    const s1 = await page.evaluate(() => ({
      controls: !document.getElementById('speechControls').hidden,
      btnHidden: document.getElementById('btnSpeak').hidden,
      status: document.getElementById('speechStatus').textContent,
      fake: { max: window.__fake.maxConcurrent, count: window.__fake.speakCount }
    }));
    rec('C2-11', '点“读给家人听”：出现暂停/停止，开始朗读', s1.controls && s1.btnHidden, JSON.stringify(s1));

    await page.evaluate(() => document.getElementById('btnPauseSpeak').click());
    const s2 = await page.evaluate(() => ({
      label: document.getElementById('btnPauseSpeak').textContent,
      paused: window.MBBSpeech.status().paused
    }));
    rec('C2-12', '暂停后按钮变“继续”，状态为已暂停', s2.paused === true && s2.label === '继续', JSON.stringify(s2));

    await page.evaluate(() => document.getElementById('btnPauseSpeak').click());
    const s3 = await page.evaluate(() => ({
      label: document.getElementById('btnPauseSpeak').textContent,
      paused: window.MBBSpeech.status().paused
    }));
    rec('C2-13', '继续后按钮变回“暂停”', s3.paused === false && s3.label === '暂停', JSON.stringify(s3));

    await page.evaluate(() => {
      window.MBBSpeech.speak('第一段测试文本。', {});
      window.MBBSpeech.speak('第二段测试文本。', {});
    });
    await page.waitForTimeout(400);
    const s4 = await page.evaluate(() => ({ max: window.__fake.maxConcurrent, count: window.__fake.speakCount }));
    rec('C2-14', '连续点击不会同时启动多个朗读任务', s4.max === 1, JSON.stringify(s4));

    await page.evaluate(() => document.getElementById('btnStopSpeak').click());
    const s5 = await page.evaluate(() => ({
      controls: document.getElementById('speechControls').hidden,
      btnVisible: !document.getElementById('btnSpeak').hidden,
      speaking: window.MBBSpeech.status().speaking
    }));
    rec('C2-15', '停止后收起控制、恢复主按钮', s5.controls && s5.btnVisible && s5.speaking === false, JSON.stringify(s5));

    /* 换卡终止朗读 */
    await page.evaluate(() => document.getElementById('btnSpeak').click());
    await page.waitForTimeout(200);
    await page.click('#btnNewNotice');
    await page.waitForTimeout(400);
    const s6 = await page.evaluate(() => ({
      speaking: window.MBBSpeech.status().speaking,
      input: !document.getElementById('stepInput').hidden
    }));
    rec('C2-16', '换一条通知时终止旧朗读', s6.speaking === false && s6.input, JSON.stringify(s6));
  }

  /* ---------- 4. 无中文音色 ---------- */
  const noVoice = await page.evaluate(async () => {
    window.MBBSpeech._setEngine({
      getVoices() { return []; },
      speak(u) { this.last = u; },
      cancel() {}, pause() {}, resume() {}, speaking: false
    });
    const r = await window.MBBSpeech.speak('测试没有中文音色的情况。', { voiceWaitMs: 200 });
    return { r, status: window.MBBSpeech.status() };
  });
  rec('C2-17', '设备没有中文音色：如实标记 hasZhVoice=false，仍尝试合成并给出提示',
    noVoice.r.ok === true && noVoice.r.hasZhVoice === false && noVoice.status.zhVoiceCount === 0,
    JSON.stringify(noVoice.r));

  /* ---------- 5. 浏览器不支持 ---------- */
  const unsupported = await page.evaluate(async () => {
    window.MBBSpeech._setEngine(null);
    const saved = window.SpeechSynthesisUtterance;
    window.SpeechSynthesisUtterance = undefined;
    const supported = window.MBBSpeech.supported();
    const r = await window.MBBSpeech.speak('测试不支持的情况。', {});
    window.SpeechSynthesisUtterance = saved;
    return { supported, r };
  });
  rec('C2-18', '浏览器不支持朗读：返回明确提示，不显示假成功',
    unsupported.supported === false && unsupported.r.ok === false && unsupported.r.code === 'unsupported',
    JSON.stringify(unsupported));

  /* ---------- 6. 真实引擎能力 ---------- */
  const real = await page.evaluate(async () => {
    window.MBBSpeech._setEngine(null);
    const st = window.MBBSpeech.status();
    const r = await window.MBBSpeech.speak('明白办测试：二零二六年十月二十五日十七点前报名。', { voiceWaitMs: 2000 });
    await new Promise((res) => setTimeout(res, 1200));
    const after = window.MBBSpeech.status();
    window.MBBSpeech.stop();
    return { st, r, after };
  });
  rec('C2-19', '真实设备：检测到中文音色，并接受合成请求（不伪造声音）',
    real.st.supported === true && real.st.zhVoiceCount > 0 && real.r.ok === true && !!real.r.voiceName,
    JSON.stringify({ voices: real.st.zhVoiceCount, voice: real.r.voiceName, speaking: real.after.speaking }));

  await browser.close();

  const passed = results.filter((r) => r.pass).length;
  const record = {
    round: 'C2', url: URL, version: EXPECT_VERSION,
    runAt: new Date().toISOString(),
    environment: process.platform + ' / Node ' + process.version,
    browser: 'Microsoft Edge (Playwright, headless, --no-proxy-server)',
    note: '状态机用注入的假引擎验证；真实设备只验证“能取到中文音色并接受合成请求”，headless 下不把是否出声当作画面证据。',
    speechTexts: texts,
    summary: { total: results.length, passed },
    results
  };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'c-speech-' + stamp + '.json'), JSON.stringify(record, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT, 'c-speech-latest.json'), JSON.stringify(record, null, 2), 'utf8');
  console.log('\n== C2 朗读测试：' + passed + '/' + results.length + ' 通过 ==');
  process.exit(passed === results.length ? 0 : 1);
})();
