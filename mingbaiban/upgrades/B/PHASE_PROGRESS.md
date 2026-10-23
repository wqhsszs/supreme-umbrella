# PHASE_PROGRESS · B 轮

> 中断后从这里恢复：直接用 `upgrades/B/project`，不要重建。

## 状态

| 项 | 值 |
|---|---|
| 轮次 | B（已交付） |
| 版本 | v1.2.0-b2 |
| 工程 | `mingbaiban/upgrades/B/project` |
| 交付 | `mingbaiban/upgrades/B/delivery` |
| 预览 | https://mingbaiban-42482.app.workbuddy.host/?sharecode=QCZF2UKNAG |
| 更新时间 | 2026-10-23T21:08:17+08:00 |

## 已完成

- [x] 3 张叙事插画 + 2 张信息图（四步图 / 技术图）
- [x] 10 段旁白（SAPI5 Huihui），先音频后画面
- [x] 7 段真实录屏（CDP），成片 119.7 秒、有音轨
- [x] 说明书 10 页 PDF + 同源 DOCX（10 图）
- [x] 封面、发布文案、运行说明、测试报告、来源记录、报名表、配对试用模板
- [x] b2 重跑 12/12、10/10、11/11
- [x] 两个 ZIP 解包校验；清单 81 项含哈希

## 未完成 / 阻塞

| 项 | 原因 | 归属 |
|---|---|---|
| 独立预览域名 | 平台单应用限制 | 平台 |
| 云端 TTS | 无可用通道，用系统 SAPI5 代替 | — |
| OCR / 朗读 | 属 C 轮 | 下一轮 |
| 真人试用 / 真机 | 无用户与设备 | 人工 |

## 下一条具体操作

1. 若要恢复 A 或原版线上：用 `upgrades/A/project` 或 `mingbaiban/app` 重新发布（同应用同域名）。
2. 继续 C 轮：拖入 `03_C轮_截图识别与产品朗读升级.txt`，以 `upgrades/B/project` 为基线。
3. 改前端后必须同步改 `index.html` 里的 `?v=`，否则 HTML/JS 版本会错位。
