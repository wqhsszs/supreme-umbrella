const { chromium } = require('playwright-core');
const path = require('path');
(async () => {
  const inp = path.resolve(process.argv[2]);
  const out = path.resolve(process.argv[3]);
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage();
  await p.goto('file:///' + inp.replace(/\\/g,'/'), { waitUntil: 'load', timeout: 60000 });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(700);
  await p.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true,
                margin: { top:0,right:0,bottom:0,left:0 } });
  await b.close();
  console.log('PDF ok', out);
})();
