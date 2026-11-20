"""鐘なき王国: 4 方向の絵を描く道具と、スキル sprite-stacking の切り分けの呼び出し。

流れ（スキルの手順 c）
1. 小さな立体（ボクセル）を素材の番号で組み立てる（Model）。
2. そこから 上・横・前・後ろ の 4 枚を素の解像度で 1 ドットずつ描く（views）。
   4 枚は同じ立体から描くので、長さ・幅・高さが必ずそろう（スキルの「Gate 2」）。
3. 8 倍に拡大し、白地に 48 ドットずつ空けて 1 列に並べる（sheet）。
4. スキルの台本 views_to_slices.py で切り分ける（carve）。
5. 隠れたくぼみや、歩く足の重なりで埋まった所を、立体と照らして直す（fix_hull、スキルの
   「Fix those slices by hand after carving」に当たる。どれだけ直したかを記録する）。
6. 向きを変えても中心がずれないよう、同じ物の姿勢をすべて同じ大きさの枠に置く（place）。

座標: x = 幅（右が +）、y = 奥行き（+y が前。上の絵では下が前）、z = 高さ（0 が地面）。
"""

from __future__ import annotations

import importlib.util
import json
import math
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

from palette import EMISSIVE, FLAT, INDEX, NAMES, RAMPS

SKILL = Path(r"D:/soft/dekiru-html/.claude/skills/sprite-stacking/scripts")
VTS = SKILL / "views_to_slices.py"

_vts_mod = None


def vts():
    """スキルの台本をモジュールとして読む（確かめの絵と表示器を、直した後の立体でも作るため）。"""
    global _vts_mod
    if _vts_mod is None:
        spec = importlib.util.spec_from_file_location("views_to_slices", VTS)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        _vts_mod = mod
    return _vts_mod


class Model:
    def __init__(self, W: int, L: int, H: int):
        self.W, self.L, self.H = W, L, H
        self.m = np.zeros((H, L, W), np.int16)   # 素材の番号（0 は空）
        self.t = np.zeros((H, L, W), np.int8)    # 段のずらし（模様用）
        zz, yy, xx = np.mgrid[0:H, 0:L, 0:W]
        self.cz, self.cy, self.cx = zz + 0.5, yy + 0.5, xx + 0.5

    # ---- 置く ----
    def _put(self, mask, mat, tone=0):
        if mat is None:
            self.m[mask] = 0
            self.t[mask] = 0
        else:
            self.m[mask] = INDEX[mat]
            self.t[mask] = tone

    def box(self, x0, x1, y0, y1, z0, z1, mat, tone=0):
        """両端を含む整数の範囲に箱を置く。"""
        x0, x1 = max(0, x0), min(self.W - 1, x1)
        y0, y1 = max(0, y0), min(self.L - 1, y1)
        z0, z1 = max(0, z0), min(self.H - 1, z1)
        if x0 > x1 or y0 > y1 or z0 > z1:
            return
        sl = (slice(z0, z1 + 1), slice(y0, y1 + 1), slice(x0, x1 + 1))
        if mat is None:
            self.m[sl] = 0
            self.t[sl] = 0
        else:
            self.m[sl] = INDEX[mat]
            self.t[sl] = tone

    def ell(self, cx, cy, cz, rx, ry, rz, mat, tone=0, only=None):
        """楕円体。中心は連続の座標（整数にすると偶数の幅になる）。"""
        d = ((self.cx - cx) / rx) ** 2 + ((self.cy - cy) / ry) ** 2 + ((self.cz - cz) / rz) ** 2
        mask = d <= 1.0
        if only is not None:
            mask &= only(self)
        self._put(mask, mat, tone)

    def cyl(self, cx, cy, rx, ry, z0, z1, mat, tone=0):
        """縦の楕円柱。z は両端を含む整数。"""
        d = ((self.cx - cx) / rx) ** 2 + ((self.cy - cy) / ry) ** 2
        mask = (d <= 1.0) & (self.cz >= z0) & (self.cz <= z1 + 1)
        self._put(mask, mat, tone)

    def cone(self, cx, cy, r0, r1, z0, z1, mat, tone=0, ry_scale=1.0):
        """縦の円すい台。z0 で半径 r0、z1 で半径 r1。"""
        for z in range(max(0, z0), min(self.H - 1, z1) + 1):
            f = 0 if z1 == z0 else (z - z0) / (z1 - z0)
            r = r0 + (r1 - r0) * f
            if r <= 0.3:
                continue
            d = ((self.cx[z] - cx) / r) ** 2 + ((self.cy[z] - cy) / (r * ry_scale)) ** 2
            mask = d <= 1.0
            if mat is None:
                self.m[z][mask] = 0
            else:
                self.m[z][mask] = INDEX[mat]
                self.t[z][mask] = tone

    def seg(self, a, b, mat, r=1.0, tone=0):
        """太い線（端が丸い）。a, b は連続の座標 (x, y, z)。r=1 で 2 ドットの太さ。"""
        a = np.asarray(a, float)
        b = np.asarray(b, float)
        ab = b - a
        L2 = float(ab @ ab) or 1e-9
        px, py, pz = self.cx - a[0], self.cy - a[1], self.cz - a[2]
        t = np.clip((px * ab[0] + py * ab[1] + pz * ab[2]) / L2, 0, 1)
        dx, dy, dz = px - t * ab[0], py - t * ab[1], pz - t * ab[2]
        mask = dx * dx + dy * dy + dz * dz <= r * r
        self._put(mask, mat, tone)

    # ---- 表面に塗る（形は変えない） ----
    def paint(self, side, u0, u1, z0, z1, mat, tone=0, depth=1):
        """見える面の手前 depth 個を塗る。side: front/back/left/right/top。
        front/back の u は x、left/right の u は y、top のときは u=x、z の所は y の範囲。"""
        occ = self.m > 0
        idx = INDEX[mat]
        if side == "top":
            for y in range(max(0, z0), min(self.L - 1, z1) + 1):
                for x in range(max(0, u0), min(self.W - 1, u1) + 1):
                    zs = np.nonzero(occ[:, y, x])[0]
                    for k in range(min(depth, len(zs))):
                        z = zs[-1 - k]
                        self.m[z, y, x] = idx
                        self.t[z, y, x] = tone
            return
        for z in range(max(0, z0), min(self.H - 1, z1) + 1):
            for u in range(u0, u1 + 1):
                if side in ("front", "back"):
                    if not 0 <= u < self.W:
                        continue
                    col = occ[z, :, u]
                    ys = np.nonzero(col)[0]
                    if len(ys) == 0:
                        continue
                    seq = ys[::-1] if side == "front" else ys
                    for k in range(min(depth, len(seq))):
                        self.m[z, seq[k], u] = idx
                        self.t[z, seq[k], u] = tone
                else:
                    if not 0 <= u < self.L:
                        continue
                    row = occ[z, u, :]
                    xs = np.nonzero(row)[0]
                    if len(xs) == 0:
                        continue
                    seq = xs if side == "left" else xs[::-1]
                    for k in range(min(depth, len(seq))):
                        self.m[z, u, seq[k]] = idx
                        self.t[z, u, seq[k]] = tone

    def mirror_x(self, about: float):
        """x = about を軸に左右を写す（左右対称の物を半分だけ描くとき）。"""
        W = self.W
        src_m, src_t = self.m.copy(), self.t.copy()
        for x in range(W):
            xm = int(round(2 * about - x - 1))
            if 0 <= xm < W:
                take = (src_m[:, :, x] > 0) & (self.m[:, :, xm] == 0)
                self.m[:, :, xm][take] = src_m[:, :, x][take]
                self.t[:, :, xm][take] = src_t[:, :, x][take]

    def recolour(self, mapping: dict[str, str]):
        for a, b in mapping.items():
            self.m[self.m == INDEX[a]] = INDEX[b]

    def shift(self, dz=0, dy=0, dx=0, region=None):
        """立体の一部（region: (z0,z1) の高さの範囲）を動かす。"""
        m, t = self.m, self.t
        if region is None:
            zsl = slice(0, self.H)
        else:
            zsl = slice(region[0], region[1] + 1)
        part_m = m[zsl].copy()
        part_t = t[zsl].copy()
        m[zsl] = 0
        t[zsl] = 0
        part_m = np.roll(part_m, (dy, dx), axis=(1, 2))
        part_t = np.roll(part_t, (dy, dx), axis=(1, 2))
        if dz:
            nm = np.zeros_like(m)
            nt = np.zeros_like(t)
            z0 = (zsl.start or 0) + dz
            n = part_m.shape[0]
            a0, a1 = max(0, z0), min(self.H, z0 + n)
            nm[a0:a1] = part_m[a0 - z0 : a1 - z0]
            nt[a0:a1] = part_t[a0 - z0 : a1 - z0]
            keep = nm > 0
            m[keep] = nm[keep]
            t[keep] = nt[keep]
        else:
            keep = part_m > 0
            m[zsl][keep] = part_m[keep]
            t[zsl][keep] = part_t[keep]

    def bbox(self):
        occ = self.m > 0
        zs, ys, xs = np.nonzero(occ)
        return (xs.min(), xs.max(), ys.min(), ys.max(), zs.min(), zs.max())


# ---------- 4 方向の絵を描く ----------

def _rgb(mat_idx: int, tone: int):
    name = NAMES[mat_idx - 1]
    if name in EMISSIVE:
        tone = 3 if tone >= 2 else 2
    return RAMPS[name][max(0, min(3, tone))]


def _side_view(mc, tc, dep):
    """dep: 各 (行=z, 列=u) で一番手前の面の近さ（大きいほど手前、-1 は空）。
    mc/tc: その面の素材と段のずらし。行 0 が z=0。"""
    H, U = dep.shape
    img = np.zeros((H, U, 4), np.uint8)
    for z in range(H):
        for u in range(U):
            d = dep[z, u]
            if d < 0:
                continue
            above = dep[z + 1, u] if z + 1 < H else -1
            # 1 段ずつの奥行きの差で段を変えると、斜めの棒（階段状）が縞になる。
            # そのため 2 以上の差だけを見る。
            if above < 0:
                tone = 3                      # 上の縁: 明るい
            elif above - d >= 4:
                tone = 0                      # 深い張り出しの下
            elif above - d >= 2:
                tone = 1                      # 張り出しの下: 影
            elif d - above >= 2:
                tone = 3                      # 上が奥へ大きく下がる面: 明るい
            else:
                tone = 2
            img[H - 1 - z, u] = (*_rgb(int(mc[z, u]), tone + int(tc[z, u])), 255)
    return img


def views(model: Model):
    """上・横・前・後ろの 4 枚（RGBA、素の解像度、外接の箱で切った物）と切った位置を返す。"""
    x0, x1, y0, y1, z0, z1 = model.bbox()
    m = model.m[z0 : z1 + 1, y0 : y1 + 1, x0 : x1 + 1]
    t = model.t[z0 : z1 + 1, y0 : y1 + 1, x0 : x1 + 1]
    H, L, W = m.shape
    occ = m > 0

    # 上: 一番高い面
    any_z = occ.any(0)
    topz = np.where(any_z, H - 1 - np.argmax(occ[::-1], axis=0), -1)
    top = np.zeros((L, W, 4), np.uint8)
    pad = np.pad(topz, 1, constant_values=-1)
    nb = np.max(np.stack([pad[:-2, 1:-1], pad[2:, 1:-1], pad[1:-1, :-2], pad[1:-1, 2:]]), axis=0)
    for y in range(L):
        for x in range(W):
            z = topz[y, x]
            if z < 0:
                continue
            higher = nb[y, x] - z
            tone = 3
            if higher >= 1:
                tone = 2
            if higher >= 4:
                tone = 1
            if z < 0.2 * H and tone > 1:
                tone -= 1
            top[y, x] = (*_rgb(int(m[z, y, x]), tone + int(t[z, y, x])), 255)

    def facing(axis_occ, mm, tt, reverse):
        # axis_occ: (H, U, D) 奥行きの軸が最後。reverse=True なら D の大きい方が手前
        Hh, U, D = axis_occ.shape
        anyd = axis_occ.any(2)
        if reverse:
            idx = D - 1 - np.argmax(axis_occ[:, :, ::-1], axis=2)
            dep = np.where(anyd, idx, -1)
        else:
            idx = np.argmax(axis_occ, axis=2)
            dep = np.where(anyd, D - 1 - idx, -1)
        mc = np.take_along_axis(mm, idx[..., None], 2)[..., 0]
        tc = np.take_along_axis(tt, idx[..., None], 2)[..., 0]
        return _side_view(mc, tc, dep)

    # 前（+y から見る）: 列 = x
    occ_f = occ.transpose(0, 2, 1)       # (H, W, L)
    front = facing(occ_f, m.transpose(0, 2, 1), t.transpose(0, 2, 1), reverse=True)
    # 後ろ（-y から見る）: 列 = W-1-x
    back = facing(occ_f, m.transpose(0, 2, 1), t.transpose(0, 2, 1), reverse=False)[:, ::-1]
    # 横（-x から見る、前が左）: 列 = L-1-y
    side = facing(occ, m, t, reverse=False)[:, ::-1]
    return [top, side, front, back], (int(x0), int(y0), int(z0))


def pieces(v: np.ndarray) -> list[int]:
    """1 枚の絵が、つながった何個の部品に分かれているか（8 方向）。
    切り分けの台本は 8 倍の絵で 2 ドットしか太らせずに部品を探すので、素の 1 ドットの隙間でも
    別の絵として扱い、小さければ捨て、大きければ「4 枚ではない」で止まる。"""
    m = v[..., 3] > 0
    seen = np.zeros_like(m)
    sizes = []
    for y0, x0 in zip(*np.nonzero(m)):
        if seen[y0, x0]:
            continue
        st = [(y0, x0)]
        seen[y0, x0] = True
        c = 0
        while st:
            y, x = st.pop()
            c += 1
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    j, i = y + dy, x + dx
                    if 0 <= j < m.shape[0] and 0 <= i < m.shape[1] and m[j, i] and not seen[j, i]:
                        seen[j, i] = True
                        st.append((j, i))
        sizes.append(c)
    return sizes


def outlined(v: np.ndarray, colour=(24, 20, 30)) -> np.ndarray:
    h, w = v.shape[:2]
    o = np.zeros((h + 2, w + 2, 4), np.uint8)
    o[1:-1, 1:-1] = v
    a = o[..., 3] > 0
    p = np.pad(a, 1)
    ring = ~a & (p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:])
    o[ring] = (*colour, 255)
    return o


def sheet(vs: list[np.ndarray], path: Path, scale=8, gap=48, outline=False) -> int:
    """4 枚を 8 倍にして白地に 1 列に並べる。返り値は横の絵の素の高さ（--slices に使う）。"""
    if outline:
        vs = [outlined(v) for v in vs]
    w = sum(v.shape[1] * scale for v in vs) + gap * (len(vs) + 1)
    h = max(v.shape[0] * scale for v in vs) + gap * 2
    out = Image.new("RGBA", (w, h), (255, 255, 255, 255))
    x = gap
    for v in vs:
        im = Image.fromarray(v).resize((v.shape[1] * scale, v.shape[0] * scale), Image.NEAREST)
        out.paste(im, (x, (h - im.height) // 2), im)
        x += im.width + gap
    path.parent.mkdir(parents=True, exist_ok=True)
    out.convert("RGB").save(path)
    return vs[1].shape[0]


def carve(sheet_path: Path, strip_path: Path, slices: int, *, round_=False, outline=False,
          shade=0.15, check: Path | None = None, html: Path | None = None) -> tuple[np.ndarray, list[str]]:
    """スキルの台本をコマンドとして呼ぶ。立体 (z, y, x, rgba) と警告を返す。"""
    cmd = [sys.executable, str(VTS), str(sheet_path), str(strip_path),
           "--slices", str(slices), "--top-nose", "down", "--order", "reading",
           "--colours", "0", "--shade", str(shade)]
    if not outline:
        cmd += ["--dark-thresh", "0"]
    if round_:
        cmd.append("--round")
    if check:
        cmd += ["--preview", str(check)]
    if html:
        cmd += ["--html", str(html)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"views_to_slices failed: {r.stderr}\n{r.stdout}")
    warnings = [ln for ln in r.stdout.splitlines() if ln.startswith("warning")]
    strip = np.array(Image.open(strip_path).convert("RGBA"))
    n = slices
    w = strip.shape[1] // n
    vol = np.stack([strip[:, i * w : (i + 1) * w] for i in range(n)])
    return vol, warnings


def _surface(occ: np.ndarray) -> np.ndarray:
    p = np.pad(occ, 1)
    inner = (p[:-2, 1:-1, 1:-1] & p[2:, 1:-1, 1:-1] & p[1:-1, :-2, 1:-1] & p[1:-1, 2:, 1:-1]
             & p[1:-1, 1:-1, :-2] & p[1:-1, 1:-1, 2:])
    return occ & ~inner


def fix_hull(vol: np.ndarray, model: Model, offset) -> tuple[np.ndarray, int, int]:
    """立体に無いのに、見た目の殻で埋まった所を消す。
    消したことで外から見えるようになった所は、殻の中で「上の色」を受け継いだだけの色
    （頭の角の骨の色が衣の中まで続く等）なので、立体の素材の影の段で塗り直す。
    消した数と塗り直した数を返す。"""
    x0, y0, z0 = offset
    H, L, W = vol.shape[:3]
    sub_m = model.m[z0 : z0 + H, y0 : y0 + L, x0 : x0 + W]
    sub_t = model.t[z0 : z0 + H, y0 : y0 + L, x0 : x0 + W]
    occ = sub_m > 0
    hull = vol[..., 3] > 0
    extra = hull & ~occ
    out = vol.copy()
    out[extra] = 0
    fixed = out[..., 3] > 0
    newly = _surface(fixed) & ~_surface(hull)
    for z, y, x in zip(*np.nonzero(newly)):
        out[z, y, x, :3] = _rgb(int(sub_m[z, y, x]), 1 + int(sub_t[z, y, x]))
    return out, int(extra.sum()), int(newly.sum())


def fix_bleed(vol: np.ndarray, model: Model, offset, limit=45, shade=0.15) -> tuple[np.ndarray, int]:
    """色のにじみを直す。切り分けの台本は、横の面の色を「横の絵のその行・その位置の色」で塗る。
    横の絵は 1 枚なので、左手の盾や右手の杖の色が、反対側の面にも付く。
    立体の素材のどの段（台本の暗くする分も含む）とも大きく違う色だけを、
    中間の段に台本と同じ暗くする割合を掛けた色に替える。"""
    x0, y0, z0 = offset
    H, L, W = vol.shape[:3]
    sub_m = model.m[z0 : z0 + H, y0 : y0 + L, x0 : x0 + W]
    sub_t = model.t[z0 : z0 + H, y0 : y0 + L, x0 : x0 + W]
    out = vol.copy()
    surf = _surface(vol[..., 3] > 0) & (sub_m > 0)
    n = 0
    for z, y, x in zip(*np.nonzero(surf)):
        name = NAMES[int(sub_m[z, y, x]) - 1]
        c = out[z, y, x, :3].astype(int)
        ramp = np.array(RAMPS[name], int)
        best = min(np.abs(c - ramp[k] * f).sum() for k in range(4) for f in (1.0, 0.9, 0.8, 0.7))
        if best > limit:
            factor = 1.0 - shade * (1.0 - z / max(H - 1, 1)) - shade * 0.4
            base = np.array(_rgb(int(sub_m[z, y, x]), 2 + int(sub_t[z, y, x])), float)
            out[z, y, x, :3] = np.clip(base * factor, 0, 255).astype(np.uint8)
            n += 1
    return out, n


def missing(vol: np.ndarray, model: Model, offset) -> int:
    x0, y0, z0 = offset
    H, L, W = vol.shape[:3]
    occ = model.m[z0 : z0 + H, y0 : y0 + L, x0 : x0 + W] > 0
    return int((occ & ~(vol[..., 3] > 0)).sum())


def place(vol: np.ndarray, offset, canvas) -> np.ndarray:
    """立体を、物ごとに決めた枠 (cx0, cy0, CW, CL, CH) に置く。枠の外は切る。"""
    cx0, cy0, CW, CL, CH = canvas
    x0, y0, z0 = offset
    out = np.zeros((CH, CL, CW, 4), np.uint8)
    H, L, W = vol.shape[:3]
    for z in range(H):
        zz = z0 + z
        if not 0 <= zz < CH:
            continue
        ys, ye = y0 - cy0, y0 - cy0 + L
        xs, xe = x0 - cx0, x0 - cx0 + W
        a0, a1 = max(0, ys), min(CL, ye)
        b0, b1 = max(0, xs), min(CW, xe)
        out[zz, a0:a1, b0:b1] = vol[z, a0 - ys : a1 - ys, b0 - xs : b1 - xs]
    return out


def save_strip(vol: np.ndarray, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.concatenate(list(vol), axis=1)).save(path)


def thin_warnings(vol: np.ndarray) -> list[tuple[int, int]]:
    return vts().thin_runs(vol)


def preview(vol: np.ndarray, vs: list[np.ndarray], check: Path, html: Path | None, title: str):
    mod = vts()
    mod.build_preview(vol, vs, check)
    if html:
        mod.build_html_viewer(vol, vs, html, title=title)
