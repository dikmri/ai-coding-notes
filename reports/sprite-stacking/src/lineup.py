"""確かめ用: 出来上がったスライスの帯を、スキルの描き方（render_stack_image）で 4 方向に回して並べる。

  uv run --no-project --with pillow --with numpy python kanenaki/art/lineup.py <出力.png> <id> [<id> ...] [--pose idle]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.dont_write_bytecode = True
import vox  # noqa: E402

ASSETS = HERE.parent / "assets"


def load(aid, pose):
    man = json.loads((ASSETS / "manifest.json").read_text(encoding="utf-8"))
    p = man["art"][aid]["poses"][pose]
    strip = np.array(Image.open(HERE.parent / p["file"]).convert("RGBA"))
    n, w = p["count"], p["w"]
    return np.stack([strip[:, i * w : (i + 1) * w] for i in range(n)])


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    pose = "idle"
    if "--pose" in sys.argv:
        pose = sys.argv[sys.argv.index("--pose") + 1]
        args.remove(pose)
    out, ids = Path(args[0]), args[1:]
    mod = vox.vts()
    scale = 4
    rows = []
    for aid in ids:
        ims = [mod.render_stack_image(load(aid, pose), a) for a in (35, 125, 215, 305)]
        rows.append((aid, ims))
    cw = max(im.width for _, ims in rows for im in ims) * scale + 8
    ch = max(im.height for _, ims in rows for im in ims) * scale + 18
    cols = 2
    W = cols * (4 * cw + 16)
    H = ((len(rows) + cols - 1) // cols) * ch
    sheet = Image.new("RGB", (W, H), (60, 66, 58))
    d = ImageDraw.Draw(sheet)
    for i, (aid, ims) in enumerate(rows):
        ox = (i % cols) * (4 * cw + 16)
        oy = (i // cols) * ch
        d.text((ox + 4, oy + 2), aid, fill=(230, 230, 220))
        for k, im in enumerate(ims):
            up = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
            sheet.paste(up, (ox + k * cw, oy + 16), up)
    sheet.save(out)
    print(out, sheet.size)


if __name__ == "__main__":
    main()
