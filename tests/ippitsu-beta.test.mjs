// reports/ippitsu/js/beta.mjs のベタ（黒く塗りつぶす所）の判定と、塗る筆を確かめる
// node --test tests/ippitsu-beta.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { betaRegions, betaStrokes, maskContours, fillRings, ringsOf } from '../reports/ippitsu/js/beta.mjs';
import { renderStrokes } from '../reports/ippitsu/js/trace.mjs';
import { orderStrokes, STAGES } from '../reports/ippitsu/js/order.mjs';

const W = 200, H = 200;
function gray(f) {
  const g = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g[y * W + x] = f(x, y);
  return g;
}
const sum = (m) => m.reduce((a, b) => a + b, 0);

test('大きな暗い面だけをベタにし、小さな黒い点は拾わない', () => {
  const g = gray((x, y) => {
    if (x >= 40 && x < 140 && y >= 40 && y < 140) return 0.03;       // 大きな暗い面
    if (x >= 170 && x < 175 && y >= 20 && y < 25) return 0.03;       // 小さな黒い点
    return 0.8;
  });
  const m = betaRegions(g, W, H, { below: 0.1, minArea: 200 });
  assert.equal(m[90 * W + 90], 1, '大きな暗い面がベタになっていない');
  assert.equal(m[22 * W + 172], 0, '小さな黒い点をベタにした');
  assert.equal(m[10 * W + 10], 0);
});

test('ベタの中の小さな白い穴は埋めて、大きな白い所は残す', () => {
  const g = gray((x, y) => {
    if (x >= 20 && x < 180 && y >= 20 && y < 180) {
      if (x >= 60 && x < 63 && y >= 60 && y < 63) return 0.9;          // 小さな穴
      if (x >= 100 && x < 150 && y >= 100 && y < 150) return 0.9;      // 大きな白い所
      return 0.03;
    }
    return 0.8;
  });
  const m = betaRegions(g, W, H, { below: 0.1, minArea: 200 });
  assert.equal(m[61 * W + 61], 1, '小さな穴が残った');
  assert.equal(m[125 * W + 125], 0, '大きな白い所を塗った');
});

// ベタの筆を塗る: 筆（level 0）は線のリボン、縁を整える面（level 1、poly）は輪郭の多角形を even-odd で塗る
function paintBeta(strokes) {
  const r = renderStrokes(strokes.filter((s) => !s.poly), W, H);
  for (const s of strokes.filter((q) => q.poly)) {
    const f = fillRings(ringsOf(s.points), W, H);
    for (let i = 0; i < W * H; i++) if (f[i]) r[i] = 1;
  }
  return r;
}

test('ベタの面を、はみ出しも塗り残しも無く塗る', () => {
  // 円と、穴の開いたドーナツと、細長い帯
  const g = gray((x, y) => {
    const d = Math.hypot(x - 70, y - 70), e = Math.hypot(x - 140, y - 130);
    return d < 45 || (e < 45 && e > 18) || (x > 20 && x < 180 && y > 182 && y < 192) ? 0.03 : 0.8;
  });
  const m = betaRegions(g, W, H, { below: 0.1, minArea: 200 });
  const strokes = betaStrokes(m, W, H, { brush: 6 });
  for (const s of strokes) assert.equal(s.kind, 'fill');
  const r = paintBeta(strokes);
  let inside = 0, covered = 0, spill = 0;
  for (let i = 0; i < W * H; i++) {
    if (m[i]) { inside++; if (r[i]) covered++; } else if (r[i]) spill++;
  }
  assert.ok(covered / inside > 0.995, `面を覆う割合 ${(covered / inside).toFixed(4)}`);
  assert.equal(spill, 0, `面の外へのはみ出し ${spill} 画素`);
  assert.equal(r[130 * W + 140], 0, 'ドーナツの穴を塗った');
});

test('輪郭の多角形は、なめらかな面の縁をなぞる（縁の値 0.5 の所を通る）', () => {
  // 半径 40 の円をぼかした面。輪郭は半径 40 の円になるはず
  const field = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) field[y * W + x] = Math.min(1, Math.max(0, 0.5 + (40 - Math.hypot(x - 100, y - 100)) / 4));
  const rings = maskContours(field, W, H, 0.5);
  assert.equal(rings.length, 1);
  const err = Math.max(...rings[0].map((p) => Math.abs(Math.hypot(p.x - 100, p.y - 100) - 40)));
  assert.ok(err < 0.2, `半径のずれ ${err.toFixed(3)}`);
});

test('筆で大まかに塗ってから、輪郭の形で縁を整える順になる', () => {
  const g = gray((x, y) => (Math.hypot(x - 100, y - 100) < 50 ? 0.03 : 0.8));
  const strokes = betaStrokes(betaRegions(g, W, H, { below: 0.1, minArea: 200 }), W, H, { brush: 6 });
  const brush = strokes.filter((s) => s.level === 0), edge = strokes.filter((s) => s.level === 1);
  assert.ok(brush.length > 0 && edge.length === 1, `筆 ${brush.length}、縁 ${edge.length}`);
  assert.ok(edge[0].poly, '縁が輪郭の多角形になっていない');
  assert.ok(Math.max(...brush.map((s) => s.seq)) < edge[0].seq, '筆より先に縁を整えている');
  // 筆の線は面の外へ出ない
  const m = betaRegions(g, W, H, { below: 0.1, minArea: 200 });
  const r = renderStrokes(brush, W, H);
  let out = 0;
  for (let i = 0; i < W * H; i++) if (r[i] && !m[i]) out++;
  assert.equal(out, 0, `筆の線のはみ出し ${out} 画素`);
});

// 写真のような絵（色の付いたなだらかな明暗に、暗い円と細い暗い線）
function photo() {
  const N = 240, d = new Uint8ClampedArray(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 200 - 0.5 * x;
    if (Math.hypot(x - 90, y - 120) < 45) v = 12;              // ベタになる暗い円
    if (Math.abs(x - 190) < 2 && y > 30 && y < 210) v = 30;    // 細い暗い線
    d.set([v + 20, v, v * 0.8, 255], (y * N + x) * 4);
  }
  return { rgba: d, w: N, h: N };
}

test('点描だけ（主線なし）のモードは、線を描かず点だけで描く', async () => {
  const { drawPlan } = await import('../reports/ippitsu/js/pipeline.mjs');
  const { rgba, w, h } = photo();
  const p = drawPlan(rgba, w, h, { mode: 'photo', hatchStyle: 'stipple-only' });
  assert.ok(p.strokes.length > 100);
  assert.ok(p.strokes.every((s) => s.kind === 'dot'), '点ではない筆がある');
  assert.deepEqual(p.stages, ['点描']);
});

test('ベタと点描のモードは、線 → ベタ → 点描 の順に描き、ベタの中には点を打たない', async () => {
  const { drawPlan } = await import('../reports/ippitsu/js/pipeline.mjs');
  const { rgba, w, h } = photo();
  const p = drawPlan(rgba, w, h, { mode: 'photo', hatchStyle: 'beta-stipple' });
  const kinds = p.strokes.map((s) => s.kind);
  assert.ok(kinds.includes('line') && kinds.includes('fill') && kinds.includes('dot'), [...new Set(kinds)].join(','));
  const firstFill = kinds.indexOf('fill'), lastLine = kinds.lastIndexOf('line'), firstDot = kinds.indexOf('dot'), lastFill = kinds.lastIndexOf('fill');
  assert.ok(lastLine < firstFill && lastFill < firstDot, '線 → ベタ → 点描 の順になっていない');
  // 暗い円の中心付近（半径 30 以内）には点が無い
  const inside = p.strokes.filter((s) => s.kind === 'dot' && Math.hypot(s.points[0].x - 90, s.points[0].y - 120) < 30);
  assert.equal(inside.length, 0, `ベタの中の点 ${inside.length}`);
  assert.deepEqual(p.stages, STAGES.photoBeta);
});

test('ベタだけのモードは、ベタの筆とペンだけで描く', async () => {
  const { drawPlan } = await import('../reports/ippitsu/js/pipeline.mjs');
  const { rgba, w, h } = photo();
  const p = drawPlan(rgba, w, h, { mode: 'photo', hatchStyle: 'beta-only' });
  assert.ok(p.strokes.length > 5);
  assert.ok(p.strokes.every((s) => s.kind === 'fill'), [...new Set(p.strokes.map((s) => s.kind))].join(','));
  assert.deepEqual(p.stages, ['ベタ']);
  assert.ok(p.strokes.every((s) => s.stage === 0));
});

test('ベタと点描だけのモードは、主線を描かず、ベタ → 点描 の順に描く', async () => {
  const { drawPlan } = await import('../reports/ippitsu/js/pipeline.mjs');
  const { rgba, w, h } = photo();
  const p = drawPlan(rgba, w, h, { mode: 'photo', hatchStyle: 'beta-stipple-only' });
  const kinds = p.strokes.map((s) => s.kind);
  assert.ok(!kinds.includes('line'), '主線がある');
  assert.ok(kinds.includes('fill') && kinds.includes('dot'));
  assert.ok(kinds.lastIndexOf('fill') < kinds.indexOf('dot'), 'ベタ → 点描 の順になっていない');
  assert.deepEqual(p.stages, ['ベタ', '点描']);
  assert.deepEqual([...new Set(p.strokes.map((s) => s.stage))], [0, 1]);
  const inside = p.strokes.filter((s) => s.kind === 'dot' && Math.hypot(s.points[0].x - 90, s.points[0].y - 120) < 30);
  assert.equal(inside.length, 0, `ベタの中の点 ${inside.length}`);
});

test('順番: 線 → ベタ → 点描 の段に並ぶ', () => {
  const line = { points: [{ x: 0, y: 0, w: 2 }, { x: 100, y: 0, w: 2 }], kind: 'line', closed: false };
  const fill = { points: [{ x: 0, y: 10, w: 6 }, { x: 50, y: 10, w: 6 }], kind: 'fill', level: 0, group: 0, seq: 0, closed: false };
  const dot = { points: [{ x: 5, y: 5, w: 1.6 }], kind: 'dot', level: 0, group: 1, seq: 0, closed: false };
  const out = orderStrokes([dot, fill, line], { mode: 'photo', longLen: 80, midLen: 25 });
  assert.deepEqual(out.map((s) => s.kind), ['line', 'fill', 'dot']);
  assert.deepEqual(out.map((s) => STAGES.photoBeta[s.stage]), ['長い輪郭', 'ベタ', '点描']);
});
