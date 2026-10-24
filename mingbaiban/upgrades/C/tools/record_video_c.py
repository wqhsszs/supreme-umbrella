# -*- coding: utf-8 -*-
"""只做录制：环回录音 + 有界面 Edge 录屏，结束后写入 rec-meta.json。"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_video_c import record, TMP  # noqa: E402

if __name__ == '__main__':
    start, rate, ch = record()
    json.dump([start, rate, ch], open(os.path.join(TMP, 'rec-meta.json'), 'w', encoding='utf-8'))
    print('rec-meta written', start, rate, ch)
