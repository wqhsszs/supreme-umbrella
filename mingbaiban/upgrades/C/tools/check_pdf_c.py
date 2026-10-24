# -*- coding: utf-8 -*-
"""检查三份 PDF 的页数、内容溢出与六项内容，并把关键页渲染成 PNG。"""
import os

import pymupdf

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(BASE, 'delivery')

for f in ['01_明白办_产品说明书.pdf', '08_明白办_在线体验与运行说明.pdf', '09_明白办_测试报告.pdf']:
    p = os.path.join(D, f)
    d = pymupdf.open(p)
    print(f, len(d), '页')
    for i, pg in enumerate(d, 1):
        ymax = max([b[3] for b in pg.get_text('blocks')], default=0)
        for im in pg.get_image_info():
            ymax = max(ymax, im['bbox'][3])
        if ymax > 830:
            print('  ⚠ p%d 内容到 %.0f（可能溢出）' % (i, ymax))
    if '01_' in f:
        full = ''.join(pg.get_text() for pg in d)
        for k in ['产品概述', '目标用户', '核心功能', 'AI 的角色与价值', '技术实现思路', '应用场景示例']:
            print('  ', k, '✓' if k in full else '✗')
        for i in [1, 4, 8]:
            d[i - 1].get_pixmap(dpi=90).save(os.path.join(D, 'assets', 'screenshots', '_pdf-p%d.png' % i))
        print('   关键页已渲染')
    d.close()
print('pdf check done')
