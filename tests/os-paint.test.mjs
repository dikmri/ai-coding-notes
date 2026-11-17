// お絵かきの計算（直線・四角・楕円・ブラシの形、塗りつぶし、網点、元に戻す、座標）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../os/js/core/paint.mjs';

const RED = [255, 0, 0, 255], BLUE = [0, 0, 255, 255], WHITE = [255, 255, 255, 255], BLACK = [0, 0, 0, 255];
const key = (pts) => pts.map(([x, y]) => x + ',' + y).sort();

test('直線: ブレゼンハムの点。始まりと終わりを含む', () => {
  assert.deepEqual(P.linePoints(0, 0, 3, 1), [[0, 0], [1, 0], [2, 1], [3, 1]]);
  assert.deepEqual(P.linePoints(2, 2, 2, 2), [[2, 2]]);
  assert.deepEqual(P.linePoints(0, 0, 0, 3), [[0, 0], [0, 1], [0, 2], [0, 3]]);
  assert.deepEqual(P.linePoints(3, 0, 0, 0), [[3, 0], [2, 0], [1, 0], [0, 0]]);
});

test('四角: 枠だけと塗りつぶし。角の順番によらない', () => {
  assert.equal(P.rectPoints(0, 0, 2, 2, false).length, 8);
  assert.equal(P.rectPoints(2, 2, 0, 0, true).length, 9);
  assert.ok(!key(P.rectPoints(0, 0, 2, 2, false)).includes('1,1'));
});

test('楕円: 塗りつぶしは中心を含み角を含まない。枠だけは中心を含まず、左右上下で対称', () => {
  const f = key(P.ellipsePoints(0, 0, 4, 4, true));
  assert.ok(f.includes('2,2') && !f.includes('0,0') && !f.includes('4,4'));
  const o = P.ellipsePoints(0, 0, 6, 4, false), ok = key(o);
  assert.ok(!ok.includes('3,2'));
  for (const [x, y] of o) assert.ok(ok.includes(`${6 - x},${y}`) && ok.includes(`${x},${4 - y}`), `${x},${y}`);
});

test('ブラシ: 1 は1点、3 は 3×3、4 は角を落とした 12 点', () => {
  assert.deepEqual(P.brushPoints(5, 5, 1), [[5, 5]]);
  assert.equal(P.brushPoints(5, 5, 3).length, 9);
  assert.equal(P.brushPoints(5, 5, 4).length, 12);
});

test('塗りつぶし: 同じ色の続いた所だけを塗り、塗った数を返す。同じ色なら塗らない', () => {
  const img = P.makeImage(4, 4, WHITE);
  for (let y = 0; y < 4; y++) P.setPx(img, 2, y, BLACK);
  assert.equal(P.floodFill(img, 0, 0, () => RED), 8);
  assert.deepEqual(P.getPx(img, 1, 3), RED);
  assert.deepEqual(P.getPx(img, 3, 0), WHITE);
  assert.equal(P.floodFill(img, 0, 0, () => RED), 0);
  assert.equal(P.floodFill(img, 9, 9, () => RED), 0); // 画像の外
});

test('網点: 前の色と後ろの色を市松に置く', () => {
  const img = P.makeImage(2, 2, WHITE), d = P.dither(RED, BLUE);
  P.floodFill(img, 0, 0, d);
  assert.deepEqual(P.getPx(img, 0, 0), RED);
  assert.deepEqual(P.getPx(img, 1, 0), BLUE);
  assert.deepEqual(P.getPx(img, 1, 1), RED);
});

test('点を塗る: 画像の外の点は捨てる', () => {
  const img = P.makeImage(2, 2, WHITE);
  assert.equal(P.paint(img, [[0, 0], [5, 5], [-1, 0]], () => RED), 1);
});

test('元に戻す・やり直し: 新しい操作でやり直しは消え、数は上限まで', () => {
  const h = new P.History(2);
  assert.equal(h.undo('X'), null);
  h.push('A'); h.push('B'); h.push('C'); // 上限 2 なので A は消える
  assert.equal(h.undo('D'), 'C');
  assert.equal(h.undo('C'), 'B');
  assert.equal(h.undo('B'), null);
  assert.equal(h.redo('B'), 'C');
  h.push('E');
  assert.equal(h.canRedo, false);
});

test('座標: 拡大した表示の位置から、画像の1マスの位置にする', () => {
  assert.deepEqual(P.toImage(17, 9, { left: 1, top: 1 }, 4), [4, 2]);
  assert.deepEqual(P.toImage(0, 0, { left: 1, top: 1 }, 4), [-1, -1]);
});
