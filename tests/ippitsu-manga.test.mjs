// reports/ippitsu/js/manga.mjs（漫画原稿モードの線とトーン）を確かめる
// node --test tests/ippitsu-manga.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { joinStrokes, smoothPath, gpenWidths, screenTones } from '../reports/ippitsu/js/manga.mjs';

const line = (x0, y0, x1, y1, n = 20) => ({ points: Array.from({ length: n }, (_, i) => ({ x: x0 + ((x1 - x0) * i) / (n - 1), y: y0 + ((y1 - y0) * i) / (n - 1), w: 2 })), kind: 'line', closed: false });
const len = (pts) => pts.reduce((a, p, i) => (i ? a + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0), 0);

// ---------------- 線をつなぐ
test('向きのそろった 2 本の線は、すき間が小さければ 1 本につなぐ', () => {
  const out = joinStrokes([line(0, 0, 40, 0), line(45, 1, 90, 1)], { gap: 8, maxAngle: 35 });
  assert.equal(out.length, 1);
  assert.ok(len(out[0].points) > 85, `長さ ${len(out[0].points)}`);
});

test('向きが直角の線や、遠い線はつながない', () => {
  assert.equal(joinStrokes([line(0, 0, 40, 0), line(44, 2, 44, 40)], { gap: 8, maxAngle: 35 }).length, 2);
  assert.equal(joinStrokes([line(0, 0, 40, 0), line(60, 0, 100, 0)], { gap: 8, maxAngle: 35 }).length, 2);
});

test('線の向きが逆でも、端どうしが向き合えばつなぎ、3 本が 1 本になる', () => {
  const out = joinStrokes([line(0, 0, 30, 0), line(64, 0, 34, 0), line(68, 0, 100, 0)], { gap: 8, maxAngle: 35 });
  assert.equal(out.length, 1);
  const xs = out[0].points.map((p) => p.x);
  // 点が端から端へ順に並ぶ（行き来しない）
  const inc = xs.every((x, i) => i === 0 || x >= xs[i - 1] - 0.01), dec = xs.every((x, i) => i === 0 || x <= xs[i - 1] + 0.01);
  assert.ok(inc || dec, '点の並びが行き来している');
});

// ---------------- なめらかにする
test('ガタついた線をなめらかにし、端の位置は変えず、点の間隔をそろえる', () => {
  const pts = Array.from({ length: 60 }, (_, i) => ({ x: i, y: i % 2 ? 1 : -1, w: 2 }));
  const out = smoothPath(pts, { sigma: 2, step: 1.5 });
  const maxDev = Math.max(...out.slice(3, -3).map((p) => Math.abs(p.y)));
  assert.ok(maxDev < 0.3, `ガタつき ${maxDev}`);
  assert.ok(Math.hypot(out[0].x - 0, out[0].y + 1) < 1e-6 && Math.hypot(out.at(-1).x - 59, out.at(-1).y - 1) < 1e-6, '端が動いた');
  const steps = out.slice(1).map((p, i) => Math.hypot(p.x - out[i].x, p.y - out[i].y));
  assert.ok(Math.max(...steps.slice(0, -1)) < 1.6 && Math.min(...steps.slice(0, -1)) > 1.4, `間隔 ${Math.min(...steps)}〜${Math.max(...steps)}`);
});

// ---------------- 線を引き直す（迷いの無い線に）
test('数 px の波がある線を、まっすぐな線に引き直す', async () => {
  const { fairPath } = await import('../reports/ippitsu/js/manga.mjs');
  // 長さ 120px の横線に、波長 12px・振れ幅 0.8px の波と、1 画素の揺れを足す
  const pts = Array.from({ length: 121 }, (_, i) => ({ x: i, y: 0.8 * Math.sin((2 * Math.PI * i) / 12) + (i % 3 === 0 ? 0.4 : -0.2), w: 2 }));
  const out = fairPath(pts, { eps: 1, step: 1.5 });
  // 端の 8 点を除いて直線を当てはめ、そこからのずれを測る
  const inner = out.slice(8, -8), n = inner.length;
  const mx = inner.reduce((a, p) => a + p.x, 0) / n, my = inner.reduce((a, p) => a + p.y, 0) / n;
  const b = inner.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / inner.reduce((a, p) => a + (p.x - mx) ** 2, 0);
  const dev = Math.max(...inner.map((p) => Math.abs(p.y - (my + b * (p.x - mx)))));
  assert.ok(dev < 0.3, `当てはめた直線からのずれ ${dev.toFixed(2)}`);
  assert.ok(Math.hypot(out[0].x - pts[0].x, out[0].y - pts[0].y) < 1e-6 && Math.hypot(out.at(-1).x - 120, out.at(-1).y - pts.at(-1).y) < 1e-6, '端が動いた');
});

test('なめらかな円弧は、形を保ったまま引き直す（半径のずれが小さい）', async () => {
  const { fairPath } = await import('../reports/ippitsu/js/manga.mjs');
  const pts = Array.from({ length: 80 }, (_, i) => { const a = (Math.PI * i) / 79; return { x: 50 + 40 * Math.cos(a) + (i % 2 ? 0.4 : -0.4), y: 50 + 40 * Math.sin(a), w: 2 }; });
  const out = fairPath(pts, { eps: 1, step: 1.5 });
  const err = Math.max(...out.map((p) => Math.abs(Math.hypot(p.x - 50, p.y - 50) - 40)));
  assert.ok(err < 0.8, `半径のずれ ${err.toFixed(2)}`);
  // 向きの変わり方がなめらか（隣どうしの曲がりの差が小さい）
  const ang = out.slice(1).map((p, i) => Math.atan2(p.y - out[i].y, p.x - out[i].x));
  const turn = ang.slice(1).map((a, i) => { let d = a - ang[i]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; });
  const jerk = Math.max(...turn.slice(1).map((t, i) => Math.abs(t - turn[i])));
  assert.ok(jerk < 0.05, `曲がりの変わり方 ${jerk.toFixed(3)}`);
});

// ---------------- G ペンの強弱
const OPTS = { wMin: 0.6, wMax: 3.2, refLen: 200 };
const mid = (pts) => pts[pts.length >> 1].w;
test('はっきりした輪郭ほど、長い線ほど、太く引く', () => {
  const pts = line(0, 0, 100, 0, 60).points;
  const strong = gpenWidths(pts, { ...OPTS, contrast: 1, dark: 0.5 });
  const weak = gpenWidths(pts, { ...OPTS, contrast: 0.1, dark: 0.5 });
  assert.ok(mid(strong) > mid(weak) * 1.6, `強 ${mid(strong)} 弱 ${mid(weak)}`);
  const short = gpenWidths(line(0, 0, 15, 0, 10).points, { ...OPTS, contrast: 1, dark: 0.5 });
  assert.ok(mid(strong) > mid(short) * 1.3, `長 ${mid(strong)} 短 ${mid(short)}`);
});

test('入りと抜きは細く、線幅は wMin〜wMax に収まる', () => {
  const out = gpenWidths(line(0, 0, 120, 0, 80).points, { ...OPTS, contrast: 1, dark: 1 });
  assert.ok(out[0].w < mid(out) * 0.45 && out.at(-1).w < mid(out) * 0.45, `端 ${out[0].w} ${out.at(-1).w} 中 ${mid(out)}`);
  for (const p of out) assert.ok(p.w >= 0.15 - 1e-9 && p.w <= 3.2 + 1e-9, `線幅 ${p.w}`);
});

test('長い線の入りと抜きは、数 px でとがらず、なだらかに細くなる（抜きの方が長い）', () => {
  const out = gpenWidths(line(0, 0, 200, 0, 201).points, { ...OPTS, contrast: 1, dark: 0.5 });
  const m = mid(out);
  assert.ok(out[6].w < m * 0.6, `入りから 6px ${out[6].w.toFixed(2)}（真ん中 ${m.toFixed(2)}）`);
  assert.ok(out[200 - 12].w < m * 0.7, `抜きから 12px ${out[188].w.toFixed(2)}`);
  assert.ok(out[200 - 12].w < out[12].w, '抜きの方が入りより長く細くなっていない');
});

test('長い線は真ん中がふくらむ（両端の 4 分の 1 の所より太い）', () => {
  const out = gpenWidths(line(0, 0, 200, 0, 201).points, { ...OPTS, contrast: 0.7, dark: 0.5 });
  assert.ok(out[100].w > out[50].w * 1.05 && out[100].w > out[150].w * 1.05, `25% ${out[50].w.toFixed(2)} 50% ${out[100].w.toFixed(2)} 75% ${out[150].w.toFixed(2)}`);
});

test('ベタの縁のペンは、太さと道筋をならして波打たないようにする', async () => {
  const { smoothWidths } = await import('../reports/ippitsu/js/manga.mjs');
  const pts = Array.from({ length: 80 }, (_, i) => ({ x: i, y: 0, w: i % 6 < 3 ? 1 : 4 }));
  const out = smoothWidths(pts, 4);
  const ws = out.slice(10, -10).map((p) => p.w);
  assert.ok(Math.max(...ws) - Math.min(...ws) < 0.5, `太さの揺れ ${Math.min(...ws).toFixed(2)}〜${Math.max(...ws).toFixed(2)}`);
  assert.ok(Math.abs(ws.reduce((a, b) => a + b, 0) / ws.length - 2.5) < 0.2, '平均の太さが変わった');
});

test('細かく揺れる道筋でも、線の太さは揺れずになめらかに変わる', () => {
  const pts = Array.from({ length: 150 }, (_, i) => ({ x: i, y: i % 4 < 2 ? 0.7 : -0.7, w: 2 }));
  const out = gpenWidths(pts, { ...OPTS, contrast: 0.8, dark: 0.5 });
  const m = mid(out);
  // 入り抜きの所（両端の 25 点）を除いた、線の胴の部分で測る
  const body = out.slice(25, -25);
  const jump = Math.max(...body.slice(1).map((p, i) => Math.abs(p.w - body[i].w)));
  assert.ok(jump < m * 0.06, `隣どうしの太さの差 ${jump.toFixed(3)}（真ん中 ${m.toFixed(2)}）`);
});

test('入りと抜きは先端までまっすぐ細くとがる（端の太さは 0.2px 以下）', () => {
  const out = gpenWidths(line(0, 0, 120, 0, 81).points, { ...OPTS, contrast: 1, dark: 0.5 });
  assert.ok(out[0].w <= 0.2 + 1e-9 && out.at(-1).w <= 0.2 + 1e-9, `端 ${out[0].w} ${out.at(-1).w}`);
  // 先端から真ん中へ、太さが一度も細くならない（単調に太る）
  for (let i = 1; i < 20; i++) assert.ok(out[i].w >= out[i - 1].w - 1e-9, `入りの ${i} 点目で細くなった`);
});

test('大きなカーブのふくらみは、まっすぐな所より太い', () => {
  // まっすぐ 60px → 半径 25 の半円 → まっすぐ 60px
  const pts = [];
  for (let i = 0; i <= 60; i++) pts.push({ x: i, y: 0, w: 2 });
  for (let k = 1; k <= 40; k++) { const a = -Math.PI / 2 + (Math.PI * k) / 40; pts.push({ x: 60 + 25 * Math.cos(a), y: 25 + 25 * Math.sin(a), w: 2 }); }
  for (let i = 1; i <= 60; i++) pts.push({ x: 60 - i, y: 50, w: 2 });
  const out = gpenWidths(pts, { ...OPTS, contrast: 0.6, dark: 0.5 });
  const curve = out[60 + 20].w, straight = out[30].w;
  assert.ok(curve > straight * 1.15, `カーブ ${curve} まっすぐ ${straight}`);
});

// ---------------- スクリーントーン
const W = 240, H = 240;
function gray(f) {
  const g = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g[y * W + x] = f(x, y);
  return g;
}
const TONE = { pitch: 5, angle: 45, minArea: 150 };
const dotsOf = (regions) => regions.flatMap((r) => r.dots);
const coverage = (dots, x0, y0, x1, y1) => dots.filter((d) => d.x >= x0 && d.x < x1 && d.y >= y0 && d.y < y1).reduce((a, d) => a + Math.PI * (d.w / 2) ** 2, 0) / ((x1 - x0) * (y1 - y0));

test('白い所とベタの所にはトーンを貼らない', () => {
  const beta = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < 100; x++) beta[y * W + x] = 1;
  const regions = screenTones(gray((x) => (x < 100 ? 0.05 : 0.95)), W, H, { ...TONE, beta });
  assert.equal(dotsOf(regions).length, 0);
});

test('中間の明るさの面は、濃さの段（10・20・30%）にそろえた網点の面になる', () => {
  const g = gray((x) => (x < 80 ? 0.72 : x < 160 ? 0.52 : 0.3));
  const regions = screenTones(g, W, H, TONE);
  const flat = regions.filter((r) => !r.gradation);
  const levels = [...new Set(flat.map((r) => r.level))].sort((a, b) => a - b);
  assert.deepEqual(levels, [10, 20, 30]);
  const d = dotsOf(regions);
  for (const [x0, x1, c] of [[10, 70, 0.1], [90, 150, 0.2], [170, 230, 0.3]]) {
    const cv = coverage(d, x0, 20, x1, 220);
    assert.ok(Math.abs(cv - c) < c * 0.2, `${x0}〜${x1} の覆う割合 ${cv.toFixed(3)}（目標 ${c}）`);
  }
});

test('網点は 45° の格子に、ピッチの間隔で並ぶ', () => {
  const d = dotsOf(screenTones(gray(() => 0.5), W, H, TONE)).filter((p) => p.x > 30 && p.x < 210 && p.y > 30 && p.y < 210);
  const p0 = d[d.length >> 1];
  const nn = d.filter((q) => q !== p0).sort((a, b) => Math.hypot(a.x - p0.x, a.y - p0.y) - Math.hypot(b.x - p0.x, b.y - p0.y)).slice(0, 4);
  for (const q of nn) {
    const dist = Math.hypot(q.x - p0.x, q.y - p0.y);
    assert.ok(Math.abs(dist - 5) < 0.3, `隣の点まで ${dist}`);
    const ang = (((Math.atan2(q.y - p0.y, q.x - p0.x) * 180) / Math.PI) % 90 + 90) % 90;
    assert.ok(Math.abs(ang - 45) < 3, `向き ${ang}`);
  }
});

test('小さすぎる面はトーンを貼らずに、まわりの面に合わせる', () => {
  const g = gray((x, y) => (Math.hypot(x - 120, y - 120) < 4 ? 0.3 : 0.72));
  const regions = screenTones(g, W, H, TONE);
  for (const r of regions) assert.ok(r.area >= 150, `面積 ${r.area}`);
});

test('なだらかに暗くなる広い面は、網点が少しずつ大きくなるグラデーショントーンになる', () => {
  const g = gray((x) => 0.88 - 0.55 * (x / W));
  const regions = screenTones(g, W, H, TONE);
  const grad = regions.filter((r) => r.gradation);
  assert.ok(grad.length >= 1, 'グラデーショントーンが無い');
  const dots = grad.flatMap((r) => r.dots).filter((p) => p.y > 100 && p.y < 140).sort((a, b) => a.x - b.x);
  const first = dots.slice(0, 6).reduce((a, p) => a + p.w, 0) / 6, last = dots.slice(-6).reduce((a, p) => a + p.w, 0) / 6;
  assert.ok(last > first * 1.4, `左 ${first.toFixed(2)} 右 ${last.toFixed(2)}`);
  // 帯の段差が無い: 隣り合う点の大きさの差が小さい
  let jump = 0;
  for (let i = 1; i < dots.length; i++) if (Math.abs(dots[i].x - dots[i - 1].x) < 6) jump = Math.max(jump, Math.abs(dots[i].w - dots[i - 1].w));
  assert.ok(jump < 0.5, `隣の点の大きさの差 ${jump}`);
});

test('SVG では、トーンの面ごとに網点を円でまとめて書く', async () => {
  const { toSVG } = await import('../reports/ippitsu/js/export.mjs');
  const svg = toSVG([{ points: [{ x: 1, y: 1, w: 2 }, { x: 6, y: 6, w: 2 }, { x: 11, y: 1, w: 2 }], dots: true }, line(0, 20, 50, 20)], 60, 30);
  assert.equal((svg.match(/<g data-order="1" data-kind="tone">/g) || []).length, 1);
  assert.equal((svg.match(/<circle /g) || []).length, 3);
  assert.equal((svg.match(/<path /g) || []).length, 1);
});

test('SVG では、ベタの縁を輪郭の多角形として、穴も含めて even-odd の道筋で書く', async () => {
  const { toSVG } = await import('../reports/ippitsu/js/export.mjs');
  const pts = [{ x: 0, y: 0, w: 0 }, { x: 9, y: 0, w: 0 }, { x: 9, y: 9, w: 0 }, { x: 9, y: 9, w: -1 }, { x: 3, y: 3, w: 0 }, { x: 6, y: 3, w: 0 }, { x: 6, y: 6, w: 0 }];
  const svg = toSVG([{ points: pts, poly: true }], 10, 10);
  assert.match(svg, /<path d="M0 0L9 0L9 9ZM3 3L6 3L6 6Z" fill-rule="evenodd"/);
});

test('漫画原稿モードは、線 → ベタ → トーン の順に描き、ベタの中にはトーンを貼らない', async () => {
  const { drawPlan } = await import('../reports/ippitsu/js/pipeline.mjs');
  const N = 240, d = new Uint8ClampedArray(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 220 - 0.6 * x;
    if (Math.hypot(x - 90, y - 120) < 45) v = 10;
    d.set([v, v, v, 255], (y * N + x) * 4);
  }
  const p = drawPlan(d, N, N, { mode: 'photo', hatchStyle: 'manga' });
  const kinds = p.strokes.map((s) => s.kind);
  assert.ok(kinds.includes('line') && kinds.includes('fill') && kinds.includes('tone'), [...new Set(kinds)].join(','));
  assert.ok(kinds.lastIndexOf('line') < kinds.indexOf('fill') && kinds.lastIndexOf('fill') < kinds.indexOf('tone'), '線 → ベタ → トーン の順になっていない');
  assert.deepEqual(p.stages, ['長い輪郭', '中くらいの線', '短い線', 'ベタ', 'トーン']);
  const inBeta = p.strokes.filter((s) => s.kind === 'tone').flatMap((s) => s.points).filter((q) => Math.hypot(q.x - 90, q.y - 120) < 30);
  assert.equal(inBeta.length, 0, `ベタの中の網点 ${inBeta.length}`);
  // 主線の胴（入り抜きを除いた真ん中あたり）は、どの線も 1px 以上の太さがある（細すぎて灰色の線にならない）
  for (const s of p.strokes.filter((q) => q.kind === 'line' && q.points.length >= 9)) {
    const m = s.points[s.points.length >> 1].w;
    assert.ok(m >= 1 - 1e-9, `胴の太さ ${m.toFixed(2)}px の線がある`);
  }
  // 主線は G ペンの強弱が付いている（線の中で太さが変わる）
  const ws = p.strokes.filter((s) => s.kind === 'line' && s.points.length > 20).map((s) => Math.max(...s.points.map((q) => q.w)) / Math.min(...s.points.map((q) => q.w)));
  assert.ok(ws.length && Math.max(...ws) > 2, `線の中の太さの差（最大/最小） ${Math.max(...ws)}`);
});

test('同じ入力からは毎回同じトーンになる', () => {
  const g = gray((x, y) => 0.3 + 0.002 * (x + y));
  assert.deepEqual(screenTones(g, W, H, TONE), screenTones(g, W, H, TONE));
});
