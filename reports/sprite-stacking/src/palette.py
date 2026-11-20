"""鐘なき王国: すべての絵で共通の色の表。

素材ごとに「中間の色」を 1 つ決め、ramp() で 4 段の色にする。
  0: 深い影（青紫寄り）  1: 影（少し青寄り）  2: 中間（決めた色）  3: 明るい所（黄・橙寄り）
暗いゴシック調にするため、中間の色は彩度と明るさを抑えてある。

注意: 切り分けの台本は、白地から塗りつぶしで背景を抜く（許容 28）。
どの段の色も 3 つの成分が全部 222 以上にならないようにしてある（白い衣が背景として消えないように）。
"""

from __future__ import annotations

import colorsys

# 影は青紫（約 245 度）へ、明るい所は黄橙（約 40 度）へ色相をずらす
COOL_HUE = 0.68
WARM_HUE = 0.11

# 素材の中間の色（RGB）
BASE: dict[str, tuple[int, int, int]] = {
    # 人の体
    "skin": (196, 146, 112),
    "skin_dark": (150, 104, 74),
    "skin_pale": (176, 170, 150),      # 死人・魔女の肌
    "hair_brown": (104, 66, 42),
    "hair_black": (50, 44, 54),
    "hair_grey": (156, 150, 142),
    "hair_red": (138, 62, 40),
    "beard_grey": (170, 164, 154),
    # 布と革
    "linen": (178, 160, 124),          # 生成りの布
    "canvas": (104, 106, 66),          # 背負い袋（くすんだ緑の帆布）
    "leather": (124, 82, 50),          # 茶色の革
    "leather_dark": (78, 54, 40),      # こげ茶の革・ズボン
    "boot": (62, 46, 38),
    "belt": (70, 48, 34),
    "bedroll": (122, 58, 44),          # 丸めた毛布（赤茶）
    "tabard_blue": (52, 82, 138),      # 剣士の陣羽織
    "tabard_trim": (196, 170, 104),    # 陣羽織の縁（くすんだ金）
    "red_cloth": (132, 44, 40),
    "crimson": (150, 36, 52),
    "robe_white": (214, 208, 190),     # 司祭の衣
    "robe_dark": (58, 48, 70),         # ネクロマンサーの衣
    "robe_purple": (92, 50, 96),       # 侍祭の衣
    "robe_grey": (110, 118, 128),      # 霧の魔女
    "gi_orange": (192, 104, 42),       # モンクの道着
    "wrap": (200, 188, 160),           # 拳の布
    "hood_green": (56, 70, 58),        # 盗賊の頭巾
    "cloak_char": (60, 60, 66),        # 盗賊の外套
    "apron": (184, 172, 146),
    "dress_red": (110, 40, 48),
    "coat_brown": (98, 72, 54),
    "robe_teal": (44, 92, 98),         # ワープの番人
    "robe_moss": (82, 92, 62),         # 薬師
    "sash_purple": (110, 60, 140),     # 召喚された骨の印
    # 金属
    "steel": (150, 156, 168),
    "iron": (90, 94, 106),
    "rust": (122, 72, 46),
    "brass": (180, 140, 62),
    "gold": (200, 160, 60),
    "bronze": (146, 100, 54),
    "patina": (78, 130, 112),          # 青銅の緑青
    # 骨と死人
    "bone": (196, 186, 158),
    "bone_dark": (140, 128, 104),
    "ghoul": (120, 128, 132),          # 屍鬼の肌（灰青）
    "wight": (90, 104, 84),            # 沼の亡者
    "moss": (70, 96, 50),
    "spirit": (120, 170, 168),         # 霊の青緑
    # 獣
    "fur": (118, 96, 74),
    "fur_dark": (70, 58, 52),
    "feather": (46, 44, 58),
    "beak": (150, 132, 92),
    "toad": (86, 116, 58),
    "toad_belly": (184, 168, 102),
    "toad_spot": (96, 56, 92),
    "mud": (108, 86, 58),
    "clay": (140, 88, 60),
    "leech": (124, 54, 68),
    "flesh_red": (150, 52, 52),        # 口の中
    # 木と石
    "wood": (120, 84, 54),
    "wood_dark": (78, 56, 40),
    "plank": (140, 104, 68),
    "bark": (88, 66, 50),
    "bark_grey": (104, 100, 96),       # 枯れ木
    "leaf": (62, 96, 52),
    "leaf_dark": (44, 72, 46),
    "pine": (40, 76, 62),
    "stone": (128, 124, 118),
    "stone_dark": (84, 82, 90),
    "stone_warm": (142, 128, 108),
    "plaster": (178, 166, 140),
    "timber": (74, 54, 40),
    "slate": (66, 72, 92),
    "roof_red": (124, 58, 46),
    "thatch": (150, 124, 72),
    "glass": (70, 92, 110),
    # 床
    "grass": (76, 102, 54),
    "dirt": (110, 86, 60),
    "road": (130, 110, 82),
    "cobble": (118, 112, 106),
    "swamp": (68, 80, 54),
    "water": (44, 76, 100),
    "dungeon": (72, 70, 78),
    # 光る物（影を付けない）
    "eye_glow": (236, 196, 92),
    "eye_red": (220, 70, 60),
    "eye_green": (130, 220, 120),
    "fire": (236, 140, 48),
    "ember": (196, 70, 36),
    "magic_gold": (240, 200, 96),
    "magic_green": (120, 210, 120),
    "magic_teal": (80, 200, 190),
    "magic_blue": (110, 150, 230),
    "magic_purple": (170, 100, 220),
    # 目・口などの一番暗い色
    "black": (26, 22, 32),
    "white_dot": (214, 210, 200),      # 目の光・歯
}

# 光る物: 陰影の段を付けず、いつも明るい段を使う
EMISSIVE = {
    "eye_glow", "eye_red", "eye_green", "fire", "ember",
    "magic_gold", "magic_green", "magic_teal", "magic_blue", "magic_purple",
}
# 段を付けない物（目・口）
FLAT = {"black", "white_dot"}

# 光の外側を囲む線の色（画面の係が外形線を描くときに使う）
OUTLINE = (24, 20, 30)


def _toward(h: float, target: float, amt: float) -> float:
    d = ((target - h + 0.5) % 1.0) - 0.5
    step = max(-amt, min(amt, d))
    return (h + step) % 1.0


def _guard_white(rgb: tuple[int, int, int]) -> tuple[int, int, int]:
    """白地の背景抜き（許容 28）に巻き込まれないよう、全成分 222 以上を避ける。"""
    if min(rgb) >= 222:
        k = 221 / min(rgb)
        rgb = tuple(int(c * k) for c in rgb)
    return rgb


def ramp(rgb: tuple[int, int, int]) -> list[tuple[int, int, int]]:
    r, g, b = (c / 255 for c in rgb)
    h, s, v = colorsys.rgb_to_hsv(r, g, b)
    out = []
    # (寒色へのずれ, 彩度の足し, 明るさの倍率)
    steps = [
        (0.075, 0.12, 0.50),   # 深い影
        (0.035, 0.06, 0.72),   # 影
        (0.0, 0.0, 1.0),       # 中間
        (-0.045, -0.07, 1.20), # 明るい所（マイナスは暖色へ）
    ]
    for shift, ds, kv in steps:
        if shift > 0:
            hh = _toward(h, COOL_HUE, shift)
            ss = min(1.0, max(s, 0.16) + ds)
        elif shift < 0:
            hh = _toward(h, WARM_HUE, -shift)
            ss = max(0.0, max(s, 0.10) + ds)
        else:
            hh, ss = h, s
        vv = min(1.0, v * kv)
        rr, gg, bb = colorsys.hsv_to_rgb(hh, ss, vv)
        out.append(_guard_white((round(rr * 255), round(gg * 255), round(bb * 255))))
    return out


RAMPS: dict[str, list[tuple[int, int, int]]] = {}
for _name, _rgb in BASE.items():
    if _name in FLAT:
        RAMPS[_name] = [_rgb] * 4
    elif _name in EMISSIVE:
        rr = ramp(_rgb)
        RAMPS[_name] = [rr[2], rr[2], rr[3], rr[3]]
    else:
        RAMPS[_name] = ramp(_rgb)

# 素材の番号（0 は空）
NAMES: list[str] = list(BASE.keys())
INDEX: dict[str, int] = {n: i + 1 for i, n in enumerate(NAMES)}


def colour(name: str, tone: int) -> tuple[int, int, int]:
    return RAMPS[name][max(0, min(3, tone))]


def swatch(path) -> None:
    """色の表を 1 枚の画像にする（レポート用）。"""
    from PIL import Image, ImageDraw

    cols = 6
    cell_w, cell_h = 150, 22
    rows = (len(NAMES) + cols - 1) // cols
    im = Image.new("RGB", (cols * cell_w + 8, rows * cell_h + 8), (32, 30, 38))
    d = ImageDraw.Draw(im)
    for i, n in enumerate(NAMES):
        x = 4 + (i % cols) * cell_w
        y = 4 + (i // cols) * cell_h
        for k, c in enumerate(RAMPS[n]):
            d.rectangle([x + k * 14, y, x + k * 14 + 13, y + 17], fill=c)
        d.text((x + 60, y + 4), n, fill=(220, 214, 200))
    im.save(path)
