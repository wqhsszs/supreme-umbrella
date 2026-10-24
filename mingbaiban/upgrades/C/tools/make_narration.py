# -*- coding: utf-8 -*-
"""用本机 SAPI5 合成 C 轮旁白（不是云端 TTS，材料里如实标注）。"""
import contextlib
import json
import os
import wave

import win32com.client as w

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'delivery', 'sources', 'narration.json')
OUT = os.path.join(ROOT, 'delivery', 'assets', 'audio')
os.makedirs(OUT, exist_ok=True)

spec = json.load(open(SRC, encoding='utf-8'))
voice = w.Dispatch('SAPI.SpVoice')
target = None
for v in voice.GetVoices():
    if 'Huihui' in v.GetDescription():
        target = v
if target is None:
    raise SystemExit('未找到中文 Huihui 音色')
voice.Voice = target
voice.Rate = spec.get('rate', -1)
voice.Volume = spec.get('volume', 100)


def dur(p):
    with contextlib.closing(wave.open(p, 'rb')) as f:
        return f.getnframes() / float(f.getframerate())


rows = []
for seg in spec['segments']:
    p = os.path.join(OUT, seg['id'] + '.wav')
    fs = w.Dispatch('SAPI.SpFileStream')
    fs.Open(os.path.abspath(p), 3, False)
    voice.AudioOutputStream = fs
    voice.Speak(seg['text'])
    fs.Close()
    d = round(dur(p), 2)
    rows.append({'id': seg['id'], 'text': seg['text'], 'file': seg['id'] + '.wav', 'seconds': d})
    print(seg['id'], d, 's', seg['text'][:20])

total = round(sum(r['seconds'] for r in rows), 2)
out = {'engine': spec['engine'], 'voice': spec['voice'], 'rate': spec['rate'],
       'volume': spec['volume'], 'segments': rows, 'totalSeconds': total}
json.dump(out, open(os.path.join(OUT, 'narration-timing.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, indent=2)
print('TOTAL', total, 's')
