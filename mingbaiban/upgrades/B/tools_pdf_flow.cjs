const { chromium } = require('playwright-core');
const path = require('path');
(async () => {
  const inp = path.resolve(process.argv[2]);
  const out = path.resolve(process.argv[3]);
  const left = process.argv[4] || '明白办';
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage();
  await p.goto('file:///' + inp.replace(/\\/g,'/'), { waitUntil: 'load', timeout: 60000 });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(600);
  await p.pdf({
    path: out, format: 'A4', printBackground: true, displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: `<div style="width:100%;padding:0 16mm;font-family:Microsoft YaHei;font-size:8px;color:#8b95a1;display:flex;justify-content:space-between;border-top:1px solid #E9E3D6;padding-top:4px;"><span>${left}　v1.2.0-b2</span><span>2026-10-23　第 <span class="pageNumber"></span> 页 / 共 <span class="totalPages"></span> 页</span></div>`,
    margin: { top:'14mm', right:'16mm', bottom:'16mm', left:'16mm' }
  });
  await b.close();
  console.log('PDF ok', out);
})();
