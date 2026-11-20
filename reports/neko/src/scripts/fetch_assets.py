"""Poly Haven（CC0）から素材を取る。2K 以下・合計 300 MB 以内。

使い方: <Blender の python> -I scripts/fetch_assets.py
取得先は api.polyhaven.com と dl.polyhaven.org だけ。
結果: assets/ 以下のファイルと assets/manifest.json、logs/assets.tsv（一覧）。
"""
import json
import os
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import ASSETS, LOGS, log  # noqa: E402

UA = {"User-Agent": "neko-pov-experiment/1.0 (local test render)"}
API = "https://api.polyhaven.com"
ALLOWED_HOSTS = ("https://api.polyhaven.com/", "https://dl.polyhaven.org/")
LIMIT_BYTES = 300 * 1000 * 1000

HDRIS = ["qwantani_sunset_puresky"]
TEXTURES = [
    "asphalt_02",            # 道路
    "rough_concrete",        # ブロック塀・側溝のふた・電柱
    "white_stucco_02",       # 家の壁（モルタル）
    "beige_wall_002",        # 家の壁（塗り壁）
    "grey_roof_tiles",       # 屋根
    "worn_corrugated_iron",  # トタン
    "weathered_plank_siding",  # 板壁
    "raked_dirt",            # 庭の土
]
TEX_MAPS = ["Diffuse", "nor_gl", "Rough"]
MODELS = [
    "potted_plant_01", "potted_plant_02", "potted_plant_04", "planter_pot_clay",
    "exterior_aircon_unit", "weed_plant_02", "dandelion_01", "shrub_04",
    "grass_medium_01", "watering_can_metal_01",
]


def get_json(url):
    assert url.startswith(ALLOWED_HOSTS), url
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return json.load(r)


def download(url, dest, size):
    assert url.startswith(ALLOWED_HOSTS), url
    if os.path.exists(dest) and os.path.getsize(dest) == size:
        return False
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    tmp = dest + ".part"
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                data = r.read()
            break
        except Exception as e:  # 一時的な失敗は 3 回まで試す
            if attempt == 2:
                raise
            print("retry", url, e)
            time.sleep(2)
    with open(tmp, "wb") as f:
        f.write(data)
    os.replace(tmp, dest)
    return True


def safe_rel(rel):
    rel = rel.replace("\\", "/")
    assert not rel.startswith("/") and ".." not in rel.split("/"), rel
    return rel


def main():
    t0 = time.time()
    plan = []  # (asset_id, kind, name, rel_path, url, size)
    manifest = {"hdri": {}, "textures": {}, "models": {}}
    for aid in HDRIS:
        info = get_json(f"{API}/info/{aid}")
        f = get_json(f"{API}/files/{aid}")["hdri"]["2k"]["hdr"]
        rel = f"hdri/{aid}_2k.hdr"
        plan.append((aid, "hdri", info["name"], rel, f["url"], f["size"]))
        manifest["hdri"][aid] = {"file": rel}
    for aid in TEXTURES:
        info = get_json(f"{API}/info/{aid}")
        files = get_json(f"{API}/files/{aid}")
        maps = {}
        for m in TEX_MAPS:
            f = files[m]["2k"]["jpg"]
            rel = f"textures/{aid}/" + safe_rel(f["url"].rsplit("/", 1)[1])
            plan.append((aid, "texture", info["name"], rel, f["url"], f["size"]))
            maps[m] = rel
        dims = info.get("dimensions") or [2000, 2000]
        manifest["textures"][aid] = {"maps": maps, "size_m": [dims[0] / 1000.0, dims[1] / 1000.0]}
    for aid in MODELS:
        info = get_json(f"{API}/info/{aid}")
        g = get_json(f"{API}/files/{aid}")["gltf"]["2k"]["gltf"]
        rel = f"models/{aid}/" + safe_rel(g["url"].rsplit("/", 1)[1])
        plan.append((aid, "model", info["name"], rel, g["url"], g["size"]))
        for inc_rel, inc in g.get("include", {}).items():
            plan.append((aid, "model", info["name"], f"models/{aid}/" + safe_rel(inc_rel), inc["url"], inc["size"]))
        manifest["models"][aid] = {"gltf": rel}

    total = sum(p[5] for p in plan)
    log("fetch", "plan", f"files={len(plan)} bytes={total}")
    if total > LIMIT_BYTES:
        log("fetch", "error", f"total {total} > limit {LIMIT_BYTES}")
        sys.exit(1)

    n_new = 0
    for aid, kind, name, rel, url, size in plan:
        if download(url, os.path.join(ASSETS, rel), size):
            n_new += 1
    with open(os.path.join(ASSETS, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=1)

    # 一覧（素材ごとの合計）
    os.makedirs(LOGS, exist_ok=True)
    per = {}
    for aid, kind, name, rel, url, size in plan:
        e = per.setdefault(aid, {"kind": kind, "name": name, "bytes": 0, "files": 0})
        e["bytes"] += size
        e["files"] += 1
    with open(os.path.join(LOGS, "assets.tsv"), "w", encoding="utf-8") as f:
        f.write("id\tkind\tname\tpage_url\tlicense\tfiles\tbytes\n")
        for aid, e in per.items():
            f.write(f"{aid}\t{e['kind']}\t{e['name']}\thttps://polyhaven.com/a/{aid}\tCC0 1.0\t{e['files']}\t{e['bytes']}\n")
        f.write(f"TOTAL\t\t\t\t\t{len(plan)}\t{total}\n")
    with open(os.path.join(LOGS, "assets_files.tsv"), "w", encoding="utf-8") as f:
        f.write("id\tfile\turl\tbytes\n")
        for aid, kind, name, rel, url, size in plan:
            f.write(f"{aid}\tassets/{rel}\t{url}\t{size}\n")
    log("fetch", "ok", f"new={n_new} files={len(plan)} bytes={total} sec={time.time() - t0:.1f}")


if __name__ == "__main__":
    main()
