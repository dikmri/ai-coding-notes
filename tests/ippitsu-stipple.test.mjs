// reports/ippitsu/js/stipple.mjs の点描（stippleDots）と、その描く順番を確かめる
// node --test tests/ippitsu-stipple.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stippleDots, coverageOf } from '../reports/ippitsu/js/stipple.mjs';
import { orderStrokes } from '../reports/ippitsu/js/order.mjs';

const W = 200, H = 200;
function gray(f) {
  const g = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g[y * W + x] = f(x, y);
  return g;
}
const inBox = (p, x0, y0, x1, y1) => p.x >= x0 && p.x < x1 && p.y >= y0 && p.y < y1;
const OPTS = { cell: 28, dot: 1.6 };

test('白い画像には点を打たない', () => {
  assert.equal(stippleDots(gray(() => 0.97), W, H, OPTS).length, 0);
});

test('点は暗い所にだけ打ち、点で覆う割合が明暗の目標に近い', () => {
  const g = gray((x, y) => (x >= 40 && x < 160 && y >= 40 && y < 160 ? 0.4 : 0.97));
  const dots = stippleDots(g, W, H, OPTS);
  assert.ok(dots.length > 50, `点 ${dots.length}`);
  for (const d of dots) assert.ok(inBox(d.points[0], 38, 38, 162, 162), `外に打った (${d.points[0].x}, ${d.points[0].y})`);
  // 内側 100×100 の中で、点の面積の合計 ÷ 面積 を目標と比べる
  const inner = dots.filter((d) => inBox(d.points[0], 50, 50, 150, 150));
  const area = inner.reduce((a, d) => a + Math.PI * (d.points[0].w / 2) ** 2, 0) / (100 * 100);
  const target = coverageOf(0.4, OPTS);
  assert.ok(Math.abs(area - target) / target < 0.25, `覆う割合 ${area.toFixed(3)}、目標 ${target.toFixed(3)}`);
});

test('暗い所ほど点が密になる', () => {
  const g = gray((x) => (x < 100 ? 0.2 : 0.55));
  const dots = stippleDots(g, W, H, OPTS);
  const left = dots.filter((d) => inBox(d.points[0], 20, 20, 80, 180)).length;
  const right = dots.filter((d) => inBox(d.points[0], 120, 20, 180, 180)).length;
  assert.ok(left > right * 1.5, `暗 ${left} 明 ${right}`);
});

test('点は固まらず均等に散る（一番近い点までの距離がそろう。ばらばらに打つより、ばらつきが小さい）', () => {
  const g = gray(() => 0.4);
  const dots = stippleDots(g, W, H, OPTS).map((d) => d.points[0]).filter((p) => inBox(p, 20, 20, 180, 180));
  const nn = dots.map((p) => Math.min(...dots.filter((q) => q !== p).map((q) => Math.hypot(q.x - p.x, q.y - p.y))));
  const mean = nn.reduce((a, b) => a + b, 0) / nn.length;
  const sd = Math.sqrt(nn.reduce((a, b) => a + (b - mean) ** 2, 0) / nn.length);
  // 一様にばらばらに打つと変動係数は約 0.52。均等に散らすと 0.25 を下回る
  assert.ok(sd / mean < 0.25, `一番近い点までの距離の変動係数 ${(sd / mean).toFixed(3)}`);
  assert.ok(Math.min(...nn) > mean * 0.6, '近すぎる点の組がある');
});

test('中間の明るさでは、点の大きさはほぼ一定（±20% 以内）', () => {
  const dots = stippleDots(gray(() => 0.3), W, H, OPTS);
  for (const d of dots) assert.ok(Math.abs(d.points[0].w - 1.6) <= 1.6 * 0.2 + 1e-9, `大きさ ${d.points[0].w}`);
});

test('最も暗い所だけ、点を少し大きくして黒に近づける', () => {
  const dark = stippleDots(gray(() => 0.02), W, H, OPTS).map((d) => d.points[0].w).sort((a, b) => a - b);
  assert.ok(dark[dark.length >> 1] > 1.6 * 1.15, `最も暗い所の点の大きさ（中央値） ${dark[dark.length >> 1]}`);
});

test('点は 5mm 角ほどの不揃いなマスごとの束になり、マスの中は近い点へ順に打つ', () => {
  const dots = stippleDots(gray(() => 0.35), W, H, OPTS);
  const groups = new Map();
  for (const d of dots) (groups.get(d.group) ?? groups.set(d.group, []).get(d.group)).push(d);
  assert.ok(groups.size >= 30, `マスの数 ${groups.size}`);
  const steps = [];
  let straight = 0;
  for (const g of groups.values()) {
    const xs = g.map((d) => d.points[0].x), ys = g.map((d) => d.points[0].y);
    // 1 つのマスの点は、マスの大きさ（28px）の 1.8 倍の四角に収まる
    assert.ok(Math.max(...xs) - Math.min(...xs) <= 28 * 1.8 && Math.max(...ys) - Math.min(...ys) <= 28 * 1.8, 'マスが大きすぎる');
    // 縁が縦横の格子線にそろっていない（どの点も同じ 28px の升目に入るマスを数える）
    if (g.every((d) => Math.floor(d.points[0].x / 28) === Math.floor(xs[0] / 28) && Math.floor(d.points[0].y / 28) === Math.floor(ys[0] / 28))) straight++;
    g.sort((a, b) => a.seq - b.seq);
    for (let i = 1; i < g.length; i++) steps.push(Math.hypot(g[i].points[0].x - g[i - 1].points[0].x, g[i].points[0].y - g[i - 1].points[0].y));
  }
  steps.sort((a, b) => a - b);
  assert.ok(steps[steps.length >> 1] < 6, `マスの中で次の点までの距離の中央値 ${steps[steps.length >> 1]}`);
  assert.ok(straight / groups.size < 0.5, `縦横の升目にそろったマスの割合 ${straight}/${groups.size}`);
});

test('同じ入力からは毎回同じ点になる', () => {
  const g = gray((x, y) => 0.2 + 0.003 * (x + y));
  assert.deepEqual(stippleDots(g, W, H, OPTS), stippleDots(g, W, H, OPTS));
});

test('順番: 点はマスを丸ごと打ってから次のマスへ移る', () => {
  const dots = stippleDots(gray(() => 0.35), W, H, OPTS);
  const out = orderStrokes([...dots].reverse(), { mode: 'photo', longLen: 80, midLen: 25 });
  const seen = new Set();
  let prev = null;
  for (const d of out) {
    if (d.group !== prev) { assert.ok(!seen.has(d.group), 'いったん離れたマスに戻った'); seen.add(d.group); prev = d.group; }
  }
});
