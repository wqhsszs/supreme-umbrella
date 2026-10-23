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
  appVersion: "1.2.0-b2",
  promptPath: "./prompts/system-prompt.txt?v=1.2.0-b2",
  maxInputChars: 5000,
  requestTimeoutMs: 45000,
  maxRetries: 1,

  /* 优先选用的模型（按名称片段匹配）。找不到就退到第一个可用模型，
     并把实际使用的模型名如实写在结果页，不假装是某个型号。 */
  preferredModelHints: ["deepseek-v4.1-flash", "deepseek v4.1 flash", "deepseek-v4.1", "deepseek"]
};
