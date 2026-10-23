/* 明白办 · 结果校验
 *
 * 目的：在把模型返回的内容渲染成行动卡之前，用程序做一层"结构与引文"检查。
 * 明确边界：这只是一层机械检查，不等于语义必然正确。它拦得住编造引文、
 * 结构缺字段、missing 却填了值这类错误；拦不住"引文真实但理解错"的情况。
 *
 * 校验项：
 *   1. 是合法 JSON 对象，顶层字段齐全、类型正确、无多余顶层字段
 *   2. status 只能取 stated / missing / unclear / conflict
 *   3. missing → value 为 null 且 evidence 为空数组
 *   4. stated / unclear / conflict → value 非空 且 evidence 至少一条
 *   5. 每条 evidence 必须能在输入原文中找到（忽略空白差异与全半角标点差异）
 *   6. actions.type 只能取 required / suggested
 */
window.MBBValidate = (function () {
  'use strict';

  var STATUS = ['stated', 'missing', 'unclear', 'conflict'];
  var TOP_KEYS = ['document_status', 'document_status_reason', 'summary', 'audience',
    'times', 'location', 'preparation', 'actions', 'questions', 'warnings'];

  /* 归一化：去掉所有空白字符，并把常见全角标点折成半角，仅用于"引文是否存在于原文"的比对。
     不做同义词、错别字或语序的容错——那样会让编造的引文蒙混过关。 */
  function normalize(s) {
    var map = {
      '，': ',', '。': '.', '；': ';', '：': ':', '？': '?', '！': '!',
      '（': '(', '）': ')', '、': ',', '“': '"', '”': '"', '‘': "'", '’': "'",
      '—': '-', '－': '-', '～': '~', '　': ''
    };
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (/\s/.test(ch)) continue;
      out += (map[ch] !== undefined ? map[ch] : ch);
    }
    return out;
  }

  function isStr(v) { return typeof v === 'string'; }
  function isArr(v) { return Array.isArray(v); }
  function nonEmptyStr(v) { return isStr(v) && v.trim() !== ''; }

  function checkEvidence(evidence, normSource, where, errors) {
    if (!isArr(evidence)) {
      errors.push(where + '：evidence 不是数组');
      return 0;
    }
    var ok = 0;
    for (var i = 0; i < evidence.length; i++) {
      var q = evidence[i];
      if (!nonEmptyStr(q)) { errors.push(where + '：第 ' + (i + 1) + ' 条引文为空'); continue; }
      if (normSource.indexOf(normalize(q)) === -1) {
        errors.push(where + '：引文在原文中找不到 →「' + q.slice(0, 40) + '」');
      } else {
        ok++;
      }
    }
    return ok;
  }

  function checkFact(item, normSource, where, errors) {
    if (!item || typeof item !== 'object' || isArr(item)) {
      errors.push(where + '：不是对象');
      return;
    }
    if (STATUS.indexOf(item.status) === -1) {
      errors.push(where + '：status 非法「' + item.status + '」');
      return;
    }
    var hasValue = item.value !== null && item.value !== undefined && String(item.value).trim() !== '';
    var evCount = checkEvidence(item.evidence, normSource, where, errors);

    if (item.status === 'missing') {
      if (item.value !== null) errors.push(where + '：missing 但 value 非空（不得编造）');
      if (item.evidence.length > 0) errors.push(where + '：missing 但带了引文');
    } else {
      if (!hasValue) errors.push(where + '：' + item.status + ' 但 value 为空');
      if (evCount === 0) errors.push(where + '：' + item.status + ' 但无有效引文');
    }
  }

  function validate(raw, sourceText) {
    var errors = [];
    var warnings = [];

    if (!raw || typeof raw !== 'object' || isArr(raw)) {
      return { ok: false, errors: ['返回内容不是 JSON 对象'], warnings: [], data: null };
    }

    var keys = Object.keys(raw);
    for (var k = 0; k < keys.length; k++) {
      if (TOP_KEYS.indexOf(keys[k]) === -1) errors.push('出现约定外的顶层字段「' + keys[k] + '」');
    }
    for (var t = 0; t < TOP_KEYS.length; t++) {
      if (!(TOP_KEYS[t] in raw)) errors.push('缺少顶层字段「' + TOP_KEYS[t] + '」');
    }

    if (raw.document_status !== 'notice' && raw.document_status !== 'not_notice') {
      errors.push('document_status 必须是 notice 或 not_notice');
    }
    if (!isStr(raw.document_status_reason)) errors.push('document_status_reason 不是字符串');
    if (!isStr(raw.summary)) errors.push('summary 不是字符串');

    if (raw.document_status === 'not_notice') {
      if (raw.summary && raw.summary.trim() !== '') warnings.push('判定为非通知，但给了摘要');
      return { ok: errors.length === 0, errors: errors, warnings: warnings, data: raw };
    }

    var normSource = normalize(sourceText || '');

    checkFact(raw.audience, normSource, 'audience', errors);
    checkFact(raw.location, normSource, 'location', errors);

    if (!isArr(raw.times)) {
      errors.push('times 不是数组');
    } else {
      if (raw.times.length === 0) errors.push('times 为空：至少要有报名截止/活动开始/服务时间中的一项判断');
      for (var i = 0; i < raw.times.length; i++) {
        var tm = raw.times[i];
        if (!nonEmptyStr(tm && tm.purpose)) errors.push('times[' + i + ']：purpose 为空');
        checkFact(tm, normSource, 'times[' + i + '](' + (tm && tm.purpose) + ')', errors);
      }
      var purposes = raw.times.map(function (x) { return (x && x.purpose) || ''; });
      var uniq = purposes.filter(function (v, idx) { return purposes.indexOf(v) === idx; });
      if (uniq.length !== purposes.length) warnings.push('times 中存在重复用途');
    }

    if (!isArr(raw.preparation)) {
      errors.push('preparation 不是数组');
    } else {
      for (var p = 0; p < raw.preparation.length; p++) {
        checkFact(raw.preparation[p], normSource, 'preparation[' + p + ']', errors);
      }
    }

    if (!isArr(raw.actions)) {
      errors.push('actions 不是数组');
    } else {
      if (raw.actions.length === 0) errors.push('actions 为空：至少应给出下一步行动');
      for (var a = 0; a < raw.actions.length; a++) {
        var ac = raw.actions[a] || {};
        if (ac.type !== 'required' && ac.type !== 'suggested') {
          errors.push('actions[' + a + ']：type 必须是 required 或 suggested');
        }
        if (!nonEmptyStr(ac.value)) errors.push('actions[' + a + ']：value 为空');
        if (ac.type === 'required' && ac.evidence && isArr(ac.evidence)) {
          if (ac.evidence.length === 0) errors.push('actions[' + a + ']：原文要求但没有引文');
          checkEvidence(ac.evidence, normSource, 'actions[' + a + ']', errors);
        } else if (ac.evidence) {
          checkEvidence(ac.evidence, normSource, 'actions[' + a + ']', errors);
        }
        // 原文要求却完全没有数据依据 → 记为警告（无法机械判定为错）
        if (ac.type === 'required' && (!ac.evidence || ac.evidence.length === 0)) {
          warnings.push('actions[' + a + ']：标为原文要求但无依据，已降级显示');
        }
      }
    }

    if (!isArr(raw.questions)) {
      errors.push('questions 不是数组');
    } else if (raw.questions.length > 6) {
      warnings.push('questions 超过 6 条，已截断显示');
    }

    if (!isArr(raw.warnings)) {
      errors.push('warnings 不是数组');
    }

    return { ok: errors.length === 0, errors: errors, warnings: warnings, data: raw };
  }

  return { validate: validate, normalize: normalize, STATUS: STATUS };
})();
