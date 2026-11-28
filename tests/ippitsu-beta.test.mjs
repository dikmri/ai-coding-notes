// reports/ippitsu/js/beta.mjs のベタ（黒く塗りつぶす所）の判定と、塗る筆を確かめる
// node --test tests/ippitsu-beta.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { betaRegions, betaStrokes } from '../reports/ippitsu/js/beta.mjs';
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

test('筆とペンでベタの面をほぼ埋め、面の外へはみ出さない', () => {
  const g = gray((x, y) => (Math.hypot(x - 100, y - 100) < 60 ? 0.03 : 0.8));
  const m = betaRegions(g, W, H, { below: 0.1, minArea: 200 });
  const strokes = betaStrokes(m, W, H, { brush: 6 });
  assert.ok(strokes.length >= 5);
  for (const s of strokes) assert.equal(s.kind, 'fill');
  const r = renderStrokes(strokes, W, H);
  let inside = 0, covered = 0, spill = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (m[i]) { inside++; if (r[i]) covered++; }
    else if (r[i]) {
      // 面から 1px 以内のはみ出しは縁のなめらかさの分として許す
      const near = m[i - 1] || m[i + 1] || m[i - W] || m[i + W];
      if (!near) spill++;
    }
  }
  assert.ok(covered / inside > 0.97, `面を覆う割合 ${(covered / inside).toFixed(3)}`);
  assert.ok(spill / inside < 0.01, `面の外へのはみ出し ${(spill / inside).toFixed(4)}`);
});

test('筆で大まかに塗ってから、ペンで縁を整える順になる', () => {
  const g = gray((x, y) => (Math.hypot(x - 100, y - 100) < 50 ? 0.03 : 0.8));
  const strokes = betaStrokes(betaRegions(g, W, H, { below: 0.1, minArea: 200 }), W, H, { brush: 6 });
  const brush = strokes.filter((s) => s.level === 0), pen = strokes.filter((s) => s.level === 1);
  assert.ok(brush.length > 0 && pen.length > 0, `筆 ${brush.length}、ペン ${pen.length}`);
  assert.ok(Math.max(...brush.map((s) => s.seq)) < Math.min(...pen.map((s) => s.seq)), '筆より先にペンを使っている');
  // 筆の線は太く、ペンの線は細い
  const med = (v) => v.sort((a, b) => a - b)[v.length >> 1];
  assert.ok(med(brush.flatMap((s) => s.points.map((p) => p.w))) > med(pen.flatMap((s) => s.points.map((p) => p.w))));
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
