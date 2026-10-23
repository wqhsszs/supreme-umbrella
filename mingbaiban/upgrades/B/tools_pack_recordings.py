# -*- coding: utf-8 -*-
"""把录屏帧压缩为一个原始录屏 MP4，并清理帧目录"""
import os, subprocess, json, shutil
import imageio_ffmpeg

BASE = os.path.dirname(os.path.abspath(__file__))
REC = os.path.join(BASE, 'delivery', 'assets', 'recordings')
exe = imageio_ffmpeg.get_ffmpeg_exe()

phases = json.load(open(os.path.join(REC, 'phases.json'), encoding='utf-8'))['phases']
tmp = os.path.join(REC, '_concat.txt')
lines = []
for p in phases:
    d = os.path.join(REC, p['name'])
    if not os.path.isdir(d):
        continue
    for f in sorted(os.listdir(d)):
        full = os.path.join(d, f)
        lines.append("file '" + full.replace(os.sep, '/') + "'")
        lines.append("duration 0.1")
open(tmp, 'w', encoding='utf-8').write('\n'.join(lines))

out = os.path.join(REC, 'recording-raw.mp4')
subprocess.run([exe, '-y', '-hide_banner', '-loglevel', 'error',
                '-f', 'concat', '-safe', '0', '-i', tmp,
                '-vf', 'scale=390:-2', '-c:v', 'libx264', '-preset', 'veryfast',
                '-crf', '26', '-pix_fmt', 'yuv420p', '-r', '10', out], check=True)
os.remove(tmp)
print('原始录屏', round(os.path.getsize(out) / 1024 / 1024, 2), 'MB')

for p in phases:
    shutil.rmtree(os.path.join(REC, p['name']), ignore_errors=True)
print('剩余', os.listdir(REC))

# 顺带清掉视频中间帧目录（体积大，成品已生成）
vf = os.path.join(BASE, 'delivery', 'assets', 'video')
for sub in ['frames', 'check', 'check2']:
    shutil.rmtree(os.path.join(vf, sub), ignore_errors=True)
print('video 目录', os.listdir(vf))
