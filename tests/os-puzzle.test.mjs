// パズル「プリズム回廊」の計算（盤面の読み取り、光の道、プリズムで分かれる向き、交わってアプリコットになる規則、解く計算、全10面）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../os/js/core/puzzle.mjs';

const won = (b, s) => P.trace(b, s).won;
const colorsAt = (r, x, y) => [...r.hits.find((h) => h.x === x && h.y === y).colors];

test('読み取り: 鏡とプリズムを、回せる部品として左上から順に拾う', () => {
  const b = P.parse(['>.1', '.N.', 'P2W']);
  assert.equal(b.w, 3); assert.equal(b.h, 3);
  assert.deepEqual(b.pieces.map((p) => [p.x, p.y, p.kind, p.init]), [[2, 0, 'mirror', 0], [1, 1, 'prism', 0], [0, 2, 'prism', 3], [1, 2, 'mirror', 1]]);
  assert.deepEqual(P.initState(b), [0, 0, 3, 1]);
});

test('部品を回す: 鏡は / と \\ を入れ替え、プリズムは時計回りに 90 度回る', () => {
  const b = P.parse(['>1N']);
  assert.deepEqual(P.turn(b, [0, 0], 0), [1, 0]);
  assert.deepEqual(P.turn(b, [1, 0], 0), [0, 0]);
  assert.deepEqual(P.turn(b, [0, 3], 1), [0, 0]);
});

test('光の道: 鏡で 90 度曲がる。白の水晶に届けば解ける', () => {
  const b = P.parse(['>.1', '...', '..W']);
  assert.equal(won(b, [1]), true); // \ なら、右へ進む光は下へ曲がる
  assert.equal(won(b, [0]), false); // / なら上へ曲がって盤の外へ出る
});

test('光の道: 柱で止まり、海は素通りする', () => {
  assert.equal(won(P.parse(['>O.W']), []), false);
  assert.equal(won(P.parse(['>~~W']), []), true);
});

test('プリズム: 正面から入った白い光を、進む向きの左へミント、右へピンクに分ける', () => {
  const b = P.parse(['.M.', '>P.', '.K.']); // 右へ進む光が左向きのプリズムに入る → 上へミント、下へピンク
  const r = P.trace(b, [3]);
  assert.equal(r.won, true);
  assert.deepEqual(colorsAt(r, 1, 0), ['mint']);
  assert.deepEqual(colorsAt(r, 1, 2), ['pink']);
  assert.equal(won(b, [0]), false); // 上向きでは正面から入らないので、光はプリズムで止まる
});

test('交わり: ミントとピンクが縦と横に同じマスを通ると、その先は両方アプリコットになる', () => {
  const rows = [
    '..1.2.',
    '......',
    '>.P...',
    '......',
    '..2..A',
    '....A.',
  ];
  const b = P.parse(rows);
  const r = P.trace(b, P.initState(b));
  assert.deepEqual([...r.mixes], ['4,4']);
  assert.deepEqual(colorsAt(r, 4, 5), ['apricot']);
  assert.deepEqual(colorsAt(r, 5, 4), ['apricot']);
  assert.equal(r.won, true);
  // 交わった先にミントの水晶を置いても、届くのはアプリコットなので満たされない
  assert.equal(P.trace(P.parse(rows.map((s, i) => (i === 5 ? '....M.' : s))), P.initState(b)).won, false);
});

test('交わり: 同じ向き（横と横）に重なっても交わりにはならない', () => {
  const m = P.mixCells([{ x: 3, y: 1, axis: 'h', color: 'mint' }, { x: 3, y: 1, axis: 'h', color: 'pink' }, { x: 2, y: 1, axis: 'h', color: 'mint' }, { x: 2, y: 1, axis: 'v', color: 'pink' }]);
  assert.deepEqual([...m], ['2,1']);
});

test('解く計算: いちばん少ない手数と、そのときの向きを返す', () => {
  assert.deepEqual(P.solve(P.parse(['>.1', '...', '..W'])), { moves: 1, state: [1] });
  assert.deepEqual(P.solve(P.parse(['.M.', '>S.', '.K.'])), { moves: 1, state: [3] }); // 下向き → 左向きは時計回りに1手
  assert.equal(P.solve(P.parse(['>O1', '...', '..W'])), null); // 柱で止まるので解けない
});

test('ヒント: 今の向きからいちばん近い解き方で、まだ合っていない部品を1つ指す', () => {
  const b = P.parse(['>.1', '...', '..W']);
  assert.equal(P.hintPiece(b, [0]), 0);
  assert.equal(P.hintPiece(b, [1]), -1); // もう解けている
});

test('全10面: 盤は 9×9 以内で、最初は解けておらず、解けて、目安の手数が解く計算と合う', () => {
  assert.equal(P.LEVELS.length, 10);
  for (const [i, l] of P.LEVELS.entries()) {
    const b = P.parse(l.map);
    const name = `第${i + 1}面「${l.title}」`;
    assert.ok(b.w <= 9 && b.h <= 9, name + ' の大きさ');
    assert.ok(l.title && l.hint, name + ' の題名とヒント');
    assert.equal(won(b, P.initState(b)), false, name + ' は最初から解けていてはいけない');
    const s = P.solve(b);
    assert.ok(s, name + ' が解けない');
    assert.equal(s.moves, l.par, name + ' の目安の手数');
  }
});
