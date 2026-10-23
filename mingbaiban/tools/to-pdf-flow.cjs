// HTML → PDF（流式排版：自动分页 + 页脚页码）
const { chromium } = require('playwright-core');
const path = require('path');

(async () => {
  const inHtml = path.resolve(process.argv[2]);
  const outPdf = path.resolve(process.argv[3]);
  const footerLeft = process.argv[4] || '明白办';
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  await page.goto('file:///' + inHtml.replace(/\\/g, '/'), { waitUntil: 'load', timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.pdf({
    path: outPdf,
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: `<div style="width:100%;padding:0 16mm;font-family:Microsoft YaHei;font-size:8px;color:#8b95a1;display:flex;justify-content:space-between;border-top:1px solid #e6ebf1;padding-top:4px;">
      <span>${footerLeft}　v1.0.0</span><span>2026-10-23　第 <span class="pageNumber"></span> 页 / 共 <span class="totalPages"></span> 页</span></div>`,
    margin: { top: '14mm', right: '16mm', bottom: '16mm', left: '16mm' }
  });
  await browser.close();
  console.log('PDF 生成：' + outPdf);
})();
