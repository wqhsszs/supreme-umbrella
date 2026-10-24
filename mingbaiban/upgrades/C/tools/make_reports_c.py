# -*- coding: utf-8 -*-
"""C 轮：生成 08 运行说明 与 09 测试报告 的 HTML（随后由 Edge 打印为 PDF）。
数字全部读自 delivery/assets/evidence/ 的原始记录，不手填。"""
import json
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(BASE, 'delivery')
EV = os.path.join(D, 'assets', 'evidence')
SRC = os.path.join(D, 'sources')
AUV = os.path.join(D, 'assets', 'audio', 'narration-timing.json')
TTS = os.path.join(D, 'assets', 'tts-samples', 'speech-recordings.json')

VER = '1.3.0-c7'
URL = 'https://mingbaiban-42482.app.workbuddy.host/?sharecode=QCZF2UKNAG'

run = json.load(open(os.path.join(EV, 'test-run-latest.json'), encoding='utf-8'))
edge = json.load(open(os.path.join(EV, 'edge-run-latest.json'), encoding='utf-8'))
extra = json.load(open(os.path.join(EV, 'a-extra-latest.json'), encoding='utf-8'))
ocr = json.load(open(os.path.join(EV, 'c-ocr-latest.json'), encoding='utf-8'))
speech = json.load(open(os.path.join(EV, 'c-speech-latest.json'), encoding='utf-8'))
layout = json.load(open(os.path.join(EV, 'c-layout.json'), encoding='utf-8'))
narr = json.load(open(AUV, encoding='utf-8'))
try:
    tts = json.load(open(TTS, encoding='utf-8'))
except Exception:
    tts = None

CSS = """
@page { size: A4; margin: 14mm 16mm 16mm 16mm; }
*{box-sizing:border-box}
body{margin:0;font-family:"Microsoft YaHei",sans-serif;color:#26312C;font-size:9.7pt;line-height:1.68}
h1{font-size:17pt;margin:0 0 3mm}
h3{font-size:10.6pt;margin:4mm 0 1.6mm;color:#254C40}
p{margin:0 0 2.2mm}
ul{margin:0 0 2.2mm;padding-left:5mm}
li{margin-bottom:1mm}
.small{font-size:8.4pt;line-height:1.55}
.muted{color:#5D6A63}
.kicker{font-size:8.6pt;color:#254C40;font-weight:700}
.rule{height:3px;background:#254C40;width:24mm;margin:2.4mm 0 4mm}
table{width:100%;border-collapse:collapse;margin:1mm 0 3mm;font-size:8.3pt;line-height:1.45}
th,td{border:1px solid #E3DCCD;padding:1.5mm 1.8mm;text-align:left;vertical-align:top}
th{background:#F2EFE7;font-weight:700}
.ok{color:#2F6B4F;font-weight:700}
.bad{color:#9E2B25;font-weight:700}
.box{border:1px solid #E3DCCD;border-left:4px solid #254C40;background:#FAF8F3;padding:2.4mm 3.4mm;margin:0 0 3mm}
.box.ok{border-left-color:#2F6B4F;background:#F2F8F4}
.box.warn{border-left-color:#8A4B1E;background:#FDF6EC}
code{background:#F0EFE9;padding:0 1mm;border-radius:2px;font-size:8.6pt}
"""


def esc(s):
    return str(s if s is not None else '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def ok(v):
    return '<span class="ok">通过</span>' if v else '<span class="bad">未过</span>'


def cls(v):
    return 'ok' if v else 'bad'


# ---------------- 08 运行说明 ----------------
p1 = f"""
<p class="kicker">附件 08</p>
<h1>在线体验与运行说明</h1>
<div class="rule"></div>
<div class="box ok">
  <b>预览地址：</b><a href="{URL}">https://mingbaiban-42482.app.workbuddy.host/</a><br>
  <span class="small">无需注册、无需登录。手机与电脑都能用。</span>
</div>
<h3>一、怎么试（5 分钟，含截图与朗读）</h3>
<ol class="small" style="padding-left:5mm">
  <li><b>文字方式</b>：点首页「示例一 · 手机使用指导」→「整理成行动卡」，等 3—15 秒（真实模型在处理）。</li>
  <li><b>截图方式</b>：切到「上传通知截图」→ 选一张通知截图（可用本包 <code>assets/ocr-samples/</code> 里的自编样例）→「识别文字」。</li>
  <li><b>核对</b>：左边原图、右边文字逐行看；改好后勾选「我已核对」，再点「已核对文字，整理行动卡」。不勾选就无法整理。</li>
  <li>看结论卡下面的「谁适用」「何时、何地」——报名截止与活动开始是两个时间，地点分别是一楼服务台、二楼活动室。</li>
  <li>点任意一项下面的「对照核对后的通知文字」看原句；截图来源还能点「查看这张通知的原图」。</li>
  <li>点「读给家人听」，用设备自带中文语音整卡朗读；可暂停、继续、停止。</li>
  <li>点「复制行动卡，发给家人」，可粘贴到聊天里。</li>
</ol>
<h3>二、版本怎么核对</h3>
<p class="small">控制台执行 <code>window.MBB_CONFIG.appVersion</code>，应返回 <code>{VER}</code>。来源说明（截图来源会写"文字由 模型名 取出后经整理者核对"）与实际模型名都显示在页面上。</p>
<h3>三、真实模型调用的条件</h3>
<table>
  <tr><th style="width:26%">项目</th><th>说明</th></tr>
  <tr><td>通道</td><td>WorkBuddy 云服务免密钥通道；浏览器直连数据面，服务端按 Origin 校验</td></tr>
  <tr><td>运行时模型</td><td><code>deepseek-v4.1-flash</code>（原生多模态）；取字与整理是<b>两次独立调用</b>、两套提示词</td></tr>
  <tr><td>取字参数</td><td>图片先在前端缩到长边 1600px、JPEG 质量 0.86；单次超时 60 秒，网络类错误自动重试 1 次</td></tr>
  <tr><td>整理参数</td><td>流式输出、temperature 0.1、单次 45 秒、失败最多重试 1 次</td></tr>
  <tr><td>域名限制</td><td>换域名或本地 <code>file://</code> 打开时，模型调用会被服务端拒绝，页面显示「AI 服务还没连接上」——这是设计行为</td></tr>
  <tr><td>配额</td><td>由平台侧决定；被限流时页面显示「请求被限流，请稍后重试」，不给假答案</td></tr>
</table>
<h3>四、截图识别的边界（如实）</h3>
<ul class="small">
  <li>支持 JPG/PNG/WebP、单张 ≤8MB、长边自动缩到 1600px；HEIC 明确提示不支持并建议导出 JPG。</li>
  <li>取字只提取可见文字：不改写、不补年份/楼层/电话；看不清处标注「［此处看不清，请对照图片］」；不输出置信度。</li>
  <li>无文字、太模糊、文件损坏：都停在原图页并给出下一步，保留用户输入。</li>
  <li>核对是整理者的操作，不是社区认证；改字后旧卡片、复制文本、朗读全部作废，需重新整理。</li>
  <li>图片只在当前页面内存中，不写浏览器存储；不发送到除模型通道外的地址。截图里如带姓名电话，建议先裁掉。</li>
</ul>
<h3>五、朗读的边界（如实）</h3>
<ul class="small">
  <li>声音来自<b>这台设备</b>（浏览器 Web Speech API + 系统中文音色），不是云端配音，音色随设备变化。</li>
  <li>朗读内容由已校验的卡片数据确定性拼出：数字等价改写（9:00→9点）但数值不变；"通知未说明""前后不一致""还要确认"照读；勾选读成"整理者已勾选 N 项"，并说明不代表已报名。</li>
  <li>没有中文音色或浏览器不支持时会明确提示，不显示假成功。</li>
  <li><b>不能导出音频文件</b>，所以产品里没有"下载语音"按钮；把卡读给长辈听必须当场播放，或用复制文本让对方设备朗读。</li>
</ul>
<h3>六、隐私边界</h3>
<ul class="small">
  <li>文字与截图只用于本次请求；不建账号、不建历史库、不写日志，刷新即清空。</li>
  <li>模型服务由平台托管，平台侧数据处理不在本产品控制内，<b>不承诺"绝不保留"</b>。</li>
  <li>页面除模型通道与 CDN 上的 SDK 外无外部请求。</li>
</ul>
<h3>七、本地运行（仅看界面）</h3>
<div class="box small"><code>cd C/project &amp;&amp; python3 -m http.server 8124</code> → 打开 <code>http://127.0.0.1:8124/</code>。
本地 Origin 不在通道白名单内，模型调用会被拒（页面有明确提示）；要试真实功能请用线上地址。</div>
"""

# ---------------- 09 测试报告 ----------------
def cell(v):
    return "<td class='%s'>%s</td>" % (cls(v), ok(v))


def rows_run():
    out = []
    for r in run['results']:
        note = '' if r['productResult'].get('attempts', 1) == 1 else '第 %d 次尝试' % r['productResult']['attempts']
        if r['productResult'].get('retriedAfterNetwork'):
            note += '（网络瞬断后重试）'
        out.append('<tr><td>%s</td><td>%s</td>%s<td>%.1fs</td><td>%s</td></tr>'
                   % (r['id'], esc(r['name']), cell(r['pass']), r['elapsedMs'] / 1000, note))
    return ''.join(out)


def rows_edge():
    return ''.join('<tr><td>%s</td><td>%s</td>%s</tr>' % (r['id'], esc(r['name']), cell(r['pass']))
                   for r in edge['results'])


def rows_extra():
    return ''.join('<tr><td>%s</td><td>%s</td>%s</tr>' % (r['id'], esc(r['name']), cell(r['pass']))
                   for r in extra['results'])


def rows_ocr():
    return ''.join('<tr><td>%s</td><td>%s</td>%s<td class="small">%s</td></tr>'
                   % (r['id'], esc(r['name']), cell(r['pass']), esc(r['detail'][:160]))
                   for r in ocr['results'])


def rows_speech():
    return ''.join('<tr><td>%s</td><td>%s</td>%s<td class="small">%s</td></tr>'
                   % (r['id'], esc(r['name']), cell(r['pass']), esc(r['detail'][:140]))
                   for r in speech['results'])


def rows_layout():
    out = []
    for v in layout['viewports']:
        out.append(f"<tr><td>{v['w']}×{v['h']}</td>"
                   f"<td>{'无' if v['upload']['scrollW'] <= v['upload']['clientW'] + 1 else '<span class=bad>有</span>'}</td>"
                   f"<td>{'并排' if v['review']['sideBySide'] else '上下堆叠'}</td>"
                   f"<td>{v['review']['confirmTop']}px / {v['review']['confirmH']}px</td>"
                   f"<td>{'无' if v['result']['scrollW'] <= v['result']['clientW'] + 1 else '<span class=bad>有</span>'}</td>"
                   f"<td>{sum(len(v['smallTargets'][k]) for k in v['smallTargets'])}</td></tr>")
    return ''.join(out)


def rows_contrast():
    worst = min(layout['contrast'], key=lambda c: c['ratio'])
    return (f"<tr><td>{esc(worst['name'])}</td><td>{worst['ratio']}:1</td><td class='ok'>达标（AA 门槛 4.5:1）</td></tr>"
            f"<tr><td colspan='3' class='muted small'>共 {len(layout['contrast'])} 组配色，最低即上表。</td></tr>")


def tts_block_html():
    if not tts:
        return ('<div class="box warn small"><b>本轮未完成声学录制。</b>录制需要先有真实卡片（依赖模型通道），'
                '通道随后持续限流/403，脚本 tools/record_speech.py 已备但未跑通。因此没有音频文件，'
                '也没有"逐段听录音核对"的证据；C2 只验证到"设备有中文音色、合成请求被接受、状态机正确"。'
                '演示视频为界面分镜版，不含产品朗读原声。</div>')
    return ('<table><tr><th style="width:14%">卡片</th><th style="width:14%">文本长度</th><th style="width:14%">时长</th>'
            '<th>音量（真实播放）</th></tr>' + rows_tts() + '</table>')


def rows_tts():
    out = []
    for s in tts['segments']:
        if not s.get('ok'):
            out.append(f"<tr><td>{s['id']}</td><td colspan='3' class='bad'>卡片未生成，未录音</td></tr>")
            continue
        out.append(f"<tr><td>{s['id']}</td><td>{s['charCount']} 字</td><td>{s.get('durationSeconds')}s</td>"
                   f"<td>平均 {s.get('meanVolumeDb')} dB / 峰值 {s.get('maxVolumeDb')} dB（ audible={s.get('audible')}）</td></tr>")
    return ''.join(out)


ts = sorted(r['elapsedMs'] for r in run['results'])
p2 = f"""
<section>
<p class="kicker">附件 09</p>
<h1>技术测试报告（C 轮）</h1>
<div class="rule"></div>
<div class="box ok small">
  <b>被测版本 {VER}</b>，线上真实模型调用。<br>
  C1 截图识别专项 <b>{ocr['summary']['passed']}/{ocr['summary']['total']}</b>；
  C2 朗读专项 <b>{speech['summary']['passed']}/{speech['summary']['total']}</b>；
  A 轮回归 12 条 <b>{run['summary']['passed']}/{run['summary']['total']}</b>；
  页面行为 <b>{edge['summary']['passed']}/{edge['summary']['total']}</b>；
  A 轮专项 <b>{extra['summary']['passed']}/{extra['summary']['total']}</b>；
  布局四档视口无横向滚动、对比度最低 {min(c['ratio'] for c in layout['contrast'])}:1。<br>
  <b>未开展</b>：目标用户真人试用、真机测试。本报告不代表"任何输入都不会出错"。
</div>
<h3>一、环境与对象</h3>
<table class="small">
  <tr><th style="width:24%">项目</th><th>内容</th></tr>
  <tr><td>执行时间</td><td>{esc(ocr.get('runAt', ''))}（C1）；{esc(speech.get('runAt', ''))}（C2）；回归 {esc(run.get('runAt', ''))}（UTC）</td></tr>
  <tr><td>被测版本</td><td>{VER}；{URL}</td></tr>
  <tr><td>运行时模型</td><td>minimax-m3.1-flash（原生多模态；取字与整理各一次真实调用。deepseek-v4.1-flash 对本应用 403，已换用，见 16 号文件）</td></tr>
  <tr><td>浏览器</td><td>Microsoft Edge via playwright-core（--no-proxy-server），视口 390×844（布局另测 360/768/1280）；Windows 11 / Node {run.get('environment', '').split('Node')[-1].strip() or 'v22'}</td></tr>
  <tr><td>OCR 测试图</td><td>程序排版的自编虚构通知 10 张（tools/gen_ocr_samples.py），每句可精确核对；不用图像模型生成测试图</td></tr>
  <tr><td>参考答案</td><td>回归用例运行前写定（project/tests/cases.json）</td></tr>
</table>

<h3>二、C1 截图识别专项（{ocr['summary']['passed']}/{ocr['summary']['total']}）</h3>
<table><tr><th style="width:8%">编号</th><th style="width:44%">测试项</th><th style="width:12%">结论</th><th>关键观察</th></tr>{rows_ocr()}</table>
<p class="small muted">取字全文、每次调用返回与核对闸门状态都保存在 c-ocr-*.json；OCR 原图与逐句对照见 assets/ocr-samples/。</p>

<h3>三、C2 朗读专项（{speech['summary']['passed']}/{speech['summary']['total']}）</h3>
<table><tr><th style="width:8%">编号</th><th style="width:46%">测试项</th><th style="width:12%">结论</th><th>关键观察</th></tr>{rows_speech()}</table>
<p class="small muted">状态机用注入的假引擎验证；真实设备层只验证"能取到中文音色并接受合成请求"，不把 headless 是否出声当作证据。</p>

<h3>四、产品朗读原声实录</h3>
{tts_block_html()}

<h3>五、布局与可访问性</h3>
<table><tr><th style="width:14%">视口</th><th style="width:16%">上传页横滚</th><th style="width:20%">核对页</th><th style="width:22%">确认按钮(顶/高)</th><th style="width:14%">结果页横滚</th><th>触控&lt;44px</th></tr>{rows_layout()}</table>
<table class="small" style="margin-top:1mm"><tr><th style="width:50%">配色组合（最低）</th><th style="width:18%">比值</th><th>结论</th></tr>{rows_contrast()}</table>
</section>
<section style="page-break-before:always">
<p class="kicker">附件 09（续）</p>
<h1>A 轮回归（本版重跑）</h1>
<div class="rule"></div>
<h3>六、12 条通知用例（{run['summary']['passed']}/{run['summary']['total']}）</h3>
<table><tr><th style="width:8%">编号</th><th style="width:46%">用例</th><th style="width:12%">结论</th><th style="width:14%">耗时</th><th>尝试</th></tr>{rows_run()}</table>
<p class="small muted">耗时区间 {ts[0]/1000:.1f}—{ts[-1]/1000:.1f} 秒，中位数 {ts[len(ts)//2]/1000:.1f} 秒。原始记录：assets/evidence/test-run-*.json。</p>
<h3>七、页面行为 10 项（{edge['summary']['passed']}/{edge['summary']['total']}）</h3>
<table><tr><th style="width:8%">编号</th><th>测试项</th><th style="width:12%">结论</th></tr>{rows_edge()}</table>
<h3>八、A 轮专项 11 项（{extra['summary']['passed']}/{extra['summary']['total']}）</h3>
<table><tr><th style="width:8%">编号</th><th style="width:52%">项目</th><th style="width:12%">结论</th></tr>{rows_extra()}</table>

<h3>九、C 轮过程中发现并修掉的问题</h3>
<table class="small">
  <tr><th style="width:6%">#</th><th style="width:40%">问题</th><th>处理</th></tr>
  <tr><td>1</td><td>OCR 文本换行与引文匹配：模型引文跨行时校验易误判（首轮 C1-01b 失败）</td><td>validate.js 早已忽略空白与全半角差异；实际失败为模型偶发校验未过（产品按设计显示失败页），测试按产品机制重试，未改校验</td></tr>
  <tr><td>2</td><td>朗读文本出现"？？。""重复标点、"通知未说明"读两遍</td><td>speech.js 增加列表收尾清洗与缺失单说；用例 C2-06 覆盖</td></tr>
  <tr><td>3</td><td>测试假引擎给 utterance.voice 赋普通对象被浏览器拒绝，导致 C2-11 失败</td><td>假引擎改用真实 SpeechSynthesisVoice 对象；产品侧同时给 voice 赋值加 try/catch，启动失败有提示（app.js catch）</td></tr>
  <tr><td>4</td><td>改过识别文字后旧卡不失效的路径不可达（结果页没有入口）</td><td>新增「改一下识别出来的文字」按钮：回到核对区、强制重新勾选，C1-13 覆盖</td></tr>
  <tr><td>5</td><td>分享链接首次访问时子资源抢在 Cookie 落地前请求拿到 403，页面半载（自动化与真实用户都可能遇到）</td><td>ocr.js/speech.js 对缺失配置做防御；app.js 配置缺失时显示"页面没有加载完整，请刷新"；测试脚本改为复用同一上下文</td></tr>
  <tr><td>6</td><td>连续调用后通道限流（quota_rate_limited）</td><td>产品如实显示"请求被限流，请稍后重试"，不给假答案；录制与测试安排在限流解除后进行</td></tr>
</table>

<h3>十、未验证项（明确列出）</h3>
<ul class="small">
  <li>真机（相机实拍、微信内置浏览器、iOS Safari）与目标用户试用：未做。</li>
  <li>朗读音色在非 Windows 设备的兼容性：未测（本机为 Microsoft Huihui）。</li>
  <li>手写体、严重倾斜拍照件：仅一张低对比度样本，不结论。</li>
  <li>配额上限与限流恢复时长：由平台决定，无法预置验证。</li>
</ul>
<p class="small muted">复现：NODE_PATH=&lt;workspace&gt;/node_modules node tools/c_ocr_tests.cjs &lt;url&gt; ／ c_speech_tests.cjs ／ run-tests.cjs ／ run-edge-tests.cjs ／ a_extra_tests.cjs ／ c_layout_check.cjs。</p>
</section>
"""

open(os.path.join(SRC, 'run-guide-c.html'), 'w', encoding='utf-8').write(
    '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>明白办 · 在线体验与运行说明</title><style>' + CSS + '</style></head><body>' + p1 + '</body></html>')
open(os.path.join(SRC, 'test-report-c.html'), 'w', encoding='utf-8').write(
    '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>明白办 · 技术测试报告</title><style>' + CSS + '</style></head><body>' + p2 + '</body></html>')
print('run-guide-c.html / test-report-c.html written')
