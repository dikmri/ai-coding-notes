// パイプ工房の中核（構文解析・型の変換・実行）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const P = require('../js/pipe-core.js');
const strip = (stages) => stages.map(({ name, args }) => ({ name, args }));

test('parsePipe: 部品名と引数に分ける', () => {
  assert.deepEqual(strip(P.parsePipe('text "a b" | upper | repeat 3')), [
    { name: 'text', args: ['a b'] }, { name: 'upper', args: [] }, { name: 'repeat', args: [3] },
  ]);
});

test('parsePipe: 引用符の中の | は区切りにしない', () => {
  assert.deepEqual(strip(P.parsePipe('text "a|b" | split "|"')), [
    { name: 'text', args: ['a|b'] }, { name: 'split', args: ['|'] },
  ]);
});

test('parsePipe: 全角の｜と全角空白も区切りとして読む', () => {
  assert.deepEqual(strip(P.parsePipe('text 出来る｜upper　3')), [
    { name: 'text', args: ['出来る'] }, { name: 'upper', args: [3] },
  ]);
});

test('parsePipe: 数値・単引用符・空の段・大文字', () => {
  assert.deepEqual(strip(P.parsePipe("seq 1 -2.5 'x y'")), [{ name: 'seq', args: [1, -2.5, 'x y'] }]);
  assert.deepEqual(strip(P.parsePipe(' | | Upper |')), [{ name: 'upper', args: [] }]);
  assert.deepEqual(strip(P.parsePipe('text "3"')), [{ name: 'text', args: ['3'] }]);
});

test('coerce: 型をゆるく変換する', () => {
  assert.equal(P.coerce(['a', 'b'], 'text'), 'a\nb');
  assert.deepEqual(P.coerce('a\n\nb', 'list'), ['a', 'b']);
  assert.equal(P.coerce('12.5', 'num'), 12.5);
  assert.equal(P.coerce([1, 2, 3], 'num'), 3);
  assert.throws(() => P.coerce('abc', 'num'));
  assert.equal(P.typeOf({ width: 1, height: 1, data: new Uint8ClampedArray(4) }), 'image');
});

const UNITS = {
  text: { in: 'none', out: 'text', fn: (v, a) => String(a[0] ?? '') },
  upper: { in: 'text', out: 'text', fn: (v) => v.toUpperCase() },
  wait: { in: 'any', out: 'any', fn: async (v) => { await new Promise((r) => setTimeout(r, 5)); return v; } },
  boom: { in: 'any', out: 'any', fn: () => { throw new Error('ばくはつ'); } },
};

test('execute: 段ごとの結果を返し、非同期の部品も待つ', async () => {
  const r = await P.execute(P.parsePipe('text "a b" | wait | upper'), UNITS, {});
  assert.equal(r.length, 3);
  assert.equal(r[2].value, 'A B');
  assert.equal(r[2].type, 'text');
  assert.ok(r.every((s) => typeof s.ms === 'number'));
});

test('execute: 知らない部品は近い名前を添えて止まる', async () => {
  const r = await P.execute(P.parsePipe('text a | upperr | upper'), UNITS, {});
  assert.equal(r.length, 2);
  assert.match(r[1].error, /upperr/);
  assert.match(r[1].error, /upper/);
});

test('execute: 部品の例外はその段のエラーになる', async () => {
  const r = await P.execute(P.parsePipe('text a | boom | upper'), UNITS, {});
  assert.equal(r.length, 2);
  assert.match(r[1].error, /ばくはつ/);
});
