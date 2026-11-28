"""曲「わたあめサテライト」の楽譜（1 版。作者に「リズムが一定」「ありがち」と言われた版。比べるために残す）。

出来事 1 つ = dict(inst=楽器, stem=まとめる段, t=秒, dur=秒, midi=音の高さ, vel=強さ, ほか楽器ごとの値)
"""
from dsp import nm

TITLE = 'わたあめサテライト'
TITLE_EN = 'Wataame Satellite'
BPM = 160
BEAT = 60 / BPM
BAR = 4 * BEAT
STEP = BEAT / 4
KEY = 'D major'


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
TAIL = 3.0  # 最後の余韻（秒）
DURATION = TOTAL_BARS * BAR + TAIL

# ------------------------------------------------------------------ 和音
# 名前: (度数, ベースの音, 和音の並べ方)
CHORDS = {
    'Dmaj9': ('Imaj9', 'D2', ['F#3', 'A3', 'C#4', 'E4', 'A4']),
    'Gmaj9': ('IVmaj9', 'G1', ['G3', 'B3', 'D4', 'F#4', 'A4']),
    'Gmaj7': ('IVmaj7', 'G1', ['G3', 'B3', 'D4', 'F#4', 'B4']),
    'A6': ('V6', 'A1', ['A3', 'C#4', 'E4', 'F#4', 'A4']),
    'A7sus4': ('V7sus4', 'A1', ['A3', 'D4', 'E4', 'G4', 'A4']),
    'A7': ('V7', 'A1', ['A3', 'C#4', 'E4', 'G4', 'A4']),
    'F#m7': ('iiim7', 'F#1', ['F#3', 'A3', 'C#4', 'E4', 'A4']),
    'Bm9': ('vim9', 'B1', ['B3', 'D4', 'F#4', 'A4', 'C#5']),
    'Em9': ('iim9', 'E1', ['E3', 'G3', 'B3', 'D4', 'F#4']),
    'F#7': ('III7', 'F#1', ['F#3', 'A#3', 'C#4', 'E4', 'A#4']),
    'Gm6': ('ivm6', 'G1', ['G3', 'A#3', 'D4', 'E4', 'A#4']),
}

# 進行: [(和音, 拍の数), ...]
DROP_A = [('Gmaj9', 4), ('A6', 4), ('F#m7', 4), ('Bm9', 4), ('Em9', 4), ('F#7', 4), ('Gmaj7', 4), ('Gm6', 2), ('A7sus4', 2)]
DROP_B = DROP_A[:-2] + [('Gm6', 2), ('A7', 2)]
DROP_END = DROP_A[:-2] + [('Dmaj9', 4)]
VERSE = [('Dmaj9', 4), ('Bm9', 4), ('Gmaj9', 4), ('A6', 4), ('Dmaj9', 4), ('Bm9', 4), ('Gmaj9', 4), ('A7sus4', 2), ('A7', 2)]
BUILD = [('Gmaj9', 4), ('A6', 4), ('F#m7', 4), ('Bm9', 4), ('Em9', 4), ('F#7', 4), ('Gmaj9', 4), ('A7sus4', 4)]
OUTRO = [('Gmaj9', 4), ('A6', 4), ('F#m7', 4), ('Bm9', 4), ('Em9', 4), ('A7sus4', 4), ('Dmaj9', 8)]


def progression():
    """曲全体の和音の並び [(開始の秒, 終わりの秒, 名前)]。"""
    plan = [(0, DROP_A), (8, VERSE), (16, BUILD), (24, DROP_A), (32, DROP_B), (40, DROP_A),
            (48, BUILD), (56, DROP_A), (64, DROP_END), (72, OUTRO)]
    out = []
    for bar, prog in plan:
        t = T(bar)
        for name, beats in prog:
            out.append((t, t + beats * BEAT, name))
            t += beats * BEAT
    return out


# ------------------------------------------------------------------ メロディ（drop の主題）
# (始まりの 16 分, 長さの 16 分, 音)
HOOK = [
    [(0, 2, 'A5'), (2, 1, 'B5'), (3, 1, 'A5'), (4, 2, 'F#5'), (6, 1, 'D5'), (7, 1, 'E5'), (8, 3, 'F#5'), (11, 1, 'A5'), (12, 4, 'E5')],
    [(0, 1, 'E5'), (1, 1, 'F#5'), (2, 2, 'E5'), (4, 1, 'C#5'), (5, 1, 'E5'), (6, 2, 'A5'), (8, 2, 'F#5'), (10, 1, 'E5'), (11, 1, 'C#5'), (12, 2, 'E5'), (14, 2, 'F#5')],
    [(0, 2, 'C#6'), (2, 1, 'B5'), (3, 1, 'A5'), (4, 2, 'F#5'), (6, 2, 'A5'), (8, 3, 'E5'), (11, 1, 'F#5'), (12, 2, 'A5'), (14, 2, 'B5')],
    [(0, 3, 'D6'), (3, 1, 'C#6'), (4, 2, 'B5'), (6, 2, 'F#5'), (8, 1, 'A5'), (9, 1, 'B5'), (10, 2, 'A5'), (12, 4, 'F#5')],
    [(0, 2, 'G5'), (2, 1, 'F#5'), (3, 1, 'E5'), (4, 2, 'D5'), (6, 2, 'E5'), (8, 2, 'F#5'), (10, 1, 'G5'), (11, 1, 'A5'), (12, 4, 'B5')],
    [(0, 2, 'A#5'), (2, 2, 'C#6'), (4, 1, 'A#5'), (5, 1, 'F#5'), (6, 2, 'E5'), (8, 2, 'F#5'), (10, 2, 'A#5'), (12, 2, 'C#6'), (14, 2, 'E6')],
    [(0, 2, 'D6'), (2, 1, 'B5'), (3, 1, 'A5'), (4, 2, 'B5'), (6, 2, 'D6'), (8, 3, 'F#6'), (11, 1, 'E6'), (12, 2, 'D6'), (14, 2, 'B5')],
    [(0, 2, 'A#5'), (2, 1, 'G5'), (3, 1, 'E5'), (4, 4, 'D5'), (8, 1, 'D5'), (9, 1, 'E5'), (10, 1, 'G5'), (11, 1, 'A5'), (12, 1, 'D6'), (13, 1, 'A5'), (14, 1, 'G5'), (15, 1, 'E5')],
]
HOOK_SYL = [
    ['ya', 'ri', 'ra', 'ru', 'pa', 'pi', 'ya', 'ri', 'a'],
    ['ra', 'ri', 'ra', 'ni', 'ya', 'wa', 'ru', 'ri', 'ra', 'yo', 'u'],
    ['a', 'ri', 'ra', 'ru', 'ya', 'e', 'ri', 'ra', 'yo'],
    ['wa', 'ri', 'ra', 'ru', 'pa', 'pi', 'ya', 'a'],
    ['ya', 'ri', 'ra', 'ru', 're', 'ri', 'ra', 'ni', 'a'],
    ['na', 'ni', 'ra', 'ri', 'ya', 'ru', 'ra', 'ri', 'a'],
    ['ya', 'ri', 'ra', 'ru', 'ya', 'a', 're', 'ri', 'yo'],
    ['wa', 'ri', 'ra', 'u', 'pa', 'pi', 'pu', 'pe', 'po', 'ra', 'ri', 'ra'],
]
# 後半の 4 小節（13〜16 小節目）
HOOK_B_END = [
    [(0, 2, 'B5'), (2, 1, 'A5'), (3, 1, 'G5'), (4, 2, 'F#5'), (6, 2, 'E5'), (8, 2, 'D5'), (10, 1, 'E5'), (11, 1, 'F#5'), (12, 2, 'G5'), (14, 2, 'A5')],
    [(0, 3, 'A#5'), (3, 1, 'C#6'), (4, 2, 'E6'), (6, 2, 'C#6'), (8, 2, 'A#5'), (10, 2, 'F#5'), (12, 4, 'C#6')],
    [(0, 2, 'B5'), (2, 2, 'D6'), (4, 2, 'F#6'), (6, 1, 'E6'), (7, 1, 'D6'), (8, 2, 'B5'), (10, 2, 'A5'), (12, 2, 'B5'), (14, 2, 'D6')],
    [(0, 2, 'A#5'), (2, 2, 'A5'), (4, 2, 'G5'), (6, 2, 'E5'), (8, 2, 'C#6'), (10, 2, 'E6'), (12, 2, 'G6'), (14, 2, 'A6')],
]
HOOK_B_SYL = [
    ['wa', 'ri', 'ra', 'ru', 'ya', 'ri', 'ra', 'ni', 'ra', 'a'],
    ['a', 'ri', 'ya', 'ru', 'ra', 'ri', 'o'],
    ['ya', 'ri', 'ya', 're', 'ri', 'ra', 'ru', 'ra', 'yo'],
    ['na', 'ni', 'ra', 'ri', 'pa', 'pi', 'pu', 'a'],
]
FINAL_BAR = [(0, 2, 'A#5'), (2, 2, 'A5'), (4, 2, 'G5'), (6, 2, 'E5'), (8, 8, 'D6')]
FINAL_SYL = ['na', 'ni', 'ra', 'ri', 'a']

VERSE_MEL = [
    [(0, 4, 'F#5'), (4, 2, 'E5'), (6, 2, 'D5'), (8, 4, 'A4'), (12, 2, 'B4'), (14, 2, 'D5')],
    [(0, 3, 'C#5'), (3, 1, 'D5'), (4, 4, 'F#5'), (8, 2, 'E5'), (10, 2, 'D5'), (12, 4, 'B4')],
    [(0, 4, 'D5'), (4, 2, 'B4'), (6, 2, 'A4'), (8, 2, 'B4'), (10, 2, 'D5'), (12, 4, 'F#5')],
    [(0, 6, 'E5'), (6, 2, 'F#5'), (8, 4, 'A5')],
    [(0, 4, 'F#5'), (4, 2, 'A5'), (6, 2, 'F#5'), (8, 4, 'E5'), (12, 2, 'D5'), (14, 2, 'E5')],
    [(0, 3, 'F#5'), (3, 1, 'E5'), (4, 4, 'D5'), (8, 2, 'C#5'), (10, 2, 'D5'), (12, 4, 'B4')],
    [(0, 4, 'D5'), (4, 2, 'E5'), (6, 2, 'F#5'), (8, 2, 'G5'), (10, 2, 'F#5'), (12, 4, 'D5')],
    [(0, 2, 'E5'), (2, 2, 'D5'), (4, 2, 'E5'), (6, 2, 'G5'), (8, 8, 'A5')],
]
VERSE_ANSWER = [(12, 1, 'A5', 'ra'), (13, 1, 'F#5', 'ri'), (14, 2, 'E5', 'ra')]


def _notes(bar, cells, syl=None, stretch=1.0, transpose=0):
    out = []
    for i, (s, ln, name) in enumerate(cells):
        out.append(dict(t=T(bar, s * stretch), dur=ln * STEP * stretch, midi=nm(name) + transpose,
                        syl=(syl[i % len(syl)] if syl else None)))
    return out


def hook_notes(bar0, second_half_end=None):
    """drop の 16 小節のメロディ。second_half_end は 13〜16 小節目の差し替え。"""
    out = []
    for i in range(8):
        out += _notes(bar0 + i, HOOK[i], HOOK_SYL[i])
    for i in range(4):
        out += _notes(bar0 + 8 + i, HOOK[i], HOOK_SYL[i])
    end = second_half_end or 'b'
    for i in range(4):
        if end == 'final' and i == 3:
            out += _notes(bar0 + 12 + i, FINAL_BAR, FINAL_SYL)
        else:
            out += _notes(bar0 + 12 + i, HOOK_B_END[i], HOOK_B_SYL[i])
    return out


# ------------------------------------------------------------------ 出来事を作る
def chord_at(t, prog):
    for a, b, name in prog:
        if a <= t < b:
            return name
    return prog[-1][2]


def build_events():
    ev = []
    prog = progression()

    def E(inst, stem, t, **kw):
        d = dict(inst=inst, stem=stem, t=t)
        d.update(kw)
        ev.append(d)

    sec = {s[0]: (s[2], s[3]) for s in SECTIONS}

    # ---------------- 和音（パッド・スーパーソー）
    for a, b, name in prog:
        bar = a / BAR
        _, bass, voicing = CHORDS[name]
        notes = [nm(x) for x in voicing]
        sid = section_of(bar)
        if sid == 'intro':
            E('pad', 'chords', a, dur=b - a, notes=notes, vel=0.42, cutoff=('const', 1100), sec=sid)
        elif sid == 'verse':
            E('pad', 'chords', a, dur=b - a, notes=notes, vel=0.5, cutoff=('const', 2200), sec=sid)
        elif sid in ('build1', 'build2'):
            b0 = sec[sid][0]
            if bar >= b0 + 7:
                # 最後の小節: 3 拍で音の高さを上げ、4 拍目は止める
                E('saw', 'chords', a, dur=3 * BEAT, notes=notes, vel=0.85,
                  cutoff=('build', b0), bend=(0, 5), sec=sid)
            else:
                E('saw', 'chords', a, dur=b - a, notes=notes, vel=0.8, cutoff=('build', b0), sec=sid)
        elif sid in ('drop1', 'drop2'):
            b0 = sec[sid][0]
            k = int(round(bar - b0))
            if k % 4 == 3:
                # 4 小節目ごと: 刻む和音（シンコペーション）
                for s, ln in ((0, 3), (3, 3), (6, 2), (8, 2), (10, 2), (12, 4)):
                    ts = a + s * STEP
                    if ts >= b - 1e-6:
                        continue
                    nm_ = chord_at(ts + 1e-4, prog)
                    nn = [nm(x) for x in CHORDS[nm_][2]]
                    E('saw', 'chords', ts, dur=min(ln * STEP, b - ts) * 0.92, notes=nn, vel=1.0,
                      cutoff=('const', 8000), sec=sid)
            else:
                E('saw', 'chords', a, dur=b - a, notes=notes, vel=1.0, cutoff=('const', 8000), sec=sid)
            # 1 オクターブ上の薄い層（明るさ）
            E('saw', 'chords', a, dur=b - a, notes=[n + 12 for n in notes[1:4]], vel=0.32,
              cutoff=('const', 9000), sec=sid)
        elif sid == 'break':
            for n in notes:
                E('ep', 'keys', a, dur=(b - a) * 0.98, midi=n, vel=0.55)
            E('pad', 'chords', a, dur=b - a, notes=notes, vel=0.34, cutoff=('const', 1400), sec=sid)
        elif sid == 'outro':
            E('pad', 'chords', a, dur=b - a, notes=notes, vel=0.42 * max(0.2, 1 - (bar - 72) / 9),
              cutoff=('const', 1300), sec=sid)

    # ---------------- ベース
    for a, b, name in prog:
        bar = a / BAR
        sid = section_of(bar)
        root = nm(CHORDS[name][1])
        if sid in ('intro',):
            continue
        if sid == 'outro' and bar >= 78:
            continue
        if sid in ('build1', 'build2'):
            b0 = sec[sid][0]
            if bar >= b0 + 6:
                continue
            E('sub', 'bass', a, dur=b - a, midi=root, vel=0.75)
        elif sid == 'break':
            E('sub', 'bass', a, dur=b - a, midi=root, vel=0.5)
        elif sid in ('drop1', 'drop2', 'verse', 'outro'):
            E('sub', 'bass', a, dur=b - a, midi=root, vel=1.0 if 'drop' in sid else 0.8)
            if sid == 'drop2':
                # 中音域のうなるベース（8 分の裏を中心に）
                for s in (0, 3, 6, 10, 12, 14):
                    ts = a + s * STEP
                    if ts < b - 1e-6:
                        E('growl', 'bass', ts, dur=STEP * 1.6, midi=root + 12, vel=0.55)

    # ---------------- ドラム
    for sid, name, b0, nb in SECTIONS:
        for k in range(nb):
            bar = b0 + k
            fill = (k % 4 == 3)
            if sid in ('drop1', 'drop2'):
                kicks = [0, 7, 10] if not fill else [0, 3, 6, 10, 11]
                for s in kicks:
                    E('kick', 'kick', T(bar, s), vel=1.0 if s in (0, 10) else 0.8)
                E('snare', 'snare', T(bar, 8), vel=1.0)
                if fill:
                    for s, v in ((12, 0.45), (14, 0.6), (15, 0.75)):
                        E('snare', 'snare', T(bar, s), vel=v, tone=1.05)
                for s in range(0, 16, 2):
                    E('hat', 'hats', T(bar, s), vel=0.55 if s % 4 == 2 else 0.32, open_=(s == 14 and k % 2 == 1))
                if fill:
                    for j in range(6):
                        E('hat', 'hats', T(bar, 12 + j * 4 / 6), vel=0.25 + 0.06 * j)
                for s in range(1, 16, 2):
                    E('shaker', 'perc', T(bar, s), vel=0.35)
                if k % 2 == 1:
                    E('rim', 'perc', T(bar, 13), vel=0.4)
            elif sid == 'verse':
                for s in (0, 10):
                    E('kick', 'kick', T(bar, s), vel=0.8)
                E('snare', 'snare', T(bar, 8), vel=0.62)
                for s in range(0, 16, 2):
                    E('hat', 'hats', T(bar, s), vel=0.38 if s % 4 == 2 else 0.22)
                for s in range(1, 16, 2):
                    E('shaker', 'perc', T(bar, s), vel=0.22)
            elif sid in ('build1', 'build2'):
                last = (k == nb - 1)
                if k < 6:
                    for s in (0, 4, 8, 12):
                        E('kick', 'kick', T(bar, s), vel=0.82)
                elif k == 6:
                    for s in range(0, 16, 2):
                        E('kick', 'kick', T(bar, s), vel=0.7)
                # スネアのロール: 4 分 → 8 分 → 16 分 → 32 分
                div = [4, 4, 2, 2, 1, 1, 1, 0.5][k]
                steps = [s * div for s in range(int(16 / div))]
                if last:
                    steps = [s for s in steps if s < 12]
                for s in steps:
                    prog_ = (k * 16 + s) / (nb * 16)
                    E('snare', 'snare', T(bar, s), vel=0.25 + 0.6 * prog_, tone=1.0 + 0.5 * prog_, short=True)
                if k >= 4:
                    for s in range(0, 16, 2):
                        E('hat', 'hats', T(bar, s), vel=0.3)
            elif sid == 'break' and k >= 4:
                for s in range(0, 16, 2):
                    E('hat', 'hats', T(bar, s), vel=0.18 + 0.03 * (k - 4))
                if k == nb - 1:
                    E('snare', 'snare', T(bar, 12), vel=0.5)

    # ---------------- メロディ（チョップ＋鈴）
    for sid, bar0 in (('drop1', 24), ('drop2', 56)):
        notes = hook_notes(bar0, 'final' if sid == 'drop2' else 'b')
        for n in notes:
            E('chop', 'chops', n['t'], dur=n['dur'] * 0.88, midi=n['midi'], syl=n['syl'], vel=0.95)
            E('bell', 'lead', n['t'], dur=n['dur'], midi=n['midi'], vel=0.5)
            if sid == 'drop2':
                E('chip', 'lead', n['t'], dur=n['dur'] * 0.9, midi=n['midi'] - 12, vel=0.35)
        if sid == 'drop2':
            # 後半 8 小節は 3 度下の重ね
            for n in notes:
                if n['t'] >= T(bar0 + 8):
                    E('chop', 'chops', n['t'], dur=n['dur'] * 0.88, midi=third_below(n['midi']), syl=n['syl'],
                      vel=0.45, pan=-0.35, harmony=True)
    # verse: 鈴のメロディと、チョップの返事
    for i, cells in enumerate(VERSE_MEL):
        for n in _notes(8 + i, cells):
            E('bell', 'lead', n['t'], dur=n['dur'], midi=n['midi'], vel=0.6)
    for bar in (11, 15):
        for s, ln, name, syl in VERSE_ANSWER:
            E('chop', 'chops', T(bar, s), dur=ln * STEP * 0.85, midi=nm(name), syl=syl, vel=0.7)
    # intro: 遠くから届く信号のようなチョップ（こもらせる）
    for i in range(4):
        for n in _notes(4 + i, HOOK[i], HOOK_SYL[i]):
            E('chop', 'chops', n['t'], dur=n['dur'] * 0.85, midi=n['midi'], syl=n['syl'], vel=0.5 + 0.1 * i,
              radio=True)
    # break: 主題を半分の速さで
    for i in range(4):
        for n in _notes(40 + 2 * i, HOOK[i], HOOK_SYL[i], stretch=2.0):
            E('chop', 'chops', n['t'], dur=n['dur'] * 0.8, midi=n['midi'], syl=n['syl'], vel=0.6, wet=True)
    # build: 刻むチョップ → 最後の「えい」
    for sid in ('build1', 'build2'):
        b0 = sec[sid][0]
        for k in range(4, 7):
            div = 2 if k < 6 else 1
            if sid == 'build1' and k < 5:
                continue
            for s in range(0, 16, div):
                name = chord_at(T(b0 + k, s) + 1e-4, prog)
                top = nm(CHORDS[name][2][-1]) + 12
                E('chop', 'chops', T(b0 + k, s), dur=STEP * div * 0.6, midi=top, syl='ra' if (s // div) % 2 == 0 else 'ri',
                  vel=0.35 + 0.08 * (k - 4))
        E('chop', 'chops', T(b0 + 7, 12), dur=STEP * 0.9, midi=nm('D6'), syl='e', vel=0.9)
        E('chop', 'chops', T(b0 + 7, 13), dur=STEP * 2.2, midi=nm('E6'), syl='i', vel=0.95, glide_from=nm('D6'))

    # ---------------- 鍵盤（オルゴール・カリンバ）
    arp_shape = [0, 2, 1, 3, 4, 3, 2, 1]
    for a, b, name in prog:
        bar = a / BAR
        sid = section_of(bar)
        voicing = [nm(x) + 12 for x in CHORDS[name][2]]
        nsteps = int(round((b - a) / STEP))
        if sid in ('intro', 'break', 'outro') or (sid == 'build1' and bar < 20):
            for j, s in enumerate(range(0, nsteps, 2)):
                m = voicing[arp_shape[j % 8] % len(voicing)]
                vel = 0.55 if sid != 'outro' else 0.55 * max(0.25, 1 - (bar - 72) / 9)
                E('musicbox', 'keys', a + s * STEP, midi=m, vel=vel * (1.0 if s % 4 == 0 else 0.75))
        if sid == 'verse':
            for j, s in enumerate(range(0, nsteps, 2)):
                m = voicing[arp_shape[j % 8] % len(voicing)] - 12
                E('pluck', 'keys', a + s * STEP, midi=m, vel=0.6 if s % 4 == 0 else 0.45)
        if sid == 'drop2':
            # チップチューンの速いアルペジオ（32 分）
            ns = int(round((b - a) / (STEP / 2)))
            for j in range(ns):
                m = voicing[[0, 1, 2, 3, 4, 3, 2, 1][j % 8] % len(voicing)] + 12
                E('chip', 'keys', a + j * STEP / 2, dur=STEP / 2 * 0.7, midi=m, vel=0.18, vib=False, width=0.125)

    # ---------------- 効果音
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
        E('sparkle', 'fx', T(b0 + 8), vel=0.7, seed=b0 + 8, up=False)
        E('downlifter', 'fx', T(b0), dur=2 * BAR, vel=0.4)
        for k in (1, 5, 9, 13):
            E('squeak', 'fx', T(b0 + k, 15), vel=0.6, up=(k % 8 == 1))
        for k in range(16):
            for s in ((3, 13) if k % 2 == 0 else (5,)):
                E('pop', 'fx', T(b0 + k, s), vel=0.45, pitch=1.0 + 0.15 * ((k + s) % 3))
    E('downlifter', 'fx', T(40), dur=2 * BAR, vel=0.5)
    E('sparkle', 'fx', T(44), vel=0.5, seed=44)
    E('sparkle', 'fx', T(72), vel=0.7, seed=72, up=False)
    E('sparkle', 'fx', T(78), vel=0.8, seed=78)
    E('pop', 'fx', T(79, 8), vel=0.7, pitch=1.2)

    ev.sort(key=lambda e: e['t'])
    return ev


def third_below(m):
    """D メジャーの音階で 3 度下の音。"""
    scale = [2, 4, 6, 7, 9, 11, 1]  # D E F# G A B C#
    pc = m % 12
    if pc not in scale:
        return m - 4
    i = scale.index(pc)
    target = scale[(i - 2) % 7]
    d = (pc - target) % 12
    return m - d


def section_of(bar):
    for sid, _, b0, nb in SECTIONS:
        if b0 <= bar < b0 + nb:
            return sid
    return SECTIONS[-1][0]


# サイドチェイン: 区間ごとの、拍ごとの下げ方（深さ, 戻る時間の拍）
PUMP = {
    'intro': None,
    'verse': (0.35, 0.5),
    'build1': (0.45, 0.5),
    'drop1': (0.82, 0.55),
    'break': None,
    'build2': (0.45, 0.5),
    'drop2': (0.82, 0.55),
    'outro': None,
}
# テープを止める演出（drop1 の最後の 2 拍）
TAPE_STOP = (T(39, 8), T(40))
