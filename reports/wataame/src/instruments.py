"""楽器。どれも 1 音分の配列（モノラル (n,) かステレオ (2, n)）を返す。"""
from functools import lru_cache

import numpy as np
from scipy import signal

from dsp import (SR, TAU, bp, env_adsr, env_perc, fade_tail, hp, hz, lp, noise, pan, phase,
                 pulse, rng, saw, saw_ph, sine, smoothstep, soft, sweep)


def _t(n):
    return np.arange(n) / SR


# ================================================================== ドラム
def kick(vel=1.0, length=0.42, punch=1.0):
    n = int(length * SR)
    t = _t(n)
    f = 44 + 150 * np.exp(-t / 0.032) + 520 * np.exp(-t / 0.0022)
    body = np.sin(TAU * np.cumsum(f) / SR)
    amp = np.exp(-t / 0.26) * (1 - smoothstep((t - (length - 0.06)) / 0.06))
    click = lp(hp(noise(n), 3000), 9000) * np.exp(-t / 0.0018) * 0.35 * punch
    x = soft(body * amp * 1.15 + click, 1.25)
    return fade_tail(x * vel, 4)


def snare(vel=1.0, length=0.55, tone=1.0):
    """future bass の大きいスネア（胴の音＋ざらつき＋手拍子を重ねる）。"""
    n = int(length * SR)
    t = _t(n)
    f = 205 * tone + 70 * np.exp(-t / 0.018)
    body = np.sin(TAU * np.cumsum(f) / SR) * np.exp(-t / 0.075)
    z = noise(n)
    rattle = lp(bp(z, 2400, 0.6) * 0.9 + bp(z, 6500, 0.9) * 0.45, 10000) * np.exp(-t / 0.17)
    clap = np.zeros(n)
    zc = bp(noise(n), 1250, 1.1)
    for k, d in enumerate((0.0, 0.009, 0.019)):
        i = int(d * SR)
        clap[i:] += zc[:n - i] * np.exp(-(t[:n - i]) / 0.0055) * (0.8 + 0.1 * k)
    clap += zc * np.exp(-t / 0.13) * 0.45 * smoothstep((t - 0.02) / 0.01)
    x = hp(body, 150) * 0.55 + rattle * 0.6 + clap * 0.8
    return fade_tail(soft(x * 1.1, 1.3) * vel, 6)


_HAT_F = np.array([205.3, 304.4, 369.6, 522.7, 540.0, 800.0]) * 1.05


def hat(vel=1.0, open_=False):
    length = 0.32 if open_ else 0.07
    n = int(length * SR)
    t = _t(n)
    metal = sum(pulse(f, n, 0.5, rng().random()) for f in _HAT_F)
    x = hp(bp(metal, 9000, 0.9), 6500) * 0.45 + hp(noise(n), 7500) * 0.5
    x = lp(lp(x, 11000), 11000)
    x *= np.exp(-t / (0.11 if open_ else 0.022))
    return fade_tail(x * vel * 0.8, 3)


def shaker(vel=1.0):
    n = int(0.08 * SR)
    t = _t(n)
    e = smoothstep(t / 0.012) * np.exp(-np.maximum(t - 0.012, 0) / 0.03)
    return fade_tail(lp(bp(noise(n), 6000, 1.4), 11000) * e * vel, 3)


def rim(vel=1.0):
    n = int(0.06 * SR)
    t = _t(n)
    x = np.sin(TAU * 1750 * t) * np.exp(-t / 0.012) + bp(noise(n), 3200, 3) * np.exp(-t / 0.006) * 0.6
    return fade_tail(x * vel, 3)


# ================================================================== ベース
def sub(midi, dur, vel=1.0, glide_from=None, glide=0.05):
    n_on = int(dur * SR)
    e = env_adsr(n_on, a=0.004, d=0.2, s=0.92, r=0.05)
    n = len(e)
    f = np.full(n, float(hz(midi)))
    if glide_from is not None:
        k = min(n, int(glide * SR))
        f[:k] = hz(glide_from) * (hz(midi) / hz(glide_from)) ** smoothstep(np.arange(k) / k)
    ph = phase(f, n)
    x = np.sin(TAU * ph) + 0.18 * np.sin(2 * TAU * ph) + 0.05 * np.sin(3 * TAU * ph)
    return soft(x * e * 0.9, 1.4) * vel


def growl(midi, dur, vel=1.0, cutoff=900.0):
    """drop で重ねる中音域のベース（のこぎり波 2 本をこもらせて少し歪ませる）。"""
    n_on = int(dur * SR)
    e = env_adsr(n_on, a=0.006, d=0.15, s=0.8, r=0.06)
    n = len(e)
    f = hz(midi)
    x = saw(f * 2 ** (8 / 1200), n, rng().random()) + saw(f * 2 ** (-8 / 1200), n, rng().random())
    fc = cutoff * (1 + 1.5 * np.exp(-_t(n) / 0.08))
    x = sweep(x, 'lp', fc, 2.2)
    return soft(x * e * 0.6, 2.5) * vel


# ================================================================== 和音
@lru_cache(maxsize=256)
def _supersaw_core(notes, n, voices, detune, stereo, seed):
    r = np.random.default_rng(seed)
    out = np.zeros((2, n))
    spread = np.linspace(-1, 1, voices)
    # 外側ほど大きくずらす（JP-8000 風の非線形の広がり）
    cents = np.sign(spread) * np.abs(spread) ** 1.4 * detune
    weights = np.where(np.abs(spread) < 1e-9, 1.0, 0.72)
    for m in notes:
        f0 = float(hz(m))
        for s, c, w in zip(spread, cents, weights):
            x = saw(f0 * 2 ** (c / 1200), n, r.random()) * w
            th = (s * stereo + 1) * np.pi / 4
            out[0] += x * np.cos(th)
            out[1] += x * np.sin(th)
    out /= np.sqrt(len(notes) * np.sum(weights ** 2)) * 1.1
    out.setflags(write=False)
    return out


def supersaw(notes, dur, vel=1.0, cutoff=7000.0, q=0.8, release=0.22, attack=0.006,
             voices=7, detune=22.0, stereo=0.9, bend=None):
    """スーパーソーの和音。bend（半音、時間の配列）を渡すと音の高さを動かせる。"""
    n_on = int(dur * SR)
    e = env_adsr(n_on, a=attack, d=0.3, s=0.85, r=release)
    n = len(e)
    if bend is None:
        x = np.array(_supersaw_core(tuple(int(m) for m in notes), n, voices, detune, stereo, hash(tuple(notes)) % 9973))
    else:
        b = np.interp(np.arange(n), np.linspace(0, n, len(bend)), bend)
        x = np.zeros((2, n))
        spread = np.linspace(-1, 1, voices)
        cents = np.sign(spread) * np.abs(spread) ** 1.4 * detune
        r = np.random.default_rng(17)
        for m in notes:
            for s, c in zip(spread, cents):
                f = hz(m) * 2 ** ((c / 100 + b) / 12)
                y = saw_ph(phase(f, n, r.random()), f) * (1.0 if abs(s) < 1e-9 else 0.72)
                th = (s * stereo + 1) * np.pi / 4
                x[0] += y * np.cos(th)
                x[1] += y * np.sin(th)
        x /= np.sqrt(len(notes) * (1 + 0.72 ** 2 * (voices - 1))) * 1.1
    if np.ndim(cutoff) == 0:
        x = lp(x, cutoff, q)
    else:
        c = np.interp(np.arange(n), np.linspace(0, n, len(cutoff)), cutoff)
        x = sweep(x, 'lp', c, q)
    return x * e * vel


# ================================================================== 鍵盤・鈴
def fm_bell(midi, dur=0.6, vel=1.0, ratio=3.5, index=2.2, decay=0.9, idx_tau=0.18, bright=1.0):
    n = int((dur + decay * 2.2) * SR)
    t = _t(n)
    fc = float(hz(midi))
    I = index * bright * np.exp(-t / idx_tau)
    x = np.sin(TAU * fc * t + I * np.sin(TAU * fc * ratio * t))
    e = env_perc(n, 0.0015, decay)
    off = int(dur * SR)
    if off < n:
        e[off:] *= np.exp(-np.arange(n - off) / (0.25 * SR))
    return fade_tail(x * e * vel, 10)


def music_box(midi, vel=1.0):
    n = int(1.8 * SR)
    t = _t(n)
    fc = float(hz(midi))
    x = (np.sin(TAU * fc * t + 1.1 * np.exp(-t / 0.05) * np.sin(TAU * fc * 5.0 * t))
         + 0.22 * np.sin(TAU * fc * 2.0 * t) * np.exp(-t / 0.35)
         + 0.08 * np.sin(TAU * fc * 4.2 * t) * np.exp(-t / 0.12))
    tick = hp(noise(n), 5000) * np.exp(-t / 0.002) * 0.15
    e = env_perc(n, 0.001, 0.65)
    return fade_tail((x * e + tick) * vel * 0.8, 20)


def ep(midi, dur, vel=1.0):
    """FM のエレクトリックピアノ（やわらかい胴の音＋金属のきらめき）。"""
    n_on = int(dur * SR)
    n = n_on + int(0.6 * SR)
    t = _t(n)
    fc = float(hz(midi))
    body = np.sin(TAU * fc * t + (1.4 * np.exp(-t / 0.5) + 0.25) * vel * np.sin(TAU * fc * t))
    tine = np.sin(TAU * fc * t + 0.9 * np.exp(-t / 0.018) * np.sin(TAU * fc * 14 * t)) * np.exp(-t / 0.08)
    e = env_perc(n, 0.002, 1.4)
    e[n_on:] *= np.exp(-np.arange(n - n_on) / (0.12 * SR))
    return fade_tail((body + 0.35 * tine) * e * vel * 0.7, 10)


def pluck(midi, vel=1.0, length=1.2, bright=0.55, t60=0.9):
    """カリンバ風のはじく音（カープラス・ストロング）。"""
    f = float(hz(midi))
    L = SR / f
    Li = int(L)
    frac = L - Li
    n = int(length * SR)
    exc = np.zeros(n)
    burst = noise(Li)
    burst = lp(burst, 1500 + 7000 * bright)
    exc[:Li] = burst * np.hanning(Li)
    g = np.exp(-6.91 / (f * t60))
    a = np.zeros(Li + 2)
    a[0] = 1.0
    a[Li] = -g * (1 - frac) * 0.5
    a[Li + 1] = -g * (0.5 + frac * 0.5)
    y = signal.lfilter([1.0], a, exc)
    y = y / (np.max(np.abs(y[:Li * 4])) + 1e-9)
    return fade_tail(y * vel * 0.8, 15)


def chip(midi, dur, vel=1.0, width=0.25, vib=True):
    n_on = int(dur * SR)
    e = env_adsr(n_on, a=0.002, d=0.06, s=0.6, r=0.03)
    n = len(e)
    t = _t(n)
    f = hz(midi) * (2 ** (np.sin(TAU * 6 * t) * smoothstep((t - 0.12) / 0.1) * 18 / 1200) if vib else 1.0)
    x = pulse(f, n, width, 0.0)
    return lp(x * e * vel * 0.5, 9000)


# ================================================================== ボーカルチョップ（加算合成のフォルマント）
# 母音のフォルマント（中心 Hz, 帯域 Hz, 強さ）。子どもの声に近づけるため、あとで全体を高くする。
VOWELS = {
    'a': [(850, 110, 1.0), (1300, 130, 0.62), (2900, 200, 0.22), (3800, 260, 0.12)],
    'i': [(310, 70, 1.0), (2550, 160, 0.42), (3200, 200, 0.32), (3900, 260, 0.14)],
    'u': [(350, 80, 1.0), (1450, 140, 0.34), (2600, 200, 0.18), (3600, 260, 0.08)],
    'e': [(520, 90, 1.0), (2150, 150, 0.46), (2850, 200, 0.28), (3700, 260, 0.12)],
    'o': [(520, 90, 1.0), (900, 110, 0.62), (2700, 200, 0.18), (3600, 260, 0.08)],
    'n': [(280, 70, 1.0), (1700, 300, 0.05), (2600, 300, 0.04), (3600, 300, 0.02)],
}
VOWEL_LOUD = {'a': 1.0, 'i': 0.85, 'u': 0.8, 'e': 0.92, 'o': 0.95, 'n': 0.6}
KANA = {
    ('', 'a'): 'あ', ('', 'i'): 'い', ('', 'u'): 'う', ('', 'e'): 'え', ('', 'o'): 'お',
    ('r', 'a'): 'ら', ('r', 'i'): 'り', ('r', 'u'): 'る', ('r', 'e'): 'れ', ('r', 'o'): 'ろ',
    ('n', 'a'): 'な', ('n', 'i'): 'に', ('n', 'u'): 'ぬ', ('n', 'e'): 'ね', ('n', 'o'): 'の',
    ('m', 'a'): 'ま', ('m', 'i'): 'み', ('m', 'u'): 'む', ('m', 'e'): 'め', ('m', 'o'): 'も',
    ('y', 'a'): 'や', ('y', 'u'): 'ゆ', ('y', 'o'): 'よ', ('w', 'a'): 'わ', ('w', 'o'): 'を',
    ('p', 'a'): 'ぱ', ('p', 'i'): 'ぴ', ('p', 'u'): 'ぷ', ('p', 'e'): 'ぺ', ('p', 'o'): 'ぽ',
    ('t', 'a'): 'た', ('t', 'e'): 'て', ('t', 'o'): 'と', ('k', 'a'): 'か', ('k', 'i'): 'き',
    ('k', 'u'): 'く', ('k', 'e'): 'け', ('k', 'o'): 'こ', ('h', 'a'): 'は', ('h', 'i'): 'ひ',
    ('h', 'u'): 'ふ', ('h', 'e'): 'へ', ('h', 'o'): 'ほ', ('', 'n'): 'ん',
}


def parse_syllable(s):
    """'ra' → ('r', 'a')、'n' → ('', 'n')。"""
    if s == 'n':
        return '', 'n'
    return s[:-1], s[-1]


def _formant_gain(freqs, table, scale):
    """周波数（配列）ごとの、声道の通りやすさ。table は時間で変わる (F, B, g) の配列。"""
    g = np.zeros_like(freqs)
    for F, B, w in table:
        F = F * scale
        B = B * scale
        g += w / (1.0 + ((freqs - F) / (B * 0.5)) ** 2)
    return g


def chop(midi, dur, syllable='a', vel=1.0, scale=1.28, breath=0.035, vib_depth=22.0, scoop=55.0,
         glide_from=None):
    """声のように聞こえる 1 音。syllable は 'a' 'ra' 'pi' 'n' など。"""
    cons, vow = parse_syllable(syllable)
    n_on = int(dur * SR)
    e = env_adsr(n_on, a=0.006, d=0.08, s=0.82, r=0.045)
    n = len(e)
    t = _t(n)
    # 音の高さ: しゃくり（下から入る）→ ビブラート
    f0 = float(hz(midi))
    cents = -scoop * np.exp(-t / 0.018)
    if glide_from is not None:
        k = min(n, int(0.06 * SR))
        cents[:k] += (float(glide_from) - midi) * 100 * (1 - smoothstep(np.arange(k) / k))
    cents += vib_depth * np.sin(TAU * 5.6 * t) * smoothstep((t - 0.13) / 0.12)
    f = f0 * 2 ** (cents / 1200)
    ph = phase(f, n)
    # フォルマントの移り変わり（子音の位置 → 母音）
    target = np.array(VOWELS[vow], dtype=float)
    start = target.copy()
    trans = 0.03
    amp_shape = np.ones(n)
    pre_noise = None
    if cons in ('n', 'm'):
        start = np.array(VOWELS['n'], dtype=float)
        if cons == 'm':
            start[1, 0] = 1100
        trans = 0.05
        amp_shape *= 0.65 + 0.35 * smoothstep((t - 0.03) / 0.03)
    elif cons == 'y':
        start = np.array(VOWELS['i'], dtype=float)
        trans = 0.055
    elif cons == 'w':
        start = np.array(VOWELS['u'], dtype=float)
        start[1, 0] = 800
        trans = 0.055
    elif cons == 'r':
        start = target.copy()
        start[1, 0] = 1500
        start[0, 0] = target[0, 0] * 0.7
        trans = 0.025
        amp_shape *= 1 - 0.55 * np.exp(-((t - 0.012) / 0.006) ** 2)
    elif cons in ('p', 't', 'k'):
        fc = {'p': 900, 't': 4200, 'k': 2100}[cons]
        nb = int(0.012 * SR)
        pre_noise = bp(noise(nb), fc, 1.2) * np.exp(-np.arange(nb) / (0.004 * SR)) * 0.9
        amp_shape *= smoothstep((t - 0.004) / 0.01)
    elif cons == 'h':
        nb = int(0.05 * SR)
        z = noise(nb)
        pre_noise = (bp(z, 1200 * scale, 1.0) * 0.6 + bp(z, 2600 * scale, 1.5) * 0.4) * np.hanning(nb) * 0.5
        amp_shape *= smoothstep((t - 0.035) / 0.02)
    mix = smoothstep(t / trans)[:, None, None]
    table = start[None] * (1 - mix) + target[None] * mix  # (n, 4, 3)
    # 加算合成: 倍音ごとの強さ = 声帯の音の傾き × 声道の通りやすさ
    x = np.zeros(n)
    power = np.zeros(n)
    kmax = int(min(40, (SR * 0.45) / f0))
    for k in range(1, kmax + 1):
        fk = k * f
        gk = np.zeros(n)
        for j in range(4):
            F = table[:, j, 0] * scale
            B = table[:, j, 1] * scale
            gk += table[:, j, 2] / (1.0 + ((fk - F) / (B * 0.5)) ** 2)
        a_k = gk / k ** 0.75
        x += np.sin(TAU * k * ph) * a_k
        power += a_k ** 2
    # 瞬間ごとの倍音の強さで割り、母音や子音の移り変わりで音量がふらつかないようにする
    x = x / np.sqrt(0.5 * power + 1e-9) * 0.42 * VOWEL_LOUD[vow]
    # 息の音（高い所だけ、少し）
    x += lp(hp(noise(n), 3500), 9000) * breath
    x *= e * amp_shape
    if pre_noise is not None:
        x[:len(pre_noise)] += pre_noise * (1 if cons != 'h' else 1)
    return fade_tail(x * vel * 0.8, 6)


# ================================================================== 効果音
def squeak(vel=1.0, up=True):
    """おもちゃの「キュッ」。"""
    n = int(0.16 * SR)
    t = _t(n)
    if up:
        f = 900 + 1500 * smoothstep(t / 0.06) - 500 * smoothstep((t - 0.07) / 0.07)
    else:
        f = 2200 - 1300 * smoothstep(t / 0.12)
    f = f * (1 + 0.02 * np.sin(TAU * 38 * t))
    x = np.sin(TAU * np.cumsum(f) / SR) + 0.3 * np.sin(2 * TAU * np.cumsum(f) / SR)
    e = smoothstep(t / 0.01) * (1 - smoothstep((t - 0.11) / 0.05))
    return x * e * vel * 0.6


def pop(vel=1.0, pitch=1.0):
    """泡がはじける「ぽん」。"""
    n = int(0.09 * SR)
    t = _t(n)
    f = (320 + 1100 * smoothstep(t / 0.022)) * pitch
    x = np.sin(TAU * np.cumsum(f) / SR) * np.exp(-t / 0.028) * smoothstep(t / 0.002)
    x += hp(noise(n), 4000) * np.exp(-t / 0.0015) * 0.2
    return fade_tail(x * vel * 0.8, 4)


def sparkle(vel=1.0, seed=1, count=9, length=0.7, low=86, scale=(0, 2, 4, 7, 9), up=True):
    """きらきら（高い鈴をばらばらの時刻と左右に置く）。"""
    r = np.random.default_rng(seed)
    n = int((length + 1.6) * SR)
    out = np.zeros((2, n))
    notes = [low + 12 * (i // len(scale)) + scale[i % len(scale)] for i in range(count)]
    if not up:
        notes = notes[::-1]
    for i, m in enumerate(notes):
        t0 = length * i / count + r.random() * 0.02
        x = fm_bell(m, 0.1, vel=0.5 + 0.5 * r.random(), ratio=3.5, index=1.4, decay=0.45)
        st = pan(x, r.random() * 1.6 - 0.8)
        i0 = int(t0 * SR)
        k = min(st.shape[1], n - i0)
        out[:, i0:i0 + k] += st[:, :k]
    return out * vel * 0.5


def riser(length, vel=1.0, f0=350.0, f1=9000.0):
    n = int(length * SR)
    t = _t(n) / length
    z = np.vstack([noise(n), noise(n)])
    fc = f0 * (f1 / f0) ** (t ** 1.6)
    y = sweep(z, 'bp', fc, 1.4)
    return y * (t ** 1.8) * vel * 0.9


def downlifter(length, vel=1.0):
    n = int(length * SR)
    t = _t(n) / length
    z = np.vstack([noise(n), noise(n)])
    fc = 7000 * (250 / 7000) ** (t ** 0.7)
    y = sweep(z, 'bp', fc, 1.2)
    return y * (1 - t) ** 1.5 * smoothstep(t / 0.01) * vel


def reverse_cymbal(length, vel=1.0):
    n = int(length * SR)
    t = _t(n)
    z = lp(np.vstack([hp(noise(n), 3000), hp(noise(n), 3000)]), 10000)
    e = np.exp(-t / (length * 0.35))
    return (z * e)[:, ::-1] * vel * 0.6


def reverse_snare(length, vel=1.0):
    """止めの小節で次の小節へ吸い込まれる、逆再生のスネア。"""
    n = int(length * SR)
    t = _t(n)
    z = noise(n)
    x = lp(bp(z, 1800, 0.7) * 0.8 + bp(z, 5000, 0.9) * 0.4, 10000)
    x += np.sin(TAU * 210 * t) * 0.3
    e = np.exp((t - length) / (length * 0.28))
    return fade_tail(x * e * vel, 3)


def impact(vel=1.0):
    n = int(2.2 * SR)
    t = _t(n)
    f = 30 + 38 * np.exp(-t / 0.25)
    boom = np.sin(TAU * np.cumsum(f) / SR) * np.exp(-t / 0.9)
    z = lp(noise(n), 2500) * np.exp(-t / 0.35) * 0.5
    return soft((boom + z) * vel, 1.3)
