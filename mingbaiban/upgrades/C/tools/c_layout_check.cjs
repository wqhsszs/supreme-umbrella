/* C 轮布局与对比度检查（本地或线上都可用；不调用模型，用固定已校验数据渲染）
 *
 * 覆盖：首页文字模式、上传预览、核对双栏、行动卡 + 朗读区，四档视口。
 * 判定：
 *   - 无横向滚动
 *   - 可点区域不小于 44px
 *   - 桌面上原图与文字并排（768px 起），手机上上下堆叠
 *   - 文字/背景对比度达到 WCAG AA（正文 4.5:1）
 *
 * 运行：NODE_PATH=<workspace>/node_modules node tools/c_layout_check.cjs <baseUrl>
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const BASE = process.argv[2] || 'http://127.0.0.1:8124/';
const SAMPLE = path.resolve(__dirname, '..', 'delivery', 'assets', 'ocr-samples', 'ocr-01-clear.jpg');
const OUT = path.resolve(__dirname, '..', 'delivery', 'assets', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

const HEX = (h) => {
  h = String(h).trim().replace('#', '');
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

const FIXTURE = {
  document_status: 'notice',
  document_status_reason: '社区关于开展手机使用指导活动的通知',
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

const OCR_TEXT = '关于开展“手机使用指导”活动的通知\n\n各位居民：\n为帮助老年居民掌握智能手机常用功能，社区服务中心将开展“手机使用指导”活动。\n时间：2026年10月26日9:00—11:00\n地点：社区服务中心二楼活动室\n报名方式：请于2026年10月25日17:00前到社区服务中心一楼服务台报名，名额有限。\n说明：本次活动仅限已报名居民参加，请携带本人手机。';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] });
  const result = { base: BASE, viewports: [], contrast: [], issues: [], at: new Date().toISOString() };

  for (const [w, h] of [[360, 780], [390, 844], [768, 1024], [1280, 900]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForFunction(() => window.__MBB, null, { timeout: 20000 });

    /* 首页 + 上传预览 */
    await page.click('#tabImage');
    await page.setInputFiles('#imageInput', SAMPLE);
    await page.waitForSelector('#imagePreviewCard:not([hidden])', { timeout: 15000 });

    const upload = await page.evaluate(() => {
      const de = document.documentElement;
      const ta = document.getElementById('noticeInput');
      return {
        scrollW: de.scrollWidth, clientW: de.clientWidth,
        bodyFont: getComputedStyle(document.body).fontSize,
        textareaFont: getComputedStyle(ta).fontSize,
        previewH: Math.round(document.getElementById('imagePreview').getBoundingClientRect().height),
        ocrBtn: Math.round(document.getElementById('btnOcr').getBoundingClientRect().height)
      };
    });

    const smallUpload = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button, input[type=checkbox], a.btn'))
        .filter((b) => {
          const t = (b.type === 'checkbox' && b.closest('label')) ? b.closest('label') : b;
          const r = t.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.height < 44;
        })
        .map((b) => {
          const t = (b.type === 'checkbox' && b.closest('label')) ? b.closest('label') : b;
          return (b.id || b.className || b.tagName) + ':' + Math.round(t.getBoundingClientRect().height);
        });
    });
    await page.screenshot({ path: path.join(OUT, `c-upload-${w}.png`) });

    /* 核对界面（直接注入识别文本，不调用模型） */
    await page.evaluate((t) => window.__MBB._showReview(t), OCR_TEXT);
    const review = await page.evaluate(() => {
      const de = document.documentElement;
      const fig = document.querySelector('.review-figure').getBoundingClientRect();
      const ed = document.querySelector('.review-editor').getBoundingClientRect();
      const btn = document.getElementById('btnConfirmOcr').getBoundingClientRect();
      return {
        scrollW: de.scrollWidth, clientW: de.clientWidth,
        sideBySide: Math.abs(fig.top - ed.top) < 40 && ed.left > fig.left + 40,
        figW: Math.round(fig.width), edW: Math.round(ed.width),
        confirmTop: Math.round(btn.top + window.scrollY), confirmH: Math.round(btn.height),
        confirmDisabled: document.getElementById('btnConfirmOcr').disabled
      };
    });
    const smallReview = await page.evaluate(() => Array.from(document.querySelectorAll('button, input[type=checkbox], a.btn'))
      .filter((b) => {
        const t = (b.type === 'checkbox' && b.closest('label')) ? b.closest('label') : b;
        const r = t.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.height < 44;
      })
      .map((b) => {
        const t = (b.type === 'checkbox' && b.closest('label')) ? b.closest('label') : b;
        return (b.id || b.className || b.tagName) + ':' + Math.round(t.getBoundingClientRect().height);
      }));
    await page.screenshot({ path: path.join(OUT, `c-review-${w}.png`), fullPage: w >= 768 });

    /* 结果页 + 朗读区（固定数据） */
    await page.evaluate((d) => window.__MBB._renderFixture(d, 'image'), FIXTURE);
    await page.waitForTimeout(300);
    const resultM = await page.evaluate(() => {
      const de = document.documentElement;
      const speak = document.getElementById('btnSpeak').getBoundingClientRect();
      const copy = document.getElementById('btnCopy').getBoundingClientRect();
      return {
        scrollW: de.scrollWidth, clientW: de.clientWidth,
        speakTop: Math.round(speak.top + window.scrollY), speakH: Math.round(speak.height),
        copyH: Math.round(copy.height),
        speechText: document.getElementById('speechStatus').textContent,
        sourceLine: document.getElementById('sourceLine').textContent
      };
    });
    const smallResult = await page.evaluate(() => Array.from(document.querySelectorAll('button, input[type=checkbox], a.btn'))
      .filter((b) => {
        const t = (b.type === 'checkbox' && b.closest('label')) ? b.closest('label') : b;
        const r = t.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.height < 44;
      })
      .map((b) => {
        const t = (b.type === 'checkbox' && b.closest('label')) ? b.closest('label') : b;
        return (b.id || b.className || b.tagName) + ':' + Math.round(t.getBoundingClientRect().height);
      }));
    await page.screenshot({ path: path.join(OUT, `c-result-${w}.png`) });
    await page.screenshot({ path: path.join(OUT, `c-result-${w}-full.png`), fullPage: true });

    result.viewports.push({
      w, h, upload, review, result: resultM,
      smallTargets: { upload: smallUpload, review: smallReview, result: smallResult }
    });

    if (upload.scrollW > upload.clientW + 1) result.issues.push(`${w}px 上传页横向滚动`);
    if (review.scrollW > review.clientW + 1) result.issues.push(`${w}px 核对页横向滚动`);
    if (resultM.scrollW > resultM.clientW + 1) result.issues.push(`${w}px 结果页横向滚动`);
    if (smallUpload.length) result.issues.push(`${w}px 上传页触控区 <44：${smallUpload.join(', ')}`);
    if (smallReview.length) result.issues.push(`${w}px 核对页触控区 <44：${smallReview.join(', ')}`);
    if (smallResult.length) result.issues.push(`${w}px 结果页触控区 <44：${smallResult.join(', ')}`);
    if (w >= 768 && !review.sideBySide) result.issues.push(`${w}px 核对页未并排（原图 ${review.figW}px / 文字 ${review.edW}px）`);
    if (w <= 430 && review.sideBySide) result.issues.push(`${w}px 核对页在手机上不应并排`);
    if (!review.confirmDisabled) result.issues.push(`${w}px 核对页确认按钮初始未禁用`);

    await page.close();
  }

  const pairs = [
    ['正文 #26312C on #F7F3EB', '#26312C', '#F7F3EB'],
    ['次级文字 #45514A on #FFFFFF', '#45514A', '#FFFFFF'],
    ['弱化文字 #5D6A63 on #F7F3EB', '#5D6A63', '#F7F3EB'],
    ['主色按钮 #FFFFFF on #254C40', '#FFFFFF', '#254C40'],
    ['重点色文字 #8F4322 on #F7F3EB', '#8F4322', '#F7F3EB'],
    ['核对提示 #8A4B1E on #FBF0E2', '#8A4B1E', '#FBF0E2'],
    ['冲突标题 #9E2B25 on #F9EAE8', '#9E2B25', '#F9EAE8'],
    ['原文写明 #2F6B4F on #EAF3ED', '#2F6B4F', '#EAF3ED'],
    ['选中标签 #254C40 on #FFFFFF', '#254C40', '#FFFFFF']
  ];
  for (const [name, fg, bg] of pairs) {
    const r = ratio(fg, bg);
    result.contrast.push({ name, fg, bg, ratio: Math.round(r * 100) / 100, passAA: r >= 4.5 });
    if (r < 4.5) result.issues.push(`对比度不足：${name} = ${r.toFixed(2)}:1`);
  }

  await browser.close();
  fs.writeFileSync(path.resolve(__dirname, '..', 'delivery', 'assets', 'evidence', 'c-layout.json'), JSON.stringify(result, null, 2), 'utf8');
  console.log('视口:', result.viewports.map((v) => v.w + '×' + v.h).join(' | '));
  for (const v of result.viewports) {
    console.log(`${v.w}×${v.h} 上传:滚动${v.upload.scrollW > v.upload.clientW + 1 ? '有' : '无'} 核对:并排${v.review.sideBySide ? '是' : '否'} 结果:滚动${v.result.scrollW > v.result.clientW + 1 ? '有' : '无'}`);
  }
  console.log('对比度最低:', Math.min(...result.contrast.map((c) => c.ratio)).toFixed(2) + ':1');
  console.log(result.issues.length ? ('问题:\n- ' + result.issues.join('\n- ')) : '无布局问题');
  process.exit(result.issues.length ? 1 : 0);
})();
