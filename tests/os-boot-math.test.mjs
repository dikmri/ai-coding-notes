// 起動の演出の計算（場面の切り替え、弾む動き、網点、正二十面体、投影）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as B from '../os/js/core/boot-math.mjs';

const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;

test('場面: 7場面の境目（ミリ秒）で、何番目の場面のどこにいるかを返す', () => {
  assert.equal(B.SCENES.length, 8);
  assert.equal(B.SCENES.at(-1), 13000);
  assert.deepEqual(B.phaseAt(0), { i: 0, k: 0 });
  assert.deepEqual(B.phaseAt(1100), { i: 1, k: 0 });
  const m = B.phaseAt(1950);
  assert.equal(m.i, 1); assert.ok(near(m.k, 0.5));
  assert.equal(B.phaseAt(12200).i, 6);
  assert.deepEqual(B.phaseAt(13000), { i: 6, k: 1, done: true });
  assert.deepEqual(B.phaseAt(-5), { i: 0, k: 0 });
});

test('動き: ramp は区間の外で 0 と 1 にとどまり、easeOutBack は終わりの手前で少し行き過ぎる', () => {
  assert.equal(B.ramp(50, 100, 200), 0);
  assert.equal(B.ramp(150, 100, 200), 0.5);
  assert.equal(B.ramp(250, 100, 200), 1);
  assert.ok(near(B.easeOutBack(0), 0));
  assert.ok(near(B.easeOutBack(1), 1));
  assert.ok(Math.max(...[0.6, 0.7, 0.8, 0.9].map(B.easeOutBack)) > 1);
  assert.ok(near(B.easeOutCubic(1), 1));
});

test('網点: 0 はいちばん下の段、1 はいちばん上の段。半分なら 4×4 の半分のマスが上の段になる', () => {
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    assert.equal(B.ditherLevel(0, x, y, 4), 0);
    assert.equal(B.ditherLevel(1, x, y, 4), 3);
  }
  let up = 0;
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) up += B.ditherLevel(0.5, x, y, 2);
  assert.equal(up, 8);
  // 座標が 4 を超えても同じ模様を繰り返す
  assert.equal(B.ditherLevel(0.3, 5, 6, 2), B.ditherLevel(0.3, 1, 2, 2));
});

test('正二十面体: 頂点 12・面 20・辺 30。頂点はすべて長さ 1 で、どの辺もちょうど 2 つの面に属する', () => {
  const { v, f } = B.icosahedron();
  assert.equal(v.length, 12);
  assert.equal(f.length, 20);
  for (const p of v) assert.ok(near(Math.hypot(...p), 1, 1e-12));
  const edges = new Map();
  for (const tri of f) for (let i = 0; i < 3; i++) {
    const a = tri[i], b = tri[(i + 1) % 3], key = a < b ? `${a}-${b}` : `${b}-${a}`;
    edges.set(key, (edges.get(key) || 0) + 1);
  }
  assert.equal(edges.size, 30);
  for (const n of edges.values()) assert.equal(n, 2);
});

test('回転と投影: Y 軸の回りの 90 度で x が z に移る。奥行き f の点は大きさ 1 で中心からずれない', () => {
  const r = B.rotY([1, 0, 0], Math.PI / 2);
  assert.ok(near(r[0], 0, 1e-12)); assert.ok(near(r[2], -1, 1e-12));
  const q = B.rotX([0, 1, 0], Math.PI / 2);
  assert.ok(near(q[1], 0, 1e-12)); assert.ok(near(q[2], 1, 1e-12));
  assert.deepEqual(B.project([0, 0, 500], { cx: 640, cy: 400, f: 500 }), [640, 400, 1]);
  assert.deepEqual(B.project([1, 1, 500], { cx: 0, cy: 0, f: 500 }), [1, -1, 1]);
});

test('文字を打つ: 始まりからの時間に合わせて、見せる文字数を返す', () => {
  assert.equal(B.typed('ABCDEF', 100, 200, 10), '');
  assert.equal(B.typed('ABCDEF', 230, 200, 10), 'ABC');
  assert.equal(B.typed('ABCDEF', 9999, 200, 10), 'ABCDEF');
});
