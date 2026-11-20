"""鐘なき王国: 床の模様 8 枚とスタンプ 12 枚（平らな 16x16）。

床: 模様はすべて 16 で割った余りで決めるので、上下左右に並べても継ぎ目が出ない。
スタンプ: 文字の絵（1 文字 = 1 ドット）で描く。顔のスタンプは、この世界の印の「小さな鐘」に顔を付けた物。
"""

from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image

from palette import OUTLINE, RAMPS

N = 16


def _hash(x, y, seed):
    v = (x * 374761393 + y * 668265263 + seed * 2246822519) & 0xFFFFFFFF
    v = ((v ^ (v >> 13)) * 1274126177) & 0xFFFFFFFF
    return (v ^ (v >> 16)) / 0xFFFFFFFF


def _wave(seed, terms=3):
    """16 で周期になる、なめらかな濃淡（-1〜1）。
    初めは sin の和で作ったが、斜めの縞がそろって見えたので、周期のある値ノイズ（4 マスと 8 マスの格子）にした。"""
    rs = np.random.RandomState(seed)
    v = np.zeros((N, N))
    for cells, amp in ((4, 0.65), (8, 0.35)):
        g = rs.random_sample((cells, cells)) * 2 - 1
        step = N / cells
        for y in range(N):
            for x in range(N):
                fx, fy = x / step, y / step
                x0, y0 = int(fx) % cells, int(fy) % cells
                x1, y1 = (x0 + 1) % cells, (y0 + 1) % cells
                tx, ty = fx - int(fx), fy - int(fy)
                tx, ty = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
                a = g[y0, x0] * (1 - tx) + g[y0, x1] * tx
                b = g[y1, x0] * (1 - tx) + g[y1, x1] * tx
                v[y, x] += amp * (a * (1 - ty) + b * ty)
    return v


def _img(tones, mat):
    ramp = RAMPS[mat]
    out = np.zeros((N, N, 4), np.uint8)
    for y in range(N):
        for x in range(N):
            m, t = tones[y][x] if isinstance(tones[y][x], tuple) else (mat, tones[y][x])
            out[y, x] = (*RAMPS[m][max(0, min(3, t))], 255)
    return out


def _base(mat, seed, lo=-0.35, hi=0.45):
    w = _wave(seed)
    t = [[2 for _ in range(N)] for _ in range(N)]
    for y in range(N):
        for x in range(N):
            if w[y, x] < lo:
                t[y][x] = 1
            elif w[y, x] > hi and _hash(x, y, seed) > 0.5:
                t[y][x] = 3
            if _hash(x, y, seed + 1) > 0.93:
                t[y][x] = max(0, t[y][x] - 1)
    return t


def grass():
    t = _base("grass", 11)
    for i in range(14):
        x, y = int(_hash(i, 1, 12) * N), int(_hash(i, 2, 12) * N)
        t[y][x] = 3                        # 草の先
        t[(y + 1) % N][x] = 1
        if i % 5 == 0:
            t[y][(x + 1) % N] = ("thatch", 2)   # 枯れ草
    return _img(t, "grass")


def dirt():
    t = _base("dirt", 21)
    for i in range(7):
        x, y = int(_hash(i, 1, 22) * N), int(_hash(i, 2, 22) * N)
        t[y][x] = ("stone", 3)
        t[(y + 1) % N][(x + 1) % N] = 0
    return _img(t, "dirt")


def road():
    t = _base("road", 31, lo=-0.5, hi=0.6)
    for i in range(10):
        x, y = int(_hash(i, 1, 32) * N), int(_hash(i, 2, 32) * N)
        t[y][x] = ("stone_warm", 2 + (i % 2))
        t[y][(x + 1) % N] = 1
    return _img(t, "road")


def cobble():
    t = [[("stone_dark", 0) for _ in range(N)] for _ in range(N)]
    # 4 段の石の列。継ぎ目の位置は 16 で回るので、並べても続いて見える
    rows = [(0, [0, 5, 10]), (4, [2, 8, 13]), (8, [0, 6, 11]), (12, [3, 7, 12])]
    for k, (y0, cuts) in enumerate(rows):
        for j, c in enumerate(cuts):
            c2 = cuts[(j + 1) % len(cuts)] + (N if j + 1 == len(cuts) else 0)
            shade = 2 if _hash(k, j, 41) > 0.35 else 1
            for y in range(y0, y0 + 3):
                for xx in range(c, c2 - 1):
                    x = xx % N
                    tone = shade
                    if y == y0 or xx == c:
                        tone = 3
                    if y == y0 + 2 or xx == c2 - 2:
                        tone = min(tone, 1)
                    t[y][x] = ("cobble", tone)
    return _img(t, "cobble")


def swamp():
    t = _base("swamp", 51)
    w = _wave(52)
    for y in range(N):
        for x in range(N):
            if w[y, x] > 0.3:
                t[y][x] = ("water", 0 if w[y, x] > 0.5 else 1)
            elif _hash(x, y, 53) > 0.94:
                t[y][x] = ("moss", 3)
    return _img(t, "swamp")


def water():
    t = _base("water", 61, lo=-0.2, hi=2.0)
    for i in range(6):
        x, y = int(_hash(i, 1, 62) * N), int(_hash(i, 2, 62) * N)
        for d in range(3):
            t[y][(x + d) % N] = 3
        t[(y + 1) % N][(x + 1) % N] = 1
    return _img(t, "water")


def dungeon_floor():
    t = [[2 for _ in range(N)] for _ in range(N)]
    for y in range(N):
        for x in range(N):
            slab = (x // 8) + 2 * (y // 8)
            base = (2, 1, 1, 2)[slab]
            tone = base
            if x % 8 == 7 or y % 8 == 7:
                tone = 0
            elif x % 8 == 0 or y % 8 == 0:
                tone = base + 1
            elif _hash(x, y, 71) > 0.9:
                tone = base - 1
            t[y][x] = tone
    for x, y in ((2, 3), (3, 4), (4, 4), (11, 10), (12, 11)):   # ひび
        t[y][x] = 0
    return _img(t, "dungeon")


def dungeon_rubble():
    img = dungeon_floor()
    for i in range(6):
        x, y = int(_hash(i, 1, 81) * N), int(_hash(i, 2, 81) * N)
        s = 1 + (i % 2)
        for dy in range(s):
            for dx in range(s):
                img[(y + dy) % N, (x + dx) % N, :3] = RAMPS["stone_dark"][3 if dy == 0 else 2]
        img[(y + s) % N, (x + 1) % N, :3] = RAMPS["dungeon"][0]
        img[(y + s) % N, (x + s) % N, :3] = RAMPS["dungeon"][0]
    return img


FLOORS = {
    "grass": grass, "dirt": dirt, "road": road, "cobble": cobble,
    "swamp": swamp, "water": water, "dungeon_floor": dungeon_floor, "dungeon_rubble": dungeon_rubble,
}


# ---------------- スタンプ ----------------

KEY = {
    "#": RAMPS["bronze"][2], "h": RAMPS["bronze"][3], "s": RAMPS["bronze"][1], "L": RAMPS["brass"][3],
    "k": RAMPS["black"][0], "w": RAMPS["white_dot"][0], "r": RAMPS["flesh_red"][2], "R": RAMPS["eye_red"][2],
    "b": RAMPS["magic_blue"][2], "B": RAMPS["magic_blue"][3], "g": RAMPS["magic_gold"][3], "G": RAMPS["gold"][2],
    "p": RAMPS["skin"][2], "P": RAMPS["skin"][3], "e": RAMPS["steel"][3], "E": RAMPS["steel"][2],
    "t": RAMPS["leather"][2], "c": RAMPS["crimson"][2], "C": RAMPS["crimson"][3],
    "z": RAMPS["magic_teal"][3], "o": RAMPS["bronze"][0],
    "q": RAMPS["magic_green"][3], "Q": RAMPS["leaf"][1],
    "n": RAMPS["bone"][2], "N": RAMPS["bone"][3], "m": RAMPS["bone"][1],
    "Y": RAMPS["gold"][1], "y": RAMPS["gold"][3],
}

BELL = [
    "................",
    ".......##.......",
    ".......##.......",
    ".....######.....",
    "....########....",
    "....########....",
    "...##########...",
    "...##########...",
    "...##########...",
    "...##########...",
    "...##########...",
    "..############..",
    ".LLLLLLLLLLLLLL.",
    ".LLLLLLLLLLLLLL.",
    ".......oo.......",
    "................",
]


def _bell():
    rows = [list(r) for r in BELL]
    for y, r in enumerate(rows):
        xs = [x for x, c in enumerate(r) if c == "#"]
        if xs:
            r[xs[0]] = "s" if y > 2 else "#"
            if len(xs) > 2:
                r[xs[0] + 1] = "h"         # 左の光
            r[xs[-1]] = "s"
    return rows


def _put(rows, pts, ch):
    for x, y in pts:
        rows[y][x] = ch


FACES = {
    # 目は 1x2、口は行 10
    "wave": dict(k=[(5, 7), (5, 8), (10, 7), (10, 8), (6, 10), (9, 10), (7, 11), (8, 11)],
                 p=[(13, 3), (14, 3), (13, 4), (14, 4), (15, 4), (13, 5), (14, 5)], P=[(13, 2), (15, 3)],
                 w=[(15, 1), (12, 1)]),
    # おじぎ: 鐘を 1 段下げ、目を閉じ、頭の上に動きの線
    "bow": dict(k=[(4, 8), (5, 8), (6, 8), (9, 8), (10, 8), (11, 8), (7, 10), (8, 10)],
                w=[(3, 1), (4, 2), (12, 1), (11, 2), (7, 0), (8, 0)]),
    "thanks": dict(k=[(4, 8), (5, 7), (6, 8), (9, 8), (10, 7), (11, 8), (6, 10), (9, 10), (7, 11), (8, 11)],
                   g=[(13, 1), (12, 2), (14, 2), (13, 3)], G=[(13, 2)]),
    "sorry": dict(k=[(4, 8), (5, 8), (6, 8), (9, 8), (10, 8), (11, 8), (7, 10), (8, 10)],
                  b=[(13, 2), (13, 3), (13, 4), (14, 4), (13, 5), (14, 5), (13, 6)], B=[(12, 4), (12, 5)]),
    "surprise": dict(k=[(5, 6), (6, 6), (5, 7), (9, 6), (10, 6), (10, 7), (7, 9), (8, 9), (7, 10), (8, 10)],
                     w=[(6, 7), (9, 7)], g=[(1, 3), (14, 3), (2, 1), (13, 1)]),
    "cheer": dict(k=[(4, 7), (5, 6), (6, 7), (9, 7), (10, 6), (11, 7), (5, 9), (6, 9), (7, 9), (8, 9), (9, 9),
                     (10, 9), (5, 10), (10, 10), (6, 11), (9, 11)],
                  r=[(6, 10), (7, 10), (8, 10), (9, 10), (7, 11), (8, 11)],
                  g=[(1, 2), (0, 3), (2, 3), (1, 4), (14, 2), (13, 3), (15, 3), (14, 4), (2, 8), (13, 8)]),
    "cry": dict(k=[(4, 7), (5, 7), (6, 7), (9, 7), (10, 7), (11, 7), (6, 10), (7, 9), (8, 9), (9, 10)],
                B=[(5, 8), (10, 8)], b=[(5, 9), (10, 9), (5, 11), (10, 11)]),
    "angry": dict(k=[(4, 6), (5, 7), (6, 7), (11, 6), (10, 7), (9, 7), (5, 8), (10, 8), (6, 11), (7, 10), (8, 10),
                     (9, 11)],
                  R=[(12, 1), (14, 1), (13, 2), (12, 3), (14, 3)]),
    "sleepy": dict(k=[(4, 8), (5, 8), (6, 8), (9, 8), (10, 8), (11, 8), (7, 10), (8, 10)],
                   # 3x3 の小さな z は「I」に見えたので、4x4 の Z を 1 つだけにした
                   z=[(11, 0), (12, 0), (13, 0), (14, 0), (13, 1), (12, 2), (11, 3), (12, 3), (13, 3), (14, 3)]),
}

SYMBOLS = {
    "question": [
        "................",
        ".....GGGGGG.....",
        "....GGggggGG....",
        "...GGgGGGGgGG...",
        "...GGgG..GgGG...",
        "...GGGG..GgGG...",
        ".........GgGG...",
        "........GgGG....",
        ".......GgGG.....",
        "......GgGG......",
        "......GgG.......",
        "......GGG.......",
        "................",
        "......GgG.......",
        "......GGG.......",
        "................",
    ],
    "ok": [
        "................",
        "................",
        "............QQ..",
        "...........QqqQ.",
        "..........QqqQ..",
        ".........QqqQ...",
        "..QQ....QqqQ....",
        ".QqqQ..QqqQ.....",
        "..QqqQQqqQ......",
        "...QqqqqQ.......",
        "....QqqQ........",
        ".....QQ.........",
        "................",
        "................",
        "................",
        "................",
    ],
    "skull": [
        "................",
        "....mmmmmmmm....",
        "...mNNNNNNNNm...",
        "..mNNnnnnnnNNm..",
        "..mNnnnnnnnnnm..",
        "..mnkkknnkkknm..",
        "..mnkkknnkkknm..",
        "..mnkkRnnkkRnm..",
        "..mnnnnkknnnnm..",
        "...mnnnkknnnm...",
        "....mnnnnnnm....",
        "....mkNkNkNm....",
        "....mnmnmnmm....",
        ".....mmmmmm.....",
        "................",
        "................",
    ],
}


def _gold_bell():
    """鳴っている金の鐘（顔なし）。舌が片側へ振れ、両わきに音の線。"""
    rows = [list(r) for r in BELL]
    for y, r in enumerate(rows):
        xs = [x for x, c in enumerate(r) if c == "#"]
        for x in xs:
            r[x] = "G"
        if xs:
            r[xs[0]] = "Y"
            if len(xs) > 2:
                r[xs[0] + 1] = "y"
            r[xs[-1]] = "Y"
    rows[14] = list("........oo......")
    _put(rows, [(1, 4), (0, 5), (0, 6), (1, 7), (14, 4), (15, 5), (15, 6), (14, 7)], "w")
    return rows


def _to_img(rows):
    out = np.zeros((N, N, 4), np.uint8)
    for y, r in enumerate(rows):
        for x, c in enumerate(r):
            if c != ".":
                out[y, x] = (*KEY[c], 255)
    # 外側に 1 ドットの線（暗い地でも明るい地でも見えるように）
    a = out[..., 3] > 0
    p = np.pad(a, 1)
    ring = ~a & (p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:])
    out[ring] = (*OUTLINE, 255)
    return out


def stamp(name):
    if name in SYMBOLS:
        return _to_img([list(r) for r in SYMBOLS[name]])
    if name == "bell":
        return _to_img(_gold_bell())
    rows = _bell()
    if name == "bow":
        rows = [list("." * N)] + rows[:-1]       # 1 段下げる
    for ch, pts in FACES[name].items():
        _put(rows, pts, ch)
    return _to_img(rows)


# データの係の kanenaki/shared/data/phrases.mjs の stamps と同じ id（絵の id は stamp_<id>）
STAMPS = ["wave", "bow", "thanks", "sorry", "cheer", "cry", "angry", "surprise",
          "question", "ok", "skull", "bell", "sleepy"]
STAMP_NAMES = {
    "wave": "手を振る", "bow": "おじぎ", "thanks": "ありがとう", "sorry": "ごめん", "cheer": "やった",
    "cry": "泣く", "angry": "怒る", "surprise": "驚く", "question": "はてな", "ok": "了解",
    "skull": "どくろ", "bell": "鐘", "sleepy": "ねむい",
}


def build_all(out_dir: Path, preview_dir: Path) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    preview_dir.mkdir(parents=True, exist_ok=True)
    entries = {}
    floor_imgs = {}
    for tid, fn in FLOORS.items():
        img = fn()
        Image.fromarray(img).save(out_dir / f"{tid}.png")
        floor_imgs[tid] = img
        entries[tid] = {"kind": "tile", "footprint": [1, 1],
                        "poses": {"idle": {"file": f"assets/tiles/{tid}.png", "w": N, "h": N, "count": 1}},
                        "anchor": [N // 2, N // 2]}
    stamp_imgs = {}
    for s in STAMPS:
        sid = f"stamp_{s}"
        img = stamp(s)
        Image.fromarray(img).save(out_dir / f"{sid}.png")
        stamp_imgs[sid] = img
        entries[sid] = {"kind": "stamp", "name": STAMP_NAMES[s], "footprint": [1, 1],
                        "poses": {"idle": {"file": f"assets/tiles/{sid}.png", "w": N, "h": N, "count": 1}},
                        "anchor": [N // 2, N // 2]}
    # 確かめ用: 床は 3x3 に並べて継ぎ目を見る。スタンプは暗い地と明るい地に並べる
    sc = 6
    sheet = Image.new("RGB", ((N * 3 * sc + 12) * 4, (N * 3 * sc + 12) * 2), (30, 30, 30))
    for i, (tid, img) in enumerate(floor_imgs.items()):
        tiled = np.tile(img, (3, 3, 1))
        im = Image.fromarray(tiled).resize((N * 3 * sc, N * 3 * sc), Image.NEAREST)
        sheet.paste(im, ((i % 4) * (N * 3 * sc + 12), (i // 4) * (N * 3 * sc + 12)))
    sheet.save(preview_dir / "floors_3x3.png")
    sc = 8
    rows_n = (len(stamp_imgs) + 5) // 6
    sheet = Image.new("RGB", ((N * sc + 8) * 6, (N * sc + 8) * rows_n * 2), (40, 40, 44))
    for i, (sid, img) in enumerate(stamp_imgs.items()):
        im = Image.fromarray(img).resize((N * sc, N * sc), Image.NEAREST)
        for row, bgc in ((0, (40, 40, 44)), (rows_n, (226, 222, 210))):
            x = (i % 6) * (N * sc + 8)
            y = (row + i // 6) * (N * sc + 8)
            bg = Image.new("RGB", (N * sc, N * sc), bgc)
            bg.paste(im, (0, 0), im)
            sheet.paste(bg, (x, y))
    sheet.save(preview_dir / "stamps.png")
    return entries
