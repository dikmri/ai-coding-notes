"""鐘なき王国: 絵を全部作り直す台本。

  uv run --no-project --with pillow --with numpy python kanenaki/art/build.py            # 全部
  uv run --no-project --with pillow --with numpy python kanenaki/art/build.py adventurer bone_soldier   # 一部
  ... build.py --tiles        # 床とスタンプだけ
  ... build.py --raw adventurer   # 立体で直さず、スキルの切り分けのままの結果を出す（比べる用）

出力
  kanenaki/assets/<id>_<姿勢>.png    スライスの帯（左が地面の 1 枚目）
  kanenaki/assets/tiles/<id>.png     床とスタンプ（平らな 16x16）
  kanenaki/assets/manifest.json      目録
確かめ用（git の対象外）
  runtime/mmo-art-preview/<id>/<姿勢>_views.png   4 方向の絵（8 倍、白地）
  runtime/mmo-art-preview/<id>/<姿勢>_hull.png    スキルの台本がそのまま出した check.png
  runtime/mmo-art-preview/<id>/<姿勢>_check.png   直して枠に置いた後の check.png
  runtime/mmo-art-preview/<id>/<姿勢>_viewer.html 回して見る表示器
  runtime/mmo-art-preview/_stats.json            立体と殻の差などの記録
"""

from __future__ import annotations

import json
import math
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.dont_write_bytecode = True   # kanenaki/art に __pycache__ を作らない

import vox  # noqa: E402
from palette import swatch  # noqa: E402

MMO = HERE.parent
ASSETS = MMO / "assets"
PREVIEW = Path(r"D:/soft/dekiru-html/runtime/mmo-art-preview")
TILE = 16


def registry():
    reg = {}
    from classes import ACTOR_POSES, CLASSES, MASTERS, build_class, build_master

    for cls in CLASSES:
        reg[cls] = dict(kind="actor", poses=ACTOR_POSES, build=lambda p, c=cls: build_class(c, p),
                        footprint=[1, 1], fix=True, round=False)
    for npc in MASTERS:
        reg[npc] = dict(kind="actor", poses=["idle"], build=lambda p, n=npc: build_master(n, p),
                        footprint=[1, 1], fix=True, round=False)
    try:
        from npcs import NPCS
        for npc, fn in NPCS.items():
            reg[npc] = dict(kind="actor", poses=["idle"], build=fn, footprint=[1, 1], fix=True, round=False)
    except ImportError:
        pass
    try:
        from monsters import MONSTERS
        for mid, ent in MONSTERS.items():
            reg[mid] = dict(kind="actor", poses=["idle", "walk1", "walk2", "attack"], fix=True, round=False, **ent)
    except ImportError:
        pass
    try:
        from props import PROPS
        for pid, ent in PROPS.items():
            e = dict(kind="prop", poses=["idle"], fix=False, round=False)
            e.update(ent)
            reg[pid] = e
    except ImportError:
        pass
    return reg


def build_one(aid: str, ent: dict, raw=False, outline=False, stats=None):
    out_dir = PREVIEW / aid
    out_dir.mkdir(parents=True, exist_ok=True)
    tmp = PREVIEW / "_tmp"
    tmp.mkdir(parents=True, exist_ok=True)
    carved = {}
    for pose in ent["poses"]:
        M = ent["build"](pose)
        vs, offset = vox.views(M)
        split = {lab: vox.pieces(v) for lab, v in zip(("top", "side", "front", "back"), vs)}
        split = {k: v for k, v in split.items() if len(v) > 1}
        if split:
            print(f"  WARNING {aid} {pose}: 離れた部品がある {split}")
        sheet_path = out_dir / f"{pose}_views.png"
        n = vox.sheet(vs, sheet_path, outline=outline)
        strip_tmp = tmp / f"{aid}_{pose}.png"
        vol, warns = vox.carve(sheet_path, strip_tmp, n, round_=ent["round"], outline=outline,
                               check=out_dir / f"{pose}_hull.png")
        if outline:
            # 外形線の分だけ 1 ドット外へ広がる: 立体の位置も 1 つずらして比べる
            offset = (offset[0] - 1, offset[1] - 1, offset[2] - 1)
        x0, x1, y0, y1, z0, z1 = M.bbox()
        expect = (z1 - z0 + 1 + (2 if outline else 0), y1 - y0 + 1 + (2 if outline else 0), x1 - x0 + 1 + (2 if outline else 0))
        if tuple(vol.shape[:3]) != expect:
            print(f"  WARNING {aid} {pose}: 切り分けた大きさ {vol.shape[:3]} が立体 {expect} と違う")
        model_n = int((M.m > 0).sum())
        hull_n = int((vol[..., 3] > 0).sum())
        miss = vox.missing(vol, M, offset) if not outline else None
        removed = recoloured = bled = 0
        if ent["fix"] and not raw and not outline:
            vol, removed, recoloured = vox.fix_hull(vol, M, offset)
        if not raw and not outline and tuple(vol.shape[:3]) == expect:
            vol, bled = vox.fix_bleed(vol, M, offset)
        carved[pose] = (vol, offset, vs, M)
        if stats is not None:
            stats.setdefault(aid, {})[pose] = dict(
                model=model_n, hull=hull_n, extra=hull_n - model_n, removed=removed, recoloured=recoloured,
                bleed=bled,
                missing=miss,
                split=split, shape_ok=tuple(vol.shape[:3]) == expect,
                slices=int(vol.shape[0]), size=[int(vol.shape[2]), int(vol.shape[1])], warnings=warns)

    # 姿勢をすべて同じ枠に置く（回す中心 = 物の中心）
    any_M = next(iter(carved.values()))[3]
    cx, cy = getattr(any_M, "centre", (any_M.W // 2, any_M.L // 2))
    lx = rx = ly = ry = 1
    top = 1
    for vol, (x0, y0, z0), _, _ in carved.values():
        H, L, W = vol.shape[:3]
        lx = max(lx, cx - x0)
        rx = max(rx, x0 + W - cx)
        ly = max(ly, cy - y0)
        ry = max(ry, y0 + L - cy)
        top = max(top, z0 + H)
    hx = int(math.ceil(max(lx, rx)))
    hy = int(math.ceil(max(ly, ry)))
    canvas = (cx - hx, cy - hy, 2 * hx, 2 * hy, top)
    poses = {}
    foot = None
    for pose, (vol, offset, vs, M) in carved.items():
        final = vox.place(vol, offset, canvas)
        name = f"{aid}_{pose}.png"
        vox.save_strip(final, ASSETS / name)
        vox.preview(final, vs, out_dir / f"{pose}_check.png", out_dir / f"{pose}_viewer.html", f"{aid} {pose}")
        thin = vox.thin_warnings(final)
        if stats is not None and thin:
            stats[aid][pose]["thin_after_fix"] = thin
        poses[pose] = {"file": f"assets/{name}", "w": 2 * hx, "h": 2 * hy, "count": top}
        if pose == ent["poses"][0]:
            occ = (final[..., 3] > 0).any(0)
            ys, xs = np.nonzero(occ)
            foot = (xs.min(), xs.max(), ys.min(), ys.max())
    # 影の目安: 足元の広がり（半径、絵のドット）
    sx = max(2, (foot[1] - foot[0] + 1) // 2)
    sy = max(2, (foot[3] - foot[2] + 1) // 2)
    if ent["kind"] == "actor":
        sx = sy = max(3, min(sx, sy, 8 if ent["footprint"] == [1, 1] else 16))
    entry = {"kind": ent["kind"], "footprint": ent["footprint"], "poses": poses,
             "anchor": [hx, hy], "shadow": [int(sx), int(sy)]}
    if ent.get("fly"):
        entry["fly"] = ent["fly"]
    return entry


def contact(aid: str, poses: list[str]):
    """姿勢ごとの check.png を縦につないだ 1 枚（目で見る回数を減らすため）。"""
    ims = []
    for p in poses:
        im = Image.open(PREVIEW / aid / f"{p}_check.png").convert("RGB")
        a = np.array(im).astype(int)
        busy = (np.abs(a - a[0, 0]).sum(-1) > 12).any(1)   # 背景だけの行を詰める
        keep = np.nonzero(busy)[0]
        rows = [r for r in range(a.shape[0]) if busy[max(0, r - 6) : r + 7].any()]
        ims.append(Image.fromarray(a[rows].astype(np.uint8)) if len(keep) else im)
    w = max(i.width for i in ims)
    h = sum(i.height for i in ims)
    out = Image.new("RGB", (w, h), (242, 245, 249))
    y = 0
    for i in ims:
        out.paste(i, (0, y))
        y += i.height
    (PREVIEW / "_contact").mkdir(parents=True, exist_ok=True)
    out.save(PREVIEW / "_contact" / f"{aid}.png")


def load_manifest():
    p = ASSETS / "manifest.json"
    if p.exists():
        return json.loads(p.read_text(encoding="utf-8"))
    return {"version": 1, "tile": TILE, "art": {}}


def save_manifest(man):
    man["art"] = dict(sorted(man["art"].items()))
    (ASSETS / "manifest.json").write_text(json.dumps(man, ensure_ascii=False, indent=1), encoding="utf-8")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    raw = "--raw" in sys.argv
    outline = "--outline" in sys.argv
    tiles_only = "--tiles" in sys.argv
    ASSETS.mkdir(parents=True, exist_ok=True)
    PREVIEW.mkdir(parents=True, exist_ok=True)
    man = load_manifest()
    stats_path = PREVIEW / "_stats.json"
    stats = json.loads(stats_path.read_text(encoding="utf-8")) if stats_path.exists() else {}

    if tiles_only or not args:
        import tiles
        # スタンプの名前が変わったときに古い物が残らないよう、目録とファイルから消してから作る
        for sid in [k for k, v in man["art"].items() if v.get("kind") == "stamp"]:
            del man["art"][sid]
        for f in (ASSETS / "tiles").glob("stamp_*.png"):
            f.unlink()
        for tid, entry in tiles.build_all(ASSETS / "tiles", PREVIEW / "_tiles").items():
            man["art"][tid] = entry
        swatch(PREVIEW / "_palette.png")
    if not tiles_only:
        reg = registry()
        ids = args or list(reg)
        for aid in ids:
            t0 = time.time()
            ent = reg[aid]
            man["art"][aid] = build_one(aid, ent, raw=raw, outline=outline, stats=stats)
            contact(aid, ent["poses"])
            s = stats.get(aid, {})
            extra = sum(v["extra"] for v in s.values())
            rem = sum(v["removed"] for v in s.values())
            warn = sum(len(v["warnings"]) for v in s.values())
            rec = sum(v.get("recoloured", 0) for v in s.values())
            bl = sum(v.get("bleed", 0) for v in s.values())
            print(f"{aid}: {len(ent['poses'])} poses, hull extra {extra}, removed {rem}, recoloured {rec}, "
                  f"bleed {bl}, thin-warnings {warn}, {time.time() - t0:.1f}s")
    save_manifest(man)
    stats_path.write_text(json.dumps(stats, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
