# -*- coding: utf-8 -*-
"""生成 05 视频脚本与分镜（界面分镜版，如实标注）。"""
import json
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEL = os.path.join(BASE, 'delivery')
TL = json.load(open(os.path.join(DEL, 'sources', 'video-timeline.json'), encoding='utf-8'))
CAP = json.load(open(os.path.join(DEL, 'sources', 'narration.json'), encoding='utf-8'))
capmap = {s['id']: s['text'] for s in CAP['segments']}
capmap['S7s'] = '想给长辈听，就点「读给家人听」。这是这台设备自带的中文语音，不是云端配音。声音能不能听清，目前还没有真人试听记录。'

KIND = {
    '收到通知': '真实界面截图',
    '上传截图': '真实界面截图',
    '取字与核对': '真实界面截图（核对文本为真实取字结果）',
    '勾选已核对': '真实界面截图',
    '行动卡': '真实界面截图（固定已校验数据渲染）',
    '原文依据': '真实界面截图',
    '读给家人听': '真实界面截图（朗读状态为注入引擎演示）',
    '缺信息': '真实界面截图（固定已校验数据渲染）',
    '冲突提醒': '真实界面截图（固定已校验数据渲染）',
    '限制说明': 'AI 插画收尾',
}

L = []
L.append('# 05｜明白办 产品演示视频 · 脚本与分镜（C 轮 · 界面分镜版）\n')
L.append('> 成片：`03_明白办_产品演示.mp4`｜1080×1920 竖版｜**%.0f 秒**｜H.264(yuv420p) + AAC｜15fps\n' % TL['totalSeconds'])
L.append('> 字幕：`04_明白办_视频字幕.srt`\n')
L.append('> 旁白：Windows 系统语音合成（SAPI5 / Microsoft Huihui）；**非云端 TTS，未克隆真人声音**。\n')
L.append('''
> **这一版是什么、不是什么（务必先读）**
> - 是：真实产品界面的分镜演示（含真实取字文本），配系统语音旁白，完整讲清"截图 → 取字 → 核对 → 行动卡 → 朗读 → 边界"。
> - 不是：连续操作录屏。录制当天模型通道持续限流/403，无法完成"上传→识别→整理→朗读"的连续实操录制。
> - 也不含：产品朗读原声。原声录制需要真实卡片，同样被通道阻塞；片中不播放任何模拟朗读音效。
> - 每帧底部都标注"界面分镜 · 非连续录屏"，不会让观众误以为是实时操作。
''')
L.append('\n## 一、逐镜\n')
L.append('| # | 时间码 | 时长 | 画面 | 旁白 / 字幕 |')
L.append('|---|---|---|---|---|')

mm = lambda x: '%02d:%05.2f' % (int(x // 60), x % 60)
for i, it in enumerate(TL['timeline'], 1):
    sid = it['audio'].replace('.wav', '')
    L.append('| %d | %s—%s | %.1fs | %s | %s |'
             % (i, mm(it['start']), mm(it['start'] + it['duration']), it['duration'],
                KIND.get(it['label'], '真实界面截图'), capmap.get(sid, '')))

L.append('''
## 二、与 C 轮任务书的差距（如实）

| 任务书要求 | 本版情况 |
|---|---|
| 30—180 秒、含独立 AI 旁白 | 满足（%.0f 秒，SAPI 旁白） |
| 展示"截图 → 核对识别文字 → 行动卡 → 朗读" | 画面与旁白都覆盖，但是**截图分镜**，不是连续录屏 |
| 产品朗读片段与旁白错开 | 本版没有朗读片段（未录制成功），因此不存在重叠 |
| 不机械加长旧片 | 重新制作，未复用 B 轮画面 |

**如何补成真正的连续录屏版**：通道恢复后运行
`python tools/record_video_c.py`（有界面 Edge + WASAPI 环回，约 3 分钟）→
`python tools/make_video_c.py`（合成 03/04/05）。
脚本、分镜、旁白都已就绪，只差模型通道可用。
''' % TL['totalSeconds'])
open(os.path.join(DEL, '05_明白办_视频脚本与分镜.md'), 'w', encoding='utf-8').write('\n'.join(L))
print('storyboard (stills) written')
