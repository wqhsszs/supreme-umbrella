# -*- coding: utf-8 -*-
"""生成 08 运行说明 与 09 测试报告 的 HTML（随后由 Edge 打印为 PDF）"""
import json, os, io

BASE = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(BASE, 'delivery')
EV = os.path.join(D, 'assets', 'evidence')
SRC = os.path.join(D, 'sources')

run = json.load(open(os.path.join(EV, 'test-run-latest.json'), encoding='utf-8'))
edge = json.load(open(os.path.join(EV, 'edge-run-latest.json'), encoding='utf-8'))
extra = json.load(open(os.path.join(EV, 'a-extra-latest.json'), encoding='utf-8'))
audio = json.load(open(os.path.join(D, 'assets', 'audio', 'audio-timing.json'), encoding='utf-8'))

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

def esc(s): return str(s if s is not None else '').replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')

# ---------------- 08 ----------------
URL = 'https://mingbaiban-42482.app.workbuddy.host/?sharecode=QCZF2UKNAG'
p1 = f"""
<p class="kicker">附件 08</p>
<h1>在线体验与运行说明</h1>
<div class="rule"></div>
<div class="box ok">
  <b>预览地址：</b><a href="{URL}">https://mingbaiban-42482.app.workbuddy.host/</a><br>
  <span class="small">无需注册、无需登录。手机与电脑都能用。</span>
</div>
<h3>一、怎么试（3 分钟）</h3>
<ol class="small" style="padding-left:5mm">
  <li>打开地址，点首页「示例一 · 手机使用指导」。</li>
  <li>点「整理成行动卡」，等 3—15 秒（真实模型在处理）。</li>
  <li>看结论卡下面的「谁适用」「何时、何地」——注意报名截止与活动开始是两个时间，地点分别是一楼服务台、二楼活动室。</li>
  <li>点任意一项下面的「对照通知原文」，能看到通知里的原句。</li>
  <li>点「复制行动卡，发给家人」，可粘贴到聊天里。</li>
</ol>
<h3>二、版本怎么核对</h3>
<p class="small">控制台执行 <code>window.MBB_CONFIG.appVersion</code>，应返回 <code>1.2.0-b2</code>。页面页脚也会显示本次实际使用的模型名与耗时。</p>
<h3>三、真实模型调用的条件</h3>
<table>
  <tr><th style="width:26%">项目</th><th>说明</th></tr>
  <tr><td>通道</td><td>WorkBuddy 云服务免密钥通道；浏览器直连数据面，服务端按 Origin 校验</td></tr>
  <tr><td>运行时模型</td><td><code>deepseek-v4.1-flash</code>（模型列表接口读取后选用）</td></tr>
  <tr><td>网络</td><td>需要联网；模型调用在浏览器端直接发生</td></tr>
  <tr><td>超时与重试</td><td>单次 45 秒；失败最多重试 1 次（网络瞬断也重试 1 次）</td></tr>
  <tr><td>域名限制</td><td>换域名或本地 <code>file://</code> 打开时，模型调用会被服务端拒绝，页面显示「AI 服务还没连接上」——这是设计行为</td></tr>
  <tr><td>配额</td><td>由平台侧决定；用尽时页面明确提示，不给假答案</td></tr>
</table>
<h3>四、原始输入与隐私边界</h3>
<ul class="small">
  <li>通知原文只用于本次请求，<b>不建账号、不建历史库、不主动写日志</b>，刷新页面即清空。</li>
  <li>模型服务由平台托管，其服务端可能按平台规则处理请求数据，这部分不在本产品控制范围，因此<b>不承诺“绝不上传/绝不保留”</b>。</li>
  <li>请不要把身份证号、银行卡号、手机号等敏感信息贴进来。</li>
  <li>页面不加载第三方统计或广告脚本；除模型通道与 CDN 上的 SDK 外无外部请求。</li>
</ul>
<h3>五、已验证环境与未验证项</h3>
<table class="small">
  <tr><th style="width:46%">已验证</th><th>说明</th></tr>
  <tr><td>公网地址可访问</td><td>无头浏览器从外部加载成功，非静态占位页</td></tr>
  <tr><td>新输入可真实调用模型</td><td>12 条用例均返回真实结果，耗时与 token 用量已记录</td></tr>
  <tr><td>主要交互可用</td><td>输入、样例、整理、对照原文、勾选、复制、换一条均实测</td></tr>
  <tr><td>四档视口布局</td><td>360 / 390 / 768 / 1280，无横向滚动</td></tr>
</table>
<table class="small">
  <tr><th style="width:46%">未验证</th><th>原因</th></tr>
  <tr><td>真机（长辈实际手机）</td><td>仅桌面浏览器模拟视口，未在真实手机运行</td></tr>
  <tr><td>微信内置浏览器</td><td>未实测</td></tr>
  <tr><td>真人使用效果</td><td>尚未开展试用，无数据</td></tr>
  <tr><td>长期可用性</td><td>平台配额与链接有效期不由本项目控制</td></tr>
</table>
"""

p2 = f"""
<p class="kicker">附件 08（续）</p>
<h1>本地运行与部署</h1>
<div class="rule"></div>
<h3>一、本地看界面</h3>
<div class="box small"><code>cd upgrades/B/project</code><br><code>python3 -m http.server 8123 --bind 127.0.0.1</code><br>打开 <code>http://127.0.0.1:8123/</code></div>
<p class="small muted">本地只能看布局与交互，点「整理成行动卡」会因 Origin 不匹配而失败——这不是 bug。</p>
<h3>二、部署要点（踩过的坑）</h3>
<ul class="small">
  <li><b>必须复用同一应用</b>：新建应用会换域名，模型通道 Origin 不匹配，所有调用被拒。</li>
  <li><b>静态资源带版本号</b>：<code>index.html</code> 里的 <code>?v=1.2.0-b2</code> 是 CDN 缓存键；改前端必须同步改，否则会出现「HTML 新、JS 旧」的混合状态。</li>
  <li><b>发布后等传播</b>：同一域名在不同节点短时可能返回不同版本，连续刷新 5 次核对方可。</li>
  <li><b>测试脚本要等就绪</b>：<code>tools_tests/*.cjs</code> 会等待并核对 <code>appVersion</code> 再开始。</li>
</ul>
<h3>三、文件结构（本轮工程）</h3>
<table class="small">
  <tr><th style="width:34%">路径</th><th>作用</th></tr>
  <tr><td><code>project/index.html</code> <code>about.html</code></td><td>产品页面（A 轮改版，B 轮小修）</td></tr>
  <tr><td><code>project/css/app.css</code></td><td>暖社区视觉、响应式、状态样式</td></tr>
  <tr><td><code>project/js/{{config,llm,validate,app}}.js</code></td><td>配置 / 模型调用 / 校验 / 渲染与状态机</td></tr>
  <tr><td><code>project/prompts/system-prompt.txt</code></td><td>系统提示词（运行时读取，单一来源）</td></tr>
  <tr><td><code>project/tests/cases.json</code></td><td>12 条用例与参考答案</td></tr>
  <tr><td><code>tools_record.cjs</code></td><td>CDP 录屏脚本（7 段，按旁白时长配速）</td></tr>
  <tr><td><code>tools_make_video.py</code></td><td>逐帧排版 + 音轨拼接 + 字幕生成</td></tr>
  <tr><td><code>tools_make_docx.py</code></td><td>生成可编辑 Word</td></tr>
  <tr><td><code>delivery/sources/</code></td><td>说明书 HTML、两张信息图 HTML、旁白稿、封面 HTML、时间线</td></tr>
</table>
<h3>四、重新生成</h3>
<div class="box small">
  录屏：<code>node tools_record.cjs &lt;url&gt; 1.2.0-b2</code><br>
  成片：<code>python tools_make_video.py</code>（依赖 delivery/assets/audio 与 recordings）<br>
  说明书：<code>node tools_pdf.cjs delivery/sources/manual-b.html delivery/01_明白办_产品说明书.pdf</code><br>
  Word：<code>python tools_make_docx.py</code>
</div>
"""

html08 = f"""<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>明白办 · 在线体验与运行说明</title><style>{CSS}</style></head><body>
<section>{p1}</section><section style="page-break-before:always">{p2}</section></body></html>"""
io.open(os.path.join(SRC, 'run-guide-b.html'), 'w', encoding='utf-8').write(html08)

# ---------------- 09 ----------------
ts = sorted(r['elapsedMs'] for r in run['results'])
rows = ''.join(
    f"<tr><td>{esc(r['id'])}</td><td>{esc(r['name'])}</td><td class='ok'>{esc(r['status'])}</td>"
    f"<td>{r['elapsedMs']/1000:.1f}s</td><td>{r['productResult'].get('attempts',1)}</td></tr>"
    for r in run['results'])
erows = ''.join(f"<tr><td>{esc(r['id'])}</td><td>{esc(r['name'])}</td><td class='ok'>{esc(r['status'])}</td></tr>"
                for r in edge['results'])
xrows = ''.join(f"<tr><td>{esc(r['id'])}</td><td>{esc(r['name'])}</td><td class='ok'>{esc(r['status'])}</td>"
                f"<td>{esc(str(r.get('detail',''))[:80])}</td></tr>" for r in extra['results'])

p1 = f"""
<p class="kicker">附件 09</p>
<h1>技术测试报告（B 轮）</h1>
<div class="rule"></div>
<div class="box ok small">
  <b>被测版本 v1.2.0-b2</b>，线上真实模型调用。<br>
  12 条通知用例 <b>{run['summary']['passed']}/{run['summary']['total']} 通过</b>；
  页面行为 10 项 <b>{edge['summary']['passed']}/{edge['summary']['total']} 通过</b>；
  A 轮专项 11 项 <b>{extra['summary']['passed']}/{extra['summary']['total']} 通过</b>。<br>
  <b>未开展</b>：目标用户真人试用、真机测试。本报告不代表"任何输入都不会出错"。
</div>
<h3>一、环境与对象</h3>
<table class="small">
  <tr><th style="width:24%">项目</th><th>内容</th></tr>
  <tr><td>执行时间</td><td>{esc(run['runAt'])}（UTC）</td></tr>
  <tr><td>被测版本</td><td>v1.2.0-b2；{esc(run['url'])}</td></tr>
  <tr><td>运行时模型</td><td>{esc(run['runtimeModelPicked']['id'])}（{esc(run['runtimeModelPicked']['name'])}）</td></tr>
  <tr><td>浏览器</td><td>{esc(run['browser'])}；{esc(run['environment'])}</td></tr>
  <tr><td>参考答案</td><td>运行产品前写定，见 project/tests/cases.json（含 A 轮修订痕迹）</td></tr>
</table>
<h3>二、12 条通知用例</h3>
<table><tr><th style="width:8%">编号</th><th style="width:46%">用例</th><th style="width:12%">结论</th><th style="width:14%">耗时</th><th>尝试</th></tr>{rows}</table>
<p class="small muted">耗时区间 {ts[0]/1000:.1f}—{ts[-1]/1000:.1f} 秒，中位数 {ts[len(ts)//2]/1000:.1f} 秒。原始记录：assets/evidence/test-run-*.json。</p>
<h3>三、页面行为 10 项</h3>
<table><tr><th style="width:8%">编号</th><th>测试项</th><th style="width:12%">结论</th></tr>{erows}</table>
<h3>四、A 轮专项 11 项</h3>
<table><tr><th style="width:8%">编号</th><th style="width:40%">项目</th><th style="width:12%">结论</th><th>观察</th></tr>{xrows}</table>
"""

p2 = """
<p class="kicker">附件 09（续）</p>
<h1>本轮修复与未验证项</h1>
<div class="rule"></div>
<h3>五、B 轮发现并修掉的问题</h3>
<table class="small">
  <tr><th style="width:8%">#</th><th style="width:36%">问题</th><th>处理</th></tr>
  <tr><td>1</td><td>同一时间项的"时间引文"与"地点引文"重复时，证据框里出现两条一模一样的原文</td><td>合并时按文本去重；版本升到 b2 并重录、重新合成</td></tr>
  <tr><td>2</td><td>视频字幕超过两行被截断（"地点也分开标着"被切）</td><td>字幕按宽度自适应字号，最多三行</td></tr>
  <tr><td>3</td><td>成片为 yuvj420p（全色域），部分播放器偏色</td><td>重编码为 yuv420p（tv range）</td></tr>
  <tr><td>4</td><td>首次录屏停顿过短，画面比旁白快，观感像快进</td><td>录屏按旁白时长配速（7 段各自补到目标时长），并给长段落加 3.2 秒静音补偿</td></tr>
  <tr><td>5</td><td>部署后 CDN 节点短时返回新旧混合资源</td><td>静态资源加 ?v= 版本键；测试与录屏脚本先核对 appVersion</td></tr>
</table>
<p class="small muted">第 1 条属于产品缺陷（已修）；第 2—4 条属于制作缺陷（已修）；第 5 条属于部署环境问题（已规避）。</p>
<h3>六、未验证项（明确列出）</h3>
<ul class="small">
  <li><b>未做真机测试</b>：360/390/768/1280 均为桌面浏览器模拟视口。</li>
  <li><b>未做真人试用</b>：没有长辈或志愿者使用记录，不提供任何效果数据。</li>
  <li><b>未测屏幕阅读器</b>：只做了语义标签与 alt 文本的人工检查。</li>
  <li><b>未测微信内置浏览器</b>：长辈常用环境，尚未验证。</li>
  <li><b>模型输出有波动</b>：同一输入多次调用措辞会变；本报告是某一时刻的真实结果。</li>
  <li><b>旁白听感</b>：系统合成音色，偏朗读腔，不如商业 TTS 自然。</li>
</ul>
<h3>七、复现</h3>
<div class="box small">
<code>export NODE_PATH=&lt;node workspace&gt;/node_modules</code><br>
<code>node tools_tests/run-tests.cjs &lt;线上地址&gt;</code><br>
<code>node tools_tests/run-edge-tests.cjs &lt;线上地址&gt;</code><br>
<code>node tools_tests/a_extra_tests.cjs &lt;线上地址&gt;</code>
</div>
"""

html09 = f"""<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>明白办 · 技术测试报告</title><style>{CSS}</style></head><body>
<section>{p1}</section><section style="page-break-before:always">{p2}</section></body></html>"""
io.open(os.path.join(SRC, 'test-report-b.html'), 'w', encoding='utf-8').write(html09)
print('08/09 html ok')
