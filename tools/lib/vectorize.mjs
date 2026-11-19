// 絵（画素）を曲線（ベクター）に写すための計算。ライブラリは使わない。画面にもファイルにも触れない純粋な計算だけを置く。
// 使う所: tools/zunda-trace.mjs（三面図の正面を写す）、tools/zunda-compare.mjs（写しと元の絵を比べる）
// テスト: tests/zunda-trace.test.mjs
//
// - findRuns / middleRun: 列ごとの「白でない画素」の数から、空白で区切られた塊（体）を見つける
// - rgbToLab / kmeans / mergeCenters: 色を Lab の空間で群に分け、平らな塗りの色の並び（パレット）を作る
// - inkAlpha: ある画素が「塗りの色」と「線の色」の間のどこにあるか（線の濃さ 0〜1）
// - blur / nearestSeed / propagate / components / dilate / flood: 画素の計算（ぼかし、いちばん近い種、塊の番号、太らせる、塗りつぶし）
// - ridgePeak: 線を横切る向きの、線の濃さの山の高さ
// - pointInPolygon: 部品の境目の多角形に入るか
// - marchingSquares: 等値線を画素より細かく追い、閉じた折れ線にする（外側は面積が正、穴は負）
// - simplifyOpen / simplifyClosed: 点を間引く（Ramer–Douglas–Peucker）
// - fitCurve / fitClosed: 3 次のベジェを当てる（Schneider の方法。閉じた線は角で切ってから当てる）
// - pathData: SVG の path の文字にする（0.1 画素に丸めた相対の座標）
// - lineMatch / iou: 見比べの数（ずれを許した線の一致、外形の重なり）

// ---------------- 範囲 ----------------
// counts[x] >= min の列が続く所を [始め, 終わり] で返す。gap 列以下の空白はつなぎ、幅が minWidth 未満の塊は捨てる
export function findRuns(counts, { min = 1, gap = 0, minWidth = 1 } = {}) {
  const runs = []; let s = -1;
  for (let x = 0; x <= counts.length; x++) {
    const on = x < counts.length && counts[x] >= min;
    if (on && s < 0) s = x;
    if (!on && s >= 0) { runs.push([s, x - 1]); s = -1; }
  }
  const merged = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && r[0] - last[1] - 1 <= gap) last[1] = r[1]; else merged.push([r[0], r[1]]);
  }
  return merged.filter((r) => r[1] - r[0] + 1 >= minWidth);
}

// 幅の大きい 3 つの塊を左から並べ、真ん中を返す（三面図の 横・正面・後ろ の正面）
export function middleRun(runs) {
  const big = [...runs].sort((a, b) => (b[1] - b[0]) - (a[1] - a[0])).slice(0, 3).sort((a, b) => a[0] - b[0]);
  return big[Math.floor((big.length - 1) / 2)];
}

// ---------------- 色 ----------------
const LIN = new Float64Array(256).map((_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const lin = (c) => (Number.isInteger(c) && c >= 0 && c < 256 ? LIN[c] : (c /= 255, c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
const fLab = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
export function rgbToLab(r, g, b) {
  const R = lin(r), G = lin(g), B = lin(b);
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const Z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const fx = fLab(X), fy = fLab(Y), fz = fLab(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
export const deltaE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// 種で決まる乱数（同じ種なら同じ結果）
function rng(seed) { let s = (seed >>> 0) || 1; return () => ((s = Math.imul(s, 1664525) + 1013904223 >>> 0) / 4294967296); }

// data: 3 つずつ並んだ点（Float32Array）。k-means++ で始め、iters 回まで繰り返す
export function kmeans(data, k, { seed = 1, iters = 40 } = {}) {
  const n = data.length / 3, rand = rng(seed), centers = [];
  const d2 = new Float64Array(n).fill(Infinity);
  const dist2 = (i, c) => { const a = data[i * 3] - c[0], b = data[i * 3 + 1] - c[1], e = data[i * 3 + 2] - c[2]; return a * a + b * b + e * e; };
  let first = Math.floor(rand() * n);
  centers.push([data[first * 3], data[first * 3 + 1], data[first * 3 + 2]]);
  while (centers.length < k) {
    let sum = 0;
    const c = centers[centers.length - 1];
    for (let i = 0; i < n; i++) { const v = dist2(i, c); if (v < d2[i]) d2[i] = v; sum += d2[i]; }
    if (sum === 0) break;
    let r = rand() * sum, pick = n - 1;
    for (let i = 0; i < n; i++) { r -= d2[i]; if (r <= 0) { pick = i; break; } }
    centers.push([data[pick * 3], data[pick * 3 + 1], data[pick * 3 + 2]]);
  }
  const labels = new Int32Array(n);
  let counts = [];
  for (let it = 0; it < iters; it++) {
    let changed = 0;
    for (let i = 0; i < n; i++) {
      let best = 0, bv = Infinity;
      for (let j = 0; j < centers.length; j++) { const v = dist2(i, centers[j]); if (v < bv) { bv = v; best = j; } }
      if (labels[i] !== best || it === 0) { changed++; labels[i] = best; }
    }
    const sums = centers.map(() => [0, 0, 0]); counts = centers.map(() => 0);
    for (let i = 0; i < n; i++) { const s = sums[labels[i]]; s[0] += data[i * 3]; s[1] += data[i * 3 + 1]; s[2] += data[i * 3 + 2]; counts[labels[i]]++; }
    centers.forEach((c, j) => { if (counts[j]) { c[0] = sums[j][0] / counts[j]; c[1] = sums[j][1] / counts[j]; c[2] = sums[j][2] / counts[j]; } });
    if (!changed) break;
  }
  return { centers, labels, counts };
}

// 距離が tol より近い中心の組を、数で重みを付けた平均にまとめる（順番は前の方を残す）
export function mergeCenters(centers, counts, tol) {
  const cs = centers.map((c) => [...c]), ns = [...counts];
  for (;;) {
    let bi = -1, bj = -1, bd = tol;
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) { const d = deltaE(cs[i], cs[j]); if (d < bd) { bd = d; bi = i; bj = j; } }
    if (bi < 0) break;
    const n = ns[bi] + ns[bj];
    cs[bi] = cs[bi].map((v, k) => (v * ns[bi] + cs[bj][k] * ns[bj]) / n); ns[bi] = n;
    cs.splice(bj, 1); ns.splice(bj, 1);
  }
  return { centers: cs, counts: ns };
}

// 画素 p が、塗り F と線 L を混ぜた色だとして、線の割合 α（0〜1）を返す（F→L の向きへの射影）
export function inkAlpha(p, F, L) {
  const d0 = F[0] - L[0], d1 = F[1] - L[1], d2 = F[2] - L[2], dd = d0 * d0 + d1 * d1 + d2 * d2;
  if (!dd) return 0;
  const a = ((F[0] - p[0]) * d0 + (F[1] - p[1]) * d1 + (F[2] - p[2]) * d2) / dd;
  return a < 0 ? 0 : a > 1 ? 1 : a;
}

// ---------------- 画素の計算 ----------------
// ガウスのぼかし（縦と横に分けて）。端では、絵の中にある重みだけで割る
export function blur(field, w, h, sigma) {
  const r = Math.max(1, Math.ceil(sigma * 3)), k = new Float64Array(2 * r + 1);
  for (let i = -r; i <= r; i++) k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, ws = 0;
    for (let i = -r; i <= r; i++) { const X = x + i; if (X < 0 || X >= w) continue; s += field[y * w + X] * k[i + r]; ws += k[i + r]; }
    tmp[y * w + x] = s / ws;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, ws = 0;
    for (let i = -r; i <= r; i++) { const Y = y + i; if (Y < 0 || Y >= h) continue; s += tmp[Y * w + x] * k[i + r]; ws += k[i + r]; }
    out[y * w + x] = s / ws;
  }
  return out;
}

// 1 次元の距離の 2 乗の変換（Felzenszwalb と Huttenlocher の方法）。f は各位置の値、戻りは最小値と、その元の位置
function dt1(f, n, d, arg, v, z) {
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s;
    for (;;) {
      const p = v[k];
      s = ((f[q] + q * q) - (f[p] + p * p)) / (2 * q - 2 * p);
      if (s <= z[k] && k > 0) k--; else break;
    }
    if (s <= z[k]) { v[0] = q; z[0] = -Infinity; z[1] = Infinity; k = 0; continue; }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const p = v[k]; d[q] = (q - p) * (q - p) + f[p]; arg[q] = p; }
}

// seed[i] が真の画素を種として、各画素からいちばん近い種（ユークリッド距離）の番号と距離の 2 乗を返す
export function nearestSeed(seed, w, h) {
  const BIG = 1e20, n = Math.max(w, h);
  const colD = new Float64Array(w * h), colArg = new Int32Array(w * h);
  const f = new Float64Array(n), d = new Float64Array(n), arg = new Int32Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = seed[y * w + x] ? 0 : BIG;
    dt1(f, h, d, arg, v, z);
    for (let y = 0; y < h; y++) { colD[y * w + x] = d[y]; colArg[y * w + x] = arg[y]; }
  }
  const dist2 = new Float32Array(w * h), index = new Int32Array(w * h).fill(-1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = colD[y * w + x];
    dt1(f, w, d, arg, v, z);
    for (let x = 0; x < w; x++) {
      const sx = arg[x], sy = colArg[y * w + sx];
      if (d[x] >= BIG / 2) continue;
      dist2[y * w + x] = d[x]; index[y * w + x] = sy * w + sx;
    }
  }
  return { dist2, index };
}

// labels の -1 の画素に、いちばん近い -1 でない画素の値を入れる
export function propagate(labels, w, h) {
  const seed = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) seed[i] = labels[i] >= 0 ? 1 : 0;
  const { index } = nearestSeed(seed, w, h), out = new Int32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = labels[i] >= 0 ? labels[i] : index[i] >= 0 ? labels[index[i]] : -1;
  return out;
}

// mask の真の画素の、4 方向でつながる塊に番号（1 から）を付ける。戻りは { id, sizes }（sizes[番号] が画素の数）
export function components(mask, w, h, { diagonal = false } = {}) {
  const id = new Int32Array(w * h), sizes = [0], stack = new Int32Array(w * h);
  const nb = diagonal ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || id[i]) continue;
    const c = sizes.length; let sp = 0, n = 0; stack[sp++] = i; id[i] = c;
    while (sp) {
      const j = stack[--sp], x = j % w, y = (j - x) / w; n++;
      for (const [dx, dy] of nb) {
        const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const k = Y * w + X; if (mask[k] && !id[k]) { id[k] = c; stack[sp++] = k; }
      }
    }
    sizes.push(n);
  }
  return { id, sizes };
}

// mask を半径 r（ユークリッド）だけ太らせる
export function dilate(mask, w, h, r) {
  const { dist2 } = nearestSeed(mask, w, h), out = new Uint8Array(w * h), r2 = r * r;
  for (let i = 0; i < w * h; i++) out[i] = mask[i] || (dist2[i] <= r2 && dist2[i] > 0) ? 1 : 0;
  return out;
}

// 線（値の高い細い尾根）の、横切る向きの山の高さを画素ごとに返す。
// 向き: 尾根の中ほどでは 2 階微分（ヘッセ行列）の絶対値の大きい固有ベクトル、坂の所では傾きの向き（どちらか強い方）。
// その向きに ±reach 画素の値（双線形で補う）の最大を山とする。四角いまわりの最大と違い、線に沿って濃さが変わっても、となりの濃い所を拾わない
export function ridgePeak(f, w, h, { reach = 2.5 } = {}) {
  const at = (x, y) => f[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  const bil = (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0;
    return (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
  };
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = at(x, y);
    const gx = (at(x + 1, y) - at(x - 1, y)) / 2, gy = (at(x, y + 1) - at(x, y - 1)) / 2;
    const a = at(x + 1, y) - 2 * v + at(x - 1, y), c = at(x, y + 1) - 2 * v + at(x, y - 1);
    const b = (at(x + 1, y + 1) - at(x + 1, y - 1) - at(x - 1, y + 1) + at(x - 1, y - 1)) / 4;
    const m = (a + c) / 2, r = Math.hypot((a - c) / 2, b), l = Math.abs(m + r) >= Math.abs(m - r) ? m + r : m - r;
    let nx, ny;
    if (Math.hypot(gx, gy) >= Math.abs(l)) { nx = gx; ny = gy; }
    else if (Math.abs(b) > 1e-12) { nx = l - c; ny = b; }
    else if (Math.abs(a) >= Math.abs(c)) { nx = 1; ny = 0; } else { nx = 0; ny = 1; }
    const L = Math.hypot(nx, ny) || 1; nx /= L; ny /= L;
    let p = v;
    for (let k = 0.5; k <= reach + 1e-9; k += 0.5) p = Math.max(p, bil(x + nx * k, y + ny * k), bil(x - nx * k, y - ny * k));
    out[y * w + x] = p;
  }
  return out;
}

// 偶奇の規則で、点 (x, y) が多角形の中にあるか
export function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ---------------- 等値線（marching squares）----------------
// field の値が level 以上の所を「中」とし、その境目を閉じた折れ線で返す。絵の外は outside（既定 0）とみなすので、枠に触れても閉じる。
// 画素 (x, y) の値は点 (x, y) にあるとみなし、辺の上の位置は線形に補う。
// 向き: 進む向きの右側（y が下向きの座標）が「中」。外側の線は面積（靴ひもの式）が正、穴は負になる。
// 鞍点（斜めの 2 つだけが中）は、4 つの角の平均が level 以上ならつなぐ。
export function marchingSquares(field, w, h, level, { outside = 0 } = {}) {
  const W = w + 2, H = h + 2; // 外側に 1 画素ずつ足した格子（座標は -1 から）
  const val = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? outside : field[y * w + x]);
  const hid = (x, y) => ((y + 1) * W + (x + 1)) * 2, vid = (x, y) => ((y + 1) * W + (x + 1)) * 2 + 1;
  const next = new Int32Array(W * H * 2).fill(-1), px = new Float64Array(W * H * 2), py = new Float64Array(W * H * 2);
  const setH = (x, y) => { const a = val(x, y), b = val(x + 1, y), t = (level - a) / (b - a), id = hid(x, y); px[id] = x + t; py[id] = y; return id; };
  const setV = (x, y) => { const a = val(x, y), b = val(x, y + 1), t = (level - a) / (b - a), id = vid(x, y); px[id] = x; py[id] = y + t; return id; };
  const starts = [];
  for (let cy = -1; cy < h; cy++) for (let cx = -1; cx < w; cx++) {
    const tl = val(cx, cy), tr = val(cx + 1, cy), br = val(cx + 1, cy + 1), bl = val(cx, cy + 1);
    const it = tl >= level, ir = tr >= level, ib = br >= level, il = bl >= level;
    if (it === ir && ir === ib && ib === il) continue;
    // 時計回り（画面で）に角を回る: tl→tr（上の辺）、tr→br（右）、br→bl（下）、bl→tl（左）
    const cr = []; // { id, out: 中→外なら true }
    if (it !== ir) cr.push({ id: setH(cx, cy), out: it });
    if (ir !== ib) cr.push({ id: setV(cx + 1, cy), out: ir });
    if (ib !== il) cr.push({ id: setH(cx, cy + 1), out: ib });
    if (il !== it) cr.push({ id: setV(cx, cy), out: il });
    const joined = (tl + tr + br + bl) / 4 >= level;
    for (let i = 0; i < cr.length; i++) {
      if (!cr[i].out) continue;
      // 中→外の点から、外→中の点へ。鞍点で中をつなぐときは時計回りに次の、分けるときは前の点へ
      let j = i;
      do { j = joined || cr.length === 2 ? (j + 1) % cr.length : (j - 1 + cr.length) % cr.length; } while (cr[j].out);
      next[cr[i].id] = cr[j].id; starts.push(cr[i].id);
    }
  }
  const seen = new Uint8Array(W * H * 2), out = [];
  for (const s of starts) {
    if (seen[s]) continue;
    const pts = []; let e = s;
    while (e >= 0 && !seen[e]) { seen[e] = 1; pts.push([px[e], py[e]]); e = next[e]; }
    if (pts.length >= 3) out.push(pts);
  }
  return out;
}

// ---------------- 点の間引き ----------------
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  if (!L) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L));
  return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]);
}
function rdp(pts, i0, i1, eps, keep) {
  const stack = [[i0, i1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let md = -1, mi = -1;
    for (let i = a + 1; i < b; i++) { const d = segDist(pts[i], pts[a], pts[b]); if (d > md) { md = d; mi = i; } }
    if (md > eps) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
}
export function simplifyOpen(pts, eps) {
  if (pts.length <= 2) return pts.slice();
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  rdp(pts, 0, pts.length - 1, eps, keep);
  return pts.filter((_, i) => keep[i]);
}
export function simplifyClosed(pts, eps) {
  const n = pts.length;
  if (n <= 3) return pts.slice();
  let far = 0, fd = -1;
  for (let i = 1; i < n; i++) { const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (d > fd) { fd = d; far = i; } }
  const ring = [...pts, pts[0]], keep = new Uint8Array(n + 1);
  keep[0] = keep[far] = keep[n] = 1;
  rdp(ring, 0, far, eps, keep); rdp(ring, far, n, eps, keep);
  let out = pts.filter((_, i) => keep[i]);
  // 起点と最も遠い点は無条件に残したので、まっすぐな所にあれば消す
  for (let changed = true; changed && out.length > 3;) {
    changed = false;
    for (let i = 0; i < out.length && out.length > 3; i++) {
      const a = out[(i - 1 + out.length) % out.length], b = out[(i + 1) % out.length];
      if (segDist(out[i], a, b) <= eps) { out.splice(i, 1); changed = true; i--; }
    }
  }
  return out;
}

// ---------------- 3 次のベジェの当てはめ（Schneider, "An Algorithm for Automatically Fitting Digitized Curves", Graphics Gems, 1990）----------------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], add = (a, b) => [a[0] + b[0], a[1] + b[1]], mul = (a, s) => [a[0] * s, a[1] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1], len = (a) => Math.hypot(a[0], a[1]);
const norm = (a) => { const l = len(a); return l ? [a[0] / l, a[1] / l] : [0, 0]; };
function bezPt(b, t) { const u = 1 - t; return [u * u * u * b[0][0] + 3 * u * u * t * b[1][0] + 3 * u * t * t * b[2][0] + t * t * t * b[3][0], u * u * u * b[0][1] + 3 * u * u * t * b[1][1] + 3 * u * t * t * b[2][1] + t * t * t * b[3][1]]; }
function bezD1(b, t) { const u = 1 - t; return [3 * (u * u * (b[1][0] - b[0][0]) + 2 * u * t * (b[2][0] - b[1][0]) + t * t * (b[3][0] - b[2][0])), 3 * (u * u * (b[1][1] - b[0][1]) + 2 * u * t * (b[2][1] - b[1][1]) + t * t * (b[3][1] - b[2][1]))]; }
function bezD2(b, t) { const u = 1 - t; return [6 * (u * (b[2][0] - 2 * b[1][0] + b[0][0]) + t * (b[3][0] - 2 * b[2][0] + b[1][0])), 6 * (u * (b[2][1] - 2 * b[1][1] + b[0][1]) + t * (b[3][1] - 2 * b[2][1] + b[1][1]))]; }

// 端の接線: 点 i から弧の長さで reach まで（少なくとも 2 点）の点に、p(s) = p0 + T s + K s²/2 を最小 2 乗で当てた T の向き。
// となりの点への向きだけだと、曲がりの分だけ向きがずれ、等値線の細かいゆれも拾う
function tangentFrom(d, i, step, stop, reach) {
  const p0 = d[i], ss = [], ps = [];
  let j = i, acc = 0;
  while (j !== stop && (acc < reach || ss.length < 2)) { const k = j + step; acc += len(sub(d[k], d[j])); j = k; ss.push(acc); ps.push(sub(d[j], p0)); }
  if (ss.length < 2) return norm(ps[0] || [1, 0]);
  let a = 0, b = 0, c = 0, rx = 0, ry = 0, qx = 0, qy = 0;
  for (let m = 0; m < ss.length; m++) { const s = ss[m], s2 = s * s; a += s2; b += s2 * s / 2; c += s2 * s2 / 4; rx += s * ps[m][0]; ry += s * ps[m][1]; qx += s2 / 2 * ps[m][0]; qy += s2 / 2 * ps[m][1]; }
  const det = a * c - b * b;
  if (Math.abs(det) < 1e-12) return norm(ps[ps.length - 1]);
  const T = [(rx * c - qx * b) / det, (ry * c - qy * b) / det];
  return len(T) > 1e-9 ? norm(T) : norm(ps[ps.length - 1]);
}
function centerTangent(d, i, first, last, reach) {
  let a = i, b = i, acc = 0;
  while (a > first && acc < reach) { acc += len(sub(d[a], d[a - 1])); a--; }
  acc = 0;
  while (b < last && acc < reach) { acc += len(sub(d[b + 1], d[b])); b++; }
  return norm(sub(d[b], d[a]));
}
function chordParams(d, first, last) {
  const u = [0];
  for (let i = first + 1; i <= last; i++) u.push(u[u.length - 1] + len(sub(d[i], d[i - 1])));
  const T = u[u.length - 1] || 1;
  return u.map((v) => v / T);
}
function generateBezier(d, first, last, u, t1, t2) {
  const p0 = d[first], p3 = d[last];
  let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
  for (let i = 0; i < u.length; i++) {
    const t = u[i], s = 1 - t, b1 = 3 * t * s * s, b2 = 3 * t * t * s, b0 = s * s * s, b3 = t * t * t;
    const A1 = mul(t1, b1), A2 = mul(t2, b2);
    c00 += dot(A1, A1); c01 += dot(A1, A2); c11 += dot(A2, A2);
    const tmp = sub(d[first + i], add(mul(p0, b0 + b1), mul(p3, b2 + b3)));
    x0 += dot(A1, tmp); x1 += dot(A2, tmp);
  }
  const det = c00 * c11 - c01 * c01;
  let al = det ? (x0 * c11 - x1 * c01) / det : 0, ar = det ? (c00 * x1 - c01 * x0) / det : 0;
  const seg = len(sub(p3, p0)), eps = 1e-6 * seg;
  if (!det || al < eps || ar < eps) { al = ar = seg / 3; }
  else {
    // 制御点を弦の上へ写したとき、前後が入れ替わるなら（輪を作る形）、ふつうの長さ（弦の 1/3）に戻す（Paper.js の PathFitter と同じ確かめ）
    const line = sub(p3, p0);
    if (dot(mul(t1, al), line) - dot(mul(t2, ar), line) > seg * seg) al = ar = seg / 3;
  }
  return [p0, add(p0, mul(t1, al)), add(p3, mul(t2, ar)), p3];
}
function maxError(d, first, last, b, u) {
  let worst = 0, split = Math.floor((first + last) / 2);
  for (let i = first + 1; i < last; i++) {
    const p = bezPt(b, u[i - first]), e = (p[0] - d[i][0]) ** 2 + (p[1] - d[i][1]) ** 2;
    if (e >= worst) { worst = e; split = i; }
  }
  return [worst, split];
}
// 曲線を区切った点が、点の並び（first〜last の折れ線）から lim より離れるか。
// 誤差は点の所でしか測らないので、媒介変数が両端に寄ると、点の間で曲線が大きく飛び出しても見逃す。それを見つける
function bulges(d, first, last, b, lim) {
  const lim2 = lim * lim;
  for (let k = 1; k < 24; k++) {
    const p = bezPt(b, k / 24);
    let best = Infinity;
    for (let i = first; i < last && best > lim2; i++) {
      const a = d[i], c = d[i + 1], dx = c[0] - a[0], dy = c[1] - a[1], L = dx * dx + dy * dy;
      const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
      const ex = a[0] + t * dx - p[0], ey = a[1] + t * dy - p[1];
      best = Math.min(best, ex * ex + ey * ey);
    }
    if (best > lim2) return true;
  }
  return false;
}
function reparam(d, first, last, u, b) {
  return u.map((t, i) => {
    const p = d[first + i], q = bezPt(b, t), q1 = bezD1(b, t), q2 = bezD2(b, t), diff = sub(q, p);
    const den = dot(q1, q1) + dot(diff, q2);
    if (!den) return t;
    const nt = t - dot(diff, q1) / den;
    return nt < 0 ? 0 : nt > 1 ? 1 : nt;
  });
}
function fitCubic(d, first, last, t1, t2, err2, out, reach) {
  if (last - first === 1) {
    // 2 点だけ: 制御点を弦の 1/3 の長さで接線の向きへ。接線が弦と大きくずれると曲線がふくらむので、
    // ふくらみ（およそ 0.75 × 長さ × sin ずれ）が許す誤差の 1.6 倍を超えないように短くする
    const ch = sub(d[last], d[first]), L = len(ch), u = norm(ch);
    const sin = Math.max(Math.abs(t1[0] * u[1] - t1[1] * u[0]), Math.abs(t2[0] * u[1] - t2[1] * u[0]));
    const dist = Math.min(L / 3, sin > 1e-9 ? (1.6 * Math.sqrt(err2)) / (0.75 * sin) : Infinity);
    out.push([d[first], add(d[first], mul(t1, dist)), add(d[last], mul(t2, dist)), d[last]]);
    return;
  }
  let u = chordParams(d, first, last), b = generateBezier(d, first, last, u, t1, t2);
  let [e, split] = maxError(d, first, last, b, u);
  const lim = 1.8 * Math.sqrt(err2), ok = () => e < err2 && !bulges(d, first, last, b, lim); // 区切りの間も測るテストは 2 倍まで許す。少し厳しくしておく
  if (ok()) { out.push(b); return; }
  // 弦の長さで決めた媒介変数は、曲線の速さのむらの分だけずれる。誤差が大きすぎなければ、Newton 法で媒介変数を直して当て直す
  // （元の論文は誤差が許す値の 2 倍まで。ここは 5 画素まで試し、良くならなくなったらやめる）
  if (e < Math.max(err2 * 4, 25)) {
    for (let k = 0; k < 30; k++) {
      const u2 = reparam(d, first, last, u, b), b2 = generateBezier(d, first, last, u2, t1, t2);
      const [e2, s2] = maxError(d, first, last, b2, u2);
      if (e2 >= e * 0.999) break;
      u = u2; b = b2; e = e2; split = s2;
      if (ok()) { out.push(b); return; }
    }
  }
  if (split <= first) split = first + 1;
  if (split >= last) split = last - 1;
  const tc = centerTangent(d, split, first, last, reach);
  fitCubic(d, first, split, t1, mul(tc, -1), err2, out, reach);
  fitCubic(d, split, last, tc, t2, err2, out, reach);
}

// 開いた折れ線に、許す誤差 tol（画素）でベジェを当てる。戻りは [[p0, p1, p2, p3], ...]
export function fitCurve(pts, tol, { reach = 2, t1, t2 } = {}) {
  const d = dedupe(pts);
  if (d.length < 2) return [];
  const n = d.length - 1, out = [];
  fitCubic(d, 0, n, t1 || tangentFrom(d, 0, 1, n, Math.min(reach, pathLen(d) / 3)), t2 || tangentFrom(d, n, -1, 0, Math.min(reach, pathLen(d) / 3)), tol * tol, out, reach);
  return out;
}
function dedupe(pts) {
  const d = [];
  for (const p of pts) if (!d.length || Math.hypot(p[0] - d[d.length - 1][0], p[1] - d[d.length - 1][1]) > 1e-9) d.push(p);
  return d;
}
const pathLen = (d) => { let s = 0; for (let i = 1; i < d.length; i++) s += len(sub(d[i], d[i - 1])); return s; };

// 閉じた線の角（向きが cornerAngle 度より大きく変わる所）の番号を返す。前後 reach 画素の弦の向きで測り、まわりで最大の所だけ残す
export function findCorners(d, { reach = 2, cornerAngle = 65 } = {}) {
  const n = d.length, ang = new Float64Array(n);
  let total = 0; for (let i = 0; i < n; i++) total += len(sub(d[(i + 1) % n], d[i]));
  if (total < reach * 8) return [];
  const walk = (i, step) => { let j = i, acc = 0; do { const k = (j + step + n) % n; acc += len(sub(d[k], d[j])); j = k; } while (acc < reach && j !== i); return j; };
  for (let i = 0; i < n; i++) {
    const a = norm(sub(d[i], d[walk(i, -1)])), b = norm(sub(d[walk(i, 1)], d[i]));
    ang[i] = Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) * 180 / Math.PI;
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    if (ang[i] < cornerAngle) continue;
    // 前後 reach 画素の中で最大（同じ値なら前の方）なら角
    let ok = true, j = i, acc = 0;
    while (ok && acc < reach) { const k = (j + 1) % n; acc += len(sub(d[k], d[j])); j = k; if (j === i) break; if (ang[j] > ang[i]) ok = false; }
    j = i; acc = 0;
    while (ok && acc < reach) { const k = (j - 1 + n) % n; acc += len(sub(d[j], d[k])); j = k; if (j === i) break; if (ang[j] >= ang[i]) ok = false; }
    if (ok) out.push(i);
  }
  return out;
}

// 閉じた折れ線に、許す誤差 tol でベジェを当てる。角では折れてよく、角のない所はなめらかにつなぐ
export function fitClosed(pts, tol, { reach = 2, cornerAngle = 65 } = {}) {
  let d = dedupe(pts);
  if (d.length > 1 && Math.hypot(d[0][0] - d[d.length - 1][0], d[0][1] - d[d.length - 1][1]) < 1e-9) d.pop();
  const n = d.length;
  if (n < 3) return [];
  const corners = findCorners(d, { reach, cornerAngle });
  const out = [];
  if (!corners.length) {
    // 角がない: 0 番の点から 1 周を、両端の接線をそろえて当てる
    const ring = [...d, d[0]], t = norm(sub(d[walkIdx(d, 0, 1, reach)], d[walkIdx(d, 0, -1, reach)]));
    fitCubic(ring, 0, n, t, mul(t, -1), tol * tol, out, reach);
    return out;
  }
  for (let c = 0; c < corners.length; c++) {
    const a = corners[c], b = corners[(c + 1) % corners.length];
    const seg = [];
    for (let i = a; ; i = (i + 1) % n) { seg.push(d[i]); if (i === b && seg.length > 1) break; }
    const L = pathLen(seg), r = Math.min(reach, L / 3), m = seg.length - 1;
    const res = [];
    fitCubic(seg, 0, m, tangentFrom(seg, 0, 1, m, r), tangentFrom(seg, m, -1, 0, r), tol * tol, res, reach);
    out.push(...res);
  }
  return out;
}
function walkIdx(d, i, step, reach) { const n = d.length; let j = i, acc = 0; do { const k = (j + step + n) % n; acc += len(sub(d[k], d[j])); j = k; } while (acc < reach && j !== i); return j; }

// ---------------- SVG の path ----------------
// 0.1 画素の整数（10 倍の値）を、いちばん短い文字にする: 5 → ".5"、-5 → "-.5"、120 → "12"
function num(n) {
  const neg = n < 0, a = Math.abs(n), i = Math.floor(a / 10), f = a % 10;
  return (neg ? '-' : '') + (i ? String(i) : f ? '' : '0') + (f ? '.' + f : '');
}
// 命令の文字と数の並びを、区切りを省けるだけ省いてつなぐ。
// 区切りが要らないのは、命令の文字の前後、次の数が - で始まるとき、前の数に小数点があって次が . で始まるとき
function emit(tokens) {
  let s = '', prev = null;
  for (const t of tokens) {
    if (/^[a-zA-Z]$/.test(t)) { s += t; prev = null; continue; }
    if (prev !== null && !(t[0] === '-' || (t[0] === '.' && prev.includes('.')))) s += ' ';
    s += t; prev = t;
  }
  return s;
}
// contours: 閉じた線ごとの、ベジェの並びの並び。直線に近いベジェ（制御点が弦から 0.1 画素以内）は l にする。
// 位置は丸めた絶対の位置の差で書くので、何本続いても丸めの誤差がたまらない
export function pathData(contours) {
  const tk = [], R = (v) => Math.round(v * 10);
  for (const cs of contours) {
    if (!cs.length) continue;
    let cx = R(cs[0][0][0]), cy = R(cs[0][0][1]), mode = '';
    tk.push('M', num(cx), num(cy));
    for (const b of cs) {
      const X = R(b[3][0]), Y = R(b[3][1]);
      if (segDist(b[1], b[0], b[3]) < 0.1 && segDist(b[2], b[0], b[3]) < 0.1) {
        if (X === cx && Y === cy) continue;
        if (mode !== 'l') tk.push((mode = 'l'));
        tk.push(num(X - cx), num(Y - cy));
      } else {
        if (mode !== 'c') tk.push((mode = 'c'));
        tk.push(...[R(b[1][0]) - cx, R(b[1][1]) - cy, R(b[2][0]) - cx, R(b[2][1]) - cy, X - cx, Y - cy].map(num));
      }
      cx = X; cy = Y;
    }
    tk.push('z');
  }
  return emit(tk);
}

// ---------------- 見比べの数 ----------------
// a: 元の絵の線の画素、b: 写しの線の画素（どちらも 0/1）。tol 画素までのずれを許す
export function lineMatch(a, b, w, h, tol = 1.5) {
  const offs = [], r = Math.floor(tol);
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= tol * tol) offs.push([dx, dy]);
  const near = (m, x, y) => { for (const [dx, dy] of offs) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h && m[Y * w + X]) return true; } return false; };
  let na = 0, nb = 0, hitA = 0, hitB = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (a[i]) { na++; if (near(b, x, y)) hitA++; }
    if (b[i]) { nb++; if (near(a, x, y)) hitB++; }
  }
  const precision = nb ? hitB / nb : na ? 0 : 1, recall = na ? hitA / na : nb ? 0 : 1;
  return { precision, recall, f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0, original: na, traced: nb };
}
export function iou(a, b) {
  let i = 0, u = 0;
  for (let k = 0; k < a.length; k++) { if (a[k] && b[k]) i++; if (a[k] || b[k]) u++; }
  return u ? i / u : 1;
}

// ---------------- 塗りつぶし ----------------
// pass[i] が真の画素だけを 4 方向にたどる（斜めの切れ目は通らない）。seeds は始める画素の番号。たどれた画素を 1 にして返す
export function flood(pass, w, h, seeds) {
  const out = new Uint8Array(w * h), stack = [];
  for (const s of seeds) if (s >= 0 && s < w * h && pass[s] && !out[s]) { out[s] = 1; stack.push(s); }
  while (stack.length) {
    const i = stack.pop(), x = i % w;
    if (x > 0 && pass[i - 1] && !out[i - 1]) { out[i - 1] = 1; stack.push(i - 1); }
    if (x < w - 1 && pass[i + 1] && !out[i + 1]) { out[i + 1] = 1; stack.push(i + 1); }
    if (i >= w && pass[i - w] && !out[i - w]) { out[i - w] = 1; stack.push(i - w); }
    if (i < w * h - w && pass[i + w] && !out[i + w]) { out[i + w] = 1; stack.push(i + w); }
  }
  return out;
}
// 枠の画素の番号
export function borderSeeds(w, h) {
  const s = [];
  for (let x = 0; x < w; x++) s.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) s.push(y * w, y * w + w - 1);
  return s;
}

// ---------------- 線を越えにくい塗りの広げ方 ----------------
// labels の -1 の画素に、たどる道の「越えにくさ」の合計がいちばん小さい種の値を入れる（Dijkstra 法、8 方向、斜めは √2 倍）。
// cost[i] は画素 i に入る越えにくさ。線の濃い所を高くすると、2 つの塗りの境目が線の山（中心）に来る
// （まっすぐの距離で決めると、片側の確かな塗りが線から離れているとき、境目が線からずれて、線の外へ塗りがはみ出す）
export function propagateGeodesic(labels, cost, w, h) {
  const n = w * h, dist = new Float64Array(n).fill(Infinity), out = new Int32Array(labels);
  // 2 分ヒープ（値は距離、中身は画素の番号）
  let hk = new Float64Array(1024), hv = new Int32Array(1024), hn = 0;
  const push = (k, v) => {
    if (hn === hk.length) { const k2 = new Float64Array(hn * 2), v2 = new Int32Array(hn * 2); k2.set(hk); v2.set(hv); hk = k2; hv = v2; }
    let i = hn++;
    while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= k) break; hk[i] = hk[p]; hv[i] = hv[p]; i = p; }
    hk[i] = k; hv[i] = v;
  };
  const pop = () => {
    const v = hv[0], k = hk[--hn], last = hv[hn];
    let i = 0;
    for (;;) { let c = 2 * i + 1; if (c >= hn) break; if (c + 1 < hn && hk[c + 1] < hk[c]) c++; if (hk[c] >= k) break; hk[i] = hk[c]; hv[i] = hv[c]; i = c; }
    hk[i] = k; hv[i] = last;
    return v;
  };
  for (let i = 0; i < n; i++) if (labels[i] >= 0) { dist[i] = 0; push(0, i); }
  const nb = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  const done = new Uint8Array(n);
  while (hn) {
    const d0 = hk[0], i = pop();
    if (done[i] || d0 > dist[i]) continue;
    done[i] = 1;
    const x = i % w, y = (i - x) / w;
    for (const [dx, dy, m] of nb) {
      const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
      const j = Y * w + X; if (done[j]) continue;
      const nd = dist[i] + m * (cost[i] + cost[j]) / 2;
      if (nd < dist[j]) { dist[j] = nd; out[j] = out[i]; push(nd, j); }
    }
  }
  return out;
}
