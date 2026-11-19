// 線（筆の跡）を「中心の線 + 太さ + 濃さ」で写すための計算。ライブラリは使わない。画面にもファイルにも触れない純粋な計算だけを置く。
// 使う所: tools/zunda-trace.mjs（tools/zunda-parts.json の strokes に挙げた部品の線。顔のような小さな所）
// テスト: tests/zunda-strokes.test.mjs
//
// なぜ要るか: 細い線を濃さの境目（等値線）で写すと、JPEG のゆれで縁が波打つ。また、細い線は山が低いので境目の高さを下げざるをえず、
// 元より太く、黒く、重く見える。人が清書するときのように、線の中心をなめらかにたどり、太さと濃さを測ってから描き直す。
//
// 1. 濃さの場を k 倍に細かくし、山の高さの rel 倍で切った形を細線化して、線の中心をたどる（thin / tracePaths）
// 2. 中心の線を、長さに沿ったガウスでなめらかにする（resample / smoothPath）
// 3. 中心の線を横切る向きに濃さを足して面積 A と山 P を測り（crossProfile）、「幅 w・濃さ c の箱を、標準偏差 σ のガウスでぼかした形」
//    とみて c と w を決める（solveOpacity）。1 本の線の濃さは 1 つにそろえ、太さは長さに沿ってなめらかにする
// 4. 切れ目の端は、濃さが続く所まで延ばしてから細くする（筆の入りと抜き）。分かれ目の端は丸くする（となりの線と重ね、すき間を作らない）
// 5. 小さな点（瞳の点、鼻）は線にせず、円（dots）で返す。中が明るい点は輪として返す
// 6. 太さの付いた線の輪郭の多角形を作る（strokeOutline）。外側は面積が正。閉じた線は外の輪（正）と内の輪（負）
import { blur, ridgePeak, components } from './vectorize.mjs';

// 誤差関数（Abramowitz–Stegun 7.1.26、誤差 1.5e-7）
export function erf(x) {
  const s = Math.sign(x), a = Math.abs(x), t = 1 / (1 + 0.3275911 * a);
  return s * (1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a));
}

// 双線形で値を読む関数を返す。画素 (x, y) の値は点 (x, y) にある（tools/lib/vectorize.mjs の marchingSquares と同じ）。範囲の外は端の値
export function sampler(f, w, h) {
  const at = (x, y) => f[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  return (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0;
    return (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
  };
}

// k 倍に細かくする（双線形）。細かい格子の点 (X, Y) は、元の座標の ((X + 0.5) / k − 0.5, (Y + 0.5) / k − 0.5)
export function upsample(f, w, h, k) {
  const W = w * k, H = h * k, out = new Float32Array(W * H), s = sampler(f, w, h);
  for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) out[Y * W + X] = s((X + 0.5) / k - 0.5, (Y + 0.5) / k - 0.5);
  return { data: out, w: W, h: H };
}

// ---------------- 細線化と、線をたどる ----------------
// 0/1 の形を、幅 1 画素の線にする（Zhang–Suen の方法）。そのあと、階段の角（となりの縦横 2 つが互いに斜めにつながる点）を外し、
// どの点もとなりが 2 つ（端は 1 つ、分かれ目は 3 つ以上）になるようにする
export function thin(mask, w, h) {
  const m = Uint8Array.from(mask);
  const P = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : m[y * w + x]);
  const del = [];
  for (let changed = true; changed;) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      del.length = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (!m[y * w + x]) continue;
        const p2 = P(x, y - 1), p3 = P(x + 1, y - 1), p4 = P(x + 1, y), p5 = P(x + 1, y + 1), p6 = P(x, y + 1), p7 = P(x - 1, y + 1), p8 = P(x - 1, y), p9 = P(x - 1, y - 1);
        const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (B < 2 || B > 6) continue;
        const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
        let A = 0; for (let i = 0; i < 8; i++) if (!seq[i] && seq[i + 1]) A++;
        if (A !== 1) continue;
        if (pass === 0 ? p2 * p4 * p6 || p4 * p6 * p8 : p2 * p4 * p8 || p2 * p6 * p8) continue;
        del.push(y * w + x);
      }
      for (const i of del) m[i] = 0;
      if (del.length) changed = true;
    }
  }
  // 階段の角: 8 近傍のつながりの数（横井の連結数）が 1 で、端ではなく、縦横のとなりの 2 つが直角に並ぶ点は、外してもつながりが変わらない
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!m[y * w + x]) continue;
    const e = P(x + 1, y), ne = P(x + 1, y - 1), n = P(x, y - 1), nw = P(x - 1, y - 1), ww = P(x - 1, y), sw = P(x - 1, y + 1), s = P(x, y + 1), se = P(x + 1, y + 1);
    const B = e + ne + n + nw + ww + sw + s + se;
    if (B < 2) continue;
    const q = [1 - e, 1 - ne, 1 - n, 1 - nw, 1 - ww, 1 - sw, 1 - s, 1 - se, 1 - e, 1 - ne];
    let N8 = 0; for (const k of [0, 2, 4, 6]) N8 += q[k] - q[k] * q[k + 1] * q[k + 2];
    if (N8 === 1 && ((e && n) || (n && ww) || (ww && s) || (s && e))) m[y * w + x] = 0;
  }
  return m;
}

// 幅 1 画素の線を、分かれ目と端で区切った道筋の並びにする。戻りは [{ idx: 画素の番号の並び, closed, ends: ['free'|'joint', 'free'|'joint'] }]。
// free は切れ目（となりが 1 つ）、joint は分かれ目。分かれ目の画素がかたまる所（互いにとなり合う分かれ目）は 1 つの分かれ目とみなし、
// その中だけを結ぶ短い道筋は捨てる。片方が切れ目で minSpur 画素より短い道筋（ひげ）も捨てる
export function tracePaths(skel, w, h, { minSpur = 0 } = {}) {
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && skel[y * w + x];
  const nb = (i) => { const x = i % w, y = (i - x) / w, out = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && on(x + dx, y + dy)) out.push((y + dy) * w + x + dx); return out; };
  const N = w * h, deg = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (skel[i]) deg[i] = nb(i).length;
  const isNode = (i) => deg[i] !== 2;
  // 分かれ目のかたまり（互いにとなり合う分かれ目の画素）
  const root = new Int32Array(N).fill(-1);
  const find = (i) => { while (root[i] !== i) { root[i] = root[root[i]]; i = root[i]; } return i; };
  for (let i = 0; i < N; i++) if (skel[i] && deg[i] >= 3) root[i] = i;
  for (let i = 0; i < N; i++) if (root[i] >= 0) for (const j of nb(i)) if (root[j] >= 0) { const a = find(i), b = find(j); if (a !== b) root[a] = b; }
  const cluster = (i) => (root[i] >= 0 ? find(i) : -1 - i);
  const used = new Set(), key = (a, b) => (a < b ? a * N + b : b * N + a);
  const walk = (start, first) => {
    const idx = [start, first]; used.add(key(start, first));
    let prev = start, cur = first;
    while (!isNode(cur) && cur !== start) {
      const cand = nb(cur).filter((j) => j !== prev && !used.has(key(cur, j)));
      if (!cand.length) break;
      const nx = cand.find((j) => Math.abs(j - cur) === 1 || Math.abs(j - cur) === w) ?? cand[0];
      used.add(key(cur, nx)); idx.push(nx); prev = cur; cur = nx;
    }
    return idx;
  };
  const out = [];
  for (let i = 0; i < N; i++) {
    if (!skel[i] || !isNode(i) || deg[i] === 0) continue;
    for (const j of nb(i)) {
      if (used.has(key(i, j))) continue;
      const idx = walk(i, j), a = idx[0], b = idx[idx.length - 1];
      if (isNode(b) && deg[b] >= 3 && deg[a] >= 3 && cluster(a) === cluster(b) && idx.length <= 3) continue;
      const ends = [deg[a] === 1 ? 'free' : 'joint', deg[b] === 1 ? 'free' : 'joint'];
      if (ends.includes('free') && ends.includes('joint') && idx.length < minSpur) continue;
      out.push({ idx, closed: false, ends });
    }
  }
  // 分かれ目のない輪
  for (let i = 0; i < N; i++) {
    if (!skel[i] || deg[i] !== 2) continue;
    const n = nb(i); if (used.has(key(i, n[0])) || used.has(key(i, n[1]))) continue;
    const idx = walk(i, n[0]);
    if (idx[idx.length - 1] === i) idx.pop();
    out.push({ idx, closed: true, ends: ['joint', 'joint'] });
  }
  return out;
}

// ---------------- 道筋をなめらかにする ----------------
export function pathLength(pts, closed = false) {
  let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  if (closed && pts.length > 1) s += Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]);
  return s;
}

// 長さに沿って step ごとの点に打ち直す。開いた線は両端を残す。閉じた線は始めの点を最後にくり返さない
export function resample(pts, step, closed = false) {
  const P = closed ? [...pts, pts[0]] : pts, L = pathLength(P, false);
  if (P.length < 2 || L === 0) return pts.map((p) => [...p]);
  const n = Math.max(closed ? 3 : 1, Math.round(L / step)), d = L / n, out = [[...P[0]]];
  let seg = 1, acc = 0, segLen = Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]);
  for (let k = 1; k < (closed ? n : n + 1); k++) {
    const target = k * d;
    while (acc + segLen < target - 1e-9 && seg < P.length - 1) { acc += segLen; seg++; segLen = Math.hypot(P[seg][0] - P[seg - 1][0], P[seg][1] - P[seg - 1][1]); }
    const t = segLen ? Math.min(1, (target - acc) / segLen) : 0;
    out.push([P[seg - 1][0] + (P[seg][0] - P[seg - 1][0]) * t, P[seg - 1][1] + (P[seg][1] - P[seg - 1][1]) * t]);
  }
  if (!closed) out[out.length - 1] = [...P[P.length - 1]];
  return out;
}

// 長さ sigma（画素）のガウスでなめらかにする。点は step ごとに並んでいるとする。
// 開いた線は端で点対称に折り返す（端の点は動かず、まっすぐな線はまっすぐのまま）
export function smoothPath(pts, sigma, step, closed = false) {
  const n = pts.length, sg = sigma / step, r = Math.ceil(sg * 3);
  if (n < 3 || sg <= 0) return pts.map((p) => [...p]);
  const k = []; for (let i = -r; i <= r; i++) k.push(Math.exp(-(i * i) / (2 * sg * sg)));
  const ks = k.reduce((a, b) => a + b);
  const get = (i) => {
    if (closed) return pts[((i % n) + n) % n];
    if (i < 0) { const q = pts[Math.min(n - 1, -i)]; return [2 * pts[0][0] - q[0], 2 * pts[0][1] - q[1]]; }
    if (i >= n) { const q = pts[Math.max(0, 2 * (n - 1) - i)]; return [2 * pts[n - 1][0] - q[0], 2 * pts[n - 1][1] - q[1]]; }
    return pts[i];
  };
  const out = [];
  for (let i = 0; i < n; i++) { let x = 0, y = 0; for (let j = -r; j <= r; j++) { const q = get(i + j); x += q[0] * k[j + r]; y += q[1] * k[j + r]; } out.push([x / ks, y / ks]); }
  return out;
}

// 道筋の角（前後 reach 個の点への弦の向きが minDeg 度より大きく変わる所で、まわりで最大の所）の番号を返す
export function findPathCorners(pts, closed, reach, minDeg) {
  const n = pts.length, ang = new Float64Array(n), out = [];
  for (let i = 0; i < n; i++) {
    const ia = i - reach, ib = i + reach;
    if (!closed && (ia < 0 || ib >= n)) continue;
    const a = pts[((ia % n) + n) % n], b = pts[ib % n], p = pts[i];
    const v1 = [p[0] - a[0], p[1] - a[1]], v2 = [b[0] - p[0], b[1] - p[1]], L = Math.hypot(...v1) * Math.hypot(...v2);
    if (L) ang[i] = (Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / L))) * 180) / Math.PI;
  }
  for (let i = 0; i < n; i++) {
    if (ang[i] < minDeg) continue;
    let top = true;
    for (let j = -reach; j <= reach && top; j++) { if (!j) continue; const k = closed ? (((i + j) % n) + n) % n : i + j; if (k < 0 || k >= n) continue; if (ang[k] > ang[i] || (ang[k] === ang[i] && j < 0)) top = false; }
    if (top) out.push(i);
  }
  return out;
}

// 角を残してなめらかにする: 角で道筋を切り、切った区間ごとに smoothPath（端は動かない）をかけてつなぐ。
// 口の「:3」の真ん中の山のような尖った所が、なめらかにする処理で丸くつぶれないようにする
// 角の判定は、前後 2 画素の弦の向きが 20 度より大きく変わる所（元の絵のぼけで先が 1 画素ほど丸まった尖りも拾う。
// 三面図の口の山は 23 度。同じ人が大きく描いた表情集では、この山ははっきり尖っている）。
// ゆるい曲線を角と見ても、その点を動かさないだけなので害は小さい
export function smoothKeepCorners(pts, sigma, step, closed = false, { reach = 2, minDeg = 20 } = {}) {
  const corners = findPathCorners(pts, closed, Math.max(1, Math.round(reach / step)), minDeg);
  if (!corners.length) return smoothPath(pts, sigma, step, closed);
  const n = pts.length;
  let seq = pts, cuts = corners;
  if (closed) { // 最初の角から始まる開いた並び（最後に最初の角をもう一度）にする
    seq = [...pts.slice(corners[0]), ...pts.slice(0, corners[0] + 1)];
    cuts = corners.map((c) => (c - corners[0] + n) % n);
  }
  const marks = [...new Set([0, ...cuts, seq.length - 1])].sort((a, b) => a - b), out = [];
  for (let k = 0; k + 1 < marks.length; k++) {
    const piece = smoothPath(seq.slice(marks[k], marks[k + 1] + 1), sigma, step, false);
    out.push(...(k ? piece.slice(1) : piece));
  }
  if (closed) out.pop();
  return out;
}

// 数の並びを、sigma（点の数）のガウスでなめらかにする。開いた並びは端で鏡に折り返す
export function smooth1d(a, sigma, closed = false) {
  const n = a.length, r = Math.ceil(sigma * 3);
  if (n < 2 || sigma <= 0) return [...a];
  const k = []; for (let i = -r; i <= r; i++) k.push(Math.exp(-(i * i) / (2 * sigma * sigma)));
  const get = (i) => (closed ? a[((i % n) + n) % n] : a[Math.max(0, Math.min(n - 1, i < 0 ? -i : i >= n ? 2 * (n - 1) - i : i))]);
  return a.map((_, i) => { let s = 0, ws = 0; for (let j = -r; j <= r; j++) { s += get(i + j) * k[j + r]; ws += k[j + r]; } return s / ws; });
}

// 各点の進む向き（長さ 1）
export function tangents(pts, closed = false) {
  const n = pts.length;
  return pts.map((_, i) => {
    const a = closed ? pts[(i - 1 + n) % n] : pts[Math.max(0, i - 1)], b = closed ? pts[(i + 1) % n] : pts[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    return [dx / L, dy / L];
  });
}
// 進む向き t に対する横の向き。この向きを「左」とすると、左 → 端 → 右 と回る輪郭の面積が正になる（y が下向きの座標）
const normalOf = (t) => [t[1], -t[0]];

// ---------------- 太さと濃さ ----------------
// 点 p から横の向き n の両側へ、濃さを足していく。濃さが尽きる（0.02 未満）か、いったん下がってから上がり始めた（となりの線）所で止める。
// 戻りは { area: 濃さの合計（画素）, peak: 中心から 0.8 画素以内の最大, sides: [左の側の合計, 右の側の合計], robust }。
// robust: 片側だけが大きい所（分かれ目で、横切る向きにほかの線が続く所）は、小さい側の 1.25 倍までに抑えた合計
export function crossProfile(smp, p, n, { reach = 3, step = 0.1 } = {}) {
  const c0 = smp(p[0], p[1]);
  let peak = c0;
  const sides = [0, 0];
  for (const [k, sg] of [[0, 1], [1, -1]]) {
    let lo = c0;
    for (let s = step; s <= reach + 1e-9; s += step) {
      const v = smp(p[0] + n[0] * s * sg, p[1] + n[1] * s * sg);
      if (v < 0.02 || v > lo + 0.08) break;
      lo = Math.min(lo, v); sides[k] += v * step;
      if (s <= 0.8) peak = Math.max(peak, v);
    }
  }
  const area = c0 * step + sides[0] + sides[1];
  const robust = c0 * step + Math.min(sides[0] + sides[1], 2.5 * Math.min(sides[0], sides[1]));
  return { area, peak, sides, robust };
}

// 不透明な色 C・幅 w の線を、塗り F の上に描いてぼかすと、中心の画素は F + (C − F)·erf(w / (2√2 σ))。
// 中心の色 O と塗り F から C を戻す（0〜255 に収める）
export function unmixColor(O, F, w, sigma) {
  const b = Math.max(0.2, erf(w / (2 * Math.SQRT2 * sigma)));
  return O.map((o, i) => Math.max(0, Math.min(255, F[i] + (o - F[i]) / b)));
}
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : undefined; };

// 幅 w・濃さ c の箱を標準偏差 sigma のガウスでぼかすと、山の高さは c·erf(w / (2√2 sigma))、面積は c·w。
// 測った山 P と面積 A から c と w を戻す。山が「濃さ 1 で幅 A の箱」以上なら c = 1
export function solveOpacity(P, A, sigma) {
  if (!(A > 1e-6) || !(P > 1e-6)) return { c: 0, w: 0 };
  const k = 1 / (2 * Math.SQRT2 * sigma);
  if (P >= erf(A * k) - 1e-9) return { c: 1, w: A };
  let lo = A, hi = A / 0.02;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if ((A / m) * erf(m * k) > P) lo = m; else hi = m; }
  const w = (lo + hi) / 2;
  return { c: A / w, w };
}

// 元の絵のぼけの大きさ（ガウスの標準偏差 σ、画素）を、濃さの場の「太くて濃い所の縁」から測る。
// 縁を横切る向き（傾きの向き）に双線形で値を読み、縁から 1.6〜2 画素の所が、片側で 0.08 以下、反対側で 0.92 以上の縁だけを使う
// （まつげのような太さ 3〜4 画素の線の縁も使えるように、見る範囲を縁の近くにしぼる）。
// 10% から 90% までの距離は 2.563σ。crossProfile と同じ読み方（双線形）で測るので、solveOpacity の σ にそのまま使える
export function estimatePsf(f, w, h) {
  const smp = sampler(f, w, h), out = [], STEP = 0.05;
  for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
    const gx = (f[y * w + x + 1] - f[y * w + x - 1]) / 2, gy = (f[(y + 1) * w + x] - f[(y - 1) * w + x]) / 2, g = Math.hypot(gx, gy);
    if (g < 0.25 || Math.abs(f[y * w + x] - 0.5) > 0.3) continue;
    const nx = gx / g, ny = gy / g, vals = [];
    for (let s = -2; s <= 2 + 1e-9; s += STEP) vals.push(smp(x + nx * s, y + ny * s));
    const n = vals.length, k = Math.round(0.4 / STEP) + 1, lowSide = vals.slice(0, k), highSide = vals.slice(n - k);
    if (Math.max(...lowSide) > 0.08 || Math.min(...highSide) < 0.92) continue;
    let s10 = null, s90 = null;
    for (let i = 0; i < n; i++) { if (s10 === null && vals[i] >= 0.1) s10 = i * STEP; if (vals[i] >= 0.9) { s90 = i * STEP; break; } }
    if (s10 !== null && s90 !== null) out.push((s90 - s10) / 2.563);
  }
  return out.length ? median(out) : null;
}

// 濃さは、この段階のどれかにそろえる（色の数を増やしすぎない）
export const OPACITY_LEVELS = [1, 0.85, 0.7, 0.55, 0.4, 0.25];
export const quantizeOpacity = (c) => OPACITY_LEVELS.reduce((b, v) => (Math.abs(v - c) < Math.abs(b - c) ? v : b), 1);

// ---------------- 輪郭 ----------------
// 中心の線 pts と、各点の半分の太さ half から、輪郭の多角形を作る。戻りは多角形の並び。
// 開いた線: 1 つ。caps の 'joint' の端は半円で丸める。'free' の端は太さが 0 に近いので、そのまま閉じる。
// 閉じた線: 外の輪と内の輪の 2 つ（向きが逆なので、nonzero で塗ると輪になる）
export function strokeOutline(pts, half, { closed = false, caps = ['joint', 'joint'], capSteps = 10 } = {}) {
  const n = pts.length, t = tangents(pts, closed);
  const L = pts.map((p, i) => { const q = normalOf(t[i]); return [p[0] + q[0] * half[i], p[1] + q[1] * half[i]]; });
  const R = pts.map((p, i) => { const q = normalOf(t[i]); return [p[0] - q[0] * half[i], p[1] - q[1] * half[i]]; });
  const area = (p) => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return a / 2; };
  // 閉じた線: 左の輪は道筋と同じ向き、右の輪は逆向き。道筋がどちら回りでも、外の輪が正、内の輪が負になる
  if (closed) return [L, R.reverse()];
  const poly = [...L];
  // p を中心に、横の向き q の側から、q を左とする「前」の向き（−q[1], q[0]）を回って、反対の横へ進む半円
  const cap = (p, q, h) => {
    const f = [-q[1], q[0]], out = [];
    for (let s = 1; s < capSteps; s++) { const th = (s / capSteps) * Math.PI, c = Math.cos(th), si = Math.sin(th); out.push([p[0] + h * (c * q[0] + si * f[0]), p[1] + h * (c * q[1] + si * f[1])]); }
    return out;
  };
  if (caps[1] === 'joint' && half[n - 1] > 0) poly.push(...cap(pts[n - 1], normalOf(t[n - 1]), half[n - 1]));
  poly.push(...R.reverse());
  if (caps[0] === 'joint' && half[0] > 0) { const q = normalOf(t[0]); poly.push(...cap(pts[0], [-q[0], -q[1]], half[0])); }
  return [area(poly) >= 0 ? poly : poly.reverse()];
}

// 中心 (cx, cy)、半径 r の円を 4 本の 3 次のベジェにする。reverse で向きが逆（穴に使う）
export function circleCurves(cx, cy, r, reverse = false) {
  const k = 0.5522847498 * r, P = [[cx + r, cy], [cx, cy + r], [cx - r, cy], [cx, cy - r]];
  const C = [[[0, k], [k, 0]], [[-k, 0], [0, k]], [[0, -k], [-k, 0]], [[k, 0], [0, -k]]];
  const out = [];
  for (let i = 0; i < 4; i++) { const a = P[i], b = P[(i + 1) % 4]; out.push([a, [a[0] + C[i][0][0], a[1] + C[i][0][1]], [b[0] + C[i][1][0], b[1] + C[i][1][1]], b]); }
  if (!reverse) return out;
  return out.reverse().map(([a, c1, c2, b]) => [b, c2, c1, a]);
}

// ---------------- 全体 ----------------
// 切れ目の端を、向きのまま、濃さが端の frac 倍以上続く所まで延ばす（細線化で縮んだ分を戻す）
function extendEnd(smp, pts, atStart, step, { reach = 3, frac = 0.3 } = {}) {
  const n = pts.length; if (n < 3) return pts;
  const e = atStart ? pts[0] : pts[n - 1], b = atStart ? pts[Math.min(n - 1, 4)] : pts[Math.max(0, n - 5)];
  const L = Math.hypot(e[0] - b[0], e[1] - b[1]); if (!L) return pts;
  const t = [(e[0] - b[0]) / L, (e[1] - b[1]) / L], P0 = smp(e[0], e[1]);
  let last = 0;
  for (let s = 0.1; s <= reach + 1e-9; s += 0.1) { if (smp(e[0] + t[0] * s, e[1] + t[1] * s) < frac * P0) break; last = s; }
  const add = []; for (let s = step; s <= last + 1e-9; s += step) add.push([e[0] + t[0] * s, e[1] + t[1] * s]);
  return atStart ? [...add.reverse(), ...pts] : [...pts, ...add];
}

// 点の形を当てる。中が明るければ輪（ring）: 外の半径 r、輪の幅 wr。そうでなければ塗った円: 半径 r。どちらも濃さ c
function fitDot(smp, [x0, y0], size, sigma) {
  const R0 = size / 2 + 1.5;
  let sw = 0, sx = 0, sy = 0, mx = 0;
  for (let y = y0 - R0; y <= y0 + R0 + 1e-9; y += 0.25) for (let x = x0 - R0; x <= x0 + R0 + 1e-9; x += 0.25) { const v = smp(x, y); sw += v; sx += v * x; sy += v * y; mx = Math.max(mx, v); }
  if (!sw || mx < 0.1) return null;
  const cx = sx / sw, cy = sy / sw, area = sw * 0.0625, center = smp(cx, cy);
  const prof = [];
  for (let r = 0; r <= R0 + 1e-9; r += 0.1) { let s = 0; for (let a = 0; a < 24; a++) s += smp(cx + r * Math.cos((a * Math.PI) / 12), cy + r * Math.sin((a * Math.PI) / 12)); prof.push(s / 24); }
  const pm = Math.max(...prof), ip = prof.indexOf(pm);
  const c = quantizeOpacity(Math.max(0.25, Math.min(1, mx)));
  if (center >= 0.6 * mx) return { cx, cy, r: Math.sqrt(area / (Math.PI * c)), c, ring: false };
  // 中が明るい: 山の半径の円周の 75% 以上が濃ければ輪。そうでなければ、曲がった線のかけら（点ではない）
  if (ip === 0) return null;
  let around = 0;
  for (let a = 0; a < 24; a++) if (smp(cx + ip * 0.1 * Math.cos((a * Math.PI) / 12), cy + ip * 0.1 * Math.sin((a * Math.PI) / 12)) >= 0.5 * pm) around++;
  if (around < 18) return null;
  // 輪の断面（半径の向き）を線と同じに扱う: 山の高さと、山のまわりの濃さの合計から、輪の濃さと幅を決める。
  // 外の半径 = 山の半径 + 幅の半分（「山の半分まで下がる所」で測ると、輪がぼけより細いとき外へずれて大きくなる）
  let j = ip; while (j < prof.length - 1 && prof[j] >= 0.1 * pm) j++;
  let i0 = ip; while (i0 > 0 && prof[i0] >= 0.1 * pm) i0--;
  let ringA = 0; for (let i = i0; i <= j; i++) ringA += prof[i] * 0.1;
  const sol = solveOpacity(pm, ringA, sigma), rc = ip * 0.1;
  const wr = Math.max(0.3, Math.min(rc, sol.w));
  return { cx, cy, r: rc + wr / 2, wr, c: sol.c, ring: true };
}

// 中央値のフィルター（窓は前後 r 個）。開いた並びは端で窓を縮める
function median1d(a, r, closed = false) {
  const n = a.length;
  return a.map((_, i) => {
    const win = [];
    for (let j = -r; j <= r; j++) { const k = i + j; if (closed) win.push(a[((k % n) + n) % n]); else if (k >= 0 && k < n) win.push(a[k]); }
    win.sort((x, y) => x - y);
    return win[win.length >> 1];
  });
}

// 濃さの場 field（0〜1、w×h）から、線と点を当てる。戻りは { strokes: [{ pts, half, closed, ends, c }], dots: [{ cx, cy, r, c, ring, wr }] }
export function strokesFromField(field, w, h, opts = {}) {
  const { k = 4, minPeak = 0.12, rel = 0.45, sigmaPsf = 0.55, smooth = 1.0, widthSmooth = 1.2, minSpur = 1.5, dotSize = 6.5, taper = 1.5, step = 0.25 } = opts;
  const fb = blur(field, w, h, 0.5), pk = ridgePeak(fb, w, h);
  const U = upsample(fb, w, h, k), PU = upsample(pk, w, h, k);
  const mask = new Uint8Array(U.w * U.h);
  for (let i = 0; i < mask.length; i++) mask[i] = PU.data[i] >= minPeak && U.data[i] >= Math.max(rel * PU.data[i], 0.05) ? 1 : 0;
  const comp = components(mask, U.w, U.h, { diagonal: true }), nc = comp.sizes.length;
  const bx0 = new Int32Array(nc).fill(1 << 30), by0 = new Int32Array(nc).fill(1 << 30), bx1 = new Int32Array(nc).fill(-1), by1 = new Int32Array(nc).fill(-1);
  for (let i = 0; i < mask.length; i++) { const c = comp.id[i]; if (!c) continue; const x = i % U.w, y = (i - x) / U.w; if (x < bx0[c]) bx0[c] = x; if (x > bx1[c]) bx1[c] = x; if (y < by0[c]) by0[c] = y; if (y > by1[c]) by1[c] = y; }
  const smp = sampler(field, w, h);
  const toSrc = (X, Y) => [(X + 0.5) / k - 0.5, (Y + 0.5) / k - 0.5];
  const dots = [], keep = new Uint8Array(nc);
  for (let c = 1; c < nc; c++) {
    const bw = (bx1[c] - bx0[c] + 1) / k, bh = (by1[c] - by0[c] + 1) / k;
    const d = Math.max(bw, bh) <= dotSize && Math.min(bw, bh) >= 0.5 * Math.max(bw, bh) ? fitDot(smp, toSrc((bx0[c] + bx1[c]) / 2, (by0[c] + by1[c]) / 2), Math.max(bw, bh), sigmaPsf) : null;
    if (d) dots.push(d); else keep[c] = 1; // 点でなければ線として扱う
  }
  const big = new Uint8Array(mask.length); for (let i = 0; i < mask.length; i++) big[i] = keep[comp.id[i]];
  const paths = tracePaths(thin(big, U.w, U.h), U.w, U.h, { minSpur: minSpur * k });
  const strokes = [];
  for (const p of paths) {
    let pts = p.idx.map((i) => toSrc(i % U.w, Math.floor(i / U.w)));
    if (pathLength(pts, p.closed) < 0.75) continue;
    pts = smoothKeepCorners(resample(pts, step, p.closed), smooth, step, p.closed);
    if (!p.closed) {
      if (p.ends[0] === 'free') pts = extendEnd(smp, pts, true, step);
      if (p.ends[1] === 'free') pts = extendEnd(smp, pts, false, step);
    }
    const tg = tangents(pts, p.closed);
    const prof = pts.map((q, i) => crossProfile(smp, q, normalOf(tg[i])));
    // 太さの測り直し: ほかの線と交わる所では、横切る向きにその線の濃さまで足してしまい、局所的にふくらむ。
    // 片側だけ大きい所は小さい側に合わせ（robust）、中央値のフィルター（前後 1.5 画素）で残った短いふくらみを消す
    const A = median1d(prof.map((q) => q.robust), Math.round(1.5 / step), p.closed);
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = cum[cum.length - 1];
    const maxA = Math.max(...A), inner = A.map((a) => a >= 0.5 * maxA);
    const cRaw = median(prof.filter((q, i) => inner[i]).map((q, i) => solveOpacity(q.peak, q.robust, sigmaPsf).c)) ?? 1;
    // 色が分かるとき（colorAt と fillAt を渡したとき）は、不透明な線の色を戻し、濃さは測ったまま（幅 = 面積 ÷ 濃さ）にする。
    // 分からないときは、半透明の黒とみなし、濃さを段階にそろえる
    const c = opts.colorAt ? Math.max(0.15, cRaw) : quantizeOpacity(cRaw);
    let rgb = null;
    if (opts.colorAt) {
      const cols = [];
      pts.forEach((q, i) => {
        if (!inner[i]) return;
        const wv = A[i] / c, n = normalOf(tg[i]), o = wv / 2 + 1;
        const F1 = opts.fillAt(q[0] + n[0] * o, q[1] + n[1] * o), F2 = opts.fillAt(q[0] - n[0] * o, q[1] - n[1] * o);
        cols.push(unmixColor(opts.colorAt(q[0], q[1]), F1.map((v, j) => (v + F2[j]) / 2), wv, sigmaPsf));
      });
      if (cols.length) rgb = [0, 1, 2].map((j) => median(cols.map((col) => col[j])));
    }
    let half = smooth1d(A.map((a) => a / c / 2), widthSmooth / step, p.closed);
    if (!p.closed) {
      const tl = Math.max(0.3, Math.min(taper, 0.3 * total));
      half = half.map((hv, i) => {
        let f = 1;
        if (p.ends[0] === 'free') f *= Math.sin((Math.PI / 2) * Math.min(1, cum[i] / tl));
        if (p.ends[1] === 'free') f *= Math.sin((Math.PI / 2) * Math.min(1, (total - cum[i]) / tl));
        return hv * f;
      });
    }
    strokes.push({ pts, half, closed: p.closed, ends: [...p.ends], c, rgb });
  }
  // 点の色（色が分かるとき）: 輪は輪の上の色、塗った円は中心の色を、まわりの塗りと混ざった分だけ戻す
  if (opts.colorAt) for (const d of dots) {
    const ring = d.ring ? d.r - d.wr / 2 : 0, out = d.r + 1.2, wv = d.ring ? d.wr : 2 * d.r, cols = [];
    for (let a = 0; a < (d.ring ? 24 : 1); a++) {
      const ca = Math.cos((a * Math.PI) / 12), sa = Math.sin((a * Math.PI) / 12);
      cols.push(unmixColor(opts.colorAt(d.cx + ring * ca, d.cy + ring * sa), opts.fillAt(d.cx + out * ca, d.cy + out * sa), wv, sigmaPsf));
    }
    d.rgb = [0, 1, 2].map((j) => median(cols.map((col) => col[j])));
  }
  return { strokes, dots };
}
