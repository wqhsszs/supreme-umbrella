# -*- coding: utf-8 -*-
"""为界面分镜版视频重配 S7（不声称视频里有产品朗读原声）。"""
import contextlib, os, wave, win32com.client as w
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE, 'delivery', 'assets', 'audio', 'S7s.wav')
TEXT = '想给长辈听，就点「读给家人听」。这是这台设备自带的中文语音，不是云端配音。声音能不能听清，目前还没有真人试听记录。'
voice = w.Dispatch('SAPI.SpVoice')
for v in voice.GetVoices():
    if 'Huihui' in v.GetDescription():
        voice.Voice = v
voice.Rate = -1; voice.Volume = 100
fs = w.Dispatch('SAPI.SpFileStream'); fs.Open(os.path.abspath(OUT), 3, False)
voice.AudioOutputStream = fs; voice.Speak(TEXT); fs.Close()
with contextlib.closing(wave.open(OUT, 'rb')) as f:
    print('S7s', round(f.getnframes()/float(f.getframerate()), 2), 's')
