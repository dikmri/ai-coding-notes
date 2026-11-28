# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy>=2.2", "scipy>=1.14", "pillow>=11"]
# ///
"""レポートの図のデータと画像を作る（render.py と export.py のあとに動かす）。

  python reports/wataame/src/figures.py

出力:
  reports/wataame/data/compare.json   1 版と 2 版の比べ（和音の長さ・リズムの格子・サイドチェイン）、母音の形、周波数の配分
  reports/wataame/img/spectrogram.webp     全曲のスペクトログラム
  reports/wataame/img/chops-zoom.webp      チョップを拡大したスペクトログラム（drop の頭の 4 小節）
"""
import collections
import importlib
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import instruments as I  # noqa: E402
import score as S2  # noqa: E402
import score_v1 as S1  # noqa: E402
from dsp import SR, lufs  # noqa: E402
from render import OUT, ROOT, log, pump_curve  # noqa: E402

DEST = ROOT / 'reports' / 'wataame'
FONT = 'C:/Windows/Fonts/meiryo.ttc' if os.path.exists('C:/Windows/Fonts/meiryo.ttc') else None

# 1 版の最初の書き出し（ミックスを直す前）の 1/3 オクターブの配分。2026-11-28 にこのセッションで測った値（1 kHz = 0 dB）
BEFORE_FIX = [-4.2, 9.8, 15.0, 9.0, 4.3, 4.4, 3.4, 2.1, 4.5, 6.8, 4.5, 2.4, 0.6, 0.6, 1.0, 0.0, 0.8, 1.6, -1.5, -2.4,
              0.1, 0.0, -3.0, -5.2, -5.0, -4.6, -3.4, -2.2, -1.3]


def metrics(S):
    ev = S.build_events()
    prog = S.progression()
    lens = collections.Counter(round((b - a) / S.BEAT, 2) for a, b, _ in prog)
    names = [n for _, _, n in prog]
    reuse = max(sum(1 for j in range(len(names) - 5) if names[j:j + 6] == names[i:i + 6]) for i in range(len(names) - 5))
    ch = [e for e in ev if e['inst'] == 'chop' and S.T(24) <= e['t'] < S.T(40) and not e.get('harmony')]
    steps = set()
    for e in ch:
        s0 = round((e['t'] - S.T(24)) / S.STEP)
        for k in range(max(1, round(e['dur'] / S.STEP + 0.3))):
            steps.add(s0 + k)
    rests, prev = 0, -1
    for s in sorted(steps):
        if s - prev > 1:
            rests += 1
        prev = s
    pats = set()
    for k in range(16):
        bar = 24 + k
        pats.add(tuple(sorted((e['inst'], round((e['t'] - S.T(bar)) / S.STEP, 1)) for e in ev
                              if e['inst'] in ('kick', 'snare') and S.T(bar) <= e['t'] < S.T(bar + 1))))
    return dict(
        chords=len(prog), kinds=len(set(names)), fourBeat=round(lens.get(4.0, 0) / sum(lens.values()), 3), reuse6=reuse,
        sounding=round(len(steps) / 256, 3), rests=rests - 1,
        onBeat=sum(1 for e in ch if round((e['t'] - S.T(24)) / S.STEP) % 4 == 0),
        velKinds=len(set(round(e['vel'], 2) for e in ch)), drumPatterns=len(pats),
        lengths={str(k): v for k, v in sorted(lens.items())},
    ), ev


def grid(S, ev):
    """drop の頭の 4 小節を 16 分の格子にする（行: 声・和音・キック・スネア）。"""
    t0 = S.T(24)
    rows = {'chop': [], 'chord': [], 'kick': [], 'snare': []}
    for e in ev:
        if not (t0 - 1e-6 <= e['t'] < S.T(28)):
            continue
        s = round((e['t'] - t0) / S.STEP, 2)
        if e['inst'] == 'chop' and not e.get('harmony'):
            rows['chop'].append([s, round(e['dur'] / S.STEP, 2), e['syl']])
        elif e['inst'] in ('saw', 'stab', 'wob') and e.get('vel', 0) > 0.5:
            rows['chord'].append([s, round(e['dur'] / S.STEP, 2)])
        elif e['inst'] == 'kick':
            rows['kick'].append([s, 1])
        elif e['inst'] == 'snare' and e['vel'] >= 0.3:
            rows['snare'].append([s, 1])
    return rows


def pump_v1(S):
    n = int(2 * S.BAR * SR)
    trig = [k * S.BEAT for k in range(8)]
    return pump_curve(n, trig, 0.82, 0.55 * S.BEAT)


def pump_v2(S, ev):
    n = int(2 * S.BAR * SR)
    t0 = S.T(24)
    trig = [e['t'] - t0 for e in ev if e['inst'] == 'kick' and t0 <= e['t'] < t0 + 2 * S.BAR]
    return pump_curve(n, trig, 0.72, 0.3)


def third_oct(x):
    X = np.abs(np.fft.rfft(x * np.hanning(len(x)))) ** 2
    f = np.fft.rfftfreq(len(x), 1 / SR)
    centers = 1000 * 2 ** (np.arange(-15, 14) / 3)
    vals = np.array([10 * np.log10(X[(f >= c / 2 ** (1 / 6)) & (f < c * 2 ** (1 / 6))].sum() + 1e-20) for c in centers])
    return centers, vals - vals[15]


def spectrogram(x, path, t0, t1, fmin=30, fmax=16000, linear=False, W=1600, H=520, marks=None, hop=480, nfft=4096):
    frames = (len(x) - nfft) // hop
    win = np.hanning(nfft)
    fr = np.fft.rfftfreq(nfft, 1 / SR)
    ys = (np.linspace(fmax, fmin, H) if linear else np.geomspace(fmin, fmax, H)[::-1])
    cols = np.linspace(0, frames - 1, W).astype(int)
    img = np.zeros((H, W))
    for j, c in enumerate(cols):
        seg = x[c * hop:c * hop + nfft] * win
        img[:, j] = np.interp(ys, fr, 20 * np.log10(np.abs(np.fft.rfft(seg)) + 1e-9))
    img = np.clip((img - img.max() + 80) / 80, 0, 1)
    # 夜空のような色（暗い紺 → 桃 → 白）
    c0, c1, c2 = np.array([24, 26, 58]), np.array([242, 95, 160]), np.array([255, 246, 236])
    a = img[..., None]
    rgb = np.where(a < 0.6, c0 + (c1 - c0) * (a / 0.6), c1 + (c2 - c1) * ((a - 0.6) / 0.4))
    im = Image.fromarray(rgb.astype(np.uint8))
    d = ImageDraw.Draw(im)
    font = ImageFont.truetype(FONT, 16) if FONT else None
    ticks = (1000, 2000, 3000, 4000, 5000) if linear else (50, 100, 200, 500, 1000, 2000, 5000, 10000)
    for f in ticks:
        yy = int((fmax - f) / (fmax - fmin) * (H - 1)) if linear else H - 1 - int(np.log(f / fmin) / np.log(fmax / fmin) * (H - 1))
        d.line([(0, yy), (10, yy)], fill=(255, 255, 255))
        d.text((14, yy - 10), f'{f} Hz' if f < 1000 else f'{f // 1000} kHz', fill=(255, 255, 255), font=font)
    for ts, label in (marks or []):
        if t0 <= ts <= t1:
            xx = int((ts - t0) / (t1 - t0) * W)
            d.line([(xx, 0), (xx, H)], fill=(255, 220, 120), width=2)
            d.text((xx + 5, 4), label, fill=(255, 220, 120), font=font)
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, 'WEBP', quality=82)
    return path


def main():
    m1, ev1 = metrics(S1)
    m2, ev2 = metrics(S2)
    master = np.load(OUT / 'master.npy')
    centers, after = third_oct(master.mean(axis=0)[int(S2.T(16) * SR):int(S2.T(36) * SR)])
    p1, p2 = pump_v1(S1), pump_v2(S2, ev2)
    dec = SR // 200
    doc = dict(
        metrics=dict(v1=m1, v2=m2),
        grids=dict(v1=grid(S1, ev1), v2=grid(S2, ev2)),
        pump=dict(rate=200, v1=[round(float(v), 3) for v in p1[::dec]], v2=[round(float(v), 3) for v in p2[::dec]],
                  kicksV2=[round(e['t'] - S2.T(24), 3) for e in ev2 if e['inst'] == 'kick' and S2.T(24) <= e['t'] < S2.T(26)],
                  beat=S2.BEAT),
        progressions=dict(
            v1=[[n, b] for n, b in S1.DROP_A],
            v2=[[n, b, S2.CHORDS[n][1]] for n, b in S2.PHRASE_A + S2.PHRASE_B],
        ),
        vowels={k: v for k, v in I.VOWELS.items() if k != 'n'}, formantScale=1.28,
        spectrum=dict(centers=[round(float(c), 1) for c in centers], before=BEFORE_FIX, after=[round(float(v), 1) for v in after]),
        loudness=dict(integrated=round(lufs(master), 2)),
    )
    (DEST / 'data' / 'compare.json').write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    log('figures.compare', v1=dict(fourBeat=m1['fourBeat'], rests=m1['rests']), v2=dict(fourBeat=m2['fourBeat'], rests=m2['rests']))
    marks = [(S2.T(b0), name) for _, name, b0, _ in S2.SECTIONS]
    mono = master.mean(axis=0)
    spectrogram(mono, DEST / 'img' / 'spectrogram.webp', 0, len(mono) / SR, marks=marks)
    t0 = S2.T(24)
    chops = np.load(OUT / 'stems' / 'chops.npy').mean(axis=0)[int(t0 * SR):int(S2.T(28) * SR)]
    bars = [(k * S2.BAR, f'{25 + k} 小節') for k in range(4)]
    spectrogram(chops, DEST / 'img' / 'chops-zoom.webp', 0, 4 * S2.BAR, fmin=0, fmax=6000, linear=True, hop=120, nfft=2048,
                marks=bars, H=440)
    log('figures.images', files=['img/spectrogram.webp', 'img/chops-zoom.webp'])


if __name__ == '__main__':
    main()
