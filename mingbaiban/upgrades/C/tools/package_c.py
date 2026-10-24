# -*- coding: utf-8 -*-
"""C 轮收尾打包：manifest（含 sha256）、源码 ZIP、参赛交付包 ZIP。"""
import datetime
import hashlib
import json
import os
import zipfile

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEL = os.path.join(BASE, 'delivery')
PROJ = os.path.join(BASE, 'project')
SRC_ZIP = os.path.join(DEL, '10_明白办_源码.zip')
PKG_ZIP = os.path.join(BASE, '明白办_C轮最终交付包.zip')
VER = '1.3.0-c7'


def sha(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()


# ---------- 源码 ZIP ----------
if os.path.exists(SRC_ZIP):
    os.remove(SRC_ZIP)
n = 0
with zipfile.ZipFile(SRC_ZIP, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for root, dirs, files in os.walk(PROJ):
        dirs[:] = [d for d in dirs if d not in ('__pycache__', 'node_modules')]
        for f in files:
            full = os.path.join(root, f)
            rel = os.path.relpath(full, PROJ)
            z.write(full, os.path.join('明白办_C轮源码', rel))
            n += 1
    z.writestr('明白办_C轮源码/README.txt',
               '明白办 C 轮源码\n版本 ' + VER + '\n\n'
               '运行：cd project && python3 -m http.server 8124（仅界面；真实模型调用需线上 Origin）\n'
               '提示词：prompts/system-prompt.txt（整理）、prompts/ocr-prompt.txt（取字）\n'
               'C1 截图识别：js/ocr.js + js/llm.js(recognizeImage)\n'
               'C2 朗读：js/speech.js（Web Speech API，设备音色，不能导出音频）\n'
               '视频/旁白/录屏等大文件未入包，见交付包 assets/。\n')
print('源码 ZIP', n, '文件', round(os.path.getsize(SRC_ZIP) / 1024 / 1024, 2), 'MB')

# ---------- manifest ----------
files = []
for name in sorted(os.listdir(DEL)):
    p = os.path.join(DEL, name)
    if os.path.isfile(p):
        files.append({'name': name, 'path': 'upgrades/C/delivery/' + name,
                      'bytes': os.path.getsize(p), 'sha256': sha(p)})
SKIP_DIRS = {'recordings'}
for sub in ['assets', 'sources', '15_明白办_用户试用材料']:
    for root, dirs, fs in os.walk(os.path.join(DEL, sub)):
        dirs[:] = [x for x in dirs if x not in SKIP_DIRS]
        for f in fs:
            full = os.path.join(root, f)
            rel = os.path.relpath(full, DEL).replace(os.sep, '/')
            files.append({'name': rel, 'path': 'upgrades/C/delivery/' + rel,
                          'bytes': os.path.getsize(full),
                          'sha256': None if f == 'manifest.json' else sha(full)})

video = {}
vp = os.path.join(DEL, '03_明白办_产品演示.mp4')
if os.path.exists(vp):
    import imageio_ffmpeg
    import subprocess
    exe = imageio_ffmpeg.get_ffmpeg_exe()
    r = subprocess.run([exe, '-hide_banner', '-i', vp], capture_output=True, text=True)
    for line in r.stderr.split('\n'):
        if 'Duration' in line:
            video['duration'] = line.split('Duration:')[1].split(',')[0].strip()
        if 'Stream #0:1' in line and 'Audio' in line:
            video['audio'] = 'yes'
    video['seconds'] = None

manifest = {
    'round': 'C（最终）',
    'product': '明白办 — 面向长辈的 AI 社区通知行动助手',
    'version': VER,
    'baseline': 'A v1.1.0-a3 / B v1.2.0-b2',
    'generatedAt': datetime.datetime.now().astimezone().isoformat(timespec='seconds'),
    'previewUrl': 'https://mingbaiban-42482.app.workbuddy.host/?sharecode=QCZF2UKNAG',
    'applicationId': 'wbapp_iiPVrUTJJSCc0MurWICMde',
    'runtimeModel': 'deepseek-v4.1-flash（取字与整理两次独立调用，WorkBuddy 云服务通道）',
    'speech': 'Web Speech API（设备音色，非云端 TTS，不能导出音频）',
    'ttsNarration': 'Windows SAPI5 / Microsoft Huihui（材料制作用）',
    'imageTool': '沿用 B 轮 ImageGen 插画 5 张（C 轮未新增）',
    'video': video,
    'note': '平台把同工作区发布指向同一应用：C 覆盖了 B 的线上版本；A/B 代码可回滚。',
    'fileCount': len(files),
    'files': files,
    'zips': {
        'source': {'name': '10_明白办_源码.zip', 'bytes': os.path.getsize(SRC_ZIP), 'sha256': sha(SRC_ZIP)},
    }
}
ph = os.path.join(DEL, 'assets', 'recordings', 'phases.json')
if os.path.exists(ph):
    files.append({'name': 'assets/recordings/phases.json', 'path': 'upgrades/C/delivery/assets/recordings/phases.json',
                  'bytes': os.path.getsize(ph), 'sha256': sha(ph),
                  'note': '录屏分镜与时间轴（约 6000 张原始帧未入包，避免体积膨胀）'})
json.dump(manifest, open(os.path.join(DEL, '14_明白办_交付清单.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, indent=2)
print('manifest', len(files), '项')

# ---------- 交付包 ZIP ----------
if os.path.exists(PKG_ZIP):
    os.remove(PKG_ZIP)
m = 0
with zipfile.ZipFile(PKG_ZIP, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for root, dirs, fs in os.walk(DEL):
        dirs[:] = [x for x in dirs if x not in SKIP_DIRS]
        for f in fs:
            full = os.path.join(root, f)
            z.write(full, os.path.join('明白办_C轮交付包', os.path.relpath(full, DEL)))
            m += 1
print('交付包', m, '文件', round(os.path.getsize(PKG_ZIP) / 1024 / 1024, 2), 'MB')
