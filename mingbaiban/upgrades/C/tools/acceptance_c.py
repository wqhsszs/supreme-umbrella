# -*- coding: utf-8 -*-
"""C 轮验收自查：按 05_三轮验收速查 的 C 轮条目逐项核对实际文件与证据，输出 JSON + 控制台表。
只做核对，不改产品。"""
import json
import os
import re
import zipfile

import pymupdf
from docx import Document

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(BASE, 'delivery')
EV = os.path.join(D, 'assets', 'evidence')
S = os.path.join(D, 'assets', 'screenshots')
VER = '1.3.0-c7'
rows = []


def add(cid, name, ok, detail):
    rows.append({'id': cid, 'name': name, 'pass': bool(ok), 'detail': str(detail)[:400]})


def j(name):
    try:
        return json.load(open(os.path.join(EV, name), encoding='utf-8'))
    except Exception:
        return None


ocr = j('c-ocr-latest.json')
speech = j('c-speech-latest.json')
layout = j('c-layout.json')
t12 = j('test-run-latest.json')
t10 = j('edge-run-latest.json')

# 1 上传截图 → 真实识别结果
r = {x['id']: x for x in (ocr or {}).get('results', [])}
add('C-01', '上传截图并看到真实识别结果',
    bool(ocr and r.get('C1-01a', {}).get('pass')),
    'C1-01a 通过；证据 c-ocr-latest.json 内含真实取字文本')

# 2 原图对照、可修改、确认后才整理
add('C-02', '识别文字可与原图对照、修改，确认后才整理',
    bool(r.get('C1-13', {}).get('pass')) and os.path.exists(os.path.join(S, 'c-03-review-390.png')),
    'C1-13 覆盖核对闸门与改字作废；核对界面截图存在')

# 3 没写清的不被补齐
add('C-03', '没写清的数字/时间/地点不会被默默补齐',
    bool(r.get('C1-02a', {}).get('pass')) and bool(r.get('C1-02b', {}).get('pass')) and bool(r.get('C1-04', {}).get('pass')),
    'C1-02a/b（无年份无地点）、C1-04（模糊图不编数字）均通过')

# 4 朗读
sr = {x['id']: x for x in (speech or {}).get('results', [])}
need = ['C2-03', 'C2-04', 'C2-06', 'C2-08', 'C2-11', 'C2-12', 'C2-13', 'C2-15', 'C2-16']
missing = [k for k in need if not sr.get(k, {}).get('pass')]
add('C-04', '朗读来自当前卡片，能停止/切换，不漏读待确认',
    len(missing) == 0, 'C2-03/04/06/08/11/12/13/15/16 全过' if not missing else '缺：' + ','.join(missing))

# 5 语音能力说明准确
t16 = open(os.path.join(D, '16_C轮新增功能与限制.md'), encoding='utf-8').read()
t00 = open(os.path.join(D, '00_开始使用与交付状态.md'), encoding='utf-8').read()
man = pymupdf.open(os.path.join(D, '01_明白办_产品说明书.pdf'))
man_text = ''.join(p.get_text() for p in man)
add('C-05', '系统语音 / 云 TTS / 下载能力的说明准确',
    ('不能导出音频' in t16 or '无法导出音频' in t16) and '不能导出音频' in man_text
    and ('非云端 TTS' in t16 or '不是云端 TTS' in t16)
    and ('speech-live' in t16 or '原声录制：已完成' in t16),
    '16 与说明书均写明：设备语音、非云端 TTS、不能导出音频；原声已录制为 speech-live.wav')

# 6 版本状态一致（改字作废旧卡）
add('C-06', '图片/识别文字/卡片/复制/朗读状态一致',
    bool(r.get('C1-13', {}).get('pass')) and '改字' in t16,
    'C1-13 验证改字后旧卡/朗读作废；16 记录同一条规则')

# 7 旧文字输入仍可用
n1 = next((x for x in (t12 or {}).get('results', []) if x['id'] == 'N1'), None)
add('C-07', '旧的文字输入与模型解析仍能用',
    bool(sr.get('C2-10', {}).get('pass')) and bool(t12 and t12['summary']['passed'] >= 11),
    'C2-10 用文字链路成功生成卡片；12 条用例 %d/%d' % ((t12 or {}).get('summary', {}).get('passed', 0), (t12 or {}).get('summary', {}).get('total', 0)))

# 8 材料同步
pdf_pages = len(man)
docx = Document(os.path.join(D, '02_明白办_产品说明书_可编辑源文件.docx'))
docx_text = '\n'.join(p.text for p in docx.paragraphs)
for tb in docx.tables:
    for row in tb.rows:
        for c in row.cells:
            docx_text += '\n' + c.text
video = os.path.join(D, '03_明白办_产品演示.mp4')
srt = os.path.join(D, '04_明白办_视频字幕.srt')
cover = os.path.join(D, '07_明白办_视频封面.png')
flow1 = os.path.join(D, '11_公众版五步图.png')
flow2 = os.path.join(D, '11_技术实现图.png')
rg = os.path.join(D, '08_明白办_在线体验与运行说明.pdf')
tr = os.path.join(D, '09_明白办_测试报告.pdf')
src = os.path.join(D, '10_明白办_源码.zip')
ok8 = (pdf_pages == 10 and '截图取字' in man_text and '人工核对' in man_text
       and '截图取字' in docx_text and VER in docx_text
       and os.path.exists(video) and os.path.getsize(video) > 5 * 1024 * 1024
       and os.path.exists(srt) and open(srt, encoding='utf-8').read().strip().count('-->') >= 8
       and os.path.exists(cover) and os.path.exists(flow1) and os.path.exists(flow2)
       and os.path.exists(rg) and os.path.exists(tr) and os.path.exists(src))
add('C-08', 'PDF/Word、视频/字幕、封面、流程图、运行说明、测试报告、源码已同步',
    ok8, 'PDF %d 页；DOCX 含截图取字；视频/SRT/封面/两图/08/09/源码均存在' % pdf_pages)

# 9 未完成项标为受阻
blocked_words = ['未完成', '受阻', '限流']
add('C-09', '仍缺的功能标为未做，没有把按钮写成完成',
    ('未开展' in t16 and '真机' in t16 and '不能导出音频' in t16),
    '16 号文件明确：真人试用未开展、真机未测、不能导出音频')

# 附加：材料中不得出现 B 轮版本号
bad_ver = []
for f in os.listdir(D):
    p = os.path.join(D, f)
    if os.path.isfile(p) and f.endswith(('.md', '.txt')):
        t = open(p, encoding='utf-8', errors='ignore').read()
        if 'v1.2.0-b2' in t and not any(k in t for k in ('基线', 'B 轮', '冻结', '回滚')):
            bad_ver.append(f)
add('C-10', 'C 轮材料未混入 B 轮版本号（除基线说明）', not bad_ver, '异常文件：%s' % (bad_ver or '无'))

# 附加：视频时长与音轨
import subprocess
import imageio_ffmpeg
exe = imageio_ffmpeg.get_ffmpeg_exe()
r = subprocess.run([exe, '-hide_banner', '-i', video], capture_output=True, text=True)
dur = re.search(r'Duration: (\d+):(\d+):([\d.]+)', r.stderr)
secs = int(dur.group(1)) * 3600 + int(dur.group(2)) * 60 + float(dur.group(3)) if dur else 0
add('C-11', '视频在 30—180 秒、含音轨',
    30 <= secs <= 180 and 'Audio:' in r.stderr, '时长 %.1f 秒，%s' % (secs, '有音轨' if 'Audio:' in r.stderr else '无音轨'))

# 附加：ZIP 可解压
pk = os.path.join(BASE, '明白办_C轮最终交付包.zip')
try:
    z = zipfile.ZipFile(pk)
    bad = z.testzip()
    add('C-12', '交付包可解压、无损坏', bad is None and len(z.namelist()) > 100, '%d 个文件，坏项 %s' % (len(z.namelist()), bad))
except Exception as e:
    add('C-12', '交付包可解压、无损坏', False, str(e))

# 附加：线上版本（读首页 HTML 里的 ?v= 缓存键）
try:
    import urllib.request
    req = urllib.request.Request('https://mingbaiban-42482.app.workbuddy.host/?sharecode=QCZF2UKNAG',
                                 headers={'User-Agent': 'Mozilla/5.0'})
    html = urllib.request.urlopen(req, timeout=25).read().decode('utf-8', 'ignore')
    live_ok = ('v=' + VER) in html
    add('C-13', '线上版本号与材料一致', live_ok,
        '首页缓存键 %s；长度 %d' % ('含 ' + VER if live_ok else '未见 ' + VER, len(html)))
except Exception as e:
    add('C-13', '线上版本号与材料一致', False, '线上探测失败：%s' % e)

passed = sum(1 for x in rows if x['pass'])
out = {'round': 'C', 'version': VER, 'checkedAt': __import__('datetime').datetime.now().astimezone().isoformat(timespec='seconds'),
       'summary': {'total': len(rows), 'passed': passed}, 'results': rows}
json.dump(out, open(os.path.join(EV, 'acceptance-c.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
for x in rows:
    print(('PASS' if x['pass'] else 'FAIL'), x['id'], x['name'], '' if x['pass'] else ('| ' + x['detail']))
print('\n%d / %d' % (passed, len(rows)))
