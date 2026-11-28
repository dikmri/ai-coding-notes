"""音の合成の道具（numpy と scipy だけを使う）。

発振器（帯域を制限したのこぎり波・矩形波）、フィルター、包絡、リバーブ、ディレイ、
ラウドネスの測定（ITU-R BS.1770）、リミッターをまとめる。
"""
import numpy as np
from scipy import signal
from scipy.ndimage import maximum_filter1d, minimum_filter1d, uniform_filter1d

SR = 48000
TAU = 2 * np.pi
NOTE_INDEX = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


# ------------------------------------------------------------------ 音の高さ
def nm(name):
    """'F#4' や 'Bb3' を MIDI の番号にする（C4 = 60）。"""
    s = name.strip()
    base = NOTE_INDEX[s[0].upper()]
    i = 1
    while i < len(s) and s[i] in '#b':
        base += 1 if s[i] == '#' else -1
        i += 1
    return base + 12 * (int(s[i:]) + 1)


def hz(m):
    return 440.0 * 2.0 ** ((np.asarray(m, dtype=float) - 69.0) / 12.0)


NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


def note_name(m):
    m = int(round(m))
    return f'{NAMES[m % 12]}{m // 12 - 1}'


# ------------------------------------------------------------------ 発振器
def phase(f, n, phi0=0.0):
    """周波数（定数か配列）から 0〜1 の位相を作る。"""
    if np.ndim(f) == 0:
        return (phi0 + float(f) / SR * np.arange(n)) % 1.0
    f = np.asarray(f, dtype=float)[:n]
    return (phi0 + np.concatenate(([0.0], np.cumsum(f[:-1]))) / SR) % 1.0


def _blep(ph, dt):
    """のこぎり波の段差をなめらかにする補正（PolyBLEP）。"""
    out = np.zeros_like(ph)
    dt = np.broadcast_to(dt, ph.shape)
    m = ph < dt
    x = ph[m] / dt[m]
    out[m] = x + x - x * x - 1.0
    m = ph > 1.0 - dt
    x = (ph[m] - 1.0) / dt[m]
    out[m] = x * x + x + x + 1.0
    return out


def saw_ph(ph, f):
    dt = np.asarray(f, dtype=float) / SR
    return 2.0 * ph - 1.0 - _blep(ph, dt)


def saw(f, n, phi0=0.0):
    return saw_ph(phase(f, n, phi0), f)


def pulse(f, n, width=0.5, phi0=0.0):
    ph = phase(f, n, phi0)
    return 0.5 * (saw_ph(ph, f) - saw_ph((ph + width) % 1.0, f))


def sine(f, n, phi0=0.0):
    return np.sin(TAU * phase(f, n, phi0))


def tri(f, n, phi0=0.0):
    ph = phase(f, n, phi0)
    return 1.0 - 4.0 * np.abs(ph - 0.5)


_rng = np.random.default_rng(20261128)


def rng():
    return _rng


def noise(n):
    return _rng.standard_normal(n)


# ------------------------------------------------------------------ フィルター
def biquad(kind, fc, q=0.7071, gain_db=0.0):
    """RBJ の式による 2 次のフィルターの係数（b, a）。"""
    fc = float(np.clip(fc, 10.0, SR * 0.49))
    w = TAU * fc / SR
    cw, sw = np.cos(w), np.sin(w)
    alpha = sw / (2 * q)
    A = 10 ** (gain_db / 40)
    if kind == 'lp':
        b = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2]
        a = [1 + alpha, -2 * cw, 1 - alpha]
    elif kind == 'hp':
        b = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2]
        a = [1 + alpha, -2 * cw, 1 - alpha]
    elif kind == 'bp':
        b = [alpha, 0.0, -alpha]
        a = [1 + alpha, -2 * cw, 1 - alpha]
    elif kind == 'peak':
        b = [1 + alpha * A, -2 * cw, 1 - alpha * A]
        a = [1 + alpha / A, -2 * cw, 1 - alpha / A]
    elif kind == 'lowshelf':
        sq = 2 * np.sqrt(A) * alpha
        b = [A * ((A + 1) - (A - 1) * cw + sq), 2 * A * ((A - 1) - (A + 1) * cw), A * ((A + 1) - (A - 1) * cw - sq)]
        a = [(A + 1) + (A - 1) * cw + sq, -2 * ((A - 1) + (A + 1) * cw), (A + 1) + (A - 1) * cw - sq]
    elif kind == 'highshelf':
        sq = 2 * np.sqrt(A) * alpha
        b = [A * ((A + 1) + (A - 1) * cw + sq), -2 * A * ((A - 1) + (A + 1) * cw), A * ((A + 1) + (A - 1) * cw - sq)]
        a = [(A + 1) - (A - 1) * cw + sq, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - sq]
    else:
        raise ValueError(kind)
    b = np.array(b) / a[0]
    a = np.array(a) / a[0]
    return b, a


def filt(x, kind, fc, q=0.7071, gain_db=0.0):
    b, a = biquad(kind, fc, q, gain_db)
    return signal.lfilter(b, a, x, axis=-1)


def lp(x, fc, q=0.7071):
    return filt(x, 'lp', fc, q)


def hp(x, fc, q=0.7071):
    return filt(x, 'hp', fc, q)


def bp(x, fc, q=1.0):
    return filt(x, 'bp', fc, q)


def sweep(x, kind, fc_curve, q=0.7071, block=128):
    """時間で変わるフィルター（短い区切りごとに係数を変え、内部の状態は引き継ぐ）。"""
    x = np.atleast_2d(x)
    n = x.shape[-1]
    fc_curve = np.broadcast_to(np.asarray(fc_curve, dtype=float), (n,))
    q_curve = np.broadcast_to(np.asarray(q, dtype=float), (n,))
    y = np.empty_like(x)
    zi = np.zeros((x.shape[0], 2))
    for s in range(0, n, block):
        e = min(n, s + block)
        mid = (s + e) // 2
        b, a = biquad(kind, fc_curve[mid], q_curve[mid])
        y[:, s:e], zi = signal.lfilter(b, a, x[:, s:e], axis=-1, zi=zi)
    return y if y.shape[0] > 1 else y[0]


# ------------------------------------------------------------------ 包絡
def env_adsr(n_on, a=0.005, d=0.1, s=0.7, r=0.1, curve=4.0):
    """鳴っている長さ n_on（サンプル）＋余韻 r の包絡。"""
    na, nd, nr = max(1, int(a * SR)), max(1, int(d * SR)), max(1, int(r * SR))
    total = n_on + nr
    e = np.empty(total)
    t = np.arange(total)
    # 立ち上がり → 減衰 → 持続
    e[:] = s
    ia = min(na, total)
    e[:ia] = np.linspace(0, 1, na, endpoint=False)[:ia]
    if na < total:
        k = np.arange(min(nd, total - na))
        e[na:na + len(k)] = s + (1 - s) * np.exp(-curve * k / nd)
    # 離した時点の値から余韻へ
    if n_on < total:
        v = e[min(n_on, total - 1) - 1] if n_on > 0 else 0.0
        k = np.arange(total - n_on)
        e[n_on:] = v * np.exp(-curve * k / nr)
    del t
    return e


def env_perc(n, a=0.002, tau=0.2):
    t = np.arange(n) / SR
    e = np.exp(-t / tau)
    na = max(1, int(a * SR))
    e[:na] *= np.linspace(0, 1, na)
    return e


def fade_tail(x, ms=8):
    k = min(x.shape[-1], int(ms * SR / 1000))
    if k > 0:
        x[..., -k:] *= np.linspace(1, 0, k)
    return x


def smoothstep(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


# ------------------------------------------------------------------ ステレオ・配置
def pan(x, p=0.0):
    """等しい力の定位。p は -1（左）〜 +1（右）。"""
    th = (np.clip(p, -1, 1) + 1) * np.pi / 4
    return np.vstack([x * np.cos(th), x * np.sin(th)]) * np.sqrt(2)


def to_stereo(x):
    return x if x.ndim == 2 else np.vstack([x, x])


def add(buf, x, t0, gain=1.0):
    """buf（2, N）の時刻 t0 秒の位置へ x（モノラルかステレオ）を足す。"""
    x = to_stereo(np.asarray(x))
    i0 = int(round(t0 * SR))
    n = buf.shape[1]
    if i0 >= n or i0 + x.shape[1] <= 0:
        return
    s = max(0, -i0)
    e = min(x.shape[1], n - i0)
    buf[:, i0 + s:i0 + e] += gain * x[:, s:e]


def soft(x, drive=1.0):
    return np.tanh(drive * x) / np.tanh(drive)


def db(v):
    return 10.0 ** (v / 20.0)


def to_db(v):
    return 20 * np.log10(np.maximum(v, 1e-12))


# ------------------------------------------------------------------ 空間
def make_ir(seconds=2.6, pre=0.018, rt_low=2.6, rt_mid=2.1, rt_high=1.1, width=1.0, seed=7):
    """周波数ごとに減衰の速さが違う、ステレオの残響の応答を作る。"""
    r = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = np.arange(n) / SR
    out = np.zeros((2, n + int(pre * SR)))
    for ch in range(2):
        z = r.standard_normal(n)
        lo = lp(z, 400)
        hi = hp(z, 4500)
        mid = z - lo - hi
        tail = (lo * np.exp(-6.91 * t / rt_low) + mid * np.exp(-6.91 * t / rt_mid)
                + hi * np.exp(-6.91 * t / rt_high))
        # 立ち上がりを少し丸める（最初の反射が密になっていく感じ）
        tail *= smoothstep(t / 0.06) * 0.85 + 0.15
        # 初期反射
        for k in range(10):
            d = int((0.004 + r.random() * 0.045) * SR)
            if d < n:
                tail[d] += (r.random() * 2 - 1) * 0.9 * np.exp(-d / SR / 0.05)
        out[ch, int(pre * SR):] = tail
    # 左右の相関を減らしすぎない（width < 1 で中央に寄る）
    m = (out[0] + out[1]) / 2
    sd = (out[0] - out[1]) / 2 * width
    out = np.vstack([m + sd, m - sd])
    return out / np.sqrt(np.sum(out ** 2) / 2)


def convolve(x, ir):
    x = to_stereo(x)
    y = np.vstack([signal.oaconvolve(x[c], ir[c])[:x.shape[1]] for c in range(2)])
    return y


def pingpong(x, delay_s, fb=0.45, taps=6, tone=6000.0):
    """左右に跳ねるディレイ（有限の回数の反射を足し合わせる）。"""
    x = to_stereo(x)
    n = x.shape[1]
    d = int(delay_s * SR)
    out = np.zeros_like(x)
    mono = (x[0] + x[1]) / 2
    cur = mono.copy()
    for k in range(1, taps + 1):
        cur = lp(cur, tone)
        s = d * k
        if s >= n:
            break
        ch = (k - 1) % 2
        out[ch, s:] += cur[:n - s] * fb ** k
    return out


# ------------------------------------------------------------------ 測る・まとめる
_K1 = (np.array([1.53512485958697, -2.69169618940638, 1.19839281085285]),
       np.array([1.0, -1.69065929318241, 0.73248077421585]))
_K2 = (np.array([1.0, -2.0, 1.0]), np.array([1.0, -1.99004745483398, 0.99007225036621]))


def k_weight(x):
    y = signal.lfilter(_K1[0], _K1[1], to_stereo(x), axis=-1)
    return signal.lfilter(_K2[0], _K2[1], y, axis=-1)


def loudness_blocks(x, block=0.4, overlap=0.75):
    """400 ms の区切りごとの K 特性の平均の二乗（区切りの開始時刻つき）。"""
    y = k_weight(x)
    p = np.sum(y ** 2, axis=0)
    nb = int(block * SR)
    hop = int(nb * (1 - overlap))
    c = np.concatenate(([0.0], np.cumsum(p)))
    starts = np.arange(0, len(p) - nb + 1, hop)
    ms = (c[starts + nb] - c[starts]) / nb
    return starts / SR, ms


def lufs(x):
    """統合ラウドネス（ITU-R BS.1770-4、ゲート付き）。"""
    _, ms = loudness_blocks(x)
    lk = -0.691 + 10 * np.log10(np.maximum(ms, 1e-12))
    g = ms[lk > -70]
    if len(g) == 0:
        return -70.0
    rel = -0.691 + 10 * np.log10(np.mean(g)) - 10
    g2 = ms[(lk > -70) & (lk > rel)]
    return float(-0.691 + 10 * np.log10(np.mean(g2)))


def short_term(x, win=3.0):
    """3 秒の窓のラウドネス（1 秒ごと）。"""
    y = k_weight(x)
    p = np.sum(y ** 2, axis=0)
    nb = int(win * SR)
    hop = SR
    c = np.concatenate(([0.0], np.cumsum(p)))
    starts = np.arange(0, max(1, len(p) - nb + 1), hop)
    ms = (c[np.minimum(starts + nb, len(p))] - c[starts]) / nb
    return starts / SR + win / 2, -0.691 + 10 * np.log10(np.maximum(ms, 1e-12))


def true_peak_db(x):
    """4 倍に増やした点での最大値（真のピークの近似）。"""
    x = to_stereo(x)
    up = signal.resample_poly(x, 4, 1, axis=-1)
    return float(to_db(np.max(np.abs(up))))


def compress(x, threshold_db=-12.0, ratio=2.0, attack=0.01, release=0.12, knee_db=6.0, makeup_db=0.0):
    """ゆるいバスコンプレッサー（左右で同じ量を下げる）。"""
    x = to_stereo(x)
    p = np.mean(x ** 2, axis=0)
    a_rms = np.exp(-1 / (0.02 * SR))
    env = signal.lfilter([1 - a_rms], [1, -a_rms], p)
    lvl = 10 * np.log10(np.maximum(env, 1e-12))
    over = lvl - threshold_db
    gr = np.where(over <= -knee_db / 2, 0.0,
                  np.where(over >= knee_db / 2, over * (1 - 1 / ratio),
                           (1 - 1 / ratio) * (over + knee_db / 2) ** 2 / (2 * knee_db)))
    # 下げるときは速く、戻すときはゆっくり（近似: 2 つのなめらかさの大きい方）
    a_att = np.exp(-1 / (attack * SR))
    a_rel = np.exp(-1 / (release * SR))
    fast = signal.lfilter([1 - a_att], [1, -a_att], gr)
    slow = signal.lfilter([1 - a_rel], [1, -a_rel], gr)
    g = db(-(np.maximum(fast, slow)) + makeup_db)
    return x * g, g


def limit(x, ceiling_db=-1.0, lookahead=0.003, release=0.06):
    """先読みのピークリミッター。戻り値は（出力, 下げた量の配列）。"""
    x = to_stereo(x)
    ceil = db(ceiling_db)
    la = max(1, int(lookahead * SR))
    pk = np.max(np.abs(x), axis=0)
    need = np.minimum(1.0, ceil / np.maximum(pk, 1e-12))
    g = minimum_filter1d(need, size=2 * la + 1)
    g = uniform_filter1d(g, size=la)
    a_rel = np.exp(-1 / (release * SR))
    sm = signal.lfilter([1 - a_rel], [1, -a_rel], g, zi=[g[0] * a_rel])[0]
    g = np.minimum(g, sm)
    y = x * g
    return np.clip(y, -ceil, ceil), g


def peak_hold(x, size):
    return maximum_filter1d(x, size=size)
