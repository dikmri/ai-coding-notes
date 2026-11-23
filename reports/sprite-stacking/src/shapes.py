"""鐘なき王国: 人型の組み立てと、よく使う形（2 ドット角の棒・武器）。"""

from __future__ import annotations

import math

from vox import Model


def rnd(v: float) -> int:
    return int(math.floor(v + 0.5))


def cube(M: Model, x, y, z, mat, w=2, d=None, h=None, tone=0):
    d = w if d is None else d
    h = w if h is None else h
    M.box(x, x + w - 1, y, y + d - 1, z, z + h - 1, mat, tone)


def bar(M: Model, a, b, mat, w=2, tone=0):
    """2 ドット角（w 角）の棒を a から b まで階段状に置く。a, b は角の最小の点。
    細い部分は 2 ドット以上（スキルの Lessons）を、形の側で守る。"""
    (x0, y0, z0), (x1, y1, z1) = a, b
    n = max(abs(x1 - x0), abs(y1 - y0), abs(z1 - z0), 1)
    for i in range(n + 1):
        f = i / n
        cube(M, rnd(x0 + (x1 - x0) * f), rnd(y0 + (y1 - y0) * f), rnd(z0 + (z1 - z0) * f), mat, w, tone=tone)


# ---------------- 姿勢 ----------------
# 足: 足先の前後のずれ。腕: 手の位置（肩からのずれ dx, dy と、手の高さ z）。
POSES = {
    "idle":   dict(lleg=0, rleg=0, larm=(0, 0, 5), rarm=(0, 0, 5), bob=0),
    "walk1":  dict(lleg=2, rleg=-2, larm=(0, -2, 6), rarm=(0, 2, 6), bob=0),
    "walk2":  dict(lleg=-2, rleg=2, larm=(0, 2, 6), rarm=(0, -2, 6), bob=0),
    "attack": dict(lleg=2, rleg=-1, larm=(0, -1, 7), rarm=(0, 5, 9), bob=0),
    "cast":   dict(lleg=0, rleg=0, larm=(1, 4, 12), rarm=(-1, 4, 12), bob=0),
}


class Body:
    """人型の骨組みの位置（角の最小の点）。"""

    def __init__(self, C: int, bulk=0, hunch=0):
        self.C = C
        self.bulk = bulk
        self.hunch = hunch
        tw = 6 + 2 * bulk
        self.tx0, self.tx1 = C - tw // 2, C + tw // 2 - 1
        self.ty0, self.ty1 = C - 2, C + 1
        self.lsh = (C - 5 - bulk, C - 1, 10)  # 左肩（-x）
        self.rsh = (C + 3 + bulk, C - 1, 10)  # 右肩（+x、武器の手）
        self.lleg_x = C - 3
        self.rleg_x = C + 1


def humanoid(spec: dict, pose: str, C=14, size=(28, 28, 34)) -> tuple[Model, Body, dict]:
    """服と体の色を spec から取り、姿勢 pose で人型を組む。武器は spec['weapon'](M, B, P, hands) で置く。
    spec['poses'] があれば、その姿勢の手足の位置を上書きする。"""
    M = Model(*size)
    M.centre = (C, C)
    P = dict(POSES[pose])
    P.update(spec.get("poses", {}).get(pose, {}))
    B = Body(C, spec.get("bulk", 0))
    skin = spec.get("skin", "skin")
    legs = spec.get("legs", "leather_dark")
    boots = spec.get("boots", "boot")
    torso = spec.get("torso", "linen")
    sleeves = spec.get("sleeves", torso)
    hands = spec.get("hands", skin)

    # 足（長い衣のときは、すその下から足先だけ出す）
    for side, x in (("lleg", B.lleg_x), ("rleg", B.rleg_x)):
        dy = P[side]
        hip = (x, C - 1, 4)
        foot = (x, C - 1 + dy, 0)
        bar(M, hip, foot, legs)
        cube(M, x, C - 1 + dy, 0, boots, 2, 2, 2)
        M.box(x, x + 1, C + 1 + dy, C + 1 + dy, 0, 0, boots)  # つま先

    robe = spec.get("robe")
    if robe:
        sway = 0 if pose in ("idle", "cast") else (1 if P["lleg"] > 0 else -1)
        for z in range(0, 8):
            r = 4.2 - z * 0.13
            M.cone(C + 0.0, C + 0.0 + (sway if z < 3 else 0), r, r, z, z, robe, ry_scale=0.82)
        if spec.get("robe_hem"):
            M.paint("front", 0, 40, 0, 0, spec["robe_hem"])
            M.paint("back", 0, 40, 0, 0, spec["robe_hem"])
            M.paint("left", 0, 40, 0, 0, spec["robe_hem"])
            M.paint("right", 0, 40, 0, 0, spec["robe_hem"])

    # 胴
    M.box(B.tx0, B.tx1, B.ty0, B.ty1, 6, 11, torso)
    if spec.get("skirt"):
        M.box(B.tx0, B.tx1, B.ty0, B.ty1, 3, 5, spec["skirt"])
    if spec.get("belt"):
        M.box(B.tx0, B.tx1, B.ty0, B.ty1, 6, 6, spec["belt"])
        if spec.get("buckle"):
            M.paint("front", C - 1, C, 6, 6, spec["buckle"])

    # 腕
    hands_at = {}
    for side, sh in (("larm", B.lsh), ("rarm", B.rsh)):
        dx, dy, hz = P[side]
        hand = (sh[0] + dx, sh[1] + dy, hz)
        bar(M, sh, hand, sleeves)
        cube(M, *hand, hands)
        hands_at[side] = hand
    if spec.get("pauldrons"):
        mat = spec["pauldrons"]
        for sh in (B.lsh, B.rsh):
            M.ell(sh[0] + 1.0, sh[1] + 1.0, 11.5, 2.2, 2.2, 1.6, mat)

    # 首と頭
    M.box(C - 1, C, C - 1, C, 12, 12, skin)
    hz = 15.0 + P["bob"]
    hr = spec.get("head_r", 3.4)
    M.ell(C, C, hz, hr, hr, 3.0, skin)
    hair = spec.get("hair")
    style = spec.get("hair_style", "short")
    if hair and style != "bald":
        # 後ろと上を髪にする（顔の前は残す）
        M.ell(C, C - 0.4, hz + 0.3, 3.5, 3.5, 3.1, hair, only=lambda m: (m.cy < C + 0.2) | (m.cz > hz + 1.6))
        if style == "long":
            M.box(C - 3, C + 2, C - 3, C - 2, 8, 13, hair)
        if style == "bun":
            cube(M, C - 1, C - 2, 18, hair)
        if style == "tail":
            bar(M, (C - 1, C - 4, 15), (C - 1, C - 5, 11), hair)
    if style == "topknot":
        cube(M, C - 1, C - 1, 18, spec.get("knot", "hair_black"))
    # 顔
    eye = spec.get("eyes", "black")
    M.paint("front", C - 2, C - 2, 14, 14, eye)
    M.paint("front", C + 1, C + 1, 14, 14, eye)
    if spec.get("beard"):
        M.paint("front", C - 2, C + 1, 12, 13, spec["beard"])
        M.box(C - 1, C, C + 3, C + 3, 11, 12, spec["beard"])

    head = spec.get("head")
    if head:
        head(M, B, P, hz)
    back = spec.get("back")
    if back:
        back(M, B, P, pose)
    weapon = spec.get("weapon")
    if weapon:
        weapon(M, B, P, hands_at, pose)
    extra = spec.get("extra")
    if extra:
        extra(M, B, P, hands_at, pose)
    return M, B, hands_at


# ---------------- 武器と持ち物 ----------------

def blade(M, hand, direc, length, blade_mat, guard_mat="brass", grip_mat="leather_dark", guard=2):
    """手の位置から direc 向きへ刃を置く。direc は (dx, dy, dz) の向き（長さは何でもよい）。"""
    dx, dy, dz = direc
    n = math.sqrt(dx * dx + dy * dy + dz * dz) or 1
    ux, uy, uz = dx / n, dy / n, dz / n
    hx, hy, hz = hand
    # 柄（手の中）と鍔
    gx, gy, gz = rnd(hx + ux * 2), rnd(hy + uy * 2), rnd(hz + uz * 2)
    if guard:
        if abs(ux) > 0.7:
            M.box(gx, gx + 1, gy - guard, gy + 1 + guard, gz, gz + 1, guard_mat)
        else:
            M.box(gx - guard, gx + 1 + guard, gy, gy + 1, gz, gz + 1, guard_mat)
    tip = (rnd(hx + ux * length), rnd(hy + uy * length), rnd(hz + uz * length))
    # 鍔が無いときは手に続けて刃を置く（1 ドットでも離れると、切り分けの台本が「ごみ」として捨てる）
    s = 3 if guard else 1.5
    bar(M, (rnd(hx + ux * s), rnd(hy + uy * s), rnd(hz + uz * s)), tip, blade_mat)
    return tip


def weapon_dir(pose: str, hand_side="rarm"):
    """武器の向き: 待機と歩きは前の下、攻撃は前へまっすぐ、呪文は上。"""
    if pose == "attack":
        return (0, 1, 0)
    if pose == "cast":
        return (0, 0.5, 1)
    return (0, 1, -0.55)
