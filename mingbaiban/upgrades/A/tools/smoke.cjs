// 冒烟测试：验证线上页面能真实调用模型（CommonJS，靠 NODE_PATH 找 playwright-core）
// 运行：NODE_PATH=<workspace>/node_modules node tools/smoke.cjs [url] [noticeText]
const { chromium } = require('playwright-core');

(async () => {
  const url = process.argv[2] || 'https://mingbaiban-42482.app.workbuddy.host/?sharecode=QCZF2UKNAG';
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const logs = [];
  page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));

  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

  const ready = await page.evaluate(() => window.MBBLLM && window.MBBLLM.status());
  console.log('LLM status:', JSON.stringify(ready));

  let models = null;
  try {
    models = await page.evaluate(async () => {
      const mc = await window.MBBLLM.listModels();
      return { picked: mc.model, ids: mc.all.map((m) => ({ id: m.id, name: m.name, disabled: m.disabled })) };
    });
    console.log('models:', JSON.stringify(models, null, 2));
  } catch (e) {
    console.log('models FAILED:', e.message);
  }

  const text = process.argv[3] ||
    '2026年10月26日9:00—11:00，社区服务中心开展手机使用指导，仅限已报名居民参加，请携带本人手机。';

  const t0 = Date.now();
  const r = await page.evaluate(async (t) => await window.__MBB.analyze(t), text);
  const dt = Date.now() - t0;
  console.log('elapsed ms:', dt);
  console.log('result:', JSON.stringify(r, null, 2).slice(0, 4000));

  console.log('--- console logs ---');
  console.log(logs.slice(-20).join('\n'));

  await browser.close();
})();
