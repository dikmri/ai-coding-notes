"""曲「わたあめサテライト」の楽譜（2 版）。区間・和音・メロディ・ドラムの型を、音の出来事の並びにする。

1 版を聞いた作者の感想「リズムが一定」「ありがち」を受けて、次のように作り直した。
  ・フック（3+3+2 の食い気味のリズム）を先に決め、和音・チョップ・ベースを同じ型で鳴らす
  ・和音の長さを 1〜4 拍で変え、ベースは半音ずつ動く。区間ごとに別の進行にする
  ・メロディに休みを入れ、drop の 8 小節目で全体を止める。ドラムは 6 種類の型、強弱と少しの跳ね
  ・サイドチェインは毎拍ではなく、実際のキックに合わせる

出来事 1 つ = dict(inst=楽器, stem=まとめる段, t=秒, dur=秒, midi=音の高さ, vel=強さ, ほか楽器ごとの値)
"""
import numpy as np

from dsp import nm

TITLE = 'わたあめサテライト'
TITLE_EN = 'Wataame Satellite'
BPM = 160
BEAT = 60 / BPM
BAR = 4 * BEAT
STEP = BEAT / 4
KEY = 'D major'
SWING = 0.1  # 裏の 16 分を 16 分の 10% 遅らせる（ハイハットなど）


def T(bar, step=0.0):
    return bar * BAR + step * STEP


# 区間: (id, 表示名, 始まりの小節, 小節の数)
SECTIONS = [
    ('intro', 'Intro', 0, 8),
    ('verse', 'Verse', 8, 8),
    ('build1', 'Build', 16, 8),
    ('drop1', 'Drop', 24, 16),
    ('break', 'Break', 40, 8),
    ('build2', 'Build', 48, 8),
    ('drop2', 'Drop', 56, 16),
    ('outro', 'Outro', 72, 8),
]
TOTAL_BARS = 80
TAIL = 3.0
DURATION = TOTAL_BARS * BAR + TAIL

# ------------------------------------------------------------------ 和音
# 名前: (度数, ベースの音, 上に重ねる音)
CHORDS = {
    'Dmaj9': ('Imaj9', 'D2', ['C#4', 'E4', 'F#4', 'A4']),
    'Dmaj9/A': ('Imaj9/5', 'A1', ['D4', 'E4', 'F#4', 'A4', 'C#5']),
    'Dmaj9/F#': ('Imaj9/3', 'F#1', ['A3', 'C#4', 'E4', 'A4']),
    'Gmaj7/D': ('IVmaj7/1', 'D2', ['B3', 'D4', 'F#4', 'G4']),
    'Em9/D': ('iim9/1', 'D2', ['B3', 'E4', 'F#4', 'G4']),
    'Gm6/D': ('ivm6/1', 'D2', ['A#3', 'D4', 'E4', 'G4']),
    'Gmaj9': ('IVmaj9', 'G1', ['B3', 'D4', 'F#4', 'A4']),
    'G#m7b5': ('#ivø7', 'G#1', ['B3', 'D4', 'F#4', 'G#4']),
    'A#dim7': ('#vdim7', 'A#1', ['C#4', 'E4', 'G4', 'A#4']),
    'Bm9': ('vim9', 'B1', ['D4', 'F#4', 'A4', 'C#5']),
    'Bm9/A': ('vim9/7', 'A1', ['D4', 'F#4', 'A4', 'C#5']),
    'E9/G#': ('II9/3', 'G#1', ['D4', 'F#4', 'G#4', 'B4']),
    'Gm6': ('ivm6', 'G1', ['D4', 'E4', 'G4', 'A#4']),
    'F#m7': ('iiim7', 'F#1', ['C#4', 'E4', 'F#4', 'A4']),
    'B7b9': ('VI7(b9)', 'B1', ['C4', 'D#4', 'F#4', 'A4']),
    'B7': ('VI7', 'B1', ['A3', 'D#4', 'F#4', 'B4']),
    'Em9': ('iim9', 'E1', ['D4', 'F#4', 'G4', 'B4']),
    'Bbmaj7': ('bVImaj7', 'A#1', ['D4', 'F4', 'A4', 'D5']),
    'C6/9': ('bVII6/9', 'C2', ['D4', 'E4', 'G4', 'A4']),
    'A7sus4': ('V7sus4', 'A1', ['D4', 'E4', 'G4', 'A4']),
    'A7': ('V7', 'A1', ['C#4', 'E4', 'G4', 'A4']),
    'A/G': ('V/IV', 'G1', ['A3', 'C#4', 'E4', 'A4']),
}

# 進行: [(和音, 拍の数), ...]
INTRO = [('Dmaj9', 4), ('Gmaj7/D', 4), ('Em9/D', 4), ('Gm6/D', 4),
         ('Dmaj9', 4), ('Gmaj7/D', 4), ('Em9/D', 4), ('Gm6/D', 2), ('A7sus4', 2)]
VERSE = [('Dmaj9', 4), ('F#m7', 2), ('B7', 2), ('Em9', 4), ('A7sus4', 2), ('A7', 2),
         ('Bm9', 4), ('G#m7b5', 2), ('Gm6', 2), ('F#m7', 4), ('Em9', 2), ('A7', 2)]
BUILD = [('Bm9', 4), ('Bm9/A', 4), ('Gmaj9', 4), ('G#m7b5', 4),
         ('Dmaj9/A', 2), ('A#dim7', 2), ('Bm9', 2), ('E9/G#', 2),
         ('Gmaj9', 1), ('G#m7b5', 1), ('Dmaj9/A', 1), ('A#dim7', 1), ('A7sus4', 4)]
PHRASE_A = [('Gmaj9', 2), ('G#m7b5', 2), ('Dmaj9/A', 2), ('A#dim7', 2), ('Bm9', 2), ('Bm9/A', 2), ('E9/G#', 2), ('Gm6', 2)]
PHRASE_B = [('F#m7', 2), ('B7b9', 2), ('Em9', 4), ('Bbmaj7', 2), ('C6/9', 2), ('A7sus4', 2), ('A7', 2)]
PHRASE_B_END = PHRASE_B[:-2] + [('Dmaj9', 4)]
DROP = PHRASE_A + PHRASE_B + PHRASE_A + PHRASE_B_END
BREAK = [('Gmaj9', 4), ('F#m7', 4), ('Em9', 4), ('Dmaj9/F#', 4), ('Gmaj9', 4), ('A/G', 4),
         ('F#m7', 2), ('B7', 2), ('Em9', 2), ('A7sus4', 2)]
OUTRO = [('Dmaj9', 4), ('Gmaj7/D', 4), ('Em9/D', 4), ('Gm6/D', 4), ('Dmaj9', 4), ('Gmaj7/D', 4), ('Gm6/D', 4), ('Dmaj9', 4)]
PLAN = [(0, INTRO), (8, VERSE), (16, BUILD), (24, DROP), (40, BREAK), (48, BUILD), (56, DROP), (72, OUTRO)]


def progression():
    """曲全体の和音の並び [(開始の秒, 終わりの秒, 名前)]。"""
    out = []
    for bar, prog in PLAN:
        t = T(bar)
        for name, beats in prog:
            out.append((t, t + beats * BEAT, name))
            t += beats * BEAT
    return out


# ------------------------------------------------------------------ メロディ（drop の主題）
# 1 小節 = 16 分 16 個。(始まり, 長さ, 音)。R1 = 3+3+2 の食い気味の型
HOOK = [
    # 1: Gmaj9 | G#ø
    [(0, 2, 'F#5'), (3, 2, 'A5'), (6, 2, 'D6'), (10, 1, 'B5'), (11, 1, 'G#5'), (13, 2, 'F#5')],
    # 2: D/A | A#dim7（減七の和音を下りる）
    [(0, 2, 'F#5'), (3, 2, 'A5'), (6, 2, 'E6'), (10, 1, 'C#6'), (11, 1, 'A#5'), (13, 2, 'G5')],
    # 3: Bm9 | Bm9/A（1 小節目と同じ形）
    [(0, 2, 'F#5'), (3, 2, 'B5'), (6, 2, 'D6'), (10, 1, 'C#6'), (11, 1, 'B5'), (13, 2, 'A5')],
    # 4: E9/G# | Gm6（伸ばす音で答える）
    [(0, 2, 'G#5'), (2, 2, 'B5'), (4, 4, 'E6'), (8, 2, 'D6'), (10, 4, 'A#5'), (14, 2, 'A5')],
    # 5: F#m7 | B7(b9)（同じ音を刻む）
    [(0, 1, 'C#6'), (1, 1, 'C#6'), (3, 2, 'A5'), (6, 2, 'E5'), (8, 1, 'D#6'), (9, 1, 'D#6'), (11, 2, 'C6'), (14, 2, 'A5')],
    # 6: Em9（いちばん高い所へ）
    [(0, 2, 'G5'), (3, 2, 'B5'), (6, 2, 'D6'), (8, 4, 'F#6'), (13, 1, 'E6'), (14, 2, 'D6')],
    # 7: Bbmaj7 | C6/9（借りてきた和音を上り下り）
    [(0, 2, 'D6'), (3, 2, 'A5'), (6, 2, 'F5'), (8, 1, 'E5'), (10, 1, 'G5'), (11, 1, 'A5'), (13, 1, 'C6'), (14, 2, 'D6')],
    # 8: A7sus4 → 止め → 拾い上げ
    [(0, 4, 'E6'), (12, 1, 'E5'), (13, 1, 'F#5'), (14, 1, 'G5'), (15, 1, 'A5')],
]
HOOK_SYL = [
    ['ya', 'ri', 'ra', 'pa', 'pi', 'ra'],
    ['ra', 'ri', 'ya', 'ni', 'na', 'ru'],
    ['ya', 'ri', 'ra', 'pa', 'pi', 'ra'],
    ['wa', 'ri', 'a', 're', 'na', 'ru'],
    ['ra', 'ra', 'ri', 'ya', 'ra', 'ra', 'ri', 'yo'],
    ['ya', 'ri', 'ra', 'a', 're', 'ri'],
    ['na', 'ri', 'ra', 'pi', 'pa', 'pi', 'pu', 'ya'],
    ['a', 'ra', 'ri', 'ru', 're'],
]
# 後半の差し替え（10 小節目は刻み、16 小節目は終わり）
HOOK_10 = [(0, 2, 'F#5'), (3, 2, 'A5'), (6, 2, 'E6'), (10, 1, 'C#6'), (11, 1, 'C#6'), (12, 1, 'C#6'), (13, 2, 'A#5')]
HOOK_10_SYL = ['ra', 'ri', 'ya', 'ni', 'ni', 'ni', 'ru']
HOOK_END = [(0, 2, 'F#5'), (2, 2, 'A5'), (4, 4, 'D6')]
HOOK_END_SYL = ['ya', 'ri', 'a']
FINAL_END = [(0, 2, 'A5'), (2, 2, 'C#6'), (4, 12, 'D6')]
FINAL_SYL = ['ra', 'ri', 'a']

# 和音を刻む型（始まり, 長さ）。フックと同じ所で鳴らす
STAB_R1 = [(0, 3), (3, 3), (6, 2), (8, 2), (10, 1), (11, 2), (13, 3)]
STAB_R2 = [(0, 1), (1, 2), (3, 3), (6, 2), (8, 1), (9, 2), (11, 3), (14, 2)]
STAB_BAR = {1: STAB_R1, 2: STAB_R1, 3: STAB_R1, 4: [(0, 2), (2, 2), (4, 4), (8, 2), (10, 6)],
            5: STAB_R2, 6: 'wobble', 7: STAB_R1, 8: [(0, 4)]}

VERSE_MEL = [
    [(0, 3, 'F#5'), (3, 3, 'E5'), (6, 2, 'A5'), (10, 2, 'F#5'), (12, 4, 'E5')],
    [(2, 2, 'C#5'), (4, 2, 'E5'), (6, 2, 'A5'), (8, 3, 'D#5'), (11, 1, 'F#5'), (12, 4, 'A5')],
    [(0, 3, 'G5'), (3, 3, 'F#5'), (6, 2, 'D5'), (10, 2, 'B4'), (12, 2, 'D5'), (14, 2, 'E5')],
    [(0, 6, 'E5'), (8, 2, 'C#5'), (10, 2, 'E5'), (12, 4, 'G5')],
    [(0, 3, 'F#5'), (3, 3, 'D5'), (6, 2, 'B4'), (10, 2, 'C#5'), (12, 4, 'D5')],
    [(0, 2, 'B4'), (2, 2, 'D5'), (4, 4, 'F#5'), (8, 2, 'A#4'), (10, 2, 'D5'), (12, 4, 'E5')],
    [(0, 3, 'C#5'), (3, 3, 'E5'), (6, 2, 'A5'), (10, 2, 'G#5'), (12, 4, 'A5')],
    [(0, 3, 'B5'), (3, 3, 'G5'), (6, 2, 'F#5'), (8, 4, 'E5'), (14, 2, 'A4')],
]
VERSE_ANSWER = {3: [(13, 1, 'A5', 'ra'), (14, 2, 'B5', 'ri')], 7: [(13, 1, 'E6', 'ya'), (14, 1, 'D6', 'ri'), (15, 1, 'C#6', 'ra')]}

# break: 3 連符（1 小節 = 8 分の 3 連符 12 個）
BREAK_MEL = [
    [(0, 3, 'F#5'), (3, 3, 'A5'), (6, 6, 'D6')],
    [(0, 3, 'C#6'), (3, 3, 'A5'), (6, 6, 'E5')],
    [(0, 3, 'G5'), (3, 3, 'B5'), (6, 3, 'D6'), (9, 3, 'F#6')],
    [(0, 12, 'E6')],
    [(0, 3, 'D6'), (3, 3, 'B5'), (6, 6, 'A5')],
    [(0, 2, 'C#6'), (2, 2, 'E6'), (4, 2, 'C#6'), (6, 6, 'A5')],
    [(0, 3, 'A5'), (3, 3, 'C#6'), (6, 3, 'D#6'), (9, 3, 'F#6')],
    [(0, 6, 'G6'), (6, 6, 'E6')],
]
BREAK_SYL = ['u', 'a', 'o', 'a', 'u', 'o', 'a', 'u', 'a', 'o', 'u', 'a']

# ------------------------------------------------------------------ ドラムの型（16 分の位置: 強さ）
GROOVES = {
    'A': dict(kick={0: 1.0, 10: 0.9}, snare={8: 1.0}, ghost={14: 0.2},
              hat={0: 0.22, 2: 0.5, 4: 0.25, 6: 0.55, 8: 0.2, 10: 0.5, 12: 0.25, 14: 0.45, 15: 0.15}, open={6}),
    'B': dict(kick={0: 1.0, 6: 0.75, 10: 0.9}, snare={8: 1.0}, ghost={13: 0.2, 15: 0.25},
              hat={0: 0.22, 2: 0.5, 4: 0.25, 6: 0.5, 8: 0.2, 10: 0.5}, roll=(12, 16, 6), open=set()),
    'FILL': dict(kick={0: 1.0, 3: 0.8, 10: 0.9, 11: 0.7}, snare={8: 1.0, 12: 0.35, 14: 0.5, 15: 0.7}, ghost={},
                 hat={0: 0.25, 2: 0.45, 4: 0.3, 5: 0.2, 6: 0.45, 7: 0.25, 8: 0.2, 10: 0.4}, open=set()),
    'STOP': dict(kick={0: 1.0}, snare={}, ghost={}, hat={0: 0.3}, open=set(), revsnare=True),
    'DT': dict(kick={0: 1.0, 6: 0.8, 10: 0.9}, snare={4: 1.0, 12: 1.0}, ghost={7: 0.2, 15: 0.2},
               hat={2: 0.55, 6: 0.55, 10: 0.55, 14: 0.55, 0: 0.2, 4: 0.2, 8: 0.2, 12: 0.2}, open={2, 6, 10, 14}),
    'END': dict(kick={0: 1.0}, snare={0: 0.8}, ghost={}, hat={}, open=set()),
}
DROP_GROOVE = ['A', 'B', 'A', 'FILL', 'A', 'B', 'A', 'STOP', 'A', 'B', 'A', 'FILL', 'DT', 'DT', 'B', 'END']


# ------------------------------------------------------------------ 道具
_hum = np.random.default_rng(1128)


def hum(v, amount=0.07):
    """強さに少しのばらつき。"""
    return float(np.clip(v * (1 + (_hum.random() * 2 - 1) * amount), 0.05, 1.2))


def jitter(ms=3.0):
    return (_hum.random() * 2 - 1) * ms / 1000


def swing_t(bar, step):
    s = step + (SWING if int(step) % 2 == 1 and abs(step - int(step)) < 1e-6 else 0.0)
    return T(bar, s)


def _notes(bar, cells, syl=None, grid=16):
    """grid=16 は 16 分、12 は 8 分の 3 連符。"""
    unit = BAR / grid
    out = []
    for i, (s, ln, name) in enumerate(cells):
        out.append(dict(t=T(bar) + s * unit, dur=ln * unit, midi=nm(name), step=s, len=ln,
                        syl=(syl[i % len(syl)] if syl else None)))
    return out


def drop_hook(bar0, final=False):
    out = []
    for k in range(16):
        i = k % 8
        bar = bar0 + k
        if k == 9:
            out += _notes(bar, HOOK_10, HOOK_10_SYL)
        elif k == 15:
            out += _notes(bar, FINAL_END if final else HOOK_END, FINAL_SYL if final else HOOK_END_SYL)
        else:
            out += _notes(bar, HOOK[i], HOOK_SYL[i])
    return out


def chord_at(t, prog):
    for a, b, name in prog:
        if a <= t + 1e-6 < b:
            return name
    return prog[-1][2]


def section_of(bar):
    for sid, _, b0, nb in SECTIONS:
        if b0 <= bar < b0 + nb:
            return sid
    return SECTIONS[-1][0]


def third_below(m):
    """D メジャーの音階で 3 度下の音（音階の外は長 3 度下）。"""
    scale = [2, 4, 6, 7, 9, 11, 1]
    pc = m % 12
    if pc not in scale:
        return m - 4
    i = scale.index(pc)
    return m - (pc - scale[(i - 2) % 7]) % 12


def voicing(name, up=0):
    return [nm(x) + up for x in CHORDS[name][2]]


# ------------------------------------------------------------------ 出来事を作る
def build_events():
    ev = []
    prog = progression()
    sec = {s[0]: (s[2], s[3]) for s in SECTIONS}

    def E(inst, stem, t, **kw):
        d = dict(inst=inst, stem=stem, t=t)
        d.update(kw)
        ev.append(d)

    # ================= 和音
    for a, b, name in prog:
        bar_f = a / BAR
        sid = section_of(int(bar_f + 1e-6))
        notes = voicing(name)
        if sid in ('intro', 'outro'):
            fade = 1.0 if sid == 'intro' else max(0.25, 1 - (bar_f - 72) / 9)
            E('pad', 'chords', a, dur=b - a, notes=notes, vel=0.45 * fade, cutoff=('const', 1300), sec=sid)
        elif sid == 'verse':
            E('pad', 'chords', a, dur=b - a, notes=notes, vel=0.42, cutoff=('const', 2000), sec=sid)
            # 2 拍目の裏と 4 拍目に軽い刻み（和音が動いて聞こえるように）
            for s in (6, 14):
                ts = T(int(bar_f + 1e-6), s)
                if a - 1e-6 <= ts < b - 1e-6:
                    E('stab', 'chords', ts, dur=STEP * 1.5, notes=voicing(chord_at(ts, prog)), vel=0.35,
                      cutoff=('const', 3500), sec=sid)
        elif sid in ('build1', 'build2'):
            b0 = sec[sid][0]
            k = int(bar_f + 1e-6) - b0
            if name == 'A7sus4' and k == 7:
                E('saw', 'chords', a, dur=3 * BEAT - 0.02, notes=notes, vel=0.9, cutoff=('build', b0), bend=(0, 5), sec=sid)
            elif k >= 4:
                # 8 分で刻み、だんだん明るく
                n8 = int(round((b - a) / (2 * STEP)))
                for j in range(n8):
                    E('stab', 'chords', a + j * 2 * STEP, dur=STEP * 1.6, notes=notes, vel=0.6 + 0.05 * k,
                      cutoff=('build', b0), sec=sid)
            else:
                E('saw', 'chords', a, dur=b - a, notes=notes, vel=0.7, cutoff=('build', b0), sec=sid)
        elif sid == 'break':
            for m in notes:
                E('ep', 'keys', a, dur=(b - a) * 0.97, midi=m, vel=hum(0.5))
            E('pad', 'chords', a, dur=b - a, notes=notes, vel=0.32, cutoff=('const', 1500), sec=sid)

    # drop: フックと同じ型で刻む
    for sid in ('drop1', 'drop2'):
        b0 = sec[sid][0]
        for k in range(16):
            bar = b0 + k
            kind = STAB_BAR[k % 8 + 1]
            if k == 15:
                kind = [(0, 8)]
            if kind == 'wobble':
                E('wob', 'chords', T(bar), dur=BAR - STEP * 0.5, notes=voicing(chord_at(T(bar), prog)), vel=1.0, sec=sid)
            else:
                for s, ln in kind:
                    ts = T(bar, s)
                    E('stab', 'chords', ts, dur=ln * STEP * 0.86, notes=voicing(chord_at(ts, prog)),
                      vel=hum(1.0 if s in (0, 8) else 0.9, 0.04), cutoff=('const', 8500), sec=sid)
            # 下に敷く薄いパッド（STOP の小節は 1 拍だけ）
            if k % 8 != 7:
                for a, b, name in prog:
                    if T(bar) - 1e-6 <= a < T(bar + 1) - 1e-6:
                        E('pad', 'chords', a, dur=b - a, notes=voicing(name, 12)[1:], vel=0.3, cutoff=('const', 6000), sec=sid)

    # ================= ベース
    prev_root = None
    for a, b, name in prog:
        bar_f = a / BAR
        bar = int(bar_f + 1e-6)
        sid = section_of(bar)
        root = nm(CHORDS[name][1])
        if sid == 'intro' and bar < 4:
            prev_root = None
            continue
        if sid in ('build1', 'build2') and bar - sec[sid][0] >= 7:
            prev_root = None
            continue
        if sid == 'outro' and bar >= 78:
            continue
        glide = prev_root if prev_root is not None and abs(prev_root - root) <= 2 else None
        if 'drop' in sid:
            k = bar - sec[sid][0]
            if k % 8 == 7 and k != 15 and a >= T(bar, 4) - 1e-6:
                prev_root = None
                continue  # 止める小節
            dur = (b - a) if (k % 8 != 7 or k == 15) else min(b - a, BEAT)
            E('sub', 'bass', a, dur=dur, midi=root, vel=1.0, glide_from=glide)
            if sid == 'drop2':
                for s, ln in STAB_R1:
                    ts = T(bar, s)
                    if a - 1e-6 <= ts < b - 1e-6 and k % 8 != 7:
                        E('growl', 'bass', ts, dur=ln * STEP * 0.7, midi=root + 12, vel=hum(0.55))
        else:
            vel = {'intro': 0.6, 'verse': 0.85, 'break': 0.55, 'outro': 0.7}.get(sid, 0.8)
            E('sub', 'bass', a, dur=b - a, midi=root, vel=vel, glide_from=glide)
        prev_root = root

    # ================= ドラム
    def groove(bar, g, scale=1.0, snare_scale=1.0):
        G = GROOVES[g]
        for s, v in G['kick'].items():
            E('kick', 'kick', T(bar, s), vel=hum(v * scale, 0.04))
        for s, v in G['snare'].items():
            E('snare', 'snare', T(bar, s), vel=hum(v * scale * snare_scale, 0.04))
        for s, v in G['ghost'].items():
            E('snare', 'snare', swing_t(bar, s) + jitter(4), vel=hum(v * scale), short=True, tone=1.08)
        for s, v in G['hat'].items():
            E('hat', 'hats', swing_t(bar, s), vel=hum(v * scale, 0.12), open_=(s in G['open']))
        if 'roll' in G:
            a_, b_, n_ = G['roll']
            for j in range(n_):
                E('hat', 'hats', T(bar, a_ + (b_ - a_) * j / n_), vel=hum((0.18 + 0.05 * j) * scale))
        if G.get('revsnare'):
            E('revsnare', 'snare', T(bar, 10), dur=6 * STEP, vel=0.7 * scale)

    for sid, name, b0, nb in SECTIONS:
        for k in range(nb):
            bar = b0 + k
            if sid in ('drop1', 'drop2'):
                g = DROP_GROOVE[k]
                groove(bar, g)
                if g not in ('STOP', 'END'):
                    for s in range(1, 16, 2):
                        E('shaker', 'perc', swing_t(bar, s), vel=hum(0.3, 0.15))
                if g == 'B':
                    E('rim', 'perc', T(bar, 13), vel=hum(0.4))
            elif sid == 'verse':
                g = 'A' if k % 2 == 0 else 'B'
                groove(bar, g, scale=0.7, snare_scale=0.85)
                for s in range(1, 16, 2):
                    E('shaker', 'perc', swing_t(bar, s), vel=hum(0.2, 0.15))
            elif sid in ('build1', 'build2'):
                last = (k == nb - 1)
                if k < 2:
                    groove(bar, 'A', scale=0.75)
                elif k < 6:
                    for s in (0, 4, 8, 12):
                        E('kick', 'kick', T(bar, s), vel=hum(0.82, 0.03))
                    for s in ((4, 12) if k < 4 else range(0, 16, 2)):
                        E('snare', 'snare', T(bar, s), vel=0.35 + 0.08 * k, short=True, tone=1.0 + 0.04 * k)
                    for s in range(0, 16, 2):
                        E('hat', 'hats', swing_t(bar, s + 1), vel=hum(0.3))
                elif k == 6:
                    for s in range(0, 16, 2):
                        E('kick', 'kick', T(bar, s), vel=0.72)
                    for s in range(16):
                        E('snare', 'snare', T(bar, s), vel=0.45 + 0.025 * s, short=True, tone=1.25 + 0.01 * s)
                else:
                    # 2 拍は 32 分、3 拍目は 3 連符、4 拍目は止める
                    for j in range(16):
                        E('snare', 'snare', T(bar, j * 0.5), vel=0.6 + 0.02 * j, short=True, tone=1.4 + 0.012 * j)
                    for j in range(6):
                        E('snare', 'snare', T(bar, 8 + j * 4 / 6), vel=0.9, short=True, tone=1.62 + 0.03 * j)
            elif sid == 'break':
                # 3 連符のノリ（8 分の 3 連符でハイハット、後半だけ心臓の音のようなキック）
                if k >= 4:
                    for j in range(12):
                        E('hat', 'hats', T(bar) + j * BAR / 12, vel=hum(0.16 + (0.1 if j % 3 == 0 else 0) + 0.02 * (k - 4)))
                    E('kick', 'kick', T(bar), vel=0.55)
                    E('kick', 'kick', T(bar) + 5 * BAR / 12, vel=0.4)
                if k == nb - 1:
                    for j in range(6):
                        E('snare', 'snare', T(bar) + (6 + j) * BAR / 12, vel=0.3 + 0.08 * j, short=True)

    # ================= メロディ（チョップ＋鈴）
    def accent(n):
        on_beat = n['step'] % 4 == 0
        v = 0.97 if on_beat else 0.86
        if n['len'] >= 4:
            v = 1.0
        if n['len'] == 1 and not on_beat:
            v = 0.8
        return hum(v, 0.05)

    for sid, b0 in (('drop1', 24), ('drop2', 56)):
        notes = drop_hook(b0, final=(sid == 'drop2'))
        prev = None
        for n in notes:
            g = prev if (prev is not None and n['t'] - prev[0] < STEP * 1.2 and abs(prev[1] - n['midi']) <= 7) else None
            t = n['t'] + jitter(2)
            E('chop', 'chops', t, dur=n['dur'] * (0.92 if n['len'] >= 2 else 0.8), midi=n['midi'], syl=n['syl'],
              vel=accent(n), glide_from=(g[1] if g else None))
            E('bell', 'lead', t, dur=n['dur'], midi=n['midi'] + 12, vel=hum(0.35))
            if sid == 'drop2':
                E('chip', 'lead', n['t'] + 2 * STEP, dur=n['dur'] * 0.7, midi=n['midi'], vel=hum(0.22))
            prev = (n['t'], n['midi'])
        if sid == 'drop2':
            for n in notes:
                if T(b0 + 8) <= n['t'] < T(b0 + 15):
                    E('chop', 'chops', n['t'] + 0.004, dur=n['dur'] * 0.85, midi=third_below(n['midi']), syl=n['syl'],
                      vel=hum(0.42), pan=-0.4, harmony=True)
        # 止めの小節の効果音
        for k in (7,):
            E('squeak', 'fx', T(b0 + k, 6), vel=0.65, up=True)
            E('pop', 'fx', T(b0 + k, 9), vel=0.6, pitch=1.25)
    # verse: 鈴のメロディ（休みを入れる）とチョップの返事
    for i, cells in enumerate(VERSE_MEL):
        for n in _notes(8 + i, cells):
            E('bell', 'lead', n['t'] + jitter(3), dur=n['dur'], midi=n['midi'], vel=hum(0.6 if n['step'] % 4 == 0 else 0.5))
    for i, cells in VERSE_ANSWER.items():
        for s, ln, name, syl in cells:
            E('chop', 'chops', T(8 + i, s), dur=ln * STEP * 0.85, midi=nm(name), syl=syl, vel=hum(0.7))
    # intro: 遠くから届く信号のようなチョップ（主題の 1 小節目の型）
    for i in range(4):
        cells = HOOK[0] if i % 2 == 0 else HOOK[2]
        for n in _notes(4 + i, cells, HOOK_SYL[0]):
            E('chop', 'chops', n['t'], dur=n['dur'] * 0.8, midi=n['midi'] - (0 if i < 2 else 0), syl=n['syl'],
              vel=hum(0.45 + 0.1 * i), radio=True)
    # break: 3 連符のメロディ
    for i, cells in enumerate(BREAK_MEL):
        for j, n in enumerate(_notes(40 + i, cells, BREAK_SYL, grid=12)):
            E('chop', 'chops', n['t'] + jitter(4), dur=n['dur'] * 0.9, midi=n['midi'], syl=n['syl'], vel=hum(0.62), wet=True)
    # build: 主題の型をこもらせて予告 → 刻み → 拾い上げ
    for sid in ('build1', 'build2'):
        b0 = sec[sid][0]
        for k in (4, 5):
            for n in _notes(b0 + k, HOOK[0] if k == 4 else HOOK[2], HOOK_SYL[0]):
                E('chop', 'chops', n['t'], dur=n['dur'] * 0.8, midi=n['midi'], syl=n['syl'], vel=hum(0.5 + 0.1 * (k - 4)),
                  radio=(sid == 'build1'))
        for s in range(0, 16):
            name = chord_at(T(b0 + 6, s), prog)
            top = voicing(name)[-1] + 12
            E('chop', 'chops', T(b0 + 6, s), dur=STEP * 0.55, midi=top, syl=('ra', 'ri')[s % 2], vel=0.4 + 0.02 * s)
        for s, name, syl in ((12, 'E5', 'ra'), (13, 'F#5', 'ri'), (14, 'G5', 'ru'), (15, 'A5', 're')):
            E('chop', 'chops', T(b0 + 7, s), dur=STEP * 0.85, midi=nm(name), syl=syl, vel=0.85 + 0.03 * (s - 12))

    # ================= 鍵盤（オルゴール・カリンバ）
    arp = [0, 2, 1, 3, 2, 1]
    for a, b, name in prog:
        bar_f = a / BAR
        sid = section_of(int(bar_f + 1e-6))
        vo = voicing(name, 12)
        if sid in ('intro', 'outro'):
            nsteps = int(round((b - a) / STEP))
            fade = 1.0 if sid == 'intro' else max(0.25, 1 - (bar_f - 72) / 9)
            for j, s in enumerate(range(0, nsteps, 2)):
                m = vo[arp[j % 6] % len(vo)] + (12 if j % 6 == 3 else 0)
                E('musicbox', 'keys', a + s * STEP + jitter(3), midi=m, vel=hum(0.55 * fade * (1.0 if s % 4 == 0 else 0.72)))
        elif sid == 'break':
            # 3 連符のアルペジオ
            n3 = int(round((b - a) / (BAR / 12)))
            for j in range(n3):
                m = vo[[0, 1, 2, 3, 2, 1][j % 6] % len(vo)] + 12
                E('musicbox', 'keys', a + j * BAR / 12 + jitter(3), midi=m, vel=hum(0.42 if j % 3 else 0.55))
        elif sid == 'verse':
            nsteps = int(round((b - a) / STEP))
            for j, s in enumerate(range(0, nsteps, 2)):
                if (s // 2) % 4 == 3:
                    continue  # 4 つに 1 つ休む
                m = vo[arp[j % 6] % len(vo)] - 12
                E('pluck', 'keys', a + s * STEP + jitter(3), midi=m, vel=hum(0.62 if s % 4 == 0 else 0.45))
        elif sid == 'drop2':
            n32 = int(round((b - a) / (STEP / 2)))
            bar = int(bar_f + 1e-6)
            if (bar - 56) % 8 == 7:
                continue
            for j in range(n32):
                m = vo[[0, 1, 2, 3, 2, 1, 0, 1][j % 8] % len(vo)] + 12
                E('chip', 'keys', a + j * STEP / 2, dur=STEP / 2 * 0.7, midi=m, vel=hum(0.16 if j % 4 else 0.22), vib=False, width=0.125)

    # ================= 効果音
    E('sparkle', 'fx', T(0), vel=0.7, seed=3)
    E('riser', 'fx', T(6), dur=2 * BAR, vel=0.35)
    E('sparkle', 'fx', T(8), vel=0.6, seed=4)
    for sid in ('build1', 'build2'):
        b0 = sec[sid][0]
        E('riser', 'fx', T(b0), dur=8 * BAR - BEAT, vel=0.8)
        E('revcym', 'fx', T(b0 + 7, 8), dur=2 * BEAT, vel=0.9)
    for sid, b0 in (('drop1', 24), ('drop2', 56)):
        E('impact', 'fx', T(b0), vel=1.0)
        E('sparkle', 'fx', T(b0), vel=0.9, seed=b0)
        E('impact', 'fx', T(b0 + 8), vel=0.6)
        E('sparkle', 'fx', T(b0 + 8), vel=0.7, seed=b0 + 8, up=False)
        E('downlifter', 'fx', T(b0), dur=2 * BAR, vel=0.4)
        for k in (2, 10):
            E('squeak', 'fx', T(b0 + k, 15), vel=0.5, up=False)
        # 泡の「ぽん」はメロディの休みに置く
        for k in range(16):
            for s in ((8, 15) if k % 4 in (0, 2) else (12,)):
                if k % 8 != 7:
                    E('pop', 'fx', T(b0 + k, s), vel=hum(0.38), pitch=1.0 + 0.12 * ((k + s) % 4))
    E('downlifter', 'fx', T(40), dur=2 * BAR, vel=0.5)
    E('sparkle', 'fx', T(44), vel=0.5, seed=44)
    E('sparkle', 'fx', T(72), vel=0.7, seed=72, up=False)
    E('sparkle', 'fx', T(78), vel=0.8, seed=78)
    E('pop', 'fx', T(79, 8), vel=0.7, pitch=1.2)

    ev.sort(key=lambda e: e['t'])
    return ev


# サイドチェイン: 区間ごとの、キックに合わせた下げ方（深さ, 戻る時間の秒）
PUMP = {
    'intro': None,
    'verse': (0.35, 0.25),
    'build1': (0.5, 0.22),
    'drop1': (0.72, 0.3),
    'break': (0.2, 0.3),
    'build2': (0.5, 0.22),
    'drop2': (0.72, 0.3),
    'outro': None,
}
# テープを止める演出（drop1 の最後の 2 拍）
TAPE_STOP = (T(39, 8), T(40))
