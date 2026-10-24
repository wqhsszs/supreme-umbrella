# -*- coding: utf-8 -*-
"""把回归真实数字回填到说明书与 16/17 号文件的占位符。"""
import json
import os
import re

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EV = os.path.join(BASE, 'delivery', 'assets', 'evidence')


def summary(path):
    try:
        d = json.load(open(path, encoding='utf-8'))
        s = d['summary']
        text = '%d / %d 通过' % (s['passed'], s['total'])
        if s['passed'] < s['total']:
            fails = [r['id'] for r in d['results'] if not r['pass']]
            text += '（未过：%s，原因见 evidence）' % ','.join(fails)
        return text, s['passed'], s['total'], d
    except Exception as e:
        return '未取得（%s）' % e, -1, -1, None


t12, p12, n12, d12 = summary(os.path.join(EV, 'test-run-latest.json'))
t10, p10, n10, d10 = summary(os.path.join(EV, 'edge-run-latest.json'))
tx, px, nx, dx = summary(os.path.join(EV, 'a-extra-latest.json'))

# 视频时长
vid = '（见 03 视频文件与 14 清单）'
try:
    tl = json.load(open(os.path.join(BASE, 'delivery', 'sources', 'video-timeline.json'), encoding='utf-8'))
    vid = '%.0f 秒' % tl['totalSeconds']
except Exception:
    pass

fills = {'__T12__': t12, '__T10__': t10, '__TX__': tx, '__VID__': vid}
for f in ['delivery/sources/manual-c.html']:
    p = os.path.join(BASE, f)
    s = open(p, encoding='utf-8').read()
    for k, v in fills.items():
        s = s.replace(k, v)
    open(p, 'w', encoding='utf-8').write(s)
    print('filled', f, fills)

json.dump({'t12': t12, 't10': t10, 'tx': tx, 'vid': vid},
          open(os.path.join(EV, 'final-numbers.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, indent=2)
