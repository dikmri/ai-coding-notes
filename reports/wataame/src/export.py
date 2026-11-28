# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy>=2.2", "scipy>=1.14"]
# ///
"""合成した曲から、UI が読むデータと配信用の音を作る。

使い方（リポジトリの一番上で、render.py のあとに）:
  python reports/wataame/src/export.py

出力:
  reports/wataame/media/wataame.m4a   配信用の音（AAC 192 kbps、ffmpeg が要る）
  reports/wataame/data/score.json     区間・和音・音符・ドラム・効果音・数値の説明
  reports/wataame/data/levels.bin     1/60 秒ごとの値（0〜255）。楽器 10 段・左右・サイドチェイン・周波数 48 帯
"""
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import instruments as I  # noqa: E402
import score as S  # noqa: E402
from dsp import SR, k_weight, to_db  # noqa: E402
from render import LOGS, OUT, ROOT, STEMS, log  # noqa: E402

FPS = 60
BANDS = 48
F_LO, F_HI = 40.0, 14000.0
DEST = ROOT / 'reports' / 'wataame'


def frame_rms(x, frames, win):
    """フレームの時刻を中心にした win 秒の RMS。x はステレオ。"""
    p = np.mean(np.asarray(x, dtype=np.float64) ** 2, axis=0)
    c = np.concatenate(([0.0], np.cumsum(p)))
    centers = (np.arange(frames) / FPS * SR).astype(int)
    h = int(win * SR / 2)
    a = np.clip(centers - h, 0, len(p))
    b = np.clip(centers + h, 0, len(p))
    return np.sqrt((c[b] - c[a]) / np.maximum(b - a, 1))


def release(v, seconds):
    """上がるときはすぐ、下がるときは seconds かけてゆっくり。"""
    k = np.exp(-1.0 / (seconds * FPS))
    out = np.empty_like(v)
    cur = 0.0
    for i, x in enumerate(v):
        cur = x if x > cur else cur * k + x * (1 - k)
        out[i] = cur
    return out


def norm_db(db, span):
    hi = np.percentile(db[db > -90], 99.3) if np.any(db > -90) else 0.0
    return np.clip((db - (hi - span)) / span, 0, 1)


def spectrum(mono, frames):
    nfft = 2048
    win = np.hanning(nfft)
    fr = np.fft.rfftfreq(nfft, 1 / SR)
    edges = np.geomspace(F_LO, F_HI, BANDS + 1)
    idx = [np.where((fr >= edges[i]) & (fr < edges[i + 1]))[0] for i in range(BANDS)]
    # 低い帯は FFT の点が少ないので、いちばん近い点を使う
    idx = [ix if len(ix) else np.array([np.argmin(np.abs(fr - np.sqrt(edges[i] * edges[i + 1])))]) for i, ix in enumerate(idx)]
    centers = np.sqrt(edges[:-1] * edges[1:])
    tilt = 3.0 * np.log2(centers / 1000.0)  # 高い帯ほど小さく見えるので、1 オクターブあたり 3 dB 足す
    pad = np.concatenate([np.zeros(nfft), mono, np.zeros(nfft)])
    out = np.zeros((frames, BANDS))
    for f in range(frames):
        c = int(f / FPS * SR) + nfft
        seg = pad[c - nfft // 2:c + nfft // 2] * win
        pw = np.abs(np.fft.rfft(seg)) ** 2
        out[f] = [10 * np.log10(pw[ix].mean() + 1e-12) for ix in idx]
    out += tilt
    hi = np.percentile(out, 99.5)
    v = np.clip((out - (hi - 54)) / 54, 0, 1)
    for b in range(BANDS):
        v[:, b] = release(v[:, b], 0.14)
    return v, centers


def main():
    t0 = time.time()
    master = np.load(OUT / 'master.npy')
    frames = int(np.ceil(S.DURATION * FPS))
    chans, names = [], []
    for s in STEMS:
        x = np.load(OUT / 'stems' / f'{s}.npy')
        db = to_db(frame_rms(x, frames, 1 / 30) * np.sqrt(2))
        v = release(norm_db(db, 36.0), 0.12)
        chans.append(v)
        names.append(s)
    for c, nm_ in ((0, 'L'), (1, 'R')):
        db = to_db(frame_rms(master[c:c + 1], frames, 0.05) * np.sqrt(2))
        chans.append(release(np.clip((db + 40) / 37, 0, 1), 0.1))
        names.append(nm_)
    # ラウドネス（瞬間 = 0.4 秒、短時間 = 3 秒の窓。-40〜0 LUFS を 0〜1 に）
    kw = np.sum(k_weight(master) ** 2, axis=0)
    ck = np.concatenate(([0.0], np.cumsum(kw)))
    ends = np.clip((np.arange(frames) / FPS * SR).astype(int), 0, len(kw))
    for nm_, win in (('lufsM', 0.4), ('lufsS', 3.0)):
        st = np.clip(ends - int(win * SR), 0, len(kw))
        ms = (ck[ends] - ck[st]) / max(1, int(win * SR))
        lk = -0.691 + 10 * np.log10(np.maximum(ms, 1e-12))
        chans.append(np.clip((lk + 40) / 40, 0, 1))
        names.append(nm_)
    pump = np.load(OUT / 'pump.npy')
    tt = np.arange(frames) / FPS
    chans.append(np.interp(tt, np.arange(len(pump)) / 1000.0, pump))
    names.append('pump')
    spec, centers = spectrum(master.mean(axis=0), frames)
    for b in range(BANDS):
        chans.append(spec[:, b])
        names.append(f'band{b}')
    arr = np.clip(np.round(np.stack(chans, axis=1) * 255), 0, 255).astype(np.uint8)
    (DEST / 'data').mkdir(parents=True, exist_ok=True)
    (DEST / 'media').mkdir(parents=True, exist_ok=True)
    arr.tofile(DEST / 'data' / 'levels.bin')
    log('export.levels', frames=frames, channels=len(names), bytes=int(arr.nbytes), seconds=round(time.time() - t0, 1))

    # 楽譜
    ev = S.build_events()
    r3 = lambda v: round(float(v), 3)  # noqa: E731
    notes = {'chop': [], 'bell': [], 'keys': [], 'bass': [], 'chip': [], 'stab': []}
    drums = {'kick': [], 'snare': [], 'hat': [], 'perc': []}
    fx = []
    for e in ev:
        inst = e['inst']
        if inst == 'chop':
            cons, vow = I.parse_syllable(e['syl'])
            notes['chop'].append(dict(t=r3(e['t']), d=r3(e['dur']), m=int(e['midi']), syl=e['syl'], v=vow,
                                      kana=I.KANA.get((cons, vow), '?'), vel=r3(e['vel']),
                                      h=1 if e.get('harmony') else 0, radio=1 if e.get('radio') else 0))
        elif inst == 'bell':
            notes['bell'].append(dict(t=r3(e['t']), d=r3(e['dur']), m=int(e['midi'])))
        elif inst in ('musicbox', 'pluck', 'ep'):
            notes['keys'].append(dict(t=r3(e['t']), d=r3(e.get('dur', 0.3)), m=int(e['midi']), k=inst))
        elif inst == 'chip':
            notes['chip'].append(dict(t=r3(e['t']), d=r3(e['dur']), m=int(e['midi'])))
        elif inst == 'sub':
            notes['bass'].append(dict(t=r3(e['t']), d=r3(e['dur']), m=int(e['midi'])))
        elif inst == 'kick':
            drums['kick'].append([r3(e['t']), r3(e['vel'])])
        elif inst == 'snare':
            drums['snare'].append([r3(e['t']), r3(e['vel'])])
        elif inst == 'hat':
            drums['hat'].append([r3(e['t']), r3(e['vel'])])
        elif inst in ('shaker', 'rim'):
            drums['perc'].append([r3(e['t']), r3(e['vel'])])
        elif inst in ('stab', 'saw'):
            notes['stab'].append(dict(t=r3(e['t']), d=r3(e['dur'])))
        elif e['stem'] == 'fx' or inst in ('revsnare', 'wob'):
            fx.append(dict(t=r3(e['t']), type=inst, d=r3(e.get('dur', 0)), vel=r3(e.get('vel', 1))))
    chords = []
    for a, b, name in S.progression():
        roman, bass, vo = S.CHORDS[name]
        chords.append(dict(t0=r3(a), t1=r3(b), name=name, roman=roman, bass=S.nm(bass), notes=[S.nm(x) for x in vo]))
    sections = [dict(id=sid, name=nm_, bar=b0, bars=nb, t0=r3(S.T(b0)), t1=r3(S.T(b0 + nb))) for sid, nm_, b0, nb in S.SECTIONS]
    mix = json.loads((OUT / 'mix.json').read_text(encoding='utf-8'))
    doc = dict(
        title=S.TITLE, titleEn=S.TITLE_EN, artist='Claude', bpm=S.BPM, key=S.KEY, duration=r3(S.DURATION),
        beat=r3(S.BEAT), bar=r3(S.BAR), bars=S.TOTAL_BARS, lufs=mix['lufs'], truePeak=mix['true_peak_db'],
        tapeStop=[r3(S.TAPE_STOP[0]), r3(S.TAPE_STOP[1])],
        sections=sections, chords=chords, notes=notes, drums=drums, fx=fx,
        levels=dict(file='levels.bin', fps=FPS, frames=frames, channels=names,
                    bandHz=[round(float(c), 1) for c in centers]),
    )
    (DEST / 'data' / 'score.json').write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    log('export.score', chords=len(chords), chops=len(notes['chop']), kicks=len(drums['kick']), fx=len(fx),
        bytes=(DEST / 'data' / 'score.json').stat().st_size)

    # 配信用の音
    wav = OUT / 'wataame.wav'
    m4a = DEST / 'media' / 'wataame.m4a'
    r = subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(wav), '-c:a', 'aac', '-b:a', '192k',
                        '-movflags', '+faststart', str(m4a)], capture_output=True, text=True)
    log('export.audio', result='ok' if r.returncode == 0 else f'error {r.stderr.strip()[:200]}', path=str(m4a),
        bytes=m4a.stat().st_size if m4a.exists() else 0)


if __name__ == '__main__':
    main()
