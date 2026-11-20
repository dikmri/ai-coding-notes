"""場面を組み立てて build/scene*.blend に保存する。

使い方: blender -b --factory-startup -P scripts/build_scene.py -- [--no-scans]
--no-scans: Poly Haven の素材を使わず、手続きのテクスチャ・形・空に替える。
"""
import bpy
import bmesh
import json
import math
import os
import random
import sys
import time
from mathutils import Vector, Matrix, Euler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import timeline as T  # noqa: E402
from common import ROOT, ASSETS, BUILD, SEED, log  # noqa: E402

ARGV = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
SCANS = "--no-scans" not in ARGV
TAG = "scans" if SCANS else "noscans"
MANIFEST = None
if SCANS:
    with open(os.path.join(ASSETS, "manifest.json"), encoding="utf-8") as f:
        MANIFEST = json.load(f)

R = random.Random(SEED)
SKY_STRENGTH = 0.45
HAZE_DENSITY = 0.0006
LOT_WEEDS = []
FOLDED = []
CROW_DIP = 0.025  # 鳥が止まった所で電線が下がる量
TREE_TIPS = []  # 柿の木の小枝の先（舞い落ちる葉の出発点）
HOUSE_UNITS = []  # 室外機を付ける家（足元の外壁）
t_start = time.time()

# ------------------------------------------------------------------ 初期化
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = "neko"
COLL = scene.collection


def link(ob, coll=None):
    (coll or COLL).objects.link(ob)
    return ob


# ------------------------------------------------------------------ ノードの小道具
class NB:
    def __init__(self, tree):
        self.t = tree
        self.n = tree.nodes
        self.l = tree.links

    def add(self, kind, x=0, y=0, **props):
        nd = self.n.new(kind)
        nd.location = (x, y)
        for k, v in props.items():
            setattr(nd, k, v)
        return nd

    def ln(self, a, b):
        self.l.new(a, b)

    def val(self, v):
        nd = self.add("ShaderNodeValue")
        nd.outputs[0].default_value = v
        return nd.outputs[0]

    def math(self, op, a, b=None, c=None, clamp=False):
        nd = self.add("ShaderNodeMath", operation=op, use_clamp=clamp)
        for i, v in enumerate((a, b, c)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                nd.inputs[i].default_value = v
            else:
                self.ln(v, nd.inputs[i])
        return nd.outputs[0]

    def mix(self, fac, a, b, blend="MIX"):
        nd = self.add("ShaderNodeMix", data_type="RGBA", blend_type=blend)
        for sock, v in ((nd.inputs[0], fac), (nd.inputs[6], a), (nd.inputs[7], b)):
            if isinstance(v, (int, float)):
                sock.default_value = v
            elif isinstance(v, tuple):
                sock.default_value = (*v, 1.0) if len(v) == 3 else v
            else:
                self.ln(v, sock)
        return nd.outputs[2]

    def noise(self, vec, scale, detail=4.0, rough=0.55, dims="3D"):
        nd = self.add("ShaderNodeTexNoise", noise_dimensions=dims)
        nd.inputs["Scale"].default_value = scale
        nd.inputs["Detail"].default_value = detail
        nd.inputs["Roughness"].default_value = rough
        if vec is not None:
            self.ln(vec, nd.inputs["Vector"])
        return nd

    def ramp(self, fac, stops):
        nd = self.add("ShaderNodeValToRGB")
        cr = nd.color_ramp
        while len(cr.elements) < len(stops):
            cr.elements.new(0.5)
        for el, (p, c) in zip(cr.elements, stops):
            el.position = p
            el.color = (*c, 1.0) if len(c) == 3 else c
        self.ln(fac, nd.inputs[0])
        return nd.outputs[0]


def new_mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nb = NB(m.node_tree)
    bsdf = nb.n["Principled BSDF"]
    return m, nb, bsdf


def setin(sock, v, nb):
    if isinstance(v, (int, float)):
        sock.default_value = v
    elif isinstance(v, tuple):
        sock.default_value = (*v, 1.0) if len(v) == 3 and sock.type == "RGBA" else v
    else:
        nb.ln(v, sock)


def load_img(rel, noncolor):
    p = os.path.join(ASSETS, rel)
    img = bpy.data.images.load(p, check_existing=True)
    img.colorspace_settings.name = "Non-Color" if noncolor else "sRGB"
    return img


# 写真スキャンのテクスチャ id と、手続きの代わりの作り方
SCAN_TEX = {
    "asphalt": "asphalt_02",
    "concrete": "rough_concrete",
    "stucco": "white_stucco_02",
    "beige": "beige_wall_002",
    "roof": "grey_roof_tiles",
    "tin": "worn_corrugated_iron",
    "plank": "weathered_plank_siding",
    "dirt": "raked_dirt",
}


def surface(name, kind, tint=(1, 1, 1), rough_mul=1.0, nor=1.0, size=None, attr_tint=False,
            macro=0.25, extra=None, metallic=0.0, grime=0.0, desat=0.0):
    """面の材質。写真スキャン（UV＝メートル）か、手続きのテクスチャ。"""
    m, nb, b = new_mat(name)
    uv = nb.add("ShaderNodeTexCoord", -900, 0).outputs["UV"]
    obj = nb.add("ShaderNodeTexCoord", -900, -300).outputs["Object"]
    if SCANS:
        tid = SCAN_TEX[kind]
        info = MANIFEST["textures"][tid]
        sx, sy = size or info["size_m"]
        mp = nb.add("ShaderNodeMapping", -700, 0)
        mp.inputs["Scale"].default_value = (1.0 / sx, 1.0 / sy, 1.0)
        nb.ln(uv, mp.inputs["Vector"])
        d = nb.add("ShaderNodeTexImage", -450, 200, image=load_img(info["maps"]["Diffuse"], False))
        r = nb.add("ShaderNodeTexImage", -450, -50, image=load_img(info["maps"]["Rough"], True))
        n = nb.add("ShaderNodeTexImage", -450, -300, image=load_img(info["maps"]["nor_gl"], True))
        for t in (d, r, n):
            nb.ln(mp.outputs[0], t.inputs[0])
        col = d.outputs["Color"]
        rough = r.outputs["Color"]
        nm = nb.add("ShaderNodeNormalMap", -150, -300)
        nm.inputs["Strength"].default_value = nor
        nb.ln(n.outputs["Color"], nm.inputs["Color"])
        normal = nm.outputs[0]
        height = None
    else:
        col, rough, height = procedural(nb, kind, obj, uv)
        normal = None
    if desat > 0:
        hs = nb.add("ShaderNodeHueSaturation")
        hs.inputs["Saturation"].default_value = 1.0 - desat
        nb.ln(col, hs.inputs["Color"])
        col = hs.outputs[0]
    # 大きな色むら（タイルの繰り返しを目立たなくする）
    if macro > 0:
        mn = nb.noise(obj, 0.35, 3.0, 0.5)
        f = nb.math("MULTIPLY_ADD", mn.outputs["Fac"], macro * 2.0, 1.0 - macro)
        col = _mul_scalar(nb, col, f)
    col = nb.mix(1.0, col, tint, "MULTIPLY")
    if grime > 0:
        # 雨だれの縦すじと、地面に近いほどの汚れ
        mp2 = nb.add("ShaderNodeMapping")
        mp2.inputs["Scale"].default_value = (7.0, 7.0, 0.55)
        nb.ln(obj, mp2.inputs["Vector"])
        gn = nb.noise(mp2.outputs[0], 1.0, 6, 0.6)
        mr = nb.add("ShaderNodeMapRange", interpolation_type="SMOOTHERSTEP")
        mr.inputs["From Min"].default_value = 0.45
        mr.inputs["From Max"].default_value = 0.78
        nb.ln(gn.outputs["Fac"], mr.inputs["Value"])
        g = nb.math("MULTIPLY_ADD", mr.outputs[0], -grime, 1.0)
        col = _mul_scalar(nb, col, g)
    if attr_tint:
        at = nb.add("ShaderNodeAttribute", -450, 450, attribute_name="col")
        col = nb.mix(1.0, col, at.outputs["Color"], "MULTIPLY")
    if extra:
        col, rough, normal = extra(nb, col, rough, normal, obj, uv)
    setin(b.inputs["Base Color"], col, nb)
    if isinstance(rough, (int, float)):
        b.inputs["Roughness"].default_value = rough * rough_mul
    else:
        rr = nb.math("MULTIPLY", rough, rough_mul, clamp=True)
        nb.ln(rr, b.inputs["Roughness"])
    b.inputs["Metallic"].default_value = metallic
    if height is not None:
        bump = nb.add("ShaderNodeBump", -150, -300)
        bump.inputs["Strength"].default_value = 0.6 * nor
        bump.inputs["Distance"].default_value = 0.01
        nb.ln(height, bump.inputs["Height"])
        if normal is not None:
            nb.ln(normal, bump.inputs["Normal"])
        normal = bump.outputs[0]
    if normal is not None:
        nb.ln(normal, b.inputs["Normal"])
    return m


def _mul_scalar(nb, col, f):
    nd = nb.add("ShaderNodeMix", data_type="RGBA", blend_type="MULTIPLY")
    nd.inputs[0].default_value = 1.0
    nb.ln(col, nd.inputs[6])
    cc = nb.add("ShaderNodeCombineColor")
    for i in range(3):
        nb.ln(f, cc.inputs[i])
    nb.ln(cc.outputs[0], nd.inputs[7])
    return nd.outputs[2]


def procedural(nb, kind, obj, uv):
    """写真スキャンを使わないときの材質（色・粗さ・高さ）。"""
    if kind == "asphalt":
        n1 = nb.noise(obj, 3.0, 8, 0.6)
        vo = nb.add("ShaderNodeTexVoronoi")
        vo.inputs["Scale"].default_value = 180.0
        nb.ln(obj, vo.inputs["Vector"])
        speck = nb.math("POWER", vo.outputs["Distance"], 3.0)
        base = nb.ramp(n1.outputs["Fac"], [(0.3, (0.06, 0.06, 0.06)), (0.7, (0.13, 0.13, 0.125))])
        col = nb.mix(nb.math("MULTIPLY", speck, 4.0, clamp=True), base, (0.25, 0.25, 0.24))
        rough = nb.math("MULTIPLY_ADD", n1.outputs["Fac"], 0.2, 0.75)
        h = nb.math("ADD", n1.outputs["Fac"], nb.math("MULTIPLY", vo.outputs["Distance"], 0.5))
        return col, rough, h
    if kind in ("concrete",):
        n1 = nb.noise(obj, 6.0, 8, 0.6)
        n2 = nb.noise(obj, 60.0, 4, 0.5)
        col = nb.ramp(n1.outputs["Fac"], [(0.3, (0.32, 0.31, 0.29)), (0.7, (0.47, 0.46, 0.43))])
        col = nb.mix(0.25, col, n2.outputs["Color"], "OVERLAY")
        return col, 0.85, nb.math("ADD", n1.outputs["Fac"], n2.outputs["Fac"])
    if kind in ("stucco", "beige"):
        n1 = nb.noise(obj, 40.0, 6, 0.7)
        n2 = nb.noise(obj, 2.0, 4, 0.5)
        c0 = (0.70, 0.68, 0.62) if kind == "stucco" else (0.72, 0.63, 0.50)
        col = nb.ramp(n2.outputs["Fac"], [(0.35, tuple(v * 0.85 for v in c0)), (0.65, c0)])
        return col, 0.9, n1.outputs["Fac"]
    if kind == "roof":
        # 瓦: 段（v 方向）と山（u 方向）
        sep = nb.add("ShaderNodeSeparateXYZ")
        nb.ln(uv, sep.inputs[0])
        rows = nb.math("FRACT", nb.math("MULTIPLY", sep.outputs[1], 1 / 0.24))
        lobes = nb.math("SINE", nb.math("MULTIPLY", sep.outputs[0], 2 * math.pi / 0.30))
        h = nb.math("ADD", rows, nb.math("MULTIPLY", lobes, 0.35))
        n1 = nb.noise(obj, 8.0, 4, 0.5)
        col = nb.ramp(n1.outputs["Fac"], [(0.3, (0.10, 0.11, 0.12)), (0.7, (0.20, 0.21, 0.22))])
        return col, 0.5, h
    if kind == "tin":
        sep = nb.add("ShaderNodeSeparateXYZ")
        nb.ln(uv, sep.inputs[0])
        h = nb.math("SINE", nb.math("MULTIPLY", sep.outputs[0], 2 * math.pi / 0.076))
        n1 = nb.noise(obj, 3.0, 8, 0.65)
        col = nb.ramp(n1.outputs["Fac"], [(0.45, (0.42, 0.42, 0.40)), (0.62, (0.30, 0.17, 0.08))])
        return col, nb.math("MULTIPLY_ADD", n1.outputs["Fac"], 0.5, 0.35), h
    if kind == "plank":
        sep = nb.add("ShaderNodeSeparateXYZ")
        nb.ln(uv, sep.inputs[0])
        boards = nb.math("FRACT", nb.math("MULTIPLY", sep.outputs[1], 1 / 0.18))
        groove = nb.math("SMOOTH_MIN", boards, 0.06, 0.05)
        n1 = nb.noise(obj, 25.0, 6, 0.6)
        col = nb.ramp(n1.outputs["Fac"], [(0.3, (0.07, 0.05, 0.035)), (0.7, (0.16, 0.12, 0.08))])
        return col, 0.8, nb.math("ADD", groove, nb.math("MULTIPLY", n1.outputs["Fac"], 0.2))
    if kind == "dirt":
        n1 = nb.noise(obj, 4.0, 8, 0.65)
        n2 = nb.noise(obj, 50.0, 4, 0.6)
        col = nb.ramp(n1.outputs["Fac"], [(0.3, (0.13, 0.09, 0.06)), (0.7, (0.25, 0.19, 0.13))])
        col = nb.mix(0.3, col, n2.outputs["Color"], "OVERLAY")
        return col, 0.95, nb.math("ADD", n1.outputs["Fac"], n2.outputs["Fac"])
    raise ValueError(kind)


def simple(name, color, rough=0.5, metallic=0.0, emission=None, estr=0.0, alpha=1.0, coat=0.0,
           noise_amt=0.0, transmission=0.0):
    m, nb, b = new_mat(name)
    setin(b.inputs["Base Color"], color, nb)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metallic
    b.inputs["Coat Weight"].default_value = coat
    b.inputs["Transmission Weight"].default_value = transmission
    if emission:
        b.inputs["Emission Color"].default_value = (*emission, 1.0)
        b.inputs["Emission Strength"].default_value = estr
    if alpha < 1.0:
        b.inputs["Alpha"].default_value = alpha
    return m


# ------------------------------------------------------------------ 材質
M = {}
M["asphalt"] = surface("asphalt", "asphalt", tint=(0.92, 0.92, 0.95), nor=1.0, macro=0.22)
M["concrete"] = surface("concrete", "concrete", tint=(0.95, 0.94, 0.92), nor=0.9, macro=0.18)
def block_extra(nb, col, rough, normal, obj, uv, joints=False):
    """ブロックの細かい肌理・上からの雨だれ・根元のこけ。joints=True なら目地も材質で描く（遠くの塀）。"""
    sep = nb.add("ShaderNodeSeparateXYZ")
    nb.ln(obj, sep.inputs[0])
    fine = nb.noise(obj, 420.0, 3, 0.6)
    mp = nb.add("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (30.0, 30.0, 1.2)
    nb.ln(obj, mp.inputs["Vector"])
    st = nb.noise(mp.outputs[0], 1.0, 4, 0.55)
    top = nb.add("ShaderNodeMapRange")
    top.inputs["From Min"].default_value = 0.35
    top.inputs["From Max"].default_value = 1.15
    nb.ln(sep.outputs[2], top.inputs["Value"])
    streak = nb.math("MULTIPLY", nb.math("GREATER_THAN", st.outputs["Fac"], 0.56), top.outputs[0])
    col = _mul_scalar(nb, col, nb.math("MULTIPLY_ADD", streak, -0.35, 1.0))
    moss_n = nb.noise(obj, 6.0, 5, 0.6)
    low = nb.add("ShaderNodeMapRange")
    low.inputs["From Min"].default_value = 0.30
    low.inputs["From Max"].default_value = 0.02
    nb.ln(sep.outputs[2], low.inputs["Value"])
    moss = nb.math("MULTIPLY", low.outputs[0], nb.math("GREATER_THAN", moss_n.outputs["Fac"], 0.47))
    col = nb.mix(nb.math("MULTIPLY", moss, 0.7), col, (0.10, 0.13, 0.05))
    h = nb.math("MULTIPLY", fine.outputs["Fac"], 1.0)
    if joints:
        br = nb.add("ShaderNodeTexBrick")
        br.offset = 0.5
        br.inputs["Scale"].default_value = 1.0
        br.inputs["Brick Width"].default_value = 0.4
        br.inputs["Row Height"].default_value = 0.2
        br.inputs["Mortar Size"].default_value = 0.01
        br.inputs["Mortar Smooth"].default_value = 0.1
        br.inputs["Color1"].default_value = (1, 1, 1, 1)
        br.inputs["Color2"].default_value = (0.94, 0.94, 0.94, 1)
        br.inputs["Mortar"].default_value = (1.18, 1.18, 1.18, 1)
        nb.ln(uv, br.inputs["Vector"])
        col = nb.mix(1.0, col, br.outputs["Color"], "MULTIPLY")
        h = nb.math("ADD", h, nb.math("MULTIPLY", br.outputs["Fac"], -3.0))
    bump = nb.add("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.15
    bump.inputs["Distance"].default_value = 0.002
    nb.ln(h, bump.inputs["Height"])
    if normal is not None:
        nb.ln(normal, bump.inputs["Normal"])
    return col, rough, bump.outputs[0]


M["block"] = surface("block", "concrete", tint=(0.98, 0.98, 0.98), nor=0.35, attr_tint=True, macro=0.10, size=(0.45, 0.45),
                     grime=0.15, desat=0.9, extra=block_extra)
M["mortar"] = surface("mortar", "concrete", tint=(1.12, 1.12, 1.10), nor=0.3, macro=0.1, size=(0.5, 0.5), desat=0.9)
M["cap"] = surface("cap", "concrete", tint=(0.85, 0.85, 0.84), nor=0.4, attr_tint=True, macro=0.25, size=(0.9, 0.9), desat=0.8)
M["lid"] = surface("lid", "concrete", tint=(0.86, 0.86, 0.84), nor=1.0, attr_tint=True, macro=0.2, size=(1.0, 1.0))
M["pole"] = surface("pole", "concrete", tint=(0.98, 0.98, 0.97), nor=0.5, macro=0.15, size=(1.5, 1.5))
M["dirt"] = surface("dirt", "dirt", tint=(1.0, 0.82, 0.62), nor=1.0, macro=0.3)
M["tin"] = surface("tin", "tin", tint=(0.95, 0.95, 0.95), nor=1.0, macro=0.15, metallic=0.3)
M["plank"] = surface("plank", "plank", tint=(0.55, 0.45, 0.38), nor=1.0, macro=0.15)
M["roof"] = surface("roof", "roof", tint=(0.55, 0.58, 0.62), nor=1.0, macro=0.2, rough_mul=0.8)
M["roof2"] = surface("roof2", "roof", tint=(0.40, 0.44, 0.52), nor=1.0, macro=0.2, rough_mul=0.7)
M["roof3"] = surface("roof3", "roof", tint=(0.55, 0.40, 0.33), nor=1.0, macro=0.2, rough_mul=0.8)


def siding_extra(nb, col, rough, normal, obj, uv):
    """窯業系サイディングの横の溝（0.18 m ごと）。"""
    sep = nb.add("ShaderNodeSeparateXYZ")
    nb.ln(obj, sep.inputs[0])
    fr = nb.math("FRACT", nb.math("MULTIPLY", sep.outputs[2], 1 / 0.18))
    groove = nb.math("GREATER_THAN", fr, 0.94)
    col = _mul_scalar(nb, col, nb.math("MULTIPLY_ADD", groove, -0.25, 1.0))
    bump = nb.add("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.5
    bump.inputs["Distance"].default_value = 0.004
    nb.ln(nb.math("SUBTRACT", 1.0, groove), bump.inputs["Height"])
    if normal is not None:
        nb.ln(normal, bump.inputs["Normal"])
    return col, rough, bump.outputs[0]


def mk_galva(name, color):
    """ガルバリウム鋼板の屋根（縦はぜの筋、半つや）。"""
    m, nb, b = new_mat(name)
    uv = nb.add("ShaderNodeTexCoord").outputs["UV"]
    obj = nb.add("ShaderNodeTexCoord").outputs["Object"]
    sep = nb.add("ShaderNodeSeparateXYZ")
    nb.ln(uv, sep.inputs[0])
    fr = nb.math("FRACT", nb.math("MULTIPLY", sep.outputs[0], 1 / 0.455))
    seam = nb.math("GREATER_THAN", fr, 0.95)
    n1 = nb.noise(obj, 2.0, 4, 0.5)
    col = nb.mix(0.25, color, n1.outputs["Color"], "OVERLAY")
    setin(b.inputs["Base Color"], col, nb)
    b.inputs["Metallic"].default_value = 0.6
    nb.ln(nb.math("MULTIPLY_ADD", n1.outputs["Fac"], 0.15, 0.3), b.inputs["Roughness"])
    bump = nb.add("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.8
    bump.inputs["Distance"].default_value = 0.02
    nb.ln(seam, bump.inputs["Height"])
    nb.ln(bump.outputs[0], b.inputs["Normal"])
    return m


GALVA = [mk_galva("galva_navy", (0.05, 0.07, 0.12)), mk_galva("galva_brown", (0.10, 0.065, 0.045)),
         mk_galva("galva_black", (0.04, 0.042, 0.045)), mk_galva("galva_silver", (0.30, 0.31, 0.32))]
WALLS = []
for i, (k, tint) in enumerate([("stucco", (0.95, 0.90, 0.80)), ("stucco", (0.85, 0.85, 0.83)),
                               ("beige", (1.0, 0.95, 0.88)), ("stucco", (0.80, 0.72, 0.60)),
                               ("beige", (0.75, 0.78, 0.80)), ("plank", (0.5, 0.42, 0.36)),
                               ("tin", (0.75, 0.80, 0.85))]):
    WALLS.append(surface(f"wall{i}", k, tint=tint, nor=0.8, macro=0.15, grime=0.28))
# サイディング（白・クリーム・灰・こげ茶・濃い灰）
for i, (k, tint) in enumerate([("beige", (1.25, 1.25, 1.22)), ("stucco", (1.0, 0.93, 0.78)), ("stucco", (0.62, 0.63, 0.64)),
                               ("beige", (0.30, 0.20, 0.14)), ("stucco", (0.28, 0.29, 0.30))]):
    WALLS.append(surface(f"siding{i}", k, tint=tint, nor=0.5, macro=0.12, grime=0.2, desat=0.5 if i in (0, 2, 4) else 0.0,
                         extra=siding_extra))
M["trim"] = simple("trim", (0.75, 0.74, 0.72), 0.5)
M["alu"] = simple("alu", (0.55, 0.56, 0.57), 0.35, metallic=1.0)
M["alu_dark"] = simple("alu_dark", (0.12, 0.10, 0.08), 0.35, metallic=0.8)
def mk_window(name, curtain, estr, ecol):
    """窓の奥（ガラスの後ろ）: 暗い部屋かカーテン。点いている部屋は暖かい光。"""
    m, nb, b = new_mat(name)
    obj = nb.add("ShaderNodeTexCoord").outputs["Object"]
    wv = nb.add("ShaderNodeTexWave", wave_type="BANDS", bands_direction="X")
    wv.inputs["Scale"].default_value = 9.0
    wv.inputs["Distortion"].default_value = 2.0
    mp = nb.add("ShaderNodeMapping")
    mp.inputs["Rotation"].default_value = (0, 0, math.radians(90))
    nb.ln(obj, mp.inputs["Vector"])
    nb.ln(mp.outputs[0], wv.inputs["Vector"])
    n1 = nb.noise(obj, 0.25, 1, 0.5)
    fold = nb.math("MULTIPLY_ADD", wv.outputs["Fac"], 0.3, 0.7)
    cover = nb.math("GREATER_THAN", n1.outputs["Fac"], 0.5)
    c = nb.mix(cover, (0.012, 0.012, 0.014), tuple(v * 0.45 for v in curtain))
    c = _mul_scalar(nb, c, fold)
    setin(b.inputs["Base Color"], c, nb)
    b.inputs["Roughness"].default_value = 0.8
    if estr > 0:
        e = nb.math("MULTIPLY", nb.math("MULTIPLY_ADD", cover, 0.7, 0.3), estr)
        e = nb.math("MULTIPLY", e, fold)
        b.inputs["Emission Color"].default_value = (*ecol, 1.0)
        nb.ln(e, b.inputs["Emission Strength"])
    return m


M["glass"] = mk_window("glass", (0.75, 0.72, 0.65), 0.0, (1, 1, 1))
M["glass_lit"] = mk_window("glass_lit", (0.9, 0.8, 0.6), 1.6, (1.0, 0.68, 0.38))
M["glass_cool"] = mk_window("glass_cool", (0.85, 0.85, 0.85), 1.0, (0.85, 0.92, 1.0))
M["pane"] = simple("pane", (0.95, 0.97, 0.97), 0.02, transmission=1.0)
M["shutter"] = surface("shutter", "tin", tint=(0.55, 0.53, 0.50), nor=0.5, size=(0.6, 0.6), macro=0.1, metallic=0.4)
M["door"] = simple("door", (0.10, 0.07, 0.05), 0.5)
M["gutter"] = simple("gutter", (0.30, 0.30, 0.30), 0.4)
M["paint"] = simple("paint_white", (0.78, 0.78, 0.76), 0.55)
M["wire"] = simple("wire", (0.03, 0.03, 0.03), 0.6)
M["insul"] = simple("insulator", (0.82, 0.82, 0.80), 0.15)
M["steel"] = simple("steel", (0.18, 0.18, 0.18), 0.45, metallic=0.9)
M["grate"] = simple("grate", (0.12, 0.11, 0.10), 0.55, metallic=0.7)
M["dark"] = simple("dark", (0.01, 0.01, 0.01), 0.9)
M["bark"] = None  # 下で作る
M["hedge"] = None
M["cat"] = simple("cat_shadow", (0.2, 0.2, 0.2), 0.8)
M["crow"] = simple("crow", (0.010, 0.010, 0.012), 0.62)
M["crow"].node_tree.nodes["Principled BSDF"].inputs["Sheen Weight"].default_value = 0.2
M["crow"].node_tree.nodes["Principled BSDF"].inputs["Sheen Tint"].default_value = (0.55, 0.6, 0.8, 1)
M["beak"] = simple("beak", (0.025, 0.025, 0.025), 0.45)
M["orange_pole"] = simple("orange_pole", (0.9, 0.25, 0.02), 0.4, coat=0.3)
M["mirror"] = simple("mirror", (0.9, 0.9, 0.9), 0.02, metallic=1.0)
M["vm_body"] = simple("vm_body", (0.82, 0.83, 0.84), 0.35, coat=0.4)
M["vm_band"] = simple("vm_band", (0.15, 0.35, 0.65), 0.35, coat=0.4)
M["vm_back"] = simple("vm_back", (0.9, 0.92, 0.95), 0.5, emission=(0.93, 0.96, 1.0), estr=5.0)
M["vm_glass"] = simple("vm_glass", (0.95, 0.95, 0.95), 0.01, transmission=1.0)
M["vm_label"] = simple("vm_label", (0.9, 0.9, 0.9), 0.5, emission=(1.0, 1.0, 1.0), estr=4.0)
M["vm_button"] = simple("vm_button", (0.2, 0.7, 0.3), 0.4, emission=(0.3, 1.0, 0.4), estr=3.0)
M["fruit"] = None
M["propane"] = simple("propane", (0.42, 0.43, 0.45), 0.35, metallic=0.5, coat=0.3)
M["polycarb"] = simple("polycarb", (0.55, 0.45, 0.3), 0.15, transmission=0.85)
M["lamp"] = simple("lamp", (0.9, 0.95, 1.0), 0.3, emission=(0.9, 0.95, 1.0), estr=6.0)
M["cable_black"] = simple("cable_black", (0.02, 0.02, 0.02), 0.5)


def mk_guard():
    m, nb, b = new_mat("pole_guard")
    obj = nb.add("ShaderNodeTexCoord").outputs["Object"]
    sep = nb.add("ShaderNodeSeparateXYZ")
    nb.ln(obj, sep.inputs[0])
    ang = nb.add("ShaderNodeMath", operation="ARCTAN2")
    nb.ln(sep.outputs[1], ang.inputs[0])
    nb.ln(sep.outputs[0], ang.inputs[1])
    s = nb.math("ADD", nb.math("MULTIPLY", sep.outputs[2], 1 / 0.18), nb.math("MULTIPLY", ang.outputs[0], 1 / math.pi))
    st = nb.math("GREATER_THAN", nb.math("FRACT", s), 0.5)
    n1 = nb.noise(obj, 30.0, 4, 0.6)
    col = nb.mix(st, (0.85, 0.62, 0.02), (0.02, 0.02, 0.02))
    col = nb.mix(0.15, col, n1.outputs["Color"], "OVERLAY")
    setin(b.inputs["Base Color"], col, nb)
    b.inputs["Roughness"].default_value = 0.45
    return m


M["guard"] = mk_guard()


def mk_leafmat(name, translucent=0.35, mottle=0.0):
    m, nb, b = new_mat(name)
    at = nb.add("ShaderNodeAttribute", attribute_name="col")
    obj = nb.add("ShaderNodeTexCoord").outputs["Object"]
    n1 = nb.noise(obj, 60.0, 3, 0.5)
    col = nb.mix(0.2, at.outputs["Color"], n1.outputs["Color"], "OVERLAY")
    if mottle > 0:
        # 赤・橙・黄・茶のまだら（葉ごとに模様が変わる）
        n2 = nb.noise(obj, 18.0, 4, 0.6)
        rp = nb.ramp(n2.outputs["Fac"], [(0.30, (0.55, 0.08, 0.02)), (0.45, (0.85, 0.35, 0.04)), (0.58, (0.80, 0.62, 0.10)), (0.72, (0.30, 0.17, 0.06))])
        col = nb.mix(mottle, col, rp, "MULTIPLY")
        col = nb.mix(0.35, col, rp)
        # 葉脈（中央の筋を少し明るく）
        uvn = nb.add("ShaderNodeTexCoord").outputs["UV"]
    setin(b.inputs["Base Color"], col, nb)
    b.inputs["Roughness"].default_value = 0.55
    b.inputs["Specular IOR Level"].default_value = 0.4
    tr = nb.add("ShaderNodeBsdfTranslucent")
    nb.ln(col, tr.inputs["Color"])
    mixs = nb.add("ShaderNodeMixShader")
    mixs.inputs[0].default_value = translucent
    out = nb.n["Material Output"]
    nb.ln(b.outputs[0], mixs.inputs[1])
    nb.ln(tr.outputs[0], mixs.inputs[2])
    nb.ln(mixs.outputs[0], out.inputs["Surface"])
    return m


M["leaf"] = mk_leafmat("leaf", 0.3, mottle=0.55)
M["fallen"] = mk_leafmat("fallen_leaf", 0.1, mottle=0.45)
M["hedge"] = mk_leafmat("hedge_leaf", 0.25)
M["cloth"] = mk_leafmat("cloth", 0.25)
M["cloth"].node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.9


def mk_bark():
    m, nb, b = new_mat("bark")
    obj = nb.add("ShaderNodeTexCoord").outputs["Object"]
    mp = nb.add("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (1.0, 1.0, 0.35)
    nb.ln(obj, mp.inputs["Vector"])
    n1 = nb.noise(mp.outputs[0], 30.0, 8, 0.7)
    n2 = nb.noise(obj, 4.0, 4, 0.5)
    col = nb.ramp(n1.outputs["Fac"], [(0.35, (0.035, 0.03, 0.026)), (0.7, (0.13, 0.115, 0.10))])
    col = nb.mix(nb.math("MULTIPLY", nb.math("GREATER_THAN", n2.outputs["Fac"], 0.68), 0.5), col, (0.16, 0.17, 0.13))
    setin(b.inputs["Base Color"], col, nb)
    b.inputs["Roughness"].default_value = 0.85
    bump = nb.add("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.6
    bump.inputs["Distance"].default_value = 0.004
    nb.ln(n1.outputs["Fac"], bump.inputs["Height"])
    nb.ln(bump.outputs[0], b.inputs["Normal"])
    return m


M["bark"] = mk_bark()


def mk_fruit():
    m, nb, b = new_mat("persimmon")
    at = nb.add("ShaderNodeAttribute", attribute_name="col")
    obj = nb.add("ShaderNodeTexCoord").outputs["Object"]
    n1 = nb.noise(obj, 25.0, 3, 0.5)
    n2 = nb.noise(obj, 9.0, 5, 0.6)
    col = nb.mix(0.12, at.outputs["Color"], n1.outputs["Color"], "OVERLAY")
    bloom = nb.add("ShaderNodeMapRange")
    bloom.inputs["From Min"].default_value = 0.55
    bloom.inputs["From Max"].default_value = 0.75
    nb.ln(n2.outputs["Fac"], bloom.inputs["Value"])
    col = nb.mix(nb.math("MULTIPLY", bloom.outputs[0], 0.35), col, (0.85, 0.62, 0.45))
    setin(b.inputs["Base Color"], col, nb)
    b.inputs["Roughness"].default_value = 0.42
    nb.ln(nb.math("MULTIPLY_ADD", bloom.outputs[0], 0.2, 0.4), b.inputs["Roughness"])
    b.inputs["Coat Weight"].default_value = 0.0
    b.inputs["Subsurface Weight"].default_value = 0.15
    b.inputs["Subsurface Radius"].default_value = (0.9, 0.35, 0.1)
    b.inputs["Subsurface Scale"].default_value = 0.008
    return m


M["fruit"] = mk_fruit()
M["calyx"] = simple("calyx", (0.11, 0.10, 0.035), 0.75)


# ------------------------------------------------------------------ メッシュの小道具
class MB:
    """形を 1 つのメッシュにまとめる。UV はメートル単位の箱投影（指定があればそれを使う）。"""

    def __init__(self):
        self.bm = bmesh.new()
        self.uvl = self.bm.loops.layers.uv.new("UVMap")
        self.coll = self.bm.loops.layers.float_color.new("col")
        self.custom = {}

    def face(self, pts, mi=0, col=(1, 1, 1), uvs=None):
        vs = [self.bm.verts.new(p) for p in pts]
        f = self.bm.faces.new(vs)
        f.material_index = mi
        for lp in f.loops:
            lp[self.coll] = (*col, 1.0)
        if uvs:
            for lp, uv in zip(f.loops, uvs):
                lp[self.uvl].uv = uv
            self.custom[f] = True
        return f

    def box(self, x0, y0, z0, x1, y1, z1, mi=0, col=(1, 1, 1), skip=()):
        p = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
             (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        faces = {"-z": (0, 3, 2, 1), "+z": (4, 5, 6, 7), "-y": (0, 1, 5, 4),
                 "+x": (1, 2, 6, 5), "+y": (2, 3, 7, 6), "-x": (3, 0, 4, 7)}
        for k, idx in faces.items():
            if k in skip:
                continue
            self.face([p[i] for i in idx], mi, col)

    def prism(self, pts_bottom, height, mi=0, col=(1, 1, 1)):
        n = len(pts_bottom)
        top = [(x, y, z + height) for x, y, z in pts_bottom]
        self.face(list(reversed(pts_bottom)), mi, col)
        self.face(top, mi, col)
        for i in range(n):
            j = (i + 1) % n
            self.face([pts_bottom[i], pts_bottom[j], top[j], top[i]], mi, col)

    def cyl(self, cx, cy, z0, z1, r0, r1=None, seg=12, mi=0, col=(1, 1, 1), caps=True, axis="z"):
        r1 = r0 if r1 is None else r1
        ring0, ring1 = [], []
        for i in range(seg):
            a = 2 * math.pi * i / seg
            c, s = math.cos(a), math.sin(a)
            if axis == "z":
                ring0.append((cx + r0 * c, cy + r0 * s, z0))
                ring1.append((cx + r1 * c, cy + r1 * s, z1))
        for i in range(seg):
            j = (i + 1) % seg
            u0, u1 = i / seg * 2 * math.pi * r0, (i + 1) / seg * 2 * math.pi * r0
            self.face([ring0[i], ring0[j], ring1[j], ring1[i]], mi, col,
                      uvs=[(u0, z0), (u1, z0), (u1, z1), (u0, z1)])
        if caps:
            self.face(list(reversed(ring0)), mi, col)
            self.face(ring1, mi, col)

    def finish(self, name, mats, coll=None, smooth=False, bevel=0.0, seg=1):
        bm = self.bm
        bm.normal_update()
        for f in bm.faces:
            if f in self.custom:
                continue
            n = f.normal
            ax = max(range(3), key=lambda i: abs(n[i]))
            for lp in f.loops:
                co = lp.vert.co
                if ax == 0:
                    uv = (co.y * (1 if n.x > 0 else -1), co.z)
                elif ax == 1:
                    uv = (co.x * (-1 if n.y > 0 else 1), co.z)
                else:
                    uv = (co.x, co.y)
                lp[self.uvl].uv = uv
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        for m in (mats if isinstance(mats, (list, tuple)) else [mats]):
            me.materials.append(m)
        if smooth:
            for p in me.polygons:
                p.use_smooth = True
        ob = bpy.data.objects.new(name, me)
        link(ob, coll)
        if bevel > 0:
            md = ob.modifiers.new("bevel", "BEVEL")
            md.width = bevel
            md.segments = seg
            md.limit_method = "ANGLE"
            md.angle_limit = math.radians(40)
        return ob


def jitter_col(rng, amt=0.08, base=(1, 1, 1)):
    k = 1.0 + rng.uniform(-amt, amt)
    w = rng.uniform(-amt * 0.3, amt * 0.3)
    return (base[0] * k * (1 + w), base[1] * k, base[2] * k * (1 - w))


# ------------------------------------------------------------------ 世界（空と太陽）
def build_world():
    w = bpy.data.worlds.new("sky")
    scene.world = w
    w.use_nodes = True
    nb = NB(w.node_tree)
    bg = nb.n["Background"]
    out = nb.n["World Output"]
    sun_dir_world = sun_vector()
    if SCANS:
        info = MANIFEST["hdri"]["qwantani_sunset_puresky"]
        img = bpy.data.images.load(os.path.join(ASSETS, info["file"]))
        # 太陽の画素を探して、場面の太陽の方位に合わせて回す
        wpx, hpx = img.size
        import numpy as np
        a = np.array(img.pixels[:], dtype=np.float32).reshape(hpx, wpx, 4)[:, :, :3]
        lum = a @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
        iy, ix = np.unravel_index(int(np.argmax(lum)), lum.shape)
        u = (ix + 0.5) / wpx
        v = (iy + 0.5) / hpx
        phi_h = -(u - 0.5) * 2 * math.pi
        el_h = (v - 0.5) * math.pi
        phi_w = math.atan2(sun_dir_world.y, sun_dir_world.x)
        tc = nb.add("ShaderNodeTexCoord")
        mp = nb.add("ShaderNodeMapping")
        d_h = Vector((math.cos(el_h) * math.cos(phi_h), math.cos(el_h) * math.sin(phi_h), math.sin(el_h)))
        rot = Vector(sun_dir_world).rotation_difference(d_h).to_euler("XYZ")
        mp.inputs["Rotation"].default_value = rot
        nb.ln(tc.outputs["Generated"], mp.inputs["Vector"])
        env = nb.add("ShaderNodeTexEnvironment", image=img)
        nb.ln(mp.outputs[0], env.inputs[0])
        # 太陽の円盤は見えるだけ残し、光の量は太陽ランプに任せる
        cap = nb.add("ShaderNodeVectorMath", operation="MINIMUM")
        cap.inputs[1].default_value = (600.0, 600.0, 600.0)
        nb.ln(env.outputs[0], cap.inputs[0])
        sky_col = horizon_warm(nb, cap.outputs[0], tc.outputs["Generated"])
        nb.ln(sky_col, bg.inputs["Color"])
        bg.inputs["Strength"].default_value = SKY_STRENGTH
        log("build", "hdri", f"sun_px=({ix},{iy}) el_hdri={math.degrees(el_h):.2f} rot={tuple(round(math.degrees(a), 1) for a in rot)}")
    else:
        sky = nb.add("ShaderNodeTexSky")
        for k, v in (("sky_type", "MULTIPLE_SCATTERING"), ("sun_elevation", math.radians(T.SUN_EL)),
                     ("sun_rotation", math.atan2(sun_dir_world.x, sun_dir_world.y) * -1 + math.pi / 2),
                     ("sun_disc", True), ("sun_size", math.radians(0.5)), ("air_density", 1.2), ("aerosol_density", 2.5),
                     ("ozone_density", 2.0), ("sun_intensity", 0.3)):
            try:
                setattr(sky, k, v)
            except Exception as e:  # 版によって名前が違う
                log("build", "sky_prop_skip", f"{k}: {e}")
        # Sky テクスチャの方位: sun_rotation は +X から反時計回り…版で違うので方向を直接合わせる
        nb.ln(sky.outputs[0], bg.inputs["Color"])
        bg.inputs["Strength"].default_value = 0.25
    nb.ln(bg.outputs[0], out.inputs["Surface"])

    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 10.0
    sun.angle = math.radians(0.6)
    sun.color = (1.0, 0.66, 0.40)
    so = bpy.data.objects.new("sun", sun)
    # ランプは -Z 方向へ光る。太陽の向き（光源へ向かう方向）を +Z に合わせる
    so.rotation_euler = Vector(sun_dir_world).to_track_quat("Z", "Y").to_euler()
    link(so)
    return so


def horizon_warm(nb, col, gen):
    """空の色補正: 地平に近いほど桃色〜橙を足す（太陽側は強く）。"""
    sep = nb.add("ShaderNodeSeparateXYZ")
    nb.ln(gen, sep.inputs[0])
    low = nb.add("ShaderNodeMapRange", interpolation_type="SMOOTHSTEP")
    low.inputs["From Min"].default_value = 0.30
    low.inputs["From Max"].default_value = 0.0
    nb.ln(sep.outputs[2], low.inputs["Value"])
    sv = sun_vector()
    dot = nb.add("ShaderNodeVectorMath", operation="DOT_PRODUCT")
    dot.inputs[1].default_value = (sv.x, sv.y, 0.0)
    nb.ln(gen, dot.inputs[0])
    toward = nb.math("MULTIPLY_ADD", dot.outputs["Value"], 0.5, 0.5, clamp=True)
    tint = nb.mix(toward, (1.10, 0.86, 0.95), (1.35, 0.92, 0.62))
    k = nb.math("MULTIPLY", low.outputs[0], 0.85)
    mixed = nb.mix(1.0, col, tint, "MULTIPLY")
    return nb.mix(k, col, mixed)


def build_clouds():
    """高い所の薄い巻雲（太陽側から照らされて橙に色づく）。"""
    m, nb, b = new_mat("cirrus")
    obj = nb.add("ShaderNodeTexCoord").outputs["Object"]
    mp = nb.add("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (0.00035, 0.0011, 1.0)
    mp.inputs["Rotation"].default_value = (0, 0, math.radians(35))
    nb.ln(obj, mp.inputs["Vector"])
    n1 = nb.noise(mp.outputs[0], 3.0, 8, 0.62)
    n2 = nb.noise(obj, 0.004, 3, 0.5)
    dens = nb.add("ShaderNodeMapRange", interpolation_type="SMOOTHSTEP")
    dens.inputs["From Min"].default_value = 0.52
    dens.inputs["From Max"].default_value = 0.78
    nb.ln(nb.math("MULTIPLY_ADD", n2.outputs["Fac"], 0.25, n1.outputs["Fac"]), dens.inputs["Value"])
    a = nb.math("MULTIPLY", dens.outputs[0], 0.55)
    tr = nb.add("ShaderNodeBsdfTranslucent")
    tr.inputs["Color"].default_value = (1.0, 0.95, 0.9, 1)
    df = nb.add("ShaderNodeBsdfDiffuse")
    df.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1)
    ms = nb.add("ShaderNodeMixShader")
    ms.inputs[0].default_value = 0.6
    nb.ln(df.outputs[0], ms.inputs[1])
    nb.ln(tr.outputs[0], ms.inputs[2])
    tp = nb.add("ShaderNodeBsdfTransparent")
    mo = nb.add("ShaderNodeMixShader")
    nb.ln(a, mo.inputs[0])
    nb.ln(tp.outputs[0], mo.inputs[1])
    nb.ln(ms.outputs[0], mo.inputs[2])
    nb.ln(mo.outputs[0], nb.n["Material Output"].inputs["Surface"])
    mb = MB()
    mb.face([(-9000, -9000, 1800), (9000, -9000, 1800), (9000, 9000, 1800), (-9000, 9000, 1800)])
    ob = mb.finish("cirrus", [m])
    ob.visible_shadow = False
    return ob


def build_compositor():
    """太陽のまわりだけのにじみ（Fog Glow、しきい値は高め）。"""
    try:
        ng = bpy.data.node_groups.new("comp", "CompositorNodeTree")
        ng.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
        rl = ng.nodes.new("CompositorNodeRLayers")
        gl = ng.nodes.new("CompositorNodeGlare")
        for k in ("Fog Glow", "FOG_GLOW"):
            try:
                gl.inputs["Type"].default_value = k
                break
            except Exception:
                pass
        gl.inputs["Threshold"].default_value = 6.0
        gl.inputs["Strength"].default_value = 0.6
        out = ng.nodes.new("NodeGroupOutput")
        ng.links.new(rl.outputs["Image"], gl.inputs["Image"])
        ng.links.new(gl.outputs["Image"], out.inputs[0])
        scene.compositing_node_group = ng
        scene.render.use_compositing = True
        try:
            scene.render.compositor_device = "GPU"
        except Exception:
            pass
        log("build", "compositor", "glare_type=" + str(gl.inputs["Type"].default_value).replace(" ", "_"))
    except Exception as e:
        log("build", "compositor_skip", str(e).replace(" ", "_")[:120])


def sun_vector():
    az = math.radians(T.SUN_AZ)
    el = math.radians(T.SUN_EL)
    return Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))


def build_haze():
    """町の空気のもや。均一な体積なので計算は軽い。"""
    m = bpy.data.materials.new("haze")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.remove(nt.nodes["Principled BSDF"])
    pv = nt.nodes.new("ShaderNodeVolumePrincipled")
    pv.inputs["Color"].default_value = (0.92, 0.88, 0.84, 1)
    pv.inputs["Density"].default_value = HAZE_DENSITY
    pv.inputs["Anisotropy"].default_value = 0.7
    nt.links.new(pv.outputs[0], nt.nodes["Material Output"].inputs["Volume"])
    mb = MB()
    mb.box(-90, -280, -1.0, 90, 160, 45.0)
    ob = mb.finish("haze", [m])
    ob.visible_shadow = False
    return ob


# ------------------------------------------------------------------ 道と側溝
Y_MIN, Y_MAX = -215.0, 96.0


def road_extra(nb, col, rough, normal, obj, uv):
    """路面に白線（ふちは骨材に沿ってがたつく、はげあり）と、路肩の砂・土の汚れの帯を描く。"""
    sep = nb.add("ShaderNodeSeparateXYZ")
    nb.ln(obj, sep.inputs[0])
    ax = nb.math("ABSOLUTE", sep.outputs[0])
    edge_n = nb.noise(obj, 160.0, 3, 0.6)
    jit = nb.math("MULTIPLY_ADD", edge_n.outputs["Fac"], 0.012, -0.006)
    d = nb.math("ABSOLUTE", nb.math("SUBTRACT", nb.math("ADD", ax, jit), 1.40))
    inside = nb.math("LESS_THAN", d, 0.075)
    road_y = nb.math("LESS_THAN", sep.outputs[1], Y_MAX)
    road_y2 = nb.math("GREATER_THAN", sep.outputs[1], Y_MIN)
    inside = nb.math("MULTIPLY", inside, nb.math("MULTIPLY", road_y, road_y2))
    n1 = nb.noise(obj, 9.0, 6, 0.65)
    n2 = nb.noise(obj, 90.0, 3, 0.5)
    worn = nb.math("GREATER_THAN", nb.math("ADD", n1.outputs["Fac"], nb.math("MULTIPLY", n2.outputs["Fac"], 0.45)), 0.80)
    paint = nb.math("MULTIPLY", inside, nb.math("SUBTRACT", 1.0, worn))
    # 骨材のくぼみには塗料が薄い
    agg = nb.noise(obj, 260.0, 2, 0.5)
    paint = nb.math("MULTIPLY", paint, nb.math("MULTIPLY_ADD", agg.outputs["Fac"], 0.5, 0.65), clamp=True)
    col = nb.mix(paint, col, (0.62, 0.62, 0.60))
    rough = nb.mix(paint, rough, (0.55, 0.55, 0.55)) if not isinstance(rough, float) else rough
    # 路肩（|x| が 2 に近い所）の砂と土
    band = nb.add("ShaderNodeMapRange")
    band.inputs["From Min"].default_value = 1.86
    band.inputs["From Max"].default_value = 2.0
    nb.ln(nb.math("ADD", ax, nb.math("MULTIPLY_ADD", n1.outputs["Fac"], 0.06, -0.03)), band.inputs["Value"])
    dirt = nb.mix(nb.math("MULTIPLY", band.outputs[0], 0.75), col, (0.16, 0.13, 0.10))
    return dirt, rough, normal


def build_road():
    mb = MB()
    mb.face([(-2.0, Y_MIN, 0), (2.0, Y_MIN, 0), (2.0, Y_MAX, 0), (-2.0, Y_MAX, 0)], 0)
    # 丁字路（両端）の横の道
    for yc in (Y_MIN - 4.0, Y_MAX):
        mb.face([(-60, yc, 0), (60, yc, 0), (60, yc + 4.0, 0), (-60, yc + 4.0, 0)], 0)
    M["road"] = surface("road", "asphalt", tint=(0.92, 0.92, 0.95), nor=1.0, macro=0.22, extra=road_extra)
    mb.finish("road", [M["road"]])
    # 周りの地面（家の敷地の下）
    mb = MB()
    mb.face([(-400, -500, -0.02), (400, -500, -0.02), (400, 400, -0.02), (-400, 400, -0.02)], 0)
    mb.finish("ground_far", [M["concrete"]])
    # 白線（すり減りは材質で）
    m, nb, b = new_mat("line_paint")
    obj = nb.add("ShaderNodeTexCoord").outputs["Object"]
    n1 = nb.noise(obj, 9.0, 6, 0.65)
    n2 = nb.noise(obj, 90.0, 3, 0.5)
    worn = nb.math("GREATER_THAN", nb.math("ADD", n1.outputs["Fac"], nb.math("MULTIPLY", n2.outputs["Fac"], 0.45)), 0.80)
    col = nb.mix(worn, (0.58, 0.58, 0.56), (0.13, 0.13, 0.13))
    setin(b.inputs["Base Color"], col, nb)
    b.inputs["Roughness"].default_value = 0.6
    bump = nb.add("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.3
    nb.ln(n2.outputs["Fac"], bump.inputs["Height"])
    nb.ln(bump.outputs[0], b.inputs["Normal"])
    M["line"] = m
    # 白線は路面の材質に描く（厚みのある板にしない）

    # 側溝のふた（コンクリート）とグレーチング
    rng = random.Random(SEED + 1)
    mb = MB()
    gr = MB()
    for side in (-1, 1):
        x0, x1 = (-2.29, -2.005) if side < 0 else (2.005, 2.29)
        y = Y_MIN
        k = 0
        while y < Y_MAX:
            L = 0.5
            if k % 9 == 4:
                # グレーチング: 枠と横の棒
                gr.box(x0, y + 0.004, -0.06, x0 + 0.02, y + L - 0.004, 0.01)
                gr.box(x1 - 0.02, y + 0.004, -0.06, x1, y + L - 0.004, 0.01)
                bars = 14
                for i in range(bars):
                    yy = y + 0.02 + i * (L - 0.04) / (bars - 1)
                    gr.box(x0, yy - 0.004, -0.04, x1, yy + 0.004, 0.008)
                # 溝の底（暗い）
                mb.box(x0, y, -0.32, x1, y + L, -0.30, mi=1)
            else:
                dz = rng.uniform(-0.004, 0.004)
                c = jitter_col(rng, 0.10)
                mb.box(x0, y + 0.003, -0.08, x1, y + L - 0.003, 0.012 + dz, col=c)
                xm = (x0 + x1) / 2
                for (yy, sg) in ((y + 0.003, 1), (y + L - 0.003, -1)):
                    pts = [(xm + 0.032 * math.cos(a), yy + sg * 0.032 * math.sin(a), 0.0125 + dz) for a in
                           [math.pi * k / 8 for k in range(9)]]
                    if sg < 0:
                        pts = list(reversed(pts))
                    mb.face(pts, 1)
            y += L
            k += 1
    mb.finish("gutter_lids", [M["lid"], M["dark"]], bevel=0.006)
    gr.finish("gratings", [M["grate"]])
    # マンホール
    mb = MB()
    mb.cyl(0.35, 9.4, -0.02, 0.006, 0.31, seg=40)
    ob = mb.finish("manhole", [M["grate"]], smooth=True)


# ------------------------------------------------------------------ ブロック塀
def block_wall_hero(y0, y1, gate=None, x_face=-2.30, courses=5):
    """猫が乗る塀。ブロックを 1 つずつ置き、一部に透かしブロック。"""
    rng = random.Random(SEED + 2)
    mb = MB()
    xs, xg = x_face, x_face - 0.12  # 道側の面と庭側の面
    z_f = 0.15
    # 基礎
    mb.box(xg - 0.02, y0, -0.05, xs + 0.02, y1, z_f, mi=1)
    segments = [(y0, y1)] if gate is None else [(y0, gate[0]), (gate[1], y1)]
    deco_ranges = [(6.4, 8.0), (12.4, 14.0)]
    for (a, b) in segments:
        for c in range(courses):
            z0 = z_f + c * 0.2
            off = 0.0 if c % 2 == 0 else 0.2
            y = a - off
            while y < b - 1e-6:
                ya, yb = max(y, a), min(y + 0.39, b)
                if yb - ya > 0.02:
                    deco = c == 3 and any(r0 <= ya and yb <= r1 for r0, r1 in deco_ranges) and (yb - ya) > 0.38
                    col = jitter_col(rng, 0.07)
                    if deco:
                        # 透かしブロック: 外枠と十字
                        t = 0.03
                        mb.box(xg, ya, z0, xs, yb, z0 + t, col=col)
                        mb.box(xg, ya, z0 + 0.19 - t, xs, yb, z0 + 0.19, col=col)
                        mb.box(xg, ya, z0 + t, xs, ya + t, z0 + 0.19 - t, col=col)
                        mb.box(xg, yb - t, z0 + t, xs, yb, z0 + 0.19 - t, col=col)
                        ym, zm = (ya + yb) / 2, z0 + 0.095
                        mb.box(xg + 0.02, ym - 0.012, z0 + t, xs - 0.02, ym + 0.012, z0 + 0.19 - t, col=col)
                        mb.box(xg + 0.02, ya + t, zm - 0.012, xs - 0.02, yb - t, zm + 0.012, col=col)
                        # 円の飾り（多角形の輪）
                        for i in range(8):
                            ang = i / 8 * 2 * math.pi
                            cy, cz = ym + 0.06 * math.cos(ang), zm + 0.06 * math.sin(ang)
                            mb.box(xg + 0.03, cy - 0.012, cz - 0.012, xs - 0.03, cy + 0.012, cz + 0.012, col=col)
                    else:
                        mb.box(xg, ya + 0.005, z0 + 0.005, xs, yb - 0.005, z0 + 0.195, col=col)
                y += 0.4
        # 縦目地（ブロックの間を埋める内側の板）。透かしの段は抜く
        zc = z_f + 3 * 0.2
        mb.box(xg + 0.004, a, z_f, xs - 0.004, b, zc, mi=2)
        mb.box(xg + 0.004, a, zc + 0.2, xs - 0.004, b, z_f + courses * 0.2, mi=2)
        for (r0, r1) in [(a, b)]:
            # 透かし以外の 3 段目の目地
            y = r0
            while y < r1:
                yy = min(y + 0.4, r1)
                inside = any(d0 <= y and yy <= d1 for d0, d1 in deco_ranges)
                if not inside:
                    mb.box(xg + 0.004, y, zc, xs - 0.004, yy, zc + 0.2, mi=2)
                y += 0.4
        # 笠木（天端のコンクリート）。継ぎ目のすき間は作らない
        ztop = z_f + courses * 0.2
        mb.box(xg - 0.02, a, ztop, xs + 0.02, b, T.WALL_TOP, mi=3)
    ob = mb.finish("hero_wall", [M["block"], M["concrete"], M["mortar"], M["cap"]], bevel=0.004)
    return ob


def gate_posts(gate, x_face=-2.30):
    mb = MB()
    for yy in ((gate[0] - 0.32, gate[0]), (gate[1], gate[1] + 0.32)):
        mb.box(x_face - 0.30, yy[0], 0.0, x_face + 0.02, yy[1], 1.36, mi=0)
        mb.box(x_face - 0.32, yy[0] - 0.02, 1.36, x_face + 0.04, yy[1] + 0.02, 1.42, mi=1)
    mb.finish("gate_posts", [M["block"], M["cap"]], bevel=0.005)
    # 門扉（アルミの格子、2 枚）
    mb = MB()
    xg = x_face - 0.15
    ya, yb = gate[0] + 0.02, gate[1] - 0.02
    mid = (ya + yb) / 2
    for (a, b) in ((ya, mid - 0.01), (mid + 0.01, yb)):
        mb.box(xg - 0.02, a, 0.08, xg + 0.02, b, 0.12)
        mb.box(xg - 0.02, a, 1.08, xg + 0.02, b, 1.12)
        mb.box(xg - 0.02, a, 0.08, xg + 0.02, a + 0.04, 1.12)
        mb.box(xg - 0.02, b - 0.04, 0.08, xg + 0.02, b, 1.12)
        n = int((b - a) / 0.09)
        for i in range(1, n):
            yy = a + i * (b - a) / n
            mb.box(xg - 0.008, yy - 0.008, 0.12, xg + 0.008, yy + 0.008, 1.08)
    mb.finish("gate", [M["alu_dark"]])
    # 郵便受け
    mb = MB()
    yb = gate[1] + 0.16
    mb.box(x_face + 0.02, yb - 0.13, 0.95, x_face + 0.10, yb + 0.13, 1.25)
    mb.finish("mailbox", [M["alu_dark"]], bevel=0.008)


def simple_wall(x0, y0, x1, y1, h, kind="block", coll=None):
    """遠くの塀。ブロックは材質の目地で表す。"""
    mb = MB()
    if kind == "block":
        mb.box(x0, y0, 0, x1, y1, h, mi=0)
        cap_w = 0.02
        mb.box(x0 - cap_w, y0 - cap_w, h, x1 + cap_w, y1 + cap_w, h + 0.04, mi=1)
        return mb.finish("wall", [M["block_far"], M["cap"]], coll=coll)
    if kind == "plank":
        mb.box(x0, y0, 0, x1, y1, h, mi=0)
        return mb.finish("fence", [M["plank_v"]], coll=coll)
    if kind == "hedge":
        return hedge(x0, y0, x1, y1, h)


def mk_block_far():
    """遠くの塀: 近くの塀と同じ材質に、目地を材質で描く。"""
    return surface("block_far", "concrete", tint=(0.98, 0.98, 0.98), nor=0.35, macro=0.10, size=(0.45, 0.45),
                   grime=0.15, desat=0.9, extra=lambda nb, c, r, n, o, uv: block_extra(nb, c, r, n, o, uv, joints=True))


M["block_far"] = mk_block_far()
M["plank_v"] = surface("plank_v", "plank", tint=(0.45, 0.36, 0.30), nor=1.0, macro=0.15, size=(1.6, 1.6))


# ------------------------------------------------------------------ 葉っぱ（柿・生垣・落ち葉）
LEAF_AUTUMN = [(0.75, 0.16, 0.03), (0.85, 0.32, 0.04), (0.80, 0.45, 0.06), (0.62, 0.50, 0.10),
               (0.45, 0.10, 0.03), (0.35, 0.33, 0.08)]
LEAF_FALLEN = [(0.42, 0.12, 0.03), (0.55, 0.22, 0.05), (0.35, 0.22, 0.08), (0.25, 0.15, 0.06),
               (0.60, 0.35, 0.08), (0.30, 0.10, 0.04)]
LEAF_GREEN = [(0.04, 0.10, 0.03), (0.06, 0.14, 0.04), (0.08, 0.13, 0.03), (0.05, 0.08, 0.025)]


def add_leaf(mb, pos, normal, axis, length, width, col, curl=0.15, shape=0, twist=0.0):
    """葉（縦 6 × 横 4 の格子）。中央の葉脈で折れ、先へ向かって反る。shape で形を変える。"""
    n = Vector(normal).normalized()
    a = Vector(axis)
    a = (a - n * a.dot(n)).normalized()
    s = n.cross(a)
    p0 = Vector(pos)
    NU, NV = 6, 4
    tip_k = (1.5, 2.2, 1.2, 1.8)[shape % 4]
    wide_at = (0.40, 0.33, 0.48, 0.38)[shape % 4]
    rows = []
    for i in range(NU + 1):
        u = i / NU
        # 葉の幅の輪郭: 根元は丸く、先はとがる
        if u < wide_at:
            hw = math.sin(0.5 * math.pi * u / wide_at) ** 0.7
        else:
            hw = (1 - (u - wide_at) / (1 - wide_at)) ** (1.0 / tip_k)
        hw = max(hw, 0.0) * width * 0.5
        row = []
        for j in range(NV + 1):
            v = (j / NV) * 2 - 1
            fold = curl * abs(v) * hw * 1.4
            arch = curl * 0.6 * (u ** 2) * length * 0.35
            tw = twist * u * v * hw
            row.append(p0 + a * (u * length) + s * (v * hw) + n * (fold + arch + tw))
        rows.append(row)
    for i in range(NU):
        for j in range(NV):
            q = [rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]]
            if i == NU - 1 and False:
                pass
            mb.face(q, 0, col)
    return p0 + a * length * 0.45


def add_leaf_simple(mb, pos, normal, axis, length, width, col, curl=0.15):
    """生垣用の軽い葉（中心と 10 点の扇）。"""
    n = Vector(normal).normalized()
    a = Vector(axis)
    a = (a - n * a.dot(n)).normalized()
    s = n.cross(a)
    p0 = Vector(pos)
    pts = []
    K = 10
    for i in range(K):
        ang = 2 * math.pi * i / K
        u = math.cos(ang)
        hw = math.sqrt(max(0.0, 1 - u * u)) * (1 - 0.22 * u)
        v = math.copysign(hw, math.sin(ang)) * width * 0.5
        x = (u + 1) * 0.5 * length
        pts.append(p0 + a * x + s * v + n * (curl * abs(v)))
    center = p0 + a * length * 0.45
    for i in range(K):
        mb.face([center, pts[i], pts[(i + 1) % K]], 0, col)
    return center


def hedge(x0, y0, x1, y1, h):
    rng = random.Random(int(abs(x0 * 100 + y0 * 7)) + SEED)
    mb = MB()
    vol = (x1 - x0) * (y1 - y0) * h
    n = int(min(3000, 900 * vol / 1.0))
    for i in range(n):
        p = (rng.uniform(x0, x1), rng.uniform(y0, y1), rng.uniform(0.05, h) + rng.gauss(0, 0.04))
        nrm = (rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1) + 0.6)
        ax = (rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1))
        add_leaf_simple(mb, p, nrm, ax, rng.uniform(0.05, 0.08), rng.uniform(0.025, 0.04), jitter_col(rng, 0.25, rng.choice(LEAF_GREEN)), 0.1)
    # 中の暗い塊
    mb2 = MB()
    mb2.box(x0 + 0.05, y0 + 0.05, 0, x1 - 0.05, y1 - 0.05, h - 0.08)
    mb2.finish("hedge_core", [M["dark"]])
    return mb.finish("hedge", [M["hedge"]])


# ------------------------------------------------------------------ 家
def roof_uv(p, hdir, pitch):
    """屋根の面の UV: u は軒に沿う向き、v は斜面に沿う距離。"""
    hx, hy = hdir
    u = p[0] * (-hy) + p[1] * hx
    v = -(p[0] * hx + p[1] * hy) / math.cos(pitch)
    return (u, v)


def house(x0, y0, x1, y1, floors, rng, front, wall_mat, roof_mat, lit_prob=0.25, roof_type=None, detail=True):
    """箱の家。front は道に向く面（'+x' か '-x'）。"""
    mb = MB()
    mats = [wall_mat, roof_mat, M["concrete"], M["trim"], M["glass"], M["glass_lit"], M["alu"], M["door"], M["gutter"], M["shutter"],
            M["glass_cool"], M["pane"], M["cloth"], M["propane"]]
    FW, RF, FD, TR, GL, GLL, AL, DR, GU, SH, GLC, PN, CL, PR = range(14)
    base = 0.38
    storey = 2.75
    H = base + floors * storey
    mb.box(x0 + 0.01, y0 + 0.01, -0.02, x1 - 0.01, y1 - 0.01, base, mi=FD)
    mb.box(x0, y0, base, x1, y1, H, mi=FW)
    if floors >= 2:
        mb.box(x0 - 0.03, y0 - 0.03, base + storey - 0.05, x1 + 0.03, y1 + 0.03, base + storey + 0.1, mi=TR)
    # 窓
    facades = {"+x": (x1, (y0, y1), (1, 0)), "-x": (x0, (y0, y1), (-1, 0)),
               "+y": (y1, (x0, x1), (0, 1)), "-y": (y0, (x0, x1), (0, -1))}
    for fk, (c, (a, b), nrm) in facades.items():
        if not detail and fk != front:
            continue
        L = b - a
        for fl in range(floors):
            zc = base + fl * storey + (1.45 if fl > 0 else 1.25)
            nwin = max(1, int(L / 3.0) - (0 if fk == front else 1))
            for wi in range(nwin):
                if rng.random() < (0.15 if fk == front else 0.35):
                    continue
                ww = rng.choice([0.8, 1.2, 1.65]) if fl > 0 else rng.choice([1.2, 1.65, 1.65])
                wh = rng.choice([1.1, 1.2]) if fl > 0 else (rng.choice([1.2, 1.8]))
                center = a + (wi + 0.5) * L / nwin + rng.uniform(-0.3, 0.3)
                center = min(max(center, a + ww / 2 + 0.3), b - ww / 2 - 0.3)
                zc2 = zc if wh < 1.5 else base + fl * storey + 1.0
                kind = rng.random()
                gm = GLL if kind < lit_prob else (GLC if kind < lit_prob + 0.05 else GL)
                if kind > 0.85:
                    gm = SH  # 雨戸を閉めている
                _window(mb, fk, c, center, zc2, ww, wh, gm, AL, SH, rng, PN)
        if fk == front:
            # 玄関
            dc = a + L * rng.uniform(0.2, 0.8)
            _flat_on(mb, fk, c, dc - 0.45, dc + 0.45, base, base + 2.0, 0.03, DR)
            _flat_on(mb, fk, c, dc - 0.7, dc + 0.7, base + 2.15, base + 2.25, 0.6, TR)
    # 屋根
    ov = 0.5
    galva = roof_mat in GALVA
    pitch = math.radians(rng.uniform(14, 20) if galva else rng.uniform(21, 28))
    if roof_type is None:
        roof_type = rng.choice(["gable", "gable", "hip"])
    long_y = (y1 - y0) >= (x1 - x0)
    th = 0.12
    if roof_type == "gable":
        if long_y:
            span = (x1 - x0) / 2 + ov
            xc = (x0 + x1) / 2
            zr = H + (x1 - x0) / 2 * math.tan(pitch)
            ze = H - ov * math.tan(pitch)
            ya, yb = y0 - ov, y1 + ov
            for sgn in (-1, 1):
                xe = xc + sgn * span
                hd = (sgn, 0)
                top = [(xe, ya, ze), (xe, yb, ze), (xc, yb, zr), (xc, ya, zr)]
                if sgn < 0:
                    top = [top[1], top[0], top[3], top[2]]
                _roof_slab(mb, top, th, RF, hd, pitch)
            for yy in (y0, y1):
                tri = [(x0, yy, H), (x1, yy, H), (xc, yy, zr - 0.05)]
                if yy == y1:
                    tri = list(reversed(tri))
                mb.face(tri, FW)
            mb.box(xc - 0.16, ya, zr - 0.05, xc + 0.16, yb, zr + 0.14, mi=RF)
            gut_lines = [((x0 - ov, ya, ze), (x0 - ov, yb, ze)), ((x1 + ov, ya, ze), (x1 + ov, yb, ze))]
            rtop = (xc, (y0 + y1) / 2 + rng.uniform(-1.5, 1.5), zr + 0.14)
        else:
            span = (y1 - y0) / 2 + ov
            yc = (y0 + y1) / 2
            zr = H + (y1 - y0) / 2 * math.tan(pitch)
            ze = H - ov * math.tan(pitch)
            xa, xb = x0 - ov, x1 + ov
            for sgn in (-1, 1):
                ye = yc + sgn * span
                hd = (0, sgn)
                top = [(xa, ye, ze), (xb, ye, ze), (xb, yc, zr), (xa, yc, zr)]
                if sgn > 0:
                    top = [top[1], top[0], top[3], top[2]]
                _roof_slab(mb, top, th, RF, hd, pitch)
            for xx in (x0, x1):
                tri = [(xx, y1, H), (xx, y0, H), (xx, yc, zr - 0.05)]
                if xx == x1:
                    tri = list(reversed(tri))
                mb.face(tri, FW)
            mb.box(xa, yc - 0.16, zr - 0.05, xb, yc + 0.16, zr + 0.14, mi=RF)
            gut_lines = [((xa, y0 - ov, ze), (xb, y0 - ov, ze)), ((xa, y1 + ov, ze), (xb, y1 + ov, ze))]
            rtop = ((x0 + x1) / 2 + rng.uniform(-1.5, 1.5), yc, zr + 0.14)
    else:
        # 寄棟
        ex0, ey0, ex1, ey1 = x0 - ov, y0 - ov, x1 + ov, y1 + ov
        ze = H - ov * math.tan(pitch)
        if long_y:
            half = (ex1 - ex0) / 2
            zr = ze + half * math.tan(pitch)
            xc = (ex0 + ex1) / 2
            r0, r1 = (xc, ey0 + half, zr), (xc, ey1 - half, zr)
            faces = [([(ex1, ey0, ze), (ex1, ey1, ze), r1, r0], (1, 0)),
                     ([(ex0, ey1, ze), (ex0, ey0, ze), r0, r1], (-1, 0)),
                     ([(ex0, ey0, ze), (ex1, ey0, ze), r0], (0, -1)),
                     ([(ex1, ey1, ze), (ex0, ey1, ze), r1], (0, 1))]
            ridge = ((xc - 0.14, r0[1], zr - 0.05), (xc + 0.14, r1[1], zr + 0.12))
        else:
            half = (ey1 - ey0) / 2
            zr = ze + half * math.tan(pitch)
            yc = (ey0 + ey1) / 2
            r0, r1 = (ex0 + half, yc, zr), (ex1 - half, yc, zr)
            faces = [([(ex0, ey0, ze), (ex1, ey0, ze), r1, r0], (0, -1)),
                     ([(ex1, ey1, ze), (ex0, ey1, ze), r0, r1], (0, 1)),
                     ([(ex0, ey1, ze), (ex0, ey0, ze), r0], (-1, 0)),
                     ([(ex1, ey0, ze), (ex1, ey1, ze), r1], (1, 0))]
            ridge = ((r0[0], yc - 0.14, zr - 0.05), (r1[0], yc + 0.14, zr + 0.12))
        for pts, hd in faces:
            mb.face(pts, RF, uvs=[roof_uv(p, hd, pitch) for p in pts])
        # 鼻隠しと軒裏
        mb.box(ex0, ey0, ze - 0.12, ex1, ey1, ze, mi=TR, skip=("+z",))
        mb.box(ridge[0][0], ridge[0][1], ridge[0][2], ridge[1][0], ridge[1][1], ridge[1][2], mi=RF)
        rtop = ((r0[0] + r1[0]) / 2, (r0[1] + r1[1]) / 2, zr + 0.12)
        gut_lines = [((ex0, ey0, ze - 0.06), (ex1, ey0, ze - 0.06)), ((ex0, ey1, ze - 0.06), (ex1, ey1, ze - 0.06))] if not long_y else \
            [((ex0, ey0, ze - 0.06), (ex0, ey1, ze - 0.06)), ((ex1, ey0, ze - 0.06), (ex1, ey1, ze - 0.06))]
    # 雨樋と縦樋
    for (p, q) in gut_lines:
        mb.box(min(p[0], q[0]) - 0.05, min(p[1], q[1]) - 0.05, p[2] - 0.1, max(p[0], q[0]) + 0.05, max(p[1], q[1]) + 0.05, p[2] - 0.0, mi=GU)
    cx_, cy_ = (x1 + 0.08, y0 + 0.15) if front == "+x" else (x0 - 0.08, y0 + 0.15)
    mb.box(cx_ - 0.03, cy_ - 0.03, 0.05, cx_ + 0.03, cy_ + 0.03, H - 0.2, mi=GU)
    # テレビのアンテナ（棟の上）
    if rng.random() < 0.55:
        ax, ay, az = rtop
        mb.cyl(ax, ay, az, az + rng.uniform(1.2, 1.9), 0.018, seg=6, mi=AL)
        top = az + 1.2
        along_x = rng.random() < 0.5
        L = rng.uniform(0.9, 1.4)
        if along_x:
            mb.box(ax - L / 2, ay - 0.01, top - 0.01, ax + L / 2, ay + 0.01, top + 0.01, mi=AL)
        else:
            mb.box(ax - 0.01, ay - L / 2, top - 0.01, ax + 0.01, ay + L / 2, top + 0.01, mi=AL)
        for k in range(8):
            t = -L / 2 + (k + 0.5) * L / 8
            e = rng.uniform(0.14, 0.24) * (1.2 - 0.4 * k / 8)
            if along_x:
                mb.box(ax + t - 0.006, ay - e, top - 0.006, ax + t + 0.006, ay + e, top + 0.006, mi=AL)
            else:
                mb.box(ax - e, ay + t - 0.006, top - 0.006, ax + e, ay + t + 0.006, top + 0.006, mi=AL)
    # ベランダと洗濯物
    if floors >= 2 and detail and rng.random() < 0.55:
        c, (a, b), nrm = facades[front]
        bw = min(3.6, (b - a) - 1.0)
        bc = a + (b - a) * rng.uniform(0.35, 0.65)
        zb = base + storey
        _balcony(mb, front, c, bc - bw / 2, bc + bw / 2, zb, FW, AL)
        if rng.random() < 0.6:
            sx = 1 if front == "+x" else -1
            xp = c + sx * 0.5
            ya_, yb_ = bc - bw / 2 + 0.2, bc + bw / 2 - 0.2
            mb.box(xp - 0.015, ya_, zb + 1.72, xp + 0.015, yb_, zb + 1.75, mi=AL)
            y = ya_ + 0.1
            while y < yb_ - 0.35:
                w = rng.uniform(0.28, 0.6)
                hgt = rng.uniform(0.4, 0.9)
                col = rng.choice([(0.85, 0.85, 0.82), (0.25, 0.35, 0.55), (0.7, 0.2, 0.18), (0.9, 0.8, 0.5), (0.3, 0.3, 0.3),
                                  (0.55, 0.7, 0.8), (0.9, 0.6, 0.6)])
                z1 = zb + 1.72
                mb.face([(xp, y, z1), (xp + sx * 0.03, y + w, z1), (xp + sx * 0.05, y + w, z1 - hgt), (xp + sx * 0.02, y, z1 - hgt * rng.uniform(0.85, 1.0))], CL, col)
                y += w + rng.uniform(0.04, 0.2)
    # プロパンのボンベ（家の横）
    if detail and rng.random() < 0.35:
        sx = 1 if front == "+x" else -1
        px = (x1 - 1.2) if front == "+x" else (x0 + 1.2)
        for k in range(2):
            mb.cyl(px - sx * k * 0.42, y0 - 0.25, 0.0, 1.15, 0.17, seg=16, mi=PR)
            mb.cyl(px - sx * k * 0.42, y0 - 0.25, 1.15, 1.26, 0.17, 0.10, seg=16, mi=PR)
    ob = mb.finish("house", mats)
    if detail:
        HOUSE_UNITS.append((x0, y0, x1, y1, front))
    return ob, H


def _flat_on(mb, fk, c, a, b, z0, z1, depth, mi):
    if fk == "+x":
        mb.box(c, a, z0, c + depth, b, z1, mi=mi)
    elif fk == "-x":
        mb.box(c - depth, a, z0, c, b, z1, mi=mi)
    elif fk == "+y":
        mb.box(a, c, z0, b, c + depth, z1, mi=mi)
    else:
        mb.box(a, c - depth, z0, b, c, z1, mi=mi)


def _window(mb, fk, c, center, zc, ww, wh, gm, AL, SH, rng, PN=None):
    """窓: 奥の部屋かカーテン（壁の面）、5 cm 手前のガラス、アルミの枠と中桟。"""
    a, b = center - ww / 2, center + ww / 2
    z0, z1 = zc - wh / 2, zc + wh / 2
    f = 0.035
    _flat_on(mb, fk, c, a, b, z0, z1, 0.004, gm)
    for (pa, pb, qa, qb) in ((a - f, b + f, z0 - f, z0), (a - f, b + f, z1, z1 + f), (a - f, a, z0, z1), (b, b + f, z0, z1)):
        _flat_on(mb, fk, c, pa, pb, qa, qb, 0.07, AL)
    if gm != SH:
        if PN is not None:
            _pane(mb, fk, c + (0.05 if fk in ("+x", "+y") else -0.05), a, b, z0, z1, PN)
        m = (a + b) / 2
        _flat_on(mb, fk, c, m - 0.015, m + 0.015, z0, z1, 0.06, AL)
    # 戸袋
    if rng.random() < 0.4:
        _flat_on(mb, fk, c, b + f, b + f + 0.45, z0 - f, z1 + f, 0.12, SH)


def _pane(mb, fk, c, a, b, z0, z1, mi):
    if fk in ("+x", "-x"):
        mb.face([(c, a, z0), (c, b, z0), (c, b, z1), (c, a, z1)], mi)
    else:
        mb.face([(a, c, z0), (b, c, z0), (b, c, z1), (a, c, z1)], mi)


def _balcony(mb, fk, c, a, b, z, FW, AL):
    d = 0.9
    if fk == "+x":
        mb.box(c, a, z - 0.12, c + d, b, z, mi=FW)
        mb.box(c + d - 0.06, a, z, c + d, b, z + 1.0, mi=FW)
        mb.box(c, a, z, c + d, a + 0.06, z + 1.0, mi=FW)
        mb.box(c, b - 0.06, z, c + d, b, z + 1.0, mi=FW)
        mb.box(c + d - 0.08, a, z + 1.0, c + d + 0.02, b, z + 1.05, mi=AL)
    elif fk == "-x":
        mb.box(c - d, a, z - 0.12, c, b, z, mi=FW)
        mb.box(c - d, a, z, c - d + 0.06, b, z + 1.0, mi=FW)
        mb.box(c - d, a, z, c, a + 0.06, z + 1.0, mi=FW)
        mb.box(c - d, b - 0.06, z, c, b, z + 1.0, mi=FW)
        mb.box(c - d - 0.02, a, z + 1.0, c - d + 0.08, b, z + 1.05, mi=AL)


def _roof_slab(mb, top, th, mi, hd, pitch):
    """斜面の板（上面・下面・縁）。"""
    bot = [(x, y, z - th) for x, y, z in top]
    mb.face(top, mi, uvs=[roof_uv(p, hd, pitch) for p in top])
    mb.face(list(reversed(bot)), mi)
    for i in range(4):
        j = (i + 1) % 4
        mb.face([bot[i], bot[j], top[j], top[i]], mi)


# ------------------------------------------------------------------ 電柱と電線
POLE_X = 2.15
def _pole_ys():
    """電柱の位置: -16 と 14（カラスと音で使う）は固定し、ほかは 30±5 m で振る。"""
    rng = random.Random(SEED + 90)
    ys = [-16.0, 14.0]
    y = 14.0
    while y < 88:
        y += rng.uniform(25, 35)
        ys.append(y)
    y = -16.0
    while y > -205:
        y -= rng.uniform(25, 35)
        ys.append(y)
    return sorted(v for v in ys if -212 < v < 92)


POLE_YS = _pole_ys()
WIRES = [  # (x のずれ, 電柱での高さ, たるみ, 太さ)
    (-0.75, 10.42, 0.35, 0.005), (0.0, 10.42, 0.35, 0.005), (0.75, 10.42, 0.35, 0.005),
    (-0.6, 9.72, 0.38, 0.005), (0.6, 9.72, 0.38, 0.005),
    (-0.28, 8.0, 0.45, 0.011), (0.28, 6.4, 0.5, 0.019), (0.32, 6.0, 0.55, 0.011),
]


def wire_z(wi, y):
    dx, z0, sag, r = WIRES[wi]
    k = max(i for i, p in enumerate(POLE_YS) if p <= y) if y >= POLE_YS[0] else 0
    a = POLE_YS[k]
    b = POLE_YS[min(k + 1, len(POLE_YS) - 1)]
    u = (y - a) / (b - a) if b > a else 0
    return z0 - sag * 4 * u * (1 - u)


def build_poles():
    mb = MB()
    det = MB()
    gd = MB()
    for i, py in enumerate(POLE_YS):
        x = POLE_X
        mb.cyl(x, py, -0.1, 11.0, 0.165, 0.11, seg=20, mi=0)
        # 腕木と碍子
        det.box(x - 1.0, py - 0.045, 10.22, x + 1.0, py + 0.045, 10.30, mi=0)
        det.box(x - 0.8, py - 0.04, 9.52, x + 0.8, py + 0.04, 9.60, mi=0)
        det.box(x - 0.9, py - 0.015, 9.6, x - 0.88, py + 0.015, 10.22, mi=0)
        for dx in (-0.75, 0.0, 0.75):
            for k3 in range(3):
                det.cyl(x + dx, py, 10.30 + k3 * 0.04, 10.33 + k3 * 0.04, 0.045, seg=10, mi=1)
                det.cyl(x + dx, py, 10.33 + k3 * 0.04, 10.34 + k3 * 0.04, 0.025, seg=8, mi=1)
        for dx in (-0.6, 0.6):
            for k3 in range(3):
                det.cyl(x + dx, py, 9.60 + k3 * 0.04, 9.63 + k3 * 0.04, 0.04, seg=10, mi=1)
                det.cyl(x + dx, py, 9.63 + k3 * 0.04, 9.64 + k3 * 0.04, 0.022, seg=8, mi=1)
        # 足場ボルト
        z = 2.5
        k = 0
        while z < 9.3:
            s = 1 if k % 2 == 0 else -1
            det.box(x - 0.01, py + s * 0.11, z - 0.01, x + 0.01, py + s * 0.30, z + 0.01, mi=0)
            z += 0.45
            k += 1
        # 変圧器（目の前の 1 本と、3 本に 1 本くらい）
        if py == 14 or (i % 3 == 0 and py != -16):
            det.cyl(x + 0.42, py, 7.2, 8.15, 0.21, seg=16, mi=2)
            det.cyl(x + 0.42, py, 8.15, 8.25, 0.23, 0.18, seg=16, mi=2)
            det.box(x + 0.12, py - 0.04, 7.5, x + 0.2, py + 0.04, 7.9, mi=0)
        # 防犯灯
        if i % 2 == 1:
            det.box(x - 0.75, py - 0.02, 4.55, x - 0.1, py + 0.02, 4.6, mi=0)
            det.box(x - 0.95, py - 0.07, 4.5, x - 0.6, py + 0.07, 4.58, mi=2)
            det.box(x - 0.93, py - 0.055, 4.495, x - 0.62, py + 0.055, 4.5, mi=3)
        # 支線ガードの代わりにトラ柄の巻き
        gd.cyl(x, py, 0.1, 1.9, 0.172, 0.168, seg=20)
    mb.finish("poles", [M["pole"]], smooth=True)
    det.finish("pole_details", [M["steel"], M["insul"], M["propane"], M["lamp"]])
    g = gd.finish("pole_guards", [M["guard"]], smooth=True)

    # 電線（放物線で近似したたるみ）
    for wi, (dx, z0, sag, r) in enumerate(WIRES):
        cu = bpy.data.curves.new(f"wire{wi}", "CURVE")
        cu.dimensions = "3D"
        cu.bevel_depth = r
        cu.bevel_resolution = 1
        perches = [yy for (spot, yy, _) in T.CROW_SPOTS if spot == f"wire{wi}"]
        for a, b in zip(POLE_YS, POLE_YS[1:]):
            sp = cu.splines.new("POLY")
            n = 160 if any(a <= yy <= b for yy in perches) else 24
            sp.points.add(n - 1)
            for k in range(n):
                u = k / (n - 1)
                y = a + (b - a) * u
                z = z0 - sag * 4 * u * (1 - u)
                for yy in perches:
                    z -= CROW_DIP * math.exp(-((y - yy) / 0.35) ** 2)
                sp.points[k].co = (POLE_X + dx, y, z, 1.0)
        cu.materials.append(M["wire"])
        link(bpy.data.objects.new(f"wire{wi}", cu))


def service_drop(p, q, sag=0.25, r=0.006, name="drop"):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = r
    sp = cu.splines.new("POLY")
    n = 16
    sp.points.add(n - 1)
    for k in range(n):
        u = k / (n - 1)
        x = p[0] + (q[0] - p[0]) * u
        y = p[1] + (q[1] - p[1]) * u
        z = p[2] + (q[2] - p[2]) * u - sag * 4 * u * (1 - u)
        sp.points[k].co = (x, y, z, 1.0)
    cu.materials.append(M["wire"])
    return link(bpy.data.objects.new(name, cu))


# ------------------------------------------------------------------ 柿の木
def smooth_branch(pts, rad, sub=4):
    """Catmull-Rom で点を増やす（角を消す）。太さは根元から先へ滑らかに細くする。"""
    P = [pts[0]] + list(pts) + [pts[-1]]
    out, orad = [], []
    n = len(pts)
    for i in range(n - 1):
        p0, p1, p2, p3 = P[i], P[i + 1], P[i + 2], P[i + 3]
        for k in range(sub):
            t = k / sub
            t2, t3 = t * t, t * t * t
            q = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
            out.append(q)
            orad.append(rad[i] + (rad[i + 1] - rad[i]) * t)
    out.append(pts[-1])
    orad.append(rad[-1] * 0.6)
    return out, orad


def persimmon_tree(base):
    """柿の木: ジグザグに折れる枝（折れ線のカーブ）、色づいた葉、実。"""
    rng = random.Random(SEED + 7)
    branches = []
    tips = []

    def clear(cur):
        # 塀の上の猫の通り道をよける
        if -2.8 < cur.x < -1.9 and 0.8 < cur.y < 6.2 and cur.z < 1.78:
            cur.z = 1.78 + rng.uniform(0, 0.12)
        # 最後に座って夕日を見る視界（道の上）を枝でふさがない
        if cur.x > -2.25 and cur.y < 4.7 and cur.z < 2.55:
            cur.z = 2.55 + rng.uniform(0, 0.15)
        return cur

    def grow(p, d, length, r0, depth):
        n = 6 if depth < 3 else 4
        pts = [Vector(p)]
        rad = [r0]
        cur = Vector(p)
        dv = Vector(d).normalized()
        for i in range(n):
            # 節ごとに向きを折る（柿の枝のジグザグ）
            axis = Vector((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1))).cross(dv).normalized()
            dv = (Matrix.Rotation(math.radians(rng.uniform(8, 20)), 3, axis) @ dv)
            dv = (dv + Vector((0, 0, -0.06 * depth))).normalized()
            seg = length / n * rng.uniform(0.8, 1.2)
            cur = clear(cur + dv * seg)
            pts.append(cur.copy())
            rad.append(max(0.003, r0 * (1 - 0.65 * (i + 1) / n)))
        branches.append((pts, rad))
        if depth < 4:
            nch = {1: 3, 2: 3, 3: 2}[depth]
            for c in range(nch):
                k = rng.randint(2, n)
                axis = Vector((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1))).normalized()
                nd = (Matrix.Rotation(math.radians(rng.uniform(30, 60)), 3, axis) @ dv).normalized()
                nd.z = max(nd.z, -0.1)
                grow(pts[k], nd, length * rng.uniform(0.45, 0.65), rad[k] * 0.75, depth + 1)
        if depth >= 3:
            tips.append((pts, dv))

    b = Vector(base)
    trunk = [b, b + Vector((0.06, 0.02, 0.45)), b + Vector((0.03, 0.08, 0.9)), b + Vector((0.18, 0.05, 1.25)), b + Vector((0.25, 0.1, 1.42))]
    branches.append((trunk, [0.12, 0.10, 0.09, 0.085, 0.075]))
    trunk_top = trunk[-1]
    mains = [Vector((1.0, -0.15, 0.5)), Vector((0.7, -0.75, 0.6)), Vector((-0.6, 0.5, 0.8)),
             Vector((0.35, 0.9, 0.65)), Vector((-0.45, -0.8, 0.9))]
    for d in mains:
        grow(trunk_top, d, rng.uniform(1.8, 2.4), 0.055, 1)
    # 猫の通り道の近くに実をいくつか確実に置き、近くの枝から小枝を伸ばしてつなぐ
    fixed = [Vector(fp) for fp in [(-2.62, 3.25, 1.83), (-2.58, 3.55, 1.95), (-2.75, 3.4, 1.74), (-2.12, 4.6, 2.02),
                                    (-2.45, 2.7, 1.98)]]
    for fp in fixed:
        top = fp + Vector((0, 0, 0.06))
        best = None
        for pts, rad in branches:
            for p, r in zip(pts, rad):
                if r < 0.03 and not (-2.8 < p.x < -1.9 and p.z < 1.78):
                    d = (p - top).length
                    if best is None or d < best[0]:
                        best = (d, p, r)
        _, p, r = best
        mid = p + (top - p) * 0.5 + Vector((rng.gauss(0, 0.04), rng.gauss(0, 0.04), 0.08))
        tw = [p.copy(), mid, top]
        branches.append((tw, [min(r, 0.010), 0.007, 0.004]))
        tips.append((tw, (top - p).normalized()))
    # 枝（折れ線のカーブ）
    cu = bpy.data.curves.new("persimmon_branches", "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = 1.0
    cu.bevel_resolution = 1
    cu.use_fill_caps = True
    for pts, rad in branches:
        sp = cu.splines.new("POLY")
        dp, dr = smooth_branch(pts, rad)
        sp.points.add(len(dp) - 1)
        for k, (p, r) in enumerate(zip(dp, dr)):
            sp.points[k].co = (p.x, p.y, p.z, 1.0)
            sp.points[k].radius = r
    cu.materials.append(M["bark"])
    link(bpy.data.objects.new("persimmon_branches", cu))

    # 葉と実（晩秋なので葉は少なめ）
    lm = MB()
    fm = MB()
    cm = MB()
    fruits = []
    for pts, dv in tips:
        for k in range(1, len(pts)):
            q = pts[k - 1].lerp(pts[k], rng.random())
            for _ in range(2):
                if rng.random() < 0.42:
                    nrm = (rng.gauss(0, 0.6), rng.gauss(0, 0.6), 1.0)
                    ax = (dv.x + rng.gauss(0, 0.7), dv.y + rng.gauss(0, 0.7), -0.4 + rng.gauss(0, 0.4))
                    add_leaf(lm, q, nrm, ax, rng.uniform(0.08, 0.12), rng.uniform(0.05, 0.07),
                             jitter_col(rng, 0.15, rng.choice(LEAF_AUTUMN)), rng.uniform(0.15, 0.35),
                             shape=rng.randrange(4), twist=rng.uniform(-0.3, 0.3))
        if rng.random() < 0.6:
            q = pts[-1] if rng.random() < 0.5 else pts[len(pts) // 2]
            fruits.append(q + Vector((rng.gauss(0, 0.02), rng.gauss(0, 0.02), -0.045)))
    fruits += fixed
    TREE_TIPS.extend(p[-1].copy() for p, _ in tips)
    kept = []
    for q in reversed(fruits):
        if all((q - k).length > 0.09 for k in kept):
            kept.append(q)
    fruits = kept
    for q in fruits:
        r = rng.uniform(0.033, 0.042)
        col = jitter_col(rng, 0.1, (0.92, 0.32, 0.03) if rng.random() < 0.7 else (0.85, 0.42, 0.05))
        sph = bmesh.ops.create_uvsphere(fm.bm, u_segments=28, v_segments=18, radius=r)
        rot0 = rng.uniform(0, math.pi / 2)
        for v in sph["verts"]:
            # 上下を 0.8 倍につぶし、4 本の浅い溝を付ける（極に近いほど溝は浅い）
            ang = math.atan2(v.co.y, v.co.x) + rot0
            sinth = math.sqrt(max(0.0, 1 - (v.co.z / r) ** 2))
            groove = 1 - 0.045 * (1 - (math.cos(4 * ang) + 1) / 2) ** 2 * sinth
            v.co.x *= groove
            v.co.y *= groove
            v.co.z *= 0.8
            if v.co.z > 0:
                v.co.z *= 1 - 0.18 * (1 - sinth)
            v.co += q
        for f in {f for v in sph["verts"] for f in v.link_faces}:
            for lp in f.loops:
                lp[fm.coll] = (*col, 1.0)
        # へた
        for i in range(4):
            ang = i * math.pi / 2 + rng.uniform(-0.2, 0.2)
            d = Vector((math.cos(ang), math.sin(ang), 0.15))
            add_leaf_simple(cm, q + Vector((0, 0, r * 0.68)), (0, 0, 1), d, r * 0.95, r * 0.75, (1, 1, 1), 0.25)
        cm.cyl(q.x, q.y, q.z + r * 0.8, q.z + r * 0.8 + 0.03, 0.004, seg=5)
    lm.finish("persimmon_leaves", [M["leaf"]])
    fo = fm.finish("persimmons", [M["fruit"]], smooth=True)
    cm.finish("persimmon_calyx", [M["calyx"]])
    return fruits


def fallen_leaves():
    rng = random.Random(SEED + 9)
    mb = MB()
    cols = LEAF_FALLEN + [(0.30, 0.20, 0.08), (0.62, 0.45, 0.10), (0.40, 0.10, 0.04), (0.22, 0.14, 0.07)]

    def put(x, y, z):
        k = rng.uniform(0.6, 1.2)
        nrm = (rng.gauss(0, 0.05), rng.gauss(0, 0.05), 1.0)
        ax = (rng.gauss(0, 1), rng.gauss(0, 1), 0)
        add_leaf(mb, (x, y, z + rng.uniform(0.001, 0.004)), nrm, ax, 0.10 * k, 0.065 * k,
                 jitter_col(rng, 0.2, rng.choice(cols)), rng.uniform(0.10, 0.35), shape=rng.randrange(4),
                 twist=rng.uniform(-0.4, 0.4))

    def drop(n, xr, yr, z, edge=None, avoid=None):
        """edge=(x の端, 内側への向き): 8 割を端から 0.3 m 以内に寄せる。"""
        for i in range(n):
            y = rng.uniform(*yr)
            if edge is not None and rng.random() < 0.8:
                x = edge[0] + edge[1] * abs(rng.gauss(0, 0.12))
            else:
                x = rng.uniform(*xr)
            if avoid and avoid[0] < y < avoid[1] and xr[0] <= x <= xr[1] and z > 1:
                continue
            put(x, y, z)
    drop(16, (-2.42, -2.30), (1.9, 7.5), T.WALL_TOP, avoid=(4.3, 5.8))   # 塀の上（座る所の前は空ける）
    drop(260, (-7.0, -2.5), (0.5, 9.0), 0.02, edge=(-2.45, -1))          # 庭（塀の根元に寄る）
    drop(90, (-2.29, -1.7), (-6.0, 12.0), 0.012, edge=(-2.28, 1))       # 側溝のふた（塀の根元に寄る）
    drop(40, (-2.0, 2.0), (-6.0, 16.0), 0.0, edge=(-1.98, 1))           # 道（路肩に寄る）
    drop(20, (1.7, 2.29), (-4.0, 12.0), 0.012, edge=(2.28, -1))
    mb.finish("fallen_leaves", [M["fallen"]])


# ------------------------------------------------------------------ 自動販売機（銘柄なし）
def vending_machine(x_front, yc):
    rng = random.Random(SEED + 11)
    mb = MB()
    W, D, H = 1.0, 0.72, 1.83
    x0, x1 = x_front, x_front + D
    y0, y1 = yc - W / 2, yc + W / 2
    BODY, BAND, BACK, GLASS, LABEL, BTN, DARK, PROD = range(8)
    mb.box(x0 + 0.02, y0, 0.05, x1, y1, H, mi=BODY)
    mb.box(x0, y0, 0.0, x1, y1, 0.06, mi=DARK)
    mb.box(x0 - 0.005, y0 + 0.03, 1.72, x0 + 0.02, y1 - 0.03, 1.80, mi=BAND)
    # 見本の棚: 奥の光る板、各段の上の光の帯、棚板
    mb.box(x0 + 0.20, y0 + 0.06, 0.98, x0 + 0.21, y1 - 0.06, 1.70, mi=BACK)
    for zr in (1.0, 1.23, 1.46):
        mb.box(x0 + 0.03, y0 + 0.06, zr - 0.012, x0 + 0.20, y1 - 0.06, zr, mi=BODY)
        mb.box(x0 + 0.03, y0 + 0.06, zr + 0.205, x0 + 0.05, y1 - 0.06, zr + 0.215, mi=BACK)
    # 側面の内張り（暗い）と前面のガラス
    mb.box(x0 + 0.02, y0 + 0.05, 0.98, x0 + 0.21, y0 + 0.06, 1.70, mi=DARK)
    mb.box(x0 + 0.02, y1 - 0.06, 0.98, x0 + 0.21, y1 - 0.05, 1.70, mi=DARK)
    mb.face([(x0 - 0.002, y0 + 0.06, 0.98), (x0 - 0.002, y1 - 0.06, 0.98), (x0 - 0.002, y1 - 0.06, 1.70), (x0 - 0.002, y0 + 0.06, 1.70)], GLASS)
    pal = [(0.85, 0.1, 0.08), (0.1, 0.3, 0.7), (0.95, 0.85, 0.2), (0.1, 0.5, 0.2), (0.92, 0.92, 0.92),
           (0.45, 0.25, 0.1), (0.95, 0.5, 0.1), (0.15, 0.15, 0.15), (0.6, 0.8, 0.95), (0.55, 0.75, 0.25)]
    pm = []
    for i, c in enumerate(pal):
        pm.append(simple(f"product{i}", c, 0.3, metallic=0.25 if i % 3 == 0 else 0.0, coat=0.5))
    CAP = PROD + len(pal)
    LIQ = CAP + 1
    for zr in (1.0, 1.23, 1.46):
        n = 8
        for k in range(n):
            yy = y0 + 0.1 + (k + 0.5) * (W - 0.2) / n
            xc = x0 + 0.11
            lab = PROD + rng.randrange(len(pal))
            if rng.random() < 0.45:
                # 缶: 上下の金属のふち、胴はラベル
                mb.cyl(xc, yy, zr, zr + 0.008, 0.029, seg=14, mi=CAP)
                mb.cyl(xc, yy, zr + 0.008, zr + 0.115, 0.031, seg=14, mi=lab)
                mb.cyl(xc, yy, zr + 0.115, zr + 0.124, 0.031, 0.026, seg=14, mi=CAP)
            else:
                # ボトル: 胴（ラベルの帯）、肩、首、キャップ
                mb.cyl(xc, yy, zr, zr + 0.04, 0.032, seg=14, mi=LIQ)
                mb.cyl(xc, yy, zr + 0.04, zr + 0.11, 0.032, seg=14, mi=lab)
                mb.cyl(xc, yy, zr + 0.11, zr + 0.15, 0.032, 0.014, seg=14, mi=LIQ)
                mb.cyl(xc, yy, zr + 0.15, zr + 0.17, 0.014, seg=10, mi=LIQ)
                mb.cyl(xc, yy, zr + 0.17, zr + 0.185, 0.0155, seg=10, mi=lab)
            # 値札（光る白）とボタン
            mb.box(x0 - 0.003, yy - 0.028, zr - 0.034, x0 + 0.004, yy + 0.028, zr - 0.016, mi=LABEL)
            mb.box(x0 - 0.006, yy - 0.013, zr - 0.062, x0 + 0.004, yy + 0.013, zr - 0.044, mi=BTN)
    # 硬貨の投入口・返却口・お札の口・取り出し口（ふた）
    mb.box(x0 - 0.02, y1 - 0.32, 0.80, x0 + 0.02, y1 - 0.08, 0.95, mi=BODY)
    mb.box(x0 - 0.024, y1 - 0.20, 0.90, x0 - 0.019, y1 - 0.16, 0.92, mi=DARK)
    mb.box(x0 - 0.024, y1 - 0.29, 0.84, x0 - 0.019, y1 - 0.22, 0.86, mi=DARK)
    mb.box(x0 - 0.024, y1 - 0.15, 0.83, x0 - 0.019, y1 - 0.11, 0.88, mi=DARK)
    mb.box(x0 - 0.01, y0 + 0.15, 0.12, x0 + 0.02, y1 - 0.15, 0.36, mi=DARK)
    mb.box(x0 - 0.025, y0 + 0.17, 0.30, x0 - 0.005, y1 - 0.17, 0.35, mi=BODY)
    mb.box(x0 - 0.015, y0 + 0.18, 0.14, x0 - 0.005, y1 - 0.18, 0.29, mi=CAP)
    liq = simple("bottle_tea", (0.55, 0.32, 0.08), 0.1, transmission=0.6)
    mats = [M["vm_body"], M["vm_band"], M["vm_back"], M["vm_glass"], M["vm_label"], M["vm_button"], M["dark"]] + pm + [M["alu"], liq]
    mb.finish("vending_machine", mats, bevel=0.005)
    # 前の地面を照らす光（6000 K ほど）
    ld = bpy.data.lights.new("vm_light", "AREA")
    ld.energy = 25.0
    ld.size = 0.9
    ld.color = (0.92, 0.96, 1.0)
    lo = bpy.data.objects.new("vm_light", ld)
    lo.location = (x0 - 0.02, yc, 1.3)
    lo.rotation_euler = (0, math.radians(-90 - 30), 0)
    link(lo)
    # 空き缶入れ
    mb = MB()
    mb.box(x0 + 0.05, y0 - 0.45, 0.0, x0 + 0.40, y0 - 0.08, 0.80, mi=0)
    mb.cyl(x0 + 0.05, y0 - 0.265, 0.62, 0.70, 0.05, seg=12, mi=1, caps=False)
    mb.finish("can_bin", [M["vm_body"], M["dark"]], bevel=0.01)


# ------------------------------------------------------------------ カーブミラー
def curve_mirror(x, y, face_yaw):
    mb = MB()
    mb.cyl(x, y, 0.0, 3.0, 0.038, seg=12, mi=0)
    mb.finish("mirror_pole", [M["orange_pole"]], smooth=True)
    mb = MB()
    bm = mb.bm
    res = bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=48, radius=1.2)
    # 球の一部（凸面鏡）
    keep = [v for v in res["verts"] if v.co.y < -1.14]
    bmesh.ops.delete(bm, geom=[v for v in res["verts"] if v not in keep], context="VERTS")
    for v in bm.verts:
        v.co.y += 1.2
    for f in bm.faces:
        f.material_index = 0
    ob = mb.finish("mirror", [M["mirror"]], smooth=True)
    ob.location = (x, y - 0.05, 2.7)
    ob.rotation_euler = (0, 0, math.radians(face_yaw))
    mb = MB()
    mb.cyl(0, 0, -0.02, 0.0, 0.36, seg=32)
    rim = mb.finish("mirror_back", [M["orange_pole"]])
    rim.location = (x, y - 0.02, 2.7)
    rim.rotation_euler = (math.radians(90), 0, math.radians(face_yaw))


# ------------------------------------------------------------------ 写真スキャンのモデル
MODEL_COLL = {}


def import_model(aid):
    """glTF を読み込み、部品ごとのコレクション（原点に置く）を返す。"""
    if aid in MODEL_COLL:
        return MODEL_COLL[aid]
    path = os.path.join(ASSETS, MANIFEST["models"][aid]["gltf"])
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    lib = bpy.data.collections.get("library") or bpy.data.collections.new("library")
    if lib.name not in [c.name for c in scene.collection.children]:
        scene.collection.children.link(lib)
    lib.hide_render = True
    lib.hide_viewport = True
    parts = {}
    for o in new:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        if o.type != "MESH":
            continue
        name = o.name
        # 部品の名前（_a_LOD0 など）で分ける
        key = "all"
        for tag in ("_a_", "_b_", "_c_", "_d_", "_e_", "_f_", "large_a", "large_b", "large_c", "mid_a", "mid_b", "mid_c",
                    "small_a", "small_b", "tall_a", "tall_b", "tall_c", "rusted"):
            if tag in name:
                key = tag
        if aid == "exterior_aircon_unit":
            key = "rusted" if "rusted" in name else "clean"
        c = parts.get(key)
        if c is None:
            c = bpy.data.collections.new(f"{aid}:{key}")
            lib.children.link(c)
            parts[key] = c
        if key != "all":
            o.location.x = 0.0
            o.location.y = 0.0
        c.objects.link(o)
    MODEL_COLL[aid] = parts
    return parts


def place(coll, loc, rot_z=0.0, scale=1.0, name="inst"):
    e = bpy.data.objects.new(name, None)
    e.instance_type = "COLLECTION"
    e.instance_collection = coll
    e.location = loc
    e.rotation_euler = (0, 0, rot_z)
    e.scale = (scale, scale, scale)
    link(e)
    return e


# 手続きの代わり（--no-scans のとき）
def proc_pot(loc, h=0.3, r=0.16, rng=None, plant=True, color=(0.45, 0.20, 0.10)):
    rng = rng or random.Random(SEED)
    mb = MB()
    mb.cyl(loc[0], loc[1], loc[2], loc[2] + h, r * 0.75, r, seg=24, mi=0)
    mb.cyl(loc[0], loc[1], loc[2] + h - 0.03, loc[2] + h, r + 0.012, r + 0.012, seg=24, mi=0)
    mb.cyl(loc[0], loc[1], loc[2] + h - 0.04, loc[2] + h - 0.035, r * 0.95, seg=20, mi=1)
    pot = simple(f"pot_{len(bpy.data.materials)}", color, 0.7, noise_amt=0.0)
    mb.finish("pot", [pot, M["dark"]], smooth=True)
    if plant:
        lm = MB()
        top = Vector((loc[0], loc[1], loc[2] + h - 0.04))
        for i in range(rng.randint(40, 90)):
            d = Vector((rng.gauss(0, 0.4), rng.gauss(0, 0.4), rng.uniform(0.4, 1.0))).normalized()
            L = rng.uniform(0.12, 0.35) * (h / 0.3)
            p = top + d * L
            add_leaf_simple(lm, p, (rng.gauss(0, 0.3), rng.gauss(0, 0.3), 1), (d.x, d.y, rng.uniform(-0.5, 0.2)),
                     rng.uniform(0.07, 0.14), rng.uniform(0.03, 0.06), jitter_col(rng, 0.25, rng.choice(LEAF_GREEN)), 0.2)
            lm.cyl(top.x + d.x * L * 0.1, top.y + d.y * L * 0.1, top.z, p.z, 0.003, seg=4, mi=0, caps=False)
        lm.finish("pot_plant", [M["hedge"]])


def proc_weed(loc, rng, size=0.18):
    mb = MB()
    for i in range(rng.randint(12, 28)):
        a = rng.uniform(0, 2 * math.pi)
        lean = rng.uniform(0.1, 0.7)
        L = rng.uniform(0.5, 1.0) * size
        w = rng.uniform(0.006, 0.012)
        b0 = Vector(loc)
        d = Vector((math.cos(a) * lean, math.sin(a) * lean, 1)).normalized()
        side = Vector((-math.sin(a), math.cos(a), 0)) * w
        tip = b0 + d * L + Vector((0, 0, -lean * L * 0.25))
        col = jitter_col(rng, 0.2, rng.choice(LEAF_GREEN + [(0.25, 0.22, 0.08), (0.3, 0.25, 0.1)]))
        mb.face([b0 - side, b0 + side, tip], 0, col)
    mb.finish("weed", [M["hedge"]])


def proc_aircon(loc, rot_z):
    mb = MB()
    mb.box(-0.4, -0.15, 0, 0.4, 0.15, 0.6, mi=0)
    ob = mb.finish("aircon", [M["vm_body"]], bevel=0.01)
    ob.location = loc
    ob.rotation_euler = (0, 0, rot_z)
    g = MB()
    for i in range(6):
        r = 0.05 + i * 0.04
        g.cyl(0, 0, 0, 0.01, r, seg=24, mi=0, caps=False)
    go = g.finish("aircon_grille", [M["dark"]])
    go.parent = ob
    go.location = (-0.12, -0.155, 0.3)
    go.rotation_euler = (math.radians(90), 0, 0)


def scatter_model(aid, keys, positions, rng, scale=(0.8, 1.2)):
    parts = import_model(aid)
    for p in positions:
        k = rng.choice(keys)
        place(parts[k], p, rng.uniform(0, 2 * math.pi), rng.uniform(*scale), name=aid)


# ------------------------------------------------------------------ 暮らしの物: 軽自動車（銘柄なし）・自転車
def kei_car(x, y, yaw, color):
    """箱型の軽自動車（どの実在の車種にも寄せない一般的な形。印や文字はない）。"""
    paint = simple(f"car_paint_{len(bpy.data.materials)}", color, 0.25, coat=0.8)
    glass = simple("car_glass", (0.01, 0.012, 0.014), 0.03)
    glass.node_tree.nodes["Principled BSDF"].inputs["Specular IOR Level"].default_value = 0.8
    tire = simple("tire", (0.02, 0.02, 0.02), 0.85)
    lamp_f = simple("car_lamp_f", (0.9, 0.9, 0.85), 0.1, coat=1.0)
    lamp_r = simple("car_lamp_r", (0.5, 0.03, 0.02), 0.2, coat=1.0)
    mb = MB()
    L, W = 3.35, 1.46
    # 下の車体
    mb.box(-W / 2, -L / 2, 0.20, W / 2, L / 2, 0.86, mi=0)
    # 窓のある上の部分（前を斜めに）
    bot = [(-W / 2 + 0.05, -L / 2 + 0.05, 0.86), (W / 2 - 0.05, -L / 2 + 0.05, 0.86), (W / 2 - 0.05, L / 2 - 0.55, 0.86), (-W / 2 + 0.05, L / 2 - 0.55, 0.86)]
    top = [(-W / 2 + 0.10, -L / 2 + 0.10, 1.62), (W / 2 - 0.10, -L / 2 + 0.10, 1.62), (W / 2 - 0.10, L / 2 - 1.15, 1.62), (-W / 2 + 0.10, L / 2 - 1.15, 1.62)]
    for i in range(4):
        j = (i + 1) % 4
        mb.face([bot[i], bot[j], top[j], top[i]], 1)
    mb.face(top, 0)
    # ボンネット
    mb.face([(-W / 2, L / 2 - 0.55, 0.86), (W / 2, L / 2 - 0.55, 0.86), (W / 2, L / 2, 0.80), (-W / 2, L / 2, 0.80)], 0)
    # 柱（窓の間）
    for yy in (-L / 2 + 0.12, -0.35, 0.45):
        mb.box(-W / 2 + 0.04, yy - 0.04, 0.86, W / 2 - 0.04, yy + 0.04, 1.58, mi=0)
    # 灯火
    for sx in (-1, 1):
        mb.box(sx * W / 2 - sx * 0.28 - 0.1, L / 2 - 0.005, 0.66, sx * W / 2 - sx * 0.28 + 0.1, L / 2 + 0.01, 0.76, mi=3)
        mb.box(sx * W / 2 - sx * 0.12 - 0.06, -L / 2 - 0.01, 0.62, sx * W / 2 - sx * 0.12 + 0.06, -L / 2 + 0.005, 0.86, mi=4)
    # バンパー
    mb.box(-W / 2 - 0.01, L / 2 - 0.1, 0.20, W / 2 + 0.01, L / 2 + 0.04, 0.42, mi=2)
    mb.box(-W / 2 - 0.01, -L / 2 - 0.04, 0.20, W / 2 + 0.01, -L / 2 + 0.1, 0.40, mi=2)
    body = mb.finish("kei_car", [paint, glass, tire, lamp_f, lamp_r], bevel=0.05, seg=3)
    body.location = (x, y, 0.0)
    body.rotation_euler = (0, 0, yaw)
    # 車輪（x 軸まわりの円柱を回して置く）
    wm = MB()
    for sx in (-1, 1):
        for yy in (-L / 2 + 0.55, L / 2 - 0.62):
            wm.cyl(0, 0, -0.085, 0.085, 0.27, seg=20, mi=0)
            for v in list(wm.bm.verts)[-40:]:
                v.co = Vector((v.co.z + sx * (W / 2 - 0.12), v.co.y + yy, v.co.x + 0.27))
    wheels = wm.finish("kei_wheels", [tire], smooth=True)
    wheels.parent = body


def bicycle(x, y, yaw, color):
    """自転車（細いカーブで車輪と骨組み）。"""
    frame = simple(f"bike_{len(bpy.data.materials)}", color, 0.35, coat=0.5)
    def tube(name, pts, r, mat):
        cu = bpy.data.curves.new(name, "CURVE")
        cu.dimensions = "3D"
        cu.bevel_depth = r
        cu.bevel_resolution = 2
        sp = cu.splines.new("POLY")
        sp.points.add(len(pts) - 1)
        for i, q in enumerate(pts):
            sp.points[i].co = (*q, 1.0)
        cu.materials.append(mat)
        return link(bpy.data.objects.new(name, cu))
    root = bpy.data.objects.new("bicycle", None)
    link(root)
    root.location = (x, y, 0)
    root.rotation_euler = (0, math.radians(8), yaw)
    R0 = 0.33
    for cy in (-0.52, 0.52):
        ring = [(0, cy + R0 * math.cos(a), R0 + R0 * math.sin(a)) for a in [2 * math.pi * k / 32 for k in range(33)]]
        tube("tire", ring, 0.016, M["dark"]).parent = root
        for k in range(12):
            a = math.pi * k / 6
            tube("spoke", [(0, cy, R0), (0, cy + R0 * math.cos(a), R0 + R0 * math.sin(a))], 0.0015, M["alu"]).parent = root
    for pts in ([(0, -0.52, R0), (0, -0.12, 0.30), (0, 0.38, 0.72)], [(0, -0.12, 0.30), (0, -0.2, 0.78)],
                [(0, -0.2, 0.72), (0, 0.38, 0.72)], [(0, 0.52, R0), (0, 0.40, 0.80), (0, 0.38, 0.95)],
                [(0, -0.52, R0), (0, -0.2, 0.72)]):
        tube("frame", pts, 0.014, frame).parent = root
    tube("bar", [(-0.28, 0.36, 0.97), (0, 0.38, 0.95), (0.28, 0.36, 0.97)], 0.011, M["alu"]).parent = root
    tube("saddle", [(0, -0.30, 0.82), (0, -0.14, 0.82)], 0.03, M["dark"]).parent = root
    # 前かご
    mb = MB()
    mb.box(-0.17, 0.48, 0.80, 0.17, 0.78, 0.82)
    for k in range(5):
        yy = 0.48 + k * 0.075
        mb.box(-0.17, yy - 0.003, 0.82, 0.17, yy + 0.003, 1.02)
    for xx in (-0.17, 0.17):
        mb.box(xx - 0.003, 0.48, 0.82, xx + 0.003, 0.78, 1.02)
    basket = mb.finish("basket", [M["alu"]])
    basket.parent = root


# ------------------------------------------------------------------ 道の突き当たりと遠くの山
def road_ends():
    rng = random.Random(SEED + 95)
    # 奥（+Y）の丁字路の向こう: 生垣と家
    hedge(-7.0, Y_MAX + 4.2, 7.0, Y_MAX + 4.9, 1.4)
    house(-6.0, Y_MAX + 6.5, 6.5, Y_MAX + 14.0, 2, rng, "-x", WALLS[8], GALVA[0], roof_type="gable")
    house(-20.0, Y_MAX + 5.5, -9.0, Y_MAX + 13.0, 2, rng, "+x", WALLS[3], M["roof"], roof_type="hip")
    house(9.0, Y_MAX + 5.5, 19.0, Y_MAX + 13.0, 1, rng, "-x", WALLS[1], M["roof2"], roof_type="gable")
    # 手前（-Y、太陽の側）の丁字路の向こう
    hedge(-8.0, Y_MIN - 5.0, 8.0, Y_MIN - 4.3, 1.3)
    house(-7.0, Y_MIN - 14.0, 6.0, Y_MIN - 6.0, 2, rng, "+x", WALLS[2], M["roof"], roof_type="hip")
    house(10.0, Y_MIN - 13.0, 20.0, Y_MIN - 6.0, 2, rng, "-x", WALLS[9], GALVA[2], roof_type="gable")
    house(-22.0, Y_MIN - 13.0, -11.0, Y_MIN - 6.0, 2, rng, "+x", WALLS[0], M["roof3"], roof_type="gable")


def mountains():
    """遠くの低い山の稜線（3 枚）。遠いほど空の色に近づける。"""
    rng = random.Random(SEED + 99)
    for side, base_y in ((1, 2300.0), (-1, -2600.0), (1, 4200.0), (-1, -4600.0)):
        far = abs(base_y) > 3000
        col = (0.20, 0.23, 0.28) if far else (0.07, 0.09, 0.08)
        m = simple(f"mountain_{side}_{int(abs(base_y))}", col, 0.95)
        b = m.node_tree.nodes["Principled BSDF"]
        b.inputs["Emission Color"].default_value = (0.55, 0.58, 0.68, 1) if side > 0 else (0.75, 0.62, 0.55, 1)
        b.inputs["Emission Strength"].default_value = 0.10 if far else 0.04
        mb = MB()
        xs = [-6000 + 120 * k for k in range(101)]
        ph = [rng.uniform(0, 6.28) for _ in range(4)]
        def h(x):
            v = 0.0
            for k, (f, a) in enumerate(((1 / 2600, 0.8), (1 / 1100, 0.6), (1 / 420, 0.35), (1 / 150, 0.12))):
                v += a * math.sin(2 * math.pi * f * x + ph[k])
            return (110 if not far else 170) + (45 if not far else 60) * v
        for x0, x1 in zip(xs, xs[1:]):
            yy = base_y + rng.uniform(-60, 60)
            mb.face([(x0, base_y, -50), (x1, base_y, -50), (x1, base_y, h(x1)), (x0, base_y, h(x0))])
        ob = mb.finish("mountain", [m])
        ob.visible_shadow = False


# ------------------------------------------------------------------ 町並み
def property_front(side, ya, yb, rng, setback, kind):
    """道沿いの境界（塀・生垣・板塀・駐車場）。"""
    sx = 1 if side > 0 else -1
    xf = 2.30 * sx
    x0, x1 = (xf, xf + 0.12) if sx > 0 else (xf - 0.12, xf)
    if kind == "block":
        h = rng.choice([1.0, 1.2, 1.4])
        gap0 = ya + (yb - ya) * rng.uniform(0.3, 0.6)
        simple_wall(x0, ya, x1, gap0, h)
        simple_wall(x0, gap0 + 1.2, x1, yb, h)
    elif kind == "hedge":
        hx0, hx1 = (xf, xf + 0.6) if sx > 0 else (xf - 0.6, xf)
        hedge(hx0, ya + 0.3, hx1, yb - 2.5, rng.uniform(0.9, 1.3))
    elif kind == "plank":
        simple_wall(x0, ya, x1, yb - 1.5, 1.7, "plank")
    elif kind == "open":
        # 駐車場とカーポート
        mb = MB()
        xa, xb = (xf, xf + setback) if sx > 0 else (xf - setback, xf)
        mb.box(xa, ya, -0.02, xb, yb, 0.01, mi=0)
        mb.finish("parking", [M["concrete"]])
        if rng.random() < 0.6 and setback > 4:
            mb = MB()
            px = [xa + 0.3, xb - 0.3]
            py = [ya + 0.5, ya + 5.5]
            for xx in px:
                for yy in py:
                    mb.box(xx - 0.04, yy - 0.04, 0, xx + 0.04, yy + 0.04, 2.3, mi=0)
            mb.box(xa, ya + 0.2, 2.3, xb, ya + 5.8, 2.38, mi=0)
            mb.finish("carport_frame", [M["alu"]])
            mb = MB()
            mb.face([(xa, ya + 0.2, 2.39), (xb, ya + 0.2, 2.39), (xb, ya + 5.8, 2.39), (xa, ya + 5.8, 2.39)])
            mb.finish("carport_roof", [M["polycarb"]])


def pick_roof(rng):
    """瓦（灰・いぶし・茶）とガルバ（紺・茶・黒・銀）。"""
    return rng.choices([M["roof"], M["roof2"], M["roof3"]] + GALVA, [5, 2, 1, 2, 1, 1, 1])[0]


def build_town():
    rng = random.Random(SEED + 20)
    houses = []
    for side in (-1, 1):
        # 主役の敷地（左）と自販機の家（右）は別に作るので空けておく
        reserved = (-6.5, 22.5) if side < 0 else (-42.0, 11.5)
        lots = []
        y = Y_MIN
        while y < Y_MAX - 6:
            w = rng.uniform(9.5, 14.0)
            ya, yb = y, min(y + w, Y_MAX)
            if ya < reserved[1] and yb > reserved[0]:
                if reserved[0] - ya >= 6:
                    lots.append((ya, reserved[0]))
                y = reserved[1]
                continue
            lots.append((ya, yb))
            y = yb
        for ya, yb in lots:
            setback = rng.uniform(1.2, 5.5)
            kind = rng.choices(["block", "hedge", "plank", "open"], [5, 2, 1, 2])[0]
            if kind == "open":
                setback = max(setback, 5.5)
            property_front(side, ya, yb, rng, setback, kind)
            dpt = rng.uniform(7.5, 10.0)
            if side > 0:
                hx0 = 2.4 + setback
                hx1 = hx0 + dpt
                front = "-x"
            else:
                hx1 = -2.4 - setback
                hx0 = hx1 - dpt
                front = "+x"
            hy0 = ya + rng.uniform(0.6, 1.5)
            hy1 = yb - rng.uniform(0.6, 1.5)
            floors = 2 if rng.random() < 0.8 else 1
            wall = rng.choice(WALLS)
            roof = pick_roof(rng)
            ob, H = house(hx0, hy0, hx1, hy1, floors, rng, front, wall, roof)
            houses.append((side, hx0, hy0, hx1, hy1, H))
            # 裏の列（簡単な家）
            bx0 = hx1 + rng.uniform(1.5, 3.5) if side > 0 else hx0 - rng.uniform(1.5, 3.5) - dpt
            house(bx0, ya + rng.uniform(0, 2), bx0 + dpt, yb - rng.uniform(0, 2), 2 if rng.random() < 0.85 else 1, rng,
                  front, rng.choice(WALLS), pick_roof(rng), detail=False)
            # さらに奥の列（屋根の連なり）
            cx0 = bx0 + dpt + rng.uniform(2, 6) if side > 0 else bx0 - rng.uniform(2, 6) - dpt
            house(cx0, ya + rng.uniform(-2, 2), cx0 + dpt * rng.uniform(0.9, 1.3), yb + rng.uniform(-2, 2), 2, rng, front,
                  rng.choice(WALLS), pick_roof(rng), detail=False, lit_prob=0.3)
    return houses


def hero_property():
    """猫が乗る塀のある家（左側 y=-6.5〜22.5）。"""
    rng = random.Random(SEED + 30)
    gate = (-4.5, -3.3)
    block_wall_hero(-6.5, 22.5, gate=gate)
    gate_posts(gate)
    # 横の塀（敷地の端）
    simple_wall(-9.5, -6.62, -2.30, -6.5, 1.15)
    simple_wall(-9.5, 22.5, -2.30, 22.62, 1.15)
    # 庭の土
    mb = MB()
    mb.box(-9.5, -6.5, -0.02, -2.42, 22.5, 0.02)
    mb.finish("garden_soil", [M["dirt"]])
    # 飛び石（門から玄関へ）
    mb = MB()
    for i in range(6):
        cx = -3.0 - i * 0.95
        cy = -3.9 + rng.uniform(-0.1, 0.1)
        pts = [(cx + 0.28 * math.cos(a) * rng.uniform(0.85, 1.1), cy + 0.24 * math.sin(a) * rng.uniform(0.85, 1.1), 0.0) for a in
               [k * 2 * math.pi / 9 for k in range(9)]]
        mb.prism(pts, 0.05, mi=0, col=jitter_col(rng, 0.1))
    mb.finish("stepping_stones", [M["cap"]], bevel=0.01)
    # 母屋
    house(-16.5, -5.0, -9.5, 8.5, 2, rng, "+x", WALLS[0], M["roof"], lit_prob=0.5, roof_type="gable")
    # 離れの物置（トタン）
    mb = MB()
    mb.box(-4.6, 17.0, 0, -2.7, 19.2, 1.9, mi=0)
    mb.box(-4.7, 16.9, 1.9, -2.6, 19.3, 1.96, mi=0)
    mb.finish("shed", [M["tin"]], bevel=0.01)
    # 物干し
    mb = MB()
    for yy in (9.5, 13.0):
        mb.cyl(-6.8, yy, 0, 1.75, 0.025, seg=10)
        mb.box(-7.1, yy - 0.02, 1.70, -6.5, yy + 0.02, 1.74)
    mb.finish("laundry_stands", [M["steel"]])
    pole = MB()
    for xx in (-6.98, -6.62):
        pole.box(xx - 0.015, 9.2, 1.74, xx + 0.015, 13.3, 1.77)
    pole.finish("laundry_poles", [M["alu"]])
    # プロパンガス
    mb = MB()
    for i, yy in enumerate((6.2, 6.65)):
        mb.cyl(-9.15, yy, 0.0, 1.2, 0.18, seg=20, mi=0)
        mb.cyl(-9.15, yy, 1.2, 1.3, 0.18, 0.12, seg=20, mi=0)
        mb.cyl(-9.15, yy, 1.3, 1.42, 0.10, seg=12, mi=0, caps=False)
    mb.finish("propane", [M["propane"]], smooth=True)
    persimmon_tree((-4.6, 4.6, 0.02))
    # 母屋の前の砂利の帯
    gm, gnb, gb = new_mat("gravel")
    gobj = gnb.add("ShaderNodeTexCoord").outputs["Object"]
    vo = gnb.add("ShaderNodeTexVoronoi")
    vo.inputs["Scale"].default_value = 60.0
    gnb.ln(gobj, vo.inputs["Vector"])
    gcol = gnb.ramp(vo.outputs["Color"], [(0.0, (0.25, 0.24, 0.22)), (1.0, (0.55, 0.53, 0.50))])
    setin(gb.inputs["Base Color"], gcol, gnb)
    gb.inputs["Roughness"].default_value = 0.8
    gbump = gnb.add("ShaderNodeBump")
    gbump.inputs["Strength"].default_value = 0.9
    gnb.ln(gnb.math("SUBTRACT", 1.0, vo.outputs["Distance"]), gbump.inputs["Height"])
    gnb.ln(gbump.outputs[0], gb.inputs["Normal"])
    mb = MB()
    mb.box(-9.45, -5.0, 0.02, -8.3, 8.5, 0.04)
    mb.box(-3.6, 12.5, 0.02, -2.5, 16.5, 0.04)
    mb.finish("gravel_bed", [gm])
    return gate


def parking_lot(y0=-42.0, y1=-3.0):
    """右側の月極駐車場（車はない）。低い太陽の光が道へ入る。"""
    rng = random.Random(SEED + 45)
    x0, x1 = 2.30, 26.0
    mb = MB()
    mb.face([(x0, y0, 0.005), (x1, y0, 0.005), (x1, y1, 0.005), (x0, y1, 0.005)])
    mb.finish("lot_asphalt", [M["asphalt"]])
    lines = MB()
    stops = MB()
    for (ra, rb) in ((8.0, 13.0), (17.0, 22.0)):
        y = y0 + 1.0
        while y + 2.5 < y1 - 0.5:
            lines.face([(ra, y - 0.05, 0.0055), (rb, y - 0.05, 0.0055), (rb, y + 0.05, 0.0055), (ra, y + 0.05, 0.0055)])
            xs = ra + 0.5 if ra < 15 else rb - 0.62
            stops.box(xs, y + 0.6, 0.0, xs + 0.12, y + 1.9, 0.10, col=jitter_col(rng, 0.1))
            y += 2.5
        lines.face([(ra, y - 0.05, 0.0055), (rb, y - 0.05, 0.0055), (rb, y + 0.05, 0.0055), (ra, y + 0.05, 0.0055)])
    lines.finish("lot_lines", [M["line"]])
    stops.finish("wheel_stops", [M["cap"]], bevel=0.01)
    # 道沿いの低い柵（杭と鎖）
    posts = MB()
    xp = 2.45
    ys = []
    y = y0 + 0.2
    while y < y1 - 0.1:
        posts.cyl(xp, y, 0.0, 0.62, 0.035, seg=10)
        ys.append(y)
        y += 2.0
    posts.finish("lot_posts", [M["trim"]], smooth=True)
    for a, b in zip(ys, ys[1:]):
        service_drop((xp, a, 0.55), (xp, b, 0.55), sag=0.12, r=0.005, name="chain")
    # 奥の家（駐車場の向こう）
    y = y0
    while y < y1 - 6:
        w = rng.uniform(9, 13)
        house(27.5 + rng.uniform(0, 2), y + 0.8, 36.0 + rng.uniform(0, 2), min(y + w, y1) - 0.8, 2, rng, "-x",
              rng.choice(WALLS), rng.choice([M["roof"], M["roof2"]]))
        y += w
    weeds = [(rng.uniform(2.6, 25.0), rng.choice([y0 + 0.2, y1 - 0.2, rng.uniform(y0, y1)]), 0.005) for _ in range(40)]
    return weeds


def vending_property():
    """右側 y=-3〜11.5: トタン張りの古い家と自販機。"""
    rng = random.Random(SEED + 40)
    # 低い塀と駐車場
    simple_wall(2.30, -3.0, 2.42, 3.5, 1.1)
    mb = MB()
    mb.box(2.30, 3.5, -0.02, 6.0, 11.5, 0.01)
    mb.finish("vm_lot", [M["concrete"]])
    house(4.2, -2.2, 12.0, 3.2, 2, rng, "-x", WALLS[6], M["roof2"], lit_prob=0.6, roof_type="gable")
    house(6.0, 4.5, 13.5, 11.0, 2, rng, "-x", WALLS[2], M["roof"], lit_prob=0.4, roof_type="hip")
    vending_machine(2.42, 5.3)


def hero_props():
    """鉢植え・雑草・室外機など（写真スキャンか手続きの代わり）。"""
    rng = random.Random(SEED + 50)
    pots_street = [((-2.12, -1.15, 0.012), "potted_plant_01", 0.62), ((-2.10, -0.55, 0.012), "potted_plant_02", 0.75),
                   ((-2.14, 0.05, 0.012), "planter_pot_clay", 1.3), ((-2.12, -5.3, 0.012), "potted_plant_02", 0.7),
                   ((-2.14, -5.85, 0.012), "potted_plant_04", 1.6), ((-2.10, 0.45, 0.012), "potted_plant_04", 1.5)]
    weeds = []
    for i in range(70):
        side = -1 if i < 52 else 1
        y = rng.uniform(-8, 26) if side < 0 else rng.uniform(-6, 30)
        x = (-2.27 + rng.uniform(-0.01, 0.02)) if side < 0 else (2.27 + rng.uniform(-0.02, 0.01))
        weeds.append((x, y, 0.0))
    garden = [(rng.uniform(-8.5, -3.0), rng.uniform(-2.0, 21.0), 0.02) for _ in range(60)] + LOT_WEEDS
    # 道と側溝の境目（両側）に集中して生える草
    weeds += [(-2.0 + rng.uniform(-0.01, 0.01), rng.uniform(-8, 26), 0.0) for _ in range(30)]
    weeds += [(2.0 + rng.uniform(-0.01, 0.01), rng.uniform(-6, 30), 0.0) for _ in range(20)]
    if SCANS:
        for loc, aid, s in pots_street:
            parts = import_model(aid)
            place(parts["all"], loc, rng.uniform(0, 6.28), s, name=aid)
        wc = import_model("watering_can_metal_01")
        place(wc["all"], (-2.14, -2.75, 0.012), math.radians(8), 1.0, name="watering_can")
        scatter_model("weed_plant_02", ["_a_", "_b_", "_c_", "_d_", "_e_"], weeds[::2], rng, (0.8, 1.4))
        scatter_model("dandelion_01", ["_a_", "_b_", "_c_", "_d_", "_e_"], weeds[1::3], rng, (0.8, 1.3))
        scatter_model("grass_medium_01", ["large_a", "large_b", "large_c", "mid_a", "mid_b", "mid_c", "tall_a", "tall_b"], weeds[2::3] + garden, rng, (0.9, 1.6))
        sh = import_model("shrub_04")
        for p in [(-9.0, -2.0, 0.02), (-9.0, 0.2, 0.02), (-9.1, 3.0, 0.02), (-3.0, 20.5, 0.02), (-2.9, 15.0, 0.02), (-2.8, 10.5, 0.02)]:
            place(sh["all"], p, rng.uniform(0, 6.28), rng.uniform(2.5, 3.5), name="shrub")
        ac = import_model("exterior_aircon_unit")
        place(ac["clean"], (-9.15, 1.6, 0.02), math.radians(90), 1.0, name="aircon")
        place(ac["rusted"], (3.95, -1.0, 0.0), math.radians(-90), 1.0, name="aircon")
        place(ac["clean"], (5.75, 7.0, 0.0), math.radians(-90), 0.9, name="aircon")
        # 庭側の鉢
        for p in [(-2.65, 2.0, 0.02), (-2.70, 2.5, 0.02), (-2.62, 11.0, 0.02)]:
            place(import_model("planter_pot_clay")["all"], p, rng.uniform(0, 6.28), 1.4, name="pot")
    else:
        for loc, aid, s in pots_street:
            h = {"potted_plant_01": 0.33, "potted_plant_02": 0.25, "planter_pot_clay": 0.29, "potted_plant_04": 0.23}[aid]
            proc_pot(loc, h=h, r=0.12 + 0.06 * (h / 0.33), rng=rng,
                     color=(0.42, 0.18, 0.08) if aid != "potted_plant_02" else (0.6, 0.58, 0.55))
        proc_pot((-2.14, -2.75, 0.012), h=0.2, r=0.08, rng=rng, plant=False, color=(0.5, 0.52, 0.5))
        for p in weeds + garden:
            proc_weed(p, rng, rng.uniform(0.12, 0.25))
        for p in [(-9.0, -2.0, 0.02), (-9.0, 0.2, 0.02), (-9.1, 3.0, 0.02), (-3.0, 20.5, 0.02), (-2.9, 15.0, 0.02), (-2.8, 10.5, 0.02)]:
            hedge(p[0] - 0.4, p[1] - 0.4, p[0] + 0.4, p[1] + 0.4, 0.6)
        proc_aircon((-9.15, 1.6, 0.02), math.radians(90))
        proc_aircon((3.95, -1.0, 0.0), math.radians(-90))
        proc_aircon((5.75, 7.0, 0.0), math.radians(-90))
        for p in [(-2.65, 2.0, 0.02), (-2.70, 2.5, 0.02), (-2.62, 11.0, 0.02)]:
            proc_pot(p, h=0.22, r=0.13, rng=rng, plant=rng.random() < 0.6)


def house_units():
    """家の外壁の足元に室外機と給湯器を置く（写真スキャンか手続きの代わり）。"""
    rng = random.Random(SEED + 70)
    for (x0, y0, x1, y1, front) in HOUSE_UNITS:
        n = rng.choice([1, 1, 2])
        for k in range(n):
            # 道に向く面か、横の面
            if rng.random() < 0.55:
                x = x1 + 0.2 if front == "+x" else x0 - 0.2
                y = rng.uniform(y0 + 0.8, y1 - 0.8)
                rot = math.radians(-90) if front == "+x" else math.radians(90)
            else:
                y = y0 - 0.2 if rng.random() < 0.5 else y1 + 0.2
                x = rng.uniform(x0 + 0.8, x1 - 0.8)
                rot = math.radians(180) if y < y0 else 0.0
            if SCANS:
                ac = import_model("exterior_aircon_unit")
                place(ac["clean" if rng.random() < 0.7 else "rusted"], (x, y, 0.0), rot + math.pi, rng.uniform(0.85, 1.0), name="aircon")
            else:
                proc_aircon((x, y, 0.0), rot)


# ------------------------------------------------------------------ カラス
def crow_mesh(name, folded=True):
    """カラス（全長 0.5 m 前後）。胴・首・頭・太いくちばし・たたんだ翼・扇形の尾・脚を別の形で作る。"""
    mb = MB()
    bm = mb.bm

    def ell(c, s, mi=0, rot=0.0):
        r = bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=1.0)
        M3 = Matrix.Rotation(math.radians(rot), 3, "X")
        for v in r["verts"]:
            v.co = M3 @ Vector((v.co.x * s[0], v.co.y * s[1], v.co.z * s[2])) + Vector(c)
        for f in {f for v in r["verts"] for f in v.link_faces}:
            f.material_index = mi
    ell((0, 0.0, 0.0), (0.072, 0.135, 0.078), rot=12)        # 胴
    ell((0, 0.115, 0.045), (0.056, 0.065, 0.062), rot=-20)   # 胸と首
    ell((0, 0.172, 0.078), (0.047, 0.058, 0.050))            # 頭
    # 太いくちばし（少し下に曲がる）
    r = bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=0.022, radius2=0.003, depth=0.072)
    for v in r["verts"]:
        v.co.z *= 1.0
        v.co = Matrix.Rotation(math.radians(-82), 3, "X") @ Vector((v.co.x * 0.85, v.co.y, v.co.z)) + Vector((0, 0.250, 0.066))
    for f in {f for v in r["verts"] for f in v.link_faces}:
        f.material_index = 1
    # 扇形の尾（少し下がる）
    fan = [(0, -0.10, 0.012)]
    for k in range(7):
        a = math.radians(-26 + k * (52 / 6))
        fan.append((math.sin(a) * 0.16, -0.10 - math.cos(a) * 0.17, 0.012 - math.cos(a) * 0.05))
    for k in range(1, len(fan) - 1):
        mb.face([fan[0], fan[k], fan[k + 1]], 0)
    if folded:
        _folded_wings(mb)
    # 脚と指
    for sx in (0.022, -0.022):
        mb.cyl(sx, 0.01, -0.125, -0.055, 0.006, seg=6, mi=1)
        mb.box(sx - 0.004, -0.02, -0.128, sx + 0.004, 0.05, -0.118, mi=1)
    return mb.finish(name, [M["crow"], M["beak"]], smooth=True)


def _folded_wings(mb):
    """たたんだ翼: 胴の横に沿う板と、尾の上に重なる風切羽の段差。"""
    for sx in (1, -1):
        pts = [(sx * 0.074, 0.09, 0.045), (sx * 0.080, 0.02, 0.055), (sx * 0.068, -0.08, 0.035),
               (sx * 0.040, -0.20, 0.035), (sx * 0.045, -0.12, -0.01), (sx * 0.075, 0.0, -0.03), (sx * 0.072, 0.08, -0.01)]
        c = (sx * 0.078, -0.01, 0.02)
        for k in range(len(pts)):
            mb.face([c, pts[k], pts[(k + 1) % len(pts)]], 0)
        # 外側に少し浮かせた二枚目（段差）
        pts2 = [(x + sx * 0.008, y - 0.02, z + 0.006) for (x, y, z) in pts[1:5]]
        c2 = (c[0] + sx * 0.008, c[1] - 0.05, c[2])
        for k in range(len(pts2) - 1):
            mb.face([c2, pts2[k], pts2[k + 1]], 0)


def crow_folded_wings(name):
    mb = MB()
    _folded_wings(mb)
    return mb.finish(name, [M["crow"]], smooth=True)


def wing_mesh(name, sgn):
    """広げた翼（先が指のように分かれる）。"""
    mb = MB()
    s = sgn
    pts = [(0, 0.07, 0), (s * 0.20, 0.10, 0.01), (s * 0.40, 0.06, 0.0), (s * 0.50, 0.00, 0.0), (s * 0.52, -0.05, 0),
           (s * 0.47, -0.06, 0), (s * 0.49, -0.10, 0), (s * 0.42, -0.10, 0), (s * 0.43, -0.14, 0), (s * 0.34, -0.13, 0),
           (s * 0.20, -0.14, 0), (0, -0.09, 0)]
    if s < 0:
        pts = list(reversed(pts))
    c = (s * 0.2, -0.02, 0.0)
    for k in range(len(pts)):
        mb.face([c, pts[k], pts[(k + 1) % len(pts)]], 0)
    return mb.finish(name, [M["crow"]])


FALLING = [  # (落ち始め, 出発点の目安, 着く所, 落ちる秒数)
    (14.2, (-2.9, 4.4, 2.3), (-3.6, 3.5, 0.03), 3.8),
    (26.5, (-2.0, 3.9, 2.3), (-0.9, 2.3, 0.0), 4.6),
    (27.9, (-2.7, 4.0, 2.5), (-3.3, 2.6, 0.03), 4.2),
]


def falling_leaves(rng=None):
    """柿の葉が枝から離れて、回りながらひらひら落ちる。"""
    rng = rng or random.Random(SEED + 80)
    frames = list(range(1, T.FPS * 30 + 1))
    for i, (t0, near, end, dur) in enumerate(FALLING):
        start = min(TREE_TIPS, key=lambda q: (q - Vector(near)).length) if TREE_TIPS else Vector(near)
        mb = MB()
        add_leaf(mb, (-0.05, 0, 0), (0, 0.2, 1), (1, 0.3, 0), 0.10, 0.065, jitter_col(rng, 0.1, LEAF_AUTUMN[i % 3]), 0.25,
                 shape=i % 4, twist=0.2)
        ob = mb.finish(f"falling_leaf{i}", [M["leaf"]])
        e = Vector(end)
        lx, ly, lz, rx, ry, rz = [], [], [], [], [], []
        for f in frames:
            t = T.frame_time(f)
            tau = max(0.0, t - t0)
            u = min(1.0, tau / dur)
            ue = u * u * (3 - 2 * u) * 0.3 + u * 0.7
            p = start.lerp(e, ue)
            amp = math.sin(math.pi * min(1.0, u * 1.3)) if u < 1 else 0.0
            p += Vector((0.20 * math.sin(2 * math.pi * 0.85 * tau), 0.13 * math.sin(2 * math.pi * 0.55 * tau + 1.0),
                         0.05 * math.sin(2 * math.pi * 1.7 * tau))) * amp
            lx.append(p.x)
            ly.append(p.y)
            lz.append(p.z)
            rx.append(math.radians(55) * math.sin(2 * math.pi * 0.85 * tau + 0.5) * amp)
            ry.append(math.radians(35) * math.cos(2 * math.pi * 0.7 * tau) * amp)
            rz.append(math.radians(110) * tau * (1 if i % 2 else -1))
        for k, v in enumerate((lx, ly, lz)):
            fcurve_set(ob, "location", k, frames, v)
        for k, v in enumerate((rx, ry, rz)):
            fcurve_set(ob, "rotation_euler", k, frames, v)


def build_crows():
    objs = []
    for i, (spot, y, yaw) in enumerate(T.CROW_SPOTS):
        if spot == "pole":
            wx, z = POLE_X, 11.0
        else:
            wi = int(spot[4:])
            wx, z = POLE_X + WIRES[wi][0], wire_z(wi, y) + WIRES[wi][3] - CROW_DIP
        ob = crow_mesh(f"crow{i}", folded=(i != 1))
        ob.location = (wx, y, z + 0.128)
        ob.rotation_euler = (0, 0, math.radians(yaw))
        objs.append(ob)
        if i == 1:
            fw = crow_folded_wings("crow1_folded")
            fw.parent = ob
            FOLDED.append(fw)
            wl = wing_mesh("crow1_wing_l", 1)
            wr = wing_mesh("crow1_wing_r", -1)
            for w, sx in ((wl, 1), (wr, -1)):
                w.parent = ob
                w.location = (sx * 0.05, 0.0, 0.03)
            objs += [wl, wr]
    return objs


# ------------------------------------------------------------------ 猫（影だけに写る形）
def build_cat_rig():
    def ellip(name, s, mat=M["cat"]):
        mb = MB()
        r = bmesh.ops.create_uvsphere(mb.bm, u_segments=16, v_segments=10, radius=1.0)
        for v in r["verts"]:
            v.co = Vector((v.co.x * s[0], v.co.y * s[1], v.co.z * s[2]))
        return mb.finish(name, [mat], smooth=True)

    root = bpy.data.objects.new("cat_root", None)
    link(root)
    body = ellip("cat_body", (0.068, 0.20, 0.078))
    body.parent = root
    chest = ellip("cat_chest", (0.06, 0.08, 0.075))
    chest.parent = root
    chest.location = (0, 0.14, 0.02)
    legs = []
    for k, (lx, ly) in enumerate([(0.04, -0.14), (0.04, 0.13), (-0.04, -0.14), (-0.04, 0.13)]):
        mb = MB()
        mb.cyl(0, 0, -0.165, 0.0, 0.017, 0.022, seg=8)
        leg = mb.finish(f"cat_leg{k}", [M["cat"]], smooth=True)
        leg.parent = root
        leg.location = (lx, ly, -0.03)
        legs.append(leg)
    # しっぽ（歩くとき: 立てて先を曲げる / 座るとき: 体に沿わせる）
    tails = []
    for nm, pts in (("cat_tail_walk", [(0, -0.19, 0.02), (0, -0.26, 0.10), (0, -0.28, 0.20), (0, -0.25, 0.28), (0, -0.19, 0.30)]),
                    ("cat_tail_sit", [(0, -0.17, -0.06), (0.06, -0.20, -0.10), (0.12, -0.12, -0.11), (0.13, 0.0, -0.11), (0.10, 0.10, -0.11)])):
        cu = bpy.data.curves.new(nm, "CURVE")
        cu.dimensions = "3D"
        cu.bevel_depth = 0.016
        cu.use_fill_caps = True
        sp = cu.splines.new("NURBS")
        sp.points.add(len(pts) - 1)
        for i, p in enumerate(pts):
            sp.points[i].co = (*p, 1.0)
        sp.order_u = 3
        sp.use_endpoint_u = True
        cu.materials.append(M["cat"])
        ob = link(bpy.data.objects.new(nm, cu))
        ob.parent = root
        tails.append(ob)
    head = ellip("cat_head", (0.052, 0.055, 0.047))
    for k, sx in enumerate((1, -1)):
        mb = MB()
        r = bmesh.ops.create_cone(mb.bm, cap_ends=True, segments=6, radius1=0.022, radius2=0.002, depth=0.045)
        ear = mb.finish(f"cat_ear{k}", [M["cat"]])
        ear.parent = head
        ear.location = (sx * 0.03, -0.005, 0.05)
        ear.rotation_euler = (math.radians(-10), math.radians(sx * 18), 0)
    rig = [root, body, chest, head] + legs + tails + [o for o in bpy.data.objects if o.name.startswith("cat_ear")]
    for o in rig:
        if o.type in ("MESH", "CURVE"):
            o.visible_camera = False
            o.visible_glossy = False
            o.visible_transmission = False
            o.visible_diffuse = False
    return root, head, legs, tails


# ------------------------------------------------------------------ アニメーションの書き込み
def fcurve_set(idb, path, index, frames, values, interp=1):
    ad = idb.animation_data or idb.animation_data_create()
    if ad.action is None:
        ad.action = bpy.data.actions.new(f"{idb.name}_act")
    fc = ad.action.fcurve_ensure_for_datablock(idb, path, index=index)
    n = len(frames)
    fc.keyframe_points.add(n)
    co = []
    for f, v in zip(frames, values):
        co += [f, v]
    fc.keyframe_points.foreach_set("co", co)
    fc.keyframe_points.foreach_set("interpolation", [interp] * n)
    fc.update()


def animate_all(cam, cam_data, rig, crows):
    frames = list(range(1, T.FPS * 30 + 1))
    poses = [T.pose(T.frame_time(f)) for f in frames]
    # カメラ
    for i in range(3):
        fcurve_set(cam, "location", i, frames, [p["eye"][i] for p in poses])
    rx = [math.radians(90 + p["pitch"]) for p in poses]
    ry = [math.radians(p["roll"]) for p in poses]
    rz = [math.radians(p["yaw"]) for p in poses]
    for i, vals in enumerate((rx, ry, rz)):
        fcurve_set(cam, "rotation_euler", i, frames, vals)

    # ピント: 視線の先までの距離（目が合わせるように少し遅れて追う）
    dg = bpy.context.evaluated_depsgraph_get()
    dist = []
    for p in poses:
        e = Euler((math.radians(90 + p["pitch"]), math.radians(p["roll"]), math.radians(p["yaw"])), "XYZ")
        d = e.to_matrix() @ Vector((0, 0, -1))
        hit, loc, *_ = scene.ray_cast(dg, Vector(p["eye"]) + d * 0.02, d, distance=300.0)
        dist.append(min(max((loc - Vector(p["eye"])).length, 1.0), 30.0) if hit else 30.0)
    sm = []
    cur = dist[0]
    k = 1 - math.exp(-1 / (T.FPS * 0.06))
    for dd in dist:
        cur = math.exp(math.log(cur) + (math.log(dd) - math.log(cur)) * k)
        sm.append(cur)
    fcurve_set(cam_data, "dof.focus_distance", 0, frames, sm)

    # 猫の影の形
    root, head, legs, tails = rig
    bx, by, bz, ryaw, rpitch = [], [], [], [], []
    hx, hy, hz, hyaw, hpitch = [], [], [], [], []
    leg_rot = [[], [], [], []]
    tail_w, tail_s = [], []
    for p in poses:
        bx.append(p["body"][0])
        by.append(p["body"][1])
        bz.append(p["body"][2])
        ryaw.append(math.radians(p["body_yaw"]))
        rpitch.append(math.radians(p["body_pitch"]))
        yaw = math.radians(p["yaw"])
        fwd = Vector((-math.sin(yaw), math.cos(yaw), 0))
        hc = Vector(p["eye"]) - fwd * 0.035 + Vector((0, 0, -0.01))
        hx.append(hc.x)
        hy.append(hc.y)
        hz.append(hc.z)
        hyaw.append(yaw)
        hpitch.append(math.radians(p["pitch"]))
        w = 2 * math.pi * p["gait"]
        for k, off in enumerate((0.0, 0.25, 0.5, 0.75)):
            sw = math.radians(24) * p["amp"] * math.sin(w - off * 2 * math.pi)
            if p["air"] > 0:
                sw = math.radians(-45 if k in (1, 3) else 50) * p["air"]
                sw = -sw if k in (0, 2) else sw
            if p["sit"] > 0:
                sw = sw * (1 - p["sit"]) + (math.radians(-28) if k in (1, 3) else math.radians(80)) * p["sit"]
            leg_rot[k].append(sw)
        tail_w.append(p["sit"] < 0.5)
        tail_s.append(p["sit"] >= 0.5)
    for i, v in enumerate((bx, by, bz)):
        fcurve_set(root, "location", i, frames, v)
    fcurve_set(root, "rotation_euler", 0, frames, rpitch)
    fcurve_set(root, "rotation_euler", 2, frames, ryaw)
    for i, v in enumerate((hx, hy, hz)):
        fcurve_set(head, "location", i, frames, v)
    fcurve_set(head, "rotation_euler", 0, frames, hpitch)
    fcurve_set(head, "rotation_euler", 2, frames, hyaw)
    for k in range(4):
        fcurve_set(legs[k], "rotation_euler", 0, frames, leg_rot[k])
    fcurve_set(tails[0], "hide_render", 0, frames, [0.0 if v else 1.0 for v in tail_w], interp=0)
    fcurve_set(tails[1], "hide_render", 0, frames, [0.0 if v else 1.0 for v in tail_s], interp=0)

    # カラス: 鳴くときにおじぎ、2 番は飛び立つ
    c0, c1, c2 = crows[0], crows[1], crows[4] if len(crows) > 4 else crows[2]
    wl, wr = crows[2], crows[3]
    base1 = c1.location.copy()
    yaw1 = c1.rotation_euler.z
    for ci, ob in ((0, c0), (1, c1)):
        pitch = []
        for f in frames:
            t = T.frame_time(f)
            v = 0.0
            for (tc, who, n) in T.CAW_TIMES:
                if who == ci:
                    for j in range(n):
                        dt = t - (tc + j * 0.42)
                        if 0 <= dt < 0.4:
                            v += math.radians(-22) * math.sin(math.pi * dt / 0.4)
            pitch.append(v)
        if ci == 0:
            fcurve_set(ob, "rotation_euler", 0, frames, pitch)
    px, py, pz, pyaw, ppitch, flap = [], [], [], [], [], []
    for f, t in zip(frames, (T.frame_time(f) for f in frames)):
        fl = T.crow_flight(t)
        if fl is None:
            px.append(base1.x)
            py.append(base1.y)
            pz.append(base1.z)
            pyaw.append(yaw1)
            dtc = t - T.CAW_TIMES[3][0]
            ppitch.append(math.radians(-20) * math.sin(math.pi * dtc / 0.4) if 0 <= dtc < 0.4 else 0.0)
            flap.append(math.radians(78))  # 畳んだ羽（体の横に沿わせる）
        else:
            (dx, dy, dz), yaw, fa = fl
            px.append(base1.x + dx)
            py.append(base1.y + dy)
            pz.append(base1.z + dz)
            pyaw.append(math.radians(yaw))
            ppitch.append(math.radians(12))
            flap.append(math.radians(fa))
    for i, v in enumerate((px, py, pz)):
        fcurve_set(c1, "location", i, frames, v)
    fcurve_set(c1, "rotation_euler", 2, frames, pyaw)
    fcurve_set(c1, "rotation_euler", 0, frames, ppitch)
    fcurve_set(wl, "rotation_euler", 1, frames, flap)
    fcurve_set(wr, "rotation_euler", 1, frames, [-a for a in flap])
    hid = [1.0 if T.frame_time(f) < T.CROW_TAKEOFF else 0.0 for f in frames]
    fcurve_set(wl, "hide_render", 0, frames, hid, interp=0)
    fcurve_set(wr, "hide_render", 0, frames, hid, interp=0)
    for fw in FOLDED:
        fcurve_set(fw, "hide_render", 0, frames, [1.0 - h for h in hid], interp=0)


# ------------------------------------------------------------------ カメラと描画の設定
def build_camera():
    cd = bpy.data.cameras.new("neko_eye")
    cd.lens = 22.0
    cd.sensor_width = 36.0
    cd.clip_start = 0.01
    cd.clip_end = 30000.0
    cd.dof.use_dof = True
    cd.dof.aperture_fstop = 8.0
    cd.dof.aperture_blades = 7
    cam = bpy.data.objects.new("neko_eye", cd)
    link(cam)
    scene.camera = cam
    return cam, cd


def render_settings():
    r = scene.render
    r.engine = "CYCLES"
    r.resolution_x, r.resolution_y = 1920, 1080
    r.resolution_percentage = 100
    r.fps = T.FPS
    scene.frame_start, scene.frame_end = 1, T.FPS * 30
    r.use_persistent_data = True
    r.use_motion_blur = True
    r.motion_blur_shutter = 0.5
    r.image_settings.file_format = "PNG"
    r.image_settings.color_mode = "RGB"
    r.image_settings.color_depth = "8"
    r.image_settings.compression = 15
    c = scene.cycles
    c.device = "GPU"
    c.samples = 96
    c.use_adaptive_sampling = True
    c.adaptive_threshold = 0.025
    c.adaptive_min_samples = 16
    c.use_denoising = True
    try:
        c.denoiser = "OPENIMAGEDENOISE"
        c.denoising_use_gpu = True
        c.denoising_input_passes = "RGB_ALBEDO_NORMAL"
        c.denoising_prefilter = "ACCURATE"
    except Exception as e:
        log("build", "denoise_opt_skip", str(e))
    c.max_bounces = 6
    c.diffuse_bounces = 3
    c.glossy_bounces = 3
    c.transmission_bounces = 4
    c.transparent_max_bounces = 12
    c.volume_bounces = 0
    c.caustics_reflective = False
    c.caustics_refractive = False
    c.sample_clamp_indirect = 6.0
    c.blur_glossy = 1.0
    c.use_light_tree = True
    c.seed = SEED % 100000
    c.use_animated_seed = True
    scene.view_settings.view_transform = "AgX"
    for look in ("AgX - Medium High Contrast", "Medium High Contrast", "AgX - Base Contrast"):
        try:
            scene.view_settings.look = look
            break
        except Exception:
            pass
    scene.view_settings.exposure = -0.9
    scene.view_settings.gamma = 1.0


# ------------------------------------------------------------------ 組み立て
def main():
    build_world()
    build_clouds()
    build_compositor()
    if HAZE_DENSITY > 0:
        build_haze()
    build_road()
    hero_property()
    vending_property()
    LOT_WEEDS.extend(parking_lot())
    houses = build_town()
    build_poles()
    # 電柱から近くの家の軒先への引き込み線
    rng = random.Random(SEED + 60)
    for py in POLE_YS:
        near = [h for h in houses if abs((h[2] + h[4]) / 2 - py) < 16]
        rng.shuffle(near)
        for (side, hx0, hy0, hx1, hy1, H) in near[:2]:
            tx = hx0 if side > 0 else hx1
            ty = rng.uniform(hy0 + 0.5, hy1 - 0.5)
            service_drop((POLE_X - 0.28, py, 7.95), (tx, ty, H - 0.4), sag=0.3)
    fallen_leaves()
    curve_mirror(1.95, 85.0, 205.0)
    road_ends()
    mountains()
    kei_car(4.3, 8.9, math.radians(90), (0.85, 0.86, 0.87))       # 自販機の家の駐車場
    kei_car(10.6, -20.4, math.radians(-90), (0.55, 0.70, 0.80))   # 月極駐車場
    kei_car(19.6, -32.9, math.radians(90), (0.72, 0.66, 0.55))
    kei_car(10.6, -35.4, math.radians(-90), (0.45, 0.06, 0.07))
    bicycle(2.62, 3.65, math.radians(5), (0.75, 0.75, 0.72))      # 自販機の横
    bicycle(-8.6, -2.2, math.radians(90), (0.15, 0.25, 0.45))     # 母屋の前
    hero_props()
    house_units()
    crows = build_crows()
    cam, cd = build_camera()
    render_settings()
    bpy.context.view_layer.update()
    rig = build_cat_rig()  # ピントの計算では当たらないよう後で作るが、アニメはまとめて書く
    # 猫の形がピントの光線に当たらないように一度隠す
    for o in bpy.data.objects:
        if o.name.startswith("cat_"):
            o.hide_viewport = True
    bpy.context.view_layer.update()
    animate_all(cam, cd, rig, crows)
    falling_leaves()
    for o in bpy.data.objects:
        if o.name.startswith("cat_"):
            o.hide_viewport = False
    os.makedirs(BUILD, exist_ok=True)
    out = os.path.join(BUILD, f"scene_{TAG}.blend")
    bpy.ops.wm.save_as_mainfile(filepath=out, compress=False)
    n_obj = len(bpy.data.objects)
    n_poly = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == "MESH")
    log("build", "ok", f"mode={TAG} objects={n_obj} polys={n_poly} sec={time.time() - t_start:.1f} file={os.path.relpath(out, ROOT)}")


main()
