// 一覧のカードの静止画（tools/thumbs.mjs）の置き場所の計算を確かめる。
// 静止画は何枚かを1枚の画像（シート）にまとめる。項目が増えたり変わったりしても、変わらない絵の位置は動かさず、撮り直すのは変わった項目だけにする
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entryHash, planThumbs, tileRect, parseManifest, formatManifest, LAYOUT } from '../tools/lib/thumbs-plan.mjs';

const E = (id, js = 'draw()') => ({ id, src: { html: '<canvas></canvas>', css: '', js }, t: id });
const list = (n, from = 0) => Array.from({ length: n }, (_, i) => ({ id: 'e' + (i + from), hash: 'h' + (i + from) }));

test('entryHash: 同じコードなら同じ値、コードかデータが変われば違う値。見出しは関係しない', () => {
  const a = entryHash(E('a'));
  assert.equal(a, entryHash({ ...E('a'), t: '別の見出し' }));
  assert.notEqual(a, entryHash(E('a', 'draw(2)')));
  assert.notEqual(a, entryHash({ ...E('a'), data: ['data/x.js'] }));
  assert.match(a, /^[0-9a-f]{10}$/);
});

test('planThumbs: 初めては並びの順に詰め、1枚に入る数ごとに次のシートへ進む', () => {
  const p = planThumbs(null, list(LAYOUT.perSheet + 3));
  assert.deepEqual(p.at.e0, [0, 0, 'h0']);
  assert.deepEqual(p.at['e' + (LAYOUT.perSheet - 1)], [0, LAYOUT.perSheet - 1, 'h' + (LAYOUT.perSheet - 1)]);
  assert.deepEqual(p.at['e' + LAYOUT.perSheet], [1, 0, 'h' + LAYOUT.perSheet]);
  assert.equal(p.capture.length, LAYOUT.perSheet + 3);
  assert.deepEqual([...p.dirty].sort(), [0, 1]);
  assert.equal(p.sheetCount, 2);
});

test('planThumbs: 何も変わらなければ撮り直さず、どのシートも書き換えない', () => {
  const first = planThumbs(null, list(10));
  const p = planThumbs({ at: first.at }, list(10));
  assert.deepEqual(p.capture, []);
  assert.equal(p.dirty.size, 0);
  assert.deepEqual(p.at, first.at);
});

test('planThumbs: コードが変わった項目だけを撮り直し、位置は変えない', () => {
  const first = planThumbs(null, list(10));
  const now = list(10);
  now[9] = { id: 'e9', hash: 'changed' };
  const p = planThumbs({ at: first.at }, now);
  assert.deepEqual(p.capture, ['e9']);
  assert.deepEqual(p.at.e9, [first.at.e9[0], first.at.e9[1], 'changed']);
  assert.deepEqual([...p.dirty], [first.at.e9[0]]);
});

test('planThumbs: 消えた項目の場所は空き、次に足した項目がいちばん前の空きに入る', () => {
  const first = planThumbs(null, list(10));
  const without = list(10).filter((x) => x.id !== 'e2');
  const p1 = planThumbs({ at: first.at }, without);
  assert.equal(p1.at.e2, undefined);
  assert.deepEqual([...p1.dirty], [first.at.e2[0]]);
  const p2 = planThumbs({ at: p1.at }, [...without, { id: 'new', hash: 'n' }]);
  assert.deepEqual(p2.at.new, [first.at.e2[0], first.at.e2[1], 'n']);
  assert.deepEqual(p2.capture, ['new']);
});

test('planThumbs: 空きがなければ新しいシートを足す。前のシートは書き換えない', () => {
  const first = planThumbs(null, list(LAYOUT.perSheet));
  const p = planThumbs({ at: first.at }, [...list(LAYOUT.perSheet), { id: 'add', hash: 'a' }]);
  assert.deepEqual(p.at.add, [1, 0, 'a']);
  assert.deepEqual([...p.dirty], [1]);
  assert.equal(p.sheetCount, 2);
});

test('planThumbs: skip の項目（許可の要る項目など）は場所を持たない。前に持っていれば空ける', () => {
  const first = planThumbs(null, list(3));
  const now = list(3); now[1] = { ...now[1], skip: true };
  const p = planThumbs({ at: first.at }, now);
  assert.equal(p.at.e1, undefined);
  assert.ok(!p.capture.includes('e1'));
  assert.deepEqual([...p.dirty], [0]);
});

test('planThumbs: force なら全部を撮り直すが、位置は保つ', () => {
  const first = planThumbs(null, list(10));
  const p = planThumbs({ at: first.at }, list(10), { force: true });
  assert.equal(p.capture.length, 10);
  assert.deepEqual(p.at, first.at);
  assert.deepEqual([...p.dirty].sort(), [0, 1]);
});

test('planThumbs: only を渡すと、その項目だけを撮り直す（変わっていなくても）', () => {
  const first = planThumbs(null, list(10));
  const p = planThumbs({ at: first.at }, list(10), { only: ['e3'] });
  assert.deepEqual(p.capture, ['e3']);
  assert.deepEqual([...p.dirty], [first.at.e3[0]]);
});

test('tileRect: 場所の番号から、シートの中の左上の位置を出す', () => {
  assert.deepEqual(tileRect(0), { x: 0, y: 0, w: LAYOUT.w, h: LAYOUT.h, col: 0, row: 0 });
  const last = tileRect(LAYOUT.perSheet - 1);
  assert.equal(last.col, LAYOUT.cols - 1);
  assert.equal(last.row, LAYOUT.rows - 1);
  assert.equal(last.x, (LAYOUT.cols - 1) * LAYOUT.w);
});

test('目録: 書き出して読み戻すと同じ中身になる。読めないときは null', () => {
  const m = { v: 1, w: LAYOUT.w, h: LAYOUT.h, cols: LAYOUT.cols, rows: LAYOUT.rows, sheets: ['a1b2c3', 'd4e5f6'], at: { x: [0, 1, 'h'] } };
  const text = formatManifest(m);
  assert.match(text, /^\/\/ /);
  assert.match(text, /window\.DEKIRU_THUMBS = /);
  assert.deepEqual(parseManifest(text), m);
  assert.equal(parseManifest('ちがう中身'), null);
  assert.equal(parseManifest(''), null);
});
