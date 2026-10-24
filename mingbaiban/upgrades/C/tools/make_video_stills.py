# -*- coding: utf-8 -*-
"""界面分镜版演示视频（模型通道不可用时的保底）

诚实边界（片中与材料里都写明）：
- 画面是**真实产品界面截图**（含真实核对文本），按分镜缓慢推近，不是连续操作录屏；
- 旁白为 Windows SAPI5 系统语音；**不含产品朗读原声**（未录制成功）；
- 每帧底部标注"界面分镜 · 非连续录屏"，不冒充实时操作。

输出：03_明白办_产品演示.mp4（1080×1920）、04_…srt
"""
import contextlib
import json
import os
import subprocess
import wave

import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFont

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEL = os.path.join(BASE, 'delivery')
AU = os.path.join(DEL, 'assets', 'audio')
SHOT = os.path.join(DEL, 'assets', 'screenshots')
ILL = os.path.join(DEL, 'assets', 'illustrations')
OUT = os.path.join(DEL, '03_明白办_产品演示.mp4')
SRT = os.path.join(DEL, '04_明白办_视频字幕.srt')
TMP = os.path.join(BASE, '_tmp')
os.makedirs(TMP, exist_ok=True)

FF = imageio_ffmpeg.get_ffmpeg_exe()
W, H, FPS = 1080, 1920, 15
FB = 'C:/Windows/Fonts/msyhbd.ttc'
FR = 'C:/Windows/Fonts/msyh.ttc'
PAPER = (247, 243, 235)
INK = (38, 49, 44)
GREY = (93, 106, 99)
GREEN = (37, 76, 64)
ACCENT = (143, 67, 34)
f = lambda p, s: ImageFont.truetype(p, s)

# (截图, 音频, 标题, 是否尾卡)
PLAN = [
    ('c-01-home-390.png', 'S1.wav', '收到通知', False),
    ('c-02-upload-390.png', 'S2.wav', '上传截图', False),
    ('c-03-review-390.png', 'S3.wav', '取字与核对', False),
    ('c-04-reviewed-390.png', 'S4.wav', '勾选已核对', False),
    ('c-05-result-390.png', 'S5.wav', '行动卡', False),
    ('c-06-evidence-390.png', 'S6.wav', '原文依据', False),
    ('c-07-speech-390.png', 'S7s.wav', '读给家人听', False),
    ('c-08-missing-390.png', 'S9a.wav', '缺信息', False),
    ('c-09-conflict-390.png', 'S9b.wav', '冲突提醒', False),
    (None, 'S10.wav', '限制说明', True),
]
CAPTION = {
    'S1.wav': '社区发来一张通知截图。报名时间、活动时间、两处地点，全挤在一张图里。',
    'S2.wav': '打开明白办，不用照着打一遍，直接把截图传上去。图片会发给识图模型，把文字读出来。',
    'S3.wav': '几秒后，左边是原图，右边是取出来的文字。看不清的地方它会标出来，不会猜。这里要自己对着图看一遍。',
    'S4.wav': '改好文字，勾上“我已核对”，再点整理。勾的是“我核对过”，不是“社区认证过”。',
    'S5.wav': '卡片出来了。报名截止和活动开始分开写，一楼报名、二楼参加，地点也分开挂。',
    'S6.wav': '每一项都能点开，对照核对后的文字，看通知里的原句。',
    'S7s.wav': '想给长辈听，就点“读给家人听”。这是这台设备自带的中文语音，不是云端配音。声音能不能听清，目前还没有真人试听记录。',
    'S9a.wav': '通知没写地点，卡片就写“通知未说明”，不替它补。',
    'S9b.wav': '两处时间对不上，最上面会提醒先问清楚，再安排。',
    'S10.wav': '明白办目前只用文字和截图，没做真机测试，也没有长辈试用记录。它只做一件事：把通知说清楚，去不去，由长辈自己定。',
}


def dur(p):
    with contextlib.closing(wave.open(p, 'rb')) as w:
        return w.getnframes() / float(w.getframerate())


def wrap(d, text, font, maxw):
    lines, cur = [], ''
    for ch in text:
        if d.textbbox((0, 0), cur + ch, font=font)[2] > maxw and cur:
            lines.append(cur)
            cur = ch
        else:
            cur += ch
    if cur:
        lines.append(cur)
    return lines


def header(img, label):
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([62, 54, 120, 112], radius=16, fill=GREEN)
    d.text((76, 62), '明', font=f(FB, 36), fill=(255, 255, 255))
    d.text((136, 58), '明白办', font=f(FB, 38), fill=INK)
    d.text((136, 106), '把社区通知整理成行动卡', font=f(FR, 22), fill=GREY)
    tw = d.textlength(label, font=f(FB, 24))
    d.text((W - 62 - tw, 70), label, font=f(FB, 24), fill=ACCENT)


def caption(img, text):
    d = ImageDraw.Draw(img)
    size = 38
    for s in (38, 35, 32, 29):
        font = f(FB, s)
        lines = wrap(d, text, font, W - 180)
        if len(lines) <= 3:
            size = s
            break
    font = f(FB, size)
    lh = int(size * 1.42)
    h = lh * len(lines) + 40
    top = 1740 - h
    d.rounded_rectangle([80, top, W - 80, 1740], radius=20, fill=(24, 32, 28))
    for i, ln in enumerate(lines):
        lw = d.textbbox((0, 0), ln, font=font)[2]
        d.text(((W - lw) / 2, top + 20 + i * lh), ln, font=font, fill=(255, 255, 255))
    note = '界面分镜 · 非连续录屏（模型通道限流期间制作）'
    nw = d.textbbox((0, 0), note, font=f(FR, 21))[2]
    d.text(((W - nw) / 2, 1756), note, font=f(FR, 21), fill=ACCENT)


def build_frame(shot_path, label, cap, zoom):
    img = Image.new('RGB', (W, H), PAPER)
    header(img, label)
    if shot_path:
        shot = Image.open(shot_path).convert('RGB')
        # 裁出手机长图的上半部分（截图是 390x844 * 2）
        sw, sh = shot.size
        maxw, maxh = 880, 1330
        sc = min(maxw / sw, maxh / sh)
        base = shot.resize((int(sw * sc), int(sh * sc)), Image.LANCZOS)
        # 缓慢推近
        z = 1.0 + 0.05 * zoom
        cw, chh = int(base.width / z), int(base.height / z)
        x = (base.width - cw) // 2
        y = max(0, int((base.height - chh) * 0.25))
        base = base.crop((x, y, x + cw, y + chh)).resize((int(sw * sc), int(sh * sc)), Image.LANCZOS)
        mask = Image.new('L', base.size, 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, base.width, base.height], radius=24, fill=255)
        px, py = (W - base.width) // 2, 172
        ImageDraw.Draw(img).rounded_rectangle([px + 8, py + 12, px + base.width + 8, py + base.height + 12],
                                              radius=24, fill=(226, 219, 205))
        img.paste(base, (px, py), mask)
    caption(img, cap)
    return img


def end_card(cap):
    img = Image.new('RGB', (W, H), PAPER)
    art = Image.open(os.path.join(ILL, 'hero-family.png')).convert('RGB')
    sc = W / art.width
    art = art.resize((W, int(art.height * sc)), Image.LANCZOS)
    img.paste(art, (0, 250))
    d = ImageDraw.Draw(img)
    d.text((80, 100), '明白办', font=f(FB, 60), fill=GREEN)
    d.text((80, 182), '把社区通知，整理成家人看得懂的行动卡', font=f(FR, 30), fill=(69, 81, 74))
    caption(img, cap)
    return img


def ts(t):
    h, m, s = int(t // 3600), int(t % 3600 // 60), t % 60
    return ('%02d:%02d:%06.3f' % (h, m, s)).replace('.', ',')


if __name__ == '__main__':
    parts, timeline = [], []
    total = 0.0
    for shot, aud, label, is_end in PLAN:
        a = os.path.join(AU, aud)
        d = max(4.0, dur(a) + 0.9)
        out = os.path.join(TMP, 'stills-' + aud)
        subprocess.run([FF, '-y', '-hide_banner', '-loglevel', 'error', '-i', a,
                        '-af', 'apad', '-t', '%.2f' % d, '-ar', '44100', '-ac', '1', out], check=True)
        parts.append(out)
        timeline.append({'aud': aud, 'label': label, 'dur': d, 'start': total, 'shot': shot, 'end': is_end})
        total += d

    lst = os.path.join(TMP, 'stills-audio.txt')
    with open(lst, 'w', encoding='utf-8') as fh:
        for p in parts:
            fh.write("file '%s'\n" % p.replace('\\', '/'))
    audio = os.path.join(TMP, 'stills-final.wav')
    subprocess.run([FF, '-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0',
                    '-i', lst, '-ar', '44100', '-ac', '1', audio], check=True)

    ff = subprocess.Popen([FF, '-y', '-hide_banner', '-loglevel', 'error',
                           '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '%dx%d' % (W, H),
                           '-r', str(FPS), '-i', '-', '-i', audio,
                           '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p',
                           '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', OUT],
                          stdin=subprocess.PIPE)
    subs = []
    for it in timeline:
        n = max(1, int(round(it['dur'] * FPS)))
        for k in range(n):
            zoom = k / max(1, n - 1)
            if it['end']:
                img = end_card(CAPTION[it['aud']])
            else:
                img = build_frame(os.path.join(SHOT, it['shot']), it['label'], CAPTION[it['aud']], zoom)
            ff.stdin.write(img.tobytes())
        subs.append((it['start'], it['start'] + it['dur'], CAPTION[it['aud']]))
    ff.stdin.close()
    ff.wait()

    with open(SRT, 'w', encoding='utf-8') as fh:
        for i, (a, b, t) in enumerate(subs, 1):
            fh.write('%d\n%s --> %s\n%s\n\n' % (i, ts(a), ts(b), t))
    json.dump({'mode': 'stills', 'totalSeconds': round(total, 2),
               'timeline': [{'label': x['label'], 'audio': x['aud'], 'start': round(x['start'], 2),
                             'duration': round(x['dur'], 2)} for x in timeline]},
              open(os.path.join(DEL, 'sources', 'video-timeline.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=2)
    print('stills video done:', round(total, 2), 's', round(os.path.getsize(OUT) / 1024 / 1024, 2), 'MB')
