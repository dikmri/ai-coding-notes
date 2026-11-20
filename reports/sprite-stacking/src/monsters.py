"""鐘なき王国: 魔物 15 種の絵（待機・歩き 2・攻撃）。

どれも既存のゲームの魔物の写しではなく、この世界（鐘が砕けた王国）に合わせて形を決めた。
  泥小鬼: 泥の体に骨の角が 1 本 / 屍鴉: 翼を広げた鴉 / 鐘楼の屍鬼: 割れた小さな鐘を兜にかぶる
  青銅の番兵: 鐘の印の大盾 / 鐘守りの亡者: 下半身が宙に浮く割れた大鐘、鐘の舌を槌にして持つ
"""

from __future__ import annotations

import math

from shapes import bar, blade, cube, humanoid, rnd
from vox import Model


def _m(W, L, H):
    M = Model(W, L, H)
    M.centre = (W // 2, L // 2)
    return M


STRIDE = {"idle": 0, "walk1": 2, "walk2": -2, "attack": 1}


# ---------------- 野良犬 ----------------

def stray_dog(pose):
    M = _m(28, 28, 16)
    C = 14
    lunge = 2 if pose == "attack" else 0
    s = STRIDE[pose] // 2 if pose != "attack" else 0
    M.ell(C, C + lunge * 0.5, 6.5, 2.6, 6.0, 2.4, "fur")
    M.paint("top", C - 1, C, 0, 27, "fur_dark")
    hz = 8.5 - (1.5 if pose == "attack" else 0)
    hy = C + 7 + lunge
    M.ell(C, hy, hz, 2.3, 2.6, 2.2, "fur")
    sz = rnd(hz) - 2
    M.box(C - 1, C, hy + 2, hy + 4, sz, sz + 1, "fur")          # 鼻づら
    M.paint("front", C - 1, C, sz + 1, sz + 1, "black")
    if pose == "attack":
        M.box(C - 1, C, hy + 1, hy + 4, sz - 2, sz - 2, "fur")  # 下あご
        M.box(C - 1, C, hy + 1, hy + 3, sz - 1, sz - 1, "flesh_red")
        M.paint("front", C - 1, C, sz - 1, sz - 1, "white_dot")
    for ex in (C - 3, C + 1):
        cube(M, ex, hy - 2, rnd(hz) + 1, "fur_dark")             # 耳
    M.paint("front", C - 2, C - 2, rnd(hz), rnd(hz), "eye_red")
    M.paint("front", C + 1, C + 1, rnd(hz), rnd(hz), "eye_red")
    # 足 4 本（対角の足が同じ向きに動く）
    legs = [(C - 3, C + 3, s), (C + 1, C + 3, -s), (C - 3, C - 5, -s), (C + 1, C - 5, s)]
    for lx, ly, dy in legs:
        if pose == "attack" and ly > C:
            dy = 2
        bar(M, (lx, ly, 4), (lx, ly + dy, 0), "fur")
        M.box(lx, lx + 1, ly + dy, ly + dy + 1, 0, 0, "fur_dark")
    bar(M, (C - 1, C - 6, 7), (C - 1, C - 9, 10 if pose != "attack" else 8), "fur_dark")  # しっぽ
    return M


# ---------------- 骨の兵たち ----------------

def _skull(M, B, P, hz):
    C = B.C
    M.paint("front", C - 1, C, 12, 12, "bone_dark")   # あご
    M.paint("front", C - 2, C + 1, 13, 13, "black")


def _ribs(M, B, P, hands, pose, sash=None):
    C = B.C
    for z in (7, 9, 11):
        M.paint("front", C - 2, C + 1, z, z, "bone_dark")
        M.paint("back", C - 2, C + 1, z, z, "bone_dark")
        M.paint("left", 0, 40, z, z, "bone_dark")
        M.paint("right", 0, 40, z, z, "bone_dark")
    if sash:
        for i, z in enumerate(range(6, 12)):
            M.paint("front", C - 2 + i // 2 * 1, C - 1 + i // 2, z, z, sash)
            M.paint("back", C - 2 + i // 2 * 1, C - 1 + i // 2, z, z, sash)


SKELETON = dict(
    bulk=-1, head_r=2.9, skin="bone", torso="bone", sleeves="bone", hands="bone", legs="bone",
    boots="bone_dark", hair=None, hair_style="bald", eyes="eye_red", head=_skull,
)


def _bs_weapon(M, B, P, hands, pose):
    d = (0, 1, 0) if pose == "attack" else (0, 1, -0.6)
    blade(M, hands["rarm"], d, 6, "rust", "iron", guard=1)
    # 左腕の丸い盾（外側の面に鉄の飾り）
    hx, hy, hz = hands["larm"]
    cy, cz = hy + 1.0, hz + 3.0
    for y in range(B.C - 6, B.C + 7):
        for z in range(0, 16):
            if (y + 0.5 - cy) ** 2 + (z + 0.5 - cz) ** 2 <= 3.6 ** 2:
                M.box(hx - 2, hx - 1, y, y, z, z, "wood")
    M.paint("left", rnd(cy) - 1, rnd(cy), rnd(cz) - 1, rnd(cz), "iron")
    M.paint("left", rnd(cy) - 3, rnd(cy) + 2, rnd(cz) + 3, rnd(cz) + 3, "rust")
    M.paint("left", rnd(cy) - 3, rnd(cy) + 2, rnd(cz) - 4, rnd(cz) - 4, "rust")


def _bs_head(M, B, P, hz):
    _skull(M, B, P, hz)
    C = B.C
    M.ell(C, C, hz + 0.6, 3.2, 3.2, 2.8, "rust", only=lambda m: m.cz > hz + 0.8)   # 錆びた半兜


def bone_soldier(pose):
    spec = dict(SKELETON, head=_bs_head, weapon=_bs_weapon,
                extra=lambda M, B, P, h, p: _ribs(M, B, P, h, p))
    M, B, hands = humanoid(spec, pose)
    return M


def _min_weapon(M, B, P, hands, pose):
    d = (0, 1, 0) if pose == "attack" else (0, 1, -0.6)
    blade(M, hands["rarm"], d, 7, "steel", "sash_purple", guard=1)


def minion_skeleton(pose):
    spec = dict(SKELETON, eyes="eye_green", weapon=_min_weapon,
                extra=lambda M, B, P, h, p: _ribs(M, B, P, h, p, sash="sash_purple"))
    M, B, hands = humanoid(spec, pose)
    return M


def _bow(M, hand, facing_fwd):
    """弓: 手を中心に、y-z 面の弧（2 ドットの太さ、弦は 1 ドットで点滅するので描かない）。"""
    hx, hy, hz = hand
    pts = []
    for a in range(-70, 71, 14):
        r = math.radians(a)
        y = hy + (2.6 * math.cos(r) - 2.0 if facing_fwd else 0) + (0 if facing_fwd else 2.6 * math.cos(r) - 2.0)
        z = hz + 6.0 * math.sin(r)
        pts.append((hx, rnd(y), rnd(z)))
    for a, b in zip(pts, pts[1:]):
        bar(M, a, b, "wood")


def _archer_weapon(M, B, P, hands, pose):
    C = B.C
    if pose == "attack":
        _bow(M, hands["larm"], True)
        hx, hy, hz = hands["larm"]
        rx, ry, rz = hands["rarm"]
        bar(M, (rx, ry, hz), (hx, hy + 3, hz), "wood")          # 矢
        cube(M, hx, hy + 3, hz, "steel")
    else:
        _bow(M, hands["larm"], True)
    # 背中の矢筒と矢羽
    bar(M, (C - 1, C - 4, 6), (C, C - 4, 12), "leather")
    M.box(C - 1, C + 1, C - 5, C - 4, 13, 14, "red_cloth")


def minion_skeleton_archer(pose):
    spec = dict(SKELETON, eyes="eye_green", weapon=_archer_weapon,
                extra=lambda M, B, P, h, p: _ribs(M, B, P, h, p, sash="sash_purple"),
                poses={"attack": dict(larm=(0, 5, 9), rarm=(-3, 0, 10), lleg=1, rleg=-1)})
    M, B, hands = humanoid(spec, pose)
    return M


# ---------------- 泥小鬼 ----------------

def _imp(pose, mat, belly):
    M = _m(24, 24, 18)
    C = 12
    s = STRIDE[pose]
    M.ell(C, C, 5.5, 3.6, 3.0, 3.2, mat)
    M.paint("front", C - 2, C + 1, 3, 6, belly)
    M.ell(C, C + 0.5, 10.5, 3.0, 2.8, 2.4, mat)
    M.box(C - 6, C - 4, C, C + 1, 10, 11, mat)            # 平たい耳
    M.box(C + 3, C + 5, C, C + 1, 10, 11, mat)
    M.paint("front", C - 2, C - 2, 11, 11, "eye_glow")
    M.paint("front", C + 1, C + 1, 11, 11, "eye_glow")
    M.paint("front", C - 2, C + 1, 9, 9, "black")
    M.paint("front", C - 1, C - 1, 9, 9, "white_dot")
    cube(M, C - 1, C - 1, 12, "bone")                      # 1 本の骨の角
    cube(M, C - 1, C - 1, 14, "bone_dark")
    for lx, dy in ((C - 3, s // 2), (C + 1, -s // 2)):
        bar(M, (lx, C - 1, 3), (lx, C - 1 + dy, 0), mat)
        M.box(lx, lx + 1, C - 1 + dy, C + 1 + dy, 0, 0, "mud" if mat != "mud" else "clay")
    return M, C


def _imp_arms(M, C, mat, pose, s):
    lh = (C - 6, C - 1 - s // 2, 2)
    rh = (C + 4, C - 1 + s // 2, 2)
    if pose == "attack":
        rh = (C + 4, C - 2, 13)
    bar(M, (C - 5, C - 1, 7), lh, mat)
    bar(M, (C + 3, C - 1, 7), rh, mat)
    return lh, rh


def mud_imp(pose):
    M, C = _imp(pose, "mud", "clay")
    lh, rh = _imp_arms(M, C, "mud", pose, STRIDE[pose])
    x, y, z = rh
    if pose == "attack":
        bar(M, (x, y, z), (x, y + 2, z + 4), "wood")            # こん棒を振り上げる
        M.ell(x + 1.0, y + 3.0, z + 5.5, 1.7, 1.7, 1.7, "wood_dark")
    else:
        bar(M, (x, y, z), (x, y + 4, z + 1), "wood")
        M.ell(x + 1.0, y + 5.5, z + 2.0, 1.7, 1.7, 1.7, "wood_dark")
    for (px, py) in ((C - 3, C - 2), (C + 2, C + 1)):
        M.paint("top", px, px + 1, py, py + 1, "moss")
    return M


def mud_imp_slinger(pose):
    M, C = _imp(pose, "clay", "linen")
    M.paint("front", C - 3, C + 2, 12, 12, "leaf")          # 葉の鉢巻き
    M.paint("back", C - 3, C + 2, 12, 12, "leaf")
    M.paint("left", 0, 23, 12, 12, "leaf")
    M.paint("right", 0, 23, 12, 12, "leaf")
    M.box(C - 6, C - 5, C - 1, C + 1, 3, 5, "canvas")        # 石の袋（平らに）
    lh, rh = _imp_arms(M, C, "clay", pose, STRIDE[pose])
    x, y, z = rh
    if pose == "attack":
        bar(M, (x, y, z), (x, y - 3, z + 2), "leather")        # 投石ひもを後ろへ回す
        cube(M, x, y - 5, z + 2, "stone")
    else:
        bar(M, (x, y, z + 1), (x, y + 1, z - 1), "leather")
        cube(M, x, y + 1, 0, "stone")
    return M


# ---------------- 屍鴉 ----------------

def carrion_crow(pose):
    M = _m(30, 30, 20)
    C = 15
    lift = {"idle": 0, "walk1": 5, "walk2": -4, "attack": 2}[pose]
    dive = pose == "attack"
    bz = 10 if not dive else 8
    M.ell(C, C, bz, 2.0, 4.0, 2.0, "feather")
    hy = C + 4.5 + (1 if dive else 0)
    hzz = bz + (1.0 if not dive else -1.0)
    M.ell(C, hy, hzz, 1.9, 1.9, 1.9, "feather")
    bar(M, (C - 1, rnd(hy) + 1, rnd(hzz) - 1), (C - 1, rnd(hy) + 3, rnd(hzz) - (1 if not dive else 2)), "beak")
    M.paint("left", rnd(hy) - 1, rnd(hy), rnd(hzz), rnd(hzz), "eye_red")
    M.paint("right", rnd(hy) - 1, rnd(hy), rnd(hzz), rnd(hzz), "eye_red")
    M.box(C - 2, C + 1, C - 7, C - 4, bz - 1, bz, "feather")    # 尾羽
    M.box(C - 2, C - 2, C - 8, C - 8, bz - 1, bz, "feather")
    M.box(C + 1, C + 1, C - 8, C - 8, bz - 1, bz, "feather")
    sweep = 3 if dive else 0
    for side in (-1, 1):
        for i in range(1, 10):     # 翼の端から端で約 22 ドット（人の 2 倍弱）
            x = C + 1 + i if side > 0 else C - 2 - i
            z = rnd(bz - 1 + lift * (i / 9) ** 1.3)
            yb = C - 2 - (1 if i % 2 == 0 and i > 4 else 0) - rnd(sweep * i / 9)
            yf = C + 3 - i // 3 - rnd(sweep * i / 9)
            if yf < yb + 1:
                yf = yb + 1
            M.box(x, x, yb, yf, z, z + 1, "feather")
    # 足（攻撃では前へ突き出す）
    if dive:
        bar(M, (C - 1, C + 1, bz - 2), (C - 1, C + 4, bz - 5), "bone_dark")
    else:
        cube(M, C - 1, C, bz - 3, "bone_dark")
    return M


# ---------------- 沼の亡者 ----------------

def bog_wight(pose):
    M = _m(32, 32, 26)
    C = 16
    s = STRIDE[pose]
    for lx, dy in ((C - 4, s), (C + 1, -s)):
        bar(M, (lx, C - 1, 7), (lx, C - 1 + dy, 0), "wight", w=3)
        M.box(lx, lx + 2, C - 1 + dy, C + 2 + dy, 0, 0, "wight")
    M.ell(C, C + 1, 12, 5.0, 3.6, 5.0, "wight")
    M.ell(C, C - 1.5, 15, 4.0, 3.0, 3.0, "wight")
    M.paint("top", 0, 31, 0, 31, "moss")
    for z in (9, 11, 13):
        M.paint("left", 0, 31, z, z, "bone_dark")
        M.paint("right", 0, 31, z, z, "bone_dark")
    hy, hz = C + 4.5, 15.5
    M.ell(C, hy, hz, 2.7, 2.7, 2.6, "wight")
    M.paint("front", C - 2, C - 2, 16, 16, "eye_glow")
    M.paint("front", C + 1, C + 1, 16, 16, "eye_glow")
    M.paint("front", C - 1, C, 14, 14, "black")
    if pose == "attack":
        lh, rh = (C - 6, C + 6, 14), (C + 4, C + 6, 14)
    else:
        lh, rh = (C - 8, C + 1 - s, 3), (C + 6, C + 1 + s, 3)
    for sh, h in (((C - 7, C, 15), lh), ((C + 5, C, 15), rh)):
        bar(M, sh, h, "wight")
        bar(M, (h[0], h[1] + 1, h[2] - 1), (h[0], h[1] + 3, h[2] - 2), "bone")   # 爪
        bar(M, (sh[0], sh[1] - 1, sh[2] - 1), (sh[0], sh[1] - 2, sh[2] - 6), "moss")  # 垂れた藻
    return M


# ---------------- 毒蛙 ----------------

def venom_toad(pose):
    M = _m(28, 28, 16)
    C = 14
    dz = {"idle": 0, "walk1": -1, "walk2": 2, "attack": 0}[pose]
    M.ell(C, C, 4.5 + dz, 5.0, 5.0, 3.4, "toad")
    M.paint("front", C - 3, C + 2, 1 + dz, 3 + dz, "toad_belly")
    for px, py in ((C - 3, C - 3), (C + 1, C - 1), (C - 2, C + 1), (C + 2, C - 4)):
        M.paint("top", px, px + 1, py, py + 1, "toad_spot")
    for ex in (C - 4, C + 2):
        cube(M, ex, C + 1, 7 + dz, "toad")
    M.paint("front", C - 4, C - 3, 8 + dz, 8 + dz, "eye_glow")
    M.paint("front", C + 2, C + 3, 8 + dz, 8 + dz, "eye_glow")
    if pose == "attack":
        M.paint("front", C - 3, C + 2, 3, 4, "flesh_red")
        bar(M, (C - 1, C + 4, 3), (C - 1, C + 7, 4), "flesh_red")
        M.ell(C, C + 9.0, 5.0, 1.8, 1.8, 1.8, "magic_green")
    else:
        M.paint("front", C - 3, C + 2, 3 + dz, 3 + dz, "black")
    for side in (-1, 1):
        bx = C - 6 if side < 0 else C + 4
        if pose == "walk2":
            bar(M, (bx, C - 2, 3), (bx, C - 7, 0), "toad")      # 跳ぶ: 後ろ足を伸ばす
        else:
            M.ell(bx + 1.0, C - 1.0, 2.5 + max(0, dz), 2.0, 3.2, 2.2, "toad")
        fx = C - 5 if side < 0 else C + 3
        bar(M, (fx, C + 3, 3 + max(dz, 0)), (fx + (-1 if side < 0 else 1), C + 4, 0), "toad")
    return M


# ---------------- 霧の魔女 ----------------

def mist_witch(pose):
    M = _m(30, 30, 32)
    C = 15
    f = {"idle": 3, "walk1": 4, "walk2": 3, "attack": 3}[pose]
    sway = {"idle": 0, "walk1": 1, "walk2": -1, "attack": -1}[pose]
    for z in range(f, f + 11):
        r = 4.6 - (z - f) * 0.2
        M.cone(C, C + (sway if z < f + 4 else 0), r, r, z, z, "robe_grey")
    for x in range(C - 5, C + 5):            # ぼろぼろのすそ
        for y in range(C - 5, C + 5):
            if (x * 3 + y) % 4 == 0:
                M.box(x, x, y, y, f, f, None)
    bar(M, (C - 4, C + 1, f), (C - 5, C + 2, 0), "spirit")   # 地へ垂れる霧
    bar(M, (C + 2, C - 3, f), (C + 3, C - 4, 0), "spirit")
    M.box(C - 2, C + 1, C - 2, C + 1, f + 10, f + 14, "robe_grey")
    hz = f + 17.0
    M.ell(C, C, hz, 2.7, 2.7, 2.7, "skin_pale")
    M.ell(C, C - 0.3, hz + 0.4, 3.0, 3.0, 2.9, "robe_grey", only=lambda m: (m.cy < C + 0.6) | (m.cz > hz + 1.2))
    M.box(C - 2, C + 1, C - 3, C - 2, f + 11, f + 17, "hair_grey")
    for tx, ty, dzz in ((C - 3, C - 1, 0), (C - 1, C - 2, 1), (C + 1, C - 1, 0)):
        cube(M, tx, ty, rnd(hz) + 2 + dzz, "bark_grey")     # とげの冠
    M.paint("front", C - 2, C - 2, rnd(hz), rnd(hz), "magic_teal")
    M.paint("front", C + 1, C + 1, rnd(hz), rnd(hz), "magic_teal")
    lh = (C - 5, C + 1, f + 8)
    rh = (C + 3, C + 1, f + 9) if pose != "attack" else (C + 3, C + 6, f + 12)
    bar(M, (C - 4, C - 1, f + 14), lh, "robe_grey")
    bar(M, (C + 2, C - 1, f + 14), rh, "robe_grey")
    cube(M, *lh, "skin_pale")
    cube(M, *rh, "skin_pale")
    x, y, z = rh
    if pose == "attack":
        bar(M, (x, y - 2, z - 1), (x, y + 6, z + 1), "bark_grey")
        M.ell(x + 1.0, y + 8.5, z + 2.0, 2.2, 2.2, 2.2, "magic_teal")
    else:
        bar(M, (x + 2, y, 0), (x + 2, y + 1, z + 4), "bark_grey")
        bar(M, (x + 2, y + 1, z + 4), (x + 3, y + 2, z + 8), "bark_grey")
        M.ell(x + 4.0, y + 3.0, z + 10.5, 1.8, 1.8, 1.8, "magic_teal")
        M.box(x, x + 2, y, y + 1, z, z + 1, "skin_pale")
    return M


# ---------------- 吸い蛭の群れ ----------------

def leech_swarm(pose):
    M = _m(26, 26, 10)
    C = 13
    # 群れをつなぐ、ぬれた泥の水たまり（離れた部品は切り分けの台本に捨てられる）
    M.cyl(C, C, 7.5, 6.5, 0, 0, "swamp", tone=-1)
    ph = {"idle": 0, "walk1": 1, "walk2": -1, "attack": 0}[pose]
    leeches = [(C - 6, C - 3, 0), (C + 1, C - 5, 1), (C + 3, C + 1, 0), (C - 3, C + 2, 1), (C - 1, C - 1, 0)]
    for i, (x, y, horiz) in enumerate(leeches):
        rear = pose == "attack" and i in (2, 3)
        if rear:
            bar(M, (x, y, 1), (x, y + 1, 5), "leech")
            cube(M, x, y + 2, 5, "flesh_red")
            continue
        w = ph * (1 if i % 2 else -1)
        if horiz:
            pts = [(x, y, 1), (x + 2, y + w, 1), (x + 4, y, 1)]
        else:
            pts = [(x, y, 1), (x + w, y + 2, 1), (x, y + 4, 1)]
        for a, b in zip(pts, pts[1:]):
            bar(M, a, b, "leech")
        hx, hy, _ = pts[-1]
        cube(M, hx, hy, 1, "flesh_red", 2, 2, 1)
    return M


# ---------------- 鐘楼の屍鬼 ----------------

def _ghoul_head(M, B, P, hz):
    C = B.C
    M.cone(C, C, 3.8, 2.6, 13, 18, "bronze")         # 割れた小さな鐘をかぶる
    cube(M, C - 1, C - 1, 19, "bronze")
    M.paint("top", C - 3, C + 2, C - 3, C + 2, "patina", depth=1)
    M.paint("top", C - 1, C, C - 1, C, "bronze")
    for z, x in ((18, C), (17, C - 1), (16, C), (15, C + 1)):
        M.paint("front", x, x, z, z, "black")        # ひび
    M.box(C - 4, C + 3, C - 4, C + 3, 13, 13, None)
    M.cone(C, C, 4.0, 4.0, 13, 13, "brass")
    M.paint("front", C - 2, C - 2, 12, 12, "eye_glow")
    M.paint("front", C + 1, C + 1, 12, 12, "eye_glow")


def _ghoul_claws(M, B, P, hands, pose):
    for side in ("larm", "rarm"):
        hx, hy, hz = hands[side]
        d = 1 if pose == "attack" else 0
        bar(M, (hx, hy + 1, hz), (hx, hy + 3, hz - 1 + d), "bone")
    C = B.C
    M.box(C - 3, C + 2, C - 2, C + 1, 3, 5, "leather_dark")    # ぼろ布
    for x in range(C - 3, C + 3, 2):
        M.box(x, x, C - 2, C + 1, 3, 3, None)


def bell_ghoul(pose):
    spec = dict(bulk=-1, skin="ghoul", torso="ghoul", sleeves="ghoul", hands="ghoul", legs="ghoul",
                boots="ghoul", hair=None, hair_style="bald", eyes="black", head=_ghoul_head,
                weapon=_ghoul_claws,
                poses={"attack": dict(larm=(1, 5, 9), rarm=(-1, 5, 9), lleg=1, rleg=-1)})
    M, B, hands = humanoid(spec, pose)
    C = B.C
    for z in (8, 10):
        M.paint("left", 0, 30, z, z, "bone_dark")
        M.paint("right", 0, 30, z, z, "bone_dark")
    return M


# ---------------- 呪われた侍祭 ----------------

def _aco_head(M, B, P, hz):
    C = B.C
    M.ell(C, C - 0.3, hz + 0.2, 3.7, 3.8, 3.3, "robe_purple", only=lambda m: (m.cy < C + 1.6) | (m.cz > hz + 1.8))
    bar(M, (C - 1, C - 1, 18), (C - 1, C - 2, 21), "robe_purple")    # 上へとがる頭巾
    M.paint("front", C - 2, C + 1, 12, 16, "black")
    M.paint("front", C - 2, C - 2, 14, 14, "eye_red")
    M.paint("front", C + 1, C + 1, 14, 14, "eye_red")


def _censer(M, B, P, hands, pose):
    hx, hy, hz = hands["rarm"]
    if pose == "attack":
        bar(M, (hx, hy, hz), (hx, hy + 4, hz), "iron")
        M.ell(hx + 1.0, hy + 6.5, hz + 1.0, 1.9, 1.9, 1.9, "brass")
        M.paint("top", hx, hx + 1, hy + 6, hy + 7, "magic_green")
    else:
        bar(M, (hx, hy, hz - 1), (hx, hy + 1, hz - 3), "iron")
        M.ell(hx + 1.0, hy + 2.0, hz - 4.0, 1.9, 1.9, 1.9, "brass")
        M.paint("top", hx, hx + 1, hy + 1, hy + 2, "magic_green")
    C = B.C
    M.paint("front", C - 3, C + 2, 6, 6, "linen")


def cursed_acolyte(pose):
    spec = dict(torso="robe_purple", sleeves="robe_purple", hands="skin_pale", skin="skin_pale",
                legs="robe_purple", boots="robe_purple", robe="robe_purple", robe_hem="crimson",
                head=_aco_head, weapon=_censer)
    M, B, hands = humanoid(spec, pose)
    return M


# ---------------- 青銅の番兵 ----------------

def bronze_sentinel(pose):
    M = _m(34, 34, 30)
    C = 17
    s = STRIDE[pose]
    for lx, dy in ((C - 4, s), (C + 1, -s)):
        bar(M, (lx, C - 1, 7), (lx, C - 1 + dy, 0), "bronze", w=3)
        M.box(lx, lx + 2, C - 2 + dy, C + 3 + dy, 0, 1, "iron")
    M.box(C - 4, C + 3, C - 2, C + 1, 7, 8, "iron")
    M.box(C - 5, C + 4, C - 3, C + 2, 9, 16, "bronze")
    M.paint("front", C - 3, C + 2, 11, 14, "patina")
    M.paint("front", C - 1, C, 12, 13, "gold")
    M.paint("back", C - 4, C - 2, 10, 13, "patina")
    for sx in (C - 8, C + 5):
        M.box(sx, sx + 2, C - 3, C + 2, 15, 17, "bronze")
        M.paint("top", sx, sx + 2, C - 3, C + 2, "patina")
    M.box(C - 2, C + 1, C - 2, C + 1, 17, 21, "bronze")
    M.paint("front", C - 2, C + 1, 19, 19, "eye_glow")
    M.box(C - 1, C, C - 3, C + 2, 22, 23, "patina")
    if pose == "attack":
        lh, rh = (C - 9, C, 8), (C + 6, C + 5, 12)
    else:
        lh, rh = (C - 9, C - s // 2, 7), (C + 6, C + s // 2, 7)
    bar(M, (C - 8, C - 1, 14), lh, "bronze", w=3)
    bar(M, (C + 5, C - 1, 14), rh, "bronze", w=3)
    # 大盾（左）: 外の面に鐘の印
    lx, ly, lz = lh
    M.box(lx - 2, lx - 1, ly - 3, ly + 4, 2, 15, "bronze")
    M.paint("left", ly - 3, ly + 4, 15, 15, "patina")
    M.paint("left", ly - 3, ly + 4, 2, 2, "patina")
    for z, (a, b) in zip(range(6, 12), ((0, 1), (-1, 2), (-1, 2), (-1, 2), (0, 1), (0, 1))):
        M.paint("left", ly + a, ly + b, z, z, "gold")
    # 鉄の槌
    x, y, z = rh
    if pose == "attack":
        bar(M, (x, y, z), (x, y + 6, z - 6), "iron")
        M.ell(x + 1.0, y + 8.0, z - 6.0, 2.3, 2.3, 2.3, "iron")
    else:
        bar(M, (x, y, z + 1), (x, y + 4, z - 4), "iron")
        M.ell(x + 1.0, y + 6.0, z - 4.0, 2.3, 2.3, 2.3, "iron")
    return M


# ---------------- 鐘守りの亡者（ボス） ----------------

def bell_warden(pose):
    M = _m(56, 56, 48)
    C = 28
    h = {"idle": 3, "walk1": 4, "walk2": 3, "attack": 2}[pose]
    # 下半身: 口を下に向けて浮く、割れた大鐘
    prof = [(0, 12.0), (1, 12.0), (2, 11.0), (4, 10.2), (7, 9.2), (10, 8.4), (13, 7.8), (15, 7.4),
            (17, 6.6), (18, 5.8), (19, 4.6), (20, 3.0)]
    for (z0, r0), (z1, r1) in zip(prof, prof[1:]):
        M.cone(C, C, r0, r1, h + z0, h + z1 - 1, "bronze")
    M.cone(C, C, 12.0, 12.0, h, h + 1, "brass")
    for x0, y0 in ((C - 8, C - 3), (C + 4, C + 2), (C - 2, C - 9), (C + 6, C - 6)):
        M.paint("top", x0, x0 + 3, y0, y0 + 2, "patina")
    for k, x in enumerate((C - 3, C + 5)):
        for z in range(h + 3, h + 17):
            M.paint("front", x + (z // 3) % 2, x + (z // 3) % 2, z, z, "black")
    for z in range(h + 4, h + 15):
        M.paint("left", C + (z // 3) % 2, C + (z // 3) % 2, z, z, "black")
    # 鎖（鐘の縁から地へ）
    sw = {"idle": 0, "walk1": 2, "walk2": -2, "attack": 0}[pose]
    bar(M, (C - 11, C - 1, h + 5), (C - 12, C - 1 + sw, 0), "iron")
    bar(M, (C + 9, C - 1, h + 5), (C + 10, C - 1 - sw, 0), "iron")
    # 上半身: 霊の胴と骨
    tz = h + 25
    M.ell(C, C, tz, 5.5, 3.8, 6.0, "spirit")
    for z in (tz - 3, tz - 1, tz + 1):
        M.paint("front", C - 3, C + 2, z, z, "bone")
    M.paint("front", C - 1, C, tz - 4, tz + 2, "bone_dark")
    # 肩のぼろの外套
    M.ell(C, C - 1, tz + 4.5, 8.5, 5.0, 2.6, "robe_dark")
    M.box(C - 7, C + 6, C - 5, C - 4, tz - 6, tz + 4, "robe_dark")
    for x in range(C - 7, C + 7, 3):
        M.box(x, x, C - 5, C - 4, tz - 6, tz - 5, None)
    # 頭: どくろと、鐘のかけらの冠
    hz = tz + 10.0
    M.ell(C, C + 1, hz, 3.2, 3.2, 3.4, "bone")
    M.paint("front", C - 2, C - 1, rnd(hz), rnd(hz), "eye_glow")
    M.paint("front", C + 1, C + 2, rnd(hz), rnd(hz), "eye_glow")
    M.paint("front", C - 1, C + 1, rnd(hz) - 2, rnd(hz) - 2, "black")
    for a in range(0, 360, 72):
        r = math.radians(a + 18)
        bx, by = C - 1 + 2.6 * math.cos(r), C + 2.6 * math.sin(r)
        bar(M, (rnd(bx), rnd(by), rnd(hz) + 2), (rnd(bx + 1.2 * math.cos(r)), rnd(by + 1.2 * math.sin(r)), rnd(hz) + 5), "bronze")
    # 腕と、鐘の舌の槌
    if pose == "attack":
        lh, rh = (C - 3, C + 9, tz - 2), (C + 2, C + 9, tz - 2)
    else:
        lh = (C - 11, C + 1 - sw, tz - 10)
        rh = (C + 9, C + 2 + sw, tz - 9)
    bar(M, (C - 8, C - 1, tz + 3), lh, "spirit", w=3)
    bar(M, (C + 6, C - 1, tz + 3), rh, "spirit", w=3)
    cube(M, *lh, "bone", 3)
    cube(M, *rh, "bone", 3)
    x, y, z = rh
    if pose == "attack":
        bar(M, (x - 2, y, z), (x - 2, y + 12, 3), "iron", w=3)       # 前へ叩きつける
        M.ell(x - 0.5, y + 14.0, 4.0, 3.6, 3.6, 3.6, "iron")
        M.cone(x - 0.5, y + 14.0, 3.7, 3.7, 4, 4, "bronze")
    else:
        bar(M, (x, y, z), (x + 3, y + 7, 3), "iron", w=3)
        M.ell(x + 4.5, y + 9.0, 4.0, 3.6, 3.6, 3.6, "iron")
        M.cone(x + 4.5, y + 9.0, 3.7, 3.7, 4, 4, "bronze")
    return M


MONSTERS = {
    "stray_dog": dict(build=stray_dog, footprint=[1, 1]),
    "bone_soldier": dict(build=bone_soldier, footprint=[1, 1]),
    "mud_imp": dict(build=mud_imp, footprint=[1, 1]),
    "mud_imp_slinger": dict(build=mud_imp_slinger, footprint=[1, 1]),
    "carrion_crow": dict(build=carrion_crow, footprint=[1, 1], fly=8),
    "bog_wight": dict(build=bog_wight, footprint=[1, 1]),
    "venom_toad": dict(build=venom_toad, footprint=[1, 1]),
    "mist_witch": dict(build=mist_witch, footprint=[1, 1]),
    "leech_swarm": dict(build=leech_swarm, footprint=[1, 1]),
    "bell_ghoul": dict(build=bell_ghoul, footprint=[1, 1]),
    "cursed_acolyte": dict(build=cursed_acolyte, footprint=[1, 1]),
    "bronze_sentinel": dict(build=bronze_sentinel, footprint=[1, 1]),
    "bell_warden": dict(build=bell_warden, footprint=[2, 2]),
    "minion_skeleton": dict(build=minion_skeleton, footprint=[1, 1]),
    "minion_skeleton_archer": dict(build=minion_skeleton_archer, footprint=[1, 1]),
}
