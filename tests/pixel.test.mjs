// ドット絵の道具の中核（Gemini が返した色の並びを確かめ、SVG にする）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../tools/lib/pixel.mjs';

const art = (rows, palette = [{ key: 'k', color: '#000000' }, { key: 'w', color: '#FFFFFF' }]) => ({ palette, rows });

test('色の書き方をそろえる: #RGB も #RRGGBB も小文字の #rrggbb にする。読めなければ null', () => {
  assert.equal(P.normalizeHex('#F00'), '#ff0000');
  assert.equal(P.normalizeHex('#00FF00'), '#00ff00');
  assert.equal(P.normalizeHex('red'), null);
});

test('Windows の16色: いちばん近い色にそろえる', () => {
  assert.equal(P.WIN16.length, 16);
  assert.equal(P.nearest('#fe0102', P.WIN16), '#ff0000');
  assert.equal(P.nearest('#7f7f80', P.WIN16), '#808080');
});

test('検査: 行の数と行の長さが大きさに合わなければ誤り', () => {
  const r = P.validateArt(art(['kw', 'wk', 'kk']), { size: 2 });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(), /行の数/);
  const r2 = P.validateArt(art(['kw', 'w']), { size: 2 });
  assert.equal(r2.ok, false);
  assert.match(r2.errors.join(), /2 行目/);
});

test('検査: 色の表に無い文字と、17色以上は誤り。「.」は透明', () => {
  assert.equal(P.validateArt(art(['k.', 'zw']), { size: 2 }).ok, false);
  const many = Array.from({ length: 17 }, (_, i) => ({ key: String.fromCharCode(65 + i), color: '#000000' }));
  assert.equal(P.validateArt(art(['AB', 'CD'], many), { size: 2 }).ok, false);
  assert.equal(P.validateArt(art(['k.', '.w']), { size: 2 }).ok, true);
});

test('検査: win16 のときは16色以外の色を近い色にそろえ、そろえた色を返す', () => {
  const r = P.validateArt(art(['ab', 'ba'], [{ key: 'a', color: '#fe0000' }, { key: 'b', color: '#c0c0c0' }]), { size: 2, win16: true });
  assert.equal(r.ok, true);
  assert.equal(r.art.palette.find((p) => p.key === 'a').color, '#ff0000');
  assert.deepEqual(r.snapped, [{ key: 'a', from: '#fe0000', to: '#ff0000' }]);
});

test('SVG: 横に続く同じ色をまとめ、色ごとに path を1本にする。透明は描かない', () => {
  const svg = P.toSvg(art(['kkw.', '..ww']), 4);
  assert.equal(svg, '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="2" viewBox="0 0 4 2" shape-rendering="crispEdges">'
    + '<path fill="#000" d="M0 0h2v1h-2z"/>'
    + '<path fill="#fff" d="M2 0h1v1h-1zM2 1h2v1h-2z"/></svg>');
});

test('検査: 縦長（w×h）の絵を受け付け、行の数は h、行の長さは w で見る', () => {
  const rows = Array.from({ length: 3 }, () => 'kw');
  assert.equal(P.validateArt(art(rows), { w: 2, h: 3 }).ok, true);
  const bad = P.validateArt(art(['kw', 'kw']), { w: 2, h: 3 });
  assert.equal(bad.ok, false);
  assert.match(bad.errors.join(), /3 行/);
});

test('検査: 決めた色の表（allowed）があれば、その中の近い色にそろえる。色の数の上限も変えられる', () => {
  const allowed = ['#241734', '#fffdf9', '#6bf2e3'];
  const r = P.validateArt(art(['ab'], [{ key: 'a', color: '#25183a' }, { key: 'b', color: '#70f0e0' }]), { w: 2, h: 1, allowed });
  assert.equal(r.ok, true);
  assert.deepEqual(r.art.palette.map((p) => p.color), ['#241734', '#6bf2e3']);
  assert.equal(r.snapped.length, 2);
  const many = Array.from({ length: 16 }, (_, i) => ({ key: String.fromCharCode(65 + i), color: '#000000' }));
  assert.equal(P.validateArt(art(['AB'], many), { w: 2, h: 1, maxColors: 15 }).ok, false);
});

test('色の書き方: 記号（` や "）で囲まれていても読む。使える色の一覧が空なら、そろえない', () => {
  assert.equal(P.normalizeHex('`#141322`'), '#141322');
  const r = P.validateArt(art(['k'], [{ key: 'k', color: '#123456' }]), { w: 1, h: 1, allowed: ['not-a-color'] });
  assert.equal(r.ok, true);
  assert.equal(r.art.palette[0].color, '#123456');
});
