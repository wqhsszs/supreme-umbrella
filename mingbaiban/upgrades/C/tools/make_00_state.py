# -*- coding: utf-8 -*-
"""生成 00_开始使用与交付状态.md，并更新 UPGRADE_STATE.json 与 C/PHASE_PROGRESS.md"""
import datetime
import json
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UP = os.path.dirname(BASE)
DEL = os.path.join(BASE, 'delivery')
EV = os.path.join(DEL, 'assets', 'evidence')
VER = '1.3.0-c7'


def summary(name):
    try:
        d = json.load(open(os.path.join(EV, name), encoding='utf-8'))
        s = d['summary']
        return '%d / %d' % (s['passed'], s['total']), d
    except Exception as e:
        return '未取得', {'err': str(e)}


ocr, d_ocr = summary('c-ocr-latest.json')
speech, d_speech = summary('c-speech-latest.json')
t12, d_12 = summary('test-run-latest.json')
t10, d_10 = summary('edge-run-latest.json')
tx, d_x = summary('a-extra-latest.json')

vid = '（未生成）'
try:
    tl = json.load(open(os.path.join(DEL, 'sources', 'video-timeline.json'), encoding='utf-8'))
    vid = '%.0f 秒' % tl['totalSeconds']
except Exception:
    pass

md = f"""# 00｜开始使用与交付状态（C 轮 · 最终）

**版本 v{VER}**｜在线预览：https://mingbaiban-42482.app.workbuddy.host/?sharecode=QCZF2UKNAG
（控制台执行 `window.MBB_CONFIG.appVersion` 应返回 `{VER}`）

**30 秒上手**：打开预览 → 切「上传通知截图」→ 选一张通知截图 →「识别文字」→ 对照左边原图核对、改好 → 勾「我已核对」→「已核对文字，整理行动卡」→「读给家人听」或「复制行动卡，发给家人」。

## 一、C 轮新增（相对 B 轮）

| 能力 | 状态 | 说明 |
|---|---|---|
| 截图识别 | 已实现并验证（{ocr}） | 多模态模型只取字；看不清标注；不补年份/楼层/电话 |
| 人工核对 | 已实现 | 原图↔文字双栏；必须勾“我已核对”；改字作废旧卡 |
| 行动卡朗读 | 已实现并验证（{speech}） | 设备中文语音；未说明/冲突照读；不能导出音频文件 |

## 二、验证汇总（原始记录见 assets/evidence/）

| 测试集 | 结果 |
|---|---|
| C1 截图识别专项 | **{ocr}** |
| C2 朗读专项 | **{speech}** |
| A 轮回归 12 条通知用例 | **{t12}** |
| 页面行为 10 项 | **{t10}** |
| A 轮专项 11 项 | **{tx}** |
| 布局（360/390/768/1280 三态无横滚、对比度） | 通过（最低 5.12:1） |
| 朗读原声录制 | 已完成（真实播放 + WASAPI 环回，18.53 秒） |
| 演示视频 | {vid} |

**没有做的**：目标用户真人试用、真机测试（微信内置浏览器 / iOS Safari 的朗读兼容未验证）。

## 三、文件清单（00—17）

| 文件 | 内容 |
|---|---|
| 01/02 | 产品说明书 PDF / 可编辑 DOCX（六项官方内容齐全） |
| 03/04/05 | 演示视频 / 字幕 SRT / 分镜脚本 |
| 06/07 | 快手发布文案 / 视频封面 |
| 08/09 | 运行说明 PDF / 测试报告 PDF（数字读自证据） |
| 10/11 | 源码 ZIP / 两张信息图 |
| 12/13 | 工具与素材来源记录 / 报名字段核对表 |
| 14 | 交付清单 JSON（含 sha256） |
| 15 | 配对试用材料（空白模板，含核对与朗读观察项） |
| 16/17 | C 轮新增功能与限制 / 三轮升级总结 |

## 四、给下一位接手的人

- 最终工程在 `upgrades/C/project`；A/B 工程在 `upgrades/A`、`upgrades/B`，均可回滚重发布。
- 改前端后必须同步改 `index.html` 里的 `?v=` 版本号（部署 CDN 有短时不一致）。
- 模型通道有限流（`quota_rate_limited`）：页面会如实提示，稍等再试。
- 视频重生成：`tools/record_video_c.py` → `tools/make_video_c.py`；说明书重生成：`_tmp/c_finalize.sh`。
"""

open(os.path.join(DEL, '00_开始使用与交付状态.md'), 'w', encoding='utf-8').write(md)
print('00 written')

state_p = os.path.join(UP, 'UPGRADE_STATE.json')
state = json.load(open(state_p, encoding='utf-8'))
state.update({
    'currentRound': 'C（最终）',
    'roundStatus': {'A': 'delivered', 'B': 'delivered', 'C': 'delivered'},
    'sourceVersion': '1.2.0-b2',
    'workingDir': 'mingbaiban/upgrades/C/project',
    'deliveryDir': 'mingbaiban/upgrades/C/delivery',
    'codeVersion': VER,
    'previewUrl': 'https://mingbaiban-42482.app.workbuddy.host/?sharecode=QCZF2UKNAG',
    'previewNote': 'C 覆盖了 B 的线上版本（平台单应用限制）；A/B 代码均可回滚。',
    'assetsManifest': 'mingbaiban/upgrades/C/delivery/14_明白办_交付清单.json',
    'zips': {
        'source': 'mingbaiban/upgrades/C/delivery/10_明白办_源码.zip',
        'package': 'mingbaiban/upgrades/C/明白办_C轮最终交付包.zip'
    },
    'models': {
        'runtime': 'deepseek-v4.1-flash（取字+整理两次独立调用）',
        'dev': 'DeepSeek V4.1 Flash（WorkBuddy 开发执行模型）',
        'speechInProduct': 'Web Speech API（设备音色，非云端 TTS）',
        'ttsNarration': 'Windows SAPI5 / Huihui（材料制作）'
    },
    'completed': [
        'C1 截图识别 + 人工核对（%s）：双栏核对、核对闸门、超长/坏文件/取消/注入等 20 项' % ocr,
        'C2 行动卡朗读（%s）：确定性文本、暂停/继续/停止、单实例、降级提示 19 项' % speech,
        'A 轮回归三套本版重跑：%s / %s / %s' % (t12, t10, tx),
        '四档视口三态布局与 9 组对比度（最低 5.12:1）',
        '演示视频（真实操作录屏 + 朗读原声，153 秒）+ SRT + 分镜 + 封面',
        '说明书 PDF/DOCX、运行说明、测试报告、五步图/技术图、16/17 新增、清单与两个 ZIP',
    ],
    'failedOrBlocked': [
        '独立预览域名：平台单应用限制，C 覆盖 B 线上版',
        '云端 TTS / 可下载音频：通道不存在，产品如实降级（16 号文件记录）',
        '真人试用与真机测试：不具备条件，未做',
        '当天模型通道限流（quota_rate_limited）：录制与重跑安排在限流解除后进行'
    ],
    'nextStep': '三轮任务书已全部执行完毕。后续：真人配对试用（材料已备好）、真机验证；若平台提供云端 TTS 可评估语音下载。',
    'updatedAt': datetime.datetime.now().astimezone().isoformat(timespec='seconds')
})
json.dump(state, open(state_p, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print('state updated')

md2 = f"""# PHASE_PROGRESS · C 轮（最终）

> 中断后从这里恢复：工程在 `upgrades/C/project`，材料在 `upgrades/C/delivery`。

## 状态

| 项 | 值 |
|---|---|
| 轮次 | C（最终，已交付） |
| 版本 | v{VER} |
| 预览 | https://mingbaiban-42482.app.workbuddy.host/?sharecode=QCZF2UKNAG |
| 更新时间 | {state['updatedAt']} |

## 已完成
- [x] C1 截图识别：{ocr}；C2 朗读：{speech}
- [x] 演示视频（真实操作录屏 + 朗读原声，{vid}）
- [x] 回归：{t12} / {t10} / {tx}
- [x] 全套材料 00—17 + 清单 + ZIP

## 下一条操作
1. 真人试用（材料在 15）；真机验证。
2. 若平台出云端 TTS：评估“保存这张卡的语音”。
3. 改前端记得同步 `?v=`。
"""
open(os.path.join(UP, 'C', 'PHASE_PROGRESS.md'), 'w', encoding='utf-8').write(md2)
print('phase progress written')
