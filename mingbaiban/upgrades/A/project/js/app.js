/* 明白办 A 轮 · 页面逻辑
 *
 * 状态机：input → loading → (result | error | notNotice)
 *
 * 关键行为：
 *   - 每次发起整理递增序号，晚到的旧响应直接丢弃（防止新通知显示旧答案）
 *   - 整理中禁用按钮，防止重复提交
 *   - 所有来自模型和用户的文本都用 textContent 渲染，不拼 innerHTML
 *   - 复制内容与当前勾选状态一致；勾选只是「整理者准备到哪一步」
 *   - 复制失败时提供可手动选择的替代路径
 */
(function () {
  'use strict';

  var cfg = window.MBB_CONFIG;
  var $ = function (id) { return document.getElementById(id); };

  var el = {
    stepInput: $('stepInput'), stepLoading: $('stepLoading'), stepError: $('stepError'),
    stepNotNotice: $('stepNotNotice'), stepResult: $('stepResult'),
    noticeInput: $('noticeInput'), charCount: $('charCount'), inputError: $('inputError'),
    btnAnalyze: $('btnAnalyze'), btnCancel: $('btnCancel'), btnRetry: $('btnRetry'),
    btnBackHome: $('btnBackHome'), btnBackHome2: $('btnBackHome2'),
    btnNewNotice: $('btnNewNotice'), btnCopy: $('btnCopy'), btnReset: $('btnReset'),
    summaryText: $('summaryText'), statusReason: $('statusReason'),
    confirmBanner: $('confirmBanner'),
    audienceBox: $('audienceBox'), timesBox: $('timesBox'), prepBox: $('prepBox'),
    actionBox: $('actionBox'), questionCard: $('questionCard'), questionBox: $('questionBox'),
    warningCard: $('warningCard'), warningBox: $('warningBox'),
    metaLine: $('metaLine'), notNoticeReason: $('notNoticeReason'),
    toast: $('toast'), copyFallback: $('copyFallback'),
    copyFallbackText: $('copyFallbackText'), btnSelectAll: $('btnSelectAll')
  };

  var SAMPLES = [
    {
      title: '示例一 · 手机使用指导',
      text: '【虚构演示样例·非真实社区公告】\n各位居民：\n为帮助老年居民掌握智能手机常用功能，社区服务中心将开展“手机使用指导”活动。\n时间：2026年10月26日9:00—11:00\n地点：社区服务中心二楼活动室\n报名方式：请于2026年10月25日17:00前到社区服务中心一楼服务台报名，名额有限。\n说明：本次活动仅限已报名居民参加，请携带本人手机。'
    },
    {
      title: '示例二 · 电梯检修停用',
      text: '【虚构演示样例·非真实社区公告】\n通知\n3号楼各位住户：\n因电梯年度检修，3号楼1单元电梯将于本周四上午8点至下午5点停用，检修期间请走楼梯。\n如有变动，另行通知。\n物业服务中心'
    },
    {
      title: '示例三 · 老年助餐登记',
      text: '【虚构演示样例·非真实社区公告】\n关于老年助餐服务登记的通知\n辖区居民：\n社区食堂下周起为60周岁以上居民提供助餐服务，每餐12元。\n需要用餐的居民请携带身份证和户口本，于10月28日前到社区居委会登记。\n登记时间为工作日上午9:00—11:30。\n社区居委会'
    }
  ];

  var state = {
    seq: 0, busy: false, lastInput: '', lastResult: null, controller: null, startedAt: 0
  };

  var STATUS_LABEL = {
    stated: { icon: '✓', text: '原文写明', cls: 'badge-stated' },
    missing: { icon: '—', text: '通知未说明', cls: 'badge-missing' },
    unclear: { icon: '?', text: '说得含糊', cls: 'badge-unclear' },
    conflict: { icon: '!', text: '前后不一致', cls: 'badge-conflict' }
  };

  /* ---------------- 基础工具 ---------------- */
  function toast(msg, ms) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.toast.hidden = true; }, ms || 2800);
  }

  function show(step) {
    ['stepInput', 'stepLoading', 'stepError', 'stepNotNotice', 'stepResult'].forEach(function (k) {
      el[k].hidden = (k !== step);
    });
    el.btnReset.hidden = (step === 'stepInput');
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function clearResults() {
    [el.summaryText, el.statusReason, el.audienceBox, el.timesBox, el.prepBox,
      el.actionBox, el.questionBox, el.warningBox, el.metaLine, el.confirmBanner].forEach(function (n) {
      n.textContent = '';
    });
    el.questionCard.hidden = true;
    el.warningCard.hidden = true;
    el.confirmBanner.hidden = true;
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

  /* ---------------- 渲染小件 ---------------- */
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

  function evidenceToggle(evidence) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'evidence-toggle';
    btn.textContent = '对照通知原文';
    var box = evidenceBlock(evidence);
    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', function () {
      box.hidden = !box.hidden;
      btn.setAttribute('aria-expanded', box.hidden ? 'false' : 'true');
      btn.textContent = box.hidden ? '对照通知原文' : '收起原文';
    });
    return { btn: btn, box: box };
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
    var isMissing = (item.status === 'missing' || item.value == null);
    if (!isMissing) {
      var val = document.createElement('div');
      val.className = 'fact-value';
      val.textContent = String(item.value);
      head.appendChild(val);
    }
    head.appendChild(badge(item.status));
    wrap.appendChild(head);

    // 该用途对应的地点（A 轮新增字段，可选）
    if (opts.showPlace && opts.place) {
      var pl = opts.place;
      var line = document.createElement('div');
      line.className = 'fact-place';
      var label = document.createElement('span');
      label.textContent = '地点：';
      line.appendChild(label);
      var v = document.createElement('span');
      var hasPlace = !(pl.status === 'missing' || pl.value == null);
      v.textContent = hasPlace ? String(pl.value) : '通知未说明';
      if (!hasPlace) v.style.color = 'var(--ink-3)';
      line.appendChild(v);
      line.appendChild(document.createTextNode(' '));
      line.appendChild(badge(pl.status));
      wrap.appendChild(line);
    }

    // 同一件事只出一个按钮：把该用途的时间与地点的原文合并在一起展示
    var merged = [];
    if (opts.place && opts.place.evidence && opts.place.evidence.length) {
      merged = merged.concat(opts.place.evidence);
    }
    if (item.evidence && item.evidence.length) {
      merged = merged.concat(item.evidence);
    }
    if (merged.length) {
      var t = evidenceToggle(merged);
      wrap.appendChild(t.btn);
      wrap.appendChild(t.box);
    } else if (item.status === 'missing') {
      var note = document.createElement('p');
      note.className = 'card-note';
      note.style.margin = '6px 0 0';
      note.textContent = '原文没有这一项，这里没有替它补上。';
      wrap.appendChild(note);
    }
    return wrap;
  }

  /* 顶部「先确认这几件事」 */
  function renderConfirm(d) {
    var conflict = [], unclear = [];
    function push(list, label, fact) {
      if (!fact) return;
      if (fact.status === 'conflict') conflict.push(label);
      else if (fact.status === 'unclear') unclear.push(label + '说得不明确');
    }
    push(conflict, '适用对象', d.audience);
    (d.times || []).forEach(function (t) {
      push(conflict, t.purpose || '时间', t);
      if (t.place) push(conflict, (t.purpose || '') + '的地点', t.place);
    });
    push(conflict, '地点', d.location);

    if (!conflict.length && !unclear.length) {
      el.confirmBanner.hidden = true;
      return;
    }

    var isDanger = conflict.length > 0;
    var box = document.createElement('div');
    box.className = 'confirm-banner' + (isDanger ? '' : ' is-warn');

    var title = document.createElement('p');
    title.className = 'confirm-title';
    title.textContent = (isDanger ? '!' : '?') + ' ' +
      (isDanger ? '通知里有前后不一致的地方，先问清楚再安排' : '这几处通知没说清，先确认一下');
    box.appendChild(title);

    var ul = document.createElement('ul');
    ul.className = 'confirm-list';
    conflict.forEach(function (label) {
      var li = document.createElement('li');
      li.textContent = label + '：通知里出现了互相不一致的写法，需要向发布方确认以哪个为准。';
      ul.appendChild(li);
    });
    unclear.forEach(function (label) {
      var li = document.createElement('li');
      li.textContent = label + '：需要向发布方确认。';
      ul.appendChild(li);
    });
    box.appendChild(ul);

    el.confirmBanner.appendChild(box);
    el.confirmBanner.hidden = false;
  }

  /* ---------------- 渲染结果 ---------------- */
  function renderResult(data, meta) {
    clearResults();
    state.lastResult = { data: data, meta: meta };

    el.summaryText.textContent = data.summary || '（这条通知内容较短）';
    el.statusReason.textContent = data.document_status_reason || '';

    renderConfirm(data);

    el.audienceBox.appendChild(factNode(data.audience));

    if (!data.times || data.times.length === 0) {
      var p = document.createElement('p');
      p.className = 'empty-state';
      p.textContent = '通知里没写清时间。';
      el.timesBox.appendChild(p);
    } else {
      data.times.forEach(function (t, i) {
        // 只有一项时间时，地点挂在它下面；多项时也各自挂，便于区分报名地点与活动地点
        el.timesBox.appendChild(factNode(t, {
          purpose: t.purpose,
          showPlace: true,
          place: t.place || null
        }));
      });
      // 若所有用途都没写地点，但整体 location 有值，补一行「整体地点」
      var anyPlace = data.times.some(function (t) { return t.place && t.place.status !== 'missing'; });
      if (!anyPlace && data.location) {
        el.timesBox.appendChild(factNode(data.location, { purpose: '整体地点' }));
      }
    }

    if (!data.preparation || data.preparation.length === 0) {
      var p2 = document.createElement('p');
      p2.className = 'empty-state';
      p2.textContent = '通知没提要带什么，不用特别准备。';
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
        span.textContent = (it.status === 'missing' || it.value == null) ? '通知未说明' : String(it.value);
        label.appendChild(cb);
        label.appendChild(span);
        li.appendChild(label);
        if (it.evidence && it.evidence.length) {
          var t = evidenceToggle(it.evidence);
          li.appendChild(t.btn);
          li.appendChild(t.box);
        }
        ul.appendChild(li);
      });
      el.prepBox.appendChild(ul);
    }

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
        tag.textContent = '建议先确认';
        span.appendChild(document.createTextNode(' '));
        span.appendChild(tag);
      }
      label.appendChild(cb);
      label.appendChild(span);
      li.appendChild(label);
      if (a.evidence && a.evidence.length) {
        var t = evidenceToggle(a.evidence);
        li.appendChild(t.btn);
        li.appendChild(t.box);
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

    if (data.warnings && data.warnings.length) {
      el.warningCard.hidden = false;
      data.warnings.forEach(function (w) {
        var p = document.createElement('p');
        p.className = 'plain-text';
        p.textContent = '· ' + w;
        el.warningBox.appendChild(p);
      });
    }

    el.metaLine.textContent = '本次生成信息：' + (meta.modelLabel || '模型未记录') +
      ' · 用时 ' + (meta.elapsedMs / 1000).toFixed(1) + ' 秒' +
      (meta.attempts > 1 ? ' · 第 ' + meta.attempts + ' 次尝试' : '') +
      ' · 结果仅供理解参考，以通知原文为准';

    show('stepResult');
  }

  /* ---------------- 复制成文字（与当前勾选一致） ---------------- */
  function readChecks(attr) {
    var map = {};
    Array.prototype.forEach.call(document.querySelectorAll('input[' + attr + ']'), function (cb) {
      map[cb.getAttribute(attr)] = cb.checked;
    });
    return map;
  }

  function buildCardText(r) {
    var d = r.data;
    var L = [];
    var st = function (s) { return (STATUS_LABEL[s] || STATUS_LABEL.unclear).text; };
    var prepChecked = readChecks('data-prep');
    var actChecked = readChecks('data-action');

    L.push('【明白办】社区通知行动卡');
    L.push('');
    L.push('这条通知要办什么');
    L.push('  ' + (d.summary || '（通知内容较短）'));
    L.push('');

    // 先确认：冲突与含糊
    var todo = [];
    (d.times || []).forEach(function (t) {
      if (t.status === 'conflict') todo.push((t.purpose || '时间') + '有前后不一致的写法，需要先确认以哪个为准');
      else if (t.status === 'unclear') todo.push((t.purpose || '时间') + '说得不明确，需要先确认');
      if (t.place && t.place.status === 'conflict') todo.push((t.purpose || '') + '的地点前后不一致，需要先确认');
      if (t.place && t.place.status === 'unclear') todo.push((t.purpose || '') + '的地点说得不明确，需要先确认');
    });
    if (d.audience && d.audience.status === 'conflict') todo.push('适用对象前后不一致，需要先确认');

    if (todo.length) {
      L.push('先确认这几件事');
      todo.forEach(function (x) { L.push('  ！' + x); });
      L.push('');
    }

    L.push('谁适用');
    L.push('  ' + (d.audience.value == null ? '通知未说明' : d.audience.value) + '（' + st(d.audience.status) + '）');
    L.push('');

    L.push('何时、何地');
    if (d.times && d.times.length) {
      d.times.forEach(function (t) {
        L.push('  ' + (t.purpose || '时间') + '：' + (t.value == null ? '通知未说明' : t.value) + '（' + st(t.status) + '）');
        if (t.place) {
          L.push('    地点：' + (t.place.value == null ? '通知未说明' : t.place.value) + '（' + st(t.place.status) + '）');
        }
      });
      var anyPlace = d.times.some(function (t) { return t.place && t.place.status !== 'missing'; });
      if (!anyPlace && d.location) {
        L.push('  整体地点：' + (d.location.value == null ? '通知未说明' : d.location.value) + '（' + st(d.location.status) + '）');
      }
    } else {
      L.push('  通知未说明');
    }
    L.push('');

    L.push('家人需要准备什么');
    if (d.preparation && d.preparation.length) {
      d.preparation.forEach(function (p, i) {
        L.push('  [' + (prepChecked[String(i)] ? 'x' : ' ') + '] ' + p.value + '（' + st(p.status) + '）');
      });
    } else {
      L.push('  通知没提要带什么，不用特别准备。');
    }
    L.push('');

    L.push('下一步');
    (d.actions || []).forEach(function (a, i) {
      var mark = a.type === 'suggested'
        ? '（建议先确认，不是通知要求）'
        : '（通知明确要求）';
      L.push('  [' + (actChecked[String(i)] ? 'x' : ' ') + '] ' + a.value + mark);
    });
    if (!(d.actions || []).length) L.push('  通知没写下一步要做什么。');
    L.push('');

    if (d.questions && d.questions.length) {
      L.push('还要确认什么');
      d.questions.forEach(function (q) { L.push('  · ' + q); });
      L.push('');
    }
    if (d.warnings && d.warnings.length) {
      L.push('注意');
      d.warnings.forEach(function (w) { L.push('  · ' + w); });
      L.push('');
    }

    L.push('—— 说明 ——');
    L.push('方框打勾记录的是「整理者准备到哪一步」，不是报名凭证，也不代表已经报名或办好。');
    L.push('通知没写的内容，卡上标为「通知未说明」，没有替通知补。重要事项请以通知原文和社区说法为准。');
    return L.join('\n');
  }

  function fallbackCopy(text) {
    el.copyFallbackText.value = text;
    if (typeof el.copyFallback.showModal === 'function') el.copyFallback.showModal();
    else el.copyFallback.setAttribute('open', '');
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
        if (ok) { toast('已复制，可粘贴到聊天中发给家人。'); return; }
      } catch (e) {}
      fallbackCopy(text);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(function () { toast('已复制，可粘贴到聊天中发给家人。'); })
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
      el.inputError.textContent = '还没有贴通知。把社区发来的通知原文贴到上面的框里。';
      el.inputError.hidden = false;
      el.noticeInput.focus();
      return;
    }
    if (text.length > cfg.maxInputChars) {
      el.inputError.textContent = '通知太长了（' + text.length + ' 字），最多 ' + cfg.maxInputChars +
        ' 字。我没有替您删掉一部分，请分两次，或只贴最关键的那一段。';
      el.inputError.hidden = false;
      return;
    }
    if (trimmed.length < 10) {
      el.inputError.textContent = '这段文字太短，看不出是通知。请贴完整的通知原文。';
      el.inputError.hidden = false;
      return;
    }

    var ready = window.MBBLLM.status();
    if (!ready.ready) {
      show('stepError');
      $('errTitle').textContent = 'AI 服务还没连接上';
      $('errBody').textContent = '现在没法调用模型，所以没有结果。这不是通知本身的问题。';
      var dd = $('errDetail');
      dd.hidden = false;
      dd.textContent = ready.reason;
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
        if (!r || !r.ok) { showError(r); return; }
        if (r.data.document_status === 'not_notice') {
          el.notNoticeReason.textContent = r.data.document_status_reason || '这段文字不像社区通知。';
          show('stepNotNotice');
          return;
        }
        renderResult(r.data, {
          modelLabel: (r.model && (r.model.name || r.model.id)) || '模型未记录',
          modelId: r.model && r.model.id,
          elapsedMs: Date.now() - state.startedAt,
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
    $('errTitle').textContent = '这次没有整理成功';
    var msg = '原文还在，可以再试一次。';
    if (r && r.phase === 'timeout') {
      msg = '等太久了（超过 ' + Math.round(cfg.requestTimeoutMs / 1000) + ' 秒），可能是网络慢。原文还在，可以再试一次。';
    } else if (r && r.phase === 'network') {
      msg = '网络请求没有成功（' + (r.error || '原因未知') + '）。原文还在，可以再试一次。';
    } else if (r && r.phase === 'validate') {
      msg = '这次整理出来的内容里，有对不上通知原文的地方，所以没有生成卡片。原文还在，可以再试一次。';
    } else if (r && r.phase === 'parse') {
      msg = '这次返回的内容格式不对，没法生成卡片。原文还在，可以再试一次。';
    }
    $('errBody').textContent = msg;

    var d = $('errDetail');
    var lines = [];
    if (r && r.model) lines.push('模型：' + (r.model.name || r.model.id));
    if (r && r.code) lines.push('错误码：' + r.code);
    if (r && r.errors && r.errors.length) lines.push('自检未通过项：\n- ' + r.errors.slice(0, 8).join('\n- '));
    if (lines.length) { d.hidden = false; d.textContent = lines.join('\n'); } else { d.hidden = true; }
    show('stepError');
  }

  /* ---------------- 事件 ---------------- */
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
  el.btnBackHome2.addEventListener('click', resetAll);
  el.btnNewNotice.addEventListener('click', resetAll);
  el.btnReset.addEventListener('click', resetAll);
  el.btnCopy.addEventListener('click', copyCard);
  el.btnSelectAll.addEventListener('click', function () {
    el.copyFallbackText.focus();
    el.copyFallbackText.select();
    try { document.execCommand('copy'); toast('已复制'); } catch (e) { toast('请长按选择“全选”再复制'); }
  });

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

  updateCount();
  var st = window.MBBLLM.status();
  if (!st.ready) console.warn('[明白办] AI 服务未就绪：', st.reason);

  /* 供自动化测试与外部验证使用（只读入口，不改变产品行为） */
  window.__MBB = {
    analyze: function (text) { return window.MBBLLM.analyze(String(text || '').trim(), {}); },
    buildCardText: function () { return state.lastResult ? buildCardText(state.lastResult) : ''; },
    validateOnly: function (raw, src) { return window.MBBValidate.validate(raw, src); },
    state: function () { return { seq: state.seq, busy: state.busy, hasResult: !!state.lastResult }; },
    samples: SAMPLES,
    cfg: cfg
  };
})();
