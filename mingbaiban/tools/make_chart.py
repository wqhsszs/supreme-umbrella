# -*- coding: utf-8 -*-
"""生成技术流程图（11_明白办_技术流程图.png）— 动态排版，避免文字溢出"""
import os
from PIL import Image, ImageDraw, ImageFont

FONT_B = "C:/Windows/Fonts/msyhbd.ttc"
FONT_R = "C:/Windows/Fonts/msyh.ttc"

def f(path, size):
    return ImageFont.truetype(path, size)

W, H = 1600, 2020
INK, INK2, MUTED = "#1b1f24", "#4a525d", "#6b7480"
BRAND, BRAND_L = "#14539a", "#eaf1fa"
GREEN, GREEN_L = "#0d6b3f", "#eefaf3"
WARN, WARN_L = "#8a5200", "#fff6e6"
LINE = "#b6bfca"

img = Image.new("RGB", (W, H), "#ffffff")
d = ImageDraw.Draw(img)

def wrap(s, font, maxw):
    lines, cur = [], ""
    for ch in s:
        if ch == "\n":
            lines.append(cur); cur = ""; continue
        if d.textbbox((0, 0), cur + ch, font=font)[2] > maxw and cur:
            lines.append(cur); cur = ch
        else:
            cur += ch
    if cur:
        lines.append(cur)
    return lines

def rbox(x0, y0, x1, y1, fill, outline, r=18, width=3):
    d.rounded_rectangle([x0, y0, x1, y1], radius=r, fill=fill, outline=outline, width=width)

def arrow_v(x, y0, y1, color=BRAND, w=4):
    d.line([(x, y0), (x, y1 - 16)], fill=color, width=w)
    d.polygon([(x - 11, y1 - 18), (x + 11, y1 - 18), (x, y1)], fill=color)

# ---------- 标题 ----------
d.text((70, 62), "明白办 · 技术实现与数据流", font=f(FONT_B, 54), fill=INK)
d.text((70, 138), "用户粘贴通知 → 真实大模型解析 → 程序校验 → 行动卡 → 准备与转发", font=f(FONT_R, 28), fill=MUTED)
d.line([(70, 200), (W - 70, 200)], fill=LINE, width=3)

CX = 950
BW = 830
BX0, BX1 = CX - BW // 2, CX + BW // 2

main = [
    ("① 用户输入", "长辈把社区通知原文粘贴进输入框。最多 5000 字；空白、超长都有明确提示，不静默截断。", BRAND_L, BRAND),
    ("② 浏览器端应用", "app/index.html + js/app.js：输入校验、加载中防重复提交、请求序号（晚到的旧响应直接丢弃）。", BRAND_L, BRAND),
    ("③ 系统提示词", "prompts/system-prompt.txt，运行时读取的单一事实来源：只依据原文、禁止编造、通知原文当数据不当指令。", BRAND_L, BRAND),
    ("④ WorkBuddy 云服务 · 大模型通道", "免密钥托管通道，浏览器直连数据面并做 Origin 校验；不经自建代理，前端不保存任何长期密钥。", "#f2f6fc", BRAND),
    ("⑤ 模型返回结构化 JSON（流式）", "document_status、summary、audience、times、location、preparation、actions、questions、warnings。", GREEN_L, GREEN),
    ("⑥ 程序校验 js/validate.js", "字段与类型、status 取值、missing 不得填值、每条引文必须能在原文中逐字找到。", GREEN_L, GREEN),
    ("⑧ 行动卡渲染", "事实项 + 状态标记（原文写明／未说明／含糊／冲突）+ 逐项原文依据；纯文本渲染，不执行通知里的标签。", BRAND_L, BRAND),
    ("⑨ 用户动作", "勾选准备事项（只表示自己准备好了，不等于已报名）· 一键复制整张行动卡发给家人。", BRAND_L, BRAND),
]

# 先算高度
BODY_FONT = f(FONT_R, 23)
TITLE_FONT = f(FONT_B, 31)
heights, wrapped = [], []
for title, sub, _, _ in main:
    ls = wrap(sub, BODY_FONT, BW - 56)
    wrapped.append(ls)
    heights.append(24 + 44 + len(ls) * 33 + 18)

GAP = 46
y = 250
pos = []
for (title, sub, fillc, outc), hh, ls in zip(main, heights, wrapped):
    rbox(BX0, y, BX1, y + hh, fillc, outc)
    d.text((BX0 + 28, y + 20), title, font=TITLE_FONT, fill=INK)
    ty = y + 20 + 46
    for ln in ls:
        d.text((BX0 + 28, ty), ln, font=BODY_FONT, fill=INK2)
        ty += 33
    pos.append((y, y + hh))
    y += hh

for i in range(len(pos) - 1):
    arrow_v(CX, pos[i][1], pos[i + 1][0])

# ---------- ⑦ 侧支：校验不通过 ----------
six_bottom = pos[5][1]
eight_top = pos[6][0]
b7_w = 340
b7_x0 = 60
b7_x1 = b7_x0 + b7_w
# 框放在 ⑥ 与 ⑧ 之间偏上
b7_y0 = (pos[5][0] + pos[5][1]) // 2 - 104
b7_y1 = b7_y0 + 208
rbox(b7_x0, b7_y0, b7_x1, b7_y1, WARN_L, WARN)
d.text((b7_x0 + 22, b7_y0 + 18), "⑦ 校验不通过", font=f(FONT_B, 28), fill=WARN)
body7 = wrap("自动重试 1 次；仍不通过就显示失败说明，不渲染行动卡——宁可不给，也不给错的。", f(FONT_R, 21), b7_w - 44)
ty = b7_y0 + 66
for ln in body7:
    d.text((b7_x0 + 22, ty), ln, font=f(FONT_R, 21), fill=INK2)
    ty += 30

# ⑥ → ⑦ 的"不通过"箭头
mid6 = (pos[5][0] + pos[5][1]) // 2
d.line([(BX0, mid6), (b7_x1, mid6)], fill=WARN, width=4)
d.polygon([(b7_x1 + 14, mid6 - 11), (b7_x1 + 14, mid6 + 11), (b7_x1, mid6)], fill=WARN)
d.text(((b7_x1 + BX0) // 2 - 34, mid6 - 42), "未通过", font=f(FONT_B, 21), fill=WARN)

# ⑦ → 错误页面提示（小字）
d.text((b7_x0 + 22, b7_y1 + 14), "→ 页面显示“没看明白”，给“再试一次”", font=f(FONT_R, 20), fill=MUTED)

# ⑥ → ⑧ 主干标注"通过"
mid_p = (six_bottom + eight_top) // 2
d.text((CX + 24, mid_p - 30), "通过", font=f(FONT_B, 24), fill=GREEN)

# ---------- 支撑与材料链路 ----------
by = y + 30
d.line([(70, by), (W - 70, by)], fill=LINE, width=3)
d.text((70, by + 22), "支撑与材料链路", font=f(FONT_B, 32), fill=INK)

support = [
    ("在线部署", "静态站点部署\nmingbaiban-42482.\napp.workbuddy.host"),
    ("测试证据", "12 条通知用例\n（8 正常 + 4 边界）\n10 项页面行为测试"),
    ("说明书", "HTML 排版 → PDF\n同源 DOCX 可编辑稿\n共 10 页"),
    ("演示视频", "真实界面截图\n逐帧合成 + 字幕\nH.264 MP4"),
]
sx, gap = 70, 22
sw = (W - 140 - gap * 3) // 4
sy = by + 80
sh = 186
for i, (t, s) in enumerate(support):
    x0 = sx + i * (sw + gap)
    rbox(x0, sy, x0 + sw, sy + sh, "#f7f9fc", LINE, r=14, width=2)
    d.text((x0 + 18, sy + 16), t, font=f(FONT_B, 26), fill=BRAND)
    yy = sy + 58
    for ln in s.split("\n"):
        d.text((x0 + 18, yy), ln, font=f(FONT_R, 19), fill=INK2)
        yy += 27

foot = "本图由项目组依据实际实现绘制 · 2026-10-23 · 模型通道：WorkBuddy 云服务，运行时选用 DeepSeek-V4.1-Flash"
d.text((70, H - 48), foot, font=f(FONT_R, 19), fill=MUTED)

out = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "delivery", "11_明白办_技术流程图.png"))
img.save(out, "PNG")
print("saved", out, img.size)
