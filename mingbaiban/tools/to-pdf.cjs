// HTML → PDF（用 Edge/Chromium 打印引擎，保留 CSS 分页与背景）
// 运行：NODE_PATH=<workspace>/node_modules node tools/to-pdf.cjs <in.html> <out.pdf>
const { chromium } = require('playwright-core');
const path = require('path');

(async () => {
  const inHtml = path.resolve(process.argv[2]);
  const outPdf = path.resolve(process.argv[3]);
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  await page.goto('file:///' + inHtml.replace(/\\/g, '/'), { waitUntil: 'load', timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  await page.pdf({
    path: outPdf,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 }
  });
  await browser.close();
  console.log('PDF 生成：' + outPdf);
})();
