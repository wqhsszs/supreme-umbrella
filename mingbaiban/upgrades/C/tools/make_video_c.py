# -*- coding: utf-8 -*-
"""C 轮：录屏 + 产品朗读原声 + 旁白 → 1080×1920 演示视频

流程：
1) 启动 WASAPI 环回录音；
2) 跑 tools_record_c.cjs（有界面 Edge，CDP 抓帧），期间产品会真实朗读一段；
3) 从环回录音里按 speakStart/speakEnd 裁出产品朗读原声；
4) 逐段拼旁白/原声 → 按分镜时长铺帧 → 合成 MP4 + SRT。

诚实边界：
- 视频里朗读那一段是这台机器上真实播放、真实录下来的声音，不是另找 TTS 合成后冒充；
- 该段只截取约 18 秒，画面上有说明，不是完整卡片朗读（完整朗读见 16 号文件与测试记录）。
"""
import contextlib
import json
import os
import subprocess
import wave

import pyaudiowpatch as pa
import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFont

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEL = os.path.join(BASE, 'delivery')
AU = os.path.join(DEL, 'assets', 'audio')
REC = os.path.join(DEL, 'assets', 'recordings')
ILL = os.path.join(DEL, 'assets', 'illustrations')
TMP = os.path.join(BASE, '_tmp')
TMP_FRAMES = os.path.join(TMP, 'video-frames')
RAW = os.path.join(TMP, 'video-raw.wav')
OUT = os.path.join(DEL, '03_明白办_产品演示.mp4')
os.makedirs(TMP_FRAMES, exist_ok=True)

FF = imageio_ffmpeg.get_ffmpeg_exe()
W, H, FPS = 1080, 1920, 15
FB = 'C:/Windows/Fonts/msyhbd.ttc'
FR = 'C:/Windows/Fonts/msyh.ttc'
PAPER = (247, 243, 235)
INK = (38, 49, 44)
INK2 = (69, 81, 74)
GREY = (93, 106, 99)
GREEN = (37, 76, 64)
ACCENT = (143, 67, 34)

f = lambda p, s: ImageFont.truetype(p, s)

PHASES = [
    ('P1-home', ['S1'], '收到通知', 'P1'),
    ('P2-upload', ['S2'], '上传截图', 'P2'),
    ('P3-ocr', ['S3'], '取字与核对', 'P3'),
    ('P4-review', ['S4'], '勾选已核对 → 整理', 'P4'),
    ('P5-result', ['S5', 'S6'], '行动卡与原文依据', 'P5'),
    ('P6-speech', ['S7'], '产品朗读原声', 'P6'),
    ('P7-copy', ['S8'], '复制给家人', 'P7'),
    ('P8-missing', ['S9a'], '缺信息：通知未说明', 'P8'),
    ('P9-conflict', ['S9b'], '冲突：置顶提醒', 'P9'),
    ('P10-end', ['S10'], '边界与限制', 'P10'),
]


def wav_dur(p):
    with contextlib.closing(wave.open(p, 'rb')) as w:
        return w.getnframes() / float(w.getframerate())


def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, errors='ignore', **kw)


def record():
    """录屏 + 环回录音同时进行"""
    audio = pa.PyAudio()
    dev = audio.get_default_wasapi_loopback()
    rate, ch = int(dev['defaultSampleRate']), dev['maxInputChannels']
    print('环回设备：', dev['name'], rate, ch)
    frames, stop = [], {'v': False}

    import threading
    def rec():
        with audio.open(input_device_index=dev['index'], channels=ch, rate=rate,
                        format=pa.paInt16, frames_per_buffer=1024, input=True) as st:
            while not stop['v']:
                frames.append(st.read(1024, exception_on_overflow=False))

    th = threading.Thread(target=rec, daemon=True)
    th.start()
    import time
    start = int(time.time() * 1000)
    time.sleep(0.5)

    env = dict(os.environ)
    env['NODE_PATH'] = 'C:/Users/翁启航/.workbuddy/binaries/node/workspace/node_modules'
    node = 'C:/Users/翁启航/.workbuddy/binaries/node/versions/22.22.2-6/node.exe'
    r = subprocess.run([node, os.path.join(BASE, 'tools_record_c.cjs'),
                        'https://mingbaiban-42482.app.workbuddy.host/?sharecode=QCZF2UKNAG&cb=c7record', '1.3.0-c7'],
                       env=env, capture_output=True, text=True)
    print('recorder:', r.stdout[-500:], r.stderr[-500:])
    time.sleep(1.0)
    stop['v'] = True
    th.join(timeout=5)

    with wave.open(RAW, 'wb') as w:
        w.setnchannels(ch)
        w.setsampwidth(2)
        w.setframerate(rate)
        for x in frames:
            w.writeframes(x)
    print('原始录音', round(os.path.getsize(RAW) / 1024 / 1024, 2), 'MB', round(len(frames) * 1024 / rate, 1), 's')
    return start, rate, ch


def cut_speech(phases, rec_start, rate, ch):
    """裁出产品朗读原声。若存在单独重录的 P6（p6-meta.json + p6-raw.wav），用它。"""
    p6 = next(p for p in phases if p['name'] == 'P6-speech')
    src, base, sp_start, sp_end = RAW, rec_start, p6['speakStart'], p6['speakEnd']
    meta_p = os.path.join(TMP, 'p6-meta.json')
    raw_p = os.path.join(TMP, 'p6-raw.wav')
    if os.path.exists(meta_p) and os.path.exists(raw_p):
        m = json.load(open(meta_p, encoding='utf-8'))
        src, base = raw_p, m['recStart']
        sp_start, sp_end = m['speakStart'], m['speakEnd']
        print('使用重录的 P6 音频')
    s = max(0, (sp_start - base) / 1000.0 - 0.15)
    d = (sp_end - sp_start) / 1000.0 + 0.5
    out = os.path.join(TMP, 'speech-clip.wav')
    run([FF, '-y', '-hide_banner', '-loglevel', 'error', '-ss', '%.2f' % s, '-t', '%.2f' % d,
         '-i', src, '-ar', '44100', '-ac', '1', out])
    print('产品朗读原声', round(wav_dur(out), 2), 's')
    return out


def to_wav(src, out, seconds=None):
    cmd = [FF, '-y', '-hide_banner', '-loglevel', 'error', '-i', src]
    if seconds:
        cmd += ['-af', 'apad', '-t', '%.2f' % seconds]
    cmd += ['-ar', '44100', '-ac', '1', out]
    run(cmd)


def build_audio(phases, segs, speech_clip):
    """每段：旁白（可多句）或产品原声 → 补齐到画面时长 → 拼接"""
    parts = []
    total = 0.0
    timeline = []
    for name, sids, _cap, _ in PHASES:
        p = next(x for x in phases if x['name'] == name)
        wall = p['wall']
        if name == 'P6-speech':
            seq = [os.path.join(AU, sids[0] + '.wav'), speech_clip]
        else:
            seq = [os.path.join(AU, s + '.wav') for s in sids]
        tmp = os.path.join(TMP, name + '-audio.wav')
        # 用 filter_complex 拼接并统一采样率：concat demuxer 会按首个文件的采样率
        # 解释后续文件，导致 44.1k 的朗读原声被拉长一倍。
        cmd = [FF, '-y', '-hide_banner', '-loglevel', 'error']
        for sp in seq:
            cmd += ['-i', sp]
        n = len(seq)
        fl = ''.join('[%d:a]aresample=44100,aformat=sample_fmts=s16:channel_layouts=mono[a%d];' % (i, i) for i in range(n))
        fl += ''.join('[a%d]' % i for i in range(n)) + 'concat=n=%d:v=0:a=1[out]' % n
        cmd += ['-filter_complex', fl, '-map', '[out]', '-ar', '44100', '-ac', '1', tmp]
        run(cmd)
        adur = wav_dur(tmp)
        # 画面不短于旁白；等待过久的段（识别/整理）限制在旁白+3.5 秒内，
        # 相当于把等待过程轻度加速，避免成片超过 180 秒。
        dur = min(max(wall, adur + 0.35), adur + 3.5)
        final = os.path.join(TMP, name + '-final.wav')
        run([FF, '-y', '-hide_banner', '-loglevel', 'error', '-i', tmp,
             '-af', 'apad', '-t', '%.2f' % dur, final])
        parts.append(final)
        timeline.append({'name': name, 'sids': sids, 'duration': round(dur, 3),
                         'audio': round(adur, 2), 'wall': round(wall, 2),
                         'start': round(total, 3)})
        total += dur
    lst = os.path.join(TMP, 'all-list.txt')
    with open(lst, 'w', encoding='utf-8') as fh:
        for p in parts:
            fh.write("file '%s'\n" % p.replace('\\', '/'))
    out = os.path.join(TMP, 'final-audio.wav')
    run([FF, '-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0',
         '-i', lst, '-ar', '44100', '-ac', '1', out])
    print('总音轨', round(wav_dur(out), 2), 's')
    return out, timeline


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


def rounded(im, radius=26):
    from PIL import ImageDraw
    mask = Image.new('L', im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, im.size[0], im.size[1]], radius=radius, fill=255)
    out = Image.new('RGB', im.size, (255, 255, 255))
    out.paste(im, (0, 0), mask)
    return out


def draw_header(img, label):
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([62, 58, 122, 118], radius=16, fill=GREEN)
    d.text((76, 68), '明', font=f(FB, 38), fill=(255, 255, 255))
    d.text((140, 62), '明白办', font=f(FB, 40), fill=INK)
    d.text((140, 112), '把社区通知整理成行动卡', font=f(FR, 24), fill=GREY)
    tw = d.textlength(label, font=f(FB, 26))
    d.text((W - 62 - tw, 78), label, font=f(FB, 26), fill=ACCENT)


def draw_caption(img, text, sub=None):
    d = ImageDraw.Draw(img)
    size = 40
    for s in (40, 37, 34, 31, 29):
        font = f(FB, s)
        lines = wrap(d, text, font, W - 190)
        if len(lines) <= 3:
            size = s
            break
    font = f(FB, size)
    lh = int(size * 1.42)
    h = lh * len(lines) + 46
    top = 1782 - h
    d.rounded_rectangle([82, top, W - 82, 1782], radius=22, fill=(24, 32, 28))
    for i, ln in enumerate(lines):
        lw = d.textbbox((0, 0), ln, font=font)[2]
        d.text(((W - lw) / 2, top + 22 + i * lh), ln, font=font, fill=(255, 255, 255))
    if sub:
        sw = d.textbbox((0, 0), sub, font=f(FR, 24))[2]
        d.text(((W - sw) / 2, 1796), sub, font=f(FR, 22), fill=GREY)


def frame_canvas(src_path, label, caption, sub=None):
    img = Image.new('RGB', (W, H), PAPER)
    draw_header(img, label)
    if src_path:
        shot = Image.open(src_path).convert('RGB')
        maxw, maxh = 900, 1430
        sc = min(maxw / shot.width, maxh / shot.height)
        shot = shot.resize((int(shot.width * sc), int(shot.height * sc)), Image.LANCZOS)
        shot = rounded(shot, 26)
        x = (W - shot.width) // 2
        y = 190
        ImageDraw.Draw(img).rounded_rectangle([x + 8, y + 12, x + shot.width + 8, y + shot.height + 12],
                                              radius=26, fill=(226, 219, 205))
        img.paste(shot, (x, y))
    draw_caption(img, caption, sub)
    return img


def end_card(caption):
    img = Image.new('RGB', (W, H), PAPER)
    art = Image.open(os.path.join(ILL, 'hero-family.png')).convert('RGB')
    sc = W / art.width
    art = art.resize((W, int(art.height * sc)), Image.LANCZOS)
    img.paste(art, (0, 240))
    d = ImageDraw.Draw(img)
    d.text((80, 110), '明白办', font=f(FB, 64), fill=GREEN)
    d.text((80, 196), '把社区通知，整理成家人看得懂的行动卡', font=f(FR, 32), fill=INK2)
    draw_caption(img, caption)
    return img


def build_video(audio, timeline):
    total = sum(t['duration'] for t in timeline)
    ff = subprocess.Popen(
        [FF, '-y', '-hide_banner', '-loglevel', 'error',
         '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '%dx%d' % (W, H), '-r', str(FPS), '-i', '-',
         '-i', audio, '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p',
         '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', OUT],
        stdin=subprocess.PIPE)

    seg_map = {s['id']: s for s in json.load(open(os.path.join(AU, 'narration-timing.json'), encoding='utf-8'))['segments']}
    subtitles = []
    for item in timeline:
        p = next(x for x in PHASES if x[0] == item['name'])
        _, sids, label, code = p
        d = os.path.join(REC, item['name'])
        files = sorted(os.listdir(d)) if os.path.isdir(d) else []
        n = len(files)
        total_frames = max(1, int(round(item['duration'] * FPS)))
        cap = seg_map[sids[0]]['text']
        sub = '真实操作录屏 · 未加速' if item['name'] != 'P10-end' else '虚构人物插画 · AI 生成'
        if item['name'] == 'P6-speech':
            sub = '上一段为产品实际朗读原声（截取约 18 秒）'

        hold_p = os.path.join(TMP, 'p6-hold.json')
        HOLD_LAST = {'P3-ocr', 'P8-missing', 'P9-conflict'}
        if item['name'] in HOLD_LAST and n:
            # 这三段的等待过程远长于旁白；直接定格"结果画面"（最后一帧），
            # 避免旁白在讲结果、画面还停在加载中。
            base = Image.new('RGB', (W, H), PAPER)
            draw_header(base, label)
            draw_caption(base, cap, sub)
            probe = Image.open(os.path.join(d, files[-1])).convert('RGB')
            maxw, maxh = 900, 1330
            sc = min(maxw / probe.width, maxh / probe.height)
            sw, sh = int(probe.width * sc), int(probe.height * sc)
            x, y = (W - sw) // 2, 190
            ImageDraw.Draw(base).rounded_rectangle([x + 8, y + 12, x + sw + 8, y + sh + 12],
                                                   radius=26, fill=(226, 219, 205))
            mask = Image.new('L', (sw, sh), 0)
            ImageDraw.Draw(mask).rounded_rectangle([0, 0, sw, sh], radius=26, fill=255)
            shot = probe.resize((sw, sh), Image.LANCZOS)
            for _ in range(total_frames):
                frame = base.copy()
                frame.paste(shot, (x, y), mask)
                ff.stdin.write(frame.tobytes())
        elif item['name'] == 'P6-speech' and os.path.exists(hold_p):
            # 朗读段画面只发生一次真实变化（点击后出现暂停/停止）。
            # screencast 只在画面变化时出帧，按序号平均映射会错位，因此按时点取帧。
            h = json.load(open(hold_p, encoding='utf-8'))
            base = Image.new('RGB', (W, H), PAPER)
            draw_header(base, label)
            draw_caption(base, cap, sub)
            probe = Image.open(os.path.join(d, h['before'])).convert('RGB')
            maxw, maxh = 900, 1330
            sc = min(maxw / probe.width, maxh / probe.height)
            sw, sh = int(probe.width * sc), int(probe.height * sc)
            x, y = (W - sw) // 2, 190
            ImageDraw.Draw(base).rounded_rectangle([x + 8, y + 12, x + sw + 8, y + sh + 12],
                                                   radius=26, fill=(226, 219, 205))
            mask = Image.new('L', (sw, sh), 0)
            ImageDraw.Draw(mask).rounded_rectangle([0, 0, sw, sh], radius=26, fill=255)
            imgs = {}
            for key in ('before', 'during'):
                imgs[key] = Image.open(os.path.join(d, h[key])).convert('RGB').resize((sw, sh), Image.LANCZOS)
            for k in range(total_frames):
                frac_t = k / FPS
                frame = base.copy()
                frame.paste(imgs['during' if frac_t >= h['switchAt'] else 'before'], (x, y), mask)
                ff.stdin.write(frame.tobytes())
        elif item['name'] == 'P10-end':
            static = end_card(cap)
            for _ in range(total_frames):
                ff.stdin.write(static.tobytes())
        else:
            base = Image.new('RGB', (W, H), PAPER)
            draw_header(base, label)
            draw_caption(base, cap, sub)
            # 屏幕截图区域固定：先算好尺寸与阴影，再逐帧只换内容
            probe = Image.open(os.path.join(d, files[0])).convert('RGB') if n else None
            if probe:
                maxw, maxh = 900, 1330
                sc = min(maxw / probe.width, maxh / probe.height)
                sw, sh = int(probe.width * sc), int(probe.height * sc)
                x, y = (W - sw) // 2, 190
                ImageDraw.Draw(base).rounded_rectangle([x + 8, y + 12, x + sw + 8, y + sh + 12],
                                                       radius=26, fill=(226, 219, 205))
                mask = Image.new('L', (sw, sh), 0)
                ImageDraw.Draw(mask).rounded_rectangle([0, 0, sw, sh], radius=26, fill=255)
                cache = {}
                for k in range(total_frames):
                    frac = k / max(1, total_frames - 1)
                    src = files[min(n - 1, int(frac * (n - 1)))]
                    if src not in cache:
                        im = Image.open(os.path.join(d, src)).convert('RGB').resize((sw, sh), Image.LANCZOS)
                        cache[src] = im
                    frame = base.copy()
                    frame.paste(cache[src], (x, y), mask)
                    ff.stdin.write(frame.tobytes())
            else:
                for _ in range(total_frames):
                    ff.stdin.write(base.tobytes())
        subtitles.append({'start': item['start'], 'end': item['start'] + item['duration'],
                          'text': cap, 'name': item['name']})
        if len(sids) > 1:
            first = seg_map[sids[0]]['seconds']
            subtitles.append({'start': item['start'] + first, 'end': item['start'] + item['duration'],
                              'text': seg_map[sids[1]]['text'], 'name': item['name']})
    ff.stdin.close()
    ff.wait()
    print('视频', round(total, 2), 's')
    return subtitles


def ts(t):
    h = int(t // 3600)
    m = int(t % 3600 // 60)
    s = t % 60
    return ('%02d:%02d:%06.3f' % (h, m, s)).replace('.', ',')


def write_srt(subs):
    lines = []
    for i, s in enumerate(subs, 1):
        lines.append('%d\n%s --> %s\n%s\n' % (i, ts(s['start']), ts(s['end']), s['text']))
    p = os.path.join(DEL, '04_明白办_视频字幕.srt')
    open(p, 'w', encoding='utf-8').write('\n'.join(lines))
    print('SRT', len(subs), '条')


if __name__ == '__main__':
    if not os.path.exists(os.path.join(REC, 'phases.json')):
        raise SystemExit('先运行 record：python tools/record_video_c.py record')
    phases = json.load(open(os.path.join(REC, 'phases.json'), encoding='utf-8'))['phases']
    rec_start, rate, ch = json.load(open(os.path.join(TMP, 'rec-meta.json'), encoding='utf-8'))
    speech = cut_speech(phases, rec_start, rate, ch)
    audio, timeline = build_audio(phases, None, speech)
    subs = build_video(audio, timeline)
    write_srt(subs)
    json.dump({'timeline': timeline, 'totalSeconds': round(sum(t['duration'] for t in timeline), 2)},
              open(os.path.join(DEL, 'sources', 'video-timeline.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=2)
