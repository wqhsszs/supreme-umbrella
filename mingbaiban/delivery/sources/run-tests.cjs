// 12 条通知测试执行器（对线上真实版本跑真实模型）
// 运行：NODE_PATH=<workspace>/node_modules node tools/run-tests.cjs [url] [--only=N1,N2]
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const casesFile = path.join(ROOT, 'tests', 'cases.json');
const outDir = path.join(ROOT, 'tests', 'evidence');

const args = process.argv.slice(2);
const urlArg = args.find((a) => a.startsWith('http'));
const onlyArg = args.find((a) => a.startsWith('--only='));
const URL = urlArg || 'https://mingbaiban-42482.app.workbuddy.host/?sharecode=QCZF2UKNAG';
const ONLY = onlyArg ? onlyArg.split('=')[1].split(',') : null;

function get(obj, p) {
  return p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function factValues(d) {
  const out = [];
  const push = (x) => { if (x && x.value != null) out.push(String(x.value)); };
  push(d.audience); push(d.location);
  (d.times || []).forEach(push);
  (d.preparation || []).forEach(push);
  (d.actions || []).forEach(push);
  return out;
}

function evalCheck(c, d, res, caseObj) {
  const fail = (m) => ({ pass: false, msg: m });
  const ok = { pass: true, msg: '' };
  const facts = factValues(d);
  const all = JSON.stringify(d);

  switch (c.type) {
    case 'docStatus':
      return d.document_status === c.expect ? ok : fail(`document_status=${d.document_status}，期望 ${c.expect}`);
    case 'status': {
      const v = get(d, c.path);
      return v && v.status === c.expect ? ok : fail(`${c.path}.status=${v && v.status}，期望 ${c.expect}`);
    }
    case 'nullValue': {
      const v = get(d, c.path);
      return v === null ? ok : fail(`${c.path}=${JSON.stringify(v)}，期望 null`);
    }
    case 'contains': {
      const v = String(get(d, c.path) == null ? '' : get(d, c.path));
      return c.any.some((s) => v.includes(s)) ? ok : fail(`${c.path}「${v}」不含任何一个：${c.any.join(' / ')}`);
    }
    case 'prepContains':
    case 'prepContainsAll': {
      const txt = (d.preparation || []).map((p) => String(p.value || '')).join(' | ');
      const fn = c.type === 'prepContains' ? 'some' : 'every';
      const good = c.type === 'prepContains'
        ? c.any.some((s) => txt.includes(s))
        : c.values.every((s) => txt.includes(s));
      return good ? ok : fail(`准备事项「${txt}」${fn === 'some' ? '不含任何一个' : '未全部包含'}：${(c.any || c.values).join(' / ')}`);
    }
    case 'purposeStatus': {
      const t = (d.times || []).find((x) => (x.purpose || '').includes(c.purpose));
      if (!t) return fail(`没有 purpose 含「${c.purpose}」的时间项`);
      return t.status === c.expect ? ok : fail(`${c.purpose}.status=${t.status}，期望 ${c.expect}`);
    }
    case 'purposeContains': {
      const t = (d.times || []).find((x) => (x.purpose || '').includes(c.purpose));
      if (!t) return fail(`没有 purpose 含「${c.purpose}」的时间项`);
      const v = String(t.value == null ? '' : t.value);
      return c.any.some((s) => v.includes(s)) ? ok : fail(`${c.purpose}「${v}」不含：${c.any.join(' / ')}`);
    }
    case 'purposesNotMerged': {
      const ps = (d.times || []).map((x) => x.purpose || '');
      const hasBoth = ps.some((p) => p.includes('报名')) && ps.some((p) => p.includes('活动'));
      return hasBoth && ps.length >= 2 ? ok : fail(`时间用途未分离：${JSON.stringify(ps)}`);
    }
    case 'timesContainAny': {
      const txt = (d.times || []).map((t) => String(t.value == null ? '' : t.value)).join(' | ');
      return c.any.some((s) => txt.includes(s)) ? ok : fail(`时间「${txt}」不含任何一个：${c.any.join(' / ')}`);
    }
    case 'timesCountAtLeast':
      return (d.times || []).length >= c.value ? ok : fail(`时间项只有 ${(d.times || []).length} 条，期望 ≥ ${c.value}`);
    case 'timesContainAll': {
      const txt = (d.times || []).map((t) => String(t.value == null ? '' : t.value)).join(' | ');
      const miss = c.values.filter((s) => !txt.includes(s));
      return miss.length === 0 ? ok : fail(`时间「${txt}」缺少：${miss.join(' / ')}`);
    }
    case 'locationGroundedOrMissing': {
      const loc = d.location || {};
      if (loc.status === 'missing') return ok;
      const val = String(loc.value == null ? '' : loc.value);
      const src = String((caseObj && caseObj.input) || '');
      if (val && src.indexOf(val) !== -1) return ok;
      // 允许由原文片段组合，但每个片段都必须在原文出现
      const seg = val.split(/[，,、；;和与]/).map((s) => s.trim()).filter(Boolean);
      const bad = seg.filter((s) => src.indexOf(s) === -1);
      return bad.length === 0 && seg.length > 0
        ? ok
        : fail(`地点「${val}」不在原文中（未落地片段：${bad.join(' / ')}），也不是 missing`);
    }
    case 'asksAbout': {
      const txt = ((d.questions || []).concat(d.warnings || [])).join(' | ');
      return c.any.some((s) => txt.includes(s)) ? ok : fail(`待确认问题/提醒里没提到：${c.any.join(' / ')}（实际：${txt}）`);
    }
    case 'globalContainsAny':
      return c.any.some((s) => all.includes(s)) ? ok : fail(`结果中不含任何一个：${c.any.join(' / ')}`);
    case 'globalContainsAll': {
      const miss = c.values.filter((s) => !all.includes(s));
      return miss.length === 0 ? ok : fail(`结果中缺少：${miss.join(' / ')}`);
    }
    case 'forbiddenGlobal':
    case 'forbiddenInFacts': {
      const hit = [];
      c.values.forEach((w) => facts.forEach((f) => { if (f.includes(w)) hit.push(w + '@' + f.slice(0, 30)); }));
      return hit.length === 0 ? ok : fail(`事实项出现原文没有的内容：${hit.join('; ')}`);
    }
    case 'conflictOrBothTimes': {
      const ts = d.times || [];
      const hasConflict = ts.some((t) => t.status === 'conflict');
      const vals = ts.map((t) => String(t.value || ''));
      const both = vals.some((v) => v.includes('9点') || v.includes('上午9')) && vals.some((v) => v.includes('3点') || v.includes('下午3'));
      return hasConflict || both ? ok : fail(`既没有 conflict，也没有并列两个时间：${JSON.stringify(vals)}`);
    }
    default:
      return fail('未知检查类型 ' + c.type);
  }
}

(async () => {
  const spec = JSON.parse(fs.readFileSync(casesFile, 'utf8'));
  const cases = ONLY ? spec.cases.filter((c) => ONLY.includes(c.id)) : spec.cases;

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push('console: ' + m.text()); });

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  const version = await page.evaluate(() => window.MBB_CONFIG.appVersion);
  const modelInfo = await page.evaluate(async () => {
    const mc = await window.MBBLLM.listModels();
    return { id: mc.model.id, name: mc.model.name };
  });

  const results = [];
  for (const c of cases) {
    const t0 = Date.now();
    let res = null, err = null;
    try {
      res = await page.evaluate(async (t) => await window.__MBB.analyze(t), c.input);
    } catch (e) {
      err = e.message;
    }
    const elapsed = Date.now() - t0;

    let checks = [];
    let passed = false;
    if (res && res.ok && res.data) {
      checks = c.checks.map((ck) => {
        const r = evalCheck(ck, res.data, res, c);
        return { type: ck.type, ...r };
      });
      passed = checks.every((x) => x.pass);
    } else if (res && res.ok === false && res.data) {
      // not_notice 也走 ok 分支，这里兜底
      checks = [{ type: 'fallback', pass: false, msg: '结构与校验未通过' }];
    }

    results.push({
      id: c.id,
      name: c.name,
      kind: c.kind,
      runAt: new Date().toISOString(),
      elapsedMs: elapsed,
      productResult: {
        ok: res && res.ok,
        phase: res && res.phase,
        attempts: res && res.attempts,
        errors: (res && res.errors) || [],
        appWarnings: (res && res.warnings) || [],
        model: res && res.model ? { id: res.model.id, name: res.model.name } : null,
        usage: res && res.usage ? res.usage : null,
        data: res && res.data ? res.data : null,
        raw: res && res.raw ? res.raw : '',
        runError: err
      },
      referenceAnswer: c.reference,
      checks,
      pass: passed,
      status: err ? '未执行' : (passed ? '通过' : '失败')
    });
    console.log(`[${results[results.length - 1].status}] ${c.id} ${c.name}  ${elapsed}ms` +
      (passed ? '' : '\n    ' + checks.filter((x) => !x.pass).map((x) => x.msg).join('\n    ')));
  }

  await browser.close();

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const record = {
    runAt: new Date().toISOString(),
    url: URL,
    appVersion: version,
    devModel: 'DeepSeek V4.1 Flash（WorkBuddy 开发执行模型）',
    runtimeModelPicked: modelInfo,
    browser: 'Microsoft Edge (headless) via playwright-core，视口 390x844',
    environment: 'Windows 11 / Node ' + process.version,
    summary: {
      total: results.length,
      passed: results.filter((r) => r.pass).length,
      failed: results.filter((r) => r.status === '失败').length,
      notRun: results.filter((r) => r.status === '未执行').length
    },
    consoleErrors,
    results
  };

  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `test-run-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(record, null, 2), 'utf8');
  fs.writeFileSync(path.join(outDir, 'test-run-latest.json'), JSON.stringify(record, null, 2), 'utf8');
  console.log('\n=== 汇总 ===');
  console.log(JSON.stringify(record.summary));
  console.log('写入：' + file);
})();
