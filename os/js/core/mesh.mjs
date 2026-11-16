// ローポリの立体: { v: [[x,y,z], ...], f: [{ i: [頂点番号...], c: '#rrggbb' }, ...] }
// 面の頂点は外から見て反時計回り（右手系）。どの操作も元の立体を変えずに新しい立体を返す
const C0 = '#c0c0c0';
const clone = (m) => ({ v: m.v.map((p) => p.slice()), f: m.f.map((f) => ({ i: f.i.slice(), c: f.c })) });
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export function cube(size = 1) {
  const h = size / 2;
  const v = [[-h, -h, -h], [h, -h, -h], [h, h, -h], [-h, h, -h], [-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h]];
  const f = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]].map((i) => ({ i, c: C0 }));
  return { v, f };
}
export function plane(size = 2) { const h = size / 2; return { v: [[-h, 0, -h], [-h, 0, h], [h, 0, h], [h, 0, -h]], f: [{ i: [0, 1, 2, 3], c: C0 }] }; }
export function icosphere(r = 1, level = 1) {
  const t = (1 + Math.sqrt(5)) / 2;
  let v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(unit);
  let f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let k = 0; k < level; k++) {
    const cache = new Map(), mid = (a, b) => { const key = a < b ? a + ',' + b : b + ',' + a; if (!cache.has(key)) { v.push(unit([(v[a][0] + v[b][0]) / 2, (v[a][1] + v[b][1]) / 2, (v[a][2] + v[b][2]) / 2])); cache.set(key, v.length - 1); } return cache.get(key); };
    f = f.flatMap(([a, b, c]) => { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); return [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]]; });
  }
  return { v: v.map((p) => p.map((q) => q * r)), f: f.map((i) => ({ i, c: C0 })) };
}
export function cylinder(n = 8, r = 0.5, h = 1) {
  const v = [];
  for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; v.push([Math.cos(a) * r, -h / 2, Math.sin(a) * r]); }
  for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; v.push([Math.cos(a) * r, h / 2, Math.sin(a) * r]); }
  const f = [{ i: [...Array(n).keys()], c: C0 }, { i: [...Array(n).keys()].map((k) => n + k).reverse(), c: C0 }];
  for (let k = 0; k < n; k++) { const k2 = (k + 1) % n; f.push({ i: [k, n + k, n + k2, k2], c: C0 }); }
  return { v, f };
}
export function cone(n = 8, r = 0.5, h = 1) {
  const v = [];
  for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; v.push([Math.cos(a) * r, -h / 2, Math.sin(a) * r]); }
  v.push([0, h / 2, 0]);
  const f = [{ i: [...Array(n).keys()], c: C0 }];
  for (let k = 0; k < n; k++) f.push({ i: [k, n, (k + 1) % n], c: C0 });
  return { v, f };
}
export function faceNormal(m, fi) {
  const ix = m.f[fi].i;
  let n = [0, 0, 0];
  // ニューウェルの方法: 多角形が少し曲がっていても安定した向きが出る
  for (let k = 0; k < ix.length; k++) { const a = m.v[ix[k]], b = m.v[ix[(k + 1) % ix.length]]; n = [n[0] + (a[1] - b[1]) * (a[2] + b[2]), n[1] + (a[2] - b[2]) * (a[0] + b[0]), n[2] + (a[0] - b[0]) * (a[1] + b[1])]; }
  return unit(n);
}
export function centroid(m, idxs) {
  const s = [0, 0, 0];
  for (const i of idxs) { s[0] += m.v[i][0]; s[1] += m.v[i][1]; s[2] += m.v[i][2]; }
  const n = idxs.length || 1;
  return [s[0] / n, s[1] / n, s[2] / n];
}
export function edges(m) {
  const set = new Map();
  for (const f of m.f) for (let k = 0; k < f.i.length; k++) { const a = f.i[k], b = f.i[(k + 1) % f.i.length], key = a < b ? a + ',' + b : b + ',' + a; if (!set.has(key)) set.set(key, [Math.min(a, b), Math.max(a, b)]); }
  return [...set.values()];
}
// 面の押し出し: 選んだ面ごとに頂点を複製して法線の向きへ dist だけ動かし、元の縁と新しい縁を横の面でつなぐ
export function extrude(m, faceIdxs, dist) {
  const r = clone(m);
  for (const fi of faceIdxs) {
    const n = faceNormal(m, fi), old = r.f[fi].i, nu = old.map((i) => { r.v.push([r.v[i][0] + n[0] * dist, r.v[i][1] + n[1] * dist, r.v[i][2] + n[2] * dist]); return r.v.length - 1; });
    for (let k = 0; k < old.length; k++) { const k2 = (k + 1) % old.length; r.f.push({ i: [old[k], old[k2], nu[k2], nu[k]], c: r.f[fi].c }); }
    r.f[fi] = { i: nu, c: r.f[fi].c };
  }
  return r;
}
const each = (m, idxs, fn) => { const r = clone(m); for (const i of new Set(idxs)) r.v[i] = fn(r.v[i]); return r; };
export const moveVerts = (m, idxs, d) => each(m, idxs, (p) => [p[0] + d[0], p[1] + d[1], p[2] + d[2]]);
export function scaleVerts(m, idxs, k, c) { const s = Array.isArray(k) ? k : [k, k, k]; return each(m, idxs, (p) => [c[0] + (p[0] - c[0]) * s[0], c[1] + (p[1] - c[1]) * s[1], c[2] + (p[2] - c[2]) * s[2]]); }
// ロドリゲスの回転公式: 軸 axis のまわりに angle だけ、中心 c を基準に回す
export function rotateVerts(m, idxs, axis, angle, c) {
  const k = unit(axis), cs = Math.cos(angle), sn = Math.sin(angle);
  return each(m, idxs, (p) => {
    const v = sub(p, c), kv = cross(k, v), d = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
    return [c[0] + v[0] * cs + kv[0] * sn + k[0] * d * (1 - cs), c[1] + v[1] * cs + kv[1] * sn + k[1] * d * (1 - cs), c[2] + v[2] * cs + kv[2] * sn + k[2] * d * (1 - cs)];
  });
}
// 面を消し、どの面にも使われなくなった頂点を詰める
export function deleteFaces(m, faceIdxs) {
  const drop = new Set(faceIdxs), keep = m.f.filter((_, i) => !drop.has(i));
  const used = [...new Set(keep.flatMap((f) => f.i))].sort((a, b) => a - b), map = new Map(used.map((o, n) => [o, n]));
  return { v: used.map((i) => m.v[i].slice()), f: keep.map((f) => ({ i: f.i.map((i) => map.get(i)), c: f.c })) };
}
export function paintFaces(m, faceIdxs, color) { const r = clone(m); for (const fi of faceIdxs) r.f[fi].c = color; return r; }
export function flipFaces(m, faceIdxs) { const r = clone(m); for (const fi of faceIdxs) r.f[fi].i.reverse(); return r; }
export function merge(a, b) { const r = clone(a), off = r.v.length; for (const p of b.v) r.v.push(p.slice()); for (const f of b.f) r.f.push({ i: f.i.map((i) => i + off), c: f.c }); return r; }
export function bounds(m) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of m.v) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
  return { lo, hi };
}
// 選んだ面に使われている頂点の番号
export const vertsOfFaces = (m, faceIdxs) => [...new Set(faceIdxs.flatMap((fi) => m.f[fi].i))];
