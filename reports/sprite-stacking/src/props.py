"""鐘なき王国: 動かない物 21 種の絵（待機だけ）。

スキルの Lessons に合わせたこと
- 丸い物（木の葉、樽、火鉢の鉢、ワープの台）は --round で切る。
- 壁から飛び出す物（窓・扉・看板）は平らに塗る。煙突は棟の上に置く。
- 細い部分（柵の横木、たいまつの柱、枯れ木の枝）は 2 ドット以上。
- 柵の隙間は外へつながるように、柱を真ん中に 1 本だけ立てる。
- 中が空の物（崩れた鐘楼の筒、家の破風の張り出し）は、切った後に立体と照らして直す（fix）。
"""

from __future__ import annotations

import math

import numpy as np

from palette import INDEX
from shapes import bar, cube, rnd
from vox import Model


def _m(W, L, H):
    M = Model(W, L, H)
    M.centre = (W // 2, L // 2)
    return M


def speckle(M: Model, mat: str, prob: float, tone: int, seed: int):
    """素材の一部のボクセルの段をずらす（葉・石の細かい模様）。"""
    rs = np.random.RandomState(seed)
    sel = (M.m == INDEX[mat]) & (rs.random_sample(M.m.shape) < prob)
    M.t[sel] = tone


def bricks(M: Model, mat: str, course=4, brick=8, tone=-1):
    """れんがの目地（段を 1 つ暗く）。"""
    zz, yy, xx = np.mgrid[0 : M.H, 0 : M.L, 0 : M.W]
    off = (zz // course) % 2 * (brick // 2)
    joint = (zz % course == course - 1) | ((xx + off) % brick == brick - 1) | ((yy + off) % brick == brick - 1)
    sel = (M.m == INDEX[mat]) & joint
    M.t[sel] = tone


# ---------------- 木 ----------------

def tree_oak(pose="idle"):
    M = _m(36, 36, 40)
    C = 18
    M.cyl(C, C, 3.0, 3.0, 0, 1, "bark")
    M.cyl(C, C, 2.0, 2.0, 2, 17, "bark")
    M.ell(C, C, 25, 12.0, 12.0, 9.0, "leaf")
    M.ell(C - 3, C + 2, 31, 7.0, 7.0, 5.0, "leaf")
    M.ell(C + 3, C - 3, 30, 7.0, 7.0, 5.0, "leaf")
    speckle(M, "leaf", 0.22, -1, 1)
    speckle(M, "leaf", 0.12, 1, 2)
    return M


def tree_pine(pose="idle"):
    M = _m(28, 28, 44)
    C = 14
    M.cyl(C, C, 2.0, 2.0, 0, 9, "bark")
    for z0, z1, r0, r1 in ((6, 17, 9.5, 5.0), (14, 25, 7.8, 3.6), (22, 33, 5.8, 2.0), (31, 38, 3.4, 0.6)):
        M.cone(C, C, r0, r1, z0, z1, "pine")
        M.cone(C, C, r0, r0, z0, z0, "pine", tone=-1)
    speckle(M, "pine", 0.18, 1, 3)
    return M


def tree_dead(pose="idle"):
    M = _m(30, 30, 34)
    C = 15
    bar(M, (C - 1, C - 1, 0), (C - 1, C, 15), "bark_grey", w=3)
    for a, b in (((C, C, 10), (C + 7, C + 1, 16)), ((C - 2, C - 1, 13), (C - 8, C - 3, 19)),
                 ((C, C - 2, 16), (C + 1, C - 8, 22)), ((C - 1, C, 15), (C - 2, C + 3, 25)),
                 ((C + 7, C + 1, 16), (C + 9, C + 3, 19)), ((C - 8, C - 3, 19), (C - 10, C - 2, 22))):
        bar(M, a, b, "bark_grey")
    for a, b in (((C - 1, C - 1, 0), (C - 5, C + 2, 0)), ((C, C, 0), (C + 4, C - 3, 0))):
        bar(M, a, b, "bark")
    speckle(M, "bark_grey", 0.25, -1, 4)
    return M


# ---------------- 岩 ----------------

def rock_a(pose="idle"):
    M = _m(22, 22, 12)
    C = 11
    M.ell(C, C, 2.5, 7.0, 6.0, 5.5, "stone")
    M.ell(C + 2, C - 2, 4.0, 4.5, 4.0, 4.5, "stone")
    M.ell(C - 3, C + 2, 2.0, 4.0, 3.5, 3.0, "stone")
    speckle(M, "stone", 0.2, -1, 5)
    M.paint("top", C - 3, C + 3, C - 4, C, "moss")
    return M


def rock_b(pose="idle"):
    M = _m(24, 24, 10)
    C = 12
    M.box(C - 7, C - 1, C - 4, C + 1, 0, 6, "stone_dark")
    M.box(C - 7, C - 1, C - 4, C - 4, 6, 6, None)
    M.box(C - 7, C - 7, C - 4, C + 1, 5, 6, None)
    M.box(C - 1, C + 5, C - 1, C + 4, 0, 3, "stone_dark")
    M.box(C + 5, C + 5, C - 1, C + 4, 3, 3, None)
    M.box(C - 3, C + 1, C + 2, C + 6, 0, 2, "stone")
    speckle(M, "stone_dark", 0.2, 1, 6)
    return M


# ---------------- 家 ----------------

def _gable_roof(M, x0, x1, y0, y1, z0, mat, step=1, ridge="x", barge=2):
    """破風屋根。ridge="x" なら棟が x 方向。屋根の端は 2 ドットの板（破風）で、壁より外へ出す。"""
    k = 0
    while True:
        if ridge == "x":
            a, b = y0 + k * step, y1 - k * step
        else:
            a, b = x0 + k * step, x1 - k * step
        if b - a < 1:
            break
        z = z0 + k
        if ridge == "x":
            M.box(x0, x1, a, b, z, z, mat, tone=-1 if k % 2 else 0)
            M.box(x0 - barge, x0 - 1, a, min(b, a + 1), z, z, mat)
            M.box(x0 - barge, x0 - 1, max(a, b - 1), b, z, z, mat)
            M.box(x1 + 1, x1 + barge, a, min(b, a + 1), z, z, mat)
            M.box(x1 + 1, x1 + barge, max(a, b - 1), b, z, z, mat)
        else:
            M.box(a, b, y0, y1, z, z, mat, tone=-1 if k % 2 else 0)
            M.box(a, min(b, a + 1), y0 - barge, y0 - 1, z, z, mat)
            M.box(max(a, b - 1), b, y0 - barge, y0 - 1, z, z, mat)
            M.box(a, min(b, a + 1), y1 + 1, y1 + barge, z, z, mat)
            M.box(max(a, b - 1), b, y1 + 1, y1 + barge, z, z, mat)
        k += 1
    return z0 + k - 1


def _timber(M, side, u0, u1, z0, z1, every=6):
    for u in range(u0, u1 + 1, every):
        M.paint(side, u, u, z0, z1, "timber")
    M.paint(side, u0, u1, z0, z0, "timber")
    M.paint(side, u0, u1, z1, z1, "timber")


def _window(M, side, u, z):
    M.paint(side, u, u + 3, z, z + 3, "glass")
    M.paint(side, u + 1, u + 2, z + 1, z + 2, "magic_gold")   # 窓の明かり
    M.paint(side, u - 1, u + 4, z - 1, z - 1, "timber")


def house_a(pose="idle"):
    """小さな家（3x3 マス）: しっくいと木組み、スレートの破風屋根、棟の上の煙突。"""
    M = _m(52, 52, 46)
    c = 26
    X0, X1, Y0, Y1 = c - 20, c + 19, c - 17, c + 16
    M.box(X0, X1, Y0, Y1, 0, 15, "plaster")
    M.box(X0, X1, Y0, Y1, 0, 1, "stone")
    for side in ("front", "back"):
        _timber(M, side, X0, X1, 2, 15, every=8)
    for side in ("left", "right"):
        _timber(M, side, Y0, Y1, 2, 15, every=11)
    top = _gable_roof(M, X0, X1, Y0 - 3, Y1 + 3, 16, "slate", ridge="x")
    # 破風の三角は壁（しっくい）にする
    for k in range(0, 40):
        a, b = Y0 + k, Y1 - k
        if b < a:
            break
        M.box(X0, X0, a, b, 16 + k, 16 + k, "plaster")
        M.box(X1, X1, a, b, 16 + k, 16 + k, "plaster")
    M.box(c + 10, c + 13, c - 2, c + 1, 26, top + 4, "stone")      # 煙突（棟に乗せる）
    M.paint("top", c + 10, c + 13, c - 2, c + 1, "black")
    M.paint("front", c - 3, c + 2, 2, 10, "wood_dark")              # 扉
    M.paint("front", c + 1, c + 1, 6, 6, "brass")
    for u in (c - 15, c - 9, c + 6, c + 12):
        _window(M, "front", u, 7)
        _window(M, "back", u, 7)
    for u in (c - 10, c + 6):
        _window(M, "left", u, 8)
        _window(M, "right", u, 8)
    return M


def house_b(pose="idle"):
    """二階建ての家（4x3 マス）: 下は石、上は張り出した木組み、赤い寄棟屋根。"""
    M = _m(68, 52, 44)
    cx, cy = 34, 26
    X0, X1, Y0, Y1 = cx - 29, cx + 28, cy - 20, cy + 19
    M.box(X0, X1, Y0, Y1, 0, 11, "stone_warm")
    M.box(X0 - 1, X1 + 1, Y0 - 1, Y1 + 1, 12, 25, "plaster")    # 張り出した二階（壁全体なので棚にならない）
    for side in ("front", "back"):
        _timber(M, side, X0 - 1, X1 + 1, 12, 25, every=8)
    for side in ("left", "right"):
        _timber(M, side, Y0 - 1, Y1 + 1, 12, 25, every=7)
    bricks(M, "stone_warm", course=3, brick=6)
    k = 0
    while True:
        ax, bx = X0 - 2 + 2 * k, X1 + 2 - 2 * k
        ay, by = Y0 - 2 + 2 * k, Y1 + 2 - 2 * k
        if by - ay < 1 or bx - ax < 1:
            break
        M.box(ax, bx, ay, by, 26 + k, 26 + k, "roof_red", tone=-1 if k % 2 else 0)
        k += 1
    M.paint("front", cx - 3, cx + 2, 0, 8, "wood_dark")
    M.paint("front", cx + 1, cx + 1, 4, 4, "brass")
    for u in (cx - 24, cx - 14, cx + 9, cx + 19):
        _window(M, "front", u, 4)
        _window(M, "back", u, 4)
    for u in (cx - 24, cx - 14, cx - 2, cx + 9, cx + 19):
        _window(M, "front", u, 17)
        _window(M, "back", u, 17)
    for u in (cy - 13, cy + 8):
        _window(M, "left", u, 17)
        _window(M, "right", u, 17)
    return M


def house_c(pose="idle"):
    """長い広間（3x4 マス）: 石の壁、わらぶきの破風屋根（棟が奥行き方向）、前に看板。"""
    M = _m(52, 68, 40)
    cx, cy = 26, 34
    X0, X1, Y0, Y1 = cx - 20, cx + 19, cy - 28, cy + 27
    M.box(X0, X1, Y0, Y1, 0, 15, "stone")
    bricks(M, "stone", course=4, brick=8)
    _gable_roof(M, X0 - 3, X1 + 3, Y0, Y1, 16, "thatch", step=2, ridge="y")
    for k in range(0, 40):
        a, b = X0 + 2 * k, X1 - 2 * k
        if b < a:
            break
        # 破風の三角はしっくいに木組み（暗い木だけだと穴に見えた）
        M.box(a, b, Y0, Y0, 16 + k, 16 + k, "plaster")
        M.box(a, b, Y1, Y1, 16 + k, 16 + k, "plaster")
        for u in range(a, b + 1):
            if (u - X0) % 8 == 0 or k % 6 == 0:
                M.box(u, u, Y0, Y0, 16 + k, 16 + k, "timber")
                M.box(u, u, Y1, Y1, 16 + k, 16 + k, "timber")
    M.paint("front", cx - 5, cx + 4, 0, 11, "wood_dark")           # 両開きの扉
    M.paint("front", cx - 1, cx, 0, 11, "timber")
    M.paint("front", cx - 4, cx + 3, 13, 15, "plank")              # 看板（平らに）
    M.paint("front", cx - 2, cx + 1, 14, 14, "gold")
    for u in (cx - 15, cx + 11):
        _window(M, "front", u, 6)
    for u in (cy - 22, cy - 10, cy + 2, cy + 14):
        _window(M, "left", u, 7)
        _window(M, "right", u, 7)
    return M


# ---------------- 崩れた鐘楼 ----------------

def _lying_bell(M, bx, by, length, rmax, axis_dir=1):
    """横倒しの鐘。軸は x 方向。"""
    for i in range(length):
        f = i / (length - 1)
        r = rmax * (0.55 + 0.45 * f ** 1.6)
        if i >= length - 2:
            r = rmax + 0.6                       # 口の縁
        x = bx + i * axis_dir
        d = (M.cy[:, :, x] - (by + 0.5)) ** 2 + (M.cz[:, :, x] - rmax) ** 2
        mask = d <= r * r
        M.m[:, :, x][mask] = INDEX["bronze"]
        M.t[:, :, x][mask] = 0


def belltower_ruin(pose="idle"):
    """崩れた鐘楼（4x4 マス）: 上が斜めに崩れた四角い塔、中は空、前に落ちた大鐘。"""
    M = _m(66, 66, 70)
    C = 33
    T0, T1 = C - 16, C + 15            # 32 マスの四角い塔
    WT = 6                             # 壁の厚さ（偶数にして、高さを決める 2x2 の区切りとそろえる）
    rs = np.random.RandomState(7)
    jit = rs.randint(-1, 2, size=(32, 32))
    # 崩れた上の端は 2x2 の単位で高さを決める（1 ドットずつだと、上の数枚に細い筋が残り、
    # 回すと点滅する。台本の thin_runs が警告した）
    for x in range(T0, T1 + 1):
        for y in range(T0, T1 + 1):
            wall = x < T0 + WT or x > T1 - WT or y < T0 + WT or y > T1 - WT
            if not wall:
                continue
            bx, by = (x - T0) // 2 * 2, (y - T0) // 2 * 2
            h = 62 - bx * 0.45 - by * 0.6 + jit[bx // 2, by // 2]
            h = int(max(18, h))
            M.box(x, x, y, y, 0, h, "stone")
    M.box(T0 + WT, T1 - WT, T0 + WT, T1 - WT, 0, 2, "stone_dark")      # 中の床
    bricks(M, "stone", course=4, brick=8)
    # 角の控え壁（段々）
    for sx, sy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        x0 = T0 - 2 if sx < 0 else T1 - 3
        y0 = T0 - 2 if sy < 0 else T1 - 3
        M.box(x0, x0 + 5, y0, y0 + 5, 0, 12, "stone_warm")
        x1 = x0 + (1 if sx < 0 else 2)
        y1 = y0 + (1 if sy < 0 else 2)
        M.box(x1, x1 + 2, y1, y1 + 2, 13, 22, "stone_warm")
    # 鐘をつるした階の窓（崩れた上まで開ける。隙間は外へつながるように）と、入口
    u0, u1 = C - 6, C + 5      # 端を 2x2 の区切りにそろえる（ずれると 1 ドットの柱が残り、点滅した）
    M.box(u0, u1, T1 - WT + 1, T1, 40, 69, None)          # 前
    M.box(u0, u1, T0, T0 + WT - 1, 40, 69, None)          # 後ろ
    M.box(T0, T0 + WT - 1, u0, u1, 40, 69, None)          # 左
    M.box(T1 - WT + 1, T1, u0, u1, 40, 69, None)          # 右
    M.box(u0, u1, T1 - WT + 1, T1, 0, 13, None)           # 入口
    M.box(u0 + 1, u1 - 1, T1 - WT + 1, T1, 14, 14, None)
    # 壁の苔とつた
    M.paint("top", 0, 65, 0, 65, "moss")
    for u, z in ((T0 + 3, 6), (T0 + 20, 22), (T0 + 9, 32)):
        M.paint("front", u, u + 3, z, z + 6, "leaf")
        M.paint("left", u, u + 2, z + 3, z + 8, "leaf")
    # 崩れた石（どれも塔か控え壁に接する。離れると切り分けの台本に捨てられる）
    for (x, y, w, d, h) in ((T1 + 1, C + 2, 5, 4, 3), (T1 + 1, C - 8, 4, 5, 2), (C + 6, T1 + 1, 5, 3, 3),
                            (C - 12, T1 + 1, 4, 3, 2), (T0 - 3, C - 3, 3, 6, 3), (C - 3, T0 - 3, 6, 3, 2)):
        M.box(x, x + w - 1, y, y + d - 1, 0, h - 1, "stone")
    # 落ちた大鐘（塔の前の右に横たわる）
    _lying_bell(M, T1 - 8, T1 + 7, 16, 6.0)
    M.paint("top", T1 - 6, T1 + 6, T1 + 4, T1 + 9, "patina")
    M.paint("front", T1 + 1, T1 + 2, 2, 10, "black")                 # 割れ目
    speckle(M, "stone", 0.15, 1, 8)
    return M


# ---------------- 小物 ----------------

def fence(pose="idle"):
    M = _m(16, 16, 12)
    M.box(7, 8, 6, 9, 0, 10, "wood")       # 柱は真ん中に 1 本（隙間が外へつながるように）。奥行き 4（台本は 4 未満を引き伸ばす）
    M.box(0, 15, 7, 8, 3, 4, "wood")       # 横木は 2 ドット角
    M.box(0, 15, 7, 8, 7, 8, "wood")
    M.paint("top", 0, 15, 7, 8, "plank")
    M.box(7, 8, 7, 8, 11, 11, "wood_dark")
    return M


def grave(pose="idle"):
    M = _m(16, 16, 14)
    M.ell(8, 9, 0.0, 5.0, 6.0, 2.6, "dirt")
    M.box(4, 11, 3, 5, 0, 11, "stone")
    M.box(4, 4, 3, 5, 10, 11, None)
    M.box(11, 11, 3, 5, 10, 11, None)
    M.box(4, 4, 3, 5, 9, 9, None)
    M.box(11, 11, 3, 5, 9, 9, None)
    M.box(5, 5, 3, 5, 11, 11, None)
    M.box(10, 10, 3, 5, 11, 11, None)
    M.paint("front", 7, 8, 8, 9, "stone_dark")      # 鐘の印
    M.paint("front", 6, 9, 5, 7, "stone_dark")
    M.paint("front", 7, 8, 4, 4, "stone_dark")
    M.paint("top", 4, 7, 3, 5, "moss")
    return M


def crate(pose="idle"):
    M = _m(16, 16, 13)
    M.box(2, 13, 2, 13, 0, 11, "plank")
    for side in ("front", "back"):
        M.paint(side, 2, 13, 0, 0, "wood_dark")
        M.paint(side, 2, 13, 11, 11, "wood_dark")
        M.paint(side, 2, 2, 0, 11, "wood_dark")
        M.paint(side, 13, 13, 0, 11, "wood_dark")
        for i in range(1, 11):
            M.paint(side, 2 + i, 2 + i, i, i, "wood_dark")
    for side in ("left", "right"):
        M.paint(side, 2, 13, 0, 0, "wood_dark")
        M.paint(side, 2, 13, 11, 11, "wood_dark")
        M.paint(side, 2, 2, 0, 11, "wood_dark")
        M.paint(side, 13, 13, 0, 11, "wood_dark")
        for i in range(1, 11):
            M.paint(side, 13 - i, 13 - i, i, i, "wood_dark")
    for y in (5, 9):
        M.paint("top", 2, 13, y, y, "wood_dark")
    return M


def barrel(pose="idle"):
    M = _m(16, 16, 15)
    for z in range(0, 14):
        r = 4.6 + 0.9 * math.sin(math.pi * (z + 0.5) / 14)
        M.cone(8, 8, r, r, z, z, "wood")
    ang = np.arctan2(M.cy - 8, M.cx - 8)
    stave = (np.floor((ang + math.pi) / (2 * math.pi) * 12) % 2 == 0) & (M.m == INDEX["wood"])
    M.t[stave] = -1
    for z in (1, 2, 11, 12):
        sel = M.m[z] > 0
        M.m[z][sel] = INDEX["iron"]
        M.t[z][sel] = 0
    M.cone(8, 8, 4.4, 4.4, 13, 13, "wood_dark")
    return M


def chest(pose="idle"):
    M = _m(16, 16, 13)
    M.box(2, 13, 4, 11, 0, 5, "wood")
    for x in range(2, 14):
        for y in range(4, 12):
            for z in range(6, 11):
                if (y + 0.5 - 8.0) ** 2 + (z + 0.5 - 5.5) ** 2 <= 4.3 ** 2:
                    M.box(x, x, y, y, z, z, "wood")
    for x in (4, 5, 10, 11):
        for side in ("front", "back"):
            M.paint(side, x, x, 0, 12, "iron")
        M.paint("top", x, x, 0, 15, "iron")
    M.paint("front", 2, 13, 5, 5, "gold")
    M.paint("front", 7, 8, 5, 7, "gold")
    M.paint("front", 7, 8, 6, 6, "black")
    return M


def torch(pose="idle"):
    M = _m(8, 8, 19)
    M.box(2, 5, 2, 5, 0, 1, "iron")
    M.box(3, 4, 3, 4, 2, 11, "wood")
    M.box(2, 5, 2, 5, 12, 13, "iron")
    M.cone(4, 4, 2.0, 0.8, 14, 17, "fire")
    M.box(3, 4, 3, 4, 14, 15, "magic_gold")
    return M


def brazier(pose="idle"):
    M = _m(16, 16, 12)
    for a in (90, 210, 330):
        r = math.radians(a)
        bar(M, (rnd(7 + 2.5 * math.cos(r)), rnd(7 + 2.5 * math.sin(r)), 5),
            (rnd(7 + 5.0 * math.cos(r)), rnd(7 + 5.0 * math.sin(r)), 0), "iron")
    M.cone(8, 8, 3.2, 5.2, 5, 8, "iron")
    M.cone(8, 8, 4.3, 4.3, 8, 8, "ember")
    M.cone(8, 8, 3.2, 1.0, 9, 11, "fire")
    M.ell(6.5, 9.0, 9.5, 1.2, 1.2, 1.4, "magic_gold")
    return M


def bell_shard(pose="idle"):
    M = _m(14, 14, 6)
    C = 7
    for x in range(14):
        for y in range(14):
            dx, dy = x + 0.5 - C, y + 0.5 - (C - 5)
            d = math.hypot(dx, dy)
            a = math.degrees(math.atan2(dx, dy))
            if 4.0 <= d <= 7.0 and -42 <= a <= 42:
                z1 = 1 + (1 if a > 10 else 0) + (1 if a > 28 else 0)
                M.box(x, x, y, y, 0, z1, "bronze")
    M.paint("top", 0, 13, 0, 13, "patina")
    for x in range(14):
        for y in range(14):
            d = math.hypot(x + 0.5 - C, y + 0.5 - (C - 5))
            if 6.2 <= d <= 7.0:
                M.paint("top", x, x, y, y, "magic_gold")
    return M


def warp_pad(pose="idle"):
    M = _m(28, 28, 8)
    C = 14
    M.cyl(C, C, 12.0, 12.0, 0, 1, "stone")
    M.cyl(C, C, 9.5, 9.5, 2, 2, "stone_warm")
    for x in range(28):
        for y in range(28):
            d = math.hypot(x + 0.5 - C, y + 0.5 - C)
            a = math.degrees(math.atan2(y + 0.5 - C, x + 0.5 - C))
            if 6.5 <= d <= 8.0 and int((a + 180) // 20) % 2 == 0:
                M.paint("top", x, x, y, y, "magic_teal")
            if d <= 2.2:
                M.paint("top", x, x, y, y, "magic_teal")
    for a in (45, 135, 225, 315):
        r = math.radians(a)
        px, py = rnd(C - 1 + 9.6 * math.cos(r)), rnd(C - 1 + 9.6 * math.sin(r))
        M.box(px, px + 1, py, py + 1, 2, 5, "stone_dark")
        M.box(px, px + 1, py, py + 1, 6, 6, "magic_teal")
    return M


def wall_town(pose="idle"):
    M = _m(16, 16, 22)
    M.box(0, 15, 0, 15, 0, 17, "stone")
    bricks(M, "stone", course=3, brick=8)
    M.box(0, 15, 0, 15, 18, 18, "plaster")
    M.box(0, 5, 0, 15, 19, 21, "stone")
    M.box(10, 15, 0, 15, 19, 21, "stone")
    M.paint("top", 0, 15, 0, 15, "plaster")
    M.paint("front", 0, 15, 0, 0, "moss")
    M.paint("back", 0, 15, 0, 0, "moss")
    return M


def wall_dungeon(pose="idle"):
    M = _m(16, 16, 27)
    rs = np.random.RandomState(9)
    jit = rs.randint(0, 4, size=(8, 8))
    for x in range(16):
        for y in range(16):
            M.box(x, x, y, y, 0, 22 + jit[x // 2, y // 2], "stone_dark")   # 2x2 の単位（細い筋を作らない）
    bricks(M, "stone_dark", course=4, brick=8)
    speckle(M, "stone_dark", 0.08, 1, 10)
    M.paint("front", 2, 4, 1, 6, "moss")
    M.paint("left", 9, 12, 0, 3, "moss")
    return M


def door(pose="idle"):
    M = _m(16, 16, 22)
    M.box(0, 2, 0, 15, 0, 21, "stone")
    M.box(13, 15, 0, 15, 0, 21, "stone")
    M.box(0, 15, 0, 15, 17, 21, "stone")
    M.box(3, 3, 0, 15, 16, 16, "stone")
    M.box(12, 12, 0, 15, 16, 16, "stone")
    bricks(M, "stone", course=4, brick=8)
    M.box(3, 12, 6, 9, 0, 16, "wood_dark")
    M.box(4, 11, 6, 9, 16, 16, "wood_dark")
    for side in ("front", "back"):
        for x in (5, 8, 11):
            M.paint(side, x, x, 0, 15, "timber")
        M.paint(side, 3, 12, 4, 4, "iron")
        M.paint(side, 3, 12, 12, 12, "iron")
        M.paint(side, 9, 10, 8, 8, "brass")
    return M


PROPS = {
    "tree_oak": dict(build=tree_oak, footprint=[2, 2], round=True),
    "tree_pine": dict(build=tree_pine, footprint=[1, 1], round=True),
    "tree_dead": dict(build=tree_dead, footprint=[1, 1], fix=True),
    "rock_a": dict(build=rock_a, footprint=[1, 1], fix=True),
    "rock_b": dict(build=rock_b, footprint=[1, 1], fix=True),
    "house_a": dict(build=house_a, footprint=[3, 3], fix=True),
    "house_b": dict(build=house_b, footprint=[4, 3], fix=True),
    "house_c": dict(build=house_c, footprint=[3, 4], fix=True),
    "belltower_ruin": dict(build=belltower_ruin, footprint=[4, 4], fix=True),
    "fence": dict(build=fence, footprint=[1, 1]),
    "grave": dict(build=grave, footprint=[1, 1], fix=True),
    "crate": dict(build=crate, footprint=[1, 1]),
    "barrel": dict(build=barrel, footprint=[1, 1], round=True),
    "chest": dict(build=chest, footprint=[1, 1]),
    "torch": dict(build=torch, footprint=[1, 1]),
    "brazier": dict(build=brazier, footprint=[1, 1], round=True, fix=True),
    "bell_shard": dict(build=bell_shard, footprint=[1, 1]),
    "warp_pad": dict(build=warp_pad, footprint=[2, 2], round=True),
    "wall_town": dict(build=wall_town, footprint=[1, 1]),
    "wall_dungeon": dict(build=wall_dungeon, footprint=[1, 1], fix=True),
    "door": dict(build=door, footprint=[1, 1], fix=True),
}
