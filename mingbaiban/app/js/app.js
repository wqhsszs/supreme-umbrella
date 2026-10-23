/* 明白办 · 页面逻辑
 *
 * 状态机：input → loading → (result | error | notNotice)
 * 关键行为：
 *   - 每次发起分析递增序号，晚到的旧响应直接丢弃（防止新通知显示旧答案）
 *   - 加载中禁用按钮，防止重复提交
 *   - 所有来自模型和用户的文本都用 textContent 渲染，不拼 innerHTML，不执行其中的标签/脚本
 *   - 复制失败时提供可手动选择的替代路径
 */
(function () {
  'use strict';

  var cfg = window.MBB_CONFIG;

  var $ = function (id) { return document.getElementById(id); };

  var el = {
    stepInput: $('stepInput'),
    stepLoading: $('stepLoading'),
    stepError: $('stepError'),
    stepNotNotice: $('stepNotNotice'),
    stepResult: $('stepResult'),
    noticeInput: $('noticeInput'),
    charCount: $('charCount'),
    inputError: $('inputError'),
    btnAnalyze: $('btnAnalyze'),
    btnCancel: $('btnCancel'),
    btnRetry: $('btnRetry'),
    btnBackHome: $('btnBackHome'),
    btnBackHome2: $('btnBackHome2'),
    btnNewNotice: $('btnNewNotice'),
    btnCopy: $('btnCopy'),
    btnReset: $('btnReset'),
    summaryText: $('summaryText'),
    statusReason: $('statusReason'),
    audienceBox: $('audienceBox'),
    timesBox: $('timesBox'),
    locationBox: $('locationBox'),
    prepBox: $('prepBox'),
    actionBox: $('actionBox'),
    questionCard: $('questionCard'),
    questionBox: $('questionBox'),
    warningCard: $('warningCard'),
    warningBox: $('warningBox'),
    metaLine: $('metaLine'),
    notNoticeReason: $('notNoticeReason'),
    toast: $('toast'),
    copyFallback: $('copyFallback'),
    copyFallbackText: $('copyFallbackText'),
    btnSelectAll: $('btnSelectAll')
  };

  var SAMPLES = [
    {
      title: '样例一 · 手机使用指导',
      text: '【虚构演示样例·非真实社区公告】\n各位居民：\n为帮助老年居民掌握智能手机常用功能，社区服务中心将开展“手机使用指导”活动。\n时间：2026年10月26日9:00—11:00\n地点：社区服务中心二楼活动室\n报名方式：请于2026年10月25日17:00前到社区服务中心一楼服务台报名，名额有限。\n说明：本次活动仅限已报名居民参加，请携带本人手机。'
    },
    {
      title: '样例二 · 电梯检修停用',
      text: '【虚构演示样例·非真实社区公告】\n通知\n3号楼各位住户：\n因电梯年度检修，3号楼1单元电梯将于本周四上午8点至下午5点停用，检修期间请走楼梯。\n如有变动，另行通知。\n物业服务中心'
    },
    {
      title: '样例三 · 老年助餐登记',
      text: '【虚构演示样例·非真实社区公告】\n关于老年助餐服务登记的通知\n辖区居民：\n社区食堂下周起为60周岁以上居民提供助餐服务，每餐12元。\n需要用餐的居民请携带身份证和户口本，于10月28日前到社区居委会登记。\n登记时间为工作日上午9:00—11:30。\n社区居委会'
    }
  ];

  var state = {
    seq: 0,
    busy: false,
    lastInput: '',
    lastResult: null,
    controller: null,
    startedAt: 0
  };

  var STATUS_LABEL = {
    stated: { icon: '✓', text: '原文写明', cls: 'badge-stated' },
    missing: { icon: '—', text: '通知未说明', cls: 'badge-missing' },
    unclear: { icon: '?', text: '说得含糊', cls: 'badge-unclear' },
    conflict: { icon: '!', text: '前后不一致', cls: 'badge-conflict' }
  };

  /* ---------------- 工具 ---------------- */
  function toast(msg, ms) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.toast.hidden = true; }, ms || 2600);
  }

  function show(step) {
    ['stepInput', 'stepLoading', 'stepError', 'stepNotNotice', 'stepResult'].forEach(function (k) {
      el[k].hidden = (k !== step);
    });
    el.btnReset.hidden = (step === 'stepInput');
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function clearResults() {
    el.summaryText.textContent = '';
    el.statusReason.textContent = '';
    el.audienceBox.textContent = '';
    el.timesBox.textContent = '';
    el.locationBox.textContent = '';
    el.prepBox.textContent = '';
    el.actionBox.textContent = '';
    el.questionBox.textContent = '';
    el.warningBox.textContent = '';
    el.metaLine.textContent = '';
    el.questionCard.hidden = true;
    el.warningCard.hidden = true;
  }

  function resetAll() {
    state.seq++;
    if (state.controller) { try { state.controller.abort(); } catch (e) {} }
    state.controller = null;
    state.busy = false;
    state.lastResult = null;
    el.noticeInput.value = '';
    el.inputError.hidden = true;
    updateCount();
    clearResults();
    setBusy(false);
    show('stepInput');
    el.noticeInput.focus();
  }

  function updateCount() {
    var n = el.noticeInput.value.length;
    el.charCount.textContent = n + ' / ' + cfg.maxInputChars;
    el.charCount.classList.toggle('over', n > cfg.maxInputChars);
  }

  function setBusy(b) {
    state.busy = b;
    el.btnAnalyze.disabled = b;
    el.btnAnalyze.querySelector('.btn-label').hidden = b;
    el.btnAnalyze.querySelector('.btn-busy').hidden = !b;
  }

  /* ---------------- 渲染基础件 ---------------- */
  function badge(status) {
    var m = STATUS_LABEL[status] || STATUS_LABEL.unclear;
    var span = document.createElement('span');
    span.className = 'badge ' + m.cls;
    var b = document.createElement('b');
    b.textContent = m.icon;
    span.appendChild(b);
    span.appendChild(document.createTextNode(m.text));
    return span;
  }

  function evidenceBlock(evidence) {
    var box = document.createElement('div');
    box.className = 'evidence';
    box.hidden = true;
    for (var i = 0; i < evidence.length; i++) {
      var p = document.createElement('p');
      var src = document.createElement('span');
      src.className = 'src';
      src.textContent = '通知原文 · 第 ' + (i + 1) + ' 处';
      p.appendChild(src);
      p.appendChild(document.createTextNode('「' + evidence[i] + '」'));
      box.appendChild(p);
    }
    return box;
  }

  function factNode(item, opts) {
    opts = opts || {};
    var wrap = document.createElement('div');
    wrap.className = 'fact';

    if (opts.purpose) {
      var pu = document.createElement('div');
      pu.className = 'fact-purpose';
      pu.textContent = opts.purpose;
      wrap.appendChild(pu);
    }

    var head = document.createElement('div');
    head.className = 'fact-head';

    var val = document.createElement('div');
    val.className = 'fact-value' + (item.status === 'missing' ? ' is-missing' : '');
    val.textContent = (item.status === 'missing' || item.value === null || item.value === undefined)
      ? '通知未说明'
      : String(item.value);
    head.appendChild(val);
    head.appendChild(badge(item.status));
    wrap.appendChild(head);

    if (item.evidence && item.evidence.length > 0) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'evidence-toggle';
      btn.textContent = '看原文依据';
      var box = evidenceBlock(item.evidence);
      btn.setAttribute('aria-expanded', 'false');
      btn.addEventListener('click', function () {
        box.hidden = !box.hidden;
        btn.setAttribute('aria-expanded', box.hidden ? 'false' : 'true');
        btn.textContent = box.hidden ? '看原文依据' : '收起原文依据';
      });
      wrap.appendChild(btn);
      wrap.appendChild(box);
    } else if (item.status === 'missing') {
      var note = document.createElement('p');
      note.className = 'card-note';
      note.style.margin = '6px 0 0';
      note.textContent = '原文没有提到这一项，我没有替它补上。';
      wrap.appendChild(note);
    }
    return wrap;
  }

  /* ---------------- 渲染结果 ---------------- */
  function renderResult(data, meta) {
    clearResults();
    state.lastResult = { data: data, meta: meta };

    el.summaryText.textContent = data.summary || '（这条通知内容较少）';
    el.statusReason.textContent = data.document_status_reason || '';

    // 谁能参加
    el.audienceBox.appendChild(factNode(data.audience));

    // 时间
    if (!data.times || data.times.length === 0) {
      var p = document.createElement('p');
      p.className = 'empty-state';
      p.textContent = '通知里没写清时间。';
      el.timesBox.appendChild(p);
    } else {
      data.times.forEach(function (t) { el.timesBox.appendChild(factNode(t, { purpose: t.purpose })); });
    }

    // 地点
    el.locationBox.appendChild(factNode(data.location));

    // 准备事项
    if (!data.preparation || data.preparation.length === 0) {
      var p2 = document.createElement('p');
      p2.className = 'empty-state';
      p2.textContent = '通知没提要带什么东西。您就不用特别准备。';
      el.prepBox.appendChild(p2);
    } else {
      var ul = document.createElement('ul');
      ul.className = 'check-list';
      data.preparation.forEach(function (it, idx) {
        var li = document.createElement('li');
        li.className = 'check-item';
        var label = document.createElement('label');
        label.className = 'check-label';
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.setAttribute('data-prep', String(idx));
        if (it.status === 'missing') cb.disabled = true;
        var span = document.createElement('span');
        span.className = 'check-text';
        span.textContent = (it.status === 'missing' || it.value === null) ? '通知未说明' : String(it.value);
        label.appendChild(cb);
        label.appendChild(span);
        li.appendChild(label);
        if (it.evidence && it.evidence.length) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'evidence-toggle';
          btn.textContent = '看原文依据';
          var box = evidenceBlock(it.evidence);
          btn.addEventListener('click', function () {
            box.hidden = !box.hidden;
            btn.textContent = box.hidden ? '看原文依据' : '收起原文依据';
          });
          li.appendChild(btn);
          li.appendChild(box);
        }
        ul.appendChild(li);
      });
      el.prepBox.appendChild(ul);
    }

    // 下一步行动
    var ul2 = document.createElement('ul');
    ul2.className = 'check-list';
    (data.actions || []).forEach(function (a, idx) {
      var li = document.createElement('li');
      li.className = 'check-item';
      var label = document.createElement('label');
      label.className = 'check-label';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.setAttribute('data-action', String(idx));
      var span = document.createElement('span');
      span.className = 'check-text';
      span.textContent = a.value;
      if (a.type === 'suggested') {
        var tag = document.createElement('span');
        tag.className = 'tag-suggest';
        tag.textContent = '确认建议';
        span.appendChild(document.createTextNode(' '));
        span.appendChild(tag);
      }
      label.appendChild(cb);
      label.appendChild(span);
      li.appendChild(label);
      if (a.evidence && a.evidence.length) {
        var btn2 = document.createElement('button');
        btn2.type = 'button';
        btn2.className = 'evidence-toggle';
        btn2.textContent = '看原文依据';
        var box2 = evidenceBlock(a.evidence);
        btn2.addEventListener('click', function () {
          box2.hidden = !box2.hidden;
          btn2.textContent = box2.hidden ? '看原文依据' : '收起原文依据';
        });
        li.appendChild(btn2);
        li.appendChild(box2);
      }
      ul2.appendChild(li);
    });
    if (!ul2.children.length) {
      var p3 = document.createElement('p');
      p3.className = 'empty-state';
      p3.textContent = '通知没写下一步要做什么。';
      el.actionBox.appendChild(p3);
    } else {
      el.actionBox.appendChild(ul2);
    }

    // 待确认问题
    if (data.questions && data.questions.length) {
      el.questionCard.hidden = false;
      var ul3 = document.createElement('ul');
      ul3.className = 'check-list';
      data.questions.slice(0, 6).forEach(function (q) {
        var li = document.createElement('li');
        li.className = 'check-item';
        var p = document.createElement('p');
        p.className = 'plain-text';
        p.style.padding = '10px 0';
        p.style.margin = '0';
        p.textContent = '· ' + q;
        li.appendChild(p);
        ul3.appendChild(li);
      });
      el.questionBox.appendChild(ul3);
    }

    // 注意
    if (data.warnings && data.warnings.length) {
      el.warningCard.hidden = false;
      data.warnings.forEach(function (w) {
        var p = document.createElement('p');
        p.className = 'plain-text';
        p.textContent = '· ' + w;
        el.warningBox.appendChild(p);
      });
    }

    el.metaLine.textContent = '本次结果由 AI 实时生成（' + (meta.modelLabel || '模型未记录') +
      '）· 用时 ' + (meta.elapsedMs / 1000).toFixed(1) + ' 秒' +
      (meta.attempts > 1 ? ' · 第 ' + meta.attempts + ' 次尝试' : '') +
      ' · 结果仅供理解参考，以通知原文为准';

    show('stepResult');
  }

  /* ---------------- 复制成文本 ---------------- */
  function buildCardText(r) {
    var d = r.data;
    var L = [];
    var st = function (s) { return (STATUS_LABEL[s] || STATUS_LABEL.unclear).text; };

    L.push('【明白办】行动卡');
    L.push('');
    L.push('这条通知说的是：' + (d.summary || ''));
    L.push('');
    L.push('一、谁能参加');
    L.push('  ' + (d.audience.value === null ? '通知未说明（需要确认）' : d.audience.value) + '（' + st(d.audience.status) + '）');
    L.push('');
    L.push('二、时间');
    if (d.times && d.times.length) {
      d.times.forEach(function (t) {
        L.push('  ' + t.purpose + '：' + (t.value === null ? '通知未说明（需要确认）' : t.value) + '（' + st(t.status) + '）');
      });
    } else {
      L.push('  通知未说明');
    }
    L.push('');
    L.push('三、地点');
    L.push('  ' + (d.location.value === null ? '通知未说明（需要确认）' : d.location.value) + '（' + st(d.location.status) + '）');
    L.push('');
    L.push('四、要带什么');
    if (d.preparation && d.preparation.length) {
      d.preparation.forEach(function (p) {
        L.push('  [ ] ' + p.value + '（' + st(p.status) + '）');
      });
    } else {
      L.push('  通知没提要带什么（通知未说明）');
    }
    L.push('');
    L.push('五、您接下来做什么');
    (d.actions || []).forEach(function (a) {
      var mark = a.type === 'suggested' ? '（确认建议：为了问清楚，不是通知要求）' : '（通知明确要求）';
      L.push('  [ ] ' + a.value + mark);
    });
    L.push('');
    if (d.questions && d.questions.length) {
      L.push('六、还要问清楚');
      d.questions.forEach(function (q) { L.push('  · ' + q); });
      L.push('');
    }
    if (d.warnings && d.warnings.length) {
      L.push('七、注意');
      d.warnings.forEach(function (w) { L.push('  ! ' + w); });
      L.push('');
    }
    L.push('—— 提醒 ——');
    L.push('打勾只表示您自己准备好了，不代表已经报名或办好。以上内容由「明白办」根据通知原文整理，仅作理解辅助，以通知原文为准。');
    L.push('（明白办 · 收到通知之后，下一步更明白。AI 生成内容，请核对原文。）');
    return L.join('\n');
  }

  function fallbackCopy(text) {
    el.copyFallbackText.value = text;
    if (typeof el.copyFallback.showModal === 'function') {
      el.copyFallback.showModal();
    } else {
      el.copyFallback.setAttribute('open', '');
    }
    setTimeout(function () {
      try { el.copyFallbackText.focus(); el.copyFallbackText.select(); } catch (e) {}
    }, 50);
  }

  function copyCard() {
    if (!state.lastResult) return;
    var text = buildCardText(state.lastResult);

    function legacy() {
      try {
        el.copyFallbackText.value = text;
        el.copyFallbackText.focus();
        el.copyFallbackText.select();
        var ok = document.execCommand && document.execCommand('copy');
        if (ok) { toast('已复制，可以发给家人了'); return; }
      } catch (e) {}
      fallbackCopy(text);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(function () { toast('已复制，可以发给家人了'); })
        .catch(function () { legacy(); });
    } else {
      legacy();
    }
  }

  /* ---------------- 主流程 ---------------- */
  function analyze() {
    if (state.busy) return;

    var text = el.noticeInput.value;
    var trimmed = text.trim();

    el.inputError.hidden = true;
    if (!trimmed) {
      el.inputError.textContent = '还没贴通知。请把社区发的通知原文贴到上面的框里。';
      el.inputError.hidden = false;
      el.noticeInput.focus();
      return;
    }
    if (text.length > cfg.maxInputChars) {
      el.inputError.textContent = '通知太长（' + text.length + ' 字），最多 ' + cfg.maxInputChars +
        ' 字。我没有替您删掉一部分，请分两次，或只贴最关键的那一段。';
      el.inputError.hidden = false;
      return;
    }
    if (trimmed.length < 10) {
      el.inputError.textContent = '这段文字太短了，看不出是通知。请贴完整的通知原文。';
      el.inputError.hidden = false;
      return;
    }

    var ready = window.MBBLLM.status();
    if (!ready.ready) {
      show('stepError');
      $('errTitle').textContent = 'AI 服务还没连接上';
      $('errBody').textContent = '现在无法调用模型，所以没有结果。这不是通知本身的问题。';
      var d = $('errDetail');
      d.hidden = false;
      d.textContent = ready.reason;
      return;
    }

    state.seq++;
    var mySeq = state.seq;
    state.lastInput = text;
    state.controller = new AbortController();
    state.startedAt = Date.now();

    clearResults();
    setBusy(true);
    show('stepLoading');

    window.MBBLLM.analyze(trimmed, { externalSignal: state.controller.signal })
      .then(function (r) {
        if (mySeq !== state.seq) return; // 过期响应，丢弃
        setBusy(false);

        if (!r || !r.ok) {
          showError(r);
          return;
        }
        if (r.data.document_status === 'not_notice') {
          el.notNoticeReason.textContent = r.data.document_status_reason ||
            '这段文字不像社区通知。';
          show('stepNotNotice');
          return;
        }
        var elapsed = Date.now() - state.startedAt;
        renderResult(r.data, {
          modelLabel: (r.model && (r.model.name || r.model.id)) || '模型未记录',
          modelId: r.model && r.model.id,
          elapsedMs: elapsed,
          attempts: r.attempts || 1
        });
      })
      .catch(function (e) {
        if (mySeq !== state.seq) return;
        setBusy(false);
        showError({ ok: false, phase: 'unknown', error: (e && e.message) || String(e) });
      });
  }

  function showError(r) {
    $('errTitle').textContent = '这条通知没看明白';
    var msg = 'AI 返回的结果没通过自检，所以我没有把它显示成行动卡。这样可以避免给您一张有编造内容的卡片。';
    if (r && r.phase === 'timeout') {
      msg = '等太久了（超过 ' + Math.round(cfg.requestTimeoutMs / 1000) + ' 秒），可能是网络慢。点下面再试一次。';
    } else if (r && r.phase === 'network') {
      msg = '网络请求失败了：' + (r.error || '未知原因') + '。可以点下面再试一次。';
    } else if (r && r.phase === 'validate') {
      msg = 'AI 给出的内容里有对不上原文的地方，为了不给您错的信息，这次不显示行动卡。可以点下面重试。';
    } else if (r && r.phase === 'parse') {
      msg = 'AI 返回的内容格式不对，这次不能显示行动卡。';
    }
    $('errBody').textContent = msg;
    var d = $('errDetail');
    var lines = [];
    if (r && r.model) lines.push('模型：' + (r.model.name || r.model.id));
    if (r && r.code) lines.push('错误码：' + r.code);
    if (r && r.errors && r.errors.length) lines.push('自检问题：\n- ' + r.errors.slice(0, 8).join('\n- '));
    if (lines.length) { d.hidden = false; d.textContent = lines.join('\n'); }
    else { d.hidden = true; }
    show('stepError');
  }

  /* ---------------- 事件绑定 ---------------- */
  el.noticeInput.addEventListener('input', updateCount);
  el.btnAnalyze.addEventListener('click', analyze);
  el.btnCancel.addEventListener('click', function () {
    state.seq++;
    if (state.controller) { try { state.controller.abort(); } catch (e) {} }
    setBusy(false);
    show('stepInput');
  });
  el.btnRetry.addEventListener('click', function () {
    el.noticeInput.value = state.lastInput;
    updateCount();
    show('stepInput');
    analyze();
  });
  el.btnBackHome.addEventListener('click', function () { show('stepInput'); el.noticeInput.focus(); });
  el.btnBackHome2.addEventListener('click', function () { resetAll(); });
  el.btnNewNotice.addEventListener('click', function () { resetAll(); });
  el.btnReset.addEventListener('click', function () { resetAll(); });
  el.btnCopy.addEventListener('click', copyCard);
  el.btnSelectAll.addEventListener('click', function () {
    el.copyFallbackText.focus();
    el.copyFallbackText.select();
    try { document.execCommand('copy'); toast('已复制'); } catch (e) { toast('请长按选择“全选”再复制'); }
  });

  // 样例
  Array.prototype.forEach.call(document.querySelectorAll('.btn-sample'), function (btn) {
    btn.addEventListener('click', function () {
      var i = parseInt(btn.getAttribute('data-sample'), 10);
      el.noticeInput.value = SAMPLES[i].text;
      updateCount();
      el.inputError.hidden = true;
      el.noticeInput.focus();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  // 启动自检
  updateCount();
  var st = window.MBBLLM.status();
  if (!st.ready) {
    console.warn('[明白办] AI 服务未就绪：', st.reason);
  }

  /* 供自动化测试与外部验证使用（只读入口，不改变产品行为） */
  window.__MBB = {
    analyze: function (text) {
      return window.MBBLLM.analyze(String(text || '').trim(), {});
    },
    buildCardText: function () { return state.lastResult ? buildCardText(state.lastResult) : ''; },
    state: function () { return { seq: state.seq, busy: state.busy, hasResult: !!state.lastResult }; },
    samples: SAMPLES,
    cfg: cfg
  };
})();
