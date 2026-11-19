// 線を「中心の線 + 太さ + 濃さ」で写す計算（tools/lib/strokes.mjs）を確かめる。
// ずんだもんの三面図の正面を写す道具（tools/zunda-trace.mjs）が、顔のような小さな所の線に使う。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../tools/lib/strokes.mjs';
import { blur } from '../tools/lib/vectorize.mjs';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} と ${b} の差が ${tol} を超える`);
const neighbors = (m, w, h, i) => { const x = i % w, y = (i - x) / w; let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h && m[Y * w + X]) n++; } return n; };
const polyArea = (p) => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return a / 2; };

// 中心の線 pts、太さ width、濃さ c の線を、なめらかな縁（画素の面積に近い）で描いた濃さの場
function drawStroke(w, h, pts, width, c = 1) {
  const f = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let d = Infinity;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i], vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / L2));
      d = Math.min(d, Math.hypot(x - ax - vx * t, y - ay - vy * t));
    }
    f[y * w + x] = c * Math.max(0, Math.min(1, width / 2 - d + 0.5));
  }
  return f;
}

// ---- 細線化 ----
test('細線化: 太さ 9 の横の帯は、幅 1 画素の線になり、両端以外の点はとなりが 2 つ', () => {
  const w = 80, h = 21, m = new Uint8Array(w * h);
  for (let y = 6; y < 15; y++) for (let x = 10; x < 70; x++) m[y * w + x] = 1;
  const s = S.thin(m, w, h);
  const pts = [...s.keys()].filter((i) => s[i]);
  assert.ok(pts.length >= 45 && pts.length <= 62, `点の数 ${pts.length}`);
  for (const i of pts) near(Math.floor(i / w), 10, 1.01, '帯の中心の行から');
  const ends = pts.filter((i) => neighbors(s, w, h, i) === 1).length, mids = pts.filter((i) => neighbors(s, w, h, i) === 2).length;
  assert.equal(ends, 2); assert.equal(mids, pts.length - 2);
});

test('細線化: 斜めの帯でも、階段の角が残らない（となりが 3 つの点がない）', () => {
  const w = 60, h = 60, m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.abs(x - y) <= 3 && x > 5 && x < 55) m[y * w + x] = 1;
  const s = S.thin(m, w, h);
  const pts = [...s.keys()].filter((i) => s[i]);
  assert.ok(pts.length > 20);
  assert.equal(pts.filter((i) => neighbors(s, w, h, i) >= 3).length, 0);
});

// ---- 線をたどる ----
test('たどる: L の字は 1 本（両端が切れ目）、T の字は 3 本（どれも片方が分かれ目）、輪は閉じた 1 本（どれも細線化してからたどる）', () => {
  const w = 40, h = 40;
  const L = new Uint8Array(w * h);
  for (let x = 5; x <= 30; x++) L[30 * w + x] = 1;
  for (let y = 5; y <= 30; y++) L[y * w + 5] = 1;
  const pl = S.tracePaths(S.thin(L, w, h), w, h);
  assert.equal(pl.length, 1); assert.deepEqual(pl[0].ends, ['free', 'free']); assert.equal(pl[0].closed, false);
  assert.ok(pl[0].idx.length >= 50);

  const T = new Uint8Array(w * h);
  for (let x = 5; x <= 35; x++) T[10 * w + x] = 1;
  for (let y = 11; y <= 35; y++) T[y * w + 20] = 1;
  const pt = S.tracePaths(S.thin(T, w, h), w, h);
  assert.equal(pt.length, 3);
  for (const p of pt) assert.deepEqual([...p.ends].sort(), ['free', 'joint']);

  const R = new Uint8Array(w * h);
  for (let a = 0; a < 720; a++) { const x = Math.round(20 + 12 * Math.cos(a * Math.PI / 360)), y = Math.round(20 + 12 * Math.sin(a * Math.PI / 360)); R[y * w + x] = 1; }
  const pr = S.tracePaths(S.thin(R, w, h), w, h);
  assert.equal(pr.length, 1); assert.equal(pr[0].closed, true);
});

test('たどる: 短いひげ（minSpur 未満の枝）は捨てる', () => {
  const w = 40, h = 20, m = new Uint8Array(w * h);
  for (let x = 2; x <= 37; x++) m[10 * w + x] = 1;
  m[9 * w + 20] = 1; m[8 * w + 20] = 1; // 長さ 2 のひげ
  const p = S.tracePaths(m, w, h, { minSpur: 4 });
  const long = p.filter((q) => q.idx.length > 4);
  assert.equal(p.length - long.length, 0, 'ひげが残っている');
  assert.equal(long.reduce((a, q) => a + q.idx.length, 0) >= 34, true);
});

// ---- なめらかにする ----
test('なめらかにする: ゆれのある円（半径 10）は、半径をほとんど変えずに、ゆれだけが消える', () => {
  const pts = [];
  for (let i = 0; i < 160; i++) { const a = (i / 160) * 2 * Math.PI, r = 10 + 0.3 * Math.sin(i * 2.7) * Math.cos(i * 1.3); pts.push([50 + r * Math.cos(a), 50 + r * Math.sin(a)]); }
  const s = S.smoothPath(S.resample(pts, 0.25, true), 1.0, 0.25, true);
  const rs = s.map(([x, y]) => Math.hypot(x - 50, y - 50)), mean = rs.reduce((a, b) => a + b) / rs.length;
  const sd = Math.sqrt(rs.reduce((a, b) => a + (b - mean) ** 2, 0) / rs.length);
  near(mean, 10, 0.12, '半径'); assert.ok(sd < 0.08, `ゆれ ${sd}`);
});

test('なめらかにする: 開いた線の端は動かず、まっすぐな線はまっすぐのまま', () => {
  const pts = []; for (let i = 0; i <= 40; i++) pts.push([i * 0.5, 3 + i * 0.25]);
  const s = S.smoothPath(S.resample(pts, 0.25, false), 1.0, 0.25, false);
  near(s[0][0], 0, 1e-6); near(s[0][1], 3, 1e-6); near(s.at(-1)[0], 20, 1e-6); near(s.at(-1)[1], 13, 1e-6);
  for (const [x, y] of s) near(y, 3 + x / 2, 1e-6, '直線から');
});

test('なめらかにする: 角（口の山のような尖り）は残し、角のない所のゆれだけを消す', () => {
  // 2 本の直線が 50 度の向きの差で出会う「へ」の字。0.15 画素のゆれを足す
  const pts = [];
  for (let i = 0; i <= 40; i++) pts.push([i * 0.25, 10 - i * 0.25 * Math.tan((25 * Math.PI) / 180) + 0.15 * Math.sin(i * 2.1)]);
  const top = pts[40];
  for (let i = 1; i <= 40; i++) pts.push([top[0] + i * 0.25, top[1] + i * 0.25 * Math.tan((25 * Math.PI) / 180) + 0.15 * Math.sin(i * 1.7)]);
  const keep = S.smoothKeepCorners(pts, 1.0, 0.25, false), plain = S.smoothPath(pts, 1.0, 0.25, false);
  const peakY = (a) => Math.min(...a.map((q) => q[1]));
  near(peakY(keep), top[1], 0.12, '角を残したときの山の高さ');
  assert.ok(peakY(plain) - top[1] > 0.2, `角を残さないと山が下がる（${peakY(plain) - top[1]}）`);
});

// ---- 太さと濃さ ----
test('太さと濃さ: ぼかした箱の山の高さと面積から、濃さ c と幅 w を戻す', () => {
  for (const [w, c] of [[2, 1], [3.5, 1], [1.5, 0.6], [1.2, 0.8], [0.8, 1]]) {
    const sg = 0.55, P = c * S.erf(w / (2 * Math.SQRT2 * sg)), A = c * w;
    const r = S.solveOpacity(P, A, sg);
    near(r.c, c, 0.02, `c（w=${w}, c=${c}）`); near(r.w, w, 0.05, `w（w=${w}, c=${c}）`);
  }
});

test('太さと濃さ: 横切る向きの濃さの合計は、線の幅 × 濃さ。となりの線に入る前で止める', () => {
  const w = 40, h = 30;
  const f = drawStroke(w, h, [[5, 10], [35, 10]], 2.4, 0.7);
  const g = drawStroke(w, h, [[5, 14], [35, 14]], 2, 1); // 4 画素下のとなりの線
  for (let i = 0; i < f.length; i++) f[i] = Math.max(f[i], g[i]);
  const smp = S.sampler(f, w, h);
  const p = S.crossProfile(smp, [20, 10], [0, 1]);
  near(p.area, 2.4 * 0.7, 0.15, '面積'); near(p.peak, 0.7, 0.05, '山');
});

test('ぼけ: 太い帯の縁の広がりから σ を測る。強くぼかすほど大きく、ぼかしの値に近い', () => {
  const w = 60, h = 40, band = drawStroke(w, h, [[10, 20], [50, 20]], 12, 1);
  const a = S.estimatePsf(blur(band, w, h, 0.4), w, h), b = S.estimatePsf(blur(band, w, h, 0.8), w, h);
  assert.ok(a !== null && b !== null);
  assert.ok(a < b, `${a} < ${b}`);
  near(b, Math.hypot(0.8, 0.29), 0.15, 'σ 0.8 のとき');
});

test('色: 白地の上の茶色の線（不透明）から、線の色と太さを戻す', () => {
  const w = 60, h = 30, C = [90, 60, 40], sg = 0.6;
  const cov = blur(drawStroke(w, h, [[8, 15], [52, 15]], 1.5, 1), w, h, 0.5);
  const img = [0, 1, 2].map((j) => Float32Array.from(cov, (v) => 255 + (C[j] - 255) * v));
  const ink = Float32Array.from(cov, (_, i) => Math.max(0, Math.min(1, (765 - img[0][i] - img[1][i] - img[2][i]) / 765)));
  const smpC = img.map((a) => S.sampler(a, w, h));
  const r = S.strokesFromField(ink, w, h, { sigmaPsf: sg, colorAt: (x, y) => smpC.map((s) => s(x, y)), fillAt: () => [255, 255, 255] });
  assert.equal(r.strokes.length, 1);
  const s = r.strokes[0];
  for (let j = 0; j < 3; j++) near(s.rgb[j], C[j], 25, `色の ${'RGB'[j]}`);
  near(2 * s.half[Math.floor(s.half.length / 2)], 1.5, 0.5, '太さ');
});

// ---- 輪郭 ----
test('輪郭: まっすぐな線（長さ 20、太さ 2、両端が丸い）の面積は 20×2 + π、向きは正', () => {
  const pts = []; for (let i = 0; i <= 80; i++) pts.push([10 + i * 0.25, 10]);
  const half = pts.map(() => 1);
  const poly = S.strokeOutline(pts, half, { closed: false, caps: ['joint', 'joint'] });
  const a = polyArea(poly[0]);
  assert.ok(a > 0, '向き');
  near(a, 40 + Math.PI, 0.6, '面積');
});

test('輪郭: 閉じた線は、外の輪（正）と内の輪（負）の 2 つになる', () => {
  const pts = []; for (let i = 0; i < 200; i++) { const t = (i / 200) * 2 * Math.PI; pts.push([30 + 10 * Math.cos(t), 30 + 10 * Math.sin(t)]); }
  const poly = S.strokeOutline(pts, pts.map(() => 0.5), { closed: true });
  assert.equal(poly.length, 2);
  const a = poly.map(polyArea).sort((x, y) => y - x);
  assert.ok(a[0] > 0 && a[1] < 0);
  near(a[0] + a[1], 2 * Math.PI * 10 * 1, 0.5, '輪の面積');
});

// ---- 全体 ----
test('全体: 曲がった太さ 2 の線を写すと、1 本の線になり、濃さの合計（幅 × 長さ）がほぼ同じ', () => {
  const w = 60, h = 40, pts = [];
  for (let i = 0; i <= 60; i++) { const t = i / 60; pts.push([8 + 44 * t, 20 + 8 * Math.sin(t * Math.PI * 1.5)]); }
  const f = drawStroke(w, h, pts, 2, 1);
  const r = S.strokesFromField(f, w, h);
  assert.equal(r.strokes.length, 1); assert.equal(r.dots.length, 0);
  const s = r.strokes[0];
  assert.equal(s.c, 1);
  let sumInk = 0; for (const v of f) sumInk += v;
  const poly = S.strokeOutline(s.pts, s.half, { closed: s.closed, caps: s.ends });
  const area = poly.reduce((a, p) => a + polyArea(p), 0);
  near(area / sumInk, 1, 0.12, '面積の比');
});

test('全体: 薄い線（濃さ 0.55）は、濃さを薄いと見積もり、太さを濃さの分だけ広げない', () => {
  const w = 60, h = 30;
  // 元の絵と同じくらいぼかす（画素の面積 + JPEG で、標準偏差 0.55 画素ほど）
  const f = blur(drawStroke(w, h, [[8, 15], [52, 15]], 1.6, 0.55), w, h, 0.45);
  const r = S.strokesFromField(f, w, h);
  assert.equal(r.strokes.length, 1);
  assert.ok(r.strokes[0].c <= 0.75, `濃さ ${r.strokes[0].c}`);
  const mid = r.strokes[0].half[Math.floor(r.strokes[0].half.length / 2)];
  near(mid * 2, 1.6, 0.6, '太さ');
});

test('全体: 小さな点（直径 3）は、線ではなく点として返す。中の明るい輪の点は輪として返す', () => {
  const w = 30, h = 30, f = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d1 = Math.hypot(x - 8, y - 8); f[y * w + x] = Math.max(0, Math.min(1, 1.5 - d1 + 0.5));
    const d2 = Math.hypot(x - 20, y - 20); const ring = Math.max(0, Math.min(1, 0.6 - Math.abs(d2 - 2) + 0.5)) * 0.8;
    f[y * w + x] = Math.max(f[y * w + x], ring);
  }
  const r = S.strokesFromField(f, w, h);
  assert.equal(r.strokes.length, 0);
  assert.equal(r.dots.length, 2);
  const [a, b] = [...r.dots].sort((p, q) => p.cx - q.cx);
  near(a.cx, 8, 0.3); near(a.cy, 8, 0.3); assert.equal(a.ring, false); near(a.r, 1.5, 0.5, '半径');
  near(b.cx, 20, 0.3); near(b.cy, 20, 0.3); assert.equal(b.ring, true); near(b.r, 2.6, 0.7, '外の半径');
});
