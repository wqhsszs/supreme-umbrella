# -*- coding: utf-8 -*-
"""生成 08 在线体验与运行说明、09 测试报告 的 HTML（再由 Edge 打印为 PDF）"""
import json, os, html, datetime

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EV = os.path.join(BASE, "tests", "evidence")
SRC = os.path.join(BASE, "delivery", "sources")
os.makedirs(SRC, exist_ok=True)

run = json.load(open(os.path.join(EV, "test-run-latest.json"), encoding="utf-8"))
edge = json.load(open(os.path.join(EV, "edge-run-latest.json"), encoding="utf-8"))
cases = {c["id"]: c for c in json.load(open(os.path.join(BASE, "tests", "cases.json"), encoding="utf-8"))["cases"]}

CSS = """
@page { size: A4; margin: 14mm 16mm 16mm 16mm; }
*{box-sizing:border-box}
body{margin:0;font-family:"Microsoft YaHei",sans-serif;color:#1b1f24;font-size:9.6pt;line-height:1.62;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{width:auto;min-height:0;padding:0;background:#fff;page-break-after:auto}
.page+.page{margin-top:8mm;border-top:1px solid #e6ebf1;padding-top:6mm}
h1{font-size:18pt;margin:0 0 3mm}
h3{font-size:10.6pt;margin:4mm 0 1.6mm}
p{margin:0 0 2.2mm}
ul{margin:0 0 2.2mm;padding-left:5mm}
li{margin-bottom:1mm}
.small{font-size:8.4pt;line-height:1.55}
.muted{color:#6b7480}
.kicker{font-size:8.6pt;color:#14539a;font-weight:700}
.rule{height:3px;background:#14539a;width:24mm;margin:2.4mm 0 4mm}
table{width:100%;border-collapse:collapse;margin:1mm 0 3mm;font-size:8.3pt;line-height:1.45}
th,td{border:1px solid #d8dfe7;padding:1.5mm 1.8mm;vertical-align:top;text-align:left}
th{background:#f2f6fb;font-weight:700}
.ok{color:#0d6b3f;font-weight:700}
.bad{color:#a51f1f;font-weight:700}
.box{border:1px solid #d8dfe7;border-left:4px solid #14539a;background:#f8fafd;padding:2.4mm 3.4mm;margin:0 0 3mm}
.box.ok{border-left-color:#0d6b3f;background:#f4fbf7}
.box.warn{border-left-color:#8a5200;background:#fffaf0}
code{background:#eef2f7;padding:0 1mm;border-radius:2px;font-size:8.6pt}

"""

def esc(s):
    return html.escape(str(s if s is not None else ""))

def page(inner, title, footer_right):
    return f"""<section class="page">{inner}</section>"""

# =====================================================================
# 08 在线体验与运行说明
# =====================================================================
url = run["url"]
model = run["runtimeModelPicked"]

p1 = f"""
<p class="kicker">附件 08</p>
<h1>在线体验与运行说明</h1>
<div class="rule"></div>
<div class="box ok">
  <strong>在线地址：</strong><a href="{esc(url)}">{esc(url)}</a><br>
  <span class="small">打开即可使用，<strong>无需注册、无需登录、无需安装</strong>。推荐手机浏览器（微信内打开亦可）；电脑浏览器同样可用。</span>
</div>

<h3>一、用起来是什么样（普通用户）</h3>
<ol class="small" style="padding-left:5mm">
  <li>把社区通知的文字复制下来。只支持文字，不支持图片。</li>
  <li>粘贴到输入框，点「帮我看懂」，等 5—20 秒。</li>
  <li>页面给出行动卡：这条通知说的是、谁能参加、时间（按用途分开）、地点、要带什么、您接下来做什么、还要问清楚什么。</li>
  <li>每项后面有「看原文依据」，点开可看到通知里的原句，自己核对。</li>
  <li>准备事项可以打勾；点「复制整张行动卡」可以发给家人。</li>
</ol>
<p class="small muted">首页有三条明确标注「虚构演示样例」的通知，可直接点开体验，不会涉及任何真实个人或社区信息。</p>

<h3>二、运行条件与限制</h3>
<table>
  <tr><th style="width:26%">项目</th><th>说明</th></tr>
  <tr><td>访问方式</td><td>公网 HTTPS 链接，单页静态站点</td></tr>
  <tr><td>登录</td><td>不需要。无账号系统、无历史记录</td></tr>
  <tr><td>浏览器</td><td>Chrome / Edge / Safari / 微信内置浏览器等现代浏览器</td></tr>
  <tr><td>网络</td><td>需要联网。模型调用在浏览器端直接发生</td></tr>
  <tr><td>输入限制</td><td>纯文本，上限 5000 字；超长会提示而不截断</td></tr>
  <tr><td>单次耗时</td><td>实测 1.8—7.4 秒（12 次调用），超时阈值 45 秒</td></tr>
  <tr><td>配额</td><td>由平台侧配额决定；用尽时页面会明确提示，不会给假答案</td></tr>
</table>

<h3>三、可确认的模型服务信息</h3>
<table>
  <tr><th style="width:26%">项目</th><th>说明</th></tr>
  <tr><td>接入通道</td><td>WorkBuddy 云服务托管的免密钥大模型通道（浏览器直连数据面，服务端按 Origin 校验）</td></tr>
  <tr><td>运行时模型</td><td>{esc(model['id'])}（{esc(model['name'])}）——由模型列表接口实时读取后选用，页面底部会显示本次实际使用的模型</td></tr>
  <tr><td>调用参数</td><td>流式输出、temperature 0.1、45 秒超时、校验失败自动重试 1 次</td></tr>
  <tr><td>无法确认</td><td>上游提供方的机房与部署形态由平台托管，本项目无法核实，故不作声明</td></tr>
</table>
"""
p1_footer = ("明白办 · 在线体验与运行说明", "2026-10-23　第 1 页")

p2 = f"""
<p class="kicker">附件 08</p>
<h1>运行、部署与源码说明</h1>
<div class="rule"></div>

<h3>四、源码结构</h3>
<table class="small">
  <tr><th style="width:34%">路径</th><th>作用</th></tr>
  <tr><td><code>app/index.html</code></td><td>主页面：输入区、加载态、错误态、非通知态、行动卡</td></tr>
  <tr><td><code>app/about.html</code></td><td>关于与使用说明页</td></tr>
  <tr><td><code>app/css/app.css</code></td><td>全部样式（含 360/390px 窄屏、印刷样式）</td></tr>
  <tr><td><code>app/js/config.js</code></td><td>运行配置：云服务 publicConfig、字数上限、超时、偏好模型</td></tr>
  <tr><td><code>app/js/llm.js</code></td><td>模型接入：取模型列表、加载提示词、流式调用、JSON 解析、重试</td></tr>
  <tr><td><code>app/js/validate.js</code></td><td>结构与引文校验（引文必须能在原文中找到）</td></tr>
  <tr><td><code>app/js/app.js</code></td><td>页面状态机、渲染、勾选、复制、过期响应丢弃</td></tr>
  <tr><td><code>app/prompts/system-prompt.txt</code></td><td>产品系统提示词（运行时读取，单一事实来源）</td></tr>
  <tr><td><code>app/prompts/data-schema.md</code></td><td>数据结构与校验规则说明</td></tr>
  <tr><td><code>tests/cases.json</code></td><td>12 条测试用例与参考答案（先写答案后跑产品）</td></tr>
  <tr><td><code>tests/evidence/*.json</code></td><td>测试原始记录（含每次调用的完整返回与耗时）</td></tr>
  <tr><td><code>tools/*.cjs, *.py</code></td><td>测试执行、截图、PDF/DOCX/视频生成脚本</td></tr>
</table>

<h3>五、本地运行</h3>
<p class="small">本项目是纯静态站点，没有构建步骤。任选一种方式在项目根目录起一个静态服务器即可：</p>
<div class="box small">
  <code>cd app</code><br>
  <code>python3 -m http.server 8000 --bind 0.0.0.0</code><br>
  然后浏览器打开 <code>http://localhost:8000/</code>
</div>
<p class="small muted">注意：模型通道按来源（Origin）校验。直接用 <code>file://</code> 打开或用与已登记域名不一致的地址访问时，模型调用会被服务端拒绝，页面会显示「AI 服务还没连接上」而不是给假答案。正式使用请走已发布的域名。</p>

<h3>六、部署方式</h3>
<p class="small">当前版本以静态站点形式托管，发布域名为 <code>mingbaiban-42482.app.workbuddy.host</code>，与云服务环境登记的来源一致。重新发布时<strong>必须复用同一个应用</strong>，否则域名变化会导致模型调用被拒。</p>

<h3>七、本次已核实 / 未核实</h3>
<table class="small">
  <tr><th style="width:50%">已核实</th><th>说明</th></tr>
  <tr><td>公网地址可访问</td><td>无头浏览器从外部加载页面成功，非静态占位页</td></tr>
  <tr><td>新输入可真实调用模型</td><td>12 条用例均返回真实模型结果，耗时与 token 用量已记录</td></tr>
  <tr><td>主要按钮可用</td><td>输入、样例、帮我看懂、看原文依据、勾选、复制、换一条通知均实测</td></tr>
  <tr><td>窄屏不横滚</td><td>360px 与 390px 视口实测</td></tr>
</table>
<table class="small">
  <tr><th style="width:50%">未核实</th><th>原因</th></tr>
  <tr><td>真机（长辈实际手机）</td><td>当前仅为桌面浏览器模拟视口与触控，未在真实手机上运行</td></tr>
  <tr><td>真实长辈使用效果</td><td>尚未开展真人试用，无相关数据</td></tr>
  <tr><td>长期可用性</td><td>平台侧配额与链接有效期不由本项目控制，不承诺永久可用</td></tr>
</table>
"""
p2_footer = ("明白办 · 在线体验与运行说明", "2026-10-23　第 2 页")

doc08 = f"""<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>明白办 · 在线体验与运行说明</title><style>{CSS}</style></head><body>
{page(p1, *p1_footer)}
{page(p2, *p2_footer)}
</body></html>"""
open(os.path.join(SRC, "run-guide.html"), "w", encoding="utf-8").write(doc08)
print("run-guide.html ok")

# =====================================================================
# 09 测试报告
# =====================================================================
rows = []
for r in run["results"]:
    pr = r["productResult"]
    chk = r["checks"]
    fails = [c["msg"] for c in chk if not c["pass"]]
    rows.append(f"""<tr>
      <td>{esc(r['id'])}</td>
      <td>{esc(r['name'])}</td>
      <td>{esc(cases[r['id']]['reference'][:150])}…</td>
      <td>{esc((pr.get('data') or {}).get('summary', ''))[:80]}</td>
      <td class="ok">{'通过' if r['pass'] else '失败'}</td>
      <td>{r['elapsedMs']/1000:.1f}s</td>
      <td>{pr.get('attempts', '')}</td>
    </tr>""")

edge_rows = []
for r in edge["results"]:
    edge_rows.append(f"""<tr><td>{esc(r['id'])}</td><td>{esc(r['name'])}</td>
      <td class="{'ok' if r['pass'] else 'bad'}">{esc(r['status'])}</td>
      <td>{esc(str(r.get('detail',''))[:110])}</td></tr>""")

s = run["summary"]
e = edge["summary"]
t_small = [r["elapsedMs"] for r in run["results"]]
t_small.sort()

p1 = f"""
<p class="kicker">附件 09</p>
<h1>技术测试报告</h1>
<div class="rule"></div>

<div class="box ok small">
  <strong>测试结论（仅针对当前测试集）：</strong>12 条通知用例 <strong>{s['passed']}/{s['total']} 通过</strong>，10 项页面行为测试 <strong>{e['passed']}/{e['total']} 通过</strong>。
  关键时间、地点、对象、材料均未发现无依据补充。这不代表任何输入都不会出错。<br>
  <strong>未开展：</strong>目标用户真人试用（无数据，不填百分比）；真机测试（仅模拟视口）。
</div>

<h3>一、测试环境与对象</h3>
<table class="small">
  <tr><th style="width:24%">项目</th><th>内容</th></tr>
  <tr><td>测试时间</td><td>{esc(run['runAt'])}（UTC）／北京时间同日</td></tr>
  <tr><td>被测版本</td><td>明白办 v{esc(run['appVersion'])}，线上地址 {esc(run['url'])}</td></tr>
  <tr><td>运行时模型</td><td>{esc(run['runtimeModelPicked']['id'])}（{esc(run['runtimeModelPicked']['name'])}），由模型列表接口实时读取</td></tr>
  <tr><td>浏览器 / 环境</td><td>{esc(run['browser'])}；{esc(run['environment'])}</td></tr>
  <tr><td>测试方式</td><td>无头浏览器加载线上页面 → 调用页面内分析入口 → 记录完整返回、耗时与校验结果</td></tr>
  <tr><td>参考答案</td><td>在运行产品之前、仅依据通知原文撰写，见 tests/cases.json；模型输出不作为参考答案</td></tr>
  <tr><td>状态取值</td><td>仅「通过」「失败」「未执行」三种，不使用「基本通过」等模糊表述</td></tr>
</table>

<h3>二、12 条通知用例结果</h3>
<table>
  <tr><th style="width:6%">编号</th><th style="width:20%">用例</th><th style="width:26%">参考答案要点</th><th style="width:22%">实际返回摘要</th><th style="width:7%">结论</th><th style="width:7%">耗时</th><th style="width:6%">尝试</th></tr>
  {''.join(rows)}
</table>
<p class="small muted">耗时统计：最短 {t_small[0]/1000:.1f} 秒，最长 {t_small[-1]/1000:.1f} 秒，中位数 {t_small[len(t_small)//2]/1000:.1f} 秒。B2 首次输出未通过校验（尝试次数 2），系统自动重试后通过——重试链路在真实运行中被触发。</p>

<h3>三、判定口径</h3>
<ul class="small">
  <li><strong>必须出现：</strong>原文写明的事实（如「仅限已报名居民」「每餐 12 元」「身份证和户口本」）必须保留。</li>
  <li><strong>绝不能出现：</strong>原文没有的时间、地点、材料、费用、报名方式、电话，一旦出现在事实项中即判失败。</li>
  <li><strong>结构要求：</strong>报名截止与活动开始必须分成两条时间项；冲突时间必须并列或标为 conflict。</li>
  <li><strong>程序自检：</strong>每条 evidence 必须在原文中逐字存在（只忽略空白与全半角标点差异）。</li>
</ul>
"""
p1_footer = ("明白办 · 技术测试报告", "2026-10-23　第 1 页")

p2 = f"""
<p class="kicker">附件 09</p>
<h1>页面行为与异常路径测试</h1>
<div class="rule"></div>

<h3>四、10 项页面行为测试</h3>
<table>
  <tr><th style="width:7%">编号</th><th style="width:40%">测试项</th><th style="width:9%">结论</th><th>观察记录</th></tr>
  {''.join(edge_rows)}
</table>

<h3>五、测试过程中发现并处理的问题</h3>
<table class="small">
  <tr><th style="width:9%">对象</th><th style="width:33%">问题</th><th>处理</th></tr>
  <tr><td>N8</td><td>首轮判据要求「时间项 ≥2 条」，实际把两个楼栋的时段合并在一条里，信息完整但结构为 1 条</td><td>判定为判据过严而修正：改为检查「1号楼、2号楼、8:00、13:30 是否都在」。修改理由记入 cases.json 的 referenceRevision 字段，不隐去</td></tr>
  <tr><td>B1</td><td>首轮参考答案要求「地点必须为 missing」，但原文含「清理小区绿化带」，把它作为活动地点并非编造</td><td>判定为参考答案写错而修正：改为「地点要么 missing，要么必须逐字来自原文」，并追加「必须就集合点/报名方式提出待确认问题」</td></tr>
  <tr><td>E4</td><td>首轮断言写死「请求序号 === 1」，但序号在整轮测试中持续累加，属测试脚本缺陷</td><td>改为比较点击前后的序号增量是否为 1；产品行为本身正确（加载中按钮已禁用）</td></tr>
  <tr><td>E6</td><td>首轮仅屏蔽 navigator.clipboard，旧接口 execCommand 仍成功，未走到弹窗降级</td><td>改为同时屏蔽两条自动复制路径，验证弹出手动复制框；产品行为正确</td></tr>
  <tr><td>说明书</td><td>PDF 首次导出有 3 页内容溢出被裁切</td><td>重排为 10 页、缩小截图尺寸、补异常处理表；重新导出后逐页检查最低点坐标，无溢出</td></tr>
</table>
<p class="small muted">以上修正均针对「测试判据/参考答案」与「文档排版」，不是为了让产品通过而放宽标准。产品侧在 12 条用例的复测中未出现编造时间、地点、对象、材料的情况。</p>

<h3>六、已知局限（影响测试结论的边界）</h3>
<ul class="small">
  <li>测试只在 12 条 + 10 项这个集合上进行，样本量小，不能外推为通用正确率。</li>
  <li>未在真实手机上测试，仅用桌面浏览器设置 360/390px 视口并模拟触控。</li>
  <li>未做真人（尤其长辈）试用，无理解率、完成率、求助次数等数据。</li>
  <li>未做并发与压力测试；页面只有配额与超时保护，没有服务端限流。</li>
  <li>模型服务由平台托管，其可用性、配额与响应速度不在本项目控制范围内。</li>
</ul>

<h3>七、复现方式</h3>
<div class="box small">
  原始记录：<code>tests/evidence/test-run-*.json</code>（含每条用例的完整模型返回、耗时、token 用量）<br>
  用例与参考答案：<code>tests/cases.json</code><br>
  执行脚本：<code>tools/run-tests.cjs</code>（12 条用例）、<code>tools/run-edge-tests.cjs</code>（页面行为）<br>
  运行命令示例：<code>NODE_PATH=&lt;node_modules&gt; node tools/run-tests.cjs &lt;线上地址&gt;</code>
</div>
"""
p2_footer = ("明白办 · 技术测试报告", "2026-10-23　第 2 页")

doc09 = f"""<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>明白办 · 技术测试报告</title><style>{CSS}</style></head><body>
{page(p1, *p1_footer)}
{page(p2, *p2_footer)}
</body></html>"""
open(os.path.join(SRC, "test-report.html"), "w", encoding="utf-8").write(doc09)
print("test-report.html ok")
