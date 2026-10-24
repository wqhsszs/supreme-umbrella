/* 明白办 · 行动卡朗读（C 轮）
 *
 * 通道说明（必须如实对待）：
 *   使用浏览器 Web Speech API（window.speechSynthesis），声音来自设备/系统，
 *   不是云端 TTS，也不是某个大模型的声音。因此：
 *     - 不同设备音色不同，有的设备没有中文音色；
 *     - 不能导出音频文件，所以界面上不提供"下载语音"按钮（做不到就不摆出来）；
 *     - 朗读不等于已经把语音发给长辈，发送仍由使用者自己完成。
 *
 * 内容原则：
 *   朗读文本由已校验的卡片数据确定性拼出来，不再调用模型改写事实。
 *   "通知未说明""前后不一致""还要确认"必须读出来，不能为了顺口省掉。
 *   勾选只读成"整理者记录的准备进度"，绝不读成"已经报名"。
 */
window.MBBSpeech = (function () {
  'use strict';

  var cfg = window.MBB_CONFIG || {};
  var S = cfg.speech || {};
  var engine = null;          /* 允许测试注入假引擎；生产环境用浏览器原生 */
  var utt = null;
  var token = 0;
  var keepAlive = null;
  var handlers = {};
  var state = { speaking: false, paused: false, text: '', voice: null, error: '' };

  function defaultEngine() {
    return window.speechSynthesis || null;
  }

  function getEngine() {
    return engine || defaultEngine();
  }

  function supported() {
    return !!(window.SpeechSynthesisUtterance && getEngine());
  }

  /* ---------------- 文本构建 ---------------- */

  /* 只做"便于发音"的等价改写，不改数值、不补年份、不推断相对日期：
     "9:00" → "9点"；"9:00—11:00" → "9点到11点"；"17:00前" → "17点前"。 */
  function speakable(s) {
    var t = String(s == null ? '' : s);
    t = t.replace(/(\d{1,2}):(\d{2})/g, function (_, h, m) {
      return h + '点' + (m === '00' ? '' : String(parseInt(m, 10)) + '分');
    });
    t = t.replace(/([点分])\s*[—–\-~～至]\s*(?=\d{1,2}\s*点)/g, '$1到');
    t = t.replace(/[—–]/g, '，');
    t = t.replace(/\s+/g, ' ').trim();
    return t;
  }

  var STATUS_WORD = {
    stated: '原文写明',
    missing: '通知未说明',
    unclear: '说得含糊',
    conflict: '前后不一致'
  };

  function statusWord(s) { return STATUS_WORD[s] || '需要确认'; }

  /* 列表项收尾：去掉重复的句号/分号，问号叹号保留（不要把问句读成陈述句） */
  function cleanItem(s) {
    return String(s == null ? '' : s)
      .replace(/[。．.；;，,\s]+$/g, '')
      .trim();
  }

  function joinList(items, sep) {
    var list = items.map(cleanItem).filter(function (x) { return x; });
    if (!list.length) return '';
    var out = list.join(sep || '；');
    return /[。？！?!]$/.test(out) ? out : out + '。';
  }

  /* 缺失项只说一次「通知未说明」，不要读成「通知未说明，通知未说明」 */
  function factSentence(item, label) {
    if (!item) return '';
    if (item.value == null || item.status === 'missing') return label + '：通知未说明。';
    return label + '：' + speakable(item.value) + '，' + statusWord(item.status) + '。';
  }

  /* 生成朗读文本。opts: { prepChecked:{idx:bool}, actChecked:{idx:bool}, sourceType } */
  function buildText(data, opts) {
    opts = opts || {};
    if (!data) return '';
    var L = [];
    var prepChecked = opts.prepChecked || {};
    var actChecked = opts.actChecked || {};
    var checkedPrep = 0;
    Object.keys(prepChecked).forEach(function (k) { if (prepChecked[k]) checkedPrep++; });
    var checkedAct = 0;
    Object.keys(actChecked).forEach(function (k) { if (actChecked[k]) checkedAct++; });

    L.push('明白办，社区通知行动卡。');

    if (data.summary) L.push('这条通知要办什么：' + speakable(data.summary));

    /* 必须先读待确认：冲突与含糊不能被"读得顺"掩盖 */
    var mustConfirm = [];
    if (data.audience && data.audience.status === 'conflict') mustConfirm.push('适用对象前后不一致');
    (data.times || []).forEach(function (t) {
      var name = t.purpose || '时间';
      if (t.status === 'conflict') mustConfirm.push(name + '前后不一致，需要问清以哪个为准');
      else if (t.status === 'unclear') mustConfirm.push(name + '说得不明确');
      if (t.place) {
        if (t.place.status === 'conflict') mustConfirm.push(name + '的地点前后不一致');
        else if (t.place.status === 'unclear') mustConfirm.push(name + '的地点说得不明确');
      }
    });
    if (mustConfirm.length) {
      L.push('先注意：' + mustConfirm.join('；') + '。');
    }

    L.push(factSentence(data.audience, '谁适用'));

    var times = data.times || [];
    if (!times.length) {
      L.push('时间：通知未说明。');
    } else {
      times.forEach(function (t) {
        var line = (t.purpose || '时间') + '：' + (t.value == null || t.status === 'missing'
          ? '通知未说明。'
          : speakable(t.value) + '，' + statusWord(t.status) + '。');
        if (t.place) {
          line += '地点：' + (t.place.value == null || t.place.status === 'missing'
            ? '通知未说明。'
            : speakable(t.place.value) + '，' + statusWord(t.place.status) + '。');
        }
        L.push(line);
      });
      var anyPlace = times.some(function (t) { return t.place && t.place.status !== 'missing'; });
      if (!anyPlace && data.location) {
        L.push(factSentence(data.location, '整体地点'));
      }
    }

    var prep = data.preparation || [];
    if (!prep.length) {
      L.push('家人需要准备什么：通知没提要带什么，不用特别准备。');
    } else {
      L.push('家人需要准备什么：' + joinList(prep.map(function (p, i) {
        if (p.value == null || p.status === 'missing') return '第' + (i + 1) + '项，通知未说明';
        return '第' + (i + 1) + '项，' + speakable(p.value) + '，' + statusWord(p.status);
      })));
      if (checkedPrep > 0) {
        L.push('整理者已经勾选 ' + checkedPrep + ' 项准备内容。打勾只记录准备到哪一步，不代表已经报名，也不代表已经办好。');
      }
    }

    var acts = data.actions || [];
    if (acts.length) {
      L.push('下一步：' + joinList(acts.map(function (a) {
        return speakable(a.value) + (a.type === 'suggested' ? '，这一条是建议先确认，不是通知要求' : '');
      })));
      if (checkedAct > 0) {
        L.push('整理者已经勾选 ' + checkedAct + ' 项下一步。同样只是准备记录，不代表已经完成。');
      }
    } else {
      L.push('下一步：通知没写要做什么。');
    }

    if (data.questions && data.questions.length) {
      L.push('还要确认：' + joinList(data.questions.map(function (q) { return speakable(q); })));
    }

    if (data.warnings && data.warnings.length) {
      L.push('注意：' + joinList(data.warnings.map(function (w) { return speakable(w); })));
    }

    L.push('说明：通知没写的内容，卡上标为通知未说明，没有替通知补。重要事项请以通知原文和社区说法为准。');

    return L.filter(function (x) { return x && x.trim(); }).join('\n');
  }

  /* ---------------- 音色 ---------------- */

  function zhVoices() {
    var e = getEngine();
    if (!e || typeof e.getVoices !== 'function') return [];
    return (e.getVoices() || []).filter(function (v) {
      var lang = String(v.lang || '').toLowerCase();
      var name = String(v.name || '').toLowerCase();
      return lang.indexOf('zh') === 0 || lang.indexOf('cmn') === 0 || name.indexOf('chinese') !== -1;
    });
  }

  function pickVoice() {
    var list = zhVoices();
    if (!list.length) return null;
    var hints = S.voiceHints || [];
    for (var h = 0; h < hints.length; h++) {
      for (var i = 0; i < list.length; i++) {
        if (String(list[i].name || '').toLowerCase().indexOf(hints[h]) !== -1) return list[i];
      }
    }
    /* 优先本地音色（离线可用），否则第一个中文音色 */
    var local = list.filter(function (v) { return v.localService === true; });
    return (local[0] || list[0]);
  }

  /* 有的浏览器首屏 getVoices() 为空，要等 voiceschanged */
  function waitVoices(timeoutMs) {
    var e = getEngine();
    if (!e || typeof e.getVoices !== 'function') return Promise.resolve([]);
    var has = zhVoices();
    if (has.length) return Promise.resolve(has);
    return new Promise(function (resolve) {
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        e.removeEventListener && e.removeEventListener('voiceschanged', finish);
        resolve(zhVoices());
      }
      if (e.addEventListener) e.addEventListener('voiceschanged', finish);
      setTimeout(finish, timeoutMs == null ? 1500 : timeoutMs);
    });
  }

  /* ---------------- 播放控制 ---------------- */

  function notify() {
    if (typeof handlers.onstate === 'function') {
      handlers.onstate(status());
    }
  }

  function clearKeepAlive() {
    if (keepAlive) { clearInterval(keepAlive); keepAlive = null; }
  }

  function stop(reason) {
    token++;
    clearKeepAlive();
    var e = getEngine();
    if (e && typeof e.cancel === 'function') {
      try { e.cancel(); } catch (err) {}
    }
    utt = null;
    state.speaking = false;
    state.paused = false;
    state.error = reason === 'error' ? state.error : '';
    notify();
  }

  function pause() {
    var e = getEngine();
    if (!state.speaking || state.paused) return false;
    if (!e || typeof e.pause !== 'function') return false;
    try {
      e.pause();
      state.paused = true;
      notify();
      return true;
    } catch (err) {
      return false;
    }
  }

  function resume() {
    var e = getEngine();
    if (!state.speaking || !state.paused) return false;
    if (!e || typeof e.resume !== 'function') return false;
    try {
      e.resume();
      state.paused = false;
      notify();
      return true;
    } catch (err) {
      return false;
    }
  }

  function errorMessage(code) {
    switch (String(code || '')) {
      case 'not-allowed': return '浏览器没有允许播放声音。请点一下页面，再点“读给家人听”。';
      case 'audio-busy': return '设备正在播放别的声音，稍后再试。';
      case 'voice-unavailable': return '这个音色当前不可用，可以换一个浏览器或设备再试。';
      case 'language-unavailable': return '设备上没有中文音色，读不出来。可以改用系统自带的读屏或语音助手。';
      case 'synthesis-failed': return '语音合成失败，可以再点一次，或换一个浏览器。';
      case 'interrupted': return '朗读被新的操作打断了。';
      default: return '朗读没有成功（' + (code || '未知原因') + '）。可以再点一次。';
    }
  }

  /* 开始朗读。不会自动调用；必须由用户点击触发（浏览器也要求这样）。 */
  function speak(text, opts) {
    opts = opts || {};
    handlers.onstate = opts.onstate || null;
    handlers.onerror = opts.onerror || null;

    if (!supported()) {
      state.error = 'unsupported';
      notify();
      return Promise.resolve({ ok: false, code: 'unsupported', message: '这个浏览器不支持语音朗读，可以换 Chrome 或 Edge。' });
    }
    if (!text || !String(text).trim()) {
      return Promise.resolve({ ok: false, code: 'empty_text', message: '没有可朗读的内容。' });
    }

    stop('replace');            /* 同时只允许一个播放任务 */

    var my = ++token;
    state.text = String(text);
    state.error = '';

    return waitVoices(opts.voiceWaitMs).then(function (list) {
      if (my !== token) return { ok: false, code: 'superseded', message: '已被新的朗读替换。' };
      var voice = pickVoice();
      state.voice = voice;

      var e = getEngine();
      var u = new window.SpeechSynthesisUtterance(state.text);
      u.lang = (voice && voice.lang) || 'zh-CN';
      if (voice) {
        try { u.voice = voice; } catch (err) { /* 某些浏览器只接受自家 Voice 对象，失败就退回默认音色 */ }
      }
      u.rate = S.rate || 0.92;
      u.pitch = S.pitch == null ? 1 : S.pitch;
      u.volume = S.volume == null ? 1 : S.volume;

      u.onstart = function () {
        if (my !== token) return;
        state.speaking = true;
        state.paused = false;
        notify();
      };
      u.onpause = function () { if (my === token) { state.paused = true; notify(); } };
      u.onresume = function () { if (my === token) { state.paused = false; notify(); } };
      u.onend = function () {
        if (my !== token) return;
        state.speaking = false;
        state.paused = false;
        clearKeepAlive();
        notify();
        if (typeof handlers.onstate === 'function') handlers.onstate(status());
      };
      u.onerror = function (ev) {
        if (my !== token) return;
        var code = (ev && ev.error) || 'unknown';
        if (code === 'interrupted' || code === 'canceled') {
          state.speaking = false;
          state.paused = false;
          notify();
          return;
        }
        state.error = code;
        state.speaking = false;
        state.paused = false;
        clearKeepAlive();
        notify();
        if (typeof handlers.onerror === 'function') handlers.onerror({ code: code, message: errorMessage(code) });
      };

      utt = u;
      try {
        e.speak(u);
      } catch (err) {
        state.error = 'speak_failed';
        notify();
        return { ok: false, code: 'speak_failed', message: '没能开始朗读，可以再点一次。' };
      }

      /* Chrome/Edge 长文本会在十几秒后自己停：定时做一次 pause/resume 保持活跃。
         这只在"正在播放且未暂停"时执行，不会改变朗读内容。 */
      clearKeepAlive();
      keepAlive = setInterval(function () {
        var eng = getEngine();
        if (!state.speaking || state.paused) return;
        try {
          if (eng && eng.speaking) { eng.pause(); eng.resume(); }
        } catch (err) {}
      }, 9000);

      state.speaking = true;
      state.paused = false;
      notify();

      return {
        ok: true,
        voiceName: voice ? voice.name : '',
        voiceLang: voice ? voice.lang : '',
        hasZhVoice: !!voice,
        charCount: state.text.length,
        text: state.text
      };
    });
  }

  function status() {
    return {
      supported: supported(),
      speaking: state.speaking,
      paused: state.paused,
      voiceName: state.voice ? state.voice.name : '',
      voiceLang: state.voice ? state.voice.lang : '',
      zhVoiceCount: zhVoices().length,
      error: state.error,
      textLength: state.text.length
    };
  }

  /* 仅供自动化测试注入假引擎：不改变生产行为 */
  function _setEngine(fake) {
    if (fake === undefined) return;
    stop();
    engine = fake;
  }

  return {
    supported: supported,
    buildText: buildText,
    speakable: speakable,
    speak: speak,
    pause: pause,
    resume: resume,
    stop: stop,
    status: status,
    zhVoices: zhVoices,
    _setEngine: _setEngine
  };
})();
