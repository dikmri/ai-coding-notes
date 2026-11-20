"""鐘なき王国: 職業 7 つの絵（待機・歩き 2・攻撃・呪文）と、転職の師範（色を変えた物）。

上から見ても職業が分かるように、頭と背中に目印を置く。
  冒険者: 背負い袋と丸めた毛布 / 剣士: 青い陣羽織の肩と前へ伸びる長剣 / 戦士: 丸い肩当てと斧の頭
  盗賊: 後ろへとがった頭巾と短剣 2 本 / 司祭: 白い衣と鐘の付いた杖 / ネクロマンサー: 暗い衣と骨の角
  モンク: 頭の上のまげと、布を巻いた大きな拳
"""

from __future__ import annotations

from shapes import POSES, bar, blade, cube, humanoid, rnd, weapon_dir

ACTOR_POSES = ["idle", "walk1", "walk2", "attack", "cast"]


def _orb(M, B, P, pose, mat):
    """呪文の姿勢: 両手の間に光の玉。"""
    if pose != "cast":
        return
    C = B.C
    M.ell(C, C + 5.0, 13.5, 1.6, 1.6, 1.6, mat)


# ---------------- 冒険者 ----------------

def _adv_back(M, B, P, pose):
    C = B.C
    M.box(C - 3, C + 2, C - 5, C - 3, 6, 11, "canvas")          # 背負い袋
    M.paint("top", C - 3, C + 2, C - 5, C - 3, "leather")        # ふた
    M.box(C - 1, C, C - 6, C - 6, 7, 8, "leather")               # 前ポケット（平らに）
    bar(M, (C - 5, C - 5, 12), (C + 3, C - 5, 12), "bedroll")    # 丸めた毛布
    M.paint("front", C - 3, C - 3, 8, 11, "belt")               # 肩ひも
    M.paint("front", C + 2, C + 2, 8, 11, "belt")


def _adv_weapon(M, B, P, hands, pose):
    blade(M, hands["rarm"], weapon_dir(pose), 7, "steel", "brass", guard=1)
    _orb(M, B, P, pose, "magic_blue")


def _adv_extra(M, B, P, hands, pose):
    C = B.C
    M.paint("front", C - 1, C, 9, 11, "linen")   # 胸元の開き


ADVENTURER = dict(
    torso="leather", sleeves="linen", legs="leather_dark", boots="boot",
    belt="belt", buckle="brass", hair="hair_black", hair_style="short",
    back=_adv_back, weapon=_adv_weapon, extra=_adv_extra,
)


# ---------------- 剣士 ----------------

def _sw_extra(M, B, P, hands, pose):
    C = B.C
    # 陣羽織: 肩の張り出し（2 ドットの厚さ）と、前後に垂れるすそ
    M.box(C - 6, C + 5, C - 2, C + 1, 10, 11, "tabard_blue")
    M.paint("top", C - 6, C + 5, C - 2, C + 1, "tabard_blue")
    M.box(C - 6, C + 5, C + 1, C + 1, 10, 11, "tabard_trim")   # 前の縁
    M.box(C - 3, C + 2, C - 3, C + 2, 3, 5, "tabard_blue")     # すそ
    M.box(C - 3, C + 2, C - 3, C + 2, 3, 3, "tabard_trim")
    M.paint("front", C - 1, C, 6, 9, "tabard_trim")            # 胸の帯
    M.paint("back", C - 1, C, 6, 9, "tabard_trim")
    # 額の鉢金
    M.paint("front", C - 3, C + 2, 16, 16, "steel")


def _sw_weapon(M, B, P, hands, pose):
    d = weapon_dir(pose)
    if pose in ("idle", "walk1", "walk2"):
        d = (0, 1, -0.45)
    blade(M, hands["rarm"], d, 11, "steel", "tabard_trim", guard=2)
    _orb(M, B, P, pose, "magic_blue")


SWORDSMAN = dict(
    torso="tabard_blue", sleeves="iron", hands="leather_dark", legs="leather_dark", boots="boot",
    hair="hair_black", hair_style="tail", extra=_sw_extra, weapon=_sw_weapon,
)


# ---------------- 戦士 ----------------

def _war_head(M, B, P, hz):
    C = B.C
    # 桶の形の兜: 頭の上半分を鉄にし、のぞき穴を黒く、てっぺんに赤い飾りの帯
    M.ell(C, C, hz + 0.3, 3.6, 3.6, 3.2, "iron", only=lambda m: m.cz > hz - 1.5)
    M.paint("front", C - 2, C + 1, 14, 14, "black")
    M.box(C - 1, C, C - 3, C + 2, 18, 19, "red_cloth")


def _war_weapon(M, B, P, hands, pose):
    hx, hy, hz = hands["rarm"]
    if pose == "attack":
        # 前へ振り下ろす: 柄を前へ、刃は下向き
        bar(M, (hx, hy - 1, hz), (hx, hy + 8, hz), "wood")
        M.box(hx, hx + 1, hy + 6, hy + 9, hz - 4, hz + 1, "steel")
        M.box(hx, hx + 1, hy + 6, hy + 6, hz - 4, hz + 1, "iron")
    elif pose == "cast":
        bar(M, (hx, hy, hz - 4), (hx, hy, hz + 6), "wood")
        M.box(hx + 2, hx + 4, hy - 1, hy + 2, hz + 3, hz + 7, "steel")
        _orb(M, B, P, pose, "ember")
    else:
        # 柄を立てて持つ。斧の頭は外側（+x）
        bar(M, (hx, hy, hz - 4), (hx, hy, hz + 7), "wood")
        M.box(hx + 2, hx + 4, hy - 1, hy + 2, hz + 4, hz + 8, "steel")
        M.box(hx + 4, hx + 4, hy - 2, hy + 3, hz + 4, hz + 8, "steel")
        M.box(hx + 2, hx + 2, hy - 1, hy + 2, hz + 4, hz + 8, "iron")


def _war_extra(M, B, P, hands, pose):
    C = B.C
    M.paint("front", C - 2, C + 1, 7, 10, "steel")     # 胸当て
    M.paint("back", C - 2, C + 1, 7, 10, "steel")
    M.box(C - 4, C + 3, C - 2, C + 1, 3, 5, "red_cloth")   # 腰の布


WARRIOR = dict(
    bulk=1, torso="iron", sleeves="iron", hands="leather_dark", legs="iron", boots="boot",
    belt="belt", buckle="brass", pauldrons="steel", hair="hair_brown",
    head=_war_head, weapon=_war_weapon, extra=_war_extra,
)


# ---------------- 盗賊 ----------------

def _rogue_head(M, B, P, hz):
    C = B.C
    # 頭巾: 頭をおおい、後ろへとがる。顔の前は暗い
    M.ell(C, C - 0.3, hz + 0.2, 3.7, 3.8, 3.3, "hood_green", only=lambda m: (m.cy < C + 1.6) | (m.cz > hz + 1.8))
    bar(M, (C - 1, C - 4, hz + 1), (C - 1, C - 6, hz - 1), "hood_green")
    M.paint("front", C - 2, C + 1, 12, 13, "hood_green")   # 口元の覆い
    M.paint("front", C - 2, C - 2, 14, 14, "white_dot")
    M.paint("front", C + 1, C + 1, 14, 14, "white_dot")


def _rogue_weapon(M, B, P, hands, pose):
    for side in ("rarm", "larm"):
        hx, hy, hz = hands[side]
        if pose == "attack":
            d = (0, 1, 0) if side == "rarm" else (0, 1, 0.3)
        elif pose == "cast":
            d = (0, 0.4, 1)
        else:
            d = (0, 0.3, -1)   # 逆手に持って下へ
        blade(M, (hx, hy, hz), d, 5, "steel", "iron", grip_mat="leather_dark", guard=0)
    if pose == "attack":
        hx, hy, hz = hands["larm"]
        bar(M, (hx, hy, hz), (hx + 1, hy + 4, hz + 1), "cloak_char")
    _orb(M, B, P, pose, "magic_purple")


def _rogue_extra(M, B, P, hands, pose):
    C = B.C
    M.box(C - 3, C + 2, C - 3, C - 3, 4, 11, "cloak_char")     # 背の短い外套
    M.box(B.tx0 - 1, B.tx0, C - 1, C, 5, 6, "leather")          # 腰の袋（平らに）
    M.box(B.tx1, B.tx1 + 1, C - 1, C, 5, 6, "leather")


ROGUE = dict(
    torso="cloak_char", sleeves="cloak_char", hands="leather_dark", legs="leather_dark", boots="boot",
    belt="leather", buckle="iron", head=_rogue_head, weapon=_rogue_weapon, extra=_rogue_extra,
)


# ---------------- 司祭 ----------------

def _priest_weapon(M, B, P, hands, pose):
    hx, hy, hz = hands["rarm"]
    sx = hx + 2
    if pose == "attack":
        # 杖を前へ突き出す
        bar(M, (hx, hy - 3, hz), (hx, hy + 9, hz), "wood")
        top = (hx, hy + 9, hz)
        M.box(hx - 1, hx + 2, hy + 10, hy + 11, hz, hz + 1, "gold")
        M.cone(hx + 1.0, hy + 11.0, 0.9, 2.3, hz - 3, hz - 1, "gold")
        return
    base_z = 0 if pose != "cast" else 4
    # まっすぐな杖、てっぺんに横木と鐘
    bar(M, (sx, hy, base_z), (sx, hy, base_z + 20), "wood")
    M.box(sx - 1, sx + 4, hy, hy + 1, base_z + 21, base_z + 22, "gold")
    M.cone(sx + 4.0, hy + 1.0, 2.4, 1.1, base_z + 17, base_z + 20, "gold")
    M.box(sx + 3, sx + 4, hy, hy + 1, base_z + 16, base_z + 16, "brass")
    _orb(M, B, P, pose, "magic_gold")


def _priest_extra(M, B, P, hands, pose):
    C = B.C
    M.paint("front", C - 1, C, 6, 11, "gold")     # 前の金の帯
    M.paint("back", C - 1, C, 6, 11, "gold")
    M.box(C - 3, C + 2, C - 2, C + 1, 11, 11, "gold")   # 襟


PRIEST = dict(
    torso="robe_white", sleeves="robe_white", legs="robe_white", boots="robe_white",
    robe="robe_white", robe_hem="gold", belt="gold", hair="hair_grey", hair_style="short",
    weapon=_priest_weapon, extra=_priest_extra,
)


# ---------------- ネクロマンサー ----------------

def _necro_head(M, B, P, hz):
    C = B.C
    M.ell(C, C - 0.3, hz + 0.2, 3.7, 3.8, 3.3, "robe_dark", only=lambda m: (m.cy < C + 1.6) | (m.cz > hz + 1.8))
    # 骨の角（頭巾の上の左右）
    bar(M, (C - 4, C - 1, 17), (C - 5, C - 2, 20), "bone")
    bar(M, (C + 2, C - 1, 17), (C + 3, C - 2, 20), "bone")


def _necro_weapon(M, B, P, hands, pose):
    hx, hy, hz = hands["rarm"]
    if pose == "attack":
        bar(M, (hx, hy - 1, hz), (hx, hy + 5, hz + 1), "bone")
        M.ell(hx + 1.0, hy + 7.0, hz + 2.0, 1.8, 1.8, 1.8, "bone")
        M.paint("front", hx, hx + 1, hz + 1, hz + 2, "eye_green")
        return
    if pose == "cast":
        _orb(M, B, P, pose, "magic_green")
        return
    # 骨の杖を立てて持つ、頭に小さなどくろ
    bar(M, (hx, hy, hz - 3), (hx, hy, hz + 8), "bone")
    M.ell(hx + 1.0, hy + 1.0, hz + 10.5, 1.9, 1.9, 1.8, "bone")
    M.paint("front", hx, hx + 1, hz + 10, hz + 10, "eye_green")


def _necro_extra(M, B, P, hands, pose):
    C = B.C
    # 肩の骨の飾りと、胸の肋骨の模様
    for sx in (B.lsh[0], B.rsh[0]):
        M.box(sx, sx + 1, C - 1, C, 12, 13, "bone")
    for z in (7, 9):
        M.paint("front", C - 2, C + 1, z, z, "bone")
    M.paint("front", C - 1, C, 6, 10, "bone_dark")
    M.box(C - 3, C + 2, C - 2, C + 1, 6, 6, "bone_dark")


NECROMANCER = dict(
    torso="robe_dark", sleeves="robe_dark", hands="skin_pale", skin="skin_pale",
    legs="robe_dark", boots="robe_dark", robe="robe_dark", robe_hem="bone_dark",
    eyes="eye_green", head=_necro_head, weapon=_necro_weapon, extra=_necro_extra,
)


# ---------------- モンク ----------------

def _monk_weapon(M, B, P, hands, pose):
    # 拳に布を巻いて大きく（3 ドット角）
    for side in ("rarm", "larm"):
        hx, hy, hz = hands[side]
        cube(M, hx - (1 if side == "larm" else 0), hy, hz, "wrap", 3)
    if pose == "attack":
        hx, hy, hz = hands["rarm"]
        cube(M, hx, hy + 1, hz, "wrap", 3)
    _orb(M, B, P, pose, "magic_gold")


def _monk_extra(M, B, P, hands, pose):
    C = B.C
    M.paint("front", C - 3, C + 2, 6, 6, "black")      # 黒い帯
    M.box(C - 3, C + 2, C - 2, C + 1, 6, 6, "black")
    M.paint("front", C - 1, C, 10, 11, "skin")         # 道着の合わせ目
    M.box(C - 2, C + 1, C + 2, C + 2, 11, 11, "wood_dark")  # 数珠（平らに）


MONK = dict(
    torso="gi_orange", sleeves="skin", hands="wrap", legs="gi_orange", boots="skin",
    hair_style="topknot", knot="hair_black", weapon=_monk_weapon, extra=_monk_extra,
)

CLASSES = {
    "adventurer": ADVENTURER,
    "swordsman": SWORDSMAN,
    "warrior": WARRIOR,
    "rogue": ROGUE,
    "priest": PRIEST,
    "necromancer": NECROMANCER,
    "monk": MONK,
}

# 転職の師範: 職業の絵の色を変え、年配に見えるよう髭を足す
MASTERS = {
    "npc_master_swordsman": ("swordsman", {"tabard_blue": "crimson", "hair_black": "hair_grey"}, "beard_grey"),
    "npc_master_warrior": ("warrior", {"steel": "brass", "iron": "stone_dark", "red_cloth": "crimson"}, None),
    "npc_master_rogue": ("rogue", {"hood_green": "robe_purple", "cloak_char": "hair_black"}, None),
    "npc_master_priest": ("priest", {"robe_white": "crimson"}, "beard_grey"),
    "npc_master_necromancer": ("necromancer", {"robe_dark": "hair_black", "eye_green": "eye_red"}, None),
    "npc_master_monk": ("monk", {"gi_orange": "red_cloth"}, "beard_grey"),
}


def build_class(cls: str, pose: str):
    M, B, hands = humanoid(CLASSES[cls], pose)
    return M


def build_master(npc_id: str, pose: str = "idle"):
    cls, mapping, beard = MASTERS[npc_id]
    spec = dict(CLASSES[cls])
    if beard:
        spec["beard"] = beard
    M, B, hands = humanoid(spec, pose)
    M.recolour(mapping)
    return M
