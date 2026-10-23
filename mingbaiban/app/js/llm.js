/* 明白办 · 模型调用
 *
 * 走 WorkBuddy 云服务的免密钥大模型通道，浏览器直连数据面（官方推荐的接入形态），
 * 不经过任何自建代理，也不在前端保存任何长期密钥。
 *
 * 这里做三件事：
 *   1. 拉取可用模型列表，按偏好选模型（选不到就用第一个可用模型，并如实显示实际型号）
 *   2. 加载并缓存系统提示词（运行时读取工程内的 prompts/system-prompt.txt，单一事实来源）
 *   3. 调模型 → 收集流式文本 → 解析 JSON → 交给 MBBValidate 校验 → 校验不过最多重试 1 次
 *
 * 拿不到真实服务时，一律返回错误，绝不用固定答案伪装成 AI 结果。
 */
window.MBBLLM = (function () {
  'use strict';

  var cfg = window.MBB_CONFIG;
  var cloud = null;
  var initError = null;
  var promptCache = null;
  var modelCache = null;

  function init() {
    if (cloud || initError) return cloud;
    if (!cfg.endpoint || !cfg.publishableKey) {
      initError = '服务未就绪：应用未取得云服务配置（endpoint / publishableKey 为空）。';
      return null;
    }
    if (typeof window.WorkBuddyCloud === 'undefined' || !window.WorkBuddyCloud.createWorkBuddyCloud) {
      initError = 'SDK 未加载：无法连接 AI 服务，请检查网络后刷新页面。';
      return null;
    }
    try {
      cloud = window.WorkBuddyCloud.createWorkBuddyCloud({
        endpoint: cfg.endpoint,
        oauthRelayBaseUrl: cfg.oauthRelayBaseUrl,
        publishableKey: cfg.publishableKey
      });
    } catch (e) {
      initError = '初始化 AI 服务失败：' + (e && e.message ? e.message : String(e));
      cloud = null;
    }
    return cloud;
  }

  function getPrompt() {
    if (promptCache) return Promise.resolve(promptCache);
    return fetch(cfg.promptPath, { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then(function (txt) {
        if (!txt || txt.trim().length < 100) throw new Error('提示词内容异常');
        promptCache = txt;
        return txt;
      });
  }

  function pickModel(models) {
    if (!Array.isArray(models) || models.length === 0) return null;
    var usable = models.filter(function (m) { return m && m.disabled !== true && m.enabled !== false; });
    if (usable.length === 0) return null;
    var hints = cfg.preferredModelHints || [];
    for (var h = 0; h < hints.length; h++) {
      var hint = hints[h].toLowerCase();
      for (var i = 0; i < usable.length; i++) {
        var id = String(usable[i].id || '').toLowerCase();
        var name = String(usable[i].name || '').toLowerCase();
        if (id.indexOf(hint) !== -1 || name.indexOf(hint) !== -1) return usable[i];
      }
    }
    return usable[0];
  }

  function listModels() {
    if (modelCache) return Promise.resolve(modelCache);
    var c = init();
    if (!c) return Promise.reject(new Error(initError));
    return c.llm.models.list().then(function (models) {
      var m = pickModel(models);
      if (!m) throw new Error('当前没有可用的模型（模型列表为空或全部停用）。');
      modelCache = { model: m, all: models };
      return modelCache;
    });
  }

  function parseJSONLoose(text) {
    var t = String(text || '').trim();
    // 去掉可能出现的 ```json 围栏
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    // 截取第一个 { 到最后一个 }
    var s = t.indexOf('{');
    var e = t.lastIndexOf('}');
    if (s !== -1 && e !== -1 && e > s) t = t.slice(s, e + 1);
    return JSON.parse(t);
  }

  function buildUserMessage(noticeText) {
    return '===通知原文开始===\n' + noticeText + '\n===通知原文结束===\n\n' +
      '请按系统要求，只输出 JSON。';
  }

  function callOnce(noticeText, signal) {
    var c = init();
    if (!c) return Promise.reject(new Error(initError || 'AI 服务不可用'));

    return getPrompt().then(function (systemPrompt) {
      return listModels().then(function (mc) {
        var messages = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: buildUserMessage(noticeText) }
        ];
        var content = '';
        var usage = null;
        var finish = null;

        var stream = c.llm.chat.completions.create({
          model: mc.model.id,
          messages: messages,
          stream: true,
          stream_options: { include_usage: true },
          temperature: 0.1,
          signal: signal
        });

        // 使用 for await（SDK 返回异步迭代器）
        return (async function () {
          for await (var chunk of stream) {
            var choice = chunk.choices && chunk.choices[0];
            if (choice && choice.delta && choice.delta.content) content += choice.delta.content;
            if (choice && choice.finish_reason) finish = choice.finish_reason;
            if (chunk.usage) usage = chunk.usage;
          }
          return { content: content, usage: usage, finish: finish, model: mc.model };
        })();
      });
    }).then(function (r) {
      var parsed;
      try {
        parsed = parseJSONLoose(r.content);
      } catch (e) {
        return {
          ok: false,
          phase: 'parse',
          error: '模型返回的内容不是合法 JSON',
          raw: r.content,
          model: r.model,
          usage: r.usage
        };
      }
      var res = window.MBBValidate.validate(parsed, noticeText);
      return {
        ok: res.ok,
        phase: res.ok ? 'done' : 'validate',
        data: res.data,
        errors: res.errors,
        warnings: res.warnings,
        raw: r.content,
        model: r.model,
        usage: r.usage,
        finish: r.finish
      };
    });
  }

  /* 主入口：分析一条通知
   * 返回 { ok, data, model, usage, attempts, errors, raw }
   * 失败时 ok=false，调用方必须显示失败状态，不得渲染成正常卡片。
   */
  function analyze(noticeText, opts) {
    opts = opts || {};
    var attempts = 0;
    var last = null;

    function attempt() {
      attempts++;
      var ctrl = new AbortController();
      var timer = setTimeout(function () { ctrl.abort(); }, cfg.requestTimeoutMs);
      if (opts.externalSignal) {
        opts.externalSignal.addEventListener('abort', function () { ctrl.abort(); });
      }
      return callOnce(noticeText, ctrl.signal).then(function (r) {
        clearTimeout(timer);
        r.attempts = attempts;
        if (r.ok) return r;
        last = r;
        if (attempts <= cfg.maxRetries) return attempt();
        return r;
      }).catch(function (err) {
        clearTimeout(timer);
        var msg = (err && err.message) || String(err);
        var code = (err && err.error && err.error.code) || (err && err.code) || '';
        var aborted = msg.indexOf('abort') !== -1 || (err && err.name === 'AbortError');
        last = {
          ok: false,
          phase: aborted ? 'timeout' : 'network',
          error: aborted ? '请求超时' : msg,
          code: code,
          attempts: attempts,
          raw: ''
        };
        if (!aborted && attempts <= cfg.maxRetries && /gateway_|model_|stream_interrupted/.test(code)) {
          return attempt();
        }
        return last;
      });
    }

    return attempt();
  }

  function status() {
    if (!cfg.endpoint || !cfg.publishableKey) return { ready: false, reason: 'config_missing' };
    if (initError) return { ready: false, reason: initError };
    if (typeof window.WorkBuddyCloud === 'undefined') return { ready: false, reason: 'sdk_missing' };
    return { ready: true, reason: '' };
  }

  return {
    init: init,
    status: status,
    analyze: analyze,
    listModels: listModels,
    getPrompt: getPrompt,
    parseJSONLoose: parseJSONLoose
  };
})();
