// 試作の確かめ: 線画（白地に黒）を中心線と線幅の「筆」に分ける処理
// node --test probe/linetrace.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { traceStrokes } from './linetrace.mjs';

// w x h の白地（0）に、塗る関数 f(x,y) が真の画素を墨（1）にした二値画像
function canvas(w, h, f) {
  const ink = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (f(x, y)) ink[y * w + x] = 1;
  return { w, h, ink };
}
const len = (s) => s.points.reduce((a, p, i) => i ? a + Math.hypot(p.x - s.points[i - 1].x, p.y - s.points[i - 1].y) : 0, 0);
const median = (a) => { const b = [...a].sort((p, q) => p - q); return b[b.length >> 1]; };

test('太さ 7 の横棒は 1 筆になり、線幅はおよそ 7、長さは棒の長さに近い', () => {
  const img = canvas(80, 30, (x, y) => x >= 10 && x < 70 && y >= 12 && y < 19);
  const { strokes } = traceStrokes(img);
  assert.equal(strokes.length, 1);
  const w = median(strokes[0].points.map((p) => p.w));
  assert.ok(Math.abs(w - 7) <= 1.2, `線幅 ${w}`);
  assert.ok(len(strokes[0]) > 45, `長さ ${len(strokes[0])}`);
});

test('十字は交点で向きがつながる 2 筆になる', () => {
  const img = canvas(90, 90, (x, y) => (Math.abs(y - 45) <= 2 && x >= 10 && x < 80) || (Math.abs(x - 45) <= 2 && y >= 10 && y < 80));
  const { strokes } = traceStrokes(img);
  assert.equal(strokes.length, 2);
  for (const s of strokes) assert.ok(len(s) > 55, `長さ ${len(s)}`);
});

test('T 字は、横棒の 1 筆と縦棒の 1 筆になる', () => {
  const img = canvas(90, 90, (x, y) => (Math.abs(y - 15) <= 2 && x >= 10 && x < 80) || (Math.abs(x - 45) <= 2 && y >= 15 && y < 80));
  const { strokes } = traceStrokes(img);
  assert.equal(strokes.length, 2);
  const lens = strokes.map(len).sort((a, b) => b - a);
  assert.ok(lens[0] > 60 && lens[1] > 50, `長さ ${lens}`);
});

test('輪は閉じた 1 筆になり、囲まれた領域が 1 つ数えられる', () => {
  const img = canvas(100, 100, (x, y) => { const r = Math.hypot(x - 50, y - 50); return r >= 28 && r <= 33; });
  const { strokes, regions } = traceStrokes(img);
  assert.equal(strokes.length, 1);
  assert.equal(strokes[0].closed, true);
  assert.equal(regions.enclosed.length, 1);
});

test('白紙なら筆は 0', () => {
  const { strokes } = traceStrokes(canvas(20, 20, () => false));
  assert.equal(strokes.length, 0);
});
