# 明白办 · 源码与运行说明

面向长辈的 AI 社区通知行动助手。粘贴社区通知原文，由大语言模型解析为结构化事实，经过程序校验后渲染成一张带原文依据的白话「行动卡」。

- 在线体验：https://mingbaiban-42482.app.workbuddy.host/
- 版本：v1.0.0
- 运行时模型：DeepSeek-V4.1-Flash（经 WorkBuddy 云服务免密钥通道调用）

## 目录结构

```
app/                     可部署的静态站点（产品本体）
  index.html             主页面
  about.html             关于与使用说明
  css/app.css            全部样式
  js/config.js           运行配置（云服务 publicConfig）
  js/llm.js              模型接入与重试
  js/validate.js         结构与引文校验
  js/app.js              页面状态机与渲染
  prompts/system-prompt.txt   产品系统提示词（运行时读取）
  prompts/data-schema.md      数据结构与校验规则说明
tests/
  cases.json             12 条通知用例与参考答案（运行产品前写定）
  evidence/              测试原始记录（完整模型返回、耗时、token）
  shots/                 线上真实界面截图
tools/                   测试执行、截图、PDF/DOCX/视频生成脚本
PROJECT_BRIEF.md         需求基线
REQUIREMENTS.md          要求—产物—证据映射
PROGRESS.md              进度与验收状态
```

## 本地运行

纯静态站点，无构建步骤：

```bash
cd app
python3 -m http.server 8000 --bind 0.0.0.0
# 浏览器打开 http://localhost:8000/
```

**注意**：模型通道按来源（Origin）校验，`file://` 打开或与已登记域名不一致的地址会被服务端拒绝。本地起服务只用于看界面；要验证真实 AI 调用，请访问线上地址。

## 重新测试

```bash
export NODE_PATH=<node_modules 路径>
node tools/run-tests.cjs https://mingbaiban-42482.app.workbuddy.host/
node tools/run-edge-tests.cjs https://mingbaiban-42482.app.workbuddy.host/
```

依赖：Node 22、playwright-core（使用本机 Edge，无需下载浏览器）。

## 重新生成文档与视频

```bash
python tools/make_chart.py        # 技术流程图
python tools/make_docx.py         # 说明书 DOCX
python tools/make_reports.py      # 08/09 报告 HTML
python tools/make_video.py        # 视频 + SRT + 封面 + 分镜时间
```

依赖：Python 3.13、Pillow、python-docx、qrcode、imageio-ffmpeg、pypdf/pymupdf（校验用）。

PDF 由 Edge 打印引擎生成：`tools/to-pdf.cjs`（固定分页）与 `tools/to-pdf-flow.cjs`（流式）。

## 设计约束（改动时请勿破坏）

1. 模型输出必须经 `validate.js` 校验后才能渲染；校验不过最多重试 1 次，仍不过显示失败说明，**不得渲染行动卡**。
2. 所有文本通过 `textContent` 写入 DOM，不使用 `innerHTML`。
3. 缺信息必须显示「通知未说明」，`status=missing` 时 `value` 必须为 `null`。
4. 系统提示词只有 `app/prompts/system-prompt.txt` 一份，不要在代码里另存副本。
5. 不要在前端写入任何长期密钥；`config.js` 里的 `publishableKey` 是公开标识，服务端按 Origin 校验。

## 许可与素材

见交付包内 `12_明白办_工具素材来源与原创记录.md`。产品未使用第三方素材；运行时仅依赖 WorkBuddy 官方 SDK（CDN）。
