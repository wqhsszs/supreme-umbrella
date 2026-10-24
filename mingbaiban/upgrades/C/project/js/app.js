/* 明白办 C 轮 · 页面逻辑
 *
 * 状态机：
 *   文字：input → loading → (result | error | notNotice)
 *   图片：input → 取字 → 人工核对（必须勾选"已核对"）→ loading → (result | error | notNotice)
 *
 * 关键行为：
 *   - 每次发起请求递增序号，晚到的旧响应直接丢弃（防止新通知显示旧答案/旧文字）
 *   - 取字与整理是两次独立请求、两套提示词；卡片校验用的是"整理者确认过的文字"
 *   - 识别文字一旦被改动，旧卡片、复制文本、朗读、勾选状态全部作废
 *   - 所有来自模型和用户的文本都用 textContent 渲染，不拼 innerHTML
 *   - 复制/朗读与当前勾选状态一致；勾选只是「整理者准备到哪一步」
 *   - 朗读用设备自带语音，不自动播放，同一时刻只有一个朗读任务
 */
(function () {
  'use strict';

  var cfg = window.MBB_CONFIG;
  var $ = function (id) { return document.getElementById(id); };

  /* 配置文件没加载成功时，给出可读提示，而不是留一个死页面 */
  if (!cfg) {
    document.body.innerHTML = '<div style="padding:40px;font-family:sans-serif;line-height:1.8">' +
      '<h1 style="font-size:22px">页面没有加载完整</h1>' +
      '<p>配置脚本没有加载成功，请刷新重试；如果一直这样，可能是网络或部署缓存问题。</p></div>';
    return;
  }

  var el = {
    stepInput: $('stepInput'), stepLoading: $('stepLoading'), stepError: $('stepError'),
    stepNotNotice: $('stepNotNotice'), stepResult: $('stepResult'),
    noticeInput: $('noticeInput'), charCount: $('charCount'), inputError: $('inputError'),
    btnAnalyze: $('btnAnalyze'), btnCancel: $('btnCancel'), btnRetry: $('btnRetry'),
    btnBackHome: $('btnBackHome'), btnBackHome2: $('btnBackHome2'),
    btnNewNotice: $('btnNewNotice'), btnCopy: $('btnCopy'), btnReset: $('btnReset'),
    summaryText: $('summaryText'), statusReason: $('statusReason'), sourceLine: $('sourceLine'),
    confirmBanner: $('confirmBanner'),
    audienceBox: $('audienceBox'), timesBox: $('timesBox'), prepBox: $('prepBox'),
    actionBox: $('actionBox'), questionCard: $('questionCard'), questionBox: $('questionBox'),
    warningCard: $('warningCard'), warningBox: $('warningBox'),
    metaLine: $('metaLine'), notNoticeReason: $('notNoticeReason'),
    toast: $('toast'), copyFallback: $('copyFallback'),
    copyFallbackText: $('copyFallbackText'), btnSelectAll: $('btnSelectAll'),

    /* 输入方式 */
    tabText: $('tabText'), tabImage: $('tabImage'),
    paneText: $('paneText'), paneImage: $('paneImage'),
    uploadZone: $('uploadZone'), btnPickImage: $('btnPickImage'), imageInput: $('imageInput'),
    pickError: $('pickError'),
    imagePreviewCard: $('imagePreviewCard'), imagePreview: $('imagePreview'),
    fileName: $('fileName'), fileMeta: $('fileMeta'), imageScaleNote: $('imageScaleNote'),
    btnOcr: $('btnOcr'), btnReplaceImage: $('btnReplaceImage'), ocrError: $('ocrError'),
    ocrLoading: $('ocrLoading'), btnCancelOcr: $('btnCancelOcr'),
    ocrReview: $('ocrReview'), reviewImage: $('reviewImage'), reviewSub: $('reviewSub'),
    ocrText: $('ocrText'), ocrCharCount: $('ocrCharCount'), ocrTextError: $('ocrTextError'),
    chkReviewed: $('chkReviewed'), btnConfirmOcr: $('btnConfirmOcr'),
    btnBackToPick: $('btnBackToPick'), btnZoomImage: $('btnZoomImage'),

    /* 朗读 */
    speechCard: $('speechCard'), btnSpeak: $('btnSpeak'), speechControls: $('speechControls'),
    btnPauseSpeak: $('btnPauseSpeak'), btnStopSpeak: $('btnStopSpeak'),
    speechStatus: $('speechStatus'), speechError: $('speechError'),

    /* 原图 */
    btnViewOriginal: $('btnViewOriginal'), btnEditText: $('btnEditText'),
    imageDialog: $('imageDialog'),
    dialogImage: $('dialogImage')
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
    seq: 0, busy: false, lastInput: '', lastResult: null, controller: null, startedAt: 0,
    mode: 'text',
    img: null,                 /* { url, name, size, prepared } */
    ocrSeq: 0, ocrBusy: false, ocrController: null,
    sourceType: 'text',        /* text | image */
    sourceImageUrl: '',
    ocrModelLabel: '',
    cardText: '',              /* 当前卡片对应的确认文本，用于失效判断 */
    ocrEdited: false
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
    [el.summaryText, el.statusReason, el.sourceLine, el.audienceBox, el.timesBox, el.prepBox,
      el.actionBox, el.questionBox, el.warningBox, el.metaLine, el.confirmBanner].forEach(function (n) {
      n.textContent = '';
    });
    el.sourceLine.hidden = true;
    el.questionCard.hidden = true;
    el.warningCard.hidden = true;
    el.confirmBanner.hidden = true;
    resetSpeechUI();
  }

  /* 卡片作废：文字改了、换通知、离开时都要停朗读并清空 */
  function invalidateCard(reason) {
    if (!state.lastResult) return;
    window.MBBSpeech.stop();
    state.lastResult = null;
    state.cardText = '';
    clearResults();
    if (reason) toast(reason, 3200);
  }

  function resetAll() {
    state.seq++;
    state.ocrSeq++;
    if (state.controller) { try { state.controller.abort(); } catch (e) {} }
    if (state.ocrController) { try { state.ocrController.abort(); } catch (e) {} }
    state.controller = null;
    state.ocrController = null;
    state.busy = false;
    state.ocrBusy = false;
    state.lastResult = null;
    state.cardText = '';
    state.sourceType = 'text';
    state.sourceImageUrl = '';
    state.ocrModelLabel = '';
    state.ocrEdited = false;
    window.MBBSpeech.stop();
    clearImage();
    el.noticeInput.value = '';
    el.ocrText.value = '';
    el.chkReviewed.checked = false;
    el.inputError.hidden = true;
    el.ocrError.hidden = true;
    el.ocrTextError.hidden = true;
    el.pickError.hidden = true;
    updateCount();
    updateOcrCount();
    clearResults();
    setBusy(false);
    showInputSub('upload');
    show('stepInput');
    switchMode('text', true);
    el.noticeInput.focus();
  }

  function updateCount() {
    var n = el.noticeInput.value.length;
    el.charCount.textContent = n + ' / ' + cfg.maxInputChars;
    el.charCount.classList.toggle('over', n > cfg.maxInputChars);
  }

  function updateOcrCount() {
    var n = el.ocrText.value.length;
    el.ocrCharCount.textContent = n + ' / ' + cfg.maxInputChars;
    el.ocrCharCount.classList.toggle('over', n > cfg.maxInputChars);
  }

  function setBusy(b) {
    state.busy = b;
    el.btnAnalyze.disabled = b;
    el.btnAnalyze.querySelector('.btn-label').hidden = b;
    el.btnAnalyze.querySelector('.btn-busy').hidden = !b;
    if (b) el.btnConfirmOcr.disabled = true;
  }

  /* ---------------- 输入方式切换 ---------------- */
  function switchMode(mode, silent) {
    state.mode = mode;
    var isText = mode === 'text';
    el.tabText.classList.toggle('is-active', isText);
    el.tabImage.classList.toggle('is-active', !isText);
    el.tabText.setAttribute('aria-selected', isText ? 'true' : 'false');
    el.tabImage.setAttribute('aria-selected', isText ? 'false' : 'true');
    el.tabText.setAttribute('tabindex', isText ? '0' : '-1');
    el.tabImage.setAttribute('tabindex', isText ? '-1' : '0');
    el.paneText.hidden = !isText;
    el.paneImage.hidden = isText;
    if (!silent) {
      if (!isText && !state.img) el.btnPickImage.focus();
      else if (isText) el.noticeInput.focus();
    }
  }

  function showInputSub(which) {
    /* which: upload | preview | loading | review */
    el.uploadZone.hidden = which !== 'upload';
    el.imagePreviewCard.hidden = which !== 'preview';
    el.ocrLoading.hidden = which !== 'loading';
    el.ocrReview.hidden = which !== 'review';
  }

  function clearImage() {
    if (state.img && state.img.url) {
      try { URL.revokeObjectURL(state.img.url); } catch (e) {}
    }
    state.img = null;
    state.sourceImageUrl = '';
    el.imagePreview.removeAttribute('src');
    el.reviewImage.removeAttribute('src');
    el.dialogImage.removeAttribute('src');
    el.imageInput.value = '';
  }

  /* ---------------- 选图 ---------------- */
  function pickImage(file) {
    el.pickError.hidden = true;
    el.ocrError.hidden = true;
    var check = window.MBBOCR.validateFile(file);
    if (!check.ok) {
      el.pickError.textContent = check.message;
      el.pickError.hidden = false;
      return;
    }

    window.MBBOCR.prepare(file).then(function (prepared) {
      clearImage();
      var url = URL.createObjectURL(file);
      state.img = {
        url: url,
        name: file.name || '通知截图',
        size: file.size,
        prepared: prepared
      };
      el.imagePreview.src = url;
      el.reviewImage.src = url;
      el.dialogImage.src = url;
      el.fileName.textContent = state.img.name;
      el.fileMeta.textContent = (file.size / 1024).toFixed(0) + ' KB · ' +
        prepared.origWidth + '×' + prepared.origHeight;
      el.imageScaleNote.textContent = prepared.scaled
        ? '发送前会缩到 ' + prepared.width + '×' + prepared.height + '（原图 ' +
          prepared.origWidth + '×' + prepared.origHeight + '），取字精度不受影响。'
        : '按原尺寸发送（' + prepared.width + '×' + prepared.height + '）。';
      el.ocrText.value = '';
      el.ocrTextError.hidden = true;
      el.chkReviewed.checked = false;
      updateOcrCount();
      el.btnConfirmOcr.disabled = true;
      el.btnOcr.disabled = false;
      showInputSub('preview');
      window.MBBSpeech.stop();
      invalidateCard();
      el.btnOcr.focus();
    }).catch(function (err) {
      el.pickError.textContent = (err && err.message) || '这张图读不出来，换一张试试。';
      el.pickError.hidden = false;
      clearImage();
      showInputSub('upload');
    });
  }

  /* ---------------- 取字 ---------------- */
  function runOcr() {
    if (!state.img || state.ocrBusy) return;
    if (!window.MBBLLM.status().ready) {
      el.ocrError.textContent = 'AI 服务还没连接上，现在没法取字。可以先用「粘贴文字」。';
      el.ocrError.hidden = false;
      return;
    }

    state.ocrSeq++;
    var my = state.ocrSeq;
    state.ocrBusy = true;
    state.ocrController = new AbortController();
    el.ocrError.hidden = true;
    el.btnOcr.disabled = true;
    showInputSub('loading');

    window.MBBOCR.recognize(state.img.prepared, { externalSignal: state.ocrController.signal })
      .then(function (r) {
        if (my !== state.ocrSeq) return;   /* 旧请求，丢弃 */
        state.ocrBusy = false;
        state.ocrController = null;
        el.btnOcr.disabled = false;

        if (!r.ok) {
          state.ocrModelLabel = '';
          showInputSub('preview');
          el.ocrError.textContent = r.hint || '这次没能取出文字，可以再试一次。';
          el.ocrError.hidden = false;
          return;
        }

        state.ocrModelLabel = r.modelLabel || r.modelId || '';
        if (r.kind === 'no_text' || r.kind === 'too_blurry') {
          showInputSub('preview');
          el.ocrError.textContent = r.hint;
          el.ocrError.hidden = false;
          return;
        }
        if (r.kind === 'empty') {
          showInputSub('preview');
          el.ocrError.textContent = '识别结果里没有文字。可以换一张更清楚的截图，或直接粘贴文字。';
          el.ocrError.hidden = false;
          return;
        }

        el.ocrText.value = r.text;
        updateOcrCount();
        el.chkReviewed.checked = false;
        el.btnConfirmOcr.disabled = true;
        el.ocrEdited = false;
        el.ocrTextError.hidden = true;
        el.reviewSub.textContent = r.unsureCount > 0
          ? ('有 ' + r.unsureCount + ' 处标为看不清，请对照原图补上；其余文字也请扫一遍。')
          : '取字只用了 ' + (r.modelLabel || '识图模型') + '，没有改写、没有补全。请对照原图扫一遍再确认。';
        showInputSub('review');
        el.ocrText.focus();
      })
      .catch(function (err) {
        if (my !== state.ocrSeq) return;
        state.ocrBusy = false;
        state.ocrController = null;
        el.btnOcr.disabled = false;
        showInputSub('preview');
        el.ocrError.textContent = '取字过程出错了（' + ((err && err.message) || '原因未知') + '），图片还在，可以再试一次。';
        el.ocrError.hidden = false;
      });
  }

  function cancelOcr() {
    state.ocrSeq++;
    if (state.ocrController) { try { state.ocrController.abort(); } catch (e) {} }
    state.ocrController = null;
    state.ocrBusy = false;
    el.btnOcr.disabled = false;
    showInputSub(state.img ? 'preview' : 'upload');
  }

  /* ---------------- 校验与渲染小件 ---------------- */
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

  function evidenceLabel() {
    return state.sourceType === 'image' ? '对照核对后的通知文字' : '对照通知原文';
  }

  function evidenceBlock(evidence) {
    var box = document.createElement('div');
    box.className = 'evidence';
    box.hidden = true;
    var prefix = state.sourceType === 'image' ? '核对后的文字 · 第 ' : '通知原文 · 第 ';
    for (var i = 0; i < evidence.length; i++) {
      var p = document.createElement('p');
      var src = document.createElement('span');
      src.className = 'src';
      src.textContent = prefix + (i + 1) + ' 处';
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
    btn.textContent = evidenceLabel();
    var box = evidenceBlock(evidence);
    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', function () {
      box.hidden = !box.hidden;
      btn.setAttribute('aria-expanded', box.hidden ? 'false' : 'true');
      btn.textContent = box.hidden ? evidenceLabel() : '收起';
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
    var push = function (arr) {
      (arr || []).forEach(function (q) { if (merged.indexOf(q) === -1) merged.push(q); });
    };
    push(item.evidence);
    if (opts.place) push(opts.place.evidence);
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
    window.MBBSpeech.stop();
    prepareSpeech();

    el.summaryText.textContent = data.summary || '（这条通知内容较短）';
    el.statusReason.textContent = data.document_status_reason || '';

    if (state.sourceType === 'image' && state.ocrModelLabel) {
      el.sourceLine.textContent = '来源：上传的通知截图 · 文字由 ' + state.ocrModelLabel +
        ' 取出后经整理者核对 · 卡片只依据核对后的文字';
      el.sourceLine.hidden = false;
    } else {
      el.sourceLine.hidden = true;
    }

    renderConfirm(data);

    el.audienceBox.appendChild(factNode(data.audience));

    if (!data.times || data.times.length === 0) {
      var p = document.createElement('p');
      p.className = 'empty-state';
      p.textContent = '通知里没写清时间。';
      el.timesBox.appendChild(p);
    } else {
      data.times.forEach(function (t) {
        el.timesBox.appendChild(factNode(t, {
          purpose: t.purpose,
          showPlace: true,
          place: t.place || null
        }));
      });
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

    el.btnViewOriginal.hidden = !(state.sourceType === 'image' && state.sourceImageUrl);
    el.btnEditText.hidden = !(state.sourceType === 'image' && state.sourceImageUrl);

    el.metaLine.textContent = '本次生成信息：' + (meta.modelLabel || '模型未记录') +
      ' · 用时 ' + (meta.elapsedMs / 1000).toFixed(1) + ' 秒' +
      (meta.attempts > 1 ? ' · 第 ' + meta.attempts + ' 次尝试' : '') +
      (state.sourceType === 'image' ? ' · 文字来自截图，已由整理者核对' : ' · 文字由整理者提供') +
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
    if (state.sourceType === 'image') L.push('（文字来自上传的截图，已由整理者核对）');
    L.push('');
    L.push('这条通知要办什么');
    L.push('  ' + (d.summary || '（通知内容较短）'));
    L.push('');

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

  /* ---------------- 朗读 ---------------- */
  function speechTextNow() {
    if (!state.lastResult) return '';
    return window.MBBSpeech.buildText(state.lastResult.data, {
      prepChecked: readChecks('data-prep'),
      actChecked: readChecks('data-action'),
      sourceType: state.sourceType
    });
  }

  function resetSpeechUI() {
    el.speechControls.hidden = true;
    el.speechStatus.textContent = '';
    el.speechError.hidden = true;
    el.btnSpeak.hidden = false;
    el.btnSpeak.textContent = '读给家人听';
    el.btnSpeak.disabled = false;
    el.btnPauseSpeak.textContent = '暂停';
  }

  function prepareSpeech() {
    resetSpeechUI();
    if (!window.MBBSpeech.supported()) {
      el.btnSpeak.disabled = true;
      el.btnSpeak.textContent = '这台设备不支持朗读';
      el.speechStatus.textContent = '当前浏览器没有语音朗读能力。可以先用「复制行动卡」发给家人，让对方用手机自带的朗读功能听。';
      return;
    }
    var st = window.MBBSpeech.status();
    if (st.zhVoiceCount === 0) {
      el.speechStatus.textContent = '这台设备暂时没检测到中文语音。点「读给家人听」会再试一次；如果还是不行，可以改用复制。';
    } else {
      el.speechStatus.textContent = '声音来自这台设备，不是云端配音；不同设备听起来会不一样。';
    }
  }

  function updateSpeechButtons(s) {
    var active = s && s.speaking;
    el.speechControls.hidden = !active;
    el.btnSpeak.hidden = !!active;
    if (active) {
      el.btnPauseSpeak.textContent = s.paused ? '继续' : '暂停';
      el.speechStatus.textContent = s.paused
        ? '已暂停。点「继续」接着读。'
        : '正在朗读…' + (s.voiceName ? '（' + s.voiceName + '）' : '');
    } else if (!el.btnSpeak.hidden) {
      el.speechStatus.textContent = s && s.voiceName
        ? '上一次朗读用的是：' + s.voiceName
        : '';
    }
  }

  function startSpeech() {
    el.speechError.hidden = true;
    if (!state.lastResult) return;
    var text = speechTextNow();
    window.MBBSpeech.speak(text, {
      onstate: function (s) { updateSpeechButtons(s); },
      onerror: function (e) {
        el.speechError.textContent = e.message || '朗读没有成功，可以再试一次。';
        el.speechError.hidden = false;
        updateSpeechButtons(window.MBBSpeech.status());
      }
    }).then(function (r) {
      if (!r.ok && r.code !== 'superseded') {
        if (r.code === 'unsupported') {
          el.btnSpeak.disabled = true;
          el.btnSpeak.textContent = '这台设备不支持朗读';
        }
        el.speechError.textContent = r.message;
        el.speechError.hidden = false;
      }
      updateSpeechButtons(window.MBBSpeech.status());
    }).catch(function (err) {
      el.speechError.textContent = '朗读没有开始（' + ((err && err.message) || '未知原因') + '）。可以再点一次，或改用复制。';
      el.speechError.hidden = false;
      updateSpeechButtons(window.MBBSpeech.status());
    });
  }

  /* ---------------- 主流程 ---------------- */
  function startAnalyze(text, source) {
    if (state.busy) return;

    var trimmed = String(text || '').trim();
    el.inputError.hidden = true;
    el.ocrTextError.hidden = true;

    if (!trimmed) {
      var msg = '还没有通知内容。' + (state.mode === 'image' ? '先识别并核对文字。' : '把社区发来的通知原文贴到上面的框里。');
      if (state.mode === 'image') {
        el.ocrTextError.textContent = msg;
        el.ocrTextError.hidden = false;
        el.ocrText.focus();
      } else {
        el.inputError.textContent = msg;
        el.inputError.hidden = false;
        el.noticeInput.focus();
      }
      return;
    }
    if (text.length > cfg.maxInputChars) {
      var m2 = '文字太长了（' + text.length + ' 字），最多 ' + cfg.maxInputChars +
        ' 字。这里不会替你截断，请分段处理，或只保留最关键的那一段。';
      if (state.mode === 'image') {
        el.ocrTextError.textContent = m2;
        el.ocrTextError.hidden = false;
      } else {
        el.inputError.textContent = m2;
        el.inputError.hidden = false;
      }
      return;
    }
    if (trimmed.length < 10) {
      var m3 = '这段文字太短，看不出是通知。请给完整的通知内容。';
      if (state.mode === 'image') {
        el.ocrTextError.textContent = m3;
        el.ocrTextError.hidden = false;
      } else {
        el.inputError.textContent = m3;
        el.inputError.hidden = false;
      }
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

    window.MBBSpeech.stop();
    state.seq++;
    var mySeq = state.seq;
    state.lastInput = text;
    state.cardText = text;
    state.sourceType = source && source.type === 'image' ? 'image' : 'text';
    state.sourceImageUrl = (source && source.imageUrl) || '';
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
        if (state.sourceType === 'image') {
          toast('卡片只依据你核对过的文字生成。', 3200);
        }
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
      msg = '等太久了（超过 ' + Math.round(cfg.requestTimeoutMs / 1000) + ' 秒），可能是网络慢。内容还在，可以再试一次。';
    } else if (r && r.phase === 'network') {
      msg = '网络请求没有成功（' + (r.error || '原因未知') + '）。内容还在，可以再试一次。';
    } else if (r && r.phase === 'validate') {
      msg = '这次整理出来的内容里，有对不上通知原文的地方，所以没有生成卡片。内容还在，可以再试一次。';
    } else if (r && r.phase === 'parse') {
      msg = '这次返回的内容格式不对，没法生成卡片。内容还在，可以再试一次。';
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

  function backToInput() {
    if (state.mode === 'image' && el.ocrText.value.trim() && state.img) {
      showInputSub('review');
    } else if (state.mode === 'image' && state.img) {
      showInputSub('preview');
    }
    show('stepInput');
  }

  /* ---------------- 事件 ---------------- */
  el.noticeInput.addEventListener('input', updateCount);
  el.btnAnalyze.addEventListener('click', function () {
    startAnalyze(el.noticeInput.value, { type: 'text' });
  });

  el.tabText.addEventListener('click', function () { switchMode('text'); });
  el.tabImage.addEventListener('click', function () { switchMode('image'); });
  [el.tabText, el.tabImage].forEach(function (tab) {
    tab.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        var next = state.mode === 'text' ? 'image' : 'text';
        switchMode(next);
        (next === 'text' ? el.tabText : el.tabImage).focus();
      }
    });
  });

  el.btnPickImage.addEventListener('click', function () { el.imageInput.click(); });
  el.imageInput.addEventListener('change', function () {
    if (el.imageInput.files && el.imageInput.files[0]) pickImage(el.imageInput.files[0]);
  });
  el.btnReplaceImage.addEventListener('click', function () {
    cancelOcr();
    clearImage();
    el.ocrError.hidden = true;
    showInputSub('upload');
    el.imageInput.click();
  });
  el.btnBackToPick.addEventListener('click', function () {
    clearImage();
    el.imageInput.click();
  });
  el.btnOcr.addEventListener('click', runOcr);
  el.btnCancelOcr.addEventListener('click', cancelOcr);

  el.ocrText.addEventListener('input', function () {
    updateOcrCount();
    el.ocrTextError.hidden = true;
    /* 文字改了，之前的"已核对"就不算数了 */
    if (el.chkReviewed.checked) {
      el.chkReviewed.checked = false;
      el.btnConfirmOcr.disabled = true;
      toast('文字改过了，请重新对照原图核对，再点确认。', 3200);
    }
    state.ocrEdited = true;
    invalidateCard('文字改过了，之前的卡片已作废，需要重新整理。');
  });
  el.chkReviewed.addEventListener('change', function () {
    el.btnConfirmOcr.disabled = !el.chkReviewed.checked || state.busy;
  });
  el.btnConfirmOcr.addEventListener('click', function () {
    if (!el.chkReviewed.checked) {
      el.ocrTextError.textContent = '请先对照原图核对，勾选"已核对"，再整理。';
      el.ocrTextError.hidden = false;
      return;
    }
    startAnalyze(el.ocrText.value, {
      type: 'image',
      imageUrl: state.img ? state.img.url : ''
    });
  });

  el.btnZoomImage.addEventListener('click', function () {
    if (!state.img) return;
    el.dialogImage.src = state.img.url;
    if (typeof el.imageDialog.showModal === 'function') el.imageDialog.showModal();
    else el.imageDialog.setAttribute('open', '');
  });

  el.btnEditText.addEventListener('click', function () {
    if (!state.img) return;
    invalidateCard();
    window.MBBSpeech.stop();
    switchMode('image', true);
    showInputSub('review');
    el.chkReviewed.checked = false;
    el.btnConfirmOcr.disabled = true;
    show('stepInput');
    el.ocrText.focus();
    toast('改完文字要重新勾选「已核对」，再整理一次。', 3400);
  });

  el.btnViewOriginal.addEventListener('click', function () {
    if (!state.sourceImageUrl) return;
    el.dialogImage.src = state.sourceImageUrl;
    if (typeof el.imageDialog.showModal === 'function') el.imageDialog.showModal();
    else el.imageDialog.setAttribute('open', '');
  });

  el.btnSpeak.addEventListener('click', startSpeech);
  el.btnPauseSpeak.addEventListener('click', function () {
    var s = window.MBBSpeech.status();
    if (s.paused) window.MBBSpeech.resume();
    else window.MBBSpeech.pause();
  });
  el.btnStopSpeak.addEventListener('click', function () {
    window.MBBSpeech.stop();
    updateSpeechButtons(window.MBBSpeech.status());
    el.speechStatus.textContent = '已停止朗读。';
  });

  el.btnCancel.addEventListener('click', function () {
    state.seq++;
    if (state.controller) { try { state.controller.abort(); } catch (e) {} }
    setBusy(false);
    backToInput();
  });
  el.btnRetry.addEventListener('click', function () {
    if (state.mode === 'image') {
      el.ocrText.value = state.lastInput;
      updateOcrCount();
      state.ocrEdited = true;
      backToInput();
      startAnalyze(state.lastInput, { type: 'image', imageUrl: state.img ? state.img.url : '' });
      return;
    }
    el.noticeInput.value = state.lastInput;
    updateCount();
    show('stepInput');
    startAnalyze(state.lastInput, { type: 'text' });
  });
  el.btnBackHome.addEventListener('click', backToInput);
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
      switchMode('text', true);
      el.noticeInput.value = SAMPLES[i].text;
      updateCount();
      el.inputError.hidden = true;
      el.noticeInput.focus();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  /* 离开页面 / 切到后台：停止朗读，避免声音继续在后台响 */
  window.addEventListener('pagehide', function () { window.MBBSpeech.stop(); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) window.MBBSpeech.stop();
  });

  updateCount();
  updateOcrCount();
  prepareSpeech();
  var st = window.MBBLLM.status();
  if (!st.ready) console.warn('[明白办] AI 服务未就绪：', st.reason);

  /* 供自动化测试与外部验证使用（只读入口，不改变产品行为） */
  window.__MBB = {
    analyze: function (text) { return window.MBBLLM.analyze(String(text || '').trim(), {}); },
    buildCardText: function () { return state.lastResult ? buildCardText(state.lastResult) : ''; },
    validateOnly: function (raw, src) { return window.MBBValidate.validate(raw, src); },
    state: function () {
      return {
        seq: state.seq, busy: state.busy, hasResult: !!state.lastResult,
        mode: state.mode, sourceType: state.sourceType,
        ocrBusy: state.ocrBusy, imgName: state.img ? state.img.name : '',
        cardText: state.cardText
      };
    },
    speechText: speechTextNow,
    ocrFile: function (file) { pickImage(file); return state.ocrBusy; },
    ocrRun: runOcr,
    ocrResult: function () {
      return {
        text: el.ocrText.value,
        reviewed: el.chkReviewed.checked,
        confirmDisabled: el.btnConfirmOcr.disabled,
        view: el.ocrReview.hidden ? 'hidden' : 'review'
      };
    },
    switchMode: switchMode,
    /* 以下两个只给自动化测试与截图用：不改变正常流程，也不会被产品界面调用。
       _renderFixture 用固定的已校验数据渲染卡片；_showReview 直接打开核对界面。 */
    _renderFixture: function (data, sourceType) {
      state.sourceType = sourceType || 'text';
      state.sourceImageUrl = state.img ? state.img.url : '';
      state.ocrModelLabel = sourceType === 'image' ? 'Deepseek-V4.1-Flash' : '';
      renderResult(data, { modelLabel: 'fixture', elapsedMs: 1, attempts: 1 });
    },
    _showReview: function (text) {
      switchMode('image', true);
      el.ocrText.value = text;
      updateOcrCount();
      el.chkReviewed.checked = false;
      el.btnConfirmOcr.disabled = true;
      showInputSub('review');
      show('stepInput');
    },
    samples: SAMPLES,
    cfg: cfg
  };
})();
