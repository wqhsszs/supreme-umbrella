# -*- coding: utf-8 -*-
"""生成产品演示视频（1080×1920 竖版）、字幕 SRT、封面、分镜脚本。
画面全部来自线上真实版本的实际截图；不使用虚构页面或写死答案。"""
import json, os, subprocess, textwrap
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import imageio_ffmpeg
import qrcode

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(BASE, "tests", "shots")
DEL = os.path.join(BASE, "delivery")
SRC = os.path.join(DEL, "sources")
TMP = os.path.join(BASE, "tests", "frames")
os.makedirs(TMP, exist_ok=True)

FB = "C:/Windows/Fonts/msyhbd.ttc"
FR = "C:/Windows/Fonts/msyh.ttc"
f = lambda p, s: ImageFont.truetype(p, s)

W, H = 1080, 1920
BRAND = (20, 83, 154)
BRAND_D = (14, 61, 116)
INK = (27, 31, 36)
INK2 = (74, 82, 93)
GREY = (107, 116, 128)
BG = (246, 248, 251)

FADE = 0.45
URL = "https://mingbaiban-42482.app.workbuddy.host/"

def tw(d, s, font):
    return d.textbbox((0, 0), s, font=font)[2]

def center_text(d, y, s, font, fill):
    d.text(((W - tw(d, s, font)) / 2, y), s, font=font, fill=fill)

def rounded(im, r):
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, im.size[0] - 1, im.size[1] - 1], radius=r, fill=255)
    out = im.convert("RGBA")
    out.putalpha(mask)
    return out

def paste_center(canvas, im, cy, radius=26, shadow=True):
    im = rounded(im, radius)
    x = (W - im.size[0]) // 2
    y = cy - im.size[1] // 2
    if shadow:
        sh = Image.new("RGBA", (im.size[0] + 60, im.size[1] + 60), (0, 0, 0, 0))
        ImageDraw.Draw(sh).rounded_rectangle([30, 30, im.size[0] + 29, im.size[1] + 29], radius=radius, fill=(20, 45, 80, 60))
        sh = sh.filter(ImageFilter.GaussianBlur(16))
        canvas.alpha_composite(sh, (x - 30, y - 26))
    canvas.alpha_composite(im, (x, y))
    return y + im.size[1]

def frame_base():
    return Image.new("RGBA", (W, H), BG + (255,))

def header(canvas, step, title, sub):
    d = ImageDraw.Draw(canvas)
    # 品牌条
    d.rounded_rectangle([60, 62, 148, 150], radius=14, fill=BRAND)
    d.text((60 + 44 - tw(d, "明", f(FB, 46)) / 2, 78), "明", font=f(FB, 46), fill=(255, 255, 255))
    d.text((168, 66), "明白办", font=f(FB, 40), fill=INK)
    d.text((168, 116), "收到通知之后，下一步更明白", font=f(FR, 22), fill=GREY)

    if step:
        d.rounded_rectangle([W - 60 - 150, 70, W - 60, 122], radius=26, fill=(232, 239, 248))
        d.text((W - 60 - 150 + 75 - tw(d, step, f(FB, 24)) / 2, 82), step, font=f(FB, 24), fill=BRAND)

    d.text((60, 186), title, font=f(FB, 54), fill=INK)
    if sub:
        d.text((60, 252), sub, font=f(FR, 26), fill=INK2)

def caption(canvas, text, y=1742, h=118):
    d = ImageDraw.Draw(canvas)
    font = f(FB, 40)
    lines = textwrap.wrap(text, width=22) or [""]
    lines = lines[:2]
    box_h = 44 + (len(lines) - 1) * 54
    top = y + (h - box_h) // 2 - 8
    d.rounded_rectangle([60, top - 16, W - 60, top + box_h + 16], radius=18, fill=(18, 24, 32, 232))
    for i, ln in enumerate(lines):
        center_text(d, top + i * 54, ln, font, (255, 255, 255))

def progress(canvas, p):
    d = ImageDraw.Draw(canvas)
    d.rounded_rectangle([60, H - 52, W - 60, H - 46], radius=3, fill=(214, 222, 232))
    if p > 0:
        d.rounded_rectangle([60, H - 52, 60 + int((W - 120) * p), H - 46], radius=3, fill=BRAND)
    d.text((60, H - 40), "明白办 · 2026 iCAN × 快手 AI 未来创造者挑战赛 · AI 产品实现", font=f(FR, 20), fill=GREY)

def tag_real(canvas):
    d = ImageDraw.Draw(canvas)
    t = "真实界面 · 操作截图演示"
    w = tw(d, t, f(FB, 22)) + 32
    d.rounded_rectangle([W - 60 - w, 1652, W - 60, 1700], radius=24, fill=(255, 255, 255, 235), outline=(214, 222, 232), width=2)
    d.text((W - 60 - w + 16, 1662), t, font=f(FB, 22), fill=GREY)

# ---------------- 幻灯片定义 ----------------
SLIDES = [
    dict(kind="cover", dur=7.0,
         caption="长辈收到社区通知，下一步该做什么？"),
    dict(kind="shot", img="shot-02-filled.png", step="第 1 步", title="把通知原文贴进来",
         sub="文字粘贴即可，最多 5000 字", dur=9.0,
         caption="不用拍照，不用上传，把通知文字贴进来就行"),
    dict(kind="shot", img="shot-03-loading.png", step="第 2 步", title="AI 真的在看这条通知",
         sub="每一步都由模型实时处理，不是提前写好的答案", dur=8.5,
         caption="真实模型逐句阅读，通常 2—8 秒出结果"),
    dict(kind="shot", img="shot-04-result-top.png", step="第 3 步", title="先说这条通知说的是什么",
         sub="一句话讲清，不用读完一大段公文", dur=10.0,
         caption="先给结论：这条通知要您做什么"),
    dict(kind="shot", img="shot-06-evidence.png", step="可以核对", title="每一项都能看原文",
         sub="点开就是通知里的原句，不是 AI 自己编的", dur=11.0,
         caption="「看原文依据」展开原句，是否写清楚一目了然"),
    dict(kind="shot", img="shot-07-checked.png", step="可以行动", title="要带的东西，打勾",
         sub="勾选只表示自己准备好了，不等于已经报名", dur=9.0,
         caption="准备清单可以打勾，出门前看一眼"),
    dict(kind="shot", img="shot-08-copy.png", step="可以转发", title="复制给家人",
         sub="整张行动卡一次复制，缺失提示一起带走", dur=8.0,
         caption="一键复制，发给子女或存进备忘录"),
    dict(kind="shot", img="shot-09-missing-top.png", step="关键设计", title="没写的，就说没写",
         sub="通知没写集合地点、没写报名方式，绝不替它补", dur=9.5,
         caption="原文没有的信息显示「通知未说明」，不编造"),
    dict(kind="shot", img="shot-10-questions.png", step="关键设计", title="还要问清楚的，列出来",
         sub="把该问社区的问题变成几句大白话", dur=9.0,
         caption="不知道问什么？这里替您列好要确认的问题"),
    dict(kind="shot", img="shot-11-error.png", step="安全边界", title="给不出可靠答案，就明说",
         sub="校验不过就显示失败，不拿编好的卡片糊弄", dur=8.5,
         caption="宁可说「没看明白」，也不给错的答案"),
    dict(kind="shot", img="shot-12-desktop.png", step="多端", title="手机能用，电脑也行",
         sub="窄屏不横向滚动，正文 20px，按钮不小于 56px", dur=7.0,
         caption="手机优先设计，电脑上同样清楚"),
    dict(kind="chart", img="../../delivery/11_明白办_技术流程图.png", step="怎么做的", title="一条能核对的技术链路",
         sub="大模型理解 + 程序校验引文是否真实存在", dur=9.0,
         caption="模型负责理解，程序负责核对，缺一不可"),
    dict(kind="end", dur=10.0, caption="收到通知之后，下一步更明白"),
]

# ---------------- 渲染各帧 ----------------
def render_cover():
    canvas = Image.new("RGBA", (W, H), BRAND + (255,))
    d = ImageDraw.Draw(canvas)
    # 顶部渐深
    for i in range(520):
        a = int(40 * (1 - i / 520))
        d.line([(0, i), (W, i)], fill=(10, 40, 80, a))
    d.text((80, 150), "2026 年 iCAN 大学生创新创业大赛", font=f(FR, 26), fill=(214, 228, 245))
    d.text((80, 194), "快手 AI 未来创造者挑战赛　|　AI 产品实现", font=f(FR, 26), fill=(214, 228, 245))

    d.text((80, 300), "明白办", font=f(FB, 128), fill=(255, 255, 255))
    d.text((84, 470), "面向长辈的 AI 社区通知行动助手", font=f(FR, 40), fill=(226, 236, 248))
    d.line([(80, 560), (W - 80, 560)], fill=(255, 255, 255, 90), width=2)
    d.text((80, 596), "收到通知之后，下一步更明白。", font=f(FB, 44), fill=(255, 255, 255))

    # 三张截图拼贴
    ims = [Image.open(os.path.join(SHOTS, n)).convert("RGB") for n in ("shot-01-home.png", "shot-04-result-top.png", "shot-09-missing-top.png")]
    smalls = []
    hh = 700
    ww = int(ims[0].size[0] * hh / ims[0].size[1])
    if ww * 3 + 2 * 24 > W - 96:
        ww = (W - 96 - 2 * 24) // 3
        hh = int(ims[0].size[1] * ww / ims[0].size[0])
    for im in ims:
        smalls.append(rounded(im.resize((ww, hh), Image.LANCZOS), 22))
    total_w = sum(s.size[0] for s in smalls) + 2 * 24
    x = (W - total_w) // 2
    y = 800
    for i, s in enumerate(smalls):
        dy = 0 if i == 1 else 40
        sh = Image.new("RGBA", (s.size[0] + 40, s.size[1] + 40), (0, 0, 0, 0))
        ImageDraw.Draw(sh).rounded_rectangle([20, 20, s.size[0] + 19, s.size[1] + 19], radius=22, fill=(0, 0, 0, 90))
        sh = sh.filter(ImageFilter.GaussianBlur(14))
        canvas.alpha_composite(sh, (x - 20, y + dy - 14))
        canvas.alpha_composite(s, (x, y + dy))
        x += s.size[0] + 24
    d = ImageDraw.Draw(canvas)
    d.text((80, 1600), "AI 理解通知 · 逐项原文依据 · 缺失与冲突提示 · 从阅读到准备", font=f(FR, 26), fill=(200, 216, 236))
    progress(canvas, 0)
    return canvas

def render_shot(s):
    canvas = frame_base()
    header(canvas, s.get("step", ""), s["title"], s.get("sub", ""))
    im = Image.open(os.path.join(SHOTS, s["img"])).convert("RGB")
    maxh = 1330
    ww = int(im.size[0] * maxh / im.size[1])
    if ww > W - 200:
        ww = W - 200
        maxh = int(im.size[1] * ww / im.size[0])
    im = im.resize((ww, maxh), Image.LANCZOS)
    paste_center(canvas, im, 980)
    tag_real(canvas)
    caption(canvas, s["caption"])
    progress(canvas, s["_p"])
    return canvas

def render_chart(s):
    canvas = frame_base()
    header(canvas, s["step"], s["title"], s["sub"])
    im = Image.open(os.path.join(BASE, "delivery", "11_明白办_技术流程图.png")).convert("RGB")
    ww = W - 120
    hh = int(im.size[1] * ww / im.size[0])
    im = im.resize((ww, hh), Image.LANCZOS)
    if hh > 1290:
        hh = 1290
        ww = int(im.size[0] * hh / im.size[1])
        im = im.resize((ww, hh), Image.LANCZOS)
    paste_center(canvas, im, 990, radius=16)
    caption(canvas, s["caption"])
    progress(canvas, s["_p"])
    return canvas

def render_end(s):
    canvas = Image.new("RGBA", (W, H), (255, 255, 255, 255))
    d = ImageDraw.Draw(canvas)
    d.rectangle([0, 0, W, 14], fill=BRAND)
    d.rounded_rectangle([80, 110, 172, 202], radius=16, fill=BRAND)
    d.text((80 + 46 - tw(d, "明", f(FB, 50)) / 2, 126), "明", font=f(FB, 50), fill=(255, 255, 255))
    d.text((190, 116), "明白办", font=f(FB, 48), fill=INK)
    d.text((192, 178), "面向长辈的 AI 社区通知行动助手", font=f(FR, 26), fill=GREY)

    d.text((80, 268), "收到通知之后，", font=f(FB, 58), fill=BRAND)
    d.text((80, 350), "下一步更明白。", font=f(FB, 58), fill=BRAND)

    d.text((80, 470), "现在就试一条通知", font=f(FB, 36), fill=INK)
    d.text((80, 526), "mingbaiban-42482.app.workbuddy.host", font=f(FR, 25), fill=INK2)
    d.text((80, 568), "无需注册 · 无需登录 · 手机电脑都能用", font=f(FR, 23), fill=GREY)

    qr = qrcode.make(URL).convert("RGB").resize((270, 270), Image.NEAREST)
    canvas.paste(qr, (720, 456))
    d.rounded_rectangle([710, 446, 1000, 736], radius=12, outline=(220, 226, 234), width=3)
    d.text((722, 748), "扫码直接体验", font=f(FR, 23), fill=GREY)

    d.rounded_rectangle([80, 812, W - 80, 1140], radius=20, fill=(246, 248, 251), outline=(226, 232, 240), width=2)
    d.text((112, 840), "产品状态（如实说明）", font=f(FB, 28), fill=INK)
    lines = [
        "· 12 条通知用例 12/12 通过，10 项页面行为测试 10/10 通过",
        "· 关键时间、地点、对象、材料均未发现无依据补充",
        "· 尚未开展目标用户（长辈）真人试用，效果有待验证",
        "· 尚未在真实手机做真机测试，本次为模拟视口",
    ]
    yy = 892
    for ln in lines:
        d.text((112, yy), ln, font=f(FR, 25), fill=INK2)
        yy += 56

    d.text((80, 1180), "AI 与素材说明", font=f(FB, 27), fill=INK)
    notes = [
        "画面为线上版本的真实操作截图，不是虚构页面，也没有提前写好的答案。",
        "行动卡由大模型 DeepSeek-V4.1-Flash 实时生成，经 WorkBuddy 云服务通道调用。",
        "本视频由项目组用 AI 编程助手（WorkBuddy）辅助制作；示例通知为虚构演示材料。",
    ]
    yy = 1230
    for ln in notes:
        for seg in textwrap.wrap(ln, width=33):
            d.text((80, yy), seg, font=f(FR, 23), fill=GREY)
            yy += 36
        yy += 20

    d.rounded_rectangle([80, 1660, W - 80, 1740], radius=14, fill=(255, 246, 230))
    d.text((104, 1682), "AIGC 声明：本视频含 AI 生成内容，发布时请勾选「含 AI 生成内容」", font=f(FB, 23), fill=(138, 82, 0))
    progress(canvas, 1)
    return canvas

# ---------------- 生成帧文件 ----------------
total = sum(s["dur"] for s in SLIDES) - FADE * (len(SLIDES) - 1)
elapsed = 0.0
paths, starts = [], []
for i, s in enumerate(SLIDES):
    starts.append(elapsed)
    s["_p"] = (i + 1) / len(SLIDES)
    if s["kind"] == "cover":
        img = render_cover()
    elif s["kind"] == "shot":
        img = render_shot(s)
    elif s["kind"] == "chart":
        img = render_chart(s)
    else:
        img = render_end(s)
    p = os.path.join(TMP, f"s{i:02d}.png")
    img.convert("RGB").save(p, "PNG")
    paths.append(p)
    elapsed += s["dur"] - FADE

print("总时长约 %.1f 秒，%d 个镜头" % (total, len(SLIDES)))

# 封面单独导出
Image.open(paths[0]).save(os.path.join(DEL, "07_明白办_视频封面.png"), "PNG")

# ---------------- 合成视频 ----------------
ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
cmd = [ffmpeg, "-y", "-hide_banner", "-loglevel", "error"]
for s, p in zip(SLIDES, paths):
    cmd += ["-loop", "1", "-t", f"{s['dur']:.3f}", "-i", p]

filt = []
for i in range(len(SLIDES)):
    filt.append(f"[{i}:v]scale={W}:{H},setsar=1,fps=30,format=yuv420p[v{i}]")
prev = "v0"
off = 0.0
for i in range(1, len(SLIDES)):
    off += SLIDES[i - 1]["dur"] - FADE
    out = f"x{i}"
    filt.append(f"[{prev}][v{i}]xfade=transition=fade:duration={FADE}:offset={off:.3f}[{out}]")
    prev = out
filter_complex = ";".join(filt)

mp4 = os.path.join(DEL, "03_明白办_产品演示.mp4")
cmd += ["-filter_complex", filter_complex, "-map", f"[{prev}]",
        "-c:v", "libx264", "-preset", "medium", "-crf", "21",
        "-pix_fmt", "yuv420p", "-r", "30", "-movflags", "+faststart", mp4]
subprocess.run(cmd, check=True)
print("MP4 完成：", mp4, os.path.getsize(mp4) / 1024 / 1024, "MB")

# ---------------- SRT ----------------
def ts(t):
    h = int(t // 3600); m = int((t % 3600) // 60); s = t % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}".replace(".", ",")

srt = []
for i, (s, st) in enumerate(zip(SLIDES, starts), 1):
    end = st + s["dur"] - FADE if i < len(SLIDES) else st + s["dur"]
    srt.append(f"{i}\n{ts(st)} --> {ts(end - 0.05)}\n{s['caption']}\n")
open(os.path.join(DEL, "04_明白办_视频字幕.srt"), "w", encoding="utf-8").write("\n".join(srt))
print("SRT 完成，共", len(srt), "条")

json.dump({"totalSeconds": round(total, 2), "fade": FADE,
           "slides": [{"i": i, "kind": s["kind"], "start": round(st, 2), "dur": s["dur"],
                       "title": s.get("title", ""), "caption": s["caption"]}
                      for i, (s, st) in enumerate(zip(SLIDES, starts))]},
          open(os.path.join(SRC, "video-timing.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("timing json ok")
