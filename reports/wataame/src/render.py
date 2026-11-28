# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy>=2.2", "scipy>=1.14", "pillow>=11"]
# ///
"""曲「わたあめサテライト」を楽譜から合成して WAV に書き出す。

使い方（リポジトリの一番上で）:
  python reports/wataame/src/render.py                全曲 → build/wataame/wataame.wav
  python reports/wataame/src/render.py --demo         全曲を作り、16〜36 小節（30 秒）を demo.wav に切り出す
  python reports/wataame/src/render.py --bars 24 40   その小節の範囲だけを書き出す（試し聞き用）
  uv run reports/wataame/src/render.py                uv を使う場合（依存は先頭の script の欄）

出力: build/wataame/（wav、stems/*.npy、mix.json）、記録 logs/wataame-song.log
"""
import argparse
import json
import os
import sys
import time
import wave
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dsp  # noqa: E402
import instruments as I  # noqa: E402
import score as S  # noqa: E402
from dsp import SR  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'build' / 'wataame'
LOGS = ROOT / 'logs'
STEMS = ['kick', 'snare', 'hats', 'perc', 'bass', 'chords', 'lead', 'chops', 'keys', 'fx']

# 残響へ送る量・ディレイへ送る量
SEND = {'snare': 0.2, 'chops': 0.22, 'lead': 0.3, 'keys': 0.32, 'fx': 0.35, 'chords': 0.07, 'hats': 0.04, 'perc': 0.05}
DELAY = {'chops': 0.16, 'lead': 0.2}
# 段ごとの音量を決める: (測る区間の小節, 目標の LUFS)
TARGET = {
    'kick': ((24, 40), -13.0), 'snare': ((24, 40), -15.0), 'hats': ((24, 40), -24.5), 'perc': ((24, 40), -28.0),
    'bass': ((24, 40), -14.8), 'chords': ((24, 40), -14.0), 'lead': ((24, 40), -22.5), 'chops': ((24, 40), -15.0),
    'keys': ((40, 48), -18.0), 'fx': ((24, 40), -22.0),
}
LUFS_TARGET = -9.5


def log(stage, result='ok', **kw):
    LOGS.mkdir(parents=True, exist_ok=True)
    args = json.dumps(kw, ensure_ascii=False) if kw else '{}'
    line = f'{datetime.now(timezone.utc).isoformat(timespec="milliseconds")} song.{stage} args={args} result={result}'
    print(line, flush=True)
    with open(LOGS / 'wataame-song.log', 'a', encoding='utf-8') as f:
        f.write(line + '\n')


# ------------------------------------------------------------------ 1 つの出来事を音にする
def cutoff_curve(spec, t0, dur, n):
    kind, v = spec
    if kind == 'const':
        return v
    # build: 8 小節で 500 Hz → 9000 Hz（後半ほど速く開く）
    b0 = v
    t = t0 + np.arange(n) / SR
    u = np.clip((t - S.T(b0)) / (8 * S.BAR), 0, 1)
    return 500 * (9000 / 500) ** (u ** 1.7)


def make(e):
    inst = e['inst']
    if inst == 'kick':
        return I.kick(e['vel'])
    if inst == 'snare':
        x = I.snare(e['vel'], tone=e.get('tone', 1.0), length=0.22 if e.get('short') else 0.55)
        return x
    if inst == 'hat':
        return dsp.pan(I.hat(e['vel'], e.get('open_', False)), 0.25)
    if inst == 'shaker':
        return dsp.pan(I.shaker(e['vel']), -0.4)
    if inst == 'rim':
        return dsp.pan(I.rim(e['vel']), 0.45)
    if inst == 'sub':
        return I.sub(e['midi'], e['dur'], e['vel'], glide_from=e.get('glide_from'))
    if inst == 'growl':
        return I.growl(e['midi'], e['dur'], e['vel'])
    if inst in ('saw', 'pad'):
        n_est = int((e['dur'] + 0.3) * SR)
        c = cutoff_curve(e['cutoff'], e['t'], e['dur'], n_est)
        bend = None
        if 'bend' in e:
            a, b = e['bend']
            u = np.linspace(0, 1, 64)
            bend = a + (b - a) * dsp.smoothstep(u) ** 1.3
        if inst == 'pad':
            return I.supersaw(e['notes'], e['dur'], e['vel'], cutoff=c, q=0.7, attack=0.09, release=0.7,
                              detune=16.0, voices=5, stereo=0.8)
        return I.supersaw(e['notes'], e['dur'], e['vel'], cutoff=c, q=0.9, bend=bend)
    if inst == 'stab':
        c = cutoff_curve(e['cutoff'], e['t'], e['dur'], int((e['dur'] + 0.2) * SR))
        return I.supersaw(e['notes'], e['dur'], e['vel'], cutoff=c, q=0.9, attack=0.003, release=0.07)
    if inst == 'wob':
        # 揺れる和音: 16 分の 3 連符 → 32 分へ速くなる音量の揺れ、最後に音の高さを少し下げる
        u = np.linspace(0, 1, 64)
        bend = -2.0 * dsp.smoothstep((u - 0.8) / 0.2)
        x = I.supersaw(e['notes'], e['dur'], e['vel'], cutoff=7500, q=1.0, attack=0.004, release=0.06, bend=bend)
        t = np.arange(x.shape[1]) / SR
        rate = np.where(t < 2 * S.BEAT, 6.0, 8.0) / S.BEAT
        ph = np.cumsum(rate) / SR
        lfo = 0.5 + 0.5 * np.cos(2 * np.pi * ph)
        return x * (0.12 + 0.88 * lfo ** 1.5)
    if inst == 'bell':
        return dsp.pan(I.fm_bell(e['midi'], e['dur'], e['vel'], ratio=3.5, index=1.6, decay=0.55), 0.15)
    if inst == 'musicbox':
        return dsp.pan(I.music_box(e['midi'], e['vel']), -0.2 + 0.4 * ((e['midi'] % 5) / 4))
    if inst == 'ep':
        return dsp.pan(I.ep(e['midi'], e['dur'], e['vel']), ((e['midi'] % 7) / 6 - 0.5) * 0.6)
    if inst == 'pluck':
        return dsp.pan(I.pluck(e['midi'], e['vel']), ((e['midi'] % 5) / 4 - 0.5) * 0.7)
    if inst == 'chip':
        return dsp.pan(I.chip(e['midi'], e['dur'], e['vel'], width=e.get('width', 0.25), vib=e.get('vib', True)), -0.3)
    if inst == 'chop':
        x = I.chop(e['midi'], e['dur'], e['syl'], e['vel'], glide_from=e.get('glide_from'))
        if e.get('radio'):
            x = dsp.soft(dsp.hp(dsp.lp(x, 2600, 1.2), 700) * 2.0, 2.0) * 0.5
        return dsp.pan(x, e.get('pan', 0.0))
    if inst == 'squeak':
        return dsp.pan(I.squeak(e['vel'], e.get('up', True)), 0.35)
    if inst == 'pop':
        return dsp.pan(I.pop(e['vel'], e.get('pitch', 1.0)), -0.45 + 0.9 * ((e['t'] * 7.3) % 1))
    if inst == 'sparkle':
        return I.sparkle(e['vel'], seed=e.get('seed', 1), up=e.get('up', True))
    if inst == 'riser':
        return I.riser(e['dur'], e['vel'])
    if inst == 'downlifter':
        return I.downlifter(e['dur'], e['vel'])
    if inst == 'revcym':
        return I.reverse_cymbal(e['dur'], e['vel'])
    if inst == 'impact':
        return I.impact(e['vel'])
    if inst == 'revsnare':
        return dsp.pan(I.reverse_snare(e['dur'], e['vel']), 0.0)
    raise ValueError(inst)


# ------------------------------------------------------------------ サイドチェイン
def pump_curve(n, triggers, depth, release, attack=0.004):
    """triggers（秒）ごとに depth だけ下げ、release 秒で戻る音量の曲線。"""
    g = np.ones(n)
    ra = int(attack * SR)
    rr = int(release * SR)
    shape = np.concatenate([np.linspace(1, 1 - depth, ra, endpoint=False) if ra > 0 else [],
                            1 - depth + depth * dsp.smoothstep(np.arange(rr) / rr) ** 0.8])
    for tt in triggers:
        i0 = int(round(tt * SR)) - ra
        s = max(0, -i0)
        e = min(len(shape), n - i0)
        if e <= s:
            continue
        g[i0 + s:i0 + e] = np.minimum(g[i0 + s:i0 + e], shape[s:e])
    return g


def section_pumps(n, kick_times):
    """区間ごとの、キックに合わせたサイドチェインの曲線（和音・鍵盤・メロディ用）。"""
    g = np.ones(n)
    for sid, _, b0, nb in S.SECTIONS:
        cfg = S.PUMP.get(sid)
        if not cfg:
            continue
        depth, rel = cfg
        a, b = S.T(b0), S.T(b0 + nb)
        trig = [t for t in kick_times if a - 1e-6 <= t < b]
        g = np.minimum(g, pump_curve(n, trig, depth, rel))
    return g


# ------------------------------------------------------------------ テープを止める演出
def tape_stop(x, a, b):
    ia, ib = int(a * SR), int(b * SR)
    m = ib - ia
    u = np.arange(m) / m
    v = (1 - u) ** 2.2
    r = ia + np.concatenate(([0.0], np.cumsum(v[:-1])))
    y = x.copy()
    idx = np.arange(x.shape[1])
    for c in range(x.shape[0]):
        y[c, ia:ib] = np.interp(r, idx, x[c]) * (1 - dsp.smoothstep((u - 0.85) / 0.15))
    return y


# ------------------------------------------------------------------ 全体
def render(bars=None):
    t_start = time.time()
    ev = S.build_events()
    n = int(S.DURATION * SR)
    stems = {s: np.zeros((2, n)) for s in STEMS}
    send_v = {s: np.zeros((2, n)) for s in ('pre', 'post')}
    send_d = np.zeros((2, n))
    stop_a, stop_b = S.TAPE_STOP
    counts = {}
    for e in ev:
        if bars and not (S.T(bars[0]) - 2 * S.BAR <= e['t'] < S.T(bars[1])):
            continue
        x = dsp.to_stereo(make(e))
        # テープを止める所をまたぐ音は、止める時刻で切る
        if e['t'] < stop_b and e['t'] + x.shape[1] / SR > stop_b:
            k = int((stop_b - e['t']) * SR)
            x = dsp.fade_tail(x[:, :k].copy(), 5)
        dsp.add(stems[e['stem']], x, e['t'])
        counts[e['inst']] = counts.get(e['inst'], 0) + 1
        sv = SEND.get(e['stem'], 0.0) * (2.2 if e.get('wet') else 1.0) * (1.8 if e.get('radio') else 1.0)
        if sv:
            dsp.add(send_v['pre' if e['t'] < stop_b else 'post'], x, e['t'], sv)
        dv = DELAY.get(e['stem'], 0.0)
        if dv:
            dsp.add(send_d, x, e['t'], dv)
    log('events', counts=counts, seconds=round(time.time() - t_start, 1))

    # サイドチェイン
    kick_times = [e['t'] for e in ev if e['inst'] == 'kick']
    sp = section_pumps(n, kick_times)
    kp = pump_curve(n, kick_times, 0.9, 0.16)
    stems['chords'] = dsp.filt(dsp.hp(stems['chords'], 170, 0.7), 'peak', 320, 0.8, -5.0) * sp
    stems['keys'] *= 1 - (1 - sp) * 0.45
    stems['lead'] *= 1 - (1 - sp) * 0.35
    stems['bass'] *= kp * (1 - (1 - sp) * 0.3)

    # 残響とディレイ
    t1 = time.time()
    ir = dsp.make_ir(seconds=2.8, rt_low=2.4, rt_mid=2.2, rt_high=1.2)
    verb_pre = dsp.convolve(send_v['pre'], ir)
    verb_pre[:, int(stop_b * SR):] = 0
    verb_post = dsp.convolve(send_v['post'], ir)
    verb = dsp.lp(dsp.hp(verb_pre + verb_post, 250), 8000)
    verb *= 1 - (1 - sp) * 0.5
    delay = dsp.pingpong(send_d, 3 * S.STEP, fb=0.42, taps=5, tone=5000)
    delay = dsp.hp(delay, 400) * (1 - (1 - sp) * 0.6)
    log('space', seconds=round(time.time() - t1, 1))

    # テープを止める
    for s in STEMS:
        stems[s] = tape_stop(stems[s], stop_a, stop_b)
    verb = tape_stop(verb, stop_a, stop_b)
    delay = tape_stop(delay, stop_a, stop_b)

    # 段ごとの音量
    gains = {}
    for s in STEMS:
        (b0, b1), tgt = TARGET[s]
        seg = stems[s][:, int(S.T(b0) * SR):int(S.T(b1) * SR)]
        l = dsp.lufs(seg) if np.any(seg) else -70.0
        gains[s] = float(dsp.db(tgt - l)) if l > -60 else 1.0
    mix = sum(stems[s] * gains[s] for s in STEMS)
    mix += verb * dsp.db(-9.0) * gains['chops'] ** 0.0 + delay * dsp.db(-14.0)
    log('stems', gains_db={s: round(float(dsp.to_db(g)), 1) for s, g in gains.items()})

    # マスター: 低すぎる音を切る → ゆるく圧縮 → リミッター。統合ラウドネスを目標に合わせる
    mix = dsp.hp(mix, 26)
    mix, cg = dsp.compress(mix, threshold_db=-15, ratio=1.8, attack=0.012, release=0.16)
    pre = 1.0
    for it in range(4):
        y = np.tanh(mix * pre / 0.97) * 0.97
        y, lg = dsp.limit(y, ceiling_db=-1.7)
        L = dsp.lufs(y)
        pre *= dsp.db(LUFS_TARGET - L)
    log('master', lufs=round(L, 2), pre_gain_db=round(float(dsp.to_db(pre)), 2),
        limiter_max_gr_db=round(float(-dsp.to_db(lg.min())), 2), comp_max_gr_db=round(float(-dsp.to_db(cg.min())), 2))
    info = dict(gains=gains, pre=pre, lufs=L, stems_scale={s: gains[s] * pre for s in STEMS}, pump=sp,
                verb_scale=dsp.db(-9.0) * pre, delay_scale=dsp.db(-14.0) * pre)
    return y, stems, info, ev


def write_wav(path, x, bits=16):
    path.parent.mkdir(parents=True, exist_ok=True)
    x = dsp.to_stereo(x)
    r = np.random.default_rng(1)
    dith = (r.random(x.shape) - r.random(x.shape)) / 32768.0
    q = np.clip(np.round((x + dith) * 32767), -32768, 32767).astype('<i2')
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(q.T.tobytes())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--demo', action='store_true')
    ap.add_argument('--bars', nargs=2, type=int)
    a = ap.parse_args()
    log('start', args=sys.argv[1:])
    t0 = time.time()
    y, stems, info, ev = render(tuple(a.bars) if a.bars else None)
    OUT.mkdir(parents=True, exist_ok=True)
    if a.bars:
        seg = y[:, int(S.T(a.bars[0]) * SR):int(S.T(a.bars[1]) * SR)]
        out = OUT / f'bars-{a.bars[0]}-{a.bars[1]}.wav'
        write_wav(out, seg)
        log('write', path=str(out), seconds=round(time.time() - t0, 1))
        return
    write_wav(OUT / 'wataame.wav', y)
    np.save(OUT / 'master.npy', y.astype(np.float32))
    (OUT / 'stems').mkdir(exist_ok=True)
    for s in STEMS:
        np.save(OUT / 'stems' / f'{s}.npy', (stems[s] * info['stems_scale'][s]).astype(np.float32))
    np.save(OUT / 'pump.npy', info['pump'][::48].astype(np.float32))  # 1 kHz に間引いたサイドチェインの曲線
    tp = dsp.true_peak_db(y)
    meta = dict(title=S.TITLE, bpm=S.BPM, key=S.KEY, duration=S.DURATION, lufs=round(info['lufs'], 2),
                true_peak_db=round(tp, 2), gains_db={s: round(float(dsp.to_db(g)), 2) for s, g in info['gains'].items()})
    (OUT / 'mix.json').write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding='utf-8')
    log('write', path=str(OUT / 'wataame.wav'), lufs=meta['lufs'], true_peak=meta['true_peak_db'],
        seconds=round(time.time() - t0, 1))
    if a.demo:
        a0, a1 = S.T(16), S.T(36)
        seg = y[:, int(a0 * SR):int(a1 * SR)].copy()
        k = int(0.02 * SR)
        seg[:, :k] *= np.linspace(0, 1, k)
        seg = dsp.fade_tail(seg, 1200)
        write_wav(OUT / 'demo.wav', seg)
        log('demo', path=str(OUT / 'demo.wav'), start=a0, end=a1)


if __name__ == '__main__':
    main()
