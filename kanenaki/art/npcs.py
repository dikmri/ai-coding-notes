"""鐘なき王国: 町の人の絵（待機だけ）。転職の師範は classes.py の MASTERS で作る。"""

from __future__ import annotations

from shapes import bar, cube, humanoid


def _hood(mat):
    def head(M, B, P, hz):
        C = B.C
        M.ell(C, C - 0.3, hz + 0.2, 3.7, 3.8, 3.3, mat, only=lambda m: (m.cy < C + 1.6) | (m.cz > hz + 1.8))
    return head


def innkeeper(pose="idle"):
    def extra(M, B, P, hands, pose):
        C = B.C
        M.paint("front", C - 2, C + 1, 1, 10, "apron")       # 前掛け
        hx, hy, hz = hands["rarm"]
        M.box(hx, hx + 1, hy + 1, hy + 2, hz, hz + 2, "wood")  # 木のジョッキ
        M.paint("top", hx, hx + 1, hy + 1, hy + 2, "linen")
    spec = dict(torso="dress_red", sleeves="linen", legs="dress_red", boots="dress_red",
                robe="dress_red", hair="hair_red", hair_style="bun", extra=extra,
                poses={"idle": dict(rarm=(0, 2, 7))})
    M, B, hands = humanoid(spec, pose)
    return M


def smith(pose="idle"):
    def weapon(M, B, P, hands, pose):
        hx, hy, hz = hands["rarm"]
        bar(M, (hx, hy, hz + 1), (hx, hy + 3, hz - 3), "wood")
        M.box(hx - 1, hx + 2, hy + 3, hy + 5, hz - 5, hz - 3, "iron")    # 金槌の頭
        C = B.C
        M.paint("front", C - 3, C + 2, 3, 11, "leather")      # 革の前掛け
    spec = dict(bulk=1, skin="skin_dark", torso="linen", sleeves="skin_dark", hands="skin_dark",
                legs="leather_dark", boots="boot", hair_style="bald", beard="hair_black", weapon=weapon)
    M, B, hands = humanoid(spec, pose)
    return M


def apothecary(pose="idle"):
    def head(M, B, P, hz):
        C = B.C
        M.cyl(C, C, 5.0, 5.0, 17, 17, "leather_dark")         # つばの広い帽子（2 ドットの厚さ）
        M.cyl(C, C, 5.0, 5.0, 18, 18, "leather_dark")
        M.cyl(C, C, 2.8, 2.8, 19, 21, "leather_dark")
        M.cyl(C, C, 2.9, 2.9, 19, 19, "red_cloth")
    def extra(M, B, P, hands, pose):
        C = B.C
        M.box(B.tx0 - 2, B.tx0 - 1, C - 1, C + 1, 4, 6, "leather")   # 肩掛けの袋（平らに）
        hx, hy, hz = hands["rarm"]
        M.box(hx, hx + 1, hy + 1, hy + 2, hz, hz + 2, "magic_green")  # 薬のびん
        M.box(hx, hx + 1, hy + 1, hy + 2, hz + 3, hz + 3, "glass")
    spec = dict(torso="robe_moss", sleeves="robe_moss", legs="robe_moss", boots="robe_moss",
                robe="robe_moss", robe_hem="leather_dark", hair="hair_brown", head=head, extra=extra,
                poses={"idle": dict(rarm=(0, 2, 7))})
    M, B, hands = humanoid(spec, pose)
    return M


def bellkeeper(pose="idle"):
    def extra(M, B, P, hands, pose):
        C = B.C
        M.paint("front", C - 2, C + 1, 9, 11, "beard_grey")    # 長いひげ
        hx, hy, hz = hands["rarm"]
        bar(M, (hx + 2, hy + 1, 0), (hx + 2, hy + 1, hz + 2), "wood")   # 杖
        M.box(hx, hx + 3, hy + 1, hy + 2, hz, hz + 1, "skin")
        lx, ly, lz = hands["larm"]
        M.cone(lx + 1.0, ly + 3.0, 2.0, 1.0, lz - 1, lz + 1, "brass")   # 手持ちの鐘
        M.box(lx, lx + 1, ly + 2, ly + 2, lz + 1, lz + 2, "wood")
    spec = dict(torso="coat_brown", sleeves="coat_brown", legs="coat_brown", boots="coat_brown",
                robe="coat_brown", robe_hem="leather_dark", hair="hair_grey", beard="beard_grey",
                extra=extra, poses={"idle": dict(larm=(0, 1, 7), rarm=(0, 1, 7))})
    M, B, hands = humanoid(spec, pose)
    return M


def warp_keeper(pose="idle"):
    def extra(M, B, P, hands, pose):
        hx, hy, hz = hands["rarm"]
        bar(M, (hx, hy + 1, hz), (hx, hy + 2, hz - 2), "iron")
        M.box(hx - 1, hx + 2, hy + 2, hy + 4, hz - 6, hz - 3, "iron")    # ランタン
        M.box(hx, hx + 1, hy + 2, hy + 4, hz - 5, hz - 4, "magic_teal")
        M.paint("front", hx - 1, hx + 2, hz - 5, hz - 4, "magic_teal")
        M.paint("left", hy + 2, hy + 4, hz - 5, hz - 4, "magic_teal")
        M.paint("right", hy + 2, hy + 4, hz - 5, hz - 4, "magic_teal")
    spec = dict(torso="robe_teal", sleeves="robe_teal", legs="robe_teal", boots="robe_teal",
                robe="robe_teal", robe_hem="magic_teal", head=_hood("robe_teal"), extra=extra,
                poses={"idle": dict(rarm=(0, 2, 8))})
    M, B, hands = humanoid(spec, pose)
    return M


NPCS = {
    "npc_innkeeper": innkeeper,
    "npc_smith": smith,
    "npc_apothecary": apothecary,
    "npc_bellkeeper": bellkeeper,
    "npc_warp": warp_keeper,
}
