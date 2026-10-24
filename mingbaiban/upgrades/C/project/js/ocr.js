/* 明白办 · 截图取字（C 轮）
 *
 * 职责边界（重要）：
 *   本文件只负责「把图片安全地变成一段可核对的文字」：
 *     - 文件类型 / 大小 / 能否解码 的前置校验
 *     - 按长边缩放、压成 data URL（不上传到无关第三方，只发给本应用的模型通道）
 *     - 调用 MBBLLM.recognizeImage（真实多模态模型，另一次独立请求）
 *     - 把"没有文字 / 太模糊 / 超时 / 无识图模型"翻译成可操作的提示
 *   它不做事实整理，也不判断是不是通知——那是下一步 analyze 的事。
 *
 * 隐私：图片只在当前页面内存里存在（ObjectURL + data URL），
 *       不写 localStorage / IndexedDB，不发往除模型通道以外的地址。
 */
window.MBBOCR = (function () {
  'use strict';

  var cfg = window.MBB_CONFIG || {};
  var O = cfg.ocr || {};

  var NO_TEXT_MARK = '［没有读到文字］';
  var TOO_BLURRY_MARK = '［图片太模糊，无法可靠取字］';
  var UNSURE_MARK_RE = /［此处看不清[^］]*］/g;

  function extOf(name) {
    var m = /\.([a-z0-9]+)$/i.exec(String(name || ''));
    return m ? m[1].toLowerCase() : '';
  }

  /* 前置校验：在用户选完文件、还没发起请求时就能给出准确原因 */
  function validateFile(file) {
    if (!file) return { ok: false, code: 'no_file', message: '还没有选择图片。' };

    var ext = extOf(file.name);
    var typeOk = (O.acceptTypes || []).indexOf(file.type) !== -1;
    var extOk = (O.acceptExt || []).indexOf(ext) !== -1;
    if (!typeOk && !extOk) {
      return {
        ok: false,
        code: 'bad_type',
        message: '这个格式暂时读不了（' + (file.type || ext || '未知格式') +
          '）。请用 JPG、PNG 或 WebP 的截图；iPhone 的 HEIC 可以先在相册里导出成 JPG。'
      };
    }
    if (!file.size) {
      return { ok: false, code: 'empty', message: '这个文件是空的（0 字节），换一张试试。' };
    }
    if (file.size > (O.maxBytes || 8 * 1024 * 1024)) {
      return {
        ok: false,
        code: 'too_large',
        message: '图片有 ' + (file.size / 1024 / 1024).toFixed(1) + ' MB，超过 ' +
          Math.round((O.maxBytes || 0) / 1024 / 1024) + ' MB 的上限。可以先裁掉无关部分，或压缩后再传。'
      };
    }
    return { ok: true, code: 'ok', message: '' };
  }

  function loadBitmap(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () {
        return decodeViaImage(file);
      });
    }
    return decodeViaImage(file);
  }

  function decodeViaImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('decode_failed'));
      };
      img.src = url;
    });
  }

  /* 缩放 + 编码。返回 dataUrl 与真实像素尺寸，供界面说明"已压缩"。 */
  function prepare(file) {
    var v = validateFile(file);
    if (!v.ok) return Promise.reject(v);

    return loadBitmap(file).then(function (bmp) {
      var w = bmp.width || bmp.naturalWidth;
      var h = bmp.height || bmp.naturalHeight;
      if (!w || !h) {
        var e = new Error('这张图读不出尺寸，可能已损坏。');
        e.code = 'decode_failed';
        throw e;
      }
      var maxEdge = O.maxEdge || 1600;
      var scale = Math.min(1, maxEdge / Math.max(w, h));
      var tw = Math.max(1, Math.round(w * scale));
      var th = Math.max(1, Math.round(h * scale));

      var canvas = document.createElement('canvas');
      canvas.width = tw;
      canvas.height = th;
      var ctx = canvas.getContext('2d');
      /* 白底：PNG 透明区域在 JPEG 里会变黑，取字会丢字 */
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, tw, th);
      ctx.drawImage(bmp, 0, 0, tw, th);

      var dataUrl;
      try {
        dataUrl = canvas.toDataURL('image/jpeg', O.jpegQuality || 0.86);
      } catch (err) {
        var e2 = new Error('把图片转成可上传格式时失败。');
        e2.code = 'encode_failed';
        throw e2;
      }
      if (!dataUrl || dataUrl.indexOf('data:image/jpeg') !== 0) {
        var e3 = new Error('图片编码失败，换一张试试。');
        e3.code = 'encode_failed';
        throw e3;
      }
      var bytes = Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);

      return {
        ok: true,
        dataUrl: dataUrl,
        width: tw,
        height: th,
        origWidth: w,
        origHeight: h,
        scaled: scale < 1,
        bytes: bytes,
        name: file.name,
        type: file.type || ('image/' + extOf(file.name))
      };
    }).catch(function (err) {
      if (err && err.code) throw err;
      var e = new Error('这张图打不开，可能文件已损坏或格式不受支持。');
      e.code = 'decode_failed';
      throw e;
    });
  }

  function countUnsure(text) {
    var m = String(text || '').match(UNSURE_MARK_RE);
    return m ? m.length : 0;
  }

  function classify(text) {
    var t = String(text || '').trim();
    if (!t) return 'empty';
    if (t.indexOf(NO_TEXT_MARK) !== -1 && t.length < 40) return 'no_text';
    if (t.indexOf(TOO_BLURRY_MARK) !== -1 && t.length < 60) return 'too_blurry';
    return 'text';
  }

  /* 真正发起取字。opts.externalSignal 用于"换图/取消/返回"时作废旧请求。 */
  function recognize(prepared, opts) {
    opts = opts || {};
    var started = Date.now();
    return window.MBBLLM.recognizeImage(prepared.dataUrl, opts).then(function (r) {
      r.elapsedMs = Date.now() - started;
      if (!r.ok) {
        r.hint = hintFor(r);
        return r;
      }
      r.kind = classify(r.text);
      r.unsureCount = countUnsure(r.text);
      r.hint = hintFor(r);
      return r;
    });
  }

  function hintFor(r) {
    if (!r) return '';
    if (r.ok) {
      if (r.kind === 'no_text') return '这张图里没有读到文字。可以换一张更清楚的截图，或者直接粘贴文字。';
      if (r.kind === 'too_blurry') return '这张图太模糊，无法可靠取字。请换一张更清楚的截图，或直接粘贴文字。';
      if (r.unsureCount > 0) return '有 ' + r.unsureCount + ' 处标记为看不清，请对照原图补上或改正。';
      return '';
    }
    if (r.phase === 'no_model') return '当前模型通道没有可用的识图能力，截图识别暂时用不了。可以改用粘贴文字。';
    if (r.phase === 'timeout') return '取字等太久了（超过 ' + Math.round((O.timeoutMs || 60000) / 1000) + ' 秒）。图片还在，可以再试一次，或改用粘贴文字。';
    return '这次没能从图片里取出文字（' + (r.error || '原因未知') + '）。图片还在，可以再试一次，或改用粘贴文字。';
  }

  return {
    limits: O,
    validateFile: validateFile,
    prepare: prepare,
    recognize: recognize,
    classify: classify,
    countUnsure: countUnsure,
    marks: { NO_TEXT: NO_TEXT_MARK, TOO_BLURRY: TOO_BLURRY_MARK }
  };
})();
