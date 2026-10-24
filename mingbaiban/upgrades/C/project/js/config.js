/* 明白办 · 运行配置
 *
 * 这里的三个值来自 WorkBuddy 云服务激活返回的 publicConfig。
 * 它们是"可以放在前端"的公开配置：publishableKey 只标识是哪个应用，
 * 本身不带权限，服务端会做来源（Origin）校验。
 * 任何长期密钥、模型提供方密钥都不得写入本文件。
 */
window.MBB_CONFIG = {
  /* 由 WorkBuddy 云服务激活返回的 publicConfig 写入（2026-10-23）。
     这三个值是"可以放在前端"的公开配置：publishableKey 只标识是哪个应用，
     本身不带权限，服务端会做来源（Origin）校验。 */
  endpoint: "https://mingbaiban-42482.app.workbuddy.host",
  publishableKey: "wbpk_iiPVrUTJJSCc0MurWICMde_aQYnffZef28IDjupdlDOFLAh2G6VG9Ya",
  oauthRelayBaseUrl: "https://www.workbuddy.cn/v2/as/genie-baas/oauth",

  /* 产品运行参数 */
  appName: "明白办",
  appVersion: "1.3.0-c7",
  promptPath: "./prompts/system-prompt.txt?v=1.3.0-c7",
  ocrPromptPath: "./prompts/ocr-prompt.txt?v=1.3.0-c7",
  maxInputChars: 5000,
  requestTimeoutMs: 45000,
  maxRetries: 1,

  /* 截图识别（C 轮）。这些边界是产品自己设的限制，不是模型能力上限：
     模型上下文足够大，但一张手机截图缩到 1600px 后已经足够取字，
     再大只会拖慢上传。 */
  ocr: {
    maxBytes: 8 * 1024 * 1024,          /* 8 MB */
    maxEdge: 1600,                      /* 长边缩放到 1600px */
    jpegQuality: 0.86,
    timeoutMs: 60000,
    maxRetries: 1,
    acceptTypes: ["image/jpeg", "image/png", "image/webp"],
    acceptExt: ["jpg", "jpeg", "png", "webp"],
    /* 只在这个范围内挑识图模型：必须 supportsImages === true。
       2026-10-24：deepseek-v4.1-flash 对该应用持续 403（模型列表正常），改用可用的多模态模型。 */
    modelHints: ["minimax-m3.1-flash", "kimi-k2.6", "glm-5.3-flash"]
  },

  /* 朗读（C 轮）：浏览器 Web Speech API，声音来自设备，不是云端 TTS。
     语速略慢于默认，便于听清数字。 */
  speech: {
    rate: 0.92,
    pitch: 1,
    volume: 1,
    voiceHints: ["xiaoxiao", "xiaoyi", "huihui", "yaoyao", "kangkang", "tingting", "meijia", "sinji"]
  },

  /* 优先选用的模型（按名称片段匹配）。找不到就退到第一个可用模型，
     并把实际使用的模型名如实写在结果页，不假装是某个型号。 */
  preferredModelHints: ["minimax-m3.1-flash", "kimi-k2.6", "glm-5.3-flash"]
};
