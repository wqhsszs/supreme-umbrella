// A 轮本地布局与对比度检查（不依赖线上模型；只看界面）
// 运行：NODE_PATH=<workspace>/node_modules node tools/a_layout_check.cjs <baseUrl>
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const BASE = process.argv[2] || 'http://127.0.0.1:8123/';
const OUT = path.resolve(__dirname, '..', 'delivery', 'assets');
fs.mkdirSync(OUT, { recursive: true });

const HEX = (h) => {
  h = h.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const lum = (rgb) => {
  const c = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const l1 = lum(HEX(a)), l2 = lum(HEX(b));
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
};

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const result = { base: BASE, viewports: [], contrast: [], issues: [] };

  for (const [w, h] of [[360, 780], [390, 844], [768, 1024], [1280, 900]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(400);

    const m = await page.evaluate(() => {
      const de = document.documentElement;
      const btn = document.getElementById('btnAnalyze');
      const rb = btn.getBoundingClientRect();
      const heroImg = document.querySelector('.hero-art img');
      const ta = document.getElementById('noticeInput');
      const smallTargets = Array.from(document.querySelectorAll('button, input[type=checkbox], a.btn'))
        .filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 44; })
        .map((b) => (b.id || b.className || b.tagName) + ':' + Math.round(b.getBoundingClientRect().height));
      return {
        scrollW: de.scrollWidth, clientW: de.clientWidth,
        bodyFont: getComputedStyle(document.body).fontSize,
        ctaTop: Math.round(rb.top), ctaHeight: Math.round(rb.height),
        heroH: heroImg ? Math.round(heroImg.getBoundingClientRect().height) : 0,
        textareaFont: getComputedStyle(ta).fontSize,
        smallTargets
      };
    });

    await page.screenshot({ path: path.join(OUT, `ui-home-${w}.png`), fullPage: false });
    await page.screenshot({ path: path.join(OUT, `ui-home-${w}-full.png`), fullPage: true });

    // 键盘可达性：Tab 焦点是否可见
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => {
      const a = document.activeElement;
      const s = getComputedStyle(a);
      return { tag: a.tagName, outline: s.outlineWidth + ' ' + s.outlineStyle, shadow: s.boxShadow.slice(0, 40) };
    });

    result.viewports.push({ w, h, ...m, focus });
    if (m.scrollW > m.clientW + 1) result.issues.push(`${w}px 出现横向滚动：${m.scrollW} > ${m.clientW}`);
    if (m.smallTargets.length) result.issues.push(`${w}px 触控区小于 44px：${m.smallTargets.join(', ')}`);
    if (w <= 390 && m.ctaTop > 1400) result.issues.push(`${w}px 主按钮被挤到 ${m.ctaTop}px，首屏找不到`);
    await page.close();
  }

  // 关于页
  const about = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await about.goto(BASE + 'about.html', { waitUntil: 'networkidle', timeout: 60000 });
  await about.screenshot({ path: path.join(OUT, 'ui-about-390.png'), fullPage: false });
  await about.close();

  await browser.close();

  const pairs = [
    ['正文 #26312C on #F7F3EB', '#26312C', '#F7F3EB'],
    ['次级文字 #45514A on #F7F3EB', '#45514A', '#F7F3EB'],
    ['弱化文字 #5D6A63 on #F7F3EB', '#5D6A63', '#F7F3EB'],
    ['主按钮白字 on 深墨绿 #254C40', '#FFFFFF', '#254C40'],
    ['正文 #26312C on 卡片 #FFFFFF', '#26312C', '#FFFFFF'],
    ['写状态 #2F6B4F on #EAF3ED', '#2F6B4F', '#EAF3ED'],
    ['含糊 #8A4B1E on #FBF0E2', '#8A4B1E', '#FBF0E2'],
    ['冲突 #9E2B25 on #F9EAE8', '#9E2B25', '#F9EAE8'],
    ['重点色（文字版）#8F4322 on #F7F3EB', '#8F4322', '#F7F3EB'],

  ];
  pairs.forEach(([name, fg, bg]) => {
    const r = ratio(fg, bg);
    const need = 4.5;
    result.contrast.push({ name, ratio: Math.round(r * 100) / 100, passAA: r >= need });
    if (r < need) result.issues.push(`对比度不足 AA(4.5:1)：${name} = ${r.toFixed(2)}`);
  });

  fs.writeFileSync(path.join(OUT, 'layout-check.json'), JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify(result.viewports.map((v) => ({
    w: v.w, scroll: v.scrollW <= v.clientW + 1, ctaTop: v.ctaTop, ctaH: v.ctaHeight,
    heroH: v.heroH, font: v.bodyFont, small: v.smallTargets.length
  })), null, 1));
  console.log('对比度：');
  result.contrast.forEach((c) => console.log(`  ${c.passAA ? 'PASS' : 'FAIL'} ${c.ratio}:1  ${c.name}`));
  console.log('\n问题：' + (result.issues.length ? '\n- ' + result.issues.join('\n- ') : '无'));
})();
