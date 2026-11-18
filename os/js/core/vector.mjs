// 図形エディタの計算: 図形のデータの形、行列、外接の四角（回転を含む）、当たり判定、大きさの変更と回転、方眼、
// 整列と等間隔、重なりの順、まとめる、path の d、ペンの点、色、SVG の書き出しと読み込み（消毒）、元に戻す。
// 画面には触らない純粋な関数だけを置く（テストは tests/os-vector.test.mjs）。
//
// 図形の形（どれも makeShape で作る）:
//   共通: { type, id, name, hidden, locked, opacity }。g（まとめ）以外は fill・stroke・sw（線の太さ）・rot（度）も持つ
//   rect { x, y, w, h, rx }、ellipse { cx, cy, rx, ry }、line { x1, y1, x2, y2 }、polyline / polygon { points: [[x, y], ...] }、
//   path { segs: [{ c: 'M'|'L', x, y } | { c: 'C', x1, y1, x2, y2, x, y } | { c: 'Z' }] }、text { x, y（文字の並ぶ線）, text, size, font }、
//   g { children: [図形, ...] }
// 回転（rot）を持つのは四角・だ円・文字だけ。自分の外接の四角の中心で回す。
// 直線・折れ線・多角形・path は、回すと点そのものを動かす（rot はいつも 0）。まとめは中の図形を回す。

const PI = Math.PI;
// 計算の誤差（0.1 + 0.2 など）を消す。-0 は 0 にそろえる
const R9 = (v) => { const r = Math.round(v * 1e9) / 1e9; return r === 0 ? 0 : r; };
// 書き出す数は小数 3 桁まで
export const fmt = (v) => { const r = Math.round(v * 1000) / 1000; return String(r === 0 ? 0 : r); };
const NUM = '[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?';
const NUM_G = new RegExp(NUM, 'g');
const NUM_Y = new RegExp(NUM, 'y');
const nums = (s) => (String(s ?? '').match(NUM_G) || []).map(Number);

export const TYPE_NAMES = { rect: '四角', ellipse: 'だ円', line: '直線', polyline: '折れ線', polygon: '多角形', path: 'パス', text: '文字', g: 'まとめ' };
// 文字の書体。css は SVG の font-family にそのまま書く
export const FONTS = [
  { label: 'ゴシック', css: "'BIZ UDPGothic', 'Yu Gothic UI', 'Meiryo', sans-serif" },
  { label: '明朝', css: "'BIZ UDPMincho', 'Yu Mincho', serif" },
  { label: '等幅', css: "'BIZ UDGothic', 'MS Gothic', monospace" },
  { label: '太い見出し', css: "'Arial Black', 'Impact', sans-serif" },
];
export const DEFAULT_STYLE = { fill: '#ff8ec7', stroke: '#241734', sw: 2, opacity: 1 };
const ROT_TYPES = new Set(['rect', 'ellipse', 'text']);
const POINT_TYPES = new Set(['line', 'polyline', 'polygon', 'path']);
const BASE = { name: '', hidden: false, locked: false, opacity: 1 };
const GEOM = {
  rect: { x: 0, y: 0, w: 0, h: 0, rx: 0, rot: 0 },
  ellipse: { cx: 0, cy: 0, rx: 0, ry: 0, rot: 0 },
  line: { x1: 0, y1: 0, x2: 0, y2: 0, rot: 0 },
  polyline: { points: [], rot: 0 },
  polygon: { points: [], rot: 0 },
  path: { segs: [], rot: 0 },
  text: { x: 0, y: 0, text: '', size: 32, font: FONTS[0].css, rot: 0 },
  g: { children: [] },
};

/* ---------- データの形 ---------- */
let seq = 0;
export const uid = () => 'v' + (++seq).toString(36) + Math.random().toString(36).slice(2, 7);
// 図形を作る。種類に無い性質は捨て、無い性質は既定の値で埋める（どの図形も同じ形になる）
export function makeShape(type, props = {}) {
  const geom = GEOM[type];
  if (!geom) throw new Error('知らない図形の種類です: ' + type);
  const keys = { ...BASE, ...(type === 'g' ? {} : { fill: DEFAULT_STYLE.fill, stroke: DEFAULT_STYLE.stroke, sw: DEFAULT_STYLE.sw }), ...geom };
  const s = { type, id: props.id || uid() };
  for (const k of Object.keys(keys)) {
    const v = k in props && props[k] !== undefined ? props[k] : keys[k];
    s[k] = Array.isArray(v) ? (k === 'points' ? v.map((p) => [p[0], p[1]]) : v.slice()) : v;
  }
  return s;
}
export function newDoc({ width = 800, height = 600, background = '#ffffff' } = {}) {
  return { width, height, background, shapes: [] };
}
// 中のまとめも含めた全部の図形
export const allShapes = (list) => list.flatMap((s) => (s.type === 'g' ? [s, ...allShapes(s.children)] : [s]));
// 種類ごとの次の名前（「四角 3」など）。まとめの中の図形も数える
export function nextName(list, type) {
  const base = TYPE_NAMES[type] || '図形', re = new RegExp('^' + base + ' (\\d+)$');
  let n = 0;
  for (const s of allShapes(list)) { const m = re.exec(s.name || ''); if (m) n = Math.max(n, +m[1]); }
  return `${base} ${n + 1}`;
}
export const displayName = (s) => s.name || TYPE_NAMES[s.type] || '図形';

/* ---------- 行列 [a, b, c, d, e, f]（SVG の matrix と同じ並び） ---------- */
export const I = [1, 0, 0, 1, 0, 0];
export const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
export const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
export function invert(m) {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!det) return I.slice();
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}
export const translate = (x, y) => [1, 0, 0, 1, x, y];
export const scale = (sx, sy = sx) => [sx, 0, 0, sy, 0, 0];
export function rotation(deg, cx = 0, cy = 0) {
  const a = (deg * PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy];
}
// 行列を「平行移動・回転・ずれ（skew）・拡大」に分ける。M = T · R · [[sx, k], [0, sy]]、skew = k / sy
export function decompose(m) {
  const [a, b, c, d] = m;
  const sx = Math.hypot(a, b);
  const rot = sx ? (Math.atan2(b, a) * 180) / PI : 0;
  const k = sx ? (a * c + b * d) / sx : 0;
  const sy = sx ? (a * d - b * c) / sx : Math.hypot(c, d);
  return { tx: m[4], ty: m[5], rot, sx, sy, skew: sy ? k / sy : 0 };
}
const isIdentity = (m) => m.every((v, i) => Math.abs(v - I[i]) < 1e-12);
// SVG の transform の文字を読む。読めない物が混じっていれば null
export function parseTransform(str) {
  let m = I.slice();
  const s = String(str ?? '').trim();
  const re = /\s*(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^()]*)\)\s*,?/y;
  let pos = 0;
  while (pos < s.length) {
    re.lastIndex = pos;
    const mm = re.exec(s);
    if (!mm) return null;
    pos = re.lastIndex;
    const n = nums(mm[2]);
    if (!n.length || n.some((v) => !Number.isFinite(v))) return null;
    let t;
    if (mm[1] === 'matrix') { if (n.length !== 6) return null; t = n; }
    else if (mm[1] === 'translate') t = translate(n[0], n[1] ?? 0);
    else if (mm[1] === 'scale') t = scale(n[0], n[1] ?? n[0]);
    else if (mm[1] === 'rotate') t = rotation(n[0], n[1] ?? 0, n[2] ?? 0);
    else if (mm[1] === 'skewX') t = [1, 0, Math.tan((n[0] * PI) / 180), 1, 0, 0];
    else t = [1, Math.tan((n[0] * PI) / 180), 0, 1, 0, 0];
    m = mul(m, t);
  }
  return m;
}
const normDeg = (d) => R9((((d + 180) % 360) + 360) % 360 - 180);

/* ---------- 箱（外接の四角） ---------- */
const EMPTY = { x: 0, y: 0, w: 0, h: 0 };
export function boxOfPoints(pts) {
  if (!pts.length) return { ...EMPTY };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
export function unionBox(boxes) {
  if (!boxes.length) return { ...EMPTY };
  return boxOfPoints(boxes.flatMap((b) => [[b.x, b.y], [b.x + b.w, b.y + b.h]]));
}
export const boxCorners = (b) => [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]];
// つまみの位置（箱の 4 つの角と 4 つの辺の中点）
export function handlePoints(b) {
  const x1 = b.x + b.w, y1 = b.y + b.h, mx = b.x + b.w / 2, my = b.y + b.h / 2;
  return { nw: [b.x, b.y], n: [mx, b.y], ne: [x1, b.y], e: [x1, my], se: [x1, y1], s: [mx, y1], sw: [b.x, y1], w: [b.x, my] };
}
// 文字の幅の見積もり（画面では canvas で測った幅を measure で渡す）。全角は 1 文字、半角は 0.58 文字
export function textWidth(text, size) {
  let w = 0;
  for (const ch of String(text)) { const c = ch.codePointAt(0); w += c < 0x2000 ? (ch === ' ' ? 0.3 : 0.58) : 1; }
  return w * size;
}
const measureOf = (measure) => measure || ((t, size) => textWidth(t, size));
function textBox(s, measure) { return { x: s.x, y: s.y - 0.9 * s.size, w: measureOf(measure)(s.text, s.size, s.font), h: 1.15 * s.size }; }

// 3 次ベジェの点と、傾きが 0 になる t（0〜1 の間）
const bez = (t, a, b, c, d) => { const u = 1 - t; return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d; };
function cubicExtrema(p0, p1, p2, p3) {
  const a = -p0 + 3 * p1 - 3 * p2 + p3, b = 2 * (p0 - 2 * p1 + p2), c = p1 - p0, ts = [];
  if (Math.abs(a) < 1e-12) { if (Math.abs(b) > 1e-12) ts.push(-c / b); }
  else { const disc = b * b - 4 * a * c; if (disc >= 0) { const q = Math.sqrt(disc); ts.push((-b + q) / (2 * a), (-b - q) / (2 * a)); } }
  return ts.filter((t) => t > 0 && t < 1);
}
export function segsBox(segs) {
  const pts = [];
  let cx = 0, cy = 0, sx = 0, sy = 0;
  for (const s of segs) {
    if (s.c === 'Z') { cx = sx; cy = sy; continue; }
    if (s.c === 'M') { sx = s.x; sy = s.y; }
    if (s.c === 'C') {
      for (const t of cubicExtrema(cx, s.x1, s.x2, s.x)) pts.push([bez(t, cx, s.x1, s.x2, s.x), bez(t, cy, s.y1, s.y2, s.y)]);
      for (const t of cubicExtrema(cy, s.y1, s.y2, s.y)) pts.push([bez(t, cx, s.x1, s.x2, s.x), bez(t, cy, s.y1, s.y2, s.y)]);
      if (!pts.length || pts[pts.length - 1][0] !== cx || pts[pts.length - 1][1] !== cy) pts.push([cx, cy]);
    }
    pts.push([s.x, s.y]);
    cx = s.x; cy = s.y;
  }
  return boxOfPoints(pts);
}
// 回す前の形の箱（四角・だ円・文字）。ほかの図形は外接の四角と同じ
export function localBox(s, measure) {
  if (s.type === 'rect') return { x: s.x, y: s.y, w: s.w, h: s.h };
  if (s.type === 'ellipse') return { x: s.cx - s.rx, y: s.cy - s.ry, w: 2 * s.rx, h: 2 * s.ry };
  if (s.type === 'text') return textBox(s, measure);
  return bbox(s, measure);
}
export const center = (s, measure) => { const b = localBox(s, measure); return [b.x + b.w / 2, b.y + b.h / 2]; };
// 図形の回転の行列（自分の中心で回す）。回転の無い図形は単位行列
export function shapeMatrix(s, measure) {
  if (!ROT_TYPES.has(s.type) || !s.rot) return I.slice();
  const [cx, cy] = center(s, measure);
  return rotation(s.rot, cx, cy);
}
// 画面の向きの外接の四角（回転を含む）
export function bbox(s, measure) {
  switch (s.type) {
    case 'rect': case 'text': {
      const b = localBox(s, measure);
      if (!s.rot) return b;
      const m = shapeMatrix(s, measure);
      return boxOfPoints(boxCorners(b).map(([x, y]) => apply(m, x, y)));
    }
    case 'ellipse': {
      if (!s.rot) return localBox(s);
      const a = (s.rot * PI) / 180, c = Math.cos(a), sn = Math.sin(a);
      const hw = Math.hypot(s.rx * c, s.ry * sn), hh = Math.hypot(s.rx * sn, s.ry * c);
      return { x: s.cx - hw, y: s.cy - hh, w: 2 * hw, h: 2 * hh };
    }
    case 'line': return boxOfPoints([[s.x1, s.y1], [s.x2, s.y2]]);
    case 'polyline': case 'polygon': return boxOfPoints(s.points);
    case 'path': return segsBox(s.segs);
    case 'g': return unionBox(s.children.filter((c) => !c.hidden).map((c) => bbox(c, measure)));
    default: return { ...EMPTY };
  }
}
// 画面での 4 つの角（回した四角の枠を描くのに使う）
export function corners(s, measure) {
  const m = shapeMatrix(s, measure);
  return boxCorners(localBox(s, measure)).map(([x, y]) => apply(m, x, y));
}

/* ---------- 当たり判定 ---------- */
// path を折れ線にする（曲線は steps 個に分ける）。[{ pts: [[x, y], ...], closed }]
export function flatten(segs, steps = 16) {
  const subs = [];
  let cur = null, cx = 0, cy = 0, sx = 0, sy = 0;
  for (const s of segs) {
    if (s.c === 'M') { cur = { pts: [[s.x, s.y]], closed: false }; subs.push(cur); cx = sx = s.x; cy = sy = s.y; continue; }
    if (s.c === 'Z') { if (cur) cur.closed = true; cur = null; cx = sx; cy = sy; continue; }
    if (!cur) { cur = { pts: [[cx, cy]], closed: false }; subs.push(cur); }
    if (s.c === 'C') for (let k = 1; k <= steps; k++) { const t = k / steps; cur.pts.push([bez(t, cx, s.x1, s.x2, s.x), bez(t, cy, s.y1, s.y2, s.y)]); }
    else cur.pts.push([s.x, s.y]);
    cx = s.x; cy = s.y;
  }
  return subs;
}
function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
// 0 でない巻き数（SVG の既定の nonzero）で、点が中にあるか
function windingInside(subs, x, y) {
  let wn = 0;
  for (const { pts } of subs) {
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
      const cross = (bx - ax) * (y - ay) - (x - ax) * (by - ay);
      if (ay <= y) { if (by > y && cross > 0) wn++; }
      else if (by <= y && cross < 0) wn--;
    }
  }
  return wn !== 0;
}
function hitSubs(subs, x, y, e, filled) {
  if (filled && windingInside(subs, x, y)) return true;
  for (const { pts, closed } of subs) {
    for (let i = 1; i < pts.length; i++) if (distSeg(x, y, ...pts[i - 1], ...pts[i]) <= e) return true;
    if (closed && pts.length > 2 && distSeg(x, y, ...pts[pts.length - 1], ...pts[0]) <= e) return true;
    if (pts.length === 1 && Math.hypot(x - pts[0][0], y - pts[0][1]) <= e) return true;
  }
  return false;
}
// 点 (x, y) が図形に当たるか。tol は許す幅（画面の数 px を拡大率で割った値）。線は太さの半分まで当たる
export function hitShape(s, x, y, tol = 0, measure) {
  if (s.type === 'g') return s.children.some((c) => !c.hidden && hitShape(c, x, y, tol, measure));
  if (ROT_TYPES.has(s.type) && s.rot) [x, y] = apply(invert(shapeMatrix(s, measure)), x, y);
  const e = (s.stroke !== 'none' ? s.sw / 2 : 0) + tol, filled = s.fill !== 'none';
  switch (s.type) {
    case 'rect': {
      if (x < s.x - e || x > s.x + s.w + e || y < s.y - e || y > s.y + s.h + e) return false;
      if (filled) return true;
      return !(x > s.x + e && x < s.x + s.w - e && y > s.y + e && y < s.y + s.h - e);
    }
    case 'ellipse': {
      const dx = x - s.cx, dy = y - s.cy;
      if ((dx / (s.rx + e)) ** 2 + (dy / (s.ry + e)) ** 2 > 1) return false;
      if (filled) return true;
      const irx = s.rx - e, iry = s.ry - e;
      return irx <= 0 || iry <= 0 || (dx / irx) ** 2 + (dy / iry) ** 2 >= 1;
    }
    case 'line': return distSeg(x, y, s.x1, s.y1, s.x2, s.y2) <= s.sw / 2 + tol;
    case 'polyline': return hitSubs([{ pts: s.points, closed: false }], x, y, e, filled);
    case 'polygon': return hitSubs([{ pts: s.points, closed: true }], x, y, e, filled);
    case 'path': return hitSubs(flatten(s.segs), x, y, e, filled);
    case 'text': { const b = textBox(s, measure); return x >= b.x - tol && x <= b.x + b.w + tol && y >= b.y - tol && y <= b.y + b.h + tol; }
    default: return false;
  }
}
// 一番上（並びの後ろ）の当たる図形の番号。隠した図形と固定した図形は選ばない。無ければ -1
export function pick(list, x, y, tol = 0, measure) {
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i];
    if (!s.hidden && !s.locked && hitShape(s, x, y, tol, measure)) return i;
  }
  return -1;
}
// 囲んで選ぶ: 外接の四角が全部入る図形の番号
export function inMarquee(list, r, measure) {
  const out = [];
  list.forEach((s, i) => {
    if (s.hidden || s.locked) return;
    const b = bbox(s, measure);
    if (b.x >= r.x && b.y >= r.y && b.x + b.w <= r.x + r.w && b.y + b.h <= r.y + r.h) out.push(i);
  });
  return out;
}

/* ---------- 動かす・大きさ・回す ---------- */
// 点の図形（直線・折れ線・多角形・path）の点を行列で動かす
export function transformPoints(s, m) {
  const tp = (x, y) => apply(m, x, y).map(R9);
  if (s.type === 'line') { const [x1, y1] = tp(s.x1, s.y1), [x2, y2] = tp(s.x2, s.y2); return { ...s, x1, y1, x2, y2 }; }
  if (s.type === 'polyline' || s.type === 'polygon') return { ...s, points: s.points.map(([x, y]) => tp(x, y)) };
  if (s.type === 'path') {
    return {
      ...s,
      segs: s.segs.map((g) => {
        if (g.c === 'Z') return { c: 'Z' };
        const [x, y] = tp(g.x, g.y);
        if (g.c !== 'C') return { c: g.c, x, y };
        const [x1, y1] = tp(g.x1, g.y1), [x2, y2] = tp(g.x2, g.y2);
        return { c: 'C', x1, y1, x2, y2, x, y };
      }),
    };
  }
  return s;
}
export function moveShape(s, dx, dy) {
  if (!dx && !dy) return s;
  switch (s.type) {
    case 'rect': case 'text': return { ...s, x: R9(s.x + dx), y: R9(s.y + dy) };
    case 'ellipse': return { ...s, cx: R9(s.cx + dx), cy: R9(s.cy + dy) };
    case 'g': return { ...s, children: s.children.map((c) => moveShape(c, dx, dy)) };
    default: return transformPoints(s, translate(dx, dy));
  }
}
// つまみ（nw n ne e se s sw w）を (dx, dy) だけ動かしたあとの箱。反対の辺は動かない。
// keepRatio: 縦横の比を保つ（Shift）。fromCenter: 中心を動かさない。幅と高さは 1 より小さくしない
export function resizeBox(b, handle, dx, dy, { keepRatio = false, fromCenter = false } = {}) {
  let x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h;
  const W = handle.includes('w'), E = handle.includes('e'), N = handle.includes('n'), S = handle.includes('s');
  if (W) { x0 += dx; if (fromCenter) x1 -= dx; }
  if (E) { x1 += dx; if (fromCenter) x0 -= dx; }
  if (N) { y0 += dy; if (fromCenter) y1 -= dy; }
  if (S) { y1 += dy; if (fromCenter) y0 -= dy; }
  let w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
  if (keepRatio && b.w > 0 && b.h > 0) {
    const kx = w / b.w, ky = h / b.h;
    const k = (W || E) && (N || S) ? Math.max(kx, ky) : W || E ? kx : ky;
    w = Math.max(1, b.w * k); h = Math.max(1, b.h * k);
  }
  // 動かない側（反対の辺、中心から動かすときは中心、つまみの無い向きは真ん中）に合わせて置く
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const nx = fromCenter ? cx - w / 2 : W ? b.x + b.w - w : E ? b.x : cx - w / 2;
  const ny = fromCenter ? cy - h / 2 : N ? b.y + b.h - h : S ? b.y : cy - h / 2;
  return { x: R9(nx), y: R9(ny), w: R9(w), h: R9(h) };
}
// 箱 from を箱 to へ写す、軸にそった拡大と移動 { ax, bx, ay, by }（x → ax·x + bx）
export function boxMap(from, to) {
  const ax = from.w ? to.w / from.w : 1, ay = from.h ? to.h / from.h : 1;
  return { ax, bx: from.w ? to.x - from.x * ax : to.x + to.w / 2 - from.x, ay, by: from.h ? to.y - from.y * ay : to.y + to.h / 2 - from.y };
}
// 図形を画面の向きの拡大と移動 A で写す。回した四角・だ円・文字は、中心を写し、自分の向きの幅と高さを近い比で伸ばす
// （90° ごとの回転ならぴったり。斜めのときは形がずれないよう、近い形で伸ばす）
export function mapShape(s, A, measure) {
  const mx = (x) => A.ax * x + A.bx, my = (y) => A.ay * y + A.by;
  if (s.type === 'g') return { ...s, children: s.children.map((c) => mapShape(c, A, measure)) };
  if (POINT_TYPES.has(s.type)) return transformPoints(s, [A.ax, 0, 0, A.ay, A.bx, A.by]);
  const [cx, cy] = center(s, measure), ncx = mx(cx), ncy = my(cy);
  const a = ((s.rot || 0) * PI) / 180, c = Math.cos(a), sn = Math.sin(a);
  const kx = Math.hypot(A.ax * c, A.ay * sn), ky = Math.hypot(A.ax * sn, A.ay * c);
  if (s.type === 'rect') { const w = s.w * kx, h = s.h * ky; return { ...s, x: R9(ncx - w / 2), y: R9(ncy - h / 2), w: R9(w), h: R9(h), rx: R9(s.rx * Math.min(kx, ky)) }; }
  if (s.type === 'ellipse') return { ...s, cx: R9(ncx), cy: R9(ncy), rx: R9(s.rx * kx), ry: R9(s.ry * ky) };
  // 文字: 大きさを縦の比で変え、箱の中心を写した中心に合わせる
  const size = Math.max(1, s.size * ky), w = measureOf(measure)(s.text, size, s.font);
  return { ...s, size: R9(size), x: R9(ncx - w / 2), y: R9(ncy + 0.325 * size) };
}
// 1 つだけ選んだ図形を、自分の向きのまま新しい箱 nb（回す前の座標）へ伸ばす。
// 写しても動かない点（つまみの反対の角など）が、画面の上でも動かないよう、回転の中心のずれを直す
export function resizeLocal(s, nb, measure) {
  if (!ROT_TYPES.has(s.type) || !s.rot) return mapShape(s, boxMap(localBox(s, measure), nb), measure);
  let n = mapShape({ ...s, rot: 0 }, boxMap(localBox(s, measure), nb), measure);
  n = { ...n, rot: s.rot };
  const c0 = center(s, measure), c1 = center(n, measure), d = [c0[0] - c1[0], c0[1] - c1[1]];
  const rd = apply(rotation(s.rot), d[0], d[1]);
  return moveShape(n, d[0] - rd[0], d[1] - rd[1]);
}
// (cx, cy) を中心に deg 度回す。四角・だ円・文字は rot を足して中心を回し、点の図形は点を回す
export function rotateShape(s, deg, cx, cy, measure) {
  if (s.type === 'g') return { ...s, children: s.children.map((c) => rotateShape(c, deg, cx, cy, measure)) };
  const R = rotation(deg, cx, cy);
  if (!ROT_TYPES.has(s.type)) return transformPoints(s, R);
  const c = center(s, measure), p = apply(R, c[0], c[1]);
  return { ...moveShape(s, p[0] - c[0], p[1] - c[1]), rot: normDeg(s.rot + deg) };
}
// 反転: axis 'h' は x = cx の線で左右を、'v' は y = cy の線で上下を写す。
// 四角・だ円・文字は中心を写して回転の向きを反対にする（文字そのものは鏡に映さない）
export function flipShape(s, axis, cx, cy, measure) {
  if (s.type === 'g') return { ...s, children: s.children.map((c) => flipShape(c, axis, cx, cy, measure)) };
  const m = axis === 'v' ? [1, 0, 0, -1, 0, 2 * cy] : [-1, 0, 0, 1, 2 * cx, 0];
  if (!ROT_TYPES.has(s.type)) return transformPoints(s, m);
  const c = center(s, measure), p = apply(m, c[0], c[1]);
  return { ...moveShape(s, p[0] - c[0], p[1] - c[1]), rot: normDeg(-s.rot) };
}
// 回転の角度を決める（自分の中心で回す。四角・だ円・文字だけ）
export const setRotation = (s, deg) => (ROT_TYPES.has(s.type) ? { ...s, rot: normDeg(deg) } : s);
export const canRotateSelf = (s) => ROT_TYPES.has(s.type);
// 行列で図形を写す（SVG を読むときの transform）。ずれ（skew）のある四角とだ円は、形を保つため多角形と path にする
export function applyMatrix(s, m, measure) {
  if (isIdentity(m)) return s;
  if (s.type === 'g') return { ...s, children: s.children.map((c) => applyMatrix(c, m, measure)) };
  if (POINT_TYPES.has(s.type)) return transformPoints(s, m);
  const W = mul(m, shapeMatrix(s, measure)), d = decompose(W);
  if (Math.abs(d.skew) > 1e-6 && s.type !== 'text') {
    if (s.type === 'rect') return transformPoints(makeShape('polygon', { ...s, points: boxCorners(localBox(s)) }), W);
    return transformPoints(makeShape('path', { ...s, segs: ellipseSegs(s.cx, s.cy, s.rx, s.ry) }), W);
  }
  // 回転を除いて拡大した形を作り、回転の中心のずれを平行移動で直す（p → S·p + dv）
  const scaled = mapShape({ ...s, rot: 0 }, { ax: d.sx, bx: 0, ay: d.sy, by: 0 }, measure);
  const c0 = center(scaled, measure), rc = apply(rotation(d.rot), c0[0], c0[1]);
  let dx = d.tx + rc[0] - c0[0], dy = d.ty + rc[1] - c0[1];
  // 書き出したときに丸めた中心の分（1000 分の 1 程度）のずれは、ずれとみなさない
  if (Math.abs(dx) < 2e-3) dx = 0;
  if (Math.abs(dy) < 2e-3) dy = 0;
  return { ...moveShape(scaled, dx, dy), rot: normDeg(d.rot) };
}
export function ellipseSegs(cx, cy, rx, ry) {
  const k = 0.5522847498;
  return [
    { c: 'M', x: cx + rx, y: cy },
    { c: 'C', x1: cx + rx, y1: cy + ry * k, x2: cx + rx * k, y2: cy + ry, x: cx, y: cy + ry },
    { c: 'C', x1: cx - rx * k, y1: cy + ry, x2: cx - rx, y2: cy + ry * k, x: cx - rx, y: cy },
    { c: 'C', x1: cx - rx, y1: cy - ry * k, x2: cx - rx * k, y2: cy - ry, x: cx, y: cy - ry },
    { c: 'C', x1: cx + rx * k, y1: cy - ry, x2: cx + rx, y2: cy - ry * k, x: cx + rx, y: cy },
    { c: 'Z' },
  ];
}

/* ---------- 方眼 ---------- */
export const snap = (v, g) => (g > 0 ? R9(Math.round(v / g) * g) : v);
// 箱を (dx, dy) 動かすとき、左上の角が方眼に乗るよう動かす量を直す
export const snapDelta = (b, dx, dy, g) => [R9(snap(b.x + dx, g) - b.x), R9(snap(b.y + dy, g) - b.y)];

/* ---------- 整列・等間隔・重なりの順・まとめる ---------- */
// 選んだ物（ids）を揃える。how: left hcenter right top vcenter bottom。
// 2 つ以上なら選んだ物の外接の四角に、1 つだけなら ref（紙）に合わせる。選んでいない図形は同じ物を返す
export function align(list, ids, how, ref, measure) {
  const set = new Set(ids), sel = list.filter((s) => set.has(s.id));
  if (!sel.length) return list;
  const R = sel.length === 1 && ref ? ref : unionBox(sel.map((s) => bbox(s, measure)));
  return list.map((s) => {
    if (!set.has(s.id)) return s;
    const b = bbox(s, measure);
    const dx = how === 'left' ? R.x - b.x : how === 'hcenter' ? R.x + R.w / 2 - (b.x + b.w / 2) : how === 'right' ? R.x + R.w - (b.x + b.w) : 0;
    const dy = how === 'top' ? R.y - b.y : how === 'vcenter' ? R.y + R.h / 2 - (b.y + b.h / 2) : how === 'bottom' ? R.y + R.h - (b.y + b.h) : 0;
    return moveShape(s, R9(dx), R9(dy));
  });
}
// 等間隔: 外接の四角の隙間を同じにする（axis: 'h' 横、'v' 縦）。両端の物は動かさない。2 つ以下は何もしない
export function distribute(list, ids, axis, measure) {
  const set = new Set(ids), sel = list.filter((s) => set.has(s.id));
  if (sel.length < 3) return list;
  const k = axis === 'v' ? ['y', 'h'] : ['x', 'w'];
  const items = sel.map((s) => ({ s, b: bbox(s, measure) })).sort((p, q) => p.b[k[0]] - q.b[k[0]]);
  const first = items[0].b, last = items[items.length - 1].b;
  const gap = (last[k[0]] + last[k[1]] - first[k[0]] - items.reduce((t, it) => t + it.b[k[1]], 0)) / (items.length - 1);
  const moved = new Map();
  let pos = first[k[0]] + first[k[1]] + gap;
  for (let i = 1; i < items.length - 1; i++) {
    const { s, b } = items[i], d = R9(pos - b[k[0]]);
    moved.set(s.id, axis === 'v' ? moveShape(s, 0, d) : moveShape(s, d, 0));
    pos += b[k[1]] + gap;
  }
  return list.map((s) => moved.get(s.id) || s);
}
// 重なりの順（並びの後ろほど上）。how: top up down bottom。選んだ物どうしの順は保つ
export function reorder(list, ids, how) {
  const set = new Set(ids), arr = list.slice();
  if (how === 'top') return [...arr.filter((s) => !set.has(s.id)), ...arr.filter((s) => set.has(s.id))];
  if (how === 'bottom') return [...arr.filter((s) => set.has(s.id)), ...arr.filter((s) => !set.has(s.id))];
  if (how === 'up') { for (let i = arr.length - 2; i >= 0; i--) if (set.has(arr[i].id) && !set.has(arr[i + 1].id)) [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]]; }
  if (how === 'down') { for (let i = 1; i < arr.length; i++) if (set.has(arr[i].id) && !set.has(arr[i - 1].id)) [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]]; }
  return arr;
}
// まとめる: 選んだ物を、一番上の選んだ物の位置に入れたまとめ（g）にする
export function groupShapes(list, ids, name) {
  const set = new Set(ids), sel = list.filter((s) => set.has(s.id));
  if (!sel.length) return { shapes: list, group: null };
  const group = makeShape('g', { name: name || '', children: sel });
  let top = -1;
  list.forEach((s, i) => { if (set.has(s.id)) top = i; });
  const shapes = [];
  list.forEach((s, i) => { if (i === top) shapes.push(group); else if (!set.has(s.id)) shapes.push(s); });
  return { shapes, group };
}
// まとめを解く: 中の図形を、まとめのあった位置に戻す。まとめの不透明度・隠す・固定は中の図形に移す
export function ungroupShapes(list, id) {
  const i = list.findIndex((s) => s.id === id);
  if (i < 0 || list[i].type !== 'g') return { shapes: list, ids: [] };
  const g = list[i];
  const kids = g.children.map((c) => ({ ...c, opacity: R9(c.opacity * g.opacity), hidden: c.hidden || g.hidden, locked: c.locked || g.locked }));
  return { shapes: [...list.slice(0, i), ...kids, ...list.slice(i + 1)], ids: kids.map((c) => c.id) };
}
// 複製: 新しい id（まとめの中も）にして、(dx, dy) ずらす
export function cloneShape(s, dx = 0, dy = 0) {
  const fresh = (x) => ({ ...x, id: uid(), ...(x.type === 'g' ? { children: x.children.map(fresh) } : {}) });
  return moveShape(fresh(structuredClone(s)), dx, dy);
}

/* ---------- path ---------- */
export function pathD(segs) {
  return segs.map((s) => (s.c === 'Z' ? 'Z' : s.c === 'C' ? `C${fmt(s.x1)} ${fmt(s.y1)} ${fmt(s.x2)} ${fmt(s.y2)} ${fmt(s.x)} ${fmt(s.y)}` : `${s.c}${fmt(s.x)} ${fmt(s.y)}`)).join(' ');
}
// 円弧を 3 次ベジェに分ける（SVG の仕様の F.6.5 の中心の求め方）
function arcToCubics(x1, y1, rx, ry, phiDeg, fa, fs, x2, y2) {
  if (x1 === x2 && y1 === y2) return [];
  rx = Math.abs(rx); ry = Math.abs(ry);
  if (!rx || !ry) return [{ c: 'L', x: x2, y: y2 }];
  const phi = (phiDeg * PI) / 180, cs = Math.cos(phi), sn = Math.sin(phi);
  const hx = (x1 - x2) / 2, hy = (y1 - y2) / 2, xp = cs * hx + sn * hy, yp = -sn * hx + cs * hy;
  const lam = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (lam > 1) { const q = Math.sqrt(lam); rx *= q; ry *= q; }
  const num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp, den = rx * rx * yp * yp + ry * ry * xp * xp;
  let co = den ? Math.sqrt(Math.max(0, num / den)) : 0;
  if (fa === fs) co = -co;
  const cxp = (co * rx * yp) / ry, cyp = (-co * ry * xp) / rx;
  const ccx = cs * cxp - sn * cyp + (x1 + x2) / 2, ccy = sn * cxp + cs * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
  let dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!fs && dt > 0) dt -= 2 * PI; else if (fs && dt < 0) dt += 2 * PI;
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (PI / 2) - 1e-9)), step = dt / n, k = (4 / 3) * Math.tan(step / 4);
  const P = (a) => [ccx + rx * Math.cos(a) * cs - ry * Math.sin(a) * sn, ccy + rx * Math.cos(a) * sn + ry * Math.sin(a) * cs];
  const D = (a) => [-rx * Math.sin(a) * cs - ry * Math.cos(a) * sn, -rx * Math.sin(a) * sn + ry * Math.cos(a) * cs];
  const out = [];
  for (let i = 0; i < n; i++) {
    const a1 = t1 + i * step, a2 = a1 + step, [ax, ay] = P(a1), [bx, by] = i === n - 1 ? [x2, y2] : P(a2), [dax, day] = D(a1), [dbx, dby] = D(a2);
    out.push({ c: 'C', x1: ax + k * dax, y1: ay + k * day, x2: bx - k * dbx, y2: by - k * dby, x: bx, y: by });
  }
  return out;
}
// d を読み、絶対の M・L・C・Z だけの並びにする（H V は L、Q T S は C、A は C に分ける）。読めない所で止める
export function parsePathD(d) {
  const str = String(d ?? ''), n = str.length, out = [];
  let i = 0, cmd = null, cx = 0, cy = 0, sx = 0, sy = 0, lastC = null, lastQ = null;
  const ws = () => { while (i < n && /[\s,]/.test(str[i])) i++; };
  const num = () => { ws(); NUM_Y.lastIndex = i; const m = NUM_Y.exec(str); if (!m) return null; i = NUM_Y.lastIndex; return +m[0]; };
  const flag = () => { ws(); const ch = str[i]; if (ch === '0' || ch === '1') { i++; return +ch; } return null; };
  const many = (k) => { const v = []; for (let j = 0; j < k; j++) { const x = num(); if (x === null) return null; v.push(x); } return v; };
  const push = (seg) => out.push(Object.fromEntries(Object.entries(seg).map(([key, v]) => [key, typeof v === 'number' ? R9(v) : v])));
  for (;;) {
    ws();
    if (i >= n) break;
    const ch = str[i];
    if (/[A-Za-z]/.test(ch)) {
      i++;
      if (!/[MmLlHhVvCcSsQqTtAaZz]/.test(ch)) break;
      cmd = ch;
      if (ch === 'Z' || ch === 'z') { out.push({ c: 'Z' }); cx = sx; cy = sy; lastC = lastQ = null; continue; }
    } else if (!cmd || cmd === 'Z' || cmd === 'z') break;
    const rel = cmd >= 'a', C = cmd.toUpperCase(), ox = rel ? cx : 0, oy = rel ? cy : 0;
    let nextC = null, nextQ = null;
    if (C === 'M' || C === 'L' || C === 'T') {
      const v = many(2); if (!v) break;
      const x = ox + v[0], y = oy + v[1];
      if (C === 'T') {
        const q = lastQ ? [2 * cx - lastQ[0], 2 * cy - lastQ[1]] : [cx, cy];
        push({ c: 'C', x1: cx + (2 / 3) * (q[0] - cx), y1: cy + (2 / 3) * (q[1] - cy), x2: x + (2 / 3) * (q[0] - x), y2: y + (2 / 3) * (q[1] - y), x, y });
        nextQ = q;
      } else push({ c: C, x, y });
      if (C === 'M') { sx = x; sy = y; cmd = rel ? 'l' : 'L'; }
      cx = x; cy = y;
    } else if (C === 'H' || C === 'V') {
      const v = num(); if (v === null) break;
      if (C === 'H') cx = rel ? cx + v : v; else cy = rel ? cy + v : v;
      push({ c: 'L', x: cx, y: cy });
    } else if (C === 'C' || C === 'S') {
      const v = many(C === 'C' ? 6 : 4); if (!v) break;
      let x1, y1, x2, y2, x, y;
      if (C === 'C') [x1, y1, x2, y2, x, y] = [ox + v[0], oy + v[1], ox + v[2], oy + v[3], ox + v[4], oy + v[5]];
      else { [x1, y1] = lastC ? [2 * cx - lastC[0], 2 * cy - lastC[1]] : [cx, cy]; [x2, y2, x, y] = [ox + v[0], oy + v[1], ox + v[2], oy + v[3]]; }
      push({ c: 'C', x1, y1, x2, y2, x, y });
      nextC = [x2, y2]; cx = x; cy = y;
    } else if (C === 'Q') {
      const v = many(4); if (!v) break;
      const qx = ox + v[0], qy = oy + v[1], x = ox + v[2], y = oy + v[3];
      push({ c: 'C', x1: cx + (2 / 3) * (qx - cx), y1: cy + (2 / 3) * (qy - cy), x2: x + (2 / 3) * (qx - x), y2: y + (2 / 3) * (qy - y), x, y });
      nextQ = [qx, qy]; cx = x; cy = y;
    } else if (C === 'A') {
      const r = many(3); if (!r) break;
      const fa = flag(), fs = flag(); if (fa === null || fs === null) break;
      const e = many(2); if (!e) break;
      const x = ox + e[0], y = oy + e[1];
      for (const seg of arcToCubics(cx, cy, r[0], r[1], r[2], fa, fs, x, y)) push(seg);
      cx = x; cy = y;
    }
    lastC = nextC; lastQ = nextQ;
  }
  return out;
}
// ペンで置いた点から path を作る。点 { x, y, hx, hy }（hx, hy は出ていく取っ手。入ってくる取っ手はその反対側）。
// 取っ手の無い点どうしは直線、どちらかにあれば曲線。closed なら最初の点へ戻って Z
export function penSegs(nodes, closed = false) {
  if (!nodes.length) return [];
  const has = (p) => !!(p.hx || p.hy);
  const seg = (a, b) => (!has(a) && !has(b) ? { c: 'L', x: b.x, y: b.y } : { c: 'C', x1: a.x + (a.hx || 0), y1: a.y + (a.hy || 0), x2: b.x - (b.hx || 0), y2: b.y - (b.hy || 0), x: b.x, y: b.y });
  const out = [{ c: 'M', x: nodes[0].x, y: nodes[0].y }];
  for (let i = 1; i < nodes.length; i++) out.push(seg(nodes[i - 1], nodes[i]));
  if (closed && nodes.length > 1) { const s = seg(nodes[nodes.length - 1], nodes[0]); if (s.c === 'C') out.push(s); out.push({ c: 'Z' }); }
  return out;
}

/* ---------- 色 ---------- */
const NAMED = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', lime: '#00ff00', blue: '#0000ff', yellow: '#ffff00',
  cyan: '#00ffff', aqua: '#00ffff', magenta: '#ff00ff', fuchsia: '#ff00ff', gray: '#808080', grey: '#808080', silver: '#c0c0c0',
  maroon: '#800000', olive: '#808000', purple: '#800080', teal: '#008080', navy: '#000080', orange: '#ffa500', pink: '#ffc0cb',
  brown: '#a52a2a', gold: '#ffd700', indigo: '#4b0082', violet: '#ee82ee', coral: '#ff7f50', salmon: '#fa8072', khaki: '#f0e68c',
  crimson: '#dc143c', tomato: '#ff6347', skyblue: '#87ceeb', darkgray: '#a9a9a9', lightgray: '#d3d3d3', darkblue: '#00008b', darkgreen: '#006400',
};
const hex2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
// 色の文字を #rrggbb にする。none と transparent は 'none'。url() や currentColor など読めない物は null
export function parseColor(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return null;
  if (s === 'none' || s === 'transparent') return 'none';
  let m = /^#([0-9a-f]{3,4})$/.exec(s);
  if (m) return '#' + [...m[1].slice(0, 3)].map((c) => c + c).join('');
  m = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/.exec(s);
  if (m) return '#' + m[1];
  m = /^rgba?\(\s*([\d.]+%?)\s*[,\s]\s*([\d.]+%?)\s*[,\s]\s*([\d.]+%?)\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/.exec(s);
  if (m) return '#' + m.slice(1, 4).map((p) => hex2(p.endsWith('%') ? (parseFloat(p) * 255) / 100 : parseFloat(p))).join('');
  return NAMED[s] || null;
}

/* ---------- SVG の書き出し ---------- */
const escAttr = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const escText = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
// 図形 1 つを、SVG の要素の名前と属性（と文字・子）にする。画面の描画（DOM を作る）と書き出し（文字にする）の両方が使う
export function shapeNode(s, measure) {
  const a = {};
  if (s.type === 'g') {
    if (s.opacity !== 1) a.opacity = fmt(s.opacity);
    if (s.hidden) a.display = 'none';
    if (s.name) a['data-fos-name'] = s.name;
    if (s.locked) a['data-fos-locked'] = '1';
    return { tag: 'g', attrs: a, children: s.children.map((c) => shapeNode(c, measure)) };
  }
  let tag = s.type, text = null;
  if (s.type === 'rect') { Object.assign(a, { x: fmt(s.x), y: fmt(s.y), width: fmt(s.w), height: fmt(s.h) }); if (s.rx) { a.rx = fmt(s.rx); a.ry = fmt(s.rx); } }
  else if (s.type === 'ellipse') Object.assign(a, { cx: fmt(s.cx), cy: fmt(s.cy), rx: fmt(s.rx), ry: fmt(s.ry) });
  else if (s.type === 'line') Object.assign(a, { x1: fmt(s.x1), y1: fmt(s.y1), x2: fmt(s.x2), y2: fmt(s.y2) });
  else if (s.type === 'polyline' || s.type === 'polygon') a.points = s.points.map(([x, y]) => fmt(x) + ',' + fmt(y)).join(' ');
  else if (s.type === 'path') a.d = pathD(s.segs);
  else if (s.type === 'text') { Object.assign(a, { x: fmt(s.x), y: fmt(s.y), 'font-size': fmt(s.size), 'font-family': s.font }); text = s.text; }
  a.fill = s.fill; a.stroke = s.stroke; a['stroke-width'] = fmt(s.sw);
  if (POINT_TYPES.has(s.type)) { a['stroke-linecap'] = 'round'; a['stroke-linejoin'] = 'round'; }
  if (s.opacity !== 1) a.opacity = fmt(s.opacity);
  if (ROT_TYPES.has(s.type) && s.rot) { const [cx, cy] = center(s, measure); a.transform = `rotate(${fmt(s.rot)} ${fmt(cx)} ${fmt(cy)})`; }
  if (s.hidden) a.display = 'none';
  if (s.name) a['data-fos-name'] = s.name;
  if (s.locked) a['data-fos-locked'] = '1';
  return { tag, attrs: a, text };
}
function nodeString(node, depth) {
  const pad = '  '.repeat(depth), attrs = Object.entries(node.attrs).map(([k, v]) => ` ${k}="${escAttr(v)}"`).join('');
  if (node.children) return node.children.length ? [`${pad}<g${attrs}>`, ...node.children.map((c) => nodeString(c, depth + 1)), `${pad}</g>`].join('\n') : `${pad}<g${attrs}/>`;
  if (node.text !== null && node.text !== undefined) return `${pad}<${node.tag}${attrs}>${escText(node.text)}</${node.tag}>`;
  return `${pad}<${node.tag}${attrs}/>`;
}
// 絵全体を SVG の文字にする。紙の色は一番下の四角（data-fos-paper）に書く
export function toSVG(doc, measure) {
  const W = fmt(doc.width), H = fmt(doc.height);
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" data-fos-app="vector">`];
  if (doc.background && doc.background !== 'none') lines.push(`  <rect x="0" y="0" width="${W}" height="${H}" fill="${escAttr(doc.background)}" data-fos-paper="1"/>`);
  for (const s of doc.shapes) lines.push(nodeString(shapeNode(s, measure), 1));
  lines.push('</svg>');
  return lines.join('\n') + '\n';
}

/* ---------- SVG の読み込み（消毒） ----------
   ブラウザの DOMParser に頼らず、ここで XML を読む（テストで確かめられ、読み込みの途中で何も動かないように）。
   決めた要素（g rect circle ellipse line polyline polygon path text と、text の中の tspan）と、決めた属性だけを読む。
   それ以外の要素（script・style・image・use・a・foreignObject など）は中身ごと捨て、名前を dropped に入れる。
   on〜 の属性、href、url() を含む値は読まない。DOCTYPE の中の実体の定義は使わない（&名前; はそのままの文字で残す）。 */
const MAX_TEXT = 8 * 1024 * 1024, MAX_ELEMENTS = 50000, MAX_DEPTH = 200;
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (all, e) => {
  const k = e.toLowerCase();
  if (k === 'lt') return '<'; if (k === 'gt') return '>'; if (k === 'amp') return '&'; if (k === 'quot') return '"'; if (k === 'apos') return "'";
  const n = k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
  return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '';
});
function parseXML(src) {
  if (src.length > MAX_TEXT) throw new Error('SVG のファイルが大きすぎます（8 MB まで）。');
  const root = { name: '#root', attrs: Object.create(null), children: [] }, stack = [root];
  let i = 0, count = 0;
  const addText = (t, raw) => { if (t) stack[stack.length - 1].children.push({ text: raw ? t : decode(t) }); };
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt < 0) { addText(src.slice(i)); break; }
    if (lt > i) addText(src.slice(i, lt));
    if (src.startsWith('<!--', lt)) { const e = src.indexOf('-->', lt + 4); i = e < 0 ? src.length : e + 3; continue; }
    if (src.startsWith('<![CDATA[', lt)) { const e = src.indexOf(']]>', lt + 9); addText(src.slice(lt + 9, e < 0 ? src.length : e), true); i = e < 0 ? src.length : e + 3; continue; }
    if (src.startsWith('<?', lt)) { const e = src.indexOf('?>', lt + 2); i = e < 0 ? src.length : e + 2; continue; }
    if (src.startsWith('<!', lt)) {
      // DOCTYPE など。中の [ ] の部分（実体の定義）も読み飛ばす
      let j = lt + 2, depth = 0;
      for (; j < src.length; j++) { const ch = src[j]; if (ch === '[') depth++; else if (ch === ']') depth--; else if (ch === '>' && depth <= 0) break; }
      i = j + 1; continue;
    }
    if (src[lt + 1] === '/') {
      const e = src.indexOf('>', lt), name = src.slice(lt + 2, e < 0 ? src.length : e).trim();
      // 名前の合う所まで閉じる（閉じ忘れのある入れ子でも止まらない）
      let k = stack.length - 1;
      while (k > 0 && stack[k].name !== name) k--;
      if (k > 0) stack.length = k;
      i = e < 0 ? src.length : e + 1; continue;
    }
    // 開くタグ
    let j = lt + 1;
    while (j < src.length && !/[\s/>]/.test(src[j])) j++;
    const name = src.slice(lt + 1, j);
    if (!name) { addText('<'); i = lt + 1; continue; }
    const attrs = Object.create(null);
    let selfClose = false;
    for (;;) {
      while (j < src.length && /\s/.test(src[j])) j++;
      if (j >= src.length) break;
      if (src[j] === '>') { j++; break; }
      if (src[j] === '/' && src[j + 1] === '>') { selfClose = true; j += 2; break; }
      if (src[j] === '/') { j++; continue; }
      let k = j;
      while (k < src.length && !/[\s=/>]/.test(src[k])) k++;
      const an = src.slice(j, k);
      j = k;
      while (j < src.length && /\s/.test(src[j])) j++;
      let val = '';
      if (src[j] === '=') {
        j++;
        while (j < src.length && /\s/.test(src[j])) j++;
        const q = src[j];
        if (q === '"' || q === "'") { const e = src.indexOf(q, j + 1); val = src.slice(j + 1, e < 0 ? src.length : e); j = e < 0 ? src.length : e + 1; }
        else { let e = j; while (e < src.length && !/[\s>]/.test(src[e])) e++; val = src.slice(j, e); j = e; }
      }
      if (an && !(an in attrs)) attrs[an] = decode(val);
    }
    if (++count > MAX_ELEMENTS) throw new Error('SVG の要素が多すぎます（5 万個まで）。');
    const el = { name, attrs, children: [] };
    stack[stack.length - 1].children.push(el);
    if (!selfClose) {
      stack.push(el);
      if (stack.length > MAX_DEPTH) throw new Error('SVG の入れ子が深すぎます（200 段まで）。');
    }
    i = j;
  }
  return root;
}
const local = (name) => name.slice(name.lastIndexOf(':') + 1);
const UNITS = { '': 1, px: 1, pt: 4 / 3, pc: 16, mm: 96 / 25.4, cm: 96 / 2.54, in: 96, em: 16, ex: 8 };
function parseLength(v, ref) {
  const m = new RegExp('^\\s*(' + NUM + ')\\s*(px|pt|pc|mm|cm|in|em|ex|%)?\\s*$').exec(String(v ?? ''));
  if (!m) return NaN;
  const n = +m[1], u = m[2] || '';
  if (u === '%') return ref ? (n * ref) / 100 : NaN;
  return n * UNITS[u];
}
// 値に危ない物（外への参照、式）があれば読まない
const unsafe = (v) => /url\s*\(|expression|javascript:|@import|\\/i.test(v);
const STYLE_PROPS = new Set(['fill', 'stroke', 'stroke-width', 'opacity', 'fill-opacity', 'font-size', 'font-family', 'display', 'visibility']);
function parseStyleAttr(s) {
  const out = Object.create(null);
  for (const part of String(s ?? '').split(';')) {
    const c = part.indexOf(':');
    if (c < 0) continue;
    const k = part.slice(0, c).trim().toLowerCase(), v = part.slice(c + 1).replace(/!important/i, '').trim();
    if (STYLE_PROPS.has(k) && !unsafe(v)) out[k] = v;
  }
  return out;
}
const cleanName = (v) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80);
const cleanFont = (v) => String(v ?? '').replace(/[^\p{L}\p{N}\s,'"_.-]/gu, '').replace(/"/g, "'").trim().slice(0, 120);
function textOf(el, dropped) {
  let t = '';
  for (const c of el.children) {
    if ('text' in c) t += c.text;
    else if (local(c.name) === 'tspan') t += textOf(c, dropped);
    else dropped.add(c.name);
  }
  return t;
}
const SHAPE_TAGS = new Set(['g', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'text']);
// SVG の文字を読み、{ doc, dropped }（dropped は捨てた要素の名前）を返す。SVG でなければ、分かる言葉の Error を投げる
export function parseSVG(text, measure) {
  const tree = parseXML(String(text ?? ''));
  const svg = tree.children.find((c) => c.name);
  if (!svg || local(svg.name) !== 'svg') throw new Error('SVG のファイルではありません（一番外が <svg> ではありません）。');
  const dropped = new Set();
  const vb = nums(svg.attrs.viewBox);
  let width, height, rootM = I.slice();
  if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) { width = vb[2]; height = vb[3]; rootM = translate(-vb[0], -vb[1]); }
  else { width = parseLength(svg.attrs.width); height = parseLength(svg.attrs.height); }
  width = Math.min(10000, Math.max(1, Number.isFinite(width) ? width : 800));
  height = Math.min(10000, Math.max(1, Number.isFinite(height) ? height : 600));
  let background = null;
  const len = (v, ref) => { const n = parseLength(v, ref); return Number.isFinite(n) ? n : 0; };

  function styleOf(el, inh) {
    const a = el.attrs, st = parseStyleAttr(a.style);
    const get = (k) => { const v = k in st ? st[k] : a[k]; return v === undefined || unsafe(v) ? undefined : v; };
    const out = { ...inh, opacity: 1 };
    for (const k of ['fill', 'stroke']) { const v = get(k); if (v !== undefined) { const c = parseColor(v); if (c) out[k] = c; } }
    const sw = parseLength(get('stroke-width')); if (Number.isFinite(sw) && sw >= 0) out.sw = sw;
    const op = parseFloat(get('opacity')); if (Number.isFinite(op)) out.opacity = Math.max(0, Math.min(1, op));
    const fo = parseFloat(get('fill-opacity')); if (Number.isFinite(fo) && fo < 1) out.opacity *= Math.max(0, fo);
    const fsz = parseLength(get('font-size')); if (Number.isFinite(fsz) && fsz > 0) out.size = fsz;
    const ff = get('font-family'); if (ff !== undefined && cleanFont(ff)) out.font = cleanFont(ff);
    if (String(get('visibility') || '').trim() === 'hidden') out.hidden = true;
    else if (String(get('visibility') || '').trim() === 'visible') out.hidden = false;
    out.ownHidden = String(get('display') || '').trim() === 'none' || out.hidden;
    return out;
  }
  function walk(parent, inh, m, isRoot) {
    const out = [];
    for (const el of parent.children) {
      if (!el.name) continue; // 文字（g の中の空白など）は使わない
      const name = local(el.name);
      if (!SHAPE_TAGS.has(name)) { dropped.add(el.name); continue; }
      const a = el.attrs, st = styleOf(el, inh);
      const tm = a.transform === undefined ? I : parseTransform(a.transform) || I;
      const M = mul(m, tm);
      const common = { name: cleanName(a['data-fos-name']), hidden: st.ownHidden, locked: a['data-fos-locked'] === '1', opacity: Math.round(st.opacity * 1e6) / 1e6 };
      const style = { fill: st.fill, stroke: st.stroke, sw: st.sw };
      if (name === 'g') {
        const kids = walk(el, { ...st, hidden: st.hidden }, M, false);
        if (kids.length) out.push(makeShape('g', { ...common, children: kids }));
        continue;
      }
      let s = null;
      if (name === 'rect') {
        // 紙の色（自分で書き出した SVG の一番下の四角）。図形にはしない
        if (isRoot && a['data-fos-paper'] === '1' && background === null && isIdentity(tm)) { background = st.fill; continue; }
        const w = len(a.width, width), h = len(a.height, height);
        if (w <= 0 || h <= 0) continue;
        const rx = a.rx !== undefined ? len(a.rx) : a.ry !== undefined ? len(a.ry) : 0;
        s = makeShape('rect', { ...common, ...style, x: len(a.x, width), y: len(a.y, height), w, h, rx: Math.max(0, Math.min(rx, w / 2, h / 2)) });
      } else if (name === 'circle' || name === 'ellipse') {
        const rx = name === 'circle' ? len(a.r) : len(a.rx), ry = name === 'circle' ? rx : len(a.ry);
        if (rx <= 0 || ry <= 0) continue;
        s = makeShape('ellipse', { ...common, ...style, cx: len(a.cx, width), cy: len(a.cy, height), rx, ry });
      } else if (name === 'line') {
        s = makeShape('line', { ...common, ...style, x1: len(a.x1, width), y1: len(a.y1, height), x2: len(a.x2, width), y2: len(a.y2, height) });
      } else if (name === 'polyline' || name === 'polygon') {
        const v = nums(a.points), points = [];
        for (let k = 0; k + 1 < v.length; k += 2) points.push([v[k], v[k + 1]]);
        if (points.length < 2) continue;
        s = makeShape(name, { ...common, ...style, points });
      } else if (name === 'path') {
        const segs = parsePathD(a.d);
        if (segs.length < 2) continue;
        s = makeShape('path', { ...common, ...style, segs });
      } else if (name === 'text') {
        const t = textOf(el, dropped).replace(/[\r\n]+/g, '').replace(/\t/g, ' ').trim();
        if (!t) continue;
        const size = st.size, font = st.font;
        let x = nums(a.x)[0] ?? 0;
        const y = nums(a.y)[0] ?? 0, anchor = String(a['text-anchor'] ?? '').trim();
        if (anchor === 'middle' || anchor === 'end') { const w = measureOf(measure)(t, size, font); x -= anchor === 'middle' ? w / 2 : w; }
        s = makeShape('text', { ...common, ...style, x, y, text: t.slice(0, 2000), size, font });
      }
      if (s) out.push(applyMatrix(s, M, measure));
    }
    return out;
  }
  const base = { fill: '#000000', stroke: 'none', sw: 1, size: 16, font: FONTS[0].css, hidden: false };
  const shapes = walk(svg, { ...styleOf(svg, base), hidden: false }, rootM, true);
  return { doc: { width: R9(width), height: R9(height), background: background || 'none', shapes }, dropped: [...dropped] };
}

/* ---------- 元に戻す ---------- */
export class History {
  constructor(limit = 100) { this.limit = limit; this.u = []; this.r = []; }
  push(state) { this.u.push(state); if (this.u.length > this.limit) this.u.shift(); this.r.length = 0; }
  undo(cur) { if (!this.u.length) return null; this.r.push(cur); return this.u.pop(); }
  redo(cur) { if (!this.r.length) return null; this.u.push(cur); return this.r.pop(); }
  clear() { this.u.length = 0; this.r.length = 0; }
  get canUndo() { return this.u.length > 0; }
  get canRedo() { return this.r.length > 0; }
}

/* ---------- 見本の絵（ヘルプの「見本を開く」） ---------- */
export function sampleDoc() {
  const doc = newDoc({ width: 800, height: 600, background: '#fff6e3' });
  doc.shapes = [
    makeShape('rect', { name: '空', x: 0, y: 0, w: 800, h: 380, fill: '#cfaeff', stroke: 'none', sw: 0 }),
    makeShape('ellipse', { name: '夕日', cx: 400, cy: 330, rx: 120, ry: 120, fill: '#ffd37a', stroke: '#241734', sw: 3 }),
    makeShape('polygon', { name: '山', points: [[0, 380], [170, 220], [300, 330], [430, 200], [620, 360], [800, 260], [800, 380]], fill: '#6e5d85', stroke: '#241734', sw: 3 }),
    makeShape('rect', { name: '海', x: 0, y: 380, w: 800, h: 220, fill: '#6bf2e3', stroke: 'none', sw: 0 }),
    makeShape('path', { name: '波', fill: 'none', stroke: '#3ba89c', sw: 4, segs: parsePathD('M60 450 C110 420 160 480 210 450 C260 420 310 480 360 450 M440 520 C490 490 540 550 590 520 C640 490 690 550 740 520') }),
    makeShape('rect', { name: '看板', x: 520, y: 80, w: 220, h: 70, rx: 14, fill: '#fffdf9', stroke: '#241734', sw: 3, rot: -6 }),
    makeShape('text', { name: '題', x: 548, y: 128, text: '夕凪の浜', size: 34, font: FONTS[0].css, fill: '#ff5c97', stroke: 'none', sw: 0, rot: -6 }),
  ];
  return doc;
}
