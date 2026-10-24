# -*- coding: utf-8 -*-
"""录制产品内朗读的真实声音（C2 证据）

做法：WASAPI 环回录音（pyaudiowpatch）同时启动有界面的 Edge，
让页面真实调用 Web Speech API 朗读三张卡，再按时间戳切片成三个 WAV。

为什么这样做：
- 产品里的朗读是浏览器/系统语音，不能导出音频文件，所以只能录系统的输出；
- headless 浏览器没有音频输出，必须用有界面窗口；
- 录到的是这台机器上真实播放的声音，不是把文本另交给别的 TTS 合成后冒充产品朗读。

输出：
  delivery/assets/tts-samples/speech-full.wav / speech-missing.wav / speech-conflict.wav
  delivery/assets/tts-samples/speech-recordings.json（时长、音量、对应文本）
"""
import json
import os
import subprocess
import threading
import time
import wave

import imageio_ffmpeg
import pyaudiowpatch as pa

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TMP = os.path.join(ROOT, '_tmp')
OUTDIR = os.path.join(ROOT, 'delivery', 'assets', 'tts-samples')
TIMELINE = os.path.join(TMP, 'speech-timeline.json')
RAW = os.path.join(TMP, 'speech-raw.wav')
URL = 'https://mingbaiban-42482.app.workbuddy.host/?sharecode=QCZF2UKNAG'

os.makedirs(TMP, exist_ok=True)
os.makedirs(OUTDIR, exist_ok=True)
if os.path.exists(TIMELINE):
    os.remove(TIMELINE)


def volume(path):
    exe = imageio_ffmpeg.get_ffmpeg_exe()
    r = subprocess.run([exe, '-hide_banner', '-i', path, '-af', 'volumedetect', '-f', 'null', '-'],
                       capture_output=True, text=True, errors='ignore')
    mean = mx = None
    duration = None
    for line in r.stderr.split('\n'):
        if 'mean_volume' in line:
            mean = float(line.split('mean_volume:')[1].replace('dB', '').strip())
        if 'max_volume' in line:
            mx = float(line.split('max_volume:')[1].replace('dB', '').strip())
        if 'Duration:' in line and duration is None:
            hh, mm, ss = line.split('Duration:')[1].split(',')[0].strip().split(':')
            duration = int(hh) * 3600 + int(mm) * 60 + float(ss)
    return {'durationSeconds': round(duration, 2) if duration else None,
            'meanVolumeDb': mean, 'maxVolumeDb': mx}


def main():
    stop = False
    frames = []
    audio = pa.PyAudio()
    device = audio.get_default_wasapi_loopback()
    rate = int(device['defaultSampleRate'])
    channels = device['maxInputChannels']
    print('录音设备：', device['name'], rate, 'Hz', channels, 'ch')

    def rec():
        with audio.open(input_device_index=device['index'], channels=channels,
                               rate=rate, format=pa.paInt16, frames_per_buffer=1024,
                               input=True) as stream:
            while not stop:
                frames.append(stream.read(1024, exception_on_overflow=False))

    thread = threading.Thread(target=rec, daemon=True)
    thread.start()
    rec_start = int(time.time() * 1000)
    time.sleep(0.6)

    env = dict(os.environ)
    env['NODE_PATH'] = 'C:/Users/翁启航/.workbuddy/binaries/node/workspace/node_modules'
    node = 'C:/Users/翁启航/.workbuddy/binaries/node/versions/22.22.2-6/node.exe'
    script = os.path.join(ROOT, 'tools', 'c_speech_record.cjs')
    r = subprocess.run([node, script, URL, TIMELINE], env=env, capture_output=True, text=True)
    print('node stdout:', r.stdout.strip()[:400])
    if r.returncode != 0:
        print('node stderr:', r.stderr.strip()[:600])

    time.sleep(1.0)
    stop = True
    thread.join(timeout=5)

    with wave.open(RAW, 'wb') as w:
        w.setnchannels(channels)
        w.setsampwidth(2)
        w.setframerate(rate)
        for f in frames:
            w.writeframes(f)
    rec_end = int(time.time() * 1000)
    print('原始录音：', round(os.path.getsize(RAW) / 1024 / 1024, 2), 'MB',
          round((rec_end - rec_start) / 1000, 1), 's')

    timeline = json.load(open(TIMELINE, encoding='utf-8'))
    exe = imageio_ffmpeg.get_ffmpeg_exe()
    report = {
        'method': 'WASAPI loopback (pyaudiowpatch) + Microsoft Edge headed, Web Speech API',
        'device': device['name'],
        'sampleRate': rate,
        'channels': channels,
        'rawSeconds': round((rec_end - rec_start) / 1000, 1),
        'version': timeline.get('version'),
        'segments': []
    }

    for rec_ in timeline['records']:
        item = {'id': rec_['id'], 'ok': rec_.get('ok'), 'speechText': rec_.get('speechText', ''),
                'charCount': rec_.get('charCount'), 'voice': rec_.get('voice'),
                'finished': rec_.get('finished')}
        if rec_.get('ok'):
            start_s = max(0, (rec_['startMs'] - rec_start) / 1000 - 0.25)
            dur_s = (rec_['endMs'] - rec_['startMs']) / 1000 + 0.9
            wav = os.path.join(OUTDIR, 'speech-%s.wav' % rec_['id'])
            subprocess.run([exe, '-y', '-hide_banner', '-loglevel', 'error',
                            '-ss', '%.2f' % start_s, '-t', '%.2f' % dur_s,
                            '-i', RAW, '-ar', '16000', '-ac', '1', wav], check=True)
            item['file'] = 'assets/tts-samples/speech-%s.wav' % rec_['id']
            item.update(volume(wav))
            item['audible'] = bool(item.get('meanVolumeDb') is not None and item['meanVolumeDb'] > -50)
        report['segments'].append(item)

    with open(os.path.join(OUTDIR, 'speech-recordings.json'), 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    for s in report['segments']:
        print(s['id'], s.get('ok'), s.get('durationSeconds'), 's', s.get('meanVolumeDb'), 'dB',
              'audible=', s.get('audible'))


if __name__ == '__main__':
    main()
