# -*- coding: utf-8 -*-
"""B 轮成片合成：插画 + 真实录屏 + AI 旁白 + 字幕，输出 1080×1920 MP4"""
import json, os, subprocess, wave, contextlib, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import imageio_ffmpeg

BASE = os.path.dirname(os.path.abspath(__file__))
DEL = os.path.join(BASE, 'delivery')
AU = os.path.join(DEL, 'assets', 'audio')
REC = os.path.join(DEL, 'assets', 'recordings')
ILL = os.path.join(DEL, 'assets', 'illustrations')
SRC = os.path.join(DEL, 'sources')
os.makedirs(os.path.join(DEL, 'assets', 'video'), exist_ok=True)
TMP = os.path.join(DEL, 'assets', 'video', 'frames')
os.makedirs(TMP, exist_ok=True)

W, H = 1080, 1920
FPS = 15
FB = "C:/Windows/Fonts/msyhbd.ttc"
FR = "C:/Windows/Fonts/msyh.ttc"
f = lambda p, s: ImageFont.truetype(p, s)
PAPER = (247, 243, 235)
INK = (38, 49, 44)
INK2 = (69, 81, 74)
GREY = (93, 106, 99)
GREEN = (37, 76, 64)
ACCENT = (143, 67, 34)

def wrap(d, text, font, maxw):
    lines, cur = [], ""
    for ch in text:
        if d.textbbox((0, 0), cur + ch, font=font)[2] > maxw and cur:
            lines.append(cur); cur = ch
        else:
            cur += ch
    if cur: lines.append(cur)
    return lines

def base():
    return Image.new("RGB", (W, H), PAPER)

def header(img, step, title):
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([56, 52, 136, 132], radius=14, fill=GREEN)
    d.text((56 + 40 - d.textbbox((0, 0), "明", font=f(FB, 42))[2] / 2, 66), "明", font=f(FB, 42), fill=(255, 255, 255))
    d.text((152, 56), "明白办", font=f(FB, 34), fill=INK)
    if step:
        tw = d.textbbox((0, 0), step, font=f(FB, 22))[2]
        d.rounded_rectangle([W - 56 - tw - 40, 62, W - 56, 112], radius=25, fill=(231, 238, 233))
        d.text((W - 56 - tw - 20, 74), step, font=f(FB, 22), fill=GREEN)
    if title:
        d.text((56, 168), title, font=f(FB, 44), fill=INK)

def caption(img, text, bottom=1780):
    """字幕：按可用宽度自动降字号，最多 3 行，保证不截断。"""
    d = ImageDraw.Draw(img)
    for size in (40, 37, 34, 31, 28):
        font = f(FB, size)
        lines = wrap(d, text, font, W - 150)
        if len(lines) <= 3:
            break
    lh = int(size * 1.42)
    h = lh * len(lines) + 40
    top = bottom - h
    d.rounded_rectangle([50, top, W - 50, bottom], radius=20, fill=(24, 32, 28))
    for i, ln in enumerate(lines):
        w = d.textbbox((0, 0), ln, font=font)[2]
        d.text(((W - w) / 2, top + 20 + i * lh), ln, font=font, fill=(255, 255, 255))

def progress(img, p):
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([56, H - 44, W - 56, H - 38], radius=3, fill=(214, 205, 189))
    if p > 0:
        d.rounded_rectangle([56, H - 44, 56 + int((W - 112) * p), H - 38], radius=3, fill=GREEN)
    d.text((56, H - 32), "明白办 · 2026 iCAN × 快手 AI 未来创造者挑战赛 · AI 产品实现", font=f(FR, 18), fill=GREY)

def paste_photo(img, im, cy, maxh, radius=24):
    ww = int(im.size[0] * maxh / im.size[1])
    if ww > W - 120:
        ww = W - 120
        maxh = int(im.size[1] * ww / im.size[0])
    im = im.resize((ww, maxh), Image.LANCZOS)
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, ww - 1, maxh - 1], radius=radius, fill=255)
    sh = Image.new("RGBA", (ww + 60, maxh + 60), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([30, 30, ww + 29, maxh + 29], radius=radius, fill=(40, 60, 50, 60))
    sh = sh.filter(ImageFilter.GaussianBlur(14))
    x, y = (W - ww) // 2, cy - maxh // 2
    img.paste(Image.new("RGB", sh.size, PAPER), (x - 30, y - 26), sh.split()[3])
    img.paste(im, (x, y), mask)
    return y + maxh

# ---------------- 段落定义 ----------------
tim = json.load(open(os.path.join(AU, 'audio-timing.json'), encoding='utf-8'))
GAP = tim['gapSeconds']
segs = {s['seg']: s for s in tim['segments']}

# (id, 类型, 资源, 文字, step, 标题)
PLAN = [
    ('S1', 'illu', 'notice-arrived.png',  '第 1 步 收到通知', '一条通知，两个时间，两处地点'),
    ('S2', 'illu', 'checking-together.png', '第 2 步 一起核对', '家人先整理，长辈自己决定'),
    ('S3', 'rec',  'P1-paste',   '第 3 步 AI 整理', '贴进原文，点“整理成行动卡”'),
    ('S4', 'rec',  'P2-result',  '第 3 步 AI 整理', '先说要办什么，再说谁适用'),
    ('S5', 'rec',  'P3-evidence','第 4 步 核对原文', '两处地点分开写，逐项可对照'),
    ('S7', 'rec',  'P4-check',   '第 5 步 准备', '要带的东西打勾，不等于已报名'),
    ('S8', 'rec',  'P5-copy',    '第 6 步 转给家人', '整张卡复制，缺失提醒一起带走'),
    ('S6a','rec',  'P6-missing', '边界：没写就说没写', '原文没有的，标“通知未说明”'),
    ('S6b','rec',  'P7-conflict','边界：冲突先确认', '前后不一致，最上面先提醒'),
    ('S9', 'illu', 'leaving-ready.png', '最后', '把通知整理清楚，让人自己决定'),
]

phases = {p['name']: p for p in json.load(open(os.path.join(REC, 'phases.json'), encoding='utf-8'))['phases']}

# 每段时长 = 旁白时长 + 间隙（最后一段不加）
# 个别段录屏比旁白长（模型响应慢），补一点静音，避免把画面压得太快
PAD = {'S6b': 3.2}
durs = []
for i, (sid, *_rest) in enumerate(PLAN):
    base_s = segs[sid]['seconds'] + (GAP if i < len(PLAN) - 1 else 0) + PAD.get(sid, 0)
    durs.append(base_s)

total = sum(durs)
n_frames = int(round(total * FPS))
print('总时长 %.2fs，帧数 %d' % (total, n_frames))

# ---------------- 逐帧渲染 → ffmpeg ----------------
ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
mp4_silent = os.path.join(DEL, 'assets', 'video', 'silent.mp4')
cmd = [ffmpeg, '-y', '-hide_banner', '-loglevel', 'error',
       '-f', 'image2pipe', '-vcodec', 'mjpeg', '-r', str(FPS), '-i', '-',
       '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p', '-r', str(FPS), mp4_silent]
proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)

# 预加载录屏帧列表
rec_frames = {}
for sid, kind, res, *_ in PLAN:
    if kind == 'rec':
        d = os.path.join(REC, res)
        files = sorted(os.listdir(d))
        rec_frames[res] = [os.path.join(d, x) for x in files]

# 结束卡
try:
    import qrcode
    QR = qrcode.make('https://mingbaiban-42482.app.workbuddy.host/').convert('RGB').resize((300, 300), Image.NEAREST)
except Exception:
    QR = None

elapsed = 0.0
for idx, (sid, kind, res, step, title) in enumerate(PLAN):
    dur = durs[idx]
    frames_in_seg = int(round(dur * FPS))
    text = segs[sid]['text']
    start_t = elapsed
    for k in range(frames_in_seg):
        t = start_t + k / FPS
        p = t / total
        img = base()
        header(img, step, title)
        if kind == 'illu':
            im = Image.open(os.path.join(ILL, res)).convert('RGB')
            paste_photo(img, im, 1000, 1150, radius=20)
        else:
            files = rec_frames[res]
            # 段落内的相对进度，按帧序均匀取样
            pos = (k / max(1, frames_in_seg - 1)) * (len(files) - 1)
            fp = files[int(round(pos))]
            im = Image.open(fp).convert('RGB')
            paste_photo(img, im, 1010, 1330, radius=26)
        caption(img, text)
        progress(img, p)
        img.save(proc.stdin, 'JPEG', quality=88, subsampling=1)
    elapsed += dur

# 片尾卡：替换最后 6 秒
proc.stdin.close()
proc.wait()
print('静音视频完成', round(os.path.getsize(mp4_silent)/1024/1024, 2), 'MB')

# ---------------- 音频拼接 ----------------
audio_out = os.path.join(AU, 'voiceover-full.wav')
params = None
with contextlib.closing(wave.open(os.path.join(AU, segs[PLAN[0][0]]['file']), 'rb')) as w0:
    params = w0.getparams()
out = wave.open(audio_out, 'wb')
out.setnchannels(params.nchannels); out.setsampwidth(params.sampwidth); out.setframerate(params.framerate)
silence = b'\x00' * int(params.framerate * GAP) * params.sampwidth * params.nchannels
for i, (sid, *_r) in enumerate(PLAN):
    with contextlib.closing(wave.open(os.path.join(AU, segs[sid]['file']), 'rb')) as r:
        out.writeframes(r.readframes(r.getnframes()))
    if i < len(PLAN) - 1:
        out.writeframes(silence)
    if PLAN[i][0] in PAD:
        out.writeframes(b'\x00' * int(params.framerate * PAD[PLAN[i][0]]) * params.sampwidth * params.nchannels)
out.close()
with contextlib.closing(wave.open(audio_out, 'rb')) as r:
    adur = r.getnframes() / float(r.getframerate())
print('旁白总长 %.2fs' % adur)

# ---------------- 合成音轨 ----------------
final = os.path.join(DEL, '03_明白办_产品演示.mp4')
cmd2 = [ffmpeg, '-y', '-hide_banner', '-loglevel', 'error',
        '-i', mp4_silent, '-i', audio_out,
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-ar', '44100',
        '-shortest', '-movflags', '+faststart', final]
subprocess.run(cmd2, check=True)
print('成片', round(os.path.getsize(final)/1024/1024, 2), 'MB')

# ---------------- SRT ----------------
def ts(t):
    h = int(t // 3600); m = int((t % 3600) // 60); s = t % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}".replace('.', ',')

srt, e = [], 0.0
for i, (sid, *_r) in enumerate(PLAN, 1):
    d = segs[sid]['seconds']
    srt.append(f"{i}\n{ts(e)} --> {ts(e + d)}\n{segs[sid]['text']}\n")
    e += d + GAP + PAD.get(sid, 0)
open(os.path.join(DEL, '04_明白办_视频字幕.srt'), 'w', encoding='utf-8').write('\n'.join(srt))
print('SRT', len(srt), '条')

json.dump({'totalSeconds': round(total, 2), 'fps': FPS, 'segments': [
    {'id': sid, 'kind': kind, 'resource': res, 'title': title, 'start': round(sum(durs[:i]), 2),
     'duration': round(d, 2), 'text': segs[sid]['text']}
    for i, (sid, kind, res, step, title) in enumerate(PLAN)]},
    open(os.path.join(SRC, 'video-timeline.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print('timeline json ok')
