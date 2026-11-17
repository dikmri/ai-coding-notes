// お絵かきの計算: 画像（{ width, height, data: RGBA の並び }）への点の塗り、直線・四角・楕円・ブラシの形、
// 塗りつぶし、網点（2色の市松）、元に戻す・やり直し、表示の位置から画像の位置への換算。
// 形はどれも1マスずつの点で作り、ぼかさない（ドット絵がにじまないように）。画面には触らない（テストは tests/os-paint.test.mjs）。

export function makeImage(width, height, rgba = [0, 0, 0, 0]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set(rgba, i);
  return { width, height, data };
}
export const inside = (img, x, y) => x >= 0 && y >= 0 && x < img.width && y < img.height;
export function getPx(img, x, y) { const i = (y * img.width + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]]; }
export function setPx(img, x, y, c) { const i = (y * img.width + x) * 4; img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = c[3]; }
const same = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];

// 色の決め方: いつも同じ色か、網点（前の色と後ろの色を市松に）
export const solid = (c) => () => c;
export const dither = (a, b) => (x, y) => ((x + y) & 1 ? b : a);

// 点の並びを塗る。画像の外の点は捨て、塗った数を返す
export function paint(img, pts, colorFn) {
  let n = 0;
  for (const [x, y] of pts) if (inside(img, x, y)) { setPx(img, x, y, colorFn(x, y)); n++; }
  return n;
}

// ブレゼンハムの直線（始まりと終わりを含む）
export function linePoints(x0, y0, x1, y1) {
  const out = [], dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy, x = x0, y = y0;
  for (;;) {
    out.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
  return out;
}

export function rectPoints(x0, y0, x1, y1, fill) {
  const [l, r] = x0 < x1 ? [x0, x1] : [x1, x0], [t, b] = y0 < y1 ? [y0, y1] : [y1, y0], out = [];
  for (let y = t; y <= b; y++) for (let x = l; x <= r; x++) if (fill || x === l || x === r || y === t || y === b) out.push([x, y]);
  return out;
}

// 楕円: 囲む四角の中で、マスの中心が楕円の中にあるマス。枠だけのときは、上下左右のどれかが外にあるマス
export function ellipsePoints(x0, y0, x1, y1, fill) {
  const [l, r] = x0 < x1 ? [x0, x1] : [x1, x0], [t, b] = y0 < y1 ? [y0, y1] : [y1, y0];
  const cx = (l + r) / 2, cy = (t + b) / 2, rx = (r - l) / 2 + 0.5, ry = (b - t) / 2 + 0.5;
  const isIn = (x, y) => x >= l && x <= r && y >= t && y <= b && ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  const out = [];
  for (let y = t; y <= b; y++) for (let x = l; x <= r; x++) {
    if (!isIn(x, y)) continue;
    if (fill || !isIn(x - 1, y) || !isIn(x + 1, y) || !isIn(x, y - 1) || !isIn(x, y + 1)) out.push([x, y]);
  }
  return out;
}

// ブラシの形: 大きさ n の丸（1 は1点、3 は 3×3、4 から角が落ちる）
export function brushPoints(cx, cy, n) {
  const o = Math.floor(n / 2), r = n / 2, out = [];
  for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) if ((dx + 0.5 - r) ** 2 + (dy + 0.5 - r) ** 2 <= r * r) out.push([cx - o + dx, cy - o + dy]);
  return out;
}

// 塗りつぶし: (x, y) と同じ色で上下左右に続いた所を塗る。実際に色が変わった数を返す
export function floodFill(img, x, y, colorFn) {
  if (!inside(img, x, y)) return 0;
  const target = getPx(img, x, y), seen = new Uint8Array(img.width * img.height), stack = [x, y];
  let n = 0;
  while (stack.length) {
    const py = stack.pop(), px = stack.pop();
    if (!inside(img, px, py)) continue;
    const k = py * img.width + px;
    if (seen[k]) continue;
    seen[k] = 1;
    if (!same(getPx(img, px, py), target)) continue;
    const c = colorFn(px, py);
    if (!same(c, target)) { setPx(img, px, py, c); n++; }
    stack.push(px + 1, py, px - 1, py, px, py + 1, px, py - 1);
  }
  return n;
}

// 元に戻す・やり直し。push には「変える前の姿」を入れる。undo と redo には「今の姿」を渡すと、戻す先を返す
export class History {
  constructor(limit = 20) { this.limit = limit; this.u = []; this.r = []; }
  push(snap) { this.u.push(snap); if (this.u.length > this.limit) this.u.shift(); this.r = []; }
  undo(cur) { if (!this.u.length) return null; this.r.push(cur); return this.u.pop(); }
  redo(cur) { if (!this.r.length) return null; this.u.push(cur); return this.r.pop(); }
  get canUndo() { return this.u.length > 0; }
  get canRedo() { return this.r.length > 0; }
  clear() { this.u = []; this.r = []; }
}

// 拡大した表示の上の位置（画面の座標）から、画像の1マスの位置にする
export const toImage = (clientX, clientY, rect, zoom) => [Math.floor((clientX - rect.left) / zoom), Math.floor((clientY - rect.top) / zoom)];
