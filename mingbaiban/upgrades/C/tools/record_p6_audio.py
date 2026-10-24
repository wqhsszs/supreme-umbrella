# -*- coding: utf-8 -*-
import json, os, shutil, subprocess, threading, time, wave
import pyaudiowpatch as pa
BASE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.dirname(BASE)
RAW=os.path.join(ROOT,'_tmp','p6-raw.wav')
audio=pa.PyAudio(); dev=audio.get_default_wasapi_loopback()
rate,ch=int(dev['defaultSampleRate']),dev['maxInputChannels']
frames,stop=[],{'v':False}
def rec():
    with audio.open(input_device_index=dev['index'],channels=ch,rate=rate,format=pa.paInt16,frames_per_buffer=1024,input=True) as st:
        while not stop['v']: frames.append(st.read(1024,exception_on_overflow=False))
th=threading.Thread(target=rec,daemon=True); th.start()
start=int(time.time()*1000); time.sleep(0.4)
env=dict(os.environ); env['NODE_PATH']='C:/Users/翁启航/.workbuddy/binaries/node/workspace/node_modules'
r=subprocess.run(['C:/Users/翁启航/.workbuddy/binaries/node/versions/22.22.2-6/node.exe',os.path.join(BASE,'record_p6.cjs')],env=env,capture_output=True,text=True)
print(r.stdout.strip()[:600]); print('ERR', r.stderr.strip()[:300])
time.sleep(0.8); stop['v']=True; th.join(timeout=5)
with wave.open(RAW,'wb') as w:
    w.setnchannels(ch); w.setsampwidth(2); w.setframerate(rate)
    for f in frames: w.writeframes(f)
meta=json.load(open(os.path.join(ROOT,'delivery','assets','recordings','p6.json'),encoding='utf-8'))
meta['recStart']=start; meta['rate']=rate; meta['ch']=ch
json.dump(meta,open(os.path.join(ROOT,'_tmp','p6-meta.json'),'w',encoding='utf-8'),ensure_ascii=False,indent=2)
print('audio', round(os.path.getsize(RAW)/1024/1024,2),'MB')
