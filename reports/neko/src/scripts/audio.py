"""音を numpy だけで合成する（48 kHz ステレオ 30 秒）。

使い方: <Blender の python> -I scripts/audio.py
出力: out/audio.wav、logs/audio_stats.txt（区間ごとの音量など）、logs/audio_spectrogram.png

中身（時刻は timeline.py と共有）:
  風、遠くの車の流れ、秋の虫（コオロギ類）、カラス（鳴き声と飛び立つ羽音）、
  夕方の町内チャイム（オリジナルの旋律、スピーカーのこだま）、猫の足音・跳躍と着地・匂いをかぐ音・のどを鳴らす音、
  自動販売機のうなり（距離と向きで変わる）
"""
import math
import os
import struct
import sys
import wave
import zlib

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import timeline as T  # noqa: E402
from common import OUT, LOGS, SEED, log  # noqa: E402

SR = 48000
DUR = 30.0
N = int(SR * DUR)
rng = np.random.default_rng(SEED)
t_all = np.arange(N) / SR


# ------------------------------------------------------------------ 道具
def fft_filter(x, gain_fn):
    """周波数ごとの倍率で濾す（信号全体を一度に）。"""
    n = len(x)
    nf = 1 << (n - 1).bit_length()
    X = np.fft.rfft(x, nf)
    f = np.fft.rfftfreq(nf, 1 / SR)
    X *= gain_fn(f)
    return np.fft.irfft(X, nf)[:n]


def lowpass(fc, order=2):
    return lambda f: 1 / np.sqrt(1 + (f / fc) ** (2 * order))


def highpass(fc, order=2):
    return lambda f: 1 / np.sqrt(1 + (fc / np.maximum(f, 1e-3)) ** (2 * order))


def band(fc, bw):
    return lambda f: np.exp(-0.5 * ((f - fc) / bw) ** 2)


def noise(n):
    return rng.standard_normal(n)


def pink(n):
    return fft_filter(noise(n), lambda f: 1 / np.sqrt(np.maximum(f, 20.0) / 20.0))


def brown(n):
    return fft_filter(noise(n), lambda f: 1 / (np.maximum(f, 10.0) / 10.0))


def db(v):
    return 10 ** (v / 20)


def norm(x):
    p = np.max(np.abs(x)) + 1e-12
    return x / p


def place_mono(buf, x, t0, gl=1.0, gr=1.0):
    i0 = int(round(t0 * SR))
    if i0 >= N:
        return
    seg = x[: max(0, N - i0)]
    if i0 < 0:
        seg = seg[-i0:]
        i0 = 0
    buf[0, i0:i0 + len(seg)] += seg * gl
    buf[1, i0:i0 + len(seg)] += seg * gr


def env_adsr(n, a, r, sustain_curve=None):
    e = np.ones(n)
    na, nr = max(1, int(a * SR)), max(1, int(r * SR))
    e[:na] = np.linspace(0, 1, na)
    e[-nr:] *= np.linspace(1, 0, nr)
    if sustain_curve is not None:
        e *= sustain_curve
    return e


def reverb_ir(seconds, decay, hf_damp=4000.0):
    n = int(seconds * SR)
    tt = np.arange(n) / SR
    ir = np.stack([noise(n), noise(n)]) * np.exp(-tt / decay)
    for c in range(2):
        ir[c] = fft_filter(ir[c], lowpass(hf_damp, 1))
    ir[:, :int(0.01 * SR)] *= np.linspace(0, 1, int(0.01 * SR))
    return ir / np.sqrt(np.sum(ir ** 2) / 2)


def convolve(x, ir):
    n = len(x) + len(ir) - 1
    nf = 1 << (n - 1).bit_length()
    y = np.fft.irfft(np.fft.rfft(x, nf) * np.fft.rfft(ir, nf), nf)[:len(x)]
    return y


# ------------------------------------------------------------------ 頭の向き（毎コマ → 毎サンプル）
FR = np.arange(1, T.FPS * 30 + 1)
POSES = [T.pose(T.frame_time(int(f))) for f in FR]
P_T = np.array([p["t"] for p in POSES])
P_EYE = np.array([p["eye"] for p in POSES])
P_YAW = np.radians(np.array([p["yaw"] for p in POSES]))


def spatial_gains(src, t0, n, ref=4.0, min_d=0.5):
    """音源の位置から、左右の倍率（毎サンプル）を作る。等パワーのパンと距離の減衰。"""
    ts = t0 + np.arange(n) / SR
    ex = np.interp(ts, P_T, P_EYE[:, 0])
    ey = np.interp(ts, P_T, P_EYE[:, 1])
    ez = np.interp(ts, P_T, P_EYE[:, 2])
    yaw = np.interp(ts, P_T, P_YAW)
    dx, dy, dz = src[0] - ex, src[1] - ey, src[2] - ez
    d = np.maximum(np.sqrt(dx * dx + dy * dy + dz * dz), min_d)
    az = np.arctan2(-dx, dy) - yaw            # 左が正
    pan = np.clip(-np.sin(az), -1, 1)          # -1 左 … +1 右
    th = (pan + 1) * math.pi / 4
    att = np.minimum(1.0, ref / d)
    # 後ろの音は少しこもる代わりに少し小さく
    back = 0.8 + 0.2 * np.cos(az)
    return np.cos(th) * att * back, np.sin(th) * att * back


def place_spatial(buf, x, t0, src, ref=4.0):
    gl, gr = spatial_gains(src, t0, len(x), ref)
    i0 = int(round(t0 * SR))
    m = min(len(x), N - i0)
    buf[0, i0:i0 + m] += x[:m] * gl[:m]
    buf[1, i0:i0 + m] += x[:m] * gr[:m]


# ------------------------------------------------------------------ 音の部品
def wind_bed():
    out = np.zeros((2, N))
    on_wall = np.clip((t_all - T.J_T1) / 1.5, 0, 1)
    for c in range(2):
        base = fft_filter(pink(N), lambda f: lowpass(500, 2)(f) * highpass(40, 1)(f))
        hiss = fft_filter(noise(N), lambda f: band(2200, 1500)(f))
        slow = 0.6 + 0.4 * np.sin(2 * np.pi * (0.07 + 0.02 * c) * t_all + c) * np.sin(2 * np.pi * 0.19 * t_all + 1.3)
        gust = np.clip(np.sin(2 * np.pi * 0.045 * t_all - 0.6 + c * 0.3), 0, 1) ** 3
        out[c] = norm(base) * db(-31) * (slow + 0.6 * gust) * (1 + 0.6 * on_wall)
        out[c] += norm(hiss) * db(-50) * (0.3 + gust) * (1 + 1.5 * on_wall)
    return out


def traffic_bed():
    out = np.zeros((2, N))
    for c in range(2):
        r = fft_filter(brown(N), lambda f: lowpass(220, 2)(f) * highpass(30, 2)(f))
        out[c] = norm(r) * db(-36)
    # 遠くの大通りを車が 1 台通る（ゆっくりふくらんで消える）
    pas = fft_filter(noise(N), lambda f: band(420, 260)(f) + 0.4 * band(1200, 500)(f))
    e = np.exp(-0.5 * ((t_all - 14.5) / 2.2) ** 2)
    pan_t = np.clip((t_all - 14.5) / 4, -1, 1)
    out[0] += norm(pas) * db(-38) * e * np.cos((pan_t + 1) * math.pi / 4)
    out[1] += norm(pas) * db(-38) * e * np.sin((pan_t + 1) * math.pi / 4)
    return out


def insects():
    out = np.zeros((2, N))
    swell = 0.7 + 0.5 * np.clip(t_all / 30, 0, 1)
    voices = [(3.9, -0.6, -44), (4.25, 0.5, -46), (4.6, -0.2, -48), (3.7, 0.8, -50), (4.85, -0.9, -51), (4.1, 0.2, -49)]
    for k, (fk, pan, lv) in enumerate(voices):
        f0 = fk * 1000
        x = np.zeros(N)
        tt = rng.uniform(0, 1.5)
        while tt < DUR:
            # ころころ…と震える一節（16〜20 回/秒の短い音）
            n_p = int(rng.uniform(6, 14))
            rate = rng.uniform(15, 20)
            for j in range(n_p):
                ts = tt + j / rate
                L = int(0.022 * SR)
                i0 = int(ts * SR)
                if i0 + L >= N:
                    break
                w = np.hanning(L)
                ph = 2 * np.pi * (f0 * (1 + 0.004 * j)) * np.arange(L) / SR
                x[i0:i0 + L] += np.sin(ph) * w * (0.8 + 0.2 * rng.random())
            tt += n_p / rate + rng.uniform(0.9, 2.4)
        th = (pan + 1) * math.pi / 4
        x = x * db(lv + 6) * swell
        out[0] += x * math.cos(th)
        out[1] += x * math.sin(th)
    # 鈴を振るように鳴く 1 匹（リーン）
    x = np.zeros(N)
    tt = 0.8
    while tt < DUR:
        L = int(0.32 * SR)
        i0 = int(tt * SR)
        if i0 + L >= N:
            break
        s = np.arange(L) / SR
        x[i0:i0 + L] += np.sin(2 * np.pi * 4450 * s) * (0.5 + 0.5 * np.sin(2 * np.pi * 42 * s)) * np.hanning(L)
        tt += rng.uniform(1.2, 1.7)
    out[0] += x * db(-47) * swell * 0.8
    out[1] += x * db(-47) * swell * 1.0
    return out


def crow_caw(f_start=640, f_end=470, dur=0.32, rough=1.0):
    n = int(dur * SR)
    s = np.arange(n) / SR
    u = s / dur
    f0 = f_start + (f_end - f_start) * u ** 0.7 + 25 * np.sin(np.pi * u)
    f0 *= 1 + 0.025 * np.cumsum(rng.standard_normal(n)) / np.sqrt(n) * rough
    ph = 2 * np.pi * np.cumsum(f0) / SR
    x = np.zeros(n)
    for k in range(1, 16):
        x += np.sin(k * ph) / k ** 0.8 * (1.0 if k * 600 < 9000 else 0.0)
    x += 0.25 * noise(n)
    # 口の響き（フォルマント）
    x = fft_filter(x, lambda f: 0.25 * band(950, 280)(f) + 1.0 * band(1550, 380)(f) + 0.6 * band(2650, 500)(f) + 0.15)
    x = np.tanh(2.5 * norm(x))
    e = env_adsr(n, 0.02, 0.07, 1 - 0.3 * u)
    return norm(x * e)


def crows_layer(crow_pos):
    out = np.zeros((2, N))
    far_ir = reverb_ir(2.2, 0.55, 2500)
    for (tc, who, n) in T.CAW_TIMES:
        for j in range(n):
            ts = tc + j * 0.42
            c = crow_caw(rng.uniform(600, 680), rng.uniform(440, 500), rng.uniform(0.28, 0.36))
            if who < 0:
                # 遠くのカラス: こもらせて響かせる
                c = fft_filter(c, lowpass(2200, 2)) * db(-34)
                wet = np.stack([convolve(np.pad(c, (0, int(2.2 * SR))), far_ir[k]) for k in range(2)])
                pan = 0.6 if tc < 10 else -0.5
                th = (pan + 1) * math.pi / 4
                place_mono(out, np.pad(c, (0, int(2.2 * SR))) * 0.5, ts, math.cos(th), math.sin(th))
                place_mono(out, wet[0] * 0.5, ts, 1.0, 0.0)
                place_mono(out, wet[1] * 0.5, ts, 0.0, 1.0)
            else:
                place_spatial(out, c * db(-15), ts, crow_pos[who], ref=6.0)
    # 近くのカラスの声に町の響きを少し
    # 飛び立つ羽音
    tk = T.CROW_TAKEOFF
    flap = np.zeros(int(2.6 * SR))
    for j in range(int(2.4 * 4.3)):
        ts = j / 4.3
        L = int(0.09 * SR)
        i0 = int(ts * SR)
        b = fft_filter(noise(L), lambda f: lowpass(700, 2)(f) * highpass(90, 1)(f)) * np.hanning(L) * math.exp(-ts * 0.8)
        flap[i0:i0 + L] += b
    flap = norm(flap) * db(-22)
    place_spatial(out, flap, tk, crow_pos[1], ref=6.0)
    return out


def chime_layer():
    """夕方の町内チャイム（オリジナルの旋律）。遠くのスピーカーから響いてくる。"""
    t0 = 23.4
    # 五音音階のオリジナルの旋律（拍の長さ）
    A4 = 440.0
    notes = [(9, 1), (7, 1), (4, 1), (7, 1), (9, 2), (12, 1), (9, 1), (7, 2), (4, 1), (2, 1), (4, 3)]
    beat = 0.52
    dry = np.zeros(int((DUR - t0 + 1) * SR))
    pos = 0.0
    for semi, beats in notes:
        f = A4 * 2 ** ((semi - 9 + 3) / 12) * 1.0  # C5 付近
        L = int(min(beats * beat + 1.6, 3.5) * SR)
        s = np.arange(L) / SR
        x = np.zeros(L)
        for k, (ratio, amp, dec) in enumerate([(1.0, 1.0, 1.4), (2.0, 0.45, 0.8), (3.0, 0.22, 0.5), (4.2, 0.12, 0.35), (5.4, 0.06, 0.25)]):
            x += amp * np.sin(2 * np.pi * f * ratio * s * (1 + 0.0007 * k)) * np.exp(-s / dec)
        x *= np.minimum(1, s / 0.008)
        i0 = int(pos * SR)
        m = min(L, len(dry) - i0)
        if m > 0:
            dry[i0:i0 + m] += x[:m]
        pos += beats * beat
    # 拡声器の帯域とわずかなひずみ
    dry = fft_filter(dry, lambda f: highpass(320, 2)(f) * lowpass(3800, 2)(f))
    dry = np.tanh(1.6 * norm(dry))
    out = np.zeros((2, N))
    taps = [(0.0, 1.0, 0.1, 0.0), (0.38, 0.5, -0.5, 2600), (0.85, 0.32, 0.5, 1800), (1.45, 0.2, -0.2, 1200)]
    for (dl, g, pan, lp) in taps:
        y = dry if lp == 0 else fft_filter(dry, lowpass(lp, 2))
        th = (pan * 0.6 + 1) * math.pi / 4
        place_mono(out, y * g * db(-28), t0 + dl, math.cos(th), math.sin(th))
    ir = reverb_ir(3.0, 0.9, 2200)
    mono = out.sum(axis=0) * 0.5
    for c in range(2):
        out[c] += convolve(mono, ir[c]) * 0.35
    # 始まりは少しずつ聞こえてくる
    fade = np.clip((t_all - t0) / 0.4, 0, 1)
    return out * fade


def cat_layer():
    out = np.zeros((2, N))
    # 足音（肉球なのでとても静か）
    for (ts, k, amp, on_wall) in T.footfalls():
        L = int(0.05 * SR)
        thump = fft_filter(noise(L), lambda f: band(180, 120)(f)) * np.exp(-np.arange(L) / SR / 0.012)
        grit = fft_filter(noise(L), lambda f: highpass(1800, 1)(f) * lowpass(5000, 2)(f)) * np.exp(-np.arange(L) / SR / 0.004)
        x = norm(thump) * 0.8 + norm(grit) * (0.18 if not on_wall else 0.26)
        x *= db(-34) * (0.6 + 0.4 * amp) * rng.uniform(0.7, 1.0)
        pan = -0.25 if k in (0, 1) else 0.25
        th = (pan + 1) * math.pi / 4
        place_mono(out, x, ts, math.cos(th), math.sin(th))
    # 匂いをかぐ（鉢植えの前で）
    for ts in (1.05, 1.22, 1.55):
        L = int(0.07 * SR)
        x = fft_filter(noise(L), lambda f: band(3500, 1500)(f)) * np.hanning(L)
        place_mono(out, norm(x) * db(-36), ts, 0.75, 0.65)
    # 跳ぶ: 蹴る音、体が風を切る音、着地
    L = int(0.08 * SR)
    kick = fft_filter(noise(L), lambda f: band(900, 600)(f)) * np.exp(-np.arange(L) / SR / 0.02)
    place_mono(out, norm(kick) * db(-30), T.J_T0 - 0.02, 0.7, 0.7)
    L = int((T.J_T1 - T.J_T0) * SR)
    sw = fft_filter(noise(L), lambda f: band(700, 500)(f)) * np.sin(np.linspace(0, np.pi, L)) ** 2
    place_mono(out, norm(sw) * db(-38), T.J_T0, 0.7, 0.7)
    L = int(0.15 * SR)
    land = fft_filter(noise(L), lambda f: band(120, 70)(f) + 0.2 * band(2500, 1500)(f)) * np.exp(-np.arange(L) / SR / 0.03)
    place_mono(out, norm(land) * db(-24), T.J_T1, 0.72, 0.72)
    # のどを鳴らす（座ってから）
    t0 = T.SIT_T1 - 0.2
    L = N - int(t0 * SR)
    s = np.arange(L) / SR
    cyc = 2.3
    ph = (s % cyc) / cyc
    exhale = ph < 0.56
    rate = np.where(exhale, 25.5, 23.0)
    phase = np.cumsum(rate) / SR
    pulses = (np.sin(2 * np.pi * phase) > 0.6).astype(float)
    body = fft_filter(noise(L) * pulses, lambda f: band(140, 90)(f) + 0.4 * band(420, 200)(f) + 0.08 * band(1200, 500)(f))
    breath_env = np.where(exhale, 1.0, 0.6) * (0.5 - 0.5 * np.cos(2 * np.pi * np.where(exhale, ph / 0.56, (ph - 0.56) / 0.44)))
    breath_env = 0.35 + 0.65 * breath_env
    fade_in = np.clip(s / 1.2, 0, 1)
    purr = norm(body) * breath_env * fade_in * db(-27)
    place_mono(out, purr, t0, 0.72, 0.72)
    return out


def vending_layer():
    s = t_all
    x = 0.6 * np.sin(2 * np.pi * 100 * s) + 0.3 * np.sin(2 * np.pi * 150 * s) + 0.2 * np.sin(2 * np.pi * 50 * s)
    x += 0.5 * fft_filter(noise(N), band(260, 120))
    x *= 0.85 + 0.15 * np.sin(2 * np.pi * 0.3 * s)
    out = np.zeros((2, N))
    place_spatial(out, norm(x) * db(-40), 0.0, (2.78, 5.3, 1.0), ref=3.0)
    return out


def spectrogram_png(x, path, w=1200, h=300):
    """確かめ用のスペクトログラム（PNG を zlib で書く）。"""
    hop = len(x) // w
    win = 2048
    img = np.zeros((h, w))
    for i in range(w):
        seg = x[i * hop: i * hop + win]
        if len(seg) < win:
            seg = np.pad(seg, (0, win - len(seg)))
        sp = np.abs(np.fft.rfft(seg * np.hanning(win)))
        f = np.fft.rfftfreq(win, 1 / SR)
        # 対数の周波数軸（40 Hz〜16 kHz）
        fl = np.geomspace(40, 16000, h)
        img[:, i] = np.interp(fl, f, 20 * np.log10(sp + 1e-9))[::-1]
    img = np.clip((img - img.max() + 90) / 90, 0, 1)
    rgb = np.stack([img ** 0.7, img ** 1.5, (1 - img) * img * 2], axis=-1)
    data = (rgb * 255).astype(np.uint8)
    raw = b"".join(b"\x00" + data[r].tobytes() for r in range(h))

    def chunk(tag, d):
        c = struct.pack(">I", len(d)) + tag + d
        return c + struct.pack(">I", zlib.crc32(tag + d) & 0xFFFFFFFF)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def crow_positions():
    """カラスのいる所（build_scene.py と同じ置き方を簡単に計算）。"""
    pole_x = 2.15
    wires = {5: (-0.28, 8.0, 0.45), 6: (0.28, 6.4, 0.5), 0: (-0.75, 10.42, 0.35), 1: (0.0, 10.42, 0.35)}
    poles = list(range(-196, 100, 30))
    pos = []
    for spot, y, yaw in T.CROW_SPOTS:
        if spot == "pole":
            pos.append((pole_x, y, 11.1))
        else:
            dx, z0, sag = wires[int(spot[4:])]
            a = max(p for p in poles if p <= y)
            u = (y - a) / 30.0
            pos.append((pole_x + dx, y, z0 - sag * 4 * u * (1 - u) + 0.1))
    return pos


def main():
    import time
    t0 = time.time()
    cp = crow_positions()
    layers = {
        "wind": wind_bed(),
        "traffic": traffic_bed(),
        "insects": insects(),
        "crows": crows_layer(cp),
        "chime": chime_layer(),
        "cat": cat_layer(),
        "vending": vending_layer(),
    }
    mix = sum(layers.values())
    # 終わりの 0.6 秒で静かに消す
    mix *= np.clip((DUR - t_all) / 0.6, 0, 1)
    peak = np.max(np.abs(mix))
    mix *= db(-1.0) / peak
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, "audio.wav")
    pcm = (np.clip(mix.T, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    # 数値で確かめる
    lines = [f"peak_dbfs={20 * np.log10(np.max(np.abs(mix))):.2f} rms_dbfs={20 * np.log10(np.sqrt(np.mean(mix ** 2))):.2f} gain_applied_db={20 * np.log10(db(-1.0) / peak):.2f}"]
    for name, L in layers.items():
        L = L * (db(-1.0) / peak)
        lines.append(f"layer {name:8s} rms_dbfs={20 * np.log10(np.sqrt(np.mean(L ** 2)) + 1e-12):7.2f} peak_dbfs={20 * np.log10(np.max(np.abs(L)) + 1e-12):7.2f}")
    lines.append("sec  rms_L  rms_R  (dBFS)")
    for sec in range(30):
        a = mix[:, sec * SR:(sec + 1) * SR]
        r = 20 * np.log10(np.sqrt(np.mean(a ** 2, axis=1)) + 1e-12)
        lines.append(f"{sec:3d} {r[0]:6.1f} {r[1]:6.1f}")
    with open(os.path.join(LOGS, "audio_stats.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    spectrogram_png(mix.mean(axis=0), os.path.join(LOGS, "audio_spectrogram.png"))
    log("audio", "ok", f"file=out/audio.wav sr={SR} sec={time.time() - t0:.1f} {lines[0]}")


if __name__ == "__main__":
    main()
